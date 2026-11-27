//! Bit-exact dynamic FFI bindings to `sherpa-onnx` v2.0.x C-API (`sherpa-onnx-c-api.dll`)
//! with safe RAII Rust wrappers for:
//! - [`ParakeetAsr`]: NVIDIA Parakeet TDT 0.6B v2 FP16/INT8 on CUDA GPU (with CPU fallback)
//! - [`NeuralDenoiser`]: DPDFNet8 & GTCRN neural speech enhancement (online + offline)
//! - [`SileroVad`]: Silero VAD v5 neural voice activity detector
//! - [`WeSpeakerTracker`]: WeSpeaker English CAM++ online speaker clustering (`[SPK 1..N]`)

#![allow(non_camel_case_types, dead_code)]

use std::collections::VecDeque;
use std::ffi::{c_char, c_float, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::ptr;
use std::sync::Arc;

use windows::core::{PCSTR, PCWSTR};
use windows::Win32::Foundation::{FreeLibrary, HMODULE};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW, SetDllDirectoryW};

use crate::stream_decoder::{AsrModel, DenoiserModel, SpeakerIdModel, VadModel, CHUNK_SAMPLES};
use crate::win_util::{resolve_asset_path, to_wide, AUDIO_SAMPLE_RATE};

struct WinDll {
    handle: HMODULE,
}

unsafe impl Send for WinDll {}
unsafe impl Sync for WinDll {}

impl WinDll {
    fn open(path: &Path) -> Result<Self, String> {
        let wide = to_wide(&path.to_string_lossy());
        let handle = unsafe { LoadLibraryW(PCWSTR(wide.as_ptr())) }
            .map_err(|e| format!("LoadLibraryW({}) failed: {e}", path.display()))?;
        Ok(Self { handle })
    }

    unsafe fn sym<T: Copy>(&self, name_nul: &[u8]) -> Result<T, String> {
        let addr = GetProcAddress(self.handle, PCSTR(name_nul.as_ptr())).ok_or_else(|| {
            format!(
                "Missing symbol {}",
                std::str::from_utf8(name_nul).unwrap_or("?")
            )
        })?;
        Ok(std::mem::transmute_copy(&addr))
    }
}

impl Drop for WinDll {
    fn drop(&mut self) {
        if !self.handle.0.is_null() {
            unsafe {
                let _ = FreeLibrary(self.handle);
            }
        }
    }
}

// ============================================================================
// Exact C-API structs matching sherpa-onnx v2.0.1 `c-api.h`
// ============================================================================

#[repr(C)]
#[derive(Default)]
struct SherpaOnnxFeatureConfig {
    sample_rate: i32,
    feature_dim: i32,
}

#[repr(C)]
struct SherpaOnnxOfflineCtcFstDecoderConfig {
    graph: *const c_char,
    max_active: i32,
}

impl Default for SherpaOnnxOfflineCtcFstDecoderConfig {
    fn default() -> Self {
        Self {
            graph: ptr::null(),
            max_active: 0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxHomophoneReplacerConfig {
    dict_dir: *const c_char,
    lexicon: *const c_char,
    rule_fsts: *const c_char,
}

impl Default for SherpaOnnxHomophoneReplacerConfig {
    fn default() -> Self {
        Self {
            dict_dir: ptr::null(),
            lexicon: ptr::null(),
            rule_fsts: ptr::null(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineTransducerModelConfig {
    encoder: *const c_char,
    decoder: *const c_char,
    joiner: *const c_char,
}

impl Default for SherpaOnnxOfflineTransducerModelConfig {
    fn default() -> Self {
        Self {
            encoder: ptr::null(),
            decoder: ptr::null(),
            joiner: ptr::null(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineParaformerModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineParaformerModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineNemoEncDecCtcModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineNemoEncDecCtcModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineWhisperModelConfig {
    encoder: *const c_char,
    decoder: *const c_char,
    language: *const c_char,
    task: *const c_char,
    tail_paddings: i32,
    enable_token_timestamps: i32,
    enable_segment_timestamps: i32,
}

impl Default for SherpaOnnxOfflineWhisperModelConfig {
    fn default() -> Self {
        Self {
            encoder: ptr::null(),
            decoder: ptr::null(),
            language: ptr::null(),
            task: ptr::null(),
            tail_paddings: 0,
            enable_token_timestamps: 0,
            enable_segment_timestamps: 0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineCanaryModelConfig {
    encoder: *const c_char,
    decoder: *const c_char,
    src_lang: *const c_char,
    tgt_lang: *const c_char,
    use_pnc: i32,
}

impl Default for SherpaOnnxOfflineCanaryModelConfig {
    fn default() -> Self {
        Self {
            encoder: ptr::null(),
            decoder: ptr::null(),
            src_lang: ptr::null(),
            tgt_lang: ptr::null(),
            use_pnc: 0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineCohereTranscribeModelConfig {
    encoder: *const c_char,
    decoder: *const c_char,
    language: *const c_char,
    use_punct: i32,
    use_itn: i32,
}

impl Default for SherpaOnnxOfflineCohereTranscribeModelConfig {
    fn default() -> Self {
        Self {
            encoder: ptr::null(),
            decoder: ptr::null(),
            language: ptr::null(),
            use_punct: 0,
            use_itn: 0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineFireRedAsrModelConfig {
    encoder: *const c_char,
    decoder: *const c_char,
}

impl Default for SherpaOnnxOfflineFireRedAsrModelConfig {
    fn default() -> Self {
        Self {
            encoder: ptr::null(),
            decoder: ptr::null(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineFireRedAsrCtcModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineFireRedAsrCtcModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineMoonshineModelConfig {
    preprocessor: *const c_char,
    encoder: *const c_char,
    uncached_decoder: *const c_char,
    cached_decoder: *const c_char,
    merged_decoder: *const c_char,
}

impl Default for SherpaOnnxOfflineMoonshineModelConfig {
    fn default() -> Self {
        Self {
            preprocessor: ptr::null(),
            encoder: ptr::null(),
            uncached_decoder: ptr::null(),
            cached_decoder: ptr::null(),
            merged_decoder: ptr::null(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineTdnnModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineTdnnModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineLMConfig {
    model: *const c_char,
    scale: c_float,
}

impl Default for SherpaOnnxOfflineLMConfig {
    fn default() -> Self {
        Self {
            model: ptr::null(),
            scale: 0.0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineSenseVoiceModelConfig {
    model: *const c_char,
    language: *const c_char,
    use_itn: i32,
}

impl Default for SherpaOnnxOfflineSenseVoiceModelConfig {
    fn default() -> Self {
        Self {
            model: ptr::null(),
            language: ptr::null(),
            use_itn: 0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineDolphinModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineDolphinModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineZipformerCtcModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineZipformerCtcModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineWenetCtcModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineWenetCtcModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineOmnilingualAsrCtcModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineOmnilingualAsrCtcModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineFunASRNanoModelConfig {
    encoder_adaptor: *const c_char,
    llm: *const c_char,
    embedding: *const c_char,
    tokenizer: *const c_char,
    system_prompt: *const c_char,
    user_prompt: *const c_char,
    max_new_tokens: i32,
    temperature: c_float,
    top_p: c_float,
    seed: i32,
    language: *const c_char,
    itn: i32,
    hotwords: *const c_char,
}

impl Default for SherpaOnnxOfflineFunASRNanoModelConfig {
    fn default() -> Self {
        Self {
            encoder_adaptor: ptr::null(),
            llm: ptr::null(),
            embedding: ptr::null(),
            tokenizer: ptr::null(),
            system_prompt: ptr::null(),
            user_prompt: ptr::null(),
            max_new_tokens: 0,
            temperature: 0.0,
            top_p: 0.0,
            seed: 0,
            language: ptr::null(),
            itn: 0,
            hotwords: ptr::null(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineQwen3ASRModelConfig {
    conv_frontend: *const c_char,
    encoder: *const c_char,
    decoder: *const c_char,
    tokenizer: *const c_char,
    max_total_len: i32,
    max_new_tokens: i32,
    temperature: c_float,
    top_p: c_float,
    seed: i32,
    hotwords: *const c_char,
}

impl Default for SherpaOnnxOfflineQwen3ASRModelConfig {
    fn default() -> Self {
        Self {
            conv_frontend: ptr::null(),
            encoder: ptr::null(),
            decoder: ptr::null(),
            tokenizer: ptr::null(),
            max_total_len: 0,
            max_new_tokens: 0,
            temperature: 0.0,
            top_p: 0.0,
            seed: 0,
            hotwords: ptr::null(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineMedAsrCtcModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineMedAsrCtcModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineModelConfig {
    transducer: SherpaOnnxOfflineTransducerModelConfig,
    paraformer: SherpaOnnxOfflineParaformerModelConfig,
    nemo_ctc: SherpaOnnxOfflineNemoEncDecCtcModelConfig,
    whisper: SherpaOnnxOfflineWhisperModelConfig,
    tdnn: SherpaOnnxOfflineTdnnModelConfig,
    tokens: *const c_char,
    num_threads: i32,
    debug: i32,
    provider: *const c_char,
    model_type: *const c_char,
    modeling_unit: *const c_char,
    bpe_vocab: *const c_char,
    telespeech_ctc: *const c_char,
    sense_voice: SherpaOnnxOfflineSenseVoiceModelConfig,
    moonshine: SherpaOnnxOfflineMoonshineModelConfig,
    fire_red_asr: SherpaOnnxOfflineFireRedAsrModelConfig,
    dolphin: SherpaOnnxOfflineDolphinModelConfig,
    zipformer_ctc: SherpaOnnxOfflineZipformerCtcModelConfig,
    canary: SherpaOnnxOfflineCanaryModelConfig,
    wenet_ctc: SherpaOnnxOfflineWenetCtcModelConfig,
    omnilingual: SherpaOnnxOfflineOmnilingualAsrCtcModelConfig,
    medasr: SherpaOnnxOfflineMedAsrCtcModelConfig,
    funasr_nano: SherpaOnnxOfflineFunASRNanoModelConfig,
    fire_red_asr_ctc: SherpaOnnxOfflineFireRedAsrCtcModelConfig,
    qwen3_asr: SherpaOnnxOfflineQwen3ASRModelConfig,
    cohere_transcribe: SherpaOnnxOfflineCohereTranscribeModelConfig,
}

impl Default for SherpaOnnxOfflineModelConfig {
    fn default() -> Self {
        Self {
            transducer: Default::default(),
            paraformer: Default::default(),
            nemo_ctc: Default::default(),
            whisper: Default::default(),
            tdnn: Default::default(),
            tokens: ptr::null(),
            num_threads: 1,
            debug: 0,
            provider: ptr::null(),
            model_type: ptr::null(),
            modeling_unit: ptr::null(),
            bpe_vocab: ptr::null(),
            telespeech_ctc: ptr::null(),
            sense_voice: Default::default(),
            moonshine: Default::default(),
            fire_red_asr: Default::default(),
            dolphin: Default::default(),
            zipformer_ctc: Default::default(),
            canary: Default::default(),
            wenet_ctc: Default::default(),
            omnilingual: Default::default(),
            medasr: Default::default(),
            funasr_nano: Default::default(),
            fire_red_asr_ctc: Default::default(),
            qwen3_asr: Default::default(),
            cohere_transcribe: Default::default(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineRecognizerConfig {
    feat_config: SherpaOnnxFeatureConfig,
    model_config: SherpaOnnxOfflineModelConfig,
    lm_config: SherpaOnnxOfflineLMConfig,
    decoding_method: *const c_char,
    max_active_paths: i32,
    hotwords_file: *const c_char,
    hotwords_score: c_float,
    rule_fsts: *const c_char,
    rule_fars: *const c_char,
    blank_penalty: c_float,
    hr: SherpaOnnxHomophoneReplacerConfig,
    ctc_fst_decoder_config: SherpaOnnxOfflineCtcFstDecoderConfig,
}

impl Default for SherpaOnnxOfflineRecognizerConfig {
    fn default() -> Self {
        Self {
            feat_config: Default::default(),
            model_config: Default::default(),
            lm_config: Default::default(),
            decoding_method: ptr::null(),
            max_active_paths: 4,
            hotwords_file: ptr::null(),
            hotwords_score: 0.0,
            rule_fsts: ptr::null(),
            rule_fars: ptr::null(),
            blank_penalty: 0.0,
            hr: Default::default(),
            ctc_fst_decoder_config: Default::default(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineRecognizerResult {
    text: *const c_char,
    timestamps: *mut c_float,
    count: i32,
    tokens: *const c_char,
    tokens_arr: *const *const c_char,
    json: *const c_char,
    lang: *const c_char,
    emotion: *const c_char,
    event: *const c_char,
    durations: *mut c_float,
    ys_log_probs: *mut c_float,
    segment_timestamps: *const c_float,
    segment_durations: *const c_float,
    segment_texts: *const c_char,
    segment_texts_arr: *const *const c_char,
    segment_count: i32,
}

#[repr(C)]
struct SherpaOnnxSileroVadModelConfig {
    model: *const c_char,
    threshold: c_float,
    min_silence_duration: c_float,
    min_speech_duration: c_float,
    window_size: i32,
    max_speech_duration: c_float,
}

impl Default for SherpaOnnxSileroVadModelConfig {
    fn default() -> Self {
        Self {
            model: ptr::null(),
            threshold: 0.35,
            min_silence_duration: 0.25,
            min_speech_duration: 0.12,
            window_size: 512,
            max_speech_duration: 15.0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxTenVadModelConfig {
    model: *const c_char,
    threshold: c_float,
    min_silence_duration: c_float,
    min_speech_duration: c_float,
    window_size: i32,
    max_speech_duration: c_float,
}

impl Default for SherpaOnnxTenVadModelConfig {
    fn default() -> Self {
        Self {
            model: ptr::null(),
            threshold: 0.5,
            min_silence_duration: 0.25,
            min_speech_duration: 0.12,
            window_size: 256,
            max_speech_duration: 15.0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxVadModelConfig {
    silero_vad: SherpaOnnxSileroVadModelConfig,
    sample_rate: i32,
    num_threads: i32,
    provider: *const c_char,
    debug: i32,
    ten_vad: SherpaOnnxTenVadModelConfig,
}

impl Default for SherpaOnnxVadModelConfig {
    fn default() -> Self {
        Self {
            silero_vad: Default::default(),
            sample_rate: AUDIO_SAMPLE_RATE as i32,
            num_threads: 1,
            provider: ptr::null(),
            debug: 0,
            ten_vad: Default::default(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineSpeechDenoiserGtcrnModelConfig {
    model: *const c_char,
}

impl Default for SherpaOnnxOfflineSpeechDenoiserGtcrnModelConfig {
    fn default() -> Self {
        Self { model: ptr::null() }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineSpeechDenoiserDpdfNetModelConfig {
    model: *const c_char,
    attenuation_limit_db: c_float,
}

impl Default for SherpaOnnxOfflineSpeechDenoiserDpdfNetModelConfig {
    fn default() -> Self {
        Self {
            model: ptr::null(),
            attenuation_limit_db: 0.0,
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineSpeechDenoiserVoxLockModelConfig {
    enroll_model: *const c_char,
    chunk_model: *const c_char,
    voice_sample: *const c_char,
}

impl Default for SherpaOnnxOfflineSpeechDenoiserVoxLockModelConfig {
    fn default() -> Self {
        Self {
            enroll_model: ptr::null(),
            chunk_model: ptr::null(),
            voice_sample: ptr::null(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineSpeechDenoiserModelConfig {
    gtcrn: SherpaOnnxOfflineSpeechDenoiserGtcrnModelConfig,
    num_threads: i32,
    debug: i32,
    provider: *const c_char,
    dpdfnet: SherpaOnnxOfflineSpeechDenoiserDpdfNetModelConfig,
    voxlock: SherpaOnnxOfflineSpeechDenoiserVoxLockModelConfig,
}

impl Default for SherpaOnnxOfflineSpeechDenoiserModelConfig {
    fn default() -> Self {
        Self {
            gtcrn: Default::default(),
            num_threads: 2,
            debug: 0,
            provider: ptr::null(),
            dpdfnet: Default::default(),
            voxlock: Default::default(),
        }
    }
}

#[repr(C)]
struct SherpaOnnxOfflineSpeechDenoiserConfig {
    model: SherpaOnnxOfflineSpeechDenoiserModelConfig,
}

#[repr(C)]
struct SherpaOnnxOnlineSpeechDenoiserConfig {
    model: SherpaOnnxOfflineSpeechDenoiserModelConfig,
}

#[repr(C)]
struct SherpaOnnxDenoisedAudio {
    samples: *const c_float,
    n: i32,
    sample_rate: i32,
}

#[repr(C)]
struct SherpaOnnxSpeakerEmbeddingExtractorConfig {
    model: *const c_char,
    num_threads: i32,
    debug: i32,
    provider: *const c_char,
}

// ============================================================================
// Dynamic Function Table
// ============================================================================

type FnCreateOfflineRec = unsafe extern "C" fn(*const SherpaOnnxOfflineRecognizerConfig) -> *const c_void;
type FnDestroyOfflineRec = unsafe extern "C" fn(*const c_void);
type FnCreateOfflineStream = unsafe extern "C" fn(*const c_void) -> *const c_void;
type FnDestroyOfflineStream = unsafe extern "C" fn(*const c_void);
type FnAcceptWaveformOffline = unsafe extern "C" fn(*const c_void, i32, *const c_float, i32);
type FnDecodeOfflineStream = unsafe extern "C" fn(*const c_void, *const c_void);
type FnGetOfflineResult = unsafe extern "C" fn(*const c_void) -> *const SherpaOnnxOfflineRecognizerResult;
type FnDestroyOfflineResult = unsafe extern "C" fn(*const SherpaOnnxOfflineRecognizerResult);

type FnCreateVad = unsafe extern "C" fn(*const SherpaOnnxVadModelConfig, c_float) -> *const c_void;
type FnDestroyVad = unsafe extern "C" fn(*const c_void);
type FnVadAcceptWaveform = unsafe extern "C" fn(*const c_void, *const c_float, i32);
type FnVadDetected = unsafe extern "C" fn(*const c_void) -> i32;
type FnVadEmpty = unsafe extern "C" fn(*const c_void) -> i32;
type FnVadPop = unsafe extern "C" fn(*const c_void);
type FnVadClear = unsafe extern "C" fn(*const c_void);
type FnVadReset = unsafe extern "C" fn(*const c_void);

type FnCreateOfflineDenoiser = unsafe extern "C" fn(*const SherpaOnnxOfflineSpeechDenoiserConfig) -> *const c_void;
type FnDestroyOfflineDenoiser = unsafe extern "C" fn(*const c_void);
type FnOfflineDenoiserRun = unsafe extern "C" fn(*const c_void, *const c_float, i32, i32) -> *const SherpaOnnxDenoisedAudio;
type FnDestroyDenoisedAudio = unsafe extern "C" fn(*const SherpaOnnxDenoisedAudio);

type FnCreateOnlineDenoiser = unsafe extern "C" fn(*const SherpaOnnxOnlineSpeechDenoiserConfig) -> *const c_void;
type FnDestroyOnlineDenoiser = unsafe extern "C" fn(*const c_void);
type FnOnlineDenoiserRun = unsafe extern "C" fn(*const c_void, *const c_float, i32, i32) -> *const SherpaOnnxDenoisedAudio;
type FnOnlineDenoiserReset = unsafe extern "C" fn(*const c_void);

type FnCreateSpkExtractor = unsafe extern "C" fn(*const SherpaOnnxSpeakerEmbeddingExtractorConfig) -> *const c_void;
type FnDestroySpkExtractor = unsafe extern "C" fn(*const c_void);
type FnSpkExtractorDim = unsafe extern "C" fn(*const c_void) -> i32;
type FnSpkExtractorCreateStream = unsafe extern "C" fn(*const c_void) -> *const c_void;
type FnSpkExtractorIsReady = unsafe extern "C" fn(*const c_void, *const c_void) -> i32;
type FnSpkExtractorCompute = unsafe extern "C" fn(*const c_void, *const c_void) -> *const c_float;
type FnSpkExtractorDestroyEmb = unsafe extern "C" fn(*const c_float);

type FnOnlineStreamAccept = unsafe extern "C" fn(*const c_void, i32, *const c_float, i32);
type FnOnlineStreamFinished = unsafe extern "C" fn(*const c_void);
type FnDestroyOnlineStream = unsafe extern "C" fn(*const c_void);

/// Dynamically loaded `sherpa-onnx-c-api.dll` + CUDA/ONNX runtime symbol table.
pub struct SherpaRuntime {
    _lib: WinDll,
    create_offline_rec: FnCreateOfflineRec,
    destroy_offline_rec: FnDestroyOfflineRec,
    create_offline_stream: FnCreateOfflineStream,
    destroy_offline_stream: FnDestroyOfflineStream,
    accept_waveform_offline: FnAcceptWaveformOffline,
    decode_offline_stream: FnDecodeOfflineStream,
    get_offline_result: FnGetOfflineResult,
    destroy_offline_result: FnDestroyOfflineResult,

    create_vad: FnCreateVad,
    destroy_vad: FnDestroyVad,
    vad_accept_waveform: FnVadAcceptWaveform,
    vad_detected: FnVadDetected,
    vad_empty: FnVadEmpty,
    vad_pop: FnVadPop,
    vad_clear: FnVadClear,
    vad_reset: FnVadReset,

    create_offline_denoiser: FnCreateOfflineDenoiser,
    destroy_offline_denoiser: FnDestroyOfflineDenoiser,
    offline_denoiser_run: FnOfflineDenoiserRun,
    destroy_denoised_audio: FnDestroyDenoisedAudio,

    create_online_denoiser: Option<FnCreateOnlineDenoiser>,
    destroy_online_denoiser: Option<FnDestroyOnlineDenoiser>,
    online_denoiser_run: Option<FnOnlineDenoiserRun>,
    online_denoiser_reset: Option<FnOnlineDenoiserReset>,

    create_spk_extractor: FnCreateSpkExtractor,
    destroy_spk_extractor: FnDestroySpkExtractor,
    spk_extractor_dim: FnSpkExtractorDim,
    spk_extractor_create_stream: FnSpkExtractorCreateStream,
    spk_extractor_is_ready: FnSpkExtractorIsReady,
    spk_extractor_compute: FnSpkExtractorCompute,
    spk_extractor_destroy_emb: FnSpkExtractorDestroyEmb,

    online_stream_accept: FnOnlineStreamAccept,
    online_stream_finished: FnOnlineStreamFinished,
    destroy_online_stream: FnDestroyOnlineStream,
}

// SherpaRuntime only holds read-only function pointers & Library handle.
unsafe impl Send for SherpaRuntime {}
unsafe impl Sync for SherpaRuntime {}

impl SherpaRuntime {
    pub fn load() -> Result<Arc<Self>, String> {
        let dll_path = find_sherpa_c_api_dll().ok_or_else(|| {
            "Missing runtime/sherpa-cuda/(bin|lib)/sherpa-onnx-c-api.dll".to_string()
        })?;

        if let Some(dir) = dll_path.parent() {
            // Ensure sibling onnxruntime.dll, onnxruntime_providers_cuda.dll, cuDNN & CUDA DLLs resolve.
            if let Some(dir_str) = dir.to_str() {
                let wide = to_wide(dir_str);
                unsafe {
                    let _ = SetDllDirectoryW(PCWSTR(wide.as_ptr()));
                }
            }
            // Also prepend DLL directory (and whisper-cuda dir for cublas/cudart if needed) to PATH.
            prepend_path_dir(dir);
            if let Some(whisper_cuda) = resolve_asset_path(&["runtime/whisper-cuda/Release", "runtime/whisper-cuda"], true) {
                prepend_path_dir(&whisper_cuda);
            }
        }

        unsafe {
            let lib = WinDll::open(&dll_path)?;

            macro_rules! load_sym {
                ($name:literal, $ty:ty) => {
                    lib.sym::<$ty>($name)?
                };
            }

            let rt = Self {
                create_offline_rec: load_sym!(b"SherpaOnnxCreateOfflineRecognizer\0", FnCreateOfflineRec),
                destroy_offline_rec: load_sym!(b"SherpaOnnxDestroyOfflineRecognizer\0", FnDestroyOfflineRec),
                create_offline_stream: load_sym!(b"SherpaOnnxCreateOfflineStream\0", FnCreateOfflineStream),
                destroy_offline_stream: load_sym!(b"SherpaOnnxDestroyOfflineStream\0", FnDestroyOfflineStream),
                accept_waveform_offline: load_sym!(b"SherpaOnnxAcceptWaveformOffline\0", FnAcceptWaveformOffline),
                decode_offline_stream: load_sym!(b"SherpaOnnxDecodeOfflineStream\0", FnDecodeOfflineStream),
                get_offline_result: load_sym!(b"SherpaOnnxGetOfflineStreamResult\0", FnGetOfflineResult),
                destroy_offline_result: load_sym!(b"SherpaOnnxDestroyOfflineRecognizerResult\0", FnDestroyOfflineResult),

                create_vad: load_sym!(b"SherpaOnnxCreateVoiceActivityDetector\0", FnCreateVad),
                destroy_vad: load_sym!(b"SherpaOnnxDestroyVoiceActivityDetector\0", FnDestroyVad),
                vad_accept_waveform: load_sym!(b"SherpaOnnxVoiceActivityDetectorAcceptWaveform\0", FnVadAcceptWaveform),
                vad_detected: load_sym!(b"SherpaOnnxVoiceActivityDetectorDetected\0", FnVadDetected),
                vad_empty: load_sym!(b"SherpaOnnxVoiceActivityDetectorEmpty\0", FnVadEmpty),
                vad_pop: load_sym!(b"SherpaOnnxVoiceActivityDetectorPop\0", FnVadPop),
                vad_clear: load_sym!(b"SherpaOnnxVoiceActivityDetectorClear\0", FnVadClear),
                vad_reset: load_sym!(b"SherpaOnnxVoiceActivityDetectorReset\0", FnVadReset),

                create_offline_denoiser: load_sym!(b"SherpaOnnxCreateOfflineSpeechDenoiser\0", FnCreateOfflineDenoiser),
                destroy_offline_denoiser: load_sym!(b"SherpaOnnxDestroyOfflineSpeechDenoiser\0", FnDestroyOfflineDenoiser),
                offline_denoiser_run: load_sym!(b"SherpaOnnxOfflineSpeechDenoiserRun\0", FnOfflineDenoiserRun),
                destroy_denoised_audio: load_sym!(b"SherpaOnnxDestroyDenoisedAudio\0", FnDestroyDenoisedAudio),

                create_online_denoiser: lib.sym::<FnCreateOnlineDenoiser>(b"SherpaOnnxCreateOnlineSpeechDenoiser\0").ok(),
                destroy_online_denoiser: lib.sym::<FnDestroyOnlineDenoiser>(b"SherpaOnnxDestroyOnlineSpeechDenoiser\0").ok(),
                online_denoiser_run: lib.sym::<FnOnlineDenoiserRun>(b"SherpaOnnxOnlineSpeechDenoiserRun\0").ok(),
                online_denoiser_reset: lib.sym::<FnOnlineDenoiserReset>(b"SherpaOnnxOnlineSpeechDenoiserReset\0").ok(),

                create_spk_extractor: load_sym!(b"SherpaOnnxCreateSpeakerEmbeddingExtractor\0", FnCreateSpkExtractor),
                destroy_spk_extractor: load_sym!(b"SherpaOnnxDestroySpeakerEmbeddingExtractor\0", FnDestroySpkExtractor),
                spk_extractor_dim: load_sym!(b"SherpaOnnxSpeakerEmbeddingExtractorDim\0", FnSpkExtractorDim),
                spk_extractor_create_stream: load_sym!(b"SherpaOnnxSpeakerEmbeddingExtractorCreateStream\0", FnSpkExtractorCreateStream),
                spk_extractor_is_ready: load_sym!(b"SherpaOnnxSpeakerEmbeddingExtractorIsReady\0", FnSpkExtractorIsReady),
                spk_extractor_compute: load_sym!(b"SherpaOnnxSpeakerEmbeddingExtractorComputeEmbedding\0", FnSpkExtractorCompute),
                spk_extractor_destroy_emb: load_sym!(b"SherpaOnnxSpeakerEmbeddingExtractorDestroyEmbedding\0", FnSpkExtractorDestroyEmb),

                online_stream_accept: load_sym!(b"SherpaOnnxOnlineStreamAcceptWaveform\0", FnOnlineStreamAccept),
                online_stream_finished: load_sym!(b"SherpaOnnxOnlineStreamInputFinished\0", FnOnlineStreamFinished),
                destroy_online_stream: load_sym!(b"SherpaOnnxDestroyOnlineStream\0", FnDestroyOnlineStream),

                _lib: lib,
            };
            Ok(Arc::new(rt))
        }
    }
}

fn prepend_path_dir(dir: &Path) {
    let dir_str = dir.to_string_lossy();
    let cur = std::env::var("PATH").unwrap_or_default();
    if !cur.split(';').any(|p| p.eq_ignore_ascii_case(&dir_str)) {
        std::env::set_var("PATH", format!("{dir_str};{cur}"));
    }
}

fn path_to_cstring(p: &Path) -> Result<CString, String> {
    CString::new(p.to_string_lossy().as_ref())
        .map_err(|_| format!("Path contains interior NUL: {}", p.display()))
}

// ============================================================================
// 1. NVIDIA Parakeet TDT 0.6B v2 FP16/INT8 Recognizer (CUDA GPU + CPU fallback)
// ============================================================================

pub struct ParakeetAsr {
    rt: Arc<SherpaRuntime>,
    handle: *const c_void,
    label: String,
    provider_used: String,
}

unsafe impl Send for ParakeetAsr {}

impl ParakeetAsr {
    pub fn load(rt: Arc<SherpaRuntime>, prefer_cuda: bool) -> Result<Self, String> {
        let model_dir = resolve_asset_path(&["models/parakeet"], true)
            .ok_or_else(|| "Missing models/parakeet directory".to_string())?;

        let (encoder, decoder, joiner, quant_tag) = find_parakeet_files(&model_dir)?;
        let tokens = model_dir.join("tokens.txt");
        if !tokens.is_file() {
            return Err(format!("Missing {}", tokens.display()));
        }

        let bpe_vocab = model_dir.join("bpe.vocab");
        let hotwords_path = if bpe_vocab.is_file() {
            resolve_asset_path(&["hotwords.txt"], false)
                .filter(|p| std::fs::read_to_string(p).map(|s| !s.trim().is_empty()).unwrap_or(false))
        } else {
            None
        };

        let providers: &[&str] = if prefer_cuda { &["cuda", "cpu"] } else { &["cpu"] };
        for &prov in providers {
            // If both bpe.vocab and hotwords.txt are present, enable modified_beam_search biasing;
            // otherwise use greedy_search (hotwords.txt still biases the Qwen2.5-1.5B LLM polish pass).
            if let Some(ref hw) = hotwords_path {
                if let Ok(handle) = create_parakeet_handle(
                    &rt,
                    &encoder,
                    &decoder,
                    &joiner,
                    &tokens,
                    prov,
                    "modified_beam_search",
                    Some((hw.as_path(), bpe_vocab.as_path())),
                ) {
                    let label = format!("Parakeet TDT 0.6B ({quant_tag}/{}/BEAM+HW)", prov.to_uppercase());
                    return Ok(Self {
                        rt,
                        handle,
                        label,
                        provider_used: prov.to_string(),
                    });
                }
            }

            if let Ok(handle) = create_parakeet_handle(
                &rt,
                &encoder,
                &decoder,
                &joiner,
                &tokens,
                prov,
                "greedy_search",
                None,
            ) {
                let label = format!("Parakeet TDT 0.6B ({quant_tag}/{})", prov.to_uppercase());
                return Ok(Self {
                    rt,
                    handle,
                    label,
                    provider_used: prov.to_string(),
                });
            }
        }
        Err("Failed to initialize Parakeet TDT 0.6B on both CUDA and CPU".to_string())
    }

    pub fn provider(&self) -> &str {
        &self.provider_used
    }
}

#[allow(clippy::too_many_arguments)]
fn create_parakeet_handle(
    rt: &SherpaRuntime,
    encoder: &Path,
    decoder: &Path,
    joiner: &Path,
    tokens: &Path,
    provider: &str,
    decoding_method: &str,
    hotwords: Option<(&Path, &Path)>,
) -> Result<*const c_void, String> {
    let c_enc = path_to_cstring(encoder)?;
    let c_dec = path_to_cstring(decoder)?;
    let c_joi = path_to_cstring(joiner)?;
    let c_tok = path_to_cstring(tokens)?;
    let c_prov = CString::new(provider).unwrap();
    let c_mtype = CString::new("nemo_transducer").unwrap();
    let c_decode = CString::new(decoding_method).unwrap();
    let c_bpe_unit = CString::new("bpe").unwrap();
    let c_hw = match hotwords {
        Some((hw, vocab)) => Some((path_to_cstring(hw)?, path_to_cstring(vocab)?)),
        None => None,
    };

    let mut cfg = SherpaOnnxOfflineRecognizerConfig::default();
    cfg.feat_config.sample_rate = AUDIO_SAMPLE_RATE as i32;
    cfg.feat_config.feature_dim = 80;
    cfg.model_config.transducer.encoder = c_enc.as_ptr();
    cfg.model_config.transducer.decoder = c_dec.as_ptr();
    cfg.model_config.transducer.joiner = c_joi.as_ptr();
    cfg.model_config.tokens = c_tok.as_ptr();
    cfg.model_config.num_threads = if provider == "cuda" { 2 } else { 6 };
    cfg.model_config.provider = c_prov.as_ptr();
    cfg.model_config.model_type = c_mtype.as_ptr();
    cfg.decoding_method = c_decode.as_ptr();
    cfg.max_active_paths = 4;
    if let Some((ref hw, ref vocab)) = c_hw {
        cfg.model_config.modeling_unit = c_bpe_unit.as_ptr();
        cfg.model_config.bpe_vocab = vocab.as_ptr();
        cfg.hotwords_file = hw.as_ptr();
        cfg.hotwords_score = 1.5;
    }

    let handle = unsafe { (rt.create_offline_rec)(&cfg) };
    if handle.is_null() {
        Err(format!(
            "SherpaOnnxCreateOfflineRecognizer returned NULL for provider={provider}, method={decoding_method}"
        ))
    } else {
        Ok(handle)
    }
}

impl AsrModel for ParakeetAsr {
    fn transcribe(&mut self, samples_16k: &[f32]) -> Result<String, String> {
        if samples_16k.is_empty() {
            return Ok(String::new());
        }
        unsafe {
            let stream = (self.rt.create_offline_stream)(self.handle);
            if stream.is_null() {
                return Err("SherpaOnnxCreateOfflineStream failed".to_string());
            }
            (self.rt.accept_waveform_offline)(
                stream,
                AUDIO_SAMPLE_RATE as i32,
                samples_16k.as_ptr(),
                samples_16k.len() as i32,
            );
            (self.rt.decode_offline_stream)(self.handle, stream);
            let res = (self.rt.get_offline_result)(stream);
            let text = if !res.is_null() && !(*res).text.is_null() {
                CStr::from_ptr((*res).text).to_string_lossy().into_owned()
            } else {
                String::new()
            };
            if !res.is_null() {
                (self.rt.destroy_offline_result)(res);
            }
            (self.rt.destroy_offline_stream)(stream);
            Ok(text)
        }
    }

    fn model_name(&self) -> &str {
        &self.label
    }
}

impl Drop for ParakeetAsr {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                (self.rt.destroy_offline_rec)(self.handle);
            }
        }
    }
}

// ============================================================================
// 2. Neural Speech Enhancement (DPDFNet8 / GTCRN) — Offline + Online Streaming
// ============================================================================

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DenoiserKind {
    DpdfNet8,
    Gtcrn,
    VoxLock,
}

pub struct NeuralDenoiser {
    rt: Arc<SherpaRuntime>,
    offline: *const c_void,
    online: *const c_void,
    online_fifo: VecDeque<f32>,
    kind: DenoiserKind,
}

unsafe impl Send for NeuralDenoiser {}

impl NeuralDenoiser {
    pub fn load(rt: Arc<SherpaRuntime>, kind: DenoiserKind, prefer_cuda: bool) -> Result<Self, String> {
        let providers: &[&str] = if prefer_cuda { &["cuda", "cpu"] } else { &["cpu"] };

        // Resolve paths cleanly before constructing CStrings.
        let (c_primary, c_secondary) = match kind {
            DenoiserKind::DpdfNet8 => {
                let p = resolve_asset_path(&["models/denoise/dpdfnet8.onnx"], false)
                    .ok_or_else(|| "Missing models/denoise/dpdfnet8.onnx".to_string())?;
                (path_to_cstring(&p)?, None)
            }
            DenoiserKind::Gtcrn => {
                let p = resolve_asset_path(&["models/denoise/gtcrn_simple.onnx"], false)
                    .ok_or_else(|| "Missing models/denoise/gtcrn_simple.onnx".to_string())?;
                (path_to_cstring(&p)?, None)
            }
            DenoiserKind::VoxLock => {
                let enroll = resolve_asset_path(&["models/denoise/voxlock/enroll.onnx"], false)
                    .ok_or_else(|| "Missing models/denoise/voxlock/enroll.onnx".to_string())?;
                let chunk = resolve_asset_path(
                    &[
                        "models/denoise/voxlock/chunk_int8.onnx",
                        "models/denoise/voxlock/chunk.onnx",
                    ],
                    false,
                )
                .ok_or_else(|| "Missing models/denoise/voxlock/chunk*.onnx".to_string())?;
                (path_to_cstring(&enroll)?, Some(path_to_cstring(&chunk)?))
            }
        };
        let c_empty = CString::new("").unwrap();

        for &prov in providers {
            let c_prov = CString::new(prov).unwrap();
            let build_mcfg = |prov_ptr: *const c_char| {
                let mut mcfg = SherpaOnnxOfflineSpeechDenoiserModelConfig::default();
                mcfg.num_threads = 2;
                mcfg.provider = prov_ptr;
                match kind {
                    DenoiserKind::DpdfNet8 => {
                        mcfg.dpdfnet.model = c_primary.as_ptr();
                        mcfg.dpdfnet.attenuation_limit_db = 0.0;
                    }
                    DenoiserKind::Gtcrn => {
                        mcfg.gtcrn.model = c_primary.as_ptr();
                    }
                    DenoiserKind::VoxLock => {
                        mcfg.voxlock.enroll_model = c_primary.as_ptr();
                        if let Some(ref c_chunk) = c_secondary {
                            mcfg.voxlock.chunk_model = c_chunk.as_ptr();
                        }
                        // Empty voice_sample -> auto-locks onto loudest speaker after 3s.
                        mcfg.voxlock.voice_sample = c_empty.as_ptr();
                    }
                }
                mcfg
            };

            let off_cfg = SherpaOnnxOfflineSpeechDenoiserConfig {
                model: build_mcfg(c_prov.as_ptr()),
            };
            let offline = unsafe { (rt.create_offline_denoiser)(&off_cfg) };
            if offline.is_null() {
                continue;
            }

            let online = if let Some(create_on) = rt.create_online_denoiser {
                let on_cfg = SherpaOnnxOnlineSpeechDenoiserConfig {
                    model: build_mcfg(c_prov.as_ptr()),
                };
                unsafe { create_on(&on_cfg) }
            } else {
                ptr::null()
            };

            return Ok(Self {
                rt,
                offline,
                online,
                online_fifo: VecDeque::with_capacity(2048),
                kind,
            });
        }

        Err(format!("Failed to initialize neural denoiser ({kind:?})"))
    }

    pub fn kind(&self) -> DenoiserKind {
        self.kind
    }
}

impl DenoiserModel for NeuralDenoiser {
    fn enhance(&mut self, samples_16k: &[f32]) -> Vec<f32> {
        if samples_16k.is_empty() || self.offline.is_null() {
            return samples_16k.to_vec();
        }
        unsafe {
            let out = (self.rt.offline_denoiser_run)(
                self.offline,
                samples_16k.as_ptr(),
                samples_16k.len() as i32,
                AUDIO_SAMPLE_RATE as i32,
            );
            if out.is_null() || (*out).samples.is_null() || (*out).n <= 0 {
                if !out.is_null() {
                    (self.rt.destroy_denoised_audio)(out);
                }
                return samples_16k.to_vec();
            }
            let slice = std::slice::from_raw_parts((*out).samples, (*out).n as usize);
            let mut vec = slice.to_vec();
            (self.rt.destroy_denoised_audio)(out);
            vec.resize(samples_16k.len(), 0.0);
            vec
        }
    }

    fn enhance_stream_chunk_into(
        &mut self,
        chunk_512: &[f32; CHUNK_SAMPLES],
        out_512: &mut [f32; CHUNK_SAMPLES],
    ) -> bool {
        if self.online.is_null() {
            return false;
        }
        let Some(run_fn) = self.rt.online_denoiser_run else {
            return false;
        };
        unsafe {
            let out = run_fn(
                self.online,
                chunk_512.as_ptr(),
                CHUNK_SAMPLES as i32,
                AUDIO_SAMPLE_RATE as i32,
            );
            if !out.is_null() {
                if !(*out).samples.is_null() && (*out).n > 0 {
                    let slice = std::slice::from_raw_parts((*out).samples, (*out).n as usize);
                    self.online_fifo.extend(slice.iter().copied());
                }
                (self.rt.destroy_denoised_audio)(out);
            }
        }
        // Maintain exact contiguous 512-sample chunks into stack buffer (0 heap allocations!).
        if self.online_fifo.len() >= CHUNK_SAMPLES {
            for dst in out_512.iter_mut() {
                *dst = self.online_fifo.pop_front().unwrap_or(0.0);
            }
        } else {
            let pad = CHUNK_SAMPLES - self.online_fifo.len();
            out_512[..pad].fill(0.0);
            for dst in out_512[pad..].iter_mut() {
                *dst = self.online_fifo.pop_front().unwrap_or(0.0);
            }
        }
        true
    }

    fn reset(&mut self) {
        self.online_fifo.clear();
        if !self.online.is_null() {
            if let Some(reset_fn) = self.rt.online_denoiser_reset {
                unsafe {
                    reset_fn(self.online);
                }
            }
        }
    }
}

impl Drop for NeuralDenoiser {
    fn drop(&mut self) {
        unsafe {
            if !self.offline.is_null() {
                (self.rt.destroy_offline_denoiser)(self.offline);
            }
            if !self.online.is_null() {
                if let Some(destroy_on) = self.rt.destroy_online_denoiser {
                    destroy_on(self.online);
                }
            }
        }
    }
}

// ============================================================================
// 3. Silero VAD v5
// ============================================================================

pub struct SileroVad {
    rt: Arc<SherpaRuntime>,
    handle: *const c_void,
}

unsafe impl Send for SileroVad {}

impl SileroVad {
    pub fn load(rt: Arc<SherpaRuntime>, threshold: f32) -> Result<Self, String> {
        let model_path = resolve_asset_path(&["models/vad/silero_vad_v5.onnx"], false)
            .ok_or_else(|| "Missing models/vad/silero_vad_v5.onnx".to_string())?;
        let c_model = path_to_cstring(&model_path)?;
        let c_prov = CString::new("cpu").unwrap();

        let mut cfg = SherpaOnnxVadModelConfig::default();
        cfg.silero_vad.model = c_model.as_ptr();
        cfg.silero_vad.threshold = threshold;
        cfg.silero_vad.min_silence_duration = 0.20;
        cfg.silero_vad.min_speech_duration = 0.08;
        cfg.silero_vad.window_size = 512;
        cfg.silero_vad.max_speech_duration = 20.0;
        cfg.sample_rate = AUDIO_SAMPLE_RATE as i32;
        cfg.num_threads = 1;
        cfg.provider = c_prov.as_ptr();

        let handle = unsafe { (rt.create_vad)(&cfg, 30.0) };
        if handle.is_null() {
            return Err("Failed to initialize Silero VAD v5".to_string());
        }
        Ok(Self { rt, handle })
    }
}

impl VadModel for SileroVad {
    fn is_speech(&mut self, frame_512: &[f32]) -> bool {
        unsafe {
            (self.rt.vad_accept_waveform)(
                self.handle,
                frame_512.as_ptr(),
                frame_512.len() as i32,
            );
            // Drain internal segment queue so circular buffer never grows unbounded.
            while (self.rt.vad_empty)(self.handle) == 0 {
                (self.rt.vad_pop)(self.handle);
            }
            (self.rt.vad_detected)(self.handle) != 0
        }
    }

    fn reset(&mut self) {
        unsafe {
            (self.rt.vad_clear)(self.handle);
            (self.rt.vad_reset)(self.handle);
        }
    }
}

impl Drop for SileroVad {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                (self.rt.destroy_vad)(self.handle);
            }
        }
    }
}

// ============================================================================
// 4. WeSpeaker CAM++ Online Speaker Tracker (`[SPK 1]`, `[SPK 2]`, ...)
// ============================================================================

struct SpeakerCentroid {
    id: u8,
    embedding: Vec<f32>,
    count: u32,
}

pub struct WeSpeakerTracker {
    rt: Arc<SherpaRuntime>,
    extractor: *const c_void,
    dim: usize,
    centroids: Vec<SpeakerCentroid>,
    cosine_threshold: f32,
    max_speakers: u8,
}

unsafe impl Send for WeSpeakerTracker {}

impl WeSpeakerTracker {
    pub fn load(rt: Arc<SherpaRuntime>) -> Result<Self, String> {
        let model_path = resolve_asset_path(
            &["models/speaker/wespeaker_en_voxceleb_CAM++.onnx"],
            false,
        )
        .ok_or_else(|| "Missing models/speaker/wespeaker_en_voxceleb_CAM++.onnx".to_string())?;
        let c_model = path_to_cstring(&model_path)?;
        let c_prov = CString::new("cpu").unwrap();

        let cfg = SherpaOnnxSpeakerEmbeddingExtractorConfig {
            model: c_model.as_ptr(),
            num_threads: 2,
            debug: 0,
            provider: c_prov.as_ptr(),
        };
        let extractor = unsafe { (rt.create_spk_extractor)(&cfg) };
        if extractor.is_null() {
            return Err("Failed to initialize WeSpeaker CAM++ extractor".to_string());
        }
        let dim = unsafe { (rt.spk_extractor_dim)(extractor) }.max(1) as usize;

        Ok(Self {
            rt,
            extractor,
            dim,
            centroids: Vec::new(),
            cosine_threshold: 0.40,
            max_speakers: 8,
        })
    }

    fn compute_embedding(&self, samples_16k: &[f32]) -> Option<Vec<f32>> {
        // Need at least ~0.45s of voice for a reliable speaker embedding.
        if samples_16k.len() < 7_200 {
            return None;
        }
        unsafe {
            let stream = (self.rt.spk_extractor_create_stream)(self.extractor);
            if stream.is_null() {
                return None;
            }
            (self.rt.online_stream_accept)(
                stream,
                AUDIO_SAMPLE_RATE as i32,
                samples_16k.as_ptr(),
                samples_16k.len() as i32,
            );
            (self.rt.online_stream_finished)(stream);
            let ready = (self.rt.spk_extractor_is_ready)(self.extractor, stream) != 0;
            let result = if ready {
                let ptr = (self.rt.spk_extractor_compute)(self.extractor, stream);
                if !ptr.is_null() {
                    let slice = std::slice::from_raw_parts(ptr, self.dim);
                    let mut emb = slice.to_vec();
                    (self.rt.spk_extractor_destroy_emb)(ptr);
                    l2_normalize(&mut emb);
                    Some(emb)
                } else {
                    None
                }
            } else {
                None
            };
            (self.rt.destroy_online_stream)(stream);
            result
        }
    }
}

impl SpeakerIdModel for WeSpeakerTracker {
    fn identify(&mut self, samples_16k: &[f32]) -> Option<u8> {
        let emb = self.compute_embedding(samples_16k)?;
        let mut best_idx: Option<usize> = None;
        let mut best_sim = -1.0f32;

        for (i, c) in self.centroids.iter().enumerate() {
            let sim = cosine_sim(&c.embedding, &emb);
            if sim > best_sim {
                best_sim = sim;
                best_idx = Some(i);
            }
        }

        if let Some(idx) = best_idx {
            if best_sim >= self.cosine_threshold || self.centroids.len() >= self.max_speakers as usize {
                let c = &mut self.centroids[idx];
                // Smooth running centroid update so speaker embedding adapts to room/distance.
                let alpha = (1.0 / (c.count as f32 + 1.0)).max(0.15);
                for (dst, &src) in c.embedding.iter_mut().zip(emb.iter()) {
                    *dst = *dst * (1.0 - alpha) + src * alpha;
                }
                l2_normalize(&mut c.embedding);
                c.count = c.count.saturating_add(1);
                return Some(c.id);
            }
        }

        let new_id = (self.centroids.len() as u8) + 1;
        self.centroids.push(SpeakerCentroid {
            id: new_id,
            embedding: emb,
            count: 1,
        });
        Some(new_id)
    }

    fn reset(&mut self) {
        self.centroids.clear();
    }
}

impl Drop for WeSpeakerTracker {
    fn drop(&mut self) {
        if !self.extractor.is_null() {
            unsafe {
                (self.rt.destroy_spk_extractor)(self.extractor);
            }
        }
    }
}

fn l2_normalize(v: &mut [f32]) {
    let norm = v.iter().map(|&x| x * x).sum::<f32>().sqrt();
    if norm > 1e-8 {
        let inv = 1.0 / norm;
        for x in v.iter_mut() {
            *x *= inv;
        }
    }
}

fn cosine_sim(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(&x, &y)| x * y).sum()
}

// ============================================================================
// Asset Discovery Helpers
// ============================================================================

pub fn find_sherpa_c_api_dll() -> Option<PathBuf> {
    resolve_asset_path(
        &[
            "runtime/sherpa-cuda/bin/sherpa-onnx-c-api.dll",
            "runtime/sherpa-cuda/lib/sherpa-onnx-c-api.dll",
            "runtime/sherpa-cuda/sherpa-onnx-c-api.dll",
        ],
        false,
    )
}

fn find_parakeet_files(dir: &Path) -> Result<(PathBuf, PathBuf, PathBuf, &'static str), String> {
    let candidates = [
        ("encoder.fp16.onnx", "decoder.fp16.onnx", "joiner.fp16.onnx", "FP16"),
        ("encoder.onnx", "decoder.onnx", "joiner.onnx", "FP16"),
        ("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "INT8"),
    ];
    for (enc, dec, joi, tag) in candidates {
        let pe = dir.join(enc);
        let pd = dir.join(dec);
        let pj = dir.join(joi);
        if pe.is_file() && pd.is_file() && pj.is_file() {
            return Ok((pe, pd, pj, tag));
        }
    }
    Err(format!("No Parakeet encoder/decoder/joiner ONNX files found in {}", dir.display()))
}
