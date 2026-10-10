const sweepLine = document.getElementById('sweep-line');
const t1 = document.getElementById('t1');
const t2 = document.getElementById('t2');
const t3 = document.getElementById('t3');
const pingBtn = document.getElementById('btn-ping');

let angle = 0;

// Synthesize a retro sonar ping sound
function playSonarPing(freq = 900) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    // Audio Context blocked
  }
}

// Target coordinate angles
// Target 1: top left (~130deg)
// Target 2: bottom right (~310deg)
// Target 3: center right (~350deg)
function checkTargets(deg) {
  // Normalize deg to 0-360
  const normalized = deg % 360;
  
  if (Math.abs(normalized - 130) < 5) {
    if (!t1.classList.contains('spotted')) {
      t1.classList.add('spotted');
      playSonarPing(1100);
      setTimeout(() => t1.classList.remove('spotted'), 800);
    }
  }
  if (Math.abs(normalized - 310) < 5) {
    if (!t2.classList.contains('spotted')) {
      t2.classList.add('spotted');
      playSonarPing(1000);
      setTimeout(() => t2.classList.remove('spotted'), 800);
    }
  }
  if (Math.abs(normalized - 350) < 5) {
    if (!t3.classList.contains('spotted')) {
      t3.classList.add('spotted');
      playSonarPing(1050);
      setTimeout(() => t3.classList.remove('spotted'), 800);
    }
  }
}

function animateRadar() {
  angle += 1.8; // Rotation speed
  sweepLine.style.transform = `rotate(${angle}deg)`;
  
  checkTargets(angle);
  
  requestAnimationFrame(animateRadar);
}

// Run scanner
requestAnimationFrame(animateRadar);

// Force manual ping button
pingBtn.addEventListener('click', () => {
  playSonarPing(1200);
});
