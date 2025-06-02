import SerialBridge from './serialYoinker.js';

SerialBridge.onSerialMatch("Ping!", (line, port) => {
  console.log(`[EVENT] ${port}: ${line}`);
  SerialBridge.sendToESP32("Pong!");
});

//If serial message matches " ", send " " to ESP32.
SerialBridge.onSerialMatch("CardScanned", () => {
  console.log("[EVENT] Scanned card — triggering animation...");
  SerialBridge.sendToESP32("CardScanned");
});

// Optional: send something manually
setTimeout(() => {
  SerialBridge.sendToESP32("hello123");
}, 5000);