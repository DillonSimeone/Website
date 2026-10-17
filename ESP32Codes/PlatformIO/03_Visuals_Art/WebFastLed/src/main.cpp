#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include <map>
#include <cmath>

// --- Configuration ---
struct Settings {
    int pixelPin = 2;
    int pixelCount = 30;
    int brightness = 128;
    char hostname[32] = "WFL";
    char wifiSSID[64] = "CumZone";
    char wifiPass[64] = "7414stinky$$$";
} settings;

// --- Global Variables ---
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
CRGB* leds = nullptr;
String currentPatternCode = "";
String currentPatternName = "Untitled";
String lastCompileError = "";
bool patternValid = false;

// --- Expression Engine ---
// Variables accessible in patterns
std::map<String, float> vars;

// Tokenizer
enum TokenType { T_NUM, T_VAR, T_OP, T_LPAREN, T_RPAREN, T_COMMA, T_ASSIGN, T_SEMI, T_FUNC, T_END, T_ERR };
struct Token { TokenType type; String text; float num; };

class Lexer {
public:
    String src;
    int pos = 0;
    
    Lexer(const String& s) : src(s), pos(0) {}
    
    char peek() { return pos < src.length() ? src[pos] : '\0'; }
    char get() { return pos < src.length() ? src[pos++] : '\0'; }
    void skipWhitespace() { while (isspace(peek())) get(); }
    
    Token next() {
        skipWhitespace();
        if (pos >= src.length()) return {T_END, "", 0};
        
        char c = peek();
        
        // Numbers
        if (isdigit(c) || (c == '.' && isdigit(src[pos+1]))) {
            String num = "";
            while (isdigit(peek()) || peek() == '.') num += get();
            return {T_NUM, num, num.toFloat()};
        }
        
        // Identifiers and keywords
        if (isalpha(c) || c == '_') {
            String id = "";
            while (isalnum(peek()) || peek() == '_') id += get();
            // Check if it's a function (followed by '(')
            skipWhitespace();
            if (peek() == '(') return {T_FUNC, id, 0};
            return {T_VAR, id, 0};
        }
        
        // Operators
        if (c == '+' || c == '-' || c == '*' || c == '/' || c == '%') {
            get();
            return {T_OP, String(c), 0};
        }
        
        // Comparison operators
        if (c == '<' || c == '>') {
            get();
            if (peek() == '=') { get(); return {T_OP, String(c) + "=", 0}; }
            return {T_OP, String(c), 0};
        }
        if (c == '=' && pos + 1 < src.length() && src[pos+1] == '=') {
            get(); get();
            return {T_OP, "==", 0};
        }
        
        // Ternary operator
        if (c == '?') { get(); return {T_OP, "?", 0}; }
        if (c == ':') { get(); return {T_OP, ":", 0}; }
        
        // Single chars
        if (c == '(') { get(); return {T_LPAREN, "(", 0}; }
        if (c == ')') { get(); return {T_RPAREN, ")", 0}; }
        if (c == ',') { get(); return {T_COMMA, ",", 0}; }
        if (c == '=') { get(); return {T_ASSIGN, "=", 0}; }
        if (c == ';' || c == '\n') { get(); return {T_SEMI, ";", 0}; }
        if (c == '{' || c == '}') { get(); return {T_SEMI, ";", 0}; } // Treat braces as statement separators
        
        get(); // Skip unknown
        return next();
    }
};

// Simple recursive descent parser + evaluator
class PatternVM {
public:
    Lexer* lex;
    Token cur;
    String error;
    float h = 0, s = 1, v = 1;
    float r = 0, g = 0, b = 0;
    bool useRGB = false;
    
    void advance() { cur = lex->next(); }
    
    // Ternary: condition ? true_val : false_val
    float parseTernary() {
        float cond = parseComparison();
        if (cur.type == T_OP && cur.text == "?") {
            advance();
            float trueVal = parseComparison();
            if (cur.type == T_OP && cur.text == ":") {
                advance();
                float falseVal = parseComparison();
                return (cond != 0) ? trueVal : falseVal;
            }
            return trueVal;
        }
        return cond;
    }
    
    // Comparison: < > <= >= ==
    float parseComparison() {
        float left = parseExpr();
        while (cur.type == T_OP && (cur.text == "<" || cur.text == ">" || cur.text == "<=" || cur.text == ">=" || cur.text == "==")) {
            String op = cur.text;
            advance();
            float right = parseExpr();
            if (op == "<") left = left < right ? 1 : 0;
            else if (op == ">") left = left > right ? 1 : 0;
            else if (op == "<=") left = left <= right ? 1 : 0;
            else if (op == ">=") left = left >= right ? 1 : 0;
            else if (op == "==") left = (fabs(left - right) < 0.0001f) ? 1 : 0;
        }
        return left;
    }
    
    float parseExpr() {
        float left = parseTerm();
        while (cur.type == T_OP && (cur.text == "+" || cur.text == "-")) {
            String op = cur.text;
            advance();
            float right = parseTerm();
            left = (op == "+") ? left + right : left - right;
        }
        return left;
    }
    
    float parseTerm() {
        float left = parseFactor();
        while (cur.type == T_OP && (cur.text == "*" || cur.text == "/" || cur.text == "%")) {
            String op = cur.text;
            advance();
            float right = parseFactor();
            if (op == "*") left *= right;
            else if (op == "/") left = (right != 0) ? left / right : 0;
            else left = fmod(left, right);
        }
        return left;
    }
    
    float parseFactor() {
        // Unary minus
        if (cur.type == T_OP && cur.text == "-") {
            advance();
            return -parseFactor();
        }
        
        // Number
        if (cur.type == T_NUM) {
            float v = cur.num;
            advance();
            return v;
        }
        
        // Variable
        if (cur.type == T_VAR) {
            String name = cur.text;
            advance();
            if (vars.count(name)) return vars[name];
            return 0;
        }
        
        // Function call
        if (cur.type == T_FUNC) {
            String fname = cur.text;
            advance(); // skip func name
            if (cur.type == T_LPAREN) advance(); // skip '('
            
            std::vector<float> args;
            while (cur.type != T_RPAREN && cur.type != T_END) {
                args.push_back(parseExpr());
                if (cur.type == T_COMMA) advance();
            }
            if (cur.type == T_RPAREN) advance(); // skip ')'
            
            // Built-in functions
            if (fname == "sin" && args.size() >= 1) return sin(args[0] * TWO_PI);
            if (fname == "cos" && args.size() >= 1) return cos(args[0] * TWO_PI);
            if (fname == "abs" && args.size() >= 1) return fabs(args[0]);
            if (fname == "min" && args.size() >= 2) return min(args[0], args[1]);
            if (fname == "max" && args.size() >= 2) return max(args[0], args[1]);
            if (fname == "sqrt" && args.size() >= 1) return sqrt(fabs(args[0]));
            if (fname == "pow" && args.size() >= 2) return pow(args[0], args[1]);
            if (fname == "floor" && args.size() >= 1) return floor(args[0]);
            if (fname == "ceil" && args.size() >= 1) return ceil(args[0]);
            if (fname == "frac" && args.size() >= 1) return args[0] - floor(args[0]);
            if (fname == "clamp" && args.size() >= 3) return constrain(args[0], args[1], args[2]);
            if (fname == "wave" && args.size() >= 1) return (sin(args[0] * TWO_PI) + 1) / 2;
            if (fname == "triangle" && args.size() >= 1) { float t = fmod(args[0], 1.0f); if (t < 0) t += 1; return t < 0.5f ? t * 2 : 2 - t * 2; }
            
            // Color output functions
            if (fname == "hsv" && args.size() >= 3) {
                h = fmod(args[0], 1.0f); if (h < 0) h += 1;
                s = constrain(args[1], 0.0f, 1.0f);
                v = constrain(args[2], 0.0f, 1.0f);
                useRGB = false;
                return 0;
            }
            if (fname == "rgb" && args.size() >= 3) {
                r = constrain(args[0], 0.0f, 1.0f);
                g = constrain(args[1], 0.0f, 1.0f);
                b = constrain(args[2], 0.0f, 1.0f);
                useRGB = true;
                return 0;
            }
            
            return 0;
        }
        
        // Parentheses
        if (cur.type == T_LPAREN) {
            advance();
            float v = parseExpr();
            if (cur.type == T_RPAREN) advance();
            return v;
        }
        
        return 0;
    }
    
    void parseStatement() {
        if (cur.type == T_END || cur.type == T_SEMI) return;
        
        // Check for assignment: var = expr
        if (cur.type == T_VAR) {
            String name = cur.text;
            Token next = lex->next();
            if (next.type == T_ASSIGN) {
                cur = lex->next();
                float val = parseTernary();
                vars[name] = val;
                return;
            }
            // Not assignment, rewind (hacky but works)
            lex->pos -= next.text.length();
            cur.type = T_VAR;
        }
        
        // Expression statement (function calls like hsv(), rgb(), etc.)
        parseTernary();
    }

    
    void run(const String& code, int index, int pixelCount, float time) {
        // Reset state
        h = 0; s = 1; v = 1;
        r = 0; g = 0; b = 0;
        useRGB = false;
        error = "";
        
        // Set up built-in variables
        vars["index"] = index;
        vars["i"] = index;
        vars["pixelCount"] = pixelCount;
        vars["n"] = pixelCount;
        vars["time"] = time;
        vars["t"] = time;
        vars["PI"] = PI;
        
        // Parse and execute
        Lexer lexer(code);
        lex = &lexer;
        advance();
        
        while (cur.type != T_END) {
            parseStatement();
            if (cur.type == T_SEMI) advance();
        }
    }
    
    CRGB getColor() {
        if (useRGB) {
            return CRGB(r * 255, g * 255, b * 255);
        }
        return CHSV(h * 255, s * 255, v * 255);
    }
};

PatternVM vm;

// --- LED Update ---
unsigned long lastLedUpdate = 0;
const unsigned long LED_UPDATE_INTERVAL = 33; // ~30fps

void updateLeds() {
    if (!leds || !patternValid) return;
    
    // Rate limit LED updates
    unsigned long now = millis();
    if (now - lastLedUpdate < LED_UPDATE_INTERVAL) return;
    lastLedUpdate = now;
    
    float t = now / 1000.0f;
    
    for (int i = 0; i < settings.pixelCount; i++) {
        vm.run(currentPatternCode, i, settings.pixelCount, t);
        leds[i] = vm.getColor();
        
        // Yield every 10 pixels to let async tasks run
        if (i % 10 == 9) {
            yield();
        }
    }
    FastLED.show();
}

// --- Settings Management ---
void loadSettings() {
    if (LittleFS.exists("/settings.json")) {
        File file = LittleFS.open("/settings.json", "r");
        JsonDocument doc;
        deserializeJson(doc, file);
        settings.pixelPin = doc["pin"] | 2;
        settings.pixelCount = doc["count"] | 30;
        settings.brightness = doc["brightness"] | 128;
        strlcpy(settings.hostname, doc["hostname"] | "WFL", sizeof(settings.hostname));
        strlcpy(settings.wifiSSID, doc["ssid"] | "", sizeof(settings.wifiSSID));
        strlcpy(settings.wifiPass, doc["pass"] | "", sizeof(settings.wifiPass));
        file.close();
    }
}

void saveSettings() {
    File file = LittleFS.open("/settings.json", "w");
    JsonDocument doc;
    doc["pin"] = settings.pixelPin;
    doc["count"] = settings.pixelCount;
    doc["brightness"] = settings.brightness;
    doc["hostname"] = settings.hostname;
    doc["ssid"] = settings.wifiSSID;
    doc["pass"] = settings.wifiPass;
    serializeJson(doc, file);
    file.close();
}

// --- Pattern Management ---
void loadPattern(const String& name) {
    String path = "/patterns/" + name + ".wfl";
    if (LittleFS.exists(path)) {
        File file = LittleFS.open(path, "r");
        currentPatternCode = file.readString();
        currentPatternName = name;
        patternValid = true;
        file.close();
    }
}

void savePattern(const String& name, const String& code) {
    // Ensure patterns directory exists
    if (!LittleFS.exists("/patterns")) {
        LittleFS.mkdir("/patterns");
    }
    String path = "/patterns/" + name + ".wfl";
    File file = LittleFS.open(path, "w");
    file.print(code);
    file.close();
    currentPatternName = name;
    currentPatternCode = code;
    patternValid = true;
}

String getPatternList() {
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    
    File root = LittleFS.open("/patterns");
    if (root && root.isDirectory()) {
        File file = root.openNextFile();
        while (file) {
            String name = file.name();
            if (name.endsWith(".wfl")) {
                name = name.substring(0, name.length() - 4);
                arr.add(name);
            }
            file = root.openNextFile();
        }
    }
    
    String result;
    serializeJson(doc, result);
    return result;
}

// --- WebSocket Handler ---
void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    if (type == WS_EVT_DATA) {
        String msg = "";
        for (size_t i = 0; i < len; i++) msg += (char)data[i];
        
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, msg);
        if (err) return;
        
        String action = doc["action"] | "";
        
        if (action == "live") {
            String code = doc["code"] | "";
            currentPatternCode = code;
            patternValid = true;
            lastCompileError = "";
            
            // Send confirmation
            JsonDocument resp;
            resp["type"] = "compile";
            resp["success"] = true;
            String out;
            serializeJson(resp, out);
            client->text(out);
        }
        else if (action == "save") {
            String name = doc["name"] | "Untitled";
            String code = doc["code"] | "";
            savePattern(name, code);
            
            // Broadcast pattern list update
            String patternList = getPatternList();
            String out = "{\"type\":\"patterns\",\"list\":" + patternList + "}";
            ws.textAll(out);
        }
        else if (action == "load") {
            String name = doc["name"] | "";
            loadPattern(name);
            
            JsonDocument resp;
            resp["type"] = "loaded";
            resp["name"] = currentPatternName;
            resp["code"] = currentPatternCode;
            String out;
            serializeJson(resp, out);
            client->text(out);
        }
        else if (action == "setColor") {
            // Quick color set from picker
            float h = doc["h"] | 0.0f;
            float s = doc["s"] | 1.0f;
            float v = doc["v"] | 1.0f;
            currentPatternCode = "hsv(" + String(h, 3) + ", " + String(s, 3) + ", " + String(v, 3) + ")";
            patternValid = true;
        }
        else if (action == "brightness") {
            settings.brightness = doc["value"] | 128;
            FastLED.setBrightness(settings.brightness);
            saveSettings();
        }
    }
}

// --- FastLED Init ---
void initFastLED() {
    if (leds) delete[] leds;
    leds = new CRGB[settings.pixelCount];
    FastLED.addLeds<WS2812B, 2, GRB>(leds, settings.pixelCount);
    FastLED.setBrightness(settings.brightness);
}

// --- WiFi Setup ---
void setupWiFi() {
    if (strlen(settings.wifiSSID) > 0) {
        WiFi.mode(WIFI_STA);
        WiFi.begin(settings.wifiSSID, settings.wifiPass);
        
        Serial.print("Connecting to WiFi");
        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
            delay(500);
            Serial.print(".");
        }
        Serial.println();
        
        if (WiFi.status() == WL_CONNECTED) {
            Serial.print("IP: ");
            Serial.println(WiFi.localIP());
            return;
        }
    }
    
    // Fallback to AP mode
    WiFi.mode(WIFI_AP);
    WiFi.softAP(settings.hostname, "webfastled");
    Serial.print("AP Mode: ");
    Serial.println(WiFi.softAPIP());
}

void setup() {
    Serial.begin(115200);
    delay(500);
    
    if (!LittleFS.begin(true)) {
        Serial.println("LittleFS Mount Failed");
    }
    
    // Create patterns directory if needed
    if (!LittleFS.exists("/patterns")) {
        LittleFS.mkdir("/patterns");
    }
    
    loadSettings();
    setupWiFi();
    
    if (MDNS.begin(settings.hostname)) {
        Serial.println("mDNS: " + String(settings.hostname) + ".local");
    }
    
    initFastLED();
    
    // Load first pattern or default
    currentPatternCode = "h = i/n + t*0.2;\nhsv(h, 1, 1)";
    patternValid = true;
    
    // WebSocket
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);
    
    // Static files
    server.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(LittleFS, "/index.html", "text/html");
    });
    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(LittleFS, "/style.css", "text/css");
    });
    server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(LittleFS, "/script.js", "text/javascript");
    });
    
    // API endpoints
    server.on("/api/settings", HTTP_GET, [](AsyncWebServerRequest* req) {
        JsonDocument doc;
        doc["pin"] = settings.pixelPin;
        doc["count"] = settings.pixelCount;
        doc["brightness"] = settings.brightness;
        doc["hostname"] = settings.hostname;
        doc["ssid"] = settings.wifiSSID;
        String out;
        serializeJson(doc, out);
        req->send(200, "application/json", out);
    });
    
    server.on("/api/settings", HTTP_POST, [](AsyncWebServerRequest* req) {
        if (req->hasParam("pin", true)) settings.pixelPin = req->getParam("pin", true)->value().toInt();
        if (req->hasParam("count", true)) settings.pixelCount = req->getParam("count", true)->value().toInt();
        if (req->hasParam("brightness", true)) settings.brightness = req->getParam("brightness", true)->value().toInt();
        if (req->hasParam("hostname", true)) strlcpy(settings.hostname, req->getParam("hostname", true)->value().c_str(), sizeof(settings.hostname));
        if (req->hasParam("ssid", true)) strlcpy(settings.wifiSSID, req->getParam("ssid", true)->value().c_str(), sizeof(settings.wifiSSID));
        if (req->hasParam("pass", true)) strlcpy(settings.wifiPass, req->getParam("pass", true)->value().c_str(), sizeof(settings.wifiPass));
        saveSettings();
        req->send(200, "text/plain", "OK - Reboot to apply");
    });
    
    server.on("/api/patterns", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(200, "application/json", getPatternList());
    });
    
    server.on("/api/reboot", HTTP_POST, [](AsyncWebServerRequest* req) {
        req->send(200, "text/plain", "Rebooting...");
        delay(500);
        ESP.restart();
    });
    
    server.onNotFound([](AsyncWebServerRequest* req) {
        req->send(404, "text/plain", "Not Found");
    });
    
    server.begin();
    Serial.println("Server started");
}

void loop() {
    ws.cleanupClients();
    yield(); // Give async tasks time
    updateLeds();
    yield(); // Give async tasks time
    delay(1); // Minimal delay to yield to scheduler
}
