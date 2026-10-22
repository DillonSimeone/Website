const glitchBox = document.getElementById('glitch-interactive-box');
const signalText = document.getElementById('signal-text');

// Synthesize a digital static crackle glitch sound
function playGlitchCrackle() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 0.03; // Very short 30ms burst
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Low amplitude noise spikes
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2500, audioCtx.currentTime); // High pitch static crackle
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.015, audioCtx.currentTime); // Soft
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    noise.start();
  } catch (e) {
    // Audio Context blocked
  }
}

glitchBox.addEventListener('mousemove', (e) => {
  const rect = glitchBox.getBoundingClientRect();
  const x = e.clientX - rect.left;
  
  // Calculate offset displacement from center of card width
  const center = rect.width / 2;
  const offset = ((x - center) / center) * 12; // Max offset 12px
  
  // Split RGB text-shadow channels (Red left, Blue right)
  signalText.style.textShadow = `${-offset}px 0px 0px #ff3333, ${offset}px 0px 0px #00ffff`;
  
  // Warp text slightly
  if (Math.abs(offset) > 6) {
    signalText.style.transform = `skewX(${offset * 1.5}deg)`;
    signalText.style.color = '#fff';
    
    if (Math.random() < 0.15) {
      playGlitchCrackle();
    }
  } else {
    signalText.style.transform = 'none';
    signalText.style.color = '';
  }
});

glitchBox.addEventListener('mouseleave', () => {
  signalText.style.textShadow = 'none';
  signalText.style.transform = 'none';
  signalText.style.color = '';
});
