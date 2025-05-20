#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>

// captive-portal setup
const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);

const char* ap_ssid     = "CrazyCogs";
const char* ap_password = "12345678";

// PWM pins (change these if you like)
int pwmPins[4] = {12, 13, 14, 15};
int soundPin   = 27;

// HTML page, with a placeholder for the button/slider blocks
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    background: black;
    color: yellow;
    font-family: sans-serif;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .btn-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .button {
    background: black;
    color: yellow;
    border: 2px solid yellow;
    padding: 20px;
    margin: 10px;
    font-size: 1.2em;
    width: 80%;
    text-align: center;
    user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
  }
  .slider {
    width: 80%;
    margin: 5px 0 20px 0;
  }
  .audio-container {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .audio-circle {
    width: 50px;
    height: 50px;
    border: 2px solid yellow;
    border-radius: 50%;
    background: black;
    margin: 10px;
  }
</style>
</head>
<body>
  <div class="btn-container">
    %BUTTON_SLIDERS%
  </div>
  <div class="audio-container">
    <label class="button">
      <input type="checkbox" id="audioToggle">
      Sound Reactive Mode
    </label>
    <div id="audioReadout">Level: 0.00</div>
    <input type="range" id="thresholdSlider" class="slider" min="0" max="100" value="10">
    <div id="audioCircle" class="audio-circle"></div>
  </div>

  <script>
  document.addEventListener('DOMContentLoaded', ()=>{
    const btnCount = 4;
    const sliders = [];
    const pressed = [];

    for(let i=0; i<btnCount; i++){
      sliders[i] = document.getElementById('slider'+i);
      pressed[i] = false;
      const btn = document.getElementById('btn'+i);

      btn.addEventListener('mousedown', () => {
        pressed[i] = true;
        sendPWM(i, sliders[i].value);
      });
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        pressed[i] = true;
        sendPWM(i, sliders[i].value);
      });
      ['mouseup','touchend','mouseleave'].forEach(evt => {
        btn.addEventListener(evt, e => {
          if(evt=='touchend') e.preventDefault();
          if(pressed[i]) {
            pressed[i] = false;
            sendPWM(i, 0);
          }
        });
      });
      sliders[i].addEventListener('input', ()=>{
        if(pressed[i]) sendPWM(i, sliders[i].value);
      });
    }

    // audio reactive
    const audioToggle     = document.getElementById('audioToggle');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const audioReadout    = document.getElementById('audioReadout');
    const audioCircle     = document.getElementById('audioCircle');
    let audioCtx, analyser, dataArray, raf;

    audioToggle.addEventListener('change', async ()=>{
      if(audioToggle.checked) {
        if(!audioCtx) await setupAudio();
        audioCtx.resume();
        tick();
      } else {
        if(raf) cancelAnimationFrame(raf);
        audioCtx && audioCtx.suspend();
        sendSound(0);
        audioCircle.style.background = 'black';
      }
    });

    async function setupAudio(){
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src    = audioCtx.createMediaStreamSource(stream);
      analyser     = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    function tick(){
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      dataArray.forEach(v=>{
        let n = (v-128)/128;
        sum += n*n;
      });
      const rms   = Math.sqrt(sum/dataArray.length);
      const level = Math.min(1, rms*10);
      audioReadout.textContent = 'Level: '+level.toFixed(2);

      const th = thresholdSlider.value/100;
      audioCircle.style.background = (level>th)?'yellow':'black';
      sendSound(Math.round(level*255));

      raf = requestAnimationFrame(tick);
    }

    // send helpers
    function sendPWM(pin, val){
      fetch(`/pwm?pin=${pin}&value=${val}`)
        .catch(console.error);
    }
    function sendSound(val){
      fetch(`/sound?value=${val}`)
        .catch(console.error);
    }
  });
  </script>
</body>
</html>
)rawliteral";


void handleRoot(){
  String page = index_html;
  String blocks;
  for(int i=0; i<4; i++){
    blocks += "<label class=\"button\" id=\"btn"+String(i)+"\">PWM "+String(i)+"</label>";
    blocks += "<input type=\"range\" id=\"slider"+String(i)+"\" class=\"slider\" min=\"0\" max=\"255\" value=\"128\">";
  }
  page.replace("%BUTTON_SLIDERS%", blocks);
  server.send(200, "text/html", page);
}

void handlePWM(){
  if(!server.hasArg("pin") || !server.hasArg("value")){
    server.send(400, "text/plain", "missing pin or value");
    return;
  }
  int idx = server.arg("pin").toInt();
  int v   = server.arg("value").toInt();
  if(idx>=0 && idx<4){
    analogWrite(pwmPins[idx], v);
    server.send(200, "text/plain", "ok");
  } else {
    server.send(400, "text/plain", "bad pin");
  }
}

void handleSound(){
  if(!server.hasArg("value")){
    server.send(400, "text/plain", "missing value");
    return;
  }
  int v = constrain(server.arg("value").toInt(), 0, 255);
  analogWrite(soundPin, v);
  server.send(200, "text/plain", "ok");
}

void setup(){
  Serial.begin(115200);

  // init PWM pins
  for(int i=0; i<4; i++){
    pinMode(pwmPins[i], OUTPUT);
    analogWrite(pwmPins[i], 0);
  }
  pinMode(soundPin, OUTPUT);
  analogWrite(soundPin, 0);

  // start AP + captive portal
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid, ap_password);
  IPAddress apIP(192,168,4,1);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255,255,255,0));
  dnsServer.start(DNS_PORT, "*", apIP);

  // web routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/pwm",   HTTP_GET, handlePWM);
  server.on("/sound", HTTP_GET, handleSound);
  server.onNotFound([](){
    IPAddress apIP = WiFi.softAPIP();
    server.sendHeader("Location", String("http://")+apIP.toString(), true);
    server.send(302, "text/plain", "");
  });

  server.begin();
}

void loop(){
  dnsServer.processNextRequest();
  server.handleClient();
}
