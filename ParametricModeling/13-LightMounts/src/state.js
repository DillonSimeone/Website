// State module for 13-LightMounts Configurator

export const params = {
    // Hinge configurations
    hingeAngle: 0,              // degrees (preview only)
    explodedView: 0,            // percentage (0 to 100)
    hingeWidth: 20.0,           // mm
    hingePinDiameter: 8.0,      // mm (3D printed pin)
    hingeKnuckleRadius: 8.0,    // mm
    
    // Wall plate configurations
    wallPlateWidth: 45.0,       // mm
    wallPlateHeight: 70.0,      // mm
    wallPlateThickness: 5.0,    // mm
    screwSpacing: 45.0,         // mm
    screwHoleDiameter: 4.5,     // mm
    screwHeadDiameter: 8.5,     // mm
    
    // Tolerance & Offset configurations
    wallClearance: 0.25,        // mm (tolerance between slider and track)
    lightOffset: 100.0,         // mm (arm length from wall plate to hinge pivot)
    hingeOffsetX: 0.0,          // mm (allow tweaking placement on STL)
    hingeOffsetY: 0.0,          // mm (allow tweaking placement on STL)
    hingeOffsetZ: 0.0,          // mm (allow tweaking placement on STL)
    
    opacity: 90,
    mode: 'blueprint'           // 'rendered' or 'blueprint'
};

export const visibilities = {
    lightFrame: true,
    hingeConnector: true,
    wallPlate: true,
    bolt: true,
    nut: true
};

export const meshes = {
    lightFrame: null,
    hingeConnector: null,
    wallPlate: null,
    bolt: null,
    nut: null
};

export const context = {
    wasm: null,
    Manifold: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    mainGroup: null,
    overlaySvg: document.getElementById('dimensions-overlay'),
    
    // Cache the loaded raw STL geometry to avoid reloading from network on every slider movement
    rawStlGeometry: null 
};

// Colors (Neon Theme matching the cyber look)
export const colors = {
    cyanIce: 0x00f3ff,        // Light Frame modification
    glowCyan: 0x00aaff,
    limeAccent: 0xc8ff00,      // Wall Plate
    pinkAccent: 0xff007f,      // Hinge Connector
    greenAccent: 0x00ff88,
    orangeAccent: 0xffaa00,     // 3D Printed Bolt & Nut
    blueprintLine: 0x00f3ff,
    blueprintFace: 0x011218
};
