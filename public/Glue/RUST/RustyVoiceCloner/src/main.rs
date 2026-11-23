#![windows_subsystem = "windows"]

mod audio;
mod cards;
mod cloner;
mod dsp;
mod piper_target;

use audio::AudioCapture;
use cards::{default_cards, SoundCard};
use cloner::{check_openvoice_ready, stitch_and_export_profile};
use dsp::{
    compute_match_score, compute_spectrum_bands, estimate_pitch_hz, extract_best_segment,
    SAMPLE_RATE, SPECTRUM_BANDS,
};
use eframe::egui;
use egui::{Color32, RichText, Stroke};
use egui_plot::{Bar, BarChart, Line, Plot, PlotPoints};
use piper_target::{
    app_root_dir, discover_piper_voices, ensure_card_target, find_piper_exe, PiperVoice,
};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::thread;

const GOOD_MATCH_THRESHOLD: f32 = 62.0;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1180.0, 820.0])
            .with_min_inner_size([920.0, 680.0])
            .with_title("RustyVoiceCloner — Visual Voice Mimicry Studio"),
        ..Default::default()
    };

    eframe::run_native(
        "RustyVoiceCloner",
        options,
        Box::new(|cc| {
            cc.egui_ctx.set_visuals(egui::Visuals::dark());
            Ok(Box::new(VoiceClonerApp::new()))
        }),
    )
}

struct VoiceClonerApp {
    profile_name: String,
    cards: Vec<SoundCard>,
    selected_idx: usize,

    piper_exe: Option<PathBuf>,
    piper_voices: Vec<PiperVoice>,
    selected_voice_idx: usize,
    targets_cache_dir: PathBuf,

    audio: Option<AudioCapture>,
    audio_error: Option<String>,
    recording_take: bool,
    space_was_down: bool,

    live_match_score: f32,
    live_rms: f32,
    live_pitch_hz: Option<f32>,
    smoothed_env: f32,
    smoothed_pitch: f32,
    live_env_history: VecDeque<f32>,
    live_pitch_history: VecDeque<f32>,
    live_spectrum: [f32; SPECTRUM_BANDS],
    smoothed_spectrum: [f32; SPECTRUM_BANDS],

    openvoice_ready: bool,
    export_in_progress: bool,
    export_rx: Option<Receiver<Result<PathBuf, String>>>,
    status_message: String,
    exported_voices: Vec<String>,
}

impl VoiceClonerApp {
    fn new() -> Self {
        let root = app_root_dir();
        let recordings_dir = root.join("recordings");
        let targets_cache_dir = root.join("targets_cache");

        let (audio, audio_error) = match AudioCapture::start(&recordings_dir) {
            Ok(a) => (Some(a), None),
            Err(e) => (None, Some(e)),
        };

        let piper_exe = find_piper_exe();
        let piper_voices = discover_piper_voices();
        let mut cards = default_cards();

        if let (Some(exe), Some(voice)) = (&piper_exe, piper_voices.first()) {
            for card in &mut cards {
                let _ = ensure_card_target(exe, voice, card, &targets_cache_dir);
            }
        }

        let openvoice_ready = check_openvoice_ready();
        let status_message = if openvoice_ready {
            "Ready! Hold SPACEBAR (or the Record button) and mimic the cyan target graphs."
                .to_string()
        } else {
            "OpenVoice v2 sidecar not set up yet - you can still record now, then run openvoice_worker\\Setup.bat to generate voices."
                .to_string()
        };

        Self {
            profile_name: "Dillon".to_string(),
            cards,
            selected_idx: 0,
            piper_exe,
            piper_voices,
            selected_voice_idx: 0,
            targets_cache_dir,
            audio,
            audio_error,
            recording_take: false,
            space_was_down: false,
            live_match_score: 0.0,
            live_rms: 0.0,
            live_pitch_hz: None,
            smoothed_env: 0.0,
            smoothed_pitch: 0.0,
            live_env_history: VecDeque::from(vec![0.0; 120]),
            live_pitch_history: VecDeque::from(vec![0.0; 120]),
            live_spectrum: [0.0; SPECTRUM_BANDS],
            smoothed_spectrum: [0.0; SPECTRUM_BANDS],
            openvoice_ready,
            export_in_progress: false,
            export_rx: None,
            status_message,
            exported_voices: Vec::new(),
        }
    }

    fn reload_targets_for_selected_voice(&mut self) {
        let Some(exe) = &self.piper_exe else { return };
        let Some(voice) = self.piper_voices.get(self.selected_voice_idx) else {
            return;
        };
        for card in &mut self.cards {
            let _ = ensure_card_target(exe, voice, card, &self.targets_cache_dir);
        }
        self.status_message = format!("Loaded target soundwaves from Piper voice: {}", voice.name);
    }

    fn begin_take(&mut self) {
        if self.recording_take {
            return;
        }
        if let Some(audio) = &self.audio {
            audio.start_take();
            self.recording_take = true;
            self.status_message = "Recording take... watch the live green/amber graphs!".to_string();
        }
    }

    fn finish_take(&mut self) {
        if !self.recording_take {
            return;
        }
        self.recording_take = false;
        let Some(audio) = &self.audio else { return };
        let recorded = audio.stop_take();

        let Some(card) = self.cards.get_mut(self.selected_idx) else {
            return;
        };
        let Some(target) = &card.target else {
            self.status_message = "No target loaded for this card.".to_string();
            return;
        };

        match extract_best_segment(
            &recorded,
            target.samples.len(),
            target.median_pitch_hz,
            &target.avg_spectrum,
        ) {
            Some((best_samples, score)) => {
                let prev_best = card.best_take.as_ref().map(|t| t.score).unwrap_or(-1.0);
                if score >= prev_best {
                    card.best_take = Some(cards::BestTake {
                        samples: best_samples,
                        score,
                    });
                    if score >= GOOD_MATCH_THRESHOLD {
                        self.status_message = format!(
                            "Great match ({:.0}%)! Saved new best take for {}.",
                            score, card.title
                        );
                    } else {
                        self.status_message = format!(
                            "Saved take ({:.0}%). Try again to beat {:.0}% or aim for {:.0}%+!",
                            score, score, GOOD_MATCH_THRESHOLD
                        );
                    }
                } else {
                    self.status_message = format!(
                        "Take scored {:.0}% (kept your higher {:.0}% take).",
                        score, prev_best
                    );
                }
            }
            None => {
                self.status_message =
                    "Take was too quiet or short — hold Spacebar a bit longer and vocalize!"
                        .to_string();
            }
        }
    }

    fn start_export(&mut self) {
        if self.export_in_progress {
            return;
        }
        self.openvoice_ready = check_openvoice_ready();
        let profile = self.profile_name.clone();
        let cards_clone = self.cards.clone();
        let (tx, rx) = mpsc::channel();
        self.export_rx = Some(rx);
        self.export_in_progress = true;
        self.status_message = "Stitching takes & extracting your OpenVoice tone-color embedding..."
            .to_string();

        thread::spawn(move || {
            let res = stitch_and_export_profile(&profile, &cards_clone);
            let _ = tx.send(res);
        });
    }

    fn poll_export(&mut self) {
        let Some(rx) = &self.export_rx else { return };
        if let Ok(result) = rx.try_recv() {
            self.export_in_progress = false;
            self.export_rx = None;
            match result {
                Ok(pth_path) => {
                    let clean_profile = self.profile_name.trim();
                    self.exported_voices = self
                        .piper_voices
                        .iter()
                        .map(|v| format!("{}-{}", v.name, clean_profile))
                        .collect();
                    self.status_message = format!(
                        "SUCCESS! Saved voice profile to {}. Open speech-bridge to use: {}",
                        pth_path.display(),
                        self.exported_voices.join(", ")
                    );
                }
                Err(err) => {
                    self.status_message = format!("Export notice: {err}");
                }
            }
        }
    }
}

impl eframe::App for VoiceClonerApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint();
        self.poll_export();

        // Spacebar hold-to-record (only when not typing in the profile name box)
        let typing_text = ctx.wants_keyboard_input();
        if !typing_text {
            let space_down = ctx.input(|i| i.key_down(egui::Key::Space));
            if space_down && !self.space_was_down {
                self.begin_take();
            } else if !space_down && self.space_was_down {
                self.finish_take();
            }
            self.space_was_down = space_down;
        }

        // Sample latest 1024-sample frame for smooth, shimmer-free 60fps graphs
        let live_samples = self
            .audio
            .as_ref()
            .map(|a| a.snapshot_live_samples(1024))
            .unwrap_or_default();

        let hop = 512;
        let latest_frame = &live_samples[..];
        self.live_rms = if latest_frame.is_empty() {
            0.0
        } else {
            (latest_frame.iter().map(|s| s * s).sum::<f32>() / latest_frame.len() as f32).sqrt()
        };
        self.live_pitch_hz = estimate_pitch_hz(latest_frame, SAMPLE_RATE);

        self.smoothed_env = self.smoothed_env * 0.78 + self.live_rms * 0.22;
        if self.live_env_history.len() >= 120 {
            self.live_env_history.pop_front();
        }
        self.live_env_history.push_back(self.smoothed_env);

        let target_p = self.live_pitch_hz.unwrap_or(0.0);
        self.smoothed_pitch = self.smoothed_pitch * 0.80 + target_p * 0.20;
        if self.live_pitch_history.len() >= 120 {
            self.live_pitch_history.pop_front();
        }
        self.live_pitch_history.push_back(self.smoothed_pitch);
        self.live_spectrum = compute_spectrum_bands(latest_frame, SAMPLE_RATE);
        for i in 0..SPECTRUM_BANDS {
            self.smoothed_spectrum[i] =
                self.smoothed_spectrum[i] * 0.65 + self.live_spectrum[i] * 0.35;
        }

        if let Some(target) = self
            .cards
            .get(self.selected_idx)
            .and_then(|c| c.target.as_ref())
        {
            let score = compute_match_score(
                self.live_rms,
                self.live_pitch_hz,
                &self.smoothed_spectrum,
                target.median_pitch_hz,
                &target.avg_spectrum,
            );
            self.live_match_score = self.live_match_score * 0.5 + score * 0.5;
        } else {
            self.live_match_score = 0.0;
        }

        // Top Bar
        egui::TopBottomPanel::top("top_bar").show(ctx, |ui| {
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.heading(RichText::new("RustyVoiceCloner").strong().color(Color32::from_rgb(100, 220, 255)));
                ui.separator();

                ui.label("Profile:");
                ui.add(egui::TextEdit::singleline(&mut self.profile_name).desired_width(90.0));

                ui.separator();
                ui.label("Target Base Voice:");
                let current_voice_name = self
                    .piper_voices
                    .get(self.selected_voice_idx)
                    .map(|v| v.name.as_str())
                    .unwrap_or("None");
                let mut changed_voice = None;
                egui::ComboBox::from_id_salt("piper_voice_combo")
                    .selected_text(current_voice_name)
                    .show_ui(ui, |ui| {
                        for (idx, v) in self.piper_voices.iter().enumerate() {
                            if ui.selectable_value(&mut self.selected_voice_idx, idx, &v.name).changed() {
                                changed_voice = Some(idx);
                            }
                        }
                    });
                if changed_voice.is_some() {
                    self.reload_targets_for_selected_voice();
                }

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if let Some(audio) = &self.audio {
                        let fname = audio
                            .session_wav_path
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("session.wav");
                        ui.label(
                            RichText::new(format!("[REC] SESSION ({fname})"))
                                .color(Color32::from_rgb(255, 110, 110))
                                .small(),
                        );
                        ui.separator();
                        ui.label(RichText::new(format!("Mic: {}", audio.mic_name)).small());
                    } else if let Some(err) = &self.audio_error {
                        ui.label(RichText::new(format!("Mic Error: {err}")).color(Color32::RED));
                    }
                });
            });
            ui.add_space(4.0);
        });

        // Bottom Export & Status Bar
        egui::TopBottomPanel::bottom("bottom_bar").show(ctx, |ui| {
            ui.add_space(6.0);
            ui.horizontal(|ui| {
                let captured = self.cards.iter().filter(|c| c.best_take.is_some()).count();
                ui.label(RichText::new(format!("Captured: {captured} / {}", self.cards.len())).strong());

                let btn_text = if self.export_in_progress {
                    "Generating Voices..."
                } else {
                    "Generate My Cloned Voices (Alan, Amy, Lessac, Ryan)"
                };
                let can_export = captured > 0 && !self.export_in_progress;
                if ui
                    .add_enabled(
                        can_export,
                        egui::Button::new(RichText::new(btn_text).strong())
                            .fill(Color32::from_rgb(35, 130, 85)),
                    )
                    .clicked()
                {
                    self.start_export();
                }

                if !self.openvoice_ready {
                    ui.label(
                        RichText::new("[!] Run openvoice_worker\\Setup.bat to enable .pth export")
                            .color(Color32::from_rgb(255, 200, 80))
                            .small(),
                    );
                }
            });
            ui.add_space(3.0);
            ui.label(RichText::new(&self.status_message).small().color(Color32::LIGHT_GRAY));
            ui.add_space(4.0);
        });

        // Left Sidebar: Sound Cards
        egui::SidePanel::left("cards_panel")
            .default_width(235.0)
            .show(ctx, |ui| {
                ui.add_space(6.0);
                ui.heading("Sound Cards");
                ui.label(RichText::new("Select a sound to mimic:").small().color(Color32::GRAY));
                ui.separator();

                egui::ScrollArea::vertical().show(ui, |ui| {
                    for (idx, card) in self.cards.iter().enumerate() {
                        let is_selected = idx == self.selected_idx;
                        let badge = match &card.best_take {
                            Some(t) if t.score >= GOOD_MATCH_THRESHOLD => {
                                format!("[OK] {:.0}%", t.score)
                            }
                            Some(t) => format!("~ {:.0}%", t.score),
                            None => "o".to_string(),
                        };
                        let badge_color = match &card.best_take {
                            Some(t) if t.score >= GOOD_MATCH_THRESHOLD => {
                                Color32::from_rgb(90, 235, 130)
                            }
                            Some(_) => Color32::from_rgb(255, 200, 90),
                            None => Color32::GRAY,
                        };

                        ui.horizontal(|ui| {
                            if ui.selectable_label(is_selected, card.title).clicked() {
                                self.selected_idx = idx;
                            }
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.label(RichText::new(badge).color(badge_color).strong());
                                },
                            );
                        });
                    }
                });
            });

        // Center Stage: Visual Mimicry Graphs
        egui::CentralPanel::default().show(ctx, |ui| {
            let card_title = self.cards[self.selected_idx].title;
            let card_cue = self.cards[self.selected_idx].cue;
            let best_score = self.cards[self.selected_idx]
                .best_take
                .as_ref()
                .map(|t| t.score);

            // Header + Physical Cue
            ui.horizontal(|ui| {
                ui.heading(card_title);
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let score = self.live_match_score;
                    let score_color = if score >= GOOD_MATCH_THRESHOLD {
                        Color32::from_rgb(80, 245, 130)
                    } else if score >= 40.0 {
                        Color32::from_rgb(255, 200, 75)
                    } else {
                        Color32::from_rgb(170, 175, 185)
                    };
                    ui.label(
                        RichText::new(format!("LIVE MATCH: {:.0}%", score))
                            .size(20.0)
                            .strong()
                            .color(score_color),
                    );
                    if let Some(bs) = best_score {
                        ui.label(
                            RichText::new(format!("Best: {:.0}%  | ", bs))
                                .size(15.0)
                                .color(Color32::from_rgb(120, 220, 255)),
                        );
                    }
                });
            });

            egui::Frame::none()
                .fill(Color32::from_rgb(30, 42, 56))
                .rounding(6.0)
                .inner_margin(8.0)
                .show(ui, |ui| {
                    ui.label(
                        RichText::new(format!("How it feels: {card_cue}"))
                            .size(14.5)
                            .color(Color32::from_rgb(215, 235, 255)),
                    );
                });

            ui.add_space(6.0);

            let live_color = if self.live_match_score >= GOOD_MATCH_THRESHOLD {
                Color32::from_rgb(80, 245, 130)
            } else {
                Color32::from_rgb(255, 185, 60)
            };
            let target_color = Color32::from_rgb(70, 210, 255);

            // 1. Amplitude Envelope Plot
            ui.label(RichText::new("1. Loudness / Wave Shape  (Cyan = Target, Amber/Green = Your Mic)").small());
            let target_env_pts: PlotPoints = self.cards[self.selected_idx]
                .target
                .as_ref()
                .map(|t| {
                    t.envelope
                        .iter()
                        .enumerate()
                        .map(|(i, &v)| [i as f64 * (hop as f64 / SAMPLE_RATE as f64), v as f64])
                        .collect()
                })
                .unwrap_or_default();

            // Scale live envelope sensitively for quiet rooms (with soft auto-gain above 0.08)
            let env_scale = self
                .live_env_history
                .iter()
                .copied()
                .fold(0.08f32, f32::max);
            let live_env_pts: PlotPoints = self
                .live_env_history
                .iter()
                .enumerate()
                .map(|(i, &v)| {
                    [
                        (i as f64 / 119.0) * 2.0,
                        (v / env_scale).clamp(0.0, 1.0) as f64,
                    ]
                })
                .collect();

            Plot::new("envelope_plot")
                .height(155.0)
                .include_y(0.0)
                .include_y(1.05)
                .include_x(0.0)
                .include_x(2.0)
                .allow_drag(false)
                .allow_zoom(false)
                .show(ui, |plot_ui| {
                    plot_ui.line(
                        Line::new(target_env_pts)
                            .color(target_color)
                            .width(2.5_f32)
                            .name("Target"),
                    );
                    plot_ui.line(
                        Line::new(live_env_pts)
                            .color(live_color)
                            .width(2.2_f32)
                            .name("Live Mic"),
                    );
                });

            ui.add_space(4.0);

            // 2. Pitch (F0) Plot
            let target_pitch_txt = self.cards[self.selected_idx]
                .target
                .as_ref()
                .and_then(|t| t.median_pitch_hz)
                .map(|hz| format!("{hz:.0} Hz"))
                .unwrap_or_else(|| "Unvoiced (breath)".to_string());
            let live_pitch_txt = self
                .live_pitch_hz
                .map(|hz| format!("{hz:.0} Hz"))
                .unwrap_or_else(|| "-".to_string());
            ui.label(
                RichText::new(format!(
                    "2. Pitch / Tone (High vs Low)  -  Target: {target_pitch_txt}  |  Live: {live_pitch_txt}"
                ))
                .small(),
            );

            let target_pitch_pts: PlotPoints = self.cards[self.selected_idx]
                .target
                .as_ref()
                .map(|t| {
                    t.pitch_contour
                        .iter()
                        .enumerate()
                        .filter(|(_, &hz)| hz > 40.0)
                        .map(|(i, &hz)| [i as f64 * (hop as f64 / SAMPLE_RATE as f64), hz as f64])
                        .collect()
                })
                .unwrap_or_default();

            let live_pitch_pts: PlotPoints = self
                .live_pitch_history
                .iter()
                .enumerate()
                .map(|(i, &hz)| [(i as f64 / 119.0) * 2.0, hz as f64])
                .collect();

            Plot::new("pitch_plot")
                .height(145.0)
                .include_y(0.0)
                .include_y(360.0)
                .include_x(0.0)
                .include_x(2.0)
                .allow_drag(false)
                .allow_zoom(false)
                .show(ui, |plot_ui| {
                    plot_ui.line(
                        Line::new(target_pitch_pts)
                            .color(target_color)
                            .width(2.5_f32)
                            .name("Target Pitch"),
                    );
                    plot_ui.line(
                        Line::new(live_pitch_pts)
                            .color(live_color)
                            .width(2.2_f32)
                            .name("Live Pitch"),
                    );
                });

            ui.add_space(4.0);

            // 3. Vowel / Frequency Spectrum Bars
            ui.label(RichText::new("3. Vowel Shape / Frequency Spectrum (Match the bar silhouette!)").small());
            let target_bars: Vec<Bar> = self.cards[self.selected_idx]
                .target
                .as_ref()
                .map(|t| {
                    t.avg_spectrum
                        .iter()
                        .enumerate()
                        .map(|(i, &v)| Bar::new(i as f64 - 0.15, v as f64).width(0.35))
                        .collect()
                })
                .unwrap_or_default();

            let live_bars: Vec<Bar> = self
                .smoothed_spectrum
                .iter()
                .enumerate()
                .map(|(i, &v)| Bar::new(i as f64 + 0.15, v as f64).width(0.35))
                .collect();

            Plot::new("spectrum_plot")
                .height(145.0)
                .include_y(0.0)
                .include_y(1.05)
                .include_x(-0.5)
                .include_x(SPECTRUM_BANDS as f64)
                .allow_drag(false)
                .allow_zoom(false)
                .show(ui, |plot_ui| {
                    plot_ui.bar_chart(
                        BarChart::new(target_bars)
                            .color(Color32::from_rgba_unmultiplied(70, 210, 255, 160))
                            .name("Target"),
                    );
                    plot_ui.bar_chart(
                        BarChart::new(live_bars)
                            .color(live_color)
                            .name("Live"),
                    );
                });

            ui.add_space(8.0);

            // Controls Row
            ui.horizontal(|ui| {
                let rec_label = if self.recording_take {
                    "[REC] RECORDING TAKE... (Release to Score)"
                } else {
                    "Hold SPACEBAR or Click & Hold to Record Take"
                };
                let rec_btn = ui.add_sized(
                    [340.0, 42.0],
                    egui::Button::new(RichText::new(rec_label).strong().size(14.0)).fill(
                        if self.recording_take {
                            Color32::from_rgb(190, 45, 45)
                        } else {
                            Color32::from_rgb(45, 95, 165)
                        },
                    ),
                );
                if rec_btn.is_pointer_button_down_on() && !self.recording_take {
                    self.begin_take();
                } else if !rec_btn.is_pointer_button_down_on()
                    && self.recording_take
                    && !self.space_was_down
                {
                    self.finish_take();
                }

                if ui.add_sized([90.0, 42.0], egui::Button::new("Clear Take")).clicked() {
                    self.cards[self.selected_idx].best_take = None;
                    self.status_message = "Cleared take for this card.".to_string();
                }

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui
                        .add_enabled(
                            self.selected_idx + 1 < self.cards.len(),
                            egui::Button::new("Next ->").min_size(egui::vec2(85.0, 42.0)),
                        )
                        .clicked()
                    {
                        self.selected_idx += 1;
                    }
                    if ui
                        .add_enabled(
                            self.selected_idx > 0,
                            egui::Button::new("<- Prev").min_size(egui::vec2(85.0, 42.0)),
                        )
                        .clicked()
                    {
                        self.selected_idx -= 1;
                    }
                });
            });
        });

        let _ = Stroke::NONE;
    }
}
