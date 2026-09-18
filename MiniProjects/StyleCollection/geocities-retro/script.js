const hitCountEl = document.getElementById('hit-count');
const modemBtn = document.getElementById('btn-dialup');

let hits = 482;

// Synthesize a dial-up modem sound sequence using Web Audio API
function playDialupModem() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Step 1: Dial tone (overlapping 350Hz + 440Hz)
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc1.frequency.value = 350;
    osc2.frequency.value = 440;
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.0, audioCtx.currentTime + 0.6); // Cut after 600ms
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc1.start();
    osc2.start();
    osc1.stop(audioCtx.currentTime + 0.6);
    osc2.stop(audioCtx.currentTime + 0.6);
    
    // Step 2: High handshaking beep at 1.0s
    setTimeout(() => {
      const beepOsc = audioCtx.createOscillator();
      const beepGain = audioCtx.createGain();
      
      beepOsc.type = 'sine';
      beepOsc.frequency.setValueAtTime(2200, audioCtx.currentTime); // High pitch whistle
      
      beepGain.gain.setValueAtTime(0.03, audioCtx.currentTime);
      beepGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      beepOsc.connect(beepGain);
      beepGain.connect(audioCtx.destination);
      
      beepOsc.start();
      beepOsc.stop(audioCtx.currentTime + 0.4);
    }, 800);
    
    // Step 3: Screeching noise burst at 1.4s
    setTimeout(() => {
      const bufferSize = audioCtx.sampleRate * 0.5; // 500ms screech
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.02, audioCtx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      
      noise.start();
    }, 1300);
    
  } catch (e) {
    // Audio Context blocked
  }
}

modemBtn.addEventListener('click', () => {
  // Play modem sounds
  playDialupModem();
  
  // Increment hits count
  hits++;
  const padded = String(hits).padStart(6, '0');
  hitCountEl.textContent = padded;
});
