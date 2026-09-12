import { state, updateState, subscribe } from './state.js';
import { initViewport, updateGeometry, initManifold, buildExportAssemblyGroup } from './geometry.js';
import { calculateAcousticPressure } from './acousticSim.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import * as THREE from 'three';

export async function initUI() {
  initViewport('viewport-container');

  const manifoldReady = initManifold();

  // Bind Slider Inputs
  bindSlider('input-transducerCount', 'val-transducerCount', 'transducerCount', val => parseInt(val, 10));
  bindSlider('input-focalDistance', 'val-focalDistance', 'focalDistance', val => parseFloat(val));
  bindSlider('input-transducerDiam', 'val-transducerDiam', 'transducerDiam', val => parseFloat(val));
  bindSlider('input-transducerKerf', 'val-transducerKerf', 'transducerKerf', val => parseFloat(val));
  bindSlider('input-dishThickness', 'val-dishThickness', 'dishThickness', val => parseFloat(val));
  bindSlider('input-dishRimMargin', 'val-dishRimMargin', 'dishRimMargin', val => parseFloat(val));

  // Checkbox Toggles & Selects
  bindCheckbox('check-showRays', 'showFocalRays');
  bindCheckbox('check-showWaves', 'showWaveFronts');
  document.getElementById('select-frameTopology')?.addEventListener('change', e => {
    updateState('frameTopology', e.target.value);
  });

  // Presets
  document.getElementById('btn-preset-20')?.addEventListener('click', () => {
    updateState('transducerCount', 20);
    updateState('focalDistance', 100);
    syncSliderUI();
  });

  document.getElementById('btn-preset-tight')?.addEventListener('click', () => {
    updateState('transducerCount', 20);
    updateState('focalDistance', 60);
    syncSliderUI();
  });

  document.getElementById('btn-preset-long')?.addEventListener('click', () => {
    updateState('transducerCount', 20);
    updateState('focalDistance', 160);
    syncSliderUI();
  });

  // STL Export
  document.getElementById('btn-export-stl')?.addEventListener('click', () => exportSTL());

  // Subscribe state changes to geometry updates and readout refreshes
  subscribe(currState => {
    updateGeometry(currState);
    updateAcousticReadout(currState);
  });

  // Initial draw
  updateGeometry(state);
  updateAcousticReadout(state);

  manifoldReady.then(ok => {
    const badge = document.getElementById('perf-badge');
    if (badge) badge.textContent = ok ? 'CSG KERNEL READY' : 'VISUAL ONLY';
  });
}

function bindSlider(inputId, valId, stateKey, parser) {
  const input = document.getElementById(inputId);
  const valSpan = document.getElementById(valId);
  if (!input || !valSpan) return;

  input.addEventListener('input', e => {
    const parsed = parser(e.target.value);
    valSpan.textContent = parsed;
    updateState(stateKey, parsed);
  });
}

function bindCheckbox(checkId, stateKey) {
  const check = document.getElementById(checkId);
  if (!check) return;

  check.addEventListener('change', e => {
    updateState(stateKey, e.target.checked);
  });
}

function syncSliderUI() {
  document.getElementById('input-transducerCount').value = state.transducerCount;
  document.getElementById('val-transducerCount').textContent = state.transducerCount;

  document.getElementById('input-focalDistance').value = state.focalDistance;
  document.getElementById('val-focalDistance').textContent = state.focalDistance;

  document.getElementById('input-transducerDiam').value = state.transducerDiam;
  document.getElementById('val-transducerDiam').textContent = state.transducerDiam;

  document.getElementById('input-transducerKerf').value = state.transducerKerf;
  document.getElementById('val-transducerKerf').textContent = state.transducerKerf;
}

function updateAcousticReadout(currState) {
  const sim = calculateAcousticPressure(currState.transducerCount, currState.focalDistance, currState.transducerDiam);
  const box = document.getElementById('acoustic-readout');
  if (!box) return;

  box.innerHTML = `
    <div>FREQ: <strong>40.0 kHz</strong> (λ = ${sim.wavelengthMm.toFixed(2)} mm)</div>
    <div>EST. FOCAL SPL: <strong>${sim.dbSPL} dB</strong></div>
    <div>PEAK PRESSURE: <strong>${sim.totalPascalPeak} Pa</strong></div>
    <div>RAD. PRESSURE: <strong>${sim.radiationPressurePa} Pa</strong></div>
    <div style="margin-top: 4px; color: ${sim.tactileFeasible ? '#c8ff00' : '#ffaa00'}">
      STATUS: ${sim.tactileFeasible ? '✓ FEASIBLE TACTILE FOCUS' : '⚠ WEAK ACOUSTIC FOCUS'}
    </div>
  `;

  const overlayCount = document.getElementById('stat-count');
  const overlayFocal = document.getElementById('stat-focal');
  const overlaySPL = document.getElementById('stat-spl');

  if (overlayCount) overlayCount.textContent = `${currState.transducerCount} × TCT40-16T`;
  if (overlayFocal) overlayFocal.textContent = `${currState.focalDistance} mm`;
  if (overlaySPL) overlaySPL.textContent = `${sim.dbSPL} dB`;
}

function exportSTL() {
  const btn = document.getElementById('btn-export-stl');
  const origText = btn?.textContent;
  if (btn) btn.textContent = 'BUILDING STL…';

  requestAnimationFrame(() => {
    try {
      const exportGroup = buildExportAssemblyGroup(state);
      if (!exportGroup) {
        alert('No geometry generated');
        if (btn) btn.textContent = origText;
        return;
      }

      const exporter = new STLExporter();
      const result = exporter.parse(exportGroup, { binary: true });
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `UltraSonicTouch_${state.transducerCount}x16mm_F${state.focalDistance}mm_PrintPlate.stl`;
      link.click();
    } catch (e) {
      console.error('STL export error:', e);
      alert('Export failed: ' + e.message);
    }
    if (btn) btn.textContent = origText;
  });
}
