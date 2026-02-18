/**
 * xr-manager.js — WebXR Session & Image Tracking Controller
 *
 * Handles:
 *  - Feature detection & session startup
 *  - Image tracking event dispatch
 *  - XR reference space management
 *  - Light estimation (XREstimatedLight)
 */

import * as THREE from 'three';

/** Tracking state enum */
export const TrackingState = {
    NOT_TRACKED: 'not_tracked',
    TRACKING: 'tracking',
    EMULATED: 'emulated'
};

export class XRManager extends EventTarget {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {Array<{image: ImageBitmap, widthInMeters: number}>} trackedImages
     */
    constructor(renderer, trackedImages) {
        super();
        this.renderer = renderer;
        this.trackedImages = trackedImages;

        /** @type {XRSession|null} */
        this.session = null;

        /** @type {XRReferenceSpace|null} */
        this.referenceSpace = null;

        /** @type {Map<number, string>} imageIndex → last known tracking state */
        this._lastTrackingStates = new Map();

        this._xrSupported = false;
    }

    /**
     * Check if WebXR with image tracking is available.
     * @returns {Promise<boolean>}
     */
    async checkSupport() {
        if (!navigator.xr) {
            console.warn('[XRManager] WebXR not available.');
            return false;
        }

        try {
            this._xrSupported = await navigator.xr.isSessionSupported('immersive-ar');
        } catch (e) {
            this._xrSupported = false;
        }

        return this._xrSupported;
    }

    /**
     * Start the immersive-ar session with image tracking.
     * @returns {Promise<XRSession>}
     */
    async startSession() {
        if (!this._xrSupported) {
            throw new Error('WebXR immersive-ar not supported on this device.');
        }

        const sessionInit = {
            requiredFeatures: ['local'],
            optionalFeatures: ['image-tracking', 'light-estimation', 'dom-overlay'],
            trackedImages: this.trackedImages
        };

        // DOM overlay lets us keep our HUD visible in AR
        const overlay = document.getElementById('ar-overlay');
        if (overlay) {
            sessionInit.domOverlay = { root: overlay };
        }

        try {
            this.session = await navigator.xr.requestSession('immersive-ar', sessionInit);
        } catch (err) {
            console.error('[XRManager] Session request failed:', err);
            throw err;
        }

        this.session.addEventListener('end', () => {
            this._onSessionEnd();
        });

        // Bind to renderer
        await this.renderer.xr.setSession(this.session);
        this.renderer.xr.enabled = true;

        // Get reference space
        this.referenceSpace = await this.session.requestReferenceSpace('local');

        console.log('[XRManager] AR session started.');
        this.dispatchEvent(new Event('sessionstart'));

        return this.session;
    }

    /**
     * Process image tracking results each frame.
     * Called from the XR render loop.
     *
     * @param {XRFrame} frame
     */
    processFrame(frame) {
        if (!frame || !this.session) return;

        const results = frame.getImageTrackingResults?.();
        if (!results) return;

        for (const result of results) {
            const index = result.index;
            const state = result.trackingState; // 'tracked' | 'emulated'
            const prevState = this._lastTrackingStates.get(index);

            // Compute the pose relative to the reference space
            const pose = frame.getPose(result.imageSpace, this.referenceSpace);

            if (state === 'tracked' || state === 'emulated') {
                if (prevState !== 'tracked' && prevState !== 'emulated') {
                    // Newly found
                    this.dispatchEvent(new CustomEvent('trackingfound', {
                        detail: { index, pose, state, measuredWidth: result.measuredWidthInMeters }
                    }));
                } else {
                    // Still tracking — update pose
                    this.dispatchEvent(new CustomEvent('trackingupdate', {
                        detail: { index, pose, state }
                    }));
                }
            } else {
                if (prevState === 'tracked' || prevState === 'emulated') {
                    // Just lost
                    this.dispatchEvent(new CustomEvent('trackinglost', {
                        detail: { index }
                    }));
                }
            }

            this._lastTrackingStates.set(index, state);
        }
    }

    /**
     * End the current XR session.
     */
    async endSession() {
        if (this.session) {
            await this.session.end();
        }
    }

    _onSessionEnd() {
        this.session = null;
        this.referenceSpace = null;
        this._lastTrackingStates.clear();
        this.renderer.xr.enabled = false;

        console.log('[XRManager] AR session ended.');
        this.dispatchEvent(new Event('sessionend'));
    }
}
