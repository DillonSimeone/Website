// State and parameter management for 21-HypercubeFrame (v2.0 Monocoque Zero-Overhang PETG)
export const context = {
    wasm: null,
    Manifold: null,
    currentMesh: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    activePreset: 'cube_only', // Default to 'cube_only' on bed so print geometry is immediately visible!
};

export const params = {
    // 1. WS2812B-64 (8x8 5050 LED Matrix) Exact PCB Specs
    pcbSize: 65.0,            // Nominal cube & PCB width/height (65.0mm x 65.0mm flush)
    pcbThickness: 1.6,        // Bare FR4 PCB thickness (1.6mm; back is 100% flat)
    printClearance: 0.25,     // Fit clearance for corner stand cradle (mm)
    holeSpacing: 48.75,       // Center-to-center spacing of the 4 corner M2 holes (±24.375mm, 6x 8.125mm pitch)
    midHoleOffset: 24.375,    // Mid-side hole offset (±24.375mm, 0mm)

    // 2. Monocoque Zero-Overhang Frame & 45° Triangle Corner Architecture
    wallThickness: 5.0,       // Continuous structural frame & bottom plate thickness (5.0mm)
    diamondHalfSpan: 26.5,    // 45° diamond half-span (leaves 12mm wide joined bridges at all edge midpoints!)
    bottomHoleDia: 40.0,      // Vertical center access/weight hole in the flat bottom bed plate (mm)
    m2HoleDia: 1.75,          // Self-tapping M2 screw pilot diameter in PETG (1.75mm tap / 2.2mm clear)
    m2HoleDepth: 6.5,         // M2 blind hole thread depth into triangle corners
    padReliefDepth: 2.2,      // Depth of 54.7° octahedral corner solder-pad (V+/IN/V-) wire channels

    // 3. Corner Wire Pass-Through & Tilted Hypercube Pedestal Stand
    enableCornerWireBore: true, // Zero-overhang wire pass-through at [+X, +Y, -Z] corner
    wireHoleDia: 5.5,         // Diameter of power/data wire pass-through (mm)
    standBaseRadius: 42.0,    // Desktop pedestal footprint radius (mm)
    standHeight: 28.0,        // Pedestal cradle height (mm)

    // 4. Viewport & Visualization Controls
    showGhostPcbs: true,      // Render translucent 8x8 WS2812B-64 panels with 64 LEDs & 6 holes
    explodedView: 0.0,        // 0.0 (assembled) to 1.0 (exploded)
    wireframe: false,         // Show triangle mesh topology
};

export function updateParam(key, val) {
    if (key in params) {
        params[key] = typeof params[key] === 'boolean' ? Boolean(val) : parseFloat(val);
    }
}
