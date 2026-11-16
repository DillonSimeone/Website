// UI orchestration, presets, and MeshPhysicalMaterial rendering for 25-SpoolLamp
import * as THREE from 'three';
import { context, params, PRESETS, updateParam } from './state.js';
import { buildHubPlug, buildWaveHalf, buildSpoolGhost } from './geometry.js';
import { buildParametricCasing, buildCasingLid, buildShadeAdapter, buildWallMount } from './casingGeometry.js';
import { manifoldToThreeGeometry, updateSceneMesh } from './viewport.js';
import { triggerExport } from './exporter.js';

export function rebuildActiveGeometry() {
    const M = context.Manifold;
    if (!M) return;

    const items = [];
    const explode = params.explodedView * 45;

    const matHub = new THREE.MeshPhysicalMaterial({
        color: 0x00f0ff,
        roughness: 0.25,
        metalness: 0.1,
        transmission: 0.25,
        thickness: 1.5,
        wireframe: params.wireframe
    });

    const matWave = new THREE.MeshPhysicalMaterial({
        color: 0xffaa00,
        emissive: 0x331800,
        roughness: 0.2,
        metalness: 0.05,
        transmission: 0.45,
        transparent: true,
        opacity: 0.88,
        wireframe: params.wireframe
    });

    const matGhost = new THREE.MeshPhysicalMaterial({
        color: 0x3a4a66,
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        wireframe: params.wireframe
    });

    // Always build wave half so LED strip estimate stays live
    const waveManifold = buildWaveHalf(M, params);
    const waveGeom = manifoldToThreeGeometry(waveManifold);
    waveManifold.delete();

    const stripEl = document.getElementById('strip-readout');
    if (stripEl) {
        const cm = context.estimatedStripCm;
        const leds = Math.round((cm / 100) * 60);
        stripEl.textContent = `STRIP: ~${cm} cm (~${leds} LEDs @ 60/m)`;
    }

    updatePowerHUD(context.estimatedStripCm);

    if (context.activePreset === 'hub_only') {
        const hubManifold = buildHubPlug(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(hubManifold),
            material: matHub,
            edgeColor: 0x003344
        });
        hubManifold.delete();
        updateSceneMesh(items);
        return;
    }

    const matCasing = new THREE.MeshPhysicalMaterial({
        color: 0xdbeafe,
        roughness: 0.25,
        metalness: 0.05,
        transmission: 0.35,
        transparent: true,
        opacity: 0.85,
        wireframe: params.wireframe
    });

    const matMount = new THREE.MeshPhysicalMaterial({
        color: 0xff2a85,
        roughness: 0.35,
        metalness: 0.15,
        wireframe: params.wireframe
    });

    if (context.activePreset === 'casing_mount') {
        const casingM = buildParametricCasing(M, params);
        const lidM = buildCasingLid(M, params);
        const mountM = buildWallMount(M, params);
        const hubM = buildHubPlug(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(casingM),
            material: matCasing,
            position: new THREE.Vector3(0, 0, -params.casingHeight / 2),
            edgeColor: 0x1e3a5f
        });
        items.push({
            geometry: manifoldToThreeGeometry(lidM),
            material: matCasing,
            position: new THREE.Vector3(0, 0, params.casingHeight / 2 + 0.85 + explode * 0.7),
            rotation: new THREE.Euler(Math.PI, 0, 0),
            edgeColor: 0x1e3a5f
        });
        items.push({
            geometry: manifoldToThreeGeometry(mountM),
            material: matMount,
            position: new THREE.Vector3(0, 0, -params.casingHeight / 2 - 5.0 - explode),
            edgeColor: 0x3a001e
        });
        items.push({
            geometry: manifoldToThreeGeometry(hubM),
            material: matHub,
            position: new THREE.Vector3(0, 0, params.casingHeight / 2 + explode * 1.4),
            rotation: new THREE.Euler(Math.PI, 0, 0),
            edgeColor: 0x003344
        });
        casingM.delete(); lidM.delete(); mountM.delete(); hubM.delete();
        updateSceneMesh(items);
        return;
    }

    if (context.activePreset === 'shade_adapter') {
        const adapterM = buildShadeAdapter(M, params);
        const hubM = buildHubPlug(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(adapterM),
            material: matCasing,
            edgeColor: 0x1e3a5f
        });
        items.push({
            geometry: manifoldToThreeGeometry(hubM),
            material: matHub,
            position: new THREE.Vector3(0, 0, 22 + explode),
            rotation: new THREE.Euler(Math.PI, 0, 0),
            edgeColor: 0x003344
        });
        adapterM.delete(); hubM.delete();
        updateSceneMesh(items);
        return;
    }

    if (context.activePreset === 'wall_mount') {
        const mountM = buildWallMount(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mountM),
            material: matMount,
            edgeColor: 0x3a001e
        });
        mountM.delete();
        updateSceneMesh(items);
        return;
    }

    // Assembly / Wave view: mount hub into front of spool (+Z) and 2 wave halves onto core
    const hubManifold = buildHubPlug(M, params);
    const hubZ = (params.spoolInnerWidth / 2) + 2.5 + explode;
    items.push({
        geometry: manifoldToThreeGeometry(hubManifold),
        material: matHub,
        position: new THREE.Vector3(0, 0, hubZ),
        rotation: new THREE.Euler(Math.PI, 0, 0),
        edgeColor: 0x003344
    });
    hubManifold.delete();

    // Two 180° C-halves centered in Z, sliding radially (+Y / -Y) when exploded
    const effectiveH = Math.min(params.waveHeight, params.spoolInnerWidth - 1.5);
    const waveZ = -effectiveH / 2;

    // Top/Front C-half (+Y radial insertion)
    items.push({
        geometry: waveGeom,
        material: matWave,
        position: new THREE.Vector3(0, explode * 1.1, waveZ),
        edgeColor: 0x442200
    });

    // Bottom/Opposite C-half (-Y radial insertion, rotated 180° around Z)
    items.push({
        geometry: waveGeom.clone(),
        material: matWave,
        position: new THREE.Vector3(0, -explode * 1.1, waveZ),
        rotation: new THREE.Euler(0, 0, Math.PI),
        edgeColor: 0x442200
    });

    if (params.showSpoolGhost) {
        const ghostManifold = buildSpoolGhost(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(ghostManifold),
            material: matGhost,
            noEdges: true
        });
        ghostManifold.delete();
    }

    updateSceneMesh(items);
}

function updatePowerHUD(waveCm) {
    const tbody = document.getElementById('hud-power-rows');
    const noteEl = document.getElementById('hud-power-note');
    if (!tbody) return;

    const wraps = 7;
    const coreCm = (Math.PI * params.spoolCoreOD) / 10;

    const calc = (cm) => {
        const m = (cm / 100).toFixed(1);
        const leds = Math.round((cm / 100) * 60);
        const lm = (leds * 16).toLocaleString();
        const typA = (leds * 0.025).toFixed(1);
        const maxA = (leds * 0.060).toFixed(1);
        return { m, leds, lm, typA, maxA };
    };

    const core7 = calc(coreCm * wraps);
    const wave1 = calc(waveCm);
    const wave7 = calc(waveCm * wraps);
    const mult7 = core7.leds > 0 ? (wave7.leds / core7.leds).toFixed(1) : '1.0';

    tbody.innerHTML = `
        <tr>
            <td>Core (7×)</td>
            <td>${core7.m}m</td>
            <td>${core7.leds}</td>
            <td>${core7.lm} lm</td>
            <td>${core7.typA}–${core7.maxA}A</td>
        </tr>
        <tr>
            <td>Wave (1×)</td>
            <td>${wave1.m}m</td>
            <td>${wave1.leds}</td>
            <td>${wave1.lm} lm</td>
            <td>${wave1.typA}–${wave1.maxA}A</td>
        </tr>
        <tr class="highlight">
            <td>Wave (7×)</td>
            <td>${wave7.m}m</td>
            <td>${wave7.leds}</td>
            <td>${wave7.lm} lm (${mult7}×)</td>
            <td>${wave7.typA}–${wave7.maxA}A</td>
        </tr>
    `;

    if (noteEl) {
        noteEl.textContent = `Amps = Reactive (~25mA/LED) to 100% White (60mA/LED). Wave 7× gives ${mult7}× the light of 7 core wraps (use a dedicated 5V PSU for 7×).`;
    }
}

function syncUIValues() {
    Object.keys(params).forEach(key => {
        const input = document.getElementById(key);
        const readout = document.getElementById(`val-${key}`);
        if (input) {
            if (input.type === 'checkbox') input.checked = Boolean(params[key]);
            else input.value = params[key];
        }
        if (readout) {
            const twoDec = key === 'plugClearance' || key === 'explodedView' || key === 'petalSharpness' || key === 'casingWall';
            readout.textContent = typeof params[key] === 'number'
                ? params[key].toFixed(key === 'waveCount' ? 0 : (twoDec ? 2 : 1))
                : params[key];
        }
    });
}

export function bindUIEvents() {
    document.querySelectorAll('input[type="range"], select').forEach(el => {
        el.addEventListener('input', (e) => {
            updateParam(e.target.id, e.target.value);
            syncUIValues();
            rebuildActiveGeometry();
        });
    });

    document.querySelectorAll('input[type="checkbox"]').forEach(el => {
        el.addEventListener('change', (e) => {
            updateParam(e.target.id, e.target.checked);
            rebuildActiveGeometry();
        });
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.preset;
            context.activePreset = key;
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const preset = PRESETS[key];
            if (preset && preset.changes) {
                Object.entries(preset.changes).forEach(([k, v]) => updateParam(k, v));
            }
            syncUIValues();
            rebuildActiveGeometry();
        });
    });

    document.querySelectorAll('.export-btn').forEach(btn => {
        btn.addEventListener('click', () => triggerExport(btn.dataset.export));
    });

    syncUIValues();
}
