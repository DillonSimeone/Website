import {
  state,
  updateAllDisplays,
  announceChange,
  playToneForParam,
  triggerHapticFeedback,
  setMountMode
} from './state.js';
import { selectShape } from './ui.js';

export function handlePresetChange(preset) {
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
}
