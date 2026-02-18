/**
 * universal-xr-manager.js (MindAR Version)
 *
 * Replaces the native WebXR manager to provide universal 
 * support across iOS, Android, and Desktop.
 */

import * as THREE from 'three';

export class UniversalXRManager extends EventTarget {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {string} mindFilePath - Path to the compiled .mind tracking file
     */
    constructor(container) {
        super();
        this.container = container;
        this.mindarThree = null;
        this.isStarted = false;
    }

    /**
     * Initialize MindAR. This setup the video feed and tracking engine.
     * @param {string} imageTargetSrc - Path to the .mind file
     */
    async init(imageTargetSrc) {
        // MindAR uses its own Three.js wrapper to sync camera & tracking
        this.mindarThree = new window.MINDAR.IMAGE.MindARThree({
            container: this.container,
            imageTargetSrc: imageTargetSrc,
            maxTrack: 2, // How many images to track simultaneously
            uiLoading: "no",
            uiScanning: "no",
            filterMinCF: 0.001, // Highly stable filtering
            filterBeta: 10
        });

        const { renderer, scene, camera } = this.mindarThree;

        // We need to pass these back to the main App
        return { renderer, scene, camera };
    }

    async start() {
        if (this.isStarted) return;

        try {
            await this.mindarThree.start();
            this.isStarted = true;
            this.dispatchEvent(new Event('sessionstart'));

            // Hook into MindAR tracking events
            // MindAR provides tracking status per target index
            this._setupTrackingListeners();

        } catch (err) {
            console.error("[UniversalXR] Start failed:", err);
            throw err;
        }
    }

    _setupTrackingListeners() {
        const { scene } = this.mindarThree;

        // MindAR creates a CSS-like selector system for targets
        // For each target defined in the .mind file, we listen for anchors
        // Note: We'll handle the page-specific logic in app.js

        // We use a generic loop to catch all possible targets
        // Assuming the user might have many pages in one .mind file
        for (let i = 0; i < 100; i++) { // Arbitrary limit, check mindar docs for dynamic
            const anchor = this.mindarThree.addAnchor(i);

            anchor.onTargetFound = () => {
                this.dispatchEvent(new CustomEvent('trackingfound', {
                    detail: { index: i, group: anchor.group }
                }));
            };

            anchor.onTargetUpdate = () => {
                // MindAR handles the group matrix auto-magically
            };

            anchor.onTargetLost = () => {
                this.dispatchEvent(new CustomEvent('trackinglost', {
                    detail: { index: i }
                }));
            };
        }
    }

    stop() {
        if (this.mindarThree) {
            this.mindarThree.stop();
            this.isStarted = false;
            this.dispatchEvent(new Event('sessionend'));
        }
    }
}
