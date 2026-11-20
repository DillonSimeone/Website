// Turn on flicker class by default
document.body.classList.add('flicker-active');

const shellInput = document.getElementById('shell-input');
const shellLogs = document.getElementById('shell-logs');
const toggleScanlinesBtn = document.getElementById('toggle-scanlines');
const toggleFlickerBtn = document.getElementById('toggle-flicker');

// 1-bit style synth sound
function playSynthBeep(freq = 800, duration = 0.03) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'square'; // Raw retro sound
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Audio context not initialized or blocked
  }
}

// Shell logs line output helper
function addLogLine(text) {
  const p = document.createElement('p');
  p.className = 'log-line';
  p.textContent = text;
  shellLogs.appendChild(p);
  shellLogs.scrollTop = shellLogs.scrollHeight;
  playSynthBeep(600, 0.04);
}

// Typing sound
shellInput.addEventListener('input', () => {
  playSynthBeep(1200, 0.015);
});

// Shell command inputs
shellInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const command = shellInput.value.trim();
    if (!command) return;
    
    addLogLine(`A:\\>${command}`);
    shellInput.value = '';
    
    setTimeout(() => {
      const cmdLower = command.toLowerCase();
      if (cmdLower === 'help') {
        addLogLine('COMMANDS: HELP, SYSCHECK, CLEAR, BEEP, DIR');
      } else if (cmdLower === 'syscheck') {
        addLogLine('CHECKING SECTORS...');
        setTimeout(() => addLogLine('ALL SECTORS OK. 640K OK.'), 200);
      } else if (cmdLower === 'beep') {
        playSynthBeep(440, 0.4);
        addLogLine('BEEP CONSOLE TRIG.');
      } else if (cmdLower === 'clear') {
        shellLogs.innerHTML = '';
      } else if (cmdLower === 'dir') {
        addLogLine('VOLUME IN DRIVE A HAS NO LABEL.');
        addLogLine('DIRECTORY OF A:\\');
        addLogLine('SYSTEM     EXE     128KB');
        addLogLine('CONFIG     SYS       1KB');
      } else {
        addLogLine(`BAD COMMAND OR FILENAME: "${command}"`);
      }
    }, 150);
  }
});

// Display Control buttons
toggleScanlinesBtn.addEventListener('click', () => {
  playSynthBeep(800, 0.05);
  document.body.classList.toggle('scanlines-disabled');
});

toggleFlickerBtn.addEventListener('click', () => {
  playSynthBeep(800, 0.05);
  document.body.classList.toggle('flicker-active');
});

// Keep terminal focused
document.addEventListener('click', () => {
  shellInput.focus();
});
