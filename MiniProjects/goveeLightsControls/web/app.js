let devices = [];
let selectedDevices = new Set();

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    logToConsole("System initialized.");
    loadDevices();
});

function logToConsole(msg) {
    const consoleDiv = document.getElementById('console-output');
    if (!consoleDiv) return;
    const entry = document.createElement('div');
    entry.className = 'console-entry';
    
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="console-timestamp">[${time}]</span> ${msg}`;
    
    consoleDiv.appendChild(entry);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function loadDevices() {
    showStatus("Fetching devices...");
    logToConsole("Requesting device list from API...");
    try {
        const response = await fetch('/api/devices');
        const data = await response.json();
        
        if (data.code === 200) {
            devices = data.data;
            renderDevices();
            showStatus(`Loaded ${devices.length} devices.`);
            logToConsole(`Successfully loaded ${devices.length} devices.`);
        } else {
            throw new Error(JSON.stringify(data));
        }
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
    
    const actionValue = state ? 1 : 0;
    const count = selectedDevices.size;
    showStatus(`Turning ${state ? 'ON' : 'OFF'} ${count} devices...`);
    
    for (const mac of selectedDevices) {
        const device = devices.find(d => d.device === mac);
        if (!device) continue;

        const payload = {
            "requestId": uuidv4(),
            "payload": {
                "sku": device.sku,
                "device": mac,
                "capability": {
                    "type": "devices.capabilities.on_off",
                    "instance": "powerSwitch",
                    "value": actionValue
                }
            }
        };

        try {
            logToConsole(`Sending command to ${device.deviceName}...`);
            await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            logToConsole(`Error for ${device.deviceName}: ${err}`);
        }
    }
    
    showStatus("Commands finished.");
    logToConsole("Bulk power command processing complete.");
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
    
    for (const mac of selectedDevices) {
        const device = devices.find(d => d.device === mac);
        if (!device) continue;

        const payload = {
            "requestId": uuidv4(),
            "payload": {
                "sku": device.sku,
                "device": mac,
                "capability": {
                    "type": "devices.capabilities.color_setting",
                    "instance": "colorRgb",
                    "value": colorInt
                }
            }
        };

        try {
            logToConsole(`Setting color for ${device.deviceName}...`);
            await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            logToConsole(`Error for ${device.deviceName}: ${err}`);
        }
    }

    logToConsole(`Color command finished.`);
    showStatus("Color command sent.");
}

function showStatus(msg) {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.innerText = msg;
    setTimeout(() => {
        if (el.innerText === msg) el.innerText = "Ready";
    }, 5000);
}