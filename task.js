const PRESETS = { dummy: 'https://dummyjson.com/todos' };
const STORAGE_KEY = 'todo-app-state';
const CURRENT_USER_ID = 1; // автор по умолчанию для новых задач

let todos = [];            // Список задач: { id, text, completed, userId, ... }
let filter = 'all';        // all | done | pending
let searchText = '';       // поиск по названию
let authorFilter = 'all';  // all | id автора
let taskForm = { mode: 'add', task: null, trigger: null }; // состояние окна «Новая задача / Изменить задачу»
let nextId = 1;            // Внутренние уникальные ID

let usersMap = new Map();           // id -> { username, firstName, lastName, image }
const profileCache = new Map();     // id -> Promise с профилем (кэш)
const deletedServerIds = new Set(); // удалённые у нас задачи сервера (сервер их не удаляет)
const serverEdits = new Map();      // serverId -> { text, completed, userId }: наши правки задач сервера

const $ = id => document.getElementById(id);

/* ============ Сохранение в браузере ============ */

function readState() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
        return null;
    }
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            todos,
            url: $('apiUrl').value
        }));
    } catch (error) {
        console.error('Не удалось сохранить:', error);
    }
}

/* ============ Вспомогательное ============ */

function setStatus(message, isError = false) {
    const el = $('status');
    el.textContent = message;
    el.className = isError ? 'status error' : 'status';
}

// Показываем, какой именно запрос ушёл на API (то же видно во вкладке Network)
function setApiLog(method, url) {
    $('apiLog').textContent = `${method} ${url}`;
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const error = new Error('HTTP ' + response.status);
        error.status = response.status; // код ответа (например, 404)
        throw error;
    }
    return response.json();
}

// Приводим ответ разных API к единому виду:
// DummyJSON: { todos: [{ todo, completed, userId }] }
function normalize(data, api = null) {
    const list = Array.isArray(data) ? data : data && data.todos;
    if (!Array.isArray(list)) throw new Error('Неверный формат ответа');

    return list
        .map(item => {
            // DummyJSON не сохраняет изменения, поэтому накладываем свои правки
            const edit = api === 'dummy' ? serverEdits.get(item?.id) : null;
            return {
                id: nextId++,
                serverId: item?.id,                       // id задачи на сервере
                userId: edit ? edit.userId : item?.userId, // автор задачи
                api,                                      // 'dummy' | null
                text: String(edit ? edit.text : (item?.todo ?? item?.title ?? '')).trim(),
                completed: Boolean(edit ? edit.completed : item?.completed)
            };
        })
        .filter(task => task.text && !(task.api === 'dummy' && deletedServerIds.has(task.serverId)));
}

/* ============ Запросы на сервер (POST / PUT / DELETE) ============ */

// Какие API умеют принимать изменения (для остальных ссылок — только локально)
const WRITE_API = {
    dummy: {
        add: 'https://dummyjson.com/todos/add',
        item: id => `https://dummyjson.com/todos/${id}`,
        body: t => ({ todo: t.text, completed: t.completed, ...(t.userId ? { userId: t.userId } : {}) })
    }
};

// По ссылке определяем, с каким API работаем
function detectApi(url) {
    try {
        const host = new URL(url).hostname;
        if (host === 'dummyjson.com') return 'dummy';
    } catch { /* неверная ссылка */ }
    return null;
}

// Отправляет изменение на сервер.
// Возвращает true, если задачу можно менять и на странице.
async function syncServer(todo, method) {
    const api = WRITE_API[todo.api];

    if (!api) {
        setStatus('Этот API не принимает изменения — правка только на странице.');
        $('apiLog').textContent = 'Запрос не отправлялся';
        return true;
    }
    // Старые сохранённые задачи, созданные до обновления, id на сервере не имеют
    if (method !== 'POST' && todo.serverId == null) {
        setStatus('У этой задачи нет id на сервере — запрос не отправлен. Создайте задачу заново.');
        $('apiLog').textContent = 'Запрос не отправлялся';
        return true;
    }

    const url = method === 'POST' ? api.add : api.item(todo.serverId);
    const options = { method };
    if (method !== 'DELETE') {
        const body = method === 'POST' ? { ...api.body(todo), userId: todo.userId || CURRENT_USER_ID } : api.body(todo);
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
    }

    try {
        const data = await fetchJson(url, options);
        // Сервер отвечает на POST id новой задачи, но саму задачу не сохраняет.
        // Запоминаем id, чтобы PUT и DELETE для неё тоже уходили на сервер (видно в Network).
        if (method === 'POST' && data && data.id != null) todo.serverId = data.id;
        setStatus(`Запрос отправлен: ${method} ${url}`);
        setApiLog(method, url);
        return true;
    } catch (error) {
        // Для новой задачи сервер отвечает 404: записи нет. Это ожидаемо, меняем только на странице.
        if (todo.local && method !== 'POST' && error.status === 404) {
            setStatus(`${method} ${url}: сервер ответил 404 — DummyJSON не хранит новые задачи, изменение применено только на странице.`);
            setApiLog(method, `${url} → 404`);
            return true;
        }
        console.error('Ошибка запроса:', error);
        setStatus(`Не удалось выполнить ${method}. Изменение не применено.`, true);
        setApiLog(method, `${url} → ошибка`);
        return false;
    }
}

/* ============ Загрузка из API ============ */

// sorted = true, когда ссылку собрали с параметрами сортировки
async function loadFromApi(sorted = false) {
    const url = $('apiUrl').value.trim();
    if (!url.startsWith('https://')) {
        setStatus('Введите HTTPS-ссылку, начинающуюся с https://', true);
        return;
    }
    if (sorted !== true) $('sortSel').value = ''; // обычная загрузка — сортировку сбрасываем

    setStatus('Загрузка...');
    setApiLog('GET', url);
    try {
        todos = normalize(await fetchJson(url), detectApi(url));
        save();
        render();
        setStatus(sorted === true
            ? `Сортировка выполнена через API. Задач: ${todos.length}`
            : `Загружено задач: ${todos.length}`);
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        setStatus('Не удалось загрузить. Проверьте ссылку: API должен возвращать список задач и разрешать запросы из браузера.', true);
    }
}

function usePreset(name) {
    $('apiUrl').value = PRESETS[name];
    loadFromApi();
}

/* ============ Действия с задачами ============ */

// Окно задачи: одно и то же для «Новая задача» и «Изменить задачу»
function openTaskForm({ mode = 'add', task = null, userId = CURRENT_USER_ID, trigger = null } = {}) {
    taskForm = { mode, task, trigger: trigger || document.activeElement };
    const isEdit = mode === 'edit';

    $('taskFormTitle').textContent = isEdit ? 'Изменить задачу' : 'Новая задача';
    $('taskSubmitBtn').textContent = isEdit ? 'Сохранить' : 'Добавить';
    $('todoInput').value = isEdit ? task.text : '';
    $('statusSel').value = isEdit && task.completed ? 'done' : 'pending';
    $('addMsg').textContent = '';

    // Автор: если такого id ещё нет в списке (пользователи не успели загрузиться) — добавляем
    const authorId = String((isEdit ? task.userId : userId) || CURRENT_USER_ID);
    const sel = $('authorSel');
    if (![...sel.options].some(o => o.value === authorId)) {
        const o = document.createElement('option');
        o.value = authorId;
        o.textContent = userLabel(Number(authorId));
        sel.append(o);
    }
    sel.value = authorId;

    $('addOverlay').hidden = false;
    $('todoInput').focus();
}

function closeTaskForm() {
    $('addOverlay').hidden = true;
    const trigger = taskForm.trigger;
    if (trigger && trigger.isConnected) trigger.focus();
}

function showAddMessage(message) {
    $('addMsg').textContent = message;
}

async function submitTaskForm() {
    const text = $('todoInput').value.trim();
    if (!text) {
        showAddMessage('Введите текст задачи.');
        return;
    }
    // Текст, автор и статус берутся из формы
    const data = {
        text,
        userId: Number($('authorSel').value) || CURRENT_USER_ID,
        completed: $('statusSel').value === 'done'
    };

    $('taskSubmitBtn').disabled = true;
    const ok = taskForm.mode === 'edit'
        ? await updateTask(taskForm.task, data)   // PUT
        : await createTask(data);                 // POST
    $('taskSubmitBtn').disabled = false;

    if (!ok) {
        showAddMessage($('status').textContent);
        return;
    }
    closeTaskForm();
    refreshProfile(); // если открыт профиль — обновим и его
}

async function createTask({ text, userId, completed }) {
    const todo = { id: nextId++, text, completed, userId };
    const api = detectApi($('apiUrl').value);
    if (api) {
        todo.api = api;
        todo.local = true; // сервер новую задачу не сохраняет
    }

    if (!(await syncServer(todo, 'POST'))) return false;   // POST

    todos.unshift(todo);
    save();
    render();
    return true;
}

// Задача сервера, которую мы изменили: запоминаем, чтобы правка не пропала при перезагрузке списка
function rememberEdit(todo) {
    if (todo.api === 'dummy' && !todo.local && todo.serverId != null) {
        serverEdits.set(todo.serverId, { text: todo.text, completed: todo.completed, userId: todo.userId });
    }
}

// Находит задачу в общем списке (task — описание из списка или из профиля)
function findTodo(task) {
    if (task.todoId) return todos.find(t => t.id === task.todoId);
    if (task.serverId != null) return todos.find(t => t.api === 'dummy' && !t.local && t.serverId === task.serverId);
    return null;
}

// Меняет задачу (текст / автор / статус): PUT на сервер и правка на странице.
// task: { todoId, serverId, text, completed, userId }. Возвращает true, если получилось.
async function updateTask(task, changes) {
    const mine = findTodo(task);
    const base = { text: task.text, completed: task.completed, userId: task.userId };
    const target = mine
        ? { ...mine, ...changes }
        : { api: 'dummy', serverId: task.serverId, ...base, ...changes };

    if (!(await syncServer(target, 'PUT'))) return false;   // PUT

    if (mine) {
        Object.assign(mine, changes);
        rememberEdit(mine);
    } else if (task.serverId != null) {
        serverEdits.set(task.serverId, { ...base, ...changes });
    }
    save();
    render();
    return true;
}

async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const changed = { ...todo, completed: !todo.completed };
    if (await syncServer(changed, 'PUT')) {   // PUT
        todo.completed = changed.completed;
        rememberEdit(todo);
    }
    save();
    render(); // при ошибке чекбокс вернётся в прежнее состояние
}

async function removeTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    if (!(await syncServer(todo, 'DELETE'))) return; // DELETE
    if (todo.api === 'dummy' && !todo.local) deletedServerIds.add(todo.serverId);

    todos = todos.filter(t => t.id !== id);
    save();
    render();
}

/* ============ Отрисовка ============ */

function makeButton(label, className, onClick) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = label;
    btn.onclick = onClick;
    return btn;
}

function createItem(todo) {
    const li = document.createElement('li');
    li.className = 'todo' + (todo.completed ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.onchange = () => toggleTodo(todo.id);

    // textContent, а не innerHTML — защита от вставки HTML в текст задачи
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = todo.text;

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
        makeButton('Изменить', 'btn btn-outline btn-sm', e => openTaskForm({
            mode: 'edit',
            task: { todoId: todo.id, serverId: todo.serverId, text: todo.text, completed: todo.completed, userId: todo.userId },
            trigger: e.currentTarget
        })),
        makeButton('Удалить', 'btn btn-danger btn-sm', () => removeTodo(todo.id))
    );

    const body = document.createElement('div');
    body.className = 'body';
    body.append(text);
    const nick = makeAuthor(todo);
    if (nick) body.append(nick);   // автор — под текстом задачи

    li.append(checkbox, body, actions);
    return li;
}

function userLabel(id) {
    const u = usersMap.get(id);
    return u ? `${u.firstName} ${u.lastName} (@${u.username})` : `Пользователь #${id}`;
}

// Список авторов для фильтра — только те, кто есть среди загруженных задач
let authorFilterSig = '';
function updateAuthorFilter() {
    const ids = [...new Set(todos.map(t => t.userId).filter(Boolean))].sort((a, b) => a - b);
    if (authorFilter !== 'all' && !ids.includes(Number(authorFilter))) authorFilter = 'all';

    const sig = ids.join(',') + '|' + usersMap.size;
    if (sig !== authorFilterSig) {
        authorFilterSig = sig;
        const sel = $('authorFilter');
        sel.replaceChildren();
        const all = document.createElement('option');
        all.value = 'all';
        all.textContent = 'Все авторы';
        sel.append(all);
        ids.forEach(id => {
            const o = document.createElement('option');
            o.value = String(id);
            o.textContent = userLabel(id);
            sel.append(o);
        });
    }
    $('authorFilter').value = authorFilter;
}

function render() {
    const list = $('todoList');
    list.innerHTML = '';
    updateAuthorFilter();

    const q = searchText.trim().toLowerCase();
    const visible = todos.filter(t =>
        (filter === 'all' || (filter === 'done' ? t.completed : !t.completed)) &&
        (!q || t.text.toLowerCase().includes(q)) &&
        (authorFilter === 'all' || String(t.userId) === authorFilter)
    );

    if (visible.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'Задач нет';
        list.appendChild(empty);
    }
    visible.forEach(todo => list.appendChild(createItem(todo)));

    $('shownBadge').textContent = `${visible.length} / ${todos.length}`;
    $('shownInfo').textContent = `Показано ${visible.length} из ${todos.length}. Нажмите на автора, чтобы открыть его профиль.`;

    const done = todos.filter(t => t.completed).length;
    $('totalCount').textContent = todos.length;
    $('completedCount').textContent = done;
    $('pendingCount').textContent = todos.length - done;

    document.querySelectorAll('.chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.filter === filter);
    });
}

/* ============ Пользователи и профиль ============ */

// Заполняем выпадающий список авторов в форме добавления задачи
function fillAuthorSelect() {
    if (!usersMap.size) return;
    const sel = $('authorSel');
    const keep = sel.value || String(CURRENT_USER_ID);
    sel.replaceChildren(...[...usersMap.values()].map(u => {
        const o = document.createElement('option');
        o.value = String(u.id);
        o.textContent = `${u.firstName} ${u.lastName} (@${u.username}) · ID ${u.id}`;
        return o;
    }));
    sel.value = keep;
}

// Все имена и аватарки — одним запросом и только нужные поля
async function loadUsers() {
    if (usersMap.size) return; // уже загружены, повторно не запрашиваем
    try {
        const data = await fetchJson('https://dummyjson.com/users?limit=0&select=firstName,lastName,username,image');
        usersMap = new Map(data.users.map(u => [u.id, u]));
        fillAuthorSelect();
        render(); // теперь можно показать ники
    } catch (error) {
        console.error('Не удалось загрузить пользователей:', error);
    }
}

// Подробный профиль и задачи пользователя грузим лениво (при наведении/клике) и кэшируем
function getProfile(id) {
    if (!profileCache.has(id)) {
        const request = Promise.all([
            fetchJson(`https://dummyjson.com/users/${id}`),
            fetchJson(`https://dummyjson.com/todos/user/${id}`) // фильтрация на сервере
        ])
            .then(([user, list]) => ({ user, todos: list.todos }))
            .catch(error => { profileCache.delete(id); throw error; });
        profileCache.set(id, request);
    }
    return profileCache.get(id);
}

// Что выбрано в окне профиля: сортировка (через API) и фильтр по статусу
let profileView = { sort: '', status: 'all' };
const sortedCache = new Map();   // "id|sortBy:order" -> Promise со списком задач (кэш)

// Задачи пользователя, отсортированные сервером: /todos/user/5?sortBy=todo&order=asc
function fetchUserTodos(id, sort) {
    const key = `${id}|${sort}`;
    if (!sortedCache.has(key)) {
        const [by, order] = sort.split(':');
        const url = `https://dummyjson.com/todos/user/${id}?sortBy=${by}&order=${order}`;
        setApiLog('GET', url);
        sortedCache.set(key, fetchJson(url)
            .then(data => data.todos)
            .catch(error => { sortedCache.delete(key); throw error; }));
    }
    return sortedCache.get(key);
}

// Список задач с сервера для открытого профиля (с сортировкой или без)
async function profileServerTodos(id) {
    if (!profileView.sort) return (await getProfile(id)).todos;
    return fetchUserTodos(id, profileView.sort);
}

// В DummyJSON нет фильтра задач по статусу, поэтому «выполнено / не выполнено» отбираем на странице.
// Сортировку тоже дублируем на странице: так в порядок попадают и задачи, созданные у нас.
const PROFILE_SORT = {
    'todo:asc': (a, b) => a.text.localeCompare(b.text),
    'todo:desc': (a, b) => b.text.localeCompare(a.text),
    'completed:desc': (a, b) => Number(b.completed) - Number(a.completed),
    'completed:asc': (a, b) => Number(a.completed) - Number(b.completed)
};

function viewProfileTasks(list) {
    const shown = list.filter(t =>
        profileView.status === 'all' || (profileView.status === 'done' ? t.completed : !t.completed));
    const cmp = PROFILE_SORT[profileView.sort];
    return cmp ? [...shown].sort(cmp) : shown;
}

// Автор показывается под задачей у любой задачи, у которой есть userId
function makeAuthor(todo) {
    if (!todo.userId) return null;

    const user = usersMap.get(todo.userId);
    const btn = document.createElement('button');
    btn.className = 'nick';

    if (user && user.image) {
        const img = document.createElement('img');
        img.src = user.image;
        img.alt = '';
        btn.append(img);
    }
    btn.append(user ? '@' + user.username : 'Пользователь #' + todo.userId);
    if (user) btn.title = `${user.firstName} ${user.lastName}`;

    const prefetch = () => getProfile(todo.userId).catch(() => {});
    btn.onmouseenter = prefetch; // ленивая загрузка при наведении
    btn.onfocus = prefetch;
    btn.onclick = () => openProfile(todo.userId, btn);
    return btn;
}

// Задачи пользователя с сервера + наши локальные изменения
function profileTodos(userId, serverList) {
    const seen = new Set();
    const result = [];

    serverList.forEach(t => {
        seen.add(t.id);
        if (deletedServerIds.has(t.id)) return;
        const mine = todos.find(x => x.api === 'dummy' && !x.local && x.serverId === t.id);
        const src = mine || serverEdits.get(t.id) || { text: t.todo, completed: t.completed, userId: t.userId };
        if ((src.userId ?? t.userId) !== userId) return;   // задачу передали другому автору
        result.push({ id: t.id, localId: null, text: src.text, completed: src.completed });
    });

    // Задачи, которые этому пользователю передали (сменили автора)
    todos.forEach(x => {
        if (x.api === 'dummy' && !x.local && x.userId === userId && !seen.has(x.serverId) && !deletedServerIds.has(x.serverId)) {
            seen.add(x.serverId);
            result.push({ id: x.serverId, localId: null, text: x.text, completed: x.completed });
        }
    });
    serverEdits.forEach((e, id) => {
        if (e.userId === userId && !seen.has(id) && !deletedServerIds.has(id)) {
            seen.add(id);
            result.push({ id, localId: null, text: e.text, completed: e.completed });
        }
    });

    const created = todos
        .filter(x => x.local && x.userId === userId)
        .map(x => ({ id: null, localId: x.id, text: x.text, completed: x.completed }));
    return [...created, ...result];
}

let currentProfile = null;
let lastFocus = null;

async function openProfile(userId, trigger) {
    currentProfile = userId;
    profileView = { sort: '', status: 'all' };   // каждый раз открываем без сортировки и фильтра
    lastFocus = trigger;
    $('overlay').hidden = false;
    $('profileBody').textContent = 'Загрузка...';
    $('closeBtn').focus();

    try {
        const { user } = await getProfile(userId);
        const serverList = await profileServerTodos(userId);
        if (currentProfile !== userId) return; // окно уже закрыли
        renderProfile(user, profileTodos(userId, serverList));
    } catch (error) {
        console.error('Ошибка профиля:', error);
        if (currentProfile === userId) $('profileBody').textContent = 'Не удалось загрузить профиль.';
    }
}

function closeProfile() {
    currentProfile = null;
    $('overlay').hidden = true;
    if (lastFocus) lastFocus.focus();
}

function textEl(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.textContent = text;
    return e;
}

const GENDERS = { male: 'Мужской', female: 'Женский' };

function renderProfile(user, initialList) {
    let list = initialList;   // меняется, когда запрашиваем другую сортировку
    const a = user.address || {};
    const c = user.company || {};
    const hair = user.hair ? [user.hair.color, user.hair.type].filter(Boolean).join(', ') : '';

    const wrap = document.createElement('div');
    wrap.className = 'profile';

    // Слева: фото и подробная информация
    const info = document.createElement('div');

    const head = document.createElement('div');
    head.className = 'profile-head';
    const img = document.createElement('img');
    img.className = 'avatar';
    img.src = user.image;
    img.alt = '';
    const titles = document.createElement('div');
    titles.append(
        textEl('h2', '', `${user.firstName} ${user.lastName}`),
        textEl('div', 'handle', `@${user.username} · ID ${user.id}`)
    );
    head.append(img, titles);

    const dl = document.createElement('dl');
    [
        ['Email', user.email],
        ['Телефон', user.phone],
        ['Девичья фамилия', user.maidenName],
        ['Возраст', user.age ? `${user.age} лет` : ''],
        ['Пол', GENDERS[user.gender] || user.gender],
        ['Дата рождения', user.birthDate],
        ['Адрес', [a.address, a.city, a.state, a.country].filter(Boolean).join(', ')],
        ['Индекс', a.postalCode],
        ['Компания', c.name],
        ['Отдел', c.department],
        ['Должность', c.title],
        ['Университет', user.university],
        ['Роль', user.role],
        ['Рост / вес', user.height && user.weight ? `${user.height} см / ${user.weight} кг` : ''],
        ['Группа крови', user.bloodGroup],
        ['Цвет глаз', user.eyeColor],
        ['Волосы', hair],
        ['IP-адрес', user.ip]
    ].forEach(([label, value]) => {
        if (!value) return;
        dl.append(textEl('dt', '', label), textEl('dd', '', String(value)));
    });
    info.append(head, dl);

    // Справа: все задачи пользователя
    const side = document.createElement('div');
    side.className = 'profile-side';

    const sideHead = document.createElement('div');
    sideHead.className = 'side-head';
    sideHead.append(
        textEl('h3', '', 'Задачи пользователя'),
        makeButton('＋ Добавить задачу', 'btn btn-gold btn-sm',
            e => openTaskForm({ userId: user.id, trigger: e.currentTarget }))   // автор — этот пользователь
    );

    // Сортировка (запросом к API) и фильтр «выполнено / не выполнено»
    const controls = document.createElement('div');
    controls.className = 'profile-controls';

    const sortLabel = textEl('label', 'muted', 'Сортировка (через API)');
    sortLabel.htmlFor = 'profileSort';
    const sortSel = document.createElement('select');
    sortSel.id = 'profileSort';
    [
        ['', 'Без сортировки'],
        ['todo:asc', 'По тексту: А → Я'],
        ['todo:desc', 'По тексту: Я → А'],
        ['completed:desc', 'Сначала выполненные'],
        ['completed:asc', 'Сначала невыполненные']
    ].forEach(([value, label]) => {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        sortSel.append(o);
    });
    sortSel.value = profileView.sort;

    const chips = document.createElement('div');
    chips.className = 'profile-chips';
    const chipEls = [['all', 'Все'], ['done', 'Выполненные'], ['pending', 'Не выполненные']].map(([value, label]) => {
        const chip = makeButton(label, 'status-chip', () => {
            profileView.status = value;
            chipEls.forEach(c => c.classList.toggle('active', c === chip));
            renderTasks();
        });
        chip.classList.toggle('active', value === profileView.status);
        return chip;
    });
    chips.append(...chipEls);
    controls.append(sortLabel, sortSel, chips);

    const count = textEl('p', 'muted', '');
    const msg = textEl('p', 'status error', '');
    const ul = document.createElement('ul');
    ul.className = 'profile-tasks';

    // Описание задачи для запросов и окна «Изменить задачу»
    const taskOf = t => ({ todoId: t.localId, serverId: t.id, text: t.text, completed: t.completed, userId: user.id });

    const renderTasks = () => {
        ul.replaceChildren();
        const shown = viewProfileTasks(list);
        count.textContent = `Показано ${shown.length} из ${list.length}`;
        if (!shown.length) ul.append(textEl('li', 'empty', list.length ? 'Нет задач с таким статусом.' : 'Задач нет.'));
        shown.forEach(t => {
            const li = document.createElement('li');

            // Галочка: стоит — «Выполнено», снята — «Не выполнено»
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = t.completed;
            cb.setAttribute('aria-label', 'Выполнено');
            cb.onchange = async () => {
                const checked = cb.checked;
                const scroll = ul.scrollTop;
                msg.textContent = '';
                cb.disabled = true;
                if (await updateTask(taskOf(t), { completed: checked })) t.completed = checked;   // PUT
                else msg.textContent = $('status').textContent;
                renderTasks();   // подпись и зачёркивание обновятся; при ошибке галочка вернётся назад
                ul.scrollTop = scroll;
            };

            const meta = document.createElement('div');
            meta.className = 't-meta';
            meta.append(
                textEl('span', t.completed ? 'state ok' : 'state', t.completed ? 'Выполнено' : 'Не выполнено'),
                textEl('span', '', t.id ? `Задача #${t.id}` : 'Создана на странице')
            );
            const body = document.createElement('div');
            body.className = 't-body';
            body.append(textEl('div', 't-text' + (t.completed ? ' done' : ''), t.text), meta);

            const actions = document.createElement('div');
            actions.className = 't-actions';
            actions.append(
                makeButton('Изменить', 'btn btn-outline btn-sm', e => {
                    msg.textContent = '';
                    openTaskForm({ mode: 'edit', task: taskOf(t), trigger: e.currentTarget });
                }),
                makeButton('Удалить', 'btn btn-danger btn-sm', () => profileRemove(t, msg))
            );

            li.append(cb, body, actions);
            ul.append(li);
        });
    };
    renderTasks();

    // Выбрали сортировку — отправляем новый запрос к API
    sortSel.onchange = async () => {
        const previous = profileView.sort;
        profileView.sort = sortSel.value;
        msg.textContent = '';
        sortSel.disabled = true;
        try {
            list = profileTodos(user.id, await profileServerTodos(user.id));   // GET с sortBy и order
            renderTasks();
        } catch (error) {
            console.error('Ошибка сортировки:', error);
            profileView.sort = previous;
            sortSel.value = previous;
            msg.textContent = 'Не удалось получить отсортированные задачи.';
        }
        sortSel.disabled = false;
    };

    side.append(sideHead, controls, count, msg, ul);
    wrap.append(info, side);
    $('profileBody').replaceChildren(wrap);
}

/* ============ Изменение и удаление задач из профиля ============ */

// Перерисовываем окно профиля (данные берём из кэша)
async function refreshProfile() {
    if (currentProfile == null) return;
    const id = currentProfile;
    try {
        const { user } = await getProfile(id);
        const serverList = await profileServerTodos(id);
        if (currentProfile !== id) return;
        renderProfile(user, profileTodos(id, serverList));
    } catch (error) {
        console.error('Ошибка профиля:', error);
    }
}

// Та же задача в общем списке (если она там есть)
function findMine(item) {
    if (item.localId) return todos.find(t => t.id === item.localId);
    return todos.find(t => t.api === 'dummy' && !t.local && t.serverId === item.id);
}

async function profileRemove(item, msg) {
    const mine = findMine(item);
    const target = mine || { api: 'dummy', serverId: item.id, userId: currentProfile };

    if (!(await syncServer(target, 'DELETE'))) {   // DELETE
        msg.textContent = $('status').textContent;
        return;
    }
    if (!item.localId) deletedServerIds.add(item.id);
    if (mine) todos = todos.filter(t => t !== mine);
    save();
    render();
    refreshProfile();
}

/* ============ Сортировка через API ============ */

// Ссылка с параметрами сортировки: ?limit=30&sortBy=todo&order=asc
function buildTodosUrl(sort) {
    const params = new URLSearchParams({ limit: 30 });
    if (sort) {
        const [by, order] = sort.split(':');
        params.set('sortBy', by);
        params.set('order', order);
    }
    return 'https://dummyjson.com/todos?' + params;
}

function loadFiltered() {
    const sort = $('sortSel').value;
    $('apiUrl').value = buildTodosUrl(sort);
    loadFromApi(Boolean(sort));
}

/* ============ События и запуск ============ */

document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
        filter = chip.dataset.filter;
        render();
    };
});

$('searchInput').addEventListener('input', e => {
    searchText = e.target.value;
    render();
});

$('authorFilter').addEventListener('change', e => {
    authorFilter = e.target.value;
    render();
});

// Сортировка идёт запросом к API — сразу при выборе
$('sortSel').addEventListener('change', loadFiltered);

$('resetBtn').onclick = () => {
    filter = 'all';
    searchText = '';
    authorFilter = 'all';
    $('searchInput').value = '';
    render();
};

// Enter отправляет форму, Shift+Enter — новая строка
$('todoInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitTaskForm();
    }
});
$('closeBtn').onclick = closeProfile;
$('openAddBtn').onclick = e => openTaskForm({
    userId: Number($('authorSel').value) || CURRENT_USER_ID,
    trigger: e.currentTarget
});
$('addCloseBtn').onclick = closeTaskForm;
$('taskCancelBtn').onclick = closeTaskForm;
$('taskSubmitBtn').onclick = submitTaskForm;
$('addOverlay').onclick = e => { if (e.target === $('addOverlay')) closeTaskForm(); };
$('overlay').onclick = e => { if (e.target === $('overlay')) closeProfile(); };
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('addOverlay').hidden) closeTaskForm();
    else if (!$('overlay').hidden) closeProfile();
});

$('apiUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadFromApi();
});

// «Добавить задачу» — справа от поля поиска (в карточке «Все задачи»)
(function placeAddButton() {
    const search = $('searchInput');
    const addBtn = $('openAddBtn');
    if (!search || !addBtn) return;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:nowrap;';
    search.parentNode.insertBefore(row, search);
    row.append(search, addBtn);
    search.style.width = 'auto';
    search.style.flex = '1 1 0';
    search.style.minWidth = '0';
    addBtn.style.flexShrink = '0';
    addBtn.style.whiteSpace = 'nowrap';
})();

function init() {
    const saved = readState();
    if (saved) {
        todos = Array.isArray(saved.todos) ? saved.todos : [];
        nextId = Math.max(0, ...todos.map(t => t.id)) + 1;
        if (saved.url) $('apiUrl').value = saved.url;
        render();
        setStatus(`Восстановлено задач: ${todos.length}`);
    } else {
        render();
        loadFromApi(); // первый запуск: сразу загружаем задачи
    }
}

init();
loadUsers();