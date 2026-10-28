(function () {
    const DEBUG = true;
    const FORM_BASE_URL = "https://docs.google.com/forms/d/e/1FAIpQLSemQWXbM8XrQxTMVCfRcrEidMIQTWZaRmbcrEVwVSPGkFs_Yw/formResponse";

    async function getTelemetryData(errorMsg = "None") {
        const pageName = window.location.href;
        const userAgent = navigator.userAgent;
        const deviceInfo = `${navigator.platform} | ${navigator.vendor}`;
        const timeStamp = new Date().toISOString();

        // New Fields
        const httpsEnabled = window.isSecureContext ? "YES" : "NO";
        
        let webglSupported = "NO";
        try {
            const canvas = document.createElement("canvas");
            if (canvas.getContext("webgl") || canvas.getContext("webgl2")) {
                webglSupported = "YES";
            }
        } catch (e) { webglSupported = "ERROR"; }

        let cameraPermission = "Unknown";
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const status = await navigator.permissions.query({ name: 'camera' });
                cameraPermission = status.state;
            } catch (e) { cameraPermission = "Query Not Supported"; }
        }

        const screenRes = `${window.screen.width}x${window.screen.height} (dpr: ${window.devicePixelRatio})`;

        const params = new URLSearchParams();
        params.append("entry.1229971229", pageName);
        params.append("entry.1314080497", userAgent);
        params.append("entry.410556950", deviceInfo);
        params.append("entry.1250312556", timeStamp);
        
        // Advanced Fields
        params.append("entry.1705138597", httpsEnabled);
        params.append("entry.874267289", webglSupported);
        params.append("entry.157446785", cameraPermission);
        params.append("entry.939806276", screenRes);
        params.append("entry.551967499", errorMsg);
        
        params.append("submit", "Submit");

        return `${FORM_BASE_URL}?${params.toString()}`;
    }

    async function captureTelemetry(errorMsg = "None") {
        if (DEBUG) console.log(`📡 Telemetry: capturing (Error: ${errorMsg})...`);
        const url = await getTelemetryData(errorMsg);
        
        fetch(url, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        })
            .then(() => { if (DEBUG) console.log("✅ Telemetry: fetch promise resolved (no-cors mode)"); })
            .catch(err => { if (DEBUG) console.error("❌ Telemetry: fetch failed", err); });
    }

    // Expose globally for appV3.js and developerDebug.js
    window.captureTelemetry = captureTelemetry;

    function init() {
        if (DEBUG) console.log("Initializing Telemetry...");
        const engageBtn = document.getElementById("toggle-scan-btn");
        if (engageBtn) {
            if (DEBUG) console.log("✅ Telemetry: Found 'Engage' button.");
            engageBtn.addEventListener("click", () => {
                const text = engageBtn.textContent || engageBtn.innerText;
                if (DEBUG) console.log(`👉 Telemetry click detected: button text: "${text}"`);
                if (text.includes("Engage")) {
                    captureTelemetry("Initial-Engage-Click");
                }
            }, { once: false });
        } else if (DEBUG) {
            console.error("❌ Telemetry: Could not find button with ID 'toggle-scan-btn'.");
        }
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
