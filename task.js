const PRESETS = {
    dummy: 'https://dummyjson.com/todos',
    placeholder: 'https://jsonplaceholder.typicode.com/todos?_limit=30',
    gorest: 'https://gorest.co.in/public/v2/todos'
};
const RANDOM_URL = 'https://dummyjson.com/todos/random';
const STORAGE_KEY = 'todo-app-state';

let todos = [];        // Список задач: { id, text, completed }
let filter = 'all';    // all | done | pending
let editingId = null;  // ID задачи, которая сейчас редактируется
let nextId = 1;        // Внутренние уникальные ID

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
