/**
 * page-manager.js — Data-Driven Page Loader
 *
 * Reads `pages.json` and manages the lifecycle of each AR page:
 *  - Preloads tracking images as bitmaps for WebXR
 *  - Lazy-loads GLB models on first track
 *  - Tracks peel state per page
 *
 * Designed to scale to 200+ pages with minimal memory pressure.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * @typedef {object} PageEntry
 * @property {string} id
 * @property {number} pageNumber
 * @property {string} label
 * @property {string} trackingImage
 * @property {number} physicalWidthM
 * @property {object} model
 * @property {object} animation
 * @property {object} peel
 */

export class PageManager {
    constructor() {
        /** @type {PageEntry[]} */
        this.pages = [];

        /** @type {Map<number, PageEntry>} index in pages array → entry */
        this.pagesByIndex = new Map();

        /** @type {Map<string, PageEntry>} id → entry */
        this.pagesById = new Map();

        /** @type {Map<string, THREE.Group>} pageId → loaded 3D model root */
        this.loadedModels = new Map();

        /** @type {Map<string, THREE.AnimationMixer>} pageId → mixer */
        this.mixers = new Map();

        /** @type {Set<string>} pageIds that have been peeled */
        this.peeledPages = new Set();

        /** @type {Map<string, boolean>} pageId → currently loading */
        this._loadingInProgress = new Map();

        this._gltfLoader = new GLTFLoader();
    }

    /**
     * Load and parse the pages.json registry.
     * @param {string} url - Path to pages.json
     */
    async loadRegistry(url = 'pages.json') {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load page registry: ${res.status}`);

        const data = await res.json();
        this.pages = data.pages || [];

        this.pages.forEach((page, idx) => {
            this.pagesByIndex.set(idx, page);
            this.pagesById.set(page.id, page);
        });

        console.log(`[PageManager] Loaded ${this.pages.length} page(s) from registry.`);
    }

    /**
     * Preload all tracking images as ImageBitmap for WebXR.
     * Returns the array needed for XRSession's trackedImages.
     *
     * @returns {Promise<Array<{image: ImageBitmap, widthInMeters: number}>>}
     */
    async preloadTrackingImages() {
        const entries = [];

        for (const page of this.pages) {
            try {
                const res = await fetch(page.trackingImage);
                const blob = await res.blob();
                const bitmap = await createImageBitmap(blob);

                entries.push({
                    image: bitmap,
                    widthInMeters: page.physicalWidthM
                });

                console.log(`[PageManager] Preloaded tracking image: ${page.label}`);
            } catch (err) {
                console.error(`[PageManager] Failed to load tracking image for ${page.label}:`, err);
            }
        }

        return entries;
    }

    /**
     * Lazy-load a GLB model for a page. Returns cached if already loaded.
     *
     * @param {string} pageId
     * @returns {Promise<THREE.Group>}
     */
    async loadModel(pageId) {
        // Return cached
        if (this.loadedModels.has(pageId)) {
            return this.loadedModels.get(pageId);
        }

        // Prevent double-loading
        if (this._loadingInProgress.get(pageId)) {
            // Wait for existing load
            return new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (this.loadedModels.has(pageId)) {
                        clearInterval(interval);
                        resolve(this.loadedModels.get(pageId));
                    }
                }, 100);
            });
        }

        const page = this.pagesById.get(pageId);
        if (!page) throw new Error(`[PageManager] Unknown page: ${pageId}`);

        this._loadingInProgress.set(pageId, true);

        try {
            const gltf = await this._gltfLoader.loadAsync(page.model.src);
            const model = gltf.scene;

            // Apply config transforms
            const s = page.model.scale || 1;
            model.scale.set(s, s, s);
            model.position.set(
                page.model.offsetX || 0,
                page.model.offsetY || 0,
                page.model.offsetZ || 0
            );
            model.rotation.y = THREE.MathUtils.degToRad(page.model.rotationY || 0);

            // Enable shadows
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Handle animations
            if (gltf.animations && gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(model);
                this.mixers.set(pageId, mixer);

                if (page.animation && page.animation.autoplay) {
                    const clipIdx = page.animation.clipIndex || 0;
                    const clip = gltf.animations[clipIdx];
                    if (clip) {
                        const action = mixer.clipAction(clip);
                        action.loop = page.animation.loop ? THREE.LoopRepeat : THREE.LoopOnce;
                        action.play();
                    }
                }
            }

            this.loadedModels.set(pageId, model);
            console.log(`[PageManager] Model loaded: ${page.label}`);

            return model;
        } catch (err) {
            console.error(`[PageManager] Failed to load model for ${page.label}:`, err);
            throw err;
        } finally {
            this._loadingInProgress.delete(pageId);
        }
    }

    /**
     * Get the page entry by its tracked image index.
     * WebXR reports image tracking results by index (matching the order given to requestSession).
     *
     * @param {number} index
     * @returns {PageEntry|undefined}
     */
    getPageByImageIndex(index) {
        return this.pagesByIndex.get(index);
    }

    /**
     * Check if a page has already played its peel animation.
     * @param {string} pageId
     * @returns {boolean}
     */
    isPeeled(pageId) {
        return this.peeledPages.has(pageId);
    }

    /**
     * Mark a page as peeled.
     * @param {string} pageId
     */
    markPeeled(pageId) {
        this.peeledPages.add(pageId);
    }

    /**
     * Update all active animation mixers.
     * Call this every frame from the render loop.
     * @param {number} delta - Time since last frame in seconds
     */
    updateAnimations(delta) {
        this.mixers.forEach((mixer) => {
            mixer.update(delta);
        });
    }

    /**
     * Dispose of a specific model to free GPU memory.
     * Useful for memory management with many pages.
     * @param {string} pageId
     */
    disposeModel(pageId) {
        const model = this.loadedModels.get(pageId);
        if (!model) return;

        model.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose();
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => {
                    m.map?.dispose();
                    m.normalMap?.dispose();
                    m.roughnessMap?.dispose();
                    m.metalnessMap?.dispose();
                    m.dispose();
                });
            }
        });

        const mixer = this.mixers.get(pageId);
        if (mixer) {
            mixer.stopAllAction();
            this.mixers.delete(pageId);
        }

        this.loadedModels.delete(pageId);
        console.log(`[PageManager] Disposed model: ${pageId}`);
    }
}
