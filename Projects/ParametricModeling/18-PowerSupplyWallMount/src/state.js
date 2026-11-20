// State module for 18-PowerSupplyWallMount
// Concept: Heavy-duty U-bracket with solid flat floor, front bridge, 6 side screw slots, and lightweight honeycomb lattice.
// Brick is inserted with the cable/terminal side facing UPWARD out of the open top.
export const params = {
    // Power Supply Brick Dimensions (mm)
    psuWidth: 113.0,            // Measured width across (default 113mm)
    psuDepth: 52.0,             // Measured depth / thickness (default 52mm)
    psuLength: 200.0,           // Total PSU length (typically 160-215mm)
    clearance: 1.2,             // Tolerance kerf for smooth top slide-in (mm)

    // U-Bracket & Front Bridge Geometry (mm)
    bracketHeight: 110.0,       // Height of bracket body (mm)
    bridgeHeight: 35.0,         // Height of the front retaining bridge band (mm)
    bridgeElevation: 25.0,      // Vertical position of bridge above flat floor (mm)
    floorThickness: 5.0,        // Solid flat bottom floor thickness (mm)
    wallThickness: 4.5,         // Robust structural wall thickness (mm)
    backplateThickness: 4.5,    // Wall backplate thickness (mm)

    // 6 Side Mounting Screw Slots
    flangeWidth: 18.0,          // Side ear flange width for easy drill/driver clearance (mm)
    screwSlotWidth: 4.8,        // Slotted hole width (#8 / #10 / M4 screws) (mm)
    screwSlotLength: 12.0,      // Slotted vertical leveling travel (mm)

    // Honeycomb Lightweight Perforations (Accelerates 3D print job & maximizes convective airflow)
    enableHoneycomb: true,      // Active by default
    honeycombRadius: 7.5,       // Radius of hexagon cells (mm)
    honeycombRib: 3.8,          // Wall rib thickness between hexagon cells (mm)
    honeycombWalls: true,       // Honeycomb on left and right side walls
    honeycombBack: true,        // Honeycomb on backplate behind PSU

    // Visualization & Slicing
    showPSU: true,              // Show PSU phantom mockup (inserted cable-end facing UP)
    showDimensions: true,       // Show technical SVG leader lines
    renderMode: 'neon',         // 'neon' vs 'blueprint'
    opacity: 92                 // Visual opacity
};

export const visibilities = {
    bracket: true,
    psu: true
};

export const meshes = {
    bracket: null,
    psu: null
};

export const context = {
    wasm: null,
    Manifold: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    mainGroup: null,
    overlaySvg: null
};

export const colors = {
    neonCyan: 0x00f3ff,
    neonPink: 0xff007f,
    neonLime: 0xc8ff00,
    neonOrange: 0xffaa00,
    psuChassis: 0x8a99a8,
    terminalPlastic: 0x111317,
    terminalFlapYellow: 0xffcc00,
    terminalScrew: 0xdde4eb,
    blueprintLine: 0x00f3ff,
    blueprintBg: 0x02090b
};
