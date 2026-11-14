# Tool: AR Tracking Quality Auditor (Python + OpenCV)

## Goal
A desktop utility to provide real-time feedback on image tracking stability for artists/designers.

## Implementation Details
- **Engine:** OpenCV (Python) using the `ORB` feature detector.
- **Input:** Static images, Webcams, or OBS Virtual Camera (via `cv2.VideoCapture`).
- **Logic:** - Convert frame to Grayscale.
  - Run `orb.detectAndCompute`.
  - Draw keypoints as green dots.
  - **The Density Score:** Calculate `points_per_100px`. If < 50, status = "POOR".

## The Code Snippet (Core Auditor)
```python
import cv2
import numpy as np

def audit_frame(frame):
    orb = cv2.ORB_create(nfeatures=1000)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Detect features
    kp, des = orb.detectAndCompute(gray, None)
    
    # Draw "Feature Heatmap"
    heatmap = np.zeros_like(gray)
    for p in kp:
        x, y = map(int, p.pt)
        cv2.circle(heatmap, (x, y), 10, 255, -1)
    heatmap = cv2.GaussianBlur(heatmap, (51, 51), 0)
    
    # Visual Overlays
    scored_frame = cv2.drawKeypoints(frame, kp, None, color=(0, 255, 0))
    count = len(kp)
    color = (0, 255, 0) if count > 300 else (0, 0, 255)
    cv2.putText(scored_frame, f"Features: {count}", (50, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
    
    return scored_frame, heatmap