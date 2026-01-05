export class AudioManager {
    constructor() {
        this.ctx = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.frequencyData = null;
        this.sensitivity = 50;
        this.isInitialized = false;

        this.volume = 0;
        this.bass = 0;
        this.mid = 0;
        this.treble = 0;
        this.peakFrequency = 0;
        this.minDetectedFreq = 0;
        this.maxDetectedFreq = 0;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.source = this.ctx.createMediaStreamSource(stream);

            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.8;

            this.source.connect(this.analyser);

            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            this.frequencyData = new Uint8Array(bufferLength);

            this.isInitialized = true;

            if (this.ctx.state === 'suspended') {
                await this.ctx.resume();
            }
            return true;
        } catch (error) {
            console.error("Audio Access Denied:", error);
            throw error;
        }
    }

    setSmoothing(val) {
        if (this.analyser) {
            this.analyser.smoothingTimeConstant = val;
        }
    }

    update() {
        if (!this.isInitialized) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        let sum = 0;
        let bassSum = 0;
        let midSum = 0;
        let trebleSum = 0;

        const binCount = this.dataArray.length;
        const bassEnd = Math.floor(binCount * 0.1);
        const midEnd = Math.floor(binCount * 0.5);

        // Detect dominant frequency for color mapping
        let maxVal = 0;
        let maxIndex = 0;

        let minDetectedIndex = -1;
        let maxDetectedIndex = -1;
        const detectionThreshold = 40; // Noise gate for freq range detection

        for (let i = 0; i < binCount; i++) {
            const val = this.dataArray[i];
            sum += val;

            if (val > maxVal) {
                maxVal = val;
                maxIndex = i;
            }

            if (val > detectionThreshold) {
                if (minDetectedIndex === -1) minDetectedIndex = i;
                maxDetectedIndex = i;
            }

            if (i < bassEnd) bassSum += val;
            else if (i < midEnd) midSum += val;
            else trebleSum += val;
        }

        // Approximate Hz = index * sampleRate / fftSize
        const nyquist = this.ctx.sampleRate / 2;
        const freqPerBin = nyquist / binCount;

        this.peakFrequency = maxIndex * freqPerBin;
        this.minDetectedFreq = (minDetectedIndex === -1) ? 0 : minDetectedIndex * freqPerBin;
        this.maxDetectedFreq = (maxDetectedIndex === -1) ? 0 : maxDetectedIndex * freqPerBin;

        this.volume = sum / binCount;
        this.bass = bassSum / bassEnd;
        this.mid = midSum / (midEnd - bassEnd);
        this.treble = trebleSum / (binCount - midEnd);
    }

    getUniformData() {
        return {
            frequencyData: this.dataArray,
            volume: this.volume,
            bass: this.bass,
            mid: this.mid,
            treble: this.treble,
            peakFrequency: this.peakFrequency,
            minDetectedFreq: this.minDetectedFreq,
            maxDetectedFreq: this.maxDetectedFreq
        };
    }
}
