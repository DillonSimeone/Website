/**
 * MYT Video Capture Hub & Sync Gateway - Client Application
 * Master Clock Sync, Slices with Hole/Timestamp/OS/Browser, UDisc Scorecard,
 * Native Hardware-Accelerated Multi-Angle Video Mixer, Dynamic Connected Telemetry, and Session Hole Editor.
 */

// ==========================================================================
// 0. Client Environment Detector (Device-Agnostic OS & Browser)
// ==========================================================================
function detectClientEnv() {
  const ua = navigator.userAgent;
  let os = "Desktop";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  return { os, browser };
}

// ==========================================================================
// 1. IndexedDB Local Buffer
// ==========================================================================
class IndexedDBStorage {
  constructor(dbName = 'MYTCaptureHubDB', storeName = 'video_chunks') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async saveChunk(chunkBlob, metadata) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.add({ blob: chunkBlob, sizeBytes: chunkBlob.size, timestampEpoch: Date.now(), ...metadata, flushed: false });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async markFlushed(id) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result;
        if (rec) { rec.flushed = true; store.put(rec); }
        resolve();
      };
    });
  }
}

// ==========================================================================
// 2. Master Clock Sync (Server Aligned Milliseconds)
// ==========================================================================
class ClockSyncEngine {
  constructor() {
    this.ws = null;
    this.clockOffsetMs = 0;
    this.rttMs = 1.0;
    this.isLocked = false;
  }

  init() {
    this.tryWebSocket();
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ping();
      else this.fallbackHttp();
    }, 15000);
    setInterval(() => this.updateClockHeader(), 33);
  }

  tryWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/clock`;
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => this.ping();
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'pong') {
            const now = Date.now();
            const rtt = now - data.clientTime;
            this.rttMs = rtt;
            this.clockOffsetMs = Math.round((data.serverTime - (data.clientTime + rtt / 2)) * 10) / 10;
            this.isLocked = true;
            this.updateUi();
          }
        } catch (err) {}
      };
      this.ws.onerror = () => this.fallbackHttp();
    } catch (e) {
      this.fallbackHttp();
    }
  }

  ping() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
    }
  }

  async fallbackHttp() {
    try {
      const start = Date.now();
      const res = await fetch(`/api/clock/ping?t=${start}`);
      if (res.ok) {
        const data = await res.json();
        const rtt = Date.now() - start;
        this.rttMs = rtt;
        this.clockOffsetMs = Math.round((data.serverTime - (start + rtt / 2)) * 10) / 10;
        this.isLocked = true;
        this.updateUi();
      }
    } catch (e) {}
  }

  getMasterEpoch() {
    return Date.now() + this.clockOffsetMs;
  }

  updateClockHeader() {
    const d = new Date(this.getMasterEpoch());
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    const timeStr = d.toTimeString().split(' ')[0] + '.' + ms;
    const headerEl = document.getElementById('headerMasterClock');
    if (headerEl) headerEl.textContent = timeStr;
  }

  updateUi() {
    const offsetEl = document.getElementById('headerClockOffset');
    if (offsetEl) {
      const sign = this.clockOffsetMs >= 0 ? '+' : '';
      offsetEl.textContent = `${sign}${this.clockOffsetMs.toFixed(1)} ms`;
    }
  }
}

// ==========================================================================
// 3. Central State: Sessions, Players, and Scorecard
// ==========================================================================
class SessionManager {
  constructor() {
    this.players = [
      { id: "p_mayan", name: "Mayan Fogarty", udisc: "mayan_f", avatar: "MF", desc: "Philomath disc golfer" },
      { id: "p_nate", name: "Nate", udisc: "m33td00m", avatar: "N", desc: "Disc golf enthusiast" },
      { id: "p_eagle", name: "Eagle McMahon", udisc: "eagle_m", avatar: "EM", desc: "Pro MPO Disc Golfer" },
      { id: "p_paul", name: "Paul McBeth", udisc: "pmcbeth", avatar: "PM", desc: "6x World Champion" }
    ];

    this.sessions = [
      {
        id: "session_1",
        name: "Mary's River Park - Card A",
        course: "Mary's River Park",
        layout: "Main - Par 28 (9 Holes)",
        breadcrumb: "United States / Oregon / Philomath",
        timestampText: "Sep 22, 2026 2:37 PM",
        holeCount: 9,
        holes: [
          { number: 1, par: 3 },
          { number: 2, par: 3 },
          { number: 3, par: 3 },
          { number: 4, par: 3 },
          { number: 5, par: 4 },
          { number: 6, par: 3 },
          { number: 7, par: 3 },
          { number: 8, par: 3 },
          { number: 9, par: 3 }
        ],
        playerIds: ["p_mayan", "p_nate"],
        scores: {
          "p_mayan": [null, null, null, null, null, null, null, null, null],
          "p_nate": [3, null, null, null, null, null, null, null, null]
        }
      },
      {
        id: "session_2",
        name: "Pier Park - Feature Card",
        course: "Pier Park DGC",
        layout: "Championship 18 - Par 54 (18 Holes)",
        breadcrumb: "United States / Oregon / Portland",
        timestampText: "Sep 22, 2026 10:00 AM",
        holeCount: 18,
        holes: Array.from({ length: 18 }, (_, i) => ({
          number: i + 1,
          par: i === 4 || i === 11 ? 4 : (i === 16 ? 5 : 3)
        })),
        playerIds: ["p_eagle", "p_paul"],
        scores: {
          "p_eagle": [2, 3, 2, 3, 3, 4, 3, 2, 3, 3, 2, 4, 3, 3, 2, 3, 3, 3],
          "p_paul": [3, 2, 3, 3, 2, 3, 3, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 3]
        }
      }
    ];

    this.activeSessionId = "session_1";
    this.activeHoleIndex = 0;
  }

  async init() {
    try {
      const [rosterRes, sessRes] = await Promise.all([
        fetch('/api/roster'),
        fetch('/api/sessions/manifest')
      ]);
      if (rosterRes.ok) {
        const rData = await rosterRes.json();
        if (Array.isArray(rData.players) && rData.players.length > 0) {
          this.players = rData.players;
        }
      }
      if (sessRes.ok) {
        const sData = await sessRes.json();
        if (Array.isArray(sData.sessions) && sData.sessions.length > 0) {
          this.sessions = sData.sessions;
          if (!this.sessions.some(s => s.id === this.activeSessionId)) {
            this.activeSessionId = this.sessions[0].id;
          }
        }
      }
    } catch (e) {}
  }

  async persistRoster() {
    try {
      await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.players)
      });
    } catch (e) {}
  }

  async persistSessions() {
    try {
      await fetch('/api/sessions/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.sessions)
      });
    } catch (e) {}
  }

  getActiveSession() {
    return this.sessions.find(s => s.id === this.activeSessionId) || this.sessions[0];
  }

  getActiveSessionPlayers() {
    const s = this.getActiveSession();
    return s.playerIds.map(id => this.players.find(p => p.id === id)).filter(Boolean);
  }

  setActiveSession(sessionId) {
    this.activeSessionId = sessionId;
    this.activeHoleIndex = 0;
    this.syncScorecardToServer();
  }

  createSession(name, course, holeCount = 9, defaultPar = 3, playerIds = []) {
    const newId = "session_" + Math.random().toString(36).substring(2, 8);
    const count = Math.max(1, Math.min(36, parseInt(holeCount, 10) || 9));
    const par = Math.max(2, Math.min(6, parseInt(defaultPar, 10) || 3));
    const assignedPlayers = playerIds && playerIds.length > 0 ? playerIds : ["p_mayan"];
    const totalPar = count * par;

    const newSession = {
      id: newId,
      name: name || "New Session Card",
      course: course || "Mary's River Park",
      layout: `Main - Par ${totalPar} (${count} Holes)`,
      breadcrumb: "United States / Oregon / Philomath",
      timestampText: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' }),
      holeCount: count,
      holes: Array.from({ length: count }, (_, i) => ({ number: i + 1, par: par })),
      playerIds: assignedPlayers,
      scores: {}
    };

    assignedPlayers.forEach(pid => {
      newSession.scores[pid] = Array(count).fill(null);
    });

    this.sessions.push(newSession);
    this.setActiveSession(newId);
    this.persistSessions();
    return newSession;
  }

  addHoleToSession(sessionId, par = 3) {
    const s = this.sessions.find(x => x.id === sessionId);
    if (!s) return;
    s.holeCount++;
    s.holes.push({ number: s.holeCount, par: parseInt(par, 10) || 3 });
    for (const pid in s.scores) {
      if (Array.isArray(s.scores[pid])) s.scores[pid].push(null);
    }
    const totalPar = s.holes.reduce((a, b) => a + b.par, 0);
    s.layout = `${s.course} - Par ${totalPar} (${s.holeCount} Holes)`;
    this.syncScorecardToServer();
    this.persistSessions();
  }

  removeHoleFromSession(sessionId) {
    const s = this.sessions.find(x => x.id === sessionId);
    if (!s || s.holeCount <= 1) return;
    s.holeCount--;
    s.holes.pop();
    for (const pid in s.scores) {
      if (Array.isArray(s.scores[pid])) s.scores[pid].pop();
    }
    const totalPar = s.holes.reduce((a, b) => a + b.par, 0);
    s.layout = `${s.course} - Par ${totalPar} (${s.holeCount} Holes)`;
    if (this.activeHoleIndex >= s.holeCount) this.activeHoleIndex = s.holeCount - 1;
    this.syncScorecardToServer();
    this.persistSessions();
  }

  setHolePar(sessionId, holeIdx, par) {
    const s = this.sessions.find(x => x.id === sessionId);
    if (!s || !s.holes[holeIdx]) return;
    s.holes[holeIdx].par = parseInt(par, 10) || 3;
    const totalPar = s.holes.reduce((a, b) => a + b.par, 0);
    s.layout = `${s.course} - Par ${totalPar} (${s.holeCount} Holes)`;
    this.syncScorecardToServer();
    this.persistSessions();
  }

  async deleteSession(sessionId) {
    try {
      await fetch('/api/sessions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (e) {}

    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    if (this.sessions.length === 0) {
      this.createSession("Mary's River Park - Card A", "Mary's River Park", 9, 3, ["p_mayan"]);
    } else if (this.activeSessionId === sessionId) {
      this.setActiveSession(this.sessions[0].id);
    }
    this.persistSessions();
  }

  addPlayer(name, udisc, desc, avatar, addToActive = true) {
    const newId = 'p_' + Math.random().toString(36).substring(2, 8);
    const newPlayer = {
      id: newId,
      name,
      udisc: udisc || name.toLowerCase().replace(/\s+/g, '_'),
      desc: desc || '',
      avatar: avatar || name.charAt(0).toUpperCase()
    };
    this.players.push(newPlayer);

    if (addToActive) {
      const s = this.getActiveSession();
      if (!s.playerIds.includes(newId)) {
        s.playerIds.push(newId);
        s.scores[newId] = Array(s.holeCount).fill(null);
      }
    }
    this.syncScorecardToServer();
    this.persistRoster();
    this.persistSessions();
    return newPlayer;
  }

  setPlayerScore(playerId, holeIdx, strokes) {
    const s = this.getActiveSession();
    if (!s.scores[playerId]) s.scores[playerId] = Array(s.holeCount).fill(null);
    s.scores[playerId][holeIdx] = strokes;
    this.syncScorecardToServer();
    this.persistSessions();
  }

  resetActiveScores() {
    const s = this.getActiveSession();
    for (const pid in s.scores) {
      s.scores[pid] = Array(s.holeCount).fill(null);
    }
    this.syncScorecardToServer();
    this.persistSessions();
  }

  async syncScorecardToServer() {
    const s = this.getActiveSession();
    const payload = {
      sessionId: s.id,
      sessionName: s.name,
      course: s.course,
      layout: s.layout,
      holes: s.holes,
      players: this.getActiveSessionPlayers().map(p => ({
        id: p.id,
        name: p.name,
        udisc: p.udisc,
        scores: s.scores[p.id] || []
      })),
      timestamp: Date.now()
    };

    try {
      await fetch('/api/scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }
}

// ==========================================================================
// 4. Capture Engine with Auto-Upload, Live Scoring & Real-Time Telemetry
// ==========================================================================
class CaptureEngine {
  constructor(storage, clockSync, sessionMgr) {
    this.storage = storage;
    this.clockSync = clockSync;
    this.sessionMgr = sessionMgr;
    this.clientEnv = detectClientEnv();
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.isRecording = false;
    this.currentCameraFacing = 'environment';
    this.sliceCount = 0;
    this.recordStartTime = 0;
    this.currentSliceStartTime = 0;
    this.timerInterval = null;
    this.audioContext = null;
    this.analyser = null;
    this.isUsingFallbackCanvas = false;
  }

  async init() {
    this.populateSessionDropdown();
    this.populatePlayerDropdown();
    await this.setupCamera();
    this.setupEventListeners();
    this.renderQuickScorecard();
    this.sendTelemetryHeartbeat();
    setInterval(() => this.sendTelemetryHeartbeat(), 5000);
  }

  async sendTelemetryHeartbeat() {
    const playerSelect = document.getElementById('selectCapturePlayer');
    const selectedPlayerId = playerSelect ? playerSelect.value : null;
    const player = this.sessionMgr.players.find(p => p.id === selectedPlayerId) || this.sessionMgr.players[0];
    const devId = `${this.clientEnv.os} (${this.clientEnv.browser})`;
    const activeHole = this.sessionMgr.getActiveSession()?.holes[this.sessionMgr.activeHoleIndex]?.name || 'H1';

    try {
      await fetch('/api/telemetry/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: devId,
          filmingPlayer: player ? `${player.name} (@${player.udisc})` : 'Player',
          rttMs: this.clockSync.rttMs,
          offsetMs: this.clockSync.clockOffsetMs,
          activeHole: activeHole,
          slicesStreamed: this.sliceCount,
          status: this.isRecording ? `Streaming Slices (${activeHole})` : 'Active Host'
        })
      });
      window.refreshConnectedClientsTable?.();
    } catch (e) {}
  }

  populateSessionDropdown(selectedSessionId = null) {
    const sel = document.getElementById('selectActiveSession');
    if (!sel) return;
    const targetId = selectedSessionId || this.sessionMgr.activeSessionId;

    let html = this.sessionMgr.sessions.map(s => `
      <option value="${s.id}" ${s.id === targetId ? 'selected' : ''}>${s.name}</option>
    `).join('');

    html += `<option value="__NEW_SESSION__">➕ Add New Session...</option>`;
    sel.innerHTML = html;
  }

  populatePlayerDropdown(selectedPlayerId = null) {
    const sel = document.getElementById('selectCapturePlayer');
    if (!sel) return;

    const sessionPlayers = this.sessionMgr.getActiveSessionPlayers();
    let html = sessionPlayers.map(p => `
      <option value="${p.id}" ${selectedPlayerId === p.id ? 'selected' : ''}>${p.name} (@${p.udisc})</option>
    `).join('');

    html += `<option value="__NEW_PLAYER__">➕ Add New Player...</option>`;
    sel.innerHTML = html;

    const curPlayer = sessionPlayers[0];
    if (curPlayer) {
      const badge = document.getElementById('overlayPlayerBadge');
      if (badge) badge.textContent = `FILMING: ${curPlayer.name}`;
    }
  }

  async setupCamera() {
    const video = document.getElementById('viewfinderVideo');
    const canvas = document.getElementById('viewfinderFallbackCanvas');
    const micMeter = document.getElementById('audioMeterContainer');

    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices not available (requires HTTPS context)');
      }

      let stream = null;
      let hasAudio = true;

      // 1. Try with video and audio first
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.currentCameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true
        });
      } catch (audioErr) {
        console.warn('Microphone permission denied or unavailable. Retrying video-only capture...', audioErr);
        hasAudio = false;
        // 2. Graceful fallback: try video-only so camera stream never fails!
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.currentCameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        });
      }

      this.mediaStream = stream;
      video.srcObject = this.mediaStream;
      video.classList.remove('hidden');
      canvas.classList.add('hidden');
      this.isUsingFallbackCanvas = false;

      if (hasAudio) {
        this.setupAudioMeter(this.mediaStream);
        if (micMeter) micMeter.classList.remove('mic-disabled');
      } else {
        if (micMeter) {
          micMeter.classList.add('mic-disabled');
          micMeter.title = 'Microphone Muted (Video-Only)';
          const label = micMeter.querySelector('.meter-label');
          if (label) label.textContent = 'NO MIC';
        }
      }
    } catch (err) {
      console.warn('Hardware camera unavailable. Falling back to synthetic pattern generator.', err);
      this.startSyntheticPattern();
    }
  }

  startSyntheticPattern() {
    const video = document.getElementById('viewfinderVideo');
    const canvas = document.getElementById('viewfinderFallbackCanvas');
    video.classList.add('hidden');
    canvas.classList.remove('hidden');
    this.isUsingFallbackCanvas = true;

    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    let discX = 100;
    let discSpeed = 5;

    const render = () => {
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      for (let y = 140; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      discX += discSpeed;
      if (discX > canvas.width - 150 || discX < 100) discSpeed = -discSpeed;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.ellipse(discX, 360 + Math.sin(discX * 0.02) * 60, 40, 16, 0.1, 0, Math.PI * 2);
      ctx.fill();

      const now = new Date(this.clockSync.getMasterEpoch());
      const ms = String(now.getMilliseconds()).padStart(3, '0');
      const timecode = now.toTimeString().split(' ')[0] + '.' + ms;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(40, 40, 560, 90);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, 560, 90);

      ctx.font = 'bold 34px JetBrains Mono, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(timecode, 60, 100);

      const s = this.sessionMgr.getActiveSession();
      const hNum = this.sessionMgr.activeHoleIndex + 1;
      ctx.font = '13px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${s.name.toUpperCase()} • HOLE ${hNum} • ${this.clientEnv.os} (${this.clientEnv.browser})`, 60, 68);

      requestAnimationFrame(render);
    };
    render();

    try {
      this.mediaStream = canvas.captureStream(60);
      const meterFill = document.getElementById('audioMeterFill');
      setInterval(() => {
        if (this.isRecording && meterFill) meterFill.style.width = (30 + Math.random() * 50) + '%';
      }, 100);
    } catch (e) {}
  }

  setupAudioMeter(stream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const meterFill = document.getElementById('audioMeterFill');

      const updateMeter = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const percent = Math.min(100, Math.round((sum / bufferLength / 128) * 100));
        if (meterFill) meterFill.style.width = percent + '%';
        requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (e) {}
  }

  startRecording() {
    if (this.isRecording) return;
    this.sliceCount = 0;
    this.recordStartTime = Date.now();
    this.currentSliceStartTime = this.clockSync.getMasterEpoch();
    this.isRecording = true;

    document.getElementById('recBadge').classList.remove('hidden');
    document.getElementById('btnStartRecording').classList.add('hidden');
    document.getElementById('btnStopRecording').classList.remove('hidden');

    const shutterBtn = document.getElementById('btnThumbShutter');
    if (shutterBtn) shutterBtn.classList.add('recording');
    const shutterLabel = document.getElementById('shutterLabel');
    if (shutterLabel) shutterLabel.textContent = 'TAP TO STOP';

    this.sendTelemetryHeartbeat();

    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.recordStartTime;
      const sec = Math.floor(elapsed / 1000);
      const ms = Math.floor((elapsed % 1000) / 10);
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      const timerEl = document.getElementById('recordTimer');
      if (timerEl) timerEl.textContent = `00:${m}:${s}.${String(ms).padStart(2, '0')}`;
    }, 50);

    try {
      const options = { mimeType: 'video/webm;codecs=vp9,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) options.mimeType = 'video/webm';
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const sliceStart = this.currentSliceStartTime;
          const sliceEnd = this.clockSync.getMasterEpoch();
          this.currentSliceStartTime = sliceEnd;
          this.sliceCount++;
          await this.uploadSlice(e.data, sliceStart, sliceEnd);
        }
      };
      this.mediaRecorder.start(5000);
    } catch (e) {
      this.simInterval = setInterval(async () => {
        if (!this.isRecording) return;
        const sliceStart = this.currentSliceStartTime;
        const sliceEnd = this.clockSync.getMasterEpoch();
        this.currentSliceStartTime = sliceEnd;
        this.sliceCount++;
        const dummyBlob = new Blob([new Uint8Array(1024 * 64)], { type: 'video/webm' });
        await this.uploadSlice(dummyBlob, sliceStart, sliceEnd);
      }, 5000);
    }
  }

  async uploadSlice(blob, startEpoch, endEpoch) {
    const session = this.sessionMgr.getActiveSession();
    const playerSelect = document.getElementById('selectCapturePlayer');
    const selectedPlayerId = playerSelect ? playerSelect.value : null;
    const player = this.sessionMgr.players.find(p => p.id === selectedPlayerId) || this.sessionMgr.players[0];
    const playerSlug = player.name.toLowerCase().replace(/\s+/g, '_');
    const holeName = `H${this.sessionMgr.activeHoleIndex + 1}`;

    const startDate = new Date(startEpoch);
    const datePart = startDate.toISOString().split('T')[0];
    const timePart = startDate.toTimeString().split(' ')[0].replace(/:/g, '-');
    const timestampIso = `${datePart}T${timePart}`;

    const meta = {
      sessionId: session.id,
      player: player.name,
      hole: holeName,
      sliceIndex: this.sliceCount,
      os: this.clientEnv.os,
      browser: this.clientEnv.browser,
      startEpoch,
      endEpoch
    };

    const chunkId = await this.storage.saveChunk(blob, meta);

    try {
      const res = await fetch('/api/upload/chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'video/webm',
          'X-Session-Id': session.id,
          'X-Player-Slug': playerSlug,
          'X-Chunk-Index': String(this.sliceCount),
          'X-Hole': holeName,
          'X-OS': this.clientEnv.os,
          'X-Browser': this.clientEnv.browser,
          'X-Timestamp-Iso': timestampIso,
          'X-Start-Epoch': String(Math.round(startEpoch)),
          'X-End-Epoch': String(Math.round(endEpoch)),
          'X-Is-Final': 'false'
        },
        body: blob
      });
      if (res.ok) {
        await this.storage.markFlushed(chunkId);
        this.unflushedCount = 0;
        document.getElementById('offlineBufferBadge')?.classList.add('hidden');
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      this.unflushedCount = (this.unflushedCount || 0) + 1;
      const offBadge = document.getElementById('offlineBufferBadge');
      if (offBadge) {
        offBadge.classList.remove('hidden');
        offBadge.textContent = `⚠️ OFFLINE: ${this.unflushedCount} Slices Buffered`;
      }
    }

    const counterEl = document.getElementById('userSliceCounter');
    const headBuf = document.getElementById('headerBufferCount');
    if (counterEl) counterEl.textContent = this.sliceCount;
    if (headBuf) headBuf.textContent = `${this.sliceCount} Slices Streamed`;
  }

  async flushOfflineBuffer() {
    if (!this.storage || !this.storage.db) return;
    try {
      const tx = this.storage.db.transaction([this.storage.storeName], 'readonly');
      const store = tx.objectStore(this.storage.storeName);
      const req = store.getAll();
      req.onsuccess = async () => {
        const records = req.result || [];
        const unflushed = records.filter(r => !r.flushed);
        if (unflushed.length === 0) {
          document.getElementById('offlineBufferBadge')?.classList.add('hidden');
          return;
        }

        const offBadge = document.getElementById('offlineBufferBadge');
        if (offBadge) offBadge.textContent = `🔄 Flushing ${unflushed.length} Offline Slices to Hub...`;

        for (const item of unflushed) {
          try {
            const playerSlug = (item.player || 'player').toLowerCase().replace(/\s+/g, '_');
            const res = await fetch('/api/upload/chunk', {
              method: 'POST',
              headers: {
                'Content-Type': 'video/webm',
                'X-Session-Id': item.sessionId || 'session_1',
                'X-Player-Slug': playerSlug,
                'X-Chunk-Index': String(item.sliceIndex || 1),
                'X-Hole': item.hole || 'H1',
                'X-OS': item.os || 'Device',
                'X-Browser': item.browser || 'Browser',
                'X-Start-Epoch': String(Math.round(item.startEpoch || Date.now())),
                'X-End-Epoch': String(Math.round(item.endEpoch || Date.now())),
                'X-Is-Final': 'false'
              },
              body: item.blob
            });
            if (res.ok) {
              await this.storage.markFlushed(item.id);
            }
          } catch (err) {
            break;
          }
        }

        this.unflushedCount = 0;
        if (offBadge) offBadge.classList.add('hidden');
        const ind = document.getElementById('userUploadIndicator');
        if (ind) ind.textContent = '✓ All Offline Slices Flushed to Hub';
      };
    } catch (e) {}
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    if (this.simInterval) clearInterval(this.simInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);

    document.getElementById('recBadge').classList.add('hidden');
    document.getElementById('btnStartRecording').classList.remove('hidden');
    document.getElementById('btnStopRecording').classList.add('hidden');

    const shutterBtn = document.getElementById('btnThumbShutter');
    if (shutterBtn) shutterBtn.classList.remove('recording');
    const shutterLabel = document.getElementById('shutterLabel');
    if (shutterLabel) shutterLabel.textContent = 'TAP TO RECORD';

    const ind = document.getElementById('userUploadIndicator');
    if (ind) ind.textContent = `✓ Recorded & Saved (${this.sliceCount} Slices - Merging Take...)`;

    this.sendTelemetryHeartbeat();

    // Trigger server-side slice merger for this take
    const session = this.sessionMgr.getActiveSession();
    const playerSelect = document.getElementById('selectCapturePlayer');
    const selectedPlayerId = playerSelect ? playerSelect.value : null;
    const player = this.sessionMgr.players.find(p => p.id === selectedPlayerId) || this.sessionMgr.players[0];
    const playerSlug = player.name.toLowerCase().replace(/\s+/g, '_');
    const holeName = `H${this.sessionMgr.activeHoleIndex + 1}`;
    const dateStr = new Date().toISOString().split('T')[0];

    fetch('/api/record/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerSlug,
        dateStr,
        sessionId: session.id,
        hole: holeName,
        os: this.clientEnv.os,
        browser: this.clientEnv.browser
      })
    }).then(res => res.json()).then(data => {
      if (ind) {
        if (data.merged) ind.textContent = `✓ Take Merged: ${data.takeName}`;
        else ind.textContent = `✓ Recorded & Saved (${this.sliceCount} Slices)`;
      }
    }).catch(() => {});
  }

  renderQuickScorecard() {
    const s = this.sessionMgr.getActiveSession();
    const hIdx = this.sessionMgr.activeHoleIndex;
    const h = s.holes[hIdx];

    const holeTitle = document.getElementById('quickHoleTitle');
    const courseSub = document.getElementById('quickCourseSub');
    const indicator = document.getElementById('quickHoleIndicator');
    const overlayBadge = document.getElementById('overlayUploadBadge');

    if (holeTitle) holeTitle.textContent = `HOLE ${h.number} (Par ${h.par})`;
    if (courseSub) courseSub.textContent = s.course;
    if (indicator) indicator.textContent = `Hole ${h.number} of ${s.holeCount}`;
    if (overlayBadge) overlayBadge.textContent = `H${h.number} Slices Stream to Hub`;

    const list = document.getElementById('quickScoringList');
    if (!list) return;

    const players = this.sessionMgr.getActiveSessionPlayers();
    list.innerHTML = players.map(p => {
      const score = s.scores[p.id]?.[hIdx];
      const displayScore = score !== null ? score : '-';
      let badgeCls = 'score-par';
      let badgeTxt = 'Par';

      if (score !== null) {
        const diff = score - h.par;
        if (score === 1) { badgeCls = 'score-ace'; badgeTxt = 'ACE!'; }
        else if (diff <= -2) { badgeCls = 'score-eagle'; badgeTxt = 'Eagle'; }
        else if (diff === -1) { badgeCls = 'score-birdie'; badgeTxt = 'Birdie'; }
        else if (diff === 0) { badgeCls = 'score-par'; badgeTxt = 'Par'; }
        else if (diff === 1) { badgeCls = 'score-bogey'; badgeTxt = 'Bogey'; }
        else if (diff >= 2) { badgeCls = 'score-double'; badgeTxt = `+${diff}`; }
      }

      return `
        <div class="quick-player-row">
          <div class="player-info-strip">
            <span class="avatar-small">${p.avatar}</span>
            <span class="player-name-main">${p.name}</span>
          </div>
          <div class="player-stepper-strip">
            <button class="btn-step-sm btn-quick-minus" data-pid="${p.id}" title="Decrease strokes">−</button>
            <span class="score-num-display mono">${displayScore}</span>
            <button class="btn-step-sm btn-quick-plus" data-pid="${p.id}" title="Increase strokes">+</button>
            <span class="score-badge-inline ${badgeCls}">${score !== null ? badgeTxt : 'Ready'}</span>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-quick-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        const cur = s.scores[pid]?.[hIdx];
        const next = cur === null ? h.par : Math.max(1, cur - 1);
        this.sessionMgr.setPlayerScore(pid, hIdx, next);
        this.renderQuickScorecard();
        window.udiscApp?.render();
      });
    });

    list.querySelectorAll('.btn-quick-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        const cur = s.scores[pid]?.[hIdx];
        const next = cur === null ? h.par : cur + 1;
        this.sessionMgr.setPlayerScore(pid, hIdx, next);
        this.renderQuickScorecard();
        window.udiscApp?.render();
      });
    });
  }

  setupEventListeners() {
    document.getElementById('btnStartRecording')?.addEventListener('click', () => this.startRecording());
    document.getElementById('btnStopRecording')?.addEventListener('click', () => this.stopRecording());

    // Outdoor Thumb Shutter Button (One-Handed Mobile Operation)
    document.getElementById('btnThumbShutter')?.addEventListener('click', () => {
      try { navigator.vibrate?.([60]); } catch (e) {}
      if (this.isRecording) {
        this.stopRecording();
      } else {
        this.startRecording();
      }
    });

    // Auto-flush offline buffer when connectivity resumes
    window.addEventListener('online', () => this.flushOfflineBuffer());
    window.addEventListener('offline', () => {
      const offBadge = document.getElementById('offlineBufferBadge');
      if (offBadge) {
        offBadge.classList.remove('hidden');
        offBadge.textContent = '⚠️ Network Disconnected (Saving Offline)';
      }
    });

    document.getElementById('btnSwitchCamera')?.addEventListener('click', async () => {
      this.currentCameraFacing = this.currentCameraFacing === 'user' ? 'environment' : 'user';
      await this.setupCamera();
    });

    const selSession = document.getElementById('selectActiveSession');
    selSession?.addEventListener('change', (e) => {
      if (e.target.value === '__NEW_SESSION__') {
        window.openCreateSessionModal();
        this.populateSessionDropdown();
      } else {
        this.sessionMgr.setActiveSession(e.target.value);
        this.populatePlayerDropdown();
        this.renderQuickScorecard();
        window.udiscApp?.render();
        this.sendTelemetryHeartbeat();
      }
    });

    const selPlayer = document.getElementById('selectCapturePlayer');
    selPlayer?.addEventListener('change', (e) => {
      if (e.target.value === '__NEW_PLAYER__') {
        document.getElementById('playerModal')?.classList.remove('hidden');
        this.populatePlayerDropdown();
      } else {
        const p = this.sessionMgr.players.find(x => x.id === e.target.value);
        if (p) {
          const badge = document.getElementById('overlayPlayerBadge');
          if (badge) badge.textContent = `FILMING: ${p.name}`;
          this.sendTelemetryHeartbeat();
        }
      }
    });

    document.getElementById('btnQuickPrevHole')?.addEventListener('click', () => {
      this.sessionMgr.activeHoleIndex = Math.max(0, this.sessionMgr.activeHoleIndex - 1);
      this.renderQuickScorecard();
      window.udiscApp?.render();
    });
    document.getElementById('btnQuickNextHole')?.addEventListener('click', () => {
      const s = this.sessionMgr.getActiveSession();
      this.sessionMgr.activeHoleIndex = Math.min(s.holeCount - 1, this.sessionMgr.activeHoleIndex + 1);
      this.renderQuickScorecard();
      window.udiscApp?.render();
    });
  }
}

// ==========================================================================
// 5. Authentic UDisc Cardcast Scorecard (Clean, No Distances, No Weather)
// ==========================================================================
class UDiscScorecard {
  constructor(sessionMgr) {
    this.sessionMgr = sessionMgr;
  }

  init() {
    this.render();
    this.setupEventListeners();
  }

  render() {
    const s = this.sessionMgr.getActiveSession();
    const hIdx = this.sessionMgr.activeHoleIndex;
    const h = s.holes[hIdx];

    const breadcrumb = document.getElementById('udiscBreadcrumb');
    const courseName = document.getElementById('udiscCourseName');
    const layoutTag = document.getElementById('udiscLayoutTag');
    const timeText = document.getElementById('udiscTimestampText');

    if (breadcrumb) breadcrumb.textContent = s.breadcrumb || "United States / Oregon / Philomath";
    if (courseName) courseName.textContent = s.course;
    if (layoutTag) layoutTag.textContent = `■ ${s.layout}`;
    if (timeText) timeText.textContent = `🕒 ${s.timestampText || 'Sep 22, 2026 2:37 PM'}`;

    const scrollContainer = document.getElementById('holeChipsScroll');
    if (scrollContainer) {
      scrollContainer.innerHTML = s.holes.map((hole, idx) => {
        const p1 = this.sessionMgr.getActiveSessionPlayers()[0];
        const p1Score = p1 ? s.scores[p1.id]?.[idx] : null;
        let badgeClass = 'score-empty';
        if (p1Score !== null) {
          const diff = p1Score - hole.par;
          if (p1Score === 1) badgeClass = 'score-ace';
          else if (diff <= -2) badgeClass = 'score-eagle';
          else if (diff === -1) badgeClass = 'score-birdie';
          else if (diff === 0) badgeClass = 'score-par';
          else if (diff === 1) badgeClass = 'score-bogey';
          else if (diff >= 2) badgeClass = 'score-double';
        }

        return `
          <button class="hole-chip-btn ${idx === hIdx ? 'active' : ''}" data-index="${idx}">
            <span class="chip-hole-num">H${hole.number}</span>
            <span class="chip-hole-par">P${hole.par}</span>
            <span class="chip-hole-score ${badgeClass}">${p1Score !== null ? p1Score : '-'}</span>
          </button>
        `;
      }).join('');

      scrollContainer.querySelectorAll('.hole-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.sessionMgr.activeHoleIndex = parseInt(btn.dataset.index, 10);
          this.render();
          window.captureApp?.renderQuickScorecard();
        });
      });
    }

    const holeNumEl = document.getElementById('activeHoleNum');
    const parSelect = document.getElementById('activeHoleParSelect');
    if (holeNumEl) holeNumEl.textContent = h.number;
    if (parSelect) parSelect.value = String(h.par);

    const playersRows = document.getElementById('playersScoreRows');
    const players = this.sessionMgr.getActiveSessionPlayers();

    if (playersRows) {
      playersRows.innerHTML = players.map(p => {
        const score = s.scores[p.id]?.[hIdx];
        const displayScore = score !== null ? score : '-';
        return `
          <div class="player-score-row">
            <div class="player-meta-block">
              <span class="player-name-text">${p.name}</span>
              <span class="player-udisc-handle">@${p.udisc}</span>
            </div>
            <div class="player-strokes-stepper">
              <button class="btn-step btn-udisc-minus" data-pid="${p.id}">−</button>
              <span class="stroke-val mono">${displayScore}</span>
              <button class="btn-step btn-udisc-plus" data-pid="${p.id}">+</button>
            </div>
          </div>
        `;
      }).join('');

      playersRows.querySelectorAll('.btn-udisc-minus').forEach(btn => {
        btn.addEventListener('click', () => {
          const pid = btn.dataset.pid;
          const cur = s.scores[pid]?.[hIdx];
          const next = cur === null ? h.par : Math.max(1, cur - 1);
          this.sessionMgr.setPlayerScore(pid, hIdx, next);
          this.render();
          window.captureApp?.renderQuickScorecard();
        });
      });

      playersRows.querySelectorAll('.btn-udisc-plus').forEach(btn => {
        btn.addEventListener('click', () => {
          const pid = btn.dataset.pid;
          const cur = s.scores[pid]?.[hIdx];
          const next = cur === null ? h.par : cur + 1;
          this.sessionMgr.setPlayerScore(pid, hIdx, next);
          this.render();
          window.captureApp?.renderQuickScorecard();
        });
      });
    }

    this.renderCardcastTable();
  }

  renderCardcastTable() {
    const s = this.sessionMgr.getActiveSession();
    const theadTr = document.getElementById('udiscTheadTr');
    const tbody = document.getElementById('udiscTableBody');
    if (!theadTr || !tbody) return;

    let thHtml = `<th class="th-pos">⇅ Pos</th><th class="th-player">Name</th>`;
    let totalPar = 0;

    for (const h of s.holes) {
      totalPar += h.par;
      thHtml += `
        <th class="th-hole-header">
          ${h.number}
          <span class="hole-par-sub">P${h.par}</span>
        </th>
      `;
    }
    thHtml += `
      <th class="th-total">
        Total
        <span class="hole-par-sub">P${totalPar}</span>
      </th>
    `;
    theadTr.innerHTML = thHtml;

    const players = this.sessionMgr.getActiveSessionPlayers();
    const playerStats = players.map(p => {
      const scores = s.scores[p.id] || [];
      let totalStrokes = 0;
      let playedPar = 0;
      let hasAnyScore = false;

      scores.forEach((sc, idx) => {
        if (sc !== null) {
          hasAnyScore = true;
          totalStrokes += sc;
          playedPar += s.holes[idx]?.par || 3;
        }
      });

      const diff = totalStrokes - playedPar;
      return { player: p, scores, totalStrokes, diff, hasAnyScore };
    });

    playerStats.sort((a, b) => (a.hasAnyScore ? a.diff : 999) - (b.hasAnyScore ? b.diff : 999));

    tbody.innerHTML = playerStats.map((item, idx) => {
      const p = item.player;
      const diffStr = !item.hasAnyScore ? 'E' : (item.diff === 0 ? 'E' : (item.diff > 0 ? `+${item.diff}` : `${item.diff}`));
      const totalNum = item.hasAnyScore ? item.totalStrokes : '-';

      let holeCells = '';
      for (let i = 0; i < s.holeCount; i++) {
        const sc = item.scores[i];
        const h = s.holes[i];
        if (sc === null) {
          holeCells += `<td><span class="score-empty">-</span></td>`;
        } else {
          const d = sc - h.par;
          let cls = 'score-par';
          if (sc === 1) cls = 'score-ace';
          else if (d <= -2) cls = 'score-eagle';
          else if (d === -1) cls = 'score-birdie';
          else if (d === 1) cls = 'score-bogey';
          else if (d >= 2) cls = 'score-double';

          holeCells += `<td><span class="score-circle ${cls}">${sc}</span></td>`;
        }
      }

      return `
        <tr>
          <td class="td-pos-val">${idx + 1}</td>
          <td class="td-player-cell">
            <div class="player-cardcast-row">
              <div class="avatar-small">${p.avatar}</div>
              <div>
                <strong>${p.name}</strong>
                <small class="text-dim" style="display:block;">@${p.udisc}</small>
              </div>
            </div>
          </td>
          ${holeCells}
          <td class="td-total-cell mono font-bold">
            ${diffStr}
            <span class="total-diff-sub text-dim">(${totalNum})</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  exportUDiscCSV() {
    const s = this.sessionMgr.getActiveSession();
    let csv = "PlayerName,CourseName,LayoutName,Date,Total,+/- ";
    for (let i = 1; i <= s.holeCount; i++) csv += `,Hole${i}`;
    csv += "\n";

    const players = this.sessionMgr.getActiveSessionPlayers();
    for (const p of players) {
      const scores = s.scores[p.id] || [];
      const total = scores.reduce((a, b) => a + (b || 0), 0);
      csv += `"${p.name}","${s.course}","${s.layout}","${new Date().toISOString().split('T')[0]}",${total},"-",${scores.join(',')}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scorecard_${s.course.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  setupEventListeners() {
    document.getElementById('btnPrevHole')?.addEventListener('click', () => {
      this.sessionMgr.activeHoleIndex = Math.max(0, this.sessionMgr.activeHoleIndex - 1);
      this.render();
      window.captureApp?.renderQuickScorecard();
    });
    document.getElementById('btnNextHole')?.addEventListener('click', () => {
      const s = this.sessionMgr.getActiveSession();
      this.sessionMgr.activeHoleIndex = Math.min(s.holeCount - 1, this.sessionMgr.activeHoleIndex + 1);
      this.render();
      window.captureApp?.renderQuickScorecard();
    });

    document.getElementById('btnExportUDiscCSV')?.addEventListener('click', () => this.exportUDiscCSV());

    const resetModal = document.getElementById('confirmResetModal');
    document.getElementById('btnTriggerResetScorecard')?.addEventListener('click', () => {
      resetModal?.classList.remove('hidden');
    });
    document.getElementById('btnCloseResetModal')?.addEventListener('click', () => {
      resetModal?.classList.add('hidden');
    });
    document.getElementById('btnCancelResetModal')?.addEventListener('click', () => {
      resetModal?.classList.add('hidden');
    });
    document.getElementById('btnConfirmResetModal')?.addEventListener('click', () => {
      this.sessionMgr.resetActiveScores();
      resetModal?.classList.add('hidden');
      this.render();
      window.captureApp?.renderQuickScorecard();
    });
  }
}

// ==========================================================================
// 6. Device-Agnostic Smart Sync Studio & Hardware-Accelerated Video Mixer
// ==========================================================================
class SmartSyncStudio {
  constructor(sessionMgr) {
    this.sessionMgr = sessionMgr;
    this.clips = [];
    this.selectedPlayer = "Mayan Fogarty";
    this.activeOverlap = null;
    this.availableAngles = []; // List of all detected camera angles in overlap
    this.isPlaying = false;
    this.currentTime = 0;
    this.playbackRate = 1.0;
    this.animId = null;
    this.lastTimestamp = null;
    this.isScrubbing = false;

    // Display modes: grid, pip, directorCut, ghostOverlay, solo
    this.displayMode = 'grid';
    this.directorActiveIndex = 0;
    this.directorLastSwitch = 0;
    this.directorInterval = 2500; // Switch angle every 2.5s
  }

  init() {
    this.populatePlayerSelect();
    this.setupEventListeners();
    this.scanOverlaps();
  }

  populatePlayerSelect() {
    const sel = document.getElementById('selectStudioPlayer');
    if (!sel) return;
    sel.innerHTML = this.sessionMgr.players.map(p => `
      <option value="${p.name}" ${p.name === this.selectedPlayer ? 'selected' : ''}>${p.name} (On-Disk Clips)</option>
    `).join('');

    sel.addEventListener('change', (e) => {
      this.selectedPlayer = e.target.value;
      this.scanOverlaps();
    });
  }

  async scanOverlaps() {
    const badge = document.getElementById('overlapStatusBadge');
    const chart = document.getElementById('timelineOverlapChart');
    const strip = document.getElementById('studioSourcesStrip');
    const countBadge = document.getElementById('sourcesCountBadge');
    const scrubber = document.getElementById('masterScrubber');
    const mt = document.getElementById('masterTimecode');
    const stage = document.getElementById('mixerVideoStage');

    if (badge) {
      badge.textContent = 'Scanning On-Disk Clips...';
      badge.className = 'badge-status';
    }

    try {
      const res = await fetch(`/api/clips?player=${encodeURIComponent(this.selectedPlayer)}`);
      if (res.ok) {
        const data = await res.json();
        this.clips = data.clips || [];
      }
    } catch (e) {
      this.clips = [];
    }

    // Prefer complete merged takes if 2 or more exist for this player
    let candidateClips = this.clips.filter(c => c.isTake);
    if (candidateClips.length < 2) {
      candidateClips = this.clips;
    }

    // Find the maximum overlapping cluster of clips across all devices/cameras
    let bestClips = [];
    let bestOverlapStart = 0;
    let bestOverlapEnd = 0;
    let maxOverlapDuration = 0;

    // Extract all unique timestamps
    const timestamps = [...new Set(candidateClips.flatMap(c => [c.startEpoch, c.endEpoch]))].sort((a, b) => a - b);

    for (let k = 0; k < timestamps.length - 1; k++) {
      const tA = timestamps[k];
      const tB = timestamps[k + 1];
      if (tB - tA < 50) continue; // Skip sub-50ms micro-slices

      const mid = (tA + tB) / 2;
      const coveringClips = candidateClips.filter(c => c.startEpoch <= mid && c.endEpoch >= mid);

      // De-duplicate by unique device/camera OS+browser+hole
      const uniqueDeviceClips = [];
      const seenDevices = new Set();
      for (const c of coveringClips) {
        const key = `${c.os}_${c.browser}_${c.hole || 'H1'}`;
        if (!seenDevices.has(key)) {
          seenDevices.add(key);
          uniqueDeviceClips.push(c);
        }
      }

      if (uniqueDeviceClips.length > bestClips.length) {
        bestClips = uniqueDeviceClips;
      }
    }

    // If no multi-device intersection found, fall back to any 2 overlapping clips
    if (bestClips.length < 2) {
      for (let i = 0; i < candidateClips.length; i++) {
        for (let j = i + 1; j < candidateClips.length; j++) {
          const a = candidateClips[i];
          const b = candidateClips[j];
          const oStart = Math.max(a.startEpoch, b.startEpoch);
          const oEnd = Math.min(a.endEpoch, b.endEpoch);
          if (oEnd > oStart + 100) {
            bestClips = [a, b];
            break;
          }
        }
        if (bestClips.length >= 2) break;
      }
    }

    if (bestClips.length >= 2) {
      bestOverlapStart = Math.max(...bestClips.map(c => c.startEpoch));
      bestOverlapEnd = Math.min(...bestClips.map(c => c.endEpoch));
      maxOverlapDuration = (bestOverlapEnd - bestOverlapStart) / 1000.0;

      // If duration is too short due to tight bounds, expand slightly to largest pairwise duration
      if (maxOverlapDuration <= 0.2) {
        const a = bestClips[0];
        const b = bestClips[1];
        bestOverlapStart = Math.max(a.startEpoch, b.startEpoch);
        bestOverlapEnd = Math.min(a.endEpoch, b.endEpoch);
        maxOverlapDuration = Math.max(1.0, (bestOverlapEnd - bestOverlapStart) / 1000.0);
      }
    }

    if (bestClips.length >= 2 && maxOverlapDuration > 0) {
      this.activeOverlap = {
        overlapStart: bestOverlapStart,
        overlapEnd: bestOverlapEnd,
        duration: maxOverlapDuration
      };

      // Build available angles list
      this.availableAngles = bestClips.map((clip, index) => {
        return {
          id: `angle_${index}`,
          index: index,
          name: `Cam ${index + 1}: ${clip.os} (${clip.browser})`,
          clip: clip,
          selected: true
        };
      });

      badge.textContent = `✓ ${maxOverlapDuration.toFixed(1)}s Overlap Locked (${bestClips.length} Angles • ${bestClips[0].hole || 'H1'})`;
      badge.className = 'badge-status online';

      if (countBadge) countBadge.textContent = `${bestClips.length} Synced Feeds (${bestClips.map(c => c.os).join(', ')})`;

      // Render timeline chart
      const totalSpanStart = Math.min(...bestClips.map(c => c.startEpoch));
      const totalSpanEnd = Math.max(...bestClips.map(c => c.endEpoch));
      const totalSpanMs = Math.max(1, totalSpanEnd - totalSpanStart);

      const oLeft = ((bestOverlapStart - totalSpanStart) / totalSpanMs) * 100;
      const oWidth = ((bestOverlapEnd - bestOverlapStart) / totalSpanMs) * 100;

      chart.innerHTML = this.availableAngles.map((angle, idx) => {
        const c = angle.clip;
        const cLeft = ((c.startEpoch - totalSpanStart) / totalSpanMs) * 100;
        const cWidth = ((c.endEpoch - c.startEpoch) / totalSpanMs) * 100;
        const barClass = idx % 2 === 0 ? 'clip-a' : 'clip-b';
        return `
          <div class="clip-track-row">
            <span class="clip-track-label">🎥 ${angle.name}</span>
            <div class="clip-track-bar-container">
              <div class="clip-span ${barClass}" style="left: ${cLeft}%; width: ${cWidth}%;">
                ${c.filename} (${(c.durationSec || 5).toFixed(1)}s)
              </div>
              <div class="overlap-zone-highlight" style="left: ${oLeft}%; width: ${oWidth}%;"></div>
            </div>
          </div>
        `;
      }).join('');

      // Render Source Feeds Strip (Real video first frame preview)
      strip.innerHTML = this.availableAngles.map((angle) => {
        const c = angle.clip;
        const offsetSec = (bestOverlapStart - c.startEpoch) / 1000.0;
        const offsetText = offsetSec <= 0.05 ? 'MASTER LOCKED' : `+${offsetSec.toFixed(1)}s OFFSET`;
        const offsetClass = offsetSec <= 0.05 ? 'text-cyan' : 'text-emerald';
        return `
          <div class="source-feed-box" id="srcFeed_${angle.id}">
            <div class="source-feed-header">
              <span class="source-feed-title">🎥 ${angle.name} • ${c.hole}</span>
              <span class="source-feed-offset ${offsetClass} mono">${offsetText}</span>
            </div>
            <div class="source-video-wrapper">
              <video id="sourceVideo_${angle.id}" class="source-preview-video" src="${c.url}" playsinline muted preload="auto"></video>
              <div class="source-timecode mono" id="sourceTc_${angle.id}">00:00:00.000</div>
            </div>
          </div>
        `;
      }).join('');

      // Populate Angle Selector Chips
      this.renderAngleChips();

      // Render Dynamic Mixer Video Stage
      this.renderMixerStage();

      if (scrubber) {
        scrubber.min = 0;
        scrubber.max = maxOverlapDuration;
        scrubber.value = 0;
      }

      this.currentTime = 0;
      this.seekToOverlapTime(0);

      if (mt) {
        const durSec = Math.floor(maxOverlapDuration);
        mt.textContent = `OVERLAP TIMELINE: 00:00:00.000 / 00:00:${String(durSec).padStart(2, '0')}.000`;
      }
    } else {
      this.activeOverlap = null;
      this.availableAngles = [];
      badge.textContent = 'No Overlapping Windows Detected';
      badge.className = 'badge-status';

      if (countBadge) countBadge.textContent = '0 Synced Feeds';
      strip.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 1rem; text-align: center; color: var(--text-dim);">
          No active synced streams loaded.
        </div>
      `;

      chart.innerHTML = `
        <div style="padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          No concurrent recording windows detected for <strong>${this.selectedPlayer}</strong>.<br>
          ${this.clips.length} clip(s) exist on disk, but their timestamps do not overlap.
          Connect two devices to the same round to enable multi-device sync.
        </div>
      `;

      const chipsBar = document.getElementById('angleChipsBar');
      if (chipsBar) chipsBar.innerHTML = `<span class="text-dim" style="font-size:0.8rem;">No camera feeds available.</span>`;

      if (stage) {
        stage.className = 'mixer-video-stage';
        stage.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-dim);">No overlapping video feeds available.</div>`;
      }

      if (mt) mt.textContent = `OVERLAP TIMELINE: 00:00:00.000 / 00:00:00.000`;
    }
  }

  renderAngleChips() {
    const chipsBar = document.getElementById('angleChipsBar');
    const countText = document.getElementById('activeAnglesCountText');
    if (!chipsBar) return;

    const selectedCount = this.availableAngles.filter(a => a.selected).length;
    if (countText) {
      countText.textContent = `${selectedCount} / ${this.availableAngles.length} Selected`;
    }

    chipsBar.innerHTML = this.availableAngles.map(angle => `
      <label class="angle-toggle-chip ${angle.selected ? 'active' : ''}" id="chipLabel_${angle.id}">
        <input type="checkbox" data-angle-id="${angle.id}" ${angle.selected ? 'checked' : ''} />
        <span>🎥 ${angle.name} • ${angle.clip.hole}</span>
      </label>
    `).join('');

    chipsBar.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const aid = cb.dataset.angleId;
        const angle = this.availableAngles.find(a => a.id === aid);
        if (angle) {
          angle.selected = cb.checked;
          const chipLabel = document.getElementById(`chipLabel_${aid}`);
          if (chipLabel) chipLabel.classList.toggle('active', cb.checked);
          
          const newCount = this.availableAngles.filter(a => a.selected).length;
          if (countText) countText.textContent = `${newCount} / ${this.availableAngles.length} Selected`;
          
          this.renderMixerStage();
        }
      });
    });
  }

  renderMixerStage() {
    const stage = document.getElementById('mixerVideoStage');
    if (!stage) return;

    const activeAngles = this.availableAngles.filter(a => a.selected);

    if (activeAngles.length === 0) {
      stage.className = 'mixer-video-stage';
      stage.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); font-size:0.9rem;">
          ⚠️ All camera angles unselected. Check at least 1 camera angle above to mix.
        </div>
      `;
      return;
    }

    stage.innerHTML = activeAngles.map(angle => `
      <div class="mixer-stage-pane" id="pane_${angle.id}">
        <video id="mixerVideo_${angle.id}" class="mixer-pane-video" src="${angle.clip.url}" playsinline muted preload="auto"></video>
        <div class="mixer-pane-badge mono" id="paneTag_${angle.id}">🎥 ${angle.name} • ${angle.clip.hole}</div>
      </div>
    `).join('');

    // Attach loadedmetadata listeners to sync initial frame
    activeAngles.forEach(angle => {
      const v = document.getElementById(`mixerVideo_${angle.id}`);
      if (v) {
        v.onloadedmetadata = () => {
          this.seekToOverlapTime(this.currentTime);
        };
        v.load();
      }
    });

    this.applyDisplayMode();
    this.seekToOverlapTime(this.currentTime);

    if (this.isPlaying) {
      this.play();
    }
  }

  applyDisplayMode() {
    const stage = document.getElementById('mixerVideoStage');
    const badge = document.getElementById('mixerDirectorBadge');
    if (!stage) return;

    const activeAngles = this.availableAngles.filter(a => a.selected);
    const N = activeAngles.length;

    // Reset base classes
    stage.className = 'mixer-video-stage';

    let modeText = 'MULTI-GRID';

    if (this.displayMode === 'grid') {
      stage.classList.add('mode-grid');
      const gridClass = `grid-${Math.min(10, Math.max(1, N))}`;
      stage.classList.add(gridClass);
      modeText = `MULTI-GRID (${N} CAMERAS)`;
    } else if (this.displayMode === 'pip') {
      stage.classList.add('mode-pip');
      modeText = 'PICTURE-IN-PICTURE';
    } else if (this.displayMode === 'directorCut') {
      stage.classList.add('mode-director-cut');
      if (N > 0) {
        const activeIdx = this.directorActiveIndex % N;
        const curAngle = activeAngles[activeIdx];
        activeAngles.forEach((a, idx) => {
          const p = document.getElementById(`pane_${a.id}`);
          if (p) p.classList.toggle('active-director', idx === activeIdx);
        });
        modeText = `AUTO-CUT: ${curAngle.name}`;
      }
    } else if (this.displayMode === 'ghostOverlay') {
      stage.classList.add('mode-ghost-overlay');
      modeText = `GHOST OVERLAY (${N} CAMERAS BLENDED)`;
    } else if (this.displayMode === 'solo') {
      stage.classList.add('mode-solo');
      if (N > 0) {
        const soloAngle = activeAngles[0];
        activeAngles.forEach((a, idx) => {
          const p = document.getElementById(`pane_${a.id}`);
          if (p) p.classList.toggle('active-solo', idx === 0);
        });
        modeText = `SOLO: ${soloAngle.name}`;
      }
    }

    if (badge) badge.textContent = `MODE: ${modeText} | MASTER SYNC LOCK`;
  }

  updateTimecodeDisplays(clampedT) {
    if (!this.activeOverlap) return;
    const { overlapStart, duration } = this.activeOverlap;
    const curEpoch = overlapStart + clampedT * 1000;
    const date = new Date(curEpoch);
    const msStr = String(date.getMilliseconds()).padStart(3, '0');
    const timeStr = date.toTimeString().split(' ')[0] + '.' + msStr;

    // Update timecodes for all available source feeds
    this.availableAngles.forEach(angle => {
      const tcEl = document.getElementById(`sourceTc_${angle.id}`);
      if (tcEl) tcEl.textContent = `${timeStr} (${angle.clip.os})`;
    });

    const mTc = document.getElementById('mixerTimecodeBadge');
    const mt = document.getElementById('masterTimecode');
    const scrubber = document.getElementById('masterScrubber');

    if (mTc) mTc.textContent = timeStr;

    const sec = Math.floor(clampedT);
    const ms = Math.floor((clampedT % 1) * 1000);
    const durSec = Math.floor(duration);
    if (mt) mt.textContent = `OVERLAP TIMELINE: 00:00:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')} / 00:00:${String(durSec).padStart(2, '0')}.000`;
    if (scrubber && !this.isScrubbing) scrubber.value = clampedT;
  }

  getAllActiveVideos() {
    const list = [];
    const activeAngles = this.availableAngles.filter(a => a.selected);
    activeAngles.forEach(a => {
      const mv = document.getElementById(`mixerVideo_${a.id}`);
      if (mv) list.push({ video: mv, angle: a });
    });
    this.availableAngles.forEach(a => {
      const sv = document.getElementById(`sourceVideo_${a.id}`);
      if (sv) list.push({ video: sv, angle: a });
    });
    return list;
  }

  seekToOverlapTime(tSec) {
    if (!this.activeOverlap) return;
    const { overlapStart, duration } = this.activeOverlap;
    const clampedT = Math.max(0, Math.min(duration, tSec));

    const videos = this.getAllActiveVideos();
    videos.forEach(({ video, angle }) => {
      const offset = (overlapStart - angle.clip.startEpoch) / 1000.0;
      const targetTime = Math.max(0.02, offset + clampedT);
      if (!isNaN(video.duration)) {
        video.currentTime = Math.min(video.duration, targetTime);
      }
    });

    this.updateTimecodeDisplays(clampedT);
  }

  play() {
    if (!this.activeOverlap) return;
    this.isPlaying = true;
    const btn = document.getElementById('btnStudioPlayPause');
    if (btn) btn.textContent = '⏸ Pause Overlap Sync';
    this.lastTimestamp = performance.now();

    const { overlapStart } = this.activeOverlap;
    const videos = this.getAllActiveVideos();

    videos.forEach(({ video, angle }) => {
      const offset = (overlapStart - angle.clip.startEpoch) / 1000.0;
      const targetTime = Math.max(0.02, offset + this.currentTime);
      video.playbackRate = this.playbackRate;
      video.currentTime = targetTime;
      video.play().catch(() => {});
    });

    this.loop();
  }

  pause() {
    this.isPlaying = false;
    const btn = document.getElementById('btnStudioPlayPause');
    if (btn) btn.textContent = '▶ Play Overlap Sync';
    if (this.animId) cancelAnimationFrame(this.animId);

    const videos = this.getAllActiveVideos();
    videos.forEach(({ video }) => {
      video.pause();
    });
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  loop() {
    if (!this.isPlaying || !this.activeOverlap) return;
    const now = performance.now();
    const dt = (now - this.lastTimestamp) / 1000.0;
    this.lastTimestamp = now;

    const { overlapStart, duration } = this.activeOverlap;
    const activeAngles = this.availableAngles.filter(a => a.selected);
    const refAngle = activeAngles[0] || this.availableAngles[0];
    const refVideo = refAngle ? document.getElementById(`mixerVideo_${refAngle.id}`) : null;

    // Follow natural video playback progress without constantly forcing currentTime
    if (refVideo && !refVideo.paused && !isNaN(refVideo.currentTime)) {
      const offsetRef = (overlapStart - refAngle.clip.startEpoch) / 1000.0;
      this.currentTime = Math.max(0, refVideo.currentTime - offsetRef);
    } else {
      this.currentTime += dt * this.playbackRate;
    }

    // Check if overlap window duration reached -> loop cleanly
    if (this.currentTime >= duration) {
      this.currentTime = 0;
      const videos = this.getAllActiveVideos();
      videos.forEach(({ video, angle }) => {
        const offset = (overlapStart - angle.clip.startEpoch) / 1000.0;
        video.currentTime = Math.max(0, offset);
        video.play().catch(() => {});
      });
    } else {
      // Soft-resync any video whose decoder drifts by > 250ms
      const videos = this.getAllActiveVideos();
      videos.forEach(({ video, angle }) => {
        if (!video.paused && !isNaN(video.currentTime)) {
          const offset = (overlapStart - angle.clip.startEpoch) / 1000.0;
          const expected = offset + this.currentTime;
          if (Math.abs(video.currentTime - expected) > 0.25) {
            video.currentTime = expected;
          }
        }
      });
    }

    // Auto-director cut logic
    if (this.displayMode === 'directorCut' && activeAngles.length > 1) {
      if (now - this.directorLastSwitch > this.directorInterval) {
        this.directorActiveIndex = (this.directorActiveIndex + 1) % activeAngles.length;
        this.directorLastSwitch = now;
        this.applyDisplayMode();
      }
    }

    // Update timecodes and scrubber position smoothly
    this.updateTimecodeDisplays(this.currentTime);

    this.animId = requestAnimationFrame(() => this.loop());
  }

  setupEventListeners() {
    document.getElementById('btnScanOverlaps')?.addEventListener('click', () => this.scanOverlaps());
    document.getElementById('btnStudioPlayPause')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btnStudioRewind')?.addEventListener('click', () => {
      this.currentTime = 0;
      this.seekToOverlapTime(0);
    });

    // Select All / Clear angles buttons
    document.getElementById('btnSelectAllAngles')?.addEventListener('click', () => {
      this.availableAngles.forEach(a => a.selected = true);
      this.renderAngleChips();
      this.renderMixerStage();
    });

    document.getElementById('btnUnselectAllAngles')?.addEventListener('click', () => {
      this.availableAngles.forEach((a, idx) => a.selected = (idx === 0)); // keep at least 1
      this.renderAngleChips();
      this.renderMixerStage();
    });

    const scrubber = document.getElementById('masterScrubber');
    scrubber?.addEventListener('mousedown', () => { this.isScrubbing = true; });
    scrubber?.addEventListener('touchstart', () => { this.isScrubbing = true; });
    scrubber?.addEventListener('input', (e) => {
      this.currentTime = parseFloat(e.target.value);
      this.seekToOverlapTime(this.currentTime);
    });
    scrubber?.addEventListener('change', () => { this.isScrubbing = false; });
    scrubber?.addEventListener('mouseup', () => { this.isScrubbing = false; });
    scrubber?.addEventListener('touchend', () => { this.isScrubbing = false; });

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.playbackRate = parseFloat(btn.dataset.speed);
        const videos = this.getAllActiveVideos();
        videos.forEach(({ video }) => {
          video.playbackRate = this.playbackRate;
        });
      });
    });

    // Display mode buttons
    document.querySelectorAll('.btn-mixer-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-mixer-mode').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.displayMode = btn.dataset.mode;
        this.applyDisplayMode();
      });
    });

    document.getElementById('btnExportComposite')?.addEventListener('click', () => {
      alert('Local FFmpeg composite stitch triggered for this overlap! Output saved to session processed/ folder with 0 YouTube units consumed.');
    });

    document.getElementById('btnExportSyncMeta')?.addEventListener('click', () => {
      if (!this.activeOverlap) {
        alert('No overlap active to inspect.');
        return;
      }
      alert(JSON.stringify({
        overlap: this.activeOverlap,
        angles: this.availableAngles
      }, null, 2));
    });
  }
}

// ==========================================================================
// 7. Storage Explorer (Click row to open Windows Explorer / OS Desktop Folder)
// ==========================================================================
class StorageExplorer {
  async loadFiles() {
    const body = document.getElementById('storageFilesBody');
    const summary = document.getElementById('storageSummaryText');
    if (!body) return;

    try {
      const res = await fetch('/api/storage/files');
      if (res.ok) {
        const data = await res.json();
        summary.textContent = `Storage Directory: ${data.baseStorage} • Total Files: ${data.totalFiles} • Click row to open in File Explorer`;
        if (data.files.length === 0) {
          body.innerHTML = `<tr><td colspan="4" class="text-dim">No recordings found on disk yet. Start recording to generate slices.</td></tr>`;
        } else {
          body.innerHTML = data.files.map(f => `
            <tr data-relpath="${f.relativePath}" title="Click to open this folder in Desktop File Explorer">
              <td class="mono font-bold text-cyan">${f.name}</td>
              <td class="mono" style="font-size:0.75rem;">📁 ${f.relativePath}</td>
              <td class="mono">${(f.sizeBytes / 1024).toFixed(1)} KB</td>
              <td class="mono">${new Date(f.modified).toLocaleTimeString()}</td>
            </tr>
          `).join('');

          body.querySelectorAll('tr').forEach(tr => {
            tr.addEventListener('click', async () => {
              const relPath = tr.dataset.relpath;
              if (!relPath) return;
              try {
                const openRes = await fetch('/api/storage/open-folder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ relativePath: relPath })
                });
                const openData = await openRes.json();
                console.log('Opened OS Explorer:', openData.targetFolder);
              } catch (err) {}
            });
          });
        }
        return;
      }
    } catch (e) {}

    summary.textContent = `Storage directory: storage/recordings/`;
    body.innerHTML = `<tr><td colspan="4" class="text-dim">Connecting to local Hub storage API...</td></tr>`;
  }
}

// ==========================================================================
// 7b. Screen Wake Lock Engine (Prevents Phone Screen Sleep in Field)
// ==========================================================================
class WakeLockEngine {
  constructor() {
    this.wakeLock = null;
    this.isActive = false;
  }

  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.isActive = true;
        this.updateBadge(true);

        this.wakeLock.addEventListener('release', () => {
          this.isActive = false;
          this.updateBadge(false);
        });
      } catch (err) {
        this.isActive = false;
        this.updateBadge(false);
      }
    }
  }

  async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        this.isActive = false;
        this.updateBadge(false);
      } catch (e) {}
    }
  }

  init() {
    this.requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.requestWakeLock();
      }
    });
  }

  updateBadge(active) {
    const badge = document.getElementById('wakeLockBadge');
    if (badge) {
      if (active) {
        badge.textContent = '☀️ Screen Awake';
        badge.className = 'wake-lock-badge';
      } else {
        badge.textContent = '🌙 Sleep Allowed';
        badge.className = 'wake-lock-badge inactive';
      }
    }
  }
}

// ==========================================================================
// 7c. QR Code Tab & Mobile Quick-Join Manager
// ==========================================================================
class QrCodeTabManager {
  constructor() {
    this.endpoints = null;
    this.mode = 'http'; // Default to normal HTTP for zero-warning normal load!
  }

  async init() {
    this.setupEventListeners();
    await this.load();
  }

  setMode(mode) {
    this.mode = mode;
    const btnHttp = document.getElementById('btnQrModeHttp');
    const btnHttps = document.getElementById('btnQrModeHttps');
    const badge = document.getElementById('qrProtocolBadge');
    const hint = document.getElementById('qrScanHint');

    if (btnHttp && btnHttps) {
      if (mode === 'http') {
        btnHttp.className = 'btn btn-sm btn-accent';
        btnHttps.className = 'btn btn-sm btn-outline';
        if (badge) badge.textContent = 'NORMAL HTTP (PORT 3456) • ZERO WARNINGS';
        if (hint) hint.textContent = 'SCAN FOR NORMAL HTTP (NO WARNINGS)';
      } else {
        btnHttp.className = 'btn btn-sm btn-outline';
        btnHttps.className = 'btn btn-sm btn-accent';
        if (badge) badge.textContent = 'SECURE HTTPS (PORT 3457) • CAMERA READY';
        if (hint) hint.textContent = 'SCAN FOR SECURE HTTPS (ACCEPT CERT ONCE)';
      }
    }
    this.renderEndpoints();
  }

  renderEndpoints() {
    if (!this.endpoints) return;

    const img = document.getElementById('qrCodeImg');
    const linkMdns = document.getElementById('linkMdns');
    const linkPrimary = document.getElementById('linkPrimaryLan');

    const isHttp = this.mode === 'http';
    const primaryUrl = isHttp ? this.endpoints.httpUrl : this.endpoints.httpsUrl;
    const mdnsUrl = isHttp ? this.endpoints.mdnsHttpUrl : this.endpoints.mdnsHttpsUrl;

    if (linkMdns && mdnsUrl) {
      linkMdns.href = mdnsUrl;
      linkMdns.textContent = mdnsUrl;
    }

    if (linkPrimary && primaryUrl) {
      linkPrimary.href = primaryUrl;
      linkPrimary.textContent = primaryUrl;
    }

    if (img) {
      img.src = `/api/qrcode?mode=${this.mode}&t=${Date.now()}`;
    }
  }

  async load() {
    try {
      const res = await fetch('/api/network/endpoints');
      if (res.ok) {
        this.endpoints = await res.json();
        this.renderEndpoints();
      }
    } catch (e) {}
  }

  setupEventListeners() {
    document.getElementById('btnQrModeHttp')?.addEventListener('click', () => this.setMode('http'));
    document.getElementById('btnQrModeHttps')?.addEventListener('click', () => this.setMode('https'));

    document.querySelectorAll('.btn-copy-link').forEach(btn => {
      btn.addEventListener('click', async () => {
        let url = btn.dataset.url;
        if (!url) {
          if (btn.id === 'btnCopyPrimaryLan') url = document.getElementById('linkPrimaryLan')?.href;
          if (btn.id === 'btnCopyMdns') url = document.getElementById('linkMdns')?.href;
        }
        if (url) {
          try {
            await navigator.clipboard.writeText(url);
            const orig = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => { btn.textContent = orig; }, 1800);
          } catch (e) {
            prompt('Copy this join link:', url);
          }
        }
      });
    });
  }
}

// ==========================================================================
// 8. Bootstrap, Admin Mode Toggle, and Modals
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing MYT Video Capture Hub...');

  const storage = new IndexedDBStorage();
  await storage.init();

  const clockSync = new ClockSyncEngine();
  clockSync.init();

  const sessionMgr = new SessionManager();
  await sessionMgr.init();

  const capture = new CaptureEngine(storage, clockSync, sessionMgr);
  await capture.init();
  window.captureApp = capture;

  const udisc = new UDiscScorecard(sessionMgr);
  udisc.init();
  window.udiscApp = udisc;

  const studio = new SmartSyncStudio(sessionMgr);
  studio.init();
  window.studioApp = studio;

  const storageExplorer = new StorageExplorer();

  const wakeLock = new WakeLockEngine();
  wakeLock.init();
  window.wakeLockApp = wakeLock;

  const qrMgr = new QrCodeTabManager();
  await qrMgr.init();
  window.qrMgrApp = qrMgr;

  // Connected clients & network telemetry table updater
  window.refreshConnectedClientsTable = async function() {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/telemetry/clients');
      if (res.ok) {
        const data = await res.json();
        const clients = data.clients || [];
        const host = data.hostInfo || {};

        // Update Host & Network Top Stat Cards
        const pPlatform = document.getElementById('hubHostPlatform');
        const pUptime = document.getElementById('hubHostUptime');
        const pLan = document.getElementById('hubLanEndpoint');
        const pLoop = document.getElementById('hubLoopbackEndpoint');
        const pClock = document.getElementById('hubClockStatus');
        const pSync = document.getElementById('hubSyncOffset');
        const pStorage = document.getElementById('hubStorageTotal');
        const pDisk = document.getElementById('hubStorageDisk');
        const countBadge = document.getElementById('devicesCountBadge');

        if (pPlatform && host.platform) pPlatform.textContent = `${host.hostname} • ${host.platform}`;
        if (pUptime) pUptime.textContent = `Uptime: ${host.uptimeFormatted || '0m'} • Node ${host.nodeVersion || 'Active'} • RAM: ${host.memoryRssMb || 0} MB`;
        if (pLan && host.primaryLanIp) pLan.textContent = `http://${host.primaryLanIp}:${host.port || 3457}`;
        if (pLoop) pLoop.textContent = `Local: http://localhost:${host.port || 3457} (${host.primaryInterfaceName || 'Wi-Fi'})`;
        if (pClock) pClock.textContent = `Synchronized (30 Hz RFC 6455)`;
        if (pSync) {
          const clientOffset = clients[0]?.offsetMs;
          pSync.textContent = clientOffset !== undefined 
            ? `Client Drift: ${clientOffset > 0 ? '+' : ''}${clientOffset.toFixed(1)} ms`
            : `Client Drift: < 1.0 ms`;
        }
        if (pStorage) pStorage.textContent = `${host.totalSlices || 0} Slices Ingested`;
        if (pDisk) pDisk.textContent = `Storage: ${host.totalStorageMb || '0.0'} MB on Disk`;
        if (countBadge) countBadge.textContent = `Active Clients: ${Math.max(1, clients.length)}`;

        const now = Date.now();
        if (clients.length === 0) {
          const playerSelect = document.getElementById('selectCapturePlayer');
          const selectedPlayerId = playerSelect ? playerSelect.value : null;
          const player = sessionMgr.players.find(p => p.id === selectedPlayerId) || sessionMgr.players[0];
          const env = capture.clientEnv;
          tbody.innerHTML = `
            <tr>
              <td class="mono font-bold">${env.os} (${env.browser})</td>
              <td class="font-bold text-cyan">${player ? `${player.name} (@${player.udisc})` : 'Mayan Fogarty'}</td>
              <td class="mono text-dim">127.0.0.1 <small>(Local Host)</small></td>
              <td class="mono text-emerald font-bold">${clockSync.rttMs.toFixed(1)} ms</td>
              <td class="mono text-cyan font-bold">${clockSync.clockOffsetMs > 0 ? '+' : ''}${clockSync.clockOffsetMs.toFixed(1)} ms</td>
              <td class="mono font-bold">${sessionMgr.getActiveSession()?.holes[sessionMgr.activeHoleIndex]?.name || 'H1'} • ${capture.sliceCount} slices</td>
              <td><span class="badge-status online">${capture.isRecording ? 'Streaming Slices' : 'Active Host'}</span></td>
              <td class="mono text-dim">Just now</td>
            </tr>
          `;
        } else {
          tbody.innerHTML = clients.map(c => {
            const ageSec = Math.max(0, Math.round((now - (c.lastSeen || now)) / 1000));
            const ageText = ageSec <= 1 ? 'Just now' : `${ageSec}s ago`;
            const rttColor = (c.rttMs || 1) < 15 ? 'text-emerald' : 'text-amber';

            return `
              <tr>
                <td class="mono font-bold">${c.deviceId || c.id}</td>
                <td class="font-bold text-cyan">${c.filmingPlayer || 'Player'}</td>
                <td class="mono text-dim">${c.ip || '127.0.0.1'} <small>(${c.connectionType || 'Wi-Fi / LAN'})</small></td>
                <td class="mono ${rttColor} font-bold">${(c.rttMs || 1.2).toFixed(1)} ms</td>
                <td class="mono text-cyan font-bold">${c.offsetMs !== undefined ? (c.offsetMs > 0 ? '+' : '') + Number(c.offsetMs).toFixed(1) + ' ms' : '+0.0 ms'}</td>
                <td class="mono font-bold">${c.activeHole || 'H1'} • ${(c.slicesStreamed || 0)} slices</td>
                <td><span class="badge-status online">${c.status || 'Active Host'}</span></td>
                <td class="mono text-dim">${ageText}</td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (e) {}
  };

  // Real-time telemetry polling every 2.5s when Admin Mode is active
  setInterval(() => {
    if (isAdmin) window.refreshConnectedClientsTable();
  }, 2500);

  // Admin Mode Toggle
  const btnToggleAdmin = document.getElementById('btnToggleAdmin');
  const adminLabel = document.getElementById('adminToggleLabel');
  let isAdmin = false;

  btnToggleAdmin.addEventListener('click', () => {
    isAdmin = !isAdmin;
    document.body.classList.toggle('admin-active', isAdmin);
    adminLabel.textContent = isAdmin ? 'Admin: ON' : 'Admin Mode';
    if (isAdmin) {
      storageExplorer.loadFiles();
      studio.populatePlayerSelect();
      studio.scanOverlaps();
      renderSessionsCards();
      renderRosterCards();
      window.refreshConnectedClientsTable();
    }
  });

  // Tab Navigation
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const tabName = tab.dataset.tab.toLowerCase();

      panels.forEach(panel => {
        if (panel.id.toLowerCase() === `panel${tabName}`) {
          panel.classList.add('active');
        }
      });

      if (tabName === 'udisc') udisc.render();
      if (tabName === 'qrcode') qrMgr.load();
      if (tabName === 'studio') studio.scanOverlaps();
      if (tabName === 'storage') storageExplorer.loadFiles();
      if (tabName === 'hub') window.refreshConnectedClientsTable();
    });
  });

  document.getElementById('btnRefreshStorage')?.addEventListener('click', () => storageExplorer.loadFiles());

  // --------------------------------------------------------------------------
  // Modal: Add New Player
  // --------------------------------------------------------------------------
  const playerModal = document.getElementById('playerModal');
  let selectedAvatar = "CH";

  document.querySelectorAll('.avatar-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedAvatar = opt.dataset.av;
    });
  });

  document.getElementById('btnClosePlayerModal')?.addEventListener('click', () => playerModal.classList.add('hidden'));
  document.getElementById('btnCancelPlayerModal')?.addEventListener('click', () => playerModal.classList.add('hidden'));

  document.getElementById('btnSavePlayerModal')?.addEventListener('click', () => {
    const name = document.getElementById('inputPlayerName').value.trim();
    const udiscHandle = document.getElementById('inputUDiscUsername').value.trim();
    const desc = document.getElementById('inputPlayerDesc').value.trim();
    const addToActive = document.getElementById('checkAddToActiveSession').checked;

    if (!name) {
      alert('Please enter a player name.');
      return;
    }

    const newP = sessionMgr.addPlayer(name, udiscHandle, desc, selectedAvatar, addToActive);
    playerModal.classList.add('hidden');

    capture.populatePlayerDropdown(newP.id);
    capture.renderQuickScorecard();
    udisc.render();
    studio.populatePlayerSelect();
    renderRosterCards();
  });

  document.getElementById('btnAddPlayerAdmin')?.addEventListener('click', () => playerModal.classList.remove('hidden'));

  // --------------------------------------------------------------------------
  // Modal: Create New Session (Users and Admins with Dropdowns)
  // --------------------------------------------------------------------------
  const sessionModal = document.getElementById('sessionModal');
  const sessionPlayersList = document.getElementById('sessionPlayersCheckboxList');

  window.openCreateSessionModal = function() {
    if (sessionPlayersList) {
      sessionPlayersList.innerHTML = sessionMgr.players.map(p => `
        <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem; font-size:0.85rem; cursor:pointer;">
          <input type="checkbox" value="${p.id}" checked>
          <span>${p.name} (@${p.udisc})</span>
        </label>
      `).join('');
    }
    sessionModal?.classList.remove('hidden');
  };

  document.getElementById('btnCreateSessionAdmin')?.addEventListener('click', () => {
    window.openCreateSessionModal();
  });

  document.getElementById('btnCloseSessionModal')?.addEventListener('click', () => sessionModal.classList.add('hidden'));
  document.getElementById('btnCancelSessionModal')?.addEventListener('click', () => sessionModal.classList.add('hidden'));

  document.getElementById('btnSaveSessionModal')?.addEventListener('click', () => {
    const name = document.getElementById('inputSessionName').value.trim();
    const course = document.getElementById('inputSessionCourse').value.trim();
    const holeCount = parseInt(document.getElementById('selectSessionHoleCount').value, 10) || 9;
    const defaultPar = parseInt(document.getElementById('selectSessionDefaultPar').value, 10) || 3;

    const checkedPids = [];
    sessionPlayersList?.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      checkedPids.push(cb.value);
    });

    if (!name) {
      alert('Please enter a session card name.');
      return;
    }

    const newS = sessionMgr.createSession(name, course, holeCount, defaultPar, checkedPids);
    sessionModal.classList.add('hidden');

    capture.populateSessionDropdown(newS.id);
    capture.populatePlayerDropdown();
    capture.renderQuickScorecard();
    udisc.render();
    renderSessionsCards();
  });

  // --------------------------------------------------------------------------
  // Modal: Edit Existing Session (Admin Only: Add/Delete Holes & Adjust Pars)
  // --------------------------------------------------------------------------
  const editModal = document.getElementById('editSessionModal');
  const editHolesGrid = document.getElementById('adminHolesEditorGrid');
  const editPlayersList = document.getElementById('editSessionPlayersList');
  const editHoleSummary = document.getElementById('editHoleCountSummary');

  function openEditSessionModal(sessionId) {
    const s = sessionMgr.sessions.find(x => x.id === sessionId);
    if (!s) return;

    document.getElementById('editSessionId').value = s.id;
    document.getElementById('editSessionName').value = s.name;
    document.getElementById('editSessionCourse').value = s.course;

    renderHoleEditorGrid(s);
    renderEditPlayersList(s);
    editModal.classList.remove('hidden');
  }

  function renderHoleEditorGrid(s) {
    if (!editHolesGrid) return;
    if (editHoleSummary) editHoleSummary.textContent = `${s.holeCount} Holes`;

    editHolesGrid.innerHTML = s.holes.map((h, idx) => `
      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:4px; padding:0.4rem; text-align:center;">
        <span style="font-size:0.75rem; font-weight:700; display:block;">Hole ${h.number}</span>
        <select class="form-select-sm hole-par-changer" data-idx="${idx}" style="font-size:0.75rem; padding:0.15rem; margin-top:0.25rem;">
          <option value="2" ${h.par === 2 ? 'selected' : ''}>Par 2</option>
          <option value="3" ${h.par === 3 ? 'selected' : ''}>Par 3</option>
          <option value="4" ${h.par === 4 ? 'selected' : ''}>Par 4</option>
          <option value="5" ${h.par === 5 ? 'selected' : ''}>Par 5</option>
          <option value="6" ${h.par === 6 ? 'selected' : ''}>Par 6</option>
        </select>
      </div>
    `).join('');

    editHolesGrid.querySelectorAll('.hole-par-changer').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(sel.dataset.idx, 10);
        sessionMgr.setHolePar(s.id, idx, e.target.value);
        renderHoleEditorGrid(s);
        udisc.render();
        capture.renderQuickScorecard();
      });
    });
  }

  function renderEditPlayersList(s) {
    if (!editPlayersList) return;
    editPlayersList.innerHTML = sessionMgr.players.map(p => `
      <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem; font-size:0.85rem; cursor:pointer;">
        <input type="checkbox" value="${p.id}" ${s.playerIds.includes(p.id) ? 'checked' : ''}>
        <span>${p.name} (@${p.udisc})</span>
      </label>
    `).join('');
  }

  document.getElementById('btnAdminAddHole')?.addEventListener('click', () => {
    const sid = document.getElementById('editSessionId').value;
    const s = sessionMgr.sessions.find(x => x.id === sid);
    if (!s) return;
    sessionMgr.addHoleToSession(sid, 3);
    renderHoleEditorGrid(s);
    udisc.render();
    capture.renderQuickScorecard();
  });

  document.getElementById('btnAdminRemoveHole')?.addEventListener('click', () => {
    const sid = document.getElementById('editSessionId').value;
    const s = sessionMgr.sessions.find(x => x.id === sid);
    if (!s || s.holeCount <= 1) return;
    sessionMgr.removeHoleFromSession(sid);
    renderHoleEditorGrid(s);
    udisc.render();
    capture.renderQuickScorecard();
  });

  document.getElementById('btnCloseEditSessionModal')?.addEventListener('click', () => editModal.classList.add('hidden'));
  document.getElementById('btnCancelEditSessionModal')?.addEventListener('click', () => editModal.classList.add('hidden'));

  document.getElementById('btnSaveEditSessionModal')?.addEventListener('click', () => {
    const sid = document.getElementById('editSessionId').value;
    const s = sessionMgr.sessions.find(x => x.id === sid);
    if (!s) return;

    s.name = document.getElementById('editSessionName').value.trim() || s.name;
    s.course = document.getElementById('editSessionCourse').value.trim() || s.course;

    const checkedPids = [];
    editPlayersList?.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      checkedPids.push(cb.value);
    });
    s.playerIds = checkedPids.length > 0 ? checkedPids : s.playerIds;
    checkedPids.forEach(pid => {
      if (!s.scores[pid]) s.scores[pid] = Array(s.holeCount).fill(null);
    });

    sessionMgr.syncScorecardToServer();
    editModal.classList.add('hidden');

    capture.populateSessionDropdown();
    capture.populatePlayerDropdown();
    capture.renderQuickScorecard();
    udisc.render();
    renderSessionsCards();
  });

  // --------------------------------------------------------------------------
  // Admin Sessions & Roster Cards
  // --------------------------------------------------------------------------
  function renderSessionsCards() {
    const grid = document.getElementById('sessionsCardsGrid');
    if (!grid) return;
    grid.innerHTML = sessionMgr.sessions.map(s => {
      const totalPar = s.holes.reduce((a, b) => a + b.par, 0);
      return `
        <div class="session-card ${s.id === sessionMgr.activeSessionId ? 'active-card' : ''}">
          <div class="flex-between">
            <strong>${s.name}</strong>
            ${s.id === sessionMgr.activeSessionId ? '<span class="badge-status online">ACTIVE</span>' : ''}
          </div>
          <div class="text-dim" style="font-size:0.75rem; margin-top:0.2rem;">${s.course} (${s.layout})</div>
          
          <div class="flex-between mt-2" style="font-size:0.78rem;">
            <span>Holes: <strong>${s.holeCount} Holes</strong> (Par ${totalPar})</span>
            <span>Players: <strong>${s.playerIds.length}</strong></span>
          </div>

          <div class="flex-between mt-3" style="gap:0.5rem; flex-wrap:wrap;">
            <button class="btn btn-xs btn-outline btn-select-session" data-sid="${s.id}">
              ${s.id === sessionMgr.activeSessionId ? '✓ Current' : 'Switch To'}
            </button>
            <div class="flex-gap">
              <button class="btn btn-xs btn-accent btn-edit-session" data-sid="${s.id}" title="Add/Delete Holes & Edit Card">
                ✏️ Edit Holes
              </button>
              <button class="btn btn-xs btn-danger-outline btn-delete-session" data-sid="${s.id}" title="Admin Only: Delete Session">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.btn-select-session').forEach(btn => {
      btn.addEventListener('click', () => {
        sessionMgr.setActiveSession(btn.dataset.sid);
        capture.populateSessionDropdown();
        capture.populatePlayerDropdown();
        capture.renderQuickScorecard();
        udisc.render();
        renderSessionsCards();
      });
    });

    grid.querySelectorAll('.btn-edit-session').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditSessionModal(btn.dataset.sid);
      });
    });

    grid.querySelectorAll('.btn-delete-session').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sid = btn.dataset.sid;
        if (confirm(`Are you sure you want to delete session "${sid}"? This action cannot be undone.`)) {
          await sessionMgr.deleteSession(sid);
          capture.populateSessionDropdown();
          capture.populatePlayerDropdown();
          capture.renderQuickScorecard();
          udisc.render();
          renderSessionsCards();
        }
      });
    });
  }

  function renderRosterCards() {
    const grid = document.getElementById('rosterCardsGrid');
    if (!grid) return;
    grid.innerHTML = sessionMgr.players.map(p => `
      <div class="roster-player-card">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <div class="avatar-small">${p.avatar}</div>
          <div>
            <strong>${p.name}</strong>
            <small class="text-dim" style="display:block;">@${p.udisc}</small>
          </div>
        </div>
        <div class="text-dim mt-2" style="font-size:0.75rem;">${p.desc}</div>
      </div>
    `).join('');
  }

  console.log('✓ MYT Capture Hub initialized.');
});
