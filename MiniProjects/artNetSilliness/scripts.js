// Art-Net Silliness - Gothic Comic Visualizer & Interactive Controller
document.addEventListener('DOMContentLoaded', () => {
  // Canvas Setup
  const canvas = document.getElementById('artnetCanvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight || 240;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Visualizer State (matching Python audio_artnet.py backend settings)
  let currentAnimation = 'spectrum';
  let gain = 5.0;
  let smoothing = 0.7;
  let threshold = 0.001;
  let isAudioActive = false;
  let audioCtx = null;
  let analyser = null;
  let microphoneStream = null;

  // Internal Wave Buffer & Fire Buffer for exact Python simulation
  const numLEDs = 128;
  let waveBuffer = new Array(numLEDs).fill(0).map(() => [0, 0, 0]);
  let fireBuffer = new Array(numLEDs).fill(0);
  let hueTracker = 0;

  // Audio Processing Elements
  const toggleAudioBtn = document.getElementById('toggleAudioBtn');
  const gainInput = document.getElementById('gainInput');
  const gainVal = document.getElementById('gainVal');
  const thresholdInput = document.getElementById('thresholdInput');
  const thresholdVal = document.getElementById('thresholdVal');
  const modeButtons = document.querySelectorAll('.mode-btn');

  // Slider Listeners
  if (gainInput) {
    gainInput.addEventListener('input', (e) => {
      gain = parseFloat(e.target.value);
      if (gainVal) gainVal.textContent = gain.toFixed(1);
    });
  }

  if (thresholdInput) {
    thresholdInput.addEventListener('input', (e) => {
      threshold = parseFloat(e.target.value);
      if (thresholdVal) thresholdVal.textContent = threshold.toFixed(3);
    });
  }

  // Animation Mode Selection
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentAnimation = btn.getAttribute('data-mode');
      createComicSFX(btn, currentAnimation.toUpperCase() + '!');
    });
  });

  // Audio Toggle (Mic Input or Synthetic Synth)
  if (toggleAudioBtn) {
    toggleAudioBtn.addEventListener('click', async () => {
      if (!isAudioActive) {
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          microphoneStream = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          microphoneStream.connect(analyser);

          isAudioActive = true;
          toggleAudioBtn.classList.add('active');
          toggleAudioBtn.innerHTML = '🎤 MIC LIVE (LISTENING...)';
          createComicSFX(toggleAudioBtn, 'AUDIO LISTEN!');
        } catch (err) {
          console.warn('Microphone access denied or unavailable. Using synthetic audio pulse.', err);
          isAudioActive = true;
          toggleAudioBtn.classList.add('active');
          toggleAudioBtn.innerHTML = '⚡ SYNTH PULSE ACTIVE';
          createComicSFX(toggleAudioBtn, 'SYNTH BZZZT!');
        }
      } else {
        isAudioActive = false;
        if (microphoneStream && microphoneStream.mediaStream) {
          microphoneStream.mediaStream.getTracks().forEach((t) => t.stop());
        }
        if (audioCtx) {
          audioCtx.close();
        }
        toggleAudioBtn.classList.remove('active');
        toggleAudioBtn.innerHTML = '🎤 ENABLE LIVE MIC AUDIO';
      }
    });
  }

  // Comic Sound Effect Generator
  function createComicSFX(element, text) {
    const sfx = document.createElement('div');
    sfx.className = 'sfx-badge';
    sfx.textContent = text;
    sfx.style.position = 'fixed';
    
    const rect = element.getBoundingClientRect();
    sfx.style.left = `${rect.left + rect.width / 2 - 40}px`;
    sfx.style.top = `${rect.top - 40}px`;
    sfx.style.zIndex = '999';
    sfx.style.pointerEvents = 'none';
    sfx.style.transition = 'all 0.6s cubic-bezier(0.18, 0.89, 0.32, 1.28)';

    document.body.appendChild(sfx);

    setTimeout(() => {
      sfx.style.transform = `translateY(-30px) rotate(${Math.random() * 20 - 10}deg) scale(1.3)`;
      sfx.style.opacity = '0';
    }, 50);

    setTimeout(() => {
      sfx.remove();
    }, 700);
  }

  // Render Visualizer implementing Python audio_artnet.py exact algorithms
  let time = 0;

  function renderVisualizer() {
    requestAnimationFrame(renderVisualizer);
    time += 0.03;
    hueTracker = (hueTracker + 0.005) % 1.0;

    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const dataArray = new Uint8Array(64);
    let avgAudio = 0;
    let bassPower = 0;
    let treblePower = 0;

    if (isAudioActive && analyser) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      avgAudio = (sum / dataArray.length / 255.0) * gain;

      // Low bass bins (0-4)
      let bassSum = 0;
      for (let i = 0; i < 4; i++) bassSum += dataArray[i];
      bassPower = (bassSum / 4 / 255.0) * gain;

      // High treble bins (40-64)
      let trebleSum = 0;
      for (let i = 40; i < 64; i++) trebleSum += dataArray[i];
      treblePower = (trebleSum / 24 / 255.0) * gain;

    } else {
      // Synthetic audio waveforms
      avgAudio = (Math.sin(time * 4) * 0.5 + 0.5) * (gain * 0.25);
      bassPower = Math.pow(Math.sin(time * 3), 4) * (gain * 0.35);
      treblePower = (Math.random() < 0.1 ? 0.8 : 0.05) * (gain * 0.2);
    }

    if (avgAudio < threshold) avgAudio = 0;
    if (bassPower < threshold) bassPower = 0;
    if (treblePower < threshold) treblePower = 0;

    const ledWidth = canvas.width / numLEDs;
    const centerY = canvas.height / 2;

    // Python Algorithm Emulations
    switch (currentAnimation) {

      // 1. SPECTRUM: FFT frequency spectrum HSV mapping
      case 'spectrum': {
        for (let i = 0; i < numLEDs; i++) {
          const normI = i / numLEDs;
          const freqVal = dataArray[i % dataArray.length] ? (dataArray[i % dataArray.length] / 255) * gain : avgAudio;
          const hue = normI * 0.8;
          const rgb = hslToRgb(hue, 1.0, Math.min(1.0, freqVal));
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(10, freqVal * canvas.height * 0.85));
        }
        break;
      }

      // 2. BASS: Whole-strip pulse scaled to low frequencies (<250Hz)
      case 'bass': {
        const val = Math.min(1.0, bassPower);
        const rgb = hslToRgb(hueTracker, 1.0, val);
        const h = Math.max(15, val * canvas.height * 0.75);
        for (let i = 0; i < numLEDs; i++) {
          drawPixel(i, rgb[0], rgb[1], rgb[2], h);
        }
        break;
      }

      // 3. VU: Symmetrical VU meter expanding outward from center
      case 'vu': {
        const val = Math.min(1.0, avgAudio);
        const litCount = Math.floor(val * (numLEDs / 2));
        const center = Math.floor(numLEDs / 2);

        for (let i = 0; i < numLEDs; i++) {
          const distFromCenter = Math.abs(i - center);
          if (distFromCenter <= litCount) {
            const posRatio = distFromCenter / (numLEDs / 2);
            const rgb = hslToRgb(posRatio * 0.8, 1.0, 1.0);
            drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(15, (1 - posRatio * 0.5) * canvas.height * 0.7));
          } else {
            drawPixel(i, 10, 8, 18, 8);
          }
        }
        break;
      }

      // 4. WAVE: Propagation outwards from center
      case 'wave': {
        const mid = Math.floor(numLEDs / 2);
        // Shift buffer outward
        for (let i = 0; i < mid - 1; i++) waveBuffer[i] = waveBuffer[i + 1];
        for (let i = numLEDs - 1; i > mid; i--) waveBuffer[i] = waveBuffer[i - 1];

        const peakHue = (time * 0.2) % 1.0;
        const val = Math.min(1.0, avgAudio);
        const centerRGB = hslToRgb(peakHue, 1.0, val);

        waveBuffer[mid] = centerRGB;
        if (mid - 1 >= 0) waveBuffer[mid - 1] = centerRGB;

        for (let i = 0; i < numLEDs; i++) {
          const rgb = waveBuffer[i] || [0, 0, 0];
          const brightness = (rgb[0] + rgb[1] + rgb[2]) / 765;
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(10, brightness * canvas.height * 0.8));
        }
        break;
      }

      // 5. RAINBOW: Scroll hue across pixels
      case 'rainbow': {
        const val = Math.min(1.0, avgAudio);
        for (let i = 0; i < numLEDs; i++) {
          const hue = (i / numLEDs + hueTracker) % 1.0;
          const rgb = hslToRgb(hue, 1.0, val);
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(12, val * canvas.height * 0.75));
        }
        break;
      }

      // 6. FIRE: Heat propagation & cooling
      case 'fire': {
        for (let i = 0; i < numLEDs; i++) fireBuffer[i] *= 0.94;
        for (let i = numLEDs - 1; i > 0; i--) fireBuffer[i] = fireBuffer[i - 1];
        fireBuffer[0] = Math.min(1.0, bassPower);

        for (let i = 0; i < numLEDs; i++) {
          const h = fireBuffer[i];
          let r = 0, g = 0, b = 0;
          if (h < 0.15) {
            r = 0; g = 0; b = 0;
          } else if (h < 0.55) {
            r = Math.min(255, Math.floor(h * 1.8 * 255));
            g = Math.min(255, Math.floor((h - 0.15) * 0.5 * 255));
          } else {
            r = 255;
            g = Math.min(255, Math.floor(h * 255));
            b = Math.min(255, Math.floor((h - 0.55) * 2.2 * 255));
          }
          drawPixel(i, r, g, b, Math.max(8, h * canvas.height * 0.8));
        }
        break;
      }

      // 7. SPARKLE: Treble transient flashes
      case 'sparkle': {
        const bgRGB = hslToRgb(hueTracker, 1.0, 0.08);
        for (let i = 0; i < numLEDs; i++) {
          if (treblePower > threshold * 2.0 && Math.random() < treblePower * 0.3) {
            drawPixel(i, 255, 255, 255, canvas.height * 0.85);
          } else {
            drawPixel(i, bgRGB[0], bgRGB[1], bgRGB[2], 12);
          }
        }
        break;
      }
    }

    // Universe boundary guide line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPixel(i, r, g, b, heightVal) {
    const ledWidth = canvas.width / numLEDs;
    const centerY = canvas.height / 2;
    const x = i * ledWidth;
    const y = centerY - heightVal / 2;

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x + 1, y, ledWidth - 2, heightVal);

    if (r + g + b > 350) {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
      ctx.fillRect(x - 2, y - 6, ledWidth + 4, heightVal + 12);
    }
  }

  renderVisualizer();

  // Helper HSL to RGB
  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  // Grimoire Tab Switching Logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(tabId);
      if (targetContent) targetContent.classList.add('active');

      createComicSFX(btn, 'SPELL UNLOCKED!');
    });
  });

  // Code Copy Buttons
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const codeBlock = btn.previousElementSibling || btn.parentElement.querySelector('code');
      if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.textContent.trim()).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'COPIED!';
          btn.style.background = '#39ff14';
          btn.style.color = '#000';
          createComicSFX(btn, 'COPIED TO CLIPBOARD!');
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            btn.style.color = '';
          }, 2000);
        });
      }
    });
  });

  // Download Button SFX
  const downloadBtn = document.getElementById('artnetDownloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      createComicSFX(downloadBtn, 'KAPOW! DOWNLOADING...');
    });
  }
});
