/* ==========================================================================
   GLOBAL STATE & METRICS CONFIGURATION
   ========================================================================== */

export const state = {
    activeChapter: 0,
    fontSizeScale: 1.0,
    focusMode: false,
    webGLAvailable: true,
    hoveredMateria: null,
    baseMetrics: {
        0: { input: "12.0 J", output: "15.8 J", coeff: "131.6%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00%" },
        1: { input: "4.2 kW", output: "18.7 kW", coeff: "445.2%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00%" },
        2: { input: "75.0 W", output: "74.0 kW", coeff: "98666%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00%" },
        3: { input: "12.0 J", output: "∞", coeff: "∞%", status1: "BYPASSED", status2: "VIOLATED", status3: "0.00%" }
    },
    materiaColors: null // Will be initialized when Three.js is ready
};
