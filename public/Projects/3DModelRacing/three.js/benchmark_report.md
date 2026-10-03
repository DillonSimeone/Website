# 🏁 3D Model Racing — Performance Benchmark Report

**Generated:** 2026-10-03T06:07:33.850Z  
**Frames Sampled:** 1000 frames (~5.2s test drive)  
**Resolution:** 1280 × 720 (DPR: 1)  

---

## 📈 Executive Summary

| Metric | Result | Target Benchmark | Status |
| :--- | :--- | :--- | :--- |
| **Average Framerate** | **190.7 FPS** | ≥ 60.0 FPS | ✅ PASS |
| **1% Low Framerate** | **129.9 FPS** | ≥ 45.0 FPS | ✅ PASS |
| **0.1% Low Framerate** | **0.7 FPS** | ≥ 30.0 FPS | ⚠️ WARN |
| **Avg Frame Time** | **5.24 ms** | ≤ 16.6 ms | ✅ PASS |
| **99th Percentile** | **7.70 ms** | ≤ 22.0 ms | ✅ PASS |
| **Frame Variance (StdDev)** | **45.65 ms** | ≤ 3.5 ms | ⚠️ JITTER |

---

## 🔬 Subsystem CPU / GPU Time Breakdown

| Subsystem | Avg Execution Time | % of Frame Budget | Notes |
| :--- | :--- | :--- | :--- |
| **GPU Scene Render** | 8.66 ms | 165.1% | WebGL draw calls & shader execution |
| **Grass & Atmosphere (world.js)** | 0.08 ms | 1.5% | 1.6M blades uniform update & fog sync |
| **Infinite Road Streamer (road_streamer.js)** | 0.02 ms | 0.4% | C1 Hermite chunk extrusion, rise/sink animation |
| **Physics & AI Rivals (vehicle.js / rivals.js)** | 0.05 ms | 1.0% | 7 vehicles hover raycasts & autonomous AI |

---

## 🎨 WebGL Pipeline & GPU Memory

| Metric | Average | Peak |
| :--- | :--- | :--- |
| **Draw Calls** | 541 | 974 |
| **Triangles Rendered** | 16,361,676 | 16,376,774 |
| **Geometries in VRAM** | 188 | 188 |
| **Textures in VRAM** | 17 | 17 |

---

## 💡 Automated Diagnostics & Optimization Insights

- **GPU Headroom:** Total render call count (541) is well within mobile/desktop budget (< 150 calls).
- **Triangle Throughput:** Peak tris (16,376,774) handled smoothly in single-pass instanced arrays.
- **Frame Pacing:** Stutter max was 1404.60ms, min was 1.40ms.
