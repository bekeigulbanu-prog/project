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
        setStatus(Загружено задач: ${todos.length});
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