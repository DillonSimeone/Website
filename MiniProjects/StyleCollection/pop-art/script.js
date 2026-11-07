const playroom = document.getElementById('playroom');

const words = ['POW!', 'WHAM!', 'BAM!', 'BOOM!', 'SMASH!'];
const colors = ['#ff3333', '#00cc55', '#ff00ff', '#00f0ff'];

// Synthesize a retro drum punch impact sound
function playPunchSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Low frequency pitch drop for thud punch
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.12);
    
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {
    // Audio Context blocked
  }
}

playroom.addEventListener('click', (e) => {
  const rect = playroom.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  playPunchSound();
  
  // Create comic text burst element
  const stamp = document.createElement('div');
  stamp.className = 'action-burst';
  stamp.textContent = words[Math.floor(Math.random() * words.length)];
  
  // Sizing and positioning
  stamp.style.left = `${x}px`;
  stamp.style.top = `${y}px`;
  
  const randColor = colors[Math.floor(Math.random() * colors.length)];
  stamp.style.backgroundColor = randColor;
  
  // Random rotation angle
  const angle = Math.floor(Math.random() * 40) - 20; // -20deg to +20deg
  stamp.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  
  playroom.appendChild(stamp);
  
  // Remove stamp after a short time
  setTimeout(() => {
    stamp.remove();
  }, 1200);
});
