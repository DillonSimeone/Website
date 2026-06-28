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
  decodeParams,
  setMountMode,
  toggleMountMode,
  saveKnobs,
  loadKnobs
} from './state.js';
import {
  initThree,
  generateKnobManifold,
  manifoldToThreeMesh,
  setRenderMode
} from './geometry.js';
import {
  renderGrid,
  openViewer,
  closeViewer,
  selectKnob,
  closeDetail,
  svgForShape,
  initKeyboardNav
} from './grid.js';
import { initDragAndDrop } from './export.js';

// ─── WINDOW GLOBALS (inline onclick handlers) ───────────────────
window.setRenderMode = setRenderMode;
window.toggleMountMode = toggleMountMode;
window.updateShaftType = updateShaftType;
window.runMutation = runMutation;
window.addSingle = addSingle;
window.clearAll = clearAll;
window.stepInput = stepInput;
window.applyEditToThis = applyEditToThis;
window.applyEditToAll = applyEditToAll;

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

  // Wire batch edit parameter selector
  document.getElementById('batchEditParam')?.addEventListener('change', (e) => {
    const param = e.target.value;
    const container = document.getElementById('batchEditValue');
    if (!container) return;
    
    if (!param) {
      container.innerHTML = '';
      return;
    }

    if (param === 'texMode') {
      container.innerHTML = `<select id="batchEditInput" style="margin-bottom: 0;">
        <option value="flutes">Axial Flutes</option>
        <option value="rings">Radial Rings</option>
        <option value="knurl">Diamond Knurl</option>
        <option value="scallops">Scallops</option>
        <option value="smooth">Smooth</option>
      </select>`;
    } else if (param === 'shape') {
      container.innerHTML = `<select id="batchEditInput" style="margin-bottom: 0;">
        ${SHAPES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
      </select>`;
    } else {
      // Numeric input
      const configs = {
        texDepth: { min: 1.0, max: 8.0, step: 0.1, unit: 'mm' },
        texScale: { min: 1.0, max: 6.0, step: 0.1, unit: 'mm' },
        texCount: { min: 3, max: 36, step: 1, unit: '×' },
        taper: { min: 0.60, max: 1.00, step: 0.01, unit: '' },
        outerD: { min: 10, max: 80, step: 1, unit: 'mm' },
        height: { min: 10, max: 50, step: 1, unit: 'mm' },
      };
      const cfg = configs[param] || { min: 0, max: 100, step: 1, unit: '' };
      container.innerHTML = `<div style="display:flex;align-items:center;gap:6px;">
        <input type="number" id="batchEditInput" class="val" style="width:100%;text-align:center;border:1px solid var(--border-lit);padding:4px;" 
          min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${cfg.min}">
        <span class="unit">${cfg.unit}</span>
      </div>`;
    }
  });

  // Wire laser material thickness select → custom input sync
  document.getElementById('laserMaterialThick')?.addEventListener('change', (e) => {
    const customInput = document.getElementById('v_laserMaterialThick');
    if (customInput) customInput.value = e.target.value;
  });

  updateAllDisplays();
  initDragAndDrop();
  initKeyboardNav();

  // ── Restore knobs from localStorage ──
  const saved = loadKnobs();
  if (saved && saved.length > 0) {
    document.getElementById('countBadge').textContent = "RESTORING " + saved.length + " KNOBS...";
    await new Promise(r => setTimeout(r, 50));
    
    for (const p of saved) {
      const sd = SHAPES.find(x => x.id === p.shape);
      p.sides = sd?.sides ?? p.sides ?? 6;
      p.star = sd?.star ?? p.star ?? false;
      p.wave = sd?.wave ?? p.wave ?? false;
      
      try {
        let model = await generateKnobManifold(p);
        p.mesh = manifoldToThreeMesh(model, 0xc8ff00, p);
        p.mesh.rotation.x = -Math.PI / 2;
        model.delete();
        state.knobs.push(p);
      } catch (e) {
        console.warn('Failed to restore knob', p.id, e);
      }
    }
    
    if (state.knobs.length > 0) {
      renderGrid();
      openViewer(state.knobs[0].id);
    }
  }

  // Load configuration from URL if present (overrides localStorage)
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
        saveKnobs();
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
          components.forEach(c => c.delete());
          break;
        }
        
        console.warn(`[Validation Failure] Knob ${p.id} generated with ${components.length} floating parts. Attempt ${attempts + 1}/10. Regenerating...`);
        components.forEach(c => c.delete());
        model.delete();
        model = null;
      }
      attempts++;
    }
    
    if (!model) {
      console.error(`[Validation Failed] Could not generate a clean single-component manifold for ${p.id} after 10 attempts. Using fallback.`);
      model = await generateKnobManifold(p);
    }
    
    p.mesh = manifoldToThreeMesh(model, 0xc8ff00, p);
    p.mesh.rotation.x = -Math.PI / 2;
    model.delete();
    
    state.knobs.push(p);
  }

  renderGrid();
  saveKnobs();
  openViewer();
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
  saveKnobs();
  openViewer(p.id);
}

function clearAll() {
  state.knobs.forEach(k => { if (k.mesh) { k.mesh.geometry.dispose(); k.mesh.material.dispose(); } });
  state.knobs = [];
  state.selectedId = null;
  closeDetail();
  renderGrid();
  saveKnobs();
  document.body.classList.remove('view-mode');
}

function stepInput(id, dir) {
  const input = document.getElementById(id);
  if (!input) return;
  const min = +input.min || 1;
  const max = +input.max || 100;
  const val = +input.value || 0;
  input.value = Math.min(max, Math.max(min, val + dir));
}

// ─── BATCH PARAMETER EDITING ────────────────────────────────────
async function applyEditToKnobs(knobList) {
  const paramSelect = document.getElementById('batchEditParam');
  const input = document.getElementById('batchEditInput');
  if (!paramSelect || !input) return;
  
  const param = paramSelect.value;
  if (!param) return;
  
  const value = input.value;
  const badge = document.getElementById('countBadge');
  badge.textContent = "REGENERATING...";
  await new Promise(r => setTimeout(r, 50));

  for (const k of knobList) {
    // Apply the parameter change
    if (param === 'texMode') {
      k.texMode = value;
    } else if (param === 'shape') {
      k.shape = value;
      const sd = SHAPES.find(x => x.id === value);
      k.sides = sd?.sides ?? 6;
      k.star = sd?.star ?? false;
      k.wave = sd?.wave ?? false;
    } else if (param === 'taper') {
      k.taper = parseFloat(value);
    } else {
      k[param] = parseFloat(value);
    }

    // Regenerate mesh
    if (k.mesh) {
      k.mesh.geometry.dispose();
      k.mesh.material.dispose();
    }
    try {
      const model = await generateKnobManifold(k);
      k.mesh = manifoldToThreeMesh(model, 0xc8ff00, k);
      k.mesh.rotation.x = -Math.PI / 2;
      model.delete();
    } catch (e) {
      console.error('Failed to regenerate knob', k.id, e);
    }
  }

  renderGrid();
  saveKnobs();
  if (state.selectedId) selectKnob(state.selectedId);
}

async function applyEditToThis() {
  const k = state.knobs.find(x => x.id === state.selectedId);
  if (!k) return;
  await applyEditToKnobs([k]);
}

async function applyEditToAll() {
  if (state.knobs.length === 0) return;
  await applyEditToKnobs([...state.knobs]);
}
