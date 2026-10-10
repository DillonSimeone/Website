// Update taskbar clock in real time
function updateClock() {
  const clockEl = document.getElementById('taskbar-clock');
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  minutes = minutes < 10 ? '0' + minutes : minutes;
  
  clockEl.textContent = `${hours}:${minutes} ${ampm}`;
}
setInterval(updateClock, 1000);
updateClock();

// Draggable Window Logic
const windowHeader = document.getElementById('window-header');
const win = document.getElementById('readme-window');

let isDragging = false;
let offsetX = 0;
let offsetY = 0;

windowHeader.addEventListener('mousedown', (e) => {
  isDragging = true;
  offsetX = e.clientX - win.offsetLeft;
  offsetY = e.clientY - win.offsetTop;
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    win.style.left = `${e.clientX - offsetX}px`;
    win.style.top = `${e.clientY - offsetY}px`;
  }
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

// Window Control actions
const closeBtn = document.getElementById('btn-close');
const minBtn = document.getElementById('btn-minimize');
const maxBtn = document.getElementById('btn-maximize');
const taskbarItem = document.getElementById('taskbar-item-readme');
const readmeIcon = document.getElementById('icon-readme');

closeBtn.addEventListener('click', () => {
  win.style.display = 'none';
  taskbarItem.style.display = 'none';
});

minBtn.addEventListener('click', () => {
  win.style.display = 'none';
  taskbarItem.classList.remove('active');
});

// Click taskbar item to toggle minimize/restore
taskbarItem.addEventListener('click', () => {
  if (win.style.display === 'none' || !taskbarItem.classList.contains('active')) {
    win.style.display = 'block';
    taskbarItem.classList.add('active');
  } else {
    win.style.display = 'none';
    taskbarItem.classList.remove('active');
  }
});

// Double click icon to reopen
readmeIcon.addEventListener('dblclick', () => {
  win.style.display = 'block';
  taskbarItem.style.display = 'block';
  taskbarItem.classList.add('active');
});

// Simple click for highlights
readmeIcon.addEventListener('click', (e) => {
  e.stopPropagation();
});

document.getElementById('icon-computer').addEventListener('dblclick', () => {
  alert("C:\\> System error. My Computer disk read failure.");
});
