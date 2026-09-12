// content.js — Off-screen canvas renderer with texture projection and mouse/scroll interaction.
import * as THREE from 'three';

export class ContentProjector {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Off-screen canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 512;
        this.ctx = this.canvas.getContext('2d');

        // Display plane
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;

        const geo = new THREE.PlaneGeometry(3, 3);
        const mat = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthTest: true,
        });
        this.plane = new THREE.Mesh(geo, mat);
        this.plane.visible = false;
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
        this.items = [];
        this.hoveredItem = -1;

        // Bind events
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseWheel = this._onMouseWheel.bind(this);
        this._onClick = this._onClick.bind(this);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('wheel', this._onMouseWheel);
        window.addEventListener('click', this._onClick);
    }

    show(content, position, lookDir) {
        this.currentContent = content;
        this.scrollY = 0;
        this.items = content.items || [];
        this.hoveredItem = -1;

        // Position the plane near the target, facing the camera
        this.plane.position.copy(position);
        this.plane.lookAt(
            position.x + lookDir.x,
            position.y + lookDir.y,
            position.z + lookDir.z
        );
        this.plane.visible = true;
        this.targetOpacity = 0.95;

        this._renderCanvas();
    }

    hide() {
        this.targetOpacity = 0;
        this.currentContent = null;
    }

    _renderCanvas() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Semi-transparent dark background
        ctx.fillStyle = 'rgba(5, 5, 10, 0.85)';
        ctx.fillRect(0, 0, w, h);

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, w - 8, h - 8);

        if (!this.currentContent) return;

        const offsetY = -this.scrollY;

        // Title
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(this.currentContent.title, 30, 60 + offsetY);

        // Divider
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(30, 75 + offsetY, w - 60, 1);

        // Items
        ctx.font = '22px monospace';
        for (let i = 0; i < this.items.length; i++) {
            const y = 110 + i * 45 + offsetY;
            if (y < 20 || y > h - 10) continue;

            if (i === this.hoveredItem) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
                ctx.fillRect(20, y - 28, w - 40, 40);
                ctx.fillStyle = '#00ffff';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            }
            ctx.fillText(`› ${this.items[i]}`, 35, y);
        }

        // Scrollbar
        this.maxScroll = Math.max(0, (this.items.length * 45 + 120) - h);
        if (this.maxScroll > 0) {
            const barH = (h / (h + this.maxScroll)) * (h - 20);
            const barY = (this.scrollY / this.maxScroll) * (h - 20 - barH) + 10;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(w - 12, barY, 4, barH);
        }

        this.texture.needsUpdate = true;
    }

    update(dt) {
        // Fade in/out
        const mat = this.plane.material;
        mat.opacity += (this.targetOpacity - mat.opacity) * dt * 4;

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

                // Map UV to item index
                const canvasY = (1.0 - uv.y) * this.canvas.height + this.scrollY;
                const itemIndex = Math.floor((canvasY - 85) / 45);

                if (itemIndex >= 0 && itemIndex < this.items.length && itemIndex !== this.hoveredItem) {
                    this.hoveredItem = itemIndex;
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
        if (!this.plane.visible || this.hoveredItem === -1) return;
        // Future: dispatch click events for navigation
        console.log('Clicked item:', this.items[this.hoveredItem]);
    }

    dispose() {
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('wheel', this._onMouseWheel);
        window.removeEventListener('click', this._onClick);
    }
}
