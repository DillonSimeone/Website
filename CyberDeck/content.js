// content.js — Off-screen canvas renderer with texture projection and mouse/scroll interaction.
import * as THREE from 'three';

const MOOD_DECK_GALLERY = [
    {
        url: './images/554009293-df5e4cd6-41c9-4f8a-bc78-de39ea63718a_16_k6AqXiNwtY.webp',
        caption: "A rugged Cyberdeck built by Jankbu meant for hacking on the go."
    },
    {
        url: './images/a698cc5251c24dbb3bb2c91a7cfd73d8.webp',
        caption: "Cyberdeck in a waterproof enclosure for programming when you're camping!"
    },
    {
        url: './images/cyberdeck.webp',
        caption: "Pocket form, useable as a shield if all goes wrong!"
    },
    {
        url: './images/pi-projector-featured.webp',
        caption: "Cinema on the go! This is Subir Bhaduri's deck. We'll be able to go smaller with ours!"
    },
    {
        url: './images/Screenshot-from-2023-08-25-13-20-00.webp',
        caption: "A pipboy cyberdeck?"
    }
];

export class ContentProjector {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        // Off-screen canvas — Upgraded for 1024 takeover
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = 1024;
        this.ctx = this.canvas.getContext('2d');

        this.footerHitAreas = []; // For link buttons
        this.hoveredFooter = -1;

        // Display plane
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;

        const geo = new THREE.PlaneGeometry(3, 3);
        const mat = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthTest: false, // Prevent voxels from clipping through
        });
        this.plane = new THREE.Mesh(geo, mat);
        this.plane.visible = false;
        this.plane.renderOrder = 20; // Ensure it's in front of everything
        this.plane.name = "ContentPlane"; // For identification
        this.plane.pointerEvents = 'none';
        this.scene.add(this.plane);

        // Raycaster for interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoverUV = null;

        // Content state
        this.scrollY = 0;
        this.maxScroll = 0;
        this.currentContent = null;
        this.targetOpacity = 0;
        this.targetOpacity = 0;
        this.items = [];
        this.itemBounds = []; // Store actual rects for perfect hit detection
        this.hoveredItem = -1;
        this.hoveredNav = null; // 'prev' or 'next'
        this.hoveredFooter = -1;
        this.onNavigate = null; // Callback for nav
        this.isMaximized = false;
        this.expansionProgress = 0;
        this.floatingPosition = new THREE.Vector3();
        this.floatingRotation = new THREE.Euler();
        this.maximizedPosition = new THREE.Vector3(0, 0, 8); // Perfect center now that scale is dynamic
        this.baseScale = 3.0;

        // Bind events
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseWheel = this._onMouseWheel.bind(this);
        this._onClick = this._onClick.bind(this);

        const target = this.renderer.domElement; // Only listen on the 3D canvas
        target.addEventListener('mousemove', this._onMouseMove);
        target.addEventListener('wheel', this._onMouseWheel, { passive: false });
        target.addEventListener('click', this._onClick);

        // Load images for mooddeck
        this.moodImages = [];
        MOOD_DECK_GALLERY.forEach((entry, idx) => {
            const img = new Image();
            img.src = entry.url;
            img.onload = () => {
                this.moodImages[idx] = img;
            };
        });
        this.currentMoodImage = null;
        this.currentMoodImageIndex = -1;
        this.moodImageOpacity = 0;
        this.moodImageState = 'fadein';
        this.moodImageTimer = 0;
    }

    show(content, position, lookDir, themeColor) {
        this.currentContent = content;
        this.themeColor = themeColor || '#33ff33';
        this.scrollY = 0;
        this.items = content.items || [];
        this.hoveredItem = -1;

        // Position the plane near the target, facing the camera
        this.plane.position.copy(position);
        this.plane.position.y = 0.5;
        this.floatingPosition.copy(position);
        this.floatingPosition.y = 0.5;
        this.plane.lookAt(
            position.x + lookDir.x,
            position.y + lookDir.y,
            position.z + lookDir.z
        );
        this.floatingRotation.copy(this.plane.rotation);
        this.plane.visible = true;
        this.targetOpacity = 0.95;
        this.isMaximized = true; // Auto-maximize when shown

        this._renderCanvas();
    }

    hide() {
        this.targetOpacity = 0;
        this.currentContent = null;
        this.isMaximized = false;
    }

    _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        let currentY = y;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
        return currentY;
    }

    _renderCanvas() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const time = performance.now() * 0.001;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // 1. Cyber-Glass Backdrop
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, 'rgba(10, 15, 25, 0.95)');
        bgGrad.addColorStop(1, 'rgba(5, 5, 10, 0.98)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // 2. Decorative Grid / Scanlines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 15) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let x = 0; x < w; x += 15) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }

        // 3. Frame & Corner Accents
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, w - 40, h - 40);

        // Tech borders
        ctx.fillStyle = this.themeColor;
        ctx.fillRect(20, 40, 4, 100);
        ctx.fillRect(w - 24, h - 140, 4, 100);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '14px monospace';
        ctx.fillText(`SYS_MEM: ${Math.floor(Math.abs(Math.sin(time)) * 999)}TB`, 40, 45);
        ctx.textAlign = 'right';
        ctx.fillText(`UPLINK_SEC: ACTIVE`, w - 40, h - 30);

        // Glowy Corners
        const cl = 80; // corner length
        ctx.strokeStyle = this.themeColor;
        ctx.lineWidth = 6;
        const pad = 20;
        // Top Left
        ctx.beginPath(); ctx.moveTo(pad, pad + cl); ctx.lineTo(pad, pad); ctx.lineTo(pad + cl, pad); ctx.stroke();
        // Top Right
        ctx.beginPath(); ctx.moveTo(w - pad - cl, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + cl); ctx.stroke();
        // Bottom Left
        ctx.beginPath(); ctx.moveTo(pad, h - pad - cl); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + cl, h - pad); ctx.stroke();
        // Bottom Right
        ctx.beginPath(); ctx.moveTo(w - pad - cl, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - cl); ctx.stroke();

        if (!this.currentContent) return;

        const offsetY = -this.scrollY;

        // 4. Header Section
        ctx.save();
        ctx.translate(0, offsetY);

        // Title Shadow Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.themeColor;
        const titleSize = this.isMobile ? 92 : 58;
        ctx.font = `bold ${titleSize}px monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(this.currentContent.title, w / 2, 90);

        // Animated Divider
        const divW = 600 + Math.sin(time * 3) * 50;
        const divX = (w - divW) / 2;

        ctx.fillStyle = this.themeColor;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(divX, 115, divW, 2);

        // Audio wave decorative elements under title
        for (let i = 0; i < 20; i++) {
            const barH = 5 + Math.random() * 15 * Math.abs(Math.sin(time * 5 + i));
            ctx.fillRect(divX + i * 8, 118, 4, barH);
            ctx.fillRect(divX + divW - i * 8 - 4, 118, 4, barH);
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();

        // 5. Items — Sleek Layout
        ctx.textAlign = 'left';
        let currentY = 180 + offsetY;
        this.itemBounds = [];

        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            const isHovered = (i === this.hoveredItem);
            const isObject = typeof item === 'object';
            const label = isObject ? item.label : item;
            const startY = currentY - 45;

            if (label.startsWith('──')) {
                // Category Header
                ctx.font = 'bold 22px monospace';
                ctx.fillStyle = this.themeColor;
                ctx.globalAlpha = 0.5;
                ctx.fillText(label, 80, currentY);
                ctx.globalAlpha = 1.0;
                currentY += 40;
            } else {
                // Interactive Row
                if (isHovered) {
                    ctx.fillStyle = this.themeColor;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = this.themeColor;
                    // Left accent line instead of full background
                    ctx.fillRect(80, startY + 15, 4, 35);
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.shadowBlur = 0;
                }

                ctx.font = this.isMobile ? 'bold 54px monospace' : '34px monospace';
                const labelText = `[ ${label} ]`;
                ctx.fillText(labelText, 100, currentY);

                // Visual hint for links: persistent underline for the whole label
                if (item.url || (item.links && item.links.length > 0) || (this.currentContent.footerLinks && i === 0)) {
                    const metrics = ctx.measureText(labelText);
                    ctx.save();
                    ctx.strokeStyle = this.themeColor;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(100, currentY + 6);
                    ctx.lineTo(100 + metrics.width, currentY + 6);
                    ctx.stroke();
                    ctx.restore();
                }

                ctx.shadowBlur = 0;

                if (isObject && item.details) {
                    currentY += this.isMobile ? 65 : 40;
                    const detailSize = this.isMobile ? 38 : 22;
                    const detailSpacing = this.isMobile ? 50 : 32;
                    ctx.font = `${detailSize}px monospace`;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

                    const detailsCleaned = item.details.replace(/\n/g, ' ');
                    currentY = this._wrapText(ctx, `// ${detailsCleaned}`, 140, currentY, 820, detailSpacing);
                    currentY += this.isMobile ? 60 : 35;
                } else {
                    currentY += this.isMobile ? 120 : 75;
                }
            }

            this.itemBounds.push({ top: startY, bottom: currentY - 20, isHeader: label.startsWith('──') });
        }

        // 6. Navigation Buttons
        const btnW = this.isMobile ? 400 : 320;
        const btnH = this.isMobile ? 100 : 80;
        const btnY = h - 140;
        const btnMargin = 60;

        const hasPrev = window.activePoseIndex > 0;
        const hasNext = window.activePoseIndex < 7;

        if (hasPrev && hasNext) {
            this._drawNavButton(ctx, `[ PREV_SECTOR ]`, btnMargin, btnY, btnW, btnH, this.hoveredNav === 'prev');
            this._drawNavButton(ctx, `[ NEXT_SECTOR ]`, w - btnW - btnMargin, btnY, btnW, btnH, this.hoveredNav === 'next');
        } else if (hasPrev) {
            this._drawNavButton(ctx, `[ PREV_SECTOR ]`, (w - btnW) / 2, btnY, btnW, btnH, this.hoveredNav === 'prev');
        } else if (hasNext) {
            this._drawNavButton(ctx, `[ NEXT_SECTOR ]`, (w - btnW) / 2, btnY, btnW, btnH, this.hoveredNav === 'next');
        }

        // 7. Cyber Scrollbar
        this.maxScroll = Math.max(0, currentY - offsetY - h + 100);
        if (this.maxScroll > 0) {
            const barAreaH = h - 120;
            const barH = Math.max(40, (h / (h + this.maxScroll)) * barAreaH);
            const barY = (this.scrollY / this.maxScroll) * (barAreaH - barH) + 60;

            // Track
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(w - 35, 60, 4, barAreaH);

            // Thumb
            ctx.fillStyle = this.themeColor;
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.themeColor;
            ctx.fillRect(w - 38, barY, 10, barH);
            ctx.shadowBlur = 0;
        }

        // 8. Mooddeck Image Overlay
        if (window.activePoseIndex === 7 && this.currentMoodImage && this.moodImageOpacity > 0) {
            ctx.save();
            ctx.globalAlpha = this.moodImageOpacity * 0.9;
            const imgW = 440;
            const imgH = 290;
            const imgX = (w - imgW) / 2;
            const imgY = 400 + offsetY;

            ctx.strokeStyle = this.themeColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(imgX - 5, imgY - 5, imgW + 10, imgH + 10);
            ctx.drawImage(this.currentMoodImage, imgX, imgY, imgW, imgH);

            // Draw Caption
            const captionText = MOOD_DECK_GALLERY[this.currentMoodImageIndex]?.caption || "";
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.font = "italic 16px monospace";
            ctx.textAlign = "center";
            this._wrapText(ctx, captionText, w / 2, imgY + imgH + 30, 480, 22);

            ctx.restore();
        }

        // 7. Footer Links (Rugged Bottom Dock with flex-wrap logic)
        this.footerHitAreas = [];
        if (this.currentContent.footerLinks) {
            const links = this.currentContent.footerLinks;
            const linkW = this.isMobile ? 320 : 260;
            const linkH = this.isMobile ? 65 : 45;
            const gap = 15;
            const maxRowW = w - 100;

            const rows = [];
            let currentRow = [];
            let currentRowW = 0;
            for (let i = 0; i < links.length; i++) {
                const itemW = linkW;
                if (currentRow.length > 0 && currentRowW + gap + itemW > maxRowW) {
                    rows.push(currentRow);
                    currentRow = [];
                    currentRowW = 0;
                }
                currentRow.push({ link: links[i], originalIndex: i });
                currentRowW += (currentRow.length === 1 ? 0 : gap) + itemW;
            }
            if (currentRow.length > 0) {
                rows.push(currentRow);
            }

            const rowHeight = linkH + gap;
            const totalFooterH = rows.length * rowHeight - gap;
            const dockStartY = h - (this.isMobile ? 260 : 200) - totalFooterH;

            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                const rowW = row.length * linkW + (row.length - 1) * gap;
                let startX = (w - rowW) / 2;
                const rowY = dockStartY + rowIndex * rowHeight;

                for (let i = 0; i < row.length; i++) {
                    const item = row[i];
                    const link = item.link;
                    const originalIndex = item.originalIndex;
                    const isHovered = this.hoveredFooter === originalIndex;

                    ctx.save();
                    ctx.translate(startX, rowY);

                    // Button Plate
                    ctx.fillStyle = isHovered ? this.themeColor : 'rgba(255, 255, 255, 0.05)';
                    ctx.globalAlpha = isHovered ? 0.2 : 1.0;
                    ctx.fillRect(0, 0, linkW, linkH);

                    ctx.strokeStyle = isHovered ? this.themeColor : 'rgba(51, 255, 51, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(0, 0, linkW, linkH);

                    // Text
                    ctx.fillStyle = isHovered ? this.themeColor : '#ffffff';
                    ctx.globalAlpha = 1.0;
                    ctx.font = 'bold 15px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(`[ ${link.label.toUpperCase()} ]`, linkW / 2, linkH / 2 + 5);

                    // Icon hint
                    ctx.font = '8px monospace';
                    ctx.fillText("EXTERNAL_LINK", linkW / 2, 10);

                    ctx.restore();

                    this.footerHitAreas.push({ x: startX, y: rowY, w: linkW, h: linkH, url: link.url });
                    startX += linkW + gap;
                }
            }
        }

        this.texture.needsUpdate = true;
    }

    _drawNavButton(ctx, label, x, y, w, h, isHovered) {
        ctx.save();
        if (isHovered) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.themeColor;
            ctx.fillStyle = this.themeColor;
            ctx.globalAlpha = 0.2;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = this.themeColor;
            ctx.lineWidth = 4;
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        }

        ctx.strokeRect(x, y, w, h);
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w / 2, y + h / 2 + 10);
        ctx.restore();
    }

    update(dt) {
        // Handle mooddeck image cycling
        if (window.activePoseIndex === 7 && this.moodImages.length > 0) {
            this.moodImageTimer += dt;
            if (!this.currentMoodImage) {
                this.currentMoodImageIndex = (this.currentMoodImageIndex + 1) % this.moodImages.length;
                this.currentMoodImage = this.moodImages[this.currentMoodImageIndex];
                this.moodImageOpacity = 0;
                this.moodImageState = 'fadein';
                this.moodImageTimer = 0;
            }

            if (this.moodImageState === 'fadein') {
                this.moodImageOpacity += dt * 1.5;
                if (this.moodImageOpacity >= 1.0) {
                    this.moodImageOpacity = 1.0;
                    this.moodImageState = 'visible';
                    this.moodImageTimer = 0;
                }
                this._renderCanvas();
            } else if (this.moodImageState === 'visible') {
                if (this.moodImageTimer > 3.0) {
                    this.moodImageState = 'fadeout';
                    this.moodImageTimer = 0;
                }
            } else if (this.moodImageState === 'fadeout') {
                this.moodImageOpacity -= dt * 1.5;
                if (this.moodImageOpacity <= 0) {
                    this.moodImageOpacity = 0;
                    this.moodImageState = 'waiting';
                    this.currentMoodImage = null;
                    this.moodImageTimer = 0;
                }
                this._renderCanvas();
            } else if (this.moodImageState === 'waiting') {
                if (this.moodImageTimer > 0.5) {
                    this.moodImageState = 'fadein';
                    this.currentMoodImageIndex = (this.currentMoodImageIndex + 1) % this.moodImages.length;
                    this.currentMoodImage = this.moodImages[this.currentMoodImageIndex];
                    this.moodImageTimer = 0;
                }
            }
        } else {
            this.currentMoodImage = null;
            this.moodImageOpacity = 0;
        }

        // Fade in/out — faster for Adaptive Compute
        const fadeSpeed = (window.activePoseIndex === 4) ? 12 : 4;
        const mat = this.plane.material;
        mat.opacity += (this.targetOpacity - mat.opacity) * dt * fadeSpeed;

        // 3D Expansion / Maximization logic
        const targetExpansion = this.isMaximized ? 1.0 : 0.0;
        this.expansionProgress += (targetExpansion - this.expansionProgress) * dt * 5.0;

        if (this.expansionProgress > 0.001) {
            // Lerp position toward camera center
            const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            const dist = this.maximizedPosition.z; // 8
            const targetPos = this.camera.position.clone()
                .add(camDir.multiplyScalar(dist))
                .add(new THREE.Vector3(this.maximizedPosition.x, this.maximizedPosition.y, 0).applyQuaternion(this.camera.quaternion));

            this.plane.position.lerpVectors(this.floatingPosition, targetPos, this.expansionProgress);

            // Lerp rotation to face camera perfectly
            this.plane.quaternion.slerpQuaternions(
                new THREE.Quaternion().setFromEuler(this.floatingRotation),
                this.camera.quaternion,
                this.expansionProgress
            );

            // Dynamically calculate scale to fit viewport (80% margin)
            const vFov = this.camera.fov * Math.PI / 180;
            const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
            const visibleWidth = visibleHeight * this.camera.aspect;

            const margin = this.isMobile ? 1.0 : 0.9;
            const targetSize = Math.min(visibleHeight * margin, visibleWidth * margin);
            const dynamicMaxScale = targetSize / 3.0; // 3.0 is plane base geometry size

            const currentScale = THREE.MathUtils.lerp(this.baseScale, dynamicMaxScale, this.expansionProgress);
            this.plane.scale.setScalar(currentScale);
        } else {
            this.plane.position.copy(this.floatingPosition);
            this.plane.rotation.copy(this.floatingRotation);
            this.plane.scale.setScalar(this.baseScale);
        }

        if (mat.opacity < 0.01 && this.targetOpacity === 0) {
            this.plane.visible = false;
        }

        // Raycast for hover detection
        if (this.plane.visible && this.currentContent) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObject(this.plane);

            if (hits.length > 0) {
                const uv = hits[0].uv;
                this.hoverUV = uv;

                // Map UV to item index using pre-calculated bounds
                const canvasY = (1.0 - uv.y) * this.canvas.height;
                const canvasX = uv.x * this.canvas.width;
                const scrollAdjustedY = canvasY + this.scrollY;

                // Nav check
                let newNav = null;
                const btnY = this.canvas.height - 140;
                const btnH = 80;
                const btnW = 320;
                const btnMargin = 60;

                const hasPrev = window.activePoseIndex > 0;
                const hasNext = window.activePoseIndex < 6;

                if (canvasY >= btnY && canvasY <= btnY + btnH) {
                    if (hasPrev && hasNext) {
                        if (canvasX >= btnMargin && canvasX <= btnMargin + btnW) newNav = 'prev';
                        else if (canvasX >= this.canvas.width - btnW - btnMargin && canvasX <= this.canvas.width - btnMargin) newNav = 'next';
                    } else if (hasPrev) {
                        const centerX = (this.canvas.width - btnW) / 2;
                        if (canvasX >= centerX && canvasX <= centerX + btnW) newNav = 'prev';
                    } else if (hasNext) {
                        const centerX = (this.canvas.width - btnW) / 2;
                        if (canvasX >= centerX && canvasX <= centerX + btnW) newNav = 'next';
                    }
                }

                // Footer link check
                let newFooter = -1;
                for (let i = 0; i < this.footerHitAreas.length; i++) {
                    const area = this.footerHitAreas[i];
                    if (canvasX >= area.x && canvasX <= area.x + area.w &&
                        canvasY >= area.y && canvasY <= area.y + area.h) {
                        newFooter = i;
                        break;
                    }
                }

                if (newFooter !== this.hoveredFooter) {
                    this.hoveredFooter = newFooter;
                    this._renderCanvas();
                }

                if (newNav !== this.hoveredNav) {
                    this.hoveredNav = newNav;
                    this._renderCanvas();
                }

                let foundIndex = -1;
                for (let i = 0; i < this.itemBounds.length; i++) {
                    const b = this.itemBounds[i];
                    if (!b.isHeader && scrollAdjustedY >= b.top && scrollAdjustedY <= b.bottom) {
                        foundIndex = i;
                        break;
                    }
                }

                if (foundIndex !== this.hoveredItem) {
                    this.hoveredItem = foundIndex;
                    this._renderCanvas();
                }
            } else {
                if (this.hoveredItem !== -1) {
                    this.hoveredItem = -1;
                    this._renderCanvas();
                }
                this.hoverUV = null;
            }
        }
    }

    _onMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }

    _onMouseWheel(e) {
        if (!this.plane.visible || !this.currentContent) return;

        // Only scroll if mouse is over the plane
        if (this.hoverUV) {
            this.scrollY = Math.max(0, Math.min(this.maxScroll, this.scrollY + e.deltaY * 0.5));
            this._renderCanvas();
            e.preventDefault();
        }
    }

    _onClick(e) {
        if (!this.plane.visible) return;

        // Force a raycast update on click to ensure accurate UV mapping for mobile taps
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObject(this.plane);
        if (hits.length === 0) return;

        const uv = hits[0].uv;
        const canvasX = uv.x * this.canvas.width;
        const canvasY = (1.0 - uv.y) * this.canvas.height;
        const scrollAdjustedY = canvasY + this.scrollY;

        // 0. Mood Deck Image Click Detection (Skip to next image)
        if (window.activePoseIndex === 7 && this.currentMoodImage) {
            const imgW = 440;
            const imgH = 290;
            const imgX = (this.canvas.width - imgW) / 2;
            const drawnY = 400 - this.scrollY;
            if (canvasX >= imgX && canvasX <= imgX + imgW &&
                canvasY >= drawnY && canvasY <= drawnY + imgH) {
                this.moodImageState = 'fadeout';
                this.moodImageTimer = 3.5;
                return;
            }
        }

        // 1. Navigation Button Detection
        const btnY = this.canvas.height - 140;
        const btnH = 80;
        const btnW = 320;
        const btnMargin = 60;
        const hasPrev = window.activePoseIndex > 0;
        const hasNext = window.activePoseIndex < 7;

        if (canvasY >= btnY && canvasY <= btnY + btnH && this.onNavigate) {
            if (hasPrev && hasNext) {
                if (canvasX >= btnMargin && canvasX <= btnMargin + btnW) return this.onNavigate('prev');
                if (canvasX >= this.canvas.width - btnW - btnMargin && canvasX <= this.canvas.width - btnMargin) return this.onNavigate('next');
            } else {
                const centerX = (this.canvas.width - btnW) / 2;
                if (canvasX >= centerX && canvasX <= centerX + btnW) return this.onNavigate(hasPrev ? 'prev' : 'next');
            }
        }

        // 2. Footer Link Detection
        if (this.footerHitAreas) {
            for (const area of this.footerHitAreas) {
                if (canvasX >= area.x && canvasX <= area.x + area.w &&
                    canvasY >= area.y && canvasY <= area.y + area.h) {
                    window.open(area.url, '_blank');
                    return;
                }
            }
        }

        // 3. Item Selection Detection
        if (this.itemBounds) {
            for (let i = 0; i < this.itemBounds.length; i++) {
                const b = this.itemBounds[i];
                if (!b.isHeader && scrollAdjustedY >= b.top && scrollAdjustedY <= b.bottom) {
                    const item = this.items[i];
                    console.log('Interacted with:', item.label || item);
                    return;
                }
            }
        }
    }

    dispose() {
        const target = this.renderer.domElement;
        target.removeEventListener('mousemove', this._onMouseMove);
        target.removeEventListener('wheel', this._onMouseWheel);
        target.removeEventListener('click', this._onClick);
    }
}
