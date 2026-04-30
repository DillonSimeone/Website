#ifndef INDEX_HTML_H
#define INDEX_HTML_H

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEURAL-LINK CORE // MAX7219</title>
    <style>
        :root {
            --bg-color: #050510;
            --term-color: #00ff41;
            --term-glow: #00ff4188;
            --border-color: #008f11;
            --panel-bg: rgba(0, 17, 0, 0.6);
        }
        body {
            background-color: var(--bg-color);
            color: var(--term-color);
            font-family: "Courier New", Courier, monospace;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        h1 {
            text-shadow: 0 0 10px var(--term-glow);
            text-transform: uppercase;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 10px;
            width: 100%;
            text-align: center;
            margin-top: 0;
        }
        .container {
            width: 100%;
            max-width: 600px;
            background: var(--panel-bg);
            border: 1px solid var(--border-color);
            padding: 20px;
            box-shadow: 0 0 15px var(--term-glow) inset;
            box-sizing: border-box;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            text-shadow: 0 0 5px var(--term-glow);
        }
        input[type="text"], input[type="number"] {
            width: 100%;
            padding: 10px;
            background: #000;
            border: 1px solid var(--border-color);
            color: var(--term-color);
            box-sizing: border-box;
            font-family: inherit;
            font-size: 16px;
        }
        input[type="text"]:focus, input[type="number"]:focus {
            outline: none;
            box-shadow: 0 0 10px var(--term-glow);
        }
        .checkbox-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .checkbox-item {
            display: flex;
            align-items: center;
        }
        .checkbox-item input {
            margin-right: 10px;
            accent-color: #000;
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        button {
            width: 100%;
            padding: 15px;
            background: var(--border-color);
            color: #000;
            border: 1px solid var(--term-color);
            font-size: 1.2em;
            font-weight: bold;
            cursor: pointer;
            text-transform: uppercase;
            font-family: inherit;
            transition: all 0.3s ease;
        }
        button:hover {
            background: var(--term-color);
            box-shadow: 0 0 15px var(--term-glow);
        }
        button:active {
            transform: scale(0.98);
        }
        
        /* Demo Display Styles */
        .demo-container {
            margin-top: 10px;
            margin-bottom: 30px;
            padding: 15px;
            border: 1px dashed var(--border-color);
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        canvas#matrixCanvas {
            background-color: #0d0000;
            border: 2px solid #220000;
            border-radius: 4px;
            box-shadow: 0 0 20px #ff000033;
        }
        .scanlines {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
            background-size: 100% 4px;
            pointer-events: none;
            z-index: 9999;
        }
        .status-line {
            font-size: 12px;
            color: #888;
            margin-bottom: 15px;
            text-align: right;
        }
        #currentAnimDisplay {
            color: var(--term-color);
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="scanlines"></div>
    <div class="container">
        <h1>SYS.OP // MAX-7219</h1>
        
        <div class="form-group">
            <label>> DEMO_PREVIEW [40x8 PIXELS]:</label>
            <div class="demo-container">
                <canvas id="matrixCanvas" width="320" height="64"></canvas>
            </div>
            <div class="status-line">> SYNCED_ANIMATION: <span id="currentAnimDisplay">UNKNOWN</span></div>
        </div>

        <div class="form-group">
            <label>> OVERRIDE_TEXT_FEED:</label>
            <input type="text" id="textInput" maxlength="100" placeholder="ENTER TEXT...">
        </div>

        <div class="form-group">
            <label>> ENABLE_ANIMATIONS:</label>
            <div class="checkbox-grid" id="animGrid">
                <!-- Injected via JS -->
            </div>
        </div>

        <div class="form-group">
            <label>> ANIMATION_SPEED (MS):</label>
            <input type="number" id="speedInput" min="10" max="2000" value="40">
        </div>

        <button id="saveBtn" onclick="saveSettings()">> COMMIT_CHANGES</button>
    </div>

    <script>
        const animations = [
            "Scroll Left", "Scroll Right", "Scroll Up", "Scroll Down",
            "Fade", "Wipe", "Grow", "Scan", "Cursor", "Slice"
        ];
        
        const grid = document.getElementById("animGrid");
        animations.forEach((anim, i) => {
            const div = document.createElement("div");
            div.className = "checkbox-item";
            div.innerHTML = `<input type="checkbox" id="anim_${i}" checked><label for="anim_${i}">${anim}</label>`;
            grid.appendChild(div);
        });

        const textInput = document.getElementById("textInput");
        const speedInput = document.getElementById("speedInput");
        const canvas = document.getElementById("matrixCanvas");
        const ctx = canvas.getContext("2d");
        const currentAnimDisplay = document.getElementById("currentAnimDisplay");

        // Hardware simulation parameters
        const cols = 40;
        const rows = 8;
        const ledSize = 6;
        const spacing = 2; // Pixel pitch = 8

        // Offscreen canvas for text rendering to pixel data
        const offCanvas = document.createElement("canvas");
        const offCtx = offCanvas.getContext("2d");
        offCanvas.width = 1000;
        offCanvas.height = 8;

        let currentAnimName = "Scroll Left";
        let animTick = 0;
        let pState = 0; // custom state generic tracker

        function updateOffscreen() {
            offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
            offCtx.fillStyle = "white";
            offCtx.font = "bold 9px monospace";
            offCtx.textBaseline = "top";
            let t = textInput.value;
            if(!t || t === "") t = " ";
            offCtx.fillText(t, 0, 0);
        }

        textInput.addEventListener("input", updateOffscreen);

        let scrollOffset = cols; 
        
        setInterval(() => {
            updateOffscreen();
            let textW = offCtx.measureText(textInput.value || " ").width;
            if(textW < cols) textW = cols; // minimal wrap
            
            animTick++;

            // Handle animation logic state logic
            let opac = 1.0;
            let displayX = 0;
            let displayY = 0;
            let wipeMask = -1; // -1 means no mask
            let growMask = -1;
            
            if (currentAnimName === "Scroll Left") {
                scrollOffset -= 0.5;
                if (scrollOffset < -textW) scrollOffset = cols;
                displayX = scrollOffset;
            } 
            else if (currentAnimName === "Scroll Right") {
                scrollOffset += 0.5;
                if (scrollOffset > cols) scrollOffset = -textW;
                displayX = scrollOffset;
            }
            else if (currentAnimName === "Scroll Up") {
                displayX = (cols/2) - (textW/2);
                pState -= 0.3;
                if (pState < -8) pState = 8;
                displayY = pState;
            }
            else if (currentAnimName === "Scroll Down") {
                displayX = (cols/2) - (textW/2);
                pState += 0.3;
                if (pState > 8) pState = -8;
                displayY = pState;
            }
            else if (currentAnimName === "Fade") {
                displayX = (cols/2) - (textW/2);
                opac = Math.abs(Math.sin(animTick * 0.05));
            }
            else if (currentAnimName === "Wipe") {
                displayX = (cols/2) - (textW/2);
                pState += 0.5;
                if(pState > cols + 10) pState = 0;
                wipeMask = pState;
            }
            else if (currentAnimName === "Scan") {
                displayX = (cols/2) - (textW/2);
                pState += 1.0;
                if(pState > cols * 2) pState = 0;
                // scan effect is just passing a line
                wipeMask = -2; // special flag
            }
            else if (currentAnimName === "Grow") {
                displayX = (cols/2) - (textW/2);
                pState += 0.2;
                if(pState > 8) pState = 0;
                growMask = pState;
            }
            else {
                // Default fallback
                displayX = (cols/2) - (textW/2);
                if(currentAnimName === "Cursor" || currentAnimName === "Slice"){
                    opac = (animTick % 20 < 10) ? 1.0 : 0.0;
                }
            }


            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height).data;

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    let ledOn = false;
                    let textX = Math.floor(x - displayX);
                    let textY = Math.floor(y - displayY);
                    
                    if (textX >= 0 && textX < offCanvas.width && textY >= 0 && textY < rows) {
                        let idx = (textY * offCanvas.width + textX) * 4;
                        if (imgData[idx + 3] > 128) { 
                            ledOn = true;
                        }
                    }

                    // Masking logic
                    if (wipeMask !== -1 && wipeMask !== -2) {
                        if (x > wipeMask) ledOn = false;
                    }
                    if (wipeMask === -2) {
                        if (x > pState || (x < pState - 5)) ledOn = false;
                    }
                    if (growMask !== -1) {
                        if (y < (4 - growMask/2) || y > (4 + growMask/2)) ledOn = false;
                    }

                    // Render physical LED
                    let px = x * (ledSize + spacing) + spacing;
                    let py = y * (ledSize + spacing) + spacing;
                    
                    ctx.beginPath();
                    ctx.arc(px + ledSize/2, py + ledSize/2, ledSize/2, 0, Math.PI * 2);
                    
                    if (ledOn && Math.random() < opac) {
                        ctx.fillStyle = "#ff1111"; // Bright red
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = "#ff0000";
                    } else {
                        ctx.fillStyle = "#220000"; // Off red
                        ctx.shadowBlur = 0;
                    }
                    ctx.fill();
                }
            }
        }, 50);

        // Fetch settings & status polling
        function pollStatus(isInit = false) {
            fetch('/settings').then(r => r.json()).then(data => {
                if (isInit) {
                    if(data.text) {
                        textInput.value = data.text;
                        updateOffscreen();
                    }
                    if(data.speed !== undefined) {
                        speedInput.value = data.speed;
                    }
                    if(data.anims) {
                        data.anims.forEach((en, i) => {
                            const cb = document.getElementById(`anim_${i}`);
                            if(cb) cb.checked = (en === 1);
                        });
                    }
                }
                if(data.currentAnim !== undefined) {
                    currentAnimName = animations[data.currentAnim];
                    currentAnimDisplay.innerText = currentAnimName.toUpperCase();
                    currentAnimDisplay.style.color = "var(--term-color)";
                }
            }).catch(e => {
                currentAnimDisplay.innerText = "DISCONNECTED";
                currentAnimDisplay.style.color = "red";
            });
        }
        
        // Initial setup
        pollStatus(true);
        // Periodic sync to track current animation running on ESP32
        setInterval(() => pollStatus(false), 2000);

        function saveSettings() {
            const btn = document.getElementById('saveBtn');
            btn.innerText = "> TRANSMITTING...";
            
            let animStates = [];
            for (let i = 0; i < animations.length; i++) {
                animStates.push(document.getElementById(`anim_${i}`).checked ? 1 : 0);
            }
            
            const payload = new URLSearchParams();
            payload.append('text', textInput.value);
            payload.append('speed', speedInput.value);
            payload.append('anims', animStates.join(','));

            fetch('/save', {
                method: 'POST',
                body: payload,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }).then(r => {
                if(r.ok) {
                    btn.innerText = "> UPDATE_SUCCESS";
                    btn.style.background = "#00ff41";
                    btn.style.color = "#000";
                    setTimeout(() => {
                        btn.innerText = "> COMMIT_CHANGES";
                        btn.style.background = "";
                        btn.style.color = "";
                    }, 2000);
                    updateOffscreen();
                    pollStatus();
                } else {
                    btn.innerText = "> ERROR";
                    btn.style.background = "#ff0000";
                }
            }).catch(e => {
                btn.innerText = "> NET_ERROR";
                btn.style.background = "#ff0000";
            });
        }
    </script>
</body>
</html>
)rawliteral";

#endif
