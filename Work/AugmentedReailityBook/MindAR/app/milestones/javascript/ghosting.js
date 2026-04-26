/**
 * ghosting.js — Tracking Loss Fade System
 *
 * When tracking is lost, the model doesn't vanish instantly.
 * Instead it gracefully fades out over a configurable duration.
 * If tracking is re-acquired during the fade, the fade cancels
 * and the model snaps back.
 */

(function () {
    window.GhostingSystem = class GhostingSystem {
        /**
         * @param {object} opts
         * @param {number} opts.fadeDuration - Seconds to fade out on tracking loss
         * @param {number} opts.fadeInDuration - Seconds to fade back in on re-acquire
         */
        constructor({ fadeDuration = 2.0, fadeInDuration = 0.4 } = {}) {
            this.fadeDuration = fadeDuration;
            this.fadeInDuration = fadeInDuration;

            this._activeTweens = new Map();
        }

        /**
         * Call when tracking is lost for a page.
         * Starts the fade-out countdown.
         *
         * @param {string} pageId
         * @param {THREE.Object3D} group - The anchor group to fade
         * @param {Function} onComplete - Called if the fade completes (model fully invisible)
         */
        onTrackingLost(pageId, group, onComplete) {
            this._killTween(pageId);

            const state = { opacity: group._opacity || 1 };

            const tween = gsap.to(state, {
                opacity: 0,
                duration: this.fadeDuration,
                ease: 'power2.in',
                onUpdate: () => {
                    group._opacity = state.opacity;
                    this._setOpacity(group, state.opacity);
                },
                onComplete: () => {
                    group.visible = false;
                    this._activeTweens.delete(pageId);
                    if (onComplete) onComplete();
                }
            });

            this._activeTweens.set(pageId, tween);
        }

        /**
         * Call when tracking is re-acquired.
         * Cancels any ongoing fade and brings the model back.
         *
         * @param {string} pageId
         * @param {THREE.Object3D} group
         */
        onTrackingFound(pageId, group) {
            this._killTween(pageId);

            group.visible = true;
            const state = { opacity: group._opacity || 0 };

            const tween = gsap.to(state, {
                opacity: 1,
                duration: this.fadeInDuration,
                ease: 'power2.out',
                onUpdate: () => {
                    group._opacity = state.opacity;
                    this._setOpacity(group, state.opacity);
                },
                onComplete: () => {
                    group._opacity = 1;
                    this._activeTweens.delete(pageId);
                }
            });

            this._activeTweens.set(pageId, tween);
        }

        /**
         * Recursively set opacity on all materials in a model hierarchy.
         * @param {THREE.Object3D} object
         * @param {number} opacity 0–1
         */
        _setOpacity(object, opacity) {
            object.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        mat.transparent = true;
                        mat.opacity = opacity;
                    });
                }
            });
        }

        _killTween(pageId) {
            const existing = this._activeTweens.get(pageId);
            if (existing) {
                existing.kill();
                this._activeTweens.delete(pageId);
            }
        }

        destroy() {
            this._activeTweens.forEach(t => t.kill());
            this._activeTweens.clear();
        }
    }
})();
