const canvas = document.getElementById('shape-canvas');
const clearBtn = document.getElementById('btn-clear-canvas');

const shapeClasses = ['c-circle', 'c-square', 'c-triangle', 'c-line'];

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Create shape element
  const shape = document.createElement('div');
  const type = shapeClasses[Math.floor(Math.random() * shapeClasses.length)];
  
  shape.classList.add('canvas-shape', type);
  shape.style.left = `${x}px`;
  shape.style.top = `${y}px`;
  
  // Random sizing adjustments
  const size = Math.floor(Math.random() * 30) + 15;
  
  if (type === 'c-circle' || type === 'c-square') {
    shape.style.width = `${size}px`;
    shape.style.height = `${size}px`;
  } else if (type === 'c-line') {
    shape.style.width = `${size * 2}px`;
    shape.style.transform = `translate(-50%, -50%) rotate(${Math.floor(Math.random() * 360)}deg)`;
  }
  
  canvas.appendChild(shape);
});

clearBtn.addEventListener('click', () => {
  canvas.innerHTML = '';
});
