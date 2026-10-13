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
