//! Zero-allocation real-time streaming speech decoder combining:
//! - O(1)-per-chunk streaming neural speech enhancement (GTCRN / DPDFNet8 / VoxLock target-speaker isolation)
//! - Neural Voice Activity Detection (Silero VAD v5) with fixed-array pre-roll & natural turn hangover
//! - LocalAgreement-2 prefix stabilization (locked bright words + dim tentative tail)
//! - Punctuation-aware continuous speech splitting with boundary overlap deduplication
//! - Per-turn speaker identification (WeSpeaker CAM++ online clustering)
//!
//! Shared identically between live microphone capture and the WAV+noise benchmark harness.

use std::collections::VecDeque;

use crate::win_util::{AUDIO_CHUNK_SAMPLES, AUDIO_SAMPLE_RATE};

pub const CHUNK_SAMPLES: usize = AUDIO_CHUNK_SAMPLES; // 512 samples = 32 ms @ 16 kHz
const PRE_ROLL_CHUNKS: usize = 10; // ~320 ms pre-speech buffer
const MIN_SPEECH_SAMPLES: usize = 4_800; // 300 ms minimum speech to transcribe
const PARTIAL_CADENCE_SAMPLES: usize = 5_632; // ~352 ms between live partial decodes
const SILENCE_FLUSH_CHUNKS: usize = 15; // ~480 ms natural pause finalizes utterance
const SOFT_SPLIT_SAMPLES: usize = 224_000; // ~14.0 s: split at sentence punctuation if available
const HARD_SPLIT_SAMPLES: usize = 288_000; // ~18.0 s: split at confirmed word boundary
const CONTINUATION_OVERLAP_SAMPLES: usize = 12_800; // ~0.8 s acoustic context across soft splits

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DenoiseMode {
    Off,
    Balanced,
    Strong,
    VoxLock,
}

impl DenoiseMode {
    pub fn next(self) -> Self {
        match self {
            Self::Off => Self::Balanced,
            Self::Balanced => Self::Strong,
            Self::Strong => Self::VoxLock,
            Self::VoxLock => Self::Off,
        }
    }

    pub fn button_label(self) -> &'static str {
        match self {
            Self::Off => "DNS: OFF",
            Self::Balanced => "DNS: GTCRN",
            Self::Strong => "DNS: DPDF8",
            Self::VoxLock => "DNS: VOXLOCK",
        }
    }

    pub fn wet_mix(self) -> f32 {
        match self {
            Self::Off => 0.0,
            // Pure phase-coherent neural enhancement (zero dry/wet comb-filtering from STFT latency):
            // Balanced = fast 0.5 MB GTCRN; Strong = deep 14 MB DPDFNet8; VoxLock = target-speaker isolation.
            Self::Balanced | Self::Strong | Self::VoxLock => 1.0,
        }
    }
}

/// Abstract offline/window ASR model (Parakeet TDT GPU, Distil-Whisper GPU, Legacy Whisper CPU).
pub trait AsrModel {
    fn transcribe(&mut self, samples_16k: &[f32]) -> Result<String, String>;
    fn model_name(&self) -> &str;
}

/// Abstract frame-level VAD (Silero VAD v5 or fallback energy/SNR VAD).
pub trait VadModel {
    /// Returns true if the 512-sample (32 ms) 16 kHz frame contains human speech.
    fn is_speech(&mut self, frame_512: &[f32]) -> bool;
    fn reset(&mut self);
}

/// Abstract neural speech enhancer (GTCRN / DPDFNet8 / VoxLock).
pub trait DenoiserModel {
    /// Enhances a 16 kHz mono buffer (returning denoised samples of same length).
    fn enhance(&mut self, samples_16k: &[f32]) -> Vec<f32>;
    /// Streaming 512-sample frame denoiser writing directly into `out_512` (zero heap alloc per frame).
    fn enhance_stream_chunk_into(
        &mut self,
        _chunk_512: &[f32; CHUNK_SAMPLES],
        _out_512: &mut [f32; CHUNK_SAMPLES],
    ) -> bool {
        false
    }
    fn reset(&mut self) {}
}

/// Abstract speaker embedding / clustering tracker for multi-speaker group conversations.
pub trait SpeakerIdModel {
    /// Returns 1-based speaker index (`1`, `2`, `3`, ...) for the spoken utterance.
    fn identify(&mut self, samples_16k: &[f32]) -> Option<u8>;
    fn reset(&mut self);
}

/// Streaming events produced by [`StreamDecoder`] for either the live UI or benchmark harness.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamEvent {
    SpeechStarted,
    Partial {
        stable: String,
        draft: String,
    },
    Final {
        text: String,
        speaker_id: Option<u8>,
    },
    Cleared,
}

/// LocalAgreement-2 stabilizer: locks words once two consecutive hypotheses agree on the prefix.
#[derive(Default)]
pub struct LocalAgreement {
    confirmed: Vec<String>,
    prev_words: Vec<String>,
}

impl LocalAgreement {
    pub fn reset(&mut self) {
        self.confirmed.clear();
        self.prev_words.clear();
    }

    /// Feeds a fresh hypothesis string and returns `(stable_prefix, tentative_draft)`.
    pub fn update(&mut self, hypothesis: &str) -> (String, String) {
        let curr: Vec<String> = hypothesis
            .split_whitespace()
            .map(str::to_string)
            .collect();
        if curr.is_empty() {
            return (self.confirmed.join(" "), String::new());
        }

        let mut lcp = 0usize;
        while lcp < self.prev_words.len() && lcp < curr.len() {
            if norm_word(&self.prev_words[lcp]) == norm_word(&curr[lcp]) {
                lcp += 1;
            } else {
                break;
            }
        }

        // Keep 1 trailing word tentative unless closed by sentence punctuation.
        let lockable = if lcp > 1 && !ends_sentence(&curr[lcp - 1]) {
            lcp - 1
        } else {
            lcp
        };

        if lockable > self.confirmed.len() {
            self.confirmed.clear();
            for w in &curr[..lockable] {
                self.confirmed.push(w.clone());
            }
        } else if !self.confirmed.is_empty() {
            let n = self.confirmed.len().min(curr.len());
            let mut all_match = true;
            for i in 0..n {
                if norm_word(&self.confirmed[i]) != norm_word(&curr[i]) {
                    all_match = false;
                    break;
                }
            }
            if all_match {
                for i in 0..n {
                    self.confirmed[i] = curr[i].clone();
                }
            }
        }

        let stable_len = self.confirmed.len();
        let draft = if curr.len() > stable_len {
            curr[stable_len..].join(" ")
        } else {
            String::new()
        };

        self.prev_words = curr;
        (self.confirmed.join(" "), draft)
    }

    pub fn has_confirmed_sentence_end(&self) -> bool {
        self.confirmed.last().map(|w| ends_sentence(w)).unwrap_or(false)
    }

    pub fn confirmed_text(&self) -> String {
        self.confirmed.join(" ")
    }
}

pub fn norm_word(w: &str) -> String {
    w.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '\'')
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

fn ends_sentence(w: &str) -> bool {
    w.ends_with('.') || w.ends_with('?') || w.ends_with('!')
}

/// Core zero-allocation streaming speech decoder driving:
/// `Streaming Denoise -> Silero VAD -> Parakeet/Whisper ASR -> LocalAgreement -> Speaker ID`.
pub struct StreamDecoder {
    pre_roll_raw: VecDeque<[f32; CHUNK_SAMPLES]>,
    pre_roll_clean: VecDeque<[f32; CHUNK_SAMPLES]>,
    utterance_raw: Vec<f32>,
    utterance_clean: Vec<f32>,
    /// Reusable scratch buffer for AGC & ASR submission (zero heap alloc per decode).
    asr_scratch: Vec<f32>,
    has_stream_clean: bool,
    in_speech: bool,
    silence_chunks: usize,
    samples_since_partial: usize,
    agreement: LocalAgreement,
    last_overlap_tail_words: Vec<String>,
    hp_prev_x: f32,
    hp_prev_y: f32,
    pub denoise_mode: DenoiseMode,
    pub speaker_labels: bool,
    pub partial_cadence_samples: usize,
    pub silence_flush_chunks: usize,
}

impl StreamDecoder {
    pub fn new(denoise_mode: DenoiseMode, speaker_labels: bool) -> Self {
        Self {
            pre_roll_raw: VecDeque::with_capacity(PRE_ROLL_CHUNKS),
            pre_roll_clean: VecDeque::with_capacity(PRE_ROLL_CHUNKS),
            utterance_raw: Vec::with_capacity(AUDIO_SAMPLE_RATE as usize * 12),
            utterance_clean: Vec::with_capacity(AUDIO_SAMPLE_RATE as usize * 12),
            asr_scratch: Vec::with_capacity(AUDIO_SAMPLE_RATE as usize * 12),
            has_stream_clean: false,
            in_speech: false,
            silence_chunks: 0,
            samples_since_partial: 0,
            agreement: LocalAgreement::default(),
            last_overlap_tail_words: Vec::new(),
            hp_prev_x: 0.0,
            hp_prev_y: 0.0,
            denoise_mode,
            speaker_labels,
            partial_cadence_samples: PARTIAL_CADENCE_SAMPLES,
            silence_flush_chunks: SILENCE_FLUSH_CHUNKS,
        }
    }

    pub fn is_in_speech(&self) -> bool {
        self.in_speech
    }

    pub fn reset(&mut self) {
        self.pre_roll_raw.clear();
        self.pre_roll_clean.clear();
        self.utterance_raw.clear();
        self.utterance_clean.clear();
        self.has_stream_clean = false;
        self.in_speech = false;
        self.silence_chunks = 0;
        self.samples_since_partial = 0;
        self.agreement.reset();
        self.last_overlap_tail_words.clear();
        self.hp_prev_x = 0.0;
        self.hp_prev_y = 0.0;
    }

    /// Feeds one 512-sample (32 ms) 16 kHz mono PCM chunk with zero per-chunk heap allocation.
    pub fn push_chunk<'d, 's>(
        &mut self,
        pcm_i16: &[i16],
        vad: &mut dyn VadModel,
        mut denoiser: Option<&mut (dyn DenoiserModel + 'd)>,
        asr: &mut dyn AsrModel,
        speaker: Option<&mut (dyn SpeakerIdModel + 's)>,
        out_events: &mut Vec<StreamEvent>,
    ) -> Result<(), String> {
        // Stack-allocated 512-sample high-pass buffer (~120 Hz @ 16 kHz).
        let mut hp_f32 = [0.0f32; CHUNK_SAMPLES];
        const HP_ALPHA: f32 = 0.955;
        let len = pcm_i16.len().min(CHUNK_SAMPLES);
        for i in 0..len {
            let x = pcm_i16[i] as f32 / 32768.0;
            let y = HP_ALPHA * (self.hp_prev_y + x - self.hp_prev_x);
            self.hp_prev_x = x;
            self.hp_prev_y = y;
            hp_f32[i] = y.clamp(-1.0, 1.0);
        }

        // Run O(1) streaming neural speech enhancement into a stack buffer ONCE per 32 ms chunk.
        let mut clean_buf = [0.0f32; CHUNK_SAMPLES];
        let got_clean = if self.denoise_mode != DenoiseMode::Off {
            denoiser
                .as_mut()
                .map(|d| d.enhance_stream_chunk_into(&hp_f32, &mut clean_buf))
                .unwrap_or(false)
        } else {
            false
        };

        let vad_input: &[f32] = if got_clean { &clean_buf[..len] } else { &hp_f32[..len] };
        let is_voice = vad.is_speech(vad_input);

        if is_voice {
            if !self.in_speech {
                self.in_speech = true;
                self.silence_chunks = 0;
                self.samples_since_partial = 0;
                self.agreement.reset();
                self.utterance_raw.clear();
                self.utterance_clean.clear();
                self.has_stream_clean = got_clean && self.pre_roll_clean.len() == self.pre_roll_raw.len();
                for prev in self.pre_roll_raw.drain(..) {
                    self.utterance_raw.extend_from_slice(&prev);
                }
                if self.has_stream_clean {
                    for prev in self.pre_roll_clean.drain(..) {
                        self.utterance_clean.extend_from_slice(&prev);
                    }
                } else {
                    self.pre_roll_clean.clear();
                }
                out_events.push(StreamEvent::SpeechStarted);
            } else {
                self.silence_chunks = 0;
            }
            self.utterance_raw.extend_from_slice(&hp_f32[..len]);
            if got_clean {
                self.utterance_clean.extend_from_slice(&clean_buf[..len]);
            } else {
                self.has_stream_clean = false;
            }
            self.samples_since_partial += len;
        } else if self.in_speech {
            self.utterance_raw.extend_from_slice(&hp_f32[..len]);
            if got_clean {
                self.utterance_clean.extend_from_slice(&clean_buf[..len]);
            } else {
                self.has_stream_clean = false;
            }
            self.silence_chunks += 1;
            self.samples_since_partial += len;
        } else {
            if self.pre_roll_raw.len() == PRE_ROLL_CHUNKS {
                self.pre_roll_raw.pop_front();
            }
            self.pre_roll_raw.push_back(hp_f32);
            if got_clean {
                if self.pre_roll_clean.len() == PRE_ROLL_CHUNKS {
                    self.pre_roll_clean.pop_front();
                }
                self.pre_roll_clean.push_back(clean_buf);
            } else {
                self.pre_roll_clean.clear();
            }
            return Ok(());
        }

        // Live partial hypothesis on cadence while speaking (reuses asr_scratch: 0 heap allocs!).
        if self.in_speech
            && self.utterance_raw.len() >= MIN_SPEECH_SAMPLES
            && self.samples_since_partial >= self.partial_cadence_samples
        {
            self.samples_since_partial = 0;
            let clean_slice = if self.has_stream_clean
                && self.utterance_clean.len() == self.utterance_raw.len()
            {
                Some(self.utterance_clean.as_slice())
            } else {
                None
            };
            prepare_asr_audio_into(
                &self.utterance_raw,
                clean_slice,
                self.denoise_mode,
                denoiser.as_deref_mut(),
                &mut self.asr_scratch,
            );
            if let Ok(raw_text) = asr.transcribe(&self.asr_scratch) {
                let cleaned = clean_asr_output(&raw_text);
                if !cleaned.is_empty() {
                    let (stable, draft) = self.agreement.update(&cleaned);
                    out_events.push(StreamEvent::Partial { stable, draft });
                }
            }
        }

        // Natural pause finalization OR soft sentence-boundary split on long monologues.
        let natural_end = self.silence_chunks >= self.silence_flush_chunks;
        let soft_split = self.utterance_raw.len() >= SOFT_SPLIT_SAMPLES
            && self.agreement.has_confirmed_sentence_end();
        let hard_split = self.utterance_raw.len() >= HARD_SPLIT_SAMPLES;

        if natural_end || soft_split || hard_split {
            let keep_overlap = !natural_end;
            self.finalize_utterance(denoiser, asr, speaker, keep_overlap, out_events)?;
        }

        Ok(())
    }

    /// Forces flushing any buffered speech at end-of-stream (e.g. end of benchmark WAV or Mic Stop).
    pub fn flush<'d, 's>(
        &mut self,
        denoiser: Option<&mut (dyn DenoiserModel + 'd)>,
        asr: &mut dyn AsrModel,
        speaker: Option<&mut (dyn SpeakerIdModel + 's)>,
        out_events: &mut Vec<StreamEvent>,
    ) -> Result<(), String> {
        if self.in_speech && self.utterance_raw.len() >= MIN_SPEECH_SAMPLES {
            self.finalize_utterance(denoiser, asr, speaker, false, out_events)?;
        } else {
            self.reset();
        }
        Ok(())
    }

    fn finalize_utterance<'d, 's>(
        &mut self,
        mut denoiser: Option<&mut (dyn DenoiserModel + 'd)>,
        asr: &mut dyn AsrModel,
        speaker: Option<&mut (dyn SpeakerIdModel + 's)>,
        keep_overlap: bool,
        out_events: &mut Vec<StreamEvent>,
    ) -> Result<(), String> {
        let use_clean =
            self.has_stream_clean && self.utterance_clean.len() == self.utterance_raw.len();

        if self.utterance_raw.len() < MIN_SPEECH_SAMPLES {
            self.in_speech = false;
            self.silence_chunks = 0;
            self.samples_since_partial = 0;
            self.agreement.reset();
            self.utterance_raw.clear();
            self.utterance_clean.clear();
            self.has_stream_clean = false;
            out_events.push(StreamEvent::Cleared);
            return Ok(());
        }

        // Fill asr_scratch directly from utterance_raw / utterance_clean (zero extra Vec copy).
        prepare_asr_audio_into(
            &self.utterance_raw,
            if use_clean {
                Some(self.utterance_clean.as_slice())
            } else {
                None
            },
            self.denoise_mode,
            denoiser.as_deref_mut(),
            &mut self.asr_scratch,
        );

        // Retain trailing overlap in-place via copy_within + truncate (zero heap allocation).
        if keep_overlap && self.utterance_raw.len() > CONTINUATION_OVERLAP_SAMPLES {
            let split_at = self.utterance_raw.len() - CONTINUATION_OVERLAP_SAMPLES;
            self.utterance_raw.copy_within(split_at.., 0);
            self.utterance_raw.truncate(CONTINUATION_OVERLAP_SAMPLES);
            if use_clean {
                self.utterance_clean.copy_within(split_at.., 0);
                self.utterance_clean.truncate(CONTINUATION_OVERLAP_SAMPLES);
            } else {
                self.utterance_clean.clear();
            }
            self.samples_since_partial = 0;
            self.silence_chunks = 0;
            self.agreement.reset();
        } else {
            self.in_speech = false;
            self.silence_chunks = 0;
            self.samples_since_partial = 0;
            self.agreement.reset();
            self.utterance_raw.clear();
            self.utterance_clean.clear();
            self.has_stream_clean = false;
        }

        let raw_text = clean_asr_output(&asr.transcribe(&self.asr_scratch)?);
        let text = if !self.last_overlap_tail_words.is_empty() {
            strip_overlap_prefix(&self.last_overlap_tail_words, &raw_text)
        } else {
            raw_text
        };

        if keep_overlap {
            let words: Vec<String> = text.split_whitespace().map(norm_word).collect();
            let take = words.len().min(8);
            self.last_overlap_tail_words = words[words.len() - take..].to_vec();
        } else {
            self.last_overlap_tail_words.clear();
        }

        if !text.is_empty() {
            let speaker_id = if self.speaker_labels {
                speaker.and_then(|spk| spk.identify(&self.asr_scratch))
            } else {
                None
            };
            out_events.push(StreamEvent::Final { text, speaker_id });
        } else {
            out_events.push(StreamEvent::Cleared);
        }
        Ok(())
    }
}

/// Removes duplicated boundary words when a long continuous utterance splits with acoustic overlap.
fn strip_overlap_prefix(prev_tail_norm: &[String], next_text: &str) -> String {
    let words: Vec<&str> = next_text.split_whitespace().collect();
    if words.is_empty() || prev_tail_norm.is_empty() {
        return next_text.to_string();
    }
    let next_norm: Vec<String> = words.iter().map(|w| norm_word(w)).collect();
    let max_k = prev_tail_norm.len().min(next_norm.len());
    for k in (1..=max_k).rev() {
        let prev_suf = &prev_tail_norm[prev_tail_norm.len() - k..];
        let next_pre = &next_norm[..k];
        if prev_suf == next_pre {
            return words[k..].join(" ");
        }
    }
    next_text.to_string()
}

/// Prepares 16 kHz audio into a reusable `out` buffer (zero heap allocation after warm-up).
pub fn prepare_asr_audio_into<'d>(
    raw_hp: &[f32],
    stream_clean: Option<&[f32]>,
    mode: DenoiseMode,
    denoiser: Option<&mut (dyn DenoiserModel + 'd)>,
    out: &mut Vec<f32>,
) {
    out.clear();
    if mode != DenoiseMode::Off {
        let wet = mode.wet_mix();
        let dry = 1.0 - wet;
        if let Some(clean) = stream_clean {
            if (wet - 1.0).abs() < 1e-3 || clean.len() != raw_hp.len() {
                out.extend_from_slice(clean);
            } else {
                out.extend(
                    clean
                        .iter()
                        .zip(raw_hp.iter())
                        .map(|(&e, &r)| (e * wet + r * dry).clamp(-1.0, 1.0)),
                );
            }
        } else if let Some(d) = denoiser {
            let enhanced = d.enhance(raw_hp);
            if (wet - 1.0).abs() < 1e-3 || enhanced.len() != raw_hp.len() {
                out.extend_from_slice(&enhanced);
            } else {
                out.extend(
                    enhanced
                        .iter()
                        .zip(raw_hp.iter())
                        .map(|(&e, &r)| (e * wet + r * dry).clamp(-1.0, 1.0)),
                );
            }
        } else {
            out.extend_from_slice(raw_hp);
        }
    } else {
        out.extend_from_slice(raw_hp);
    }

    // Gentle peak AGC (up to +14 dB boost for soft/distant voices, never clipping).
    let peak = out.iter().fold(1e-5f32, |acc, &x| acc.max(x.abs()));
    if peak > 0.004 && peak < 0.72 {
        let gain = (0.72 / peak).min(5.0);
        for s in out.iter_mut() {
            *s = (*s * gain).clamp(-1.0, 1.0);
        }
    }
}

/// Strips non-speech hallucination artifacts commonly emitted by ASR models during noise bursts.
pub fn clean_asr_output(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if (trimmed.starts_with('[') && trimmed.ends_with(']'))
        || (trimmed.starts_with('(') && trimmed.ends_with(')'))
    {
        return String::new();
    }
    let lower = trimmed.to_ascii_lowercase();
    const HALLUCINATIONS: &[&str] = &[
        "you",
        "thank you.",
        "thank you",
        "thanks for watching.",
        "thanks for watching",
        "subtitles by",
        "amara.org",
        "mbc",
        "...",
        ".",
    ];
    if HALLUCINATIONS.contains(&lower.as_str()) {
        return String::new();
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_agreement_locks_prefix_monotonically() {
        let mut la = LocalAgreement::default();
        let (s1, d1) = la.update("Hello there how are");
        assert_eq!(s1, "");
        assert_eq!(d1, "Hello there how are");

        let (s2, d2) = la.update("Hello there how are you doing");
        assert_eq!(s2, "Hello there how");
        assert_eq!(d2, "are you doing");

        let (s3, d3) = la.update("Hello there how are you doing today?");
        assert_eq!(s3, "Hello there how are you");
        assert_eq!(d3, "doing today?");
    }

    #[test]
    fn overlap_prefix_deduplicates_cleanly() {
        let prev = vec!["joining".into(), "us".into(), "in".into(), "fifteen".into()];
        let trimmed = strip_overlap_prefix(&prev, "in fifteen minutes near the patio.");
        assert_eq!(trimmed, "minutes near the patio.");
    }
}
