const textInput = document.getElementById('typewriter-input');
const printBtn = document.getElementById('btn-print');
const paperScreen = document.getElementById('paper-screen');

let printTimeout = null;

// Mechanical typewriter keys click sound synth
function playKeyClick() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Gritty bandpass click noise
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250 + Math.random() * 100, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.03);
  } catch (e) {
    // Audio context blocked
  }
}

// Typewriter carriage bell sound synth
function playBell() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Audio Context blocked
  }
}

function printMemo(text, index = 0) {
  if (index === 0) {
    paperScreen.textContent = 'MEMO: ';
  }
  
  if (index < text.length) {
    paperScreen.textContent += text[index];
    playKeyClick();
    
    printTimeout = setTimeout(() => {
      printMemo(text, index + 1);
    }, 80); // Typist print speed
  } else {
    // End of line carriage bell!
    setTimeout(playBell, 150);
  }
}

printBtn.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (!text) return;
  
  clearTimeout(printTimeout);
  textInput.value = '';
  printMemo(text);
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    printBtn.click();
  }
});
