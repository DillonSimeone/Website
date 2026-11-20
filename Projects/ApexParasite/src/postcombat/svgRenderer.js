/**
 * Apex Parasite - Post-Combat SVG Stage & Anatomical Renderer (Phase 2)
 * Renders the anatomy viewport, placeholder body contours, SVG hitboxes,
 * clamp nodes (living only), stump patches, ghost markers, and incision wounds in 1:1 art coordinate space.
 */

export function createStageRenderer({ specimenDef, lootDefs, input, bodyInstance }) {
  const [artW, artH] = specimenDef.art.size;

  // Build root container
  const container = document.createElement('div');
  container.className = 'surgery-stage-container';

  // Art image or fallback
  const artWrapper = document.createElement('div');
  artWrapper.className = 'surgery-art-wrapper';
  artWrapper.style.aspectRatio = `${artW} / ${artH}`;

  const img = document.createElement('img');
  img.className = 'surgery-anatomy-img';
  img.src = specimenDef.art.body || '';
  img.alt = specimenDef.displayName;
  img.style.display = 'none';

  // Placeholder SVG layer
  const placeholderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  placeholderSvg.setAttribute('viewBox', `0 0 ${artW} ${artH}`);
  placeholderSvg.setAttribute('class', 'surgery-placeholder-svg');
  placeholderSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Interactive overlay SVG layer
  const overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlaySvg.setAttribute('viewBox', `0 0 ${artW} ${artH}`);
  overlaySvg.setAttribute('class', 'surgery-overlay-svg');
  overlaySvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  if (specimenDef.art.body) {
    img.onload = () => {
      img.style.display = 'block';
      placeholderSvg.style.display = 'none';
    };
    img.onerror = () => {
      img.style.display = 'none';
      placeholderSvg.style.display = 'block';
    };
  } else {
    placeholderSvg.style.display = 'block';
  }

  artWrapper.appendChild(img);
  artWrapper.appendChild(placeholderSvg);
  artWrapper.appendChild(overlaySvg);
  container.appendChild(artWrapper);

  // Render fallback placeholder anatomy graphics
  renderPlaceholderAnatomy(placeholderSvg, specimenDef, artW, artH);

  // Groups in overlay SVG
  const severableGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  severableGroup.setAttribute('class', 'group-severable-stumps');

  const ghostGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  ghostGroup.setAttribute('class', 'group-ghost-markers');

  const woundGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  woundGroup.setAttribute('class', 'group-wounds');

  const leaderLinesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  leaderLinesGroup.setAttribute('class', 'group-leader-lines');

  const hitRegionsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  hitRegionsGroup.setAttribute('class', 'group-hit-regions');

  const clampsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  clampsGroup.setAttribute('class', 'group-clamp-points');

  // Clamp markers are NOT rendered on dead specimens (Section 6, Check 17)
  if (input.state === 'dead') {
    clampsGroup.style.display = 'none';
  }

  const debugGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  debugGroup.setAttribute('class', 'group-debug-overlay');
  debugGroup.style.display = 'none';

  overlaySvg.appendChild(severableGroup);
  overlaySvg.appendChild(ghostGroup);
  overlaySvg.appendChild(woundGroup);
  overlaySvg.appendChild(leaderLinesGroup);
  overlaySvg.appendChild(hitRegionsGroup);
  overlaySvg.appendChild(clampsGroup);
  overlaySvg.appendChild(debugGroup);

  // Initialize severable stump patches & ghost markers
  renderSeverableStumps(severableGroup, specimenDef, input);
  if (bodyInstance) {
    renderGhostMarkers(ghostGroup, bodyInstance);
  }

  return {
    element: container,
    artWrapper,
    overlaySvg,
    hitRegionsGroup,
    clampsGroup,
    woundGroup,
    ghostGroup,
    leaderLinesGroup,
    debugGroup,
    artSize: [artW, artH]
  };
}

/**
 * Render dark-fantasy SVG placeholder anatomy
 */
function renderPlaceholderAnatomy(svg, def, w, h) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <radialGradient id="bodyGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#141a24" stop-opacity="0.9" />
      <stop offset="80%" stop-color="#0a0d14" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#05070a" stop-opacity="1" />
    </radialGradient>
    <pattern id="diagGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 0 20 L 20 0 M 0 0 L 20 20" fill="none" stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.3" />
    </pattern>
  `;
  svg.appendChild(defs);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', w);
  bg.setAttribute('height', h);
  bg.setAttribute('fill', 'url(#bodyGlow)');
  svg.appendChild(bg);

  const grid = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  grid.setAttribute('width', w);
  grid.setAttribute('height', h);
  grid.setAttribute('fill', 'url(#diagGrid)');
  svg.appendChild(grid);

  const contour = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  if (def.kind === 'human') {
    contour.setAttribute('d', `
      M ${w * 0.5} ${h * 0.1}
      C ${w * 0.58} ${h * 0.12}, ${w * 0.58} ${h * 0.22}, ${w * 0.54} ${h * 0.26}
      C ${w * 0.7} ${h * 0.3}, ${w * 0.72} ${h * 0.45}, ${w * 0.65} ${h * 0.65}
      C ${w * 0.62} ${h * 0.75}, ${w * 0.6} ${h * 0.9}, ${w * 0.53} ${h * 0.95}
      C ${w * 0.51} ${h * 0.96}, ${w * 0.5} ${h * 0.8}, ${w * 0.5} ${h * 0.75}
      C ${w * 0.5} ${h * 0.8}, ${w * 0.49} ${h * 0.96}, ${w * 0.47} ${h * 0.95}
      C ${w * 0.4} ${h * 0.9}, ${w * 0.38} ${h * 0.75}, ${w * 0.35} ${h * 0.65}
      C ${w * 0.28} ${h * 0.45}, ${w * 0.3} ${h * 0.3}, ${w * 0.46} ${h * 0.26}
      C ${w * 0.42} ${h * 0.22}, ${w * 0.42} ${h * 0.12}, ${w * 0.5} ${h * 0.1} Z
    `);
  } else {
    contour.setAttribute('d', `
      M ${w * 0.25} ${h * 0.3}
      C ${w * 0.35} ${h * 0.18}, ${w * 0.65} ${h * 0.18}, ${w * 0.8} ${h * 0.35}
      C ${w * 0.88} ${h * 0.5}, ${w * 0.82} ${h * 0.7}, ${w * 0.72} ${h * 0.78}
      C ${w * 0.55} ${h * 0.84}, ${w * 0.4} ${h * 0.82}, ${w * 0.28} ${h * 0.7}
      C ${w * 0.18} ${h * 0.55}, ${w * 0.18} ${h * 0.4}, ${w * 0.25} ${h * 0.3} Z
    `);
  }

  contour.setAttribute('fill', '#0f172a');
  contour.setAttribute('stroke', '#334155');
  contour.setAttribute('stroke-width', '2');
  contour.setAttribute('stroke-dasharray', '8 4');
  svg.appendChild(contour);

  for (let i = 0; i < 5; i++) {
    const rib = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const yOff = h * 0.35 + i * (h * 0.08);
    rib.setAttribute('d', `M ${w * 0.4} ${yOff} Q ${w * 0.5} ${yOff - 15} ${w * 0.6} ${yOff}`);
    rib.setAttribute('fill', 'none');
    rib.setAttribute('stroke', '#1e293b');
    rib.setAttribute('stroke-width', '1.5');
    svg.appendChild(rib);
  }

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', w * 0.5);
  text.setAttribute('y', h * 0.08);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#f59e0b');
  text.setAttribute('font-family', 'monospace');
  text.setAttribute('font-size', '14');
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('letter-spacing', '2');
  text.setAttribute('opacity', '0.7');
  text.textContent = `[ SPECIMEN: ${def.displayName.toUpperCase()} ]`;
  svg.appendChild(text);
}

/**
 * Render severable cover shape stump patches (Section 8.2)
 */
function renderSeverableStumps(group, def, input) {
  group.innerHTML = '';
  const severedSet = new Set(input.damage?.severedParts || []);

  (def.severable || []).forEach(sev => {
    if (severedSet.has(sev.id) || severedSet.has(sev.slotId)) {
      const slot = def.slots?.find(s => s.id === sev.slotId);
      if (!slot) return;

      const [ax, ay] = slot.anchor;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'severed-stump-patch');

      const shape = createSvgShape(slot.hitShape, slot.anchor);
      shape.setAttribute('fill', '#05070a');
      shape.setAttribute('stroke', '#881337');
      shape.setAttribute('stroke-width', '2.5');
      g.appendChild(shape);

      const cross = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      cross.setAttribute('d', `M ${ax - 15} ${ay - 10} L ${ax + 15} ${ay + 10} M ${ax - 15} ${ay + 10} L ${ax + 15} ${ay - 10}`);
      cross.setAttribute('stroke', '#f43f5e');
      cross.setAttribute('stroke-width', '2');
      cross.setAttribute('opacity', '0.8');
      g.appendChild(cross);

      const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('x', ax);
      lbl.setAttribute('y', ay + 4);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('fill', '#f43f5e');
      lbl.setAttribute('font-family', 'monospace');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('font-weight', 'bold');
      lbl.textContent = 'SEVERED';
      g.appendChild(lbl);

      group.appendChild(g);
    }
  });
}

/**
 * Render dim ghost markers for absent non-trait slots (Section 3.2, 9, Check 5)
 */
function renderGhostMarkers(group, bodyInstance) {
  group.innerHTML = '';
  bodyInstance.items.forEach(item => {
    if (!item.present && item.slot.kind !== 'trait' && item.reason !== 'severed') {
      const [ax, ay] = item.slot.anchor;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'ghost-marker-node');
      g.setAttribute('opacity', '0.35');

      const shape = createSvgShape(item.slot.hitShape, item.slot.anchor);
      shape.setAttribute('fill', 'none');
      shape.setAttribute('stroke', '#475569');
      shape.setAttribute('stroke-width', '1.5');
      shape.setAttribute('stroke-dasharray', '4 4');
      g.appendChild(shape);

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', ax);
      txt.setAttribute('y', ay + 4);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', '#94a3b8');
      txt.setAttribute('font-family', 'monospace');
      txt.setAttribute('font-size', '9');
      txt.setAttribute('font-weight', 'bold');
      txt.textContent = (item.reason || 'Mangled').toUpperCase();
      g.appendChild(txt);

      group.appendChild(g);
    }
  });
}

/**
 * Helper to generate SVG element from hitShape and anchor
 */
export function createSvgShape(hitShape, anchor) {
  const [ax, ay] = anchor;
  if (!hitShape) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', ax);
    circle.setAttribute('cy', ay);
    circle.setAttribute('r', '25');
    return circle;
  }

  switch (hitShape.type) {
    case 'ellipse': {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      el.setAttribute('cx', ax);
      el.setAttribute('cy', ay);
      el.setAttribute('rx', hitShape.rx || 30);
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
      circle.setAttribute('r', '25');
      return circle;
    }
  }
}

/**
 * Render incision wound decal over organ anchor
 */
export function addIncisionWound(woundGroup, anchor, status = 'extracted') {
  const [ax, ay] = anchor;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', `incision-wound wound-${status}`);

  const slash = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  slash.setAttribute('d', `M ${ax - 22} ${ay - 12} Q ${ax} ${ay + 4} ${ax + 22} ${ay + 12}`);
  slash.setAttribute('fill', 'none');
  slash.setAttribute('stroke', status === 'destroyed' ? '#e11d48' : '#991b1b');
  slash.setAttribute('stroke-width', status === 'destroyed' ? '4.5' : '3.5');
  slash.setAttribute('stroke-linecap', 'round');
  g.appendChild(slash);

  const cavity = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  cavity.setAttribute('cx', ax);
  cavity.setAttribute('cy', ay);
  cavity.setAttribute('rx', status === 'destroyed' ? '18' : '12');
  cavity.setAttribute('ry', status === 'destroyed' ? '14' : '8');
  cavity.setAttribute('fill', '#020408');
  cavity.setAttribute('stroke', '#4c0519');
  cavity.setAttribute('stroke-width', '2');
  g.appendChild(cavity);

  woundGroup.appendChild(g);
}
