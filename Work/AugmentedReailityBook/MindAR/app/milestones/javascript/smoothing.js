(function () {
  const THREE = window.THREE || (window.MINDAR && window.MINDAR.IMAGE && window.MINDAR.IMAGE.THREE);

  window.PoseSmoothing = class PoseSmoothing {
    /**
     * @param {object} options
     * @param {number} options.deadzonePosition  - Min distance (meters) to trigger position update
     * @param {number} options.deadzoneRotation  - Min angle (radians) to trigger rotation update
     * @param {number} options.lerpAlpha         - Lerp factor per frame (0–1). Lower = smoother.
     */
    constructor({
      deadzonePosition = 0.005,
      deadzoneRotation = 0.01,
      lerpAlpha = 0.1
    } = {}) {
      this.deadzonePosition = deadzonePosition;
      this.deadzoneRotation = deadzoneRotation;
      this.lerpAlpha = lerpAlpha;

      this._smoothedPosition = new THREE.Vector3();
      this._smoothedQuaternion = new THREE.Quaternion();
      this._initialized = false;

      this._tmpVec = new THREE.Vector3();
    }

    reset() {
      this._initialized = false;
    }

    update(rawPosition, rawQuaternion, target) {
      if (!this._initialized) {
        this._smoothedPosition.copy(rawPosition);
        this._smoothedQuaternion.copy(rawQuaternion);
        this._initialized = true;
        target.position.copy(rawPosition);
        target.quaternion.copy(rawQuaternion);
        return;
      }

      this._tmpVec.subVectors(rawPosition, this._smoothedPosition);
      const posDelta = this._tmpVec.length();

      if (posDelta > this.deadzonePosition) {
        this._smoothedPosition.lerp(rawPosition, this.lerpAlpha);
      }

      const rotDelta = this._smoothedQuaternion.angleTo(rawQuaternion);

      if (rotDelta > this.deadzoneRotation) {
        this._smoothedQuaternion.slerp(rawQuaternion, this.lerpAlpha);
      }

      target.position.copy(this._smoothedPosition);
      target.quaternion.copy(this._smoothedQuaternion);
    }
  }
})();
