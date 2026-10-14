const PRESETS = { dummy: 'https://dummyjson.com/todos' };
const STORAGE_KEY = 'todo-app-state';
const CURRENT_USER_ID = 1; // автор по умолчанию для новых задач

let todos = [];            // Список задач: { id, text, completed, userId, ... }
let filter = 'all';        // all | done | pending
let searchText = '';       // поиск по названию
let authorFilter = 'all';  // all | id автора
let editingId = null;      // ID задачи, которая сейчас редактируется
let nextId = 1;            // Внутренние уникальные ID

let usersMap = new Map();           // id -> { username, firstName, lastName, image }
const profileCache = new Map();     // id -> Promise с профилем (кэш)
const deletedServerIds = new Set(); // удалённые у нас задачи сервера (сервер их не удаляет)
const serverEdits = new Map();      // serverId -> { text, completed }: правки задач сервера из профиля

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
        .map(item => ({
            id: nextId++,
            serverId: item?.id,   // id задачи на сервере
            userId: item?.userId, // автор задачи
            api,                  // 'dummy' | null
            text: String(item?.todo ?? item?.title ?? '').trim(),
            completed: Boolean(item?.completed)
        }))
        .filter(task => task.text);
}

/* ============ Запросы на сервер (POST / PUT / DELETE) ============ */

// Какие API умеют принимать изменения (для остальных ссылок — только локально)
const WRITE_API = {
    dummy: {
        add: 'https://dummyjson.com/todos/add',
        item: id => `https://dummyjson.com/todos/${id}`,
        body: t => ({ todo: t.text, completed: t.completed })
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
        editingId = null;
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

// Окно «Новая задача»
function openAdd() {
    $('addMsg').textContent = '';
    $('addOverlay').hidden = false;
    $('todoInput').focus();
}

function closeAdd() {
    $('addOverlay').hidden = true;
    $('openAddBtn').focus();
}

function showAddMessage(message) {
    $('addMsg').textContent = message;
}

async function addTodo() {
    const input = $('todoInput');
    const text = input.value.trim();
    if (!text) {
        showAddMessage('Введите текст задачи.');
        return;
    }

    // Автор и статус берутся из формы
    const userId = Number($('authorSel').value) || CURRENT_USER_ID;
    const todo = { id: nextId++, text, completed: $('statusSel').value === 'done', userId };
    const api = detectApi($('apiUrl').value);
    if (api) {
        todo.api = api;
        todo.local = true; // сервер новую задачу не сохраняет
    }

    if (!(await syncServer(todo, 'POST'))) {   // POST
        showAddMessage($('status').textContent);
        return;
    }

    todos.unshift(todo);
    input.value = '';
    $('statusSel').value = 'pending';
    save();
    render();
    closeAdd();
}

async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const changed = { ...todo, completed: !todo.completed };
    if (await syncServer(changed, 'PUT')) {   // PUT
        todo.completed = changed.completed;
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

function startEdit(id) {
    editingId = id;
    render();
}

function cancelEdit() {
    editingId = null;
    render();
}

async function saveEdit(id, value) {
    const text = value.trim();
    if (!text) {
        setStatus('Текст задачи не может быть пустым.', true);
        return;
    }
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const changed = { ...todo, text };
    if (!(await syncServer(changed, 'PUT'))) return; // PUT

    todo.text = text;
    editingId = null;
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

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (todo.id === editingId) {
        const field = document.createElement('input');
        field.type = 'text';
        field.className = 'edit-field';
        field.value = todo.text;
        field.onkeydown = e => {
            if (e.key === 'Enter') saveEdit(todo.id, field.value);
            if (e.key === 'Escape') cancelEdit();
        };

        actions.append(
            makeButton('Сохранить', 'btn btn-gold btn-sm', () => saveEdit(todo.id, field.value)),
            makeButton('Отмена', 'btn btn-outline btn-sm', cancelEdit)
        );
        li.append(checkbox, field, actions);
        setTimeout(() => { field.focus(); field.select(); }, 0);
    } else {
        // textContent, а не innerHTML — защита от вставки HTML в текст задачи
        const text = document.createElement('span');
        text.className = 'text';
        text.textContent = todo.text;

        actions.append(
            makeButton('Изменить', 'btn btn-outline btn-sm', () => startEdit(todo.id)),
            makeButton('Удалить', 'btn btn-danger btn-sm', () => removeTodo(todo.id))
        );
        const body = document.createElement('div');
        body.className = 'body';
        body.append(text);
        const nick = makeAuthor(todo);
        if (nick) body.append(nick);   // автор — под текстом задачи

        li.append(checkbox, body, actions);
    }
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
    const fromServer = serverList
        .filter(t => !deletedServerIds.has(t.id))
        .map(t => {
            const mine = todos.find(x => x.api === 'dummy' && !x.local && x.serverId === t.id);
            const src = mine || serverEdits.get(t.id) || { text: t.todo, completed: t.completed };
            return { id: t.id, localId: null, text: src.text, completed: src.completed };
        });
    const created = todos
        .filter(x => x.local && x.userId === userId)
        .map(x => ({ id: null, localId: x.id, text: x.text, completed: x.completed }));
    return [...created, ...fromServer];
}

let currentProfile = null;
let lastFocus = null;

async function openProfile(userId, trigger) {
    currentProfile = userId;
    lastFocus = trigger;
    $('overlay').hidden = false;
    $('profileBody').textContent = 'Загрузка...';
    $('closeBtn').focus();

    try {
        const { user, todos: serverList } = await getProfile(userId);
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

function renderProfile(user, list) {
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

    const msg = textEl('p', 'status error', '');
    const ul = document.createElement('ul');
    ul.className = 'profile-tasks';
    let editingKey = null;
    const keyOf = t => (t.localId ? 'l' + t.localId : 's' + t.id);

    const renderTasks = () => {
        ul.replaceChildren();
        if (!list.length) ul.append(textEl('li', 'empty', 'Задач нет.'));
        list.forEach(t => {
            const li = document.createElement('li');
            const body = document.createElement('div');
            body.className = 't-body';
            const actions = document.createElement('div');
            actions.className = 't-actions';
            let cb = null;   // галочка слева (только вне режима редактирования)

            if (keyOf(t) === editingKey) {
                // Режим редактирования
                const field = document.createElement('input');
                field.type = 'text';
                field.value = t.text;
                const label = document.createElement('label');
                label.className = 'check';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = t.completed;
                label.append(cb, ' Выполнено');

                const submit = () => profileEdit(t, field.value, cb.checked, msg);
                field.onkeydown = e => {
                    if (e.key === 'Enter') submit();
                    if (e.key === 'Escape') { e.stopPropagation(); editingKey = null; renderTasks(); }
                };
                body.append(field, label);
                actions.append(
                    makeButton('Сохранить', 'btn btn-gold btn-sm', submit),
                    makeButton('Отмена', 'btn btn-outline btn-sm', () => { editingKey = null; renderTasks(); })
                );
                setTimeout(() => { field.focus(); field.select(); }, 0);
            } else {
                const meta = document.createElement('div');
                meta.className = 't-meta';
                meta.append(
                    textEl('span', t.completed ? 'state ok' : 'state', t.completed ? 'Выполнено' : 'Не выполнено'),
                    textEl('span', '', t.id ? `Задача #${t.id}` : 'Создана на странице')
                );
                body.append(textEl('div', 't-text' + (t.completed ? ' done' : ''), t.text), meta);

                // Галочка: стоит — «Выполнено», снята — «Не выполнено»
                cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = t.completed;
                cb.setAttribute('aria-label', 'Выполнено');
                cb.onchange = async () => {
                    const checked = cb.checked;
                    const scroll = ul.scrollTop;
                    msg.textContent = '';
                    cb.disabled = true;
                    const ok = await profileEdit(t, t.text, checked, msg, false);   // PUT
                    if (ok) t.completed = checked;   // подпись и зачёркивание обновятся ниже
                    renderTasks();                   // при ошибке галочка вернётся назад
                    ul.scrollTop = scroll;
                };
                actions.append(
                    makeButton('Изменить', 'btn btn-outline btn-sm', () => { msg.textContent = ''; editingKey = keyOf(t); renderTasks(); }),
                    makeButton('Удалить', 'btn btn-danger btn-sm', () => profileRemove(t, msg))
                );
            }
            if (cb) li.append(cb);
            li.append(body, actions);
            ul.append(li);
        });
    };
    renderTasks();

    side.append(msg, ul);
    wrap.append(info, side);
    $('profileBody').replaceChildren(wrap);
}

/* ============ Изменение и удаление задач из профиля ============ */

// Перерисовываем окно профиля (данные берём из кэша)
async function refreshProfile() {
    if (currentProfile == null) return;
    const id = currentProfile;
    try {
        const { user, todos: serverList } = await getProfile(id);
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

async function profileEdit(item, value, completed, msg, refresh = true) {
    const text = value.trim();
    if (!text) {
        msg.textContent = 'Текст задачи не может быть пустым.';
        return false;
    }
    const mine = findMine(item);
    const target = mine
        ? { ...mine, text, completed }
        : { api: 'dummy', serverId: item.id, userId: currentProfile, text, completed };

    if (!(await syncServer(target, 'PUT'))) {   // PUT
        msg.textContent = $('status').textContent;
        return false;
    }
    if (mine) {
        mine.text = text;
        mine.completed = completed;
    } else {
        serverEdits.set(item.id, { text, completed });
    }
    save();
    render();
    if (refresh) refreshProfile();
    return true;
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

$('todoInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodo();
});
$('closeBtn').onclick = closeProfile;
$('openAddBtn').onclick = openAdd;
$('addCloseBtn').onclick = closeAdd;
$('addOverlay').onclick = e => { if (e.target === $('addOverlay')) closeAdd(); };
$('overlay').onclick = e => { if (e.target === $('overlay')) closeProfile(); };
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('addOverlay').hidden) closeAdd();
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