document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('chalk-canvas');
  const ctx = canvas.getContext('2d');
  const chalkTools = document.querySelectorAll('.chalk-tool');
  const eraseBtn = document.getElementById('btn-erase');
  const chalkNote = document.getElementById('chalk-note');

  let drawing = false;
  let chalkColor = '#ffffff';
  let lastX = 0;
  let lastY = 0;

  // Initialize canvas size
  function resizeCanvas() {
    // Save current content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    // Resize
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Restore content
    ctx.drawImage(tempCanvas, 0, 0);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Setup drawing styles
  function setupChalk() {
    ctx.strokeStyle = chalkColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // Draw chalk effect
  function draw(e) {
    if (!drawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);

    // Chalk texture simulation: draw slightly transparent main stroke,
    // plus some dusty spray dots around the cursor path
    ctx.globalAlpha = 0.6;
    ctx.stroke();

    // Spray chalk dust
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = chalkColor;
    for (let i = 0; i < 5; i++) {
      const offsetX = (Math.random() - 0.5) * 8;
      const offsetY = (Math.random() - 0.5) * 8;
      ctx.fillRect(x + offsetX, y + offsetY, 1.5, 1.5);
    }

    [lastX, lastY] = [x, y];
  }

  function startDrawing(e) {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = ((e.clientX || e.touches[0].clientX) - rect.left);
    lastY = ((e.clientY || e.touches[0].clientY) - rect.top);
    
    // Hide overlay instructions
    if (chalkNote) {
      chalkNote.style.opacity = 0;
      setTimeout(() => chalkNote.remove(), 500);
    }

    setupChalk();
  }

  function stopDrawing() {
    drawing = false;
  }

  // Mouse & Touch bindings
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrawing(e);
  });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
  });
  canvas.addEventListener('touchend', stopDrawing);

  // Color Swapping
  chalkTools.forEach(tool => {
    tool.addEventListener('click', (e) => {
      chalkTools.forEach(t => t.classList.remove('active'));
      tool.classList.add('active');
      chalkColor = tool.getAttribute('data-color');
    });
  });

  // Erase All
  eraseBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
});
