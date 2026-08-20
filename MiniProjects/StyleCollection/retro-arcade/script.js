let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Bleeps & Bloops Synthesizer Functions
function playSound(type) {
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;

  if (type === 'coin') {
    // Two-tone ascending bleep
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.setValueAtTime(440, now + 0.1);
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.35);
  } else if (type === 'jump') {
    // Rapid sweep up
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'fire') {
    // Noise/Sweep down
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'start') {
    // Arpeggio
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.08, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.15);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.15);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const scoreValEl = document.getElementById('score-val');
  const statusDisplay = document.getElementById('status-display');
  const joystick = document.getElementById('joystick');
  
  let score = 4200;

  // Buttons Event Listeners
  document.getElementById('btn-coin').addEventListener('click', () => {
    playSound('coin');
    score += 100;
    scoreValEl.textContent = String(score).padStart(6, '0');
    statusDisplay.textContent = 'COIN ACCEPTED';
    statusDisplay.style.color = '#ffff00';
    setTimeout(() => {
      statusDisplay.textContent = 'PRESS START';
      statusDisplay.style.color = '#33ff33';
    }, 1000);
  });

  document.getElementById('btn-fire').addEventListener('click', () => {
    playSound('fire');
    score += 10;
    scoreValEl.textContent = String(score).padStart(6, '0');
    statusDisplay.textContent = 'PEW PEW!';
    statusDisplay.style.color = '#ff00ff';
    tiltJoystick('left');
  });

  document.getElementById('btn-jump').addEventListener('click', () => {
    playSound('jump');
    score += 50;
    scoreValEl.textContent = String(score).padStart(6, '0');
    statusDisplay.textContent = 'JUMP!';
    statusDisplay.style.color = '#00ffff';
    tiltJoystick('up');
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    playSound('start');
    statusDisplay.textContent = 'GAME START!';
    statusDisplay.style.color = '#33ff33';
    tiltJoystick('down');
  });

  // Joystick tilt logic
  function tiltJoystick(dir) {
    const tilts = {
      left: 'rotate(-15deg)',
      right: 'rotate(15deg)',
      up: 'scaleY(0.85) translateY(-5px)',
      down: 'scaleY(0.85) translateY(5px)'
    };
    joystick.style.transform = tilts[dir] || 'rotate(0deg)';
    setTimeout(() => {
      joystick.style.transform = 'rotate(0deg)';
    }, 150);
  }

  // Tilt joystick randomly when hovering or clicking the stick
  joystick.addEventListener('mousedown', () => {
    const dirs = ['left', 'right', 'up', 'down'];
    const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
    tiltJoystick(randomDir);
    playSound('jump');
  });
});
