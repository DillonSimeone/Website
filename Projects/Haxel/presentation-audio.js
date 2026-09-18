/** Global Web Audio bus — shared mic analyser for all slide visualizations */

const FFT_SIZE = 256;
const NUM_BANDS = 32;
const DIVIDERS = [8, 18]; // bass | mid | treble (3 bins)

let audioCtx = null;
let analyser = null;
let micStream = null;
let micSource = null;
let dataArray = null;
let isLive = false;
let initPromise = null;

export function getMicStatus() {
    if (isLive) return 'active';
    if (initPromise) return 'pending';
    return 'offline';
}

export async function initAudioOnGesture() {
    if (isLive) return true;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            micStream = stream;
            micSource = audioCtx.createMediaStreamSource(stream);
            micSource.connect(analyser);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            isLive = true;
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            return true;
        } catch (err) {
            console.warn('[presentation-audio] Mic denied:', err);
            initPromise = null;
            return false;
        }
    })();
    return initPromise;
}

function computeLogBands() {
    const rawMags = Array.from(dataArray).map(v => v / 255);
    const mags = new Array(NUM_BANDS).fill(0);
    const kWindow = analyser.fftSize;
    const sampleRate = audioCtx.sampleRate;
    const minFreq = 40;
    const maxFreq = 20000;

    for (let b = 0; b < NUM_BANDS; b++) {
        const lo = minFreq * Math.pow(maxFreq / minFreq, b / NUM_BANDS);
        const hi = minFreq * Math.pow(maxFreq / minFreq, (b + 1) / NUM_BANDS);
        let loBin = Math.floor(lo * kWindow / sampleRate);
        let hiBin = Math.floor(hi * kWindow / sampleRate);
        if (hiBin <= loBin) hiBin = loBin + 1;
        let sum = 0;
        let count = 0;
        for (let k = loBin; k < hiBin && k < rawMags.length; k++) {
            sum += rawMags[k];
            count++;
        }
        mags[b] = count > 0 ? sum / count : 0;
    }
    return mags;
}

export function getFrequencyBins() {
    if (!isLive || !analyser) return new Array(NUM_BANDS).fill(0);
    analyser.getByteFrequencyData(dataArray);
    return computeLogBands();
}

export function getRmsAmplitude() {
    const mags = getFrequencyBins();
    if (!mags.length) return 0;
    const sum = mags.reduce((a, b) => a + b, 0);
    return sum / mags.length;
}

export function getBassMidTreble() {
    const mags = getFrequencyBins();
    const avg = (start, end) => {
        let s = 0;
        let c = 0;
        for (let i = start; i < end && i < mags.length; i++) {
            s += mags[i];
            c++;
        }
        return c ? s / c : 0;
    };
    return {
        bass: avg(0, DIVIDERS[0]),
        mid: avg(DIVIDERS[0], DIVIDERS[1]),
        treble: avg(DIVIDERS[1], NUM_BANDS)
    };
}

export function getPartitionDividers() {
    return [...DIVIDERS];
}

export function isAudioLive() {
    return isLive;
}

/** Drive CSS custom property for global bass pulse */
export function applyBassPulseToDocument() {
    const { bass } = getBassMidTreble();
    const pulse = 0.08 + bass * 0.35;
    document.documentElement.style.setProperty('--bass-pulse', String(pulse));
}
