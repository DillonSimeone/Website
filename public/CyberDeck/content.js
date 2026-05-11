// content.js — Off-screen canvas renderer with texture projection and mouse/scroll interaction.
import * as THREE from 'three';

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
        ctx.fillText(`SYS_MEM: ${Math.floor(Math.abs(Math.sin(time))*999)}TB`, 40, 45);
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
        ctx.font = 'bold 58px monospace';
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

                ctx.font = '34px monospace';
                const labelText = `[ ${label} ]`;
                ctx.fillText(labelText, 100, currentY);
                
                // Visual hint for links: persistent underline for the whole label
                if (item.url || (item.links && item.links.length > 0)) {
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
                    currentY += 40;
                    ctx.font = '22px monospace';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    
                    const detailsCleaned = item.details.replace(/\n/g, ' '); 
                    currentY = this._wrapText(ctx, `// ${detailsCleaned}`, 140, currentY, 820, 32);
                    currentY += 35;
                } else {
                    currentY += 75;
                }
            }

            this.itemBounds.push({ top: startY, bottom: currentY - 20, isHeader: label.startsWith('──') });
        }

        // 6. Navigation Buttons
        const btnW = 320;
        const btnH = 80;
        const btnY = h - 140;
        const btnMargin = 60;
        
        const hasPrev = window.activePoseIndex > 0;
        // Access poses length from global window or assume 5 since there are 5 poses
        const hasNext = window.activePoseIndex < 4; 

        if (hasPrev && hasNext) {
            // Both buttons
            this._drawNavButton(ctx, `[ PREV_SECTOR ]`, btnMargin, btnY, btnW, btnH, this.hoveredNav === 'prev');
            this._drawNavButton(ctx, `[ NEXT_SECTOR ]`, w - btnW - btnMargin, btnY, btnW, btnH, this.hoveredNav === 'next');
        } else if (hasPrev) {
            // Only Prev, center it
            this._drawNavButton(ctx, `[ PREV_SECTOR ]`, (w - btnW) / 2, btnY, btnW, btnH, this.hoveredNav === 'prev');
        } else if (hasNext) {
            // Only Next, center it
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

        // 7. Footer Links (Rugged Bottom Dock)
        this.footerHitAreas = [];
        if (this.currentContent.footerLinks) {
            const links = this.currentContent.footerLinks;
            const linkW = 280;
            const linkH = 50;
            const gap = 20;
            const totalW = links.length * linkW + (links.length - 1) * gap;
            let startX = (w - totalW) / 2;
            const dockY = h - 230; // Above nav buttons

            for (let i = 0; i < links.length; i++) {
                const link = links[i];
                const isHovered = this.hoveredFooter === i;
                
                ctx.save();
                ctx.translate(startX, dockY);
                
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
                ctx.font = 'bold 18px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`[ ${link.label.toUpperCase()} ]`, linkW / 2, 32);
                
                // Icon hint
                ctx.font = '10px monospace';
                ctx.fillText("EXTERNAL_LINK", linkW / 2, 12);
                
                ctx.restore();

                this.footerHitAreas.push({ x: startX, y: dockY, w: linkW, h: linkH, url: link.url });
                startX += linkW + gap;
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
            
            const targetSize = Math.min(visibleHeight * 0.9, visibleWidth * 0.9);
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
                const hasNext = window.activePoseIndex < 4;

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

        // 1. Navigation Button Detection
        const btnY = this.canvas.height - 140;
        const btnH = 80;
        const btnW = 320;
        const btnMargin = 60;
        const hasPrev = window.activePoseIndex > 0;
        const hasNext = window.activePoseIndex < 4;

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
