const valveBtn = document.getElementById('btn-valve');
const needle = document.getElementById('gauge-needle');
const gearLg = document.getElementById('gear-lg');
const gearSm = document.getElementById('gear-sm');

let largeRotation = 0;
let smallRotation = 0;
let isSpinning = false;
let spinSpeed = 0;

// Synthesize a steam release hiss sound using Web Audio white noise
function playSteamHiss() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 0.8; // 800ms buffer
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Populate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    
    // High-pass filter for hiss sound
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, audioCtx.currentTime);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    
    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    noiseSource.start();
  } catch (e) {
    // Audio Context blocked
  }
}

function updateEngine() {
  if (spinSpeed > 0.05) {
    largeRotation += spinSpeed;
    smallRotation -= spinSpeed * 1.5; // smaller cog rotates faster in opposite direction
    
    gearLg.style.transform = `rotate(${largeRotation}deg)`;
    gearSm.style.transform = `rotate(${smallRotation}deg)`;
    
    // Decelerate cogs
    spinSpeed *= 0.975;
    requestAnimationFrame(updateEngine);
  } else {
    isSpinning = false;
    spinSpeed = 0;
    
    // Return needle to rest
    needle.style.transform = 'translateX(-50%) rotate(-60deg)';
  }
}

valveBtn.addEventListener('click', () => {
  if (isSpinning) return;
  
  isSpinning = true;
  spinSpeed = 15; // Initial spin speed
  
  playSteamHiss();
  
  // Swing needle to high pressure (60deg)
  needle.style.transform = 'translateX(-50%) rotate(55deg)';
  
  updateEngine();
});
