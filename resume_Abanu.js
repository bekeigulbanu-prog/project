// Получаем элементы из HTML
const projectCard = document.getElementById('project-card-btn');
const modal = document.getElementById('modal');
const closeBtn = document.querySelector('.close-btn');

// Когда пользователь кликает на карточку проекта — открываем модальное окно
projectCard.addEventListener('click', () => {
    modal.style.display = 'flex';
});

// Когда пользователь кликает на крестик — закрываем окно
closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

// Когда пользователь кликает в любое место вне окна — тоже закрываем
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});