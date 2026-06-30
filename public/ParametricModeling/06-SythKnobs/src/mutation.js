import {
  state,
  SHAPES,
  getParams,
  saveKnobs,
  triggerHapticFeedback,
} from './state.js';
import {
  generateKnobManifold,
  manifoldToThreeMesh
} from './geometry.js';
import {
  renderGrid,
  openViewer,
  closeViewer,
  closeDetail
} from './grid.js';

export async function runMutation() {
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

  const texModes = ['flutes', 'twist', 'rings', 'vrings', 'knurl', 'scallops', 'bumps'];
  
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

export async function addSingle() {
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

export function clearAll() {
  state.knobs.forEach(k => { if (k.mesh) { k.mesh.geometry.dispose(); k.mesh.material.dispose(); } });
  state.knobs = [];
  state.selectedId = null;
  closeDetail();
  renderGrid();
  saveKnobs();
  closeViewer();
}

export function stepInput(id, dir) {
  const input = document.getElementById(id);
  if (!input) return;
  const step = +input.step || 1;
  const val = +input.value + dir * step;
  const min = input.min !== "" ? +input.min : -Infinity;
  const max = input.max !== "" ? +input.max : Infinity;
  input.value = Math.max(min, Math.min(max, val));
  
  const event = new Event('change', { bubbles: true });
  input.dispatchEvent(event);
}
