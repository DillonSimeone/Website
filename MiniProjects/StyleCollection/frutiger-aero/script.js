const bubbleDeck = document.getElementById('bubble-deck');
const spawnBtn = document.getElementById('btn-spawn-bubble');

// Synthesize a high-pitched water pop sound
function playWaterPop() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    // Frequency slides up rapidly
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2200, audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    // Audio Context blocked
  }
}

function spawnBubble() {
  const bubble = document.createElement('div');
  bubble.className = 'aero-sphere';
  
  // Random horizontal position within deck width (width is ~310px, minus bubble width 40)
  const deckWidth = bubbleDeck.clientWidth;
  const leftPos = Math.random() * (deckWidth - 45);
  bubble.style.left = `${leftPos}px`;
  
  bubbleDeck.appendChild(bubble);
  
  let currentBottom = -40;
  const speed = 1 + Math.random() * 1.5;
  
  function animateBubble() {
    currentBottom += speed;
    bubble.style.bottom = `${currentBottom}px`;
    
    if (currentBottom > 165) {
      // Remove if it floats out
      bubble.remove();
    } else {
      requestAnimationFrame(animateBubble);
    }
  }
  
  requestAnimationFrame(animateBubble);
  
  // Pop trigger
  bubble.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    playWaterPop();
    
    // Play scale up expansion transition
    bubble.style.transform = 'scale(1.4)';
    bubble.style.opacity = '0';
    
    setTimeout(() => {
      bubble.remove();
    }, 100);
  });
}

spawnBtn.addEventListener('click', () => {
  spawnBubble();
});

// Spawn a few default bubbles initially
setTimeout(spawnBubble, 400);
setTimeout(spawnBubble, 1000);
