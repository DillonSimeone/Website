import * as THREE from './three.module.js';

export class PoseSmoothing {
  /**
   * @param {object} options
   * @param {number} options.deadzonePosition  - Min distance (meters) to trigger position update
   * @param {number} options.deadzoneRotation  - Min angle (radians) to trigger rotation update
   * @param {number} options.lerpAlpha         - Lerp factor per frame (0–1). Lower = smoother.
   */
  constructor({
    deadzonePosition = 0.005,
    deadzoneRotation = 0.01,
    lerpAlpha = 0.1,
    jumpThreshold = 0.3,
    useJumpFilter = true
  } = {}) {
    this.deadzonePosition = deadzonePosition;
    this.deadzoneRotation = deadzoneRotation;
    this.lerpAlpha = lerpAlpha;
    this.jumpThreshold = jumpThreshold;
    this.useJumpFilter = useJumpFilter;

    // Smoothed state
    this._smoothedPosition = new THREE.Vector3();
    this._smoothedQuaternion = new THREE.Quaternion();
    this._initialized = false;

    // Scratch objects to avoid GC
    this._tmpVec = new THREE.Vector3();
  }

  /**
   * Reset the smoother (e.g. when switching pages or re-acquiring track)
   */
  reset() {
    this._initialized = false;
  }

  /**
   * Feed a raw tracked pose and get back the smoothed transforms.
   * Apply the result to your Object3D.
   *
   * @param {THREE.Vector3} rawPosition
   * @param {THREE.Quaternion} rawQuaternion
   * @param {THREE.Object3D} target - The 3D object to update in-place
   */
  update(rawPosition, rawQuaternion, target) {
    if (!this._initialized) {
      this._smoothedPosition.copy(rawPosition);
      this._smoothedQuaternion.copy(rawQuaternion);
      this._initialized = true;
      target.position.copy(rawPosition);
      target.quaternion.copy(rawQuaternion);
      return;
    }

    // --- Position deadzone + lerp ---
    this._tmpVec.subVectors(rawPosition, this._smoothedPosition);
    const posDelta = this._tmpVec.length();

    if (posDelta > this.deadzonePosition) {
      if (!this.useJumpFilter || posDelta < this.jumpThreshold) {
        this._smoothedPosition.lerp(rawPosition, this.lerpAlpha);
      } else {
        console.warn("PoseSmoothing: Ignored jump of", posDelta.toFixed(3));
      }
    }

    // --- Rotation deadzone + slerp ---
    const rotDelta = this._smoothedQuaternion.angleTo(rawQuaternion);

    if (rotDelta > this.deadzoneRotation) {
      this._smoothedQuaternion.slerp(rawQuaternion, this.lerpAlpha);
    }

    // Apply
    target.position.copy(this._smoothedPosition);
    target.quaternion.copy(this._smoothedQuaternion);
  }
}
