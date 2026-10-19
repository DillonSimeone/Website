// State and parameter management for 19-DeafDoorbellEnclosures (v2.0 Redesign)
export const context = {
    wasm: null,
    Manifold: null,
    currentMesh: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    activePreset: 'master_all', // 'master_all', 'master_base', 'master_lid', 'follower_all', 'follower_base', 'follower_lid', 'follower_grid', 'follower_stand'
};

export const params = {
    // Shell & Fabrication Tolerances
    wallThickness: 2.2,       // Shell wall thickness in mm
    printClearance: 0.35,     // XY fit clearance for PCB and components
    screwHoleDia: 3.2,        // M3 lid clamp screw pass hole / pilot (2.8 tap / 3.2 pass)
    screwHeadDia: 5.8,        // M3 counterbore head diameter
    wallTabScrewDia: 4.2,     // Wall mounting screw diameter (#6 drywall screw / M4)
    wallTabCounterbore: 7.6,  // Wall mounting screw head recess
    cableJacketDia: 4.0,      // USB-C cable jacket outer diameter
    cableBootWidth: 11.2,     // Molded USB-C boot width
    cableBootThickness: 6.6,  // Molded USB-C boot thickness
    cableBootLength: 16.0,    // Molded USB-C boot clamp length

    // ESP32-C3 SuperMini Dimensions
    espWidth: 18.0,
    espLength: 22.8,
    espPcbThick: 1.2,
    espUsbPortWidth: 9.0,
    espUsbPortHeight: 3.2,

    // Master Node (MAX4466 Microphone Module)
    max4466Length: 21.0,      // Module length extending leftward from ESP32
    max4466Width: 14.0,       // Module width along Y
    max4466Depth: 9.0,        // Module component depth (electret capsule + trimpot)
    micWidth: 14.0,
    micLength: 21.0,
    micThick: 1.6,
    acousticHornDia: 4.5,     // Rear acoustic port diameter

    // Follower Node (8x8 WS2812B Matrix & Desk Stand)
    matrixWidth: 65.2,
    matrixLength: 65.2,
    matrixThick: 1.6,
    matrixGridDepth: 4.5,
    standTiltAngle: 18.0,     // Desktop kickstand tilt angle (degrees)

    // Visualisation Controls
    explodedView: 0.0,        // 0.0 (closed) to 1.0 (fully exploded)
    wireframe: false,
};

export function updateParam(key, val) {
    if (key in params) {
        params[key] = typeof params[key] === 'boolean' ? Boolean(val) : parseFloat(val);
    }
}
