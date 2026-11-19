/**
 * shared/visual_modes.js — Full-Scene Visual Themes Shared Across Game & Grass Study
 *
 * Defines 8 toggleable visual modes controlling grass palette & shading FX,
 * sky/cloud colors, sun/ambient lighting, atmospheric fog, terrain tint,
 * road surface accents, and snow/wind weather modifiers.
 */

export const VISUAL_MODE_STORAGE_KEY = 'model3d_visual_mode';

export const VISUAL_MODE_ORDER = [
    'natural',
    'cyberpunk',
    'biolum',
    'opal',
    'toon',
    'savanna',
    'frostbite',
    'audio'
];

export const VISUAL_MODES = {
    natural: {
        id: 'natural',
        name: 'Natural Meadow',
        shortName: 'Natural',
        icon: '🌿',
        description: 'Lush sunlit valley with dynamic day-night cycle',
        shadingFx: 0,
        grass: {
            colors: {
                colRoot:  [0.020, 0.078, 0.008],
                colLower: [0.078, 0.176, 0.024],
                colMid:   [0.180, 0.361, 0.078],
                colUpper: [0.302, 0.478, 0.118],
                colTip:   [0.420, 0.522, 0.157]
            },
            flowerColors: [
                [0.949, 0.220, 0.200],
                [0.980, 0.820, 0.141],
                [0.220, 0.549, 0.949],
                [0.980, 0.980, 0.949]
            ],
            curvature: 0.35,
            stiffness: 1.0,
            translucency: 0.65,
            patchiness: 0.40,
            heightMult: 1.0,
            widthMult: 1.0
        },
        atmosphere: {
            skyZenith: [0.16, 0.50, 0.92],
            skyHorizon: [0.60, 0.80, 0.98],
            sunColor: '#fffaed',
            sunIntensity: 1.6,
            ambientColor: '#cce2ff',
            ambientIntensity: 0.95,
            fogColor: '#7fa5d8',
            fogNear: 85.0,
            fogFar: 390.0,
            cloudColor: [0.98, 0.99, 1.0],
            cloudShadowIntensity: 0.15,
            lockTimeOfDay: null,
            exposure: 1.0,
            starBoost: 0.0
        },
        terrain: {
            tintHex: '#437328',
            deepHex: '#183610',
            midHex: '#2b521a',
            highHex: '#407022'
        },
        road: {
            tintHex: '#ffffff',
            emissiveHex: '#000000',
            emissiveIntensity: 0.0
        },
        weather: {
            snow: false,
            windMult: 1.0
        }
    },

    cyberpunk: {
        id: 'cyberpunk',
        name: 'Cyberpunk Synth',
        shortName: 'Cyberpunk',
        icon: '🔮',
        description: 'Neon cyan & hot magenta synthwave night grid',
        shadingFx: 3,
        grass: {
            colors: {
                colRoot:  [0.039, 0.016, 0.094],
                colLower: [0.094, 0.031, 0.188],
                colMid:   [0.173, 0.055, 0.322],
                colUpper: [0.000, 0.824, 1.000],
                colTip:   [0.000, 1.000, 0.835]
            },
            flowerColors: [
                [1.000, 0.000, 0.500],
                [1.000, 0.900, 0.000],
                [0.000, 0.950, 1.000],
                [1.000, 0.000, 0.730]
            ],
            curvature: 0.25,
            stiffness: 1.25,
            translucency: 0.85,
            patchiness: 0.25,
            heightMult: 1.05,
            widthMult: 1.05
        },
        atmosphere: {
            skyZenith: [0.04, 0.02, 0.14],
            skyHorizon: [0.36, 0.06, 0.42],
            sunColor: '#ff3ca6',
            sunIntensity: 1.2,
            ambientColor: '#5a3299',
            ambientIntensity: 0.75,
            fogColor: '#1f0b36',
            fogNear: 70.0,
            fogFar: 340.0,
            cloudColor: [0.45, 0.12, 0.58],
            cloudShadowIntensity: 0.20,
            lockTimeOfDay: 0.68,
            exposure: 1.12,
            starBoost: 0.9
        },
        terrain: {
            tintHex: '#1d1035',
            deepHex: '#090414',
            midHex: '#15082b',
            highHex: '#28104a'
        },
        road: {
            tintHex: '#92a8d1',
            emissiveHex: '#240046',
            emissiveIntensity: 0.35
        },
        weather: {
            snow: false,
            windMult: 1.2
        }
    },

    biolum: {
        id: 'biolum',
        name: 'Bioluminescent Twilight',
        shortName: 'Biolum',
        icon: '🌊',
        description: 'Rippling teal and violet glow waves under twilight stars',
        shadingFx: 2,
        grass: {
            colors: {
                colRoot:  [0.010, 0.045, 0.080],
                colLower: [0.025, 0.120, 0.180],
                colMid:   [0.050, 0.280, 0.340],
                colUpper: [0.120, 0.620, 0.680],
                colTip:   [0.350, 0.960, 0.880]
            },
            flowerColors: [
                [0.000, 0.950, 0.850],
                [0.880, 0.150, 0.950],
                [0.250, 0.700, 1.000],
                [0.750, 1.000, 0.920]
            ],
            curvature: 0.42,
            stiffness: 0.90,
            translucency: 0.95,
            patchiness: 0.30,
            heightMult: 1.1,
            widthMult: 1.0
        },
        atmosphere: {
            skyZenith: [0.02, 0.06, 0.16],
            skyHorizon: [0.08, 0.24, 0.38],
            sunColor: '#7be8ff',
            sunIntensity: 0.95,
            ambientColor: '#2d6e8e',
            ambientIntensity: 0.72,
            fogColor: '#0c2336',
            fogNear: 75.0,
            fogFar: 350.0,
            cloudColor: [0.14, 0.34, 0.48],
            cloudShadowIntensity: 0.18,
            lockTimeOfDay: 0.62,
            exposure: 1.08,
            starBoost: 0.85
        },
        terrain: {
            tintHex: '#0f3038',
            deepHex: '#041218',
            midHex: '#092229',
            highHex: '#143b42'
        },
        road: {
            tintHex: '#94b8c8',
            emissiveHex: '#003844',
            emissiveIntensity: 0.22
        },
        weather: {
            snow: false,
            windMult: 1.15
        }
    },

    opal: {
        id: 'opal',
        name: 'Iridescent Opal',
        shortName: 'Opal',
        icon: '🌈',
        description: 'Pearlescent daylight meadow with spectral Fresnel sheen',
        shadingFx: 1,
        grass: {
            colors: {
                colRoot:  [0.024, 0.086, 0.094],
                colLower: [0.055, 0.190, 0.190],
                colMid:   [0.120, 0.360, 0.340],
                colUpper: [0.240, 0.580, 0.520],
                colTip:   [0.520, 0.880, 0.820]
            },
            flowerColors: [
                [1.000, 0.440, 0.650],
                [1.000, 0.840, 0.440],
                [0.440, 0.840, 1.000],
                [0.940, 1.000, 0.650]
            ],
            curvature: 0.38,
            stiffness: 0.95,
            translucency: 0.90,
            patchiness: 0.30,
            heightMult: 1.0,
            widthMult: 1.05
        },
        atmosphere: {
            skyZenith: [0.26, 0.48, 0.86],
            skyHorizon: [0.84, 0.78, 0.96],
            sunColor: '#fff4fa',
            sunIntensity: 1.55,
            ambientColor: '#d9d4ff',
            ambientIntensity: 0.95,
            fogColor: '#b9c4eb',
            fogNear: 90.0,
            fogFar: 410.0,
            cloudColor: [1.0, 0.95, 0.99],
            cloudShadowIntensity: 0.12,
            lockTimeOfDay: 0.14,
            exposure: 1.02,
            starBoost: 0.0
        },
        terrain: {
            tintHex: '#285c54',
            deepHex: '#0b2220',
            midHex: '#153b36',
            highHex: '#265c52'
        },
        road: {
            tintHex: '#eae6f8',
            emissiveHex: '#1a1030',
            emissiveIntensity: 0.08
        },
        weather: {
            snow: false,
            windMult: 1.0
        }
    },

    toon: {
        id: 'toon',
        name: 'Toon Ghibli',
        shortName: 'Toon',
        icon: '🎨',
        description: 'Vivid cel-shaded emerald hills and sunlit painted clouds',
        shadingFx: 5,
        grass: {
            colors: {
                colRoot:  [0.020, 0.120, 0.035],
                colLower: [0.120, 0.380, 0.140],
                colMid:   [0.260, 0.620, 0.220],
                colUpper: [0.450, 0.820, 0.280],
                colTip:   [0.651, 0.949, 0.361]
            },
            flowerColors: [
                [1.000, 0.280, 0.350],
                [1.000, 0.900, 0.180],
                [0.280, 0.720, 1.000],
                [1.000, 1.000, 0.960]
            ],
            curvature: 0.32,
            stiffness: 0.85,
            translucency: 0.95,
            patchiness: 0.20,
            heightMult: 1.05,
            widthMult: 1.25
        },
        atmosphere: {
            skyZenith: [0.10, 0.54, 0.96],
            skyHorizon: [0.58, 0.88, 1.00],
            sunColor: '#fff8dc',
            sunIntensity: 1.75,
            ambientColor: '#c8ecff',
            ambientIntensity: 1.05,
            fogColor: '#8ad0f8',
            fogNear: 100.0,
            fogFar: 430.0,
            cloudColor: [1.0, 1.0, 1.0],
            cloudShadowIntensity: 0.18,
            lockTimeOfDay: 0.16,
            exposure: 1.05,
            starBoost: 0.0
        },
        terrain: {
            tintHex: '#3f8a2c',
            deepHex: '#133a10',
            midHex: '#235e1a',
            highHex: '#3e8a26'
        },
        road: {
            tintHex: '#ffe8cc',
            emissiveHex: '#000000',
            emissiveIntensity: 0.0
        },
        weather: {
            snow: false,
            windMult: 1.05
        }
    },

    savanna: {
        id: 'savanna',
        name: 'Golden Savanna',
        shortName: 'Savanna',
        icon: '🌾',
        description: 'Tall sunlit golden plains at eternal amber sunset',
        shadingFx: 0,
        grass: {
            colors: {
                colRoot:  [0.080, 0.060, 0.020],
                colLower: [0.240, 0.180, 0.065],
                colMid:   [0.480, 0.370, 0.130],
                colUpper: [0.720, 0.580, 0.240],
                colTip:   [0.941, 0.824, 0.478]
            },
            flowerColors: [
                [0.950, 0.360, 0.120],
                [1.000, 0.780, 0.220],
                [0.880, 0.520, 0.240],
                [1.000, 0.940, 0.780]
            ],
            curvature: 0.50,
            stiffness: 0.75,
            translucency: 0.95,
            patchiness: 0.38,
            heightMult: 1.32,
            widthMult: 1.05
        },
        atmosphere: {
            skyZenith: [0.28, 0.22, 0.48],
            skyHorizon: [0.98, 0.56, 0.22],
            sunColor: '#ffae52',
            sunIntensity: 1.7,
            ambientColor: '#ffd1a3',
            ambientIntensity: 0.88,
            fogColor: '#e08d4f',
            fogNear: 80.0,
            fogFar: 370.0,
            cloudColor: [1.0, 0.78, 0.52],
            cloudShadowIntensity: 0.22,
            lockTimeOfDay: 0.47,
            exposure: 1.02,
            starBoost: 0.0
        },
        terrain: {
            tintHex: '#735728',
            deepHex: '#281c0c',
            midHex: '#473215',
            highHex: '#705222'
        },
        road: {
            tintHex: '#f5cfa0',
            emissiveHex: '#000000',
            emissiveIntensity: 0.0
        },
        weather: {
            snow: false,
            windMult: 1.25
        }
    },

    frostbite: {
        id: 'frostbite',
        name: 'Frostbite Alpine',
        shortName: 'Frostbite',
        icon: '❄️',
        description: 'Silver-frosted winter grass with alpine snow flurries',
        shadingFx: 0,
        grass: {
            colors: {
                colRoot:  [0.045, 0.062, 0.075],
                colLower: [0.130, 0.170, 0.200],
                colMid:   [0.260, 0.340, 0.390],
                colUpper: [0.550, 0.650, 0.710],
                colTip:   [0.894, 0.933, 0.941]
            },
            flowerColors: [
                [0.650, 0.860, 1.000],
                [0.880, 0.950, 1.000],
                [0.520, 0.740, 0.960],
                [1.000, 1.000, 1.000]
            ],
            curvature: 0.30,
            stiffness: 1.45,
            translucency: 0.55,
            patchiness: 0.25,
            heightMult: 0.88,
            widthMult: 1.0
        },
        atmosphere: {
            skyZenith: [0.28, 0.44, 0.68],
            skyHorizon: [0.78, 0.88, 0.96],
            sunColor: '#eef6ff',
            sunIntensity: 1.35,
            ambientColor: '#d4e8ff',
            ambientIntensity: 1.05,
            fogColor: '#b7cde0',
            fogNear: 65.0,
            fogFar: 320.0,
            cloudColor: [0.92, 0.96, 1.0],
            cloudShadowIntensity: 0.14,
            lockTimeOfDay: 0.18,
            exposure: 1.0,
            starBoost: 0.0
        },
        terrain: {
            tintHex: '#637b8c',
            deepHex: '#1c2a36',
            midHex: '#354b5c',
            highHex: '#627c8f'
        },
        road: {
            tintHex: '#d8e4f0',
            emissiveHex: '#0a1624',
            emissiveIntensity: 0.06
        },
        weather: {
            snow: true,
            windMult: 1.1
        }
    },

    audio: {
        id: 'audio',
        name: 'Audio Reactive',
        shortName: 'Audio FX',
        icon: '🎵',
        description: 'Beat-pulsing flora & cosmic sky driven by live synth/mic',
        shadingFx: 4,
        grass: {
            colors: {
                colRoot:  [0.025, 0.018, 0.075],
                colLower: [0.060, 0.055, 0.180],
                colMid:   [0.120, 0.220, 0.420],
                colUpper: [0.180, 0.560, 0.780],
                colTip:   [0.450, 0.920, 1.000]
            },
            flowerColors: [
                [1.000, 0.180, 0.520],
                [1.000, 0.820, 0.120],
                [0.120, 0.900, 1.000],
                [0.820, 0.450, 1.000]
            ],
            curvature: 0.35,
            stiffness: 0.90,
            translucency: 0.85,
            patchiness: 0.30,
            heightMult: 1.05,
            widthMult: 1.05
        },
        atmosphere: {
            skyZenith: [0.03, 0.02, 0.12],
            skyHorizon: [0.16, 0.08, 0.34],
            sunColor: '#9be7ff',
            sunIntensity: 1.15,
            ambientColor: '#5c52b8',
            ambientIntensity: 0.80,
            fogColor: '#170f38',
            fogNear: 75.0,
            fogFar: 350.0,
            cloudColor: [0.24, 0.16, 0.48],
            cloudShadowIntensity: 0.20,
            lockTimeOfDay: 0.64,
            exposure: 1.1,
            starBoost: 0.9
        },
        terrain: {
            tintHex: '#181840',
            deepHex: '#070718',
            midHex: '#10102e',
            highHex: '#201f4d'
        },
        road: {
            tintHex: '#b4c6f0',
            emissiveHex: '#180c42',
            emissiveIntensity: 0.25
        },
        weather: {
            snow: false,
            windMult: 1.1
        }
    }
};

export function getVisualMode(id) {
    return VISUAL_MODES[id] || VISUAL_MODES.natural;
}

export function getNextVisualModeId(currentId) {
    const idx = VISUAL_MODE_ORDER.indexOf(currentId);
    const nextIdx = (idx + 1) % VISUAL_MODE_ORDER.length;
    return VISUAL_MODE_ORDER[nextIdx];
}

export function loadSavedVisualMode() {
    try {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem(VISUAL_MODE_STORAGE_KEY);
            if (saved && VISUAL_MODES[saved]) return saved;
        }
    } catch (_) {}
    return 'natural';
}

export function saveVisualMode(id) {
    try {
        if (typeof localStorage !== 'undefined' && VISUAL_MODES[id]) {
            localStorage.setItem(VISUAL_MODE_STORAGE_KEY, id);
        }
    } catch (_) {}
}
