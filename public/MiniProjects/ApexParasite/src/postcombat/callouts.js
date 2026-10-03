/**
 * Apex Parasite - Post-Combat Radial Callout Tags & Leader Lines
 * Positions tags radially around the specimen, connects them via SVG leader lines,
 * and maintains synchronized hover/focus state between tags and body hit regions.
 */

import { RARITY_CONFIG } from '../types.js';

export function createCalloutManager({ stage, specimenDef, lootDefs, onAction, onHover }) {
  const { artWrapper, leaderLinesGroup, hitRegionsGroup, clampsGroup, artSize } = stage;
  const [artW, artH] = artSize;

  const calloutsContainer = document.createElement('div');
  calloutsContainer.className = 'surgery-callouts-container';
  artWrapper.appendChild(calloutsContainer);

  const organEntries = [];
  const clampEntries = [];

  // 1. Setup Clamps in SVG
  (specimenDef.clampPoints || []).forEach(clamp => {
    const [cx, cy] = clamp.anchor;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'clamp-node');
    g.setAttribute('data-clamp-id', clamp.id);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Clamp point: ${clamp.name}. Consumes 1 suture and 1 calorie.`);

    // Pulsing outer ring
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', cx);
    ring.setAttribute('cy', cy);
    ring.setAttribute('r', '18');
    ring.setAttribute('class', 'clamp-pulse-ring');
    g.appendChild(ring);

    // Inner target
    const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    core.setAttribute('cx', cx);
    core.setAttribute('cy', cy);
    core.setAttribute('r', '8');
    core.setAttribute('class', 'clamp-core-dot');
    g.appendChild(core);

    // Crosshairs
    const ch = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ch.setAttribute('d', `M ${cx - 12} ${cy} L ${cx + 12} ${cy} M ${cx} ${cy - 12} L ${cx} ${cy + 12}`);
    ch.setAttribute('class', 'clamp-crosshair');
    g.appendChild(ch);

    // Clamped graphic marker (hidden initially)
    const clampedGraphic = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    clampedGraphic.setAttribute('class', 'clamped-forceps-graphic');
    clampedGraphic.style.display = 'none';
    clampedGraphic.innerHTML = `
      <rect x="${cx - 14}" y="${cy - 5}" width="28" height="10" rx="3" fill="#38bdf8" stroke="#0284c7" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="3" fill="#ffffff"/>
    `;
    g.appendChild(clampedGraphic);

    // Tooltip text in SVG
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', cx);
    label.setAttribute('y', cy - 24);
    label.setAttribute('class', 'clamp-svg-label');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = `CLAMP: ${clamp.name}`;
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

  // 2. Setup Organs and Hit Regions
  // Calculate radial distribution for left/right columns to prevent overlap
  const leftOrgans = [];
  const rightOrgans = [];

  specimenDef.organs.forEach(organ => {
    const [ax] = organ.anchor;
    if (ax < artW * 0.5) {
      leftOrgans.push(organ);
    } else {
      rightOrgans.push(organ);
    }
  });

  // Sort each column by y-coordinate
  leftOrgans.sort((a, b) => a.anchor[1] - b.anchor[1]);
  rightOrgans.sort((a, b) => a.anchor[1] - b.anchor[1]);

  function positionColumn(organs, isLeft) {
    const count = organs.length;
    if (count === 0) return;
    const startPct = 12;
    const endPct = 88;
    const step = count > 1 ? (endPct - startPct) / (count - 1) : 0;

    organs.forEach((organ, idx) => {
      const targetYPct = count === 1 ? 50 : startPct + idx * step;
      createOrganCallout(organ, isLeft, targetYPct);
    });
  }

  function createOrganCallout(organ, isLeft, topPct) {
    const [ax, ay] = organ.anchor;
    const loot = lootDefs[organ.loot] || { name: organ.name, glyph: '🫀' };
    const rarityStyle = RARITY_CONFIG[organ.rarity] || RARITY_CONFIG.common;

    // SVG Hit Region
    const hitG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hitG.setAttribute('class', 'organ-hit-region');
    hitG.setAttribute('data-organ-id', organ.id);
    hitG.setAttribute('tabindex', '0');
    hitG.setAttribute('role', 'button');

    const shape = createSvgHitShape(organ.hitShape, organ.anchor);
    shape.setAttribute('class', 'organ-hit-shape');
    hitG.appendChild(shape);

    hitRegionsGroup.appendChild(hitG);

    // Callout Tag DOM Element
    const tag = document.createElement('button');
    tag.className = `callout-tag tag-${isLeft ? 'left' : 'right'} rarity-${organ.rarity}`;
    tag.style.top = `${topPct}%`;
    if (isLeft) {
      tag.style.left = '16px';
    } else {
      tag.style.right = '16px';
    }

    tag.innerHTML = `
      <div class="tag-header">
        <span class="tag-glyph">${loot.glyph || '🫀'}</span>
        <span class="tag-name">${organ.name}</span>
        <span class="tag-rarity" style="color: ${rarityStyle.color};">${organ.rarity.toUpperCase()}</span>
      </div>
      <div class="tag-body">
        <div class="tag-stat tag-success"><span class="stat-label">SUCC</span> <span class="val-success">--%</span></div>
        <div class="tag-stat tag-pulse"><span class="stat-label">PULSE</span> <span class="val-pulse">-${organ.pulseCost}</span></div>
        <div class="tag-stat tag-cal"><span class="stat-label">CAL</span> <span class="val-cal">--</span></div>
      </div>
      <div class="tag-badges"></div>
      <div class="tag-disable-reason"></div>
    `;

    calloutsContainer.appendChild(tag);

    // SVG Leader Line
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leader.setAttribute('class', 'leader-line');
    leaderLinesGroup.appendChild(leader);

    function updateLeaderLine() {
      const artRect = artWrapper.getBoundingClientRect();
      const tagRect = tag.getBoundingClientRect();

      if (artRect.width === 0) return;

      // Tag connection coordinate in SVG art coordinates
      const tagConnX = isLeft
        ? ((tagRect.right - artRect.left) / artRect.width) * artW
        : ((tagRect.left - artRect.left) / artRect.width) * artW;
      const tagConnY = ((tagRect.top + tagRect.height * 0.5 - artRect.top) / artRect.height) * artH;

      leader.setAttribute('x1', ax);
      leader.setAttribute('y1', ay);
      leader.setAttribute('x2', tagConnX);
      leader.setAttribute('y2', tagConnY);
    }

    // Interactive events
    const triggerExtract = () => {
      if (!tag.disabled) {
        onAction({ type: 'extract', id: organ.id });
      }
    };

    tag.addEventListener('click', triggerExtract);
    hitG.addEventListener('click', triggerExtract);
    hitG.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerExtract();
      }
    });

    const setHover = (hovered) => {
      tag.classList.toggle('tag-hovered', hovered);
      hitG.classList.toggle('region-hovered', hovered);
      leader.classList.toggle('leader-hovered', hovered);
      if (onHover) onHover(hovered ? { type: 'organ', id: organ.id, organ } : null);
    };

    tag.addEventListener('mouseenter', () => setHover(true));
    tag.addEventListener('mouseleave', () => setHover(false));
    hitG.addEventListener('mouseenter', () => setHover(true));
    hitG.addEventListener('mouseleave', () => setHover(false));

    organEntries.push({
      id: organ.id,
      def: organ,
      tag,
      hitG,
      leader,
      updateLeaderLine
    });
  }

  positionColumn(leftOrgans, true);
  positionColumn(rightOrgans, false);

  // Initial leader line layout and window resize listener
  const updateAllLeaders = () => {
    organEntries.forEach(entry => entry.updateLeaderLine());
  };
  requestAnimationFrame(updateAllLeaders);
  window.addEventListener('resize', updateAllLeaders);

  return {
    organEntries,
    clampEntries,
    updateAllLeaders,
    destroy() {
      window.removeEventListener('resize', updateAllLeaders);
      calloutsContainer.remove();
    }
  };
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
