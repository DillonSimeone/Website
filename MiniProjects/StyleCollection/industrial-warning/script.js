let audioCtx = null;
let sirenInterval = null;
let isAlarming = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Emergency Alarm Pulsing sound generator
function startSirenSound() {
  initAudio();
  if (!audioCtx) return;

  let toggle = true;

  sirenInterval = setInterval(() => {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    // Pulses between 600Hz and 800Hz
    const targetFreq = toggle ? 750 : 550;
    osc.frequency.setValueAtTime(targetFreq, now);
    
    // Sweep pitch down slightly during pulse
    osc.frequency.exponentialRampToValueAtTime(targetFreq - 100, now + 0.35);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.38);

    toggle = !toggle;
  }, 400);
}

function stopSirenSound() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sirenBtn = document.getElementById('btn-siren');
  const sirenOverlay = document.getElementById('siren-overlay');
  const body = document.body;

  sirenBtn.addEventListener('click', () => {
    if (!isAlarming) {
      // Turn Alarm On
      isAlarming = true;
      sirenOverlay.classList.add('flashing');
      body.classList.add('alarm-active');
      sirenBtn.textContent = 'DISABLE ALARM';
      sirenBtn.style.backgroundColor = '#fcb900';
      sirenBtn.style.color = '#000';
      startSirenSound();
    } else {
      // Turn Alarm Off
      isAlarming = false;
      sirenOverlay.classList.remove('flashing');
      body.classList.remove('alarm-active');
      sirenBtn.textContent = 'ACTIVATE ALARM';
      sirenBtn.style.backgroundColor = '#ff3333';
      sirenBtn.style.color = '#fff';
      stopSirenSound();
    }
  });
});
