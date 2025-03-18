const maxApi = require("max-api");
const WebSocket = require("./node_modules/ws");

// Create WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws) => {
    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            data.forEach(polygon => {
                maxApi.outlet("id", polygon.id);
                maxApi.outlet("total", polygon.total);
                maxApi.outlet("x", polygon.x);
                maxApi.outlet("y", polygon.y);
                maxApi.outlet("attached", polygon.attached ? 1 : 0);
				maxApi.outlet("staticPercentage", polygon.staticPercentage);
            });
        } catch (err) {
            console.error("Error processing message:", err);
        }
    });

    ws.send("Connected to Max!");
});