import * as THREE from 'three';
import { getTerrainHeight, GLSL_TERRAIN_HEIGHT } from './terrain.js';
import { GrassField } from './grass.js';
import { TreeManager } from './trees.js';
import { PropsManager } from './props.js';
import { AtmosphericFog } from './fog.js';
import { WeatherManager, WEATHER_TYPES } from './weather.js';

/**
 * WorldView — Environment, Atmosphere, and Scenery Coordinator
 * 
 * Modular architecture:
 * - weather.js: Dynamic weather state machine, drifting cloud shadows, instanced rain, lightning & storm
 * - fog.js: Atmospheric distance fog tied to Day/Night and weather storms
 * - grass.js: High-Performance GLSL Triangle Grass & Wildflowers (Peter Adams technique)
 * - trees.js: Conifers, deciduous trees, and meadow groves
 * - props.js: Street lamps, guardrails, signs, grandstands, bridge, turbines, balloons
 */
export class WorldView {
    constructor(scene, trackData, audio = null) {
        this.scene = scene;
        this.trackData = trackData;
        this.audio = audio;

        // Track bounding sphere & center
        const { points } = trackData;
        const box = new THREE.Box3();
        points.forEach(p => box.expandByPoint(p));
        this.trackCenter = box.getCenter(new THREE.Vector3());
        this.trackSize = box.getSize(new THREE.Vector3());

        this.timeOfDay = 0.08; // Morning sunlight
        this.elapsedTime = 0.0;

        // Subsystems
        this.weather = new WeatherManager(this.scene);
        this.weather.onThunderCallback = (power) => {
            if (this.audio && typeof this.audio.playThunder === 'function') {
                this.audio.playThunder(power);
            }
        };

        this.fog = new AtmosphericFog(this.scene, { near: 85.0, far: 390.0 });
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
        this.sun.shadow.camera.near = 5.0;
        this.sun.shadow.camera.far = 420.0;
        this.sun.shadow.camera.left = -90;
        this.sun.shadow.camera.right = 90;
        this.sun.shadow.camera.top = 90;
        this.sun.shadow.camera.bottom = -90;
        this.sun.shadow.bias = -0.0004;
        this.sun.shadow.normalBias = 0.03;
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
            uniform float uStormFactor;
            uniform float uLightning;
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

                // Seamless planar sky projection
                vec2 skyUv = (dir.xz / (max(dir.y, 0.02) + 0.38)) * 1.5 + vec2(uTime * 0.012, uTime * 0.003);

                // Multi-layer volumetric cloud density via 4-octave fBm (clouds thicken during storm)
                float n1 = fbm(skyUv * 1.8);
                float n2 = fbm(skyUv * 3.8 + vec2(n1 * 0.45));
                float cloudThreshold = mix(0.44, 0.28, uStormFactor);
                float density = smoothstep(cloudThreshold, 0.76, n1 * 0.7 + n2 * 0.3) * smoothstep(0.04, 0.28, h);

                // Rayleigh scattering sky gradient (day, sunset, night, storm)
                vec3 dayZenith = vec3(0.16, 0.50, 0.92);
                vec3 dayHorizon = vec3(0.60, 0.80, 0.98);

                vec3 sunsetZenith = vec3(0.22, 0.18, 0.50);
                vec3 sunsetHorizon = vec3(0.96, 0.44, 0.20);

                vec3 nightZenith = vec3(0.02, 0.03, 0.08);
                vec3 nightHorizon = vec3(0.05, 0.07, 0.14);

                vec3 stormZenith = vec3(0.12, 0.16, 0.22);
                vec3 stormHorizon = vec3(0.32, 0.38, 0.46);

                float t = uDayTime;
                float nightFactor = smoothstep(0.44, 0.56, t) * (1.0 - smoothstep(0.78, 0.88, t));
                float sunsetFactor = smoothstep(0.38, 0.48, t) * (1.0 - smoothstep(0.48, 0.58, t));

                vec3 skyZenith = mix(dayZenith, nightZenith, nightFactor);
                vec3 skyHorizon = mix(dayHorizon, nightHorizon, nightFactor);
                if (sunsetFactor > 0.0) {
                    skyZenith = mix(skyZenith, sunsetZenith, sunsetFactor);
                    skyHorizon = mix(skyHorizon, sunsetHorizon, sunsetFactor);
                }
                if (uStormFactor > 0.0) {
                    skyZenith = mix(skyZenith, stormZenith, uStormFactor * 0.82);
                    skyHorizon = mix(skyHorizon, stormHorizon, uStormFactor * 0.82);
                }

                vec3 skyCol = mix(skyHorizon, skyZenith, pow(h, 0.65));

                // Sun glow
                float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
                vec3 sunGlow = vec3(1.0, 0.85, 0.65) * pow(sunDot, 16.0) * (1.0 - nightFactor * 0.85) * (1.0 - uStormFactor * 0.7);
                skyCol += sunGlow * 0.45;

                // Cloud coloring
                vec3 cloudDay = vec3(0.98, 0.99, 1.0);
                vec3 cloudSunset = vec3(1.0, 0.76, 0.58);
                vec3 cloudNight = vec3(0.15, 0.18, 0.26);
                vec3 cloudStorm = vec3(0.18, 0.22, 0.28);

                vec3 cloudCol = mix(cloudDay, cloudNight, nightFactor);
                if (sunsetFactor > 0.0) cloudCol = mix(cloudCol, cloudSunset, sunsetFactor);
                cloudCol = mix(cloudCol, cloudStorm, uStormFactor * 0.88);
                cloudCol += vec3(1.0, 0.9, 0.7) * pow(sunDot, 8.0) * 0.35 * (1.0 - nightFactor) * (1.0 - uStormFactor * 0.7);

                // Lightning flash illuminating clouds & sky
                cloudCol += vec3(0.85, 0.95, 1.0) * uLightning * 1.8;
                skyCol += vec3(0.55, 0.70, 0.92) * uLightning * 1.4;

                vec3 finalCol = mix(skyCol, cloudCol, density);

                gl_FragColor = vec4(finalCol, 1.0);
            }
        `;

        this.skyUniforms = {
            uTime: { value: 0 },
            uDayTime: { value: this.timeOfDay },
            uSunDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
            uStormFactor: { value: 0.0 },
            uLightning: { value: 0.0 }
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

        // Lush Organic Meadow Loam & Undergrowth Matching Grassworks Green
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e3c15';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 400; i++) {
            const px = Math.random() * 256;
            const py = Math.random() * 256;
            const pr = 6 + Math.random() * 20;
            const cols = ['#254d1b', '#2e5a22', '#1a3513', '#396d2b', '#28511e', '#457d34'];
            ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }
        const turfTex = new THREE.CanvasTexture(canvas);
        turfTex.wrapS = THREE.RepeatWrapping;
        turfTex.wrapT = THREE.RepeatWrapping;
        turfTex.repeat.set(16, 16);

        // Procedural Rolling Hills & Plains Mesh (Dynamic infinite world following player)
        const groundGeom = new THREE.PlaneGeometry(2400, 2400, 140, 140);
        groundGeom.rotateX(-Math.PI / 2);

        const groundMat = new THREE.MeshStandardMaterial({
            map: turfTex,
            color: new THREE.Color(0x325c20),
            roughness: 0.92,
            metalness: 0.02
        });

        this.terrainUniforms = {
            uCloudOffset: { value: new THREE.Vector2() },
            uCloudShadowIntensity: { value: 0.15 },
            uLightning: { value: 0.0 }
        };

        groundMat.onBeforeCompile = (shader) => {
            shader.uniforms.uCloudOffset = this.terrainUniforms.uCloudOffset;
            shader.uniforms.uCloudShadowIntensity = this.terrainUniforms.uCloudShadowIntensity;
            shader.uniforms.uLightning = this.terrainUniforms.uLightning;

            shader.vertexShader = GLSL_TERRAIN_HEIGHT + '\n' +
                'varying vec2 vTerrainWorldPos;\n' +
                shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <beginnormal_vertex>',
                `
                #include <beginnormal_vertex>
                vec4 wNormPos = modelMatrix * vec4(position, 1.0);
                float eps = 0.6;
                float hL = getTerrainHeight(wNormPos.xz - vec2(eps, 0.0));
                float hR = getTerrainHeight(wNormPos.xz + vec2(eps, 0.0));
                float hD = getTerrainHeight(wNormPos.xz - vec2(0.0, eps));
                float hU = getTerrainHeight(wNormPos.xz + vec2(0.0, eps));
                objectNormal = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
                `
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                vec4 wP = modelMatrix * vec4(position, 1.0);
                transformed.y = getTerrainHeight(wP.xz);
                vTerrainWorldPos = wP.xz;
                `
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <uv_vertex>',
                `
                #include <uv_vertex>
                vec4 wUvPos = modelMatrix * vec4(position, 1.0);
                vMapUv = wUvPos.xz * 0.035;
                `
            );

            shader.fragmentShader = `
                uniform vec2 uCloudOffset;
                uniform float uCloudShadowIntensity;
                uniform float uLightning;
                varying vec2 vTerrainWorldPos;
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>
                float cSN = sin(vTerrainWorldPos.x * 0.0035 + uCloudOffset.x * 12.0) * cos(vTerrainWorldPos.y * 0.0035 + uCloudOffset.y * 12.0) * 0.5 + 0.5;
                float cSN2 = sin(vTerrainWorldPos.x * 0.008 - uCloudOffset.x * 18.0) * cos(vTerrainWorldPos.y * 0.008 - uCloudOffset.y * 18.0) * 0.5 + 0.5;
                float cloudShadow = smoothstep(0.40, 0.74, cSN * 0.65 + cSN2 * 0.35) * uCloudShadowIntensity;
                gl_FragColor.rgb *= (1.0 - cloudShadow * 0.48);
                gl_FragColor.rgb += vec3(0.38, 0.48, 0.62) * uLightning;
                `
            );
        };

        this.ground = new THREE.Mesh(groundGeom, groundMat);
        this.ground.position.set(cx, 0.0, cz);
        this.ground.receiveShadow = true;
        this.ground.frustumCulled = false;
        this.scene.add(this.ground);
    }

    _setupPropsAndVegetation() {
        // Initialize Scenery & Vegetation Subsystems
        this.props = new PropsManager(this.scene, this.trackData, this.trackCenter);
        this.trees = new TreeManager(this.scene, this.trackData, this.trackCenter);
        this.grass = new GrassField(this.scene, this.trackData, this.trackCenter, this.trackSize);
    }

    update(delta, cameraPos, playerPos, vehiclePositions = []) {
        this.elapsedTime += delta;

        // Continuous 85-second Day-Night Cycle
        this.timeOfDay = (this.timeOfDay + delta * (1.0 / 85.0)) % 1.0;
        const t = this.timeOfDay;

        // Dynamic Weather Subsystem update
        if (this.weather) {
            this.weather.update(delta, cameraPos);
        }

        // Dynamic Sun Orbit Tracking
        const center = playerPos || this.trackCenter;
        const sunYaw = t * Math.PI * 2;
        const sunDist = 200.0;
        const sunPos = new THREE.Vector3(
            center.x + Math.cos(sunYaw) * sunDist,
            center.y + Math.max(Math.sin(sunYaw) * sunDist + 85, 38),
            center.z + Math.sin(sunYaw) * sunDist
        );
        this.sun.position.copy(sunPos);
        this.sun.target.position.copy(center);
        this.sun.target.updateMatrixWorld();
        this.sun.updateMatrixWorld();

        const sunDir = sunPos.clone().sub(center).normalize();

        // Update volumetric cloud skydome shader uniforms
        if (this.skyUniforms) {
            this.skyUniforms.uTime.value = this.elapsedTime;
            this.skyUniforms.uDayTime.value = t;
            this.skyUniforms.uSunDir.value.copy(sunDir);
            if (this.weather) {
                this.skyUniforms.uStormFactor.value = this.weather.stormDarkness;
                this.skyUniforms.uLightning.value = this.weather.lightningIntensity;
            }
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
                const starVisibility = (1.0 - (this.weather ? this.weather.stormDarkness : 0.0));
                this.starMat.opacity = Math.max(0, (nightFactor - 0.12) / 0.88) * 0.95 * starVisibility;
            }
        }

        // Dynamic ground and sky dome tracking for infinite world
        if (playerPos && this.ground) {
            this.ground.position.x = playerPos.x;
            this.ground.position.z = playerPos.z;
        }
        if (cameraPos && this.skyDome) {
            this.skyDome.position.copy(cameraPos);
        }

        // Dynamic Sun position relative to player for soft shadow map tracking
        if (playerPos) {
            this.sun.target.position.copy(playerPos);
            this.sun.target.updateMatrixWorld();
            this.sun.position.set(
                playerPos.x + sunDir.x * 120.0,
                playerPos.y + Math.max(40.0, sunDir.y * 120.0),
                playerPos.z + sunDir.z * 120.0
            );
            this.sun.updateMatrixWorld();
        }

        const daySun = new THREE.Color(0xfffaed);
        const sunsetSun = new THREE.Color(0xff6e30);
        const nightMoon = new THREE.Color(0x82aaff);
        const sunsetFactor = Math.max(0, 1.0 - Math.abs(t - 0.48) / 0.08);

        let curSun = daySun.clone();
        if (sunsetFactor > 0) curSun.lerp(sunsetSun, sunsetFactor);
        if (nightFactor > 0) curSun.lerp(nightMoon, nightFactor);

        const stormDarkness = this.weather ? this.weather.stormDarkness : 0.0;
        const lightning = this.weather ? this.weather.lightningIntensity : 0.0;

        if (stormDarkness > 0) {
            const stormSunTint = new THREE.Color(0x607890);
            curSun.lerp(stormSunTint, stormDarkness * 0.75);
        }

        this.sun.color.copy(curSun);
        const baseSunInt = THREE.MathUtils.lerp(1.6, 0.35, nightFactor);
        this.sun.intensity = baseSunInt * (1.0 - stormDarkness * 0.65) + lightning * 2.8;

        const baseAmbientInt = THREE.MathUtils.lerp(0.95, 0.30, nightFactor);
        this.ambient.intensity = baseAmbientInt * (1.0 - stormDarkness * 0.45) + lightning * 1.8;
        if (lightning > 0.05) {
            this.ambient.color.setRGB(0.7 + lightning * 0.3, 0.8 + lightning * 0.2, 1.0);
        } else if (stormDarkness > 0.1) {
            this.ambient.color.setRGB(0.65 - stormDarkness * 0.2, 0.75 - stormDarkness * 0.2, 0.85 - stormDarkness * 0.15);
        } else {
            this.ambient.color.setHex(0xcce2ff);
        }

        // Update terrain uniforms
        if (this.terrainUniforms && this.weather) {
            this.terrainUniforms.uCloudOffset.value.copy(this.weather.cloudOffset);
            this.terrainUniforms.uCloudShadowIntensity.value = this.weather.cloudShadowIntensity;
            this.terrainUniforms.uLightning.value = this.weather.lightningIntensity;
        }

        // Update submodules
        if (this.fog) {
            const fogDist = this.weather ? this.weather.fogDensityFactor : 1.0;
            this.fog.update(delta, t, nightFactor, fogDist, stormDarkness);
        }
        if (this.props) {
            this.props.update(delta, this.elapsedTime, nightFactor, playerPos || cameraPos);
        }
        if (this.trees) {
            this.trees.update(delta, this.elapsedTime);
        }
        if (this.grass) {
            this.grass.update(delta, playerPos || cameraPos, t, vehiclePositions, this.trackData, sunDir, this.weather);
        }
        if (this.audio && this.weather) {
            this.audio.updateWeather(this.weather.rainIntensity, this.weather.windSpeed);
        }
    }
}
