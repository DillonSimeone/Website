let audioCtx = null;
let synthInterval = null;
let isPlaying = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Retro 80s Synth loop sequencer
function startSynthLoop() {
  initAudio();
  if (!audioCtx) return;

  const notes = [
    293.66, 329.63, 392.00, 440.00, // D4, E4, G4, A4
    440.00, 392.00, 329.63, 293.66  // A4, G4, E4, D4
  ];
  let noteIndex = 0;

  synthInterval = setInterval(() => {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    
    // Melodic Synth Note
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle'; // Smooth retro sound
    osc.frequency.setValueAtTime(notes[noteIndex], now);
    
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    // Retro bass drum tick
    if (noteIndex % 2 === 0) {
      const kickOsc = audioCtx.createOscillator();
      const kickGain = audioCtx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(120, now);
      kickOsc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
      
      kickGain.gain.setValueAtTime(0.15, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      
      kickOsc.connect(kickGain);
      kickGain.connect(audioCtx.destination);
      kickOsc.start(now);
      kickOsc.stop(now + 0.15);
    }

    noteIndex = (noteIndex + 1) % notes.length;
  }, 300); // 100 bpm arpeggio
}

function stopSynthLoop() {
  if (synthInterval) {
    clearInterval(synthInterval);
    synthInterval = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const wheels = document.querySelector('.cassette-wheels');
  const playBtn = document.getElementById('btn-play');
  const playerMsg = document.getElementById('player-msg');

  playBtn.addEventListener('click', () => {
    if (!isPlaying) {
      // Play
      isPlaying = true;
      wheels.classList.add('playing');
      playBtn.textContent = 'STOP TAPE';
      playerMsg.textContent = 'SEQ ACTIVE: SYNTHESIZING FM-LOOPS';
      playerMsg.style.color = '#ff758f';
      startSynthLoop();
    } else {
      // Stop
      isPlaying = false;
      wheels.classList.remove('playing');
      playBtn.textContent = 'PLAY TAPE';
      playerMsg.textContent = 'TAP PLAY TO SPIN TAPE & SYNTHESIZE BEATS';
      playerMsg.style.color = '#7b6294';
      stopSynthLoop();
    }
  });
});
