const PRESETS = { dummy: 'https://dummyjson.com/todos' };
const STORAGE_KEY = 'todo-app-state';
const CURRENT_USER_ID = 1; 

let todos = [];          
let filter = 'all';        
let searchText = '';       
let authorFilter = 'all';  
let editingId = null;      
let nextId = 1;            

let usersMap = new Map();           
const profileCache = new Map();     
const deletedServerIds = new Set(); 
const serverEdits = new Map();     

const $ = id => document.getElementById(id);

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



function setStatus(message, isError = false) {
    const el = $('status');
    el.textContent = message;
    el.className = isError ? 'status error' : 'status';
}

function setApiLog(method, url) {
    $('apiLog').textContent = `${method} ${url}`;
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
}


function normalize(data, api = null) {
    const list = Array.isArray(data) ? data : data && data.todos;
    if (!Array.isArray(list)) throw new Error('Неверный формат ответа');

    return list
        .map(item => ({
            id: nextId++,
            serverId: item?.id,   
            userId: item?.userId, 
            api,                 
            text: String(item?.todo ?? item?.title ?? '').trim(),
            completed: Boolean(item?.completed)
        }))
        .filter(task => task.text);
}


const WRITE_API = {
    dummy: {
        add: 'https://dummyjson.com/todos/add',
        item: id => `https://dummyjson.com/todos/${id}`,
        body: t => ({ todo: t.text, completed: t.completed })
    }
};


function detectApi(url) {
    try {
        const host = new URL(url).hostname;
        if (host === 'dummyjson.com') return 'dummy';
    } catch { /* неверная ссылка */ }
    return null;
}


async function syncServer(todo, method) {
    const api = WRITE_API[todo.api];

    if (!api) {
        setStatus('Этот API не принимает изменения — правка только на странице.');
        return true;
    }
    
    if (method !== 'POST' && todo.local) {
        setStatus('Эта задача создана на странице — на сервере её нет, запрос не отправлен.');
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
        await fetchJson(url, options);
        setStatus(`Запрос отправлен: ${method} ${url}`);
        setApiLog(method, url);
        return true;
    } catch (error) {
        console.error('Ошибка запроса:', error);
        setStatus(`Не удалось выполнить ${method}. Изменение не применено.`, true);
        return false;
    }
}


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
                actions.append(
                    makeButton('Изменить', 'btn btn-outline btn-sm', () => { msg.textContent = ''; editingKey = keyOf(t); renderTasks(); }),
                    makeButton('Удалить', 'btn btn-danger btn-sm', () => profileRemove(t, msg))
                );
            }
            li.append(body, actions);
            ul.append(li);
        });
    };
    renderTasks();

    side.append(msg, ul);
    wrap.append(info, side);
    $('profileBody').replaceChildren(wrap);
}

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

async function profileEdit(item, value, completed, msg) {
    const text = value.trim();
    if (!text) {
        msg.textContent = 'Текст задачи не может быть пустым.';
        return;
    }
    const mine = findMine(item);
    const target = mine
        ? { ...mine, text, completed }
        : { api: 'dummy', serverId: item.id, userId: currentProfile, text, completed };

    if (!(await syncServer(target, 'PUT'))) {   // PUT
        msg.textContent = $('status').textContent;
        return;
    }
    if (mine) {
        mine.text = text;
        mine.completed = completed;
    } else {
        serverEdits.set(item.id, { text, completed });
    }
    save();
    render();
    refreshProfile();
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
