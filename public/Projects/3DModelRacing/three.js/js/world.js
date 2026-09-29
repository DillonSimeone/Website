import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';
import { GrassField } from './grass.js';
import { TreeManager } from './trees.js';
import { PropsManager } from './props.js';

/**
 * WorldView — Environment, Atmosphere, and Scenery Coordinator
 * 
 * Modular architecture:
 * - grass.js: High-Performance GLSL Triangle Grass & Wildflowers (Peter Adams technique)
 * - trees.js: Conifers, deciduous trees, and meadow groves
 * - props.js: Street lamps, guardrails, signs, grandstands, bridge, turbines, balloons
 */
export class WorldView {
    constructor(scene, trackData) {
        this.scene = scene;
        this.trackData = trackData;

        // Track bounding sphere & center
        const { points } = trackData;
        const box = new THREE.Box3();
        points.forEach(p => box.expandByPoint(p));
        this.trackCenter = box.getCenter(new THREE.Vector3());
        this.trackSize = box.getSize(new THREE.Vector3());

        this.timeOfDay = 0.08; // Morning sunlight
        this.elapsedTime = 0.0;

        // Subsystems
        this.props = null;
        this.trees = null;
        this.grass = null;

        this._setupLighting();
        this._setupSkyShader();
        this._setupTerrain();
        this._setupPropsAndVegetation();
    }

    _setupLighting() {
        // Directional Sun with real dynamic shadow mapping
        this.sun = new THREE.DirectionalLight(0xfffaed, 1.6);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.width = 2048;
        this.sun.shadow.mapSize.height = 2048;
        this.sun.shadow.camera.near = 1.0;
        this.sun.shadow.camera.far = 400.0;
        this.sun.shadow.camera.left = -75;
        this.sun.shadow.camera.right = 75;
        this.sun.shadow.camera.top = 75;
        this.sun.shadow.camera.bottom = -75;
        this.sun.shadow.bias = -0.0006;
        this.scene.add(this.sun);
        this.scene.add(this.sun.target);

        // Ambient Fill
        this.ambient = new THREE.AmbientLight(0xcce2ff, 0.95);
        this.scene.add(this.ambient);
    }

    _setupSkyShader() {
        // Procedural Volumetric Cloud Skydome Shader
        const vertexShader = `
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
            void main() {
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                vNormal = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform float uDayTime;
            uniform vec3 uSunDir;
            varying vec3 vWorldPosition;
            varying vec3 vNormal;

            float hash(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                for (int i = 0; i < 4; i++) {
                    v += a * noise(p);
                    p = p * 2.02 + vec2(1.2, 3.4);
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                vec3 dir = normalize(vNormal);
                float h = clamp(dir.y, 0.0, 1.0);

                // Seamless planar sky projection (eliminates polar and azimuth seams entirely)
                vec2 skyUv = (dir.xz / (max(dir.y, 0.02) + 0.38)) * 1.5 + vec2(uTime * 0.012, uTime * 0.003);

                // Multi-layer volumetric cloud density via 4-octave fBm
                float n1 = fbm(skyUv * 1.8);
                float n2 = fbm(skyUv * 3.8 + vec2(n1 * 0.45));
                float density = smoothstep(0.44, 0.76, n1 * 0.7 + n2 * 0.3) * smoothstep(0.04, 0.28, h);

                // Rayleigh scattering sky gradient (day, sunset, night)
                vec3 dayZenith = vec3(0.16, 0.50, 0.92);
                vec3 dayHorizon = vec3(0.60, 0.80, 0.98);

                vec3 sunsetZenith = vec3(0.22, 0.18, 0.50);
                vec3 sunsetHorizon = vec3(0.96, 0.44, 0.20);

                vec3 nightZenith = vec3(0.02, 0.03, 0.08);
                vec3 nightHorizon = vec3(0.05, 0.07, 0.14);

                float t = uDayTime;
                float nightFactor = smoothstep(0.44, 0.56, t) * (1.0 - smoothstep(0.78, 0.88, t));
                float sunsetFactor = smoothstep(0.38, 0.48, t) * (1.0 - smoothstep(0.48, 0.58, t));

                vec3 skyZenith = mix(dayZenith, nightZenith, nightFactor);
                vec3 skyHorizon = mix(dayHorizon, nightHorizon, nightFactor);
                if (sunsetFactor > 0.0) {
                    skyZenith = mix(skyZenith, sunsetZenith, sunsetFactor);
                    skyHorizon = mix(skyHorizon, sunsetHorizon, sunsetFactor);
                }

                vec3 skyCol = mix(skyHorizon, skyZenith, pow(h, 0.65));

                // Sun glow
                float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
                vec3 sunGlow = vec3(1.0, 0.85, 0.65) * pow(sunDot, 16.0) * (1.0 - nightFactor * 0.85);
                skyCol += sunGlow * 0.45;

                // Cloud coloring
                vec3 cloudDay = vec3(0.98, 0.99, 1.0);
                vec3 cloudSunset = vec3(1.0, 0.76, 0.58);
                vec3 cloudNight = vec3(0.15, 0.18, 0.26);

                vec3 cloudCol = mix(cloudDay, cloudNight, nightFactor);
                if (sunsetFactor > 0.0) cloudCol = mix(cloudCol, cloudSunset, sunsetFactor);
                cloudCol += vec3(1.0, 0.9, 0.7) * pow(sunDot, 8.0) * 0.35 * (1.0 - nightFactor);

                vec3 finalCol = mix(skyCol, cloudCol, density);

                gl_FragColor = vec4(finalCol, 1.0);
            }
        `;

        this.skyUniforms = {
            uTime: { value: 0 },
            uDayTime: { value: this.timeOfDay },
            uSunDir: { value: new THREE.Vector3(1, 1, 1).normalize() }
        };

        const skyGeom = new THREE.SphereGeometry(1600, 32, 24);
        const skyMat = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.skyUniforms,
            side: THREE.BackSide,
            depthWrite: false
        });

        this.skyDome = new THREE.Mesh(skyGeom, skyMat);
        this.skyDome.position.copy(this.trackCenter);
        this.scene.add(this.skyDome);

        this._setupCelestialStarDome();
    }

    _setupCelestialStarDome() {
        const count = 2800;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        // Soft circular Gaussian sprite
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.22, 'rgba(235, 245, 255, 0.85)');
        grad.addColorStop(0.55, 'rgba(180, 215, 255, 0.35)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        const starTex = new THREE.CanvasTexture(canvas);

        const starPalette = [
            new THREE.Color(1.0, 1.0, 1.0),
            new THREE.Color(0.85, 0.92, 1.0),
            new THREE.Color(1.0, 0.95, 0.82),
            new THREE.Color(0.78, 0.88, 1.0)
        ];

        for (let i = 0; i < count; i++) {
            // Uniform upper celestial hemisphere sampling
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 0.92 + 0.08); // Above horizon
            const r = 1500.0;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

            const col = starPalette[Math.floor(Math.random() * starPalette.length)];
            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.starMat = new THREE.PointsMaterial({
            size: 4.2,
            map: starTex,
            transparent: true,
            opacity: 0.0,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.starDome = new THREE.Points(geom, this.starMat);
        this.scene.add(this.starDome);
    }

    _setupTerrain() {
        const cx = this.trackCenter.x;
        const cz = this.trackCenter.z;
        const valleyRadius = Math.max(this.trackSize.x, this.trackSize.z) * 0.5 + 260.0;

        // Rich Organic Forest Loam & Mossy Soil
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1c2d1b';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 500; i++) {
            const px = Math.random() * 256;
            const py = Math.random() * 256;
            const pr = 4 + Math.random() * 16;
            const cols = ['#233821', '#2a4427', '#172416', '#314c2d', '#1f2d1c', '#3b5836'];
            ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }
        const turfTex = new THREE.CanvasTexture(canvas);
        turfTex.wrapS = THREE.RepeatWrapping;
        turfTex.wrapT = THREE.RepeatWrapping;
        turfTex.repeat.set(50, 50);

        // Procedural Rolling Hills & Plains Mesh (Subdivided to follow natural elevation)
        const groundGeom = new THREE.PlaneGeometry(valleyRadius * 2.8, valleyRadius * 2.8, 160, 160);
        groundGeom.rotateX(-Math.PI / 2);
        const posAttr = groundGeom.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i) + cx;
            const vz = posAttr.getZ(i) + cz;
            posAttr.setY(i, getTerrainHeight(vx, vz));
        }
        groundGeom.computeVertexNormals();

        const groundMat = new THREE.MeshStandardMaterial({
            map: turfTex,
            roughness: 0.95,
            metalness: 0.02
        });
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.position.set(cx, 0.0, cz);
        ground.receiveShadow = true;
        this.scene.add(ground);

        // High Alpine Mountain Peaks
        const peakGeom = new THREE.BufferGeometry();
        const peakVerts = [];
        const peakCols = [];
        const count = 56;
        const innerR = valleyRadius;
        const outerR = valleyRadius + 380.0;

        for (let i = 0; i < count; i++) {
            const a0 = (i / count) * Math.PI * 2;
            const a1 = ((i + 1) / count) * Math.PI * 2;
            const h0 = 140 + Math.sin(i * 1.7) * 55 + Math.cos(i * 0.9) * 35;
            const h1 = 140 + Math.sin((i + 1) * 1.7) * 55 + Math.cos((i + 1) * 0.9) * 35;

            const inX0 = cx + Math.cos(a0) * innerR;
            const inZ0 = cz + Math.sin(a0) * innerR;
            const inY0 = getTerrainHeight(inX0, inZ0);
            const pIn0 = [inX0, inY0, inZ0];
            const pOut0 = [cx + Math.cos(a0) * outerR, h0, cz + Math.sin(a0) * outerR];

            const inX1 = cx + Math.cos(a1) * innerR;
            const inZ1 = cz + Math.sin(a1) * innerR;
            const inY1 = getTerrainHeight(inX1, inZ1);
            const pIn1 = [inX1, inY1, inZ1];
            const pOut1 = [cx + Math.cos(a1) * outerR, h1, cz + Math.sin(a1) * outerR];

            const colIn = new THREE.Color(0.24, 0.54, 0.28);
            const colOut0 = h0 > 130 ? new THREE.Color(0.96, 0.97, 1.0) : new THREE.Color(0.46, 0.42, 0.38);
            const colOut1 = h1 > 130 ? new THREE.Color(0.96, 0.97, 1.0) : new THREE.Color(0.46, 0.42, 0.38);

            peakVerts.push(...pIn0, ...pOut0, ...pIn1);
            peakVerts.push(...pIn1, ...pOut0, ...pOut1);

            peakCols.push(colIn.r, colIn.g, colIn.b);
            peakCols.push(colOut0.r, colOut0.g, colOut0.b);
            peakCols.push(colIn.r, colIn.g, colIn.b);

            peakCols.push(colIn.r, colIn.g, colIn.b);
            peakCols.push(colOut0.r, colOut0.g, colOut0.b);
            peakCols.push(colOut1.r, colOut1.g, colOut1.b);
        }

        peakGeom.setAttribute('position', new THREE.Float32BufferAttribute(peakVerts, 3));
        peakGeom.setAttribute('color', new THREE.Float32BufferAttribute(peakCols, 3));
        peakGeom.computeVertexNormals();

        const peakMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            flatShading: true
        });
        const mountainRing = new THREE.Mesh(peakGeom, peakMat);
        this.scene.add(mountainRing);
    }

    _setupPropsAndVegetation() {
        const { points, tangents, binormals, tags, halfWidth = 5.2 } = this.trackData;
        const n = points.length;
        const halfW = halfWidth;

        // Initialize Managers
        this.props = new PropsManager(this.scene, this.trackData, this.trackCenter);
        this.trees = new TreeManager(this.scene, this.trackData, this.trackCenter);

        // Clearance Reservation Grid
        const reservedLeft = new Uint8Array(n);
        const reservedRight = new Uint8Array(n);

        const isOccupied = (side, idx, radius = 1) => {
            const arr = side < 0 ? reservedLeft : reservedRight;
            for (let k = Math.max(0, idx - radius); k <= Math.min(n - 1, idx + radius); k++) {
                if (arr[k]) return true;
            }
            return false;
        };

        const reserve = (side, idx, radius = 1) => {
            const arr = side < 0 ? reservedLeft : reservedRight;
            for (let k = Math.max(0, idx - radius); k <= Math.min(n - 1, idx + radius); k++) {
                arr[k] = 1;
            }
        };

        // PASS 1: Guardrails along outer curve bends
        for (let i = 1; i < n - 2; i++) {
            const tag = tags[i];
            if ((tag & 1) !== 0) continue;

            const t0 = tangents[i - 1];
            const t1 = tangents[i + 1];
            const curve = (t0.x * t1.z - t0.z * t1.x);

            if (Math.abs(curve) > 0.04) {
                const outerSide = curve > 0 ? 1 : -1;
                this.props.createConnectedGuardrail(points[i], points[i + 1], binormals[i], binormals[i + 1], outerSide, halfW, i);
                reserve(outerSide, i, 1);
            }
        }

        // PASS 2: Chevron Signs at sharp curve entries
        for (let i = 2; i < n - 3; i++) {
            const tag = tags[i];
            if ((tag & 1) !== 0) continue;

            const t0 = tangents[i - 2];
            const t1 = tangents[i + 2];
            const curve = (t0.x * t1.z - t0.z * t1.x);

            if (Math.abs(curve) > 0.08) {
                const signSide = curve > 0 ? -1 : 1;
                if (!isOccupied(signSide, i, 2)) {
                    this.props.createChevronSign(points[i], tangents[i], binormals[i], signSide, halfW);
                    reserve(signSide, i, 2);
                }
            }
        }

        // PASS 3: Distance Markers
        const markers = [
            { idx: Math.floor(n * 0.15), text: '500 M' },
            { idx: Math.floor(n * 0.50), text: '250 M' },
            { idx: Math.floor(n * 0.75), text: '100 M' }
        ];
        for (const m of markers) {
            const idx = m.idx;
            if (idx > 0 && idx < n) {
                const side = -1;
                if (!isOccupied(side, idx, 2)) {
                    this.props.createDistanceMarker(points[idx], tangents[idx], binormals[idx], side, halfW, m.text);
                    reserve(side, idx, 2);
                }
            }
        }

        // PASS 4: Grandstands & Billboards on straights
        for (let i = 8; i < n - 8; i++) {
            const tag = tags[i];
            if ((tag & 1) !== 0) continue;

            const t0 = tangents[i - 2];
            const t1 = tangents[i + 2];
            const curve = Math.abs(t0.x * t1.z - t0.z * t1.x);

            if (curve < 0.12) {
                if ((i === 12 || i === 48 || i === 76) && !isOccupied(1, i, 4)) {
                    this.props.createGrandstand(points[i], tangents[i], binormals[i], 1, halfW);
                    reserve(1, i, 4);
                }
                if ((i === 18 || i === 54 || i === 82) && !isOccupied(-1, i, 3)) {
                    const text = i === 18 ? '★ SUPER MODEL GP ★' : (i === 54 ? 'TURBO SPEEDWAY' : '★ STAR RAMP AHEAD ★');
                    this.props.createBillboard(points[i], tangents[i], binormals[i], -1, halfW, text);
                    reserve(-1, i, 3);
                }
            }
        }

        // PASS 5: Street Lamps spaced every ~35m, alternating sides
        let lampSide = 1;
        for (let i = 4; i < n - 4; i += 6) {
            const tag = tags[i];
            if ((tag & 1) !== 0) continue;
            const side = lampSide;
            lampSide = -lampSide;
            if (!isOccupied(side, i, 2)) {
                this.props.createStreetLamp(points[i], tangents[i], binormals[i], side, halfW);
                reserve(side, i, 2);
            }
        }

        // PASS 6: Trees placed only in remaining unreserved space
        for (let i = 3; i < n - 4; i += 2) {
            const tag = tags[i];
            if ((tag & 1) !== 0) continue;
            for (const side of [-1, 1]) {
                if (!isOccupied(side, i, 1)) {
                    const dist = halfW + 4.8 + ((i * 7) % 4) * 0.8;
                    const treePos = points[i].clone().add(binormals[i].clone().multiplyScalar(side * dist));
                    const isPine = ((i + (side > 0 ? 1 : 0)) % 2 === 0);
                    this.trees.createTree(treePos.x, treePos.z, isPine);
                    reserve(side, i, 1);
                }
            }
        }

        // Start / Finish Gantry & Circuit Props
        this.props.createStartGantry(points[1], tangents[1], binormals[1], 11.0);
        this.props.setupOverheadTrussBridge();
        this.props.setupFieldBoulders();
        this.props.setupWindTurbines();
        this.props.setupHotAirBalloons();

        // Meadow groves across the valley
        this.trees.setupMeadowGroves();

        // High-Performance GLSL Triangle Grass & Wildflowers (Peter Adams technique)
        this.grass = new GrassField(this.scene, this.trackData, this.trackCenter, this.trackSize);
    }

    update(delta, cameraPos, playerPos, vehiclePositions = []) {
        this.elapsedTime += delta;

        // Continuous 85-second Day-Night Cycle
        this.timeOfDay = (this.timeOfDay + delta * (1.0 / 85.0)) % 1.0;
        const t = this.timeOfDay;

        // Sun Orbit
        const sunYaw = t * Math.PI * 2;
        const sunPos = new THREE.Vector3(
            this.trackCenter.x + Math.cos(sunYaw) * 450,
            Math.max(Math.sin(sunYaw) * 450 + 60, 20),
            this.trackCenter.z + Math.sin(sunYaw) * 450
        );
        this.sun.position.copy(sunPos);

        const sunDir = sunPos.clone().sub(this.trackCenter).normalize();

        // Update volumetric cloud skydome shader uniforms
        if (this.skyUniforms) {
            this.skyUniforms.uTime.value = this.elapsedTime;
            this.skyUniforms.uDayTime.value = t;
            this.skyUniforms.uSunDir.value.copy(sunDir);
            if (this.skyDome) {
                if (cameraPos) {
                    this.skyDome.position.copy(cameraPos);
                } else {
                    this.skyDome.position.copy(this.trackCenter);
                }
            }
        }

        // Night factor (0.0 = day, 1.0 = deep night)
        let nightFactor = 0.0;
        if (t >= 0.46 && t <= 0.88) {
            if (t < 0.56) {
                nightFactor = (t - 0.46) / 0.10;
            } else if (t > 0.80) {
                nightFactor = 1.0 - (t - 0.80) / 0.08;
            } else {
                nightFactor = 1.0;
            }
        }

        // Celestial Star Dome rotation and opacity
        if (this.starDome) {
            if (cameraPos) this.starDome.position.copy(cameraPos);
            this.starDome.rotation.y += delta * 0.003;
            if (this.starMat) {
                this.starMat.opacity = Math.max(0, (nightFactor - 0.12) / 0.88) * 0.95;
            }
        }

        // Dynamic Sun position relative to player for soft shadow map tracking
        if (playerPos) {
            this.sun.target.position.copy(playerPos);
            this.sun.position.set(
                playerPos.x + sunDir.x * 120.0,
                playerPos.y + Math.max(40.0, sunDir.y * 120.0),
                playerPos.z + sunDir.z * 120.0
            );
        }

        const daySun = new THREE.Color(0xfffaed);
        const sunsetSun = new THREE.Color(0xff6e30);
        const nightMoon = new THREE.Color(0x82aaff);
        const sunsetFactor = Math.max(0, 1.0 - Math.abs(t - 0.48) / 0.08);

        let curSun = daySun.clone();
        if (sunsetFactor > 0) curSun.lerp(sunsetSun, sunsetFactor);
        if (nightFactor > 0) curSun.lerp(nightMoon, nightFactor);

        this.sun.color.copy(curSun);
        this.sun.intensity = THREE.MathUtils.lerp(1.6, 0.35, nightFactor);
        this.ambient.intensity = THREE.MathUtils.lerp(0.95, 0.30, nightFactor);

        // Update submodules
        if (this.props) {
            this.props.update(delta, this.elapsedTime, nightFactor);
        }
        if (this.trees) {
            this.trees.update(delta, this.elapsedTime);
        }
        if (this.grass) {
            this.grass.update(delta, playerPos || cameraPos, t, vehiclePositions, this.trackData);
        }
    }
}
