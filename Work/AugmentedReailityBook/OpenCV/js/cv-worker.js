/**
 * CV Worker - The AR Book "Engine Room"
 * Handles real-time corner detection using OpenCV.js (WASM)
 */

self.importScripts('https://docs.opencv.org/4.5.4/opencv.js');

let cvReady = false;

cv['onRuntimeInitialized'] = () => {
    cvReady = true;
    self.postMessage({ type: 'STATUS', msg: 'OPENCV_READY' });
};

self.onmessage = function (e) {
    if (!cvReady) return;

    const { type, imageData, width, height, physicalSize, intrinsics } = e.data;

    if (type === 'PROCESS_FRAME') {
        const corners = findBookCorners(imageData, width, height);
        if (corners) {
            const pose = estimatePose(corners, width, height, physicalSize, intrinsics);
            self.postMessage({ type: 'CORNERS_FOUND', corners, pose });
        } else {
            self.postMessage({ type: 'CORNERS_FOUND', corners: null });
        }
    }
};

function estimatePose(corners, imgWidth, imgHeight, physicalSize, intrinsics) {
    const w = physicalSize.width / 2;
    const h = physicalSize.height / 2;
    let objPoints = cv.matFromArray(4, 1, cv.CV_32FC3, [
        -w, h, 0, // TL
        w, h, 0, // TR
        w, -h, 0, // BR
        -w, -h, 0  // BL
    ]);

    let imgPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners[0].x, corners[0].y,
        corners[1].x, corners[1].y,
        corners[2].x, corners[2].y,
        corners[3].x, corners[3].y
    ]);

    const { f, cx, cy } = intrinsics || { f: imgWidth, cx: imgWidth / 2, cy: imgHeight / 2 };
    let camMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
        f, 0, cx,
        0, f, cy,
        0, 0, 1
    ]);

    let distCoeffs = new cv.Mat.zeros(4, 1, cv.CV_64F);
    let rvec = new cv.Mat();
    let tvec = new cv.Mat();

    let success = cv.solvePnP(objPoints, imgPoints, camMatrix, distCoeffs, rvec, tvec);

    let poseMatrix = null;
    if (success) {
        let R = new cv.Mat();
        cv.Rodrigues(rvec, R); // Convert rotation vector to 3x3 matrix

        // Build 4x4 matrix (Row-major)
        poseMatrix = [
            R.data64F[0], R.data64F[1], R.data64F[2], tvec.data64F[0],
            R.data64F[3], R.data64F[4], R.data64F[5], tvec.data64F[1],
            R.data64F[6], R.data64F[7], R.data64F[8], tvec.data64F[2],
            0, 0, 0, 1
        ];
        R.delete();
    }

    objPoints.delete(); imgPoints.delete(); camMatrix.delete(); distCoeffs.delete();
    rvec.delete(); tvec.delete();

    return poseMatrix;
}

function findBookCorners(imageData, width, height) {
    let src = cv.matFromImageData(imageData);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let thresholded = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    // 1. Pre-process
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(blurred, thresholded, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    // 2. Find Contours
    cv.findContours(thresholded, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestContour = null;

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > 5000) { // Minimum size threshold
            let peri = cv.arcLength(cnt, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

            if (approx.rows === 4 && area > maxArea) {
                maxArea = area;
                bestContour = approx;
            } else {
                approx.delete();
            }
        }
    }

    let corners = null;
    if (bestContour) {
        let rawCorners = [
            { x: bestContour.data32S[0], y: bestContour.data32S[1] },
            { x: bestContour.data32S[2], y: bestContour.data32S[3] },
            { x: bestContour.data32S[4], y: bestContour.data32S[5] },
            { x: bestContour.data32S[6], y: bestContour.data32S[7] }
        ];
        corners = sortCorners(rawCorners);
        bestContour.delete();
    }

    // Cleanup
    src.delete(); gray.delete(); blurred.delete(); thresholded.delete(); contours.delete(); hierarchy.delete();

    return corners;
}

/**
 * Sorts 4 points into clockwise order: [TL, TR, BR, BL]
 */
function sortCorners(points) {
    // 1. Sort by Y coordinate
    points.sort((a, b) => a.y - b.y);

    // Top two points
    let top = points.slice(0, 2).sort((a, b) => a.x - b.x);
    // Bottom two points
    let bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);

    return [
        top[0],    // Top-Left
        top[1],    // Top-Right
        bottom[1], // Bottom-Right
        bottom[0]  // Bottom-Left
    ];
}
