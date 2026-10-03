/**
 * Apex Parasite - Standalone Post-Combat Surgery Harness Controller
 * Handles content fetching, validation, dev panel controls, debug overlays,
 * roll telemetry logging, and headless execution (?auto=1, ?test=stats).
 */

import { validateSpecimenDef, validateLootDef } from './validator.js';
import { createSurgery } from './index.js';
import { createAudioAdapter } from './audioAdapter.js';
import { runHeadlessScript, runStatsTest, testOrderingMatters } from './headless.js';

export async function initHarness() {
  const logEl = document.getElementById('harness-log');
  const resultJsonEl = document.getElementById('result-json-output');
  const validationEl = document.getElementById('validation-report');

  function log(msg) {
    if (!logEl) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = `[${time}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  log('Loading content manifests...');

  // 1. Fetch content
  let specimenManifest = [];
  let lootManifest = [];
  try {
    const specResp = await fetch('./content/specimens/index.json');
    specimenManifest = await specResp.json();
    const lootResp = await fetch('./content/loot/index.json');
    lootManifest = await lootResp.json();
  } catch (err) {
    log(`Failed to load manifests: ${err.message}`);
    return;
  }

  const content = {
    specimens: {},
    loot: {}
  };

  // Fetch loot
  for (const lootId of lootManifest) {
    try {
      const resp = await fetch(`./content/loot/${lootId}.json`);
      content.loot[lootId] = await resp.json();
    } catch (err) {
      log(`Error fetching loot ${lootId}: ${err.message}`);
    }
  }

  // Fetch specimens
  for (const specId of specimenManifest) {
    try {
      const resp = await fetch(`./content/specimens/${specId}.json`);
      content.specimens[specId] = await resp.json();
    } catch (err) {
      log(`Error fetching specimen ${specId}: ${err.message}`);
    }
  }

  // 2. Validate all content (Section 8.3, Check 1)
  const validationErrors = [];
  for (const [id, loot] of Object.entries(content.loot)) {
    const val = validateLootDef(loot);
    if (!val.ok) {
      validationErrors.push(`Loot "${id}": ${val.errors.join('; ')}`);
    }
  }

  for (const [id, specimen] of Object.entries(content.specimens)) {
    const val = validateSpecimenDef(specimen, content.loot);
    if (!val.ok) {
      validationErrors.push(`Specimen "${id}": ${val.errors.join('; ')}`);
    }
  }

  if (validationErrors.length > 0) {
    validationEl.className = 'validation-box error';
    validationEl.innerHTML = `<strong>Content Validation Errors (${validationErrors.length}):</strong><br/>- ` +
      validationErrors.join('<br/>- ');
  } else {
    validationEl.className = 'validation-box success';
    validationEl.innerHTML = `✓ All ${Object.keys(content.specimens).length} specimens and ${Object.keys(content.loot).length} loot definitions validated successfully.`;
  }

  // 3. Check Headless URL modes (Section 8.4)
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('test') === 'stats') {
    log('Running headless stats test (?test=stats)...');
    const statsResult = runStatsTest(content.specimens, content.loot, 1000);
    const orderResult = testOrderingMatters(content.specimens['verdant_thorn_beast'], content.loot, 42424);

    document.getElementById('headless-container').style.display = 'block';
    document.getElementById('headless-output').textContent = JSON.stringify({
      orderingMattersCheck12: orderResult,
      statsTestCheck14: statsResult
    }, null, 2);
    return;
  }

  if (urlParams.get('auto') === '1') {
    const specId = urlParams.get('specimen') || 'verdant_thorn_beast';
    const seed = parseInt(urlParams.get('seed') || '12345', 10);
    const script = urlParams.get('script') || 'c:thorax_artery,x:bile_sac_thorax,f';

    log(`Running headless auto script: specimen=${specId}, seed=${seed}, script=${script}`);
    const specDef = content.specimens[specId] || content.specimens['verdant_thorn_beast'];
    const input = {
      specimenId: specDef.id,
      state: 'living',
      pulsePct: 80,
      bloodPct: 30,
      damage: { severedParts: ['antler_left'], woundedRegions: [] },
      player: { calories: 80, maxCalories: 100, surgerySkill: 1, precisionBonus: 0, supplies: { sutures: 2 } },
      seed,
      options: { skipEntrance: true }
    };

    const runOut = runHeadlessScript(specDef, content.loot, input, script);
    document.getElementById('headless-container').style.display = 'block';
    document.getElementById('headless-output').textContent = JSON.stringify(runOut.result, null, 2);
    return;
  }

  // 4. Interactive Mode Dev Panel Setup
  const specimenSelect = document.getElementById('dev-specimen-select');
  specimenSelect.innerHTML = '';
  Object.keys(content.specimens).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = content.specimens[id].displayName;
    specimenSelect.appendChild(opt);
  });
  if (content.specimens['verdant_thorn_beast']) {
    specimenSelect.value = 'verdant_thorn_beast';
  }

  const pulseSlider = document.getElementById('dev-pulse-slider');
  const pulseValDisp = document.getElementById('dev-pulse-val');
  pulseSlider.addEventListener('input', () => {
    pulseValDisp.textContent = `${pulseSlider.value}%`;
  });

  const bloodSlider = document.getElementById('dev-blood-slider');
  const bloodValDisp = document.getElementById('dev-blood-val');
  bloodSlider.addEventListener('input', () => {
    bloodValDisp.textContent = `${bloodSlider.value}%`;
  });

  const seedInput = document.getElementById('dev-seed-input');
  document.getElementById('dev-new-seed-btn').addEventListener('click', () => {
    seedInput.value = Math.floor(Math.random() * 900000 + 100000);
  });

  // Dynamic checklists for severed parts and wounded regions based on selected specimen
  function refreshChecklists() {
    const specId = specimenSelect.value;
    const spec = content.specimens[specId];
    if (!spec) return;

    const severedContainer = document.getElementById('dev-severed-checklist');
    severedContainer.innerHTML = '';
    (spec.severable || []).forEach(part => {
      const lbl = document.createElement('label');
      lbl.className = 'checkbox-label';
      lbl.innerHTML = `<input type="checkbox" value="${part.id}" ${part.id === 'antler_left' ? 'checked' : ''}/> ${part.name}`;
      severedContainer.appendChild(lbl);
    });

    const woundedContainer = document.getElementById('dev-wounded-checklist');
    woundedContainer.innerHTML = '';
    const uniqueRegions = Array.from(new Set(spec.organs.map(o => o.region)));
    uniqueRegions.forEach(region => {
      const lbl = document.createElement('label');
      lbl.className = 'checkbox-label';
      lbl.innerHTML = `<input type="checkbox" value="${region}"/> ${region.toUpperCase()}`;
      woundedContainer.appendChild(lbl);
    });
  }

  specimenSelect.addEventListener('change', refreshChecklists);
  refreshChecklists();

  // Audio Adapter
  const audioAdapter = createAudioAdapter({
    enabled: true,
    onLog: (line) => log(line)
  });

  document.getElementById('dev-audio-mute').addEventListener('change', (e) => {
    audioAdapter.setMuted(e.target.checked);
  });

  // Active surgery runner
  const stageRoot = document.getElementById('surgery-viewport-root');
  let currentSurgery = null;
  let lastUsedInput = null;

  function buildInputFromForm() {
    const specId = specimenSelect.value;
    const state = document.querySelector('input[name="dev-state"]:checked').value;
    const pulsePct = parseInt(pulseSlider.value, 10);
    const bloodPct = parseInt(bloodSlider.value, 10);

    const severedParts = Array.from(document.querySelectorAll('#dev-severed-checklist input:checked')).map(cb => cb.value);
    const woundedRegions = Array.from(document.querySelectorAll('#dev-wounded-checklist input:checked')).map(cb => cb.value);

    const calories = parseInt(document.getElementById('dev-calories-input').value, 10);
    const surgerySkill = parseInt(document.getElementById('dev-skill-input').value, 10);
    const precisionBonus = parseInt(document.getElementById('dev-precision-input').value, 10);
    const sutures = parseInt(document.getElementById('dev-sutures-input').value, 10);
    const seed = parseInt(seedInput.value, 10) || 12345;
    const skipEntrance = document.getElementById('dev-skip-entrance').checked;

    return {
      specimenId: specId,
      state,
      pulsePct,
      bloodPct,
      damage: {
        severedParts,
        woundedRegions
      },
      player: {
        calories,
        maxCalories: Math.max(calories, 100),
        surgerySkill,
        precisionBonus,
        supplies: { sutures }
      },
      seed,
      options: {
        skipEntrance
      }
    };
  }

  async function startScene(input) {
    if (currentSurgery) {
      currentSurgery.destroy();
    }
    resultJsonEl.textContent = '// Surgery in progress...';
    lastUsedInput = JSON.parse(JSON.stringify(input));

    log(`Starting surgery: specimen="${input.specimenId}", state="${input.state}", seed=${input.seed}`);

    currentSurgery = createSurgery({
      root: stageRoot,
      audio: audioAdapter,
      content,
      onLog: (line) => log(line)
    });

    try {
      const result = await currentSurgery.run(input);
      log(`Surgery ended by "${result.endedBy}". Harvested: ${result.harvested.length}, Lost: ${result.lost.length}`);
      resultJsonEl.textContent = JSON.stringify(result, null, 2);
    } catch (err) {
      log(`Surgery execution error: ${err.message}`);
      resultJsonEl.textContent = `// Error: ${err.message}`;
    }
  }

  document.getElementById('dev-run-scene-btn').addEventListener('click', () => {
    startScene(buildInputFromForm());
  });

  document.getElementById('dev-reset-btn').addEventListener('click', () => {
    if (currentSurgery) {
      currentSurgery.destroy();
      currentSurgery = null;
    }
    stageRoot.innerHTML = '<div class="surgery-idle-placeholder">Scene reset. Click "Run Scene" to begin.</div>';
    resultJsonEl.textContent = '// Idle';
  });

  document.getElementById('dev-replay-btn').addEventListener('click', () => {
    if (lastUsedInput) {
      startScene(lastUsedInput);
    } else {
      startScene(buildInputFromForm());
    }
  });

  // Copy bug report (Section 8.3, Check 16 - zero alert/prompt)
  const copyBtn = document.getElementById('dev-copy-bug-report');
  copyBtn.addEventListener('click', () => {
    const report = {
      timestamp: new Date().toISOString(),
      input: lastUsedInput || buildInputFromForm(),
      lastResult: resultJsonEl.textContent
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
      const origText = copyBtn.textContent;
      copyBtn.textContent = '✓ Copied to Clipboard!';
      setTimeout(() => { copyBtn.textContent = origText; }, 2000);
    }).catch(() => {
      const origText = copyBtn.textContent;
      copyBtn.textContent = 'Clipboard error';
      setTimeout(() => { copyBtn.textContent = origText; }, 2000);
    });
  });

  // Debug overlay toggles (Section 8.2)
  const toggleDebugHitboxes = document.getElementById('dev-toggle-hitboxes');
  toggleDebugHitboxes.addEventListener('change', () => {
    const overlay = document.querySelector('.group-hit-regions');
    if (overlay) {
      overlay.classList.toggle('debug-highlight-hitboxes', toggleDebugHitboxes.checked);
    }
  });

  // Auto-start initial scene
  startScene(buildInputFromForm());
}
