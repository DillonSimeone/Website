import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
// Extract FaceLandmarker and FilesetResolver from vision.
const {
    FaceLandmarker,
    FilesetResolver,
    HandLandmarker
} = vision;

//Delaunay triangulation witchery
import {
    Delaunay
} from "https://cdn.jsdelivr.net/npm/d3-delaunay@6/+esm";

// ---------------- Global Variables & Constants ----------------
let faceLandmarker = null;
let handLandmarker = null;
const runningMode = "VIDEO";
let webcamRunning = false;

const maskSizeFactor = 1.5;

// Smoothing factor between 0 (no smoothing) and 1 (full inertia)
const SMOOTHING_ALPHA = 0.7;
const HOLD_TIMEOUT = 200; // ms to hold the pinch state if a hand is temporarily lost

const video = document.getElementById("webcam");
const staticCanvas = document.getElementById("static_canvas");
const staticCtx = staticCanvas.getContext("2d");
const outputCanvas = document.getElementById("output_canvas");
const canvasCtx = outputCanvas.getContext("2d");
const enableWebcamButton = document.getElementById("webcamButton");

// Global state for the face mask
// Each polygon piece now has: polygon, color, attached, grabbed, grabbedBy, lastHandPos.
let maskPieces = [];
let maskGenerated = false; // Generate mask pieces only once per face detection
let dynamicSeedsNormalized = []; // normalized seed points for Voronoi, relative to hull bbox
let SEED_COUNT = 10; // Adjustable via UI

// Interaction & grabbing parameters
let TOUCH_THRESHOLD = 0.075; // normalized pinch threshold (adjustable via UI)
const GRAB_DISTANCE_THRESHOLD = 50; // pixels: max distance to allow grab
const Z_SCALE_SENSITIVITY = 0.5; // sensitivity for z-axis scaling

// Store current face hull (expanded convex hull) for static mask drawing.
let currentFaceHull = null;

// Global variable for hand landmarks (for drawing).
let currentHands = [];

// Per-hand state (assuming up to 2 hands).
let handStates = [{
        isPinching: false,
        grabbedPieceId: null,
        lastPinchPos: {
            x: 0,
            y: 0,
            z: 0
        },
        lastUpdate: 0
    },
    {
        isPinching: false,
        grabbedPieceId: null,
        lastPinchPos: {
            x: 0,
            y: 0,
            z: 0
        },
        lastUpdate: 0
    }
];

// ---------------- WebSocket Setup ----------------
// If a WebSocket server is available, send data; if not, just log.
let ws = null;
try {
    ws = new WebSocket("ws://localhost:8080");
    ws.onopen = () => console.log("Connected to Max via WebSocket");
    ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        ws = null;
    };
} catch (err) {
    console.error("WebSocket connection failed:", err);
    ws = null;
}

// ---------------- Initialization Functions ----------------
async function createFaceLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
        },
        outputFaceBlendshapes: false,
        runningMode: runningMode,
        numFaces: 1
    });
}

async function createHandLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2
    });
}

createFaceLandmarker();
createHandLandmarker();

// ---------------- Enable Webcam ----------------
enableWebcamButton.addEventListener("click", enableCam);

function enableCam() {
    if (!faceLandmarker || !handLandmarker) {
        console.log("Wait for detectors to load.");
        return;
    }
    webcamRunning = !webcamRunning;
    enableWebcamButton.innerText = webcamRunning ?
        "Disable Face & Hand Tracking" :
        "Enable Face & Hand Tracking";
    if (webcamRunning) {
        navigator.mediaDevices.getUserMedia({
            video: true
        }).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
    }
}

function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// ---------------- Main Loop ----------------
let lastVideoTime = -1;

function predictWebcam() {
    // Set canvas sizes to match video.
    staticCanvas.width = video.videoWidth;
    staticCanvas.height = video.videoHeight;
    outputCanvas.width = video.videoWidth;
    outputCanvas.height = video.videoHeight;

    // Clear both canvases.
    staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
    canvasCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    // --- Face Detection & Mask Generation ---
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const faceStartTime = performance.now();
        const faceResult = faceLandmarker.detectForVideo(video, faceStartTime);

        if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            const landmarks = faceResult.faceLandmarks[0].map(pt => ({
                x: pt.x * outputCanvas.width,
                y: pt.y * outputCanvas.height,
                z: pt.z || 0
            }));
            let hull = computeConvexHull(landmarks);
            hull = expandPolygon(hull, maskSizeFactor);
            currentFaceHull = hull;

            if (!maskGenerated) {
                dynamicSeedsNormalized = generateNormalizedSeedPoints(hull, SEED_COUNT);
                maskGenerated = true;
            }

            const absSeeds = getAbsoluteSeeds(hull, dynamicSeedsNormalized);
            const bbox = getBoundingBox(hull);
            const bboxArray = [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY];
            const delaunay = Delaunay.from(absSeeds);
            const voronoi = delaunay.voronoi(bboxArray);

            for (let i = 0; i < absSeeds.length; i++) {
                let cell = voronoi.cellPolygon(i);
                if (!cell) continue;
                let clipped = clipPolygon(cell, hull.map(pt => [pt.x, pt.y]));
                // Initialize vertices with z = 0.
                let newPoly = clipped.map(p => ({
                    x: p[0],
                    y: p[1],
                    z: 0
                }));
                // Update only if this piece is still attached (i.e. hasn't been grabbed before)
                if (maskPieces[i] && maskPieces[i].attached && !maskPieces[i].grabbed) {
                    maskPieces[i].polygon = newPoly;
                } else if (!maskPieces[i]) {
                    maskPieces[i] = {
                        polygon: newPoly,
                        color: getRandomColor(),
                        attached: true, // Initially attached to the face.
                        grabbed: false,
                        grabbedBy: null,
                        lastHandPos: null
                    };
                }
            }
        }
    }

    // --- Draw the Static Mask (Noise) Over the Face Hull Only ---
    if (currentFaceHull) {
        drawStaticMask(currentFaceHull);
    }

    // --- Hand Detection & Interaction ---
    try {
        const handStartTime = performance.now();
        const handResult = handLandmarker.detectForVideo(video, handStartTime);
        if (handResult.landmarks && handResult.landmarks.length > 0) {
            currentHands = handResult.landmarks;
            processHandDetection(currentHands);
        }
    } catch (err) {
        console.error("Hand detection error:", err);
    }

    // --- Draw the Polygon Mask Pieces on Top ---
    drawMaskPieces();

    // --- Draw Hand Landmarks & Connections ---
    drawHands(currentHands);

    // --- Log & Send Polygon Data ---
    sendPolygonLocations();

    // --- Update UI with Selected Polygon Data ---
    updatePolygonUI();

    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}

// ---------------- Process Hand Detection ----------------
function processHandDetection(hands) {
    const now = performance.now();
    hands.forEach((hand, hIndex) => {
        const thumbTip = hand[4];
        const indexTip = hand[8];
        const wrist = hand[0];

        // Compute raw pinch position in canvas coordinates.
        let rawPinchPos = {
            x: indexTip.x * outputCanvas.width,
            y: indexTip.y * outputCanvas.height,
            z: indexTip.z || 0
        };
        // If z is zero, compute a synthetic z using the distance from the wrist to the index tip.
        if (rawPinchPos.z === 0) {
            const dWristIndex = Math.hypot(
                wrist.x - indexTip.x,
                wrist.y - indexTip.y
            );
            // Heuristic: larger dWristIndex means hand is closer (use appropriate scaling).
            rawPinchPos.z = Math.max(0, Math.min(1, 1 - dWristIndex));
        }

        // Determine pinch detection from thumb-index distance.
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dz = (thumbTip.z || 0) - (indexTip.z || 0);
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const pinchDetected = dist < TOUCH_THRESHOLD;

        // Smooth pinch position.
        let newPinchPos = rawPinchPos;
        if (handStates[hIndex].isPinching) {
            newPinchPos = {
                x: handStates[hIndex].lastPinchPos.x * SMOOTHING_ALPHA + rawPinchPos.x * (1 - SMOOTHING_ALPHA),
                y: handStates[hIndex].lastPinchPos.y * SMOOTHING_ALPHA + rawPinchPos.y * (1 - SMOOTHING_ALPHA),
                z: handStates[hIndex].lastPinchPos.z * SMOOTHING_ALPHA + rawPinchPos.z * (1 - SMOOTHING_ALPHA)
            };
        }
        handStates[hIndex].lastPinchPos = newPinchPos;
        handStates[hIndex].lastUpdate = now; //TODO: Z adjusts size of polys

        // If a pinch is detected…
        if (pinchDetected) {
            // Check if the hand is already controlling a polygon.
            if (handStates[hIndex].isPinching && handStates[hIndex].grabbedPieceId !== null) {
                // Get the currently grabbed piece.
                let currentPiece = maskPieces[handStates[hIndex].grabbedPieceId];
                if (currentPiece) {
                    // Compute the distance from the current polygon's centroid to the new pinch position.
                    const currentCent = computeCentroid(currentPiece.polygon);
                    const distanceToCurrent = Math.hypot(currentCent.x - newPinchPos.x, currentCent.y - newPinchPos.y);
                    // If the pinch moves far from the currently grabbed piece, release it.
                    if (distanceToCurrent > GRAB_DISTANCE_THRESHOLD * 1.5) {
                        currentPiece.grabbed = false;
                        currentPiece.grabbedBy = null;
                        handStates[hIndex].grabbedPieceId = null;
                        handStates[hIndex].isPinching = false;
                    }
                }
            }

            // If this hand isn't currently controlling a polygon, do candidate selection.
            if (!handStates[hIndex].isPinching || handStates[hIndex].grabbedPieceId === null) {
                // Look for a candidate among all pieces (attached or detached) that are not currently grabbed.
                let candidate = null;
                let candidateIndex = null;
                let candidateDistance = Infinity;
                maskPieces.forEach((piece, idx) => {
                    if (!piece.grabbed) {
                        // If the piece is detached, use a larger threshold.
                        let threshold = piece.attached ? GRAB_DISTANCE_THRESHOLD : GRAB_DISTANCE_THRESHOLD * 2;
                        const cent = computeCentroid(piece.polygon);
                        const d = Math.hypot(cent.x - newPinchPos.x, cent.y - newPinchPos.y);
                        if (d < threshold && d < candidateDistance) {
                            candidate = piece;
                            candidateIndex = idx;
                            candidateDistance = d;
                        }
                    }
                });
                if (candidate !== null) {
                    // Lock candidate to this hand.
                    candidate.grabbed = true;
                    candidate.grabbedBy = hIndex;
                    candidate.lastHandPos = {
                        ...newPinchPos
                    };
                    // Record the offset from the pinch position to the polygon’s centroid.
                    const cent = computeCentroid(candidate.polygon);
                    candidate.dragOffset = {
                        dx: cent.x - newPinchPos.x,
                        dy: cent.y - newPinchPos.y
                    };
                    candidate.initialPinchZ = newPinchPos.z;
                    candidate.originalPolygon = candidate.polygon.map(pt => ({
                        ...pt
                    }));
                    // Mark as detached.
                    candidate.attached = false;
                    handStates[hIndex].grabbedPieceId = candidateIndex;
                }
                handStates[hIndex].isPinching = true;
            } else {
                // Already pinching: update the piece grabbed by this hand.
                const grabbedIndex = handStates[hIndex].grabbedPieceId;
                if (grabbedIndex !== null && maskPieces[grabbedIndex]) {
                    const piece = maskPieces[grabbedIndex];
                    // Compute target centroid: current pinch position plus stored offset.
                    const targetCentroid = {
                        x: newPinchPos.x + piece.dragOffset.dx,
                        y: newPinchPos.y + piece.dragOffset.dy
                    };
                    // Compute z delta relative to initial pinch.
                    const zDelta = newPinchPos.z - piece.initialPinchZ;
                    let scaleFactor = 1 - Z_SCALE_SENSITIVITY * zDelta;
                    scaleFactor = Math.max(scaleFactor, 0.5);
                    const origCentroid = computeCentroid(piece.originalPolygon);
                    const translation = {
                        x: targetCentroid.x - origCentroid.x,
                        y: targetCentroid.y - origCentroid.y
                    };
                    const newPolygon = piece.originalPolygon.map(pt => ({
                        x: (pt.x - origCentroid.x) * scaleFactor + origCentroid.x + translation.x,
                        y: (pt.y - origCentroid.y) * scaleFactor + origCentroid.y + translation.y,
                        z: pt.z
                    }));
                    piece.polygon = newPolygon;
                    piece.lastHandPos = {
                        ...newPinchPos
                    };
                }
            }
            handStates[hIndex].lastPinchTimestamp = now;
        } else {
            // No pinch detected: clear the hand state (but leave any previously grabbed polygon in place).
            if (now - handStates[hIndex].lastUpdate >= HOLD_TIMEOUT) {
                handStates[hIndex].isPinching = false;
                handStates[hIndex].grabbedPieceId = null;
            }
        }
    });
}

// ---------------- Send Polygon Data ----------------
function sendPolygonLocations() {
    const data = maskPieces.map((piece, idx) => {
        const cent = computeCentroid(piece.polygon);
        const zVal = piece.grabbed && piece.lastHandPos ? piece.lastHandPos.z : 0;
        return {
            id: idx,
            x: cent.x,
            y: cent.y,
            z: zVal,
            attached: piece.attached
        };
    });
    console.log("Sending polygon data:", data);
    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    } catch (err) {
        console.error("Error sending polygon data:", err);
    }
}

// ---------------- Draw the Polygon Mask Pieces ----------------
function drawMaskPieces() {
    maskPieces.forEach(piece => {
        drawPolygon(piece.polygon, piece.color);
    });
}

function drawPolygon(vertices, color) {
    if (!vertices || vertices.length === 0) return;
    canvasCtx.beginPath();
    canvasCtx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
        canvasCtx.lineTo(vertices[i].x, vertices[i].y);
    }
    canvasCtx.closePath();
    canvasCtx.fillStyle = color;
    canvasCtx.fill();
}

// ---------------- Draw the Static Mask (Noise) ----------------
function drawStaticMask(hull) {
    if (!hull || hull.length === 0) return;
    const bb = getBoundingBox(hull);
    const width = bb.maxX - bb.minX;
    const height = bb.maxY - bb.minY;

    // Create an offscreen canvas for noise with size matching the bounding box.
    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext("2d");
    const noiseImg = offCtx.createImageData(width, height);
    const data = noiseImg.data;
    for (let i = 0; i < data.length; i += 4) {
        const gray = Math.floor(Math.random() * 256);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        data[i + 3] = 255;
    }
    offCtx.putImageData(noiseImg, 0, 0);

    // Clip to the face hull and draw the noise.
    staticCtx.save();
    staticCtx.beginPath();
    staticCtx.moveTo(hull[0].x, hull[0].y);
    for (let i = 1; i < hull.length; i++) {
        staticCtx.lineTo(hull[i].x, hull[i].y);
    }
    staticCtx.closePath();
    staticCtx.clip();
    staticCtx.drawImage(offCanvas, bb.minX, bb.minY);
    staticCtx.restore();
}

// ---------------- Geometry Helper Functions ----------------
function computeConvexHull(points) {
    let sorted = points.slice().sort((a, b) =>
        a.x === b.x ? a.y - b.y : a.x - b.x
    );
    const lower = [];
    for (let pt of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) {
            lower.pop();
        }
        lower.push(pt);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        let pt = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) {
            upper.pop();
        }
        upper.push(pt);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}

function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function expandPolygon(polygon, scale) {
    const cent = computeCentroid(polygon);
    return polygon.map(pt => ({
        x: cent.x + (pt.x - cent.x) * scale,
        y: cent.y + (pt.y - cent.y) * scale,
        z: pt.z || 0
    }));
}

function computeCentroid(polygon) {
    let sumX = 0,
        sumY = 0,
        sumZ = 0;
    polygon.forEach(pt => {
        sumX += pt.x;
        sumY += pt.y;
        sumZ += pt.z || 0;
    });
    return {
        x: sumX / polygon.length,
        y: sumY / polygon.length,
        z: sumZ / polygon.length
    };
}

function getBoundingBox(polygon) {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    polygon.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    });
    return {
        minX,
        minY,
        maxX,
        maxY
    };
}

function generateNormalizedSeedPoints(polygon, count) {
    const bbox = getBoundingBox(polygon);
    const seeds = [];
    while (seeds.length < count) {
        const x = Math.random() * (bbox.maxX - bbox.minX) + bbox.minX;
        const y = Math.random() * (bbox.maxY - bbox.minY) + bbox.minY;
        if (pointInPolygon({
                x,
                y
            }, polygon)) {
            const normX = (x - bbox.minX) / (bbox.maxX - bbox.minX);
            const normY = (y - bbox.minY) / (bbox.maxY - bbox.minY);
            seeds.push({
                normX,
                normY
            });
        }
    }
    return seeds;
}

function getAbsoluteSeeds(polygon, seedsNormalized) {
    const bbox = getBoundingBox(polygon);
    return seedsNormalized.map(seed => [
        seed.normX * (bbox.maxX - bbox.minX) + bbox.minX,
        seed.normY * (bbox.maxY - bbox.minY) + bbox.minY
    ]);
}

function clipPolygon(subjectPolygon, clipPolygon) {
    let outputList = subjectPolygon;
    for (let i = 0; i < clipPolygon.length; i++) {
        const inputList = outputList;
        outputList = [];
        const A = clipPolygon[i];
        const B = clipPolygon[(i + 1) % clipPolygon.length];
        for (let j = 0; j < inputList.length; j++) {
            const P = inputList[j];
            const Q = inputList[(j + 1) % inputList.length];
            if (inside(P, A, B)) {
                if (!inside(Q, A, B)) {
                    outputList.push(intersection(P, Q, A, B));
                } else {
                    outputList.push(Q);
                }
            } else {
                if (inside(Q, A, B)) {
                    outputList.push(intersection(P, Q, A, B));
                    outputList.push(Q);
                }
            }
        }
    }
    return outputList;
}

function inside(p, A, B) {
    return (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= 0;
}

function intersection(P, Q, A, B) {
    const a1 = Q[1] - P[1];
    const b1 = P[0] - Q[0];
    const c1 = a1 * P[0] + b1 * P[1];
    const a2 = B[1] - A[1];
    const b2 = A[0] - B[0];
    const c2 = a2 * A[0] + b2 * A[1];
    const det = a1 * b2 - a2 * b1;
    if (det === 0) return P;
    const x = (b2 * c1 - b1 * c2) / det;
    const y = (a1 * c2 - a2 * c1) / det;
    return [x, y];
}

function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x,
            yi = polygon[i].y;
        const xj = polygon[j].x,
            yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function drawHands(hands) {
    if (!hands) return;
    const HAND_CONNECTIONS = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [0, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [0, 9],
        [9, 10],
        [10, 11],
        [11, 12],
        [0, 13],
        [13, 14],
        [14, 15],
        [15, 16],
        [0, 17],
        [17, 18],
        [18, 19],
        [19, 20]
    ];
    hands.forEach(hand => {
        const thumbTip = hand[4];
        const indexTip = hand[8];
        const dx = thumbTip.x - indexTip.x;
        const dy = thumbTip.y - indexTip.y;
        const dz = (thumbTip.z || 0) - (indexTip.z || 0);
        const pinchDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const isPinching = pinchDist < TOUCH_THRESHOLD;
        // Draw landmarks.
        hand.forEach(pt => {
            const x = pt.x * outputCanvas.width;
            const y = pt.y * outputCanvas.height;
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 5, 0, 2 * Math.PI);
            canvasCtx.fillStyle = isPinching ? "yellow" : "red";
            canvasCtx.fill();
        });
        // Draw connections.
        HAND_CONNECTIONS.forEach(([s, e]) => {
            const p1 = hand[s];
            const p2 = hand[e];
            canvasCtx.beginPath();
            canvasCtx.moveTo(p1.x * outputCanvas.width, p1.y * outputCanvas.height);
            canvasCtx.lineTo(p2.x * outputCanvas.width, p2.y * outputCanvas.height);
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = isPinching ? "yellow" : "green";
            canvasCtx.stroke();
        });
    });
}

// ---------------- UI Controls ----------------
function createControlsUI() {
    const controlDiv = document.createElement("div");
    controlDiv.id = "controls";

    // Reset Button
    const resetButton = document.createElement("button");
    resetButton.innerText = "Reset Mask";
    resetButton.onclick = () => {
        maskPieces = [];
        maskGenerated = false;
    };
    controlDiv.appendChild(resetButton);
    controlDiv.appendChild(document.createElement("br"));

    // Polygon Count Slider
    const polyCountLabel = document.createElement("label");
    polyCountLabel.innerText = "Polygon Count: ";
    const polyCountSlider = document.createElement("input");
    polyCountSlider.type = "range";
    polyCountSlider.min = 3;
    polyCountSlider.max = 20;
    polyCountSlider.value = SEED_COUNT;
    polyCountSlider.step = 1;
    polyCountSlider.oninput = () => {
        SEED_COUNT = parseInt(polyCountSlider.value);
        maskPieces = [];
        maskGenerated = false;
    };
    polyCountLabel.appendChild(polyCountSlider);
    controlDiv.appendChild(polyCountLabel);
    controlDiv.appendChild(document.createElement("br"));

    // Pinch Threshold Slider
    const pinchThreshLabel = document.createElement("label");
    pinchThreshLabel.innerText = "Pinch Threshold: ";
    const pinchThreshSlider = document.createElement("input");
    pinchThreshSlider.type = "range";
    pinchThreshSlider.min = 0.05;
    pinchThreshSlider.max = 0.2;
    pinchThreshSlider.value = TOUCH_THRESHOLD;
    pinchThreshSlider.step = 0.005;
    pinchThreshSlider.oninput = () => {
        TOUCH_THRESHOLD = parseFloat(pinchThreshSlider.value);
    };
    pinchThreshLabel.appendChild(pinchThreshSlider);
    controlDiv.appendChild(pinchThreshLabel);
    controlDiv.appendChild(document.createElement("br"));

    // Dropdown for selecting a polygon to track
    const polySelectLabel = document.createElement("label");
    polySelectLabel.innerText = "Track Polygon: ";
    const polySelect = document.createElement("select");
    polySelect.id = "polySelect";
    polySelect.onchange = updatePolygonUI;
    polySelectLabel.appendChild(polySelect);
    controlDiv.appendChild(polySelectLabel);
    controlDiv.appendChild(document.createElement("br"));

    // Div for displaying polygon data
    const polyDataDiv = document.createElement("div");
    polyDataDiv.id = "polyData";
    polyDataDiv.style.marginTop = "5px";
    controlDiv.appendChild(polyDataDiv);

    document.body.appendChild(controlDiv);

    // Update dropdown options periodically while preserving the selected value.
    setInterval(() => {
        const polySelect = document.getElementById("polySelect");
        const currentVal = polySelect.value;
        polySelect.innerHTML = "";
        maskPieces.forEach((_, idx) => {
            const option = document.createElement("option");
            option.value = idx;
            option.innerText = "Polygon " + idx;
            polySelect.appendChild(option);
        });
        if (currentVal && polySelect.querySelector(`option[value="${currentVal}"]`)) {
            polySelect.value = currentVal;
            selectedPolygonIndex = parseInt(currentVal);
        }
    }, 1000);

}

let selectedPolygonIndex = 0;

function updatePolygonUI() {
    const polySelect = document.getElementById("polySelect");
    selectedPolygonIndex = parseInt(polySelect.value);
    const polyDataDiv = document.getElementById("polyData");
    if (maskPieces[selectedPolygonIndex]) {
        const cent = computeCentroid(maskPieces[selectedPolygonIndex].polygon);
        polyDataDiv.innerHTML =
            "X: " + cent.x.toFixed(2) + "<br>" +
            "Y: " + cent.y.toFixed(2) + "<br>" +
            //"Z: " + cent.z.toFixed(2) + "<br>" +
            "Attached: " + maskPieces[selectedPolygonIndex].attached;
    } else {
        polyDataDiv.innerHTML = "No data";
    }
}

// Initialize the UI controls.
createControlsUI();

// ---------------- End of Code ----------------