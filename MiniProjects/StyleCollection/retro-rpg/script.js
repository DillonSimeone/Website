const btnNext = document.getElementById('btn-next');
const dialogueScreen = document.getElementById('dialogue-screen');
const avatarFace = document.getElementById('avatar-face');
const charName = document.getElementById('char-name');

const dialogs = [
  { name: 'MAGE MERLIN', face: '🧙‍♂️', text: 'Hello traveler... I have been waiting for your arrival.' },
  { name: 'ROGUE LYRA', face: '🧝‍♀️', text: 'Wait! Do not trust the old man. He is hiding something...' },
  { name: 'KNIGHT ARTHAS', face: '🛡️', text: 'Quiet both of you! The path forward is filled with danger.' },
  { name: 'MAGE MERLIN', face: '🧙‍♂️', text: 'A dark storm gathers in the east. Prepare your gear.' }
];

let currentIdx = 0;
let typingTimeout = null;

function playBlip() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800 + Math.random() * 200, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
  } catch (e) {
    // Web Audio blocked
  }
}

function typeText(text, index = 0) {
  if (index === 0) {
    dialogueScreen.textContent = '';
  }
  
  if (index < text.length) {
    dialogueScreen.textContent += text[index];
    playBlip();
    typingTimeout = setTimeout(() => {
      typeText(text, index + 1);
    }, 45); // milliseconds per letter
  }
}

btnNext.addEventListener('click', () => {
  clearTimeout(typingTimeout);
  currentIdx = (currentIdx + 1) % dialogs.length;
  
  const d = dialogs[currentIdx];
  charName.textContent = d.name;
  avatarFace.textContent = d.face;
  typeText(d.text);
});

// Type out the first line automatically
typeText(dialogs[0].text);
