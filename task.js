const PRESETS = {
    dummy: 'https://dummyjson.com/todos',
    placeholder: 'https://jsonplaceholder.typicode.com/todos?_limit=30',
    gorest: 'https://gorest.co.in/public/v2/todos'
};
const RANDOM_URL = 'https://dummyjson.com/todos/random';
const STORAGE_KEY = 'todo-app-state';

let todos = [];   
let filter = 'all';    
let editingId = null;  
let nextId = 1;        

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

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
}


function normalize(data) {
    const list = Array.isArray(data) ? data : data && data.todos;
    if (!Array.isArray(list)) throw new Error('Неверный формат ответа');

    return list
        .map(item => ({
            id: nextId++,
            text: String(item?.todo ?? item?.title ?? '').trim(),
            completed: Boolean(item?.completed ?? item?.status === 'completed')
        }))
        .filter(task => task.text);
}



async function loadFromApi() {
    const url = $('apiUrl').value.trim();
    if (!url.startsWith('https://')) {
        setStatus('Введите HTTPS-ссылку, начинающуюся с https://', true);
        return;
    }

    setStatus('Загрузка...');
    try {
        todos = normalize(await fetchJson(url));
        editingId = null;
        save();
        render();
        setStatus(`Загружено задач: ${todos.length}`);
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        setStatus('Не удалось загрузить. Проверьте ссылку: API должен возвращать список задач и разрешать запросы из браузера.', true);
    }
}

function usePreset(name) {
    $('apiUrl').value = PRESETS[name];
    loadFromApi();
}

async function addRandomTask() {
    setStatus('Загрузка...');
    try {
        const [task] = normalize([await fetchJson(RANDOM_URL)]);
        todos.unshift(task);
        save();
        render();
        setStatus('Добавлена случайная задача.');
    } catch (error) {
        console.error('Ошибка:', error);
        setStatus('Не удалось получить случайную задачу.', true);
    }
}



function addTodo() {
    const input = $('todoInput');
    const text = input.value.trim();
    if (!text) {
        setStatus('Введите текст задачи.', true);
        return;
    }

    todos.unshift({ id: nextId++, text, completed: false });
    input.value = '';
    setStatus('');
    save();
    render();
}

function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    save();
    render();
}

function removeTodo(id) {
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

function saveEdit(id, value) {
    const text = value.trim();
    if (!text) {
        setStatus('Текст задачи не может быть пустым.', true);
        return;
    }
    const todo = todos.find(t => t.id === id);
    if (todo) todo.text = text;
    editingId = null;
    setStatus('');
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
        
        const text = document.createElement('span');
        text.className = 'text';
        text.textContent = todo.text;

        actions.append(
            makeButton('Изменить', 'btn btn-outline btn-sm', () => startEdit(todo.id)),
            makeButton('Удалить', 'btn btn-danger btn-sm', () => removeTodo(todo.id))
        );
        li.append(checkbox, text, actions);
    }
    return li;
}

function render() {
    const list = $('todoList');
    list.innerHTML = '';

    const visible = todos.filter(t =>
        filter === 'all' || (filter === 'done' ? t.completed : !t.completed)
    );

    if (visible.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'Задач нет';
        list.appendChild(empty);
    }
    visible.forEach(todo => list.appendChild(createItem(todo)));

    const done = todos.filter(t => t.completed).length;
    $('totalCount').textContent = todos.length;
    $('completedCount').textContent = done;
    $('pendingCount').textContent = todos.length - done;

    document.querySelectorAll('.chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.filter === filter);
    });
}



document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
        filter = chip.dataset.filter;
        render();
    };
});

$('todoInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodo();
});
$('apiUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadFromApi();
});

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
        loadFromApi(); 
    }
}

init();