/**
 * dual_camera_tracker.js
 * Multi-camera manager and orthogonal 90° hybrid landmark fusion engine.
 * Isolates the Side Camera in an iframe to prevent Emscripten/WASM global collisions.
 */

/**
 * Lightweight, non-hijacking video frame runner.
 * Monitors video playback and triggers inference without invoking getUserMedia
 * or overwriting video.srcObject (unlike MediaPipe's legacy Camera utility).
 */
class StreamRunner {
    constructor(video, onFrame) {
        this.video = video;
        this.onFrame = onFrame;
        this.lastTime = -1;
        this.isRunning = false;
        this.rafId = null;
    }

    start() {
        this.isRunning = true;
        const tick = async () => {
            if (!this.isRunning) return;
            if (this.video && !this.video.paused && this.video.currentTime !== this.lastTime) {
                this.lastTime = this.video.currentTime;
                try {
                    await this.onFrame();
                } catch (err) {
                    console.error('Frame inference error:', err);
                }
            }
            if (this.isRunning) {
                this.rafId = requestAnimationFrame(tick);
            }
        };
        this.rafId = requestAnimationFrame(tick);
    }

    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}

export class DualCameraTracker {
    constructor(options = {}) {
        this.mode = options.mode || 'single'; // 'single' | 'dual'
        this.sidePosition = options.sidePosition || 'right'; // 'right' | 'left'
        this.invertDepth = options.invertDepth || false;
        this.detectionConfidence = options.detectionConfidence || 0.6;
        this.trackingConfidence = options.trackingConfidence || 0.6;
        this.locateMode = options.locateMode || 'local'; // 'local' | 'web'

        // DOM Elements
        this.videoFront = options.videoFront;
        this.canvasFront = options.canvasFront;
        this.sideIframe = options.sideIframe;

        // Streams and Instances
        this.streamFront = null;
        this.streamSide = null;
        this.handsFront = null;
        this.runnerFront = null;

        // Landmarks State
        this.latestFrontLandmarks = null;
        this.latestFrontWorld = null;
        this.latestFrontLabel = '';
        this.latestFrontWidth = 0;
        this.latestFrontHeight = 0;
        this.latestSideLandmarks = null;
        this.latestSideWorld = null;
        this.latestSideLabel = '';
        this.latestSideWidth = 0;
        this.latestSideHeight = 0;
        this.latestFrontScore = 0;
        this.latestSideScore = 0;
        this.autoDepthFlip = false;

        // Callbacks
        this.onFrameFused = options.onFrameFused || (() => {});
        this.onStatusChange = options.onStatusChange || (() => {});

        this.isRunning = false;
        this.showOverlay = true;

        this.setupMessageListener();
    }

    setupMessageListener() {
        this.messageHandler = (e) => {
            if (!e.data || !e.data.type) return;

            switch (e.data.type) {
                case 'SIDE_FRAME_RESULTS':
                    this.latestSideLandmarks = copyLandmarks(e.data.landmarks);
                    this.latestSideWorld = copyLandmarks(e.data.worldLandmarks);
                    this.latestSideScore = e.data.score || 0;
                    this.latestSideLabel = e.data.label || '';
                    this.latestSideWidth = e.data.width || 0;
                    this.latestSideHeight = e.data.height || 0;
                    this.fuseAndDispatch();
                    break;
                case 'SIDE_FRAME_ERROR':
                    console.warn('Side Camera Error from iframe:', e.data.error);
                    this.onStatusChange(`Side camera error: ${e.data.error}`);
                    break;
            }
        };
        window.addEventListener('message', this.messageHandler);
    }

    /**
     * Enumerates cameras. If requestPermission is true, briefly requests a stream
     * to unlock real hardware labels (e.g., 'Nisheng M3', 'USB2.0 PC CAMERA').
     */
    static async getAvailableCameras(requestPermission = false) {
        if (!navigator.mediaDevices?.enumerateDevices) return [];
        try {
            if (requestPermission) {
                try {
                    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    tempStream.getTracks().forEach(t => t.stop());
                } catch (permErr) {
                    console.warn('Temporary permission prompt notice:', permErr.message);
                }
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');

            // De-duplicate by deviceId if present
            const seen = new Set();
            const result = [];
            let fallbackIndex = 1;
            for (const d of videoInputs) {
                if (d.deviceId && seen.has(d.deviceId)) continue;
                if (d.deviceId) seen.add(d.deviceId);

                result.push({
                    deviceId: d.deviceId,
                    label: d.label && d.label.trim() !== '' ? d.label : `Camera ${fallbackIndex++}`
                });
            }
            return result;
        } catch (e) {
            console.error('Error enumerating cameras:', e);
            return [];
        }
    }

    setMode(mode) {
        this.mode = mode;
    }

    setSidePosition(position) {
        this.sidePosition = position;
        this.autoDepthFlip = false;
    }

    setInvertDepth(invert) {
        this.invertDepth = invert;
        this.autoDepthFlip = false;
    }

    setOverlay(show) {
        this.showOverlay = show;
        if (this.sideIframe?.contentWindow) {
            this.sideIframe.contentWindow.postMessage({
                type: 'UPDATE_SIDE_OPTIONS',
                showOverlay: show
            }, '*');
        }
    }

    setConfidence(detection, tracking) {
        this.detectionConfidence = detection;
        this.trackingConfidence = tracking;
        if (this.handsFront) {
            this.handsFront.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: this.detectionConfidence,
                minTrackingConfidence: this.trackingConfidence
            });
        }
        if (this.sideIframe?.contentWindow) {
            this.sideIframe.contentWindow.postMessage({
                type: 'UPDATE_SIDE_OPTIONS',
                confidence: { detection, tracking }
            }, '*');
        }
    }

    initFrontMediaPipe() {
        if (this.handsFront) return;
        const HandsClass = window.Hands;
        if (!HandsClass) {
            throw new Error('MediaPipe Hands is not loaded in window scope.');
        }

        const locateFile = (file) => {
            if (file === 'hand_landmark_lite.tflite') file = 'hand_landmark_full.tflite';
            return this.locateMode === 'local'
                ? `./${file}`
                : `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        };

        this.handsFront = new HandsClass({ locateFile });
        this.handsFront.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: this.detectionConfidence,
            minTrackingConfidence: this.trackingConfidence
        });

        this.handsFront.onResults((results) => this.handleFrontResults(results));
    }

    async start(frontDeviceId = null, sideDeviceId = null) {
        if (this.isRunning) await this.stop();
        this.initFrontMediaPipe();

        this.onStatusChange('Connecting cameras...');

        try {
            if (this.mode === 'dual' && frontDeviceId && sideDeviceId && frontDeviceId === sideDeviceId) {
                throw new Error('Front and Side cameras cannot be the same device! Please select distinct cameras in the dropdowns.');
            }

            // 1. Acquire Front Camera Stream in Main Context
            const frontConstraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    ...(frontDeviceId ? { deviceId: { exact: frontDeviceId } } : {})
                }
            };
            this.streamFront = await navigator.mediaDevices.getUserMedia(frontConstraints);
            this.videoFront.srcObject = this.streamFront;

            await new Promise((resolve) => {
                this.videoFront.onloadedmetadata = () => {
                    this.videoFront.play();
                    resolve();
                };
            });

            this.runnerFront = new StreamRunner(this.videoFront, async () => {
                if (this.isRunning && this.handsFront) {
                    await this.handsFront.send({ image: this.videoFront });
                }
            });
            this.runnerFront.start();

            // 2. Acquire Side Camera Stream in Main Context (Dual Mode)
            if (this.mode === 'dual') {
                if (!sideDeviceId) {
                    throw new Error('Please select a distinct Side Camera in the dropdown.');
                }

                this.onStatusChange('Connecting side camera...');
                const sideConstraints = {
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        deviceId: { exact: sideDeviceId }
                    }
                };
                this.streamSide = await navigator.mediaDevices.getUserMedia(sideConstraints);

                // Pass the acquired hardware stream directly into the isolated iframe
                if (this.sideIframe?.contentWindow) {
                    const sideWin = this.sideIframe.contentWindow;
                    const attachOptions = {
                        locateMode: this.locateMode,
                        showOverlay: this.showOverlay,
                        detectionConfidence: this.detectionConfidence,
                        trackingConfidence: this.trackingConfidence
                    };

                    if (typeof sideWin.attachStream === 'function') {
                        sideWin.attachStream(this.streamSide, attachOptions);
                    } else {
                        await new Promise(r => setTimeout(r, 200));
                        if (typeof sideWin.attachStream === 'function') {
                            sideWin.attachStream(this.streamSide, attachOptions);
                        }
                    }
                }
            }

            const frontTrack = this.streamFront?.getVideoTracks()?.[0];
            const sideTrack = this.streamSide?.getVideoTracks()?.[0];
            const frontLabel = frontTrack?.label || 'Front';
            const sideLabel = sideTrack?.label || 'Side';

            this.isRunning = true;
            if (this.mode === 'dual') {
                this.onStatusChange(`Tracking active: [Front: ${frontLabel}] • [Side: ${sideLabel}]`);
            } else {
                this.onStatusChange(`Tracking active: [Front: ${frontLabel}]`);
            }
        } catch (err) {
            console.error('Camera startup error:', err);
            this.onStatusChange(`Camera error: ${err.name || 'Error'} - ${err.message || 'Check camera'}`);
            await this.stop();
            throw err;
        }
    }

    handleFrontResults(results) {
        if (!this.canvasFront) return;
        const ctx = this.canvasFront.getContext('2d');
        this.canvasFront.width = results.image.width || 640;
        this.canvasFront.height = results.image.height || 480;

        ctx.clearRect(0, 0, this.canvasFront.width, this.canvasFront.height);
        ctx.drawImage(results.image, 0, 0, this.canvasFront.width, this.canvasFront.height);

        this.latestFrontWidth = results.image.width || this.canvasFront.width || 640;
        this.latestFrontHeight = results.image.height || this.canvasFront.height || 480;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.latestFrontLandmarks = copyLandmarks(results.multiHandLandmarks[0]);
            this.latestFrontWorld = copyLandmarks(results.multiHandWorldLandmarks?.[0]);
            this.latestFrontScore = results.multiHandedness?.[0]?.score || 0.8;
            this.latestFrontLabel = handednessLabel(results.multiHandedness?.[0]);

            if (this.latestFrontLandmarks && this.showOverlay && window.drawConnectors && window.drawLandmarks && window.HAND_CONNECTIONS) {
                window.drawConnectors(ctx, this.latestFrontLandmarks, window.HAND_CONNECTIONS, { color: '#00FF88', lineWidth: 2 });
                window.drawLandmarks(ctx, this.latestFrontLandmarks, { color: '#FF3366', lineWidth: 1, radius: 3 });
            }
        } else {
            this.latestFrontLandmarks = null;
            this.latestFrontWorld = null;
            this.latestFrontScore = 0;
            this.latestFrontLabel = '';
        }

        this.fuseAndDispatch();
    }

    userPolarity() {
        let polarity = this.sidePosition === 'right' ? 1 : -1;
        if (this.invertDepth) polarity *= -1;
        return polarity;
    }

    fuseAndDispatch() {
        const frontPose = poseMatchingCamera(
            this.latestFrontLandmarks,
            this.latestFrontWorld,
            this.latestFrontWidth,
            this.latestFrontHeight
        );
        const sideAvailable = !!(this.latestSideLandmarks || this.latestSideWorld);

        if (!frontPose && !sideAvailable) {
            this.onFrameFused(null, {
                mode: this.mode,
                frontDetected: false,
                sideDetected: false,
                frontScore: 0,
                sideScore: 0,
                depthWeight: 0,
                depthFlipped: false
            });
            return;
        }

        // Single camera, or the side view has not locked a hand.
        if (frontPose && (!sideAvailable || this.mode === 'single')) {
            this.onFrameFused(frontPose, {
                mode: this.mode,
                frontDetected: true,
                sideDetected: false,
                frontScore: this.latestFrontScore,
                sideScore: 0,
                usingFallback: this.mode === 'dual',
                usingWorld: !!this.latestFrontWorld,
                depthWeight: 0,
                depthFlipped: false
            });
            return;
        }

        const polarity = this.userPolarity();

        // Front hand lost: stand the side view up in the same wrist-relative frame.
        if (!frontPose && sideAvailable && this.mode === 'dual') {
            const sidePose = this.latestSideWorld
                ? fitSideWorldToFront(this.latestSideWorld, polarity)
                : fitSideImageToFront(this.latestSideLandmarks, polarity, this.latestSideWidth, this.latestSideHeight);
            this.onFrameFused(sidePose, {
                mode: 'dual',
                frontDetected: false,
                sideDetected: true,
                frontScore: 0,
                sideScore: this.latestSideScore,
                usingFallback: true,
                usingWorld: !!this.latestSideWorld,
                depthWeight: 0,
                depthFlipped: false
            });
            return;
        }

        const blended = blendOrthogonalDepth({
            frontPose,
            frontImage: this.latestFrontLandmarks,
            frontWidth: this.latestFrontWidth,
            frontHeight: this.latestFrontHeight,
            frontLabel: this.latestFrontLabel,
            sideImage: this.latestSideLandmarks,
            sideWidth: this.latestSideWidth,
            sideHeight: this.latestSideHeight,
            sideLabel: this.latestSideLabel,
            sideScore: this.latestSideScore,
            userPolarity: polarity,
            autoFlipped: this.autoDepthFlip
        });

        if (blended.suggestFlip && !this.autoDepthFlip) {
            this.autoDepthFlip = true;
            this.onStatusChange('Side depth was mirrored relative to the front hand, so it was flipped.');
        }

        this.onFrameFused(blended.pose, {
            mode: 'dual',
            frontDetected: true,
            sideDetected: true,
            frontScore: this.latestFrontScore,
            sideScore: this.latestSideScore,
            usingFallback: blended.depthWeight <= 0,
            usingWorld: !!this.latestFrontWorld,
            depthWeight: blended.depthWeight,
            depthFlipped: blended.depthFlipped,
            fusionGuard: blended.fusionGuard
        });
    }

    async stop() {
        this.isRunning = false;

        if (this.runnerFront) {
            this.runnerFront.stop();
            this.runnerFront = null;
        }

        if (this.streamFront) {
            this.streamFront.getTracks().forEach(t => t.stop());
            this.streamFront = null;
        }

        if (this.streamSide) {
            this.streamSide.getTracks().forEach(t => t.stop());
            this.streamSide = null;
        }

        if (this.videoFront) this.videoFront.srcObject = null;

        // Stop side camera iframe
        if (this.sideIframe?.contentWindow) {
            this.sideIframe.contentWindow.postMessage({ type: 'STOP_SIDE_CAMERA' }, '*');
        }

        this.latestFrontLandmarks = null;
        this.latestFrontWorld = null;
        this.latestFrontLabel = '';
        this.latestSideLandmarks = null;
        this.latestSideWorld = null;
        this.latestSideLabel = '';
        this.autoDepthFlip = false;
        this.onStatusChange('Cameras stopped.');
    }
}

export function copyLandmarks(list) {
    if (!list || list.length < 21) return null;
    const out = new Array(21);
    for (let i = 0; i < 21; i++) {
        const p = list[i];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
        out[i] = { x: p.x, y: p.y, z: p.z || 0 };
    }
    return out;
}

export function handednessLabel(entry) {
    if (!entry) return '';
    return entry.label || entry.displayName || entry.categoryName || '';
}

export function selectPose(world, image) {
    return copyLandmarks(world) || copyLandmarks(image);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * X and Y follow the front-camera overlay. Depth is the metric world
 * estimate scaled into that same image size, and capped near one palm
 * length so a bad side view cannot stretch the fingers.
 */
export function poseMatchingCamera(image, world, width, height) {
    const img = copyLandmarks(image);
    const metric = copyLandmarks(world);
    if (!img) return metric;

    const aspect = width > 0 && height > 0 ? width / height : 1;
    const wrist = img[0];
    const pose = img.map(p => ({
        x: (p.x - wrist.x) * aspect,
        y: p.y - wrist.y,
        z: ((p.z || 0) - (wrist.z || 0)) * aspect
    }));

    const palm = Math.hypot(pose[9].x, pose[9].y) || 1;
    if (metric) {
        const origin = metric[0];
        const worldPalm = Math.hypot(
            metric[9].x - origin.x,
            metric[9].y - origin.y,
            (metric[9].z || 0) - (origin.z || 0)
        ) || palm;
        const zScale = palm / worldPalm;
        for (let i = 0; i < 21; i++) {
            pose[i].z = ((metric[i].z || 0) - (origin.z || 0)) * zScale;
        }
    }

    return clampDepthToPalm(pose);
}

function squareX(pt, width, height) {
    const aspect = width > 0 && height > 0 ? width / height : 1;
    return pt.x * aspect;
}

function baseline2D(a, b, width, height) {
    return Math.hypot(squareX(a, width, height) - squareX(b, width, height), a.y - b.y);
}

function dist3(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

/**
 * Map a side-camera world pose into the front camera's wrist-relative frame.
 * Side image-right becomes front depth, and side depth becomes front horizontal.
 */
export function fitSideWorldToFront(world, polarity) {
    const src = copyLandmarks(world);
    if (!src) return null;
    const wrist = src[0];
    return clampDepthToPalm(src.map(pt => ({
        x: -((pt.z || 0) - (wrist.z || 0)) * polarity,
        y: pt.y - wrist.y,
        z: (pt.x - wrist.x) * polarity
    })));
}

export function fitSideImageToFront(image, polarity, width, height) {
    const src = copyLandmarks(image);
    if (!src) return null;
    const aspect = width > 0 && height > 0 ? width / height : 1;
    const wrist = src[0];
    const wx = wrist.x * aspect;
    return clampDepthToPalm(src.map(pt => ({
        x: -((pt.z || 0) - (wrist.z || 0)) * polarity,
        y: pt.y - wrist.y,
        z: (pt.x * aspect - wx) * polarity
    })));
}

const FINGER_BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20]
];

function clampDepthToPalm(pose) {
    let palm = Math.hypot(pose[9].x - pose[0].x, pose[9].y - pose[0].y);
    let reach = palm;
    for (let i = 0; i < 21; i++) {
        reach = Math.max(reach, Math.hypot(pose[i].x - pose[0].x, pose[i].y - pose[0].y));
    }
    const cap = Math.max(palm, reach * 0.5, 1e-4);
    const z0 = pose[0].z || 0;
    for (let i = 0; i < 21; i++) pose[i].z = clamp(pose[i].z, z0 - cap, z0 + cap);
    return limitBoneDepth(pose);
}

/**
 * Keep each bone near the length drawn on the front camera.
 * Depth can curl a joint, and it cannot turn that joint into a second finger.
 */
function limitBoneDepth(pose) {
    const palm = Math.hypot(pose[9].x - pose[0].x, pose[9].y - pose[0].y) || 1e-4;
    const curl = palm * 0.32;
    for (let b = 0; b < FINGER_BONES.length; b++) {
        const a = pose[FINGER_BONES[b][0]];
        const child = pose[FINGER_BONES[b][1]];
        const xy = Math.hypot(child.x - a.x, child.y - a.y);
        const limit = Math.max(xy * 1.12, curl);
        const zRoom = Math.sqrt(Math.max(0, limit * limit - xy * xy));
        const dz = (child.z || 0) - (a.z || 0);
        child.z = (a.z || 0) + clamp(dz, -zRoom, zRoom);
    }
    return pose;
}

/**
 * Both cameras have to curl the same fingers. A side skeleton that
 * opens a finger the front camera sees folded is not a depth reading.
 */
export function fingerPoseAgrees(frontImage, sideImage) {
    const pairs = [[2, 4], [5, 8], [9, 12], [13, 16], [17, 20]];
    const curlMask = (img) => {
        const ext = pairs.map(([mcp, tip]) => img[mcp].y - img[tip].y);
        const maxE = Math.max(...ext, 0);
        const cut = Math.max(0.03, maxE * 0.55);
        return ext.map(v => v < cut);
    };
    const front = curlMask(frontImage);
    const side = curlMask(sideImage);
    let disagree = 0;
    for (let i = 0; i < front.length; i++) if (front[i] !== side[i]) disagree++;
    return disagree < 2;
}

/**
 * Keep the front camera's X/Y and blend only Z from the side camera.
 * Depth is capped at about one palm length so a glancing side view
 * cannot stretch the fingers.
 */
export function blendOrthogonalDepth(opts) {
    const {
        frontPose,
        frontImage,
        frontWidth,
        frontHeight,
        frontLabel,
        sideImage,
        sideWidth,
        sideHeight,
        sideLabel,
        sideScore,
        userPolarity,
        autoFlipped
    } = opts;

    const unchanged = () => (frontPose || []).map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
    const meta = { depthWeight: 0, depthFlipped: !!autoFlipped, suggestFlip: false, fusionGuard: null };

    if (!frontPose || frontPose.length < 21) {
        return { pose: null, ...meta };
    }
    if (!sideImage || sideImage.length < 21 || !frontImage || frontImage.length < 21) {
        return { pose: unchanged(), ...meta, fusionGuard: 'missing-image' };
    }

    const sideBase = baseline2D(sideImage[0], sideImage[9], sideWidth, sideHeight);
    const frontBase = baseline2D(frontImage[0], frontImage[9], frontWidth, frontHeight);
    const scaleRatio = sideBase > 1e-4 ? frontBase / sideBase : Infinity;

    const fLabel = (frontLabel || '').toLowerCase();
    const sLabel = (sideLabel || '').toLowerCase();
    if (fLabel && sLabel && fLabel !== sLabel) {
        return { pose: unchanged(), ...meta, fusionGuard: 'handedness' };
    }
    if (!(scaleRatio >= 0.4 && scaleRatio <= 2.5) || sideBase < 0.02) {
        return { pose: unchanged(), ...meta, fusionGuard: 'scale' };
    }
    if (!fingerPoseAgrees(frontImage, sideImage)) {
        return { pose: unchanged(), ...meta, fusionGuard: 'pose' };
    }

    const weight = Math.max(0, Math.min(1, ((sideScore || 0) - 0.55) / 0.35));
    if (weight <= 0) {
        return { pose: unchanged(), ...meta, fusionGuard: 'confidence' };
    }

    const frontLen = dist3(frontPose[0], frontPose[9]) || 1;
    const sx0 = squareX(sideImage[0], sideWidth, sideHeight);
    const raw = new Array(21);
    for (let i = 0; i < 21; i++) {
        raw[i] = ((squareX(sideImage[i], sideWidth, sideHeight) - sx0) / sideBase) * frontLen;
    }

    const wz = frontPose[0].z || 0;
    let dot = 0;
    let eS = 0;
    let eW = 0;
    for (let i = 0; i < 21; i++) {
        const d = (frontPose[i].z || 0) - wz;
        dot += raw[i] * d;
        eS += raw[i] * raw[i];
        eW += d * d;
    }
    const corr = (eS > 1e-8 && eW > 1e-8) ? dot / Math.sqrt(eS * eW) : 0;
    const sideSpread = Math.sqrt(eS / 21);
    const worldSpread = Math.sqrt(eW / 21);
    const enoughSpread = sideSpread > frontLen * 0.04 && worldSpread > frontLen * 0.04;
    const suggestFlip = enoughSpread && corr * userPolarity < -0.5;
    const flipped = !!(autoFlipped || suggestFlip);
    const polarity = userPolarity * (flipped ? -1 : 1);

    const pose = unchanged();
    for (let i = 0; i < 21; i++) {
        const sideZ = wz + raw[i] * polarity;
        pose[i].z = (frontPose[i].z || 0) * (1 - weight) + sideZ * weight;
    }
    clampDepthToPalm(pose);

    return {
        pose,
        depthWeight: weight,
        depthFlipped: flipped,
        suggestFlip,
        fusionGuard: null
    };
}
