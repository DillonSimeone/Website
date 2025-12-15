let messageCount = 0;
let isServerRunning = false;

// 1. Initialize API-dependent features (IP Address)
window.addEventListener('pywebviewready', () => {
    pywebview.api.get_ip_address().then(ip => {
        document.getElementById('ip-display').textContent = ip;
        document.getElementById('ip-snippet').textContent = ip;
    });
});

// 2. Initialize UI features (Port inputs, etc)
window.addEventListener('load', () => {
    updatePortDisplay();
    document.getElementById('port-input').addEventListener('input', updatePortDisplay);
});

function updatePortDisplay() {
    const port = document.getElementById('port-input').value;
    document.getElementById('port-display').textContent = port;
    document.getElementById('port-snippet').textContent = port;
}

function logMessage(address, args) {
    const container = document.getElementById('log-container');
    
    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    
    entry.innerHTML = `
        <div class="log-meta">
            <span>${time}.${ms}</span>
        </div>
        <div class="log-content">
            <span class="log-address">${address}</span>
            <span class="log-args">${args}</span>
        </div>
    `;
    
    container.appendChild(entry);
    
    // Auto-scroll
    container.scrollTop = container.scrollHeight;

    // Update count
    messageCount++;
    document.getElementById('log-count').textContent = `${messageCount} messages`;
}

function updateStatus(text, isRunning) {
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const portInput = document.getElementById('port-input');

    statusText.textContent = text.toUpperCase();
    if (isRunning) {
        statusDot.classList.add('active');
        btnStart.disabled = true;
        btnStop.disabled = false;
        portInput.disabled = true;
        btnStart.textContent = "LISTENING...";
    } else {
        statusDot.classList.remove('active');
        btnStart.disabled = false;
        btnStop.disabled = true;
        portInput.disabled = false;
        btnStart.textContent = "START LISTENER";
    }
    isServerRunning = isRunning;
}

function startServer() {
    const port = document.getElementById('port-input').value;
    updateStatus("STARTING...", true); // Optimistic UI
    
    pywebview.api.start_server(parseInt(port)).then((response) => {
        if (response.success) {
            updateStatus("RUNNING", true);
        } else {
            alert("Error: " + response.error);
            updateStatus("STOPPED", false);
        }
    });
}

function stopServer() {
    pywebview.api.stop_server().then((response) => {
        updateStatus("STOPPED", false);
    });
}

function clearLog() {
    const container = document.getElementById('log-container');
    container.innerHTML = '<div class="empty-state">Log cleared. Waiting for new messages...</div>';
    messageCount = 0;
    document.getElementById('log-count').textContent = '0 messages';
}

// Function called from Python
function addToConsole(msg_json) {
    try {
        const data = JSON.parse(msg_json);
        // Format args nicely
        let argsStr = JSON.stringify(data.args);
        // Remove brackets for cleaner look if possible, or just keep as is
        argsStr = argsStr.substring(1, argsStr.length - 1); 
        if (argsStr.length === 0) argsStr = "(no data)";
        
        logMessage(data.address, argsStr);
    } catch (e) {
        console.error("Bad JSON", e);
    }
}