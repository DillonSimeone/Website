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
    pixels: 300,
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
    // Send initial settings to python just in case it's already listening
    sendSettingsToPython(currentSettings);
});
