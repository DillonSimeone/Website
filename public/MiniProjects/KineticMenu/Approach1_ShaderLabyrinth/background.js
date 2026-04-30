// background.js — Reactive GLSL shader background with per-pose mood shifting.
import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;
varying vec2 vUv;
void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const MOOD_COLORS = {
    calm: new THREE.Color(0.0, 0.6, 0.8),
    electric: new THREE.Color(0.9, 0.1, 0.3),
    chaotic: new THREE.Color(0.9, 0.5, 0.0),
};

export class ShaderBackground {
    constructor() {
        this.uniforms = {
            uTime: { value: 0 },
            uCameraSpeed: { value: 0 },
            uScroll: { value: 0 },
            uMoodColor: { value: MOOD_COLORS.calm.clone() },
            uMoodIntensity: { value: 0.5 },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uFontSize: { value: 0.5 }, // Default alchemy scale
        };

        this.targetMoodColor = MOOD_COLORS.calm.clone();

        const geo = new THREE.BoxGeometry(100, 100, 100);
        this.material = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vWorldPos;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vWorldPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader, 
            uniforms: this.uniforms,
            side: THREE.BackSide, // Render inside of the cube
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.renderOrder = -1000;

        // Load the external default immediately
        this.loadShader('./shaders/rainbow.glsl');
    }

    setGeometry(type) {
        if (type === 'sphere') {
            this.mesh.geometry = new THREE.IcosahedronGeometry(100, 4);
        } else {
            this.mesh.geometry = new THREE.BoxGeometry(100, 100, 100);
        }
    }

    async loadShader(url) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Failed to load shader: ${resp.statusText}`);
            const frag = await resp.text();
            
            this.material.fragmentShader = frag;
            this.material.needsUpdate = true;
            console.log(`Loaded shader: ${url}`);
        } catch (err) {
            console.error(err);
        }
    }

    setMood(moodName) {
        const color = MOOD_COLORS[moodName];
        if (color) this.targetMoodColor.copy(color);
    }

    setUniform(name, value) {
        if (this.uniforms[name]) {
            this.uniforms[name].value = value;
        }
    }

    update(dt, cameraSpeed, camera) {
        this.uniforms.uTime.value += dt;
        this.uniforms.uCameraSpeed.value += (cameraSpeed - this.uniforms.uCameraSpeed.value) * 0.1;
        
        if (this.uniforms.uCameraSpeed.value > 2.0) {
            this.uniforms.uScroll.value += cameraSpeed * dt;
            // Wrap to maintain precision
            this.uniforms.uScroll.value %= 1000.0;
        }

        this.uniforms.uMoodColor.value.lerp(this.targetMoodColor, dt * 2.0);

        // Keep the cube centered on the camera
        this.mesh.position.copy(camera.position);
    }
}
