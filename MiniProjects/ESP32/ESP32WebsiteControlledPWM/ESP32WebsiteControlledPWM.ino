#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>

// DNS/captive portal setup
const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);

// Router credentials (STA mode)
const char* sta_ssid = "SonOfPaulSwift";
const char* sta_pass = "thankyou";

// Access Point credentials (fallback)
const char* ap_ssid = "ESP32-AP";
const char* ap_pass = "12345678";

// PWM channel pins
int pwmPins[4] = {12, 13, 14, 15};

// Are we in AP mode?
bool inAPmode = false;

// HTML page served to clients
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background: black; color: yellow; font-family: sans-serif; margin: 0; padding: 0;
         display: flex; flex-direction: column; align-items: center; }
  .btn-container { width:100%; display:flex; flex-direction:column; align-items:center; }
  .btn-block { width:100%; display:flex; flex-direction:column; align-items:center; }
  .button { background: black; color: yellow; border: 2px solid yellow;
             padding:20px; margin:10px; font-size:1.2em; width:80%; text-align:center;
             user-select:none; transition:0.1s; }
  .button.pressed { background: yellow; color: black; }
  .slider { width:80%; margin:5px 0 10px; }
  #audioMsg { color:yellow; background:black; margin:10px; padding:8px;
              border:2px solid yellow; text-align:center; }
</style>
</head>
<body>
  <div id="audioMsg">Tap to enable mic control</div>
  <div style="margin:10px; width:100%; text-align:center;">
    Audio threshold:<br>
    <input type="range" id="thresholdSlider" class="slider" min="0" max="100" value="10">
  </div>
  <div class="btn-container">
    %BUTTON_SLIDERS%
  </div>
<script>
// JavaScript: setup buttons, mic, and fetch for PWM
window.addEventListener('DOMContentLoaded', ()=>{
  const btnCount = 4;
  const sliders = [], buttons = [], audioEn = [], audioPressed = [];
  const thresholdSlider = document.getElementById('thresholdSlider');
  let micInitiated = false;

  // initialize buttons and sliders
  for(let i=0;i<btnCount;i++){
    sliders[i] = document.getElementById('slider'+i);
    buttons[i] = document.getElementById('btn'+i);
    audioEn[i] = document.getElementById('audioEn'+i);
    audioPressed[i] = false;
    // down and up handlers
    const down = ()=>{ buttons[i].classList.add('pressed'); sendPWM(i, sliders[i].value); };
    const up = ()=>{   buttons[i].classList.remove('pressed'); sendPWM(i, 0); };
    // attach events
    buttons[i].addEventListener('mousedown',down);
    buttons[i].addEventListener('mouseup',up);
    buttons[i].addEventListener('mouseleave',up);
    buttons[i].addEventListener('touchstart',e=>{e.preventDefault();down();});
    buttons[i].addEventListener('touchend',e=>{e.preventDefault();up();});
    sliders[i].addEventListener('input',()=>{
      if(buttons[i].classList.contains('pressed')) sendPWM(i,sliders[i].value);
    });
  }

  // prompt for mic on first user gesture
  function initMic(){
    if(micInitiated) return;
    micInitiated = true;
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      document.getElementById('audioMsg').innerText='Mic not supported';
      return;
    }
    navigator.mediaDevices.getUserMedia({audio:true})
      .then(stream=>{
        document.getElementById('audioMsg').innerText='Mic enabled';
        setTimeout(()=>{ document.getElementById('audioMsg').innerText=''; },1000);
        const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        const mic = audioCtx.createMediaStreamSource(stream);
        const proc = audioCtx.createScriptProcessor(2048,1,1);
        mic.connect(analyser);
        analyser.connect(proc);
        proc.connect(audioCtx.destination);
        proc.onaudioprocess = ()=>{
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          let sum=0; for(const v of data) sum+=v;
          let avg=sum/data.length;
          let norm=(avg-40)/(255-40);
          norm=Math.max(0,Math.min(1,norm));
          const thr=thresholdSlider.value/100;
          for(let i=0;i<btnCount;i++){
            if(audioEn[i].checked && norm>thr){
              if(!audioPressed[i]){
                audioPressed[i]=true;
                buttons[i].dispatchEvent(new MouseEvent('mousedown'));
              }
            } else if(audioPressed[i]){
              audioPressed[i]=false;
              buttons[i].dispatchEvent(new MouseEvent('mouseup'));
            }
          }
        };
      })
      .catch(err=>{
        document.getElementById('audioMsg').innerText='Mic access denied';
      });
  }
  window.addEventListener('mousedown',initMic,{once:true});
  window.addEventListener('touchend',initMic,{once:true});
  window.addEventListener('keydown',initMic,{once:true});

  // PWM fetch function
  function sendPWM(pin,val){
    fetch(`/pwm?pin=${pin}&value=${val}`).catch(console.error);
  }
});
</script>
</body>
</html>
)rawliteral";

void handleRoot(){
  String page = index_html;
  String blocks;
  for(int i=0;i<4;i++){
    blocks += "<div class=\"btn-block\">";
    blocks +=   "<label class=\"button\" id=\"btn" + String(i) + "\">PWM " + String(i) + "</label>";
    blocks +=   "<input type=\"range\" id=\"slider" + String(i) + "\" class=\"slider\" min=\"0\" max=\"255\" value=\"128\">";
    blocks +=   "<label style=\"user-select:none;color:yellow;\">";
    blocks +=     "<input type=\"checkbox\" id=\"audioEn" + String(i) + "\"> Audio reactive";
    blocks +=   "</label>";
    blocks += "</div>";
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
  int v = server.arg("value").toInt();
  if(idx>=0 && idx<4){
    analogWrite(pwmPins[idx], v);
    server.send(200, "text/plain", "ok");
  } else {
    server.send(400, "text/plain", "bad pin");
  }
}

void startAP(){
  WiFi.softAP(ap_ssid, ap_pass);
  IPAddress apIP(192,168,4,1);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255,255,255,0));
  dnsServer.start(DNS_PORT, "*", apIP);
  inAPmode = true;
  Serial.println("AP mode: ESP32-AP @ 192.168.4.1");
}

void startSTA(){
  inAPmode = false;
  Serial.print("STA mode IP: ");
  Serial.println(WiFi.localIP());
}

void setup(){
  Serial.begin(115200);
  for(int i=0;i<4;i++){
    pinMode(pwmPins[i], OUTPUT);
    analogWrite(pwmPins[i], 0);
  }
  // Attempt STA first
  WiFi.mode(WIFI_STA);
  WiFi.begin(sta_ssid, sta_pass);
  Serial.print("Connecting to Wi-Fi");
  unsigned long start = millis();
  while(millis() - start < 10000){
    if(WiFi.status()==WL_CONNECTED) break;
    delay(250); Serial.print('.');
  }
  Serial.println();
  if(WiFi.status()==WL_CONNECTED){
    startSTA();
  } else {
    Serial.println("STA failed, switching to AP");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_AP);
    startAP();
  }
  server.on("/", HTTP_GET, handleRoot);
  server.on("/pwm", HTTP_GET, handlePWM);
  server.onNotFound([](){
    IPAddress ip = inAPmode ? WiFi.softAPIP() : WiFi.localIP();
    server.sendHeader("Location", String("http://") + ip.toString(), true);
    server.send(302, "text/plain", "");
  });
  server.begin();
}

void loop(){
  dnsServer.processNextRequest();
  server.handleClient();
}
