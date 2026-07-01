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
  toggleMountMode,
  saveKnobs,
  loadKnobs
} from './state.js';
import {
  initThree,
  setRenderMode
} from './viewport.js';
import {
  renderGrid,
  svgForShape,
  initKeyboardNav
} from './grid.js';
import { initDragAndDrop } from './export.js';
import { handlePresetChange } from './presets.js';
import { runMutation, addSingle, clearAll, stepInput } from './mutation.js';
import { applyEditToThis, applyEditToAll } from './batch.js';

// ─── WINDOW GLOBALS (inline onclick handlers) ───────────────────
window.toggleMountMode = toggleMountMode;
window.updateShaftType = updateShaftType;
window.runMutation = runMutation;
window.addSingle = addSingle;
window.clearAll = clearAll;
window.stepInput = stepInput;
window.applyEditToThis = applyEditToThis;
window.applyEditToAll = applyEditToAll;
window.selectShape = selectShape; // Exported to window and presets
window.setRenderMode = setRenderMode;

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
      triggerHapticFeedback('tick');
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
    handlePresetChange(e.target.value);
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
        <option value="twist">Spiral Twist</option>
        <option value="rings">Radial Rings</option>
        <option value="vrings">Vertical Rings</option>
        <option value="knurl">Diamond Knurl</option>
        <option value="scallops">Scallops</option>
        <option value="bumps">Scallop Bumps</option>
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
      container.innerHTML = `<div style="display:flex;align-items:center;gap:6px;width:100%;">
        <input type="number" id="batchEditInput" class="input-field" style="text-align:center;" 
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

  // ─── Restore knobs from localStorage ───
  await loadKnobs();

  // Wire global haptics for interactive elements
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('button, select, .shape-btn, .toggle-container, .toggle-opt, [role="button"], .delete-btn');
    if (!target) return;
    
    // Determine haptic feedback strength based on the element
    if (target.classList.contains('btn-danger') || target.id === 'purgeAllBtn' || target.classList.contains('delete-btn')) {
      triggerHapticFeedback('heavy');
    } else if (target.closest('.batch-edit-section') || target.id === 'exportBatchStlBtn' || target.classList.contains('btn-primary')) {
      triggerHapticFeedback('medium');
    } else {
      triggerHapticFeedback('light');
    }
  });
}

export function selectShape(id) {
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

export function updateShaftType() {
  triggerHapticFeedback();
  playToneForParam('outerD', 30);
  const p = getParams();
  announceChange(`Shaft type changed to ${p.shaftType === 'dshaft' ? 'D-shaft' : p.shaftType === 'knurled' ? 'knurled' : 'round'}`);
}
