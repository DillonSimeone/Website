#ifndef INDEX_HTML_H
#define INDEX_HTML_H

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ESP32 Vision - Live Stream</title>
    <style>
        :root {
            --glass-bg: rgba(255, 255, 255, 0.1);
            --glass-border: rgba(255, 255, 255, 0.2);
            --accent-color: #00d2ff;
            --text-color: #ffffff;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        body {
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            color: var(--text-color);
        }

        .container {
            width: 90%;
            max-width: 1000px;
            height: 80vh;
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: fadeIn 1s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        header {
            padding: 24px 40px;
            border-bottom: 1px solid var(--glass-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        header h1 {
            font-size: 1.5rem;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(to right, #00d2ff, #3a7bd5);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .status {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background-color: #4caf50;
            border-radius: 50%;
            box-shadow: 0 0 10px #4caf50;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
        }

        .viewer {
            flex: 1;
            padding: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
        }

        .video-container {
            width: 100%;
            height: 100%;
            border-radius: 16px;
            overflow: hidden;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid var(--glass-border);
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .video-container img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }

        .controls {
            padding: 24px 40px;
            display: flex;
            gap: 16px;
            justify-content: center;
            background: rgba(0, 0, 0, 0.1);
        }

        .btn {
            padding: 12px 24px;
            border-radius: 12px;
            border: 1px solid var(--glass-border);
            background: var(--glass-bg);
            color: white;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 500;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn:hover {
            background: var(--glass-border);
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }

        .btn-primary {
            background: linear-gradient(135deg, #00d2ff, #3a7bd5);
            border: none;
        }

        .btn-primary:hover {
            opacity: 0.9;
            transform: translateY(-2px);
        }

        footer {
            padding: 16px;
            text-align: center;
            font-size: 0.8rem;
            opacity: 0.5;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .container {
                width: 95%;
                height: 90vh;
            }
            .viewer {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>ESP32 VISION</h1>
            <div class="status">
                <div class="status-dot"></div>
                <span>Live Feed</span>
            </div>
        </header>
        
        <main class="viewer">
            <div class="video-container">
                <img id="stream" src="/stream" alt="Camera Stream">
            </div>
        </main>

        <section class="controls">
            <button class="btn btn-primary" onclick="window.location.reload()">Refresh Stream</button>
            <a href="/capture" class="btn" target="_blank">Capture Frame</a>
        </section>

        <footer>
            ESP32-WROVER-DEV | Glassmorphism Interface
        </footer>
    </div>

    <script>
        // Smooth stream reconnection logic if needed
        const stream = document.getElementById('stream');
        stream.onerror = () => {
            console.log("Stream error, retrying...");
            setTimeout(() => {
                stream.src = "/stream?t=" + new Date().getTime();
            }, 1000);
        };
    </script>
</body>
</html>
)rawliteral";

#endif
