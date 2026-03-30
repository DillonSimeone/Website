import * as THREE from 'three';

/**
 * GnomeReward — Shared Renderer Version
 * Renders the gnome vomiting shader directly as a Three.js Mesh.
 * No secondary WebGL context.
 */
export class GnomeReward extends THREE.Group {
    constructor(width = 500, height = 375) {
        super();
        this.width = width;
        this.height = height;
        this.isRunning = false;
        this.frame = 0;
        this.frustumCulled = false;
        this._clock = new THREE.Clock(false);
        
        // Output canvas for "DIV Swap" mode
        this.outputCanvas = null;
        this.externalRenderer = null;

        // Ping-pong targets (MUST be ready for early load() calls)
        const rtOpts = { format: THREE.RGBAFormat, type: THREE.FloatType };
        this._rtA = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);
        this._rtB = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);
    }

    /**
     * "DIV SWAP" MODE:
     * Injects a canvas into a target element and takes over rendering within that scope.
     * This is the definitive fix for synchronization and drift.
     */
    async setupInElement(element) {
        if (!element) return;
        
        // Create the canvas that will live inside the "Static Screen" DIV
        this.outputCanvas = document.createElement('canvas');
        this.outputCanvas.style.width = '100%';
        this.outputCanvas.style.height = '100%';
        this.outputCanvas.style.display = 'block';
        element.innerHTML = ''; // Wipe content A (static screen)
        element.appendChild(this.outputCanvas);

        // Setup local renderer for this canvas
        this.externalRenderer = new THREE.WebGLRenderer({ 
            canvas: this.outputCanvas, 
            alpha: true, 
            antialias: true 
        });
        this.externalRenderer.setSize(this.width, this.height, false);
        this.externalRenderer.setPixelRatio(window.devicePixelRatio);

        await this.load();
        
        // Internal scene setup
        this._bufferAScene = new THREE.Scene();
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this._bufferAScene.add(this._quad);

        // Final Image Pass (FullScreen Quad for the external canvas)
        this._finalScene = new THREE.Scene();
        this._finalQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this._finalScene.add(this._finalQuad);

        this.start();
        this._renderLoop();
        console.log('🧙 GnomeReward (HTML Swap): Ready');
    }

    _renderLoop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this._renderLoop());
        this.onUpdate(this.externalRenderer);
        
        // Final draw to the injected canvas
        this._finalQuad.material = this._imageMat;
        this.externalRenderer.setRenderTarget(null);
        this.externalRenderer.render(this._finalScene, this._camera);
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
            uniform float opacity;
            varying vec2 vUv;
            uniform int iFrame;
            uniform vec4 iMouse;
            uniform sampler2D iChannel0;
            uniform sampler2D iChannel1;
            ${common}
        `;
        
        // Screen-space vertex shader for internal buffer passes
        const vs_quad = `
            varying vec2 vUv;
            void main() { 
                vUv = uv;
                gl_Position = vec4(position, 1.0); 
            }
        `;
        
        // In DIV Swap mode, the final pass also uses a fullscreen quad
        const vs_mesh = vs_quad;

        this._bufferAMat = new THREE.ShaderMaterial({
            uniforms: {
                iResolution: { value: new THREE.Vector3(this.width, this.height, 1) },
                iTime: { value: 0 }, iTimeDelta: { value: 0 },
                iFrame: { value: 0 }, iMouse: { value: new THREE.Vector4() },
                iChannel0: { value: null }, iChannel1: { value: null },
            },
            vertexShader: vs_quad,
            fragmentShader: header + bufA + `\nvoid main() { mainImage(gl_FragColor, vUv * iResolution.xy); }`,
        });

        this._imageMat = new THREE.ShaderMaterial({
            uniforms: {
                iResolution: { value: new THREE.Vector3(this.width, this.height, 1) },
                iTime: { value: 0 }, iTimeDelta: { value: 0 },
                iFrame: { value: 0 }, iMouse: { value: new THREE.Vector4() },
                iChannel0: { value: this._rtA.texture }, iChannel1: { value: pine },
                opacity: { value: 1.0 }
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
            vertexShader: vs_mesh,
            fragmentShader: header + img + `\nvoid main() { mainImage(gl_FragColor, vUv * iResolution.xy); gl_FragColor.a *= opacity; }`,
        });

        // In DIV Swap mode, _imageMat is applied to _finalQuad in _renderLoop()
        console.log('GnomeReward: Shaders loaded');
    }

    start() {
        this.isRunning = true;
        this.visible = true;
        this._clock.start();
        console.log('🧙 GnomeReward: Started');
    }

    stop() {
        this.isRunning = false;
        this.visible = false;
        this._clock.stop();
    }

    /**
     * Called every frame from the main CoreAR loop.
     * @param {THREE.WebGLRenderer} renderer - The shared renderer
     */
    onUpdate(renderer) {
        if (!this.isRunning || !this._bufferAMat || !this._imageMat) return;

        const time = this._clock.getElapsedTime();
        const delta = this._clock.getDelta();

        // Save current render target
        const oldTarget = renderer.getRenderTarget();

        // 1. Buffer A pass (state machine)
        this._quad.material = this._bufferAMat;
        this._bufferAMat.uniforms.iTime.value = time;
        this._bufferAMat.uniforms.iTimeDelta.value = delta;
        this._bufferAMat.uniforms.iFrame.value = this.frame;
        this._bufferAMat.uniforms.iChannel0.value = this._rtB.texture;
        
        renderer.setRenderTarget(this._rtA);
        renderer.render(this._bufferAScene, this._camera);

        // 2. Final texture is now in _rtA.texture
        // The mainMesh uses _imageMat which points to _rtA.texture.
        // We just need to update the uniforms.
        this._imageMat.uniforms.iTime.value = time;
        this._imageMat.uniforms.iTimeDelta.value = delta;
        this._imageMat.uniforms.iFrame.value = this.frame;
        this._imageMat.uniforms.iChannel0.value = this._rtA.texture;

        // Restore render target so the main scene renders to screen
        renderer.setRenderTarget(oldTarget);

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
    }
}
