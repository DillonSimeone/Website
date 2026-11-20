(() => {
  // =========================================================================
  // 1. Real Measured Benchmark Dataset (Intel i5-13420H + NVIDIA RTX 3050 6GB)
  // =========================================================================
  const BENCHMARKS = [
    {
      name: "Legacy Whisper base.en (CPU)",
      cls: "legacy",
      wer: { clean: 18.3, "+10dB": 22.9, "+5dB": 20.0, "0dB": 24.2, "-5dB": 45.0 },
      inferMs: 965,
      firstMs: 880,
    },
    {
      name: "Distil-Whisper v3.5 EN (RTX GPU)",
      cls: "distil",
      wer: { clean: 19.2, "+10dB": 18.3, "+5dB": 21.7, "0dB": 22.1, "-5dB": 31.2 },
      inferMs: 377,
      firstMs: 505,
    },
    {
      name: "Parakeet TDT 0.6B GPU (DNS: OFF)",
      cls: "parakeet",
      wer: { clean: 8.3, "+10dB": 5.8, "+5dB": 5.0, "0dB": 5.8, "-5dB": 24.2 },
      inferMs: 198,
      firstMs: 335,
    },
    {
      name: "Parakeet TDT 0.6B GPU (DNS: GTCRN)",
      cls: "denoise",
      wer: { clean: 1.7, "+10dB": 12.1, "+5dB": 5.0, "0dB": 8.3, "-5dB": 27.5 },
      inferMs: 242,
      firstMs: 355,
    },
    {
      name: "Parakeet TDT 0.6B GPU (DNS: DPDF8)",
      cls: "denoise",
      wer: { clean: 8.3, "+10dB": 4.6, "+5dB": 8.8, "0dB": 10.4, "-5dB": 32.5 },
      inferMs: 405,
      firstMs: 405,
    },
    {
      name: "Parakeet GPU + Qwen2.5-1.5B LLM",
      cls: "llm",
      wer: { clean: 9.2, "+10dB": 7.1, "+5dB": 6.7, "0dB": 7.9, "-5dB": 23.8 },
      inferMs: 231,
      firstMs: 360,
    },
    {
      name: "Parakeet GPU + VoxLock (1-on-1 Only)",
      cls: "voxlock",
      wer: { clean: 3.3, "+10dB": 6.7, "+5dB": 6.7, "0dB": 8.3, "-5dB": 31.7 },
      inferMs: 485,
      firstMs: 380,
    },
  ];

  // =========================================================================
  // 2. Identical Plain-English Hover Tooltips (mirrors Rust src/ui.rs!)
  // =========================================================================
  const TOOLTIPS = {
    btnMic: [
      "RX LISTEN TOGGLE",
      "Arm or pause live Speech-to-Text captioning. Green dot = actively listening on your RTX GPU.",
    ],
    btnEngine: [
      "SPEECH RECOGNITION ENGINE",
      "Click to switch AI models: Parakeet TDT 0.6B (fastest & best English GPU accuracy), Distil-Whisper v3.5 GPU, Win11 Live Captions (battery saver), or Legacy Whisper CPU.",
    ],
    btnInput: [
      "MICROPHONE & MULTI-MIC PICKER",
      "Cycles 1 mic, 2+ simultaneous mics with automatic best-SNR switching (great for placing a mic closer to someone), or System Audio Loopback for video calls.",
    ],
    btnDenoise: [
      "NEURAL NOISE SUPPRESSION",
      "Cycles: OFF (best when competing voices overpower your partner), GTCRN (fast 0.5 MB cafe/music cleaner), DPDF8 (deep music & dish suppressor), VOXLOCK (locks onto 1 voice after 3s, 1-on-1 mode only!).",
    ],
    btnSpk: [
      "SPEAKER LABELS [SPK 1..N]",
      "Color-codes who is talking around a group table using local WeSpeaker CAM++ voice embeddings. Click CLR to reset speaker profiles.",
    ],
    btnLlm: [
      "LOCAL LLM PHONETIC POLISH",
      "Runs Qwen2.5-1.5B on your RTX GPU after each sentence to fix phonetic mishearings using context + hotwords.txt. Strict <=30% edit guard prevents hallucinations.",
    ],
    btnFontDown: [
      "SHRINK CAPTION TEXT (Ctrl+-)",
      "Decreases HEARD caption font size (13px to 32px). Press Ctrl+0 to reset.",
    ],
    btnFontUp: [
      "ENLARGE CAPTION TEXT (Ctrl++)",
      "Increases HEARD caption font size up to 32px so captions stay readable across a table.",
    ],
    health: [
      "VISUAL AUDIO SIGNAL HEALTH",
      "Real-time voice-to-noise ratio (SNR dB) so you can see mic health without hearing: CLEAR (good), NOISY (denoising active), DROWNED (move mic closer), or TTS GATE (muted while your reply plays).",
    ],
    meter: [
      "24-BAND LIVE FREQUENCY SPECTRUM",
      "Real-time Goertzel audio spectrum from 85 Hz (rumble) to 7.2 kHz (consonants). Confirms your mic is live and capturing speech.",
    ],
    btnVoice: [
      "OUTBOUND TTS VOICE PICKER",
      "Choose which neural voice speaks aloud when you type a reply and press Enter (uses your browser's Speech Synthesis voices in this web replica).",
    ],
    btnTest: [
      "AUDITION ALL VOICES (FOR LISTENERS)",
      "Speaks a sample sentence aloud through available voices one-by-one so a hearing person nearby can help pick the clearest voice for you. Press ESC or click STOP to cancel.",
    ],
    btnRate: [
      "SPEAKING SPEED",
      "Cycles outbound TTS voice speed between 0.8x (slower/clearer), 1.0x (normal), 1.25x, and 1.5x.",
    ],
    btnPin: [
      "ALWAYS ON TOP (Ctrl+T)",
      "In the native Rust desktop app, pins Speech Bridge above all other windows so captions stay visible during calls or multitasking.",
    ],
    btnExp: [
      "EXPORT CONVERSATION TRANSCRIPT",
      "Downloads a timestamped .txt transcript of both HEARD captions (with [SPK] labels) and your OUTBOUND replies.",
    ],
    btnClr: [
      "CLEAR SESSION & RESET SPEAKERS",
      "Clears both panes and resets speaker ID clusters + conversation context.",
    ],
    btnSpeak: [
      "SPEAK REPLY ALOUD (Enter)",
      "Speaks your typed text aloud while automatically activating TTS GATE (MUTED) so your own speakers never echo back into HEARD.",
    ],
    btnReplay: [
      "REPLAY STREAMING SIMULATION",
      "Re-runs the active noisy-room scenario word-by-word so you can compare how different engines, denoisers, and LLM polish behave in real time.",
    ],
  };

  // =========================================================================
  // 3. Interactive Replica State & Realistic Scenario Transcripts
  // =========================================================================
  const ENGINES = [
    { id: "parakeet", btn: "ENG: PARAKEET ▾", status: "Parakeet TDT 0.6B FP16/CUDA", acc: "on-green" },
    { id: "distil", btn: "ENG: DISTIL-W ▾", status: "Distil-Whisper Large-v3.5 CUDA", acc: "on-cyan" },
    { id: "win11", btn: "ENG: WIN11 ▾", status: "Win11 Live Captions (CPU)", acc: "on-amber" },
    { id: "legacy", btn: "ENG: BASE-CPU ▾", status: "Legacy Whisper base.en CPU", acc: "" },
  ];
  const DENOISERS = [
    { id: "gtcrn", btn: "DNS: GTCRN", acc: "on-cyan" },
    { id: "dpdf8", btn: "DNS: DPDF8", acc: "on-green" },
    { id: "voxlock", btn: "DNS: VOXLOCK", acc: "on-amber" },
    { id: "off", btn: "DNS: OFF", acc: "" },
  ];
  const MICS = [
    { btn: "MIC: 1 ▾", name: "Built-in Array", multi: false, acc: "on-green" },
    { btn: "MICS:2 ▾", name: "USB Table Mic", multi: true, acc: "on-green" },
    { btn: "SRC: SYS ▾", name: "System Loopback", multi: false, acc: "on-cyan" },
  ];
  const RATES = [0.8, 1.0, 1.25, 1.5];

  const SCENARIOS = {
    cafe_babble: {
      snrLabel: "DROWNED (-5dB)",
      healthCls: "drowned",
      noiseLevel: 0.72,
      turns: [
        {
          spk: 1,
          legacy: "Hey can I get a nice boat milk lot they and to blue berry... actually make that... patio.",
          win11: "Hey can I get a iced oat late and two berry muffins? Jordan is joining in fifteen.",
          distil: "Hey, can I get an iced oat milk latte and two blueberry muffins? Actually make that three because Jordan is joining us in 15 minutes near the patio.",
          parakeetRaw: "Hey, can I get an iced oat milk lotte and two blueberry muffins? Actually, make that three muffins because Jordan is joining us in 15 minutes near the back patio.",
          parakeetLlm: "Hey, can I get an iced oat milk latte and two blueberry muffins? Actually, make that three muffins because Jordan is joining us in 15 minutes near the back patio.",
        },
        {
          spk: 1,
          legacy: "Do you want me to grab a table outside or... [inaudible]",
          win11: "Do you want to grab a table outside or stay by the window?",
          distil: "Do you want me to grab a table outside or stay near the window?",
          parakeetRaw: "Do you want me to grab a table outside or stay near the window?",
          parakeetLlm: "Do you want me to grab a table outside or stay near the window?",
        },
      ],
    },
    restaurant: {
      snrLabel: "NOISY (+0dB)",
      healthCls: "noisy",
      noiseLevel: 0.48,
      turns: [
        {
          spk: 1,
          legacy: "Did everyone get a chance to check the train... for tomorrow morning?",
          win11: "Did everyone check the train schedule tomorrow morning?",
          distil: "Did everyone get a chance to check the train schedule for tomorrow morning?",
          parakeetRaw: "Did everyone get a chance to check the train schedule for tomorrow morning?",
          parakeetLlm: "Did everyone get a chance to check the train schedule for tomorrow morning?",
        },
        {
          spk: 2,
          legacy: "Yeah the express leaves at eight four five platform seven so meet outside by eight twenty.",
          win11: "Yeah the express leaves at 8:45 platform 7, meet outside by 8:20.",
          distil: "Yeah, the express leaves at 8:45 from platform 7, so we should meet outside the station by 8:20.",
          parakeetRaw: "Yeah, the express leaves at 8:45 from platform 7, so we should meet outside the station by 8:20.",
          parakeetLlm: "Yeah, the express leaves at 8:45 from platform 7, so we should meet outside the station by 8:20.",
        },
      ],
    },
    group: {
      snrLabel: "NOISY (+5dB)",
      healthCls: "noisy",
      noiseLevel: 0.36,
      turns: [
        {
          spk: 1,
          legacy: "Did everyone check the train schedule for tomorrow morning?",
          win11: "Did everyone get a chance to check the train schedule for tomorrow morning?",
          distil: "Did everyone get a chance to check the train schedule for tomorrow morning?",
          parakeetRaw: "Did everyone get a chance to check the train schedule for tomorrow morning?",
          parakeetLlm: "Did everyone get a chance to check the train schedule for tomorrow morning?",
        },
        {
          spk: 2,
          legacy: "Yeah express leaves eight forty five platform seven meet outside station.",
          win11: "Yeah, the express leaves at 8:45 from platform 7 so meet outside by 8:20.",
          distil: "Yeah, the express leaves at 8:45 from platform 7, so we should meet outside the station by 8:20.",
          parakeetRaw: "Yeah, the express leaves at 8:45 from platform 7, so we should meet outside the station by 8:20.",
          parakeetLlm: "Yeah, the express leaves at 8:45 from platform 7, so we should meet outside the station by 8:20.",
        },
        {
          spk: 3,
          legacy: "Sounds good I'll grab coffee for the table before we head over.",
          win11: "Sounds good to me. I'll grab coffee for the table before we head over.",
          distil: "Sounds good to me. I will grab coffee for the table before we head over.",
          parakeetRaw: "Sounds good to me. I will grab coffee from Cottage Grov before we head over.",
          parakeetLlm: "Sounds good to me. I will grab coffee from Cottage Grove before we head over.",
        },
        {
          spk: 1,
          legacy: "Perfect text me if traffic slows you on the bridge.",
          win11: "Perfect, text me if traffic slows you down on the bridge.",
          distil: "Perfect, text me if traffic slows you down on the bridge.",
          parakeetRaw: "Perfect, text me if traffic slows you down on the bridge.",
          parakeetLlm: "Perfect, text me if traffic slows you down on the bridge.",
        },
      ],
    },
    quiet: {
      snrLabel: "CLEAR (+18dB)",
      healthCls: "clear",
      noiseLevel: 0.12,
      turns: [
        {
          spk: 1,
          legacy: "Hey can I get an iced oat milk latte and two blueberry muffins? Actually make that three.",
          win11: "Hey, can I get an iced oat milk latte and two blueberry muffins? Actually make that three muffins.",
          distil: "Hey, can I get an iced oat milk latte and two blueberry muffins? Actually, make that three muffins because Jordan is joining us in 15 minutes near the back patio.",
          parakeetRaw: "Hey, can I get an iced oat milk latte and two blueberry muffins? Actually, make that three muffins because Jordan is joining us in 15 minutes near the back patio.",
          parakeetLlm: "Hey, can I get an iced oat milk latte and two blueberry muffins? Actually, make that three muffins because Jordan is joining us in 15 minutes near the back patio.",
        },
      ],
    },
  };

  const state = {
    armed: true,
    engIdx: 0,
    dnsIdx: 0,
    micIdx: 0,
    spkOn: true,
    llmOn: true,
    fontPx: 17,
    rateIdx: 1,
    pinned: false,
    scenario: "cafe_babble",
    ttsMuted: false,
    testingVoices: false,
    liveMicActive: false,
    recognition: null,
    voices: [],
    voiceIdx: 0,
    heard: [],
    replies: [{ time: nowHms(), text: "Testing, do you understand me?" }],
    streamTimer: null,
    speakingCardIdx: -1,
    speakingWordIdx: -1,
    ttsWordTimer: null,
    ttsBoundarySeen: false,
  };

  // DOM refs
  const $ = (id) => document.getElementById(id);
  const elHeard = $("rHeardFeed");
  const elReply = $("rReplyFeed");
  const elStatus = $("rStatus");
  const elHealth = $("rHealth");
  const elLeftHdr = $("rLeftHdr");
  const elReplyInput = $("replyInput");
  const tooltip = $("cyberTooltip");
  const ttTitle = $("ttTitle");
  const ttDesc = $("ttDesc");

  function nowHms() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  }

  // =========================================================================
  // 4. Floating Cyber Tooltip System (every control!)
  // =========================================================================
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mouseenter", (e) => {
      const pair = TOOLTIPS[el.dataset.tip];
      if (!pair) return;
      ttTitle.textContent = pair[0];
      ttDesc.textContent = pair[1];
      tooltip.style.display = "block";
      tooltip.setAttribute("aria-hidden", "false");
      moveTip(e);
    });
    el.addEventListener("mousemove", moveTip);
    el.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
      tooltip.setAttribute("aria-hidden", "true");
    });
  });

  function moveTip(e) {
    const pad = 12;
    const rect = tooltip.getBoundingClientRect();
    let x = e.clientX + 14;
    let y = e.clientY + 18;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - pad - rect.width;
    if (y + rect.height > window.innerHeight - pad) y = e.clientY - rect.height - 12;
    tooltip.style.left = Math.max(pad, x) + "px";
    tooltip.style.top = Math.max(pad, y) + "px";
  }

  // =========================================================================
  // 5. Render Replica Controls, Cards & Live Telemetry
  // =========================================================================
  function syncControls() {
    const eng = ENGINES[state.engIdx];
    const dns = DENOISERS[state.dnsIdx];
    const mic = MICS[state.micIdx];

    $("rRxDot").className = "rx-dot" + (state.armed ? "" : " off");
    $("rRxTxt").textContent = state.armed ? "RX: ARMED" : "RX: OFF";
    $("rBtnMic").className = "cyber-btn" + (state.armed ? " on-green" : " on-red");
    elHeard.className = "feed-box" + (state.armed ? " armed" : "");

    $("rBtnEngine").textContent = eng.btn;
    $("rBtnEngine").className = "cyber-btn " + eng.acc;

    $("rBtnInput").textContent = mic.btn;
    $("rBtnInput").className = "cyber-btn " + mic.acc;

    $("rBtnDenoise").textContent = dns.btn;
    $("rBtnDenoise").className = "cyber-btn " + dns.acc;

    $("rBtnSpk").textContent = state.spkOn ? "SPK: ON" : "SPK:OFF";
    $("rBtnSpk").className = "cyber-btn" + (state.spkOn ? " on-violet" : "");

    $("rBtnLlm").textContent = state.llmOn ? "LLM: ON" : "LLM:OFF";
    $("rBtnLlm").className = "cyber-btn" + (state.llmOn ? " on-sky" : "");

    $("rBtnRate").textContent = RATES[state.rateIdx] + "x";
    $("rBtnRate").className = "cyber-btn" + (state.rateIdx !== 1 ? " on-cyan" : "");

    $("rBtnPin").textContent = state.pinned ? "PIN*" : "PIN";
    $("rBtnPin").className = "cyber-btn" + (state.pinned ? " on-green" : "");

    $("rBtnTest").textContent = state.testingVoices ? "STOP" : "TEST";
    $("rBtnTest").className = "cyber-btn" + (state.testingVoices ? " on-red" : "");

    const vName = state.voices[state.voiceIdx]
      ? state.voices[state.voiceIdx].name.replace(/^Microsoft\s+/, "").slice(0, 14)
      : "Neural Alan";
    $("rBtnVoice").textContent = `VOICE: ${vName} ▾`;

    elLeftHdr.textContent = `// INBOUND :: HEARD (${state.fontPx}px | CLICK CARD TO COPY | CTRL+/- ZOOM)`;

    // Health badge
    const sc = SCENARIOS[state.scenario];
    if (state.ttsMuted) {
      elHealth.textContent = "TTS GATE (MUTED)";
      elHealth.className = "health-pill tts";
    } else if (state.liveMicActive) {
      elHealth.textContent = "LIVE BROWSER MIC";
      elHealth.className = "health-pill clear";
    } else if (mic.multi) {
      elHealth.textContent = `CLEAR (+12dB) | ${mic.name}`;
      elHealth.className = "health-pill clear";
    } else {
      elHealth.textContent = `SIG: ${sc.snrLabel}`;
      elHealth.className = "health-pill " + sc.healthCls;
    }

    // Telemetry footer strip
    const snrKey =
      state.scenario === "quiet" ? "clean" :
      state.scenario === "group" ? "+5dB" :
      state.scenario === "restaurant" ? "0dB" : "-5dB";
    const row = pickBenchmarkRow(eng.id, dns.id);
    $("tConfig").textContent = `${eng.status} · ${dns.btn}${state.llmOn ? " + Qwen2.5-1.5B" : ""}`;
    const werVal = row.wer[snrKey];
    $("tWer").textContent = werVal.toFixed(1) + "%";
    $("tWer").className = werVal <= 10 ? "" : werVal <= 22 ? "warn" : "bad";
    $("tLat").textContent = row.firstMs + " ms";
    $("tInf").textContent = row.inferMs + " ms";
  }

  function pickBenchmarkRow(engId, dnsId) {
    if (engId === "legacy") return BENCHMARKS[0];
    if (engId === "distil") return BENCHMARKS[1];
    if (engId === "win11") return { wer: { clean: 12.0, "+10dB": 16.0, "+5dB": 19.0, "0dB": 28.0, "-5dB": 52.0 }, inferMs: 260, firstMs: 420 };
    if (dnsId === "gtcrn") return BENCHMARKS[3];
    if (dnsId === "dpdf8") return BENCHMARKS[4];
    if (dnsId === "voxlock") return BENCHMARKS[6];
    if (state.llmOn) return BENCHMARKS[5];
    return BENCHMARKS[2];
  }

  function renderHeard(stableHyp = "", draftHyp = "") {
    elHeard.innerHTML = "";
    for (const item of state.heard) {
      const card = document.createElement("div");
      const spkCls = state.spkOn && item.spk ? ` spk-${((item.spk - 1) % 3) + 1}` : "";
      card.className = "msg-card" + spkCls;
      const tag = state.spkOn && item.spk ? `[SPK ${item.spk}]` : "RX";
      const llmBadge = item.polished ? `<span class="llm-pill">[LLM]</span>` : "";
      card.innerHTML = `
        <div class="msg-meta">
          <span>[${item.time}]  ${tag}${llmBadge}</span>
          <span style="opacity:0.65">COPY</span>
        </div>
        <div class="msg-body" style="font-size:${state.fontPx}px"></div>
      `;
      card.querySelector(".msg-body").textContent = item.text;
      card.addEventListener("click", () => {
        navigator.clipboard?.writeText(item.text).catch(() => {});
        elStatus.textContent = ">> COPIED CAPTION TO CLIPBOARD";
      });
      elHeard.appendChild(card);
    }
    if (stableHyp || draftHyp) {
      const hyp = document.createElement("div");
      hyp.className = "hyp-card";
      hyp.style.fontSize = state.fontPx + "px";
      if (stableHyp) {
        const s = document.createElement("div");
        s.className = "hyp-stable";
        s.textContent = `>_ ${stableHyp}`;
        hyp.appendChild(s);
      }
      if (draftHyp) {
        const d = document.createElement("div");
        d.className = "hyp-draft";
        d.textContent = `~ ${draftHyp}`;
        hyp.appendChild(d);
      }
      elHeard.appendChild(hyp);
    }
    elHeard.scrollTop = elHeard.scrollHeight;
  }

  function renderReplies() {
    elReply.innerHTML = "";
    state.replies.forEach((item, idx) => {
      const card = document.createElement("div");
      const active = idx === state.speakingCardIdx;
      card.className = "msg-card reply" + (active ? " speaking" : "");
      card.dataset.cardIdx = String(idx);
      card.innerHTML = `
        <div class="msg-meta">
          <span>[#${String(idx + 1).padStart(2, "0")}] ${item.time}</span>
          <span>${active ? "▶ SPEAKING..." : "▶ RE-SPEAK"}</span>
        </div>
        <div class="msg-body"></div>
      `;
      const bodyEl = card.querySelector(".msg-body");
      let wIdx = 0;
      const tokens = item.text.split(/(\s+)/);
      for (const tok of tokens) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) {
          bodyEl.appendChild(document.createTextNode(tok));
        } else {
          const sp = document.createElement("span");
          sp.className = "tts-word" + (active && wIdx === state.speakingWordIdx ? " active" : "");
          sp.dataset.widx = String(wIdx);
          sp.textContent = tok;
          bodyEl.appendChild(sp);
          wIdx++;
        }
      }
      card.addEventListener("click", () => speakOut(item.text, idx));
      elReply.appendChild(card);
    });
    elReply.scrollTop = elReply.scrollHeight;
  }

  function setActiveTtsWord(wordIdx) {
    if (state.speakingWordIdx === wordIdx) return;
    state.speakingWordIdx = wordIdx;
    const card = elReply.querySelector(`.msg-card.reply[data-card-idx="${state.speakingCardIdx}"]`);
    if (!card) return;
    card.querySelectorAll(".tts-word.active").forEach((el) => el.classList.remove("active"));
    if (wordIdx >= 0) {
      const target = card.querySelector(`.tts-word[data-widx="${wordIdx}"]`);
      if (target) target.classList.add("active");
    }
  }

  // =========================================================================
  // 6. LocalAgreement-2 Simulated Streaming Playback
  // =========================================================================
  function stopStream() {
    if (state.streamTimer) {
      clearTimeout(state.streamTimer);
      state.streamTimer = null;
    }
  }

  function runScenarioStream() {
    stopStream();
    if (state.liveMicActive) return;
    state.heard = [];
    renderHeard();
    syncControls();
    if (!state.armed) return;

    const eng = ENGINES[state.engIdx];
    const dns = DENOISERS[state.dnsIdx];
    elStatus.textContent = `>> RX LIVE [${eng.status}]`;

    const turns = SCENARIOS[state.scenario].turns;
    let turnIdx = 0;

    function playTurn() {
      if (!state.armed || state.liveMicActive || turnIdx >= turns.length) return;
      const t = turns[turnIdx];

      // Demonstrate VoxLock's real-world 1-on-1 behavior on multi-speaker group tables!
      if (dns.id === "voxlock" && state.scenario === "group" && t.spk !== 1) {
        turnIdx++;
        state.streamTimer = setTimeout(playTurn, 380);
        return;
      }

      const rawText =
        eng.id === "legacy" ? t.legacy :
        eng.id === "win11" ? t.win11 :
        eng.id === "distil" ? t.distil :
        t.parakeetRaw;

      const words = rawText.split(" ");
      let cursor = 0;
      const cadence = eng.id === "legacy" ? 310 : 155;

      function step() {
        if (!state.armed || state.liveMicActive) return;
        if (state.ttsMuted) {
          state.streamTimer = setTimeout(step, 200);
          return;
        }
        cursor = Math.min(words.length, cursor + (eng.id === "legacy" ? 2 : 3));
        const lockedCount = Math.max(0, cursor - 2);
        const stable = words.slice(0, lockedCount).join(" ");
        const draft = words.slice(lockedCount, cursor).join(" ");
        renderHeard(stable, draft);

        if (cursor < words.length) {
          state.streamTimer = setTimeout(step, cadence);
        } else {
          state.streamTimer = setTimeout(() => {
            const cardObj = {
              time: nowHms(),
              spk: t.spk,
              text: rawText,
              polished: false,
            };
            state.heard.push(cardObj);
            renderHeard();

            // Simulate async Qwen2.5-1.5B CUDA phonetic polish ~180ms after commit
            if (state.llmOn && eng.id === "parakeet" && t.parakeetLlm !== rawText) {
              setTimeout(() => {
                cardObj.text = t.parakeetLlm;
                cardObj.polished = true;
                renderHeard();
              }, 240);
            }

            turnIdx++;
            state.streamTimer = setTimeout(playTurn, 520);
          }, 320);
        }
      }
      step();
    }
    playTurn();
  }

  // =========================================================================
  // 7. Browser TTS + Auto TTS Echo Gate Simulation
  // =========================================================================
  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    const all = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    state.voices = all.length ? all : window.speechSynthesis.getVoices();
    syncControls();
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function stopTtsWordTimer() {
    if (state.ttsWordTimer) {
      clearTimeout(state.ttsWordTimer);
      state.ttsWordTimer = null;
    }
  }

  function computeWordSpans(text) {
    const spans = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
    return spans;
  }

  function speakOut(text, cardIdx) {
    stopTtsWordTimer();
    state.testingVoices = false;
    state.speakingCardIdx = cardIdx;
    state.speakingWordIdx = 0;
    state.ttsBoundarySeen = false;
    state.ttsMuted = true;
    elStatus.textContent = ">> TX AUDIO (STT AUTO-GATED)...";
    syncControls();
    renderReplies();

    const spans = computeWordSpans(text);
    const rate = RATES[state.rateIdx];

    function startFallbackTimer() {
      let idx = 0;
      function stepWord() {
        if (state.ttsBoundarySeen || state.speakingCardIdx !== cardIdx || idx >= spans.length) return;
        setActiveTtsWord(idx);
        const w = spans[idx].text;
        const alpha = w.replace(/[^a-zA-Z0-9]/g, "").length;
        let ms = ((alpha * 48 + 145) / rate);
        if (/[,;:]$/.test(w)) ms += 160 / rate;
        if (/[.!?]$/.test(w)) ms += 260 / rate;
        idx++;
        if (idx < spans.length) {
          state.ttsWordTimer = setTimeout(stepWord, Math.max(95, Math.round(ms)));
        }
      }
      stepWord();
    }

    if (!("speechSynthesis" in window)) {
      startFallbackTimer();
      const approxTotal = Math.max(1200, Math.round((spans.length * 360) / rate));
      setTimeout(finishSpeak, approxTotal);
      return;
    }

    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (state.voices[state.voiceIdx]) utt.voice = state.voices[state.voiceIdx];
    utt.rate = rate;
    utt.onstart = () => {
      setActiveTtsWord(0);
      startFallbackTimer();
    };
    utt.onboundary = (ev) => {
      if (state.speakingCardIdx !== cardIdx) return;
      if (typeof ev.charIndex === "number") {
        state.ttsBoundarySeen = true;
        stopTtsWordTimer();
        let found = -1;
        for (let i = 0; i < spans.length; i++) {
          if (ev.charIndex >= spans[i].start && ev.charIndex < spans[i].end) {
            found = i;
            break;
          }
          if (ev.charIndex >= spans[i].start) found = i;
        }
        if (found >= 0) setActiveTtsWord(found);
      }
    };
    utt.onend = () => {
      stopTtsWordTimer();
      setTimeout(finishSpeak, 320);
    };
    utt.onerror = finishSpeak;
    window.speechSynthesis.speak(utt);
  }

  function finishSpeak() {
    stopTtsWordTimer();
    state.ttsMuted = false;
    state.speakingCardIdx = -1;
    state.speakingWordIdx = -1;
    elStatus.textContent = state.armed
      ? `>> RX LIVE [${ENGINES[state.engIdx].status}]`
      : ">> STANDBY";
    syncControls();
    renderReplies();
  }

  function auditionVoices() {
    if (!("speechSynthesis" in window)) return;
    if (state.testingVoices) {
      window.speechSynthesis.cancel();
      state.testingVoices = false;
      finishSpeak();
      return;
    }
    const sample = elReplyInput.value.trim() || "Testing voice clarity for Speech Bridge.";
    const list = state.voices.slice(0, 4);
    if (!list.length) return;
    state.testingVoices = true;
    state.ttsMuted = true;
    syncControls();

    let idx = 0;
    function nextVoice() {
      if (!state.testingVoices || idx >= list.length) {
        state.testingVoices = false;
        finishSpeak();
        return;
      }
      const v = list[idx];
      elStatus.textContent = `>> AUDITION [${idx + 1}/${list.length}]: ${v.name}`;
      const u = new SpeechSynthesisUtterance(sample);
      u.voice = v;
      u.rate = RATES[state.rateIdx];
      u.onend = () => { idx++; setTimeout(nextVoice, 250); };
      u.onerror = () => { idx++; nextVoice(); };
      window.speechSynthesis.speak(u);
    }
    window.speechSynthesis.cancel();
    nextVoice();
  }

  // =========================================================================
  // 8. Optional Real Browser Mic Mode (Web Speech API)
  // =========================================================================
  function toggleLiveMic() {
    const btn = $("btnLiveMic");
    if (state.liveMicActive) {
      state.liveMicActive = false;
      btn.classList.remove("active");
      btn.textContent = "● Try Your Real Mic";
      try { state.recognition?.stop(); } catch {}
      runScenarioStream();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      elStatus.textContent = "!! Web Speech API not supported in this browser (try Chrome/Edge)";
      return;
    }
    stopStream();
    state.liveMicActive = true;
    state.armed = true;
    btn.classList.add("active");
    btn.textContent = "■ Stop Live Mic";
    state.heard = [];
    renderHeard("", "listening to your real microphone...");
    syncControls();

    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const txt = res[0].transcript.trim();
        if (res.isFinal && txt) {
          state.heard.push({ time: nowHms(), spk: 1, text: txt, polished: false });
        } else {
          interim += txt + " ";
        }
      }
      renderHeard("", interim.trim());
    };
    rec.onerror = (ev) => {
      elStatus.textContent = `!! Mic error: ${ev.error}`;
    };
    rec.onend = () => {
      if (state.liveMicActive) {
        try { rec.start(); } catch {}
      }
    };
    state.recognition = rec;
    try { rec.start(); } catch {}
    elStatus.textContent = ">> RX LIVE [Browser Web Speech API Mic]";
  }

  // =========================================================================
  // 9. Animated 24-Band Cyber Frequency Spectrum
  // =========================================================================
  const canvas = $("spectrumCanvas");
  const ctx = canvas.getContext("2d");
  const bands = new Array(24).fill(0.05);
  let phase = 0;

  function drawSpectrum() {
    phase += 0.14;
    ctx.fillStyle = "#0a0f14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sc = SCENARIOS[state.scenario];
    const baseEnergy = !state.armed ? 0.03 : state.ttsMuted ? 0.08 : sc.noiseLevel;
    let peak = 0;

    for (let i = 0; i < 24; i++) {
      const voiceBell = Math.exp(-Math.pow((i - 9) / 5.5, 2));
      const target = Math.min(
        0.96,
        baseEnergy * (0.35 + 0.45 * Math.abs(Math.sin(phase * 0.7 + i * 0.55))) +
          (state.armed && !state.ttsMuted ? voiceBell * (0.28 + 0.42 * Math.abs(Math.sin(phase * 1.4 + i * 0.3))) : 0)
      );
      bands[i] = target > bands[i] ? target : bands[i] * 0.78 + target * 0.22;
      peak = Math.max(peak, bands[i]);

      const x = 2 + i * 5.4;
      const h = Math.max(2, Math.round(bands[i] * (canvas.height - 4)));
      ctx.fillStyle = "#1b2834";
      ctx.fillRect(x, 2, 4, canvas.height - 4);

      ctx.fillStyle =
        bands[i] > 0.85 ? "#ff3b5c" :
        bands[i] > 0.65 ? "#ffb833" :
        bands[i] > 0.35 ? "#00d4ff" : "#00ff88";
      ctx.fillRect(x, canvas.height - 2 - h, 4, h);
    }

    $("rMeterPct").textContent = `${Math.round(peak * 100)}%`;
    requestAnimationFrame(drawSpectrum);
  }

  // =========================================================================
  // 10. Wire All Replica Controls & Keyboard Shortcuts
  // =========================================================================
  $("rBtnMic").addEventListener("click", () => {
    state.armed = !state.armed;
    if (!state.armed) {
      stopStream();
      elStatus.textContent = ">> STANDBY";
      renderHeard();
    } else {
      runScenarioStream();
    }
    syncControls();
  });
  $("rBtnEngine").addEventListener("click", () => {
    state.engIdx = (state.engIdx + 1) % ENGINES.length;
    runScenarioStream();
  });
  $("rBtnInput").addEventListener("click", () => {
    state.micIdx = (state.micIdx + 1) % MICS.length;
    elStatus.textContent = `>> INPUT: ${MICS[state.micIdx].name}`;
    syncControls();
  });
  $("rBtnDenoise").addEventListener("click", () => {
    state.dnsIdx = (state.dnsIdx + 1) % DENOISERS.length;
    runScenarioStream();
  });
  $("rBtnSpk").addEventListener("click", () => {
    state.spkOn = !state.spkOn;
    syncControls();
    renderHeard();
  });
  $("rBtnLlm").addEventListener("click", () => {
    state.llmOn = !state.llmOn;
    runScenarioStream();
  });
  $("rBtnFontDown").addEventListener("click", () => {
    state.fontPx = Math.max(13, state.fontPx - 2);
    syncControls();
    renderHeard();
  });
  $("rBtnFontUp").addEventListener("click", () => {
    state.fontPx = Math.min(32, state.fontPx + 2);
    syncControls();
    renderHeard();
  });
  $("rBtnVoice").addEventListener("click", () => {
    if (state.voices.length) state.voiceIdx = (state.voiceIdx + 1) % state.voices.length;
    syncControls();
  });
  $("rBtnTest").addEventListener("click", auditionVoices);
  $("rBtnRate").addEventListener("click", () => {
    state.rateIdx = (state.rateIdx + 1) % RATES.length;
    syncControls();
  });
  $("rBtnPin").addEventListener("click", () => {
    state.pinned = !state.pinned;
    elStatus.textContent = state.pinned ? ">> PINNED ON TOP (DESKTOP FEATURE)" : ">> UNPINNED";
    syncControls();
  });
  $("rBtnClr").addEventListener("click", () => {
    state.heard = [];
    state.replies = [];
    elStatus.textContent = ">> CLEARED (SPEAKERS RESET)";
    renderHeard();
    renderReplies();
  });
  $("rBtnExp").addEventListener("click", () => {
    const lines = [
      "=== SPEECH_BRIDGE TRANSCRIPT ===",
      "\n[INBOUND :: HEARD]",
      ...state.heard.map((h) => `[${h.time}] ${h.spk ? `[SPK ${h.spk}] ` : ""}${h.text}`),
      "\n[OUTBOUND :: REPLIES]",
      ...state.replies.map((r) => `[${r.time}] ${r.text}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "speech_bridge_demo_transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
    elStatus.textContent = ">> EXPORTED TRANSCRIPT (.txt)";
  });

  function submitReply() {
    const txt = elReplyInput.value.trim();
    if (!txt) return;
    state.replies.push({ time: nowHms(), text: txt });
    elReplyInput.value = "";
    renderReplies();
    speakOut(txt, state.replies.length - 1);
  }
  $("rBtnSpeak").addEventListener("click", submitReply);
  elReplyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitReply();
    } else if (e.key === "Escape") {
      window.speechSynthesis?.cancel();
      state.testingVoices = false;
      finishSpeak();
    }
  });
  $("rReplayBtn").addEventListener("click", runScenarioStream);
  $("btnLiveMic").addEventListener("click", toggleLiveMic);

  document.querySelectorAll(".scen-btn[data-scen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.liveMicActive) toggleLiveMic();
      document.querySelectorAll(".scen-btn[data-scen]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.scenario = btn.dataset.scen;
      runScenarioStream();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      state.fontPx = Math.min(32, state.fontPx + 2);
      syncControls();
      renderHeard();
    } else if (e.ctrlKey && e.key === "-") {
      e.preventDefault();
      state.fontPx = Math.max(13, state.fontPx - 2);
      syncControls();
      renderHeard();
    } else if (e.ctrlKey && e.key === "0") {
      e.preventDefault();
      state.fontPx = 17;
      syncControls();
      renderHeard();
    }
  });

  // =========================================================================
  // 11. Interactive Benchmark Charts & Full Comparison Table
  // =========================================================================
  function renderBenchChart(snrKey) {
    $("chartTitle").textContent = `Word Error Rate (WER %) at ${snrKey === "clean" ? "Clean Room" : snrKey + " SNR"} (Lower Is Better)`;
    const container = $("werChartBars");
    container.innerHTML = "";
    const maxWer = Math.max(30, ...BENCHMARKS.map((b) => b.wer[snrKey]));

    const sorted = [...BENCHMARKS].sort((a, b) => a.wer[snrKey] - b.wer[snrKey]);
    for (const row of sorted) {
      const val = row.wer[snrKey];
      const pct = Math.max(2, (val / maxWer) * 100);
      const div = document.createElement("div");
      div.className = "bar-row";
      div.innerHTML = `
        <div class="bar-name">${row.name}</div>
        <div class="bar-track"><div class="bar-fill ${row.cls}" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="bar-val">${val.toFixed(1)}%</div>
      `;
      container.appendChild(div);
    }
  }

  function renderBenchTable() {
    const tbody = $("benchTableBody");
    tbody.innerHTML = "";
    const cols = ["clean", "+10dB", "+5dB", "0dB", "-5dB"];
    const bestPerCol = {};
    for (const c of cols) {
      bestPerCol[c] = Math.min(...BENCHMARKS.map((b) => b.wer[c]));
    }
    for (const row of BENCHMARKS) {
      const tr = document.createElement("tr");
      const cells = cols
        .map((c) => {
          const v = row.wer[c];
          const cls = v === bestPerCol[c] ? "best" : v >= 35 ? "bad" : "";
          return `<td class="${cls}">${v.toFixed(1)}%</td>`;
        })
        .join("");
      tr.innerHTML = `
        <td>${row.name}</td>
        ${cells}
        <td class="${row.inferMs <= 250 ? "best" : row.inferMs >= 800 ? "bad" : ""}">${row.inferMs} ms</td>
        <td>${row.firstMs} ms</td>
      `;
      tbody.appendChild(tr);
    }
  }

  document.querySelectorAll(".bench-controls [data-snr]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bench-controls [data-snr]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderBenchChart(btn.dataset.snr);
    });
  });

  // Boot
  renderReplies();
  renderBenchChart("0dB");
  renderBenchTable();
  runScenarioStream();
  drawSpectrum();
})();
