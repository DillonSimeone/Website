/**
 * Web Page Content - Glassmorphism Style
 * 3D Printer Camera with All-in-One Controls
 * Sticky camera preview with real-time adjustments
 */

#ifndef WEB_CONTENT_H
#define WEB_CONTENT_H

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Printer Cam</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --glass-bg: rgba(255, 255, 255, 0.1);
            --glass-border: rgba(255, 255, 255, 0.2);
            --glass-shadow: rgba(0, 0, 0, 0.3);
            --accent-primary: #6366f1;
            --accent-secondary: #8b5cf6;
            --accent-glow: rgba(99, 102, 241, 0.5);
            --text-primary: #ffffff;
            --text-secondary: rgba(255, 255, 255, 0.7);
            --success: #10b981;
            --danger: #ef4444;
        }
        
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            min-height: 100vh;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            background-attachment: fixed;
            color: var(--text-primary);
            overflow-x: hidden;
        }
        
        /* Animated background orbs */
        .bg-orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(80px);
            opacity: 0.4;
            pointer-events: none;
            z-index: -1;
        }
        
        .orb-1 {
            width: 400px;
            height: 400px;
            background: var(--accent-primary);
            top: -100px;
            right: -100px;
            animation: float 8s ease-in-out infinite;
        }
        
        .orb-2 {
            width: 300px;
            height: 300px;
            background: var(--accent-secondary);
            bottom: -50px;
            left: -50px;
            animation: float 10s ease-in-out infinite reverse;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-30px) rotate(5deg); }
        }
        
        /* Header */
        header {
            padding: 20px 40px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        header h1 {
            font-size: 1.5rem;
            font-weight: 600;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        header svg {
            width: 32px;
            height: 32px;
            fill: var(--accent-primary);
        }
        
        /* Main container */
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px 40px 100px;
        }
        
        /* Tabs */
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }
        
        .tab-btn {
            padding: 12px 24px;
            border: none;
            background: var(--glass-bg);
            color: var(--text-secondary);
            border-radius: 12px;
            cursor: pointer;
            font-size: 0.95rem;
            font-weight: 500;
            transition: all 0.3s ease;
            border: 1px solid var(--glass-border);
        }
        
        .tab-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            color: var(--text-primary);
        }
        
        .tab-btn.active {
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            color: white;
            box-shadow: 0 4px 20px var(--accent-glow);
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        /* Glass card */
        .glass-card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            border: 1px solid var(--glass-border);
            padding: 25px;
            box-shadow: 0 8px 32px var(--glass-shadow);
        }
        
        /* Sticky Camera Preview */
        .camera-preview-container {
            position: relative;
            margin-bottom: 40px;
            display: flex;
            justify-content: center;
            min-height: 500px; /* Force minimum height to prevent collapse */
        }
        
        .camera-preview {
            position: relative;
            border-radius: 20px;
            overflow: hidden;
            background: #000;
            aspect-ratio: 4/3;
            max-height: 60vh;
            max-width: 900px;
            width: 100%;
            transition: all 0.3s ease;
            display: flex; /* Centering lock */
            justify-content: center;
            align-items: center;
        }
        
        .camera-preview img, .camera-preview canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: contain; /* Ensures aspect ratio match */
        }
        
        .camera-preview canvas {
            display: none;
            pointer-events: none;
        }
        
        .camera-preview.sticky {
            position: fixed;
            top: 80px;
            left: 20px;
            width: 280px;
            max-height: none;
            z-index: 1000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            border: 2px solid var(--accent-primary);
        }
        
        .camera-preview img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            transition: filter 0.1s ease;
        }
        
        .stream-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 15px;
            background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .stream-info {
            font-size: 0.75rem;
            color: var(--text-secondary);
            padding: 4px 10px;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 20px;
        }
        
        /* Placeholder for sticky mode */
        /* Placeholder for sticky mode */
        .camera-placeholder {
            display: none;
            width: 100%;
            height: 60vh;
            max-height: 500px;
            max-width: 900px;
        }
        
        .camera-placeholder.active {
            display: block;
        }
        
        /* Controls grid - Flexbox for auto-centering */
        .controls-grid {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 30px;
            margin-top: 30px;
            padding: 10px;
        }
        
        .control-card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            border: 1px solid var(--glass-border);
            padding: 25px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            flex: 0 1 320px;
            max-width: 400px;
        }

        #processing-canvas {
            filter: inherit;
        }
        
        .control-card h3 {
            font-size: 1rem;
            margin-bottom: 15px;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        /* Control groups */
        .control-group {
            margin-bottom: 15px;
        }
        
        .control-group label {
            display: block;
            font-size: 0.85rem;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }
        
        .control-group select {
            width: 100%;
            padding: 10px 15px;
            border-radius: 10px;
            border: 1px solid var(--glass-border);
            background: rgba(0, 0, 0, 0.3);
            color: var(--text-primary);
            font-size: 0.9rem;
            cursor: pointer;
        }
        
        .control-group select option {
            background: #1a1a2e;
            color: var(--text-primary);
        }
        
        /* Sliders */
        .slider-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        
        .slider-row label {
            flex: 0 0 100px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }
        
        .slider-row input[type="range"] {
            flex: 1;
            height: 6px;
            border-radius: 3px;
            background: rgba(255, 255, 255, 0.2);
            -webkit-appearance: none;
            cursor: pointer;
        }
        
        .slider-row input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            cursor: pointer;
            box-shadow: 0 2px 8px var(--accent-glow);
        }
        
        .slider-row .slider-value {
            flex: 0 0 40px;
            text-align: right;
            font-size: 0.85rem;
            color: var(--accent-primary);
            font-weight: 600;
        }
        
        /* Toggle switch */
        .toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .toggle-row:last-child {
            border-bottom: none;
        }
        
        .toggle-row span {
            font-size: 0.9rem;
        }
        
        .toggle-switch {
            position: relative;
            width: 50px;
            height: 26px;
        }
        
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 26px;
            transition: 0.3s;
        }
        
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 20px;
            width: 20px;
            left: 3px;
            bottom: 3px;
            background: white;
            border-radius: 50%;
            transition: 0.3s;
        }
        
        .toggle-switch input:checked + .toggle-slider {
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        }
        
        .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(24px);
        }
        
        /* LED Controls */
        .led-section {
            margin-top: 30px;
        }
        
        .color-picker-row {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 15px;
        }
        
        .color-picker-row input[type="color"] {
            width: 50px;
            height: 50px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            background: transparent;
        }
        
        .color-preview {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .color-swatch {
            width: 30px;
            height: 30px;
            border-radius: 8px;
            border: 2px solid rgba(255, 255, 255, 0.3);
        }
        
        .btn-apply {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            color: white;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .btn-apply:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px var(--accent-glow);
        }
        
        /* Toast */
        .toast {
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 15px 25px;
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            border-radius: 12px;
            border: 1px solid var(--glass-border);
            display: flex;
            align-items: center;
            gap: 10px;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s ease;
            z-index: 10000;
        }
        
        .toast.show {
            transform: translateY(0);
            opacity: 1;
        }
        
        .toast svg {
            fill: var(--success);
        }
        
        .toast.error svg {
            fill: var(--danger);
        }
        
        /* Footer */
        footer {
            text-align: center;
            padding: 30px;
            color: var(--text-secondary);
            font-size: 0.85rem;
        }
        
        footer a {
            color: var(--accent-primary);
            text-decoration: none;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .container {
                padding: 15px;
            }
            
            header {
                padding: 15px;
            }
            
            .camera-preview.sticky {
                width: 200px;
                top: 70px;
                left: 10px;
            }
            
            .controls-grid {
                grid-template-columns: 1fr;
            }
        }
        .action-btn {
            width: 100%;
            padding: 10px;
            margin-top: 10px;
            border-radius: 10px;
            border: none;
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            color: white;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .action-btn:hover {
            transform: scale(1.02);
            filter: brightness(1.1);
        }
        .action-btn:active {
            transform: scale(0.98);
        }
    </style>
</head>
<body>
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    
    <!-- Header -->
    <header>
        <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <h1>3D Printer Cam</h1>
    </header>
    
    <div class="container">
        <!-- Tabs -->
        <div class="tabs">
            <button class="tab-btn active" data-tab="camera">
                📷 Camera & Controls
            </button>
            <button class="tab-btn" data-tab="lights">
                💡 LED Lights
            </button>
        </div>
        
        <!-- Camera Tab -->
        <div id="camera-tab" class="tab-content active">
            <!-- Camera Preview (becomes sticky on scroll) -->
            <div class="camera-preview-container">
                <div class="camera-placeholder"></div>
                <div class="camera-preview glass-card" id="camera-preview">
                    <img id="stream" src="/stream" alt="Camera Stream">
                    <canvas id="processing-canvas"></canvas>
                    <div class="stream-overlay">
                        <span class="stream-info" id="resolution-display">VGA (640x480)</span>
                        <span class="stream-info" id="fps-display">-- FPS</span>
                    </div>
                </div>
            </div>
            
            <!-- Status Bar (separate row, centered) -->
            <div style="display: flex; justify-content: center; gap: 15px; margin: 20px 0; flex-wrap: wrap;">
                <span class="stream-info" id="gpu-status" style="background: var(--danger);">🚫 Processing Off</span>
                <span class="stream-info" id="interpolated-fps" style="display: none; background: #10b981;">🚀 60 FPS</span>
                <span class="stream-info" id="enhanced-badge" style="display: none; background: var(--accent-primary);">✨ Enhanced</span>
            </div>
            
            <!-- All Controls in Grid -->
            <div class="controls-grid">
                <!-- Camera Settings -->
                <div class="control-card">
                    <h3>⚙️ Camera Settings</h3>
                    
                    <div class="control-group">
                        <label>Resolution</label>
                        <select id="resolution-select" onchange="setResolution(this.value)">
                            <option value="8" selected>XGA (1024x768)</option>
                            <option value="6">VGA (640x480)</option>
                            <option value="4">QVGA (320x240)</option>
                        </select>
                    </div>
                    
                    <div class="control-group">
                        <label>Quality</label>
                        <select id="quality-select" onchange="setQuality(this.value)">
                            <option value="4">Best</option>
                            <option value="8">High</option>
                            <option value="10" selected>Medium</option>
                            <option value="20">Low</option>
                        </select>
                    </div>
                    
                    <div class="control-group">
                        <label>Special Effect</label>
                        <select id="effect-select" onchange="setEffect(this.value)">
                            <option value="0" selected>No Effect</option>
                            <option value="1">Negative</option>
                            <option value="2">Grayscale</option>
                            <option value="3">Red Tint</option>
                            <option value="4">Green Tint</option>
                            <option value="5">Blue Tint</option>
                            <option value="6">Sepia</option>
                        </select>
                    </div>
                </div>
                
                <!-- Sensor Settings -->
                <div class="control-card">
                    <h3>🎨 Sensor Adjustments</h3>
                    
                    <div class="slider-row">
                        <label>Brightness</label>
                        <input type="range" id="brightness-sensor" min="-2" max="2" value="1" onchange="setControl('brightness', this.value)">
                        <span class="slider-value" id="brightness-sensor-val">1</span>
                    </div>
                    
                    <div class="slider-row">
                        <label>Contrast</label>
                        <input type="range" id="contrast-sensor" min="-2" max="2" value="1" onchange="setControl('contrast', this.value)">
                        <span class="slider-value" id="contrast-sensor-val">1</span>
                    </div>
                    
                    <div class="slider-row">
                        <label>Saturation</label>
                        <input type="range" id="saturation-sensor" min="-2" max="2" value="1" onchange="setControl('saturation', this.value)">
                        <span class="slider-value" id="saturation-sensor-val">1</span>
                    </div>
                    
                    <div class="slider-row">
                        <label>Sharpness</label>
                        <input type="range" id="sharpness-sensor" min="-2" max="2" value="1" onchange="setControl('sharpness', this.value)">
                        <span class="slider-value" id="sharpness-sensor-val">1</span>
                    </div>
                    
                    <div class="control-group" style="margin-top: 15px;">
                        <label>White Balance</label>
                        <select id="wb-select" onchange="setControl('wb_mode', this.value)">
                            <option value="0">Auto</option>
                            <option value="1">Sunny</option>
                            <option value="2">Cloudy</option>
                            <option value="3">Office</option>
                            <option value="4">Home</option>
                        </select>
                    </div>
                </div>
                
                <!-- Post-Processing (CSS Filters + JS) -->
                <div class="control-card">
                    <h3>✨ Post-Processing</h3>
                    
                    <div class="toggle-row">
                        <span>Enable Enhancement</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="pp-enable" onchange="togglePostProcessing()">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="toggle-row">
                        <span>🚀 Temporal Smoothing</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="pp-interpolation" onchange="toggleInterpolation()">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="slider-row" id="smoothing-slider-row" style="display: none; margin-top: 10px;">
                        <label>Persistence</label>
                        <input type="range" id="pp-smoothing-weight" min="0" max="100" step="1" value="50" oninput="updateSmoothingWeight()">
                        <span class="slider-value" id="pp-smoothing-weight-val">50%</span>
                    </div>

                    <div class="slider-row" id="deadpixel-status-row" style="margin-top: 10px;">
                        <span id="deadpixel-count" style="font-size: 0.75rem; color: var(--text-secondary);">0 pixels detected</span>
                    </div>
                    
                    <div class="slider-row">
                        <label>Brightness</label>
                        <input type="range" id="pp-brightness" min="80" max="250" value="130" oninput="updateFilters()">
                        <span class="slider-value" id="pp-brightness-val">130%</span>
                    </div>
                    
                    <div class="slider-row">
                        <label>Contrast</label>
                        <input type="range" id="pp-contrast" min="80" max="250" value="120" oninput="updateFilters()">
                        <span class="slider-value" id="pp-contrast-val">120%</span>
                    </div>
                    
                    <div class="slider-row">
                        <label>Saturate</label>
                        <input type="range" id="pp-saturate" min="80" max="250" value="130" oninput="updateFilters()">
                        <span class="slider-value" id="pp-saturate-val">130%</span>
                    </div>
                </div>
                
                <!-- Dead Pixel Management -->
                <div class="control-card">
                    <h3>🎯 Dead Pixel Management</h3>
                    
                    <div class="toggle-row">
                        <span>Enable Fix</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="pp-deadpixel" onchange="toggleDeadPixelFix()">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div id="dead-pixel-settings" style="display: none; border-top: 1px solid var(--glass-border); margin-top: 15px; padding-top: 15px;">
                        <div class="control-group">
                            <label>Algorithm</label>
                            <select id="pp-deadpixel-algo" onchange="updateDeadPixelAlgo(this.value)">
                                <option value="median" selected>Median (Best Overall)</option>
                                <option value="average">Average (Smooth Blend)</option>
                                <option value="min">Minimum (Deep Dark)</option>
                            </select>
                        </div>

                        <div class="slider-row">
                            <label>Threshold</label>
                            <input type="range" id="pp-deadpixel-sens" min="0" max="1000" step="10" value="200" oninput="updateDeadPixelSens()">
                            <span class="slider-value" id="pp-deadpixel-sens-val">200</span>
                        </div>

                        <div class="slider-row">
                            <label>Radius (px)</label>
                            <input type="range" id="pp-deadpixel-radius" min="1" max="15" step="1" value="6" oninput="updateDeadPixelRadius()">
                            <span class="slider-value" id="pp-deadpixel-radius-val">6</span>
                        </div>

                        <div class="toggle-row">
                            <span>Show Detection map</span>
                            <label class="toggle-switch">
                                <input type="checkbox" id="pp-deadpixel-map" onchange="toggleDeadPixelMap()">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <button class="action-btn" onclick="recalibrateDeadPixels()">
                            🔄 Recalibrate Sensor
                        </button>
                    </div>
                </div>
                
                <!-- Exposure & Gain -->
                <div class="control-card">
                    <h3>📸 Exposure & Gain</h3>
                    
                    <div class="toggle-row">
                        <span>Auto Exposure</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="aec-toggle" checked onchange="setControl('aec', this.checked ? 1 : 0)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="toggle-row">
                        <span>Auto Gain</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="agc-toggle" checked onchange="setControl('agc', this.checked ? 1 : 0)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="slider-row">
                        <label>AE Level</label>
                        <input type="range" id="ae-level" min="-2" max="2" value="1" onchange="setControl('ae_level', this.value)">
                        <span class="slider-value" id="ae-level-val">1</span>
                    </div>
                    
                    <div class="control-group">
                        <label>Gain Ceiling</label>
                        <select id="gainceiling-select" onchange="setControl('gainceiling', this.value)">
                            <option value="0">2x</option>
                            <option value="1">4x</option>
                            <option value="2">8x</option>
                            <option value="3">16x</option>
                            <option value="4" selected>32x</option>
                            <option value="5">64x</option>
                            <option value="6">128x</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Lights Tab -->
        <div id="lights-tab" class="tab-content">
            <div class="controls-grid">
                <div class="control-card">
                    <h3>💡 LED Power</h3>
                    
                    <div class="toggle-row">
                        <span>LED Strip</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="led-power" checked onchange="setLED('power', this.checked ? 1 : 0)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="control-group">
                        <label>LED Count</label>
                        <input type="number" id="led-count" value="60" min="1" max="300" style="width: 100%; padding: 10px; border-radius: 10px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
                    </div>
                </div>
                
                <div class="control-card">
                    <h3>🎨 Color</h3>
                    
                    <div class="color-picker-row">
                        <input type="color" id="led-color" value="#ffffff">
                        <div class="color-preview">
                            <div class="color-swatch" id="color-swatch" style="background: #ffffff;"></div>
                            <span id="color-hex">#FFFFFF</span>
                        </div>
                    </div>
                    
                    <div class="slider-row">
                        <label>Brightness</label>
                        <input type="range" id="led-brightness" min="0" max="255" value="128" oninput="updateLEDBrightness()">
                        <span class="slider-value" id="led-brightness-val">50%</span>
                    </div>
                </div>
                
                <div class="control-card">
                    <h3>✨ Effects</h3>
                    
                    <div class="control-group">
                        <label>Animation</label>
                        <select id="led-effect" onchange="setLED('effect', this.value)">
                            <option value="0">Solid</option>
                            <option value="1">Rainbow</option>
                            <option value="2">Breathing</option>
                            <option value="3">Color Wipe</option>
                        </select>
                    </div>
                    
                    <button class="btn-apply" onclick="applyLEDSettings()">
                        Apply LED Settings
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Toast notification -->
    <div id="toast" class="toast">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span id="toast-message">Settings applied!</span>
    </div>
    
    <!-- Footer -->
    <footer>
        <p>3D Printer Cam • ESP32-S3 • <a href="http://3dprintercam.local">3dprintercam.local</a></p>
    </footer>
    
    <script>
        // Resolution names (only working ones)
        const resolutionNames = {
            8: 'XGA (1024x768)',
            6: 'VGA (640x480)',
            4: 'QVGA (320x240)'
        };
        
        // ==================== TAB SWITCHING ====================
        document.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.tab + '-tab').classList.add('active');
            });
        });
        
        // ==================== STICKY CAMERA PREVIEW ====================
        const cameraPreview = document.getElementById('camera-preview');
        const placeholder = document.querySelector('.camera-placeholder');
        let stickyThreshold = 0;
        
        function updateStickyThreshold() {
            const container = document.querySelector('.camera-preview-container');
            stickyThreshold = container.offsetTop + container.offsetHeight - 100;
        }
        
        window.addEventListener('load', updateStickyThreshold);
        window.addEventListener('resize', updateStickyThreshold);
        
        window.addEventListener('scroll', () => {
            if (window.scrollY > stickyThreshold) {
                cameraPreview.classList.add('sticky');
                placeholder.classList.add('active');
            } else {
                cameraPreview.classList.remove('sticky');
                placeholder.classList.remove('active');
            }
        });
        
        // ==================== FPS UPDATE ====================
        function updateFPS() {
            fetch('/fps')
                .then(r => r.text())
                .then(fps => {
                    const val = parseFloat(fps);
                    if (!isNaN(val) && val > 0) {
                        document.getElementById('fps-display').textContent = val.toFixed(1) + ' FPS';
                    }
                })
                .catch(() => {});
        }
        setInterval(updateFPS, 1000);
        
        // ==================== CAMERA CONTROLS ====================
        function setResolution(value) {
            fetch('/control?var=framesize&val=' + value)
                .then(() => {
                    document.getElementById('resolution-display').textContent = resolutionNames[value] || 'Unknown';
                    showToast('Resolution updated');
                    // Reload stream
                    const stream = document.getElementById('stream');
                    stream.src = '/stream?' + Date.now();
                })
                .catch(() => showToast('Failed', true));
        }
        
        function setQuality(value) {
            fetch('/control?var=quality&val=' + value)
                .then(() => showToast('Quality updated'))
                .catch(() => showToast('Failed', true));
        }
        
        function setEffect(value) {
            fetch('/control?var=special_effect&val=' + value)
                .then(() => showToast('Effect applied'))
                .catch(() => showToast('Failed', true));
        }
        
        function setControl(name, value) {
            fetch('/control?var=' + name + '&val=' + value)
                .then(() => {
                    showToast(name.replace('_', ' ') + ' updated');
                    // Update display
                    const display = document.getElementById(name.replace('_', '-') + '-val');
                    if (display) display.textContent = value;
                })
                .catch(() => showToast('Failed', true));
        }
        
        // Update slider displays
        document.querySelectorAll('.slider-row input[type="range"]').forEach(slider => {
            slider.addEventListener('input', function() {
                const display = document.getElementById(this.id + '-val');
                if (display) {
                    display.textContent = (this.id.startsWith('pp-') && this.id !== 'pp-deadpixel-sens') ? this.value + '%' : this.value;
                }
                
                // If it's a post-processing slider, ensure the master toggle is ON
                if (this.id.startsWith('pp-') && this.id !== 'pp-deadpixel-sens' && this.id !== 'pp-smoothing-weight') {
                    const masterToggle = document.getElementById('pp-enable');
                    if (masterToggle && !masterToggle.checked) {
                        masterToggle.checked = true;
                        togglePostProcessing();
                    }
                }
            });
        });
        
        // ==================== POST-PROCESSING (CSS FILTERS) ====================
        function togglePostProcessing() {
            const enabled = document.getElementById('pp-enable').checked;
            document.getElementById('enhanced-badge').style.display = enabled ? 'inline' : 'none';
            updateFilters();
            showToast(enabled ? 'Enhancement ON' : 'Enhancement OFF');
        }
        
        function updateFilters() {
            const stream = document.getElementById('stream');
            const canvas = document.getElementById('processing-canvas');
            const enabled = document.getElementById('pp-enable').checked;
            
            const brightness = document.getElementById('pp-brightness').value;
            const contrast = document.getElementById('pp-contrast').value;
            const saturate = document.getElementById('pp-saturate').value;
            
            const filterStr = enabled ? `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)` : 'none';
            
            // Apply to both the original and the canvas
            stream.style.filter = filterStr;
            if (canvas) canvas.style.filter = filterStr;
            
            // Update displays
            document.getElementById('pp-brightness-val').textContent = brightness + '%';
            document.getElementById('pp-contrast-val').textContent = contrast + '%';
            document.getElementById('pp-saturate-val').textContent = saturate + '%';
        }
        
        // ==================== LED CONTROLS ====================
        function setLED(param, value) {
            fetch('/led?' + param + '=' + value)
                .then(() => showToast('LED updated'))
                .catch(() => showToast('Failed', true));
        }
        
        function updateLEDBrightness() {
            const val = document.getElementById('led-brightness').value;
            document.getElementById('led-brightness-val').textContent = Math.round(val / 255 * 100) + '%';
        }
        
        document.getElementById('led-color').addEventListener('input', function() {
            document.getElementById('color-swatch').style.background = this.value;
            document.getElementById('color-hex').textContent = this.value.toUpperCase();
        });
        
        function applyLEDSettings() {
            const count = document.getElementById('led-count').value;
            const color = document.getElementById('led-color').value.substring(1);
            const brightness = document.getElementById('led-brightness').value;
            
            fetch('/led/settings?count=' + count + '&color=' + color + '&brightness=' + brightness)
                .then(() => showToast('LED settings applied'))
                .catch(() => showToast('Failed', true));
        }
        
        // ==================== SIMPLE CANVAS POST-PROCESSING ====================
        const streamImg = document.getElementById('stream');
        const procCanvas = document.getElementById('processing-canvas');
        const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });
        
        let interpolationActive = false;
        let deadPixelFixActive = false;
        let lastFrameData = null;
        let smoothingWeight = 0.5;
        let deadPixelThreshold = 200;
        let deadPixelRadius = 6;
        let deadPixelAlgorithm = 'median';
        let deadPixelShowMap = false;
        let processingActive = false;
        let deadPixelCache = []; // Cached (x,y) locations of dead pixels
        let deadPixelCacheValid = false; // Flag to trigger re-scan
        
        function toggleInterpolation() {
            interpolationActive = document.getElementById('pp-interpolation').checked;
            const sliderRow = document.getElementById('smoothing-slider-row');
            if (sliderRow) sliderRow.style.display = interpolationActive ? 'flex' : 'none';
            document.getElementById('interpolated-fps').style.display = interpolationActive ? 'inline' : 'none';
            startProcessingIfNeeded();
        }
        
        function updateSmoothingWeight() {
            const val = parseInt(document.getElementById('pp-smoothing-weight').value);
            smoothingWeight = val / 100; // 0-100 range
            document.getElementById('pp-smoothing-weight-val').textContent = val + '%';
        }
        
        function toggleDeadPixelFix() {
            deadPixelFixActive = document.getElementById('pp-deadpixel').checked;
            const settingsDiv = document.getElementById('dead-pixel-settings');
            if (settingsDiv) settingsDiv.style.display = deadPixelFixActive ? 'block' : 'none';
            if (deadPixelFixActive) deadPixelCacheValid = false;
            startProcessingIfNeeded();
        }
        
        function updateDeadPixelSens() {
            deadPixelThreshold = parseInt(document.getElementById('pp-deadpixel-sens').value);
            document.getElementById('pp-deadpixel-sens-val').textContent = deadPixelThreshold;
            deadPixelCacheValid = false;
        }

        function updateDeadPixelRadius() {
            deadPixelRadius = parseInt(document.getElementById('pp-deadpixel-radius').value);
            document.getElementById('pp-deadpixel-radius-val').textContent = deadPixelRadius;
            deadPixelCacheValid = false;
        }

        function updateDeadPixelAlgo(val) {
            deadPixelAlgorithm = val;
            deadPixelCacheValid = false;
        }

        function toggleDeadPixelMap() {
            deadPixelShowMap = document.getElementById('pp-deadpixel-map').checked;
        }

        function recalibrateDeadPixels() {
            deadPixelCacheValid = false;
            showToast('Recalibrating sensor map...');
        }
        
        function startProcessingIfNeeded() {
            if (!processingActive && (interpolationActive || deadPixelFixActive)) {
                processingActive = true;
                document.getElementById('gpu-status').textContent = '⚡ Processing Active';
                document.getElementById('gpu-status').style.background = 'var(--success)';
                requestAnimationFrame(processFrame);
            }
        }
        
        function processFrame() {
            if (!interpolationActive && !deadPixelFixActive) {
                processingActive = false;
                procCanvas.style.display = 'none';
                streamImg.style.visibility = 'visible';
                document.getElementById('gpu-status').textContent = '🚫 Processing Off';
                document.getElementById('gpu-status').style.background = 'var(--danger)';
                lastFrameData = null;
                return;
            }
            
            if (streamImg.complete && streamImg.naturalWidth > 0) {
                const w = streamImg.naturalWidth;
                const h = streamImg.naturalHeight;
                
                // Resize canvas if needed
                if (procCanvas.width !== w || procCanvas.height !== h) {
                    procCanvas.width = w;
                    procCanvas.height = h;
                    lastFrameData = null;
                }
                
                // Show canvas, hide original image
                procCanvas.style.display = 'block';
                streamImg.style.visibility = 'hidden';
                
                // Draw current frame to canvas
                procCtx.drawImage(streamImg, 0, 0);
                
                // Get pixel data
                const imageData = procCtx.getImageData(0, 0, w, h);
                const data = imageData.data;
                
                // V7 Integrated Dead Pixel Management
                if (deadPixelFixActive) {
                    const diffLimit = (deadPixelThreshold / 10);
                    const R = deadPixelRadius;
                    
                    // --- DETECTION PASS ---
                    if (!deadPixelCacheValid) {
                        deadPixelCache = [];
                        for (let y = R; y < h - R; y++) {
                            for (let x = R; x < w - R; x++) {
                                const i = (y * w + x) * 4;
                                const r = data[i], g = data[i+1], b = data[i+2];
                                const iT = ((y - R) * w + x) * 4;
                                const iB = ((y + R) * w + x) * 4;
                                const iL = (y * w + (x - R)) * 4;
                                const iR = (y * w + (x + R)) * 4;
                                const rAvg = (data[iT] + data[iB] + data[iL] + data[iR]) / 4;
                                const gAvg = (data[iT+1] + data[iB+1] + data[iL+1] + data[iR+1]) / 4;
                                const bAvg = (data[iT+2] + data[iB+2] + data[iL+2] + data[iR+2]) / 4;
                                if (r - rAvg > diffLimit || g - gAvg > diffLimit || b - bAvg > diffLimit) {
                                    deadPixelCache.push({x, y});
                                }
                            }
                        }
                        deadPixelCacheValid = true;
                        document.getElementById('deadpixel-count').textContent = deadPixelCache.length + ' pixels corrected';
                    }
                    
                    // --- FIX PASS ---
                    for (const pix of deadPixelCache) {
                        const i = (pix.y * w + pix.x) * 4;
                        const iT = ((pix.y - R) * w + pix.x) * 4, iB = ((pix.y + R) * w + pix.x) * 4;
                        const iL = (pix.y * w + (pix.x - R)) * 4, iR = (pix.y * w + (pix.x + R)) * 4;
                        
                        if (deadPixelAlgorithm === 'median') {
                            const iTL = ((pix.y - R) * w + (pix.x - R)) * 4, iTR = ((pix.y - R) * w + (pix.x + R)) * 4;
                            const iBL = ((pix.y + R) * w + (pix.x - R)) * 4, iBR = ((pix.y + R) * w + (pix.x + R)) * 4;
                            let rS = [data[iT], data[iB], data[iL], data[iR], data[iTL], data[iTR], data[iBL], data[iBR]].sort((a,b)=>a-b);
                            let gS = [data[iT+1], data[iB+1], data[iL+1], data[iR+1], data[iTL+1], data[iTR+1], data[iBL+1], data[iBR+1]].sort((a,b)=>a-b);
                            let bS = [data[iT+2], data[iB+2], data[iL+2], data[iR+2], data[iTL+2], data[iTR+2], data[iBL+2], data[iBR+2]].sort((a,b)=>a-b);
                            data[i] = rS[4]; data[i+1] = gS[4]; data[i+2] = bS[4];
                        } else if (deadPixelAlgorithm === 'average') {
                            data[i] = (data[iT] + data[iB] + data[iL] + data[iR]) / 4;
                            data[i+1] = (data[iT+1] + data[iB+1] + data[iL+1] + data[iR+1]) / 4;
                            data[i+2] = (data[iT+2] + data[iB+2] + data[iL+2] + data[iR+2]) / 4;
                        } else if (deadPixelAlgorithm === 'min') {
                            data[i] = Math.min(data[iT], data[iB], data[iL], data[iR]);
                            data[i+1] = Math.min(data[iT+1], data[iB+1], data[iL+1], data[iR+1]);
                            data[i+2] = Math.min(data[iT+2], data[iB+2], data[iL+2], data[iR+2]);
                        }

                        if (deadPixelShowMap) {
                            data[i] = 255; data[i+1] = 0; data[i+2] = 0; // Pure Red markers
                        }
                    }
                }
                
                // Temporal smoothing (blend with previous frame)
                if (interpolationActive && lastFrameData) {
                    const alpha = 1.0 - smoothingWeight;
                    for (let i = 0; i < data.length; i += 4) {
                        data[i] = data[i] * alpha + lastFrameData[i] * smoothingWeight;
                        data[i+1] = data[i+1] * alpha + lastFrameData[i+1] * smoothingWeight;
                        data[i+2] = data[i+2] * alpha + lastFrameData[i+2] * smoothingWeight;
                    }
                }
                
                // Save current frame for next iteration
                if (interpolationActive) {
                    lastFrameData = new Uint8ClampedArray(data);
                }
                
                // Put processed data back
                procCtx.putImageData(imageData, 0, 0);
            }
            
            requestAnimationFrame(processFrame);
        }

        // ==================== TOAST ====================
        function showToast(message, isError = false) {
            const toast = document.getElementById('toast');
            document.getElementById('toast-message').textContent = message;
            toast.classList.toggle('error', isError);
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }
        
        // ==================== INIT ====================
        updateFilters();
        updateFPS();
        // Sticky scroll logic to prevent layout shift
        let isSticky = false;
        window.addEventListener('scroll', () => {
            const preview = document.getElementById('camera-preview');
            const placeholder = document.querySelector('.camera-placeholder');
            const scrollTop = window.scrollY;
            
            // Trigger stickiness when scrolling past header (approx 80px)
            if (scrollTop > 80) {
                if (!isSticky) {
                    isSticky = true;
                    preview.classList.add('sticky');
                    placeholder.classList.add('active');
                }
            } else {
                if (isSticky) {
                    isSticky = false;
                    preview.classList.remove('sticky');
                    placeholder.classList.remove('active');
                }
            }
        });
    </script>
</body>
</html>
)rawliteral";

#endif // WEB_CONTENT_H
