#pragma once
#include <Arduino.h>

const char LOG_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DeafDoorbell Telemetry &amp; Logs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg-base: #0c0c0c;
      --bg-surface: #151515;
      --bg-card: #1c1c1c;
      --border-subtle: #292929;
      --border-hover: #404040;
      --accent: #00e5ff;
      --party-neon: #ff007f;
      --text: #f2f2f2;
      --text-dim: #8b949e;
      --warn: #ff4d4d;
      --success: #3fb950;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background: var(--bg-base);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 12px 16px 28px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
    }
    .container { width: 100%; max-width: 680px; }
    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0 14px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 14px;
    }
    .nav-back-link {
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--text-dim);
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      transition: all 0.15s ease;
    }
    .nav-back-link:hover { color: var(--text); border-color: var(--border-hover); background: var(--bg-card); }
    .header-title { font-size: 0.95rem; font-weight: 600; color: var(--text); }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .card-title {
      font-size: 0.9em;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .val-display { font-size: 1.1em; font-weight: 700; color: #fff; }
    .flex-row { display: flex; align-items: center; justify-content: space-between; }
    .bar-wrap {
      height: 20px;
      background: #21262d;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      margin: 8px 0;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #00e5ff 0%, #a855f7 60%, #ff007f 100%);
      width: 0%;
      transition: width 0.08s ease;
      border-radius: 6px;
    }
    .bar-thresh {
      position: absolute;
      top: 0;
      height: 100%;
      width: 3px;
      background: #eab308;
      box-shadow: 0 0 8px #eab308;
      z-index: 2;
    }
    .triggered-flash { border-color: #ff007f !important; box-shadow: 0 0 20px rgba(255, 0, 127, 0.45) !important; }
    .btn-test {
      background: var(--bg-card);
      color: var(--text);
      border: 1px solid var(--border-subtle);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8em;
      font-weight: 600;
      transition: all 0.15s;
    }
    .btn-test:hover { border-color: var(--border-hover); color: #fff; }
    .btn-sm { padding: 4px 10px; font-size: 0.75em; }
    .view-btn {
      padding: 4px 10px;
      font-size: 0.75em;
      border-radius: 6px;
      background: var(--bg-card);
      color: var(--text-dim);
      border: 1px solid var(--border-subtle);
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .view-btn.active {
      background: linear-gradient(135deg, #00e5ff, #007aff);
      color: #000;
      border-color: transparent;
      font-weight: 700;
    }
    .graph-container { position: relative; width: 100%; margin-top: 8px; }
    canvas#soundCanvas {
      width: 100%;
      height: 190px;
      background: #0f141c;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      display: block;
    }
    .log-table-wrap {
      max-height: 220px;
      overflow-y: auto;
      margin-top: 8px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: #0f141c;
    }
    table.log-table { width: 100%; border-collapse: collapse; font-size: 0.75em; }
    table.log-table th, table.log-table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    table.log-table th { background: #161b22; color: var(--text-dim); position: sticky; top: 0; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; font-weight: 700; }
    .badge-ok { background: rgba(63,185,80,0.2); color: var(--success); }
    .badge-warn { background: rgba(255,77,77,0.2); color: var(--warn); }
    .badge-party { background: rgba(255,0,127,0.2); color: #ff007f; }
    .badge-info { background: rgba(0,229,255,0.2); color: var(--accent); }
    .color-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 50%; vertical-align: middle; margin-right: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <header class="app-header">
      <a href="/" class="nav-back-link">&larr; Back to Controls</a>
      <h1 class="header-title">Audio &amp; RF Telemetry</h1>
      <div style="width:110px;"></div>
    </header>

    <!-- Sound History Graph -->
    <div class="card" id="graphCard">
      <div class="card-title">
        <span>Sound History Graph</span>
        <div style="display:flex; gap:6px;">
          <button id="btnViewLive" class="view-btn active" onclick="setGraphView('live')">Live (60s)</button>
          <button id="btnView24h" class="view-btn" onclick="setGraphView('24h')">24h Timeline</button>
        </div>
        <span class="val-display" id="graphCurrentMad" style="font-size:0.9em;">MAD: 0</span>
      </div>
      <div class="graph-container">
        <canvas id="soundCanvas" width="600" height="200"></canvas>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-dim); margin-top: 6px;">
        <span id="graphXLabel">X: Real-Time Audio (Last 60s)</span>
        <span>Y: MAD Level | Gold Line: Threshold</span>
      </div>
    </div>

    <!-- Live Audio Level Bar -->
    <div class="card" id="liveCard">
      <div class="card-title">
        <span>Live Instant Audio (MAD)</span>
        <span class="val-display" id="rmsVal">0</span>
      </div>
      <div class="bar-wrap">
        <div class="bar-fill" id="bar"></div>
        <div class="bar-thresh" id="threshLine"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.75em; color: var(--text-dim);">
        <span>Silence</span>
        <span>Peak / Chime</span>
      </div>
    </div>

    <!-- Trigger History Log -->
    <div class="card" id="triggerCard">
      <div class="card-title">
        <span>Trigger History Log</span>
        <span class="badge badge-ok" id="triggerCountBadge">0 Recorded</span>
      </div>
      <div style="font-size: 0.8em; color: var(--text-dim); margin-bottom: 6px;">
        Chronological log of recent alerts (Max 40 - Oldest auto-overwritten)
      </div>
      <div class="log-table-wrap" style="max-height: 200px;">
        <table class="log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Peak Audio</th>
              <th>Threshold</th>
              <th>Color</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody id="triggerLogBody">
            <tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No alerts triggered yet</td></tr>
          </tbody>
        </table>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <button class="btn-test btn-sm" onclick="fetchTriggerLog()">Refresh</button>
        <button class="btn-test btn-sm" onclick="clearTriggerLog()">Clear History</button>
      </div>
    </div>

    <!-- ESP-NOW Traffic Inspector -->
    <div class="card" id="espnowCard">
      <div class="card-title">
        <span>ESP-NOW Traffic Inspector</span>
        <button class="btn-test btn-sm" onclick="fetchEspNowLog()">Refresh</button>
      </div>
      <div class="flex-row" style="font-size:0.8em; color:var(--text-dim); margin-bottom:6px;">
        <div>Total Packets: <strong id="espTotal" style="color:#fff;">0</strong></div>
        <div>Doorbell Msg: <strong id="espValid" style="color:var(--success);">0</strong></div>
        <div>Other Traffic: <strong id="espUnknown" style="color:var(--warn);">0</strong></div>
      </div>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>MAC Address</th>
              <th>Bytes</th>
              <th>Payload Snippet</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody id="espLogBody">
            <tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No ESP-NOW packets logged yet</td></tr>
          </tbody>
        </table>
      </div>
      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
        <button class="btn-test btn-sm" onclick="clearEspNowLog()">Clear Log</button>
      </div>
    </div>
  </div>

  <script>
    let graphView = 'live';
    let history24hPoints = [];
    let last24hFetchMs = 0;
    const MAX_GRAPH_POINTS = 50;
    const historyBuffer = [];
    let currentThreshold = 2500;

    function getTimeStamp() {
      const now = new Date();
      return now.toTimeString().split(' ')[0];
    }

    function formatAge(sec) {
      if (sec < 60) return sec + 's ago';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      return hr + 'h ' + (min % 60) + 'm ago';
    }

    function setGraphView(view) {
      graphView = view;
      document.getElementById('btnViewLive').classList.toggle('active', view === 'live');
      document.getElementById('btnView24h').classList.toggle('active', view === '24h');
      document.getElementById('graphXLabel').innerText = (view === 'live') ? 'X: Real-Time Audio (Last 60s)' : 'X: 24-Hour Timeline (Minutes Ago)';
      if (view === '24h') fetch24hHistory();
      else renderSoundGraph();
    }

    function renderSoundGraph() {
      const cvs = document.getElementById('soundCanvas');
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const w = cvs.width;
      const h = cvs.height;

      const pLeft = 45, pRight = 15, pTop = 15, pBottom = 30;
      const plotW = w - pLeft - pRight;
      const plotH = h - pTop - pBottom;

      ctx.fillStyle = '#0f141c';
      ctx.fillRect(0, 0, w, h);

      if (graphView === 'live') {
        if (historyBuffer.length === 0) return;
        let maxMad = 10000;
        for (const p of historyBuffer) {
          if (p.mad > maxMad) maxMad = p.mad;
          if (p.threshold > maxMad) maxMad = p.threshold;
        }
        maxMad = Math.ceil(maxMad / 5000) * 5000;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'right';

        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
          const val = (maxMad / ySteps) * i;
          const y = h - pBottom - (plotH * (i / ySteps));
          ctx.beginPath();
          ctx.moveTo(pLeft, y);
          ctx.lineTo(w - pRight, y);
          ctx.stroke();
          let label = val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val;
          ctx.fillText(label, pLeft - 6, y + 3);
        }

        ctx.textAlign = 'center';
        const pointCount = historyBuffer.length;
        const stepX = plotW / Math.max(1, pointCount - 1);
        const labelInterval = Math.max(1, Math.floor(pointCount / 5));
        for (let i = 0; i < pointCount; i += labelInterval) {
          const x = pLeft + (i * stepX);
          ctx.fillText(historyBuffer[i].time, x, h - 10);
        }

        const threshY = h - pBottom - (plotH * Math.min(1.0, currentThreshold / maxMad));
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pLeft, threshY);
        ctx.lineTo(w - pRight, threshY);
        ctx.stroke();
        ctx.restore();

        const fillGrad = ctx.createLinearGradient(0, pTop, 0, h - pBottom);
        fillGrad.addColorStop(0, 'rgba(0, 229, 255, 0.45)');
        fillGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.25)');
        fillGrad.addColorStop(1, 'rgba(15, 20, 28, 0.0)');

        ctx.beginPath();
        ctx.moveTo(pLeft, h - pBottom);
        for (let i = 0; i < pointCount; i++) {
          const x = pLeft + (i * stepX);
          const yRatio = Math.min(1.0, historyBuffer[i].mad / maxMad);
          const y = h - pBottom - (plotH * yRatio);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(pLeft + ((pointCount - 1) * stepX), h - pBottom);
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();

        ctx.beginPath();
        for (let i = 0; i < pointCount; i++) {
          const x = pLeft + (i * stepX);
          const yRatio = Math.min(1.0, historyBuffer[i].mad / maxMad);
          const y = h - pBottom - (plotH * yRatio);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        for (let i = 0; i < pointCount; i++) {
          if (historyBuffer[i].triggered || historyBuffer[i].mad >= historyBuffer[i].threshold) {
            const x = pLeft + (i * stepX);
            const yRatio = Math.min(1.0, historyBuffer[i].mad / maxMad);
            const y = h - pBottom - (plotH * yRatio);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ff007f';
            ctx.shadowColor = '#ff007f';
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      } else {
        let maxMad = Math.max(10000, currentThreshold);
        for (const pt of history24hPoints) {
          if (pt[1] > maxMad) maxMad = pt[1];
        }
        maxMad = Math.ceil(maxMad / 5000) * 5000;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'right';

        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
          const val = (maxMad / ySteps) * i;
          const y = h - pBottom - (plotH * (i / ySteps));
          ctx.beginPath();
          ctx.moveTo(pLeft, y);
          ctx.lineTo(w - pRight, y);
          ctx.stroke();
          let label = val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val;
          ctx.fillText(label, pLeft - 6, y + 3);
        }

        ctx.textAlign = 'center';
        const xTicks = [
          { label: '24h ago', frac: 0.0 },
          { label: '18h ago', frac: 0.25 },
          { label: '12h ago', frac: 0.50 },
          { label: '6h ago',  frac: 0.75 },
          { label: 'Now',     frac: 1.0 }
        ];
        xTicks.forEach(t => {
          ctx.fillText(t.label, pLeft + (t.frac * plotW), h - 10);
        });

        const threshY = h - pBottom - (plotH * Math.min(1.0, currentThreshold / maxMad));
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pLeft, threshY);
        ctx.lineTo(w - pRight, threshY);
        ctx.stroke();
        ctx.restore();

        if (history24hPoints.length === 0) {
          ctx.fillStyle = '#8b949e';
          ctx.textAlign = 'center';
          ctx.fillText('Collecting 24-hour audio history... Check back shortly.', w / 2, h / 2);
          return;
        }

        const count = history24hPoints.length;
        const totalSpan = 1440;
        ctx.beginPath();
        ctx.moveTo(pLeft, h - pBottom);
        for (let i = 0; i < count; i++) {
          const minsAgo = history24hPoints[i][0];
          const peakVal = history24hPoints[i][1];
          const fracX = Math.max(0, Math.min(1.0, (1440 - minsAgo) / totalSpan));
          const x = pLeft + (fracX * plotW);
          const y = h - pBottom - (plotH * Math.min(1.0, peakVal / maxMad));
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w - pRight, h - pBottom);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, pTop, 0, h - pBottom);
        fillGrad.addColorStop(0, 'rgba(0, 229, 255, 0.40)');
        fillGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.20)');
        fillGrad.addColorStop(1, 'rgba(15, 20, 28, 0.0)');
        ctx.fillStyle = fillGrad;
        ctx.fill();

        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const minsAgo = history24hPoints[i][0];
          const peakVal = history24hPoints[i][1];
          const fracX = Math.max(0, Math.min(1.0, (1440 - minsAgo) / totalSpan));
          const x = pLeft + (fracX * plotW);
          const y = h - pBottom - (plotH * Math.min(1.0, peakVal / maxMad));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
    }

    function fetch24hHistory() {
      fetch('/history').then(r => r.json()).then(d => {
        history24hPoints = d.points || [];
        renderSoundGraph();
        last24hFetchMs = Date.now();
      }).catch(() => {});
    }

    function fetchTriggerLog() {
      fetch('/triggers').then(r => r.json()).then(d => {
        const total = d.total || 0;
        document.getElementById('triggerCountBadge').innerText = total + ' Recorded';
        const tbody = document.getElementById('triggerLogBody');
        if (!d.triggers || d.triggers.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No alerts triggered yet</td></tr>';
          return;
        }
        let html = '';
        d.triggers.forEach(t => {
          const badgeClass = t.isTest ? 'badge-info' : 'badge-party';
          const badgeText = t.isTest ? 'MANUAL TEST' : 'DOORBELL CHIME';
          html += `<tr>
            <td>${formatAge(t.ageSec)}</td>
            <td><strong>${t.mad}</strong></td>
            <td style="color:var(--text-dim);">${t.thresh}</td>
            <td><span class="color-swatch" style="background:${t.color};"></span><code>${t.color}</code></td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          </tr>`;
        });
        tbody.innerHTML = html;
      }).catch(() => {});
    }

    function clearTriggerLog() {
      fetch('/triggers/clear').then(() => fetchTriggerLog());
    }

    function fetchEspNowLog() {
      fetch('/espnow').then(r => r.json()).then(d => {
        document.getElementById('espTotal').innerText = d.total;
        document.getElementById('espValid').innerText = d.doorbell;
        document.getElementById('espUnknown').innerText = d.unknown;
        const tbody = document.getElementById('espLogBody');
        if (!d.logs || d.logs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No ESP-NOW packets logged yet</td></tr>';
          return;
        }
        let html = '';
        d.logs.forEach(l => {
          const badgeClass = l.isDoorbell ? 'badge-ok' : 'badge-warn';
          const badgeText = l.isDoorbell ? 'DOORBELL 0x01' : 'OTHER ESPNOW';
          html += `<tr>
            <td>${formatAge(l.timeAgoSec)}</td>
            <td><code>${l.mac}</code></td>
            <td>${l.len} B</td>
            <td><code>${l.payload}</code></td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          </tr>`;
        });
        tbody.innerHTML = html;
      }).catch(() => {});
    }

    function clearEspNowLog() {
      fetch('/espnow/clear').then(() => fetchEspNowLog());
    }

    function pollData() {
      fetch('/data').then(r => r.json()).then(d => {
        const madVal = Math.round(d.mad);
        document.getElementById('rmsVal').innerText = madVal;
        document.getElementById('graphCurrentMad').innerText = 'MAD: ' + madVal;

        if (d.threshold !== undefined) {
          currentThreshold = d.threshold;
          const pct = Math.min(100, (currentThreshold / 30000) * 100);
          document.getElementById('threshLine').style.left = pct + '%';
        }

        const pct = Math.min(100, (d.mad / 30000) * 100);
        document.getElementById('bar').style.width = pct + '%';

        historyBuffer.push({
          time: getTimeStamp(),
          mad: d.mad,
          threshold: d.threshold,
          triggered: d.triggered
        });
        if (historyBuffer.length > MAX_GRAPH_POINTS) historyBuffer.shift();

        if (graphView === 'live') renderSoundGraph();
        else if (Date.now() - last24hFetchMs > 30000) fetch24hHistory();

        if (d.espTotal !== undefined) {
          document.getElementById('espTotal').innerText = d.espTotal;
          document.getElementById('espValid').innerText = d.espValid;
          document.getElementById('espUnknown').innerText = d.espUnknown;
        }

        if (d.triggered) {
          document.getElementById('liveCard').classList.add('triggered-flash');
          setTimeout(() => document.getElementById('liveCard').classList.remove('triggered-flash'), 400);
          fetchTriggerLog();
          if (graphView === '24h') fetch24hHistory();
        }
      }).catch(() => {}).finally(() => {
        setTimeout(pollData, 180);
      });
    }

    fetchEspNowLog();
    fetchTriggerLog();
    pollData();
  </script>
</body>
</html>
)rawliteral";
