//! Multi-engine local Speech-to-Text controller supporting:
//! - [`SttBackend::ParakeetGpu`]: NVIDIA Parakeet TDT 0.6B v2 (CUDA) + GTCRN/DPDFNet8/VoxLock + Silero VAD v5 + WeSpeaker
//! - [`SttBackend::DistilWhisperGpu`]: Distil-Whisper Large-v3.5 EN (CUDA) + GTCRN/DPDFNet8/VoxLock + Silero VAD v5 + WeSpeaker
//! - [`SttBackend::Win11Captions`]: Windows 11 Live Captions (ultra-low-power fallback)
//! - [`SttBackend::WhisperCpuLegacy`]: Legacy `ggml-base.en.bin` CPU (baseline A/B)
//! Plus optional asynchronous local GPU LLM phonetic post-correction (`Qwen2.5-1.5B CUDA`).

use std::collections::VecDeque;
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::denoise::LegacySnrVad;
use crate::live_captions::{run_live_captions_loop, LcCommand};
use crate::llm_polish::{load_hotwords, AsyncLlmPolisher};
use crate::meter::{AudioFrame, MicMeter};
use crate::sherpa_ffi::{
    DenoiserKind, NeuralDenoiser, ParakeetAsr, SherpaRuntime, SileroVad, WeSpeakerTracker,
};
use crate::stream_decoder::{
    AsrModel, DenoiseMode, DenoiserModel, SpeakerIdModel, StreamDecoder, StreamEvent, VadModel,
};
use crate::ui::WM_APP_STT_EVENT;
use crate::whisper_gpu::{WhisperServerAsr, WhisperVariant};
use crate::win_util::post_app_msg;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SttBackend {
    ParakeetGpu,
    DistilWhisperGpu,
    Win11Captions,
    WhisperCpuLegacy,
}

impl SttBackend {
    pub const ALL: [SttBackend; 4] = [
        Self::ParakeetGpu,
        Self::DistilWhisperGpu,
        Self::Win11Captions,
        Self::WhisperCpuLegacy,
    ];

    pub fn short_label(self) -> &'static str {
        match self {
            Self::ParakeetGpu => "Parakeet GPU",
            Self::DistilWhisperGpu => "Distil-Whisper GPU",
            Self::Win11Captions => "Win11 Captions",
            Self::WhisperCpuLegacy => "Whisper Base CPU",
        }
    }

    pub fn button_label(self) -> &'static str {
        match self {
            Self::ParakeetGpu => "ENG: PARAKEET",
            Self::DistilWhisperGpu => "ENG: DISTIL-W",
            Self::Win11Captions => "ENG: WIN11",
            Self::WhisperCpuLegacy => "ENG: BASE-CPU",
        }
    }

    pub fn menu_label(self) -> &'static str {
        match self {
            Self::ParakeetGpu => "NVIDIA Parakeet TDT 0.6B v2 (RTX GPU - Fast & Accurate)",
            Self::DistilWhisperGpu => "Distil-Whisper Large-v3.5 EN (RTX GPU - Heavy Noise)",
            Self::Win11Captions => "Windows 11 Live Captions (Ultra-Low Power)",
            Self::WhisperCpuLegacy => "Legacy Whisper base.en (CPU Baseline)",
        }
    }

    pub fn live_status(self) -> &'static str {
        match self {
            Self::ParakeetGpu => ">> RX LIVE [Parakeet GPU]",
            Self::DistilWhisperGpu => ">> RX LIVE [Distil-Whisper GPU]",
            Self::Win11Captions => ">> RX LIVE [Win11 Captions]",
            Self::WhisperCpuLegacy => ">> RX LIVE [Whisper CPU]",
        }
    }
}

/// Events emitted by the speech recognition worker to the UI thread.
pub enum SttEvent {
    Started {
        backend: String,
    },
    Partial {
        stable: String,
        draft: String,
    },
    Final {
        card_id: u64,
        text: String,
        speaker_id: Option<u8>,
    },
    Polished {
        card_id: u64,
        text: String,
    },
    Stopped,
    Error(String),
}

enum SttCommand {
    Start(SttBackend),
    Stop,
    SetDenoise(DenoiseMode),
    SetSpeakerLabels(bool),
    SetLlmPolish(bool),
    ResetSpeakers,
    Shutdown,
}

/// Thread-safe queue for delivering STT events without leaking heap pointers in LPARAM.
pub struct SttEventQueue {
    notify_hwnd: isize,
    queue: Mutex<VecDeque<SttEvent>>,
}

impl SttEventQueue {
    pub fn new(notify_hwnd: isize) -> Arc<Self> {
        Arc::new(Self {
            notify_hwnd,
            queue: Mutex::new(VecDeque::new()),
        })
    }

    pub fn push(&self, event: SttEvent) {
        if let Ok(mut q) = self.queue.lock() {
            q.push_back(event);
        }
        post_app_msg(self.notify_hwnd, WM_APP_STT_EVENT, 0);
    }

    pub fn drain_all(&self) -> VecDeque<SttEvent> {
        let Ok(mut q) = self.queue.lock() else {
            return VecDeque::new();
        };
        std::mem::take(&mut *q)
    }
}

/// Controller for managing local GPU/CPU STT backends and live pipeline settings.
pub struct SttEngine {
    tx: mpsc::Sender<SttCommand>,
    meter: Arc<MicMeter>,
}

impl SttEngine {
    pub fn new(
        events: Arc<SttEventQueue>,
        meter: Arc<MicMeter>,
        initial_denoise: DenoiseMode,
        initial_speakers: bool,
        initial_llm: bool,
    ) -> Self {
        let (tx, rx) = mpsc::channel::<SttCommand>();
        let meter_bg = Arc::clone(&meter);
        thread::spawn(move || {
            stt_worker(
                rx,
                events,
                meter_bg,
                initial_denoise,
                initial_speakers,
                initial_llm,
            )
        });
        Self { tx, meter }
    }

    pub fn start(&self, backend: SttBackend) {
        let _ = self.tx.send(SttCommand::Start(backend));
    }

    pub fn stop(&self) {
        self.meter.set_audio_sink(None);
        let _ = self.tx.send(SttCommand::Stop);
    }

    pub fn set_denoise_mode(&self, mode: DenoiseMode) {
        let _ = self.tx.send(SttCommand::SetDenoise(mode));
    }

    pub fn set_speaker_labels(&self, enabled: bool) {
        let _ = self.tx.send(SttCommand::SetSpeakerLabels(enabled));
    }

    pub fn set_llm_polish(&self, enabled: bool) {
        let _ = self.tx.send(SttCommand::SetLlmPolish(enabled));
    }

    pub fn reset_speakers(&self) {
        let _ = self.tx.send(SttCommand::ResetSpeakers);
    }
}

impl Drop for SttEngine {
    fn drop(&mut self) {
        self.meter.set_audio_sink(None);
        let _ = self.tx.send(SttCommand::Shutdown);
    }
}

/// Keeps loaded native models warm across start/stop toggles and engine switches.
struct WorkerResources {
    sherpa_rt: Option<Arc<SherpaRuntime>>,
    parakeet: Option<ParakeetAsr>,
    whisper_gpu: Option<WhisperServerAsr>,
    whisper_cpu: Option<WhisperServerAsr>,
    gtcrn_denoiser: Option<NeuralDenoiser>,
    dpdf_denoiser: Option<NeuralDenoiser>,
    voxlock_denoiser: Option<NeuralDenoiser>,
    silero_vad: Option<SileroVad>,
    legacy_vad: LegacySnrVad,
    speaker_id: Option<WeSpeakerTracker>,
    llm_worker: Option<AsyncLlmPolisher>,
    hotwords: Vec<String>,
    recent_context: VecDeque<String>,
    next_card_id: u64,
}

impl WorkerResources {
    fn new() -> Self {
        Self {
            sherpa_rt: None,
            parakeet: None,
            whisper_gpu: None,
            whisper_cpu: None,
            gtcrn_denoiser: None,
            dpdf_denoiser: None,
            voxlock_denoiser: None,
            silero_vad: None,
            legacy_vad: LegacySnrVad::new(),
            speaker_id: None,
            llm_worker: None,
            hotwords: load_hotwords(),
            recent_context: VecDeque::with_capacity(6),
            next_card_id: 1,
        }
    }

    fn ensure_sherpa_stack(&mut self) -> Result<Arc<SherpaRuntime>, String> {
        if let Some(ref rt) = self.sherpa_rt {
            return Ok(Arc::clone(rt));
        }
        let rt = SherpaRuntime::load()?;
        if self.silero_vad.is_none() {
            self.silero_vad = SileroVad::load(Arc::clone(&rt), 0.35).ok();
        }
        if self.gtcrn_denoiser.is_none() {
            self.gtcrn_denoiser =
                NeuralDenoiser::load(Arc::clone(&rt), DenoiserKind::Gtcrn, false).ok();
        }
        if self.dpdf_denoiser.is_none() {
            self.dpdf_denoiser =
                NeuralDenoiser::load(Arc::clone(&rt), DenoiserKind::DpdfNet8, false).ok();
        }
        if self.speaker_id.is_none() {
            self.speaker_id = WeSpeakerTracker::load(Arc::clone(&rt)).ok();
        }
        self.sherpa_rt = Some(Arc::clone(&rt));
        Ok(rt)
    }

    fn ensure_voxlock(&mut self) {
        if self.voxlock_denoiser.is_some() {
            return;
        }
        if let Some(ref rt) = self.sherpa_rt {
            self.voxlock_denoiser =
                NeuralDenoiser::load(Arc::clone(rt), DenoiserKind::VoxLock, false).ok();
        }
    }

    fn ensure_llm_worker(&mut self, events: &Arc<SttEventQueue>) {
        if self.llm_worker.is_none() {
            self.llm_worker = Some(AsyncLlmPolisher::spawn_worker(Arc::clone(events)));
        }
    }

    fn ensure_parakeet(&mut self) -> Result<(), String> {
        if self.parakeet.is_some() {
            return Ok(());
        }
        let rt = self.ensure_sherpa_stack()?;
        let model = ParakeetAsr::load(rt, true)?;
        self.parakeet = Some(model);
        Ok(())
    }

    fn ensure_whisper(&mut self, variant: WhisperVariant) -> Result<(), String> {
        let _ = self.ensure_sherpa_stack();
        match variant {
            WhisperVariant::DistilLargeV35Gpu => {
                if self.whisper_gpu.is_none() {
                    self.whisper_gpu = Some(WhisperServerAsr::spawn(variant)?);
                }
            }
            WhisperVariant::LegacyBaseCpu => {
                if self.whisper_cpu.is_none() {
                    self.whisper_cpu = Some(WhisperServerAsr::spawn(variant)?);
                }
            }
        }
        Ok(())
    }
}

fn stt_worker(
    rx: Receiver<SttCommand>,
    events: Arc<SttEventQueue>,
    meter: Arc<MicMeter>,
    mut denoise_mode: DenoiseMode,
    mut speaker_labels: bool,
    mut llm_polish: bool,
) {
    let mut res = WorkerResources::new();
    let mut pending_cmd: Option<SttCommand> = None;

    loop {
        let cmd = match pending_cmd.take() {
            Some(c) => c,
            None => match rx.recv() {
                Ok(c) => c,
                Err(_) => break,
            },
        };

        match cmd {
            SttCommand::Shutdown => break,
            SttCommand::Stop => {}
            SttCommand::SetDenoise(m) => {
                denoise_mode = m;
                if m == DenoiseMode::VoxLock {
                    res.ensure_voxlock();
                }
            }
            SttCommand::SetSpeakerLabels(en) => speaker_labels = en,
            SttCommand::SetLlmPolish(en) => {
                llm_polish = en;
                if en {
                    res.ensure_llm_worker(&events);
                }
            }
            SttCommand::ResetSpeakers => {
                if let Some(ref mut spk) = res.speaker_id {
                    spk.reset();
                }
                res.recent_context.clear();
            }
            SttCommand::Start(SttBackend::Win11Captions) => {
                let (lc_tx, lc_rx) = mpsc::channel::<LcCommand>();
                let ev_bg = Arc::clone(&events);
                let handle = thread::spawn(move || run_live_captions_loop(&lc_rx, &ev_bg));
                let mut should_quit = false;

                while let Ok(c) = rx.recv() {
                    match c {
                        SttCommand::Stop => {
                            let _ = lc_tx.send(LcCommand::Stop);
                            break;
                        }
                        SttCommand::Shutdown => {
                            let _ = lc_tx.send(LcCommand::Shutdown);
                            should_quit = true;
                            break;
                        }
                        SttCommand::SetDenoise(m) => denoise_mode = m,
                        SttCommand::SetSpeakerLabels(en) => speaker_labels = en,
                        SttCommand::SetLlmPolish(en) => llm_polish = en,
                        SttCommand::ResetSpeakers => {
                            if let Some(ref mut spk) = res.speaker_id {
                                spk.reset();
                            }
                            res.recent_context.clear();
                        }
                        SttCommand::Start(b) => {
                            let _ = lc_tx.send(LcCommand::Stop);
                            pending_cmd = Some(SttCommand::Start(b));
                            break;
                        }
                    }
                }
                let _ = handle.join();
                events.push(SttEvent::Stopped);
                if should_quit {
                    break;
                }
            }
            SttCommand::Start(backend) => {
                let init_res = match backend {
                    SttBackend::ParakeetGpu => res.ensure_parakeet(),
                    SttBackend::DistilWhisperGpu => {
                        res.ensure_whisper(WhisperVariant::DistilLargeV35Gpu)
                    }
                    SttBackend::WhisperCpuLegacy => {
                        res.ensure_whisper(WhisperVariant::LegacyBaseCpu)
                    }
                    SttBackend::Win11Captions => unreachable!(),
                };
                if let Err(err) = init_res {
                    events.push(SttEvent::Error(err));
                    events.push(SttEvent::Stopped);
                    continue;
                }
                if denoise_mode == DenoiseMode::VoxLock {
                    res.ensure_voxlock();
                }
                if llm_polish {
                    res.ensure_llm_worker(&events);
                }

                let outcome = run_neural_streaming_session(
                    backend,
                    &rx,
                    &events,
                    &meter,
                    &mut res,
                    &mut denoise_mode,
                    &mut speaker_labels,
                    &mut llm_polish,
                );
                meter.set_audio_sink(None);

                match outcome {
                    SessionExit::Stop => events.push(SttEvent::Stopped),
                    SessionExit::Switch(next) => {
                        pending_cmd = Some(SttCommand::Start(next));
                    }
                    SessionExit::Shutdown => {
                        events.push(SttEvent::Stopped);
                        break;
                    }
                }
            }
        }
    }
}

enum SessionExit {
    Stop,
    Switch(SttBackend),
    Shutdown,
}

#[allow(clippy::too_many_arguments)]
fn run_neural_streaming_session(
    backend: SttBackend,
    rx: &Receiver<SttCommand>,
    events: &Arc<SttEventQueue>,
    meter: &MicMeter,
    res: &mut WorkerResources,
    denoise_mode: &mut DenoiseMode,
    speaker_labels: &mut bool,
    llm_polish: &mut bool,
) -> SessionExit {
    let (pcm_tx, pcm_rx): (SyncSender<AudioFrame>, Receiver<AudioFrame>) = mpsc::sync_channel(96);
    meter.set_audio_sink(Some(pcm_tx));

    let active_label = match backend {
        SttBackend::ParakeetGpu => res
            .parakeet
            .as_ref()
            .map(|p| p.model_name().to_string())
            .unwrap_or_else(|| backend.short_label().to_string()),
        SttBackend::DistilWhisperGpu => res
            .whisper_gpu
            .as_ref()
            .map(|w| w.model_name().to_string())
            .unwrap_or_else(|| backend.short_label().to_string()),
        SttBackend::WhisperCpuLegacy => res
            .whisper_cpu
            .as_ref()
            .map(|w| w.model_name().to_string())
            .unwrap_or_else(|| backend.short_label().to_string()),
        SttBackend::Win11Captions => backend.short_label().to_string(),
    };

    events.push(SttEvent::Started {
        backend: active_label,
    });

    if let Some(ref mut v) = res.silero_vad {
        v.reset();
    }
    res.legacy_vad.reset();
    if let Some(ref mut d) = res.gtcrn_denoiser {
        d.reset();
    }
    if let Some(ref mut d) = res.dpdf_denoiser {
        d.reset();
    }
    if let Some(ref mut d) = res.voxlock_denoiser {
        d.reset();
    }

    let mut decoder = StreamDecoder::new(*denoise_mode, *speaker_labels);
    let mut out_events: Vec<StreamEvent> = Vec::with_capacity(4);

    loop {
        loop {
            match rx.try_recv() {
                Ok(SttCommand::Stop) => return SessionExit::Stop,
                Ok(SttCommand::Start(next)) => return SessionExit::Switch(next),
                Ok(SttCommand::Shutdown) | Err(mpsc::TryRecvError::Disconnected) => {
                    return SessionExit::Shutdown;
                }
                Ok(SttCommand::SetDenoise(mode)) => {
                    *denoise_mode = mode;
                    decoder.denoise_mode = mode;
                    if mode == DenoiseMode::VoxLock {
                        res.ensure_voxlock();
                    }
                    if let Some(ref mut d) = res.gtcrn_denoiser {
                        d.reset();
                    }
                    if let Some(ref mut d) = res.dpdf_denoiser {
                        d.reset();
                    }
                    if let Some(ref mut d) = res.voxlock_denoiser {
                        d.reset();
                    }
                }
                Ok(SttCommand::SetSpeakerLabels(enabled)) => {
                    *speaker_labels = enabled;
                    decoder.speaker_labels = enabled;
                }
                Ok(SttCommand::SetLlmPolish(enabled)) => {
                    *llm_polish = enabled;
                    if enabled {
                        res.ensure_llm_worker(events);
                    }
                }
                Ok(SttCommand::ResetSpeakers) => {
                    if let Some(ref mut spk) = res.speaker_id {
                        spk.reset();
                    }
                    res.recent_context.clear();
                }
                Err(mpsc::TryRecvError::Empty) => break,
            }
        }

        match pcm_rx.recv_timeout(Duration::from_millis(30)) {
            Ok(chunk) => {
                out_events.clear();
                let vad: &mut dyn VadModel = match res.silero_vad {
                    Some(ref mut s) => s,
                    None => &mut res.legacy_vad,
                };
                let denoiser: Option<&mut dyn DenoiserModel> = match *denoise_mode {
                    DenoiseMode::Off => None,
                    DenoiseMode::Balanced => res
                        .gtcrn_denoiser
                        .as_mut()
                        .or(res.dpdf_denoiser.as_mut())
                        .map(|d| d as &mut dyn DenoiserModel),
                    DenoiseMode::Strong => res
                        .dpdf_denoiser
                        .as_mut()
                        .or(res.gtcrn_denoiser.as_mut())
                        .map(|d| d as &mut dyn DenoiserModel),
                    DenoiseMode::VoxLock => res
                        .voxlock_denoiser
                        .as_mut()
                        .or(res.dpdf_denoiser.as_mut())
                        .map(|d| d as &mut dyn DenoiserModel),
                };
                let speaker: Option<&mut dyn SpeakerIdModel> =
                    res.speaker_id.as_mut().map(|s| s as &mut dyn SpeakerIdModel);
                let asr: &mut dyn AsrModel = match backend {
                    SttBackend::ParakeetGpu => res.parakeet.as_mut().unwrap(),
                    SttBackend::DistilWhisperGpu => res.whisper_gpu.as_mut().unwrap(),
                    SttBackend::WhisperCpuLegacy => res.whisper_cpu.as_mut().unwrap(),
                    SttBackend::Win11Captions => unreachable!(),
                };

                if let Err(err) =
                    decoder.push_chunk(&chunk, vad, denoiser, asr, speaker, &mut out_events)
                {
                    events.push(SttEvent::Error(err));
                    return SessionExit::Stop;
                }

                for ev in out_events.drain(..) {
                    match ev {
                        StreamEvent::SpeechStarted => {
                            events.push(SttEvent::Partial {
                                stable: String::new(),
                                draft: "listening...".to_string(),
                            });
                        }
                        StreamEvent::Partial { stable, draft } => {
                            events.push(SttEvent::Partial { stable, draft });
                        }
                        StreamEvent::Final { text, speaker_id } => {
                            let card_id = res.next_card_id;
                            res.next_card_id = res.next_card_id.wrapping_add(1).max(1);

                            if *llm_polish {
                                if let Some(ref worker) = res.llm_worker {
                                    let ctx: Vec<String> =
                                        res.recent_context.iter().cloned().collect();
                                    worker.submit(card_id, text.clone(), ctx, res.hotwords.clone());
                                }
                            }

                            if res.recent_context.len() == 5 {
                                res.recent_context.pop_front();
                            }
                            res.recent_context.push_back(text.clone());

                            events.push(SttEvent::Final {
                                card_id,
                                text,
                                speaker_id,
                            });
                        }
                        StreamEvent::Cleared => {
                            events.push(SttEvent::Partial {
                                stable: String::new(),
                                draft: String::new(),
                            });
                        }
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return SessionExit::Stop,
        }
    }
}
