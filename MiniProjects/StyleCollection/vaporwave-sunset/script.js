const dragPad = document.getElementById('drag-pad');
const floorGrid = document.getElementById('floor-grid');

let isDragging = false;
let startX = 0;
let currentOffset = 0;

// Synthesize a low retro synth sweep chime
function playSynthChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, audioCtx.currentTime); // Low A note
    osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch (e) {
    // Audio Context blocked
  }
}

dragPad.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX;
  playSynthChime();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  
  const diffX = e.clientX - startX;
  currentOffset += diffX * 0.5; // Drag speed multiplier
  
  // Update background offset of grid floor
  floorGrid.style.backgroundPosition = `${currentOffset}px 0px`;
  
  startX = e.clientX;
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});
