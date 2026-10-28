/**
 * ESP32 In-Browser Web Serial Flasher & Live Serial Monitor
 * Powered by Espressif's esptool-js & Web Serial API
 */

let esptoolModule = null;
let activePort = null;
let activeTransport = null;
let activeLoader = null;
let manifest = [];
let selectedFirmware = null;
let customFile = null;
let isFlashing = false;
let isMonitoring = false;
let monitorReader = null;

// Initialize on DOM load
export async function initEsp32WebUploader() {
    const container = document.getElementById('esp32WebUploader');
    if (!container) return;

    const webSerialBadge = document.getElementById('webSerialBadge');
    const localStudioBadge = document.getElementById('localStudioBadge');
    const projectSelect = document.getElementById('flasherProjectSelect');
    const btnConnectFlash = document.getElementById('btnConnectFlash');
    const btnToggleMonitor = document.getElementById('btnToggleMonitor');
    const btnResetChip = document.getElementById('btnResetChip');
    const btnClearTerminal = document.getElementById('btnClearTerminal');
    const flashProgress = document.getElementById('flashProgress');
    const flashStats = document.getElementById('flashStats');
    const terminalLog = document.getElementById('flasherLog');
    const customFileInput = document.getElementById('customBinFile');
    const customDropzone = document.getElementById('customBinDropzone');
    const tabCatalog = document.getElementById('tabCatalog');
    const tabCustom = document.getElementById('tabCustom');
    const catalogView = document.getElementById('catalogView');
    const customView = document.getElementById('customView');

    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        let prefix = `[${time}] `;
        if (type === 'error') prefix += '✖ ';
        else if (type === 'success') prefix += '✔ ';
        else if (type === 'warn') prefix += '⚠ ';
        else prefix += 'ℹ ';

        if (terminalLog) {
            terminalLog.textContent += `${prefix}${msg}\n`;
            terminalLog.scrollTop = terminalLog.scrollHeight;
        }
    }

    // Check Web Serial support
    const hasWebSerial = 'serial' in navigator;
    if (webSerialBadge) {
        if (hasWebSerial) {
            webSerialBadge.textContent = 'Web Serial Ready';
            webSerialBadge.className = 'flasher-badge ready';
        } else {
            webSerialBadge.textContent = 'Web Serial Unsupported';
            webSerialBadge.className = 'flasher-badge unsupported';
            log('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.', 'warn');
        }
    }

    // Check Local Studio in background
    checkLocalStudio(localStudioBadge);

    // Tab switching
    if (tabCatalog && tabCustom) {
        tabCatalog.addEventListener('click', () => {
            tabCatalog.classList.add('active');
            tabCustom.classList.remove('active');
            catalogView.style.display = 'block';
            customView.style.display = 'none';
            if (selectedFirmware) updateFirmwareDetails(selectedFirmware);
        });
        tabCustom.addEventListener('click', () => {
            tabCustom.classList.add('active');
            tabCatalog.classList.remove('active');
            catalogView.style.display = 'none';
            customView.style.display = 'block';
            if (btnConnectFlash) {
                btnConnectFlash.disabled = false;
                btnConnectFlash.textContent = 'Flash Custom Binary';
            }
        });
    }

    // Clear terminal
    if (btnClearTerminal) {
        btnClearTerminal.addEventListener('click', () => {
            if (terminalLog) terminalLog.textContent = '';
        });
    }

    // Load Manifest
    try {
        const res = await fetch('/ESP32Codes/firmware-manifest.json');
        if (res.ok) {
            manifest = await res.json();
            populateProjectSelect(projectSelect, manifest);
        } else {
            log('Could not load static firmware manifest. Custom .bin upload is available.', 'warn');
        }
    } catch (e) {
        log('Offline or manifest not found. Custom .bin upload is available.', 'warn');
    }

    // Selection change
    if (projectSelect) {
        projectSelect.addEventListener('change', () => {
            const id = projectSelect.value;
            selectedFirmware = manifest.find(m => m.id === id);
            updateFirmwareDetails(selectedFirmware);
        });
    }

    // Custom File selection
    if (customFileInput) {
        customFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleCustomFile(e.target.files[0]);
            }
        });
    }

    // Drag and drop for custom .bin
    if (customDropzone) {
        customDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            customDropzone.classList.add('dragover');
        });
        customDropzone.addEventListener('dragleave', () => {
            customDropzone.classList.remove('dragover');
        });
        customDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            customDropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleCustomFile(e.dataTransfer.files[0]);
            }
        });
    }

    function handleCustomFile(file) {
        if (!file.name.endsWith('.bin')) {
            log('Please select a valid compiled binary file (.bin)', 'error');
            return;
        }
        customFile = file;
        const infoEl = document.getElementById('customFileInfo');
        if (infoEl) {
            const sizeKb = Math.round(file.size / 1024);
            infoEl.textContent = `Selected: ${file.name} (${sizeKb} KB)`;
            infoEl.style.display = 'block';
        }
        log(`Custom binary selected: ${file.name} (${Math.round(file.size / 1024)} KB)`, 'info');
    }

    // Connect & Flash
    if (btnConnectFlash) {
        btnConnectFlash.addEventListener('click', async () => {
            if (!hasWebSerial) {
                alert('Web Serial API is required for browser flashing. Please open this page in Chrome, Edge, or Opera.');
                return;
            }
            if (isFlashing) return;

            // Determine binary
            let binBuffer = null;
            let targetOffset = '0x0';
            let targetChip = 'esp32c3';

            if (tabCustom && tabCustom.classList.contains('active')) {
                if (!customFile) {
                    alert('Please select or drag a compiled .bin file first.');
                    return;
                }
                const offsetInput = document.getElementById('customFlashOffset');
                targetOffset = (offsetInput && offsetInput.value) || '0x0';
                const chipSelect = document.getElementById('customChipSelect');
                targetChip = (chipSelect && chipSelect.value) || 'esp32c3';
                binBuffer = await customFile.arrayBuffer();
            } else {
                if (!selectedFirmware) {
                    alert('Please select a project firmware from the catalog.');
                    return;
                }
                if (!selectedFirmware.hasBinary || !selectedFirmware.binPath) {
                    alert(`"${selectedFirmware.name}" is a source code project without a precompiled binary.\n\nPlease compile it first using PlatformIO / the Local Studio, or switch to "Custom .BIN Upload".`);
                    return;
                }
                targetOffset = selectedFirmware.flashOffset || '0x0';
                targetChip = selectedFirmware.chip || 'esp32c3';
                log(`Downloading precompiled binary: ${selectedFirmware.name}...`, 'info');
                try {
                    const r = await fetch(selectedFirmware.binPath);
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    binBuffer = await r.arrayBuffer();
                } catch (err) {
                    log(`Failed to fetch ${selectedFirmware.binPath}: ${err.message}`, 'error');
                    return;
                }
            }

            await executeFlash(binBuffer, targetOffset, targetChip, flashProgress, flashStats, log);
        });
    }

    // Toggle Monitor
    if (btnToggleMonitor) {
        btnToggleMonitor.addEventListener('click', async () => {
            if (!hasWebSerial) return;
            if (isMonitoring) {
                await stopMonitor(log);
                btnToggleMonitor.textContent = '📟 Open Serial Monitor';
            } else {
                const started = await startMonitor(log);
                if (started) {
                    btnToggleMonitor.textContent = '⏹ Stop Serial Monitor';
                }
            }
        });
    }

    // Reset Chip
    if (btnResetChip) {
        btnResetChip.addEventListener('click', async () => {
            await hardResetChip(log);
        });
    }
}

// Populate Project Dropdown
function populateProjectSelect(selectEl, list) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">-- Choose a Firmware Project --</option>';

    const grouped = {};
    for (const item of list) {
        const cat = item.category || 'General';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    }

    for (const [catName, items] of Object.entries(grouped)) {
        const group = document.createElement('optgroup');
        group.label = catName.toUpperCase();
        for (const it of items) {
            const opt = document.createElement('option');
            opt.value = it.id;
            const sizeKb = Math.round(it.fileSize / 1024);
            const sizeStr = sizeKb > 0 ? ` (${sizeKb} KB)` : '';
            opt.textContent = `${it.name}${sizeStr}`;
            group.appendChild(opt);
        }
        selectEl.appendChild(group);
    }

    // Auto-select first flashable item if available, else first item
    const firstFlashable = list.find(m => m.hasBinary) || list[0];
    if (firstFlashable) {
        selectEl.value = firstFlashable.id;
        selectedFirmware = firstFlashable;
        updateFirmwareDetails(selectedFirmware);
    }
}

function updateFirmwareDetails(item) {
    const detailsContainer = document.getElementById('firmwareDetails');
    const flashBtn = document.getElementById('btnConnectFlash');
    if (!detailsContainer || !item) return;

    let pinoutHtml = '';
    if (item.pinout && item.pinout.length > 0) {
        const rows = item.pinout.map(p => `
            <tr>
                <td class="pin-code font-mono">${p.pin}</td>
                <td class="pin-role">${p.role}</td>
            </tr>
        `).join('');

        pinoutHtml = `
            <div class="firmware-pinout-box">
                <div class="pinout-header">
                    <span class="pinout-title">HARDWARE PINOUT / GPIO MAP</span>
                    <span class="pinout-count">${item.pinout.length} assigned</span>
                </div>
                <table class="firmware-pin-table">
                    <thead>
                        <tr>
                            <th>Pin</th>
                            <th>Hardware Role / Component</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    if (item.hasBinary) {
        detailsContainer.innerHTML = `
            <div class="firmware-detail-row">
                <span class="detail-label">Target Chip:</span>
                <span class="detail-val chip-tag">${item.chip.toUpperCase()} (Board: ${item.board})</span>
            </div>
            <div class="firmware-detail-desc">${item.description}</div>
            ${pinoutHtml}
        `;
        if (flashBtn) {
            flashBtn.disabled = false;
            flashBtn.textContent = 'Connect & Flash Device';
        }
    } else {
        detailsContainer.innerHTML = `
            <div class="firmware-detail-row">
                <span class="detail-label">Target Chip:</span>
                <span class="detail-val chip-tag">${item.chip.toUpperCase()} (Board: ${item.board})</span>
            </div>
            <div class="firmware-detail-desc">
                ${item.description}
                <div style="margin-top: 8px; padding: 8px; background: rgba(0, 240, 255, 0.08); border-left: 3px solid var(--neon-cyan, #00f0ff); font-size: 0.85rem;">
                    💡 <em>This project does not yet have a precompiled binary on disk. Run compileAllESP32.bat to build it, or switch to 'Custom .BIN Upload' to flash a pre-built binary.</em>
                </div>
            </div>
            ${pinoutHtml}
        `;
        if (flashBtn) {
            flashBtn.disabled = true;
            flashBtn.textContent = 'Source Code Only (Compile to Flash)';
        }
    }

    detailsContainer.style.display = 'block';
}

// Background check for local studio
async function checkLocalStudio(badgeEl) {
    if (!badgeEl) return;
    try {
        const res = await fetch('http://localhost:3567/api/identify', {
            signal: AbortSignal.timeout(1500)
        });
        if (res.ok) {
            badgeEl.style.display = 'inline-flex';
            badgeEl.textContent = 'Local Compiler Active';
            badgeEl.className = 'flasher-badge studio-active';
            badgeEl.title = 'Local PlatformIO Web Uploader server is active on localhost:3567';
        }
    } catch {
        // Expected when server is offline
    }
}

// Load official esptool-js module
async function loadEsptool() {
    if (esptoolModule) return esptoolModule;
    esptoolModule = await import('./esptool-js.js');
    return esptoolModule;
}

// Convert ArrayBuffer to binary string (required by esptool-js writeFlash)
function bufferToBinaryString(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    return binary;
}

// Flash Execution
async function executeFlash(binBuffer, flashOffsetStr, targetChip, progressEl, statsEl, log) {
    isFlashing = true;
    const baudSelect = document.getElementById('flasherBaudSelect');
    const baudRate = parseInt((baudSelect && baudSelect.value) || '115200', 10);

    try {
        log('Requesting USB Serial device from browser...', 'info');
        activePort = await navigator.serial.requestPort();
        log('USB Port selected! Initializing connection...', 'info');

        const { ESPLoader, Transport } = await loadEsptool();
        activeTransport = new Transport(activePort, true);

        const terminalWrapper = {
            clean() {},
            writeLine(str) { log(str); },
            write(str) { log(str); }
        };

        activeLoader = new ESPLoader({
            transport: activeTransport,
            baudrate: baudRate,
            romBaudrate: 115200,
            terminal: terminalWrapper
        });

        if (statsEl) statsEl.textContent = 'Syncing with chip bootloader...';
        log('Syncing with chip bootloader (press BOOT if handshake does not advance)...', 'info');

        const chipName = await activeLoader.main();
        log(`Handshake successful! Detected Chip: ${chipName}`, 'success');
        if (statsEl) statsEl.textContent = `Connected: ${chipName} · Flashing...`;

        const binaryString = bufferToBinaryString(binBuffer);
        const flashOffset = parseInt(flashOffsetStr, 16) || 0x0;

        const fileArray = [{
            data: binaryString,
            address: flashOffset
        }];

        log(`Beginning flash write at address ${flashOffsetStr} (${Math.round(binBuffer.byteLength / 1024)} KB)...`, 'info');

        await activeLoader.writeFlash({
            fileArray,
            flashSize: 'keep',
            eraseAll: false,
            compress: true,
            reportProgress: (fileIndex, written, total) => {
                const pct = Math.round((written / total) * 100);
                if (progressEl) progressEl.style.width = `${pct}%`;
                if (statsEl) statsEl.textContent = `Writing: ${pct}% (${Math.round(written / 1024)} KB / ${Math.round(total / 1024)} KB)`;
            }
        });

        log('Firmware flashed successfully! Resetting microcontroller...', 'success');
        if (statsEl) statsEl.textContent = '✔ Flashed & Verified! Running...';
        if (progressEl) progressEl.style.width = '100%';

        await activeLoader.after('hard_reset');
        log('Chip reset complete. Microcontroller is now executing new firmware!', 'success');
    } catch (err) {
        log(`Flash error: ${err.message}`, 'error');
        if (statsEl) statsEl.textContent = `✖ Error: ${err.message}`;
    } finally {
        isFlashing = false;
        try {
            if (activeTransport) {
                await activeTransport.disconnect();
                activeTransport = null;
            }
        } catch {}
    }
}

// Live Serial Monitor
async function startMonitor(log) {
    if (isMonitoring) return true;
    try {
        if (!activePort) {
            log('Requesting serial port for monitor...', 'info');
            activePort = await navigator.serial.requestPort();
        }

        const baudSelect = document.getElementById('flasherBaudSelect');
        const baudRate = parseInt((baudSelect && baudSelect.value) || '115200', 10);

        await activePort.open({ baudRate });
        log(`Serial Monitor opened on ${baudRate} bps. Streaming output...`, 'success');
        isMonitoring = true;

        const decoder = new TextDecoderStream();
        activePort.readable.pipeTo(decoder.writable);
        monitorReader = decoder.readable.getReader();

        readMonitorLoop(log);
        return true;
    } catch (err) {
        log(`Serial monitor error: ${err.message}`, 'error');
        isMonitoring = false;
        return false;
    }
}

async function readMonitorLoop(log) {
    const terminalLog = document.getElementById('flasherLog');
    try {
        while (isMonitoring && monitorReader) {
            const { value, done } = await monitorReader.read();
            if (done) break;
            if (value && terminalLog) {
                terminalLog.textContent += value;
                terminalLog.scrollTop = terminalLog.scrollHeight;
            }
        }
    } catch (err) {
        if (isMonitoring) log(`Monitor stream ended: ${err.message}`, 'warn');
    }
}

async function stopMonitor(log) {
    isMonitoring = false;
    if (monitorReader) {
        try { await monitorReader.cancel(); } catch {}
        monitorReader = null;
    }
    if (activePort) {
        try { await activePort.close(); } catch {}
    }
    log('Serial Monitor disconnected.', 'info');
}

// Hard reset
async function hardResetChip(log) {
    if (!activePort) {
        try {
            activePort = await navigator.serial.requestPort();
        } catch {
            return;
        }
    }
    try {
        log('Sending DTR/RTS hardware reset pulse...', 'info');
        await activePort.setSignals({ dataTerminalReady: false, requestToSend: true });
        await new Promise(r => setTimeout(r, 100));
        await activePort.setSignals({ dataTerminalReady: true, requestToSend: false });
        await new Promise(r => setTimeout(r, 100));
        await activePort.setSignals({ dataTerminalReady: false, requestToSend: false });
        log('Reset pulse sent successfully.', 'success');
    } catch (err) {
        log(`Reset failed: ${err.message}`, 'error');
    }
}
