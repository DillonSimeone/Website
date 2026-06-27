// UI Event Handlers and Configurator Orchestration
import {
  state,
  SHAPES,
  getParams,
  updateAllDisplays,
  updateParamDisplay,
  announceChange,
  playToneForParam,
  triggerHapticFeedback,
  applyParamsToSliders,
  encodeParams,
  decodeParams
} from './state.js';
import {
  initThree,
  generateKnobManifold,
  manifoldToThreeMesh,
  setRenderMode
} from './geometry.js';
import { modelToSTL } from '../../00-CommonParts/Exporter/stl.js';
import { getLaserSVG } from '../../00-CommonParts/Exporter/svg.js';

// Setup Global Helpers and Bind Hooks to window so HTML inline click handlers work
window.sortBy = sortBy;
window.setRenderMode = setRenderMode;
window.confirmPurgeAll = confirmPurgeAll;
window.triggerStlImport = triggerStlImport;
window.handleStlImport = handleStlImport;
window.exportBatchSTL = exportBatchSTL;
window.exportJSON = exportJSON;
window.exportCSV = exportCSV;
window.exportOpenSCAD = exportOpenSCAD;
window.prevKnob = prevKnob;
window.nextKnob = nextKnob;
window.exportSingleSTL = exportSingleSTL;
window.openLaserModal = openLaserModal;
window.closeLaserModal = closeLaserModal;
window.generateLaserSVG = generateLaserSVG;
window.copyShareLink = copyShareLink;
window.closeDetail = closeDetail;
window.prevKnob = prevKnob;
window.nextKnob = nextKnob;
window.updateShaftType = updateShaftType;
window.toggleMountMode = toggleMountMode;
window.runMutation = runMutation;
window.addSingle = addSingle;
window.clearAll = clearAll;
window.stepInput = stepInput;

window.addEventListener('DOMContentLoaded', init);

async function init() {
  await initThree();
  
  // Build shape buttons
  const grid = document.getElementById('shapeGrid');
  SHAPES.forEach(s => {
    const btn = document.createElement('div');
    btn.className = 'shape-btn' + (s.id === state.activeShape ? ' active' : '');
    btn.innerHTML = `${svgForShape(s)}<span>${s.label}</span>`;
    btn.onclick = () => selectShape(s.id);
    btn.id = 'sbtn_' + s.id;
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', s.label + ' shape profile');
    
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectShape(s.id);
      }
    });
    
    grid.appendChild(btn);
  });

  // Wire sliders
  document.querySelectorAll('input[type=range]').forEach(r => {
    r.addEventListener('input', () => {
      updateParamDisplay(r);
      playToneForParam(r.id, +r.value);
      triggerHapticFeedback();
    });
  });

  // Wire numeric inputs
  document.querySelectorAll('.param input[type=number].val').forEach(numEl => {
    numEl.addEventListener('input', () => {
      const rId = numEl.id.replace('v_', '');
      const r = document.getElementById(rId);
      if (!r) return;
      
      let val = parseFloat(numEl.value);
      if (isNaN(val)) return;
      
      const mapBack = {
        outerD: v => v,
        height: v => v,
        taper: v => Math.round(v * 100),
        texDepth: v => Math.round(v * 10),
        texScale: v => Math.round(v * 10),
        texCount: v => v,
        boreD: v => v,
        slotH: v => v,
        clearance: v => Math.round(v * 10),
      };
      
      const fn = mapBack[rId];
      if (fn) {
        let sliderVal = fn(val);
        const min = parseFloat(r.min);
        const max = parseFloat(r.max);
        sliderVal = Math.max(min, Math.min(max, sliderVal));
        r.value = sliderVal;
        
        if (rId === 'outerD') {
          const select = document.getElementById('outerDSelect');
          if (select) {
            if (['19', '25', '32'].includes(String(sliderVal))) {
              select.value = String(sliderVal);
              document.getElementById('outerDSliderContainer').style.display = 'none';
            } else {
              select.value = 'custom';
              document.getElementById('outerDSliderContainer').style.display = 'block';
            }
          }
        }
        
        playToneForParam(rId, sliderVal);
        triggerHapticFeedback();
      }
    });

    numEl.addEventListener('blur', () => {
      const rId = numEl.id.replace('v_', '');
      const r = document.getElementById(rId);
      if (r) {
        updateParamDisplay(r);
      }
    });
  });

  // Wire outer diameter select
  document.getElementById('outerDSelect')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const container = document.getElementById('outerDSliderContainer');
    const input = document.getElementById('outerD');
    if (val === 'custom') {
      if (container) container.style.display = 'block';
    } else {
      if (container) container.style.display = 'none';
      if (input) {
        input.value = val;
        updateParamDisplay(input);
        playToneForParam('outerD', +val);
        triggerHapticFeedback();
      }
    }
  });

  // Wire synth preset select
  document.getElementById('synthPreset')?.addEventListener('change', (e) => {
    const preset = e.target.value;
    if (preset === 'custom') return;
    
    if (preset === 'wh148') {
      setMountMode('swap');
      state.activeShape = 'cyl';
      selectShape('cyl');
      document.getElementById('outerDSelect').value = 'custom';
      document.getElementById('outerDSliderContainer').style.display = 'block';
      document.getElementById('outerD').value = 15;
      document.getElementById('height').value = 12;
      document.getElementById('taper').value = 80;
      document.getElementById('textureMode').value = 'smooth';
      document.getElementById('texDepth').value = 15;
      document.getElementById('texScale').value = 15;
      document.getElementById('texCount').value = 8;
      document.getElementById('shaftType').value = 'knurled';
      document.getElementById('slotH').value = 6;
    } else if (preset === 'eurorack') {
      setMountMode('swap');
      state.activeShape = 'hex';
      selectShape('hex');
      document.getElementById('outerDSelect').value = 'custom';
      document.getElementById('outerDSliderContainer').style.display = 'block';
      document.getElementById('outerD').value = 18;
      document.getElementById('height').value = 16;
      document.getElementById('taper').value = 90;
      document.getElementById('textureMode').value = 'flutes';
      document.getElementById('texDepth').value = 20;
      document.getElementById('texScale').value = 20;
      document.getElementById('texCount').value = 10;
    } else if (preset === 'prophet') {
      setMountMode('swap');
      state.activeShape = 'cyl';
      selectShape('cyl');
      document.getElementById('outerDSelect').value = 'custom';
      document.getElementById('outerDSliderContainer').style.display = 'block';
      document.getElementById('outerD').value = 24;
      document.getElementById('height').value = 18;
      document.getElementById('taper').value = 85;
      document.getElementById('textureMode').value = 'flutes';
      document.getElementById('texDepth').value = 25;
      document.getElementById('texScale').value = 25;
      document.getElementById('texCount').value = 8;
    } else if (preset === 'microfreak') {
      setMountMode('slide');
      state.activeShape = 'hex';
      selectShape('hex');
      document.getElementById('outerDSelect').value = 'custom';
      document.getElementById('outerDSliderContainer').style.display = 'block';
      document.getElementById('outerD').value = 35;
      document.getElementById('height').value = 25;
      document.getElementById('taper').value = 85;
      document.getElementById('textureMode').value = 'scallops';
      document.getElementById('texDepth').value = 30;
      document.getElementById('texScale').value = 30;
      document.getElementById('texCount').value = 6;
      document.getElementById('boreD').value = 21.0;
      document.getElementById('slotH').value = 16;
      document.getElementById('clearance').value = 3;
      document.getElementById('setScrew').value = 'm3';
    }
    
    updateAllDisplays();
    announceChange(`Preset ${preset} loaded. Parameters updated.`);
    triggerHapticFeedback();
    playToneForParam('outerD', +document.getElementById('outerD').value);
  });

  updateAllDisplays();
  initDragAndDrop();

  // Load configuration from URL if present
  const urlParams = new URLSearchParams(window.location.search);
  const cfg = urlParams.get('cfg');
  if (cfg) {
    const decoded = decodeParams(cfg);
    if (decoded) {
      applyParamsToSliders(decoded);
      if (decoded.mountMode) {
        setMountMode(decoded.mountMode);
      }
      
      decoded.id = 'K' + Date.now().toString(16).slice(-4).toUpperCase() + '-SHARED';
      const sd = SHAPES.find(x => x.id === decoded.shape);
      decoded.sides = sd?.sides ?? 6;
      decoded.star = sd?.star ?? false;
      decoded.wave = sd?.wave ?? false;
      
      document.getElementById('countBadge').textContent = "GENERATING 3D...";
      try {
        let model = await generateKnobManifold(decoded);
        decoded.mesh = manifoldToThreeMesh(model, 0xc8ff00, decoded);
        decoded.mesh.rotation.x = -Math.PI / 2;
        model.delete();
        
        state.knobs.push(decoded);
        state.selectedId = decoded.id;
        renderGrid();
        openViewer(decoded.id);
      } catch (e) {
        console.error("Failed to load query params model:", e);
      }
    }
  }
}

function selectShape(id) {
  state.activeShape = id;
  document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sbtn_' + id)?.classList.add('active');
  const shp = SHAPES.find(x => x.id === id);
  if (shp) {
    announceChange(`Shape profile selected: ${shp.label}`);
    triggerHapticFeedback();
    playToneForParam('outerD', 30);
  }
}

function setMountMode(mode) {
  state.mountMode = mode;
  const container = document.querySelector('.toggle-container');
  if (container) container.setAttribute('data-mode', state.mountMode);
  const optSlide = document.getElementById('optSlide');
  const optSwap = document.getElementById('optSwap');
  if (optSlide) optSlide.classList.toggle('active', state.mountMode === 'slide');
  if (optSwap) optSwap.classList.toggle('active', state.mountMode === 'swap');
  
  const controls = document.getElementById('slideOverControls');
  if (controls) controls.style.display = state.mountMode === 'swap' ? 'none' : 'block';
}

function toggleMountMode() {
  setMountMode(state.mountMode === 'slide' ? 'swap' : 'slide');
}

function updateShaftType() {
  triggerHapticFeedback();
  playToneForParam('outerD', 30);
  const p = getParams();
  announceChange(`Shaft type changed to ${p.shaftType === 'dshaft' ? 'D-shaft' : p.shaftType === 'knurled' ? 'knurled' : 'round'}`);
}

// ─── MUTATION ENGINE ──────────────────────────────────────────────
async function runMutation() {
  const base = getParams();
  const count = Math.min(64, Math.max(1, +document.getElementById('mutCount').value));
  const spread = Math.max(5, Math.min(80, +document.getElementById('mutSpread').value)) / 100;
  const seed = Date.now();
  document.getElementById('seedDisplay').textContent = 'SEED: ' + seed.toString(16).toUpperCase();

  let s = seed;
  function rng() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }
  function mutate(val, min, max, step) {
    const delta = (rng() * 2 - 1) * spread * (max - min);
    return Math.round(Math.min(max, Math.max(min, val + delta)) / step) * step;
  }

  let targetD = 25;
  const selectVal = document.getElementById('outerDSelect').value;
  if (selectVal === 'custom') {
    targetD = +document.getElementById('outerD').value;
  } else {
    targetD = +selectVal;
  }

  const texModes = ['flutes', 'rings', 'knurl', 'scallops'];
  
  document.getElementById('countBadge').textContent = "GENERATING 3D...";
  await new Promise(r => setTimeout(r, 50));

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let model = null;
    let p = null;
    
    while (attempts < 10) {
      p = { ...base };
      p.taper = Math.round(mutate(base.taper * 100, 60, 100, 1)) / 100;
      p.texMode = texModes[Math.floor(rng() * texModes.length)];
      p.texDepth = Math.round(mutate(base.texDepth * 10, 15, 70, 1)) / 10;
      p.texScale = Math.round(mutate(base.texScale * 10, 15, 50, 1)) / 10;
      p.texCount = Math.floor(mutate(base.texCount, 4, 24, 1));
      
      if (state.mountMode === 'swap') {
        const isWH148 = document.getElementById('synthPreset')?.value === 'wh148';
        p.boreD = isWH148 ? 6.0 : (rng() < 0.5 ? 6.35 : 6.0);
        p.setScrew = 'm3';
        p.outerD = targetD;
        p.slotH = base.slotH;
        p.clearance = isWH148 ? 0.15 : 0;
        p.mountMode = 'swap';
      } else {
        p.boreD = targetD;
        p.clearance = base.clearance;
        p.setScrew = base.setScrew;
        p.slotH = base.slotH;
        const minOuter = targetD + p.clearance * 2 + 4;
        p.outerD = Math.max(targetD, minOuter);
        p.mountMode = 'slide';
      }
      p.id = 'K' + (seed % 10000).toString(16).toUpperCase() + '-' + String(i+1).padStart(3,'0');

      // Generate mesh model to validate it
      model = await generateKnobManifold(p);
      if (model) {
        const components = model.decompose();
        if (components.length <= 1) {
          // Valid single-body solid!
          components.forEach(c => c.delete());
          break; // break the attempt loop
        }
        
        // Invalid - clean up and try again
        console.warn(`[Validation Failure] Knob ${p.id} generated with ${components.length} floating parts. Attempt ${attempts + 1}/10. Regenerating...`);
        components.forEach(c => c.delete());
        model.delete();
        model = null;
      }
      attempts++;
    }
    
    // If we failed after 10 attempts, use fallback
    if (!model) {
      console.error(`[Validation Failed] Could not generate a clean single-component manifold for ${p.id} after 10 attempts. Using fallback.`);
      model = await generateKnobManifold(p);
    }
    
    // Convert to Three mesh and add
    p.mesh = manifoldToThreeMesh(model, 0xc8ff00, p);
    p.mesh.rotation.x = -Math.PI / 2;
    model.delete();
    
    state.knobs.push(p);
  }

  renderGrid();
  openViewer();
}

function openViewer(selectId) {
  document.body.classList.add('view-mode');
  if (state.knobs.length > 0) selectKnob(selectId || getSortedKnobs()[0].id);
}

function closeViewer() {
  document.body.classList.remove('view-mode');
}

async function addSingle() {
  const p = getParams();
  p.id = 'K' + Date.now().toString(16).slice(-4).toUpperCase() + '-MANUAL';
  p.shape = state.activeShape;
  const sd = SHAPES.find(x => x.id === p.shape);
  p.sides = sd?.sides ?? 6;
  p.star = sd?.star ?? false;
  p.wave = sd?.wave ?? false;
  
  document.getElementById('countBadge').textContent = "GENERATING 3D...";
  
  let model = await generateKnobManifold(p);
  if (model) {
    const components = model.decompose();
    if (components.length > 1) {
      console.warn(`[Validation Warning] Manually configured knob ${p.id} contains ${components.length} floating/disconnected parts. It may crumble if 3D printed!`);
    }
    components.forEach(c => c.delete());
  }

  p.mesh = manifoldToThreeMesh(model, 0xc8ff00, p);
  p.mesh.rotation.x = -Math.PI / 2;
  model.delete();

  state.knobs.push(p);
  renderGrid();
  openViewer(p.id);
}

function clearAll() {
  state.knobs.forEach(k => { if (k.mesh) { k.mesh.geometry.dispose(); k.mesh.material.dispose(); } });
  state.knobs = [];
  state.selectedId = null;
  closeDetail();
  renderGrid();
  document.body.classList.remove('view-mode');
}

function confirmPurgeAll() {
  if (state.knobs.length === 0) return;
  const btn = document.getElementById('purgeAllBtn');
  if (btn.textContent.includes('✕')) {
      btn.textContent = '? PURGE ALL';
      btn.style.color = 'yellow';
      btn.style.borderColor = 'yellow';
      setTimeout(() => {
          if (btn && btn.textContent.includes('?')) {
              btn.textContent = '✕ PURGE ALL';
              btn.style.color = 'var(--danger)';
              btn.style.borderColor = '#331111';
          }
      }, 3000);
      return;
  }
  
  clearAll();
  btn.textContent = '✕ PURGE ALL';
  btn.style.color = 'var(--danger)';
  btn.style.borderColor = '#331111';
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
    if (state.knobs.length === 0) closeViewer();
  }
}

// ─── RENDER GRID ──────────────────────────────────────────────────
function getSortedKnobs() {
  let list = [...state.knobs];
  if (state.sortMode === 'dia') list.sort((a,b) => b.outerD - a.outerD);
  if (state.sortMode === 'groove') list.sort((a,b) => b.texDepth - a.texDepth);
  return list;
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

function renderGrid() {
  let list = getSortedKnobs();
  const grid = document.getElementById('knobGrid');
  document.getElementById('countBadge').textContent = state.knobs.length + ' KNOB' + (state.knobs.length !== 1 ? 'S' : '');

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="big">0 KNOBS</div><div class="sub">Generate mutations or add current config</div></div>`;
    return;
  }

  grid.innerHTML = '';
  list.forEach(k => {
    const card = document.createElement('div');
    card.className = 'knob-card' + (k.id === state.selectedId ? ' selected' : '');
    card.onclick = () => selectKnob(k.id);
    k.cardEl = card;

    const shp = SHAPES.find(s => s.id === k.shape) || SHAPES[4];

    card.innerHTML = `
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

function selectKnob(id) {
  const k = state.knobs.find(x => x.id === id);
  if (!k) return;
  state.selectedId = id;
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
  ];

  document.getElementById('dpRows').innerHTML = rows.map(([k2,v]) =>
    `<div class="detail-row"><span class="dk">${k2}</span><span class="dv">${v}</span></div>`
  ).join('');

  panel.classList.add('open');
  document.querySelector('.main').classList.add('detail-open');
}

function closeDetail() {
  document.getElementById('detailPanel').classList.remove('open');
  document.querySelector('.main').classList.remove('detail-open');
  state.selectedId = null;
  renderGrid();
}

function sortBy(mode) {
  state.sortMode = mode;
  document.querySelectorAll('.btn-sm').forEach(b => b.classList.remove('active'));
  document.getElementById('sort' + mode.charAt(0).toUpperCase() + mode.slice(1))?.classList.add('active');
  renderGrid();
}

function svgForShape(s) {
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

// ─── EXPORTS ──────────────────────────────────────────────────────
function dl(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state.knobs, null, 2)], { type: 'application/json' });
  dl(blob, 'access-knobs.json');
  closeViewer();
}

function exportCSV() {
  const keys = ['id','shape','outerD','height','taper','texMode','texDepth','texScale','texCount','boreD','slotH','clearance','setScrew'];
  const rows = [keys.join(','), ...state.knobs.map(k => keys.map(key => k[key]).join(','))];
  dl(new Blob([rows.join('\n')], {type:'text/csv'}), 'access-knobs.csv');
  closeViewer();
}

function exportOpenSCAD() {
  let out = `// ACCESS KNOB — Parametric Suite\n// Generated ${new Date().toISOString()}\n\n`;
  out += `module access_knob(outer_d, height, taper, tex_mode, tex_depth, tex_scale, tex_count, bore_d, slot_h, clearance, sides, set_screw) {\n`;
  out += `  // Body\n  difference() {\n`;
  out += `    cylinder(h=height, d1=outer_d, d2=outer_d*taper, $fn=sides);\n`;
  out += `    // Bore\n    translate([0,0,-0.1]) cylinder(h=slot_h+0.2, d=bore_d + clearance*2, $fn=64);\n`;
  out += `    // Texture (axial flutes approximation — see tex_mode for actual mode)\n`;
  out += `    for(i=[0:tex_count-1]) {\n`;
  out += `      rotate([0,0,i*(360/tex_count)])\n`;
  out += `        translate([outer_d/2-tex_depth/2,0,height/2])\n`;
  out += `          cylinder(h=height*1.1, d=tex_scale, center=true, $fn=16);\n    }\n`;
  out += `  }\n}\n\n`;
  out += `// Variants:\n`;
  state.knobs.forEach((k, i) => {
    out += `// ${k.id} [${(k.texMode||'flutes').toUpperCase()}]\naccess_knob(${k.outerD}, ${k.height}, ${k.taper}, "${k.texMode||'flutes'}", ${k.texDepth}, ${k.texScale}, ${k.texCount}, ${k.boreD.toFixed(1)}, ${k.slotH}, ${k.clearance}, ${k.sides}, "${k.setScrew}"); // translate([${i*65},0,0])\n`;
  });
  dl(new Blob([out], {type:'text/plain'}), 'access-knobs.scad');
  closeViewer();
}

async function exportSingleSTL() {
  const k = state.knobs.find(x => x.id === state.selectedId);
  if (!k) return;
  const btn = document.getElementById('exportSingleStlBtn');
  btn.textContent = "GENERATING...";
  
  await new Promise(r => setTimeout(r, 50));
  
  try {
    const kModel = await generateKnobManifold(k);
    const stlString = modelToSTL(kModel, k.id);
    kModel.delete();
    
    const blob = new Blob([stlString], {type: 'text/plain'});
    const filename = `${k.id}_cfg_${encodeParams(k)}.stl`;
    dl(blob, filename);
  } catch (e) {
    alert("Export failed: " + e.message);
  } finally {
    btn.textContent = "↓ DOWNLOAD THIS STL";
  }
}

async function exportBatchSTL() {
  if (state.knobs.length === 0) return;
  const btn = document.getElementById('exportBatchStlBtn');
  btn.textContent = "BUILDING BATCH...";
  
  await new Promise(r => setTimeout(r, 50));
  
  try {
    const M = await getManifold();
    let combined = null;
    
    for (let i = 0; i < state.knobs.length; i++) {
      let kModel = await generateKnobManifold(state.knobs[i]);
      const cols = Math.ceil(Math.sqrt(state.knobs.length));
      const col = i % cols;
      const row = Math.floor(i / cols);
      const spacing = 50; 
      
      let offsetZ = state.knobs[i].height / 2;
      kModel = kModel.translate([col * spacing, row * spacing, offsetZ]);
      
      if (!combined) combined = kModel;
      else {
          let n = combined.add(kModel);
          combined.delete(); kModel.delete();
          combined = n;
      }
    }
    
    const stlString = modelToSTL(combined, "AccessKnobs_Batch");
    combined.delete();
    
    const blob = new Blob([stlString], {type: 'text/plain'});
    dl(blob, "access-knobs-batch.stl");
    btn.textContent = "↓ STL (ALL)";
  } catch (e) {
    alert("Export failed: " + e.message);
    btn.textContent = "↓ STL (ALL)";
  }
}

function openLaserModal() {
  document.getElementById('laserModal').style.display = 'flex';
}

function closeLaserModal() {
  document.getElementById('laserModal').style.display = 'none';
}

function generateLaserSVG() {
  const k = state.knobs.find(x => x.id === state.selectedId);
  if (!k) return;
  
  const t = parseFloat(document.getElementById('v_laserMaterialThick').value) || 3.0;
  const k_f = parseFloat(document.getElementById('laserKerf').value) || 0.1;
  
  const svgContent = getLaserSVG(k, t, k_f);
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  dl(blob, `${k.id}_laser_layers_${t}mm.svg`);
  closeLaserModal();
}

function copyShareLink() {
  const k = state.knobs.find(x => x.id === state.selectedId);
  if (!k) return;
  const b64 = encodeParams(k);
  const shareUrl = window.location.origin + window.location.pathname + '?cfg=' + b64;
  
  navigator.clipboard.writeText(shareUrl).then(() => {
    const btn = document.getElementById('copyShareBtn');
    const oldText = btn.textContent;
    btn.textContent = "✓ COPIED!";
    btn.style.color = "var(--accent)";
    btn.style.borderColor = "var(--accent)";
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.color = "";
      btn.style.borderColor = "";
    }, 2000);
  }).catch(err => {
    alert("Failed to copy link: " + err);
  });
}

function stepInput(id, dir) {
  const input = document.getElementById(id);
  if (!input) return;
  const min = +input.min || 1;
  const max = +input.max || 100;
  const val = +input.value || 0;
  input.value = Math.min(max, Math.max(min, val + dir));
}

// ─── DRAG & DROP ──────────────────────────────────────────────────
function initDragAndDrop() {
  const grid = document.getElementById('knobGrid');
  if (!grid) return;
  
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    grid.style.borderColor = 'var(--accent)';
    grid.style.boxShadow = '0 0 15px rgba(200, 255, 0, 0.15) inset';
  });
  
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    grid.style.borderColor = '';
    grid.style.boxShadow = '';
  });
  
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    grid.style.borderColor = '';
    grid.style.boxShadow = '';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await importStlFile(files[0]);
    }
  });
}

async function triggerStlImport() {
  document.getElementById('importStlInput').click();
}

async function handleStlImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  await importStlFile(file);
  event.target.value = '';
}

async function importStlFile(file) {
  if (!file.name.toLowerCase().endsWith('.stl')) {
    alert("Please select or drop a valid .stl file.");
    return;
  }
  
  const baseName = file.name.replace(/\.stl$/i, '');
  const parts = baseName.split('_cfg_');
  if (parts.length < 2) {
    alert("No configuration metadata found in this STL filename. Ensure it was downloaded from this tool and has the '_cfg_' suffix.");
    return;
  }
  
  const id = parts[0];
  const b64 = parts[1];
  const params = decodeParams(b64);
  if (!params) {
    alert("Failed to decode parameters from filename.");
    return;
  }
  
  let finalId = id;
  if (state.knobs.some(k => k.id === finalId)) {
    finalId = 'K' + Date.now().toString(16).slice(-4).toUpperCase() + '-IMP';
  }
  
  const p = { ...params };
  p.id = finalId;
  const sd = SHAPES.find(x => x.id === p.shape);
  p.sides = sd?.sides ?? 6;
  p.star = sd?.star ?? false;
  p.wave = sd?.wave ?? false;
  
  document.getElementById('countBadge').textContent = "GENERATING 3D...";
  await new Promise(r => setTimeout(r, 50));
  
  try {
    let model = await generateKnobManifold(p);
    if (model) {
      const components = model.decompose();
      if (components.length > 1) {
        console.warn(`[Validation Warning] Imported knob ${p.id} contains ${components.length} floating/disconnected parts. It may crumble if 3D printed!`);
      }
      components.forEach(c => c.delete());
    }
    p.mesh = manifoldToThreeMesh(model, 0xc8ff00, p);
    p.mesh.rotation.x = -Math.PI / 2;
    model.delete();
    
    state.knobs.push(p);
    state.selectedId = p.id;
    
    applyParamsToSliders(p);
    if (p.mountMode) {
      setMountMode(p.mountMode);
    }
    
    renderGrid();
    openViewer(p.id);
  } catch (e) {
    console.error(e);
    alert("Failed to generate 3D model for the imported file: " + e.message);
    document.getElementById('countBadge').textContent = state.knobs.length + ' KNOB' + (state.knobs.length !== 1 ? 'S' : '');
  }
}
