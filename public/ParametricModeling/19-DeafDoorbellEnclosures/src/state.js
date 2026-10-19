// State and parameter management for 19-DeafDoorbellEnclosures
export const context = {
    wasm: null,
    Manifold: null,
    currentMesh: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    activePreset: 'master_all', // 'master_all', 'master_base', 'master_lid', 'follower_all', 'follower_base', 'follower_lid', 'follower_grid'
};

export const params = {
    // Shared Enclosure Tolerances
    wallThickness: 2.2,     // Shell wall thickness in mm
    printClearance: 0.35,   // XY fit clearance for PCB and components
    screwHoleDia: 2.8,      // M3 lid clamp screw pilot diameter (2.8 for self-tap, 4.2 for brass inserts)
    screwHeadDia: 5.6,      // M3 counterbore head diameter
    cableJacketDia: 4.0,    // USB-C cable jacket outer diameter (compressed to 3.4mm)
    cableBootWidth: 11.2,   // Molded USB-C boot width
    cableBootThickness: 6.6,// Molded USB-C boot thickness
    cableBootLength: 22.0,  // Molded USB-C boot length

    // ESP32-C3 SuperMini Dimensions
    espWidth: 18.0,
    espLength: 22.8,
    espPcbThick: 1.2,
    espUsbPortWidth: 9.0,
    espUsbPortHeight: 3.2,
    espUsbPortExtension: 1.2,

    // Master Specific (INMP441 Microphone)
    micWidth: 14.2,
    micLength: 14.2,
    micThick: 1.6,
    acousticHornDia: 3.2,   // Intake acoustic funnel hole
    masterKeyholePitch: 36.0,

    // Follower Specific (8x8 WS2812B Matrix)
    matrixWidth: 65.2,
    matrixLength: 65.2,
    matrixThick: 1.6,
    matrixGridDepth: 4.5,
    followerKeyholePitch: 48.0,

    // Visualisation Controls
    explodedView: 0.0,      // 0.0 (closed) to 1.0 (fully exploded)
    showPhantom: true,      // Display translucent ghost ESP32 & cables
    wireframe: false,
    colorTheme: 'cyan',
};

export function updateParam(key, val) {
    if (key in params) {
        params[key] = typeof params[key] === 'boolean' ? Boolean(val) : parseFloat(val);
    }
}
