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
