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
