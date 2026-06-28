// Grid Rendering, Selection, Detail Panel, and Viewer Management
import {
  state,
  SHAPES,
  applyParamsToSliders,
  setMountMode,
  announceChange,
  saveKnobs
} from './state.js';

// ─── WINDOW GLOBALS (for inline onclick handlers) ─────────────────
window.deleteKnob = deleteKnob;
window.sortBy = sortBy;
window.prevKnob = prevKnob;
window.nextKnob = nextKnob;
window.closeDetail = closeDetail;
window.closeViewer = closeViewer;
window.setGridSize = setGridSize;

// ─── SVG SHAPE ICONS ─────────────────────────────────────────────
export function svgForShape(s) {
  const cx = 11, cy = 11, r = 9;
  let path = '';
  if (s.wave) {
    const pts = [];
    for (let a = 0; a < 360; a += 10) {
      const rad = a * Math.PI / 180;
      const rr = r - 2 + Math.sin(a * 0.15) * 3;
      pts.push([cx + rr * Math.cos(rad), cy + rr * Math.sin(rad)]);
    }
    path = `<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
  } else if (s.star) {
    const pts = [];
    for (let i = 0; i < s.sides * 2; i++) {
      const ang = i * Math.PI / s.sides - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.5;
      pts.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
    }
    path = `<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
  } else {
    const pts = [];
    for (let i = 0; i < s.sides; i++) {
      const ang = i * 2 * Math.PI / s.sides - Math.PI / 2;
      pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    path = `<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
  }
  return `<svg viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
}

// ─── SORTING ─────────────────────────────────────────────────────
export function getSortedKnobs() {
  let list = [...state.knobs];
  if (state.sortMode === 'dia') list.sort((a,b) => b.outerD - a.outerD);
  if (state.sortMode === 'groove') list.sort((a,b) => b.texDepth - a.texDepth);
  return list;
}

function sortBy(mode) {
  state.sortMode = mode;
  document.querySelectorAll('.toolbar .btn-sm').forEach(b => {
    if (b.id?.startsWith('sort')) b.classList.remove('active');
  });
  document.getElementById('sort' + mode.charAt(0).toUpperCase() + mode.slice(1))?.classList.add('active');
  renderGrid();
}

// ─── GRID SIZE ───────────────────────────────────────────────────
function setGridSize(size) {
  state.gridSize = size;
  const grid = document.getElementById('knobGrid');
  if (grid) {
    grid.classList.remove('grid-sm', 'grid-md', 'grid-lg');
    grid.classList.add('grid-' + size);
  }
  ['sm', 'md', 'lg'].forEach(s => {
    const btn = document.getElementById('grid' + s.charAt(0).toUpperCase() + s.slice(1));
    if (btn) btn.classList.toggle('active', s === size);
  });
}

// ─── RENDER GRID ─────────────────────────────────────────────────
export function renderGrid() {
  let list = getSortedKnobs();
  const grid = document.getElementById('knobGrid');
  document.getElementById('countBadge').textContent = state.knobs.length + ' KNOB' + (state.knobs.length !== 1 ? 'S' : '');

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="big">0 KNOBS</div><div class="sub">Generate mutations or add current config</div></div>`;
    return;
  }

  grid.innerHTML = '';
  // Ensure grid size class is set
  grid.classList.remove('grid-sm', 'grid-md', 'grid-lg');
  grid.classList.add('grid-' + (state.gridSize || 'md'));

  list.forEach((k, index) => {
    const card = document.createElement('div');
    card.className = 'knob-card' + (k.id === state.selectedId ? ' selected' : '');
    card.onclick = () => selectKnob(k.id);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Knob ${k.id}`);
    card.setAttribute('data-index', index);
    k.cardEl = card;

    const shp = SHAPES.find(s => s.id === k.shape) || SHAPES[4];
    const mountClass = k.mountMode === 'slide' ? 'slide' : 'swap';

    card.innerHTML = `
      <div class="mount-badge ${mountClass}"></div>
      <div class="delete-btn" onclick="deleteKnob(event, '${k.id}')">✕</div>
      <div class="preview" style="background: transparent;">
        <!-- 3D rendered over this via WebGL scissor -->
      </div>
      <div class="slot-indicator">⌀${k.boreD.toFixed(1)}</div>
      <div class="card-pin"></div>
      <div class="groove-vis"></div>
      <div class="texture-badge">${(k.texMode || 'flutes').toUpperCase()}</div>
      <div class="card-info">
        <div class="card-id">${k.id}</div>
        <div class="card-dims">
          ${shp.label} · ⌀${k.outerD}mm · H${k.height}mm<br>
          ${(k.texMode || 'flutes').toUpperCase()} ${k.texDepth}d × ${k.texCount}n
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// ─── SELECTION & DETAIL ──────────────────────────────────────────
export function selectKnob(id) {
  const k = state.knobs.find(x => x.id === id);
  if (!k) return;
  state.selectedId = id;

  // Reset detail view rotation/zoom for new selection
  state.detailEuler = { x: -Math.PI / 2, y: 0 };
  state.detailZoom = 1.0;

  renderGrid();

  applyParamsToSliders(k);
  if (k.mountMode) {
    setMountMode(k.mountMode);
  }

  const panel = document.getElementById('detailPanel');
  const shp = SHAPES.find(s => s.id === k.shape);
  document.getElementById('dpTitle').textContent = k.id;
  document.getElementById('dpSub').textContent = shp?.label + ' — ' + (k.texMode || 'flutes').toUpperCase() + ' TEXTURE';

  const rows = [
    ['Shape', shp?.label + (k.star ? ' STAR' : k.wave ? ' WAVE' : '')],
    ['Outer Ø', k.outerD + ' mm'],
    ['Height', k.height + ' mm'],
    ['Taper', (k.taper * 100).toFixed(0) + '%'],
    ['Texture Mode', (k.texMode || 'flutes').toUpperCase()],
    ['Texture Depth', k.texDepth + ' mm'],
    ['Texture Scale', k.texScale + ' mm'],
    ['Texture Count', k.texCount + '×'],
    ['Bore Ø', k.boreD.toFixed(1) + ' mm'],
    ['Slot Depth', k.slotH + ' mm'],
    ['Clearance', k.clearance + ' mm'],
    ['Set Screw', k.setScrew === 'none' ? 'NONE' : k.setScrew.toUpperCase()],
    ['Mount', (k.mountMode || 'swap').toUpperCase()],
  ];

  document.getElementById('dpRows').innerHTML = rows.map(([k2,v]) =>
    `<div class="detail-row"><span class="dk">${k2}</span><span class="dv">${v}</span></div>`
  ).join('');

  panel.classList.add('open');
  document.querySelector('.main').classList.add('detail-open');
  announceChange(`Selected knob ${id}`);
}

export function closeDetail() {
  document.getElementById('detailPanel').classList.remove('open');
  document.querySelector('.main').classList.remove('detail-open');
  state.selectedId = null;
  renderGrid();
}

function prevKnob() {
  if (!state.selectedId) return;
  let list = getSortedKnobs();
  let idx = list.findIndex(k => k.id === state.selectedId);
  if (idx > 0) selectKnob(list[idx - 1].id);
}

function nextKnob() {
  if (!state.selectedId) return;
  let list = getSortedKnobs();
  let idx = list.findIndex(k => k.id === state.selectedId);
  if (idx !== -1 && idx < list.length - 1) selectKnob(list[idx + 1].id);
}

function deleteKnob(e, id) {
  e.stopPropagation();
  const btn = e.currentTarget;
  if (btn.textContent === '✕') {
    btn.textContent = '?';
    btn.style.background = 'rgba(255, 255, 0, 0.2)';
    btn.style.color = 'yellow';
    setTimeout(() => {
      if (btn && btn.textContent === '?') {
        btn.textContent = '✕';
        btn.style.background = 'rgba(255, 0, 0, 0.1)';
        btn.style.color = 'var(--danger)';
      }
    }, 3000);
    return;
  }

  const idx = state.knobs.findIndex(x => x.id === id);
  if (idx !== -1) {
    let k = state.knobs[idx];
    if (k.mesh) {
      k.mesh.geometry.dispose();
      k.mesh.material.dispose();
    }
    state.knobs.splice(idx, 1);
    if (state.selectedId === id) closeDetail();
    renderGrid();
    saveKnobs();
    if (state.knobs.length === 0) closeViewer();
  }
}

// ─── VIEWER ──────────────────────────────────────────────────────
export function openViewer(selectId) {
  document.body.classList.add('view-mode');
  if (state.knobs.length > 0) selectKnob(selectId || getSortedKnobs()[0].id);
}

export function closeViewer() {
  document.body.classList.remove('view-mode');
}

// ─── KEYBOARD NAVIGATION ────────────────────────────────────────
export function initKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    // Only handle when not focused on input/select
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const grid = document.getElementById('knobGrid');
    if (!grid || state.knobs.length === 0) return;

    if (e.key === 'Escape') {
      if (state.selectedId) {
        closeDetail();
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Enter') {
      if (state.selectedId) {
        // Already selected — do nothing extra
      } else if (state.knobs.length > 0) {
        selectKnob(getSortedKnobs()[0].id);
        openViewer(getSortedKnobs()[0].id);
      }
      e.preventDefault();
      return;
    }

    if (!state.selectedId) return;

    const list = getSortedKnobs();
    const idx = list.findIndex(k => k.id === state.selectedId);
    if (idx === -1) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (idx < list.length - 1) {
        selectKnob(list[idx + 1].id);
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (idx > 0) {
        selectKnob(list[idx - 1].id);
        e.preventDefault();
      }
    }
  });
}
