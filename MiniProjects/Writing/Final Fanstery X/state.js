/* ==========================================================================
   FINAL FANSTERY X: STATE MANAGEMENT
   ========================================================================== */

export const state = {
    currentChapter: 0,
    fontSizeMultiplier: 1.0,
    isFocusMode: false,
    
    // Telemetry and HUD metadata keyed by chapter
    chaptersData: [
        {
            index: 0,
            title: "CRANIAL ARCHITECTURE // TELEMETRY",
            clock: "1.2 kHz",
            rejection: "0.00%",
            calamity: "ANOMALY-00",
            substrate: "DREAM-STUFF",
            sepsis: "IMMUNE",
            bandwidth: "LOCAL TAP",
            location: "Loc: Baaj Submerged Temple Ruins",
            phase: "PHASE: +0.0034 rad",
            flux: "FLUX: 1.44e12 p/m³",
            ticker: "> Induction tap established behind right mastoid. Gravitational calculations bleeding off into bench registers."
        },
        {
            index: 1,
            title: "HARMONIC DAMPENING // AEON LOCK",
            clock: "88.4 kHz",
            rejection: "0.00%",
            calamity: "HERESY-IV",
            substrate: "DREAM / COPPER",
            sepsis: "IMMUNE",
            bandwidth: "MOBILE BUS",
            location: "Loc: Moonflow Causeway Marshlands",
            phase: "PHASE: 144.2 MHz",
            flux: "FLUX: 9.18e12 p/m³",
            ticker: "> Valefor dismissal signal locked in standing-wave trap. Summoner transmission carrier intercepted."
        },
        {
            index: 2,
            title: "DORSAL SPINAL BUS // SEYMOUR HARVEST",
            clock: "88.0 MHz",
            rejection: "0.00%",
            calamity: "EXCOMMUNICATE",
            substrate: "HARVESTED WETWARE",
            sepsis: "IMMUNE",
            bandwidth: "FAYTH LINK",
            location: "Loc: Lake Macalania Frozen Canopy",
            phase: "PHASE: SYNCHRONIZED",
            flux: "FLUX: 4.60e13 p/m³",
            ticker: "> Maester Seymour spinal column integrated. Summoning protocol reverse-engineered to open-source call."
        },
        {
            index: 3,
            title: "ELECTRICAL CRUCIBLE // WAR MACHINE",
            clock: "1.2 GHz",
            rejection: "0.00%",
            calamity: "CALAMITY CLASS-I",
            substrate: "FIELD-STRIPPED IRON",
            sepsis: "IMMUNE",
            bandwidth: "12 GW GRID",
            location: "Loc: Thunder Plains Primary Basin",
            phase: "PHASE: 40 MV ARC",
            flux: "FLUX: 8.82e14 p/m³",
            ticker: "> Continuous lightning grounding utilized as primary energy bus. Enemy crawler artillery field-stripped mid-combat."
        },
        {
            index: 4,
            title: "SOUL-STAKE INTAKE // FAYTH ARRAY",
            clock: "4.8e15 FLOPS",
            rejection: "0.00%",
            calamity: "EXTINCTION THREAT",
            substrate: "CONCENTRATED DREAM",
            sepsis: "IMMUNE",
            bandwidth: "EXPONENTIAL",
            location: "Loc: Mt. Gagazet Summit // Wall of the Fayth",
            phase: "PHASE: REALITY DRIFT",
            flux: "FLUX: 6.44e18 p/m³",
            ticker: "> 14 pneumatic stakes driving into petrified summoner cliff. Direct parallel ingestion of twenty thousand dreaming minds."
        },
        {
            index: 5,
            title: "ORBITAL RING // STELLAR HORIZON",
            clock: "UNBOUND",
            rejection: "0.00%",
            calamity: "STELLAR HAZARD",
            substrate: "SINGULARITY",
            sepsis: "IMMUNE",
            bandwidth: "INTERSTELLAR",
            location: "Loc: Low Spira Orbit // 3-Mile Ring",
            phase: "PHASE: COSMIC REST",
            flux: "FLUX: UNLIMITED",
            ticker: "> Sin disassembled into baseline structural mass. Yu Yevon loop terminated. Optics oriented toward galactic core."
        }
    ]
};
