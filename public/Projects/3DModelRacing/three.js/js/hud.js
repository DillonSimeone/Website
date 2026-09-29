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
        this.timeValue = document.getElementById('hud-time-val');
        this.rankValue = document.getElementById('hud-rank-val');
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

        // 3. Track Progress
        const pPct = Math.min(100, Math.max(0, progress * 100));
        if (this.progressFill) this.progressFill.style.width = `${pPct}%`;
        if (this.playerPin) this.playerPin.style.left = `${pPct}%`;

        // 4. Time
        if (this.timeValue) {
            const mins = Math.floor(elapsedTime / 60);
            const secs = Math.floor(elapsedTime % 60);
            const ms = Math.floor((elapsedTime % 1) * 100);
            this.timeValue.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
        }

        // 5. Rank
        if (this.rankValue) {
            this.rankValue.textContent = `${rank}/${totalRacers}`;
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

        // 7. Render 2D Minimap
        this._drawMinimap(trackPoints, playerPos, rivalPositions);
    }

    _drawMinimap(trackPoints, playerPos, rivalPositions) {
        if (!this.minimapCtx || !trackPoints || trackPoints.length === 0) return;
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;

        ctx.clearRect(0, 0, w, h);

        const scaleX = (x) => ((x - this.mapMinX) / (this.mapMaxX - this.mapMinX)) * (w - 24) + 12;
        const scaleZ = (z) => ((z - this.mapMinZ) / (this.mapMaxZ - this.mapMinZ)) * (h - 24) + 12;

        // Draw track curve
        ctx.beginPath();
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < trackPoints.length; i++) {
            const px = scaleX(trackPoints[i].x);
            const py = scaleZ(trackPoints[i].z);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Draw rivals (Red dots)
        if (rivalPositions) {
            ctx.fillStyle = '#ff4757';
            for (const rPos of rivalPositions) {
                ctx.beginPath();
                ctx.arc(scaleX(rPos.x), scaleZ(rPos.z), 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw player (Glowing cyan dot)
        if (playerPos) {
            const px = scaleX(playerPos.x);
            const py = scaleZ(playerPos.z);

            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#00f2fe';
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0; // reset
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

    show() {
        if (this.container) this.container.style.display = 'block';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        this.hideUpgradeModal();
        this.hideFinishModal();
    }
}
