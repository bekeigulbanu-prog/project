// Базовая функция переключения активной вкладки
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

// Динамическое создание и открытие вкладки "Список резюме"
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

// Закрытие вкладки "Список резюме"
function closeListTab(event) {
    event.stopPropagation();
    
    let btn = document.getElementById('btn-list');
    if (btn) btn.remove();

    let content = document.getElementById('tab-list');
    if (content) content.classList.remove('active-content');

    openTab('tab-main', 'btn-main');
}

// Динамическое создание и открытие вкладки конкретного резюме
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

// Закрытие вкладки конкретного резюме
function closeResumeTab(event, tabId, btnId) {
    event.stopPropagation();
    
    let btn = document.getElementById(btnId);
    if (btn) btn.remove();

    let content = document.getElementById(tabId);
    if (content) content.classList.remove('active-content');

    // Возвращаем на вкладку списка, если она открыта, иначе на главную
    if (document.getElementById('btn-list')) {
        openTab('tab-list', 'btn-list');
    } else {
        openTab('tab-main', 'btn-main');
    }
}