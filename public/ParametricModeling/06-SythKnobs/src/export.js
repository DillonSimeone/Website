// Export, Download, and Import Functions for Access Knob Configurator
import { state, SHAPES, encodeParams, decodeParams, applyParamsToSliders, setMountMode, saveKnobs } from './state.js';
import { generateKnobManifold, manifoldToThreeMesh, getManifold } from './geometry.js';
import { renderGrid, openViewer, closeViewer, selectKnob } from './grid.js';
import { modelToSTL } from '../../00-CommonParts/Exporter/stl.js';
import { getLaserSVG } from '../../00-CommonParts/Exporter/svg.js';

// ─── WINDOW GLOBALS ──────────────────────────────────────────────
window.exportJSON = exportJSON;
window.exportCSV = exportCSV;
window.exportOpenSCAD = exportOpenSCAD;
window.exportSingleSTL = exportSingleSTL;
window.exportBatchSTL = exportBatchSTL;
window.openLaserModal = openLaserModal;
window.closeLaserModal = closeLaserModal;
window.generateLaserSVG = generateLaserSVG;
window.copyShareLink = copyShareLink;
window.triggerStlImport = triggerStlImport;
window.handleStlImport = handleStlImport;
window.confirmPurgeAll = confirmPurgeAll;

// ─── DOWNLOAD HELPER ─────────────────────────────────────────────
function dl(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// ─── JSON EXPORT ─────────────────────────────────────────────────
function exportJSON() {
  const data = state.knobs.map(k => {
    const { mesh, cardEl, ...params } = k;
    return params;
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  dl(blob, 'access-knobs.json');
}

// ─── CSV EXPORT ──────────────────────────────────────────────────
function exportCSV() {
  const keys = ['id','shape','outerD','height','taper','texMode','texDepth','texScale','texCount','boreD','slotH','clearance','setScrew','mountMode','shaftType'];
  const rows = [keys.join(','), ...state.knobs.map(k => keys.map(key => k[key]).join(','))];
  dl(new Blob([rows.join('\n')], {type:'text/csv'}), 'access-knobs.csv');
}

// ─── OPENSCAD EXPORT ─────────────────────────────────────────────
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
}

// ─── SINGLE STL EXPORT ──────────────────────────────────────────
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

// ─── BATCH STL EXPORT (BIN-PACKED) ──────────────────────────────
async function exportBatchSTL() {
  if (state.knobs.length === 0) return;
  const btn = document.getElementById('exportBatchStlBtn');
  btn.textContent = "BUILDING BATCH...";
  
  await new Promise(r => setTimeout(r, 50));
  
  try {
    const M = await getManifold();
    let combined = null;

    // Sort by diameter descending for better packing
    const sorted = [...state.knobs].sort((a, b) => b.outerD - a.outerD);
    const gap = 3; // mm gap between knobs
    const bedWidth = 200; // mm, typical bed width
    let cursorX = 0, cursorY = 0, rowHeight = 0;

    for (let i = 0; i < sorted.length; i++) {
      const k = sorted[i];
      const d = k.outerD + gap;

      // Start new row if this knob doesn't fit
      if (cursorX + d > bedWidth && cursorX > 0) {
        cursorX = 0;
        cursorY += rowHeight + gap;
        rowHeight = 0;
      }

      let kModel = await generateKnobManifold(k);
      const posX = cursorX + k.outerD / 2;
      const posY = cursorY + k.outerD / 2;
      const offsetZ = k.height / 2;
      kModel = kModel.translate([posX, posY, offsetZ]);

      cursorX += d;
      rowHeight = Math.max(rowHeight, k.outerD);

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

// ─── LASER SVG MODAL ─────────────────────────────────────────────
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

// ─── SHARE LINK ──────────────────────────────────────────────────
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

// ─── PURGE ───────────────────────────────────────────────────────
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
  
  // Actually purge — imported clearAll from ui.js would create circular dep,
  // so we do it inline here
  state.knobs.forEach(k => { if (k.mesh) { k.mesh.geometry.dispose(); k.mesh.material.dispose(); } });
  state.knobs = [];
  state.selectedId = null;
  closeDetail();
  renderGrid();
  saveKnobs();
  closeViewer();
  
  btn.textContent = '✕ PURGE ALL';
  btn.style.color = 'var(--danger)';
  btn.style.borderColor = '#331111';
}

// ─── STL IMPORT (DRAG & DROP + FILE PICKER) ─────────────────────
export function initDragAndDrop() {
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

function triggerStlImport() {
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
    saveKnobs();
    openViewer(p.id);
  } catch (e) {
    console.error(e);
    alert("Failed to generate 3D model for the imported file: " + e.message);
    document.getElementById('countBadge').textContent = state.knobs.length + ' KNOB' + (state.knobs.length !== 1 ? 'S' : '');
  }
}

// Re-export closeDetail for use in confirmPurgeAll
import { closeDetail } from './grid.js';
