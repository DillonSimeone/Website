const toggleBtn = document.getElementById('btn-toggle-sidenotes');
const articleBody = document.getElementById('article-body');

// Enable sidenotes by default
articleBody.classList.add('has-sidenotes');

toggleBtn.addEventListener('click', () => {
  articleBody.classList.toggle('has-sidenotes');
  
  // Synthesize a very subtle select click
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.03);
  } catch (e) {
    // Audio Context blocked
  }
});
