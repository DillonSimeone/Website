const express = require('express');
const dgram = require('dgram');
const path = require('path');

const app = express();
const PORT = 3000;
const PYTHON_UDP_PORT = 9999;
const UDP_HOST = '127.0.0.1';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store current visualizer settings
let currentSettings = {
    animation: 'spectrum',
    pixels: 680,
    gain: 5.0,
    smoothing: 0.7,
    threshold: 0.001
};

// Helper to send settings to Python via UDP
function sendSettingsToPython(settings) {
    const message = Buffer.from(JSON.stringify(settings));
    const client = dgram.createSocket('udp4');
    client.send(message, PYTHON_UDP_PORT, UDP_HOST, (err) => {
        client.close();
        if (err) {
            console.error('Failed to send UDP command to Python:', err);
        }
    });
}

// REST Endpoint to update settings
app.post('/api/settings', (req, res) => {
    currentSettings = { ...currentSettings, ...req.body };
    sendSettingsToPython(currentSettings);
    res.json({ status: 'success', settings: currentSettings });
});

// REST Endpoint to get current settings
app.get('/api/settings', (req, res) => {
    res.json(currentSettings);
});

// Live SSE Art-Net subscribers for 1:1 simulator
const sseClients = new Set();

app.get('/api/artnet-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    req.on('close', () => {
        sseClients.delete(res);
    });
});

// Setup Art-Net UDP listener (port 6454) to ingest real DMX packets for the simulator
const artnetSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
artnetSocket.on('message', (msg) => {
    // Check Art-Net header "Art-Net\0"
    if (msg.length >= 18 && msg.toString('ascii', 0, 7) === 'Art-Net') {
        const opCode = msg.readUInt16LE(8);
        if (opCode === 0x5000) { // OpOutput / DMX
            const universe = msg.readUInt16LE(14);
            const length = msg.readUInt16BE(16);
            const dmxData = msg.slice(18, 18 + length);
            
            // Broadcast to connected simulator clients
            if (sseClients.size > 0) {
                const payload = JSON.stringify({
                    universe,
                    length,
                    data: Array.from(dmxData)
                });
                for (const client of sseClients) {
                    client.write(`data: ${payload}\n\n`);
                }
            }
        }
    }
});

artnetSocket.on('error', (err) => {
    console.log('[!] Art-Net UDP ingest notice:', err.message);
});

try {
    artnetSocket.bind(6454, () => {
        console.log('[+] Simulator Art-Net receiver listening on UDP 6454');
    });
} catch (e) {
    console.log('[!] Notice: Could not bind port 6454:', e.message);
}

// REST Endpoint to trigger full project shutdown
app.post('/api/shutdown', (req, res) => {
    console.log('Shutting down visualizer and web controller...');
    
    // Send shutdown signal to Python
    sendSettingsToPython({ command: 'shutdown' });
    
    res.json({ status: 'shutting_down' });
    
    // Give response time to deliver to client, then exit
    setTimeout(() => {
        process.exit(0);
    }, 500);
});

app.listen(PORT, () => {
    console.log(`Express control panel server running on http://localhost:${PORT}`);
    console.log(`1:1 Light Tube Simulator available at http://localhost:${PORT}/simulator.html`);
    sendSettingsToPython(currentSettings);
});
