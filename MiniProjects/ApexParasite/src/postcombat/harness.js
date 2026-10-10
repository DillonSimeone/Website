/**
 * Apex Parasite - Standalone Post-Combat Surgery Harness Controller (Phase 2)
 * Handles content fetching, schema v2 validation, dev panel controls, debug overlays,
 * Body Inspector drawer, roll telemetry logging, and headless execution (?auto=1, ?test=balance, ?test=stats).
 */

import { validateSpecimenDef, validateLootDef, validateBodyTemplate } from './validator.js';
import { createSurgery } from './index.js';
import { createAudioAdapter } from './audioAdapter.js';
import { runHeadlessScript } from './headless.js';
import { runBalanceTest, formatBalanceReportText } from './balance.js';
import { resolveSpecimen } from './body.js';

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

  // 1. Fetch content manifests
  let templateManifest = [];
  let specimenManifest = [];
  let lootManifest = [];

  try {
    const tResp = await fetch('./content/templates/index.json');
    templateManifest = await tResp.json();
    const specResp = await fetch('./content/specimens/index.json');
    specimenManifest = await specResp.json();
    const lootResp = await fetch('./content/loot/index.json');
    lootManifest = await lootResp.json();
  } catch (err) {
    log(`Failed to load manifests: ${err.message}`);
    if (validationEl) {
      validationEl.className = 'validation-box error';
      validationEl.textContent = `Manifest Load Error: ${err.message}`;
    }
    return;
  }

  const content = {
    templates: {},
    specimens: {},
    loot: {}
  };

  // Fetch templates
  for (const tId of templateManifest) {
    try {
      const resp = await fetch(`./content/templates/${tId}.json`);
      content.templates[tId] = await resp.json();
    } catch (err) {
      log(`Error fetching template ${tId}: ${err.message}`);
    }
  }

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

  // 2. Validate all content (Phase 2 Checks 1, 17)
  const validationErrors = [];
  const validationWarnings = [];

  for (const [id, template] of Object.entries(content.templates)) {
    const val = validateBodyTemplate(template);
    if (!val.ok) {
      validationErrors.push(`Template "${id}": ${val.errors.join('; ')}`);
    }
    if (val.warnings?.length) {
      validationWarnings.push(`Template "${id}": ${val.warnings.join('; ')}`);
    }
  }

  for (const [id, loot] of Object.entries(content.loot)) {
    const val = validateLootDef(loot);
    if (!val.ok) {
      validationErrors.push(`Loot "${id}": ${val.errors.join('; ')}`);
    }
  }

  for (const [id, specimen] of Object.entries(content.specimens)) {
    const val = validateSpecimenDef(specimen, content.templates, content.loot);
    if (!val.ok) {
      validationErrors.push(`Specimen "${id}": ${val.errors.join('; ')}`);
    }
    if (val.warnings?.length) {
      validationWarnings.push(`Specimen "${id}": ${val.warnings.join('; ')}`);
    }
  }

  if (validationErrors.length > 0) {
    validationEl.className = 'validation-box error';
    validationEl.innerHTML = `<strong>Content Validation Errors (${validationErrors.length}):</strong><br/>- ` +
      validationErrors.join('<br/>- ');
  } else if (validationWarnings.length > 0) {
    validationEl.className = 'validation-box warning';
    validationEl.innerHTML = `✓ All templates, specimens, and loot validated (${validationWarnings.length} warnings):<br/>- ` +
      validationWarnings.join('<br/>- ');
  } else {
    validationEl.className = 'validation-box success';
    validationEl.innerHTML = `✓ All ${Object.keys(content.templates).length} templates, ${Object.keys(content.specimens).length} specimens, and ${Object.keys(content.loot).length} loot definitions validated successfully.`;
  }

  // 3. Headless URL modes (Section 8.4, 11)
  const urlParams = new URLSearchParams(window.location.search);

  // ?test=balance (Phase 2 Section 4.3, 11)
  if (urlParams.get('test') === 'balance' || urlParams.get('test') === 'stats') {
    log('Running headless balance test across 200 seeds (?test=balance)...');
    const headlessContainer = document.getElementById('headless-container');
    const headlessOutput = document.getElementById('headless-output');
    const headlessTitle = document.getElementById('headless-title');
    const copyJsonBtn = document.getElementById('copy-balance-json-btn');
    const copyTextBtn = document.getElementById('copy-balance-text-btn');

    headlessContainer.style.display = 'block';
    headlessTitle.textContent = 'APEX PARASITE — POST-COMBAT BALANCE TEST REPORT (v2, 200 SEEDS)';
    headlessOutput.textContent = 'Running simulations across 200 seeds per specimen. Please wait...';

    // Allow browser to render loading message before executing synchronous simulation
    setTimeout(() => {
      const balanceResults = runBalanceTest(content.specimens, content.templates, 200);
      const textReport = formatBalanceReportText(balanceResults);

      headlessOutput.textContent = textReport;
      log('Balance test completed. Report rendered.');

      copyJsonBtn.onclick = () => {
        navigator.clipboard.writeText(JSON.stringify(balanceResults, null, 2)).then(() => {
          const orig = copyJsonBtn.textContent;
          copyJsonBtn.textContent = '✓ Copied JSON!';
          setTimeout(() => { copyJsonBtn.textContent = orig; }, 1800);
        });
      };

      copyTextBtn.onclick = () => {
        navigator.clipboard.writeText(textReport).then(() => {
          const orig = copyTextBtn.textContent;
          copyTextBtn.textContent = '✓ Copied Text!';
          setTimeout(() => { copyTextBtn.textContent = orig; }, 1800);
        });
      };
    }, 50);

    return;
  }

  // ?auto=1 (Headless script execution)
  if (urlParams.get('auto') === '1') {
    const specId = urlParams.get('specimen') || 'dire_wolf';
    const seed = parseInt(urlParams.get('seed') || '12345', 10);
    const script = urlParams.get('script') || 'c:carotid,x:lungs,x:heart,f';

    log(`Running headless script: specimen=${specId}, seed=${seed}, script=${script}`);
    const specDef = content.specimens[specId] || content.specimens['dire_wolf'];
    const input = {
      schemaVersion: 2,
      specimenId: specDef.id,
      state: 'living',
      pulsePct: 35,
      bloodPct: 30,
      damage: { severedParts: [], regionDamage: {} },
      player: { calories: 100, maxCalories: 120, surgerySkill: 1, precisionBonus: 0, supplies: { sutures: 2 } },
      seed,
      options: { skipEntrance: true, forceAllPresent: false }
    };

    const runOut = runHeadlessScript(specDef, content.templates, content.loot, input, script);
    document.getElementById('headless-container').style.display = 'block';
    document.getElementById('headless-title').textContent = `HEADLESS SCRIPT EXECUTION — ${specDef.displayName}`;
    document.getElementById('headless-output').textContent = JSON.stringify(runOut.result, null, 2);
    return;
  }

  // 4. Interactive Dev Panel Setup
  const specimenSelect = document.getElementById('dev-specimen-select');
  specimenSelect.innerHTML = '';
  Object.keys(content.specimens).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = content.specimens[id].displayName;
    specimenSelect.appendChild(opt);
  });
  if (content.specimens['dire_wolf']) {
    specimenSelect.value = 'dire_wolf';
  } else if (content.specimens['verdant_thorn_beast']) {
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

  // Dynamic checklists for severed parts and region damage based on selected specimen
  function refreshChecklists() {
    const specId = specimenSelect.value;
    const spec = content.specimens[specId];
    if (!spec) return;

    // Severed parts
    const severedContainer = document.getElementById('dev-severed-checklist');
    severedContainer.innerHTML = '';
    (spec.severable || []).forEach(part => {
      const lbl = document.createElement('label');
      lbl.className = 'checkbox-label';
      lbl.innerHTML = `<input type="checkbox" value="${part.id}" /> ${part.slotId || part.id}`;
      severedContainer.appendChild(lbl);
    });

    // Region damage controls
    const regionContainer = document.getElementById('dev-region-damage-controls');
    regionContainer.innerHTML = '';

    const resolved = resolveSpecimen(spec, content.templates);
    const uniqueRegions = Array.from(new Set(resolved.slots.map(s => s.region).filter(Boolean)));

    uniqueRegions.forEach(region => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '3px';

      const lbl = document.createElement('label');
      lbl.style.fontSize = '0.72rem';
      lbl.style.color = '#94a3b8';
      lbl.textContent = region.slice(0, 5).toUpperCase() + ':';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'dev-region-dmg-input';
      input.dataset.region = region;
      input.value = '0';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.style.width = '42px';
      input.style.padding = '2px 4px';
      input.style.fontSize = '0.75rem';

      wrapper.appendChild(lbl);
      wrapper.appendChild(input);
      regionContainer.appendChild(wrapper);
    });
  }

  specimenSelect.addEventListener('change', () => {
    refreshChecklists();
    startScene(buildInputFromForm());
  });
  refreshChecklists();

  // Audio Adapter
  const audioAdapter = createAudioAdapter({
    enabled: true,
    onLog: (line) => log(line)
  });

  document.getElementById('dev-audio-mute').addEventListener('change', (e) => {
    audioAdapter.setMuted(e.target.checked);
  });

  // Collapsible bottom telemetry log toggle
  const bottomPane = document.getElementById('harness-bottom-pane');
  const bottomToggleBar = document.getElementById('bottom-pane-toggle-bar');
  const bottomToggleIcon = document.getElementById('bottom-pane-toggle-icon');

  if (bottomToggleBar && bottomPane) {
    bottomToggleBar.addEventListener('click', () => {
      const isCollapsed = bottomPane.classList.toggle('is-collapsed');
      if (bottomToggleIcon) {
        bottomToggleIcon.textContent = isCollapsed ? '▲' : '▼';
      }
    });
  }

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

    const regionDamage = {};
    document.querySelectorAll('.dev-region-dmg-input').forEach(input => {
      const val = parseInt(input.value, 10) || 0;
      if (val > 0) {
        regionDamage[input.dataset.region] = val;
      }
    });

    const calories = parseInt(document.getElementById('dev-calories-input').value, 10);
    const surgerySkill = parseInt(document.getElementById('dev-skill-input').value, 10);
    const precisionBonus = parseInt(document.getElementById('dev-precision-input').value, 10);
    const sutures = parseInt(document.getElementById('dev-sutures-input').value, 10);
    const seed = parseInt(seedInput.value, 10) || 12345;
    const skipEntrance = document.getElementById('dev-skip-entrance').checked;
    const forceAllPresent = document.getElementById('dev-force-all-present').checked;
    const applySkillPresence = document.getElementById('dev-skill-presence')?.checked || false;
    const damageType = document.getElementById('dev-damage-type')?.value || 'normal';

    return {
      schemaVersion: 2,
      specimenId: specId,
      state,
      pulsePct,
      bloodPct,
      damage: {
        severedParts,
        regionDamage,
        damageType
      },
      player: {
        calories,
        maxCalories: Math.max(calories, 120),
        surgerySkill,
        precisionBonus,
        supplies: { sutures }
      },
      seed,
      options: {
        skipEntrance,
        forceAllPresent,
        applySkillPresence
      }
    };
  }

  // Body Inspector Drawer (Section 9)
  const inspectorDrawer = document.getElementById('harness-body-inspector');
  const inspectorTbody = document.getElementById('inspector-tbody');
  const toggleInspectorBtn = document.getElementById('dev-toggle-inspector-btn');
  const closeInspectorBtn = document.getElementById('close-inspector-btn');

  function updateInspectorView(bodyInstance, input) {
    if (!inspectorTbody || !bodyInstance) return;
    inspectorTbody.innerHTML = '';

    bodyInstance.items.forEach(item => {
      const tr = document.createElement('tr');
      const regDmg = input.damage?.regionDamage?.[item.slot.region] || 0;

      let statusReason = 'Normal';
      if (!item.present) {
        statusReason = item.slot.kind === 'trait' ? 'Absent (Hidden)' : `Absent (${(item.reason || 'mangled').toUpperCase()})`;
      } else if (item.taken) {
        statusReason = 'Severed (On Tray)';
      } else if (item.slot.tags && item.slot.tags.includes('fragile')) {
        statusReason = 'Fragile Tissue';
      }

      const biasStr = item.biasMult !== undefined && item.biasMult !== 1.0
        ? `<span style="font-family:monospace; color:${item.biasMult > 1.0 ? '#f43f5e' : '#10b981'}; font-weight:bold;">${item.damageType || 'bias'} x${item.biasMult}</span>`
        : '<span style="color:#64748b; font-size:0.75rem;">1.0x (Neutral)</span>';

      const calInfo = item.nutritionalCalories ? `<span style="color:#f59e0b; font-weight:bold; margin-left:4px;">(+${item.nutritionalCalories} Cal)</span>` : '';

      tr.innerHTML = `
        <td style="font-family:monospace; color:#38bdf8;">${item.slotId}</td>
        <td><span class="kind-badge kind-${item.slot.kind}">${item.slot.kind}</span></td>
        <td style="font-weight:bold; color:${item.present ? '#10b981' : '#f43f5e'}">${item.present ? 'YES' : 'NO'}</td>
        <td style="text-align:center;">${item.quantity}</td>
        <td style="font-family:monospace; font-weight:bold; color:${item.bodyCondition >= 60 ? '#10b981' : item.bodyCondition >= 30 ? '#f59e0b' : '#f43f5e'}">${item.bodyCondition}</td>
        <td style="text-align:center; color:${regDmg > 0 ? '#f43f5e' : '#64748b'}">${regDmg}%</td>
        <td style="text-align:center;">${biasStr}</td>
        <td style="font-size:0.75rem; color:#94a3b8;">${statusReason}${calInfo}</td>
      `;
      inspectorTbody.appendChild(tr);
    });
  }

  if (toggleInspectorBtn && inspectorDrawer) {
    toggleInspectorBtn.addEventListener('click', () => {
      const isVisible = inspectorDrawer.style.display !== 'none';
      inspectorDrawer.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible && currentSurgery?.getBody()) {
        updateInspectorView(currentSurgery.getBody(), lastUsedInput || buildInputFromForm());
      }
    });
  }

  if (closeInspectorBtn && inspectorDrawer) {
    closeInspectorBtn.addEventListener('click', () => {
      inspectorDrawer.style.display = 'none';
    });
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
      // Allow DOM to settle, then inspect body
      setTimeout(() => {
        if (currentSurgery?.getBody()) {
          updateInspectorView(currentSurgery.getBody(), input);
        }
      }, 50);

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

  document.getElementById('dev-reroll-btn').addEventListener('click', () => {
    seedInput.value = Math.floor(Math.random() * 900000 + 100000);
    startScene(buildInputFromForm());
  });

  document.getElementById('dev-force-all-present').addEventListener('change', () => {
    startScene(buildInputFromForm());
  });

  document.getElementById('dev-damage-type')?.addEventListener('change', () => {
    startScene(buildInputFromForm());
  });

  document.getElementById('dev-reset-btn')?.addEventListener('click', () => {
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
