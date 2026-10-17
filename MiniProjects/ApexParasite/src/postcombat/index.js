/**
 * Apex Parasite - Post-Combat Surgery View & Runtime (Phase 2)
 * Implementation of createSurgery({ root, audio, content, onLog }) -> { run(input), destroy() }
 */

import { CONFIG } from './config.js';
import { createSession } from './core.js';
import { createStageRenderer, addIncisionWound } from './svgRenderer.js';
import { createCalloutManager, getConditionBand } from './callouts.js';
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

    const templates = content.templates || {};
    const session = createSession(specimenDef, templates, content.loot, input);
    activeSession = session;
    const resolvedSpecimen = session.resolvedSpecimen;
    const bodyInstance = session.bodyInstance;

    // Build View Structure
    const overlay = document.createElement('div');
    overlay.className = 'postcombat-surgery-overlay';

    // 1. Persistent Top Chrome (Section 7 & 9)
    const topBar = document.createElement('div');
    topBar.className = 'surgery-top-bar';
    topBar.innerHTML = `
      <div class="top-meta">
        <div class="meta-specimen">${resolvedSpecimen.displayName.toUpperCase()}</div>
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
          <span class="t-val val-sac-count">${session.getState().extractedItems.length}</span>
        </div>
      </div>
    `;
    overlay.appendChild(topBar);

    // 2. Stage Renderer (Anatomy & SVG)
    stageRenderer = createStageRenderer({
      specimenDef: resolvedSpecimen,
      lootDefs: content.loot,
      input,
      bodyInstance
    });
    overlay.appendChild(stageRenderer.element);

    // 3. Persistent Bottom Controls (Ground/Severed Tray + Feast/Leave)
    const bottomBar = document.createElement('div');
    bottomBar.className = 'surgery-bottom-bar';
    bottomBar.innerHTML = `
      <div class="ground-loot-tray">
        <div class="ground-loot-label">LOOSE GEAR & SEVERED PARTS (FREE)</div>
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
      specimenDef: resolvedSpecimen,
      bodyInstance,
      lootDefs: content.loot,
      onAction: handleAction,
      onHover: handleHover
    });

    // Render initial ground/tray items
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

    // Two-step confirm logic for Feast/Leave (Section 7, Check 15)
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
        // Subtle audio feedback on hover if available
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
            log(`Clamp applied: ${ev.id}`);
            break;
          }

          case 'organ_extracted': {
            const entry = ev.entry;
            const slot = resolvedSpecimen.slots.find(s => s.id === ev.id);
            if (audio) {
              audio.cut();
              setTimeout(() => {
                audio.chime(entry.rarity || 'common');
              }, 120);
            }
            if (slot) {
              addIncisionWound(stageRenderer.woundGroup, slot.anchor, 'extracted');
              flyGlyphToSac(slot, entry.condition);
            }
            if (ev.roll) {
              const r = ev.roll;
              log(`[Cut Roll] ${ev.id}: skill=${r.skillScore}, diff=${r.difficulty}, margin=${r.margin.toFixed(2)}, u1=${r.u1.toFixed(3)}, u2=${r.u2.toFixed(3)}, cutFactor=${r.cutFactor.toFixed(3)}, fragile=${r.fragile.toFixed(2)}, flatlineMult=${r.flatlineMult.toFixed(2)} => cond=${r.condition}`);
            }
            log(`Extracted: ${slot?.name || ev.id} (Cond: ${entry.condition} - ${getConditionBand(entry.condition).label})`);

            // Micro-animation on feast button as carcass calories decrease
            const feastBtn = root.querySelector('.btn-feast');
            if (feastBtn) {
              feastBtn.classList.add('feast-cal-drop');
              setTimeout(() => feastBtn.classList.remove('feast-cal-drop'), 350);
            }
            break;
          }

          case 'organ_failed': {
            if (audio) audio.tear();
            const slot = resolvedSpecimen.slots.find(s => s.id === ev.id);
            if (slot) {
              addIncisionWound(stageRenderer.woundGroup, slot.anchor, 'destroyed');
              shatterGlyph(slot);
            }
            stageRenderer.artWrapper.classList.add('screen-shake');
            setTimeout(() => stageRenderer.artWrapper.classList.remove('screen-shake'), 400);
            if (ev.roll) {
              const r = ev.roll;
              log(`[Cut Roll] ${ev.id}: skill=${r.skillScore}, diff=${r.difficulty}, margin=${r.margin.toFixed(2)}, u1=${r.u1.toFixed(3)}, u2=${r.u2.toFixed(3)}, cutFactor=${r.cutFactor.toFixed(3)}, fragile=${r.fragile.toFixed(2)}, flatlineMult=${r.flatlineMult.toFixed(2)} => cond=${r.condition}`);
            }
            log(`Destroyed: ${slot?.name || ev.id} (Cond: ${ev.condition})`);
            break;
          }

          case 'organ_ruptured': {
            log(`Ruptured on flatline: ${ev.id}`);
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
            log('SPECIMEN FLATLINE — Tissues degrading');
            break;
          }

          case 'tray_taken': {
            if (audio) audio.chime('common');
            renderGroundLoot();
            log(`Collected from tray: ${ev.item.name || ev.id}`);
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
            if (ev.endedBy === 'feast') {
              log(`[Feast] Consumed remaining carcass biomass: +${ev.caloriesGained} Cal, +${ev.biomassExpGained} Biomass XP`);
            } else {
              log(`[Leave] Abandoned carcass without feasting (0 Cal gained)`);
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
        const bpm = 45 + (state.pulse / 100) * 65;
        const strength = 0.3 + (state.pulse / 100) * 0.7;
        audio.heartbeat(bpm, strength);
        stageRenderer.artWrapper.classList.add('body-breathing');
        stageRenderer.artWrapper.style.setProperty('--breathe-speed', `${60 / bpm}s`);
      }
    }

    function flyGlyphToSac(slot, condition) {
      const band = getConditionBand(condition);
      const flyer = document.createElement('div');
      flyer.className = 'flying-organ-glyph';
      flyer.textContent = '🩸';

      const artRect = stageRenderer.artWrapper.getBoundingClientRect();
      const sacRect = sacIcon.getBoundingClientRect();

      const [ax, ay] = slot.anchor;
      const startX = artRect.left + (ax / resolvedSpecimen.art.size[0]) * artRect.width;
      const startY = artRect.top + (ay / resolvedSpecimen.art.size[1]) * artRect.height;

      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;
      flyer.style.borderColor = band.color;
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

    function shatterGlyph(slot) {
      const flyer = document.createElement('div');
      flyer.className = 'shattering-organ-glyph';
      flyer.textContent = '✖';

      const artRect = stageRenderer.artWrapper.getBoundingClientRect();
      const [ax, ay] = slot.anchor;
      const startX = artRect.left + (ax / resolvedSpecimen.art.size[0]) * artRect.width;
      const startY = artRect.top + (ay / resolvedSpecimen.art.size[1]) * artRect.height;

      flyer.style.left = `${startX}px`;
      flyer.style.top = `${startY}px`;
      document.body.appendChild(flyer);

      setTimeout(() => flyer.remove(), 700);
    }

    function renderGroundLoot() {
      groundItemsEl.innerHTML = '';
      const state = session.getState();
      state.trayItems.forEach(item => {
        const btn = document.createElement('button');
        btn.className = `ground-loot-tile ${item.taken ? 'taken' : ''}`;
        btn.setAttribute('aria-label', `Collect ${item.name} (Free).`);
        btn.disabled = item.taken;

        const glyph = item.kind === 'part' ? '🦵' : '🎒';
        const condBadge = item.kind === 'part' ? `<span class="tray-cond-badge">${item.condition}%</span>` : '';
        btn.innerHTML = `
          <span class="ground-glyph">${glyph}</span>
          <span class="ground-name">${item.name}</span>
          ${condBadge}
          <span class="ground-status">${item.taken ? 'TAKEN' : 'TAKE (FREE)'}</span>
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
      // Count remaining unharvested present items
      let remainingCount = 0;
      bodyInstance.items.forEach(item => {
        if (item.present && !item.taken) {
          const resolved = state.extractedItems.some(o => o.slotId === item.slotId)
            || state.destroyedItems.some(o => o.slotId === item.slotId)
            || state.rupturedItems.some(o => o.slotId === item.slotId)
            || state.lostItems.some(o => o.slotId === item.slotId);
          if (!resolved) {
            remainingCount++;
          }
        }
      });

      // Two-step confirm if present items remain (Section 7, Check 15)
      if (remainingCount > 0 && confirmAction !== actionType) {
        confirmAction = actionType;
        const origText = actionType === 'feast' ? 'FEAST' : 'LEAVE';
        const origIcon = actionType === 'feast' ? '🩸' : '🚪';

        btnEl.querySelector('.btn-text').textContent = `CONFIRM: forfeit ${remainingCount} slots`;
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

      if (confirmTimer) clearTimeout(confirmTimer);
      handleAction({ type: actionType });
    }

    function syncUI() {
      const state = session.getState();

      calValEl.textContent = state.calories;
      suturesValEl.textContent = state.sutures;
      sacCountEl.textContent = state.extractedItems.length;

      // Pulse readout
      if (input.state === 'living') {
        pulseValEl.textContent = `${Math.round(state.pulse)}%`;
        if (state.flatlined || state.pulse <= 0) {
          pulseContainer.classList.add('is-flatline');
          flatlineBanner.style.display = 'block';
        }
      }

      // Update dynamic carcass feast calories
      const feastBtn = root.querySelector('.btn-feast');
      if (feastBtn && confirmAction !== 'feast') {
        const feastCal = state.remainingFeastCalories !== undefined ? state.remainingFeastCalories : (session.getRemainingFeastCalories ? session.getRemainingFeastCalories() : 0);
        feastBtn.querySelector('.btn-text').textContent = `FEAST (+${feastCal} Cal)`;
      }

      // Sync each slot tag
      calloutManager.slotEntries.forEach(entry => {
        const { id, slot, present, tag, hitG } = entry;
        if (!present) return; // Ghost tags are already static

        const isExtracted = state.extractedItems.some(o => o.slotId === id);
        const isDestroyed = state.destroyedItems.some(o => o.slotId === id);
        const isRuptured = state.rupturedItems.some(o => o.slotId === id);
        const isLost = state.lostItems.some(o => o.slotId === id);

        tag.classList.toggle('is-extracted', isExtracted);
        tag.classList.toggle('is-destroyed', isDestroyed);
        tag.classList.toggle('is-ruptured', isRuptured);
        tag.classList.toggle('is-lost', isLost);
        hitG.classList.toggle('is-extracted', isExtracted);
        hitG.classList.toggle('is-destroyed', isDestroyed);
        hitG.classList.toggle('is-ruptured', isRuptured);
        hitG.classList.toggle('is-lost', isLost);

        const badgesEl = tag.querySelector('.tag-badges');
        const reasonEl = tag.querySelector('.tag-disable-reason');
        badgesEl.innerHTML = '';
        reasonEl.textContent = '';

        if (isExtracted) {
          tag.disabled = true;
          const ext = state.extractedItems.find(o => o.slotId === id);
          const band = getConditionBand(ext.condition);
          badgesEl.innerHTML = `<span class="badge badge-success">${ext.condition}% ${band.label}</span>`;
          return;
        }

        if (isDestroyed) {
          tag.disabled = true;
          badgesEl.innerHTML = `<span class="badge badge-destroyed">DESTROYED</span>`;
          return;
        }

        if (isRuptured) {
          tag.disabled = true;
          badgesEl.innerHTML = `<span class="badge badge-ruptured">RUPTURED</span>`;
          return;
        }

        if (isLost) {
          tag.disabled = true;
          badgesEl.innerHTML = `<span class="badge badge-lost">FORFEITED</span>`;
          return;
        }

        // Live costs calculation
        const calCost = session.getSlotCalorieCost(slot);
        const pulseCost = session.getSlotPulseCost(slot);
        tag.querySelector('.val-cal').textContent = `${calCost}`;
        tag.querySelector('.val-pulse').textContent = slot.killsPulse ? '-100' : `-${pulseCost}`;
        tag.querySelector('.val-pulse').classList.toggle('kills-pulse-val', Boolean(slot.killsPulse));

        // Check if protected by applied clamp
        const isClamped = state.appliedClamps.some(cId => {
          const cp = resolvedSpecimen.clampPoints?.find(p => p.id === cId);
          return cp?.protects?.includes(slot.region);
        });
        tag.querySelector('.val-pulse').classList.toggle('discounted', isClamped && !slot.killsPulse);

        // Badges: FRAGILE, KILLS PULSE (N rot), REQUIRES
        entry.fragileRemainingCount = state.fragileRemaining;

        entry.syncBadges = () => {
          badgesEl.innerHTML = '';
          if (slot.tags?.includes('fragile')) {
            badgesEl.innerHTML += `<span class="badge badge-fragile">FRAGILE</span>`;
          }
          if (slot.killsPulse) {
            const rotCount = state.fragileRemaining;
            badgesEl.innerHTML += `<span class="badge badge-danger">KILLS PULSE (${rotCount} rot)</span>`;
          }
          if (slot.requires && slot.requires.length > 0) {
            const reqs = slot.requires.map(r => {
              const reqS = resolvedSpecimen.slots.find(s => s.id === r);
              return reqS?.name || r;
            }).join(', ');
            badgesEl.innerHTML += `<span class="badge badge-req">REQ: ${reqs}</span>`;
          }
        };

        if (!tag.classList.contains('confirming-kill-pulse')) {
          entry.syncBadges();
        }

        const check = session.canAct({ type: 'extract', id });
        if (!check.ok) {
          tag.disabled = true;
          tag.classList.add('is-disabled');
          reasonEl.textContent = check.reason;
        } else {
          tag.disabled = false;
          tag.classList.remove('is-disabled');
        }
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
  }

  return {
    run,
    destroy,
    getSession: () => activeSession,
    getBody: () => activeSession ? activeSession.bodyInstance : null
  };
}
