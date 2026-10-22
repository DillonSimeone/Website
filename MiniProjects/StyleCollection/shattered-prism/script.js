const lightBg = document.getElementById('light-bg');
const glassCard = document.getElementById('prism-glass');
const glassGlare = document.querySelector('.glass-glare');

// Synthesize a high glass chime sound
function playGlassChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    // Audio Context blocked
  }
}

glassCard.addEventListener('mousemove', (e) => {
  const rect = glassCard.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  
  // Shift background lights slightly
  lightBg.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255, 0, 255, 0.2), rgba(0, 240, 255, 0.2), #06060a 65%)`;
  
  // Glare refraction rotation
  glassGlare.style.transform = `translate(${x - 50}%, ${y - 50}%)`;
  
  if (Math.random() < 0.08) {
    playGlassChime();
  }
});

glassCard.addEventListener('mouseleave', () => {
  lightBg.style.background = `radial-gradient(circle at 50% 50%, rgba(255, 0, 255, 0.15), rgba(0, 240, 255, 0.15), #06060a 65%)`;
  glassGlare.style.transform = 'none';
});
