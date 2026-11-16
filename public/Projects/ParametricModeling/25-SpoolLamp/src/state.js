// State and parameter management for 25-SpoolLamp
export const context = {
    wasm: null,
    Manifold: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    activePreset: 'assembly',
    estimatedStripCm: 0,
};

export const params = {
    // Bambu A1 Reusable Spool Dimensions
    spoolBoreDia: 54.5,       // Center cylinder inner diameter (mm)
    spoolCoreOD: 82.0,        // Core outer diameter where filament/waves glue (mm)
    spoolInnerWidth: 60.0,    // Cavity width between flanges (mm)
    spoolMaxOD: 195.0,        // Max outer diameter for internal waves (mm)

    // 54.5mm Front Center Hub Plug (ESP32-C3 SuperMini + MAX4466) - Flush, NO lip
    plugDepth: 26.0,          // Barrel depth into 54.5mm bore
    plugWall: 2.2,            // Barrel & face wall thickness
    plugClearance: 0.20,      // Friction fit diameter clearance
    micHoleDia: 10.2,         // MAX4466 electret capsule pass-through
    micProtrusion: 1.0,       // Capsule proudness past front face (reference)
    max4466Width: 14.4,       // MAX4466 PCB width + clearance
    max4466Length: 21.4,      // MAX4466 PCB length + clearance
    espWidth: 18.4,           // ESP32-C3 SuperMini width + clearance
    espLength: 23.0,          // ESP32-C3 SuperMini length + clearance

    // Internal LED Wave Insert (Two 180° C-halves slid in radially & hot-glued to coreOD)
    waveMode: 'sinusoidal',   // 'sinusoidal' | 'spiral' | 'zigzag'
    waveCount: 10,            // Full-circle lobes (5 per 180° C-half)
    waveAmplitude: 24.0,      // Radial wave swing (mm)
    spiralTurns: 3,           // Radial serpentine/spiral layers per half
    petalSharpness: 0.0,      // 0 = smooth sine, 1 = sharp star/zig-zag
    waveHeight: 58.0,         // Fills spoolInnerWidth (60mm - 2mm clearance)
    waveWall: 1.6,            // Ribbon thickness (translucent glow)

    // Parametric Outer Casing, Shade.stl Adapter & Angled Wall Mount
    casingPattern: 'twisted_ribs', // 'twisted_ribs' | 'fluted' | 'diamond'
    casingWall: 0.85,              // 1-2 perimeters (0.45mm = 1 wall, 0.85mm = 2 walls)
    casingRibCount: 32,            // Side pattern rib count
    casingRibDepth: 6.5,           // Side pattern depth (mm)
    casingTwistDeg: 38.0,          // Helical twist angle (degrees)
    casingHeight: 73.0,            // Casing depth (matches Shade.stl 73.15mm)
    lidHubCutout: true,            // true = 54.5mm hub cutout, false = solid thin lid
    wallMountAngle: 5.0,           // 5 deg upward tilt keeps lamp locked on wall
    wallMountGrooveW: 12.0,        // 12mm cable relief groove for JST + USB-C
    shadeHoleDia: 156.0,           // Measured Shade.stl bottom opening ID
    shadeBoltR: 91.35,             // Measured Shade.stl 6-hole bolt radius

    // Viewport Controls
    showSpoolGhost: true,
    explodedView: 0.0,
    wireframe: false,
};

export const PRESETS = {
    assembly: {
        label: 'Full Assembly',
        changes: { explodedView: 0.0 }
    },
    hub_only: {
        label: '54.5mm Mic Hub',
        changes: {}
    },
    casing_mount: {
        label: 'Casing + Wall Mount',
        changes: {}
    },
    shade_adapter: {
        label: 'Shade.stl Adapter',
        changes: {}
    },
    wall_mount: {
        label: 'Wall Mount Only',
        changes: {}
    },
    wave_sinusoidal: {
        label: 'Sinusoidal Wave',
        changes: {
            waveMode: 'sinusoidal',
            waveCount: 10,
            waveAmplitude: 24.0,
            petalSharpness: 0.0,
            waveHeight: 58.0
        }
    },
    wave_spiral: {
        label: 'Serpentine Spiral',
        changes: {
            waveMode: 'spiral',
            spiralTurns: 3.0,
            waveAmplitude: 3.0,
            waveCount: 8,
            waveHeight: 58.0
        }
    },
    wave_zigzag: {
        label: 'Star Zig-Zag',
        changes: {
            waveMode: 'zigzag',
            waveCount: 12,
            waveAmplitude: 24.0,
            petalSharpness: 1.0,
            waveHeight: 58.0
        }
    },
    wave_dense: {
        label: 'Dense Max-LED',
        changes: {
            waveMode: 'sinusoidal',
            waveCount: 16,
            waveAmplitude: 25.0,
            petalSharpness: 0.35,
            waveHeight: 58.0
        }
    }
};

export function updateParam(key, val) {
    if (!(key in params)) return;
    if (typeof params[key] === 'boolean') {
        params[key] = Boolean(val);
    } else if (typeof params[key] === 'string') {
        params[key] = String(val);
    } else {
        params[key] = parseFloat(val);
    }
}
