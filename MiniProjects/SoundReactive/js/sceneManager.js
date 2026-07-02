import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mesh = null;
        this.uniforms = null;
        this.controls = null;
        this.material = null;
    }

    init(container) {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.z = 3;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.createSubject('ico');

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
    }

    createSubject(type = 'ico') {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
        }

        let geometry;
        switch (type) {
            case 'sphere': geometry = new THREE.SphereGeometry(1, 64, 64); break;
            case 'box': geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5, 20, 20, 20); break;
            case 'torus': geometry = new THREE.TorusGeometry(1, 0.4, 30, 100); break;
            case 'plane': geometry = new THREE.PlaneGeometry(3, 3, 64, 64); break;
            case 'ico': default: geometry = new THREE.IcosahedronGeometry(1, 44); break;
        }

        if (!this.uniforms) {
            this.uniforms = {
                uTime: { value: 0 },
                uVolume: { value: 0 },
                uBass: { value: 0 },
                uMid: { value: 0 },
                uTreble: { value: 0 },
                uThreshold: { value: 0.1 },
                uColorA: { value: new THREE.Color('#00ffaa') },
                uColorB: { value: new THREE.Color('#bd00ff') }
            };
        }

        if (!this.material) {
            this.material = new THREE.ShaderMaterial({
                vertexShader: vertexShaderNoise,
                fragmentShader: fragmentShaderNoise,
                uniforms: this.uniforms,
                wireframe: true
            });
        }

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);
    }

    setShader(type) {
        if (!this.mesh) return;

        // Dispose old material to avoid leaks
        if (this.material) this.material.dispose();

        let vShader = vertexShaderNoise;
        let fShader = fragmentShaderNoise;

        if (type === 'plasma') {
            vShader = vertexShaderPlasma;
            fShader = fragmentShaderPlasma;
        } else if (type === 'pixel') {
            vShader = vertexShaderPixel;
            fShader = fragmentShaderPixel;
        }

        this.material = new THREE.ShaderMaterial({
            vertexShader: vShader,
            fragmentShader: fShader,
            uniforms: this.uniforms,
            wireframe: true
        });

        this.mesh.material = this.material;
    }

    setShape(type) {
        this.createSubject(type);
    }

    setColor(key, hex) {
        if (key === 'A') this.uniforms.uColorA.value.set(hex);
        if (key === 'B') this.uniforms.uColorB.value.set(hex);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    update(audioData, effectiveVolume, thresholdVal, useFreqMap, selectedFreqAmp) {
        this.controls.update();
        this.uniforms.uTime.value += 0.05;

        const nVolume = effectiveVolume / 255.0;
        const nBass = audioData.bass / 255.0;
        const nMid = audioData.mid / 255.0;
        const nTreble = audioData.treble / 255.0;

        const nThreshold = (thresholdVal || 0) / 255.0;

        this.uniforms.uVolume.value = THREE.MathUtils.lerp(this.uniforms.uVolume.value, nVolume, 0.2);
        this.uniforms.uBass.value = THREE.MathUtils.lerp(this.uniforms.uBass.value, nBass, 0.2);
        this.uniforms.uMid.value = THREE.MathUtils.lerp(this.uniforms.uMid.value, nMid, 0.2);
        this.uniforms.uTreble.value = THREE.MathUtils.lerp(this.uniforms.uTreble.value, nTreble, 0.2);
        this.uniforms.uThreshold.value = nThreshold;

        if (useFreqMap) {
            const minFreq = audioData.minDetectedFreq || 0;
            const maxFreq = audioData.maxDetectedFreq || 0;

            const hueA = Math.min(1.0, minFreq / 2000) * 0.8;
            const hueB = Math.min(1.0, maxFreq / 15000) * 0.8;

            let litA = 0.5;
            if (selectedFreqAmp !== undefined) {
                litA = Math.max(0.05, (selectedFreqAmp / 255.0));
            }

            const colA = new THREE.Color().setHSL(hueA, 1.0, litA);
            const colB = new THREE.Color().setHSL(hueB, 1.0, 0.5);

            this.uniforms.uColorA.value.lerp(colA, 0.1);
            this.uniforms.uColorB.value.lerp(colB, 0.1);
        }

        this.mesh.rotation.y += 0.002 + (nVolume * 0.02);
        this.mesh.rotation.x += 0.001 + (nBass * 0.01);

        return {
            colorA: this.uniforms.uColorA.value.getHexString(),
            colorB: this.uniforms.uColorB.value.getHexString()
        };
    }

    updateIdle() {
        this.controls.update();
        this.uniforms.uTime.value += 0.02;
        this.uniforms.uVolume.value = THREE.MathUtils.lerp(this.uniforms.uVolume.value, 0, 0.1);
        this.mesh.rotation.y += 0.002;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

// --- SHADER LIBRARY ---

// Common Noise Functions (Reusable)
const noiseChunk = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute( permute( permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
`;

// 1. Noise Bubble (Original)
const vertexShaderNoise = `
    uniform float uTime;
    uniform float uVolume;
    uniform float uBass;
    uniform float uThreshold;
    varying vec2 vUv;
    varying float vDisplacement;
    ${noiseChunk}
    void main() {
        vUv = uv;
        float effectiveVol = max(0.0, uVolume - uThreshold); 
        float effectiveBass = max(0.0, uBass - uThreshold);
        float noise = snoise(position + vec3(uTime * 0.5));
        float distortion = noise * (0.1 + effectiveBass * 2.0 + effectiveVol * 1.5);
        vDisplacement = distortion;
        vec3 newPosition = position + (normal * distortion);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
`;
const fragmentShaderNoise = `
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uVolume;
    varying vec2 vUv;
    varying float vDisplacement;
    void main() {
        float mixVal = smoothstep(-0.2, 0.8, vDisplacement);
        vec3 color = mix(uColorA, uColorB, mixVal + (uVolume * 0.2));
        gl_FragColor = vec4(color, 1.0);
    }
`;

// 2. Plasma Pulse (Smooth, wave-like)
const vertexShaderPlasma = `
    uniform float uTime;
    uniform float uVolume;
    uniform float uBass;
    varying vec2 vUv;
    varying float vDisplacement;
    void main() {
        vUv = uv;
        float wave = sin(position.y * 5.0 + uTime * 2.0) * (uBass * 0.5);
        float wave2 = cos(position.x * 5.0 + uTime) * (uVolume * 0.3);
        vDisplacement = wave + wave2;
        vec3 newPosition = position + (normal * vDisplacement * 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
`;
const fragmentShaderPlasma = `
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uTime;
    varying vec2 vUv;
    varying float vDisplacement;
    void main() {
        float p = sin(vUv.y * 10.0 + uTime) * 0.5 + 0.5;
        vec3 color = mix(uColorA, uColorB, p + vDisplacement);
        gl_FragColor = vec4(color, 1.0);
    }
`;

// 3. Digital Glitch (Spikey, quantized)
const vertexShaderPixel = `
    uniform float uTime;
    uniform float uVolume;
    uniform float uTreble;
    varying vec2 vUv;
    varying float vDisplacement;
    float rand(vec2 co){
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
        vUv = uv;
        // Quantize position for blocky effect
        vec3 pos = position;
        float snap = 0.2; // Grid size
        if (uVolume > 0.1) {
            pos = floor(position / snap) * snap;
        }
        
        float spike = 0.0;
        if (rand(uv + uTime) > 0.95) {
            spike = uTreble * 0.5;
        }
        
        vDisplacement = spike;
        vec3 newPosition = pos + (normal * spike);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
`;
const fragmentShaderPixel = `
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying float vDisplacement;
    void main() {
        vec3 color = uColorA;
        if (vDisplacement > 0.1) color = uColorB; // Binary color switch on spikes
        if (mod(gl_FragCoord.y, 4.0) < 2.0) color *= 0.8; // Scanlines
        gl_FragColor = vec4(color, 1.0);
    }
`;
