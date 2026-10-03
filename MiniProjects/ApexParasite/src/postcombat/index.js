/**
 * Apex Parasite - Post-Combat Surgery View & Runtime
 * Implementation of createSurgery({ root, audio, content, onLog }) -> { run(input), destroy() }
 */

import { CONFIG } from './config.js';
import { createSession } from './core.js';
import { createStageRenderer, addIncisionWound } from './svgRenderer.js';
import { createCalloutManager } from './callouts.js';
import { validateSurgeryInput } from './validator.js';

export function createSurgery({ root, audio, content, onLog = null }) {
  let abortController = null;
  let activeSession = null;
  let currentResolve = null;
  let confirmTimer = null;
  let confirmAction = null;
  let stageRenderer = null;
  let calloutManager = null;
  let entranceTimer = null;

  function log(msg) {
    if (onLog) onLog(`[Surgery] ${msg}`);
  }

  function destroy() {
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
    if (entranceTimer) {
      clearTimeout(entranceTimer);
      entranceTimer = null;
    }
    if (audio) {
      audio.stop();
    }
    if (calloutManager) {
      calloutManager.destroy();
      calloutManager = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (root) {
      root.innerHTML = '';
    }
    activeSession = null;
    currentResolve = null;
    stageRenderer = null;
  }

  async function run(input) {
    destroy(); // Clean slate

    const inputValidation = validateSurgeryInput(input);
    if (!inputValidation.ok) {
      throw new Error(`Invalid SurgeryInput: ${inputValidation.errors.join(', ')}`);
    }

    const specimenDef = content.specimens[input.specimenId];
    if (!specimenDef) {
      throw new Error(`Unknown specimen id "${input.specimenId}"`);
    }

    abortController = new AbortController();
    const { signal } = abortController;

    const session = createSession(specimenDef, content.loot, input);
    activeSession = session;

    // Build View Structure
    const overlay = document.createElement('div');
    overlay.className = 'postcombat-surgery-overlay';

    // 1. Persistent Top Chrome (Section 7)
    const topBar = document.createElement('div');
    topBar.className = 'surgery-top-bar';
    topBar.innerHTML = `
      <div class="top-meta">
        <div class="meta-specimen">${specimenDef.displayName.toUpperCase()}</div>
        <div class="meta-status status-${input.state}">${input.state.toUpperCase()}</div>
      </div>
      <div class="top-vitals">
        <div class="pulse-meter-container ${input.state === 'dead' ? 'pulse-hidden' : ''}">
          <div class="pulse-ekg-line"></div>
          <div class="pulse-readout">
            <span class="pulse-label">PULSE</span>
            <span class="pulse-val">${session.getState().pulse}%</span>
          </div>
          <div class="flatline-banner">FLATLINE</div>
        </div>
      </div>
      <div class="top-telemetry">
        <div class="telemetry-item cal-item">
          <span class="t-glyph">⚡</span>
          <span class="t-label">CAL:</span>
          <span class="t-val val-calories">${session.getState().calories}</span>
        </div>
        <div class="telemetry-item suture-item">
          <span class="t-glyph">🪡</span>
          <span class="t-label">SUTURES:</span>
          <span class="t-val val-sutures">${session.getState().sutures}</span>
        </div>
        <div class="telemetry-item sac-item" id="carrier-sac-icon" title="Carrier Sac">
          <span class="t-glyph">🎒</span>
          <span class="t-val val-sac-count">${session.getState().extractedOrgans.length}</span>
        </div>
      </div>
    `;
    overlay.appendChild(topBar);

    // 2. Stage Renderer (Anatomy & SVG)
    stageRenderer = createStageRenderer({ specimenDef, lootDefs: content.loot, input });
    overlay.appendChild(stageRenderer.element);

    // 3. Persistent Bottom Controls (Ground loot + Feast / Leave)
    const bottomBar = document.createElement('div');
    bottomBar.className = 'surgery-bottom-bar';
    bottomBar.innerHTML = `
      <div class="ground-loot-tray">
        <div class="ground-loot-label">SEVERED PARTS (FREE)</div>
        <div class="ground-loot-items"></div>
      </div>
      <div class="action-buttons-group">
        <button class="surgery-btn btn-feast" aria-label="Feast upon specimen biomass">
          <span class="btn-icon">🩸</span>
          <span class="btn-text">FEAST</span>
        </button>
        <button class="surgery-btn btn-leave" aria-label="Abandon remaining carcass">
          <span class="btn-icon">🚪</span>
          <span class="btn-text">LEAVE</span>
        </button>
      </div>
    `;
    overlay.appendChild(bottomBar);

    root.appendChild(overlay);

    // Elements cache
    const pulseContainer = topBar.querySelector('.pulse-meter-container');
    const pulseValEl = topBar.querySelector('.pulse-val');
    const flatlineBanner = topBar.querySelector('.flatline-banner');
    const calValEl = topBar.querySelector('.val-calories');
    const suturesValEl = topBar.querySelector('.val-sutures');
    const sacCountEl = topBar.querySelector('.val-sac-count');
    const sacIcon = topBar.querySelector('#carrier-sac-icon');
    const groundItemsEl = bottomBar.querySelector('.ground-loot-items');
    const feastBtn = bottomBar.querySelector('.btn-feast');
    const leaveBtn = bottomBar.querySelector('.btn-leave');

    // Setup Callout Manager
    calloutManager = createCalloutManager({
      stage: stageRenderer,
      specimenDef,
      lootDefs: content.loot,
      onAction: handleAction,
      onHover: handleHover
    });

    // Setup Ground Loot
    renderGroundLoot();

    // Audio initiation
    updateAudioVitals();

    // Entrance Animation (Section 7)
    if (!input.options?.skipEntrance) {
      stageRenderer.artWrapper.classList.add('entrance-tilt');
      const skipEntrance = () => {
        stageRenderer.artWrapper.classList.remove('entrance-tilt');
        if (entranceTimer) clearTimeout(entranceTimer);
        document.removeEventListener('keydown', onSpaceSkip);
        stageRenderer.artWrapper.removeEventListener('click', skipEntrance);
      };
      const onSpaceSkip = (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          skipEntrance();
        }
      };
      entranceTimer = setTimeout(skipEntrance, CONFIG.ENTRANCE_DURATION_MS);
      document.addEventListener('keydown', onSpaceSkip, { signal });
      stageRenderer.artWrapper.addEventListener('click', skipEntrance, { signal });
    }

    // Two-step confirm logic (Section 7, Check 15)
    feastBtn.addEventListener('click', () => requestEnd('feast', feastBtn), { signal });
    leaveBtn.addEventListener('click', () => requestEnd('leave', leaveBtn), { signal });

    // Initial UI synchronization
    syncUI();

    return new Promise((resolve) => {
      currentResolve = resolve;
    });

    // --- Inner Controller Functions ---

    function handleHover(info) {
      if (info && audio) {
        // Soft audio tick on hover
        // audio.chime('common') or silent
      }
    }

    function handleAction(action) {
      try {
        const events = session.act(action);
        handleEvents(events);
        syncUI();
      } catch (err) {
        log(`Action error: ${err.message}`);
      }
    }

    function handleEvents(events) {
      for (const ev of events) {
        switch (ev.type) {
          case 'clamped': {
            if (audio) audio.clamp();
            const clampItem = calloutManager.clampEntries.find(c => c.id === ev.id);
            if (clampItem) {
              clampItem.element.classList.add('is-clamped');
              clampItem.clampedGraphic.style.display = 'block';
            }
            log(`Clamp applied to ${ev.id}`);
            break;
          }

          case 'organ_extracted': {
            if (audio) {
              audio.cut();
              setTimeout(() => {
                const organ = specimenDef.organs.find(o => o.id === ev.id);
                audio.chime(organ?.rarity || 'common');
              }, 120);
            }
            const organ = specimenDef.organs.find(o => o.id === ev.id);
            addIncisionWound(stageRenderer.woundGroup, organ.anchor, 'extracted');
            flyGlyphToSac(organ, ev.quality);
            log(`Extracted ${organ.name} (${ev.quality})`);
            break;
          }

          case 'organ_failed': {
            if (audio) audio.tear();
            const organ = specimenDef.organs.find(o => o.id === ev.id);
            addIncisionWound(stageRenderer.woundGroup, organ.anchor, 'destroyed');
            shatterGlyph(organ);
            stageRenderer.artWrapper.classList.add('screen-shake');
            setTimeout(() => stageRenderer.artWrapper.classList.remove('screen-shake'), 400);
            log(`Destroyed ${organ.name}`);
            break;
          }

          case 'pulse_changed': {
            updatePulseDisplay(ev.from, ev.to);
            break;
          }

          case 'flatline': {
            if (audio) audio.flatline();
            pulseContainer.classList.add('is-flatline');
            flatlineBanner.style.display = 'block';
            stageRenderer.artWrapper.classList.add('body-limp');
            log('SPECIMEN FLATLINE');
            break;
          }

          case 'ground_taken': {
            if (audio) audio.chime('common');
            renderGroundLoot();
            log(`Ground loot taken: ${ev.id}`);
            break;
          }

          case 'ended': {
            if (audio) {
              if (ev.endedBy === 'feast') {
                audio.lap();
                stageRenderer.artWrapper.classList.add('feast-push');
              } else {
                audio.stop();
              }
            }
            setTimeout(() => {
              const res = session.result();
              destroy();
              if (currentResolve) currentResolve(res);
            }, 600);
            break;
          }
        }
      }
    }

    function updatePulseDisplay(from, to) {
      pulseValEl.textContent = `${Math.round(to)}%`;
      if (from - to >= 15) {
        pulseContainer.classList.add('pulse-drop-flash');
        setTimeout(() => pulseContainer.classList.remove('pulse-drop-flash'), 300);
      }
      updateAudioVitals();
    }

    function updateAudioVitals() {
      if (!audio) return;
      const state = session.getState();
      if (input.state === 'dead' || state.flatlined || state.pulse <= 0) {
        audio.stop();
        stageRenderer.artWrapper.classList.remove('body-breathing');
      } else {
        const bpm = 45 + (state.pulse / 100) * 65; // 45 to 110 BPM
        const strength = 0.3 + (state.pulse / 100) * 0.7;
        audio.heartbeat(bpm, strength);
        stageRenderer.artWrapper.classList.add('body-breathing');
        stageRenderer.artWrapper.style.setProperty('--breathe-speed', `${60 / bpm}s`);
      }
    }

    function flyGlyphToSac(organ, quality) {
      const loot = content.loot[organ.loot] || { glyph: '🫀' };
      const flyer = document.createElement('div');
      flyer.className = `flying-organ-glyph quality-${quality}`;
      flyer.textContent = loot.glyph;

      const artRect = stageRenderer.artWrapper.getBoundingClientRect();
      const sacRect = sacIcon.getBoundingClientRect();

      const [ax, ay] = organ.anchor;
      const startX = artRect.left + (ax / specimenDef.art.size[0]) * artRect.width;
      const startY = artRect.top + (ay / specimenDef.art.size[1]) * artRect.height;

      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;
      document.body.appendChild(flyer);

      requestAnimationFrame(() => {
        flyer.style.transform = `translate(${sacRect.left - startX}px, ${sacRect.top - startY}px) scale(0.6)`;
        flyer.style.opacity = '0';
      });

      setTimeout(() => {
        flyer.remove();
        sacIcon.classList.add('sac-pulse');
        setTimeout(() => sacIcon.classList.remove('sac-pulse'), 300);
      }, CONFIG.FLIGHT_ANIMATION_MS);
    }

    function shatterGlyph(organ) {
      const loot = content.loot[organ.loot] || { glyph: '🫀' };
      const flyer = document.createElement('div');
      flyer.className = 'shattering-organ-glyph';
      flyer.textContent = loot.glyph;

      const artRect = stageRenderer.artWrapper.getBoundingClientRect();
      const [ax, ay] = organ.anchor;
      const startX = artRect.left + (ax / specimenDef.art.size[0]) * artRect.width;
      const startY = artRect.top + (ay / specimenDef.art.size[1]) * artRect.height;

      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;
      document.body.appendChild(flyer);

      setTimeout(() => flyer.remove(), 700);
    }

    function renderGroundLoot() {
      groundItemsEl.innerHTML = '';
      const state = session.getState();
      state.groundLoot.forEach(item => {
        const loot = content.loot[item.loot] || { name: item.name, glyph: '🦞' };
        const btn = document.createElement('button');
        btn.className = `ground-loot-tile ${item.taken ? 'taken' : ''}`;
        btn.setAttribute('aria-label', `Ground loot: ${item.name}. Click to collect.`);
        btn.disabled = item.taken;
        btn.innerHTML = `
          <span class="ground-glyph">${loot.glyph}</span>
          <span class="ground-name">${item.name}</span>
          <span class="ground-status">${item.taken ? 'TAKEN' : 'TAKE (0 CAL)'}</span>
        `;
        btn.addEventListener('click', () => {
          if (!item.taken) {
            handleAction({ type: 'take', id: item.id });
          }
        });
        groundItemsEl.appendChild(btn);
      });
    }

    function requestEnd(actionType, btnEl) {
      const state = session.getState();
      const totalOrgans = specimenDef.organs.length;
      const resolvedOrgans = state.extractedOrgans.length + state.destroyedOrgans.length + state.lostOrgans.length;
      const remainingCount = totalOrgans - resolvedOrgans;

      // If organs remain, require in-place two-step confirmation (Section 7, Check 15)
      if (remainingCount > 0 && confirmAction !== actionType) {
        confirmAction = actionType;
        const origText = actionType === 'feast' ? 'FEAST' : 'LEAVE';
        const origIcon = actionType === 'feast' ? '🩸' : '🚪';

        btnEl.querySelector('.btn-text').textContent = `CONFIRM: forfeit ${remainingCount} organs`;
        btnEl.classList.add('confirming');

        if (confirmTimer) clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          btnEl.querySelector('.btn-text').textContent = origText;
          btnEl.querySelector('.btn-icon').textContent = origIcon;
          btnEl.classList.remove('confirming');
          confirmAction = null;
          confirmTimer = null;
        }, CONFIG.CONFIRM_TIMEOUT_MS);
        return;
      }

      // Confirmed
      if (confirmTimer) clearTimeout(confirmTimer);
      handleAction({ type: actionType });
    }

    function syncUI() {
      const state = session.getState();

      calValEl.textContent = state.calories;
      suturesValEl.textContent = state.sutures;
      sacCountEl.textContent = state.extractedOrgans.length;

      // Pulse readout
      if (input.state === 'living') {
        pulseValEl.textContent = `${Math.round(state.pulse)}%`;
        if (state.flatlined || state.pulse <= 0) {
          pulseContainer.classList.add('is-flatline');
          flatlineBanner.style.display = 'block';
        }
      }

      // Sync each organ callout tag
      calloutManager.organEntries.forEach(entry => {
        const { id, def, tag, hitG } = entry;
        const check = session.canAct({ type: 'extract', id });

        const isExtracted = state.extractedOrgans.some(o => o.id === id);
        const isDestroyed = state.destroyedOrgans.some(o => o.id === id);
        const isLost = state.lostOrgans.some(o => o.id === id);

        tag.classList.toggle('is-extracted', isExtracted);
        tag.classList.toggle('is-destroyed', isDestroyed);
        tag.classList.toggle('is-lost', isLost);
        hitG.classList.toggle('is-extracted', isExtracted);
        hitG.classList.toggle('is-destroyed', isDestroyed);
        hitG.classList.toggle('is-lost', isLost);

        const badgesEl = tag.querySelector('.tag-badges');
        const reasonEl = tag.querySelector('.tag-disable-reason');
        badgesEl.innerHTML = '';
        reasonEl.textContent = '';

        if (isExtracted) {
          tag.disabled = true;
          const ext = state.extractedOrgans.find(o => o.id === id);
          badgesEl.innerHTML = `<span class="badge badge-success">${(ext.quality || 'intact').toUpperCase()}</span>`;
          return;
        }

        if (isDestroyed) {
          tag.disabled = true;
          badgesEl.innerHTML = `<span class="badge badge-destroyed">DESTROYED</span>`;
          return;
        }

        if (isLost) {
          tag.disabled = true;
          badgesEl.innerHTML = `<span class="badge badge-lost">NECROSIS</span>`;
          return;
        }

        // Live calculation of effective costs and success %
        const calCost = CONFIG.RARITY_CALORIE_COST[def.rarity] || 1;
        const pulseCost = session.getOrganPulseCost(def);
        tag.querySelector('.val-cal').textContent = `${calCost}`;
        tag.querySelector('.val-pulse').textContent = `-${pulseCost}`;

        if (def.slowedByClamp && def.slowedByClamp.some(cId => state.appliedClamps.includes(cId))) {
          tag.querySelector('.val-pulse').classList.add('discounted');
        }

        // Badges
        if (def.tags?.includes('fragile')) {
          badgesEl.innerHTML += `<span class="badge badge-fragile">FRAGILE</span>`;
        }
        if (def.killsPulse) {
          badgesEl.innerHTML += `<span class="badge badge-danger">KILLS PULSE</span>`;
        }
        if (def.requires && def.requires.length > 0) {
          const reqs = def.requires.map(r => {
            const reqO = specimenDef.organs.find(o => o.id === r);
            return reqO?.name || r;
          }).join(', ');
          badgesEl.innerHTML += `<span class="badge badge-req">REQ: ${reqs}</span>`;
        }

        if (!check.ok) {
          tag.disabled = true;
          tag.classList.add('is-disabled');
          reasonEl.textContent = check.reason;
        } else {
          tag.disabled = false;
          tag.classList.remove('is-disabled');
        }

        // Effective success rate preview
        const effSuccess = calculateLiveSuccessPct(def, state, input);
        tag.querySelector('.val-success').textContent = `${Math.round(effSuccess)}%`;

        tag.setAttribute('aria-label', `${def.name} (${def.rarity}). Success: ${Math.round(effSuccess)}%. Pulse cost: ${pulseCost}. Calorie cost: ${calCost}. ${check.reason ? 'Disabled: ' + check.reason : 'Ready to extract'}`);
      });

      // Sync Clamps
      calloutManager.clampEntries.forEach(entry => {
        const { id, element } = entry;
        const isClamped = state.appliedClamps.includes(id);
        const check = session.canAct({ type: 'clamp', id });

        element.classList.toggle('is-clamped', isClamped);
        element.classList.toggle('is-disabled', !check.ok && !isClamped);
      });

      calloutManager.updateAllLeaders();
    }

    function calculateLiveSuccessPct(organ, state, inp) {
      const surgerySkill = inp.player.surgerySkill || 0;
      const precisionBonus = inp.player.precisionBonus || 0;
      const rarityPenalty = CONFIG.RARITY_PENALTY[organ.rarity] || 0;
      const isWounded = inp.damage?.woundedRegions?.includes(organ.region);
      const woundPenalty = isWounded ? CONFIG.WOUND_PENALTY : 0;

      let fragilePenalty = 0;
      if (organ.tags?.includes('fragile') && inp.state === 'living' && state.pulse < CONFIG.FRAGILE_PULSE_THRESHOLD) {
        fragilePenalty = (CONFIG.FRAGILE_PULSE_THRESHOLD - state.pulse) / 2;
      }

      let successPct = organ.baseSuccessPct
        + CONFIG.SKILL_BONUS * surgerySkill
        + precisionBonus
        - rarityPenalty
        - woundPenalty
        - fragilePenalty;

      return Math.max(CONFIG.SUCCESS_PCT_MIN, Math.min(CONFIG.SUCCESS_PCT_MAX, successPct));
    }
  }

  return {
    run,
    destroy
  };
}
