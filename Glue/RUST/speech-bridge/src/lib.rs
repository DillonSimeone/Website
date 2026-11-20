//! Shared library crate for `speech-bridge` GUI and `speech-bench` WAV+noise CLI benchmark.

pub mod bench;
pub mod denoise;
pub mod icon;
pub mod icon_gen;
pub mod live_captions;
pub mod llm_polish;
pub mod meter;
pub mod sherpa_ffi;
pub mod stream_decoder;
pub mod stt;
pub mod tts;
pub mod ui;
pub mod whisper_gpu;
pub mod win_util;
