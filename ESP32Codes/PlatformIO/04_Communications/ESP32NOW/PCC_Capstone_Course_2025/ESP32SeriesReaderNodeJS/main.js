import SerialBridge from './serialYoinker.js'; // Custom little library Dillon made, don't worry about what's inside there. Use functions below.

// === Helper functions === //
function parseRFIDMessage(line) {
  // Example line:
  // "[ESP-NOW] From: F0:F5:BD:07:82:F9 | Message: RFIDreader1 95 ac 59 3e"
  const match = line.match(/Message:\s*(\S+)\s+(.+)/);
  if (!match) return null;

  return {
    device: match[1],
    message: match[2]
  };
}

function glitch(){
  SerialBridge.sendToESP32("Pong!");
}

//If Serial message matches "Ping!", do nothing. This could be error handling in case the master is disconnected. Consider the ping! per 2 seconds as the heartbeat signal.
SerialBridge.onSerialMatch("Ping!", (line, port) => {
  console.log(`[EVENT] ${port}: ${line}`);
});

// Optional: send something manually
setTimeout(() => {
  SerialBridge.sendToESP32("Shrek");
}, 5000); //This triggers each 5 seconds.

SerialBridge.onSerialMatch(/RFID/, (line, port) => {
  const data = parseRFIDMessage(line);
  if (data) {
    console.log(`[RFID] From ${data.device}: ${data.message}`);
  }
  glitch();
});
