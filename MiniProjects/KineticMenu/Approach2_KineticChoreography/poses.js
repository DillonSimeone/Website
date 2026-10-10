// poses.js — Config-driven pose definitions. Add new sections by adding objects here.

export const ORIGIN_POINT = {
    pos: [0, 0, 20],
    lookAt: [0, 0, 0]
};

export const VOXEL_COUNT = 128;
export const FORCE_FIELD_RADIUS = 3.0;
export const SPRING_K = 2.5;
export const DAMPING = 3.0;
export const REPULSION_STRENGTH = 8.0;

export const poses = [
    {
        id: "about",
        label: "ABOUT ME",
        formation: "cluster",
        geometry: "box",
        colorPalette: ["#00ffff", "#0088ff", "#004466"],
        emissiveColor: "#00ffff",
        cameraSequence: [
            { pos: [0, 0, 8], lookAt: [0, 0, 0], duration: 1.5 },
            { pos: [3, 1, 6], lookAt: [0, 0, 0], duration: 2.0 },
        ],
        shaderMood: "calm",
        content: {
            title: "ABOUT ME",
            items: ["Creative Developer", "3D Enthusiast", "Problem Solver"],
        },
    },
    {
        id: "works",
        label: "MY WORKS",
        formation: "pillar",
        geometry: "tetrahedron",
        colorPalette: ["#ff0055", "#ff3377", "#440011"],
        emissiveColor: "#ff0055",
        cameraSequence: [
            { pos: [3, -8, 5], lookAt: [0, -4, 0], duration: 1.0 },
            { pos: [2, 12, 3], lookAt: [0, 6, 0], duration: 2.5 },
            { pos: [0.5, 14, 1], lookAt: [0, 8, 0], duration: 1.5 },
        ],
        shaderMood: "electric",
        content: {
            title: "MY WORKS",
            items: ["Project Alpha", "Project Beta", "Project Gamma"],
        },
    },
    {
        id: "miniprojects",
        label: "MY MINIPROJECTS",
        formation: "explosion",
        geometry: "icosahedron",
        colorPalette: ["#ffaa00", "#ff6600", "#441100"],
        emissiveColor: "#ffaa00",
        cameraSequence: [
            { pos: [0, 0, 0.5], lookAt: [0, 0, 0], duration: 1.0 },
            { pos: [2, 1, 2], lookAt: [0, 0, 0], duration: 2.0 },
            { pos: [5, 3, 2], lookAt: [5, 3, 0], duration: 0.3, jumpToRandomCube: true },
        ],
        shaderMood: "chaotic",
        content: {
            title: "MY MINIPROJECTS",
            items: ["Mini A", "Mini B", "Mini C"],
        },
    },
];
