# Dead Pixel Fix: A Journey to O(1) Real-Time Sensor Correction

## The Problem

Cheap camera modules—like the **OV2640** commonly paired with the **ESP32-S3 WROOM N16R8** development boards—often have manufacturing defects. These defects manifest as "hot pixels" or "dead pixels": tiny spots on the sensor that are permanently stuck at a bright color (usually white or a single saturated channel like pure red/green/blue).

For a $5 camera module, this is expected. But it's *incredibly* annoying when you're trying to monitor your 3D printer or stream video, because that one bright speck is always there, drawing your eye away from the actual content.

**This document chronicles the engineering journey to fix this problem entirely in software, running in the browser, at full frame rate, with zero performance penalty.**

---

## Hardware Context

| Component | Model |
|---|---|
| **Microcontroller** | ESP32-S3 WROOM N16R8 (16MB Flash, 8MB PSRAM) |
| **Camera Sensor** | OV2640 (2 Megapixel CMOS) |
| **Interface** | MJPEG over HTTP |
| **Resolution** | Up to 1024x768 (XGA) |
| **Frame Rate** | ~15-30 FPS depending on resolution/quality |

The ESP32-S3 streams a live MJPEG video feed to a browser. The browser displays this in an `<img>` tag. The challenge was: **how do you fix individual broken pixels in that video stream without modifying the ESP32 firmware or requiring a powerful backend server?**

The answer: **Client-side JavaScript post-processing.**

---

## The Naive Approach (And Why It Fails)

The most obvious solution is:
1. For each frame, loop through every pixel.
2. Check if the pixel is "too bright."
3. If so, replace it with the average of its neighbors.

This sounds simple. Here's the math for why it's a disaster:

*   A 640x480 frame has **307,200 pixels**.
*   At 30 FPS, that's **9,216,000 pixel checks per second**.
*   For each pixel, you need to read its neighbors, calculate averages, and compare. That's ~20+ operations per pixel.
*   **Result: 180+ million operations per second.** Your browser freezes. The video becomes a slideshow.

This is called **O(n)** complexity, where `n` is the number of pixels. It scales linearly with image size, and for real-time video, it's simply too slow.

---

## The Seven Versions: A Story of Iteration

### V1: Absolute Brightness Threshold
**Idea**: If a pixel's brightness is above a fixed value (e.g., 250 out of 255), it's "dead."

**Failure**: Dead pixels aren't always pure white. They're often just *brighter than their neighbors*. A pixel with value 150 in a dark scene (where neighbors are 30) is still a "hot pixel," but V1 wouldn't catch it.

---

### V2: Vertical Line Fix
**Idea**: Some sensors have entire columns that are defective. Use only left/right neighbors to fix vertical lines.

**Failure**: Our specific defect was a **2x2 cluster**, not a line. Using vertical neighbors just sampled more broken pixels.

---

### V3: Outlier Detection (Immediate Neighbors)
**Idea**: Compare each pixel to its 8 immediate neighbors. If it's significantly brighter than the average, it's an outlier.

**Failure**: JPEG compression. When the ESP32 encodes the stream as JPEG, it blurs sharp edges. A single bright pixel becomes a small "halo" or "glow" that contaminates its immediate neighbors. So when we sample neighbors at distance 1, we're sampling pixels that are *also* partially bright due to the compression artifact. The dead pixel appeared "less dead" but didn't disappear.

---

### V4: The "Cluster Hop" (2px Jump)
**Idea**: Instead of sampling immediate neighbors, sample pixels **2 pixels away**. This "hops over" the cluster and the JPEG halo.

**Result**: Partial success! The pixel was significantly dimmer. But the 2px jump wasn't far enough for some compression settings. We were still sampling the edge of the halo.

---

### V5: Jump-Median (4px Radius)
**Idea**: Sample 8 neighbors at **4 pixels away**. Instead of averaging them (which is susceptible to outliers), use the **median** value. The median is the "middle" value when sorted, which completely ignores extreme outliers.

**Result**: **The dead pixel vanished!** For the first time, the defect was completely invisible.

**BUT**: Performance was destroyed. For every single pixel in the frame, we were:
1. Creating 3 arrays (R, G, B channels).
2. Sorting each array (O(n log n)).
3. Extracting the median.

At 307,200 pixels per frame, this was catastrophic. The browser became unresponsive. Scrolling the page was laggy. The video stuttered.

We had solved the *visual* problem but created a *performance* problem.

---

### V6: The O(1) Breakthrough - Caching

This is where the magic happened.

**Key Insight**: Dead pixels don't *move*. They're physical defects on the sensor. Once you know *where* they are, you don't need to scan the entire frame every time. You just need to fix those specific spots.

**The Algorithm**:
1. **Detection Pass (runs ONCE)**: On the first frame (or when the user changes settings), scan the entire image to find all "outlier" pixels. Store their (x, y) coordinates in a cache.
2. **Fix Pass (runs EVERY frame)**: For each subsequent frame, only loop through the cached coordinates. For each cached pixel, replace it with the median/average of its neighbors.

**The Result**:
*   **Detection Pass**: O(n) — but it only runs *once*.
*   **Fix Pass**: O(k), where `k` is the number of dead pixels. For a typical cheap sensor, `k` might be 5-50 pixels.

**50 pixels vs. 307,200 pixels. That's a 6,000x reduction in per-frame work.**

The browser was smooth again. Video played at full frame rate. The dead pixels were gone. Mission accomplished.

---

### V7: The Management Suite

With the core algorithm stable, we built a full UI around it:

| Feature | Description |
|---|---|
| **Algorithm Selection** | Choose between Median (best), Average (smooth), or Minimum (aggressive). |
| **Adjustable Radius** | 1-15px. Larger radius = more aggressive at catching halos. |
| **Threshold Slider** | 0-1000. Lower = more sensitive. |
| **Detection Map** | Toggleable mode that shows corrected pixels as bright red dots. |
| **Recalibrate Button** | Force a fresh sensor scan on-demand. |
| **Pixel Counter** | Displays how many defects are being managed. |

---

## Why O(1) Matters: A Layman's Explanation

Imagine you're a librarian. Someone asks you to find a typo in a book.

**O(n) Approach**: Read every single word in the book, every time someone asks. If the book has 100,000 words, you read 100,000 words per request.

**O(1) Approach**: The first time someone asks, you read the whole book and write down the page numbers of the typos on a sticky note. Every future request, you just look at the sticky note. It doesn't matter if the book has 100 or 1 million words—your answer time is constant.

For video processing:
*   **O(n)** means processing time grows with image size. Bigger images = slower.
*   **O(1)** means processing time is constant. 640x480 or 4K, it's the same speed (for the fix pass).

This is why phones, cameras, and video software can do real-time effects. They're not scanning every pixel every frame. They're using smart caching, lookup tables, and other tricks to achieve constant-time performance.

---

## Technical Implementation

### The Processing Loop
```javascript
// Runs every frame via requestAnimationFrame
function processFrame() {
    // 1. Draw the <img> stream to a hidden <canvas>
    procCtx.drawImage(streamImg, 0, 0);
    
    // 2. Get raw pixel data
    const imageData = procCtx.getImageData(0, 0, w, h);
    const data = imageData.data; // Uint8ClampedArray: [R,G,B,A, R,G,B,A, ...]
    
    // 3. Fix cached dead pixels (O(k) where k = ~10-50)
    for (const pix of deadPixelCache) {
        const i = (pix.y * w + pix.x) * 4;
        // ... replace with median/average of neighbors R pixels away
    }
    
    // 4. Optional: Temporal smoothing (blend with previous frame)
    // 5. Put processed data back to canvas
    procCtx.putImageData(imageData, 0, 0);
    
    requestAnimationFrame(processFrame);
}
```

### Detection Logic
```javascript
// Runs once when cache is invalid
for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
        const lum = pixel[x,y].brightness;
        const neighborAvg = average(
            pixel[x, y-R], pixel[x, y+R],
            pixel[x-R, y], pixel[x+R, y]
        );
        if (lum - neighborAvg > threshold) {
            cache.push({x, y}); // Remember this spot
        }
    }
}
```

---

## Future Improvements

- [ ] **Dark Frame Subtraction**: Capture a fully black frame on startup and use it as a "defect map."
- [ ] **WebWorker Offloading**: Move the detection pass to a background thread.
- [ ] **GPU Acceleration**: Use WebGL shaders for the fix pass (though this may be overkill given O(1) performance).
- [ ] **Automatic Periodic Recalibration**: Re-scan every N minutes to catch sensor drift.

---

## Conclusion

What started as "there's a white dot on my camera" became a deep dive into image processing, algorithm complexity, JPEG compression artifacts, and browser performance optimization.

The final solution is elegant:
1. **Scan once, fix forever.**
2. **Cache the locations, not the pixels.**
3. **O(1) per-frame complexity.**

This approach could be applied to any cheap camera module with sensor defects. It requires no firmware changes, no server-side processing, and works entirely in the browser.

*— January 2026*
