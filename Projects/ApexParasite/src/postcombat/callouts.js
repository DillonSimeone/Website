/**
 * Apex Parasite - Post-Combat Tactical Organ Reticles & Analysis HUD (Phase 2)
 * Clean single-source-of-truth HUD: interactive anatomical nodes on the body,
 * direct laser targeting line to the Organ Analysis HUD on hover, static hazard markers,
 * and an optional collapsible roster drawer to eliminate all screen clutter.
 */

import { RARITY_CONFIG } from '../types.js';
import { CONFIG } from './config.js';

export function getConditionBand(condition) {
  for (const band of CONFIG.CONDITION_BANDS) {
    if (condition >= band.min) {
      return band;
    }
  }
  return CONFIG.CONDITION_BANDS[CONFIG.CONDITION_BANDS.length - 1];
}

export function createCalloutManager({ stage, specimenDef, bodyInstance, lootDefs, onAction, onHover }) {
  const { element, artWrapper, leaderLinesGroup, hitRegionsGroup, clampsGroup, artSize } = stage;
  const [artW, artH] = artSize;

  const stageRoot = element || artWrapper;
  const calloutsContainer = document.createElement('div');
  calloutsContainer.className = 'surgery-callouts-container';
  stageRoot.appendChild(calloutsContainer);

  // Single Source of Truth: Tactical Organ Analysis HUD (Clean, no silly badges)
  const inspectionHud = document.createElement('div');
  inspectionHud.className = 'surgery-inspection-hud';
  inspectionHud.id = 'surgery-inspection-hud';
  inspectionHud.innerHTML = `
    <div class="hud-scanner-header">
      <span class="hud-scanner-title">ORGAN ANALYSIS</span>
    </div>
    <div class="hud-body-idle">
      <div class="hud-idle-icon">🔬</div>
      <div class="hud-idle-title">SPECIMEN DIAGNOSTIC READY</div>
      <div class="hud-idle-desc">Hover over any anatomical node on the specimen to inspect tissue integrity, surgical risk, and extraction telemetry.</div>
    </div>
    <div class="hud-body-active" style="display: none;">
      <div class="hud-active-top">
        <span class="hud-active-glyph">🫀</span>
        <div class="hud-active-meta">
          <div class="hud-active-name">Organ Name</div>
          <div class="hud-active-sub"><span class="hud-active-rarity">COMMON</span> • <span class="hud-active-region">THORAX</span></div>
        </div>
      </div>
      <div class="hud-cond-section">
        <div class="hud-cond-labels">
          <span class="hud-cond-title">TISSUE INTEGRITY</span>
          <span class="hud-cond-pct">80% FLAWLESS</span>
        </div>
        <div class="hud-cond-track">
          <div class="hud-cond-fill" style="width: 80%;"></div>
        </div>
      </div>
      <div class="hud-metrics-grid">
        <div class="hud-metric-box">
          <span class="metric-label">PULSE IMPACT</span>
          <span class="metric-val val-pulse-hud">-7</span>
        </div>
        <div class="hud-metric-box">
          <span class="metric-label">CALORIE DRAIN</span>
          <span class="metric-val val-cal-hud">8 CAL</span>
        </div>
      </div>
      <div class="hud-warnings-box"></div>
      <button class="hud-btn-harvest" type="button">
        <span class="btn-harvest-text">HARVEST ORGAN</span>
      </button>
    </div>
  `;
  calloutsContainer.appendChild(inspectionHud);

  // Collapsible Organ Roster Drawer (Keeps the screen 100% clean by default)
  const rosterDrawer = document.createElement('div');
  rosterDrawer.className = 'surgery-roster-drawer is-collapsed';
  rosterDrawer.innerHTML = `
    <button class="roster-drawer-toggle" type="button" title="Toggle Full Organ Checklist">
      <span class="toggle-icon">📋</span>
      <span class="toggle-label">ORGAN ROSTER</span>
    </button>
    <div class="roster-drawer-content">
      <div class="callouts-column callouts-column-left"></div>
      <div class="callouts-column callouts-column-right"></div>
    </div>
  `;
  calloutsContainer.appendChild(rosterDrawer);

  const drawerToggle = rosterDrawer.querySelector('.roster-drawer-toggle');
  drawerToggle.addEventListener('click', () => {
    rosterDrawer.classList.toggle('is-collapsed');
  });

  const columnLeft = rosterDrawer.querySelector('.callouts-column-left');
  const columnRight = rosterDrawer.querySelector('.callouts-column-right');

  const slotEntries = [];
  const clampEntries = [];
  let activeHoverEntry = null;

  // 1. Setup Clamps in SVG (Living only, Section 6)
  if (stage.clampsGroup.style.display !== 'none') {
    (specimenDef.clampPoints || []).forEach(clamp => {
      const [cx, cy] = clamp.anchor;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'clamp-node');
      g.setAttribute('data-clamp-id', clamp.id);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Clamp: ${clamp.name}. Protects: ${clamp.protects.join(', ')}.`);

      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', cx);
      ring.setAttribute('cy', cy);
      ring.setAttribute('r', '18');
      ring.setAttribute('class', 'clamp-pulse-ring');
      g.appendChild(ring);

      const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      core.setAttribute('cx', cx);
      core.setAttribute('cy', cy);
      core.setAttribute('r', '8');
      core.setAttribute('class', 'clamp-core-dot');
      g.appendChild(core);

      const ch = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      ch.setAttribute('d', `M ${cx - 12} ${cy} L ${cx + 12} ${cy} M ${cx} ${cy - 12} L ${cx} ${cy + 12}`);
      ch.setAttribute('class', 'clamp-crosshair');
      g.appendChild(ch);

      const clampedGraphic = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      clampedGraphic.setAttribute('class', 'clamped-forceps-graphic');
      clampedGraphic.style.display = 'none';
      clampedGraphic.innerHTML = `
        <rect x="${cx - 14}" y="${cy - 5}" width="28" height="10" rx="3" fill="#38bdf8" stroke="#0284c7" stroke-width="2"/>
        <circle cx="${cx}" cy="${cy}" r="3" fill="#ffffff"/>
      `;
      g.appendChild(clampedGraphic);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', cx);
      label.setAttribute('y', cy - 24);
      label.setAttribute('class', 'clamp-svg-label');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = `CLAMP: ${clamp.name.toUpperCase()}`;
      g.appendChild(label);

      const triggerClamp = () => onAction({ type: 'clamp', id: clamp.id });
      g.addEventListener('click', triggerClamp);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerClamp();
        }
      });

      g.addEventListener('mouseenter', () => {
        g.classList.add('hovered');
        if (onHover) onHover({ type: 'clamp', id: clamp.id, clamp });
      });
      g.addEventListener('mouseleave', () => {
        g.classList.remove('hovered');
        if (onHover) onHover(null);
      });

      clampsGroup.appendChild(g);
      clampEntries.push({ id: clamp.id, def: clamp, element: g, clampedGraphic });
    });
  }

  // 2. Partition items to Left or Right by anchor x relative to body center (Section 9)
  const leftItems = [];
  const rightItems = [];

  bodyInstance.items.forEach(item => {
    // Absent trait slots render nothing (Section 3.2, 9, Check 5)
    if (!item.present && item.slot.kind === 'trait') {
      return;
    }
    // Severed parts appear in tray, not anatomy (Section 7)
    if (item.reason === 'severed') {
      return;
    }

    const [ax] = item.slot.anchor;
    if (ax < artW * 0.5) {
      leftItems.push(item);
    } else {
      rightItems.push(item);
    }
  });

  // Sort by anchor y
  leftItems.sort((a, b) => a.slot.anchor[1] - b.slot.anchor[1]);
  rightItems.sort((a, b) => a.slot.anchor[1] - b.slot.anchor[1]);

  function populateColumn(items, isLeft) {
    const targetCol = isLeft ? columnLeft : columnRight;
    items.forEach(item => {
      createSlotCallout(item, isLeft, targetCol);
    });
  }

  function createSlotCallout(item, isLeft, parentCol) {
    const { slot, present, reason } = item;
    const bodyCondition = item.bodyCondition ?? 0;
    const [ax, ay] = slot.anchor;
    const rarityStyle = RARITY_CONFIG[slot.rarity] || RARITY_CONFIG.common;
    const band = getConditionBand(bodyCondition);

    // 1. SVG Hit Region (transparent clickable area)
    const hitG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hitG.setAttribute('class', `organ-hit-region ${!present ? 'is-absent' : ''}`);
    hitG.setAttribute('data-slot-id', slot.id);

    if (present) {
      hitG.setAttribute('tabindex', '0');
      hitG.setAttribute('role', 'button');
    }

    const shape = stage.createSvgShape ? stage.createSvgShape(slot.hitShape, slot.anchor) : createSvgHitShape(slot.hitShape, slot.anchor);
    shape.setAttribute('class', `organ-hit-shape ${!present ? 'hit-ghost' : ''}`);
    hitG.appendChild(shape);
    hitRegionsGroup.appendChild(hitG);

    // 2. SVG Anatomical Bio-Reticle Node
    const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodeG.setAttribute('class', `organ-reticle-node node-${slot.rarity} ${!present ? 'is-ghost-node' : ''}`);
    nodeG.setAttribute('data-slot-id', slot.id);

    if (present) {
      nodeG.setAttribute('tabindex', '0');
      nodeG.setAttribute('role', 'button');
      nodeG.setAttribute('aria-label', `${slot.name}: ${bodyCondition}% condition`);

      // Outer glow ring
      const outerRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outerRing.setAttribute('cx', ax);
      outerRing.setAttribute('cy', ay);
      outerRing.setAttribute('r', '20');
      outerRing.setAttribute('class', 'reticle-outer-ring');
      outerRing.setAttribute('stroke', slot.killsPulse ? '#f43f5e' : (rarityStyle.color || '#38bdf8'));
      nodeG.appendChild(outerRing);

      // Core background circle
      const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      core.setAttribute('cx', ax);
      core.setAttribute('cy', ay);
      core.setAttribute('r', '14');
      core.setAttribute('class', 'reticle-core-bg');
      nodeG.appendChild(core);

      // Static lethal hazard bracket centered directly over [ax, ay] (NO scale animations)
      if (slot.killsPulse) {
        const bracket = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        bracket.setAttribute('points', `${ax},${ay - 22} ${ax + 22},${ay} ${ax},${ay + 22} ${ax - 22},${ay}`);
        bracket.setAttribute('class', 'reticle-hazard-bracket');
        nodeG.appendChild(bracket);
      }

      // Organ icon/glyph
      const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      glyph.setAttribute('x', ax);
      glyph.setAttribute('y', ay + 4);
      glyph.setAttribute('class', 'reticle-glyph');
      glyph.setAttribute('text-anchor', 'middle');
      glyph.textContent = getGlyphForSlot(slot);
      nodeG.appendChild(glyph);
    } else {
      // Faint ghost reticle for mangled/absent slots
      const ghostCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ghostCircle.setAttribute('cx', ax);
      ghostCircle.setAttribute('cy', ay);
      ghostCircle.setAttribute('r', '13');
      ghostCircle.setAttribute('class', 'ghost-reticle-circle');
      nodeG.appendChild(ghostCircle);

      const cross = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      cross.setAttribute('d', `M ${ax - 7} ${ay - 7} L ${ax + 7} ${ay + 7} M ${ax - 7} ${ay + 7} L ${ax + 7} ${ay - 7}`);
      cross.setAttribute('class', 'ghost-reticle-cross');
      nodeG.appendChild(cross);
    }

    hitRegionsGroup.appendChild(nodeG);

    // 3. Compact DOM Callout Tag (inside Roster Drawer)
    const tag = document.createElement('button');
    tag.className = `callout-tag tag-${isLeft ? 'left' : 'right'} rarity-${slot.rarity} ${!present ? 'is-ghost' : ''}`;

    if (!present) {
      tag.disabled = true;
      tag.innerHTML = `
        <div class="tag-header">
          <span class="tag-glyph">🦴</span>
          <span class="tag-name">${slot.name}</span>
          <span class="tag-ghost-label">${(reason || 'Mangled').toUpperCase()}</span>
        </div>
      `;
    } else {
      const stackBadge = item.quantity > 1 ? `<span class="badge badge-stack">x${item.quantity}</span>` : '';
      tag.innerHTML = `
        <div class="tag-header">
          <span class="tag-glyph">${getGlyphForSlot(slot)}</span>
          <span class="tag-name">${slot.name}</span>
          <span class="tag-rarity" style="color: ${rarityStyle.color};">${slot.rarity.toUpperCase()}</span>
          ${stackBadge}
        </div>
        <div class="tag-condition-bar-container">
          <div class="condition-bar-track">
            <div class="condition-bar-fill" style="width: ${bodyCondition}%; background-color: ${band.color};"></div>
          </div>
          <div class="condition-band-label" style="color: ${band.color};">${band.label}</div>
        </div>
        <div class="tag-body">
          <div class="tag-stat tag-pulse"><span class="stat-label">PULSE</span> <span class="val-pulse ${slot.killsPulse ? 'kills-pulse-val' : ''}">${slot.killsPulse ? '-100' : `-${slot.pulseCost}`}</span></div>
          <div class="tag-stat tag-cal"><span class="stat-label">CAL</span> <span class="val-cal">--</span></div>
        </div>
        <div class="tag-badges"></div>
        <div class="tag-disable-reason"></div>
      `;
    }

    parentCol.appendChild(tag);

    // 4. SVG Leader Line (Draws directly to the Organ Analysis HUD on hover)
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leader.setAttribute('class', `leader-line ${!present ? 'leader-ghost' : ''}`);
    leaderLinesGroup.appendChild(leader);

    function updateLeaderLine() {
      const artRect = artWrapper.getBoundingClientRect();
      const hudRect = inspectionHud.getBoundingClientRect();
      if (artRect.width === 0 || hudRect.width === 0) return;

      const targetX = ((hudRect.left - artRect.left) / artRect.width) * artW;
      const targetY = ((hudRect.top + hudRect.height * 0.4 - artRect.top) / artRect.height) * artH;

      leader.setAttribute('x1', ax);
      leader.setAttribute('y1', ay);
      leader.setAttribute('x2', targetX);
      leader.setAttribute('y2', targetY);
    }

    // Interaction handler
    let confirmTimer = null;
    const triggerExtract = () => {
      if (tag.disabled || !present) return;

      if (slot.killsPulse && entry.fragileRemainingCount > 0) {
        if (!tag.classList.contains('confirming-kill-pulse')) {
          tag.classList.add('confirming-kill-pulse');
          const badgesEl = tag.querySelector('.tag-badges');
          badgesEl.innerHTML = `<span class="badge badge-confirm">CONFIRM: rot ${entry.fragileRemainingCount} fragile</span>`;
          if (confirmTimer) clearTimeout(confirmTimer);
          confirmTimer = setTimeout(() => {
            tag.classList.remove('confirming-kill-pulse');
            entry.syncBadges();
            confirmTimer = null;
          }, CONFIG.CONFIRM_TIMEOUT_MS);
          return;
        }
      }

      if (confirmTimer) clearTimeout(confirmTimer);
      tag.classList.remove('confirming-kill-pulse');
      onAction({ type: 'extract', id: slot.id });
    };

    tag.addEventListener('click', triggerExtract);
    hitG.addEventListener('click', triggerExtract);
    nodeG.addEventListener('click', triggerExtract);

    const onKeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerExtract();
      }
    };
    hitG.addEventListener('keydown', onKeydown);
    nodeG.addEventListener('keydown', onKeydown);

    const setHover = (hovered) => {
      tag.classList.toggle('tag-hovered', hovered);
      hitG.classList.toggle('region-hovered', hovered);
      nodeG.classList.toggle('reticle-hovered', hovered);
      leader.classList.toggle('leader-hovered', hovered);

      if (hovered) {
        activeHoverEntry = entry;
        renderInspectionHud(entry);
        updateLeaderLine();
      } else if (activeHoverEntry === entry) {
        activeHoverEntry = null;
        revertInspectionHud();
      }

      if (onHover) onHover(hovered ? { type: 'slot', id: slot.id, slot, item } : null);
    };

    tag.addEventListener('mouseenter', () => setHover(true));
    tag.addEventListener('mouseleave', () => setHover(false));
    hitG.addEventListener('mouseenter', () => setHover(true));
    hitG.addEventListener('mouseleave', () => setHover(false));
    nodeG.addEventListener('mouseenter', () => setHover(true));
    nodeG.addEventListener('mouseleave', () => setHover(false));

    const entry = {
      id: slot.id,
      item,
      slot,
      present,
      tag,
      hitG,
      nodeG,
      leader,
      isLeft,
      fragileRemainingCount: 0,
      updateLeaderLine,
      triggerExtract,
      syncBadges: () => {}
    };

    slotEntries.push(entry);
  }

  // Tactical Inspection HUD Renderers
  function renderInspectionHud(entry) {
    const { slot, item, present } = entry;
    const bodyCondition = item?.bodyCondition ?? 0;
    const idleView = inspectionHud.querySelector('.hud-body-idle');
    const activeView = inspectionHud.querySelector('.hud-body-active');

    idleView.style.display = 'none';
    activeView.style.display = 'block';

    const band = getConditionBand(bodyCondition);
    const rarityStyle = RARITY_CONFIG[slot.rarity] || RARITY_CONFIG.common;

    activeView.querySelector('.hud-active-glyph').textContent = getGlyphForSlot(slot);
    activeView.querySelector('.hud-active-name').textContent = slot.name;
    activeView.querySelector('.hud-active-rarity').textContent = slot.rarity.toUpperCase();
    activeView.querySelector('.hud-active-rarity').style.color = rarityStyle.color;
    activeView.querySelector('.hud-active-region').textContent = (slot.region || 'CARCASS').toUpperCase();

    // Fix condition display (never undefined)
    activeView.querySelector('.hud-cond-pct').textContent = `${bodyCondition}% ${band.label}`;
    activeView.querySelector('.hud-cond-pct').style.color = band.color;
    activeView.querySelector('.hud-cond-fill').style.width = `${bodyCondition}%`;
    activeView.querySelector('.hud-cond-fill').style.backgroundColor = band.color;

    const pulseEl = activeView.querySelector('.val-pulse-hud');
    if (slot.killsPulse) {
      pulseEl.textContent = '-100 (LETHAL)';
      pulseEl.className = 'metric-val val-pulse-hud val-pulse-kill';
    } else {
      pulseEl.textContent = `-${slot.pulseCost || 4}`;
      pulseEl.className = 'metric-val val-pulse-hud';
    }

    const calCost = entry.tag.querySelector('.val-cal')?.textContent || '--';
    activeView.querySelector('.val-cal-hud').textContent = `${calCost} CAL`;

    // Warnings list
    const warningsBox = activeView.querySelector('.hud-warnings-box');
    warningsBox.innerHTML = '';

    if (slot.killsPulse) {
      warningsBox.innerHTML += `<div class="hud-warning-pill warn-lethal">⚠ LETHAL: Flatlines specimen instantly</div>`;
    }
    if (slot.slotType === 'head' || slot.id === 'head') {
      warningsBox.innerHTML += `<div class="hud-warning-pill warn-mutual">⚠ DECAPITATION: Forfeits internal brain & eyes</div>`;
    }
    if (slot.slotType === 'brain' || slot.id === 'brain') {
      warningsBox.innerHTML += `<div class="hud-warning-pill warn-mutual">⚠ CRANIOTOMY: Forfeits intact mountable Head</div>`;
    }
    const isVolatile = slot.tags?.includes('toxic') || slot.tags?.includes('volatile') || slot.id.includes('bile') || slot.id.includes('venom');
    if (isVolatile) {
      warningsBox.innerHTML += `<div class="hud-warning-pill warn-caustic">☣ VOLATILE: Rupture damages adjacent tissue</div>`;
    }
    if (slot.tags?.includes('fragile')) {
      warningsBox.innerHTML += `<div class="hud-warning-pill warn-fragile">⚡ FRAGILE: Degrades rapidly on flatline</div>`;
    }

    const harvestBtn = activeView.querySelector('.hud-btn-harvest');
    harvestBtn.onclick = () => entry.triggerExtract();
    harvestBtn.disabled = entry.tag.disabled || !present;
  }

  function revertInspectionHud() {
    const idleView = inspectionHud.querySelector('.hud-body-idle');
    const activeView = inspectionHud.querySelector('.hud-body-active');
    idleView.style.display = 'block';
    activeView.style.display = 'none';
  }

  populateColumn(leftItems, true);
  populateColumn(rightItems, false);

  const updateAllLeaders = () => {
    slotEntries.forEach(entry => entry.updateLeaderLine());
  };
  requestAnimationFrame(updateAllLeaders);
  window.addEventListener('resize', updateAllLeaders);

  return {
    slotEntries,
    clampEntries,
    updateAllLeaders,
    destroy() {
      window.removeEventListener('resize', updateAllLeaders);
      calloutsContainer.remove();
    }
  };
}

function getGlyphForSlot(slot) {
  if (slot.slotType === 'head') return '💀';
  if (slot.slotType === 'leg') return '🦵';
  if (slot.slotType === 'arm') return '🦾';
  if (slot.slotType === 'tail') return '🦎';
  if (slot.slotType === 'eye') return '👁️';
  if (slot.slotType === 'brain') return '🧠';
  if (slot.slotType === 'carapace') return '🛡️';
  if (slot.slotType === 'torso') return '🫁';
  if (slot.killsPulse) return '🫀';
  return '🥩';
}

function createSvgHitShape(hitShape, anchor) {
  const [ax, ay] = anchor;
  if (!hitShape) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', ax);
    circle.setAttribute('cy', ay);
    circle.setAttribute('r', '30');
    return circle;
  }

  switch (hitShape.type) {
    case 'ellipse': {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      el.setAttribute('cx', ax);
      el.setAttribute('cy', ay);
      el.setAttribute('rx', hitShape.rx || 35);
      el.setAttribute('ry', hitShape.ry || 30);
      return el;
    }
    case 'rect': {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const w = hitShape.w || 60;
      const h = hitShape.h || 40;
      r.setAttribute('x', ax - w / 2);
      r.setAttribute('y', ay - h / 2);
      r.setAttribute('width', w);
      r.setAttribute('height', h);
      r.setAttribute('rx', '4');
      return r;
    }
    case 'polygon': {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const pts = (hitShape.points || []).map(p => `${p[0]},${p[1]}`).join(' ');
      poly.setAttribute('points', pts);
      return poly;
    }
    default: {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', ax);
      circle.setAttribute('cy', ay);
      circle.setAttribute('r', '30');
      return circle;
    }
  }
}
