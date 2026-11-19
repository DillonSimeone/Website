// hud.js — Glassmorphic Racing HUD, 2D Minimap, Progress Bar & Upgrade Modal

export class RaceHud {
    constructor() {
        this.container = document.getElementById('race-hud');
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

        // HUD Elements
        this.speedValue = document.getElementById('hud-speed-val');
        this.speedUnit = document.getElementById('hud-speed-unit');
        this.boostBar = document.getElementById('hud-boost-fill');
        this.progressFill = document.getElementById('hud-progress-fill');
        this.playerPin = document.getElementById('hud-progress-player');
        this.distValue = document.getElementById('hud-dist-val');
        this.timeValue = document.getElementById('hud-time-val');
        this.rankValue = document.getElementById('hud-rank-val');
        this.fpsValue = document.getElementById('hud-fps-val');
        this.densityBadge = document.getElementById('hud-density-badge');
        this.visualModeBtn = document.getElementById('hud-visual-mode-btn');
        this.visualModeLabel = document.getElementById('hud-visual-mode-label');
        this.perfModeBtn = document.getElementById('hud-perf-mode-btn');
        this.perfModeLabel = document.getElementById('hud-perf-mode-label');
        this.ascendBadge = document.getElementById('hud-ascend-badge');

        // Modal Elements
        this.upgradeModal = document.getElementById('upgrade-modal');
        this.upgradeCardsContainer = document.getElementById('upgrade-cards');
        this.finishModal = document.getElementById('finish-modal');

        // Minimap bounds
        this.mapMinX = 0;
        this.mapMaxX = 1;
        this.mapMinZ = 0;
        this.mapMaxZ = 1;

        // Callbacks
        this.onUpgradeSelect = null;
        this.onRetry = null;
        this.onGarage = null;
    }

    initTrack(trackData) {
        if (!this.minimapCanvas) return;
        const pts = trackData.points;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }
        const margin = 20;
        this.mapMinX = minX - margin;
        this.mapMaxX = maxX + margin;
        this.mapMinZ = minZ - margin;
        this.mapMaxZ = maxZ + margin;
    }

    update(state) {
        const {
            speed,
            maxSpeed,
            boostLeft,
            boostMax,
            progress,
            elapsedTime,
            rank,
            totalRacers,
            canAscend,
            isAscended,
            playerPos,
            rivalPositions,
            trackPoints
        } = state;

        // 1. Speedometer
        const speedKmh = Math.max(0, Math.round(speed * 3.6));
        if (this.speedValue) this.speedValue.textContent = speedKmh;

        // 2. Boost Fill
        if (this.boostBar) {
            const bPct = Math.min(100, Math.max(0, (boostLeft / boostMax) * 100));
            this.boostBar.style.width = `${bPct}%`;
        }

        // 3. Track Progress & Distance
        const pPct = Math.min(100, Math.max(0, progress * 100));
        if (this.progressFill) this.progressFill.style.width = `${pPct}%`;
        if (this.playerPin) this.playerPin.style.left = `${pPct}%`;
        if (this.distValue && state.distanceDriven !== undefined) {
            this.distValue.textContent = `${(state.distanceDriven / 1000).toFixed(2)} KM`;
        }

        // 4. Time
        if (this.timeValue) {
            const mins = Math.floor(elapsedTime / 60);
            const secs = Math.floor(elapsedTime % 60);
            const ms = Math.floor((elapsedTime % 1) * 100);
            this.timeValue.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
        }

        // 5. FPS Counter, Dynamic Density & Rank
        if (this.fpsValue) {
            this.fpsValue.textContent = state.fps !== undefined ? Math.round(state.fps) : '60';
        } else if (this.rankValue) {
            this.rankValue.textContent = `${rank}/${totalRacers}`;
        }
        if (this.densityBadge && state.densityPercent !== undefined) {
            this.densityBadge.textContent = `${state.densityPercent}%`;
        }

        // 6. Ascension Badge
        if (this.ascendBadge) {
            if (isAscended) {
                this.ascendBadge.textContent = '★ ASCENDING TO THE STARS ★';
                this.ascendBadge.className = 'hud-badge ascended pulse';
                this.ascendBadge.style.display = 'block';
            } else if (canAscend) {
                this.ascendBadge.textContent = 'STAR VELOCITY READY!';
                this.ascendBadge.className = 'hud-badge ready';
                this.ascendBadge.style.display = 'block';
            } else {
                this.ascendBadge.style.display = 'none';
            }
        }

        // 7. Render Multi-Directional 2D Network Radar Minimap
        this._drawMinimap(state.trackData || trackPoints, playerPos, state.playerHeading || 0, rivalPositions);
    }

    _drawMinimap(trackSource, playerPos, playerHeading, rivalPositions) {
        if (!this.minimapCtx || !trackSource) return;
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;

        ctx.clearRect(0, 0, w, h);

        const cx = playerPos ? playerPos.x : 0;
        const cz = playerPos ? playerPos.z : 0;
        const range = 240.0;
        const scaleX = (x) => ((x - (cx - range)) / (range * 2.0)) * (w - 24) + 12;
        const scaleZ = (z) => ((z - (cz - range)) / (range * 2.0)) * (h - 24) + 12;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const graph = trackSource.graph;
        if (graph && graph.edges) {
            // Draw every road edge in the active multi-directional network
            ctx.lineWidth = 4.5;
            for (const edge of graph.edges.values()) {
                const pts = edge.points;
                if (!pts || pts.length < 2) continue;
                ctx.strokeStyle = (edge.profile === 'smooth_hill_ramp' || edge.profile === 'elevated_causeway' || edge.profile === 'overpass_link')
                    ? 'rgba(0, 242, 254, 0.55)'
                    : 'rgba(255, 255, 255, 0.35)';
                ctx.beginPath();
                for (let i = 0; i < pts.length; i += 2) {
                    const px = scaleX(pts[i].x);
                    const py = scaleZ(pts[i].z);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                const last = pts[pts.length - 1];
                ctx.lineTo(scaleX(last.x), scaleZ(last.z));
                ctx.stroke();
            }

            // Draw junctions and roundabouts
            for (const node of graph.nodes.values()) {
                const nx = scaleX(node.x);
                const ny = scaleZ(node.z);
                if (nx < -20 || nx > w + 20 || ny < -20 || ny > h + 20) continue;
                const rPx = Math.max(3, (node.plazaRadius / (range * 2.0)) * (w - 24));
                ctx.fillStyle = node.type === 'roundabout' ? 'rgba(246, 211, 101, 0.45)' : 'rgba(255, 255, 255, 0.38)';
                ctx.beginPath();
                ctx.arc(nx, ny, rPx, 0, Math.PI * 2);
                ctx.fill();
                if (node.type === 'roundabout') {
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(nx, ny, rPx * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else if (Array.isArray(trackSource) && trackSource.length > 0) {
            ctx.beginPath();
            ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            for (let i = 0; i < trackSource.length; i++) {
                const p = trackSource[i];
                const px = scaleX(p.x);
                const py = scaleZ(p.z);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        // Draw rivals (Red dots)
        if (rivalPositions) {
            ctx.fillStyle = '#ff4757';
            for (const rPos of rivalPositions) {
                const rx = scaleX(rPos.x);
                const ry = scaleZ(rPos.z);
                if (rx >= 0 && rx <= w && ry >= 0 && ry <= h) {
                    ctx.beginPath();
                    ctx.arc(rx, ry, 3.8, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Draw player directional chevron
        if (playerPos) {
            const px = scaleX(playerPos.x);
            const py = scaleZ(playerPos.z);
            const dirX = -Math.sin(playerHeading);
            const dirZ = -Math.cos(playerHeading);
            const angle = Math.atan2(dirZ, dirX);

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle);
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#00f2fe';
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-5, -5);
            ctx.lineTo(-2.5, 0);
            ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.shadowBlur = 0;
        }
    }

    showUpgradeModal(upgrades, onSelect) {
        if (!this.upgradeModal || !this.upgradeCardsContainer) return;
        this.upgradeCardsContainer.innerHTML = '';
        this.onUpgradeSelect = onSelect;

        for (const upg of upgrades) {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `
                <div class="upgrade-icon">${upg.icon || '⚡'}</div>
                <div class="upgrade-title">${upg.title}</div>
                <div class="upgrade-detail">${upg.detail}</div>
                <button class="upgrade-btn">SELECT</button>
            `;
            card.querySelector('.upgrade-btn').addEventListener('click', () => {
                this.hideUpgradeModal();
                if (this.onUpgradeSelect) this.onUpgradeSelect(upg);
            });
            this.upgradeCardsContainer.appendChild(card);
        }

        this.upgradeModal.classList.add('visible');
    }

    hideUpgradeModal() {
        if (this.upgradeModal) {
            this.upgradeModal.classList.remove('visible');
        }
    }

    showFinishModal(results, onRetry, onGarage) {
        if (!this.finishModal) return;
        this.onRetry = onRetry;
        this.onGarage = onGarage;

        const title = document.getElementById('finish-title');
        const subtitle = document.getElementById('finish-subtitle');
        const statsList = document.getElementById('finish-stats');

        if (title) {
            title.textContent = results.ascended ? '★ ASCENSION REACHED ★' : 'RACE COMPLETE!';
            title.className = results.ascended ? 'finish-ascended' : 'finish-normal';
        }
        if (subtitle) {
            subtitle.textContent = results.ascended
                ? 'Your vehicle achieved escape velocity and broke free into the cosmos!'
                : `Finished in Rank ${results.rank}!`;
        }

        if (statsList) {
            statsList.innerHTML = `
                <div class="stat-row"><span>Time:</span><strong>${results.time}</strong></div>
                <div class="stat-row"><span>Top Speed:</span><strong>${results.topSpeed} km/h</strong></div>
                <div class="stat-row"><span>Drift Score:</span><strong>${Math.round(results.driftScore)} pts</strong></div>
                <div class="stat-row"><span>Vehicle Mass:</span><strong>${results.mass.toFixed(2)} tons</strong></div>
                <div class="stat-row"><span>Launch Energy:</span><strong>${results.launchEnergy.toFixed(1)}</strong></div>
            `;
        }

        const retryBtn = document.getElementById('finish-retry-btn');
        const garageBtn = document.getElementById('finish-garage-btn');

        if (retryBtn) retryBtn.onclick = () => {
            this.finishModal.classList.remove('visible');
            if (this.onRetry) this.onRetry();
        };
        if (garageBtn) garageBtn.onclick = () => {
            this.finishModal.classList.remove('visible');
            if (this.onGarage) this.onGarage();
        };

        this.finishModal.classList.add('visible');
    }

    hideFinishModal() {
        if (this.finishModal) {
            this.finishModal.classList.remove('visible');
        }
    }

    setVisualModeDisplay(mode) {
        if (this.visualModeLabel && mode) {
            this.visualModeLabel.textContent = `${mode.icon} ${mode.shortName}`;
        }
    }

    setPerfModeDisplay(status) {
        if (!this.perfModeLabel || !status) return;
        const modeTag = status.mode === 'auto' ? 'Auto 60' : status.mode.toUpperCase();
        this.perfModeLabel.textContent = `⚡ ${modeTag} (${status.densityPercent}%)`;
        if (this.densityBadge) {
            this.densityBadge.textContent = `${status.densityPercent}%`;
        }
    }

    show() {
        if (this.container) this.container.style.display = 'block';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        this.hideUpgradeModal();
        this.hideFinishModal();
    }
}
