export const PATTERNS = [
    { id: "Pulse", name: "Pulse", usesMotion: false },
    { id: "Heartbeat", name: "Heartbeat", usesMotion: false },
    { id: "Gallop", name: "Gallop", usesMotion: false },
    { id: "Shimmer", name: "Shimmer", usesMotion: false },
    { id: "Rumble", name: "Rumble", usesMotion: false },
    { id: "Sawtooth", name: "Sawtooth", usesMotion: false },
    { id: "SpinWave", name: "Spin Wave", usesMotion: true },
    { id: "SwingKick", name: "Swing Kick", usesMotion: true },
    { id: "Drift", name: "Drift", usesMotion: true },
    { id: "Flicker", name: "Flicker", usesMotion: true },
    { id: "SpeedFollow", name: "Speed Follow", usesMotion: true },
    { id: "AxisPulse", name: "Axis Pulse", usesMotion: true },
    { id: "SpinSync", name: "Spin Sync", usesMotion: true },
    { id: "SwingBeat", name: "Swing Beat", usesMotion: true },
    { id: "DualAxis", name: "Dual Axis", usesMotion: true },
    { id: "EnergyCharge", name: "Energy Charge", usesMotion: true },
];

export function speedLabelForBin(binIndex, lowIdx, highIdx) {
    const axis = highIdx <= 15 ? "X" : "Y";
    const axisLow = axis === "X" ? lowIdx : lowIdx - 16;
    const axisHigh = axis === "X" ? highIdx : highIdx - 16;
    const pctLow = Math.round((axisLow / 16) * 100);
    const pctHigh = Math.round((axisHigh / 16) * 100);
    return `${axis}-speed ${pctLow}-${pctHigh}%`;
}
