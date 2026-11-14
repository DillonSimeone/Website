// Theme switching
const themeSelect = document.getElementById('neon-color');
themeSelect.addEventListener('change', (e) => {
  document.body.className = ''; // Reset
  if (e.target.value === 'green-amber') {
    document.body.classList.add('theme-green-amber');
  } else if (e.target.value === 'yellow-purple') {
    document.body.classList.add('theme-yellow-purple');
  }
});

// Glitch injection
const glitchTitle = document.querySelector('.glitch');
const triggerBtn = document.getElementById('trigger-glitch');

triggerBtn.addEventListener('click', () => {
  glitchTitle.style.animation = 'none';
  // Trigger reflow
  glitchTitle.offsetHeight;
  
  // Apply visual shake/glitch effect briefly
  glitchTitle.style.transform = `skew(${Math.random() * 20 - 10}deg) translate(${Math.random() * 10 - 5}px)`;
  glitchTitle.style.color = '#00f0ff';
  
  setTimeout(() => {
    glitchTitle.style.transform = 'none';
    glitchTitle.style.color = '';
  }, 150);
  
  // Add a log to console
  addConsoleLine('WARNING: system stability anomaly injected.');
});

// Terminal Console logic
const termInput = document.getElementById('term-input');
const termScreen = document.getElementById('terminal-screen');

function addConsoleLine(text, isError = false) {
  const p = document.createElement('p');
  p.className = 'terminal-line';
  if (isError) p.style.color = 'var(--neon-pink)';
  p.innerHTML = `<span class="prompt">></span> ${text}`;
  termScreen.appendChild(p);
  termScreen.scrollTop = termScreen.scrollHeight;
}

termInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = termInput.value.trim();
    if (!cmd) return;
    
    addConsoleLine(cmd);
    termInput.value = '';
    
    // Simple command handling
    setTimeout(() => {
      const lowerCmd = cmd.toLowerCase();
      if (lowerCmd === 'help') {
        addConsoleLine('available: clear | status | ping | access_grid');
      } else if (lowerCmd === 'clear') {
        termScreen.innerHTML = '';
      } else if (lowerCmd === 'status') {
        addConsoleLine('CORES: 8/8 ACTIVE // SIGNAL: STRONG // DECK: STABLE');
      } else if (lowerCmd === 'ping') {
        addConsoleLine('pong! connection: 12ms');
      } else if (lowerCmd === 'access_grid') {
        addConsoleLine('ACCESS GRANTED. Grid pulse initialized.');
      } else {
        addConsoleLine(`command not found: "${cmd}". type "help" for options.`, true);
      }
    }, 200);
  }
});
