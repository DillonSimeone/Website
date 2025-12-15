// Constants
const APP_ID_PREFIX = 'smartphone-haptics-demo-';
const HOST_ID = APP_ID_PREFIX + 'host-room-1'; // Static ID for the host so clients know where to connect

// Elements
const hostToggle = document.getElementById('hostToggle');
const modeDescription = document.getElementById('modeDescription');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const hostControls = document.getElementById('hostControls');
const peerIdDisplay = document.getElementById('peerIdDisplay');
const myPeerId = document.getElementById('myPeerId');

// Buttons
const triggerBtn = document.getElementById('triggerBtn');
const stopBtn = document.getElementById('stopBtn');
const presetButtons = document.querySelectorAll('.preset-buttons button');
const customPatternInput = document.getElementById('customPattern');

// State
let peer = null;
let connections = []; // For Host: list of connected clients
let hostConnection = null; // For Client: connection to host
let isHost = false;

// Initialize
function init() {
    // Default to Client mode
    startClientMode();

    hostToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            attemptHostMode();
        } else {
            startClientMode();
        }
    });

    setupUI();
}

// --- Client Mode ---
function startClientMode() {
    cleanup();
    isHost = false;
    updateUIState(false);
    
    statusText.textContent = "Initializing Client...";
    
    // Create a new Peer with a random ID
    peer = new Peer(null, {
        debug: 2
    });

    peer.on('open', (id) => {
        myPeerId.textContent = id;
        statusText.textContent = "Client ready. Connecting to Host...";
        connectToHost();
    });

    peer.on('error', (err) => {
        console.error(err);
        statusText.textContent = "Error: " + err.type;
    });
}

function connectToHost() {
    if (!peer) return;

    // Connect to the known Host ID
    const conn = peer.connect(HOST_ID);

    conn.on('open', () => {
        hostConnection = conn;
        connectionStatus.textContent = "Connected to Host";
        connectionStatus.style.color = "#4caf50"; // Green
        statusText.textContent = "Waiting for haptics...";
    });

    conn.on('data', (data) => {
        handleIncomingData(data);
    });

    conn.on('close', () => {
        connectionStatus.textContent = "Disconnected from Host";
        connectionStatus.style.color = "var(--danger-color)";
        hostConnection = null;
        // Retry connection after a delay?
    });
    
    conn.on('error', (err) => {
        connectionStatus.textContent = "Host not found (Is it on?)";
        connectionStatus.style.color = "orange";
    });
}

// --- Host Mode ---
function attemptHostMode() {
    cleanup();
    statusText.textContent = "Attempting to host...";

    // Try to create a Peer with the specific HOST_ID
    const tempPeer = new Peer(HOST_ID, {
        debug: 2
    });

    tempPeer.on('open', (id) => {
        // Success! We are the host.
        peer = tempPeer;
        isHost = true;
        myPeerId.textContent = id;
        setupHostListeners();
        updateUIState(true);
    });

    tempPeer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            // ID is taken, Host already exists
            alert("A Host is already active! You cannot toggle Host mode while another Host is running.");
            // Revert toggle
            hostToggle.checked = false;
            // Go back to client mode
            startClientMode();
        } else {
            console.error("Host Error", err);
            statusText.textContent = "Host Error: " + err.type;
            // Revert toggle
            hostToggle.checked = false;
            startClientMode();
        }
    });
}

function setupHostListeners() {
    connectionStatus.textContent = "Hosting (0 Clients)";
    connectionStatus.style.color = "#4caf50"; // Green
    statusText.textContent = "Ready to broadcast";

    peer.on('connection', (conn) => {
        connections.push(conn);
        updateHostStatus();

        conn.on('open', () => {
            // Send a welcome or sync?
        });

        conn.on('close', () => {
            connections = connections.filter(c => c !== conn);
            updateHostStatus();
        });
    });
}

function updateHostStatus() {
    connectionStatus.textContent = `Hosting (${connections.length} Clients)`;
}

// --- Common Logic ---
function cleanup() {
    if (peer) {
        peer.destroy(); // Closes all connections
        peer = null;
    }
    connections = [];
    hostConnection = null;
    connectionStatus.textContent = "Disconnected";
    connectionStatus.style.color = "var(--primary-color)";
}

function updateUIState(hostMode) {
    if (hostMode) {
        modeDescription.textContent = "Host Mode: Broadcasting haptics to clients.";
        hostControls.style.opacity = "1";
        hostControls.style.pointerEvents = "auto";
        peerIdDisplay.style.display = "block";
    } else {
        modeDescription.textContent = "Client Mode: Waiting for haptic commands from Host.";
        hostControls.style.opacity = "0.5";
        hostControls.style.pointerEvents = "none";
        peerIdDisplay.style.display = "block";
    }
}

function handleIncomingData(data) {
    console.log("Received:", data);
    if (data.type === 'vibrate') {
        doVibrate(data.pattern);
        statusText.textContent = "Vibrating: " + data.pattern;
    } else if (data.type === 'stop') {
        navigator.vibrate(0);
        statusText.textContent = "Stopped";
    }
}

function doVibrate(pattern) {
    // Process pattern string to array if needed, though vibrate takes both
    if (navigator.vibrate) {
        // Unlock audio context trick if needed (not implemented here, assuming user interaction already happened)
        navigator.vibrate(pattern);
    }
}

// --- UI Interaction (Host Side) ---
function setupUI() {
    // Helper to broadcast
    const broadcast = (data) => {
        if (!isHost) return;
        
        // Also vibrate self
        handleIncomingData(data);

        // Send to all clients
        connections.forEach(conn => {
            if (conn.open) {
                conn.send(data);
            }
        });
    };

    triggerBtn.addEventListener('click', () => {
        const pattern = parsePattern(customPatternInput.value) || [200];
        broadcast({ type: 'vibrate', pattern: pattern });
    });

    stopBtn.addEventListener('click', () => {
        broadcast({ type: 'stop' });
    });

    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const patternStr = btn.getAttribute('data-pattern');
            const pattern = patternStr.split(',').map(Number);
            broadcast({ type: 'vibrate', pattern: pattern });
        });
    });
}

function parsePattern(str) {
    if (!str) return null;
    return str.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
}

// Start
init();
