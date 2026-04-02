import * as THREE from 'three';
import { MindARThree } from 'mind-ar-image-three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

/**
 * CoreAR.js — Ford Pines Scanner AR Controller
 * Centralizes Three.js and MindAR scene setup.
 */
export class CoreAR {
    constructor(container, options = {}) {
        this.container = container;
        this.imageTargetSrc = options.imageTargetSrc || './targets/book_targets.mind';
        
        this.mindarThree = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        
        this.cssRenderer = null;
        this.cssScene = null;
        
        this.isScanning = false;
        this.onFrameUpdate = options.onFrameUpdate || (() => {});
    }

    async init() {
        this.mindarThree = new MindARThree({
            container: this.container,
            imageTargetSrc: this.imageTargetSrc,
            filterMinCF: 0.0001,
            filterBeta: 0.1,
            uiLoading: 'no',
            uiScanning: 'no'
        });

        this.renderer = this.mindarThree.renderer;
        this.scene = this.mindarThree.scene;
        this.camera = this.mindarThree.camera;

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // --- CSS3D Renderer ---
        this.cssScene = new THREE.Scene();
        this.cssRenderer = new CSS3DRenderer();
        this.cssRenderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
        this.cssRenderer.domElement.style.position = 'absolute';
        this.cssRenderer.domElement.style.top = '0';
        this.cssRenderer.domElement.style.left = '0';
        this.cssRenderer.domElement.style.pointerEvents = 'none';
        this.cssRenderer.domElement.style.zIndex = '2000';
        this.cssRenderer.domElement.style.display = 'none';
        this.container.appendChild(this.cssRenderer.domElement);

        window.addEventListener('resize', () => this.onResize());
        this.onResize();

        this._setupLighting();
    }

    _setupLighting() {
        const amb = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(amb);
    }

    onResize() {
        if (!this.container) return;
        const w = this.container.offsetWidth;
        const h = this.container.offsetHeight;
        if (this.renderer) this.renderer.setSize(w, h);
        if (this.cssRenderer) this.cssRenderer.setSize(w, h);
    }

    async start() {
        if (window.captureTelemetry) window.captureTelemetry("CAM_REQUEST");
        
        try {
            await this.mindarThree.start();
            
            // --- iOS CRITICAL: Force playsinline on MindAR's video ---
            const video = this.container.querySelector('video');
            if (video) {
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                video.muted = true;
                video.play().catch(e => console.warn("Video play error caught:", e));
            }
            
        } catch (e) {
            if (window.captureTelemetry) window.captureTelemetry("CAM_FAIL: " + e.message);
            throw e;
        }

        if (window.captureTelemetry) window.captureTelemetry("CAM_ACTIVE");
        this.isScanning = true;
        this.cssRenderer.domElement.style.display = 'block';
        
        const clock = new THREE.Clock();
        this.renderer.setAnimationLoop(() => {
            const dt = clock.getDelta();
            this.onFrameUpdate(dt);
            
            this.renderer.render(this.scene, this.camera);
            if (this.cssRenderer && this.isScanning) {
                this.cssRenderer.render(this.cssScene, this.camera);
            }
        });
    }

    stop() {
        this.mindarThree.stop();
        this.isScanning = false;
        this.cssRenderer.domElement.style.display = 'none';
        this.renderer.setAnimationLoop(null);
    }

    /**
     * Full teardown — destroy the MindAR instance so we can re-init from scratch.
     */
    teardown() {
        this.stop();
        // Clear the Three.js scene
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        while (this.cssScene.children.length > 0) {
            this.cssScene.remove(this.cssScene.children[0]);
        }
        this.mindarThree = null;
    }

    addAnchor(index) {
        return this.mindarThree.addAnchor(index);
    }

    /**
     * Update the MindAR internal filter parameters.
     * @param {number} minCF - The new filterMinCF value.
     */
    setFilterMinCF(minCF) {
        if (this.mindarThree && this.mindarThree.controller) {
            this.mindarThree.controller.filterMinCF = minCF;
        }
    }
}
