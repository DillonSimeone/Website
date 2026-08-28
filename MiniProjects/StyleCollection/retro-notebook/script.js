const canvas = document.getElementById('sketch-canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('btn-clear-sketch');

let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Setup pencil charcoal brush
ctx.strokeStyle = '#55555d';
ctx.lineWidth = 1.8;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Play a quiet pencil rustling sound using Web Audio noise filter
function playPencilSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 0.04;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600; // Scratchy sound
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.008, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    
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
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.stroke();
  
  if (Math.random() < 0.25) {
    playPencilSound();
  }
  
  lastX = x;
  lastY = y;
}

canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  playPencilSound();
});

canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

clearBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
