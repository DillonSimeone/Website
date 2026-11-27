// Runtime state, parametric configurations, and preset management for 20-IYL
export const context = {
    wasm: null,
    Manifold: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    handGeometry: null,
    currentBaseManifold: null,
    currentLidManifold: null,
    currentPedestalManifold: null,
    currentSledManifold: null,
    isBuilding: false
};

export const params = {
    // Pedestal Dimensions (All presets share standardized 86mm base diameter for universal sled compatibility)
    style: 'tapered_cylinder', // 'tapered_cylinder' | 'low_profile' | 'octagon' | 'tall_column'
    baseDiameter: 86.0,
    topDiameter: 66.0,
    height: 38.0,
    lidThickness: 6.0, // Drop-in top lid plate thickness
    lipWallThickness: 1.8, // Retaining lip wall thickness around the top perimeter
    wallThickness: 3.2,
    cableHoleDia: 18.0,
    printClearance: 0.25,
    
    // Twist-Lock Specs (matches ilyHandStand.stl: 60mm x 40mm ellipse base)
    flangeClearance: 0.35,
    socketDepth: 4.2,
    lockAngle: 45.0,
    
    // Universal Sled Specs (Single Source of Truth - 100% Immutable Standard)
    sledWidth: 24.0,
    sledHeight: 7.0,
    sledFloorThick: 1.6,
    mcuPocketWidth: 18.6,
    mcuPocketLength: 23.0,
    usbCableWidth: 10.5,
    usbCableHeight: 5.2,

    // Visualization Options
    showHand: true,
    showBase: true,
    showLid: true,
    showSled: true,
    xrayMode: false,
    explodedOffset: 0.0, // 0 to 60mm separation
    displayMode: 'assembly' // 'assembly' | 'base' | 'lid' | 'sled' | 'hand'
};

export const PRESETS = {
    tapered_cylinder: {
        name: 'Tapered Cylinder Plinth',
        desc: 'Balanced desktop stance with smooth conical taper matching the natural wrist contour.',
        baseDiameter: 86.0,
        topDiameter: 66.0,
        height: 38.0,
        wallThickness: 3.2
    },
    low_profile: {
        name: 'Low-Profile Puck',
        desc: 'Minimalist, low center-of-gravity puck plinth keeping total visual focus on the hand.',
        baseDiameter: 86.0,
        topDiameter: 71.3,
        height: 28.0,
        wallThickness: 3.0
    },
    octagon: {
        name: 'Chamfered Octagon',
        desc: 'Modern faceted CAD plinth with 8 chamfered facets and crisp architectural presence.',
        baseDiameter: 86.0,
        topDiameter: 66.0,
        height: 38.0,
        wallThickness: 3.5
    },
    tall_column: {
        name: 'Tall Museum Plinth',
        desc: 'Elevated presentation column giving dramatic height and extra internal wire storage.',
        baseDiameter: 86.0,
        topDiameter: 64.0,
        height: 56.0,
        wallThickness: 3.5
    }
};

export function applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    params.style = presetKey;
    params.baseDiameter = preset.baseDiameter;
    params.topDiameter = preset.topDiameter;
    params.height = preset.height;
    params.wallThickness = preset.wallThickness;
}
