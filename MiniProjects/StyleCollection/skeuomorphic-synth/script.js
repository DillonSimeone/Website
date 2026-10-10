// Turn on Power LED
document.getElementById('power-led').classList.add('active');

// Web Audio API Synth Core
let audioCtx = null;
let masterVolume = 0.8;
let cutoffVal = 500; // Frequency
let resonanceVal = 3;  // Q factor

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Map notes to frequencies
const noteFreqs = {
  'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13, 'E': 329.63,
  'F': 349.23, 'F#': 369.99, 'G': 392.00, 'G#': 415.30, 'A': 440.00,
  'A#': 466.16, 'B': 493.88
};

// Play a synthesised note
function playNote(freq) {
  initAudio();
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gainNode = audioCtx.createGain();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoffVal, audioCtx.currentTime);
  filter.Q.setValueAtTime(resonanceVal, audioCtx.currentTime);
  
  gainNode.gain.setValueAtTime(masterVolume * 0.15, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
  
  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + 0.6);
}

// Keys trigger
const keys = document.querySelectorAll('.key');
keys.forEach(key => {
  const note = key.getAttribute('data-note');
  const freq = noteFreqs[note];
  
  const handleKeyTrigger = () => {
    key.classList.add('active');
    playNote(freq);
    setTimeout(() => key.classList.remove('active'), 150);
  };
  
  key.addEventListener('mousedown', handleKeyTrigger);
});

// Draggable Rotary Knobs
setupKnob('knob-cutoff', 'val-cutoff', (pct) => {
  // Map 0-100% to 100Hz - 4000Hz filter frequency
  cutoffVal = 100 + (pct * 39);
});

setupKnob('knob-res', 'val-res', (pct) => {
  // Map 0-100% to 0.1 - 15 Q factor
  resonanceVal = 0.1 + (pct * 0.149);
});

function setupKnob(id, readoutId, updateCallback) {
  const knob = document.getElementById(id);
  const readout = document.getElementById(readoutId);
  
  let startY = 0;
  let currentPct = (id === 'knob-cutoff') ? 50 : 30; // initial values matching HTML
  
  knob.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    
    const onMouseMove = (moveEvent) => {
      const diffY = startY - moveEvent.clientY; // Upward drag increases value
      let newPct = currentPct + diffY * 0.8;
      newPct = Math.max(0, Math.min(100, newPct));
      
      // Rotate knob -135deg to +135deg
      const angle = -135 + (newPct / 100) * 270;
      knob.style.transform = `rotate(${angle}deg)`;
      readout.textContent = `${Math.round(newPct)}%`;
      
      updateCallback(newPct);
      
      // Store current pct state
      currentPct = newPct;
      startY = moveEvent.clientY;
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// Draggable Volume Fader Handle
const faderHandle = document.getElementById('fader-vol');
const valVol = document.getElementById('val-vol');

faderHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  let startY = e.clientY;
  const initialBottom = parseInt(window.getComputedStyle(faderHandle).bottom) || 60;
  
  const onMouseMove = (moveEvent) => {
    const diffY = startY - moveEvent.clientY;
    let newBottom = initialBottom + diffY;
    newBottom = Math.max(0, Math.min(68, newBottom)); // Track boundary
    
    faderHandle.style.bottom = `${newBottom}px`;
    
    const pct = (newBottom / 68);
    masterVolume = pct;
    valVol.textContent = `${Math.round(pct * 100)}%`;
  };
  
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});
