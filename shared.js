function openTab(tabName, btnId) {
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active-content");
    }

    const tabBtns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabBtns.length; i++) {
        tabBtns[i].classList.remove("active");
    }

    document.getElementById(tabName).classList.add("active-content");
    document.getElementById(btnId).classList.add("active");
}

function showListTab() {
    let tabId = 'tab-list';
    let btnId = 'btn-list';

    if (!document.getElementById(btnId)) {
        let tabsHeader = document.getElementById('tabsHeader');
        
        let newBtn = document.createElement('button');
        newBtn.className = 'tab-btn';
        newBtn.id = btnId;
        newBtn.innerHTML = 'Список резюме <span class="close-tab" onclick="closeListTab(event)">×</span>';
        
        newBtn.onclick = function(event) {
            if (!event.target.classList.contains('close-tab')) {
                openTab(tabId, btnId);
            }
        };
        
        tabsHeader.appendChild(newBtn);
    }

    openTab(tabId, btnId);
}

function closeListTab(event) {
    event.stopPropagation();
    
    let btn = document.getElementById('btn-list');
    if (btn) btn.remove();

    let content = document.getElementById('tab-list');
    if (content) content.classList.remove('active-content');

    openTab('tab-main', 'btn-main');
}

function showResume(person) {
    let tabId = 'tab-' + person;
    let btnId = 'btn-' + person;
    let personName = person === 'gulbanu' ? 'Резюме: Гульбану' : 'Резюме: Айдана';

    if (!document.getElementById(btnId)) {
        let tabsHeader = document.getElementById('tabsHeader');
        
        let newBtn = document.createElement('button');
        newBtn.className = 'tab-btn';
        newBtn.id = btnId;
        newBtn.innerHTML = personName + ' <span class="close-tab" onclick="closeResumeTab(event, \'' + tabId + '\', \'' + btnId + '\')">×</span>';
        
        newBtn.onclick = function(event) {
            if (!event.target.classList.contains('close-tab')) {
                openTab(tabId, btnId);
            }
        };
        
        tabsHeader.appendChild(newBtn);
    }

    openTab(tabId, btnId); 
}

function closeResumeTab(event, tabId, btnId) {
    event.stopPropagation();
    
    let btn = document.getElementById(btnId);
    if (btn) btn.remove();

    let content = document.getElementById(tabId);
    if (content) content.classList.remove('active-content');

    if (document.getElementById('btn-list')) {
        openTab('tab-list', 'btn-list');
    } else {
        openTab('tab-main', 'btn-main');
    }
}

function showTaskTab(taskId, taskName) {
    let tabId = 'tab-' + taskId;
    let btnId = 'btn-' + taskId;

    if (!document.getElementById(btnId)) {
        let tabsHeader = document.getElementById('tabsHeader');
        let newBtn = document.createElement('button');
        newBtn.className = 'tab-btn';
        newBtn.id = btnId;
        newBtn.innerHTML = taskName + ' <span class="close-tab" onclick="closeResumeTab(event, \'' + tabId + '\', \'' + btnId + '\')">×</span>';
        
        newBtn.onclick = function(event) {
            if (!event.target.classList.contains('close-tab')) {
                openTab(tabId, btnId);
            }
        };
        tabsHeader.appendChild(newBtn);
    }
    openTab(tabId, btnId);
}

let isTextChanged = false;
function changeTextWithToggle() {
    const title = document.getElementById('target-title');
    if (!isTextChanged) {
        title.textContent = 'Привет, мир!';
        isTextChanged = true;
    } else {
        title.textContent = 'Исходный текст заголовка по ID';
        isTextChanged = false;
    }
}

function deleteOldElement() {
    const el = document.getElementById('element-to-delete');
    if (el) {
        el.remove();
        alert('Элемент old-element успешно удален!');
    } else {
        alert('Элемент уже удален!');
    }
}

function createNewDiv() {
    if (!document.getElementById('unique-new-div')) {
        const newDiv = document.createElement('div');
        newDiv.className = 'new-div';
        newDiv.id = 'unique-new-div';
        newDiv.textContent = 'Я новый элемент';
        
        document.body.appendChild(newDiv);
    } else {
        alert('Новый элемент уже добавлен!');
    }
}

let isParagraphModified = false;
function toggleParagraphStyle() {
    const p = document.getElementById('interactiveParagraph');
    if (!isParagraphModified) {
        p.style.color = '#dc2626';
        p.style.fontSize = '18px';
        p.style.fontWeight = 'bold';
        isParagraphModified = true;
    } else {
        p.style.color = '';
        p.style.fontSize = '';
        p.style.fontWeight = '';
        isParagraphModified = false;
    }
}

function toggleElementClass() {
    const el = document.getElementById('class-target-element');
    el.classList.toggle('active');
    showClassesInfo();
}

function showClassesInfo() {
    const el = document.getElementById('class-target-element');
    const classListString = el.classList.value;
    
    console.log('Классы элемента:', classListString);
    document.getElementById('classes-output').textContent = classListString ? classListString : 'У элемента нет классов';
}

let currentColor = '#22c55e'; // По умолчанию зеленый
let currentColorName = 'Зеленый';

function selectColor(color, name) {
    currentColor = color;
    currentColorName = name;
    document.getElementById('selectedColorText').textContent = `Выбранный цвет: ${name}`;
}

function createTable() {
    const rows = document.getElementById('rowsInput').value;
    const cols = document.getElementById('colsInput').value;
    const container = document.getElementById('tableContainer');
    container.innerHTML = '';

    if (rows <= 0 || cols <= 0) return;

    const table = document.createElement('table');
    for (let i = 0; i < rows; i++) {
        const tr = document.createElement('tr');
        for (let j = 0; j < cols; j++) {
            const td = document.createElement('td');
            td.style.width = '45px';
            td.style.height = '45px';
            td.style.border = '1px solid #cbd5e1';
            td.style.cursor = 'pointer';
            td.style.textAlign = 'center';
            td.style.verticalAlign = 'middle';
            td.style.transition = 'background-color 0.2s';
            
            td.onclick = function() {
                this.style.backgroundColor = currentColor;
                updateStats();
            };
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    container.appendChild(table);
    updateStats();
}

function updateStats() {
    const table = document.querySelector('#tableContainer table');
    if (!table) return;

    let red = 0, green = 0, blue = 0, yellow = 0;

    table.querySelectorAll('td').forEach(td => {
        const bg = td.style.backgroundColor;
        if (bg === 'rgb(220, 38, 38)') red++;       // #dc2626
        if (bg === 'rgb(34, 197, 94)') green++;     // #22c55e
        if (bg === 'rgb(59, 130, 246)') blue++;     // #3b82f6
        if (bg === 'rgb(234, 179, 8)') yellow++;    // #eab308
    });

    document.getElementById('stat-red').textContent = red;
    document.getElementById('stat-green').textContent = green;
    document.getElementById('stat-blue').textContent = blue;
    document.getElementById('stat-yellow').textContent = yellow;
    document.getElementById('stat-total').textContent = red + green + blue + yellow;
}

window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('rowsInput')) {
        createTable();
    }
});



function toggleGlobalTheme() {
    const body = document.body;
    body.classList.toggle('global-dark-mode');
    
    const btn = document.getElementById('globalThemeBtn');
    if (body.classList.contains('global-dark-mode')) {
        btn.textContent = '☀️ Выключить темную тему';
        btn.style.backgroundColor = '#f59e0b';
    } else {
        btn.textContent = '🌙 Включить темную тему';
        btn.style.backgroundColor = '#2563eb';
    }
}





