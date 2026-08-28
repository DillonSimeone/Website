const tarotCard = document.getElementById('tarot-card-trigger');
const drawBtn = document.getElementById('btn-draw');
const tarotSymbol = document.getElementById('tarot-symbol');
const tarotName = document.getElementById('tarot-name');

const deck = [
  { symbol: '☉', name: 'THE SUN' },
  { symbol: '☾', name: 'THE MOON' },
  { symbol: '★', name: 'THE STAR' },
  { symbol: '♃', name: 'JUPITER' },
  { symbol: '🪐', name: 'SATURN' },
  { symbol: '☄', name: 'THE COMET' }
];

// Synthesize a high crystal bell chime
function playChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play multiple overlapping tones to simulate a metallic bell chime
    const frequencies = [880, 1100, 1320];
    
    frequencies.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      
      gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
      // Stagger decay durations
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5 + (i * 0.2));
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5 + (i * 0.2));
    });
  } catch (e) {
    // Web Audio blocked
  }
}

function drawCard() {
  playChime();
  
  // Unflip first
  tarotCard.classList.remove('flipped');
  
  setTimeout(() => {
    // Pick random card
    const card = deck[Math.floor(Math.random() * deck.length)];
    tarotSymbol.textContent = card.symbol;
    tarotName.textContent = card.name;
    
    // Flip over
    tarotCard.classList.add('flipped');
  }, 200);
}

drawBtn.addEventListener('click', drawCard);
tarotCard.addEventListener('click', drawCard);

// Draw initial card
drawCard();
