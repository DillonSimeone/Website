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
            title: "LEAVING THE THRONE",
            items: [
                { label: "00 — MY FIELD WORKSTATION", details: "As an embedded developer, I'm breaking away from my throne of power; my desktop, my monitors, and my stable grid. The deck is built to program hardware in the dirt, the forest, and the field." },
                { label: "Dependency is a Flaw", details: "If a deck only runs on a USB-C wall outlet, creative agency stops when the grid fails. This machine assumes nothing and adapts to everything." },
                { label: "Demystifying the Build", details: "This isn't just for me. I'm documenting every schematic and failure so that anyone can build their own dream deck and reclaim their agency over technology." },
                "Open Source Hardware Logic",
                "Built for Total Autonomy"
            ],
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
            { pos: [0, -15, 5], lookAt: [0, 0, 0], duration: 1.5 },
            { pos: [0, -10, 2], lookAt: [0, 0, 0], duration: 1.5 },
            { pos: [0, 15, 2], lookAt: [0, 0, 0], duration: 1.5 },
        ],
        shaderMood: "electric",
        content: {
            title: "COMPONENT HARVESTING",
            items: [
                { label: "High-Efficiency GaN Stage", details: "Gallium Nitride (GaN) transistors drive the power front-end, offering superior thermal performance and extreme power density in a rugged, portable footprint." },
                { label: "5V - 120V Universal Input", details: "The power stage accepts virtually anything: AA cells, eBike batteries, salvaged solar panels, or AC mains. It adapts to the environment rather than demanding infrastructure." },
                { label: "Hardware Scavenging", details: "The deck utilizes common discrete components harvested from discarded hardware. It's designed to be assembled from the city's electronic recycling bins." },
                { label: "The AI Field Guide", details: "A local LLM—fine-tuned on the deck's schematics—helps adapt the power bus to unexpected scavenged parts. It bypasses documentation hell, but I always cross-reference the spec sheets to avoid hallucinated logic." },
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
            title: "EMBEDDED COMMS",
            items: [
                { label: "Programming in the Field", details: "Native integration of an ESP32 co-processor allows for testing, flashing, and debugging microcontrollers directly from the chassis without external dongles." },
                { label: "Over-The-Air Swarm Flashing", details: "The deck creates a local ad-hoc network for wireless Over-The-Air (OTA) firmware updates. I can flash my entire swarm of field-deployed ESP32s without touching a single cable." },
                { label: "LoRa Long Range", details: "A dedicated LoRa radio pulls low-bandwidth telemetry and location beacons from sensor nodes kilometers apart, maintaining connection across vast distances." },
                "SDR Radio Array Ready",
                "Encrypted P2P Comms"
            ],
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
            title: "RUGGED AND REPAIRABLE",
            items: [
                { label: "Modular Snap-Shells", details: "The modular chassis features integrated tie-off points and a snap-together outer shell. It absorbs impacts while keeping the single-board computer protected in the center core." },
                { label: "Swappable Subsystems", details: "Power, compute, and radio are separate, ruggedized boards. A failed regulator can be popped out and replaced in the field, keeping the main IDE alive." },
                { label: "3D Printed Armor", details: "The armor is designed for FDM printers using recycled PLA. Open-source files allow anyone to print their own ruggedized gear and modify it to their specific needs." },
                { label: "Component Policy", details: "Where an IC is necessary, it must be available from multiple independent suppliers. The JLCPCB basic parts list is the baseline for global replaceability." },
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
            title: "PORTABLE IDE",
            items: [
                { label: "Headless AR Interface", details: "The deck streams a massive, private workspace directly to my augmented reality glasses. The chassis is a ruggedized compute core and unfolding keyboard with zero screen dependencies." },
                { label: "Right-Sized Processing", details: "The swappable carrier board (CM4) provides a full Linux workstation capable of compiling C++ and pushing wireless OTA updates in any environment." },
                { label: "Energy Breathing", details: "The system dynamically scales based on workload. It pulls full power for compilation and throttles down to sip energy while monitoring serial output through my glasses." },
                "Operating Efficiency: 92%",
                "Nominal: Full IDE Performance",
                "Deep Sleep: 0.5W Scavenge"
            ],
        },
    },
];
