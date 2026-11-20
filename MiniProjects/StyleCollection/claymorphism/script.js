let bubbleSize = 90;
let bubbleCount = 0;
const bubble = document.getElementById('inflatable-bubble');
const countDisplay = document.getElementById('bubble-count');
const resetBtn = document.getElementById('btn-reset');
const softBtn = document.getElementById('btn-soft');

// Synthesize a soft pop sound using Web Audio API
function playPopSound(frequency = 400, type = 'sine', duration = 0.08) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + duration);
    
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.log('Audio Context blocked or not supported');
  }
}

// Inflatable Bubble Game
bubble.addEventListener('click', () => {
  bubbleCount++;
  bubbleSize += 10;
  
  if (bubbleSize > 180) {
    // POP!
    playPopSound(150, 'triangle', 0.25);
    bubble.style.transition = 'none';
    bubble.style.transform = 'scale(0)';
    bubble.style.opacity = '0';
    countDisplay.textContent = '💥';
    
    setTimeout(() => {
      resetBubble();
    }, 1000);
  } else {
    playPopSound(300 + (bubbleCount * 20), 'sine', 0.08);
    bubble.style.width = `${bubbleSize}px`;
    bubble.style.height = `${bubbleSize}px`;
    countDisplay.textContent = bubbleCount;
  }
});

function resetBubble() {
  bubbleSize = 90;
  bubbleCount = 0;
  bubble.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  bubble.style.width = `${bubbleSize}px`;
  bubble.style.height = `${bubbleSize}px`;
  bubble.style.transform = 'scale(1)';
  bubble.style.opacity = '1';
  countDisplay.textContent = bubbleCount;
}

resetBtn.addEventListener('click', () => {
  playPopSound(250, 'sawtooth', 0.1);
  resetBubble();
});

softBtn.addEventListener('click', () => {
  playPopSound(500, 'sine', 0.05);
  softBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    softBtn.style.transform = 'none';
  }, 100);
});
