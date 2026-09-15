const cardGulbanu = document.getElementById('open-gulbanu');
const modalGulbanu = document.getElementById('modal-gulbanu');
const closeGulbanu = document.getElementById('close-gulbanu');

const cardPartner = document.getElementById('open-partner');
const modalPartner = document.getElementById('modal-partner');
const closePartner = document.getElementById('close-partner');

cardGulbanu.addEventListener('click', () => {
    modalGulbanu.style.display = 'flex';
});
closeGulbanu.addEventListener('click', () => {
    modalGulbanu.style.display = 'none';
});

cardPartner.addEventListener('click', () => {
    modalPartner.style.display = 'flex';
});
closePartner.addEventListener('click', () => {
    modalPartner.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === modalGulbanu) {
        modalGulbanu.style.display = 'none';
    }
    if (event.target === modalPartner) {
        modalPartner.style.display = 'none';
    }
});