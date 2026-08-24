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

});
