const maxApi = require("max-api");
const WebSocket = require("./node_modules/ws");

// Create WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws) => {
    ws.on("message", (message) => {
        const data = JSON.parse(message);
        for (const [dial, value] of Object.entries(data)) {
            maxApi.outlet(dial, value);
        }
    });

    ws.send("Connected to Max!");
});