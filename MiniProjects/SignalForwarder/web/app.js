let messageCount = 0;
let serversRunning = false;
let selectedBleAddress = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    changeTestSignalType();
});

// Initialize API-dependent features
window.addEventListener('pywebviewready', () => {
    // Check Bluetooth status
    pywebview.api.check_system_bluetooth().then(res => {
        const hwStatusEl = document.getElementById('ble-hardware-status');
        if (res.available) {
            hwStatusEl.textContent = "BLE Ready";
            hwStatusEl.style.color = "#00ff9d";
        } else {
            hwStatusEl.textContent = "BLE Error: " + (res.error || "Unavailable");
            hwStatusEl.style.color = "#ff3f3f";
        }
    });

    // Get system inputs and local IP
    loadSystemSources();

    // Load initial routing matrix
    syncRoutingData();
});

function loadSystemSources() {
    pywebview.api.get_system_sources().then(sources => {
        // Update Local IP
        document.getElementById('ip-display').textContent = sources.local_ip || '127.0.0.1';

        // 1. Populate MIDI Ports
        const midiContainer = document.getElementById('midi-port-list');
        midiContainer.innerHTML = '';
        if (sources.midi_inputs && sources.midi_inputs.length > 0) {
            sources.midi_inputs.forEach(port => {
                const item = document.createElement('div');
                item.className = 'port-item';
                item.innerHTML = `
                    <label>
                        <input type="checkbox" onchange="toggleMidiPort('${port}', this.checked)">
                        <span>${port}</span>
                    </label>
                `;
                midiContainer.appendChild(item);
            });
        } else {
            midiContainer.innerHTML = '<div class="empty-state">No MIDI ports detected.</div>';
        }

        // 2. Populate Audio Devices
        const audioSelect = document.getElementById('audio-device-select');
        audioSelect.innerHTML = '<option value="-1">None (Disabled)</option>';
        if (sources.audio_inputs && sources.audio_inputs.length > 0) {
            sources.audio_inputs.forEach(dev => {
                const opt = document.createElement('option');
                opt.value = dev.index;
                opt.textContent = `${dev.name} (${Math.round(dev.sr)}Hz)`;
                audioSelect.appendChild(opt);
            });
        }

        // 3. Populate Serial Ports
        const serialEl = document.getElementById('serial-port-list');
        if (sources.serial_ports && sources.serial_ports.length > 0) {
            serialEl.innerHTML = sources.serial_ports.map(p => `${p.port}: ${p.desc}`).join('<br>');
        } else {
            serialEl.textContent = 'No serial devices found.';
        }
    });
}

// UDP Network Servers Start/Stop
function toggleServers() {
    const btn = document.getElementById('btn-start-servers');
    const dot = document.getElementById('server-status-dot');
    const text = document.getElementById('server-status-text');
    const oscPortInput = document.getElementById('osc-port');
    const artnetPortInput = document.getElementById('artnet-port');

    if (!serversRunning) {
        const oscPort = parseInt(oscPortInput.value);
        const artnetPort = parseInt(artnetPortInput.value);
        
        btn.textContent = "STARTING...";
        pywebview.api.start_servers(oscPort, artnetPort).then(res => {
            if (res.success) {
                serversRunning = true;
                btn.textContent = "STOP SERVERS";
                btn.classList.replace('btn-primary', 'btn-danger');
                dot.classList.add('active');
                text.textContent = `OSC:${oscPort} DMX:${artnetPort}`;
                text.style.color = "#00ff9d";
                oscPortInput.disabled = true;
                artnetPortInput.disabled = true;
            } else {
                alert("Error starting servers: " + res.error);
                btn.textContent = "START SERVERS";
                dot.classList.remove('active');
                text.textContent = "OFFLINE";
                text.style.color = "";
            }
        });
    } else {
        btn.textContent = "STOPPING...";
        pywebview.api.stop_servers().then(res => {
            serversRunning = false;
            btn.textContent = "START SERVERS";
            btn.classList.replace('btn-danger', 'btn-primary');
            dot.classList.remove('active');
            text.textContent = "OFFLINE";
            text.style.color = "";
            oscPortInput.disabled = false;
            artnetPortInput.disabled = false;
        });
    }
}

// MIDI toggles
function toggleMidiPort(name, enabled) {
    pywebview.api.toggle_midi_port(name, enabled).then(success => {
        if (!success) {
            alert(`Failed to toggle MIDI port: ${name}`);
        }
    });
}

// Audio device changes
function changeAudioDevice() {
    const select = document.getElementById('audio-device-select');
    const idx = parseInt(select.value);
    pywebview.api.set_audio_device(idx).then(success => {
        if (!success && idx !== -1) {
            alert("Failed to capture audio device.");
            select.value = "-1";
            updateAudioLevel(0.0, 0);
        }
    });
}

// Called from Python audio thread
function updateAudioLevel(rms, pwmValue) {
    const meterFill = document.getElementById('audio-meter-fill');
    const display = document.getElementById('audio-val-display');
    
    const percent = Math.min(Math.max(rms * 350.0, 0.0), 100.0);
    meterFill.style.width = percent + '%';
    display.textContent = `${rms.toFixed(3)} (PWM: ${pwmValue})`;
}

// Upgraded Signal Simulator Controls
function changeTestSignalType() {
    const type = document.getElementById('test-signal-type').value;
    const container = document.getElementById('test-fields-container');
    
    if (type === 'pwm') {
        container.innerHTML = `
            <div class="inputs-row">
                <div class="control-group">
                    <label for="test-pin">GPIO PIN</label>
                    <input type="number" id="test-pin" value="1" min="0" max="39">
                </div>
                <div class="control-group">
                    <label for="test-val">VAL (0-255)</label>
                    <input type="number" id="test-val" value="125" min="0" max="255">
                </div>
            </div>
        `;
    } else if (type === 'midi') {
        container.innerHTML = `
            <div class="inputs-row" style="grid-template-columns: 1fr 1fr 1fr;">
                <div class="control-group">
                    <label for="test-note">NOTE (0-127)</label>
                    <input type="number" id="test-note" value="60" min="0" max="127">
                </div>
                <div class="control-group">
                    <label for="test-vel">VELOCITY</label>
                    <input type="number" id="test-vel" value="50" min="0" max="127">
                </div>
                <div class="control-group">
                    <label for="test-dur">DUR (MS)</label>
                    <input type="number" id="test-dur" value="500" min="0" max="10000">
                </div>
            </div>
        `;
    } else if (type === 'osc') {
        container.innerHTML = `
            <div class="inputs-row" style="grid-template-columns: 2fr 1fr;">
                <div class="control-group">
                    <label for="test-path">OSC PATH</label>
                    <input type="text" id="test-path" value="/led/1">
                </div>
                <div class="control-group">
                    <label for="test-osc-val">VAL (0-255)</label>
                    <input type="number" id="test-osc-val" value="125" min="0" max="255">
                </div>
            </div>
        `;
    } else if (type === 'dmx') {
        container.innerHTML = `
            <div class="inputs-row">
                <div class="control-group">
                    <label for="test-chan">DMX CHANNEL</label>
                    <input type="number" id="test-chan" value="1" min="1" max="512">
                </div>
                <div class="control-group">
                    <label for="test-dmx-val">VALUE (0-255)</label>
                    <input type="number" id="test-dmx-val" value="125" min="0" max="255">
                </div>
            </div>
        `;
    }
}

function getTestParams() {
    const type = document.getElementById('test-signal-type').value;
    const params = {};
    
    if (type === 'pwm') {
        params.pin = parseInt(document.getElementById('test-pin').value) || 1;
        params.val = parseInt(document.getElementById('test-val').value) || 125;
    } else if (type === 'midi') {
        params.note = parseInt(document.getElementById('test-note').value) || 60;
        params.vel = parseInt(document.getElementById('test-vel').value) || 50;
        params.dur = parseInt(document.getElementById('test-dur').value) || 500;
    } else if (type === 'osc') {
        params.path = document.getElementById('test-path').value.trim() || "/led/1";
        params.val = parseFloat(document.getElementById('test-osc-val').value) || 125.0;
    } else if (type === 'dmx') {
        params.chan = parseInt(document.getElementById('test-chan').value) || 1;
        params.val = parseInt(document.getElementById('test-dmx-val').value) || 125;
    }
    return params;
}

function sendTestSignal() {
    const type = document.getElementById('test-signal-type').value;
    const params = getTestParams();
    pywebview.api.send_simulated_signal(type, JSON.stringify(params));
}

function toggleTestPing() {
    const toggle = document.getElementById('test-ping-toggle');
    const type = document.getElementById('test-signal-type').value;
    const params = getTestParams();
    
    pywebview.api.toggle_test_ping(toggle.checked, type, JSON.stringify(params)).then(success => {
        if (!success && toggle.checked) {
            alert("Failed to start auto-ping.");
            toggle.checked = false;
        }
    });
}

// Signal Router Engine interactions
function syncRoutingData() {
    if (window.pywebview && window.pywebview.api) {
        pywebview.api.get_routing_data().then(data => {
            renderSignalRouter(JSON.stringify(data));
        });
    }
}

function createRouteLink() {
    const src = document.getElementById('route-source-select').value;
    const dest = document.getElementById('route-dest-select').value;
    
    if (!src || !dest) {
        alert("Please select both a source signal and output target.");
        return;
    }
    
    pywebview.api.add_route(src, dest);
}

function toggleRouteLink(routeId, checked) {
    pywebview.api.toggle_route(routeId, checked);
}

function deleteRouteLink(routeId) {
    pywebview.api.delete_route(routeId);
}

function addCustomDestination() {
    const ip = document.getElementById('custom-osc-ip').value.trim();
    const port = parseInt(document.getElementById('custom-osc-port').value);
    
    if (!ip || isNaN(port)) {
        alert("Please enter a valid IP address and Port.");
        return;
    }
    
    pywebview.api.add_custom_osc_destination(ip, port).then(() => {
        document.getElementById('custom-osc-ip').value = '';
    });
}

// Called from Python to render/update the routing interface components
function renderSignalRouter(data_json) {
    try {
        const data = JSON.parse(data_json);
        
        // 1. Render Sources Dropdown
        const srcSelect = document.getElementById('route-source-select');
        const curSrc = srcSelect.value;
        srcSelect.innerHTML = data.sources.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        if (curSrc && data.sources.some(s => s.id === curSrc)) {
            srcSelect.value = curSrc;
        }

        // 2. Render Targets Dropdown
        const destSelect = document.getElementById('route-dest-select');
        const curDest = destSelect.value;
        destSelect.innerHTML = data.destinations.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        if (curDest && data.destinations.some(d => d.id === curDest)) {
            destSelect.value = curDest;
        }

        // 3. Render Active Routes List
        const list = document.getElementById('active-routes-list');
        list.innerHTML = '';
        if (data.routes && data.routes.length > 0) {
            data.routes.forEach(r => {
                const srcObj = data.sources.find(s => s.id === r.source);
                const destObj = data.destinations.find(d => d.id === r.dest);
                const srcName = srcObj ? srcObj.name : r.source;
                const destName = destObj ? destObj.name : r.dest;

                const item = document.createElement('div');
                item.className = 'port-item';
                item.style.padding = '6px 10px';
                item.style.fontSize = '0.75rem';
                item.style.marginBottom = '3px';
                item.innerHTML = `
                    <label style="flex-grow: 1; overflow: hidden; display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="toggleRouteLink('${r.id}', this.checked)">
                        <span style="color: #00ff9d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px;">${srcName}</span>
                        <span style="color: var(--text-secondary); font-size: 0.65rem;">➔</span>
                        <span style="color: #6c5ce7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">${destName}</span>
                    </label>
                    <button onclick="deleteRouteLink('${r.id}')" class="btn btn-danger btn-small" style="padding: 2px 6px; font-size: 0.65rem; margin-left: 5px;">DEL</button>
                `;
                list.appendChild(item);
            });
        } else {
            list.innerHTML = '<div class="empty-state">No signal routes linked yet.</div>';
        }
    } catch(e) {
        console.error("Failed to render signal router:", e);
    }
}

// BLE Bluetooth Operations
function scanBLE() {
    const btn = document.getElementById('btn-scan-ble');
    const list = document.getElementById('ble-device-list');
    
    btn.disabled = true;
    btn.textContent = "SCANNING...";
    list.innerHTML = '<div class="empty-state">Scanning active BLE advertisements...</div>';
    
    pywebview.api.scan_bluetooth_devices().then(devices => {
        btn.disabled = false;
        btn.textContent = "SCAN BLE";
        list.innerHTML = '';
        
        if (devices && devices.length > 0) {
            devices.forEach(d => {
                const item = document.createElement('div');
                item.className = 'ble-item';
                if (d.is_match) {
                    item.classList.add('match-tint');
                }
                item.dataset.address = d.address;
                item.innerHTML = `
                    <span><strong>${d.name}</strong></span>
                    <span class="ble-rssi">${d.rssi}</span>
                `;
                
                item.addEventListener('click', () => {
                    document.querySelectorAll('.ble-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedBleAddress = d.address;
                    
                    connectBLE(d.address);
                });
                
                list.appendChild(item);
            });
        } else {
            list.innerHTML = '<div class="empty-state">No BLE devices found.</div>';
        }
    });
}

function connectBLE(address) {
    const statusBadge = document.getElementById('ble-status-badge');
    statusBadge.textContent = "CONNECTING...";
    statusBadge.className = "conn-value";
    
    pywebview.api.connect_ble_device(address).then(success => {
        if (!success) {
            alert("BLE connection failed.");
            statusBadge.textContent = "DISCONNECTED";
            statusBadge.className = "conn-value color-danger";
        }
    });
}

function disconnectBLE() {
    pywebview.api.disconnect_ble_device();
}

// Callback from Python to update BLE Status UI
function updateBleStatus(status, address) {
    const statusBadge = document.getElementById('ble-status-badge');
    const btnDisconnect = document.getElementById('btn-disconnect-ble');
    const btnRead = document.getElementById('btn-read-config');
    const btnWrite = document.getElementById('btn-write-config');
    
    if (status === "CONNECTED") {
        statusBadge.textContent = "CONNECTED";
        statusBadge.className = "conn-value color-connected";
        btnDisconnect.disabled = false;
        btnRead.disabled = false;
        btnWrite.disabled = false;
        
        document.querySelectorAll('.ble-item').forEach(el => {
            if (el.dataset.address === address) el.classList.add('selected');
        });
        
        logMessage("BLE", "System", `Connected to ${address}`);
    } else {
        statusBadge.textContent = "DISCONNECTED";
        statusBadge.className = "conn-value color-danger";
        btnDisconnect.disabled = true;
        btnRead.disabled = true;
        btnWrite.disabled = true;
        
        document.querySelectorAll('.ble-item').forEach(el => el.classList.remove('selected'));
        selectedBleAddress = null;
        
        const toggle = document.getElementById('test-ping-toggle');
        if (toggle && toggle.checked) {
            toggle.checked = false;
            pywebview.api.toggle_test_ping(false, "pwm", "{}");
        }
        
        logMessage("BLE", "System", "Disconnected");
    }
}

// Read/Write Config
function readConfigFromESP32() {
    pywebview.api.get_esp32_config_from_device().then(res => {
        if (!res.success) {
            alert("Failed to send config read request: " + res.error);
        }
    });
}

// Called from Python when config arrives
function loadEsp32Config(config_json) {
    try {
        const obj = JSON.parse(config_json);
        document.getElementById('esp32-config-editor').value = JSON.stringify(obj, null, 2);
        logMessage("BLE", "Config", "Received configuration from ESP32");
    } catch(e) {
        document.getElementById('esp32-config-editor').value = config_json;
    }
}

function writeConfigToESP32() {
    const editorVal = document.getElementById('esp32-config-editor').value;
    
    try {
        JSON.parse(editorVal);
    } catch (e) {
        alert("Invalid JSON format! Please correct configuration before writing.");
        return;
    }
    
    pywebview.api.send_esp32_config_to_device(editorVal).then(res => {
        if (res.success) {
            logMessage("BLE", "Config", "Wrote new config to ESP32 successfully");
            alert("Config updated successfully!");
        } else {
            alert("Failed to write configuration: " + res.error);
        }
    });
}

// Logs Console
function logMessage(type, source, desc) {
    const container = document.getElementById('log-container');
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    let typeClass = type.toLowerCase();
    entry.style.borderLeftColor = `var(--${typeClass}-color)`;

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    
    entry.innerHTML = `
        <span class="log-time">${time}.${ms}</span>
        <span class="log-type ${typeClass}">${type.toUpperCase()}</span>
        <span class="log-source" title="${source}">${source}</span>
        <span class="log-desc">${desc}</span>
    `;
    
    container.appendChild(entry);
    
    if (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }

    container.scrollTop = container.scrollHeight;

    messageCount++;
    document.getElementById('log-count').textContent = `${messageCount} messages`;
}

function clearLog() {
    const container = document.getElementById('log-container');
    container.innerHTML = '<div class="empty-state">Log cleared. Waiting for new messages...</div>';
    messageCount = 0;
    document.getElementById('log-count').textContent = '0 messages';
}

// Global logger callbacks from Python
function addToConsole(payload_json) {
    try {
        const payload = JSON.parse(payload_json);
        logMessage(payload.type, payload.source, payload.desc);
    } catch(e) {
        console.error("Bad JSON log payload", e);
    }
}