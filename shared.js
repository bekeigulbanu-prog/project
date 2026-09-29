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

function generateTable() {
    let rows = document.getElementById('rowsInput').value;
    let cols = document.getElementById('colsInput').value;
    let container = document.getElementById('tableContainer');

    container.innerHTML = '<table class="dynamic-table" id="myTable"></table>';
    let table = document.getElementById('myTable');

    for (let i = 0; i < rows; i++) {
        let tr = document.createElement('tr');
        for (let j = 0; j < cols; j++) {
            let td = document.createElement('td');
            
            td.onclick = function() {
                this.classList.toggle('color-state-1');
            };
            
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    
    document.getElementById('colorCounterBox').style.display = 'block';
}

function countColoredCells() {
    let count = document.querySelectorAll('.dynamic-table td.color-state-1').length;
    document.getElementById('counterOutput').textContent = 'Зеленых ячеек: ' + count;
}


// Бүкіл бетті қараңғы/жарық режимге ауыстыратын функция
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