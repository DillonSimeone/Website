# OpenCV Experiments

This folder contains a custom AR implementation that bypasses high-level libraries in favor of direct Computer Vision.

## Technical Details
-   **Engine**: OpenCV.js (WebAssembly).
-   **Detection**: Uses `findContours` and `approxPolyDP` to identify the rectangular boundaries of the book pages.
-   **Pose Estimation**: Uses `solvePnP` to calculate the 3D position and rotation of the page relative to the camera.
-   **Rendering**: Three.js.

## Status
-   Experimental prototype.
-   Currently focused on "SolvePnP" accuracy and worker-based performance.
