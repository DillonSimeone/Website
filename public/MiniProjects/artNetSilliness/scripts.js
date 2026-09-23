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

  // Preview uses the same shaping as audio_artnet.py: log-spaced bands,
  // fast attack, slow release, and fades instead of one-pixel jumps.
  const numLEDs = 128;
  const BANDS = 24;
  let bandLevels = new Array(BANDS).fill(0);
  let bandPeaks = new Array(BANDS).fill(0);
  let fireHeat = new Array(numLEDs).fill(0);
  let sparkLevels = new Array(numLEDs).fill(0);
  let hueTracker = 0;
  let wavePhase = 0;
  let vuLevel = 0;
  let vuPeak = 0;

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

  function hsvToRgb(h, s, v) {
    const hue = ((h % 1) + 1) % 1;
    const sat = Math.max(0, Math.min(1, s));
    const val = Math.max(0, Math.min(1, v));
    const i = Math.floor(hue * 6) % 6;
    const f = hue * 6 - Math.floor(hue * 6);
    const p = val * (1 - sat);
    const q = val * (1 - f * sat);
    const t = val * (1 - (1 - f) * sat);
    const table = [
      [val, t, p],
      [q, val, p],
      [p, val, t],
      [p, q, val],
      [t, p, val],
      [val, p, q]
    ];
    const rgb = table[i];
    return [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];
  }

  function attackRelease(prev, target, attack, release) {
    const delta = target - prev;
    return prev + delta * (delta >= 0 ? attack : release);
  }

  function sampleLogBands(dataArray) {
    const release = Math.max(0.05, (1 - smoothing) * 0.5);
    const gate = threshold * 40;
    for (let b = 0; b < BANDS; b++) {
      const start = Math.min(dataArray.length - 1, Math.floor(Math.pow(dataArray.length, b / BANDS)));
      const end = Math.min(dataArray.length, Math.max(start + 1, Math.floor(Math.pow(dataArray.length, (b + 1) / BANDS))));
      let sum = 0;
      for (let i = start; i < end; i++) sum += dataArray[i];
      let level = (sum / (end - start) / 255) * (gain / 5);
      if (level < gate) level = 0;
      level = Math.max(0, Math.min(1, level));
      bandLevels[b] = attackRelease(bandLevels[b], level, 0.72, release);
      bandPeaks[b] = Math.max(bandLevels[b], bandPeaks[b] - 0.012);
    }
  }

  function bandAt(pixel) {
    const x = (pixel / Math.max(1, numLEDs - 1)) * (BANDS - 1);
    const lo = Math.floor(x);
    const hi = Math.min(BANDS - 1, lo + 1);
    const frac = x - lo;
    return bandLevels[lo] * (1 - frac) + bandLevels[hi] * frac;
  }

  // Render Visualizer implementing the same shaping as audio_artnet.py
  let time = 0;

  function renderVisualizer() {
    requestAnimationFrame(renderVisualizer);
    time += 0.03;

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

    if (!(isAudioActive && analyser)) {
      for (let i = 0; i < dataArray.length; i++) {
        const wobble = 0.45 + 0.55 * Math.sin(time * 3 + i * 0.35);
        dataArray[i] = Math.max(0, Math.min(255, (bassPower * (i < 6 ? 220 : 40) + avgAudio * 180 * wobble)));
      }
    }
    sampleLogBands(dataArray);
    const release = Math.max(0.05, (1 - smoothing) * 0.5);
    vuLevel = attackRelease(vuLevel, Math.min(1, avgAudio), 0.75, release);

    switch (currentAnimation) {
      case 'spectrum': {
        for (let i = 0; i < numLEDs; i++) {
          const level = bandAt(i);
          const x = (i / Math.max(1, numLEDs - 1)) * (BANDS - 1);
          const lo = Math.floor(x);
          const hi = Math.min(BANDS - 1, lo + 1);
          const peak = bandPeaks[lo] * (1 - (x - lo)) + bandPeaks[hi] * (x - lo);
          const nearPeak = (peak - level) < 0.04;
          const rgb = hsvToRgb(i / numLEDs * 0.72, nearPeak ? 0.35 : 1, nearPeak ? Math.max(level, peak) : level);
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(8, level * canvas.height * 0.9));
        }
        break;
      }

      case 'bass': {
        hueTracker = (hueTracker + 0.002 + bassPower * 0.01) % 1;
        const val = Math.min(1, bassPower);
        for (let i = 0; i < numLEDs; i++) {
          const x = (i / (numLEDs - 1)) * 2 - 1;
          const bloom = Math.exp(-3 * x * x);
          const v = Math.min(1, 0.04 + val * bloom * 1.35);
          const rgb = hsvToRgb(hueTracker, 1, v);
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(8, v * canvas.height * 0.85));
        }
        break;
      }

      case 'vu': {
        vuPeak = Math.max(vuLevel, vuPeak - 0.01);
        const center = (numLEDs - 1) / 2;
        for (let i = 0; i < numLEDs; i++) {
          const dist = Math.abs(i - center) / center;
          const edge = 2 / numLEDs;
          let v = Math.max(0, Math.min(1, (vuLevel - dist) / edge));
          const isPeak = Math.abs(dist - vuPeak) < (1.5 / numLEDs);
          if (isPeak) v = 1;
          const rgb = hsvToRgb(0.33 * (1 - dist), isPeak ? 0.15 : 1, v);
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(6, v * canvas.height * 0.75));
        }
        break;
      }

      case 'wave': {
        wavePhase += 0.35 + Math.min(1, avgAudio) * 1.6;
        for (let i = 0; i < numLEDs; i++) {
          const dist = Math.abs(i - (numLEDs - 1) / 2);
          const wave = 0.5 + 0.5 * Math.sin((dist - wavePhase) * 0.35);
          const v = Math.min(1, (0.1 + avgAudio) * (0.3 + 0.7 * wave));
          const rgb = hsvToRgb((0.55 + dist / numLEDs * 0.2) % 1, 0.9, v);
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(8, v * canvas.height * 0.85));
        }
        break;
      }

      case 'rainbow': {
        wavePhase += 0.2 + bassPower * 2.2;
        for (let i = 0; i < numLEDs; i++) {
          const shimmer = 0.72 + 0.28 * Math.sin(i * 0.17 + wavePhase * 0.15);
          const v = Math.min(1, (0.2 + 0.8 * avgAudio) * shimmer);
          const rgb = hsvToRgb((i / numLEDs + wavePhase / 48) % 1, 1, v);
          drawPixel(i, rgb[0], rgb[1], rgb[2], Math.max(10, v * canvas.height * 0.8));
        }
        break;
      }

      case 'fire': {
        for (let i = 0; i < numLEDs; i++) {
          fireHeat[i] = Math.max(0, fireHeat[i] * 0.97 - Math.random() * (0.02 + (1 - bassPower) * 0.02));
        }
        const diffused = fireHeat.slice();
        for (let i = 1; i < numLEDs - 1; i++) {
          diffused[i] = (fireHeat[i - 1] + fireHeat[i] * 2 + fireHeat[i + 1]) / 4.2;
        }
        fireHeat = diffused;
        const sparks = Math.min(numLEDs, 1 + Math.floor(bassPower * 12));
        for (let i = 0; i < sparks; i++) {
          fireHeat[i] = Math.max(fireHeat[i], (0.45 + Math.random() * 0.55) * (0.4 + 0.6 * bassPower));
        }
        for (let i = 0; i < numLEDs; i++) {
          const h = Math.max(0, Math.min(1, fireHeat[i]));
          const r = Math.min(255, Math.floor(Math.min(1, h * 3) * 255));
          const g = Math.min(255, Math.floor(Math.max(0, h * 3 - 1) * 255));
          const b = Math.min(255, Math.floor(Math.max(0, h * 3 - 2) * 255));
          drawPixel(i, r, g, b, Math.max(6, h * canvas.height * 0.85));
        }
        break;
      }

      case 'sparkle': {
        hueTracker = (hueTracker + 0.002) % 1;
        const count = treblePower > 0.12 ? Math.max(1, Math.min(12, Math.floor(treblePower * 16))) : 0;
        for (let s = 0; s < count; s++) {
          sparkLevels[Math.floor(Math.random() * numLEDs)] = 1;
        }
        for (let i = 0; i < numLEDs; i++) {
          sparkLevels[i] *= 0.86;
          const bg = hsvToRgb(hueTracker, 0.8, 0.07);
          const k = sparkLevels[i];
          const r = Math.round(bg[0] * (1 - k) + 255 * k);
          const g = Math.round(bg[1] * (1 - k) + 255 * k);
          const b = Math.round(bg[2] * (1 - k) + 255 * k);
          drawPixel(i, r, g, b, Math.max(8, (0.1 + k) * canvas.height * 0.7));
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
