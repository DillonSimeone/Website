let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Synthesize a paper tearing sound using Noise and Bandpass sweep
function playTearSound() {
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const duration = 0.45;

  // Generate white noise buffer
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  // Audio Node chain
  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(3, now);
  filter.frequency.setValueAtTime(800, now);
  // Sweep frequency down to mimic tearing pitch decay
  filter.frequency.exponentialRampToValueAtTime(150, now + duration);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.18, now);
  // Crackling envelope spikes
  for (let t = 0; t < duration; t += 0.03) {
    gain.gain.setValueAtTime((Math.random() * 0.12) + 0.06, now + t);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noiseNode.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  noiseNode.start(now);
}

document.addEventListener('DOMContentLoaded', () => {
  const stub = document.getElementById('ticket-stub');
  const tearBtn = document.getElementById('btn-tear');

  tearBtn.addEventListener('click', () => {
    // Play sound
    playTearSound();

    // Trigger sliding fall animation
    stub.classList.add('torn');

    // Change button text
    tearBtn.textContent = 'CLAIMED';
    tearBtn.style.background = '#888';
    tearBtn.disabled = true;
  });
});
