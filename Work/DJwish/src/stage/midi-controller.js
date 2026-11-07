/**
 * MidiController - Web MIDI API Integration for DJ Deaf Wish
 * 
 * Supports Pioneer DDJ-200 Smart DJ Controller out of the box,
 * plus interactive MIDI Learn for any generic MIDI controller.
 */

export class MidiController {
  constructor() {
    this.midiAccess = null;
    this.inputs = new Map();
    this.isConnected = false;
    this.activeDeviceName = 'NONE';
    this.listeners = new Map();
    
    // MIDI Learn
    this.learningAction = null;
    this.learnCallback = null;

    // Custom mappings
    this.STORAGE_KEY = 'djwish_midi_mappings';
    this.customMappings = this.loadCustomMappings();

    // Default DDJ-200 profile
    this.defaultProfile = {
      'cc:0:7':  { id: 'eq_hi_1', name: 'DECK 1 EQ HI', deck: 1, type: 'knob' },
      'cc:0:11': { id: 'eq_mid_1', name: 'DECK 1 EQ MID', deck: 1, type: 'knob' },
      'cc:0:15': { id: 'eq_low_1', name: 'DECK 1 EQ LOW', deck: 1, type: 'knob' },
      'cc:0:52': { id: 'fader_1', name: 'DECK 1 FADER', deck: 1, type: 'fader' },
      'cc:1:7':  { id: 'eq_hi_2', name: 'DECK 2 EQ HI', deck: 2, type: 'knob' },
      'cc:1:11': { id: 'eq_mid_2', name: 'DECK 2 EQ MID', deck: 2, type: 'knob' },
      'cc:1:15': { id: 'eq_low_2', name: 'DECK 2 EQ LOW', deck: 2, type: 'knob' },
      'cc:1:52': { id: 'fader_2', name: 'DECK 2 FADER', deck: 2, type: 'fader' },
      'cc:0:31': { id: 'crossfader', name: 'CROSSFADER', deck: 0, type: 'fader' },
      'cc:6:31': { id: 'crossfader', name: 'CROSSFADER', deck: 0, type: 'fader' },
      'noteon:0:11': { id: 'play_1', name: 'DECK 1 PLAY', deck: 1, type: 'button' },
      'noteon:1:11': { id: 'play_2', name: 'DECK 2 PLAY', deck: 2, type: 'button' }
    };
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API is not supported in this browser.');
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.isConnected = true;
      this.scanDevices();
      this.midiAccess.onstatechange = () => this.scanDevices();
      return true;
    } catch (err) {
      console.warn('Web MIDI Access request failed:', err);
      return false;
    }
  }

  scanDevices() {
    this.inputs.clear();
    let hasDevices = false;

    for (const [id, input] of this.midiAccess.inputs) {
      this.inputs.set(id, input);
      input.onmidimessage = (msg) => this.handleMessage(msg);
      this.activeDeviceName = input.name || 'MIDI Device';
      hasDevices = true;
    }

    if (!hasDevices) {
      this.activeDeviceName = 'NO DEVICES';
    }
    this.emit('devicechange', { name: this.activeDeviceName, connected: hasDevices });
  }

  handleMessage(msg) {
    const [statusByte, data1, data2] = msg.data;
    const command = statusByte >> 4;
    const channel = statusByte & 0xf;
    let key = '';

    if (command === 0x9) {
      key = data2 > 0 ? `noteon:${channel}:${data1}` : `noteoff:${channel}:${data1}`;
    } else if (command === 0x8) {
      key = `noteoff:${channel}:${data1}`;
    } else if (command === 0xb) {
      key = `cc:${channel}:${data1}`;
    }

    if (!key) return;

    if (this.learningAction) {
      this.customMappings[key] = {
        id: this.learningAction.id,
        name: this.learningAction.name,
        type: command === 0xb ? 'knob' : 'button'
      };
      this.saveCustomMappings();
      if (this.learnCallback) {
        this.learnCallback(key, this.customMappings[key]);
      }
      this.learningAction = null;
      this.learnCallback = null;
      return;
    }

    const mapping = this.customMappings[key] || this.defaultProfile[key];
    if (mapping) {
      const normVal = data2 / 127.0;
      this.emit(mapping.id, { value: normVal, raw: data2, mapping, key });
      this.emit('any', { id: mapping.id, value: normVal, mapping, key });
    }
  }

  on(actionId, cb) {
    if (!this.listeners.has(actionId)) {
      this.listeners.set(actionId, []);
    }
    this.listeners.get(actionId).push(cb);
  }

  emit(actionId, payload) {
    const cbs = this.listeners.get(actionId);
    if (cbs) {
      cbs.forEach(cb => {
        try { cb(payload); } catch (err) { console.error(err); }
      });
    }
  }

  startLearn(actionId, actionName, cb) {
    this.learningAction = { id: actionId, name: actionName };
    this.learnCallback = cb;
  }

  cancelLearn() {
    this.learningAction = null;
    this.learnCallback = null;
  }

  saveCustomMappings() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.customMappings));
    } catch (_) {}
  }

  loadCustomMappings() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  }
}
