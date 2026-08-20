/**
 * ARManager - The Orchestrator
 * Connects the Camera, CV Worker, and Three.js.
 */

class ARManager {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.video = null;
        this.worker = null;
        this.poseSolver = new PoseSolver(camera);

        this.isProcessing = false;
        this.onPageDetected = null;
        this.debugCanvas = null;
        this.debugCtx = null;
        this.showDebug = true;

        this.initWorker();
    }

    async start() {
        this.video = await this.setupCamera();
        this.video.play();
        this.loop();
    }

    initWorker() {
        this.worker = new Worker('js/cv-worker.js');
        this.worker.onmessage = (e) => {
            if (e.data.type === 'CORNERS_FOUND') {
                this.handleCorners(e.data.corners, e.data.pose);
            }
            this.isProcessing = false;
        };
    }

    async setupCamera() {
        const video = document.createElement('video');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: 640, height: 480 }
        });
        video.srcObject = stream;

        // Setup Debug Overlay
        this.debugCanvas = document.createElement('canvas');
        this.debugCanvas.id = 'cv-debug-overlay';
        this.debugCanvas.style.position = 'absolute';
        this.debugCanvas.style.top = '0';
        this.debugCanvas.style.left = '0';
        this.debugCanvas.style.width = '100%';
        this.debugCanvas.style.height = '100%';
        this.debugCanvas.style.pointerEvents = 'none';
        this.debugCanvas.style.zIndex = '5';
        document.body.appendChild(this.debugCanvas);
        this.debugCtx = this.debugCanvas.getContext('2d');

        return new Promise(resolve => video.onloadedmetadata = () => {
            this.debugCanvas.width = video.videoWidth;
            this.debugCanvas.height = video.videoHeight;
            resolve(video);
        });
    }

    loop() {
        if (!this.isProcessing && this.video.readyState >= 2) {
            this.sendFrameToWorker();
        }
        requestAnimationFrame(() => this.loop());
    }

    sendFrameToWorker() {
        this.isProcessing = true;
        const canvas = document.createElement('canvas'); // Reuse this in production
        canvas.width = 320; // Downscale for performance
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);

        // Calculate Intrinsics from Three.js Camera
        const f = (canvas.height / 2) / Math.tan((this.camera.fov * Math.PI / 180) / 2);
        const intrinsics = {
            f: f,
            cx: canvas.width / 2,
            cy: canvas.height / 2
        };

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.worker.postMessage({
            type: 'PROCESS_FRAME',
            imageData: imageData,
            width: canvas.width,
            height: canvas.height,
            intrinsics: intrinsics,
            physicalSize: { width: 1, height: 1.414 } // Default A4 ratio
        });
    }

    handleCorners(corners, workerPose) {
        // Clear debug overlay
        if (this.debugCtx) {
            this.debugCtx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);
        }

        if (!corners) return;

        // Draw debug corners
        if (this.showDebug && this.debugCtx) {
            this.debugCtx.fillStyle = '#6ee7b7';
            corners.forEach((p, i) => {
                // Map worker coords (320x240) to debug canvas size
                const dx = p.x * (this.debugCanvas.width / 320);
                const dy = p.y * (this.debugCanvas.height / 240);
                this.debugCtx.beginPath();
                this.debugCtx.arc(dx, dy, 5, 0, Math.PI * 2);
                this.debugCtx.fill();
                this.debugCtx.fillText(i, dx + 10, dy);
            });
        }

        // Solve for 3D pose
        const pose = this.poseSolver.solve(corners, 320, 240, workerPose);
        if (pose && this.onPoseUpdate) {
            this.onPoseUpdate(pose);
        }
    }
}

window.ARManager = ARManager;
