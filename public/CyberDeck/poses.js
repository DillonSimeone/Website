// poses.js — Config-driven pose definitions for the Apocalypse CyberDeck.

export const ORIGIN_POINT = {
    pos: [0, 0, 20],
    lookAt: [0, 0, 0]
};

export const VOXEL_COUNT = 128;
export const FORCE_FIELD_RADIUS = 3.0;
export const SPRING_K = 12.0;
export const DAMPING = 5.0;
export const REPULSION_STRENGTH = 8.0;export const poses = [
    {
        id: "about",
        label: "ABOUT US",
        formation: "circle",
        geometry: "box",
        colorPalette: ["#00ffaa", "#005522", "#ffffff"],
        emissiveColor: "#00ffaa",
        cameraSequence: [
            { pos: [0, 0, 18], lookAt: [0, 0, 0], duration: 1.5 },
        ],
        shaderMood: "calm",
        content: {
            title: "WHO WE ARE",
            items: [
                {
                    label: "Dillon Simeone",
                    details: "Deaf hardware designer, developer, and accessibility researcher. Dillon co-authored papers on DHH music interfaces (NIME, ACM) and acts as Lead Design Engineer for UMD."
                },
                {
                    label: "Tracy Held",
                    details: "Writer, filmmaker, and CMU Tartans on the Rise honoree. Tracy co-founded Erosion, serves on the WGAW committee, and co-created the Conservation Starters web series."
                },
                {
                    label: "Sonic Agency Project",
                    details: "A collaboration focused on power-independent cyberdecks for haptic music translation (Dillon) and cinema projection in alternative public spaces (Tracy) to make sound and tech universally accessible."
                }
            ],
            footerLinks: [
                { label: "Dillon's Website", url: "https://dillonsimeone.com" },
                { label: "Dillon's Resume", url: "./CyberdeckResources/Dillon%20Simeone%20-%20Resume.pdf" },
                { label: "Tracy's Resume", url: "./CyberdeckResources/Tracy%20Held%20-%20Resume%20-%20SOFTER%20-%202026.pdf" },
                { label: "Conservation Starters Video", url: "https://www.youtube.com/watch?v=y5dOFAt3xUE" },
                { label: "Climate Thoughts Shorts", url: "https://www.youtube.com/shorts/gQIdgBd8_1A" }
            ]
        }
    },
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
            title: "THE SONIC AGENCY",
            items: [
                {
                    label: "00 — THE DEAF ENGINEER",
                    details: "I am a Deaf sonic artist seeking to make sound and music more resonant through haptic vibration, breaking away from the studio to program hardware directly in the field."
                },
                {
                    label: "Feel the World Differently",
                    details: "Sound travels as pressure waves. This deck translates auditory signals in real-time: a deep bass note becomes a slow rolling pulse against your palm, a sharp snare hit becomes a quick tap at your wrist."
                },
                {
                    label: "Accessible Technology",
                    details: "We are eager to make sound accessible to people of all hearing abilities while also making technology accessible to people of all technology backgrounds, demystifying hardware for everyone."
                },
                { 
                    label: "A Safe Haven", 
                    details: "In a world of black-boxed technologies, this deck reclaims agency through fully transparent, offline-first hardware design and illustrated open-source guides." 
                }
            ],
            footerLinks: [
                { label: "Personal Website", url: "https://dillonsimeone.com" },
                { label: "GestoLumina Paper", url: "https://www.researchgate.net/profile/Doga-Cavdir/publication/382625935_GestoLumina_Gesture_interpreted_Light_Sound_and_Haptics_Towards_a_Framework_for_Universal_Music_Design/links/66a62efcc6e41359a844004c/GestoLumina-Gesture-interpreted-Light-Sound-and-Haptics-Towards-a-Framework-for-Universal-Music-Design.pdf" },
                { label: "Haptic Research Paper", url: "https://dl.acm.org/doi/10.1145/3663547.3746396" }
            ]
        }
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
                { label: "Universal Power Harvester", details: "The power stage accepts virtually anything: AA cells, eBike batteries, salvaged solar panels, handcranks, thermoelectric plates, or AC mains. It finds power where power exists." },
                { label: "Hardware Scavenging", details: "The deck utilizes common discrete components harvested from discarded hardware. It's designed to be assembled from the city's electronic recycling bins." },
                { label: "Offline Datasheet Library", details: "Rather than relying on internet access, the deck stores a comprehensive, offline repository of component datasheets. It acts as an autonomous reference tool for safely integrating scavenged parts." },
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
                { label: "Software Defined Radio", details: "An integrated SDR module allows the deck to scan the local RF environment and analyze interference patterns from nearby hardware." }
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
                { label: "Display Agnostic", details: "The chassis has zero screen dependencies, eliminating a fragile failure point. It can drive a salvaged monitor in the workshop, or pair with swappable peripherals like AR glasses in the field." },
                { label: "Right-Sized Processing", details: "The swappable carrier board (CM4) provides a full Linux workstation capable of compiling C++ and pushing wireless OTA updates in any environment." },
                { label: "Energy Breathing", details: "The system dynamically scales based on workload. It pulls full power for compilation and throttles down to sip energy while monitoring serial output." },
                { label: "Zero-Trust Peripherals", details: "By decoupling displays and inputs from the compute core, the deck treats all peripherals as untrusted, swappable modules that can be replaced as they fail." }
            ],
        },
    },
];
