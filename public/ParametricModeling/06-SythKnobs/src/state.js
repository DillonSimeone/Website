// State Management & Parameter Utils for Access Knobs Configurator

export const SHAPES = [
  { id: 'tri',  label: 'TRI',  sides: 3 },
  { id: 'quad', label: 'QUAD', sides: 4 },
  { id: 'pent', label: 'PENT', sides: 5 },
  { id: 'hex',  label: 'HEX',  sides: 6 },
  { id: 'oct',  label: 'OCT',  sides: 8 },
  { id: 'dod',  label: '12',   sides: 12 },
  { id: 'cyl',  label: 'CYL',  sides: 32 },
  { id: 'dstar',label: 'D-STR',sides: 5, star: true },
  { id: 'hstar',label: 'H-STR',sides: 6, star: true },
  { id: 'wave', label: 'WAVE', sides: 0, wave: true },
];

export const state = {
  activeShape: 'hex',
  knobs: [],
  selectedId: null,
  sortMode: 'none',
  mountMode: 'swap',
  renderMode: 'blueprint'
};

// Accessibility / Audio Context
let audioCtx = null;

export function announceChange(text) {
  const announcer = document.getElementById('srAnnouncer');
  if (announcer) {
    announcer.textContent = text;
  }
}

export function playToneForParam(paramId, value) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    let freq = 220; // Default baseline (A3)
    if (paramId === 'outerD') freq = 200 + value * 5; 
    else if (paramId === 'height') freq = 300 + value * 8;
    else if (paramId === 'taper') freq = 100 + value * 4;
    else if (paramId === 'texDepth') freq = 150 + value * 10;
    else if (paramId === 'texScale') freq = 250 + value * 12;
    else if (paramId === 'texCount') freq = 180 + value * 15;
    else freq = 440;
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    const now = audioCtx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    
    osc.start(now);
    osc.stop(now + 0.16);
  } catch (e) {
    console.warn("Audio Context error or not initialized yet", e);
  }
}

export function triggerHapticFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(15);
  }
}

// ─── GET CURRENT PARAMS ───────────────────────────────────────────
export function getParams() {
  const isSwap = state.mountMode === 'swap';
  return {
    shape: state.activeShape,
    sides: SHAPES.find(s => s.id === state.activeShape)?.sides ?? 6,
    star: SHAPES.find(s => s.id === state.activeShape)?.star ?? false,
    wave: SHAPES.find(s => s.id === state.activeShape)?.wave ?? false,
    outerD: +document.getElementById('outerD').value,
    height: +document.getElementById('height').value,
    taper: +document.getElementById('taper').value / 100,
    texMode: document.getElementById('textureMode').value,
    texDepth: +document.getElementById('texDepth').value / 10,
    texScale: +document.getElementById('texScale').value / 10,
    texCount: +document.getElementById('texCount').value,
    boreD: isSwap ? (document.getElementById('synthPreset')?.value === 'wh148' ? 6.0 : 6.0) : +document.getElementById('boreD').value,
    slotH: +document.getElementById('slotH').value,
    clearance: isSwap ? (document.getElementById('synthPreset')?.value === 'wh148' ? 0.15 : 0.0) : +document.getElementById('clearance').value / 10,
    setScrew: isSwap ? 'm3' : document.getElementById('setScrew').value,
    mountMode: state.mountMode,
    shaftType: document.getElementById('shaftType')?.value || 'dshaft'
  };
}

export function updateParamDisplay(r) {
  const map = {
    outerD: v => v + '',
    height: v => v + '',
    taper: v => (v/100).toFixed(2),
    texDepth: v => (v/10).toFixed(1),
    texScale: v => (v/10).toFixed(1),
    texCount: v => v + '',
    boreD: v => (+v).toFixed(1),
    slotH: v => v + '',
    clearance: v => (v/10).toFixed(1),
  };
  const friendlyNames = {
    outerD: 'Outer Diameter',
    height: 'Height',
    taper: 'Taper Ratio',
    texDepth: 'Texture Depth',
    texScale: 'Texture Scale',
    texCount: 'Texture Count',
    boreD: 'Inner Bore Diameter',
    slotH: 'Slot Depth',
    clearance: 'Clearance'
  };
  const fn = map[r.id];
  if (fn) {
    const el = document.getElementById('v_' + r.id);
    if (el) {
      const displayVal = fn(r.value);
      if (el.tagName === 'INPUT') {
        el.value = displayVal;
      } else {
        el.textContent = displayVal;
      }
      
      const friendlyName = friendlyNames[r.id] || r.id;
      const unit = r.id === 'taper' ? '' : (r.id === 'texCount' ? ' count' : ' millimeters');
      announceChange(`${friendlyName} is now ${displayVal}${unit}`);
    }
  }
}

export function updateAllDisplays() {
  document.querySelectorAll('input[type=range]').forEach(r => updateParamDisplay(r));
}

export function encodeParams(k) {
  const data = {
    s: k.shape,
    od: k.outerD,
    h: k.height,
    t: k.taper,
    tm: k.texMode || 'flutes',
    td: k.texDepth,
    ts: k.texScale,
    tc: k.texCount,
    bd: k.boreD,
    sh: k.slotH,
    c: k.clearance,
    ss: k.setScrew,
    mm: k.mountMode || (k.boreD > 10 ? 'slide' : 'swap'),
    st: k.shaftType || 'dshaft'
  };
  const json = JSON.stringify(data);
  let b64 = btoa(json);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeParams(b64) {
  try {
    let str = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
      str += '=';
    }
    const json = atob(str);
    const data = JSON.parse(json);
    
    const texMode = data.tm || (data.gp === 'square' ? 'flutes' : data.gp === 'vee' ? 'knurl' : 'flutes');
    const texDepth = data.td ?? data.gd ?? 3.0;
    const texScale = data.ts ?? data.gd ?? 3.0; // Fallback to gd if gp/gw mismatch
    const texCount = data.tc ?? data.gc ?? 8;
    
    return {
      shape: data.s,
      outerD: data.od,
      height: data.h,
      taper: data.t,
      texMode: texMode,
      texDepth: texDepth,
      texScale: texScale,
      texCount: texCount,
      boreD: data.bd,
      slotH: data.sh,
      clearance: data.c,
      setScrew: data.ss,
      mountMode: data.mm,
      shaftType: data.st || 'dshaft'
    };
  } catch (e) {
    console.error("Failed to decode parameters", e);
    return null;
  }
}

export function applyParamsToSliders(p) {
  // Update Shape
  state.activeShape = p.shape;
  document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sbtn_' + p.shape)?.classList.add('active');
  
  // Update Outer Diameter Select & Slider
  const select = document.getElementById('outerDSelect');
  const sliderContainer = document.getElementById('outerDSliderContainer');
  const outerDInput = document.getElementById('outerD');
  if (select && sliderContainer && outerDInput) {
    if (['19', '25', '32'].includes(String(p.outerD))) {
      select.value = String(p.outerD);
      sliderContainer.style.display = 'none';
    } else {
      select.value = 'custom';
      sliderContainer.style.display = 'block';
    }
  }
  
  // Update Sliders
  if (outerDInput) outerDInput.value = p.outerD;
  document.getElementById('height').value = p.height;
  document.getElementById('taper').value = Math.round(p.taper * 100);
  
  // Texture params
  document.getElementById('textureMode').value = p.texMode || 'flutes';
  document.getElementById('texDepth').value = Math.round(p.texDepth * 10);
  document.getElementById('texScale').value = Math.round(p.texScale * 10);
  document.getElementById('texCount').value = p.texCount;
  
  document.getElementById('boreD').value = p.boreD;
  document.getElementById('slotH').value = p.slotH;
  document.getElementById('clearance').value = Math.round(p.clearance * 10);
  document.getElementById('setScrew').value = p.setScrew;
  if (p.shaftType && document.getElementById('shaftType')) {
    document.getElementById('shaftType').value = p.shaftType;
  }
  
  // Update display values
  updateAllDisplays();
}
