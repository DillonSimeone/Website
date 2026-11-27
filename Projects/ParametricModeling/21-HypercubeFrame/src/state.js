// State and parameter management for 21-HypercubeFrame (v4.0 Tri-Mode)
// Modes: 'screws' (Monocoque M-Screw Cube) | 'octa' (Octa-Node Internal Screw Hubs) | 'miter' (45° Miter-Rail & Tapered Cotter-Pin)
export const context = {
    wasm: null,
    Manifold: null,
    currentMesh: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    activePreset: 'cube_only',
};

export const params = {
    // 0. Toggleable Architecture Mode: 'screws' | 'octa' | 'miter'
    mountMode: 'screws',

    // 1. WS2812B-64 (8x8 5050 LED Matrix) & Universal M-Screw Specs
    pcbSize: 65.0,            // Nominal PCB width (65.0mm)
    pcbThickness: 1.6,        // Bare FR4 PCB thickness (1.6mm; back is 100% flat)
    printClearance: 0.25,     // Fit clearance for stand cradle & PCB drop-in slot (mm)
    holeSpacingX: 48.75,      // Horizontal center-to-center M-screw hole spacing (mm)
    holeSpacingY: 49.75,      // Vertical center-to-center M-screw hole spacing (+1.0mm vs X)
    midHoleOffset: 24.375,    // Mid-side hole offset (±24.375mm, 0mm)

    // Universal M-Screw Slider (M1.0 to M3.0 -> auto-computes PETG pilot & clearance holes!)
    screwNominalDia: 1.6,     // Nominal M-screw size (e.g., 1.0, 1.4, 1.6, 2.0, 3.0)

    // 2. Monocoque Screw Cube Parameters ('screws' mode)
    wallThickness: 5.0,
    diamondHalfSpan: 17.5,
    bottomHoleDia: 32.0,
    m2HoleDepth: 6.5,

    // 3. Modular Cross-Ring Tile Parameters ('octa' & 'miter' modes)
    tileThickness: 5.2,       // Total thickness of each modular tile (mm)
    crossBeamWidth: 5.0,      // Width of center '+' support cross beams (mm)
    pinClearance: 0.15,       // Cotter-pin / hub hole tolerance adjustment (mm)

    // 4. Corner Wire Pass-Through & Tilted Hypercube Pedestal Stand
    enableCornerWireBore: true,
    wireHoleDia: 5.5,
    standBaseRadius: 42.0,
    standHeight: 28.0,

    // 5. Viewport & Visualization Controls
    showGhostPcbs: true,
    explodedView: 0.0,
    wireframe: false,
};

// Helper: Convert nominal M-screw size (1.0 - 3.0mm) to PETG self-tapping pilot & clearance diameters
export function getScrewPilotDia(p) {
    return Math.max(0.85, +(p.screwNominalDia * 0.85).toFixed(2));
}

export function getScrewClearanceDia(p) {
    return +(p.screwNominalDia + 0.35).toFixed(2);
}

export function updateParam(key, val) {
    if (key in params) {
        if (typeof params[key] === 'boolean') {
            params[key] = Boolean(val);
        } else if (typeof params[key] === 'string') {
            params[key] = String(val);
        } else {
            params[key] = parseFloat(val);
        }
    }
}
