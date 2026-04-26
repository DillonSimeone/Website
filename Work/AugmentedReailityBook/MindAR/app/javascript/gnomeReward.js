import * as THREE from 'three';

/**
 * GnomeReward — Shared Renderer Version
 * Renders the gnome vomiting shader as a Three.js Mesh in the main scene.
 * Uses the shared CoreAR renderer — no secondary WebGL context.
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
        this._setupDone = false;
        this._sharedRenderer = null;

        // Render targets are lazy-allocated in setup()
        this._rtA = null;
        this._rtB = null;
        this._rtImage = null;
    }

    /**
     * Shared Renderer Mode:
     * Uses CoreAR's renderer for compute passes. The gnome displays as a
     * Three.js mesh that renders naturally in the main scene.
     */
    setup(sharedRenderer) {
        if (this._setupDone) {
            this.start();
            return;
        }

        this._sharedRenderer = sharedRenderer;

        // Lazy-allocate render targets (HalfFloat for mobile compatibility)
        const rtOpts = { format: THREE.RGBAFormat, type: THREE.HalfFloatType };
        this._rtA = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);
        this._rtB = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);
        this._rtImage = new THREE.WebGLRenderTarget(this.width, this.height, rtOpts);

        // Internal compute scene (buffer A pass)
        this._bufferAScene = new THREE.Scene();
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this._bufferAScene.add(this._quad);

        // Image pass scene (also renders to RT)
        this._imageScene = new THREE.Scene();
        this._imageQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this._imageScene.add(this._imageQuad);

        // Display mesh — renders as part of the main Three.js scene
        const aspect = this.width / this.height;
        const displayGeo = new THREE.PlaneGeometry(aspect, 1);
        this._displayMesh = new THREE.Mesh(displayGeo, this._displayMat);
        this._displayMesh.frustumCulled = false;
        this.add(this._displayMesh);

        this._setupDone = true;
        this.start();
        console.log('GnomeReward (Shared Renderer): Ready');
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
        
        // Clip-space vertex shader for internal buffer/compute passes (renders to RT)
        const vs_quad = `
            varying vec2 vUv;
            void main() { 
                vUv = uv;
                gl_Position = vec4(position, 1.0); 
            }
        `;

        // Scene-space vertex shader for the visible display mesh (respects MVP transform)
        const vs_scene = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

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

        // Internal compute material (clip-space, used in onUpdate for the image pass RT)
        this._imageMat = new THREE.ShaderMaterial({
            uniforms: {
                iResolution: { value: new THREE.Vector3(this.width, this.height, 1) },
                iTime: { value: 0 }, iTimeDelta: { value: 0 },
                iFrame: { value: 0 }, iMouse: { value: new THREE.Vector4() },
                iChannel0: { value: null }, iChannel1: { value: pine },
                opacity: { value: 1.0 }
            },
            vertexShader: vs_quad,
            fragmentShader: header + img + `\nvoid main() { mainImage(gl_FragColor, vUv * iResolution.xy); }`,
        });

        // Display material (scene-space, used on the visible mesh)
        this._displayMat = new THREE.ShaderMaterial({
            uniforms: {
                iChannel0: { value: null },
                opacity: { value: 1.0 }
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
            vertexShader: vs_scene,
            fragmentShader: `
                uniform sampler2D iChannel0;
                uniform float opacity;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(iChannel0, vUv);
                    gl_FragColor.a *= opacity;
                }
            `,
        });

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
     * Full reset for scanner disengage — clears render targets and state
     * so the gnome can be cleanly re-initialized on next engage.
     */
    reset(renderer) {
        this.stop();
        this.frame = 0;
        this._clock = new THREE.Clock(false);

        // Clear stale render target content
        if (renderer && this._rtA) {
            const oldTarget = renderer.getRenderTarget();
            const clearColor = renderer.getClearColor(new THREE.Color());
            const clearAlpha = renderer.getClearAlpha();

            renderer.setClearColor(0x000000, 0);
            [this._rtA, this._rtB, this._rtImage].forEach(rt => {
                if (rt) {
                    renderer.setRenderTarget(rt);
                    renderer.clear();
                }
            });

            renderer.setRenderTarget(oldTarget);
            renderer.setClearColor(clearColor, clearAlpha);
        }

        // Reset display opacity
        if (this._displayMat) {
            this._displayMat.uniforms.opacity.value = 1.0;
        }

        // Remove display mesh from group so setup() can re-add cleanly
        if (this._displayMesh) {
            this.remove(this._displayMesh);
        }

        this._setupDone = false;
    }

    /**
     * Called every frame from the main CoreAR update loop.
     * @param {THREE.WebGLRenderer} renderer - The shared CoreAR renderer
     */
    onUpdate(renderer) {
        if (!this.isRunning || !this._bufferAMat || !this._imageMat || !this._rtA) return;

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

        // 2. Image pass — render the gnome shader to _rtImage
        this._imageQuad.material = this._imageMat;
        this._imageMat.uniforms.iTime.value = time;
        this._imageMat.uniforms.iTimeDelta.value = delta;
        this._imageMat.uniforms.iFrame.value = this.frame;
        this._imageMat.uniforms.iChannel0.value = this._rtA.texture;

        renderer.setRenderTarget(this._rtImage);
        renderer.render(this._imageScene, this._camera);

        // 3. Feed the computed image to the display material
        this._displayMat.uniforms.iChannel0.value = this._rtImage.texture;

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
        if (this._rtA) this._rtA.dispose();
        if (this._rtB) this._rtB.dispose();
        if (this._rtImage) this._rtImage.dispose();
        if (this._bufferAMat) this._bufferAMat.dispose();
        if (this._imageMat) this._imageMat.dispose();
        if (this._displayMat) this._displayMat.dispose();
    }
}
