#pragma once
#include <Arduino.h>

const char UPDATE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>DeafDoorbell OTA Update</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #0d1117; color: #e6edf3; font-family: sans-serif; padding: 24px; display: flex; justify-content: center; }
    .box { width: 100%; max-width: 420px; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; }
    h2 { margin-bottom: 16px; color: #00d2ff; }
    input[type=file] { margin: 16px 0; width: 100%; color: #8b949e; }
    button { background: #00d2ff; color: #000; font-weight: bold; border: none; padding: 12px; width: 100%; border-radius: 6px; cursor: pointer; }
    #prg { width: 100%; height: 16px; background: #21262d; border-radius: 8px; overflow: hidden; margin-top: 16px; display: none; }
    #bar { width: 0%; height: 100%; background: #00d2ff; transition: width 0.1s; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Firmware Update</h2>
    <p style="font-size:0.9em; color:#8b949e;">Select a compiled <code>firmware.bin</code> file to flash DeafDoorbell Master over WiFi.</p>
    <form method='POST' action='/update' enctype='multipart/form-data' id='uploadForm'>
      <input type='file' name='update' id='fileInput' accept='.bin' required>
      <button type='submit' id='subBtn'>Flash Firmware</button>
    </form>
    <div id="prg"><div id="bar"></div></div>
    <p id="msg" style="margin-top:12px; font-size:0.85em; text-align:center;"></p>
  </div>
  <script>
    const form = document.getElementById('uploadForm');
    form.onsubmit = e => {
      e.preventDefault();
      const file = document.getElementById('fileInput').files[0];
      if (!file) return;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/update', true);
      document.getElementById('prg').style.display = 'block';
      document.getElementById('subBtn').disabled = true;
      document.getElementById('msg').innerText = 'Uploading and flashing...';
      
      xhr.upload.onprogress = ev => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          document.getElementById('bar').style.width = pct + '%';
        }
      };
      xhr.onload = () => {
        if (xhr.status == 200) {
          document.getElementById('msg').innerText = 'Update successful! Rebooting ESP32...';
          setTimeout(() => location.href = '/', 6000);
        } else {
          document.getElementById('msg').innerText = 'Update Failed: ' + xhr.responseText;
          document.getElementById('subBtn').disabled = false;
        }
      };
      const fd = new FormData();
      fd.append('update', file);
      xhr.send(fd);
    };
  </script>
</body>
</html>
)rawliteral";
