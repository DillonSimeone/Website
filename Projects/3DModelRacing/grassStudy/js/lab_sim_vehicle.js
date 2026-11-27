/**
 * grassStudy/js/lab_sim_vehicle.js — Simulated Hover Vehicle for Grass Trample Testing
 */
import * as THREE from 'three';
import { raycastGroundHeight } from '../../shared/terrain.js';

export class LabSimVehicle {
    constructor(scene, getTerrainMesh, getTerrainState) {
        this.scene = scene;
        this.getTerrainMesh = getTerrainMesh;
        this.getTerrainState = getTerrainState;
        this.raycaster = new THREE.Raycaster();

        this.active = false;
        this.speed = 24.0;
        this.position = new THREE.Vector3(0, 2, -260);
        this.vehiclePositions = Array.from({ length: 8 }, () => new THREE.Vector3(0, -999, 0));

        this.group = this._buildVehicleMesh();
        this.group.visible = false;
        this.scene.add(this.group);
    }

    _buildVehicleMesh() {
        const group = new THREE.Group();

        const hullGeo = new THREE.ConeGeometry(0.9, 3.6, 4);
        hullGeo.rotateY(Math.PI / 4);
        hullGeo.rotateX(Math.PI / 2);
        hullGeo.scale(1.15, 0.35, 1.0);
        const hullMat = new THREE.MeshStandardMaterial({
            color: 0x0ea5e9,
            metalness: 0.85,
            roughness: 0.25,
            emissive: 0x0369a1,
            emissiveIntensity: 0.2
        });
        const hull = new THREE.Mesh(hullGeo, hullMat);
        hull.position.y = 0.22;
        group.add(hull);

        const canopyGeo = new THREE.SphereGeometry(0.38, 16, 12);
        canopyGeo.scale(0.85, 0.55, 1.7);
        const canopyMat = new THREE.MeshStandardMaterial({
            color: 0x0a101d,
            metalness: 0.95,
            roughness: 0.08
        });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(0, 0.38, -0.2);
        group.add(canopy);

        const wingGeo = new THREE.BoxGeometry(2.3, 0.08, 0.85);
        const wingMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            metalness: 0.75,
            roughness: 0.3
        });
        const wing = new THREE.Mesh(wingGeo, wingMat);
        wing.position.set(0, 0.18, -0.65);
        group.add(wing);

        const finGeo = new THREE.BoxGeometry(0.06, 0.4, 0.75);
        const finL = new THREE.Mesh(finGeo, wingMat);
        finL.position.set(-1.15, 0.35, -0.65);
        const finR = finL.clone();
        finR.position.x = 1.15;
        group.add(finL, finR);

        const hlGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
        const hlL = new THREE.Mesh(hlGeo, hlMat);
        hlL.position.set(-0.4, 0.22, 1.55);
        const hlR = hlL.clone();
        hlR.position.x = 0.4;
        group.add(hlL, hlR);

        const thGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.35, 12);
        thGeo.rotateX(Math.PI / 2);
        const thMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const thL = new THREE.Mesh(thGeo, thMat);
        thL.position.set(-0.38, 0.20, -1.75);
        const thR = thL.clone();
        thR.position.x = 0.38;
        group.add(thL, thR);

        const shadowGeo = new THREE.PlaneGeometry(2.6, 4.4);
        shadowGeo.rotateX(-Math.PI / 2);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x020804,
            transparent: true,
            opacity: 0.55,
            depthWrite: false
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.position.y = -0.22;
        group.add(shadow);

        return group;
    }

    _groundY(x, z) {
        const mesh = this.getTerrainMesh ? this.getTerrainMesh() : null;
        const st = this.getTerrainState ? this.getTerrainState() : { relief: 1.0, offsetX: 0, offsetZ: 0 };
        return raycastGroundHeight(this.raycaster, mesh, x, z, st.relief, 600.0, st.offsetX, st.offsetZ).y;
    }

    toggle() {
        this.active = !this.active;
        if (this.active) {
            this.group.visible = true;
            this.position.set(0, this._groundY(0, -320) + 0.45, -320);
            this.vehiclePositions[0].copy(this.position);
        } else {
            this.group.visible = false;
            this.vehiclePositions[0].set(0, -999, 0);
        }
        return this.active;
    }

    update(dt) {
        if (!this.active) return;

        this.position.z += this.speed * dt;
        if (this.position.z > 420.0) {
            this.position.z = -420.0;
        }

        const curX = this.position.x;
        const curZ = this.position.z;
        const curH = this._groundY(curX, curZ);
        this.position.y = curH + 0.45;

        const lookDist = 2.2;
        const fwdH = this._groundY(curX, curZ + lookDist);
        const pitch = Math.atan2(fwdH - curH, lookDist);

        const latDist = 1.2;
        const rH = this._groundY(curX + latDist, curZ);
        const lH = this._groundY(curX - latDist, curZ);
        const roll = Math.atan2(lH - rH, latDist * 2.0) * 0.6;

        this.group.position.copy(this.position);
        this.group.rotation.set(-pitch, 0, roll, 'YXZ');
        this.vehiclePositions[0].copy(this.position);
    }

    destroy() {
        this.scene.remove(this.group);
    }
}
