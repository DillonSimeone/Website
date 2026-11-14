// State and parameter management for 21-HypercubeFrame (v3.0 Dual-Mode: Screw Cube + Modular Lego-Slot Tiles)
export const context = {
    wasm: null,
    Manifold: null,
    currentMesh: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    activePreset: 'cube_only', // 'cube_only', 'assembly_flat', 'assembly_stand', 'stand_only', 'print_plate', 'tile_single', 'tile_cube', 'tile_cluster', 'tile_plate'
};

export const params = {
    // 0. Toggleable Mounting Mode: 'screws' (Monocoque M2 Cube) | 'slots' (Modular Interlocking Cross-Frame Tiles)
    mountMode: 'screws',

    // 1. WS2812B-64 (8x8 5050 LED Matrix) Exact PCB Specs
    pcbSize: 65.0,            // Nominal PCB width (65.0mm)
    pcbThickness: 1.6,        // Bare FR4 PCB thickness (1.6mm; back is 100% flat)
    printClearance: 0.25,     // Fit clearance for stand cradle & PCB drop-in slot (mm)
    holeSpacingX: 48.75,      // Horizontal center-to-center M2 hole spacing (mm)
    holeSpacingY: 49.75,      // Vertical center-to-center M2 hole spacing (+1.0mm vs X for generic 65x66mm batch)
    midHoleOffset: 24.375,    // Mid-side hole offset (±24.375mm, 0mm)

    // 2. Monocoque Screw Cube Parameters
    wallThickness: 5.0,       // Continuous structural frame & bottom plate thickness (5.0mm)
    diamondHalfSpan: 26.5,    // 45° diamond half-span (leaves 12mm wide joined bridges at all edge midpoints)
    bottomHoleDia: 40.0,      // Vertical center access/weight hole in the flat bottom bed plate (mm)
    m2HoleDia: 1.75,          // Self-tapping M2 screw pilot diameter in PETG (1.75mm tap / 2.2mm clear)
    m2HoleDepth: 6.5,         // M2 blind hole thread depth into triangle corners

    // 3. Modular Cross-Frame Slot Tile Parameters ('slots' mode)
    tileThickness: 5.2,       // Total thickness of each modular interlocking tile (mm)
    crossBeamWidth: 5.0,      // Width of the center '+' support cross beams (mm)
    slotClearance: 0.06,      // Tile pocket clearance per side (mm)
    clipWidthOffset: -0.20,   // Clip neck/head width adjustment (mm) calibrated via Fit-Test Array

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
