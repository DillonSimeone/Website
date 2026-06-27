// State module for Parametric Potentiometer Box Configurator

export const params = {
    // Grid Parameters
    pitch: 32.0,            // Distance between knobs in mm (25 to 50)
    rows: 1,                // Amount of rows (1 to 5)
    cols: 4,                // Amount of columns (1 to 8)
    
    // Potentiometer Specs
    shaftLength: 15.0,      // Total shaft length L in mm (15, 20, 25, 30)
    shaftStyle: 'dshaft',   // 'dshaft', 'knurled', 'round'
    
    // Box Customization
    wallThick: 2.0,         // Wall thickness in mm (1.5 to 3.5)
    clearance: 0.25,        // Clearance tolerance between base and lid (0.1 to 0.5)
    padding: 10.0,          // Margin around grid/components inside box in mm (8 to 15)

    // OLED Configurator (Tweak size and M3 screw spacing)
    oledWidth: 25.0,        // OLED window width (15.0 to 35.0)
    oledHeight: 14.0,       // OLED window height (10.0 to 25.0)
    oledHolePitchX: 21.0,   // Horizontal distance between mounting holes (15.0 to 30.0)
    oledHolePitchY: 21.0,   // Vertical distance between mounting holes (15.0 to 30.0)
    
    // Visibilities & View
    showBase: true,
    showLid: true,
    showPots: true,
    showKnobs: true,
    showElectronics: true,
    exploded: 0.0,          // Exploded view separation distance (0 to 50mm)
    mode: 'rendered'        // 'rendered' or 'blueprint'
};

export const visibilities = {
    base: true,
    lid: true,
    pots: true,
    knobs: true,
    electronics: true
};

export const meshes = {
    base: null,
    lid: null,
    pots: [],
    knobs: [],
    electronics: {
        esp32: null,
        batteryHolder: null,
        charger: null,
        oled: null,
        toggleSwitch: null
    }
};

export const context = {
    wasm: null,
    Manifold: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    mainGroup: null
};

// Cyberpunk Aesthetic Color Palette
export const colors = {
    baseColor: 0x121620,      // Dark slate box base
    lidColor: 0x1a233a,       // Slate lid
    potMetal: 0x8892b0,       // Silver/metallic pots
    potTerminals: 0xb58900,   // Golden brass pins
    pcbGreen: 0x0f5132,       // Deep green PCB (ESP32, charger, screen board)
    oledScreen: 0x050505,     // OLED dark screen glass
    batteryBlack: 0x151515,   // Battery holder black plastic
    neonPink: 0xff007f,       // Synth knobs neon pink
    neonCyan: 0x00f3ff,       // Synth knobs neon cyan
    gridAccent: 0x2e3b5e,     // Blue viewport grid accent
    neonBlueGlow: 0x00aaff,   // Glow effects
    neonYellow: 0xffd700,     // Highlights
    switchBody: 0x202020,     // Black rocker switch body
    switchRocker: 0xa90000    // Red rocker switch toggle
};
