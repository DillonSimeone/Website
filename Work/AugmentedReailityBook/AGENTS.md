# Augmented Reality Book Project

This project explores different implementations of image tracking and augmented reality for an interactive book experience.

## Architecture
The repository is organized into three main implementation branches:

1.  **[MindAR](blob://MindAR/gemini.md)**: The primary, data-driven "Peeling Prototype". Uses the MindAR library for stable image tracking.
    -   **V0**: Basic internal smoothing and ghosting logic.
    -   **V1**: Upgraded standalone smoothing (deadzones) and ghosting (GSAP fades).
2.  **[OpenCV](blob://OpenCV/gemini.md)**: Experimental implementation using OpenCV.js for manual corner detection and pose estimation.
3.  **[MediaPipe](blob://MediaPipe/gemini.md)**: Placeholder for future implementations using MediaPipe's face and hand tracking for interactive elements.

## Common Assets
-   `/trainingImages`: Target images for tracking.
-   `/3dModel`: Interactive 3D assets used across implementations.
