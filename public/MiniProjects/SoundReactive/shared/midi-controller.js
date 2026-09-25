/**
 * MidiController - Web MIDI API Integration for Deaf DJ Station
 * 
 * Specifically optimized for Pioneer DDJ-200 Smart DJ Controller
 * with universal fallback, real-time telemetry, and interactive MIDI Learn.
 */

export class MidiController {
  constructor() {
    this.midiAccess = null;
    this.inputs = new Map();
    this.outputs = new Map();
    this.isConnected = false;
    this.activeDeviceName = 'NONE';
    this.listeners = new Map();
    
    // MIDI Learn State
    this.learningAction = null;
    this.learnCallback = null;

    // Custom Mappings Store (persisted to localStorage)
    this.STORAGE_KEY = 'deaf_dj_midi_mappings';
    this.customMappings = this.loadCustomMappings();

    // Default DDJ-200 Hardware Profile Mapping
    // DDJ-200 Channels:
    // Ch 0 (1 in DJ terms): Deck 1 (Left)
    // Ch 1 (2 in DJ terms): Deck 2 (Right)
    // Ch 6 (7 in DJ terms): Mixer Controls
    this.defaultProfile = {
      // Deck 1 Knobs & Faders (Ch 0)
      'cc:0:7':  { id: 'eq_hi_1', name: 'DECK 1 EQ HI', deck: 1, type: 'knob' },
      'cc:0:11': { id: 'eq_mid_1', name: 'DECK 1 EQ MID', deck: 1, type: 'knob' },
      'cc:0:15': { id: 'eq_low_1', name: 'DECK 1 EQ LOW', deck: 1, type: 'knob' },
      'cc:0:19': { id: 'cfx_1', name: 'DECK 1 COLOR FX', deck: 1, type: 'knob' },
      'cc:0:52': { id: 'fader_1', name: 'DECK 1 CHANNEL FADER', deck: 1, type: 'fader' },
      'cc:0:20': { id: 'fader_1_alt', name: 'DECK 1 CHANNEL FADER', deck: 1, type: 'fader' },

      // Deck 2 Knobs & Faders (Ch 1)
      'cc:1:7':  { id: 'eq_hi_2', name: 'DECK 2 EQ HI', deck: 2, type: 'knob' },
      'cc:1:11': { id: 'eq_mid_2', name: 'DECK 2 EQ MID', deck: 2, type: 'knob' },
      'cc:1:15': { id: 'eq_low_2', name: 'DECK 2 EQ LOW', deck: 2, type: 'knob' },
      'cc:1:19': { id: 'cfx_2', name: 'DECK 2 COLOR FX', deck: 2, type: 'knob' },
      'cc:1:52': { id: 'fader_2', name: 'DECK 2 CHANNEL FADER', deck: 2, type: 'fader' },
      'cc:1:20': { id: 'fader_2_alt', name: 'DECK 2 CHANNEL FADER', deck: 2, type: 'fader' },

      // Mixer Crossfader (Ch 6 or Ch 0)
      'cc:6:31': { id: 'crossfader', name: 'CROSSFADER', deck: 0, type: 'fader' },
      'cc:0:31': { id: 'crossfader', name: 'CROSSFADER', deck: 0, type: 'fader' },
      'cc:1:31': { id: 'crossfader', name: 'CROSSFADER', deck: 0, type: 'fader' },

      // Tempo Sliders (Pitch)
      'cc:0:0':  { id: 'tempo_1', name: 'DECK 1 TEMPO', deck: 1, type: 'fader' },
      'cc:1:0':  { id: 'tempo_2', name: 'DECK 2 TEMPO', deck: 2, type: 'fader' },

      // Jog Wheel Rotation (CC 33 or 34)
      'cc:0:33': { id: 'jog_1', name: 'DECK 1 JOG ROTATE', deck: 1, type: 'jog' },
      'cc:0:34': { id: 'jog_1', name: 'DECK 1 JOG ROTATE', deck: 1, type: 'jog' },
      'cc:1:33': { id: 'jog_2', name: 'DECK 2 JOG ROTATE', deck: 2, type: 'jog' },
      'cc:1:34': { id: 'jog_2', name: 'DECK 2 JOG ROTATE', deck: 2, type: 'jog' },

      // Deck 1 Buttons & Pads (Ch 0)
      'note:0:11': { id: 'play_1', name: 'DECK 1 PLAY/PAUSE', deck: 1, type: 'button' },
      'note:0:12': { id: 'cue_1', name: 'DECK 1 CUE', deck: 1, type: 'button' },
      'note:0:54': { id: 'jog_touch_1', name: 'DECK 1 JOG TOUCH', deck: 1, type: 'touch' },

      // Deck 2 Buttons & Pads (Ch 1)
      'note:1:11': { id: 'play_2', name: 'DECK 2 PLAY/PAUSE', deck: 2, type: 'button' },
      'note:1:12': { id: 'cue_2', name: 'DECK 2 CUE', deck: 2, type: 'button' },
      'note:1:54': { id: 'jog_touch_2', name: 'DECK 2 JOG TOUCH', deck: 2, type: 'touch' },
    };

    // Populate standard 8 pads for Deck 1 & Deck 2
    // Pioneer DDJ-200 Hot Cue notes are typically 0 to 7 (or 0x00-0x07)
    for (let p = 0; p < 8; p++) {
      // Deck 1 Pads
      this.defaultProfile[`note:0:${p}`] = { id: `pad_1_${p + 1}`, name: `DECK 1 PAD ${p + 1}`, deck: 1, padIndex: p, type: 'pad' };
      // Fallback alternative notes (some firmware uses 0x20..0x27 / 32..39 or 0x24..0x2B / 36..43)
      this.defaultProfile[`note:0:${32 + p}`] = { id: `pad_1_${p + 1}`, name: `DECK 1 PAD ${p + 1}`, deck: 1, padIndex: p, type: 'pad' };
      this.defaultProfile[`note:0:${36 + p}`] = { id: `pad_1_${p + 1}`, name: `DECK 1 PAD ${p + 1}`, deck: 1, padIndex: p, type: 'pad' };

      // Deck 2 Pads
      this.defaultProfile[`note:1:${p}`] = { id: `pad_2_${p + 1}`, name: `DECK 2 PAD ${p + 1}`, deck: 2, padIndex: p, type: 'pad' };
      this.defaultProfile[`note:1:${32 + p}`] = { id: `pad_2_${p + 1}`, name: `DECK 2 PAD ${p + 1}`, deck: 2, padIndex: p, type: 'pad' };
      this.defaultProfile[`note:1:${36 + p}`] = { id: `pad_2_${p + 1}`, name: `DECK 2 PAD ${p + 1}`, deck: 2, padIndex: p, type: 'pad' };
    }
  }

  loadCustomMappings() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  saveCustomMappings() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.customMappings));
    } catch (e) {
      console.warn('Failed to save MIDI mappings to localStorage', e);
    }
  }

  resetCustomMappings() {
    this.customMappings = {};
    this.saveCustomMappings();
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      this.trigger('unsupported');
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      
      this.midiAccess.onstatechange = (e) => {
        this.handleStateChange(e);
      };

      this.scanInputs();
      return true;
    } catch (err) {
      console.warn('Web MIDI Access request failed or denied:', err);
      this.trigger('error', err);
      return false;
    }
  }

  scanInputs() {
    this.inputs.clear();
    let hasDevice = false;
    let foundName = '';

    for (const input of this.midiAccess.inputs.values()) {
      this.inputs.set(input.id, input);
      input.onmidimessage = (msg) => this.handleMidiMessage(msg, input);
      hasDevice = true;
      foundName = input.name || 'MIDI Device';
    }

    this.outputs.clear();
    for (const output of this.midiAccess.outputs.values()) {
      this.outputs.set(output.id, output);
    }

    this.isConnected = hasDevice;
    this.activeDeviceName = hasDevice ? foundName : 'NONE';
    this.trigger('connection', {
      connected: this.isConnected,
      deviceName: this.activeDeviceName,
      inputCount: this.inputs.size
    });
  }

  handleStateChange(e) {
    this.scanInputs();
  }

  handleMidiMessage(event, inputDevice) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0];
    const data1 = data[1];
    const data2 = data.length > 2 ? data[2] : 0;

    const typeCode = status & 0xF0;
    const channel = status & 0x0F;

    const isNoteOn = (typeCode === 0x90 && data2 > 0);
    const isNoteOff = (typeCode === 0x80 || (typeCode === 0x90 && data2 === 0));
    const isCC = (typeCode === 0xB0);
    const isPitchBend = (typeCode === 0xE0);

    const eventKey = isCC ? `cc:${channel}:${data1}` : `note:${channel}:${data1}`;

    const rawTelemetry = {
      device: inputDevice.name,
      timestamp: performance.now(),
      status,
      typeCode,
      channel,
      data1,
      data2,
      eventKey,
      isNoteOn,
      isNoteOff,
      isCC,
      isPitchBend,
      hex: `${status.toString(16).toUpperCase()} ${data1.toString(16).toUpperCase()} ${data2.toString(16).toUpperCase()}`
    };

    // 1. Emit Raw Message for Debug Monitor HUD
    this.trigger('rawMessage', rawTelemetry);

    // 2. Check if currently in MIDI Learn mode
    if (this.learningAction) {
      if (isNoteOn || isCC) {
        this.customMappings[eventKey] = {
          actionId: this.learningAction.id,
          actionName: this.learningAction.name,
          device: inputDevice.name
        };
        this.saveCustomMappings();

        const resolved = {
          actionId: this.learningAction.id,
          eventKey,
          isCC,
          data1,
          channel
        };

        if (this.learnCallback) {
          this.learnCallback(resolved);
        }

        this.trigger('learnComplete', resolved);
        this.learningAction = null;
        this.learnCallback = null;
        return;
      }
    }

    // 3. Resolve Mapping (Custom overrides Default profile)
    let mapping = this.customMappings[eventKey] || this.defaultProfile[eventKey];

    // Generic heuristic for unprofiled controllers
    if (!mapping) {
      if (isCC) {
        mapping = { id: `cc_${data1}`, name: `CC #${data1} (CH ${channel + 1})`, deck: channel === 1 ? 2 : 1, type: 'knob' };
      } else if (isNoteOn || isNoteOff) {
        mapping = { id: `note_${data1}`, name: `NOTE #${data1} (CH ${channel + 1})`, deck: channel === 1 ? 2 : 1, type: 'button' };
      }
    }

    // 4. Process control actions
    if (isCC) {
      // Check if it's a relative jog wheel CC
      // Pioneer DDJ-200 jog wheels send CC 33/34 where 65=CW, 63=CCW
      if (mapping.type === 'jog' || data1 === 33 || data1 === 34) {
        const delta = data2 - 64; // >0 CW, <0 CCW
        this.trigger('jog', {
          deck: mapping.deck || (channel === 1 ? 2 : 1),
          delta,
          rawVal: data2,
          control: mapping
        });
        return;
      }

      const normalized = data2 / 127.0; // 0.0 to 1.0
      this.trigger('controlChange', {
        key: eventKey,
        control: mapping,
        value: data2,
        normalized,
        channel,
        deck: mapping.deck
      });
    } else if (isNoteOn) {
      this.trigger('noteOn', {
        key: eventKey,
        control: mapping,
        note: data1,
        velocity: data2,
        channel,
        deck: mapping.deck
      });
    } else if (isNoteOff) {
      this.trigger('noteOff', {
        key: eventKey,
        control: mapping,
        note: data1,
        channel,
        deck: mapping.deck
      });
    }
  }

  startLearn(actionId, actionName, callback) {
    this.learningAction = { id: actionId, name: actionName };
    this.learnCallback = callback;
    this.trigger('learnStart', this.learningAction);
  }

  cancelLearn() {
    this.learningAction = null;
    this.learnCallback = null;
    this.trigger('learnCancel');
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  off(event, handler) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter(h => h !== handler);
    this.listeners.set(event, filtered);
  }

  trigger(event, payload) {
    if (!this.listeners.has(event)) return;
    for (const handler of this.listeners.get(event)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`Error in MIDI listener for ${event}:`, err);
      }
    }
  }

  /**
   * Send MIDI feedback to light up DDJ-200 LEDs (e.g. pad lights)
   */
  sendNote(channel, note, velocity) {
    for (const output of this.outputs.values()) {
      try {
        output.send([0x90 | (channel & 0x0F), note & 0x7F, velocity & 0x7F]);
      } catch {}
    }
  }
}
