const playroom = document.getElementById('playroom');
const confettiBtn = document.getElementById('btn-confetti');

const colors = ['var(--pink)', 'var(--yellow)', 'var(--blue)', 'var(--purple)'];
const shapeClasses = ['m-circle', 'm-triangle', 'm-rectangle'];

// Synthesize a retro "boing" jump tone
function playBoing() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    // Slide frequency up rapidly for boing sound
    osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.12);
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {
    // Audio context blocked
  }
}

function spawnConfetti() {
  playBoing();
  
  // Spawn 3 shapes at once
  for (let i = 0; i < 3; i++) {
    const shape = document.createElement('div');
    const shapeType = shapeClasses[Math.floor(Math.random() * shapeClasses.length)];
    
    shape.className = `confetti-item ${shapeType}`;
    
    // Position within playroom boundary
    const w = playroom.clientWidth;
    const h = playroom.clientHeight;
    shape.style.left = `${Math.random() * (w - 30) + 15}px`;
    shape.style.top = `${Math.random() * (h - 30) + 15}px`;
    
    // Sizing and background colors
    const size = Math.floor(Math.random() * 20) + 10;
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    if (shapeType !== 'm-triangle') {
      shape.style.width = `${size}px`;
      shape.style.height = `${size}px`;
      shape.style.backgroundColor = color;
    }
    
    // Rotate
    shape.style.transform = `translate(-50%, -50%) rotate(${Math.floor(Math.random() * 360)}deg)`;
    
    playroom.appendChild(shape);
  }
}

confettiBtn.addEventListener('click', spawnConfetti);

// Initial spawn
spawnConfetti();
