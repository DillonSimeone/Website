import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

/**
 * PropsManager — Trackside Scenery, Furniture & Dynamic Props
 * 
 * Manages street lamps, guardrails, chevrons, grandstands, billboards,
 * start gantry, overhead checkpoint bridge, boulders, wind turbines, and balloons.
 */
export class PropsManager {
    constructor(scene, trackData, trackCenter) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;

        this.streetLamps = [];
        this.turbines = [];
        this.balloons = [];
        this.lampPoolTex = null;

        this._initMaterials();
    }

    _initMaterials() {
        this.metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4d52, metalness: 0.7, roughness: 0.35 });
        this.yellowMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.5 });
        this.stoneMat = new THREE.MeshStandardMaterial({ color: 0x6c757d, roughness: 0.9, metalness: 0.1 });
        this.rockMat = new THREE.MeshStandardMaterial({
            roughness: 0.94,
            metalness: 0.08,
            vertexColors: true,
            flatShading: true
        });
        this.whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.4 });
        this.darkMat = new THREE.MeshStandardMaterial({ color: 0x212529 });
    }

    createStreetLamp(p, fwd, right, side, halfW) {
        const lamp = new THREE.Group();
        const curbPos = p.clone().add(right.clone().multiplyScalar(side * (halfW + 0.8)));
        lamp.position.copy(curbPos);

        const yaw = Math.atan2(-fwd.x, -fwd.z);
        lamp.rotation.set(0, yaw, 0);

        // Base plate sunk into earth
        const baseGeom = new THREE.CylinderGeometry(0.3, 0.42, 3.0, 12);
        const baseMesh = new THREE.Mesh(baseGeom, this.metalMat);
        baseMesh.position.y = -1.0;
        lamp.add(baseMesh);

        // 5.2m Pole
        const poleGeom = new THREE.CylinderGeometry(0.12, 0.18, 5.2, 12);
        const poleMesh = new THREE.Mesh(poleGeom, this.metalMat);
        poleMesh.position.y = 2.6;
        lamp.add(poleMesh);

        // Curved Overhang Arm reaching inward across the curb
        const reachX = -side * 1.5;
        const armGeom = new THREE.BoxGeometry(1.6, 0.12, 0.12);
        const armMesh = new THREE.Mesh(armGeom, this.metalMat);
        armMesh.position.set(reachX * 0.5, 5.15, 0);
        armMesh.rotation.z = -side * 0.22;
        lamp.add(armMesh);

        // Downward lantern fixture head
        const hoodGeom = new THREE.CylinderGeometry(0.38, 0.22, 0.35, 12);
        const hoodMesh = new THREE.Mesh(hoodGeom, this.metalMat);
        hoodMesh.position.set(reachX, 4.85, 0);
        lamp.add(hoodMesh);

        // Glowing Bulb Mesh
        const bulbGeom = new THREE.SphereGeometry(0.22, 12, 12);
        const bulbMat = new THREE.MeshStandardMaterial({
            color: 0xfff0c2,
            emissive: 0xffaa22,
            emissiveIntensity: 0.0
        });
        const bulbMesh = new THREE.Mesh(bulbGeom, bulbMat);
        bulbMesh.position.set(reachX, 4.72, 0);
        lamp.add(bulbMesh);

        // REAL Three.js PointLight with quadratic distance falloff
        const pointLight = new THREE.PointLight(0xffe299, 0.0, 36.0, 1.3);
        pointLight.position.set(reachX, 4.6, 0);
        lamp.add(pointLight);

        // Warm radial light pool on asphalt beneath lamp
        if (!this.lampPoolTex) {
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255, 230, 160, 0.85)');
            grad.addColorStop(0.35, 'rgba(255, 205, 110, 0.45)');
            grad.addColorStop(0.7, 'rgba(255, 175, 70, 0.12)');
            grad.addColorStop(1, 'rgba(255, 160, 50, 0.0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);
            this.lampPoolTex = new THREE.CanvasTexture(canvas);
        }

        const poolMat = new THREE.MeshBasicMaterial({
            map: this.lampPoolTex,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(10.0, 10.0), poolMat);
        poolMesh.rotation.x = -Math.PI / 2;
        poolMesh.position.set(reachX, 0.04, 0);
        lamp.add(poolMesh);

        this.scene.add(lamp);
        this.streetLamps.push({ bulb: bulbMat, light: pointLight, pool: poolMat });
    }

    createConnectedGuardrail(p0, p1, right0, right1, side, halfW, index) {
        const lp0 = p0.clone().add(right0.clone().multiplyScalar(side * (halfW + 0.65)));
        const lp1 = p1.clone().add(right1.clone().multiplyScalar(side * (halfW + 0.65)));

        const mid = lp0.clone().add(lp1).multiplyScalar(0.5);
        const dist = lp0.distanceTo(lp1);
        const dir = lp1.clone().sub(lp0).normalize();

        const yaw = Math.atan2(-dir.x, -dir.z);
        const horizDist = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
        const pitch = -Math.atan2(dir.y, horizDist);

        const col = (index % 2 === 0) ? 0xe52521 : 0xf8f9fa;
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 });

        // Barrier Beam aligned with segment
        const beamGeom = new THREE.BoxGeometry(0.18, 0.45, dist + 0.08);
        const beam = new THREE.Mesh(beamGeom, mat);
        beam.position.copy(mid).add(new THREE.Vector3(0, 0.55, 0));
        beam.rotation.set(pitch, yaw, 0, 'YXZ');
        this.scene.add(beam);

        // Vertical Post sunk into earth at node 0
        const postGeom = new THREE.BoxGeometry(0.12, 3.8, 0.12);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4d52 });
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.copy(lp0).add(new THREE.Vector3(0, -1.1, 0));
        this.scene.add(post);
    }

    createChevronSign(p, fwd, right, side, halfW) {
        const sign = new THREE.Group();
        const pos = p.clone().add(right.clone().multiplyScalar(side * (halfW + 2.2))).add(new THREE.Vector3(0, 1.2, 0));
        sign.position.copy(pos);

        const yaw = Math.atan2(-fwd.x, -fwd.z);
        sign.rotation.set(0, yaw, 0);

        const boardY = 1.0;
        const boardHeight = 1.0;
        const boardBottom = boardY - boardHeight * 0.5; // 0.5m

        // Support posts: stop flush at bottom of sign board
        const postBottom = -2.5;
        const postHeight = boardBottom - postBottom;
        const postCenterY = (boardBottom + postBottom) * 0.5;

        for (const px of [-0.65, 0.65]) {
            const pMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, postHeight, 0.12), this.metalMat);
            pMesh.position.set(px, postCenterY, 0);
            sign.add(pMesh);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 74px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(side > 0 ? '>>>' : '<<<', 128, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, boardHeight, 0.1), this.yellowMat);
        board.position.set(0, boardY, 0);
        sign.add(board);

        const front = new THREE.Mesh(new THREE.PlaneGeometry(1.95, boardHeight - 0.05), new THREE.MeshBasicMaterial({ map: tex }));
        front.position.set(0, boardY, 0.06);
        sign.add(front);

        this.scene.add(sign);
    }

    createDistanceMarker(p, fwd, right, side, halfW, text) {
        const marker = new THREE.Group();
        marker.position.copy(p.clone().add(right.clone().multiplyScalar(side * (halfW + 1.8))).add(new THREE.Vector3(0, 0.9, 0)));

        const yaw = Math.atan2(-fwd.x, -fwd.z);
        marker.rotation.set(0, yaw, 0);

        const boardY = 0.7;
        const boardHeight = 0.8;
        const boardBottom = boardY - boardHeight * 0.5;

        const postBottom = -2.2;
        const postHeight = boardBottom - postBottom;
        const postCenterY = (boardBottom + postBottom) * 0.5;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, postHeight, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a4d52 }));
        post.position.set(0, postCenterY, 0);
        marker.add(post);

        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#081426';
        ctx.fillRect(0, 0, 256, 128);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 248, 120);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 58px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, boardHeight), new THREE.MeshBasicMaterial({ map: tex }));
        board.position.set(0, boardY, 0.02);
        marker.add(board);

        this.scene.add(marker);
    }

    createGrandstand(p, fwd, right, side, halfW) {
        const stand = new THREE.Group();
        stand.position.copy(p.clone().add(right.clone().multiplyScalar(side * (halfW + 6.0))));

        const yaw = Math.atan2(-fwd.x, -fwd.z);
        stand.rotation.set(0, yaw, 0);

        const woodMat = new THREE.MeshStandardMaterial({ color: 0xb88855, roughness: 0.8 });
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0xe52521, roughness: 0.4 });
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a4e54 });

        // Foundation posts
        for (let k = 0; k < 4; k++) {
            const pGeom = new THREE.CylinderGeometry(0.18, 0.25, 6.0, 8);
            const pillar = new THREE.Mesh(pGeom, steelMat);
            pillar.position.set((k % 2) * 2.5 * side, -1.5, Math.floor(k / 2) * 8.0 - 4.0);
            stand.add(pillar);
        }

        // 3 Tiers of benches with fans
        for (let tier = 0; tier < 3; tier++) {
            const bGeom = new THREE.BoxGeometry(1.4, 0.4, 10.0);
            const bench = new THREE.Mesh(bGeom, woodMat);
            bench.position.set(tier * 1.2 * side, tier * 0.75 + 0.35, 0);
            stand.add(bench);

            for (let fan = 0; fan < 6; fan++) {
                const fanGeom = new THREE.SphereGeometry(0.28, 8, 8);
                const fanCols = [0xe52521, 0x2196f3, 0xf1c40f, 0x2ecc71, 0x9b59b6];
                const fMat = new THREE.MeshBasicMaterial({ color: fanCols[(tier * 6 + fan) % fanCols.length] });
                const fMesh = new THREE.Mesh(fanGeom, fMat);
                fMesh.position.set(tier * 1.2 * side, tier * 0.75 + 0.85, (fan - 2.5) * 1.6);
                stand.add(fMesh);
            }
        }

        // Canopy Roof
        const roofGeom = new THREE.BoxGeometry(4.8, 0.2, 10.5);
        const roof = new THREE.Mesh(roofGeom, canopyMat);
        roof.position.set(1.2 * side, 3.8, 0);
        roof.rotation.z = -side * 0.18;
        stand.add(roof);

        this.scene.add(stand);
    }

    createBillboard(p, fwd, right, side, halfW, text) {
        const board = new THREE.Group();
        board.position.copy(p.clone().add(right.clone().multiplyScalar(side * (halfW + 3.8))));

        const yaw = Math.atan2(-fwd.x, -fwd.z);
        board.rotation.set(0, yaw, 0);

        const boardY = 3.2;
        const boardHeight = 1.6;
        const boardBottom = boardY - boardHeight * 0.5;

        const postBottom = -2.8;
        const postHeight = boardBottom - postBottom;
        const postCenterY = (boardBottom + postBottom) * 0.5;

        for (const px of [-1.5, 1.5]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, postHeight, 0.18), this.metalMat);
            post.position.set(px, postCenterY, 0);
            board.add(post);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 160;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#081426';
        ctx.fillRect(0, 0, 512, 160);
        ctx.strokeStyle = '#ffd21e';
        ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, 500, 148);
        ctx.fillStyle = '#ffd21e';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 80);

        const tex = new THREE.CanvasTexture(canvas);
        const signMesh = new THREE.Mesh(new THREE.BoxGeometry(4.0, boardHeight, 0.15), new THREE.MeshBasicMaterial({ map: tex }));
        signMesh.position.set(0, boardY, 0);
        board.add(signMesh);

        this.scene.add(board);
    }

    createStartGantry(pos, dir, right, width) {
        const gantry = new THREE.Group();
        gantry.position.copy(pos);

        const yaw = Math.atan2(-dir.x, -dir.z);
        gantry.rotation.set(0, yaw, 0);

        const redMat = new THREE.MeshStandardMaterial({ color: 0xe52521, roughness: 0.3 });
        const half = width * 0.5 + 0.9;

        // Vertical Pillars
        for (const side of [-1, 1]) {
            const postGeom = new THREE.BoxGeometry(0.45, 8.0, 0.45);
            const post = new THREE.Mesh(postGeom, redMat);
            post.position.set(side * half, 1.8, 0);
            gantry.add(post);
        }

        // Horizontal Bridge Beam
        const beamGeom = new THREE.BoxGeometry(half * 2.0, 0.5, 0.5);
        const beam = new THREE.Mesh(beamGeom, redMat);
        beam.position.set(0, 5.6, 0);
        gantry.add(beam);

        // Checkered Start Banner
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, 512, 128);
        ctx.fillStyle = '#ffffff';
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 16; x++) {
                if ((x + y) % 2 === 0) ctx.fillRect(x * 32, y * 32, 32, 32);
            }
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(40, 24, 432, 80);
        ctx.fillStyle = '#00f2fe';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★ START / FINISH ★', 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 1.8), new THREE.MeshBasicMaterial({ map: tex }));
        banner.position.set(0, 6.7, 0);
        gantry.add(banner);

        // 4 Start Lights
        for (let lit = 0; lit < 4; lit++) {
            const lightMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 12, 12),
                new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 1.5 })
            );
            lightMesh.position.set((lit - 1.5) * 1.2, 5.0, 0.28);
            gantry.add(lightMesh);
        }

        this.scene.add(gantry);
    }

    setupOverheadTrussBridge() {
        const { points, tangents, binormals } = this.trackData;
        const n = points.length;
        const midIdx = Math.floor(n * 0.42);
        const p = points[midIdx];
        const fwd = tangents[midIdx];

        const bridge = new THREE.Group();
        bridge.position.copy(p);
        const yaw = Math.atan2(-fwd.x, -fwd.z);
        bridge.rotation.set(0, yaw, 0);

        const steelMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8, roughness: 0.3 });
        const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.4 });
        const spanW = 14.5;

        // Dual Vertical Lattice Towers
        for (const side of [-1, 1]) {
            const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10.5, 1.2), steelMat);
            tower.position.set(side * (spanW * 0.5), 3.2, 0);
            bridge.add(tower);

            const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 5.0, 8), steelMat);
            base.position.set(side * (spanW * 0.5), -1.5, 0);
            bridge.add(base);
        }

        // Horizontal Bridge Truss Beam
        const truss = new THREE.Mesh(new THREE.BoxGeometry(spanW + 1.2, 1.4, 1.4), steelMat);
        truss.position.set(0, 7.8, 0);
        bridge.add(truss);

        // Electronic Sector Timing Board
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#050c18';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, 500, 116);
        ctx.fillStyle = '#00f2fe';
        ctx.font = 'bold 46px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡ SECTOR 2 CHECKPOINT ⚡', 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 2.2), new THREE.MeshBasicMaterial({ map: tex }));
        sign.position.set(0, 7.8, 0.75);
        bridge.add(sign);

        for (const side of [-1, 1]) {
            const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.2, 8), orangeMat);
            brace.position.set(side * (spanW * 0.38), 6.5, 0);
            brace.rotation.z = side * 0.72;
            bridge.add(brace);
        }

        this.scene.add(bridge);
    }

    /**
     * Generates an organically deformed, faceted boulder with multi-tone vertex colors:
     * - Top surfaces: Highland moss and lichen
     * - Sides: Stratified granite and weathered mineral grain
     * - Underside: Wet shaded bedrock
     */
    _createDeformedRockGeometry(radius, detail = 1, pseudoRand) {
        const geom = new THREE.DodecahedronGeometry(radius, detail);
        const pos = geom.attributes.position;
        const v = new THREE.Vector3();
        const colors = new Float32Array(pos.count * 3);

        const seed1 = pseudoRand() * 20.0;
        const seed2 = pseudoRand() * 20.0;

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const n = v.clone().normalize();

            // Multi-frequency angular displacement
            const disp = Math.sin(v.x * 1.6 + seed1) * Math.cos(v.z * 1.6 + seed2) * 0.26
                       + Math.sin(v.y * 2.2 + seed1 * 1.4) * 0.16;
            v.addScaledVector(n, disp * radius);

            // Geological flattening: heavy, stable base
            v.y *= 0.68;
            if (v.y < 0) v.y *= 0.62; // flat bottom rests firmly on ground

            pos.setXYZ(i, v.x, v.y, v.z);

            // Natural vertex coloration
            const normY = n.y;
            let r, g, b;

            if (normY > 0.42 && v.y > -0.15) {
                // Alpine lichen & highland moss
                const mossBlend = Math.min(1.0, (normY - 0.42) / 0.58);
                r = THREE.MathUtils.lerp(0.36, 0.22, mossBlend) + (pseudoRand() - 0.5) * 0.04;
                g = THREE.MathUtils.lerp(0.42, 0.48, mossBlend) + (pseudoRand() - 0.5) * 0.04;
                b = THREE.MathUtils.lerp(0.30, 0.18, mossBlend) + (pseudoRand() - 0.5) * 0.03;
            } else if (v.y < -0.32) {
                // Wet shaded earth & dark bedrock
                r = 0.18 + (pseudoRand() - 0.5) * 0.03;
                g = 0.20 + (pseudoRand() - 0.5) * 0.03;
                b = 0.22 + (pseudoRand() - 0.5) * 0.03;
            } else {
                // Stratified weathered granite & warm stone strata
                const strata = Math.sin(v.y * 3.8 + seed1) * 0.06;
                r = 0.42 + strata + (pseudoRand() - 0.5) * 0.04;
                g = 0.44 + strata + (pseudoRand() - 0.5) * 0.04;
                b = 0.46 + strata + (pseudoRand() - 0.5) * 0.04;
            }

            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geom.computeVertexNormals();
        return geom;
    }

    setupFieldBoulders() {
        const { points } = this.trackData;
        const cx = this.trackCenter.x;
        const cz = this.trackCenter.z;

        let seed = 1337;
        const pseudoRand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        // 55 Natural Geological Outcroppings across hills and plains
        for (let i = 0; i < 55; i++) {
            const angle = pseudoRand() * Math.PI * 2;
            const dist = 55 + pseudoRand() * 280;
            const bx = cx + Math.cos(angle) * dist;
            const bz = cz + Math.sin(angle) * dist;

            let minDist = Infinity;
            for (let k = 0; k < points.length; k += 4) {
                const d = Math.hypot(bx - points[k].x, bz - points[k].z);
                if (d < minDist) minDist = d;
            }

            if (minDist > 16.0) {
                const outcropping = new THREE.Group();
                const by = getTerrainHeight(bx, bz);
                outcropping.position.set(bx, by, bz);

                const scale = 1.6 + pseudoRand() * 2.4;

                // 1. Primary Monolithic Anchor Boulder
                const mainGeom = this._createDeformedRockGeometry(scale, 1, pseudoRand);
                const mainRock = new THREE.Mesh(mainGeom, this.rockMat);
                mainRock.rotation.set(pseudoRand() * 0.3, pseudoRand() * Math.PI * 2, pseudoRand() * 0.3);
                outcropping.add(mainRock);

                // 2. Secondary Angular Companion Rock nestled beside it
                const compScale = scale * (0.50 + pseudoRand() * 0.22);
                const compGeom = this._createDeformedRockGeometry(compScale, 1, pseudoRand);
                const compRock = new THREE.Mesh(compGeom, this.rockMat);
                const compAngle = pseudoRand() * Math.PI * 2;
                const compDist = scale * 0.85;
                compRock.position.set(
                    Math.cos(compAngle) * compDist,
                    -0.15 * scale,
                    Math.sin(compAngle) * compDist
                );
                compRock.rotation.set(pseudoRand() * 0.4, pseudoRand() * Math.PI * 2, pseudoRand() * 0.4);
                outcropping.add(compRock);

                // 3. Small Jagged Scree Stones scattered around apron
                const screeCount = 2 + Math.floor(pseudoRand() * 3);
                for (let s = 0; s < screeCount; s++) {
                    const screeScale = scale * (0.20 + pseudoRand() * 0.14);
                    const screeGeom = this._createDeformedRockGeometry(screeScale, 1, pseudoRand);
                    const screeRock = new THREE.Mesh(screeGeom, this.rockMat);
                    const sAngle = pseudoRand() * Math.PI * 2;
                    const sDist = scale * (1.1 + pseudoRand() * 0.7);
                    screeRock.position.set(
                        Math.cos(sAngle) * sDist,
                        -0.2 * scale,
                        Math.sin(sAngle) * sDist
                    );
                    screeRock.rotation.set(pseudoRand() * Math.PI, pseudoRand() * Math.PI, pseudoRand() * Math.PI);
                    outcropping.add(screeRock);
                }

                this.scene.add(outcropping);
            }
        }
    }

    setupWindTurbines() {
        const { points } = this.trackData;
        const cx = this.trackCenter.x;
        const cz = this.trackCenter.z;

        const turbinePositions = [
            { x: cx - 240, z: cz - 180 },
            { x: cx + 260, z: cz - 280 },
            { x: cx - 120, z: cz + 290 }
        ];

        for (const pos of turbinePositions) {
            let minDist = Infinity;
            for (let i = 0; i < points.length; i += 4) {
                const d = Math.hypot(pos.x - points[i].x, pos.z - points[i].z);
                if (d < minDist) minDist = d;
            }
            if (minDist < 35.0) continue;

            const turbine = new THREE.Group();
            const ty = getTerrainHeight(pos.x, pos.z);
            turbine.position.set(pos.x, ty, pos.z);

            const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.0, 38.0, 16), this.whiteMat);
            tower.position.y = 19.0;
            turbine.add(tower);

            const nacelle = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 5.8), this.whiteMat);
            nacelle.position.set(0, 38.0, 0);
            turbine.add(nacelle);

            const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), beaconMat);
            beacon.position.set(0, 39.4, 0);
            turbine.add(beacon);

            const rotor = new THREE.Group();
            rotor.position.set(0, 38.0, 3.2);

            const hub = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 16), this.darkMat);
            hub.rotation.x = Math.PI / 2;
            rotor.add(hub);

            for (let b = 0; b < 3; b++) {
                const bladeAngle = (b / 3) * Math.PI * 2;
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 16.5, 0.12), this.whiteMat);
                blade.position.set(Math.sin(bladeAngle) * 8.5, Math.cos(bladeAngle) * 8.5, 0);
                blade.rotation.z = -bladeAngle;
                rotor.add(blade);
            }

            turbine.add(rotor);
            this.scene.add(turbine);
            this.turbines.push({ rotor, beacon: beaconMat });
        }
    }

    setupHotAirBalloons() {
        const balloons = [
            { pos: new THREE.Vector3(-220, 85, -220), color: 0xe52521, seed: 1.2 },
            { pos: new THREE.Vector3(280, 105, -420), color: 0x2196f3, seed: 2.7 },
            { pos: new THREE.Vector3(-190, 90, -620), color: 0xff6f00, seed: 4.1 },
            { pos: new THREE.Vector3(220, 115, -780), color: 0x9b59b6, seed: 5.6 }
        ];

        for (const b of balloons) {
            const group = new THREE.Group();
            group.position.copy(b.pos);

            const envGeom = new THREE.SphereGeometry(7.0, 16, 16);
            envGeom.scale(1.0, 1.35, 1.0);
            const envMesh = new THREE.Mesh(envGeom, new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.5 }));
            group.add(envMesh);

            const basketGeom = new THREE.BoxGeometry(1.8, 1.3, 1.8);
            const basket = new THREE.Mesh(basketGeom, new THREE.MeshStandardMaterial({ color: 0x82542e }));
            basket.position.y = -9.0;
            group.add(basket);

            this.scene.add(group);
            this.balloons.push({ group, baseY: b.pos.y, seed: b.seed });
        }
    }

    update(delta, time, nightFactor) {
        // 1. Street Lamps illumination at night
        const lampBulbEmissive = nightFactor * 4.5;
        const lampLightIntensity = nightFactor * 85.0;
        const poolOpacity = nightFactor * 0.78;

        for (const lamp of this.streetLamps) {
            lamp.bulb.emissiveIntensity = lampBulbEmissive;
            lamp.light.intensity = lampLightIntensity;
            if (lamp.pool) lamp.pool.opacity = poolOpacity;
        }

        // 2. Wind Turbines rotor rotation & beacon pulse
        const isBeaconLit = (Math.sin(time * 4.0) > 0.25);
        for (const turb of this.turbines) {
            turb.rotor.rotation.z += delta * 0.95;
            turb.beacon.color.setHex(isBeaconLit ? 0xff1122 : 0x330005);
        }

        // 3. Hot air balloons drifting
        for (const b of this.balloons) {
            b.group.position.y = b.baseY + Math.sin(time * 0.45 + b.seed) * 3.8;
            b.group.rotation.y += delta * 0.04;
        }
    }
}
