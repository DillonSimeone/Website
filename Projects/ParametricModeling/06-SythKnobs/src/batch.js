import {
  state,
  SHAPES,
  saveKnobs
} from './state.js';
import {
  generateKnobManifold,
  manifoldToThreeMesh
} from './geometry.js';
import {
  renderGrid,
  selectKnob
} from './grid.js';

export async function applyEditToKnobs(knobList) {
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

export async function applyEditToThis() {
  const k = state.knobs.find(x => x.id === state.selectedId);
  if (!k) return;
  await applyEditToKnobs([k]);
}

export async function applyEditToAll() {
  if (state.knobs.length === 0) return;
  await applyEditToKnobs([...state.knobs]);
}
