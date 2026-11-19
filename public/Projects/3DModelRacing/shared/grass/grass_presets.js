/**
 * shared/grass/grass_presets.js — Concentric Ring Defaults, Species & Floral Presets
 */

export const DEFAULT_GRASS_RINGS = [
    {
        id: 'ring1_ultra',
        name: 'Ring 1 (Ultra Carpet)',
        segments: 2,
        bladesPerTuft: 4,
        cellSize: 0.34,
        patchSize: 165,
        bladeWidth: 0.044,
        maxBladeHeight: 1.02,
        fadeInMin: 0.0,
        fadeInMax: 0.0,
        fadeOutMin: 18.0,
        fadeOutMax: 56.0,
        enableTrample: true,
        leanMin: 0.05,
        leanMax: 0.30,
        curveMin: 0.15,
        curveMax: 0.40,
        hScaleMin: 0.40,
        hScaleMax: 1.20
    },
    {
        id: 'ring2_fine',
        name: 'Ring 2 (Fine Meadow)',
        segments: 2,
        bladesPerTuft: 4,
        cellSize: 0.50,
        patchSize: 270,
        bladeWidth: 0.068,
        maxBladeHeight: 1.04,
        fadeInMin: 18.0,
        fadeInMax: 56.0,
        fadeOutMin: 58.0,
        fadeOutMax: 112.0,
        enableTrample: true,
        leanMin: 0.06,
        leanMax: 0.32,
        curveMin: 0.14,
        curveMax: 0.38,
        hScaleMin: 0.45,
        hScaleMax: 1.25
    },
    {
        id: 'ring3_mid',
        name: 'Ring 3 (Mid Meadow)',
        segments: 1,
        bladesPerTuft: 4,
        cellSize: 0.72,
        patchSize: 430,
        bladeWidth: 0.105,
        maxBladeHeight: 1.08,
        fadeInMin: 58.0,
        fadeInMax: 112.0,
        fadeOutMin: 115.0,
        fadeOutMax: 188.0,
        enableTrample: false,
        leanMin: 0.08,
        leanMax: 0.35,
        curveMin: 0.12,
        curveMax: 0.36,
        hScaleMin: 0.50,
        hScaleMax: 1.30
    },
    {
        id: 'ring4_farmid',
        name: 'Ring 4 (Far-Mid Field)',
        segments: 1,
        bladesPerTuft: 3,
        cellSize: 1.05,
        patchSize: 650,
        bladeWidth: 0.165,
        maxBladeHeight: 1.14,
        fadeInMin: 115.0,
        fadeInMax: 188.0,
        fadeOutMin: 190.0,
        fadeOutMax: 290.0,
        enableTrample: false,
        leanMin: 0.08,
        leanMax: 0.35,
        curveMin: 0.12,
        curveMax: 0.34,
        hScaleMin: 0.50,
        hScaleMax: 1.30
    },
    {
        id: 'ring5_far',
        name: 'Ring 5 (Distant Field)',
        segments: 1,
        bladesPerTuft: 3,
        cellSize: 1.55,
        patchSize: 940,
        bladeWidth: 0.255,
        maxBladeHeight: 1.20,
        fadeInMin: 190.0,
        fadeInMax: 290.0,
        fadeOutMin: 295.0,
        fadeOutMax: 420.0,
        enableTrample: false,
        leanMin: 0.08,
        leanMax: 0.35,
        curveMin: 0.10,
        curveMax: 0.32,
        hScaleMin: 0.55,
        hScaleMax: 1.35
    },
    {
        id: 'ring6_horizon',
        name: 'Ring 6 (Horizon Sea)',
        segments: 1,
        bladesPerTuft: 2,
        cellSize: 2.25,
        patchSize: 1260,
        bladeWidth: 0.380,
        maxBladeHeight: 1.28,
        fadeInMin: 295.0,
        fadeInMax: 420.0,
        fadeOutMin: 430.0,
        fadeOutMax: 560.0,
        enableTrample: false,
        leanMin: 0.06,
        leanMax: 0.30,
        curveMin: 0.10,
        curveMax: 0.30,
        hScaleMin: 0.60,
        hScaleMax: 1.40
    }
];

export const GRASS_PRESETS = {
    kentuckyBluegrass: {
        name: 'Kentucky Bluegrass',
        description: 'Dense, fine, blue-green meadow grass',
        bladeHeight: 0.55,
        bladeWidth: 0.038,
        curvature: 0.45,
        stiffness: 1.0,
        patchiness: 0.40,
        translucency: 0.70,
        colors: {
            colRoot:  [0.015, 0.065, 0.020],
            colLower: [0.070, 0.160, 0.075],
            colMid:   [0.150, 0.320, 0.190],
            colUpper: [0.240, 0.480, 0.290],
            colTip:   [0.310, 0.615, 0.388]
        }
    },
    perennialRyegrass: {
        name: 'Perennial Ryegrass',
        description: 'Glossy, dark green, slightly taller tufts',
        bladeHeight: 0.60,
        bladeWidth: 0.048,
        curvature: 0.30,
        stiffness: 1.0,
        patchiness: 0.35,
        translucency: 0.65,
        colors: {
            colRoot:  [0.012, 0.050, 0.010],
            colLower: [0.078, 0.180, 0.035],
            colMid:   [0.160, 0.350, 0.080],
            colUpper: [0.260, 0.510, 0.120],
            colTip:   [0.345, 0.640, 0.170]
        }
    },
    tallFescue: {
        name: 'Tall Fescue',
        description: 'Coarse, wide blades in strong clumps',
        bladeHeight: 0.85,
        bladeWidth: 0.068,
        curvature: 0.45,
        stiffness: 1.15,
        patchiness: 0.45,
        translucency: 0.60,
        colors: {
            colRoot:  [0.025, 0.060, 0.012],
            colLower: [0.120, 0.220, 0.050],
            colMid:   [0.260, 0.390, 0.100],
            colUpper: [0.420, 0.540, 0.180],
            colTip:   [0.540, 0.655, 0.282]
        }
    },
    bermuda: {
        name: 'Bermuda Grass',
        description: 'Very dense, short, fine-bladed turf',
        bladeHeight: 0.36,
        bladeWidth: 0.032,
        curvature: 0.25,
        stiffness: 1.4,
        patchiness: 0.38,
        translucency: 0.55,
        colors: {
            colRoot:  [0.030, 0.070, 0.018],
            colLower: [0.120, 0.240, 0.065],
            colMid:   [0.280, 0.470, 0.140],
            colUpper: [0.440, 0.650, 0.220],
            colTip:   [0.576, 0.770, 0.330]
        }
    },
    zoysia: {
        name: 'Zoysia Grass',
        description: 'Short, stiff, carpet-like lawn grass',
        bladeHeight: 0.32,
        bladeWidth: 0.034,
        curvature: 0.20,
        stiffness: 1.8,
        patchiness: 0.28,
        translucency: 0.45,
        colors: {
            colRoot:  [0.025, 0.065, 0.020],
            colLower: [0.110, 0.230, 0.075],
            colMid:   [0.230, 0.440, 0.150],
            colUpper: [0.380, 0.610, 0.240],
            colTip:   [0.510, 0.725, 0.340]
        }
    },
    stAugustine: {
        name: 'St. Augustine Grass',
        description: 'Broad, flat, deep green blades',
        bladeHeight: 0.75,
        bladeWidth: 0.075,
        curvature: 0.35,
        stiffness: 1.25,
        patchiness: 0.35,
        translucency: 0.58,
        colors: {
            colRoot:  [0.018, 0.055, 0.010],
            colLower: [0.086, 0.220, 0.045],
            colMid:   [0.170, 0.390, 0.090],
            colUpper: [0.240, 0.510, 0.130],
            colTip:   [0.310, 0.604, 0.173]
        }
    },
    buffalo: {
        name: 'Buffalo Grass',
        description: 'Short, curly, grey-green prairie grass',
        bladeHeight: 0.42,
        bladeWidth: 0.034,
        curvature: 0.68,
        stiffness: 1.0,
        patchiness: 0.48,
        translucency: 0.45,
        colors: {
            colRoot:  [0.065, 0.080, 0.055],
            colLower: [0.180, 0.210, 0.150],
            colMid:   [0.340, 0.390, 0.280],
            colUpper: [0.550, 0.610, 0.450],
            colTip:   [0.760, 0.800, 0.604]
        }
    },
    fineFescue: {
        name: 'Fine Fescue',
        description: 'Very thin, floppy, blue-green blades',
        bladeHeight: 0.60,
        bladeWidth: 0.024,
        curvature: 0.75,
        stiffness: 0.7,
        patchiness: 0.40,
        translucency: 0.50,
        colors: {
            colRoot:  [0.020, 0.055, 0.032],
            colLower: [0.080, 0.180, 0.110],
            colMid:   [0.180, 0.340, 0.220],
            colUpper: [0.330, 0.530, 0.380],
            colTip:   [0.500, 0.663, 0.541]
        }
    },
    toonMeadow: {
        name: 'Toon Meadow (Stylized)',
        description: 'Wide, saturated, bright green blades',
        bladeHeight: 0.65,
        bladeWidth: 0.080,
        curvature: 0.30,
        stiffness: 0.85,
        patchiness: 0.20,
        translucency: 0.90,
        colors: {
            colRoot:  [0.020, 0.120, 0.035],
            colLower: [0.120, 0.380, 0.140],
            colMid:   [0.260, 0.620, 0.220],
            colUpper: [0.450, 0.820, 0.280],
            colTip:   [0.651, 0.949, 0.361]
        }
    },
    goldenSavanna: {
        name: 'Golden Savanna (Stylized)',
        description: 'Tall, dry, golden African plains grass',
        bladeHeight: 1.05,
        bladeWidth: 0.048,
        curvature: 0.50,
        stiffness: 0.75,
        patchiness: 0.35,
        translucency: 0.90,
        colors: {
            colRoot:  [0.080, 0.060, 0.020],
            colLower: [0.240, 0.180, 0.065],
            colMid:   [0.480, 0.370, 0.130],
            colUpper: [0.720, 0.580, 0.240],
            colTip:   [0.941, 0.824, 0.478]
        }
    },
    autumnHaze: {
        name: 'Autumn Haze (Stylized)',
        description: 'Olive-to-ochre autumn field',
        bladeHeight: 0.60,
        bladeWidth: 0.050,
        curvature: 0.45,
        stiffness: 0.9,
        patchiness: 0.50,
        translucency: 0.70,
        colors: {
            colRoot:  [0.055, 0.038, 0.015],
            colLower: [0.180, 0.120, 0.045],
            colMid:   [0.380, 0.260, 0.090],
            colUpper: [0.580, 0.420, 0.160],
            colTip:   [0.702, 0.569, 0.263]
        }
    },
    frostbite: {
        name: 'Frostbite (Stylized)',
        description: 'Pale, frosted silver-white winter grass',
        bladeHeight: 0.50,
        bladeWidth: 0.042,
        curvature: 0.35,
        stiffness: 1.5,
        patchiness: 0.25,
        translucency: 0.55,
        colors: {
            colRoot:  [0.045, 0.062, 0.075],
            colLower: [0.130, 0.170, 0.200],
            colMid:   [0.260, 0.340, 0.390],
            colUpper: [0.550, 0.650, 0.710],
            colTip:   [0.894, 0.933, 0.941]
        }
    }
};

export const SPECIES_PRESET_ALIASES = {
    bermudaGrass: 'bermuda',
    zoysiaGrass: 'zoysia',
    stAugustineGrass: 'stAugustine',
    buffaloGrass: 'buffalo'
};

export const FLORA_PRESETS = {
    sakura: {
        name: 'Sakura Blossom',
        colors: {
            colRoot:  [0.039, 0.102, 0.024],
            colLower: [0.110, 0.227, 0.063],
            colMid:   [0.243, 0.431, 0.133],
            colUpper: [0.471, 0.667, 0.267],
            colTip:   [0.706, 0.894, 0.486]
        },
        flowerColors: [
            [1.00, 0.30, 0.43],
            [1.00, 0.52, 0.63],
            [1.00, 0.70, 0.78],
            [1.00, 1.00, 1.00]
        ]
    },
    sunburst: {
        name: 'Sunburst Meadow',
        colors: {
            colRoot:  [0.031, 0.078, 0.016],
            colLower: [0.094, 0.173, 0.024],
            colMid:   [0.227, 0.376, 0.063],
            colUpper: [0.533, 0.596, 0.118],
            colTip:   [0.902, 0.784, 0.196]
        },
        flowerColors: [
            [1.00, 0.13, 0.00],
            [1.00, 0.73, 0.00],
            [1.00, 0.87, 0.27],
            [1.00, 1.00, 1.00]
        ]
    },
    autumn: {
        name: 'Autumn Sunset',
        colors: {
            colRoot:  [0.110, 0.055, 0.016],
            colLower: [0.227, 0.118, 0.031],
            colMid:   [0.439, 0.220, 0.063],
            colUpper: [0.722, 0.345, 0.094],
            colTip:   [0.831, 0.533, 0.125]
        },
        flowerColors: [
            [1.00, 0.33, 0.07],
            [0.80, 0.07, 0.13],
            [0.93, 0.73, 0.13],
            [0.73, 0.40, 0.13]
        ]
    },
    cyberpunk: {
        name: 'Cyberpunk Neon',
        colors: {
            colRoot:  [0.039, 0.016, 0.094],
            colLower: [0.094, 0.031, 0.188],
            colMid:   [0.173, 0.055, 0.322],
            colUpper: [0.000, 0.824, 1.000],
            colTip:   [0.000, 1.000, 0.835]
        },
        flowerColors: [
            [1.00, 0.00, 0.50],
            [1.00, 0.90, 0.00],
            [0.00, 0.95, 1.00],
            [1.00, 0.00, 0.73]
        ]
    },
    opal: {
        name: 'Oceanic Opal',
        colors: {
            colRoot:  [0.016, 0.086, 0.094],
            colLower: [0.039, 0.173, 0.188],
            colMid:   [0.078, 0.333, 0.345],
            colUpper: [0.204, 0.565, 0.533],
            colTip:   [0.455, 0.867, 0.800]
        },
        flowerColors: [
            [1.00, 0.44, 0.65],
            [1.00, 0.84, 0.44],
            [0.44, 0.84, 1.00],
            [0.91, 1.00, 0.44]
        ]
    }
};

export const DEFAULT_GRASS_CONFIG = {
    adaptiveDensity: {
        enabled: true,
        targetTrianglesPerRing: 1200000,
        cullingCompensation: 1.35
    },
    curvature: 0.35,
    stiffness: 1.0,
    translucency: 0.65,
    patchiness: 0.40,
    densityDropoff: 1.0,
    radialJitterAmp: 6.5,
    boundaryMargin: 8.0,
    flora: {
        flowerFrequency: 0.08,
        cloverFrequency: 0.10,
        wheatFrequency: 0.08,
        twistIntensity: 0.95,
        flowerColors: [
            [0.949, 0.220, 0.200],
            [0.980, 0.820, 0.141],
            [0.220, 0.549, 0.949],
            [0.980, 0.980, 0.949]
        ]
    },
    rings: DEFAULT_GRASS_RINGS,
    colors: {
        colRoot:  [0.020, 0.078, 0.008],
        colLower: [0.078, 0.176, 0.024],
        colMid:   [0.180, 0.361, 0.078],
        colUpper: [0.302, 0.478, 0.118],
        colTip:   [0.420, 0.522, 0.157]
    }
};
