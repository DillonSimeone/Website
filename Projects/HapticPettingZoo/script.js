// =================================================================
// BROWSER HISTORY API & TAB SWITCHING
// =================================================================

function applyTab(tabId, elementIdToScrollTo, updateHistory = true) {
  const editionButtons = document.querySelectorAll('.edition-btn');
  const editionSections = document.querySelectorAll('.edition-section');

  let validTab = false;
  editionSections.forEach(section => {
    if (section.id === tabId) {
      section.classList.add('active');
      validTab = true;
    } else {
      section.classList.remove('active');
    }
  });

  if (!validTab) {
    tabId = 'press-edition';
    document.getElementById('press-edition')?.classList.add('active');
  }

  editionButtons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (updateHistory) {
    const hash = elementIdToScrollTo ? `#${tabId}:${elementIdToScrollTo}` : `#${tabId}`;
    if (window.location.hash !== hash) {
      history.pushState({ tabId, elementIdToScrollTo }, '', hash);
    }
  }

  if (elementIdToScrollTo) {
    setTimeout(() => {
      const el = document.getElementById(elementIdToScrollTo);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  } else {
    const newspaperContainer = document.getElementById('newspaper-container');
    if (newspaperContainer) {
      window.scrollTo({
        top: newspaperContainer.offsetTop - 60,
        behavior: 'smooth'
      });
    }
  }
}

// Global helper to navigate to specific track deep-dive with History support
window.navigateToTrack = function(trackElementId) {
  applyTab('tracks-edition', trackElementId, true);
};

// Global tab switcher
window.switchTab = function(tabId, elementIdToScrollTo) {
  applyTab(tabId, elementIdToScrollTo, true);
};

// Handle Browser Back & Forward Buttons
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.tabId) {
    applyTab(e.state.tabId, e.state.elementIdToScrollTo, false);
  } else {
    parseInitialHash();
  }
});

function parseInitialHash() {
  const rawHash = window.location.hash.replace('#', '');
  if (!rawHash) {
    applyTab('press-edition', null, false);
    return;
  }

  if (rawHash.includes(':')) {
    const parts = rawHash.split(':');
    applyTab(parts[0], parts[1], false);
  } else if (rawHash.startsWith('track-')) {
    applyTab('tracks-edition', rawHash, false);
  } else {
    applyTab(rawHash, null, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  
  // Set up edition button clicks
  const editionButtons = document.querySelectorAll('.edition-btn');
  editionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab) {
        applyTab(targetTab, null, true);
      }
    });
  });

  // Check initial URL hash on first page load
  parseInitialHash();

  // =================================================================
  // 2. INTERACTIVE TACTILE FREQUENCY SYNTHESIZER
  // =================================================================
  const freqSlider = document.getElementById('freq-slider');
  const freqVal = document.getElementById('freq-val');
  const receptorReadout = document.getElementById('receptor-readout');
  const sensationReadout = document.getElementById('sensation-readout');
  const hardwareReadout = document.getElementById('hardware-readout');
  const canvas = document.getElementById('waveform-canvas');

  let currentFreq = 220;
  let animPhase = 0;

  if (freqSlider && canvas) {
    const ctx = canvas.getContext('2d');

    function updateReceptorData(hz) {
      if (hz >= 150) {
        receptorReadout.textContent = 'Pacinian Corpuscles (200–300 Hz)';
        receptorReadout.style.color = '#f7c967';
        sensationReadout.textContent = 'Fine micro-vibration / Carbonation shimmer / High pitch';
        hardwareReadout.textContent = 'Linear Resonant Actuator (LRA) / Voice Coil / Transducer';
      } else if (hz >= 40) {
        receptorReadout.textContent = 'Meissner’s Corpuscles (10–50 Hz)';
        receptorReadout.style.color = '#ff9f75';
        sensationReadout.textContent = 'Flutter / Mechanical rumble / Dynamic slip sensation';
        hardwareReadout.textContent = 'Eccentric Rotating Mass (ERM) / Transient Solenoid Tapper';
      } else if (hz >= 10) {
        receptorReadout.textContent = 'Merkel Disks (0.4–10 Hz)';
        receptorReadout.style.color = '#79d7a2';
        sensationReadout.textContent = 'Sustained pressure / Physical indentation / Heavy thump';
        hardwareReadout.textContent = 'Servo-driven cam / Pneumatic bladder / Bass Shaker';
      } else {
        receptorReadout.textContent = 'Ruffini Endings (Slow / Static Stretch)';
        receptorReadout.style.color = '#7bc6ff';
        sensationReadout.textContent = 'Lateral skin stretch / Thermal warmth / Drag friction';
        hardwareReadout.textContent = 'Friction Roller / Thermoelectric Peltier Cell';
      }
    }

    freqSlider.addEventListener('input', (e) => {
      currentFreq = parseInt(e.target.value, 10);
      freqVal.textContent = currentFreq;
      updateReceptorData(currentFreq);
    });

    function drawWaveform() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw oscilloscope grid line
      ctx.strokeStyle = '#2d2720';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Draw tactile sine wave
      ctx.strokeStyle = '#b3822a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      const centerY = canvas.height / 2;
      const amplitude = Math.min(38, 15 + currentFreq * 0.1);
      const cycles = currentFreq / 18;

      for (let x = 0; x < canvas.width; x++) {
        const angle = (x / canvas.width) * cycles * 2 * Math.PI + animPhase;
        const y = centerY + Math.sin(angle) * amplitude;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Increment animation phase
      animPhase += (currentFreq / 220) * 0.15;
      requestAnimationFrame(drawWaveform);
    }

    updateReceptorData(currentFreq);
    drawWaveform();
  }

  // =================================================================
  // 3. MAKER SIGN-UP FORM HANDLER
  // =================================================================
  const makerForm = document.getElementById('maker-signup-form');
  const formFeedback = document.getElementById('form-feedback');

  if (makerForm) {
    makerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const name = document.getElementById('maker-name').value.trim();
      const email = document.getElementById('maker-email').value.trim();
      const notes = document.getElementById('maker-notes').value.trim();
      
      const selectedTracks = [];
      document.querySelectorAll('input[name="tracks"]:checked').forEach(cb => {
        selectedTracks.push(cb.value);
      });

      if (selectedTracks.length === 0) {
        alert('Please select at least one Track to participate in!');
        return;
      }

      const summaryText = `[Haptic Petting Zoo Maker Sign-Up]\nName: ${name}\nContact: ${email}\nSelected Tracks:\n- ${selectedTracks.join('\n- ')}\nNotes / Equipment:\n${notes || 'None specified'}`;

      // Open pre-populated mailto as convenience
      const mailSubject = encodeURIComponent(`Control+H Maker Track Sign-Up: ${name}`);
      const mailBody = encodeURIComponent(summaryText);
      const mailtoLink = `mailto:dillonsimeone@gmail.com?subject=${mailSubject}&body=${mailBody}`;

      if (formFeedback) {
        formFeedback.className = 'form-feedback success';
        formFeedback.innerHTML = `
          <strong>Thank you, ${name}!</strong> Your interest has been drafted.<br>
          <div style="margin-top: 8px;">
            <a href="${mailtoLink}" class="gazette-btn" style="display:inline-block; margin-right:8px;">📧 Launch Pre-filled Email</a>
            <button type="button" class="gazette-btn" id="copy-summary-btn" style="display:inline-block; cursor:pointer;">📋 Copy Summary for Discord/Slack</button>
          </div>
        `;

        const copyBtn = document.getElementById('copy-summary-btn');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(summaryText).then(() => {
              copyBtn.textContent = '✓ Copied to Clipboard!';
              setTimeout(() => { copyBtn.textContent = '📋 Copy Summary for Discord/Slack'; }, 3000);
            });
          });
        }
      }
    });
  }

  // =================================================================
  // 4. HAXEL TELEMETRY OSCILLOSCOPE SIMULATOR
  // =================================================================
  const haxelCanvas = document.getElementById('haxel-telemetry-canvas');
  const haxelModeButtons = document.querySelectorAll('.haxel-mode-btn');
  const haxelModeName = document.getElementById('haxel-mode-name');
  const haxelSignalReadout = document.getElementById('haxel-signal-readout');

  if (haxelCanvas) {
    const hctx = haxelCanvas.getContext('2d');
    let haxelMode = 'fft';
    let hPhase = 0;
    const binPeaks = new Array(32).fill(0);

    const modeConfigs = {
      fft: {
        title: '32-Band Real-Time Audio FFT',
        readout: 'Core 0 I2S DSP & Envelope Stream (120 FPS)'
      },
      pulse: {
        title: 'Solenoid Transient Impact Recoil',
        readout: 'High-Impact Recoil Duty Cycle (PWM 100% -> Ringdown)'
      },
      lra: {
        title: 'LRA 175Hz Resonant Frequency Burst',
        readout: 'Sine Drive at Resonant Peak (Auto-Tuned Phase)'
      },
      thermal: {
        title: 'Peltier Thermoelectric Temperature Ramp',
        readout: 'Solid-State Heat Pump Gradient (15°C - 42°C Control)'
      }
    };

    haxelModeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        haxelModeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        haxelMode = btn.getAttribute('data-haxel-mode');

        if (modeConfigs[haxelMode]) {
          haxelModeName.textContent = modeConfigs[haxelMode].title;
          haxelSignalReadout.textContent = modeConfigs[haxelMode].readout;
        }
      });
    });

    function drawHaxelTelemetry() {
      const w = haxelCanvas.width;
      const h = haxelCanvas.height;
      hctx.clearRect(0, 0, w, h);

      // Oscilloscope background grid
      hctx.strokeStyle = '#221c17';
      hctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        hctx.beginPath();
        hctx.moveTo(x, 0);
        hctx.lineTo(x, h);
        hctx.stroke();
      }
      for (let y = 0; y < h; y += 30) {
        hctx.beginPath();
        hctx.moveTo(0, y);
        hctx.lineTo(w, y);
        hctx.stroke();
      }

      hPhase += 0.08;

      if (haxelMode === 'fft') {
        // Draw 32 spectral FFT bars
        const numBars = 32;
        const barWidth = (w - 40) / numBars;
        const startX = 20;

        for (let i = 0; i < numBars; i++) {
          const targetVal = Math.abs(Math.sin(hPhase * 1.5 + i * 0.3) * Math.cos(hPhase * 0.7 - i * 0.15)) * (h - 40);
          if (targetVal > binPeaks[i]) {
            binPeaks[i] = targetVal;
          } else {
            binPeaks[i] = Math.max(2, binPeaks[i] * 0.92);
          }

          const barH = binPeaks[i];
          const x = startX + i * barWidth;
          const y = h - 20 - barH;

          // Spectrum gradient
          const hue = (i / numBars) * 200 + 10;
          hctx.fillStyle = `hsla(${hue}, 85%, 55%, 0.85)`;
          hctx.fillRect(x + 1, y, barWidth - 3, barH);

          // Peak indicator line
          hctx.fillStyle = '#ffffff';
          hctx.fillRect(x + 1, Math.max(10, y - 2), barWidth - 3, 2);
        }
      } else if (haxelMode === 'pulse') {
        // Solenoid recoil transients
        hctx.strokeStyle = '#ff4d4f';
        hctx.lineWidth = 2.5;
        hctx.beginPath();

        for (let x = 0; x < w; x++) {
          const cycle = (x + hPhase * 120) % 150;
          let y = h / 2;
          if (cycle < 10) {
            y -= (cycle / 10) * 55;
          } else if (cycle < 40) {
            y += Math.sin((cycle - 10) * 0.4) * 25 * Math.exp(-(cycle - 10) * 0.08);
          }
          if (x === 0) hctx.moveTo(x, y);
          else hctx.lineTo(x, y);
        }
        hctx.stroke();

      } else if (haxelMode === 'lra') {
        // LRA Resonant burst envelope
        hctx.strokeStyle = '#f7c967';
        hctx.lineWidth = 2;
        hctx.beginPath();

        for (let x = 0; x < w; x++) {
          const envelope = Math.sin((x / w) * Math.PI) * Math.abs(Math.sin(hPhase * 0.5));
          const carrier = Math.sin((x / 4) + hPhase * 4);
          const y = (h / 2) + carrier * envelope * 50;

          if (x === 0) hctx.moveTo(x, y);
          else hctx.lineTo(x, y);
        }
        hctx.stroke();

      } else if (haxelMode === 'thermal') {
        // Peltier thermal gradient curve
        hctx.strokeStyle = '#7bc6ff';
        hctx.lineWidth = 3;
        hctx.beginPath();

        for (let x = 0; x < w; x++) {
          const y = (h / 2) + Math.sin((x / w) * Math.PI * 2 + hPhase * 0.5) * 35;
          if (x === 0) hctx.moveTo(x, y);
          else hctx.lineTo(x, y);
        }
        hctx.stroke();

        // Warmth gradient fill
        const gradient = hctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, 'rgba(123, 198, 255, 0.2)');
        gradient.addColorStop(0.5, 'rgba(247, 201, 103, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 121, 117, 0.2)');
        hctx.fillStyle = gradient;
        hctx.fillRect(0, 0, w, h);
      }

      requestAnimationFrame(drawHaxelTelemetry);
    }

    drawHaxelTelemetry();
  }

  // =================================================================
  // 5. LETTER OF INTENT MANIFESTO VIEWER TOGGLE
  // =================================================================
  const toggleLoiBtn = document.getElementById('toggle-loi-btn');
  const loiBox = document.getElementById('loi-full-text-box');

  if (toggleLoiBtn && loiBox) {
    toggleLoiBtn.addEventListener('click', () => {
      if (loiBox.style.display === 'none' || !loiBox.style.display) {
        loiBox.style.display = 'block';
        toggleLoiBtn.textContent = '📖 Hide Full Text Manifesto';
        loiBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        loiBox.style.display = 'none';
        toggleLoiBtn.textContent = '📜 Read Full Text Manifesto (Interactive Gazette)';
      }
    });
  }

});
