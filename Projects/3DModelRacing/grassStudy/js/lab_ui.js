/**
 * grassStudy/js/lab_ui.js — Cached DOM Controls, Quick Visual Mode Bar & Server Sync
 */
import { VISUAL_MODE_ORDER, VISUAL_MODES } from '../../shared/visual_modes.js';
import { GRASS_PRESETS, FLORA_PRESETS } from '../../shared/grass/grass_presets.js';

export function hexToVec3(hex) {
    if (!hex || hex.length < 7) return [0.5, 0.5, 0.5];
    const r = parseFloat((parseInt(hex.slice(1, 3), 16) / 255).toFixed(3));
    const g = parseFloat((parseInt(hex.slice(3, 5), 16) / 255).toFixed(3));
    const b = parseFloat((parseInt(hex.slice(5, 7), 16) / 255).toFixed(3));
    return [r, g, b];
}

export function vec3ToHex(v) {
    if (!v) return '#00ff00';
    const to255 = (n) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0');
    return `#${to255(v[0])}${to255(v[1])}${to255(v[2])}`;
}

export class LabUI {
    constructor(callbacks) {
        this.cb = callbacks;
        this.el = {};
        this._rebuildTimer = null;
        this._toastTimer = null;
        this.serverAvailable = false;

        this._cacheElements();
        this._populateDynamicSelectors();
        this._bindEvents();
        this._checkServerStatus();

        // Collapse drawer on mobile viewports so the 3D meadow is immediately visible
        if (window.innerWidth <= 820 && this.el.controls) {
            this.el.controls.classList.add('collapsed');
            this._updateDrawerButtonLabel();
        }
    }

    _cacheElements() {
        const ids = [
            'controls', 'drawer-toggle-btn', 'stats-main', 'stats-sub', 'toast',
            'quick-mode-bar', 'visualModeSelect', 'perfModeSelect',
            'sim-player-btn', 'cam-follow-cb', 'randomize-terrain-btn', 'reset-cam-btn',
            'save-config-btn', 'copy-json-btn', 'capture-btn',
            'speciesPresetSelect', 'floraPresetSelect',
            'meadowViewMode', 'coordMode', 'ringSelect',
            'maxBladeHeight', 'bladeWidth', 'curvature', 'stiffness', 'translucency', 'patchiness',
            'cellSize', 'bladesPerTuft', 'segments', 'patchSize',
            'fadeInMin', 'fadeInMax', 'fadeOutMin', 'fadeOutMax',
            'densityDropoff', 'radialJitterAmp', 'boundaryMargin',
            'leanMin', 'leanMax', 'curveMin', 'curveMax', 'hScaleMin', 'hScaleMax',
            'adaptiveEnabled', 'targetTris', 'cullComp',
            'floraShadingFx', 'sound-controls', 'beat-synth-btn', 'mic-input-btn',
            'audioSensitivity', 'audio-levels',
            'timeMorphEnabled', 'timeMorphPalette', 'timeMorphSpeed',
            'flowerCol0', 'flowerCol1', 'flowerCol2', 'flowerCol3',
            'colRoot', 'colLower', 'colMid', 'colUpper', 'colTip',
            'terrainRelief', 'weatherRainEnabled', 'weatherRainIntensity',
            'weatherWindSpeed', 'weatherCloudShadow', 'paramDump'
        ];
        for (const id of ids) {
            this.el[id] = document.getElementById(id);
            const rng = document.getElementById(id + '_range');
            if (rng) this.el[id + '_range'] = rng;
        }
    }

    _populateDynamicSelectors() {
        // Quick Visual Mode Bar + Select Dropdown
        if (this.el.visualModeSelect) {
            this.el.visualModeSelect.innerHTML = '';
            for (const id of VISUAL_MODE_ORDER) {
                const m = VISUAL_MODES[id];
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = `${m.icon} ${m.name}`;
                this.el.visualModeSelect.appendChild(opt);
            }
        }
        if (this.el['quick-mode-bar']) {
            this.el['quick-mode-bar'].innerHTML = '';
            for (const id of VISUAL_MODE_ORDER) {
                const m = VISUAL_MODES[id];
                const pill = document.createElement('button');
                pill.className = 'mode-pill';
                pill.dataset.mode = m.id;
                pill.textContent = `${m.icon} ${m.shortName}`;
                pill.title = m.description;
                pill.addEventListener('click', () => this.cb.onVisualModeChange?.(m.id));
                this.el['quick-mode-bar'].appendChild(pill);
            }
        }

        // Species Presets
        if (this.el.speciesPresetSelect) {
            this.el.speciesPresetSelect.innerHTML = '<option value="">-- Choose Species Preset --</option>';
            for (const [key, p] of Object.entries(GRASS_PRESETS)) {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = `${p.name} — ${p.description}`;
                this.el.speciesPresetSelect.appendChild(opt);
            }
        }

        // Flora Presets
        if (this.el.floraPresetSelect) {
            this.el.floraPresetSelect.innerHTML = '<option value="">-- Choose Floral Palette --</option>';
            for (const [key, p] of Object.entries(FLORA_PRESETS)) {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = p.name;
                this.el.floraPresetSelect.appendChild(opt);
            }
        }
    }

    _updateDrawerButtonLabel() {
        if (!this.el['drawer-toggle-btn'] || !this.el.controls) return;
        const collapsed = this.el.controls.classList.contains('collapsed');
        this.el['drawer-toggle-btn'].textContent = collapsed ? '⚙️ Controls' : '✕ Close';
    }

    _bindEvents() {
        if (this.el['drawer-toggle-btn'] && this.el.controls) {
            this.el['drawer-toggle-btn'].addEventListener('click', () => {
                this.el.controls.classList.toggle('collapsed');
                this._updateDrawerButtonLabel();
            });
        }

        this.el.visualModeSelect?.addEventListener('change', (e) => {
            this.cb.onVisualModeChange?.(e.target.value);
        });

        this.el.perfModeSelect?.addEventListener('change', (e) => {
            this.cb.onPerfModeChange?.(e.target.value);
        });

        this.el['sim-player-btn']?.addEventListener('click', () => this.cb.onToggleSimPlayer?.());
        this.el['cam-follow-cb']?.addEventListener('change', (e) => this.cb.onFollowToggle?.(e.target.checked));
        this.el['randomize-terrain-btn']?.addEventListener('click', () => this.cb.onRandomizeTerrain?.());
        this.el['reset-cam-btn']?.addEventListener('click', () => this.cb.onResetCamera?.());
        this.el['copy-json-btn']?.addEventListener('click', () => this.cb.onCopyJson?.());
        this.el['save-config-btn']?.addEventListener('click', () => this.cb.onSaveConfig?.());
        this.el['capture-btn']?.addEventListener('click', () => this.cb.onCapture?.());

        this.el.speciesPresetSelect?.addEventListener('change', (e) => {
            if (e.target.value) this.cb.onSpeciesPresetChange?.(e.target.value);
        });

        this.el.floraPresetSelect?.addEventListener('change', (e) => {
            if (e.target.value) this.cb.onFloraPresetChange?.(e.target.value);
        });

        this.el.meadowViewMode?.addEventListener('change', (e) => this.cb.onViewModeChange?.(e.target.value));
        this.el.coordMode?.addEventListener('change', (e) => this.cb.onCoordModeChange?.(e.target.value));
        this.el.ringSelect?.addEventListener('change', (e) => this.cb.onRingSelectChange?.(parseInt(e.target.value, 10)));

        this.el.floraShadingFx?.addEventListener('change', (e) => {
            const fx = parseInt(e.target.value, 10);
            this.setSoundControlsVisible(fx === 4);
            this.cb.onShadingFxChange?.(fx);
        });

        this.el['beat-synth-btn']?.addEventListener('click', () => this.cb.onToggleBeat?.());
        this.el['mic-input-btn']?.addEventListener('click', () => this.cb.onToggleMic?.());
        this.el.audioSensitivity?.addEventListener('input', (e) => this.cb.onAudioSensitivity?.(parseFloat(e.target.value)));

        this.el.timeMorphEnabled?.addEventListener('change', (e) => this.cb.onTimeMorphToggle?.(e.target.checked));
        this.el.timeMorphPalette?.addEventListener('change', (e) => this.cb.onTimeMorphPalette?.(parseInt(e.target.value, 10)));
        this.el.timeMorphSpeed?.addEventListener('input', (e) => this.cb.onTimeMorphSpeed?.(parseFloat(e.target.value)));

        this.el.weatherRainEnabled?.addEventListener('change', () => this._emitWeatherOverride());
        this.el.weatherRainIntensity?.addEventListener('input', () => this._emitWeatherOverride());

        const colorIds = [
            'flowerCol0', 'flowerCol1', 'flowerCol2', 'flowerCol3',
            'colRoot', 'colLower', 'colMid', 'colUpper', 'colTip'
        ];
        for (const id of colorIds) {
            this.el[id]?.addEventListener('input', () => this.cb.onLiveColorChange?.());
        }

        const LIVE_IDS = [
            'maxBladeHeight', 'bladeWidth', 'curvature', 'stiffness', 'translucency', 'patchiness',
            'fadeInMin', 'fadeInMax', 'fadeOutMin', 'fadeOutMax',
            'densityDropoff', 'radialJitterAmp', 'boundaryMargin',
            'weatherWindSpeed', 'weatherCloudShadow', 'terrainRelief'
        ];
        const STRUCTURAL_IDS = [
            'cellSize', 'bladesPerTuft', 'segments', 'patchSize',
            'flowerFreq', 'cloverFreq', 'wheatFreq', 'twistIntensity',
            'targetTris', 'cullComp',
            'leanMin', 'leanMax', 'curveMin', 'curveMax', 'hScaleMin', 'hScaleMax'
        ];

        const bindPaired = (id, isLive) => {
            const num = this.el[id];
            const rng = this.el[id + '_range'];
            const handle = (val) => {
                const parsed = parseFloat(val);
                if (Number.isNaN(parsed)) return;
                if (isLive) {
                    if (id === 'weatherWindSpeed' || id === 'weatherCloudShadow') {
                        this._emitWeatherOverride();
                    }
                    this.cb.onLiveUniformChange?.(id, parsed);
                } else {
                    this.cb.onStructuralChange?.();
                    this._scheduleRebuild(280);
                }
            };
            if (rng && num) {
                rng.addEventListener('input', () => { num.value = rng.value; handle(rng.value); });
                num.addEventListener('input', () => { rng.value = num.value; handle(num.value); });
            } else if (num) {
                num.addEventListener('input', () => handle(num.value));
            }
        };

        LIVE_IDS.forEach(id => bindPaired(id, true));
        STRUCTURAL_IDS.forEach(id => bindPaired(id, false));

        this.el.adaptiveEnabled?.addEventListener('change', () => {
            this.cb.onStructuralChange?.();
            this._scheduleRebuild(60);
        });
    }

    _emitWeatherOverride() {
        this.cb.onWeatherChange?.({
            rainEnabled: !!this.el.weatherRainEnabled?.checked,
            rainIntensity: parseFloat(this.el.weatherRainIntensity?.value || 0.75),
            windSpeed: parseFloat(this.el.weatherWindSpeed?.value || 1.2),
            cloudShadowIntensity: parseFloat(this.el.weatherCloudShadow?.value || 0.45)
        });
    }

    _scheduleRebuild(delay = 280) {
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        this._rebuildTimer = setTimeout(() => {
            this._rebuildTimer = null;
            this.cb.onRebuildGrass?.();
        }, delay);
    }

    async _checkServerStatus() {
        try {
            const res = await fetch('/api/status');
            if (res.ok) {
                this.serverAvailable = true;
                if (this.el['save-config-btn']) {
                    this.el['save-config-btn'].style.display = 'inline-block';
                }
            }
        } catch (_) {
            this.serverAvailable = false;
        }
    }

    setVal(id, val) {
        if (this.el[id]) this.el[id].value = val;
        if (this.el[id + '_range']) this.el[id + '_range'].value = val;
    }

    setVisualModeActive(modeId) {
        if (this.el.visualModeSelect) this.el.visualModeSelect.value = modeId;
        const bar = this.el['quick-mode-bar'];
        if (bar) {
            for (const btn of bar.children) {
                btn.classList.toggle('active', btn.dataset.mode === modeId);
            }
        }
    }

    setPerfModeValue(mode) {
        if (this.el.perfModeSelect) this.el.perfModeSelect.value = mode;
    }

    setShadingFxValue(fx) {
        if (this.el.floraShadingFx) this.el.floraShadingFx.value = String(fx);
        this.setSoundControlsVisible(fx === 4);
    }

    setSoundControlsVisible(visible) {
        if (this.el['sound-controls']) {
            this.el['sound-controls'].style.display = visible ? 'block' : 'none';
        }
    }

    setBeatButtonState(playing) {
        const btn = this.el['beat-synth-btn'];
        if (!btn) return;
        btn.textContent = playing ? '⏸️ Pause Beat' : '▶️ Start Beat Pulse (130 BPM)';
        btn.style.background = playing ? '#285e1b' : '#4a1e78';
    }

    setMicButtonState(active) {
        const btn = this.el['mic-input-btn'];
        if (!btn) return;
        btn.textContent = active ? '🔴 Stop Mic Input' : '🎤 Use Mic Input';
        btn.style.background = active ? '#8c2424' : '#1b4d6b';
    }

    setFollowChecked(checked) {
        if (this.el['cam-follow-cb']) this.el['cam-follow-cb'].checked = !!checked;
    }

    setCoordModeValue(val) {
        if (this.el.coordMode) this.el.coordMode.value = val;
    }

    setSimButtonState(active) {
        const btn = this.el['sim-player-btn'];
        if (!btn) return;
        if (active) {
            btn.textContent = '⏹️ Stop Player';
            btn.style.background = '#dc2626';
            btn.style.borderColor = '#ef4444';
        } else {
            btn.textContent = '🏎️ Simulate Player';
            btn.style.background = '#1d4ed8';
            btn.style.borderColor = '#3b82f6';
        }
    }

    loadConfigToUi(ringIdx, cfg, extra = {}) {
        const r = cfg.rings[ringIdx] || cfg.rings[0];
        if (r) {
            this.setVal('cellSize', r.cellSize);
            this.setVal('bladesPerTuft', r.bladesPerTuft);
            this.setVal('bladeWidth', r.bladeWidth);
            this.setVal('maxBladeHeight', r.maxBladeHeight);
            this.setVal('segments', r.segments);
            this.setVal('patchSize', r.patchSize);
            this.setVal('fadeInMin', r.fadeInMin);
            this.setVal('fadeInMax', r.fadeInMax);
            this.setVal('fadeOutMin', r.fadeOutMin);
            this.setVal('fadeOutMax', r.fadeOutMax);
            this.setVal('leanMin', r.leanMin);
            this.setVal('leanMax', r.leanMax);
            this.setVal('curveMin', r.curveMin);
            this.setVal('curveMax', r.curveMax);
            this.setVal('hScaleMin', r.hScaleMin);
            this.setVal('hScaleMax', r.hScaleMax);
        }

        this.setVal('curvature', cfg.curvature ?? 0.35);
        this.setVal('stiffness', cfg.stiffness ?? 1.0);
        this.setVal('translucency', cfg.translucency ?? 0.65);
        this.setVal('patchiness', cfg.patchiness ?? 0.40);
        this.setVal('densityDropoff', cfg.densityDropoff ?? 0.55);
        this.setVal('radialJitterAmp', cfg.radialJitterAmp ?? 5.8);
        this.setVal('boundaryMargin', cfg.boundaryMargin ?? 8.0);

        if (cfg.adaptiveDensity) {
            if (this.el.adaptiveEnabled) this.el.adaptiveEnabled.checked = !!cfg.adaptiveDensity.enabled;
            this.setVal('targetTris', cfg.adaptiveDensity.targetTrianglesPerRing ?? 1200000);
            this.setVal('cullComp', cfg.adaptiveDensity.cullingCompensation ?? 1.35);
        }

        if (cfg.flora) {
            this.setVal('flowerFreq', cfg.flora.flowerFrequency ?? 0.08);
            this.setVal('cloverFreq', cfg.flora.cloverFrequency ?? 0.10);
            this.setVal('wheatFreq', cfg.flora.wheatFrequency ?? 0.08);
            this.setVal('twistIntensity', cfg.flora.twistIntensity ?? 0.95);
            const fc = cfg.flora.flowerColors || [];
            if (fc[0] && this.el.flowerCol0) this.el.flowerCol0.value = vec3ToHex(fc[0]);
            if (fc[1] && this.el.flowerCol1) this.el.flowerCol1.value = vec3ToHex(fc[1]);
            if (fc[2] && this.el.flowerCol2) this.el.flowerCol2.value = vec3ToHex(fc[2]);
            if (fc[3] && this.el.flowerCol3) this.el.flowerCol3.value = vec3ToHex(fc[3]);
        }

        if (cfg.colors) {
            if (cfg.colors.colRoot && this.el.colRoot) this.el.colRoot.value = vec3ToHex(cfg.colors.colRoot);
            if (cfg.colors.colLower && this.el.colLower) this.el.colLower.value = vec3ToHex(cfg.colors.colLower);
            if (cfg.colors.colMid && this.el.colMid) this.el.colMid.value = vec3ToHex(cfg.colors.colMid);
            if (cfg.colors.colUpper && this.el.colUpper) this.el.colUpper.value = vec3ToHex(cfg.colors.colUpper);
            if (cfg.colors.colTip && this.el.colTip) this.el.colTip.value = vec3ToHex(cfg.colors.colTip);
        }

        if (extra.terrainRelief !== undefined) {
            this.setVal('terrainRelief', extra.terrainRelief);
        }

        this.dumpConfig(cfg);
    }

    syncUiToConfig(ringIdx, cfg) {
        const r = cfg.rings[ringIdx] || cfg.rings[0];
        if (r) {
            r.cellSize = parseFloat(this.el.cellSize?.value || r.cellSize);
            r.bladesPerTuft = parseInt(this.el.bladesPerTuft?.value || r.bladesPerTuft, 10);
            r.bladeWidth = parseFloat(this.el.bladeWidth?.value || r.bladeWidth);
            r.maxBladeHeight = parseFloat(this.el.maxBladeHeight?.value || r.maxBladeHeight);
            r.segments = parseInt(this.el.segments?.value || r.segments, 10);
            r.patchSize = parseFloat(this.el.patchSize?.value || r.patchSize);
            r.fadeInMin = parseFloat(this.el.fadeInMin?.value || r.fadeInMin);
            r.fadeInMax = parseFloat(this.el.fadeInMax?.value || r.fadeInMax);
            r.fadeOutMin = parseFloat(this.el.fadeOutMin?.value || r.fadeOutMin);
            r.fadeOutMax = parseFloat(this.el.fadeOutMax?.value || r.fadeOutMax);
            r.leanMin = parseFloat(this.el.leanMin?.value || r.leanMin);
            r.leanMax = parseFloat(this.el.leanMax?.value || r.leanMax);
            r.curveMin = parseFloat(this.el.curveMin?.value || r.curveMin);
            r.curveMax = parseFloat(this.el.curveMax?.value || r.curveMax);
            r.hScaleMin = parseFloat(this.el.hScaleMin?.value || r.hScaleMin);
            r.hScaleMax = parseFloat(this.el.hScaleMax?.value || r.hScaleMax);
        }

        cfg.curvature = parseFloat(this.el.curvature?.value || cfg.curvature);
        cfg.stiffness = parseFloat(this.el.stiffness?.value || cfg.stiffness);
        cfg.translucency = parseFloat(this.el.translucency?.value || cfg.translucency);
        cfg.patchiness = parseFloat(this.el.patchiness?.value || cfg.patchiness);
        cfg.densityDropoff = parseFloat(this.el.densityDropoff?.value || cfg.densityDropoff);
        cfg.radialJitterAmp = parseFloat(this.el.radialJitterAmp?.value || cfg.radialJitterAmp);
        cfg.boundaryMargin = parseFloat(this.el.boundaryMargin?.value || cfg.boundaryMargin);

        if (cfg.adaptiveDensity) {
            cfg.adaptiveDensity.enabled = !!this.el.adaptiveEnabled?.checked;
            cfg.adaptiveDensity.targetTrianglesPerRing = parseInt(this.el.targetTris?.value || 1200000, 10);
            cfg.adaptiveDensity.cullingCompensation = parseFloat(this.el.cullComp?.value || 1.35);
        }

        if (cfg.flora) {
            cfg.flora.flowerFrequency = parseFloat(this.el.flowerFreq?.value ?? cfg.flora.flowerFrequency);
            cfg.flora.cloverFrequency = parseFloat(this.el.cloverFreq?.value ?? cfg.flora.cloverFrequency);
            cfg.flora.wheatFrequency = parseFloat(this.el.wheatFreq?.value ?? cfg.flora.wheatFrequency);
            cfg.flora.twistIntensity = parseFloat(this.el.twistIntensity?.value ?? cfg.flora.twistIntensity);
            if (this.el.flowerCol0) cfg.flora.flowerColors[0] = hexToVec3(this.el.flowerCol0.value);
            if (this.el.flowerCol1) cfg.flora.flowerColors[1] = hexToVec3(this.el.flowerCol1.value);
            if (this.el.flowerCol2) cfg.flora.flowerColors[2] = hexToVec3(this.el.flowerCol2.value);
            if (this.el.flowerCol3) cfg.flora.flowerColors[3] = hexToVec3(this.el.flowerCol3.value);
        }

        if (cfg.colors) {
            if (this.el.colRoot) cfg.colors.colRoot = hexToVec3(this.el.colRoot.value);
            if (this.el.colLower) cfg.colors.colLower = hexToVec3(this.el.colLower.value);
            if (this.el.colMid) cfg.colors.colMid = hexToVec3(this.el.colMid.value);
            if (this.el.colUpper) cfg.colors.colUpper = hexToVec3(this.el.colUpper.value);
            if (this.el.colTip) cfg.colors.colTip = hexToVec3(this.el.colTip.value);
        }

        this.dumpConfig(cfg);
    }

    getColorsFromUi() {
        return {
            colors: {
                colRoot: hexToVec3(this.el.colRoot?.value),
                colLower: hexToVec3(this.el.colLower?.value),
                colMid: hexToVec3(this.el.colMid?.value),
                colUpper: hexToVec3(this.el.colUpper?.value),
                colTip: hexToVec3(this.el.colTip?.value)
            },
            flowerColors: [
                hexToVec3(this.el.flowerCol0?.value),
                hexToVec3(this.el.flowerCol1?.value),
                hexToVec3(this.el.flowerCol2?.value),
                hexToVec3(this.el.flowerCol3?.value)
            ]
        };
    }

    dumpConfig(cfg) {
        if (this.el.paramDump) {
            this.el.paramDump.value = JSON.stringify(cfg, null, 2);
        }
    }

    updateStats({ modeLabel, activeBlades, activeTris, pooledBlades, vramMB, fps, densityPercent, perfMode, tier }) {
        if (this.el['stats-main']) {
            this.el['stats-main'].textContent =
                `🌿 ${modeLabel} | Blades: ${activeBlades.toLocaleString()} | Tris: ${activeTris.toLocaleString()}`;
        }
        if (this.el['stats-sub']) {
            this.el['stats-sub'].textContent =
                `⚡ ${fps} FPS | Density: ${densityPercent}% (${perfMode.toUpperCase()} • ${tier.toUpperCase()} Pool: ${vramMB.toFixed(0)} MB)`;
        }
    }

    updateAudioLevels(bass, treble) {
        if (this.el['audio-levels']) {
            this.el['audio-levels'].textContent = `Bass: ${bass.toFixed(2)} | Treble: ${treble.toFixed(2)}`;
        }
    }

    showToast(msg, isSuccess = true) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.style.display = 'block';
        t.style.borderColor = isSuccess ? '#00aa44' : '#dc3545';
        t.style.color = isSuccess ? '#55ff88' : '#ff8888';
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2800);
    }
}
