import { makeBox, makeCylinder } from '../../00-CommonParts/helpers.js';
import { generateESP32C3Geometry } from '../../00-CommonParts/mcu/esp32c3.js';
import { generateTP4056Geometry } from '../../00-CommonParts/charger/tp4056.js';
import { generateL298NMiniGeometry } from '../../00-CommonParts/motor_driver/l298n_mini.js';
import { generate18650HolderGeometry } from '../../00-CommonParts/battery/battery18650.js';
import { generateOLEDGeometry } from '../../00-CommonParts/screen/oled.js';
import { generatePotentiometerGeometry } from '../../00-CommonParts/potentiometer/wh148.js';
import { generateSwitchGeometry } from '../../00-CommonParts/switch/rocker.js';
import { generateCoinVibrationGeometry } from '../../00-CommonParts/haptics/coin_vibration.js';

/**
 * Cutout sides are in local Manifold XY coordinates (Z-up):
 *   N = +Y (front), S = -Y (back), E = +X (right), W = -X (left)
 */
export const PARTS_CATALOG = [
    // --- MCU ---
    {
        id: 'esp32c3',
        name: 'ESP32-C3 SuperMini',
        folder: ['MCU'],
        color: '#06b6d4',
        w: 18.0,
        d: 22.52,
        wallHeight: 6.0,
        allowStrainRelief: true,
        summary: 'Front USB-C U-slot + Bottom pin through-slots',
        cutouts: {
            N: { width: 10.5, zOffset: 0.8 }
        },
        floorSlots: [
            { xOffset: -7.62, yOffset: 0, w: 2.8, d: 18.5 },
            { xOffset: 7.62, yOffset: 0, w: 2.8, d: 18.5 }
        ],
        buildGhost: (M) => generateESP32C3Geometry(M)
    },

    // --- Electrical / Power ---
    {
        id: 'tp4056',
        name: 'TP4056 LiPo Charger',
        folder: ['Electrical', 'Power'],
        color: '#3b82f6',
        w: 17.2,
        d: 28.0,
        wallHeight: 6.0,
        allowStrainRelief: true,
        summary: 'Front USB-C slot + Rear B+/OUT wire gap',
        cutouts: {
            N: { width: 10.5, height: 5.0, zOffset: 0.8 },
            S: { width: 12.0, height: 4.5, zOffset: 0.8 }
        },
        buildGhost: (M) => generateTP4056Geometry(M)
    },
    {
        id: 'pd_decoy',
        name: 'USB-C PD Decoy',
        folder: ['Electrical', 'Power'],
        color: '#8b5cf6',
        w: 12.0,
        d: 24.0,
        wallHeight: 6.0,
        allowStrainRelief: true,
        summary: 'Front USB-C input + Rear DC output gap',
        cutouts: {
            N: { width: 10.0, height: 5.2, zOffset: 0.8 },
            S: { width: 9.5, height: 4.5, zOffset: 0.8 }
        },
        buildGhost: (M) => {
            const pcb = makeBox(M, 12.0, 24.0, 1.6, true).translate([0, 0, 0.8]);
            const usb = makeBox(M, 9.0, 6.5, 3.2, true).translate([0, 24.0 / 2 - 1.2, 1.6 + 1.6]);
            const res = pcb.add(usb);
            pcb.delete(); usb.delete();
            return res;
        }
    },
    {
        id: 'lm2596s',
        name: 'LM2596S DC-DC 3A',
        folder: ['Electrical', 'Power'],
        color: '#10b981',
        w: 21.5,
        d: 44.0,
        wallHeight: 8.0,
        summary: '21.5×44mm • Front IN & Rear OUT wire gaps',
        cutouts: {
            N: { width: 14.0, height: 6.0, zOffset: 1.0 },
            S: { width: 14.0, height: 6.0, zOffset: 1.0 }
        },
        buildGhost: (M) => {
            const pcb = makeBox(M, 21.5, 44.0, 1.6, true).translate([0, 0, 0.8]);
            const coil = makeBox(M, 12.0, 12.0, 7.0, true).translate([0, 2.0, 1.6 + 3.5]);
            const pot = makeBox(M, 9.5, 9.5, 10.0, true).translate([-4.0, -10.0, 1.6 + 5.0]);
            const res = pcb.add(coil).add(pot);
            pcb.delete(); coil.delete(); pot.delete();
            return res;
        }
    },
    {
        id: 'lipo_pouch',
        name: 'LiPo Pouch (35×20mm)',
        folder: ['Electrical', 'Power'],
        color: '#14b8a6',
        w: 20.0,
        d: 35.0,
        wallHeight: 7.0,
        summary: 'Front JST/wire lead exit gap',
        cutouts: {
            N: { width: 9.0, height: 5.0, zOffset: 1.0 }
        },
        buildGhost: (M) => makeBox(M, 19.5, 34.0, 6.5, true).translate([0, 0, 3.25])
    },
    {
        id: 'battery18650',
        name: '18650 Battery Holder',
        folder: ['Electrical', 'Power'],
        color: '#ec4899',
        w: 21.0,
        d: 76.0,
        wallHeight: 12.0,
        summary: 'Front/Rear contact tab wire slots',
        cutouts: {
            N: { width: 10.0, height: 7.0, zOffset: 2.0 },
            S: { width: 10.0, height: 7.0, zOffset: 2.0 }
        },
        buildGhost: (M) => generate18650HolderGeometry(M)
    },

    // --- Electrical / Motor & Drivers ---
    {
        id: 'mosfet_400w',
        name: 'MOSFET Driver 15A/400W',
        folder: ['Electrical', 'Motor & Drivers'],
        color: '#f59e0b',
        w: 17.0,
        d: 33.5,
        wallHeight: 7.0,
        summary: '17×33.5mm • Front E/W terminal gaps, Rear trig, Pin slots',
        cutouts: {
            E: { width: 11.5, yOffset: 10.0, zOffset: 1.0 },
            W: { width: 11.5, yOffset: 10.0, zOffset: 1.0 },
            S: { width: 11.5, zOffset: 1.0 }
        },
        floorSlots: [
            { xOffset: -4.5, yOffset: 10.2, w: 3.6, d: 11.0 },
            { xOffset: 4.5, yOffset: 10.2, w: 3.6, d: 11.0 }
        ],
        buildGhost: (M) => {
            const pcb = makeBox(M, 17.0, 33.5, 1.6, true).translate([0, 0, 0.8]);
            const termW = makeBox(M, 7.5, 10.5, 8.5, true).translate([-4.5, 33.5 / 2 - 6.2, 1.6 + 4.25]);
            const termE = makeBox(M, 7.5, 10.5, 8.5, true).translate([4.5, 33.5 / 2 - 6.2, 1.6 + 4.25]);
            const trigS = makeBox(M, 10.0, 3.0, 2.5, true).translate([0, -33.5 / 2 + 2.0, 1.6 + 1.25]);
            const res = pcb.add(termW).add(termE).add(trigS);
            pcb.delete(); termW.delete(); termE.delete(); trigS.delete();
            return res;
        }
    },
    {
        id: 'xy_motor',
        name: 'General Motor Holder',
        folder: ['Electrical', 'Motor & Drivers'],
        color: '#d946ef',
        w: 20.0,
        d: 25.0,
        wallHeight: 7.0,
        cradle: true,
        summary: 'Type 130 width (20×25mm) • Upright shaft cradle',
        cutouts: {
            N: { width: 12.0, zOffset: 1.0 },
            S: { width: 12.0, zOffset: 1.0 }
        },
        buildGhost: (M) => {
            const body = makeBox(M, 19.6, 24.5, 15.0, true).translate([0, 0, 7.5]);
            const shaft = makeCylinder(M, 1.0, 32.0, 24, true).rotate([0, 90, 0]).translate([0, 0, 9.0]);
            const res = body.add(shaft);
            body.delete(); shaft.delete();
            return res;
        }
    },
    {
        id: 'l298n_mini',
        name: 'L298N Mini Driver',
        folder: ['Electrical', 'Motor & Drivers'],
        color: '#ef4444',
        w: 24.7,
        d: 21.0,
        wallHeight: 6.5,
        summary: 'Front/Rear motor & logic wire gaps',
        cutouts: {
            N: { width: 16.0, height: 5.0, zOffset: 1.0 },
            S: { width: 16.0, height: 5.0, zOffset: 1.0 }
        },
        buildGhost: (M) => generateL298NMiniGeometry(M)
    },

    // --- Sensors ---
    {
        id: 'mpu6050',
        name: 'MPU6050 6-Axis IMU',
        folder: ['Sensors', 'Motion & IMU'],
        color: '#22d3ee',
        w: 15.6,
        d: 20.4,
        wallHeight: 5.5,
        summary: 'Left 8-pin I2C header wire gap',
        cutouts: {
            W: { width: 16.0, height: 4.5, zOffset: 0.8 }
        },
        buildGhost: (M) => {
            const pcb = makeBox(M, 15.6, 20.4, 1.6, true).translate([0, 0, 0.8]);
            const ic = makeBox(M, 4.0, 4.0, 1.0, true).translate([0, 0, 2.1]);
            const res = pcb.add(ic);
            pcb.delete(); ic.delete();
            return res;
        }
    },
    {
        id: 'vl53l1x',
        name: 'VL53L1X ToF Distance',
        folder: ['Sensors', 'Distance & Optical'],
        color: '#38bdf8',
        w: 13.0,
        d: 18.0,
        wallHeight: 5.5,
        summary: 'Rear 5-pin I2C wire gap',
        cutouts: {
            S: { width: 10.5, height: 4.5, zOffset: 0.8 }
        },
        buildGhost: (M) => {
            const pcb = makeBox(M, 13.0, 18.0, 1.6, true).translate([0, 0, 0.8]);
            const opt = makeBox(M, 5.0, 3.0, 1.6, true).translate([0, 2.0, 2.4]);
            const res = pcb.add(opt);
            pcb.delete(); opt.delete();
            return res;
        }
    },

    // --- UI & Controls ---
    {
        id: 'oled',
        name: '0.96" OLED Display',
        folder: ['UI & Controls'],
        color: '#6366f1',
        w: 27.0,
        d: 27.0,
        wallHeight: 6.0,
        excludeFromLid: true,
        summary: 'Rear 4-pin I2C header/wire gap',
        cutouts: {
            S: { width: 12.0, height: 4.5, zOffset: 0.8 }
        },
        buildGhost: (M) => generateOLEDGeometry(M)
    },
    {
        id: 'wh148',
        name: 'WH148 Potentiometer',
        folder: ['UI & Controls'],
        color: '#a855f7',
        w: 17.0,
        d: 17.0,
        wallHeight: 8.0,
        excludeFromLid: true,
        summary: 'Front 3-pin solder lug wire gap',
        cutouts: {
            N: { width: 11.0, height: 5.5, zOffset: 1.0 }
        },
        buildGhost: (M) => generatePotentiometerGeometry(M)
    },
    {
        id: 'rocker',
        name: 'Rocker Switch (KCD11)',
        folder: ['UI & Controls'],
        color: '#f43f5e',
        w: 10.0,
        d: 17.0,
        wallHeight: 12.0,
        excludeFromLid: true,
        summary: 'Rear spade terminal wire gap',
        cutouts: {
            S: { width: 8.0, height: 6.0, zOffset: 1.0 }
        },
        buildGhost: (M) => generateSwitchGeometry(M)
    },

    // --- Custom ---
    {
        id: 'custom_bin',
        name: 'Custom Blank Bin',
        folder: ['Custom'],
        color: '#94a3b8',
        w: 25.0,
        d: 25.0,
        wallHeight: 6.0,
        allowStrainRelief: true,
        summary: 'Customizable pocket • Right-click to resize',
        cutouts: {},
        buildGhost: null
    },

    // --- Spacers (Floor-only bridges, no walls) ---
    ...([10, 20, 30].map(sz => ({
        id: `spacer_${sz}mm`,
        name: `Space Filler (${sz}×${sz}mm)`,
        folder: ['Custom', 'Space Fillers'],
        color: '#64748b',
        w: sz,
        d: sz,
        wallHeight: 0,
        isSpacer: true,
        excludeFromLid: true,
        summary: `${sz}×${sz}mm floor-only bridge (no walls)`,
        cutouts: {},
        buildGhost: null
    }))),

    // --- Cable Management ---
    {
        id: 'usbc_strain_relief',
        name: 'USB-C S-Curve Strain Relief',
        folder: ['Cable Management'],
        color: '#f97316',
        w: 15.0,
        d: 38.0,
        wallHeight: 8.5,
        isStrainReliefOnly: true,
        summary: 'Open front USB-C bay + carved S-curve cable channel',
        cutouts: {
            N: { width: 99.0, zOffset: 0.0 },
            S: { width: 5.0, zOffset: 1.0 }
        },
        buildGhost: (M) => {
            const head = makeBox(M, 11.0, 18.0, 6.8, true).translate([0, 9.0, 3.4]);
            const neck = makeBox(M, 7.5, 5.0, 5.5, true).translate([0, -2.5, 2.75]);
            const res = head.add(neck);
            head.delete(); neck.delete();
            return res;
        }
    },

    // --- Haptics ---
    {
        id: 'coin_vib_5v',
        name: '5V Coin Vibration Cell',
        folder: ['Haptics'],
        color: '#e879f9',
        w: 11.2,
        d: 11.2,
        wallHeight: 4.0,
        isCoinCell: true,
        summary: '11.2mm circular pocket + 3mm inner wire notch',
        cutouts: {},
        buildGhost: (M) => generateCoinVibrationGeometry(M, 10.0, 3.0)
    },

    // --- LEDs & Matrices ---
    {
        id: 'led_matrix_8x8',
        name: '8×8 WS2812B Matrix',
        folder: ['LEDs & Matrices'],
        color: '#84cc16',
        w: 65.0,
        d: 65.0,
        wallHeight: 7.0,
        innerLedge: 3.0,
        summary: '65×65mm • 3mm inner support ledge (no fall-through)',
        cutouts: {
            S: { width: 14.0, zOffset: 0.8 }
        },
        buildGhost: (M) => makeBox(M, 64.5, 64.5, 3.2, true).translate([0, 0, 1.6])
    },
    ...([5, 8, 10, 12].map(sw => ({
        id: `led_strip_${sw}mm`,
        name: `LED Strip (${sw}mm)`,
        folder: ['LEDs & Matrices', 'LED Strip Channels'],
        color: '#22c55e',
        w: sw + 0.6,
        d: 50.0,
        wallHeight: 7.5,
        isLedStrip: true,
        summary: `${sw}mm slide-through channel • Diamond V-grooves`,
        cutouts: {
            N: { width: 99.0, zOffset: 0.0 },
            S: { width: 99.0, zOffset: 0.0 }
        },
        buildGhost: (M) => makeBox(M, sw, 49.0, 2.2, true).translate([0, 0, 1.1])
    }))),

    // --- Shapes (8mm LED channels joined to form polygon loops) ---
    ...([
        { id: 'triangle', name: 'Triangle LED Loop', sides: 3 },
        { id: 'square', name: 'Square LED Loop', sides: 4 },
        { id: 'hexagon', name: 'Hexagon LED Loop', sides: 6 }
    ].map(sh => ({
        id: `shape_${sh.id}`,
        name: sh.name,
        folder: ['Shapes'],
        color: '#fbbf24',
        w: 48.0,
        d: 48.0,
        wallHeight: 7.5,
        shapeLoopSides: sh.sides,
        summary: `8mm LED channels joined into a ${sh.id}`,
        cutouts: {
            S: { width: 8.0, zOffset: 0.5 }
        },
        buildGhost: null
    }))),

    // --- Fans ---
    ...([
        { size: 20, thick: 10, pitch: 16.0, screw: 'M2' },
        { size: 40, thick: 10, pitch: 32.0, screw: 'M3' },
        { size: 60, thick: 15, pitch: 50.0, screw: 'M3' },
        { size: 80, thick: 25, pitch: 71.5, screw: 'M3' },
        { size: 120, thick: 25, pitch: 105.0, screw: 'M3' }
    ].map(f => ({
        id: `fan_${f.size}mm`,
        name: `${f.size}mm Cooling Fan`,
        folder: ['Fans'],
        color: '#38bdf8',
        w: f.size,
        d: f.size,
        wallHeight: Math.min(f.thick + 2, 18),
        isFan: true,
        fanSize: f.size,
        fanThick: f.thick,
        fanPitch: f.pitch,
        defaultScrew: f.screw,
        summary: `${f.size}×${f.size}mm • Horiz (diamond) / Vert • ${f.screw} side screws`,
        cutouts: {
            S: { width: 8.0, zOffset: 1.0 }
        },
        buildGhost: (M) => makeBox(M, f.size - 0.5, f.size - 0.5, f.thick, true).translate([0, 0, f.thick / 2])
    })))
];

export function getPartPreset(partId) {
    return PARTS_CATALOG.find(p => p.id === partId) || PARTS_CATALOG[PARTS_CATALOG.length - 1];
}
