let devices = [];
let selectedDevices = new Set();

window.addEventListener('pywebviewready', function() {
    logToConsole("System initialized.");
    loadDevices();
});

if (!window.pywebview) {
    console.log("PyWebView not detected yet.");
}

function addToConsole(msg) {
    logToConsole(msg);
}

function logToConsole(msg) {
    const consoleDiv = document.getElementById('console-output');
    const entry = document.createElement('div');
    entry.className = 'console-entry';
    
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="console-timestamp">[${time}]</span> ${msg}`;
    
    consoleDiv.appendChild(entry);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

async function loadDevices() {
    showStatus("Fetching devices...");
    logToConsole("Requesting device list from API...");
    try {
        const response = await window.pywebview.api.get_devices();
        devices = response;
        renderDevices();
        showStatus(`Loaded ${devices.length} devices.`);
        logToConsole(`Successfully loaded ${devices.length} devices.`);
    } catch (err) {
        showStatus("Error loading devices.");
        logToConsole("Error: " + err);
    }
}

function renderDevices() {
    const list = document.getElementById('device-list');
    list.innerHTML = '';

    if (devices.length === 0) {
        list.innerHTML = '<div style="padding:10px; opacity:0.6;">No devices found.</div>';
        return;
    }

    devices.forEach(dev => {
        const item = document.createElement('div');
        item.className = 'device-item';
        const mac = dev.device; 
        
        if (selectedDevices.has(mac)) {
            item.classList.add('selected');
        }

        item.onclick = () => toggleSelection(mac, item);

        item.innerHTML = `
            <div>
                <div class="device-name">${dev.deviceName}</div>
                <div class="device-sku">${dev.sku}</div>
            </div>
            <div style="width: 10px; height: 10px; border-radius: 50%; background: #ccc;"></div>
        `;
        list.appendChild(item);
    });
}

function toggleSelection(mac, element) {
    if (selectedDevices.has(mac)) {
        selectedDevices.delete(mac);
        element.classList.remove('selected');
    } else {
        selectedDevices.add(mac);
        element.classList.add('selected');
    }
}

function selectAll() {
    devices.forEach(d => selectedDevices.add(d.device));
    renderDevices();
    logToConsole("Selected all devices.");
}

function deselectAll() {
    selectedDevices.clear();
    renderDevices();
    logToConsole("Deselected all devices.");
}

async function controlPower(state) {
    if (selectedDevices.size === 0) {
        showStatus("No devices selected.");
        return;
    }
    
    const action = state ? 'on' : 'off';
    const count = selectedDevices.size;
    showStatus(`Turning ${action.toUpperCase()} ${count} devices...`);
    logToConsole(`Sending ${action.toUpperCase()} command to ${count} devices...`);
    
    try {
        const results = await window.pywebview.api.bulk_control(Array.from(selectedDevices), action);
        // Python returns list of results
        logToConsole(`Command finished. Processed ${results.length} actions.`);
        showStatus("Command sent.");
    } catch (err) {
        showStatus("Error: " + err);
        logToConsole("Error executing command: " + err);
    }
}

async function applyColor() {
    if (selectedDevices.size === 0) {
        showStatus("No devices selected.");
        return;
    }

    const colorHex = document.getElementById('color-picker').value;
    const hex = colorHex.substring(1);
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const colorInt = (r << 16) | (g << 8) | b;

    showStatus(`Setting color to ${colorHex}...`);
    logToConsole(`Setting color to ${colorHex} (Int: ${colorInt}) for ${selectedDevices.size} devices...`);

    try {
        const results = await window.pywebview.api.bulk_control(Array.from(selectedDevices), 'color', colorInt);
        logToConsole(`Color command finished.`);
        showStatus("Color command sent.");
    } catch (err) {
        showStatus("Error: " + err);
        logToConsole("Error setting color: " + err);
    }
}

function showStatus(msg) {
    const el = document.getElementById('status-message');
    el.innerText = msg;
    setTimeout(() => {
        if (el.innerText === msg) el.innerText = "Ready";
    }, 5000);
}