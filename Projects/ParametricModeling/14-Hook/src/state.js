// State module for 14-Hook Configurator

export const params = {
    // Flat Bar dimensions
    barWidth: 25.0,             // mm (height of slot)
    barThickness: 3.0,          // mm (width of slot)
    slotTolerance: 0.3,         // mm (clearance)
    slotLipHeight: 8.0,         // mm (retaining front lip height)
    
    // Hook body details
    hookWallThickness: 5.0,     // mm (wall surrounding slot)
    backplateWidth: 22.0,       // mm
    backplateThickness: 5.0,     // mm
    rampHeight: 25.0,           // mm (bottom support gusset)

    // Screw specifications
    screwSpacing: 60.0,         // mm
    screwHoleDiameter: 4.5,     // mm
    screwHeadDiameter: 8.5,     // mm
    
    // Rendering parameters
    opacity: 90,
    mode: 'blueprint'           // 'rendered' or 'blueprint'
};

export const visibilities = {
    hook: true,
    bar: true
};

export const meshes = {
    hook: null,
    bar: null
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

// Colors (Neon Theme matching the cyber look)
export const colors = {
    cyanIce: 0x00f3ff,          // Hook Color in Blueprint
    glowCyan: 0x00aaff,
    limeAccent: 0xc8ff00,       // Bar Color
    pinkAccent: 0xff007f,       // Hook Color in Rendered Mode
    greenAccent: 0x00ff88,
    orangeAccent: 0xffaa00,
    blueprintLine: 0x00f3ff,
    blueprintFace: 0x011218
};
