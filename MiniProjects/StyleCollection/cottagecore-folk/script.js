const gardenPatch = document.getElementById('garden-patch');

const flowers = ['🌻', '🌷', '🌹', '🌸', '🌼', '🌿'];

// Synthesize a soft organic chime tone
function playPlantChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    // Gentle warm chime frequency
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5 note
    
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    // Audio Context blocked
  }
}

gardenPatch.addEventListener('click', (e) => {
  const rect = gardenPatch.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  playPlantChime();
  
  // Create flower element
  const flower = document.createElement('div');
  flower.className = 'planted-flower';
  flower.textContent = flowers[Math.floor(Math.random() * flowers.length)];
  
  flower.style.left = `${x}px`;
  flower.style.top = `${y}px`;
  
  gardenPatch.appendChild(flower);
  
  // Trigger transition reflow
  flower.offsetHeight;
  
  // Bloom!
  flower.classList.add('bloomed');
  
  // Automatically decay/fade flower after a while to keep the garden clean
  setTimeout(() => {
    flower.style.opacity = '0';
    setTimeout(() => {
      flower.remove();
    }, 600);
  }, 4000);
});
