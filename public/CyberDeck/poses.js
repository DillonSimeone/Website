// poses.js — Config-driven pose definitions for the Apocalypse CyberDeck.

export const ORIGIN_POINT = {
    pos: [0, 0, 20],
    lookAt: [0, 0, 0]
};

export const VOXEL_COUNT = 128;
export const FORCE_FIELD_RADIUS = 3.0;
export const SPRING_K = 12.0;
export const DAMPING = 5.0;
export const REPULSION_STRENGTH = 8.0;

export const poses = [
    {
        id: "manifesto",
        label: "THE MANIFESTO",
        formation: "cluster",
        geometry: "box",
        colorPalette: ["#33ff33", "#004400", "#ffffff"],
        emissiveColor: "#33ff33",
        cameraSequence: [
            { pos: [0, 0, 15], lookAt: [0, 0, 0], duration: 1.5 },
            { pos: [8, 3, 12], lookAt: [0, 0, 0], duration: 2.0 },
        ],
        shaderMood: "calm",
        content: {
            title: "REPAIR OR DIE",
            items: ["The Last Computer You'll Ever Need", "Zero Specialized Tools Required", "Open Source Hardware Logic", "Built for the End of the World"],
        },
    },
    {
        id: "omnivore",
        label: "OMNIVORE_MODE",
        formation: "pillar",
        geometry: "tetrahedron",
        colorPalette: ["#ffff00", "#ffaa00", "#ffffff"],
        emissiveColor: "#ffff00",
        cameraSequence: [
            { pos: [12, -5, 5], lookAt: [0, 0, 0], duration: 1.2 },
            { pos: [0, 15, 2], lookAt: [0, 0, 0], duration: 2.5 },
        ],
        shaderMood: "electric",
        content: {
            title: "5V - 240V AC/DC",
            items: [
                { label: "Solar: MPPT Scavenging", details: "High-efficiency MPPT tracking\nfor varying weather conditions.\nRange: 5V-60V Input." },
                { label: "Wind: Erratic AC Rectification", details: "Active bridge rectification\nfor kinetic scavenged power.\nSupports up to 240V AC spikes." },
                { label: "Bio-Thermal: Heat-to-Compute", details: "Seebeck effect harvesting from\ncomponent exhaust or external heat.\nOutput: 3.3V / 1.2A Peak." },
                { label: "Grid: Overdrive Performance", details: "Nominal 110/220V AC input.\nBypasses safety throttles for\nmaximum core clock frequency." }
            ],
        },
    },
    {
        id: "mesh",
        label: "NEURAL MESH",
        formation: "explosion",
        geometry: "icosahedron",
        colorPalette: ["#00ffff", "#0088ff", "#ffffff"],
        emissiveColor: "#00ffff",
        cameraSequence: [
            { pos: [0, 0, 2], lookAt: [0, 0, 0], duration: 1.0 },
            { pos: [-15, 5, 10], lookAt: [5, 0, 0], duration: 2.0 },
        ],
        shaderMood: "chaotic",
        content: {
            title: "DECENTRALIZED NODE",
            items: ["LoRa Long-Range Mesh", "SDR Radio Array", "Satellite Uplink Ready", "Encrypted P2P Comms"],
        },
    },
    {
        id: "repair",
        label: "REPAIRABILITY",
        formation: "grid",
        geometry: "box",
        colorPalette: ["#ff3333", "#880000", "#ffffff"],
        emissiveColor: "#ff3333",
        cameraSequence: [
            { pos: [10, 10, 10], lookAt: [0, 0, 0], duration: 1.5 },
            { pos: [5, -5, 15], lookAt: [0, 0, 0], duration: 2.0 },
        ],
        shaderMood: "calm",
        content: {
            title: "MODULAR BONES",
            items: [
                "GaN Replaceable Modules", 
                "Shunt Resistor Arrays", 
                "3D Printable Chassis Sled", 
                "Standardized Component Grid", 
                "─── ACTIVE MANIFEST ───", 
                { label: "RF_MODULE_03", details: "STATUS: NOMINAL\nBAND: 2.4/5.8GHz\nSIGNAL: -42dBm" },
                { label: "THERMAL_SINK_07", details: "STATUS: CYCLING\nTEMP: 34.2C\nFAN_RPM: 1200" },
                { label: "PWR_REG_01", details: "STATUS: HOT-SWAP OK\nLOAD: 12.4W\nHEALTH: 98%" },
                { label: "COMPUTE_CORE_02", details: "STATUS: READY\nFREQ: 2.4GHz\nCORES: 4" }
            ],
        },
    },
    {
        id: "adaptive",
        label: "ADAPTIVE COMPUTE",
        formation: "mandelbulb",
        geometry: "tetrahedron",
        colorPalette: ["#ffffff", "#33ff33", "#000000"],
        emissiveColor: "#33ff33",
        cameraSequence: [
            { pos: [0, 8, 3], lookAt: [0, 0, 0], duration: 0.4 },
            { pos: [2, 2, 5], lookAt: [0, 0, 0], duration: 0.3 },
        ],
        shaderMood: "electric",
        content: {
            title: "ENERGY BREATHING",
            items: ["Deep Sleep: 0.5W Scavenge", "Nominal: Pi 5 Performance", "Overclocked: Grid-Powered", "Dynamic Frequency Scaling"],
        },
    },
];


