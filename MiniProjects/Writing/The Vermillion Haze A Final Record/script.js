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

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p) {
    float v=0.0,a=0.5;
    for(int i=0;i<6;i++){v+=a*noise(p);p*=2.1;a*=0.5;}
    return v;
}

void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x/uResolution.y, 1.0);
    float beat = uBeat;
    float t = uTime;

    // Year 1 - clinical obsidian square (beat 0)
    float y1 = 1.0 - smoothstep(0.8, 1.2, beat);
    vec3 col = mix(vec3(0.03, 0.02, 0.05), vec3(0.06, 0.04, 0.08), fbm(p * 3.0));
    float orb = smoothstep(0.15, 0.0, length(p - vec2(0.0, 0.1))) * y1;
    col = mix(col, vec3(0.01, 0.01, 0.02), orb * 0.9);
    col += vec3(0.2, 0.15, 0.25) * orb * 0.2;

    // Wanderers in sky - cosmic dread (beat 1)
    float wander = smoothstep(0.5, 1.0, beat) * (1.0 - smoothstep(1.8, 2.2, beat));
    float stars = step(0.995, hash(floor(p * 80.0))) * wander;
    float warp = fbm(p * 2.0 + t * 0.05) * wander;
    col = mix(col, vec3(0.02, 0.01, 0.06) + vec3(0.15, 0.05, 0.2) * warp, wander * 0.7);
    col += vec3(0.6, 0.4, 0.8) * stars;

    // Vermillion season - bruised purple to blood red (beat 2)
    float verm = smoothstep(1.8, 2.2, beat) * (1.0 - smoothstep(2.8, 3.2, beat));
    float haze = fbm(p * 1.5 + vec2(t * 0.04, t * 0.06));
    vec3 bruise = vec3(0.15, 0.04, 0.12);
    vec3 blood = vec3(0.35, 0.06, 0.1);
    col = mix(col, mix(bruise, blood, haze), verm);

    // Permanent haze - greasy twilight (beat 3-5)
    float permanent = smoothstep(2.5, 3.0, beat);
    float drip = fbm(p * 4.0 + vec2(0.0, -t * 0.3 + uScroll * 2.0));
    vec3 twilight = vec3(0.12, 0.03, 0.06) + vec3(0.25, 0.05, 0.08) * drip;
    col = mix(col, twilight, permanent * 0.85);

    // Body warp geometry (beat 4)
    float changed = smoothstep(3.5, 4.0, beat) * (1.0 - smoothstep(4.5, 5.0, beat));
    float geo = abs(sin(p.x * 20.0 + p.y * 15.0 + t)) * changed;
    col += vec3(0.3, 0.1, 0.15) * geo * 0.15;
    col = mix(col, col.rgbr, changed * 0.1); // subtle channel shift

    // Apocalyptic orb hunger (beat 4-5)
    float apoc = smoothstep(3.8, 4.5, beat);
    float bigOrb = smoothstep(0.5, 0.0, length(p - vec2(0.0, -0.2))) * apoc;
    col = mix(col, vec3(0.02, 0.0, 0.02), bigOrb * 0.7);
    col += vec3(0.5, 0.1, 0.15) * bigOrb * sin(t * 2.0) * 0.2;

    // Window drip finale (beat 5)
    float finale = smoothstep(4.5, 5.0, beat);
    for (float i = 0.0; i < 8.0; i++) {
        float x = (i - 3.5) * 0.12;
        float dripLine = smoothstep(0.02, 0.0, abs(p.x - x)) * smoothstep(-0.5, 0.3, p.y) * finale;
        float dripAnim = fract(p.y * 3.0 - t * 0.5 + i) * dripLine;
        col += vec3(0.4, 0.08, 0.12) * dripAnim * 0.3;
    }

    float vig = smoothstep(1.0, 0.25, length(p));
    col *= vig;
    gl_FragColor = vec4(col, 1.0);
}`;

class StoryEngine {
    constructor() {
        this.canvas = document.getElementById('story-canvas');
        this.sections = [...document.querySelectorAll('[data-beat]')];
        this.navStatus = document.getElementById('nav-status');
        this.navDate = document.getElementById('nav-date');
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
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
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
        beats.forEach((b, i) => {
            const m = document.createElement('div');
            m.className = 'beat-marker';
            m.style.top = `${(i / (beats.length - 1)) * 100}%`;
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
                    const date = entry.target.dataset.date;
                    if (!isNaN(beat)) {
                        this.targetBeat = beat;
                        document.body.dataset.activeBeat = beat;
                        if (label && this.navStatus) this.navStatus.textContent = label;
                        if (date && this.navDate) this.navDate.textContent = date;
                    }
                }
            });
        }, { threshold: 0.2, rootMargin: '-10% 0px -35% 0px' });
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
        this.markers?.forEach(m => m.classList.toggle('active', +m.dataset.beat === Math.round(this.currentBeat)));
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
