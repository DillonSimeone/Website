const canvas = document.getElementById('vine-canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('btn-clear-vines');

let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Setup Art Nouveau golden vine brush
ctx.strokeStyle = '#e5c158';
ctx.lineWidth = 1.5;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Soft gold glow
ctx.shadowColor = 'rgba(229, 193, 88, 0.4)';
ctx.shadowBlur = 3;

// Synthesize a soft wind gust sweeping chime using Web Audio
function playWindSweep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    // Frequency sweeps up and down gently
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 0.25);
    
    gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {
    // Audio Context blocked
  }
}

function draw(e) {
  if (!isDrawing) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Draw whiplash curve using quadratic curve paths
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  // Control point creates a natural S-curve sway
  const ctrlX = (lastX + x) / 2 + (Math.random() * 10 - 5);
  const ctrlY = (lastY + y) / 2 - 10;
  ctx.quadraticCurveTo(ctrlX, ctrlY, x, y);
  ctx.stroke();
  
  if (Math.random() < 0.1) {
    playWindSweep();
  }
  
  lastX = x;
  lastY = y;
}

canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  playWindSweep();
});

canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

clearBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
