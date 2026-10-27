#pragma once
#include <Arduino.h>

const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DeafDoorbell Follower Studio</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <style>
    :root {
      --bg-base: #0c0c0c;
      --bg-surface: #151515;
      --bg-card: #1c1c1c;
      --bg-card-hover: #242424;
      --bg-card-active: #2a2a2a;
      --border-subtle: #292929;
      --border-hover: #404040;
      --border-active: #707070;
      --text-main: #f2f2f2;
      --text-secondary: #a0a0a0;
      --text-muted: #666666;
      --accent: #00e5ff;
      --btn-radius: 8px;
      --card-radius: 12px;
      --sim-color: #00e5ff;
      --sim-rgb: 0, 229, 255;
      --sim-brightness: 0.7;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-base);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px 16px 28px;
    }
    .app-header {
      width: 100%;
      max-width: 1040px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0 12px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 14px;
    }
    .nav-back-link {
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--accent);
      text-decoration: none;
      padding: 6px 12px;
      border-radius: var(--btn-radius);
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      transition: all 0.15s ease;
    }
    .nav-back-link:hover { color: #fff; border-color: var(--border-hover); background: var(--bg-card); }
    .header-title { font-size: 0.95rem; font-weight: 600; color: var(--text-main); }
    
    .studio-layout {
      width: 100%;
      max-width: 1040px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    @media (min-width: 768px) {
      .studio-layout {
        display: grid;
        grid-template-columns: 1fr 1.15fr;
        gap: 16px;
        align-items: stretch;
      }
    }

    .preview-column {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
    }
    .simulator-stage {
      position: relative;
      width: 100%;
      height: 250px;
      background: #111111;
      border: 1px solid var(--border-subtle);
      border-radius: var(--card-radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    @media (min-width: 768px) {
      .simulator-stage {
        flex: 1;
        min-height: 350px;
        height: auto;
      }
    }
    .room-ambient-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.05s linear;
      background: radial-gradient(circle at 50% 48%, rgba(var(--sim-rgb), calc(var(--sim-brightness) * 0.75)) 0%, rgba(var(--sim-rgb), calc(var(--sim-brightness) * 0.3)) 42%, rgba(var(--sim-rgb), calc(var(--sim-brightness) * 0.09)) 68%, transparent 88%);
      z-index: 1;
    }
    .room-ground-line {
      position: absolute;
      bottom: 48px;
      left: 0;
      right: 0;
      height: 1px;
      background: #202020;
      z-index: 2;
    }
    .room-ground-surface {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 48px;
      background: #0d0d0d;
      border-top: 1px solid #1a1a1a;
      z-index: 2;
    }
    .room-reflection-glow {
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 360px;
      height: 46px;
      background: radial-gradient(ellipse at 50% 0%, rgba(var(--sim-rgb), calc(var(--sim-brightness) * 0.5)) 0%, transparent 75%);
      opacity: 0;
      transition: opacity 0.05s linear;
      pointer-events: none;
      z-index: 3;
    }
    .enclosure-wrapper {
      position: relative;
      z-index: 5;
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translateY(6px);
    }
    .enclosure-body {
      width: 170px;
      height: 170px;
      background: #181818;
      border: 2px solid #282828;
      border-radius: 14px;
      padding: 8px;
      box-shadow: 0 16px 32px -8px rgba(0, 0, 0, 0.95), inset 0 1px 1px rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: width 0.2s ease, height 0.2s ease;
    }
    @media (min-width: 768px) {
      .enclosure-body {
        width: 240px;
        height: 240px;
        padding: 12px;
        border-radius: 18px;
      }
    }
    .diffuser-plate {
      width: 100%;
      height: 100%;
      background: #0a0a0a;
      border-radius: 8px;
      border: 1px solid #1e1e1e;
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      grid-template-rows: repeat(8, 1fr);
      gap: 3px;
      padding: 4px;
      box-sizing: border-box;
      position: relative;
    }
    @media (min-width: 768px) {
      .diffuser-plate { gap: 4.5px; padding: 6px; border-radius: 10px; }
    }
    .matrix-led-cell {
      width: 100%;
      height: 100%;
      aspect-ratio: 1;
      border-radius: 2px;
      background: #070707;
      position: relative;
      transition: background 0.02s linear, box-shadow 0.02s linear;
    }
    @media (min-width: 768px) {
      .matrix-led-cell { border-radius: 3px; }
    }
    .enclosure-stand {
      width: 90px;
      height: 10px;
      background: #121212;
      border-radius: 0 0 4px 4px;
      border: 1px solid #202020;
      border-top: none;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.6);
      margin-top: -1px;
    }
    @media (min-width: 768px) {
      .enclosure-stand { width: 140px; height: 14px; border-radius: 0 0 6px 6px; }
    }

    .action-bar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .btn-trigger {
      background: var(--text-main);
      color: #000000;
      border: none;
      border-radius: var(--btn-radius);
      height: 44px;
      padding: 0 16px;
      font-family: inherit;
      font-size: 0.88rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .btn-trigger:hover { background: #ffffff; box-shadow: 0 0 14px rgba(255, 255, 255, 0.2); }
    .btn-trigger:active { transform: scale(0.98); }
    .btn-trigger.is-ringing { background: #ef4444; color: #ffffff; }
    
    .btn-continuous {
      background: var(--bg-surface);
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--btn-radius);
      height: 44px;
      padding: 0 14px;
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .btn-continuous:hover { background: var(--bg-card); border-color: var(--border-hover); }
    .btn-continuous.active { background: var(--bg-card-active); border-color: var(--border-active); color: var(--text-main); }
    .status-dot-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #404040;
      transition: background 0.2s ease;
    }
    .btn-continuous.active .status-dot-indicator { background: #22c55e; box-shadow: 0 0 6px #22c55e; }

    .controls-column {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .section-panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--card-radius);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .panel-heading {
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .patterns-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    @media (min-width: 480px) and (max-width: 767px) {
      .patterns-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 900px) {
      .patterns-grid { grid-template-columns: repeat(3, 1fr); }
    }
    .pattern-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--btn-radius);
      padding: 8px 10px;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 2px;
      user-select: none;
    }
    .pattern-btn:hover { background: var(--bg-card-hover); border-color: var(--border-hover); }
    .pattern-btn.active { background: var(--bg-card-active); border-color: var(--text-main); }
    .pattern-title { font-size: 0.82rem; font-weight: 600; color: var(--text-main); }
    .pattern-subtext { font-size: 0.68rem; color: var(--text-muted); line-height: 1.25; }

    .adjustments-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 480px) {
      .adjustments-grid { grid-template-columns: 1fr; gap: 8px; }
    }
    .control-item { display: flex; flex-direction: column; gap: 6px; }
    .control-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.78rem;
      color: var(--text-secondary);
    }
    .control-val {
      font-family: 'JetBrains Mono', monospace, sans-serif;
      font-weight: 600;
      color: var(--text-main);
      font-size: 0.75rem;
    }
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      background: #252525;
      border-radius: 3px;
      outline: none;
      cursor: pointer;
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #f2f2f2;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
      cursor: pointer;
      transition: transform 0.1s ease;
    }
    input[type="range"]::-webkit-slider-thumb:active { transform: scale(1.2); }
    input[type="range"]::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 50%;
      background: #f2f2f2;
      cursor: pointer;
    }

    .duration-row { display: flex; gap: 6px; }
    .duration-pill {
      flex: 1;
      padding: 6px 2px;
      text-align: center;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .duration-pill:hover { background: var(--bg-card-hover); }
    .duration-pill.active {
      background: var(--bg-card-active);
      border-color: var(--text-main);
      color: var(--text-main);
    }

    .colors-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .swatch {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease;
      position: relative;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    }
    .swatch:hover { transform: scale(1.1); }
    .swatch.active { border-color: #ffffff; transform: scale(1.12); }
    .swatch.party-swatch { background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); }
    .custom-color-wrap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 4px 10px;
      font-size: 0.75rem;
      color: var(--text-secondary);
      cursor: pointer;
      position: relative;
    }
    .custom-color-wrap input[type="color"] {
      position: absolute;
      opacity: 0;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      cursor: pointer;
    }
    .custom-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--sim-color);
      border: 1px solid rgba(255, 255, 255, 0.4);
    }
    .summary-inline {
      font-family: 'JetBrains Mono', monospace, sans-serif;
      font-size: 0.72rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* System Panels below studio layout */
    .system-sections-wrap {
      width: 100%;
      max-width: 1040px;
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .log-table-wrap {
      max-height: 240px;
      overflow-y: auto;
      margin-top: 6px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: #0f141c;
    }
    table.log-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
    table.log-table th, table.log-table td {
      padding: 6px 10px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    table.log-table th { background: #161b22; color: var(--text-muted); position: sticky; top: 0; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; font-weight: 700; }
    .badge-ok { background: rgba(63,185,80,0.2); color: #3fb950; }
    
    .net-info {
      font-size: 0.82rem;
      color: var(--text-secondary);
      line-height: 1.8;
    }
    .net-info a { color: var(--accent); text-decoration: none; font-weight: 600; }
    .net-info a:hover { text-decoration: underline; }
  </style>
</head>
<body>

  <!-- Minimal Header with Link to Telemetry /log.html -->
  <header class="app-header">
    <h1 class="header-title">DeafDoorbell Follower Studio</h1>
    <a href="/log.html" class="nav-back-link">Telemetry &amp; Logs &rarr;</a>
  </header>

  <!-- Two-Column Studio Layout -->
  <main class="studio-layout">

    <!-- Column 1: Simulator Stage & Action Bar -->
    <section class="preview-column">
      <div class="simulator-stage">
        <div class="room-ambient-layer" id="roomAmbientLayer"></div>
        <div class="room-ground-line"></div>
        <div class="room-ground-surface"></div>
        <div class="room-reflection-glow" id="roomReflectionGlow"></div>

        <div class="enclosure-wrapper">
          <div class="enclosure-body">
            <div class="diffuser-plate" id="matrixGrid"></div>
          </div>
          <div class="enclosure-stand"></div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn-trigger" id="triggerChimeBtn">Test Doorbell Trigger</button>
        <button class="btn-continuous active" id="continuousToggleBtn">
          <span class="status-dot-indicator"></span>
          <span>Live Preview</span>
        </button>
      </div>
    </section>

    <!-- Column 2: Patterns, Sliders, Colors -->
    <section class="controls-column">

      <!-- Pattern Selector -->
      <div class="section-panel">
        <span class="panel-heading">Pattern Selector</span>
        <div class="patterns-grid">
          <div class="pattern-btn active" data-pattern="breathe">
            <span class="pattern-title">Slow Breathe</span>
            <span class="pattern-subtext">Sine fade in/out</span>
          </div>
          <div class="pattern-btn" data-pattern="ripple">
            <span class="pattern-title">Expanding Ripple</span>
            <span class="pattern-subtext">Concentric rings</span>
          </div>
          <div class="pattern-btn" data-pattern="crawl">
            <span class="pattern-title">Snaking Crawl</span>
            <span class="pattern-subtext">Serpentine wave</span>
          </div>
          <div class="pattern-btn" data-pattern="bounce">
            <span class="pattern-title">Bouncing Bar</span>
            <span class="pattern-subtext">Oscillating beam</span>
          </div>
          <div class="pattern-btn" data-pattern="soft_beacon">
            <span class="pattern-title">Soft Beacon</span>
            <span class="pattern-subtext">Smooth pulse</span>
          </div>
          <div class="pattern-btn" data-pattern="strobe">
            <span class="pattern-title">Classic Strobe</span>
            <span class="pattern-subtext">100ms on/off</span>
          </div>
        </div>
      </div>

      <!-- Parameters Sliders -->
      <div class="section-panel">
        <span class="panel-heading">Parameters</span>
        <div class="adjustments-grid">
          <div class="control-item">
            <div class="control-label-row">
              <span>Brightness</span>
              <span class="control-val" id="brightnessVal">100%</span>
            </div>
            <input type="range" id="brightnessRange" min="10" max="100" step="5" value="100">
          </div>
          <div class="control-item">
            <div class="control-label-row">
              <span>Speed</span>
              <span class="control-val" id="speedVal">1.0x</span>
            </div>
            <input type="range" id="speedRange" min="0.4" max="2.4" step="0.1" value="1.0">
          </div>
        </div>

        <div class="control-item" style="margin-top: 4px;">
          <div class="control-label-row">
            <span>Alert Duration</span>
            <span class="control-val" id="durationVal">3.0s</span>
          </div>
          <div class="duration-row" id="durationRow">
            <div class="duration-pill" data-seconds="1.5">1.5s</div>
            <div class="duration-pill active" data-seconds="3.0">3.0s</div>
            <div class="duration-pill" data-seconds="5.0">5.0s</div>
            <div class="duration-pill" data-seconds="8.0">8.0s</div>
            <div class="duration-pill" data-seconds="10.0">10s</div>
          </div>
        </div>
      </div>

      <!-- Color Palette -->
      <div class="section-panel">
        <span class="panel-heading">Color</span>
        <div class="colors-row">
          <button class="swatch" data-color="#ff9e1b" style="background:#ff9e1b;" title="Amber"></button>
          <button class="swatch active" data-color="#00e5ff" style="background:#00e5ff;" title="Cyan"></button>
          <button class="swatch" data-color="#fff2e0" style="background:#fff2e0;" title="Warm White"></button>
          <button class="swatch" data-color="#ff2a7a" style="background:#ff2a7a;" title="Rose"></button>
          <button class="swatch" data-color="#10e77f" style="background:#10e77f;" title="Emerald"></button>
          <button class="swatch" data-color="#a855f7" style="background:#a855f7;" title="Violet"></button>
          <button class="swatch party-swatch" id="partyColorBtn" title="Rainbow Spectrum"></button>
          <label class="custom-color-wrap">
            <span class="custom-dot" id="customDot"></span>
            <span>Custom</span>
            <input type="color" id="nativeColorPicker" value="#00e5ff">
          </label>
        </div>
      </div>

      <!-- Summary Bar -->
      <div class="section-panel" style="padding: 10px 14px;">
        <span class="summary-inline" id="summaryInline">Slow Breathe &bull; 100% &bull; 1.0x &bull; 3.0s &bull; #00E5FF</span>
      </div>

    </section>
  </main>

  <!-- System Setup Sections below studio -->
  <div class="system-sections-wrap">

    <!-- Audio Trigger Threshold -->
    <div class="section-panel">
      <div class="control-label-row">
        <span class="panel-heading" style="margin:0;">Trigger Threshold (Sensitivity)</span>
        <div style="display:flex; gap:10px; align-items:center;">
          <span class="control-val" id="liveMicVal" style="color:var(--accent);">Mic: 0 MAD</span>
          <span class="control-val" id="threshVal">Thresh: 2500 MAD</span>
        </div>
      </div>
      <div style="font-size:0.75rem; color:var(--text-muted);">Live microphone level vs. trigger threshold (drag slider above ambient noise, below chime peak)</div>
      <div style="position:relative; height:14px; background:#141820; border:1px solid var(--border-subtle); border-radius:7px; overflow:hidden; margin-top:4px;">
        <div id="liveMicBar" style="height:100%; width:0%; background:linear-gradient(90deg, #00e5ff 0%, #a855f7 65%, #ff007f 100%); transition:width 0.08s linear; border-radius:7px;"></div>
        <div id="liveThreshMarker" style="position:absolute; top:0; bottom:0; width:3px; left:8.3%; background:#eab308; box-shadow:0 0 8px #eab308; z-index:2;"></div>
      </div>
      <input type="range" id="threshRange" min="200" max="30000" step="100" value="2500" style="margin-top:4px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; gap:8px; flex-wrap:wrap;">
        <span style="font-size:0.75rem; color:var(--text-secondary);">Debounce Window (Sustained Chunks Required):</span>
        <select id="debounceSelect" onchange="triggerAutoSave(true)" style="padding:5px 10px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:6px; color:#fff; font-size:0.8rem;">
          <option value="1">1 Chunk (3.2ms Instant - Taps &amp; Knocks)</option>
          <option value="2" selected>2 Chunks (6.4ms Fast - Default)</option>
          <option value="3">3 Chunks (9.6ms Standard Chime)</option>
          <option value="5">5 Chunks (16ms Strict Sustained)</option>
        </select>
      </div>
    </div>

    <!-- House Network & Trigger Areas -->
    <div class="section-panel">
      <span class="panel-heading">House Network &amp; Trigger Areas</span>
      <div style="font-size:0.75rem; color:var(--text-muted);">House Network Key (Prevents neighbor cross-talk)</div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="netIdInput" maxlength="4" style="flex:1; padding:8px 12px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:6px; color:var(--accent); font-family:monospace; font-size:1rem; font-weight:700; text-transform:uppercase;">
        <button class="btn-test" onclick="generateRandomNetId()">New Key</button>
      </div>

      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">Trigger Area (This Leader's Assigned Zone)</div>
      <select id="leaderZoneSelect" style="width:100%; padding:9px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:6px; color:#fff; font-size:0.85rem;" onchange="triggerAutoSave(true)">
        <option value="1">Area 1 - Front Door</option>
        <option value="2">Area 2 - Back Door</option>
        <option value="3">Area 3 - Side Gate</option>
        <option value="4">Area 4 - Garage / Service</option>
      </select>

      <div style="border-top:1px solid var(--border-subtle); padding-top:10px; margin-top:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Follower Pairing</span>
          <span id="pairStatusBadge" style="font-size:0.72rem; padding:2px 8px; border-radius:12px; background:var(--bg-card); color:var(--text-muted);">Idle</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
          Unpaired followers ripple orange on their 8x8 matrix. Click below to pair them in 1 click.
        </div>
        <button id="btnPairToggle" class="btn-trigger" style="background:#238636; color:#fff; font-size:0.82rem; height:38px;" onclick="togglePairingMode()">Open Pairing Mode (60s)</button>
      </div>
    </div>

    <!-- Paired Followers & Trigger Points -->
    <div class="section-panel" id="pairedDevicesCard">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="panel-heading" style="margin:0;">Paired Followers &amp; Trigger Points</span>
        <span id="pairedCountBadge" class="badge badge-ok">0 Devices</span>
      </div>
      <div style="font-size:0.75rem; color:var(--text-muted);">
        Assign each follower to a specific trigger area or respond to all doorbell chimes.
      </div>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead>
            <tr>
              <th>Follower MAC</th>
              <th>Assigned Trigger Point</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody id="followersTableBody">
            <tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:16px;">No paired followers yet. Hold follower Boot button for 3s to enter pairing mode, then click Open Pairing Mode above.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Device Information / Update -->
    <div class="section-panel" id="networkCard">
      <span class="panel-heading">Device Information / Update</span>
      <div class="net-info">
        <div><strong>Telemetry &amp; Diagnostics:</strong> <a href="/log.html">View Audio &amp; RF Telemetry (/log.html) &rarr;</a></div>
        <div><strong>WiFi SSID:</strong> <span style="color:#fff; font-weight:bold;">LeeDoorBell</span> (Pass: <code style="color:var(--accent);">shrek1234!</code>)</div>
        <div><strong>Local IP:</strong> 192.168.4.1</div>
        <div><strong>mDNS URL:</strong> <a id="mdnsLink" href="http://deafdoorbell.local" target="_blank">http://deafdoorbell.local</a></div>
        <div><strong>Firmware Update:</strong> <a href="/update" target="_blank">Web Firmware Update (/update)</a></div>
      </div>
    </div>

  </div>

  <script>
    const PATTERN_KEYS = ['breathe', 'ripple', 'crawl', 'bounce', 'soft_beacon', 'strobe'];
    const patternNames = {
      breathe: 'Slow Breathe',
      ripple: 'Expanding Ripple',
      crawl: 'Snaking Crawl',
      bounce: 'Bouncing Bar',
      soft_beacon: 'Soft Beacon',
      strobe: 'Classic Strobe'
    };

    const state = {
      pattern: 'breathe',
      brightness: 100,
      speed: 1.0,
      duration: 3.0,
      color: '#00e5ff',
      rgb: [0, 229, 255],
      isParty: false,
      isContinuous: true,
      isTriggerActive: false,
      triggerStartTime: 0
    };

    function hexToRgb(hex) {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const num = parseInt(h, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    function hsvToRgb(h, s, v) {
      let r, g, b;
      let i = Math.floor(h * 6);
      let f = h * 6 - i;
      let p = v * (1 - s);
      let q = v * (1 - f * s);
      let t = v * (1 - (1 - f) * s);
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    const matrixGrid = document.getElementById('matrixGrid');
    const roomAmbientLayer = document.getElementById('roomAmbientLayer');
    const roomReflectionGlow = document.getElementById('roomReflectionGlow');
    const triggerChimeBtn = document.getElementById('triggerChimeBtn');
    const continuousToggleBtn = document.getElementById('continuousToggleBtn');
    const brightnessRange = document.getElementById('brightnessRange');
    const brightnessVal = document.getElementById('brightnessVal');
    const speedRange = document.getElementById('speedRange');
    const speedVal = document.getElementById('speedVal');
    const durationRow = document.getElementById('durationRow');
    const durationVal = document.getElementById('durationVal');
    const nativeColorPicker = document.getElementById('nativeColorPicker');
    const customDot = document.getElementById('customDot');
    const partyColorBtn = document.getElementById('partyColorBtn');
    const swatches = document.querySelectorAll('.swatch');
    const patternBtns = document.querySelectorAll('.pattern-btn');
    const summaryInline = document.getElementById('summaryInline');

    // Build 64 LED Matrix cells
    const ledCells = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const cell = document.createElement('div');
        cell.className = 'matrix-led-cell';
        matrixGrid.appendChild(cell);
        ledCells.push({ el: cell, x, y });
      }
    }

    function updateTheme() {
      const briFactor = 0.35 + 0.65 * (state.brightness / 100);
      document.documentElement.style.setProperty('--sim-color', state.color);
      document.documentElement.style.setProperty('--sim-rgb', state.rgb.join(', '));
      document.documentElement.style.setProperty('--sim-brightness', briFactor);
      if (customDot) customDot.style.background = state.color;
      const colorLabel = state.isParty ? 'Rainbow Spectrum' : state.color.toUpperCase();
      summaryInline.innerText = `${patternNames[state.pattern] || state.pattern} \u2022 ${state.brightness}% \u2022 ${state.speed.toFixed(1)}x \u2022 ${state.duration.toFixed(1)}s \u2022 ${colorLabel}`;
    }

    // Pattern simulation & spatial hue offset function (matches Follower Animations.h)
    function computePixelSample(pattern, x, y, timeSec, speed) {
      const t = timeSec * speed;
      const dx = x - 3.5;
      const dy = y - 3.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let val = 0.0;
      let hueOffset = 0.0;

      switch (pattern) {
        case 'breathe': {
          const raw = Math.cos(t * Math.PI * 1.5);
          val = Math.pow((raw + 1) / 2, 1.8);
          hueOffset = (dist * 14) / 255;
          break;
        }
        case 'ripple': {
          const wave = Math.cos((dist * 1.5) - (t * 5.5));
          val = Math.pow(Math.max(0, wave), 2.2);
          hueOffset = -(dist * 28) / 255;
          break;
        }
        case 'crawl': {
          const serpentine = (y % 2 === 0) ? (y * 8 + x) : (y * 8 + (7 - x));
          const comet = (t * 28.0 + 14.0) % 64;
          const diff = (comet - serpentine + 64) % 64;
          val = diff < 14 ? Math.pow(1 - (diff / 14), 2.0) : 0.0;
          hueOffset = -(diff * 12) / 255;
          break;
        }
        case 'bounce': {
          const barY = 3.5 + 3.2 * Math.sin(t * Math.PI * 1.8);
          const distY = Math.abs(y - barY);
          val = Math.exp(-Math.pow(distY, 2) / 1.5);
          hueOffset = (x * 16 + y * 10) / 255;
          break;
        }
        case 'soft_beacon': {
          const cycle = (t * 1.6 + 0.25) % 1.0;
          val = (cycle < 0.25) ? Math.sin((cycle / 0.25) * (Math.PI / 2)) : Math.cos(((cycle - 0.25) / 0.75) * (Math.PI / 2));
          val = Math.pow(Math.max(0, val), 1.5);
          hueOffset = (dist * 16) / 255;
          break;
        }
        case 'strobe': {
          const cycleMs = (timeSec * 1000) % 200;
          val = cycleMs < 100 ? 1.0 : 0.0;
          hueOffset = ((Math.floor((timeSec * 1000) / 200) * 73) + (x + y) * 6) / 255;
          break;
        }
        default:
          val = 1.0;
      }
      return { val: Math.min(1.0, Math.max(0.0, val)), hueOffset };
    }

    // High-brightness HDR LED Matrix Render Loop
    function render(now) {
      const timeSec = now / 1000;
      let active = false;

      if (state.isContinuous) {
        active = true;
      } else if (state.isTriggerActive) {
        const elapsed = (now - state.triggerStartTime) / 1000;
        if (elapsed < state.duration) {
          active = true;
          const rem = Math.max(0, state.duration - elapsed);
          triggerChimeBtn.innerText = `Ringing (${rem.toFixed(1)}s)`;
        } else {
          state.isTriggerActive = false;
          triggerChimeBtn.classList.remove('is-ringing');
          triggerChimeBtn.innerText = 'Test Doorbell Trigger';
        }
      }

      const basePartyHue = (timeSec * 0.55 * state.speed) % 1.0;
      if (state.isParty && active) {
        const ambRgb = hsvToRgb(basePartyHue, 0.95, 1.0);
        document.documentElement.style.setProperty('--sim-rgb', `${ambRgb[0]}, ${ambRgb[1]}, ${ambRgb[2]}`);
      }

      const briScale = 0.25 + 0.75 * (state.brightness / 100);
      let lumSum = 0;

      if (active) {
        for (let i = 0; i < 64; i++) {
          const cell = ledCells[i];
          const sample = computePixelSample(state.pattern, cell.x, cell.y, timeSec, state.speed);
          const effBri = sample.val * briScale;
          lumSum += effBri;

          if (effBri > 0.015) {
            let pR = state.rgb[0], pG = state.rgb[1], pB = state.rgb[2];
            if (state.isParty) {
              const pixHue = ((basePartyHue + sample.hueOffset) % 1.0 + 1.0) % 1.0;
              const pRgb = hsvToRgb(pixHue, 0.94, 1.0);
              pR = pRgb[0]; pG = pRgb[1]; pB = pRgb[2];
            }

            // Perceptual gamma lift + white-hot LED emitter core
            const displayBri = Math.pow(effBri, 0.52);
            const r = Math.min(255, Math.round(pR * displayBri));
            const g = Math.min(255, Math.round(pG * displayBri));
            const b = Math.min(255, Math.round(pB * displayBri));

            const hotCore = Math.pow(displayBri, 1.45) * 0.68;
            const cR = Math.min(255, Math.round(r + (255 - r) * hotCore));
            const cG = Math.min(255, Math.round(g + (255 - g) * hotCore));
            const cB = Math.min(255, Math.round(b + (255 - b) * hotCore));

            cell.el.style.background = `radial-gradient(circle at 50% 50%, rgb(${cR}, ${cG}, ${cB}) 0%, rgb(${r}, ${g}, ${b}) 70%)`;
            const glow = Math.round(6 + 16 * displayBri);
            cell.el.style.boxShadow = `0 0 ${glow}px rgba(${pR}, ${pG}, ${pB}, ${Math.min(1.0, displayBri * 0.95)}), inset 0 0 4px rgba(255, 255, 255, ${displayBri * 0.45})`;
          } else {
            cell.el.style.background = '#090909';
            cell.el.style.boxShadow = 'none';
          }
        }
        const avgLum = Math.pow(lumSum / 64, 0.65);
        roomAmbientLayer.style.opacity = Math.min(1.0, avgLum * 1.55);
        roomReflectionGlow.style.opacity = Math.min(1.0, avgLum * 1.35);
      } else {
        for (let i = 0; i < 64; i++) {
          ledCells[i].el.style.background = '#090909';
          ledCells[i].el.style.boxShadow = 'none';
        }
        roomAmbientLayer.style.opacity = '0';
        roomReflectionGlow.style.opacity = '0';
      }
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    // Auto-Save Service (Immediate on click, debounced on sliders)
    let autoSaveTimer = null;
    function triggerAutoSave(immediate = false) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      if (immediate) {
        doAutoSave();
      } else {
        autoSaveTimer = setTimeout(doAutoSave, 250);
      }
    }

    function doAutoSave() {
      const patId = Math.max(0, PATTERN_KEYS.indexOf(state.pattern));
      const durMs = Math.round(state.duration * 1000);
      const bri = state.brightness;
      const spd = state.speed.toFixed(1);
      const party = state.isParty ? '1' : '0';
      const col = state.color.replace('#', '');
      const threshEl = document.getElementById('threshRange');
      const thresh = threshEl ? threshEl.value : 2500;
      const netEl = document.getElementById('netIdInput');
      const net = netEl ? netEl.value : 'A48F';
      const zoneEl = document.getElementById('leaderZoneSelect');
      const zone = zoneEl ? zoneEl.value : 1;
      const debEl = document.getElementById('debounceSelect');
      const deb = debEl ? debEl.value : 2;

      fetch(`/set?threshold=${thresh}&debounce=${deb}&bright=${bri}&duration=${durMs}&party=${party}&color=${col}&pattern=${patId}&speed=${spd}&netId=${net}&leaderId=${zone}`)
        .catch(() => {});
    }

    // Trigger & Continuous
    triggerChimeBtn.addEventListener('click', () => {
      state.isTriggerActive = true;
      state.triggerStartTime = performance.now();
      triggerChimeBtn.classList.add('is-ringing');
      fetch('/test').catch(() => {});
    });

    continuousToggleBtn.addEventListener('click', () => {
      state.isContinuous = !state.isContinuous;
      continuousToggleBtn.classList.toggle('active', state.isContinuous);
    });

    // Pattern buttons
    patternBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        patternBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.pattern = btn.getAttribute('data-pattern');
        updateTheme();
        triggerAutoSave(true);
      });
    });

    // Brightness slider
    brightnessRange.addEventListener('input', (e) => {
      state.brightness = parseInt(e.target.value);
      brightnessVal.innerText = `${state.brightness}%`;
      updateTheme();
      triggerAutoSave(false);
    });

    // Speed slider
    speedRange.addEventListener('input', (e) => {
      state.speed = parseFloat(e.target.value);
      speedVal.innerText = `${state.speed.toFixed(1)}x`;
      updateTheme();
      triggerAutoSave(false);
    });

    // Duration pills
    durationRow.querySelectorAll('.duration-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        durationRow.querySelectorAll('.duration-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.duration = parseFloat(pill.getAttribute('data-seconds'));
        durationVal.innerText = `${state.duration.toFixed(1)}s`;
        updateTheme();
        triggerAutoSave(true);
      });
    });

    // Color Swatches
    swatches.forEach(s => {
      s.addEventListener('click', () => {
        if (s.id === 'partyColorBtn') {
          state.isParty = true;
          swatches.forEach(b => b.classList.remove('active'));
          s.classList.add('active');
        } else {
          state.isParty = false;
          const c = s.getAttribute('data-color');
          state.color = c;
          state.rgb = hexToRgb(c);
          nativeColorPicker.value = c;
          swatches.forEach(b => b.classList.remove('active'));
          s.classList.add('active');
        }
        updateTheme();
        triggerAutoSave(true);
      });
    });

    // Native Color Picker
    nativeColorPicker.addEventListener('input', (e) => {
      state.isParty = false;
      state.color = e.target.value;
      state.rgb = hexToRgb(e.target.value);
      swatches.forEach(b => b.classList.remove('active'));
      updateTheme();
      triggerAutoSave(false);
    });

    // Threshold Range & Live Mic Meter
    const threshRange = document.getElementById('threshRange');
    const threshVal = document.getElementById('threshVal');
    const liveMicBar = document.getElementById('liveMicBar');
    const liveMicVal = document.getElementById('liveMicVal');
    const liveThreshMarker = document.getElementById('liveThreshMarker');

    function updateThreshMarker(val) {
      if (liveThreshMarker) {
        const pct = Math.min(100, Math.max(0, (val / 30000) * 100));
        liveThreshMarker.style.left = pct + '%';
      }
    }

    threshRange.addEventListener('input', (e) => {
      threshVal.innerText = `Thresh: ${e.target.value} MAD`;
      updateThreshMarker(parseInt(e.target.value));
      triggerAutoSave(false);
    });

    // Net ID Input
    const netIdInput = document.getElementById('netIdInput');
    netIdInput.addEventListener('change', () => triggerAutoSave(true));

    function generateRandomNetId() {
      const hex = Math.floor(0x1000 + Math.random() * 0xEFFF).toString(16).toUpperCase();
      netIdInput.value = hex;
      triggerAutoSave(true);
    }

    // Follower Area & Pairing Helpers
    function updateFollowerArea(mac, area) {
      fetch('/setFollowerArea?mac=' + encodeURIComponent(mac) + '&area=' + area).catch(() => {});
    }

    function formatAge(sec) {
      if (sec < 60) return sec + 's ago';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      return hr + 'h ' + (min % 60) + 'm ago';
    }

    let lastFollowersJson = '';
    function renderFollowersList(followers) {
      if (!followers) return;
      const tbody = document.getElementById('followersTableBody');
      const badge = document.getElementById('pairedCountBadge');
      if (badge) badge.innerText = followers.length + ' Devices';
      if (!tbody) return;

      if (followers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:16px;">No paired followers yet. Hold follower Boot button for 3s to enter pairing mode, then click Open Pairing Mode above.</td></tr>';
        lastFollowersJson = '';
        return;
      }

      if (document.activeElement && document.activeElement.classList.contains('follower-area-select')) {
        followers.forEach(f => {
          const ageEl = document.getElementById('age-' + f.mac.replace(/:/g, ''));
          if (ageEl) ageEl.innerText = formatAge(f.ageSec);
        });
        return;
      }

      const currentJson = JSON.stringify(followers.map(f => ({mac: f.mac, area: f.area})));
      if (currentJson === lastFollowersJson) {
        followers.forEach(f => {
          const ageEl = document.getElementById('age-' + f.mac.replace(/:/g, ''));
          if (ageEl) ageEl.innerText = formatAge(f.ageSec);
        });
        return;
      }
      lastFollowersJson = currentJson;

      let html = '';
      followers.forEach(f => {
        const cleanId = f.mac.replace(/:/g, '');
        html += `<tr>
          <td><code style="color:var(--accent); font-weight:700;">${f.mac}</code></td>
          <td>
            <select class="follower-area-select" onchange="updateFollowerArea('${f.mac}', this.value)" style="padding:4px 8px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:6px; color:#fff; font-size:0.82rem;">
              <option value="0"${f.area === 0 ? ' selected' : ''}>All Trigger Areas</option>
              <option value="1"${f.area === 1 ? ' selected' : ''}>Area 1 - Front Door</option>
              <option value="2"${f.area === 2 ? ' selected' : ''}>Area 2 - Back Door</option>
              <option value="3"${f.area === 3 ? ' selected' : ''}>Area 3 - Side Gate</option>
              <option value="4"${f.area === 4 ? ' selected' : ''}>Area 4 - Garage / Service</option>
            </select>
          </td>
          <td><span id="age-${cleanId}" style="color:var(--text-muted); font-size:0.75rem;">${formatAge(f.ageSec)}</span></td>
        </tr>`;
      });
      tbody.innerHTML = html;
    }

    let isPairingLocal = false;
    function togglePairingMode() {
      isPairingLocal = !isPairingLocal;
      fetch('/pair?enable=' + (isPairingLocal ? '1' : '0'))
        .then(r => r.json())
        .then(d => {
          isPairingLocal = d.active;
          updatePairingBadge(d.active, d.secLeft, d.count);
          if (d.followers !== undefined) renderFollowersList(d.followers);
        });
    }

    function updatePairingBadge(active, secLeft, count) {
      const btn = document.getElementById('btnPairToggle');
      const badge = document.getElementById('pairStatusBadge');
      if (active) {
        btn.innerText = 'Pairing Active (' + secLeft + 's) - Stop';
        btn.style.background = '#da3633';
        badge.innerText = 'Listening for beacons (' + secLeft + 's)';
        badge.style.color = '#3fb950';
        badge.style.background = 'rgba(63, 185, 80, 0.15)';
      } else {
        btn.innerText = 'Open Pairing Mode (60s)';
        btn.style.background = '#238636';
        badge.innerText = 'Idle';
        badge.style.color = '#8b949e';
        badge.style.background = 'var(--bg-card)';
      }
    }

    // Polling Leader State
    let initialized = false;
    function pollData() {
      fetch('/data').then(r => r.json()).then(d => {
        if (!initialized) {
          state.brightness = d.brightness !== undefined ? d.brightness : 100;
          state.speed = d.speed !== undefined ? parseFloat(d.speed) : 1.0;
          state.duration = d.duration !== undefined ? (d.duration / 1000.0) : 3.0;
          state.isParty = d.party === true;
          if (d.color) {
            state.color = d.color;
            state.rgb = hexToRgb(d.color);
            nativeColorPicker.value = d.color;
          }
          if (d.pattern !== undefined && PATTERN_KEYS[d.pattern]) {
            state.pattern = PATTERN_KEYS[d.pattern];
          }

          brightnessRange.value = state.brightness;
          brightnessVal.innerText = `${state.brightness}%`;
          speedRange.value = state.speed;
          speedVal.innerText = `${state.speed.toFixed(1)}x`;
          durationVal.innerText = `${state.duration.toFixed(1)}s`;
          durationRow.querySelectorAll('.duration-pill').forEach(pill => {
            pill.classList.toggle('active', Math.abs(parseFloat(pill.getAttribute('data-seconds')) - state.duration) < 0.1);
          });
          swatches.forEach(s => {
            if (s.id === 'partyColorBtn') s.classList.toggle('active', state.isParty);
            else s.classList.toggle('active', !state.isParty && s.getAttribute('data-color') === state.color);
          });
          patternBtns.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-pattern') === state.pattern);
          });
          if (d.threshold !== undefined) {
            threshRange.value = d.threshold;
            threshVal.innerText = `Thresh: ${d.threshold} MAD`;
            updateThreshMarker(d.threshold);
          }
          if (d.debounce !== undefined) {
            const debEl = document.getElementById('debounceSelect');
            if (debEl) debEl.value = d.debounce;
          }
          if (d.netId !== undefined) {
            netIdInput.value = d.netId;
          }
          if (d.leaderId !== undefined) {
            document.getElementById('leaderZoneSelect').value = d.leaderId;
          }
          updateTheme();
          initialized = true;
        }

        // Update inline live microphone bar on Studio page
        if (d.mad !== undefined) {
          const madVal = Math.round(d.mad);
          if (liveMicVal) liveMicVal.innerText = `Mic: ${madVal} MAD`;
          if (liveMicBar) {
            const pct = Math.min(100, (d.mad / 30000) * 100);
            liveMicBar.style.width = pct + '%';
          }
        }

        // Live alert triggered by microphone
        if (d.triggered && !state.isTriggerActive) {
          state.isTriggerActive = true;
          state.triggerStartTime = performance.now();
          triggerChimeBtn.classList.add('is-ringing');
        }

        if (d.pairing !== undefined) {
          updatePairingBadge(d.pairing, d.pairSec, d.pairedCount);
        }

        if (d.followers !== undefined) {
          renderFollowersList(d.followers);
        }
      }).catch(() => {}).finally(() => {
        setTimeout(pollData, 200);
      });
    }

    updateTheme();
    pollData();
  </script>
</body>
</html>
)rawliteral";
