import * as THREE from 'three';

/**
 * GnomeReward — Renders the gnome vomiting shader onto its own canvas.
 * Swap this.canvas into the DOM wherever you want it to appear.
 */
export class GnomeReward {
    constructor(width = 460, height = 460) {
        this.width = width;
        this.height = height;
        this.isRunning = false;
        this.frame = 0;
        this._animId = null;

        // Own WebGL renderer with its own canvas
        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        this.renderer.setSize(width, height);
        this.canvas = this.renderer.domElement;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.canvas.style.borderRadius = '12px';
        this.canvas.id = 'gnome-canvas';

        // Offscreen scene for shader passes
        this._scene = new THREE.Scene();
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this._scene.add(this._quad);

        // Ping-pong render targets
        const rtOpts = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
        };
        this._rtA = new THREE.WebGLRenderTarget(width, height, rtOpts);
        this._rtB = new THREE.WebGLRenderTarget(width, height, rtOpts);

        this._bufferAMat = null;
        this._imageMat = null;
        this._clock = new THREE.Clock(false);
    }

    async load() {
        const dir = './assets/shaders/vomiting/';
        const [common, bufA, img] = await Promise.all([
            fetch(dir + 'common.glsl').then(r => r.text()),
            fetch(dir + 'bufferA.glsl').then(r => r.text()),
            fetch(dir + 'image.glsl').then(r => r.text()),
        ]);

        const pine = new THREE.TextureLoader().load(dir + 'pine_tree.png');
        pine.minFilter = THREE.LinearFilter;
        pine.magFilter = THREE.LinearFilter;

        const header = `
            uniform vec3 iResolution;
            uniform float iTime;
            uniform float iTimeDelta;
            uniform int iFrame;
            uniform vec4 iMouse;
            uniform sampler2D iChannel0;
            uniform sampler2D iChannel1;
            ${common}
        `;
        const vs = `void main() { gl_Position = vec4(position, 1.0); }`;

        this._bufferAMat = new THREE.ShaderMaterial({
            uniforms: {
                iResolution: { value: new THREE.Vector3(this.width, this.height, 1) },
                iTime: { value: 0 }, iTimeDelta: { value: 0 },
                iFrame: { value: 0 }, iMouse: { value: new THREE.Vector4() },
                iChannel0: { value: null }, iChannel1: { value: null },
            },
            vertexShader: vs,
            fragmentShader: header + bufA + `\nvoid main() { mainImage(gl_FragColor, gl_FragCoord.xy); }`,
        });

        this._imageMat = new THREE.ShaderMaterial({
            uniforms: {
                iResolution: { value: new THREE.Vector3(this.width, this.height, 1) },
                iTime: { value: 0 }, iTimeDelta: { value: 0 },
                iFrame: { value: 0 }, iMouse: { value: new THREE.Vector4() },
                iChannel0: { value: this._rtA.texture }, iChannel1: { value: pine },
            },
            vertexShader: vs,
            fragmentShader: header + img + `\nvoid main() { mainImage(gl_FragColor, gl_FragCoord.xy); }`,
        });

        console.log('🧙 GnomeReward: Shaders loaded');
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.frame = 0;
        this._clock.start();
        this._loop();
        console.log('🧙 GnomeReward: Started');
    }

    stop() {
        this.isRunning = false;
        this._clock.stop();
        if (this._animId) {
            cancelAnimationFrame(this._animId);
            this._animId = null;
        }
    }

    _loop() {
        if (!this.isRunning) return;
        this._animId = requestAnimationFrame(() => this._loop());
        if (!this._bufferAMat || !this._imageMat) return;

        const time = this._clock.getElapsedTime();
        const delta = this._clock.getDelta();

        // Buffer A pass (state machine)
        this._quad.material = this._bufferAMat;
        this._bufferAMat.uniforms.iTime.value = time;
        this._bufferAMat.uniforms.iTimeDelta.value = delta;
        this._bufferAMat.uniforms.iFrame.value = this.frame;
        this._bufferAMat.uniforms.iChannel0.value = this._rtB.texture;
        this.renderer.setRenderTarget(this._rtA);
        this.renderer.render(this._scene, this._camera);

        // Image pass (render to screen)
        this._quad.material = this._imageMat;
        this._imageMat.uniforms.iTime.value = time;
        this._imageMat.uniforms.iTimeDelta.value = delta;
        this._imageMat.uniforms.iFrame.value = this.frame;
        this._imageMat.uniforms.iChannel0.value = this._rtA.texture;
        this.renderer.setRenderTarget(null); // render to screen canvas
        this.renderer.render(this._scene, this._camera);

        // Ping-pong
        const tmp = this._rtA;
        this._rtA = this._rtB;
        this._rtB = tmp;
        this.frame++;
    }

    dispose() {
        this.stop();
        this._rtA.dispose();
        this._rtB.dispose();
        if (this._bufferAMat) this._bufferAMat.dispose();
        if (this._imageMat) this._imageMat.dispose();
        this.renderer.dispose();
    }
}
