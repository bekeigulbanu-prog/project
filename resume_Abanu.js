
const projectCard = document.getElementById('project-card-btn');
const modal = document.getElementById('modal');
const closeBtn = document.querySelector('.close-btn');

projectCard.addEventListener('click', () => {
    modal.style.display = 'flex';
});

closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});