/* The Harvester's Toll - WebGL shader + scroll beat engine */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform float uTime;
uniform float uBeat;
uniform float uScroll;
uniform vec2 uResolution;
varying vec2 vUv;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.1;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

    float beat = uBeat;
    float t = uTime;

    // Clinical cold base (beat 0-1)
    vec3 col = mix(vec3(0.02, 0.04, 0.07), vec3(0.05, 0.12, 0.18), fbm(uv * 4.0 + t * 0.02));

    // Pursuit tension - tunnel pulse (beat 2)
    float tunnel = smoothstep(0.0, 1.0, beat - 1.5) * (1.0 - smoothstep(2.5, 3.0, beat));
    float tunnelPulse = sin(length(p) * 12.0 - t * 2.0) * 0.5 + 0.5;
    col = mix(col, vec3(0.08, 0.06, 0.1), tunnel * tunnelPulse * 0.4);

    // Surgical red wash (beat 3)
    float surgical = smoothstep(2.5, 3.0, beat) * (1.0 - smoothstep(3.8, 4.2, beat));
    float scan = step(0.5, fract(uv.y * 80.0 + t * 0.5)) * 0.03;
    col += vec3(0.25, 0.04, 0.06) * surgical * (0.3 + scan);
    col += vec3(0.15, 0.02, 0.03) * surgical * sin(t * 8.0) * 0.1;

    // Glass desert shimmer (beat 4)
    float glass = smoothstep(3.5, 4.0, beat) * (1.0 - smoothstep(4.8, 5.2, beat));
    float shimmer = fbm(p * 8.0 + vec2(t * 0.1, -t * 0.05));
    col = mix(col, vec3(0.06, 0.14, 0.22) + shimmer * 0.15, glass);

    // Obsidian orb (beat 4-6)
    float orbPhase = smoothstep(3.8, 4.5, beat);
    vec2 orbCenter = vec2(0.0, -0.1);
    float orbDist = length(p - orbCenter);
    float orb = smoothstep(0.35, 0.0, orbDist) * orbPhase;
    float orbRim = smoothstep(0.38, 0.32, orbDist) * smoothstep(0.28, 0.32, orbDist) * orbPhase;
    col = mix(col, vec3(0.01, 0.01, 0.02), orb * 0.95);
    col += vec3(0.2, 0.35, 0.5) * orbRim * 0.3;

    // Dripping extrusions (beat 5)
    float extrude = smoothstep(4.5, 5.0, beat);
    for (float i = 0.0; i < 6.0; i++) {
        float angle = i * 1.047 + sin(t + i) * 0.2;
        vec2 limbPos = orbCenter + vec2(cos(angle), sin(angle)) * 0.28;
        float limb = smoothstep(0.06, 0.0, length(p - limbPos)) * extrude;
        float drip = smoothstep(0.0, 0.15, p.y - limbPos.y + 0.1) * limb * sin(t * 3.0 + i) * 0.5;
        col += vec3(0.3, 0.15, 0.2) * (limb + drip) * 0.4;
    }

    // Psychic whisper static (beat 6)
    float whisper = smoothstep(5.5, 6.0, beat);
    float stat = noise(uv * 200.0 + t * 10.0) * whisper;
    col += vec3(0.4, 0.55, 0.7) * stat * 0.08;
    col = mix(col, col * (0.85 + sin(t * 0.5 + uScroll * 3.0) * 0.05), whisper);

    float vig = smoothstep(1.1, 0.3, length(p));
    col *= vig;

    gl_FragColor = vec4(col, 1.0);
}`;

class StoryEngine {
    constructor() {
        this.canvas = document.getElementById('story-canvas');
        this.sections = [...document.querySelectorAll('[data-beat]')];
        this.navStatus = document.getElementById('nav-status');
        this.progressFill = document.getElementById('progress-fill');
        this.beatMarkers = document.getElementById('beat-markers');
        this.targetBeat = 0;
        this.currentBeat = 0;
        this.scrollProgress = 0;
        this.initGL();
        this.initScroll();
        this.initMarkers();
        this.animate();
    }

    initGL() {
        const gl = this.canvas.getContext('webgl', { antialias: false });
        if (!gl) return;
        this.gl = gl;

        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(s));
            }
            return s;
        };

        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        this.uTime = gl.getUniformLocation(prog, 'uTime');
        this.uBeat = gl.getUniformLocation(prog, 'uBeat');
        this.uScroll = gl.getUniformLocation(prog, 'uScroll');
        this.uResolution = gl.getUniformLocation(prog, 'uResolution');

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.gl) return;
        const dpr = Math.min(window.devicePixelRatio, 2);
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    initMarkers() {
        const beats = [...new Set(this.sections.map(s => +s.dataset.beat))].sort((a,b) => a-b);
        const total = beats.length - 1;
        beats.forEach((b, i) => {
            const m = document.createElement('div');
            m.className = 'beat-marker';
            m.style.top = `${(i / total) * 100}%`;
            m.dataset.beat = b;
            this.beatMarkers.appendChild(m);
        });
        this.markers = [...this.beatMarkers.querySelectorAll('.beat-marker')];
    }

    initScroll() {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    const beat = +entry.target.dataset.beat;
                    const label = entry.target.dataset.beatLabel;
                    if (!isNaN(beat)) {
                        this.targetBeat = beat;
                        document.body.dataset.activeBeat = beat;
                        if (label && this.navStatus) this.navStatus.textContent = label;
                    }
                }
            });
        }, { threshold: 0.25, rootMargin: '-10% 0px -40% 0px' });

        this.sections.forEach(s => observer.observe(s));

        window.addEventListener('scroll', () => {
            const h = document.documentElement.scrollHeight - window.innerHeight;
            this.scrollProgress = h > 0 ? window.scrollY / h : 0;
            if (this.progressFill) this.progressFill.style.height = `${this.scrollProgress * 100}%`;
        }, { passive: true });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.currentBeat += (this.targetBeat - this.currentBeat) * 0.04;

        this.markers?.forEach(m => {
            m.classList.toggle('active', +m.dataset.beat === Math.round(this.currentBeat));
        });

        if (!this.gl) return;
        const gl = this.gl;
        gl.uniform1f(this.uTime, performance.now() * 0.001);
        gl.uniform1f(this.uBeat, this.currentBeat);
        gl.uniform1f(this.uScroll, this.scrollProgress);
        gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

document.addEventListener('DOMContentLoaded', () => new StoryEngine());
