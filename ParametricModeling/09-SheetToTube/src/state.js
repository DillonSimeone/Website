// State module for Sheet-to-Tube Cylinder Cap Configurator

export const params = {
    sheetWidthInches: 9.75,       // inches
    sheetHeightInches: 6.75,      // inches
    sheetThickness: 0.5,    // mm
    rollDirection: 'width', // 'width' or 'height'
    holeDiam: 25.0,         // mm
    lipDepth: 8.0,          // mm
    wallThick: 2.0,         // mm
    tolerance: 0.20,        // mm
    ledCount: 8,            // vertical channels
    ledWidth: 10.0,         // mm
    ledDepth: 5.0,          // mm
    slipRing: 'none',       // 'none', 'bottom', 'top', 'both'
    bracketCount: 2,        // number of M3 side brackets
    motorWheelDiam: 16.0,   // mm - pinion pitch diameter
    opacity: 90,
    mode: 'blueprint'       // 'rendered' or 'blueprint'
};

export const visibilities = {
    topCap: true,
    bottomCap: true,
    sheet: true,
    brackets: true,
    motorHolder: true
};

export const meshes = {
    bottomCap: null,
    topCap: null,
    sheet: null,
    brackets: [],
    motorHolder: null,
    motorHolderTop: null,
    pinionGear: null,
    pinionGear2: null,
    pinionGearTop: null,
    pinionGearTop2: null,
    ringGear: null,
    ringGearTop: null,
    connector: null,
    connectorTop: null
};

export const context = {
    wasm: null,
    Manifold: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    mainGroup: null,
    overlaySvg: document.getElementById('dimensions-overlay')
};

// Colors (Neon Cyan Theme)
export const colors = {
    cyanIce: 0x00f3ff,
    glowCyan: 0x00aaff,
    limeAccent: 0xc8ff00,
    greenAccent: 0x00ff88,
    sheetBlue: 0x00bfff,
    blueprintLine: 0x00f3ff,
    blueprintFace: 0x011218
};
