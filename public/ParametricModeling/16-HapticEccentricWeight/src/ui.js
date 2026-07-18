// UI bindings, gallery, specs, safety
import { params, visibilities, library, kitStatus, MOTOR, KIT_ENVELOPE } from './state.js';
import { runMutation, selectRotor, clearLibrary, getSelectedRotor } from './mutation.js';
import {
  exportSelectedSTL,
  exportHubSTL,
  exportFitCouponSTL,
  exportGuardSTL,
  exportPackedKitSTL,
  exportManifestJSON,
  exportManifestCSV
} from './export.js';

let rebuildFn = null;
let exportModels = null;

export function setRebuildCallback(fn) {
  rebuildFn = fn;
}

export function setExportModels(models) {
  exportModels = models;
}

export function getExportModels() {
  return exportModels;
}

export function setupUIListeners() {
  const sliderMap = {
    'input-shaftPilotDiam': { param: 'shaftPilotDiam', label: 'val-shaftPilotDiam' },
    'input-shaftInsertMax': { param: 'shaftInsertMax', label: 'val-shaftInsertMax' },
    'input-hubOd': { param: 'hubOd', label: 'val-hubOd' },
    'input-hubHeight': { param: 'hubHeight', label: 'val-hubHeight' },
    'input-hexAf': { param: 'hexAf', label: 'val-hexAf' },
    'input-hexClearance': { param: 'hexClearance', label: 'val-hexClearance' },
    'input-skirtWall': { param: 'skirtWall', label: 'val-skirtWall' },
    'input-rotorThickness': { param: 'rotorThickness', label: 'val-rotorThickness' },
    'input-rotorOdMax': { param: 'rotorOdMax', label: 'val-rotorOdMax' },
    'input-eccMin': { param: 'eccMin', label: 'val-eccMin' },
    'input-eccMax': { param: 'eccMax', label: 'val-eccMax' },
    'input-rotorCount': { param: 'rotorCount', label: 'val-rotorCount' },
    'input-petgDensity': { param: 'petgDensity', label: 'val-petgDensity' },
    'input-targetRpm': { param: 'targetRpm', label: 'val-targetRpm' },
    'input-explode': { param: 'explode', label: 'val-explode' },
    'input-slideAmount': { param: 'slideAmount', label: 'val-slideAmount' },
    'input-opacity': { param: 'opacity', label: 'val-opacity' }
  };

  for (const [id, cfg] of Object.entries(sliderMap)) {
    const input = document.getElementById(id);
    const label = document.getElementById(cfg.label);
    if (!input) continue;
    if (label) label.textContent = input.value;
    input.addEventListener('input', () => {
      params[cfg.param] = parseFloat(input.value);
      if (label) label.textContent = input.value;
      if (rebuildFn) rebuildFn();
    });
  }

  const shapeMix = document.getElementById('input-shapeMix');
  if (shapeMix) {
    shapeMix.addEventListener('change', () => {
      params.shapeMix = shapeMix.value;
    });
  }

  const toggles = {
    'show-motor': 'motor',
    'show-hub': 'hub',
    'show-rotor': 'rotor',
    'show-fitCoupon': 'fitCoupon',
    'show-guard': 'guard',
    'show-envelope': 'envelope'
  };
  for (const [id, key] of Object.entries(toggles)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.checked = visibilities[key];
    el.addEventListener('change', () => {
      visibilities[key] = el.checked;
      if (rebuildFn) rebuildFn();
    });
  }

  const btnRendered = document.getElementById('btn-rendered');
  const btnXray = document.getElementById('btn-xray');
  if (btnRendered && btnXray) {
    btnRendered.addEventListener('click', () => {
      params.mode = 'rendered';
      btnRendered.classList.add('active');
      btnXray.classList.remove('active');
      if (rebuildFn) rebuildFn();
    });
    btnXray.addEventListener('click', () => {
      params.mode = 'xray';
      btnXray.classList.add('active');
      btnRendered.classList.remove('active');
      if (rebuildFn) rebuildFn();
    });
  }

  document.getElementById('btn-mutate')?.addEventListener('click', async () => {
    await runMutation();
    if (rebuildFn) rebuildFn();
  });

  document.getElementById('btn-clear')?.addEventListener('click', () => {
    clearLibrary();
    if (rebuildFn) rebuildFn();
  });

  document.getElementById('btn-export-selected')?.addEventListener('click', () => exportSelectedSTL());
  document.getElementById('btn-export-hub')?.addEventListener('click', () => exportHubSTL());
  document.getElementById('btn-export-fit')?.addEventListener('click', () => exportFitCouponSTL());
  document.getElementById('btn-export-guard')?.addEventListener('click', () => exportGuardSTL());
  document.getElementById('btn-export-kit')?.addEventListener('click', () => exportPackedKitSTL());
  document.getElementById('btn-export-json')?.addEventListener('click', () => exportManifestJSON());
  document.getElementById('btn-export-csv')?.addEventListener('click', () => exportManifestCSV());
}

export function renderGallery() {
  const grid = document.getElementById('rotor-gallery');
  if (!grid) return;
  grid.innerHTML = '';

  if (library.rotors.length === 0) {
    grid.innerHTML = '<div class="gallery-empty">No rotors — run a mutation</div>';
    return;
  }

  for (const r of library.rotors) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'rotor-card' + (r.id === library.selectedId ? ' selected' : '');
    card.innerHTML = `
      <div class="rotor-id">${r.id}</div>
      <div class="rotor-shape">${r.shape}</div>
      <div class="rotor-meta">ecc ${r.ecc.toFixed(2)} mm · ${r.massG.toFixed(2)} g</div>
      <div class="rotor-force">${r.forceTargetN.toFixed(2)} N @ ${params.targetRpm.toLocaleString()} rpm</div>
    `;
    card.addEventListener('click', () => {
      selectRotor(r.id);
      if (rebuildFn) rebuildFn();
    });
    grid.appendChild(card);
  }

  const packEl = document.getElementById('kit-status');
  if (packEl) {
    packEl.textContent = kitStatus.message;
    packEl.className = 'kit-status ' + (kitStatus.fits ? 'ok' : 'bad');
  }
}

export function updateSpecsPanel() {
  const r = getSelectedRotor();
  setText('spec-motor', `${MOTOR.part} · Ø${MOTOR.shaftDiam}×${MOTOR.shaftLen} mm shaft`);
  setText('spec-rpm', `${MOTOR.ratedRpm.toLocaleString()} / ${MOTOR.noLoadRpm.toLocaleString()} rpm`);
  setText('spec-envelope', `${KIT_ENVELOPE.w}×${KIT_ENVELOPE.d}×${KIT_ENVELOPE.h} mm`);

  if (r) {
    setText('spec-rotor', `${r.id} · ${r.shape}`);
    setText('spec-mass', `${r.massG.toFixed(3)} g`);
    setText('spec-com', `${r.comOffset.toFixed(2)} mm`);
    setText('spec-force-target', `${r.forceTargetN.toFixed(3)} N`);
    setText('spec-force-rated', `${r.forceRatedN.toFixed(3)} N`);
    setText('spec-force-noload', `${r.forceNoLoadN.toFixed(3)} N`);
    setText('spec-moment', `${(r.massG * r.comOffset).toFixed(3)} g·mm`);
  } else {
    setText('spec-rotor', '—');
    setText('spec-mass', '—');
    setText('spec-com', '—');
    setText('spec-force-target', '—');
    setText('spec-force-rated', '—');
    setText('spec-force-noload', '—');
    setText('spec-moment', '—');
  }

  if (kitStatus.packedBounds) {
    const b = kitStatus.packedBounds;
    setText('spec-packed', `${b.w.toFixed(1)}×${b.d.toFixed(1)}×${b.h.toFixed(1)} mm`);
  }
}

export function updateSafetyBanner() {
  const el = document.getElementById('safety-banner');
  if (!el) return;
  const r = getSelectedRotor();
  const f = r ? r.forceNoLoadN : 0;
  let level = 'info';
  let msg = 'Ream hub pilot to Ø1.0 mm on the motor face, glue ≤4.25 mm deep, slide skirt weight onto hex until seated.';
  if (f > 2.5) {
    level = 'warn';
    msg = `⚠ Predicted ~${f.toFixed(1)} N at no-load RPM. Use guard, start at 1–2 V, PETG only.`;
  }
  if (f > 5) {
    level = 'danger';
    msg = `⛔ High force (~${f.toFixed(1)} N). Rigid enclosure required. Confirm skirt is fully seated.`;
  }
  if (!kitStatus.fits) {
    level = 'danger';
    msg = `Kit overflow: ${kitStatus.message}`;
  }
  el.className = `safety-banner ${level}`;
  el.textContent = msg;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
