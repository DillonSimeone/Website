# Thresholds — Local Headless AI Video Generation

* **Project Directory**: `public/MiniProjects/Thresholds/`
* **Engine Location**: `E:\AI\ImageGeneration\generate_video.py` using `E:\AI\ImageGeneration\venv\Scripts\python.exe`.
* **Hardware Profile**: NVIDIA GeForce RTX 5060 Ti (16 GB VRAM).
* **Strict Disk Rule**: **NEVER write or cache on `C:`**. All HuggingFace caches and models MUST reside on `E:\AI\ImageGeneration\hf_cache` (`HF_HOME` & `HF_HUB_CACHE` enforced).
* **Current Status**:
  - `Thresholds` website frontend is complete with 12 photographic plates, Web Audio ambient engine, and video layer with fade-to-black scene transitions (`public/MiniProjects/Thresholds/`).
  - LTX-Video pipeline runs headlessly on the GPU via sequential CPU offload, but test outputs (`output_test_ltx.mp4`) are currently rendering nearly static (lack sufficient dynamic motion/animation from the conditioning frame).
* **Next Session Tasks**:
  1. Investigate and fix LTX-Video motion dynamics: adjust conditioning noise/denoise parameters (`decode_timestep`, `decode_noise_scale`), motion guidance scale, or explore Wan2.1 / SVD-XT integration in `E:\AI\ImageGeneration`.
  2. Batch-generate videos for the 11 remaining passages (`generate_video.py --thresholds`) into `public/MiniProjects/Thresholds/assets/videos/`.
* **Reference documentation**: `E:\AI\ImageGeneration\AGENTS.md`.
