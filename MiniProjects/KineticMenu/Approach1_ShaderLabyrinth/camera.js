// camera.js — Spline-based camera rail with origin-point resets and per-pose keyframe sequences.
import * as THREE from 'three';

export class CameraRail {
    constructor(camera, originPoint) {
        this.camera = camera;
        this.origin = new THREE.Vector3(...originPoint.pos);
        this.originLookAt = new THREE.Vector3(...originPoint.lookAt);

        // State machine: IDLE | TO_ORIGIN | SEQUENCE
        this.state = 'IDLE';
        this.currentPoseIndex = -1;
        this.targetPoseIndex = -1;

        // Transition interpolation
        this.startPos = new THREE.Vector3();
        this.endPos = new THREE.Vector3();
        this.startLookAt = new THREE.Vector3(0, 0, 0);
        this.endLookAt = new THREE.Vector3(0, 0, 0);
        this.currentLookAt = new THREE.Vector3(0, 0, 0);
        this.progress = 0;
        this.duration = 1.0;

        // Pose sequence
        this.sequence = [];
        this.seqIndex = 0;

        // Idle state
        this.idleTime = 0;
        this.basePos = new THREE.Vector3().copy(this.origin);
        this.baseLookAt = new THREE.Vector3().copy(this.originLookAt);

        // Mouse parallax
        this.mouseX = 0;
        this.mouseY = 0;

        // Velocity tracking (for shader reactivity)
        this.velocity = 0;
        this._prevPos = new THREE.Vector3().copy(camera.position);

        // Callbacks
        this.onSequenceComplete = null;
        this.onPoseReady = null;

        // Place camera at origin
        camera.position.copy(this.origin);
        camera.lookAt(this.originLookAt);
    }

    goToPose(poseIndex, poseConfig) {
        this.targetPoseIndex = poseIndex;
        this.sequence = poseConfig.cameraSequence;
        this.seqIndex = 0;

        // Transition to origin first
        this.state = 'TO_ORIGIN';
        this.startPos.copy(this.camera.position);
        this.endPos.copy(this.origin);
        this.startLookAt.copy(this.currentLookAt);
        this.endLookAt.copy(this.originLookAt);
        this.progress = 0;
        this.duration = 0.6; // Faster reset to origin

        return true;
    }

    update(dt) {
        this._prevPos.copy(this.camera.position);

        switch (this.state) {
            case 'TO_ORIGIN':
                this._transition(dt, () => {
                    this.state = 'SEQUENCE';
                    if (this.onPoseReady) this.onPoseReady(this.targetPoseIndex);
                    this._nextStep();
                });
                break;

            case 'SEQUENCE':
                this._transition(dt, () => {
                    this.seqIndex++;
                    if (this.seqIndex < this.sequence.length) {
                        this._nextStep();
                    } else {
                        // Sequence complete — enter idle at final position
                        this.state = 'IDLE';
                        this.currentPoseIndex = this.targetPoseIndex;
                        this.basePos.copy(this.camera.position);
                        const last = this.sequence[this.sequence.length - 1];
                        this.baseLookAt.set(...last.lookAt);
                        this.currentLookAt.copy(this.baseLookAt);
                        this.idleTime = 0;
                        if (this.onSequenceComplete) this.onSequenceComplete(this.currentPoseIndex);
                    }
                });
                break;

            case 'IDLE':
                this._idle(dt);
                break;
        }

        this.velocity = this.camera.position.distanceTo(this._prevPos) / Math.max(dt, 0.001);
    }

    _nextStep() {
        const step = this.sequence[this.seqIndex];

        // Handle jumpToRandomCube — target will be overridden externally
        this.startPos.copy(this.camera.position);
        this.endPos.set(...step.pos);
        this.startLookAt.copy(this.currentLookAt);
        this.endLookAt.set(...step.lookAt);
        this.progress = 0;
        this.duration = step.duration || 1.0;
    }

    // Override the current sequence step's target (for jumpToRandomCube)
    overrideTarget(pos, lookAt) {
        this.endPos.copy(pos);
        this.endLookAt.copy(lookAt);
    }

    _transition(dt, onDone) {
        this.progress += dt / this.duration;
        const t = Math.min(this.progress, 1.0);
        const e = this._easeInOut(t);

        this.camera.position.lerpVectors(this.startPos, this.endPos, e);
        this.currentLookAt.lerpVectors(this.startLookAt, this.endLookAt, e);
        this.camera.lookAt(this.currentLookAt);

        if (t >= 1.0) onDone();
    }

    _idle(dt) {
        this.idleTime += dt;
        const dx = Math.sin(this.idleTime * 0.3) * 0.3 + this.mouseX * 0.8;
        const dy = Math.cos(this.idleTime * 0.2) * 0.2 + this.mouseY * 0.5;

        this.camera.position.set(
            this.basePos.x + dx,
            this.basePos.y + dy,
            this.basePos.z
        );
        this.camera.lookAt(this.baseLookAt);
        this.currentLookAt.copy(this.baseLookAt);
    }

    _easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    setMouse(nx, ny) {
        this.mouseX = nx;
        this.mouseY = ny;
    }

    get isIdle() {
        return this.state === 'IDLE';
    }

    get isTransitioning() {
        return this.state !== 'IDLE';
    }
}
