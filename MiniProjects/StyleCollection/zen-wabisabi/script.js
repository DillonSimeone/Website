const canvas = document.getElementById('brush-canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('btn-clear-ink');

let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Setup Sumi brush properties
ctx.strokeStyle = '#1c1c1a';
ctx.lineWidth = 6;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Blur shadow simulates ink bleeding on wet paper
ctx.shadowColor = 'rgba(28, 28, 26, 0.45)';
ctx.shadowBlur = 4;

// Play a quiet brush rustling sound using Web Audio noise filter
function playBrushSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 0.05; // 50ms buffer
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill buffer with white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, audioCtx.currentTime); // Low rustle
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.015, audioCtx.currentTime); // Very quiet
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    noise.start();
  } catch (e) {
    // Audio Context blocked
  }
}

function draw(e) {
  if (!isDrawing) return;
  
  // Calculate coordinates relative to canvas
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.stroke();
  
  // Play subtle paint rub sound periodically
  if (Math.random() < 0.15) {
    playBrushSound();
  }
  
  lastX = x;
  lastY = y;
}

canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  playBrushSound();
});

canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

clearBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
