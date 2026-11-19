# 🏁 3D Model Racing — Performance Benchmark Report

**Generated:** 2026-11-19T08:03:53.317Z  
**Frames Sampled:** 1000 frames (~0.9s test drive)  
**Resolution:** 1280 × 720 (DPR: 1)  
**Hardware Tier:** HIGH (ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Ti (0x00002D04) Direct3D11 vs_5_0 ps_5_0, D3D11))  

---

## 📈 Executive Summary

| Metric | Result | Target Benchmark | Status |
| :--- | :--- | :--- | :--- |
| **Average Framerate** | **1075.3 FPS** | ≥ 60.0 FPS | ✅ PASS |
| **1% Low Framerate** | **588.2 FPS** | ≥ 45.0 FPS | ✅ PASS |
| **0.1% Low Framerate** | **91.7 FPS** | ≥ 30.0 FPS | ✅ PASS |
| **Avg Frame Time** | **0.93 ms** | ≤ 16.6 ms | ✅ PASS |
| **99th Percentile** | **1.70 ms** | ≤ 22.0 ms | ✅ PASS |
| **Frame Variance (StdDev)** | **0.46 ms** | ≤ 3.5 ms | ✅ STABLE |

---

## 🔬 Subsystem CPU / GPU Time Breakdown

| Subsystem | Avg Execution Time | % of Frame Budget | Notes |
| :--- | :--- | :--- | :--- |
| **GPU Scene Render** | 2.64 ms | 283.9% | WebGL draw calls & instanced shader execution |
| **Grass & Atmosphere (world.js)** | 0.04 ms | 4.3% | Instanced grass uniforms, GPU weather & fog sync |
| **Infinite Road Streamer (road_streamer.js)** | 0.03 ms | 3.2% | C1 Hermite chunk extrusion, rise/sink animation |
| **Physics & AI Rivals (vehicle.js / rivals.js)** | 0.11 ms | 11.8% | 7 vehicles hover raycasts & autonomous AI |

---

## 🎨 WebGL Pipeline & Instanced Grass Memory

| Metric | Average / Active | Peak / Pooled |
| :--- | :--- | :--- |
| **Draw Calls** | 78 | 91 |
| **Triangles Rendered** | 8,418,902 | 9,903,938 |
| **Active Grass Blades** | 3,698,307 (92%) | 4,000,878 (183.1 MB VRAM) |
| **Geometries in VRAM** | 130 | 130 |
| **Textures in VRAM** | 13 | 13 |

---

## 💡 Automated Diagnostics & Optimization Insights

- **Governor State:** Targeting 60 FPS on `high` tier at **92%** active density.
- **Frame Pacing:** Stutter max was 10.90ms, min was 0.50ms.
