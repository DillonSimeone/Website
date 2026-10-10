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
    for(int i=0;i<5;i++){v+=a*noise(p);p*=2.1;a*=0.5;}
    return v;
}

void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x/uResolution.y, 1.0);
    float beat = uBeat;
    float t = uTime;

    // Shrine blue water (beat 0-1)
    float water = 1.0 - smoothstep(1.5, 2.0, beat);
    float caustics = fbm(p * 6.0 + vec2(t * 0.15, t * 0.08));
    vec3 col = mix(vec3(0.02, 0.05, 0.1), vec3(0.08, 0.25, 0.45) + caustics * 0.15, water);
    col += vec3(0.1, 0.35, 0.6) * caustics * water * 0.2;

    // Void abyss (beat 1)
    float voidPhase = smoothstep(0.5, 1.0, beat) * (1.0 - smoothstep(1.8, 2.2, beat));
    float abyss = fbm(p * 2.0 - t * 0.03);
    col = mix(col, vec3(0.01, 0.02, 0.04) * (0.5 + abyss), voidPhase * 0.7);

    // Hyrule green explosion (beat 2)
    float plateau = smoothstep(1.8, 2.2, beat) * (1.0 - smoothstep(2.8, 3.2, beat));
    float wind = sin(p.x * 8.0 + t) * 0.5 + 0.5;
    vec3 green = vec3(0.05, 0.18, 0.08) + vec3(0.1, 0.35, 0.15) * wind;
    col = mix(col, green, plateau);

    // Hunger fire (beat 3-4, 7)
    float hunger = max(smoothstep(2.8, 3.2, beat) * (1.0 - smoothstep(4.5, 5.0, beat)),
                       smoothstep(6.5, 7.0, beat));
    float fire = fbm(p * 4.0 + vec2(0.0, -t * 0.4));
    float ember = smoothstep(0.4, 0.8, fire) * hunger;
    col += vec3(0.5, 0.15, 0.02) * ember * 0.5;
    col += vec3(0.8, 0.3, 0.05) * ember * sin(t * 4.0) * 0.15;

    // Healing pink pulse (beat 4)
    float heal = smoothstep(3.5, 4.0, beat) * (1.0 - smoothstep(4.5, 5.0, beat));
    col += vec3(0.5, 0.2, 0.25) * heal * (sin(t * 6.0) * 0.5 + 0.5) * 0.2;

    // Monster mass - dark sinew (beat 5)
    float monster = smoothstep(4.5, 5.0, beat) * (1.0 - smoothstep(5.8, 6.2, beat));
    float sinew = fbm(p * 3.0 + t * 0.05);
    col = mix(col, vec3(0.08, 0.04, 0.06) + sinew * 0.1, monster * 0.6);

    // Analysis stillness - soft golden dusk (beat 6)
    float analysis = smoothstep(5.8, 6.2, beat) * (1.0 - smoothstep(6.8, 7.0, beat));
    col = mix(col, vec3(0.12, 0.1, 0.06) + vec3(0.2, 0.15, 0.05) * fbm(p + t * 0.02), analysis * 0.5);

    // Misty wetlands finale (beat 7)
    float mist = smoothstep(6.5, 7.0, beat);
    col = mix(col, mix(col, vec3(0.15, 0.2, 0.25), 0.4), mist);
    col += vec3(0.3, 0.4, 0.5) * fbm(p * 2.0 + t * 0.1) * mist * 0.1;

    float vig = smoothstep(1.0, 0.35, length(p));
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
                    if (!isNaN(beat)) {
                        this.targetBeat = beat;
                        document.body.dataset.activeBeat = beat;
                        if (label && this.navStatus) this.navStatus.textContent = label;
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
