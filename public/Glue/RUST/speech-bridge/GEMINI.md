# Speech Bridge — Engineering Log & Project Memory (`GEMINI.md`)

> **Purpose**: 100% offline, low-latency, two-way Speech-to-Text (STT) and Text-to-Speech (TTS) desktop bridge written in pure Rust for deaf and mute daily communication in noisy cafes, restaurants, bars, and multi-speaker group conversations.

---

## 1. Hardware & Motivation

- **Target Laptop**: Intel Core i5-13420H (8C/12T), 16 GB RAM, **NVIDIA GeForce RTX 3050 6GB Laptop GPU** (CUDA 13.3 driver).
- **The Original Problem**:
  - `Win11 Captions` (`src/live_captions.rs`) scraped `LiveCaptions.exe` via UI Automation — lightweight CPU model, zero control over denoising/VAD, collapses in noisy rooms.
  - Legacy `Whisper Live` (`ggml-base.en.bin`, 141 MB, CPU-only `whisper-server.exe`) ran at ~965 ms/decode, sent raw high-passed audio without neural denoising, hard-chopped speech at 3.5 seconds, and hit **80.0% WER** in `-5 dB` cafe babble — while the **RTX 3050 6GB GPU sat at 0% / 0 MiB VRAM**.

---

## 2. Current Architecture (Pure Rust + Portable CUDA DLLs, Zero Python)

All models and GPU runtimes live locally inside gitignored `models/` and `runtime/` folders — zero system-wide CUDA Toolkit installation and zero Python dependencies.

| Module | Role |
|---|---|
| `src/meter.rs` | WASAPI multi-mic simultaneous capture (`cpal`), active-SNR switching (smooth 16-sample crossfade + 250 ms hangover), System Audio Loopback, 24-band Goertzel spectrum, live `SignalStatus` (`CLEAR / NOISY / DROWNED / CLIP! / TTS GATE`), and stack-allocated `[i16; 512]` frames (**zero heap allocs in OS audio callbacks**). |
| `src/tts.rs` | Local Piper neural TTS + WinRT OneCore voices, synchronous interruptible playback (`PlaySoundW`), Voice Audition (`TEST`), lock-free `TtsEchoGate` (mutes mic audio to STT during outbound TTS + 320 ms reverb tail), and `TtsWordTracker` (PCM WAV silence-trimmed word timing for live bold + underlined spoken-word highlighting). |
| `src/sherpa_ffi.rs` | Bit-exact dynamic Win32 `LoadLibraryW` FFI to `sherpa-onnx` v2.0.1 (`sherpa-onnx-c-api.dll` + portable CUDA 12 / cuDNN 9 DLLs). Wraps: **NVIDIA Parakeet TDT 0.6B v2 FP16** (with `hotwords.txt` beam-search support), **Silero VAD v5**, **GTCRN / DPDFNet8 / VoxLock** online + offline neural speech enhancers (contiguous zero-alloc FIFO), and **WeSpeaker CAM++** English speaker embeddings (`cosine_threshold = 0.40`). |
| `src/whisper_gpu.rs` | Persistent `whisper-server.exe` client for both **Distil-Whisper Large-v3.5 EN CUDA** (`runtime/whisper-cuda`) and legacy **Whisper `base.en` CPU** (`whisper/Release`). |
| `src/stream_decoder.rs` | Zero-allocation streaming pipeline (`O(1)` streaming denoise -> Silero VAD -> Parakeet/Whisper -> **LocalAgreement-2** monotonic prefix locking -> 14 s punctuation-aware split with `strip_overlap_prefix` deduplication -> WeSpeaker ID). Shared identically by GUI and CLI benchmark. |
| `src/llm_polish.rs` | Asynchronous local GPU phonetic post-correction via `llama-server.exe` CUDA (**Qwen2.5-1.5B-Instruct Q4_K_M**, ~1.1 GB VRAM, ~120 ms/sentence). Feeds last 5 turns + `hotwords.txt` glossary with a deterministic **`<=30%` normalized word edit-distance safety guard** so it can never hallucinate or rewrite meaning. |
| `src/stt.rs` | Unified STT controller keeping loaded GPU models warm across start/stop toggles and engine switches (`ParakeetGpu`, `DistilWhisperGpu`, `Win11Captions`, `WhisperCpuLegacy`). |
| `src/ui.rs` | Double-buffered cyber-terminal Win32 GDI UI with engine dropdown, multi-mic picker, `DNS: OFF / GTCRN / DPDF8 / VOXLOCK`, `SPK: ON/OFF` color-coded cards, `LLM: ON/OFF` `[LLM]` polish badge, `A-`/`A+` (`Ctrl+/-`) caption zoom, renamed `TEST` voice audition button, zero-clone `health_buf`, and custom dark cyber-terminal hover tooltips on every control. |
| `src/bench.rs` & `src/bin/speech_bench.rs` | Automated **WAV + Background Noise Overlay** benchmark harness (`speech-bench.exe`). Mixes clean speech WAVs with noise WAVs (`cafe_babble`, `restaurant_music_clatter`, or custom files) at exact calibrated SNRs (`clean`, `+10`, `+5`, `0`, `-5 dB`) and measures WER, CER, 1st-text latency, word-lock latency, flicker %, inference ms, and speaker clustering. |

---

## 3. Verified Hardware & Benchmark Results (RTX 3050 6GB)

- **GPU Footprint (`nvidia-smi` verified)**:
  - Parakeet TDT 0.6B FP16 CUDA alone: **2.26 GB / 6.14 GB VRAM**, ~31% GPU util, **~9.6 W**, 62°C.
  - Parakeet FP16 + Qwen2.5-1.5B Q4_K_M CUDA together: **~3.4 GB / 6.14 GB VRAM**.

| Pipeline | Clean WER | +10 dB WER | +5 dB WER | 0 dB WER | -5 dB WER | Avg Infer | 1st Text |
|---|---:|---:|---:|---:|---:|---:|---:|
| Legacy Whisper `base.en` CPU (Baseline) | 18.3% | 22.9% | 20.0% | 24.2% | 45.0% *(80% babble)* | 965 ms | 740–1105 ms |
| **Parakeet TDT 0.6B FP16 CUDA (`DNS: OFF`)** | 8.3% | **5.8%** | **5.0%** | **5.8%** | 24.2% | **198 ms** | **329 ms** |
| **Parakeet GPU + Qwen2.5-1.5B CUDA (`OFF+LLM`)** | 9.2% | 7.1% | 6.7% | 7.9% | **23.8%** | 231 ms | 360 ms |
| **Parakeet TDT 0.6B FP16 CUDA (`DNS: GTCRN`)** | **1.7%** | 12.1% | **5.0%** | **8.3%** | 27.5% | **242 ms** | **351 ms** |
| **Parakeet TDT 0.6B FP16 CUDA (`DNS: DPDF8`)** | 8.3% | **4.6%** | 8.8% | 10.4% | 32.5% | 405 ms | 405 ms |
| **Parakeet GPU + VoxLock (1-on-1 single speaker)** | **3.3%** | **6.7%** | **6.7%** | **8.3%** | 31.7% | 485 ms | 380 ms |
| Distil-Whisper Large-v3.5 EN CUDA (`DNS: OFF`) | 19.2% | 18.3% | 21.7% | 22.1% | 31.2% | 377 ms | 500 ms |

### Key Empirical Discoveries
1. **O(N²) Re-Denoising Eliminated**: Running offline denoising on every 350 ms partial decode stalled CPU. Moving to `O(1)` streaming denoising (`enhance_stream_chunk_into`) with a contiguous FIFO cut overhead ~100×.
2. **STFT Phase Comb-Filtering**: Blending 65% STFT-delayed denoised audio with 35% undelayed raw audio created comb-filtering that hurt WER. Switching to pure phase-coherent modes (`OFF` / `GTCRN` / `DPDF8` / `VOXLOCK`) eliminated the artifact.
3. **Overlap Boundary Deduplication**: Splitting long turns at 8.5 s duplicated boundary words (inflating clean WER to 13.3%). Raising soft-split to 14.0 s + `strip_overlap_prefix` dropped clean GTCRN WER to **1.7%**.
4. **When to Use Each Denoiser Mode**:
   - `DNS: GTCRN` (default): Fast 0.5 MB general cafe/restaurant cleaner (`1.7%` clean, `0.0%` WER on restaurant music/dishes down to `-5 dB`).
   - `DNS: DPDF8`: Deepest steady-noise & lounge-music suppressor (`4.6%` at `+10 dB`).
   - `DNS: VOXLOCK`: **1-on-1 crowded bar/cafe ONLY** — locks onto the first speaker after 3 seconds and intentionally suppresses other human voices (do NOT use on multi-speaker group tables, where it will silence speakers 2 & 3!).
   - `DNS: OFF`: Best when loud competing human chatter is louder than your partner (`-5 dB` babble), letting Parakeet's encoder separate speech directly.

---

## 4. Rust Ownership & Zero-Allocation Audit

Audited the entire crate for borrow-checker appeasement (`0` occurrences of `Rc<RefCell<...>>`, `Box::leak`, or `static mut`) and eliminated all 4 hot-path allocations:
1. `src/meter.rs`: Replaced `SyncSender<Vec<i16>>` + `chunk.to_vec()` inside real-time WASAPI callbacks with stack-allocated `[i16; 512]` (`AudioFrame`).
2. `src/stream_decoder.rs`: Replaced per-decode `Vec<f32>` allocations (~640 KB × 3/sec) with reusable `asr_scratch: Vec<f32>` + in-place `copy_within` overlap trims.
3. `src/stream_decoder.rs`: Replaced `VecDeque<Vec<f32>>` pre-roll + idle `.clone()` with fixed `[f32; 512]` stack ring buffers and `enhance_stream_chunk_into`.
4. `src/ui.rs`: Eliminated `active_mic_name.clone()` on 30 Hz meter ticks using a reusable `health_buf: String`.

---

## 5. Build, Test & Run Commands

```powershell
cd public\Glue\RUST\speech-bridge

# Run unit tests (LocalAgreement-2, overlap dedup, LLM safety guard)
cargo test

# Build release GUI (speech-bridge.exe) and CLI benchmark (speech-bench.exe)
cargo build --release
Copy-Item target\release\speech-bridge.exe speech-bridge.exe -Force
Copy-Item target\release\speech-bench.exe  speech-bench.exe  -Force

# Run full WAV + noise benchmark (auto-generates Piper + room noise fixtures in bench_data/)
.\speech-bench.exe --engines parakeet,distil,legacy --snrs clean,10,5,0,-5

# Benchmark VoxLock + Local Qwen2.5-1.5B CUDA LLM polish
.\speech-bench.exe --engines max --snrs clean,10,5,0,-5

# Test a custom WAV + background noise overlay
.\speech-bench.exe --speech my_clip.wav --ref "exact spoken script" --noise cafe.wav --snrs clean,5,0,-5 --show-hyp
```

- **Custom Hotwords**: Edit `hotwords.txt` (one name/phrase per line, no `#` comments) to bias Parakeet and inform the Qwen2.5-1.5B LLM polish pass.
- **Website Showcase & Interactive Replica**: Published at [`public/Projects/speechToText/index.html`](../../../Projects/speechToText/index.html) and integrated via [`src/content/major-projects/10-speech-to-text.html`](../../../../src/content/major-projects/10-speech-to-text.html).
