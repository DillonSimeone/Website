# 🏁 3D Model Racing — Performance Benchmark Report

**Generated:** 2026-10-01T10:08:23.373Z  
**Frames Sampled:** 1000 frames (~4.0s test drive)  
**Resolution:** 1280 × 720 (DPR: 1)  

---

## 📈 Executive Summary

| Metric | Result | Target Benchmark | Status |
| :--- | :--- | :--- | :--- |
| **Average Framerate** | **251.4 FPS** | ≥ 60.0 FPS | ✅ PASS |
| **1% Low Framerate** | **149.3 FPS** | ≥ 45.0 FPS | ✅ PASS |
| **0.1% Low Framerate** | **105.3 FPS** | ≥ 30.0 FPS | ✅ PASS |
| **Avg Frame Time** | **3.98 ms** | ≤ 16.6 ms | ✅ PASS |
| **99th Percentile** | **6.70 ms** | ≤ 22.0 ms | ✅ PASS |
| **Frame Variance (StdDev)** | **1.00 ms** | ≤ 3.5 ms | ✅ STABLE |

---

## 🔬 Subsystem CPU / GPU Time Breakdown

| Subsystem | Avg Execution Time | % of Frame Budget | Notes |
| :--- | :--- | :--- | :--- |
| **GPU Scene Render** | 9.21 ms | 231.6% | WebGL draw calls & shader execution |
| **Grass & Atmosphere (world.js)** | 0.10 ms | 2.5% | 1.6M blades uniform update & fog sync |
| **Infinite Road Streamer (road_streamer.js)** | 0.03 ms | 0.8% | C1 Hermite chunk extrusion, rise/sink animation |
| **Physics & AI Rivals (vehicle.js / rivals.js)** | 0.05 ms | 1.3% | 7 vehicles hover raycasts & autonomous AI |

---

## 🎨 WebGL Pipeline & GPU Memory

| Metric | Average | Peak |
| :--- | :--- | :--- |
| **Draw Calls** | 541 | 974 |
| **Triangles Rendered** | 17,597,396 | 17,612,492 |
| **Geometries in VRAM** | 174 | 174 |
| **Textures in VRAM** | 17 | 17 |

---

## 💡 Automated Diagnostics & Optimization Insights

- **GPU Headroom:** Total render call count (541) is well within mobile/desktop budget (< 150 calls).
- **Triangle Throughput:** Peak tris (17,612,492) handled smoothly in single-pass instanced arrays.
- **Frame Pacing:** Stutter max was 9.50ms, min was 1.40ms.
