// ─── SERIAL MONITOR & LOG EMULATOR ──────────────────────────────────────────
export const serialConsole = document.getElementById("serialConsole");
const clearConsoleBtn = document.getElementById("clearConsoleBtn");

export function addSerialLog(msg) {
    if (!serialConsole) return;
    const now = (performance.now() / 1000).toFixed(2);
    const line = document.createElement("div");
    line.className = "console-line";
    if (msg.includes("[WARN]") || msg.includes("stalled")) line.style.color = "#f2b134"; // Yellow
    else if (msg.includes("[ERROR]") || msg.includes("failed") || msg.includes("Err")) line.style.color = "#e23b24"; // Red
    line.textContent = `[${now}] ${msg}`;
    serialConsole.appendChild(line);
    
    // Keep last 100
    while (serialConsole.childNodes.length > 100) {
        serialConsole.removeChild(serialConsole.firstChild);
    }
    serialConsole.scrollTop = serialConsole.scrollHeight;
}

if (clearConsoleBtn) {
    clearConsoleBtn.addEventListener("click", () => {
        if (serialConsole) serialConsole.innerHTML = "";
    });
}

// ─── ESP32 BOARD STATE & PIN ANIMATIONS ──────────────────────────────────────
let i2cBlinkTicks = 0;
export function triggerI2CBlink() {
    i2cBlinkTicks = 15; // flashes for 15 frames
}

export function updateHardwarePins(activeAmp, isMotorStalled) {
    const sda = document.getElementById("pin-sda");
    const scl = document.getElementById("pin-scl");
    const pwm = document.getElementById("pin-pwm");
    const tx  = document.getElementById("pin-tx");
    const led = document.getElementById("esp-led");
    
    if (!sda || !scl || !pwm || !tx || !led) return;

    // I2C bus traffic
    if (i2cBlinkTicks > 0) {
        sda.setAttribute("fill", i2cBlinkTicks % 2 === 0 ? "#f2b134" : "#111"); // Bauhaus Yellow
        scl.setAttribute("fill", i2cBlinkTicks % 2 === 0 ? "#f2b134" : "#111");
        i2cBlinkTicks--;
    } else {
        sda.setAttribute("fill", "#111");
        scl.setAttribute("fill", "#111");
    }
    
    // PWM output pin
    if (activeAmp > 0.05 && !isMotorStalled) {
        pwm.setAttribute("fill", `rgba(226, 59, 36, ${activeAmp})`); // Bauhaus Red intensity
        tx.setAttribute("fill", Math.random() > 0.5 ? "#f2b134" : "#111");
        led.setAttribute("fill", `rgba(242, 177, 52, ${0.4 + activeAmp * 0.6})`); // GPIO8 status LED glows Yellow
    } else {
        pwm.setAttribute("fill", "#111");
        tx.setAttribute("fill", "#111");
        led.setAttribute("fill", isMotorStalled ? "#e23b24" : "#111"); // Stalled turns status LED solid red
    }
}

// Initial boot sequence log
export function initBootLogs() {
    setTimeout(() => { addSerialLog("[SYS] Booting ESP32-C3 @ 160MHz..."); }, 100);
    setTimeout(() => { addSerialLog("[SYS] Free Heap: 284.2 KB"); }, 250);
    setTimeout(() => { addSerialLog("[HAL] Default driver: MOSFET PWM (GPIO 6)"); }, 400);
    setTimeout(() => { addSerialLog("[HAL] FastLED strip ready (GPIO 5, count 20)"); }, 550);
    setTimeout(() => { addSerialLog("[NET] SoftAP / BLE identity: Haxel-XXXX (MAC suffix)"); }, 700);
    setTimeout(() => { addSerialLog("[SYS] System ready."); }, 850);
}
