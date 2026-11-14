// Ember — ESP32-C3 firmware
// Stack-based bytecode VM, atomic program swap, FreeRTOS task isolation.
// See ARCHITECTURE.md for the design rationale.

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <Update.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include <arduinoFFT.h>
#include <driver/i2s.h>
#include <driver/rmt.h>
#include <soc/soc.h>
#include <soc/rtc_cntl_reg.h>
#include <atomic>
#include <vector>
#include <cstring>
#include <cmath>
#include <esp_wifi.h>

// ─── Settings ────────────────────────────────────────────────────────────────
//
// MicSource values:
//   0 = off (no audio, saves CPU)
//   1 = INMP441 (I2S, digital, 24-bit MEMS)
//   2 = MAX4466 (analog, ADC1 channel, GPIO 0–4 only on ESP32-C3)
//
struct Settings {
    int   pixelPin    = 5;
#ifdef EMBER_BATHROOM
    int   pixelCount  = 100;
#else
    int   pixelCount  = 30;
#endif
    int   brightness  = 128;
#ifdef EMBER_BATHROOM
    char  hostname[32] = "ember-audio";
#else
    char  hostname[32] = "ember";
#endif
    char  wifiSSID[64] = "";
    char  wifiPass[64] = "";
#ifdef EMBER_BATHROOM
    char  apSSID[64]   = "Ember-Audio";
#else
    char  apSSID[64]   = "";
#endif

    // Audio
#ifdef EMBER_BATHROOM
    int   micSource   = 2;          // Default MAX4466 on bathroom build
#else
    int   micSource   = 0;          // 0=off, 1=INMP441, 2=MAX4466
#endif
    int   micBCLK     = 6;          // INMP441 SCK
    int   micWS       = 7;          // INMP441 WS  (LRCK)
    int   micData     = 5;          // INMP441 SD
    int   micADCPin   = 3;          // MAX4466 OUT → ADC1_CHx (must be GPIO 0-4)
    int   micGndPin   = 4;          // Soft ground for MAX4466 (driven LOW when >= 0)
    float micGain     = 1.5f;       // Output multiplier on level/bands/MAD
    float micSmoothing= 0.6f;       // EMA factor (0=no smoothing, 0.95=very smooth)

    // Audio Gate & Bathroom Ambient Showcase
#ifdef EMBER_BATHROOM
    bool  audioGateEnabled = true;
    int   gateThreshold    = 2500;  // Trigger threshold X in MAD units (200..30000)
    bool  autoCycle        = true;  // Curated bathroom ambient showcase cycling
    int   cycleSeconds     = 30;    // Configurable showcase interval
#else
    bool  audioGateEnabled = false;
    int   gateThreshold    = 2500;
    bool  autoCycle        = false;
    int   cycleSeconds     = 30;
#endif
} settings;

// ─── Globals ─────────────────────────────────────────────────────────────────
AsyncWebServer  server(80);
AsyncWebSocket  ws("/ws");
static DNSServer       dnsServer;
static bool            g_apMode = false;
CRGB*           leds = nullptr;
volatile float  g_fps = 0.0f;
String          g_currentName = "Untitled";
String          g_currentSource;
String          g_lastError;

// Audio Gate runtime state. Attack ~2s, release ~3.5s, held 400ms below the floor.
static volatile bool  g_gateActive   = false;
static volatile float g_gateLinear   = 0.0f; // 0.0 .. 1.0 linear progress
static volatile float g_gateEnvelope = 0.0f; // Perceptual envelope (smootherstep + gamma)
static uint32_t       g_gateQuietSince  = 0;
static bool           g_gateQuietTiming = false;
static bool           g_settingsDirty = false;
static unsigned long  g_settingsChangedAtMs = 0;

// Curated Bathroom Ambient Showcase patterns
struct ShowcasePattern {
    const char* name;
    const char* code;
};

static const ShowcasePattern kShowcasePatterns[] = {
    {
        "Shifting Rainbow",
        "// Smooth shifting rainbow across strip.\n"
        "h = i/n + time(8);\n"
        "hsv(h, 1, 1);"
    },
    {
        "Breathing Aurora",
        "// Slow organic colour wash, breathes in brightness.\n"
        "h = perlin1D(i*0.05 + t*0.1)*0.4 + 0.5;\n"
        "b = wave(time(6));\n"
        "hsv(h, 1, b*0.9 + 0.1);"
    },
    {
        "Ocean Swell",
        "x = i/n;\n"
        "swell = perlin2D(x*2, t*0.4);\n"
        "h = 0.5 + swell*0.1;\n"
        "s = 1 - swell*0.3;\n"
        "v = wave(x + t*0.1);\n"
        "hsv(h, s, v);"
    },
    {
        "Lava Lamp",
        "x = i/n;\n"
        "blob = perlin2D(x*2.5, t*0.5);\n"
        "blob = smoothstep(0.45, 0.6, blob);\n"
        "h = mix(0.02, 0.12, blob);\n"
        "hsv(h, 1, blob*0.9 + 0.1);"
    },
    {
        "Perlin Painter",
        "// Slow drifting hue painted by 2D noise.\n"
        "h = perlin2D(i*0.04, t*0.15);\n"
        "s = 0.6 + perlin1D(i*0.1 + 100)*0.4;\n"
        "hsv(h, s, 1);"
    },
    {
        "Galaxy",
        "// Deep blues and purples with bright stars.\n"
        "star = pow(wave(t*0.7 + hash(i)*9), 8);\n"
        "dust = perlin2D(i*0.1, t*0.2)*0.3;\n"
        "h = 0.72 + dust*0.1;\n"
        "v = star + dust*0.4;\n"
        "hsv(h, 1 - star*0.3, v);"
    }
};
static constexpr int kShowcaseCount = sizeof(kShowcasePatterns) / sizeof(kShowcasePatterns[0]);
static int           g_showcaseIdx  = 0;
static unsigned long g_lastCycleMs  = 0;

static SemaphoreHandle_t g_progMu   = nullptr;
static SemaphoreHandle_t g_rmtAdcMu = nullptr;

// ─── Bytecode VM ─────────────────────────────────────────────────────────────
//
// One float stack, one variable slot table, one constant pool. Compile once,
// execute per pixel. Variable names are resolved to slot indices at compile
// time; the hot loop never sees a string.
//

namespace vm {

constexpr uint8_t MAX_VARS      = 32;
constexpr uint8_t MAX_CONSTS    = 255;
constexpr uint8_t STACK_DEPTH   = 64;

// Reserved variable slots (compiler always allocates these first).
enum : uint8_t {
    VAR_I = 0, VAR_INDEX,
    VAR_N, VAR_PIXELCOUNT,
    VAR_T, VAR_TIME,
    VAR_PI, VAR_TAU,
    VAR_MOTION,
    VAR_GATE, VAR_FADE,
    VAR_RESERVED_END
};

enum Op : uint8_t {
    OP_HALT = 0,
    OP_PUSH_CONST,      // u8 idx
    OP_PUSH_VAR,        // u8 slot
    OP_STORE_VAR,       // u8 slot
    OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD, OP_NEG,
    OP_LT, OP_GT, OP_LE, OP_GE, OP_EQ, OP_NE,
    OP_JMP,             // i16 rel offset
    OP_JMP_FALSE,       // i16 rel offset
    OP_CALL,            // u8 fn, u8 argc
    OP_HSV,             // pops h,s,v
    OP_RGB,             // pops r,g,b
    OP_DROP,
};

// Function ids — must stay in sync with kFnTable below.
enum Fn : uint8_t {
    FN_SIN, FN_COS, FN_TAN,
    FN_ABS, FN_SQRT, FN_POW,
    FN_FLOOR, FN_CEIL, FN_ROUND, FN_FRAC,
    FN_MIN, FN_MAX, FN_CLAMP, FN_MIX, FN_STEP, FN_SMOOTHSTEP,
    FN_WAVE, FN_TRIANGLE, FN_SQUARE, FN_TIME,
    FN_PERLIN1D, FN_PERLIN2D,
    FN_RANDOM, FN_HASH,
    FN_HSV, FN_RGB,
    // Audio
    FN_VU, FN_PEAK, FN_PITCH, FN_BEAT, FN_BAND,
    FN_BASS, FN_MID, FN_TREBLE,
    FN_MOTION,
    FN_GATE, FN_FADE, FN_MAD,
    FN__COUNT
};

struct FnEntry {
    const char* name;
    uint8_t     id;
    uint8_t     minArgs;
    uint8_t     maxArgs; // 0xFF for variadic-pad
};

// Function table — order does not matter; lookup is linear at compile time only.
static const FnEntry kFnTable[] = {
    {"sin",        FN_SIN,        1, 1},
    {"cos",        FN_COS,        1, 1},
    {"tan",        FN_TAN,        1, 1},
    {"abs",        FN_ABS,        1, 1},
    {"sqrt",       FN_SQRT,       1, 1},
    {"pow",        FN_POW,        2, 2},
    {"floor",      FN_FLOOR,      1, 1},
    {"ceil",       FN_CEIL,       1, 1},
    {"round",      FN_ROUND,      1, 1},
    {"frac",       FN_FRAC,       1, 1},
    {"min",        FN_MIN,        2, 2},
    {"max",        FN_MAX,        2, 2},
    {"clamp",      FN_CLAMP,      3, 3},
    {"mix",        FN_MIX,        3, 3},
    {"lerp",       FN_MIX,        3, 3},
    {"step",       FN_STEP,       2, 2},
    {"smoothstep", FN_SMOOTHSTEP, 3, 3},
    {"wave",       FN_WAVE,       1, 1},
    {"triangle",   FN_TRIANGLE,   1, 1},
    {"square",     FN_SQUARE,     1, 2},
    {"time",       FN_TIME,       1, 1},
    {"perlin1D",   FN_PERLIN1D,   1, 1},
    {"perlin1d",   FN_PERLIN1D,   1, 1},
    {"perlin2D",   FN_PERLIN2D,   2, 2},
    {"perlin2d",   FN_PERLIN2D,   2, 2},
    {"noise",      FN_PERLIN1D,   1, 1},
    {"noise2",     FN_PERLIN2D,   2, 2},
    {"random",     FN_RANDOM,     0, 0},
    {"hash",       FN_HASH,       1, 1},
    {"hsv",        FN_HSV,        3, 3},
    {"rgb",        FN_RGB,        3, 3},
    {"bass",       FN_BASS,       0, 0},
    {"mid",        FN_MID,        0, 0},
    {"treble",     FN_TREBLE,     0, 0},
    {"motion",     FN_MOTION,     0, 0},
    {"gate",       FN_GATE,       0, 0},
    {"fade",       FN_FADE,       0, 0},
    {"mad",        FN_MAD,        0, 0},
    {"vu",         FN_VU,         0, 0},   // overall RMS level
    {"peak",       FN_PEAK,       0, 0},   // peak level with slow decay
    {"pitch",      FN_PITCH,      0, 0},   // dominant freq normalized (0=low, 1=high)
    {"beat",       FN_BEAT,       0, 0},   // 1 on beat, decays toward 0
    {"band",       FN_BAND,       1, 1},   // band(n), n=0..7 (low..high)
};

struct Program {
    std::vector<uint8_t> code;
    std::vector<float>   consts;
    std::vector<String>  varNames;   // slot -> name (for debugging only)
    uint8_t              numVars = VAR_RESERVED_END;
};

// ─── Lexer ───────────────────────────────────────────────────────────────────
enum TokType : uint8_t {
    TK_EOF, TK_NUM, TK_IDENT,
    TK_PLUS, TK_MINUS, TK_STAR, TK_SLASH, TK_PERCENT,
    TK_LPAREN, TK_RPAREN, TK_COMMA, TK_SEMI, TK_ASSIGN,
    TK_LT, TK_GT, TK_LE, TK_GE, TK_EQ, TK_NE,
    TK_QMARK, TK_COLON,
    TK_ERR,
};

struct Tok {
    TokType type;
    float   num;
    uint16_t identStart; // index into source, length follows
    uint8_t  identLen;
};

class Lexer {
public:
    const char* src;
    uint16_t    len;
    uint16_t    pos = 0;

    Lexer(const String& s) : src(s.c_str()), len(s.length()) {}

    bool eof() const { return pos >= len; }
    char peek(int off = 0) const { return (pos + off < len) ? src[pos + off] : '\0'; }
    char get() { return pos < len ? src[pos++] : '\0'; }

    Tok next() {
        // Skip whitespace and comments.
        for (;;) {
            while (pos < len && (src[pos] == ' ' || src[pos] == '\t' ||
                                 src[pos] == '\r' || src[pos] == '\n')) pos++;
            if (pos + 1 < len && src[pos] == '/' && src[pos+1] == '/') {
                while (pos < len && src[pos] != '\n') pos++;
                continue;
            }
            if (pos + 1 < len && src[pos] == '/' && src[pos+1] == '*') {
                pos += 2;
                while (pos + 1 < len && !(src[pos] == '*' && src[pos+1] == '/')) pos++;
                pos = (pos + 2 <= len) ? pos + 2 : len;
                continue;
            }
            break;
        }

        if (pos >= len) return {TK_EOF, 0, 0, 0};

        char c = src[pos];

        if (isdigit((unsigned char)c) || (c == '.' && pos + 1 < len && isdigit((unsigned char)src[pos+1]))) {
            uint16_t start = pos;
            while (pos < len && (isdigit((unsigned char)src[pos]) || src[pos] == '.')) pos++;
            char buf[24];
            uint8_t n = std::min<uint16_t>(pos - start, 23);
            memcpy(buf, src + start, n);
            buf[n] = 0;
            return {TK_NUM, (float)atof(buf), 0, 0};
        }

        if (isalpha((unsigned char)c) || c == '_') {
            uint16_t start = pos;
            while (pos < len && (isalnum((unsigned char)src[pos]) || src[pos] == '_')) pos++;
            uint8_t n = pos - start;
            if (n > 31) n = 31;
            return {TK_IDENT, 0, start, n};
        }

        pos++;
        switch (c) {
            case '+': return {TK_PLUS, 0, 0, 0};
            case '-': return {TK_MINUS, 0, 0, 0};
            case '*': return {TK_STAR, 0, 0, 0};
            case '/': return {TK_SLASH, 0, 0, 0};
            case '%': return {TK_PERCENT, 0, 0, 0};
            case '(': return {TK_LPAREN, 0, 0, 0};
            case ')': return {TK_RPAREN, 0, 0, 0};
            case ',': return {TK_COMMA, 0, 0, 0};
            case ';': return {TK_SEMI, 0, 0, 0};
            case '{': case '}': return {TK_SEMI, 0, 0, 0};
            case '?': return {TK_QMARK, 0, 0, 0};
            case ':': return {TK_COLON, 0, 0, 0};
            case '<':
                if (peek() == '=') { pos++; return {TK_LE, 0, 0, 0}; }
                return {TK_LT, 0, 0, 0};
            case '>':
                if (peek() == '=') { pos++; return {TK_GE, 0, 0, 0}; }
                return {TK_GT, 0, 0, 0};
            case '=':
                if (peek() == '=') { pos++; return {TK_EQ, 0, 0, 0}; }
                return {TK_ASSIGN, 0, 0, 0};
            case '!':
                if (peek() == '=') { pos++; return {TK_NE, 0, 0, 0}; }
                return {TK_ERR, 0, 0, 0};
        }
        return {TK_ERR, 0, 0, 0};
    }
};

// ─── Compiler ────────────────────────────────────────────────────────────────
class Compiler {
public:
    String  source;
    Lexer   lex;
    Tok     cur;
    Program prog;
    String  err;
    bool    failed = false;

    // Note: `source` must be initialised before `lex`; Lexer borrows
    // source.c_str() and we want it to point into our owned copy.
    Compiler(const String& s) : source(s), lex(source) {
        prog.varNames.resize(VAR_RESERVED_END);
        prog.varNames[VAR_I]          = "i";
        prog.varNames[VAR_INDEX]      = "index";
        prog.varNames[VAR_N]          = "n";
        prog.varNames[VAR_PIXELCOUNT] = "pixelCount";
        prog.varNames[VAR_T]          = "t";
        prog.varNames[VAR_TIME]       = "time";
        prog.varNames[VAR_PI]         = "PI";
        prog.varNames[VAR_TAU]        = "TAU";
        prog.varNames[VAR_MOTION]     = "motion";
        prog.varNames[VAR_GATE]       = "gate";
        prog.varNames[VAR_FADE]       = "fade";
    }

    void fail(const String& m) {
        if (!failed) { failed = true; err = m; }
    }

    void advance() { cur = lex.next(); }

    String identText(const Tok& t) {
        char buf[33];
        memcpy(buf, lex.src + t.identStart, t.identLen);
        buf[t.identLen] = 0;
        return String(buf);
    }

    uint8_t addConst(float f) {
        // De-duplicate to save space.
        for (size_t i = 0; i < prog.consts.size(); i++) {
            if (prog.consts[i] == f) return (uint8_t)i;
        }
        if (prog.consts.size() >= MAX_CONSTS) {
            fail("too many constants");
            return 0;
        }
        prog.consts.push_back(f);
        return (uint8_t)(prog.consts.size() - 1);
    }

    uint8_t getOrAddVar(const String& name) {
        for (size_t i = 0; i < prog.varNames.size(); i++) {
            if (prog.varNames[i] == name) return (uint8_t)i;
        }
        if (prog.numVars >= MAX_VARS) {
            fail("too many variables");
            return 0;
        }
        prog.varNames.push_back(name);
        return prog.numVars++;
    }

    int findVar(const String& name) {
        for (size_t i = 0; i < prog.varNames.size(); i++) {
            if (prog.varNames[i] == name) return (int)i;
        }
        return -1;
    }

    int findFn(const String& name) {
        for (auto& e : kFnTable) {
            if (name == e.name) return (int)(&e - kFnTable);
        }
        return -1;
    }

    void emit(uint8_t b) { prog.code.push_back(b); }
    void emit2(uint8_t a, uint8_t b) { prog.code.push_back(a); prog.code.push_back(b); }
    size_t emitJump(uint8_t op) {
        prog.code.push_back(op);
        size_t p = prog.code.size();
        prog.code.push_back(0); prog.code.push_back(0);
        return p;
    }
    void patchJump(size_t p) {
        int32_t rel = (int32_t)prog.code.size() - (int32_t)(p + 2);
        if (rel < INT16_MIN || rel > INT16_MAX) { fail("jump too far"); return; }
        prog.code[p]   = (uint8_t)(rel & 0xFF);
        prog.code[p+1] = (uint8_t)((rel >> 8) & 0xFF);
    }

    bool isKeyword(const char* kw) {
        return cur.type == TK_IDENT && identText(cur) == kw;
    }

    // ── Pratt-ish recursive descent producing bytecode directly ─────────────
    void parseTernary() {
        parseComparison();
        if (cur.type == TK_QMARK) {
            advance();
            size_t jFalse = emitJump(OP_JMP_FALSE);
            parseTernary();
            if (cur.type != TK_COLON) { fail("expected ':'"); return; }
            advance();
            size_t jEnd = emitJump(OP_JMP);
            patchJump(jFalse);
            parseTernary();
            patchJump(jEnd);
        }
    }

    void parseComparison() {
        parseAdd();
        while (cur.type == TK_LT || cur.type == TK_GT || cur.type == TK_LE ||
               cur.type == TK_GE || cur.type == TK_EQ || cur.type == TK_NE) {
            TokType op = cur.type;
            advance();
            parseAdd();
            switch (op) {
                case TK_LT: emit(OP_LT); break;
                case TK_GT: emit(OP_GT); break;
                case TK_LE: emit(OP_LE); break;
                case TK_GE: emit(OP_GE); break;
                case TK_EQ: emit(OP_EQ); break;
                case TK_NE: emit(OP_NE); break;
                default: break;
            }
        }
    }

    void parseAdd() {
        parseMul();
        while (cur.type == TK_PLUS || cur.type == TK_MINUS) {
            TokType op = cur.type;
            advance();
            parseMul();
            emit(op == TK_PLUS ? OP_ADD : OP_SUB);
        }
    }

    void parseMul() {
        parseUnary();
        while (cur.type == TK_STAR || cur.type == TK_SLASH || cur.type == TK_PERCENT) {
            TokType op = cur.type;
            advance();
            parseUnary();
            emit(op == TK_STAR ? OP_MUL : op == TK_SLASH ? OP_DIV : OP_MOD);
        }
    }

    void parseUnary() {
        if (cur.type == TK_MINUS) {
            advance();
            parseUnary();
            emit(OP_NEG);
            return;
        }
        if (cur.type == TK_PLUS) { advance(); parseUnary(); return; }
        parsePrimary();
    }

    void parsePrimary() {
        if (cur.type == TK_NUM) {
            emit2(OP_PUSH_CONST, addConst(cur.num));
            advance();
            return;
        }
        if (cur.type == TK_LPAREN) {
            advance();
            parseTernary();
            if (cur.type != TK_RPAREN) { fail("expected ')'"); return; }
            advance();
            return;
        }
        if (cur.type == TK_IDENT) {
            String name = identText(cur);
            advance();
            if (cur.type == TK_LPAREN) {
                // Function call.
                advance();
                int fi = findFn(name);
                if (fi < 0) { fail("unknown function: " + name); return; }
                uint8_t argc = 0;
                if (cur.type != TK_RPAREN) {
                    for (;;) {
                        parseTernary();
                        argc++;
                        if (cur.type != TK_COMMA) break;
                        advance();
                    }
                }
                if (cur.type != TK_RPAREN) { fail("expected ')'"); return; }
                advance();
                const FnEntry& fe = kFnTable[fi];
                if (argc < fe.minArgs) {
                    // Pad with default constants for known optional args.
                    if (fe.id == FN_SQUARE && argc == 1) {
                        emit2(OP_PUSH_CONST, addConst(0.5f)); argc++;
                    } else {
                        fail(name + " needs " + fe.minArgs + " args");
                        return;
                    }
                }
                if (argc > fe.maxArgs && fe.maxArgs != 0xFF) {
                    fail(name + " too many args"); return;
                }
                // hsv/rgb get dedicated opcodes (they're sinks, not returns).
                if (fe.id == FN_HSV) { emit(OP_HSV); emit2(OP_PUSH_CONST, addConst(0)); return; }
                if (fe.id == FN_RGB) { emit(OP_RGB); emit2(OP_PUSH_CONST, addConst(0)); return; }
                emit(OP_CALL); emit(fe.id); emit(argc);
                return;
            }
            // Variable reference.
            int slot = findVar(name);
            if (slot < 0) {
                // Implicit declaration as 0 — read-before-write returns 0.
                slot = getOrAddVar(name);
            }
            emit2(OP_PUSH_VAR, (uint8_t)slot);
            return;
        }
        fail("unexpected token");
    }

    void parseIfStatement() {
        advance(); // 'if'
        if (cur.type != TK_LPAREN) { fail("expected '(' after if"); return; }
        advance();
        parseTernary();
        if (cur.type != TK_RPAREN) { fail("expected ')'"); return; }
        advance();

        size_t jFalse = emitJump(OP_JMP_FALSE);
        parseStatement();
        if (isKeyword("else")) {
            advance();
            size_t jEnd = emitJump(OP_JMP);
            patchJump(jFalse);
            parseStatement();
            patchJump(jEnd);
        } else {
            patchJump(jFalse);
        }
    }

    void parseStatement() {
        // Optional leading semicolons.
        while (cur.type == TK_SEMI) advance();
        if (cur.type == TK_EOF) return;

        if (isKeyword("if")) {
            parseIfStatement();
            return;
        }

        // Look ahead for assignment: IDENT '='
        if (cur.type == TK_IDENT) {
            // We need a one-token lookahead. Save lexer state.
            uint16_t savedPos = lex.pos;
            Tok      savedCur = cur;
            Tok      ahead    = lex.next();
            if (ahead.type == TK_ASSIGN) {
                String name = identText(savedCur);
                uint8_t slot = getOrAddVar(name);
                // lex.pos is already past '='; cur is stale → load RHS first token.
                advance();
                parseTernary();
                emit2(OP_STORE_VAR, slot);
                if (cur.type == TK_SEMI) advance();
                return;
            }
            // Not assignment — restore.
            lex.pos = savedPos;
            cur     = savedCur;
        }

        parseTernary();
        emit(OP_DROP);
        if (cur.type == TK_SEMI) advance();
    }

    bool compile() {
        advance();
        while (cur.type != TK_EOF && !failed) {
            parseStatement();
        }
        emit(OP_HALT);
        return !failed;
    }
};

// ─── Runtime ─────────────────────────────────────────────────────────────────
struct RunResult {
    bool   useRGB;
    float  h, s, v;   // when !useRGB
    float  r, g, b;   // when useRGB
};

static inline float fastSin01(float v) {
    // sin16 takes uint16_t, returns int16_t -32768..32767. Period = 65536.
    uint16_t u = (uint16_t)(int32_t)(v * 65536.0f);
    return sin16(u) * (1.0f / 32767.0f);
}

static inline float perlin1D_f(float x) {
    // inoise8 maps uint16_t -> 0..255.
    uint16_t u = (uint16_t)((int32_t)(x * 256.0f) & 0xFFFF);
    return inoise8(u) * (1.0f / 255.0f);
}

static inline float perlin2D_f(float x, float y) {
    uint16_t ux = (uint16_t)((int32_t)(x * 256.0f) & 0xFFFF);
    uint16_t uy = (uint16_t)((int32_t)(y * 256.0f) & 0xFFFF);
    return inoise8(ux, uy) * (1.0f / 255.0f);
}

// Forward: set by exec() at the top of each pixel so FN_TIME can read t
// without having to thread the variable table through callFn.
static float g_runT;

// Forwards into the audio module. Each is a cheap read of a published value
// updated by the AudioTask. They return 0 when the mic is off.
} // namespace vm
namespace audio {
    float vu();
    float peak();
    float pitch();
    float beat();
    float mad();
    float band(int n);   // n clamped to 0..7
}
namespace vm {

static inline float callFn(uint8_t id, float* a, uint8_t argc) {
    switch (id) {
        case FN_SIN:        return sinf(a[0]);
        case FN_COS:        return cosf(a[0]);
        case FN_TAN:        return tanf(a[0]);
        case FN_ABS:        return fabsf(a[0]);
        case FN_SQRT:       return sqrtf(fabsf(a[0]));
        case FN_POW:        return powf(a[0], a[1]);
        case FN_FLOOR:      return floorf(a[0]);
        case FN_CEIL:       return ceilf(a[0]);
        case FN_ROUND:      return roundf(a[0]);
        case FN_FRAC:       return a[0] - floorf(a[0]);
        case FN_MIN:        return a[0] < a[1] ? a[0] : a[1];
        case FN_MAX:        return a[0] > a[1] ? a[0] : a[1];
        case FN_CLAMP: {
            float x = a[0], lo = a[1], hi = a[2];
            return x < lo ? lo : (x > hi ? hi : x);
        }
        case FN_MIX:        return a[0] + (a[1] - a[0]) * a[2];
        case FN_STEP:       return a[1] < a[0] ? 0.0f : 1.0f;
        case FN_SMOOTHSTEP: {
            float t = (a[2] - a[0]) / (a[1] - a[0]);
            if (t < 0) t = 0; else if (t > 1) t = 1;
            return t * t * (3.0f - 2.0f * t);
        }
        case FN_WAVE:       return (fastSin01(a[0]) + 1.0f) * 0.5f;
        case FN_TRIANGLE: {
            float f = a[0] - floorf(a[0]);
            return f < 0.5f ? f * 2.0f : 2.0f - f * 2.0f;
        }
        case FN_SQUARE: {
            float f = a[0] - floorf(a[0]);
            return f < a[1] ? 1.0f : 0.0f;
        }
        case FN_TIME: {
            // a[0] is the period in seconds; returns t/period wrapped to [0,1).
            float s = a[0];
            if (s <= 0) return 0;
            float r = g_runT / s;
            return r - floorf(r);
        }
        case FN_PERLIN1D:   return perlin1D_f(a[0]);
        case FN_PERLIN2D:   return perlin2D_f(a[0], a[1]);
        case FN_RANDOM:     return (float)random(0, 10000) / 10000.0f;
        case FN_HASH: {
            // Cheap 32-bit hash for stable per-pixel randomness.
            uint32_t x = (uint32_t)(int32_t)(a[0] * 1000.0f);
            x ^= x >> 16; x *= 0x7feb352d;
            x ^= x >> 15; x *= 0x846ca68b;
            x ^= x >> 16;
            return (x & 0xFFFFFF) * (1.0f / 16777216.0f);
        }
        case FN_VU:     return audio::vu();
        case FN_PEAK:   return audio::peak();
        case FN_PITCH:  return audio::pitch();
        case FN_BEAT:   return audio::beat();
        case FN_BAND:   return audio::band((int)a[0]);
        case FN_BASS:   return (audio::band(0) + audio::band(1)) * 0.5f;
        case FN_MID:    return (audio::band(3) + audio::band(4)) * 0.5f;
        case FN_TREBLE: return (audio::band(6) + audio::band(7)) * 0.5f;
        case FN_MOTION: return 0.0f; // ESP-NOW removed; slot kept so old patterns still compile
        case FN_GATE:
        case FN_FADE:   return settings.audioGateEnabled ? (float)g_gateEnvelope : 1.0f;
        case FN_MAD:    return audio::mad() / 30000.0f;
    }
    return 0.0f;
}

// ── Hot path: execute bytecode for one pixel. ──
bool exec(const Program* p, float* vars, RunResult& out) {
    if (!p || p->code.empty()) return false;

    float stack[STACK_DEPTH];
    int   sp = 0;
    const uint8_t* ip   = p->code.data();
    const uint8_t* end  = ip + p->code.size();
    const float*   K    = p->consts.data();

    out.useRGB = false;
    out.h = 0; out.s = 1; out.v = 1;
    out.r = 0; out.g = 0; out.b = 0;

    g_runT = vars[VAR_T];

    while (ip < end) {
        uint8_t op = *ip++;
        switch (op) {
            case OP_HALT: return true;
            case OP_PUSH_CONST:
                if (sp >= STACK_DEPTH) return false;
                stack[sp++] = K[*ip++];
                break;
            case OP_PUSH_VAR:
                if (sp >= STACK_DEPTH) return false;
                stack[sp++] = vars[*ip++];
                break;
            case OP_STORE_VAR:
                if (sp <= 0) return false;
                vars[*ip++] = stack[--sp];
                break;
            case OP_ADD: stack[sp-2] += stack[sp-1]; sp--; break;
            case OP_SUB: stack[sp-2] -= stack[sp-1]; sp--; break;
            case OP_MUL: stack[sp-2] *= stack[sp-1]; sp--; break;
            case OP_DIV:
                stack[sp-2] = (stack[sp-1] != 0.0f) ? stack[sp-2] / stack[sp-1] : 0.0f;
                sp--; break;
            case OP_MOD:
                stack[sp-2] = (stack[sp-1] != 0.0f) ? fmodf(stack[sp-2], stack[sp-1]) : 0.0f;
                sp--; break;
            case OP_NEG: stack[sp-1] = -stack[sp-1]; break;
            case OP_LT: stack[sp-2] = stack[sp-2] <  stack[sp-1] ? 1.0f : 0.0f; sp--; break;
            case OP_GT: stack[sp-2] = stack[sp-2] >  stack[sp-1] ? 1.0f : 0.0f; sp--; break;
            case OP_LE: stack[sp-2] = stack[sp-2] <= stack[sp-1] ? 1.0f : 0.0f; sp--; break;
            case OP_GE: stack[sp-2] = stack[sp-2] >= stack[sp-1] ? 1.0f : 0.0f; sp--; break;
            case OP_EQ: stack[sp-2] = fabsf(stack[sp-2] - stack[sp-1]) < 1e-5f ? 1.0f : 0.0f; sp--; break;
            case OP_NE: stack[sp-2] = fabsf(stack[sp-2] - stack[sp-1]) >= 1e-5f ? 1.0f : 0.0f; sp--; break;
            case OP_JMP: {
                int16_t rel = (int16_t)(ip[0] | (ip[1] << 8));
                ip += 2 + rel;
                break;
            }
            case OP_JMP_FALSE: {
                int16_t rel = (int16_t)(ip[0] | (ip[1] << 8));
                ip += 2;
                if (stack[--sp] == 0.0f) ip += rel;
                break;
            }
            case OP_CALL: {
                uint8_t fn   = *ip++;
                uint8_t argc = *ip++;
                if (argc > 4) argc = 4;
                float args[4] = {0,0,0,0};
                for (int i = argc - 1; i >= 0; i--) args[i] = stack[--sp];
                if (sp >= STACK_DEPTH) return false;
                stack[sp++] = callFn(fn, args, argc);
                break;
            }
            case OP_HSV: {
                out.useRGB = false;
                float vv = stack[--sp];
                float ss = stack[--sp];
                float hh = stack[--sp];
                out.h = hh; out.s = ss; out.v = vv;
                break;
            }
            case OP_RGB: {
                out.useRGB = true;
                float bb = stack[--sp];
                float gg = stack[--sp];
                float rr = stack[--sp];
                out.r = rr; out.g = gg; out.b = bb;
                break;
            }
            case OP_DROP: if (sp > 0) sp--; break;
            default: return false;
        }
    }
    return true;
}

} // namespace vm

// ─── Audio module ────────────────────────────────────────────────────────────
//
// One FreeRTOS task at prio 1 owns the mic. It samples a window, runs an FFT,
// extracts an RMS level, dominant pitch, MAD (DeafDoorbell metric), and 8
// logarithmic bands, and writes them into `g_snap` (guarded by `g_snapMu`).
//
namespace audio {

constexpr int   SAMPLE_RATE      = 16000;
constexpr int   FFT_N            = 256;
constexpr int   BAND_COUNT       = 8;
constexpr float DC_BLOCK         = 0.997f;   // HPF to kill DC offset from MAX4466
constexpr float ANALOG_MAD_SCALE = 8.0f;     // Matches DeafDoorbell's 0..30000 MAD scale

// Band edges as FFT bin indices. With 16 kHz / 256 = 62.5 Hz/bin, this gives:
//   0: 62-187 Hz, 1: 187-375, 2: 375-687, 3: 687-1250,
//   4: 1250-2375, 5: 2375-4500, 6: 4500-7500, 7: 7500-8000
static const uint8_t kBandEdge[BAND_COUNT + 1] =
    { 1, 3, 6, 11, 20, 38, 72, 120, 128 };

struct Snap {
    float vu      = 0.0f;
    float peak    = 0.0f;
    float pitch   = 0.0f;
    float beat    = 0.0f;
    float mad     = 0.0f;
    float madPeak = 0.0f;
    float bands[BAND_COUNT] = {0};
};

static Snap                g_snap;
static portMUX_TYPE        g_snapMu = portMUX_INITIALIZER_UNLOCKED;
static volatile bool       g_audioRunning = false;
static TaskHandle_t        g_audioTaskHandle = nullptr;

float vu()    { float v; portENTER_CRITICAL(&g_snapMu); v = g_snap.vu;    portEXIT_CRITICAL(&g_snapMu); return v; }
float peak()  { float v; portENTER_CRITICAL(&g_snapMu); v = g_snap.peak;  portEXIT_CRITICAL(&g_snapMu); return v; }
float pitch() { float v; portENTER_CRITICAL(&g_snapMu); v = g_snap.pitch; portEXIT_CRITICAL(&g_snapMu); return v; }
float beat()  { float v; portENTER_CRITICAL(&g_snapMu); v = g_snap.beat;  portEXIT_CRITICAL(&g_snapMu); return v; }
float mad()   { float v; portENTER_CRITICAL(&g_snapMu); v = g_snap.mad;   portEXIT_CRITICAL(&g_snapMu); return v; }
float band(int n) {
    if (n < 0) n = 0; if (n >= BAND_COUNT) n = BAND_COUNT - 1;
    float v; portENTER_CRITICAL(&g_snapMu); v = g_snap.bands[n]; portEXIT_CRITICAL(&g_snapMu); return v;
}

void getSnap(Snap& dst, bool resetMadPeak = false) {
    portENTER_CRITICAL(&g_snapMu);
    dst = g_snap;
    if (resetMadPeak) g_snap.madPeak = g_snap.mad;
    portEXIT_CRITICAL(&g_snapMu);
}

static bool setupI2S() {
    i2s_config_t cfg = {};
    cfg.mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
    cfg.sample_rate          = SAMPLE_RATE;
    cfg.bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT;
    cfg.channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT;
    cfg.communication_format = (i2s_comm_format_t)I2S_COMM_FORMAT_STAND_I2S;
    cfg.intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1;
    cfg.dma_buf_count        = 4;
    cfg.dma_buf_len          = 256;
    cfg.use_apll             = false;
    cfg.tx_desc_auto_clear   = false;
    cfg.fixed_mclk           = 0;

    if (i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr) != ESP_OK) return false;

    i2s_pin_config_t pins = {};
    pins.bck_io_num   = settings.micBCLK;
    pins.ws_io_num    = settings.micWS;
    pins.data_out_num = I2S_PIN_NO_CHANGE;
    pins.data_in_num  = settings.micData;
    if (i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) {
        i2s_driver_uninstall(I2S_NUM_0);
        return false;
    }
    return true;
}

static bool isADC1Gpio(int gpio) { return gpio >= 0 && gpio <= 4; }

// ── Sampling ──
static int32_t i2sBuf[FFT_N];

static bool sampleI2S(float* out, float& dcState, float& rawMadOut) {
    size_t bytesRead = 0;
    if (i2s_read(I2S_NUM_0, i2sBuf, sizeof(i2sBuf), &bytesRead, pdMS_TO_TICKS(50)) != ESP_OK)
        return false;
    int n = bytesRead / sizeof(int32_t);
    if (n <= 0) return false;
    float madSum = 0.0f;
    for (int i = 0; i < FFT_N; i++) {
        float s = (float)(i2sBuf[i % n] >> 8);   // -2^23..2^23
        float x = s - dcState;
        dcState = dcState + (1.0f - DC_BLOCK) * x;
        float norm = x * (1.0f / 8388608.0f);    // → ~[-1, 1]
        out[i] = norm;
        madSum += fabsf(norm) * 2048.0f;
    }
    rawMadOut = (madSum / (float)FFT_N) * ANALOG_MAD_SCALE * settings.micGain;
    return true;
}

static bool sampleADC(float* out, float& dcState, float& iirPrevIn, float& iirPrevOut, float& rawMadOut) {
    float madSum = 0.0f;
    for (int i = 0; i < FFT_N; i++) {
        int v = analogRead(settings.micADCPin);
        float inSample = (float)v;

        // DeafDoorbell DC-blocking IIR high-pass filter (~80Hz cutoff at ~20kHz)
        float iirOut = inSample - iirPrevIn + (0.985f * iirPrevOut);
        iirPrevIn  = inSample;
        iirPrevOut = iirOut;
        madSum += fabsf(iirOut);

        // Ember FFT normalized sample
        float x = inSample - dcState;
        dcState = dcState + (1.0f - DC_BLOCK) * x;
        out[i] = x * (1.0f / 2048.0f);

        delayMicroseconds(25);
    }

    rawMadOut = (madSum / (float)FFT_N) * ANALOG_MAD_SCALE * settings.micGain;
    return true;
}

// ── Task ──
static float vReal[FFT_N];
static float vImag[FFT_N];
static ArduinoFFT<float> g_fft(vReal, vImag, FFT_N, (float)SAMPLE_RATE);

static void audioTask(void*) {
    float dcState    = (settings.micSource == 2) ? (float)analogRead(settings.micADCPin) : 0.0f;
    float iirPrevIn  = dcState;
    float iirPrevOut = 0.0f;
    float bandsSmoothed[BAND_COUNT] = {0};
    float vuSmoothed  = 0.0f;
    float madSmoothed = 0.0f;
    float peakLevel   = 0.0f;
    float beatLevel   = 0.0f;
    float prevVU      = 0.0f;

    g_audioRunning = true;
    Serial.printf("audio: source=%d running (ADC=%d, softGND=%d)\n",
                  settings.micSource, settings.micADCPin, settings.micGndPin);

    while (g_audioRunning) {
        bool  ok     = false;
        float rawMad = 0.0f;
        if (settings.micSource == 1)      ok = sampleI2S(vReal, dcState, rawMad);
        else if (settings.micSource == 2) ok = sampleADC(vReal, dcState, iirPrevIn, iirPrevOut, rawMad);
        if (!ok) { vTaskDelay(pdMS_TO_TICKS(50)); continue; }

        if (rawMad > 65000.0f) rawMad = 65000.0f;

        // FFT setup: imag = 0, then window/compute/magnitudes.
        memset(vImag, 0, sizeof(vImag));
        g_fft.windowing(FFTWindow::Hamming, FFTDirection::Forward);
        g_fft.compute(FFTDirection::Forward);
        g_fft.complexToMagnitude();

        float bandsNew[BAND_COUNT];
        float bandSum = 0;
        int   bandPeakIdx = 0;
        float bandPeak    = 0;
        for (int b = 0; b < BAND_COUNT; b++) {
            int  a = kBandEdge[b], z = kBandEdge[b+1];
            float sum = 0;
            for (int k = a; k < z; k++) sum += vReal[k];
            float mag = sum / (float)(z - a);
            float shaped = log1pf(mag * 0.02f) * settings.micGain;
            if (shaped < 0) shaped = 0;
            if (shaped > 1) shaped = 1;
            bandsNew[b] = shaped;
            bandSum += shaped;
            if (shaped > bandPeak) { bandPeak = shaped; bandPeakIdx = b; }
        }

        float vuNew = bandSum / (float)BAND_COUNT;
        float pitchNew = (float)bandPeakIdx / (float)(BAND_COUNT - 1);

        // EMA smoothing (settings.micSmoothing in 0..0.95).
        float a = settings.micSmoothing;
        if (a < 0) a = 0; if (a > 0.95f) a = 0.95f;
        float oneMinusA = 1.0f - a;
        for (int b = 0; b < BAND_COUNT; b++) {
            bandsSmoothed[b] = bandsSmoothed[b] * a + bandsNew[b] * oneMinusA;
        }
        vuSmoothed  = vuSmoothed  * a + vuNew  * oneMinusA;
        madSmoothed = madSmoothed * 0.45f + rawMad * 0.55f;

        // Peak with slow decay.
        if (vuSmoothed > peakLevel) peakLevel = vuSmoothed;
        else                        peakLevel *= 0.95f;

        // Beat: trigger when level rises sharply, then decay quickly.
        float dv = vuSmoothed - prevVU;
        if (dv > 0.08f) beatLevel = 1.0f;
        else            beatLevel *= 0.85f;
        prevVU = vuSmoothed;

        // Publish.
        portENTER_CRITICAL(&g_snapMu);
        g_snap.vu    = vuSmoothed;
        g_snap.peak  = peakLevel;
        g_snap.pitch = pitchNew;
        g_snap.beat  = beatLevel;
        g_snap.mad   = madSmoothed;
        if (rawMad > g_snap.madPeak) g_snap.madPeak = rawMad;
        for (int b = 0; b < BAND_COUNT; b++) g_snap.bands[b] = bandsSmoothed[b];
        portEXIT_CRITICAL(&g_snapMu);

        // CRITICAL on single-core ESP32-C3: yield to FreeRTOS scheduler so
        // RenderTask (prio 2) and loop() can run without starvation!
        vTaskDelay(pdMS_TO_TICKS(8));
    }

    if (settings.micSource == 1) i2s_driver_uninstall(I2S_NUM_0);

    g_audioTaskHandle = nullptr;
    vTaskDelete(nullptr);
}

static void start() {
    if (g_audioTaskHandle) return;
    if (settings.micSource == 0) return;

    if (settings.micSource == 1) {
        if (!setupI2S()) {
            Serial.println("audio: I2S setup failed");
            return;
        }
    } else if (settings.micSource == 2) {
        if (!isADC1Gpio(settings.micADCPin)) {
            Serial.printf("audio: GPIO %d is not ADC1 (use 0-4)\n", settings.micADCPin);
            return;
        }
        // Assert soft ground on micGndPin (e.g. GPIO 4) when valid and not colliding
        if (settings.micGndPin >= 0 && settings.micGndPin <= 10 &&
            settings.micGndPin != settings.pixelPin &&
            settings.micGndPin != settings.micADCPin) {
            pinMode(settings.micGndPin, OUTPUT);
            digitalWrite(settings.micGndPin, LOW);
            Serial.printf("audio: soft GND enabled on GPIO %d\n", settings.micGndPin);
        }
        pinMode(settings.micADCPin, INPUT);
        analogReadResolution(12);
        analogSetPinAttenuation(settings.micADCPin, ADC_11db);
    }

    // Priority 1 so RenderTask (Priority 2) and AsyncTCP (Priority 3) preempt audio cleanly
    xTaskCreatePinnedToCore(audioTask, "audio", 6144, nullptr, 1, &g_audioTaskHandle, 0);
}

} // namespace audio

// ─── Live program (atomic swap) ──────────────────────────────────────────────
std::atomic<vm::Program*> g_program{nullptr};

static void installProgram(vm::Program* p) {
    if (g_progMu) xSemaphoreTake(g_progMu, portMAX_DELAY);
    vm::Program* old = g_program.exchange(p, std::memory_order_relaxed);
    if (g_progMu) xSemaphoreGive(g_progMu);
    if (old) delete old;
}

static bool recompile(const String& source, String& errOut) {
    vm::Compiler c(source);
    if (!c.compile()) {
        errOut = c.err;
        return false;
    }
    installProgram(new vm::Program(std::move(c.prog)));
    errOut = "";
    return true;
}

// ─── Native ESP-IDF RMT WS2812B Driver (ESP32-C3 safe) ──────────────────────
static uint8_t* g_grbBuf     = nullptr;
static bool     g_rmtInited  = false;

static void IRAM_ATTR ws2812_rmt_adapter(const void* src, rmt_item32_t* dest,
                                         size_t src_size, size_t wanted_num,
                                         size_t* translated_size, size_t* item_num) {
    if (src == nullptr || dest == nullptr) {
        *translated_size = 0;
        *item_num = 0;
        return;
    }
    // 80MHz APB / clk_div 2 = 40MHz (25ns per tick)
    // WS2812B: T0H=400ns (16), T0L=850ns (34); T1H=800ns (32), T1L=450ns (18)
    const rmt_item32_t bit0 = {{{ 16, 1, 34, 0 }}};
    const rmt_item32_t bit1 = {{{ 32, 1, 18, 0 }}};
    size_t size = 0;
    size_t num  = 0;
    const uint8_t* psrc = (const uint8_t*)src;
    rmt_item32_t* pdest = dest;
    while (size < src_size && (num + 8) <= wanted_num) {
        uint8_t b = *psrc++;
        for (int i = 0; i < 8; i++) {
            pdest->val = (b & 0x80) ? bit1.val : bit0.val;
            pdest++;
            b <<= 1;
        }
        num += 8;
        size++;
    }
    *translated_size = size;
    *item_num = num;
}

static bool g_stripIsBlack = false;

static void showStrip(bool forceSend = false) {
    if (!leds || !g_grbBuf || !g_rmtInited) return;
    const int n = settings.pixelCount;
    uint32_t scale = (uint32_t)constrain(settings.brightness, 0, 255);

    uint32_t rawSum = 0;
    for (int i = 0; i < n; i++) {
        rawSum += (uint32_t)leds[i].r + (uint32_t)leds[i].g + (uint32_t)leds[i].b;
    }

    if (rawSum == 0) {
        if (g_stripIsBlack && !forceSend) {
            return; // Strip is already black; keep GPIO 5 silent so ADC has zero RMT noise
        }
        memset(g_grbBuf, 0, n * 3);
        g_stripIsBlack = true;
    } else {
        g_stripIsBlack = false;
        // Safe power cap for 100 pixels (~450mA USB budget) to prevent 5V rail brownouts
        constexpr uint32_t kMaxChannelSum = 9000UL;
        uint32_t scaledSum = (rawSum * scale) >> 8;
        if (scaledSum > kMaxChannelSum && rawSum > 0) {
            scale = (kMaxChannelSum << 8) / rawSum;
        }

        for (int i = 0; i < n; i++) {
            g_grbBuf[i * 3 + 0] = (uint8_t)(((uint32_t)leds[i].g * scale) >> 8);
            g_grbBuf[i * 3 + 1] = (uint8_t)(((uint32_t)leds[i].r * scale) >> 8);
            g_grbBuf[i * 3 + 2] = (uint8_t)(((uint32_t)leds[i].b * scale) >> 8);
        }
    }

    if (g_rmtAdcMu) xSemaphoreTake(g_rmtAdcMu, portMAX_DELAY);
    rmt_write_sample(RMT_CHANNEL_0, g_grbBuf, n * 3, true);
    delayMicroseconds(60);
    if (g_rmtAdcMu) xSemaphoreGive(g_rmtAdcMu);
}

static void initFastLED() {
    if (leds) { delete[] leds; leds = nullptr; }
    if (g_grbBuf) { free(g_grbBuf); g_grbBuf = nullptr; }
    leds = new CRGB[settings.pixelCount];
    g_grbBuf = (uint8_t*)malloc(settings.pixelCount * 3);

    rmt_config_t config = {};
    config.rmt_mode = RMT_MODE_TX;
    config.channel = RMT_CHANNEL_0;
    config.gpio_num = (gpio_num_t)settings.pixelPin;
    config.clk_div = 2; // 40MHz (25ns tick)
    config.mem_block_num = 2; // Use both TX blocks (96 words) on ESP32-C3
    config.tx_config.loop_en = false;
    config.tx_config.carrier_en = false;
    config.tx_config.idle_output_en = true;
    config.tx_config.idle_level = RMT_IDLE_LEVEL_LOW;

    if (rmt_config(&config) == ESP_OK &&
        rmt_driver_install(RMT_CHANNEL_0, 0, 0) == ESP_OK &&
        rmt_translator_init(RMT_CHANNEL_0, ws2812_rmt_adapter) == ESP_OK) {
        g_rmtInited = true;
    } else {
        Serial.println("RMT WS2812B init failed");
    }

    fill_solid(leds, settings.pixelCount, CRGB::Black);
    showStrip(true);
}

// Quintic smootherstep, then gamma 2.2 so WS2812 steps look even.
static float shapeGateEnvelope(float lin) {
    if (lin <= 0.0f) return 0.0f;
    if (lin >= 1.0f) return 1.0f;
    float shaped = lin * lin * lin * (lin * (lin * 6.0f - 15.0f) + 10.0f);
    return powf(shaped, 2.2f);
}

// ─── LED render task ─────────────────────────────────────────────────────────
static void renderTask(void*) {
    const TickType_t period = pdMS_TO_TICKS(20);  // ~50 Hz target, yields cleanly
    TickType_t       last   = xTaskGetTickCount();
    uint32_t         frameCounter = 0;
    uint32_t         lastFpsTick  = millis();
    uint32_t         lastFrameMs  = millis();
    float            vars[vm::MAX_VARS];

    for (;;) {
        vTaskDelayUntil(&last, period);
        if (!leds) continue;

        uint32_t now = millis();
        float dt = (now - lastFrameMs) * 0.001f;
        if (dt < 0.0f) dt = 0.0f;
        if (dt > 0.1f) dt = 0.1f;
        lastFrameMs = now;

        // ── Audio Gate Envelope (attack ~2s, release ~3.5s, 400ms quiet hold) ──
        float env = 1.0f;
        if (settings.audioGateEnabled && settings.micSource != 0) {
            float curMad = audio::mad();
            float threshX = (float)settings.gateThreshold;
            float threshY = threshX * 0.85f; // Hysteresis floor Y = 85% of X

            if (curMad >= threshX) {
                g_gateActive = true;
                g_gateQuietTiming = false;
            } else if (curMad < threshY) {
                if (g_gateActive) {
                    if (!g_gateQuietTiming) {
                        g_gateQuietTiming = true;
                        g_gateQuietSince = now;
                    } else if ((uint32_t)(now - g_gateQuietSince) >= 400) {
                        g_gateActive = false;
                        g_gateQuietTiming = false;
                    }
                }
            } else {
                // Between Y and X: keep the current state and don't start the release hold.
                g_gateQuietTiming = false;
            }

            float lin = g_gateLinear;
            if (g_gateActive) {
                lin += dt * 0.5f; // +0.5/sec -> ~2.0 seconds for 0 -> 1
                if (lin > 1.0f) lin = 1.0f;
            } else {
                lin -= dt * 0.28f; // -0.28/sec -> ~3.5 seconds for 1 -> 0
                if (lin < 0.0f) lin = 0.0f;
            }
            g_gateLinear = lin;
            env = shapeGateEnvelope(lin);
            g_gateEnvelope = env;
        } else {
            g_gateActive      = true;
            g_gateLinear      = 1.0f;
            g_gateEnvelope    = 1.0f;
            g_gateQuietTiming = false;
            env               = 1.0f;
        }

        if (g_progMu) xSemaphoreTake(g_progMu, portMAX_DELAY);
        vm::Program* p = g_program.load(std::memory_order_relaxed);
        float t = now / 1000.0f;
        int n = settings.pixelCount;

        // Fast-path when completely faded out: clear strip without running VM for 500 pixels
        if (env <= 0.0005f) {
            fill_solid(leds, n, CRGB::Black);
        } else if (p) {
            // Initialise the reserved variable slots.
            memset(vars, 0, sizeof(vars));
            vars[vm::VAR_N]          = (float)n;
            vars[vm::VAR_PIXELCOUNT] = (float)n;
            vars[vm::VAR_T]          = t;
            vars[vm::VAR_TIME]       = t;
            vars[vm::VAR_PI]         = (float)M_PI;
            vars[vm::VAR_TAU]        = (float)(2.0 * M_PI);
            vars[vm::VAR_MOTION]     = 0.0f;
            vars[vm::VAR_GATE]       = env;
            vars[vm::VAR_FADE]       = env;

            for (int i = 0; i < n; i++) {
                vars[vm::VAR_I]     = (float)i;
                vars[vm::VAR_INDEX] = (float)i;
                vm::RunResult r;
                if (vm::exec(p, vars, r)) {
                    if (r.useRGB) {
                        leds[i] = CRGB(
                            (uint8_t)constrain(r.r * env * 255.0f, 0.0f, 255.0f),
                            (uint8_t)constrain(r.g * env * 255.0f, 0.0f, 255.0f),
                            (uint8_t)constrain(r.b * env * 255.0f, 0.0f, 255.0f));
                    } else {
                        float hh = r.h - floorf(r.h);
                        if (hh < 0) hh += 1.0f;
                        leds[i] = CHSV(
                            (uint8_t)(hh * 255.0f),
                            (uint8_t)constrain(r.s * 255.0f, 0.0f, 255.0f),
                            (uint8_t)constrain(r.v * env * 255.0f, 0.0f, 255.0f));
                    }
                } else {
                    leds[i] = CRGB::Black;
                }
            }
        } else {
            fill_solid(leds, n, CRGB::Black);
        }
        if (g_progMu) xSemaphoreGive(g_progMu);

        showStrip();

        frameCounter++;
        if (now - lastFpsTick >= 1000) {
            g_fps = (float)frameCounter * 1000.0f / (now - lastFpsTick);
            Serial.printf("stat: fps=%.1f mad=%.0f rawADC=%d env=%.2f\n", (float)g_fps, audio::mad(), analogRead(3), env);
            frameCounter = 0;
            lastFpsTick = now;
        }
    }
}

// ─── Persistence ─────────────────────────────────────────────────────────────
static void loadSettings() {
    if (!LittleFS.exists("/settings.json")) return;
    File f = LittleFS.open("/settings.json", "r");
    JsonDocument doc;
    if (deserializeJson(doc, f) == DeserializationError::Ok) {
        settings.pixelPin         = doc["pin"]        | settings.pixelPin;
        settings.pixelCount       = doc["count"]      | settings.pixelCount;
        settings.brightness       = doc["brightness"] | settings.brightness;
        strlcpy(settings.hostname, doc["hostname"] | settings.hostname, sizeof(settings.hostname));
        strlcpy(settings.wifiSSID, doc["ssid"]     | settings.wifiSSID, sizeof(settings.wifiSSID));
        strlcpy(settings.wifiPass, doc["pass"]     | settings.wifiPass, sizeof(settings.wifiPass));
        strlcpy(settings.apSSID,   doc["apSSID"]   | settings.apSSID,   sizeof(settings.apSSID));
        settings.micSource        = doc["micSrc"]     | settings.micSource;
        settings.micBCLK          = doc["micBCLK"]    | settings.micBCLK;
        settings.micWS            = doc["micWS"]      | settings.micWS;
        settings.micData          = doc["micData"]    | settings.micData;
        settings.micADCPin        = doc["micADC"]     | settings.micADCPin;
        settings.micGndPin        = doc["micGnd"]     | settings.micGndPin;
        settings.micGain          = doc["micGain"]    | settings.micGain;
        settings.micSmoothing     = doc["micSmooth"]  | settings.micSmoothing;
        settings.audioGateEnabled = doc["gateEn"]     | settings.audioGateEnabled;
        settings.gateThreshold    = doc["gateThresh"] | settings.gateThreshold;
        settings.autoCycle        = doc["autoCycle"]  | settings.autoCycle;
        settings.cycleSeconds     = doc["cycleSec"]   | settings.cycleSeconds;
    }
    f.close();
#ifdef EMBER_BATHROOM
    // Enforce bathroom defaults: exactly 100 pixels, MAX4466 on GPIO 3, Soft GND on GPIO 4
    settings.pixelPin   = 5;
    settings.pixelCount = 100;
    settings.micSource  = 2;
    settings.micADCPin  = 3;
    settings.micGndPin  = 4;
#endif
}

static void saveSettings() {
    File f = LittleFS.open("/settings.json", "w");
    JsonDocument doc;
    doc["pin"]        = settings.pixelPin;
    doc["count"]      = settings.pixelCount;
    doc["brightness"] = settings.brightness;
    doc["hostname"]   = settings.hostname;
    doc["ssid"]       = settings.wifiSSID;
    doc["pass"]       = settings.wifiPass;
    doc["apSSID"]     = settings.apSSID;
    doc["micSrc"]     = settings.micSource;
    doc["micBCLK"]    = settings.micBCLK;
    doc["micWS"]      = settings.micWS;
    doc["micData"]    = settings.micData;
    doc["micADC"]     = settings.micADCPin;
    doc["micGnd"]     = settings.micGndPin;
    doc["micGain"]    = settings.micGain;
    doc["micSmooth"]  = settings.micSmoothing;
    doc["gateEn"]     = settings.audioGateEnabled;
    doc["gateThresh"] = settings.gateThreshold;
    doc["autoCycle"]  = settings.autoCycle;
    doc["cycleSec"]   = settings.cycleSeconds;
    serializeJson(doc, f);
    f.close();
    g_settingsDirty = false;
}

static void markSettingsDirty() {
    g_settingsDirty = true;
    g_settingsChangedAtMs = millis();
}

static void loadPattern(const String& name) {
    String path = "/patterns/" + name + ".wfl";
    if (!LittleFS.exists(path)) return;
    File f = LittleFS.open(path, "r");
    String src = f.readString();
    f.close();
    String err;
    if (recompile(src, err)) {
        g_currentSource = src;
        g_currentName   = name;
        g_lastError     = "";
    } else {
        g_lastError = err;
    }
}

static void savePattern(const String& name, const String& code) {
    if (!LittleFS.exists("/patterns")) LittleFS.mkdir("/patterns");
    String path = "/patterns/" + name + ".wfl";
    File f = LittleFS.open(path, "w");
    f.print(code);
    f.close();
    g_currentName = name;
    g_currentSource = code;
}

static void saveActivePattern(const String& name, const String& code) {
    File f = LittleFS.open("/active.wfl", "w");
    if (f) {
        f.print(code);
        f.close();
    }
    File fn = LittleFS.open("/active_name.txt", "w");
    if (fn) {
        fn.print(name);
        fn.close();
    }
}

static String patternListJson() {
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
    String out;
    serializeJson(doc, out);
    return out;
}

// ─── WebSocket handler ───────────────────────────────────────────────────────
static void pushSensors(bool force = false);

static void sendStatus(AsyncWebSocketClient* c, const String& err) {
    JsonDocument resp;
    resp["type"]      = "status";
    resp["name"]      = g_currentName;
    resp["fps"]       = (float)g_fps;
    resp["count"]     = settings.pixelCount;
    resp["pin"]       = settings.pixelPin;
    resp["bright"]    = settings.brightness;
    resp["error"]     = err;
    resp["micSrc"]    = settings.micSource;
    resp["micBCLK"]   = settings.micBCLK;
    resp["micWS"]     = settings.micWS;
    resp["micData"]   = settings.micData;
    resp["micADC"]    = settings.micADCPin;
    resp["micGnd"]    = settings.micGndPin;
    resp["micGain"]   = settings.micGain;
    resp["micSmooth"] = settings.micSmoothing;
    resp["gateEn"]    = settings.audioGateEnabled;
    resp["gateThresh"]= settings.gateThreshold;
    resp["autoCycle"] = settings.autoCycle;
    resp["cycleSec"]  = settings.cycleSeconds;
    resp["gate"]      = (float)g_gateEnvelope;
    resp["gateActive"]= (bool)g_gateActive;
    resp["mad"]       = (float)audio::mad();
    resp["apSSID"]    = settings.apSSID;
    resp["hostname"]  = settings.hostname;
    resp["wifiSSID"]  = settings.wifiSSID;
    resp["wifiPass"]  = settings.wifiPass;
    String out; serializeJson(resp, out);
    if (c) c->text(out); else ws.textAll(out);
}

static void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient* client,
                      AwsEventType type, void*, uint8_t* data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        sendStatus(client, g_lastError);
        // Also send current pattern code so the editor populates immediately
        JsonDocument loaded;
        loaded["type"]  = "loaded";
        loaded["name"]  = g_currentName;
        loaded["code"]  = g_currentSource;
        loaded["error"] = g_lastError;
        String out; serializeJson(loaded, out);
        client->text(out);
        return;
    }
    if (type != WS_EVT_DATA) return;

    String msg((char*)data, len);
    JsonDocument doc;
    if (deserializeJson(doc, msg)) return;
    String action = doc["action"] | "";

    if (action == "live") {
        String code = doc["code"] | "";
        String err;
        bool ok = recompile(code, err);
        if (ok) {
            g_currentSource = code;
            g_lastError = "";
            saveActivePattern(g_currentName, code);
        } else {
            g_lastError = err;
        }
        JsonDocument resp;
        resp["type"]    = "compile";
        resp["success"] = ok;
        resp["error"]   = err;
        String out; serializeJson(resp, out);
        client->text(out);
    }
    else if (action == "save") {
        String name = doc["name"] | "Untitled";
        String code = doc["code"] | "";
        savePattern(name, code);
        String err;
        recompile(code, err);
        g_lastError = err;
        saveActivePattern(name, code);
        ws.textAll(String("{\"type\":\"patterns\",\"list\":") + patternListJson() + "}");
    }
    else if (action == "load") {
        String name = doc["name"] | "";
        loadPattern(name);
        if (g_lastError.isEmpty()) {
            saveActivePattern(name, g_currentSource);
        }
        JsonDocument resp;
        resp["type"]  = "loaded";
        resp["name"]  = g_currentName;
        resp["code"]  = g_currentSource;
        resp["error"] = g_lastError;
        String out; serializeJson(resp, out);
        client->text(out);
    }
    else if (action == "delete") {
        String name = doc["name"] | "";
        String path = "/patterns/" + name + ".wfl";
        if (LittleFS.exists(path)) LittleFS.remove(path);
        ws.textAll(String("{\"type\":\"patterns\",\"list\":") + patternListJson() + "}");
    }
    else if (action == "brightness") {
        settings.brightness = constrain(doc["value"] | 128, 0, 255);
        markSettingsDirty();
        sendStatus(nullptr, g_lastError);
    }
    else if (action == "gateSet") {
        if (doc["enabled"].is<bool>()) settings.audioGateEnabled = doc["enabled"].as<bool>();
        if (doc["thresh"].is<int>())   settings.gateThreshold = constrain(doc["thresh"].as<int>(), 200, 30000);
        if (doc["autoCycle"].is<bool>()) {
            settings.autoCycle = doc["autoCycle"].as<bool>();
            g_lastCycleMs = millis();
        }
        if (doc["cycleSec"].is<int>()) {
            settings.cycleSeconds = constrain(doc["cycleSec"].as<int>(), 5, 600);
        }
        markSettingsDirty();
        sendStatus(nullptr, g_lastError);
    }
    else if (action == "count") {
        int n = doc["value"] | 30;
        n = constrain(n, 1, 600);
        if (n != settings.pixelCount) {
            settings.pixelCount = n;
            saveSettings();
            client->text("{\"type\":\"reboot\"}");
            delay(150);
            ESP.restart();
        }
    }
    else if (action == "pin") {
        int p = doc["value"] | 5;
        const int allowed[] = {0,1,2,3,4,5,6,7,8,9,10};
        bool ok = false;
        for (int a : allowed) if (a == p) { ok = true; break; }
        if (ok && p != settings.pixelPin) {
            settings.pixelPin = p;
            saveSettings();
            client->text("{\"type\":\"reboot\"}");
            delay(150);
            ESP.restart();
        }
    }
    else if (action == "micSrc") {
        int s = doc["value"] | 0;
        if (s >= 0 && s <= 2 && s != settings.micSource) {
            settings.micSource = s;
            saveSettings();
            client->text("{\"type\":\"reboot\"}");
            delay(150);
            ESP.restart();
        }
    }
    else if (action == "micPins") {
        bool dirty = false;
        if (doc["bclk"].is<int>()) { settings.micBCLK   = doc["bclk"];  dirty = true; }
        if (doc["ws"]  .is<int>()) { settings.micWS     = doc["ws"];    dirty = true; }
        if (doc["data"].is<int>()) { settings.micData   = doc["data"];  dirty = true; }
        if (doc["adc"] .is<int>()) { settings.micADCPin = doc["adc"];   dirty = true; }
        if (doc["gnd"] .is<int>()) { settings.micGndPin = doc["gnd"];   dirty = true; }
        if (dirty) {
            saveSettings();
            client->text("{\"type\":\"reboot\"}");
            delay(150);
            ESP.restart();
        }
    }
    else if (action == "wifiSet") {
        if (doc["apSSID"].is<const char*>()) strlcpy(settings.apSSID, doc["apSSID"], sizeof(settings.apSSID));
        if (doc["hostname"].is<const char*>()) strlcpy(settings.hostname, doc["hostname"], sizeof(settings.hostname));
        // Station join is not used. Drop any credentials a client still sends.
        settings.wifiSSID[0] = '\0';
        settings.wifiPass[0] = '\0';
        saveSettings();
        client->text("{\"type\":\"reboot\"}");
        delay(150);
        ESP.restart();
    }
    else if (action == "micGain") {
        float g = doc["value"] | 1.0f;
        if (g < 0.0f)  g = 0.0f;
        if (g > 10.0f) g = 10.0f;
        settings.micGain = g;
        markSettingsDirty();
        sendStatus(nullptr, g_lastError);
    }
    else if (action == "micSmooth") {
        float s = doc["value"] | 0.6f;
        if (s < 0.0f)  s = 0.0f;
        if (s > 0.95f) s = 0.95f;
        settings.micSmoothing = s;
        markSettingsDirty();
        sendStatus(nullptr, g_lastError);
    }
    else if (action == "ping") {
        sendStatus(client, g_lastError);
    }
    else if (action == "poll") {
        pushSensors(true);
    }
}

// ─── OTA Update Page HTML ────────────────────────────────────────────────────
static const char UPDATE_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ember-Audio OTA Update</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #0b0d12; color: #e6e9f2; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; padding: 24px; display: flex; justify-content: center; }
    .box { width: 100%; max-width: 420px; background: #141821; border: 1px solid #232938; border-radius: 12px; padding: 24px; }
    h2 { margin: 0 0 12px; background: linear-gradient(135deg, #7c9cff, #ff6d9c); -webkit-background-clip: text; background-clip: text; color: transparent; }
    input[type=file] { margin: 16px 0; width: 100%; color: #8893a8; }
    button { background: linear-gradient(135deg, #7c9cff, #ff6d9c); color: #fff; font-weight: 600; border: none; padding: 12px; width: 100%; border-radius: 8px; cursor: pointer; font-size: 14px; }
    #prg { width: 100%; height: 14px; background: #1a1f2b; border-radius: 7px; overflow: hidden; margin-top: 16px; display: none; border: 1px solid #232938; }
    #bar { width: 0%; height: 100%; background: linear-gradient(90deg, #7c9cff, #46d39a); transition: width 0.1s; }
    a { color: #7c9cff; text-decoration: none; font-size: 13px; display: inline-block; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="box">
    <a href="/">&larr; Back to Ember Studio</a>
    <h2>OTA Firmware Update</h2>
    <p style="font-size:0.9em; color:#8893a8;">Select a compiled <code>firmware.bin</code> file to flash over Wi-Fi.</p>
    <form method='POST' action='/update' enctype='multipart/form-data' id='uploadForm'>
      <input type='file' name='update' id='fileInput' accept='.bin' required>
      <button type='submit' id='subBtn'>Flash Firmware</button>
    </form>
    <div id="prg"><div id="bar"></div></div>
    <p id="msg" style="margin-top:12px; font-size:0.85em; text-align:center; color:#8893a8;"></p>
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
</html>)rawliteral";

// ─── Wi-Fi & OTA ─────────────────────────────────────────────────────────────
static bool mdnsHostnameTaken(const char* name) {
    IPAddress addr = MDNS.queryHost(name, 2000);
    if (!addr) return false;
    if (WiFi.status() == WL_CONNECTED) return addr != WiFi.localIP();
    return addr != WiFi.softAPIP();
}

static void setupMDNS() {
    delay(300);

    if (strcmp(settings.hostname, "ember") == 0 && mdnsHostnameTaken("ember")) {
        uint8_t mac[6];
        WiFi.macAddress(mac);
        snprintf(settings.hostname, sizeof(settings.hostname), "ember-%02x%02x", mac[4], mac[5]);
        Serial.printf("mDNS: ember.local taken, using %s.local\n", settings.hostname);
        saveSettings();
    }

    if (!g_apMode && WiFi.status() == WL_CONNECTED) {
        WiFi.setHostname(settings.hostname);
    }

    if (MDNS.begin(settings.hostname)) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("mDNS: %s.local\n", settings.hostname);
    } else {
        Serial.printf("mDNS: failed to start for %s\n", settings.hostname);
    }

    ArduinoOTA.setHostname(settings.hostname);
    ArduinoOTA.setPort(3232);
    ArduinoOTA.begin();
}

// Channel 0 is rejected by esp_wifi_set_config on this core, so use the
// driver's own soft-AP default (6) instead of the old forced channel 1.
static bool startSoftApOnce(const char* ssid) {
    const IPAddress ip(192, 168, 4, 1);
    WiFi.persistent(false);
    WiFi.mode(WIFI_OFF);
    delay(100);
    WiFi.mode(WIFI_AP);
    delay(100);
    WiFi.setSleep(false);
    esp_wifi_set_ps(WIFI_PS_NONE);
    WiFi.setTxPower(WIFI_POWER_19_5dBm);
    WiFi.softAPConfig(ip, ip, IPAddress(255, 255, 255, 0));
    return WiFi.softAP(ssid, "ember123", 6, 0, 4);
}

static bool bringUpAp(const char* ssid) {
    bool apOk = startSoftApOnce(ssid);
    if (!apOk) {
        Serial.println("AP start failed, retrying");
        apOk = startSoftApOnce(ssid);
    }
    dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));
    Serial.printf("AP up ssid=%s IP=%s ok=%d ch=%d\n",
                  ssid,
                  WiFi.softAPIP().toString().c_str(),
                  (int)apOk,
                  WiFi.channel());
    return apOk;
}

static void setupWiFi() {
    g_apMode = false;

#ifdef EMBER_BATHROOM
    bool credsDirty = false;
    if (strcmp(settings.apSSID, "Ember-Audio") != 0) {
        strlcpy(settings.apSSID, "Ember-Audio", sizeof(settings.apSSID));
        credsDirty = true;
    }
    if (settings.wifiSSID[0] != '\0' || settings.wifiPass[0] != '\0') {
        settings.wifiSSID[0] = '\0';
        settings.wifiPass[0] = '\0';
        credsDirty = true;
    }
    if (credsDirty) saveSettings();
    g_apMode = true;
    bringUpAp("Ember-Audio");
    return;
#else
    if (strlen(settings.apSSID) == 0) {
        uint8_t mac[6];
        WiFi.macAddress(mac);
        snprintf(settings.apSSID, sizeof(settings.apSSID), "Ember-%02X%02X", mac[4], mac[5]);
        saveSettings();
    }

    if (strlen(settings.wifiSSID) > 0 && strcmp(settings.wifiSSID, "Home Wi-Fi") != 0) {
        WiFi.persistent(false);
        WiFi.mode(WIFI_STA);
        WiFi.setHostname(settings.hostname);

        Serial.printf("Connecting to %s (3 attempts max)...\n", settings.wifiSSID);
        for (int attempt = 1; attempt <= 3; attempt++) {
            Serial.printf("Attempt %d...\n", attempt);
            WiFi.begin(settings.wifiSSID, settings.wifiPass);
            unsigned long start = millis();
            while (WiFi.status() != WL_CONNECTED && (millis() - start < 4000)) delay(250);
            if (WiFi.status() == WL_CONNECTED) {
                Serial.print("STA "); Serial.println(WiFi.localIP());
                return;
            }
        }
        Serial.println("Connection failed. Falling back to AP mode.");
    }
    g_apMode = true;
    bringUpAp(settings.apSSID);
#endif
}

static void sendPortalRedirect(AsyncWebServerRequest* request) {
    AsyncWebServerResponse* response = request->beginResponse(302, "text/plain", "");
    response->addHeader("Location", "http://192.168.4.1/");
    response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    response->addHeader("Pragma", "no-cache");
    response->addHeader("Expires", "-1");
    request->send(response);
}

class CaptiveRequestHandler : public AsyncWebHandler {
public:
    CaptiveRequestHandler() {}
    virtual ~CaptiveRequestHandler() {}

    bool canHandle(AsyncWebServerRequest *request) override {
        String host = request->host();
        int colonIndex = host.indexOf(':');
        if (colonIndex != -1) {
            host = host.substring(0, colonIndex);
        }
        if (host != "192.168.4.1" && host != "ember-audio.local" && host != "emberwearable1.local" && host != String(settings.hostname) + ".local") {
            return true;
        }
        return false;
    }

    void handleRequest(AsyncWebServerRequest *request) override {
        sendPortalRedirect(request);
    }
};

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
    // Prevent brief 5V USB rail dips from 500-pixel strip transients from triggering brownout reset
    REG_CLR_BIT(RTC_CNTL_BROWN_OUT_REG, RTC_CNTL_BROWN_OUT_RST_ENA);

    Serial.begin(115200);
    delay(300);
    Serial.printf("Boot reset_reason=%d\n", (int)esp_reset_reason());

    // Hardware setup: MAX4466 Soft GND on GPIO 4, ADC on GPIO 3
    pinMode(4, OUTPUT);
    digitalWrite(4, LOW);
    pinMode(3, INPUT);
    analogReadResolution(12);
    analogSetPinAttenuation(3, ADC_11db);

    g_progMu   = xSemaphoreCreateMutex();
    g_rmtAdcMu = xSemaphoreCreateMutex();

    // Ensure soft ground on GPIO 4 is asserted immediately on boot for MAX4466
    if (settings.micGndPin >= 0 && settings.micGndPin <= 10) {
        pinMode(settings.micGndPin, OUTPUT);
        digitalWrite(settings.micGndPin, LOW);
    }

    if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed");
    if (!LittleFS.exists("/patterns")) LittleFS.mkdir("/patterns");

    loadSettings();

#ifdef EMBER_BATHROOM
    // Ensure Bathroom build defaults apply if an older default settings.json was present
    if (settings.micSource == 0) {
        settings.micSource = 2;
        settings.micADCPin = 3;
        settings.micGndPin = 4;
    }
#endif

    setupWiFi();
    setupMDNS();

    initFastLED();

    // Load active pattern or fallback to default
    bool loadedActive = false;
#ifndef EMBER_BATHROOM
    if (LittleFS.exists("/active.wfl")) {
        File f = LittleFS.open("/active.wfl", "r");
        if (f) {
            String src = f.readString();
            f.close();
            String name = "Untitled";
            if (LittleFS.exists("/active_name.txt")) {
                File fn = LittleFS.open("/active_name.txt", "r");
                if (fn) { name = fn.readString(); fn.close(); }
            }
            String err;
            if (recompile(src, err)) {
                g_currentSource = src;
                g_currentName   = name;
                g_lastError     = "";
                loadedActive = true;
            }
        }
    }
#endif

    if (!loadedActive) {
        const char* defaultSrc = kShowcasePatterns[0].code;
        String err;
        recompile(defaultSrc, err);
        g_currentSource = defaultSrc;
        g_currentName   = kShowcasePatterns[0].name;
        g_lastError     = err;
    }

    ws.onEvent(onWsEvent);
    server.addHandler(&ws);
    if (g_apMode) {
        server.addHandler(new CaptiveRequestHandler());
        const char* probes[] = {
            "/generate_204", "/gen_204", "/hotspot-detect.html",
            "/ncsi.txt", "/connecttest.txt", "/fwlink"
        };
        for (const char* path : probes) {
            server.on(path, HTTP_GET, [](AsyncWebServerRequest* r) { sendPortalRedirect(r); });
        }
    }

    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");

    server.on("/", HTTP_GET, [](AsyncWebServerRequest* r) {
        r->send(LittleFS, "/index.html", "text/html");
    });
    server.on("/demo.json", HTTP_GET, [](AsyncWebServerRequest* r) {
        if (LittleFS.exists("/demo.json"))
            r->send(LittleFS, "/demo.json", "application/json");
        else
            r->send(200, "application/json", "[]");
    });
    server.on("/api/patterns", HTTP_GET, [](AsyncWebServerRequest* r) {
        r->send(200, "application/json", patternListJson());
    });
    server.on("/api/patterns", HTTP_OPTIONS, [](AsyncWebServerRequest* r) {
        r->send(204);
    });
    server.on("/api/discover", HTTP_GET, [](AsyncWebServerRequest* r) {
        JsonDocument doc;
        doc["device"]   = "ember";
        doc["hostname"] = settings.hostname;
        doc["ip"]       = g_apMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
        String out;
        serializeJson(doc, out);
        r->send(200, "application/json", out);
    });
    server.on("/api/discover", HTTP_OPTIONS, [](AsyncWebServerRequest* r) {
        r->send(204);
    });
    server.on("/api/reboot", HTTP_POST, [](AsyncWebServerRequest* r) {
        r->send(200, "text/plain", "rebooting");
        delay(200);
        ESP.restart();
    });
    server.on("/update", HTTP_GET, [](AsyncWebServerRequest* r) {
        r->send_P(200, "text/html", UPDATE_HTML);
    });
    server.on("/update", HTTP_POST,
        [](AsyncWebServerRequest* r) {
            bool ok = !Update.hasError();
            AsyncWebServerResponse* resp = r->beginResponse(200, "text/plain", ok ? "OK" : "FAIL");
            resp->addHeader("Connection", "close");
            r->send(resp);
            delay(250);
            ESP.restart();
        },
        [](AsyncWebServerRequest* r, String filename, size_t index, uint8_t* data, size_t len, bool final) {
            if (!index) {
                Serial.printf("OTA Update Start: %s\n", filename.c_str());
                if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                    Update.printError(Serial);
                }
            }
            if (!Update.hasError()) {
                if (Update.write(data, len) != len) {
                    Update.printError(Serial);
                }
            }
            if (final) {
                if (Update.end(true)) {
                    Serial.printf("OTA Update Success: %uB\n", (unsigned)(index + len));
                } else {
                    Update.printError(Serial);
                }
            }
        }
    );
    server.onNotFound([](AsyncWebServerRequest* r) { r->redirect("/"); });
    server.begin();

    xTaskCreatePinnedToCore(renderTask, "render", 6144, nullptr, 2, nullptr, 0);

    audio::start();

    g_lastCycleMs = millis();
    Serial.printf("Ember-Audio ready (reset_reason=%d)\n", (int)esp_reset_reason());
    Serial.flush();
}

// Broadcast sensor, MAD, & audio gate data to all WS clients at ~6.6Hz (~150ms cadence).
// Uses zero-copy ws.textAll() with compact integer representations to guarantee reliable delivery.
static unsigned long g_lastSensorPush = 0;
static void pushSensors(bool force) {
    if (ws.count() == 0) return;
    unsigned long now = millis();
    if (!force && (now - g_lastSensorPush < 150)) return;
    g_lastSensorPush = now;

    JsonDocument doc;
    doc["type"]       = "sensors";
    doc["fps"]        = (int)roundf(g_fps);
    doc["gate"]       = roundf(g_gateEnvelope * 100.0f) / 100.0f;
    doc["gateActive"] = (bool)g_gateActive;

    if (settings.micSource != 0) {
        audio::Snap s;
        audio::getSnap(s, true);
        doc["vu"]   = roundf(s.vu * 100.0f) / 100.0f;
        doc["mad"]  = (int)roundf(audio::mad());
        JsonArray a = doc["bands"].to<JsonArray>();
        for (int i = 0; i < audio::BAND_COUNT; i++) {
            a.add((int)roundf(s.bands[i] * 100.0f));
        }
    } else {
        doc["mad"] = 0;
    }

    String out;
    serializeJson(doc, out);
    ws.textAll(out);
}

static void serviceAutoCycle(unsigned long now) {
    if (!settings.autoCycle) return;
    // Advance showcase pattern according to configured cycleSeconds
    unsigned long interval = (unsigned long)max(5, settings.cycleSeconds) * 1000UL;
    if (now - g_lastCycleMs >= interval) {
        g_lastCycleMs = now;
        g_showcaseIdx = (g_showcaseIdx + 1) % kShowcaseCount;
        const auto& pat = kShowcasePatterns[g_showcaseIdx];
        String err;
        if (recompile(pat.code, err)) {
            g_currentName   = pat.name;
            g_currentSource = pat.code;
            g_lastError     = "";
            if (ws.count() > 0) {
                JsonDocument resp;
                resp["type"]  = "loaded";
                resp["name"]  = g_currentName;
                resp["code"]  = g_currentSource;
                resp["error"] = "";
                String out; serializeJson(resp, out);
                ws.textAll(out);
            }
        }
    }
}

void loop() {
    unsigned long now = millis();
    dnsServer.processNextRequest();
    ArduinoOTA.handle();
    ws.cleanupClients();
    pushSensors();
    serviceAutoCycle(now);

    if (g_settingsDirty && (now - g_settingsChangedAtMs >= 1200UL)) {
        saveSettings();
    }
    delay(20);
}
