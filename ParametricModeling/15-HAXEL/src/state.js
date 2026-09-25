// State module for HAXEL Dense Electronics Enclosure

export const params = {
    // Shell
    wallThick: 2.0,         // mm - outer shell wall thickness
    tolerance: 0.3,         // mm - sled-to-shell clearance per side
    cornerRadius: 1.5,      // mm - shell corner rounding

    // Motor (Type 130 default — from SheetToTube MOTOR_130 reference)
    // W = bodyWidth (20mm, perpendicular to shaft, wider side)
    // H = bodyHeight (15mm, perpendicular to shaft, flat side)
    // L = bodyLength (27.5mm, along shaft axis)
    motorW: 20.0,           // mm - body width (wider side)
    motorH: 15.0,           // mm - body height (flat side)
    motorL: 27.5,           // mm - body length (along shaft axis)
    motorShaftLen: 9.0,     // mm - shaft protrusion beyond body
    motorShaftDiam: 2.0,    // mm

    // Motor Clamp
    clampThick: 3.0,        // mm - U-bracket wall thickness
    clampScrewDiam: 3.2,    // mm - M3 bolt hole diameter
    clampScrewCount: 2,     // per side

    // ESP32-C3 SuperMini
    espW: 18.0,             // mm
    espD: 22.5,             // mm
    espH: 4.6,              // mm (PCB 1.6 + USB 3.0)

    // L298N Mini Dual H-Bridge
    l298W: 24.7,            // mm
    l298D: 21.0,            // mm
    l298H: 5.0,             // mm

    // TP4056 Charger Module
    tpW: 17.2,              // mm
    tpD: 28.0,              // mm
    tpH: 4.2,               // mm (PCB 1.2 + USB 3.0)

    // LiPo Battery
    batW: 36.0,             // mm
    batD: 20.0,             // mm
    batH: 9.0,              // mm

    // Assembly
    explode: 0,             // 0-100 explosion percentage
    cornerScrewDiam: 3.2,   // mm - M3 corner bolt diameter
    pocketTolerance: 0.5,   // mm - extra clearance around each component

    // Display
    opacity: 85,
    mode: 'rendered'        // 'rendered' or 'xray'
};

export const visibilities = {
    shell: true,
    lid: true,
    sled: true,
    motorClamp: true,
    components: true
};

export const meshes = {
    shellBottom: null,
    lid: null,
    sled: null,
    motorClamp: null,
    // Component ghost meshes
    motor: null,
    esp32: null,
    l298n: null,
    tp4056: null,
    battery: null
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

// Neobrutalism-inspired colors for 3D parts
export const colors = {
    shell: 0x222222,        // Dark charcoal shell
    lid: 0x333333,          // Slightly lighter lid
    sled: 0xff5e97,         // Hot pink sled (primary accent)
    motorClamp: 0xffe600,   // Signal yellow clamp
    motor: 0x888888,        // Neutral gray motor ghost
    esp32: 0x24d6ff,        // Electric cyan ESP32
    l298n: 0xff5e97,        // Pink L298N
    tp4056: 0xffe600,       // Yellow TP4056
    battery: 0x44cc44       // Green battery
};
