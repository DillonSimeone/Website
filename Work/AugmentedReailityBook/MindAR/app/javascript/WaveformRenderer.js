/**
 * WaveformRenderer.js — CRT Waveform Animation for Ford Pines Scanner
 */
export class WaveformRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.xOffset = 0;
    }

    draw(isScanning) {
        if (!this.canvas) return;
        const ctx = this.canvas.getContext('2d');
        const w = this.canvas.width = this.canvas.offsetWidth;
        const h = this.canvas.height = this.canvas.offsetHeight;
        
        if (w === 0) return;

        ctx.fillStyle = 'rgba(10, 14, 10, 0.22)';
        ctx.fillRect(0, 0, w, h);

        if (!isScanning) {
            ctx.clearRect(0, 0, w, h); // Deep clear when off
            return;
        }

        // Simple procedural waveform
        ctx.beginPath(); 
        ctx.strokeStyle = '#10b981'; 
        ctx.lineWidth = 2.5;
        const cy = h / 2;
        
        for (let x = 0; x < w; x += 3) {
            const y = cy + Math.sin((x + this.xOffset) * 0.05) * (h / 6);
            ctx.lineTo(x, y);
        }
        
        ctx.stroke(); 
        this.xOffset += 4;
    }
}
