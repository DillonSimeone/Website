/**
 * grassStudy/js/lab_camera.js — Raycast-Grounded Orbit, Pan, Fly & Touch Camera
 *
 * Raycasts downward onto the active terrain mesh when spawning, resetting,
 * randomizing terrain, panning, or flying so the camera never starts or drops
 * beneath the ground.
 */
import * as THREE from 'three';
import { raycastGroundHeight } from '../../shared/terrain.js';

export class LabCamera {
    constructor({ canvas, camera, getTerrainMesh, getTerrainState, onFreeCamera }) {
        this.canvas = canvas;
        this.camera = camera;
        this.getTerrainMesh = getTerrainMesh;
        this.getTerrainState = getTerrainState;
        this.onFreeCamera = onFreeCamera || null;

        this.raycaster = new THREE.Raycaster();
        this.target = new THREE.Vector3(0, 1.5, 0);
        this.yaw = 0.0;
        this.pitch = 0.28;
        this.dist = 14.0;
        this.followPlayer = false;

        this.isDraggingOrbit = false;
        this.isDraggingPan = false;
        this.prevMouseX = 0;
        this.prevMouseY = 0;
        this.keysDown = {};

        // Touch tracking
        this.activeTouches = new Map();
        this.prevPinchDist = 0;
        this.prevTouchMid = { x: 0, y: 0 };
        this.lastTapTime = 0;

        this._bindEvents();
    }

    _sampleGroundY(x, z) {
        const mesh = this.getTerrainMesh ? this.getTerrainMesh() : null;
        const st = this.getTerrainState ? this.getTerrainState() : { relief: 1.0, offsetX: 0, offsetZ: 0 };
        return raycastGroundHeight(this.raycaster, mesh, x, z, st.relief, 600.0, st.offsetX, st.offsetZ).y;
    }

    groundToTerrain(targetX = this.target.x, targetZ = this.target.z, clearance = 1.2) {
        const groundY = this._sampleGroundY(targetX, targetZ);
        this.target.set(targetX, groundY + clearance, targetZ);
        this.updateOrbit();
    }

    resetCamera(followPos = null) {
        this.yaw = 0.0;
        this.pitch = 0.28;
        this.dist = 14.0;
        if (followPos) {
            this.target.set(followPos.x, followPos.y + 0.9, followPos.z);
            this.updateOrbit();
        } else {
            this.groundToTerrain(0, 0, 1.2);
        }
    }

    setFollowPlayer(enabled, playerPos = null) {
        this.followPlayer = !!enabled;
        if (this.followPlayer && playerPos) {
            this.target.set(playerPos.x, playerPos.y + 0.9, playerPos.z);
            this.updateOrbit();
        }
    }

    updateOrbit() {
        if (!this.camera) return;
        const cx = this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist;
        const cy = this.target.y + Math.sin(this.pitch) * this.dist;
        const cz = this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist;

        const camGroundY = this._sampleGroundY(cx, cz);
        const safeY = Math.max(cy, camGroundY + 0.75);

        this.camera.position.set(cx, safeY, cz);
        this.camera.lookAt(this.target);
    }

    _markManualControl() {
        if (this.followPlayer) {
            this.followPlayer = false;
            if (this.onFreeCamera) this.onFreeCamera();
        }
    }

    _panByDelta(dx, dy) {
        const panSpeed = this.dist * 0.0018;
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);
        const fwdX = -Math.sin(this.yaw);
        const fwdZ = -Math.cos(this.yaw);

        this.target.x -= (rightX * dx - fwdX * dy * Math.sin(this.pitch)) * panSpeed;
        this.target.z -= (rightZ * dx - fwdZ * dy * Math.sin(this.pitch)) * panSpeed;
        this.target.y += dy * Math.cos(this.pitch) * panSpeed;

        const minTargetY = this._sampleGroundY(this.target.x, this.target.z) + 0.45;
        if (this.target.y < minTargetY) this.target.y = minTargetY;
        this.updateOrbit();
    }

    _bindEvents() {
        const canvas = this.canvas;
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        canvas.addEventListener('mousedown', e => {
            if (e.button === 2 || e.button === 1 || e.shiftKey || e.altKey) {
                this.isDraggingPan = true;
            } else if (e.button === 0) {
                this.isDraggingOrbit = true;
            }
            this.prevMouseX = e.clientX;
            this.prevMouseY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            this.isDraggingOrbit = false;
            this.isDraggingPan = false;
        });

        window.addEventListener('mousemove', e => {
            if (!this.isDraggingOrbit && !this.isDraggingPan) return;
            const dx = e.clientX - this.prevMouseX;
            const dy = e.clientY - this.prevMouseY;
            this.prevMouseX = e.clientX;
            this.prevMouseY = e.clientY;

            if (this.isDraggingOrbit) {
                this.yaw += dx * 0.007;
                this.pitch = Math.max(-0.08, Math.min(1.45, this.pitch + dy * 0.007));
                this.updateOrbit();
            } else if (this.isDraggingPan) {
                this._markManualControl();
                this._panByDelta(dx, dy);
            }
        });

        canvas.addEventListener('wheel', e => {
            this.dist = Math.max(0.6, Math.min(650, this.dist + e.deltaY * 0.035 * (this.dist * 0.08 + 0.5)));
            this.updateOrbit();
        }, { passive: true });

        // Multi-touch Orbit (1 finger), Pinch Zoom & Pan (2 fingers), Double-tap Reset
        canvas.addEventListener('touchstart', e => {
            for (const t of e.changedTouches) {
                this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
            }
            if (e.touches.length === 1) {
                const now = performance.now();
                if (now - this.lastTapTime < 280) {
                    this.resetCamera();
                }
                this.lastTapTime = now;
                this.prevMouseX = e.touches[0].clientX;
                this.prevMouseY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                this.prevPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
                this.prevTouchMid = {
                    x: (t0.clientX + t1.clientX) * 0.5,
                    y: (t0.clientY + t1.clientY) * 0.5
                };
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1) {
                const t = e.touches[0];
                const dx = t.clientX - this.prevMouseX;
                const dy = t.clientY - this.prevMouseY;
                this.prevMouseX = t.clientX;
                this.prevMouseY = t.clientY;
                this.yaw += dx * 0.008;
                this.pitch = Math.max(-0.08, Math.min(1.45, this.pitch + dy * 0.008));
                this.updateOrbit();
            } else if (e.touches.length === 2) {
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                const curDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
                const curMid = {
                    x: (t0.clientX + t1.clientX) * 0.5,
                    y: (t0.clientY + t1.clientY) * 0.5
                };

                if (this.prevPinchDist > 1) {
                    const zoomFactor = this.prevPinchDist / Math.max(10, curDist);
                    this.dist = Math.max(0.8, Math.min(650, this.dist * zoomFactor));
                }

                const dx = curMid.x - this.prevTouchMid.x;
                const dy = curMid.y - this.prevTouchMid.y;
                this._markManualControl();
                this._panByDelta(dx, dy);

                this.prevPinchDist = curDist;
                this.prevTouchMid = curMid;
            }
        }, { passive: false });

        const endTouch = e => {
            for (const t of e.changedTouches) {
                this.activeTouches.delete(t.identifier);
            }
            if (e.touches.length === 1) {
                this.prevMouseX = e.touches[0].clientX;
                this.prevMouseY = e.touches[0].clientY;
            }
        };
        canvas.addEventListener('touchend', endTouch);
        canvas.addEventListener('touchcancel', endTouch);

        window.addEventListener('keydown', e => {
            if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            this.keysDown[e.code] = true;
        });
        window.addEventListener('keyup', e => {
            this.keysDown[e.code] = false;
        });
    }

    update(dt, simPlayerPos = null, simPlayerActive = false) {
        const moveSpeed = ((this.keysDown['ShiftLeft'] || this.keysDown['ShiftRight']) ? 80.0 : 28.0) * dt;
        let moved = false;

        const forwardX = -Math.sin(this.yaw);
        const forwardZ = -Math.cos(this.yaw);
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);

        if (this.keysDown['KeyW'] || this.keysDown['ArrowUp']) {
            this.target.x += forwardX * moveSpeed;
            this.target.z += forwardZ * moveSpeed;
            moved = true;
        }
        if (this.keysDown['KeyS'] || this.keysDown['ArrowDown']) {
            this.target.x -= forwardX * moveSpeed;
            this.target.z -= forwardZ * moveSpeed;
            moved = true;
        }
        if (this.keysDown['KeyA'] || this.keysDown['ArrowLeft']) {
            this.target.x -= rightX * moveSpeed;
            this.target.z -= rightZ * moveSpeed;
            moved = true;
        }
        if (this.keysDown['KeyD'] || this.keysDown['ArrowRight']) {
            this.target.x += rightX * moveSpeed;
            this.target.z += rightZ * moveSpeed;
            moved = true;
        }
        if (this.keysDown['KeyE'] || this.keysDown['KeyR']) {
            this.target.y += moveSpeed * 0.7;
            moved = true;
        }
        if (this.keysDown['KeyQ'] || this.keysDown['KeyF']) {
            this.target.y -= moveSpeed * 0.7;
            moved = true;
        }

        if (moved) {
            this._markManualControl();
            const minH = this._sampleGroundY(this.target.x, this.target.z) + 0.45;
            if (this.target.y < minH) this.target.y = minH;
            this.updateOrbit();
        } else if (simPlayerActive && simPlayerPos && this.followPlayer && !this.isDraggingOrbit && !this.isDraggingPan) {
            const alpha = Math.min(1.0, dt * 5.0);
            this.target.x += (simPlayerPos.x - this.target.x) * alpha;
            this.target.y += ((simPlayerPos.y + 0.9) - this.target.y) * alpha;
            this.target.z += (simPlayerPos.z - this.target.z) * alpha;
            this.updateOrbit();
        }
    }
}
