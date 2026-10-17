const slider = document.getElementById('scale-slider');
const wireBox = document.getElementById('wire-box');
const dimW = document.getElementById('dim-w-label');
const dimH = document.getElementById('dim-h-label');

// Synthesize a brief digital click beep
function playCadBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.02);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.02);
  } catch (e) {
    // Audio Context blocked
  }
}

slider.addEventListener('input', (e) => {
  const size = e.target.value;
  
  // Set dimensions
  wireBox.style.width = `${size}px`;
  wireBox.style.height = `${size}px`;
  
  // Update labels
  dimW.textContent = `w: ${size}px`;
  dimH.textContent = `h: ${size}px`;
  
  // Play click
  if (Math.random() < 0.3) {
    playCadBeep();
  }
});
