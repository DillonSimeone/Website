// Pixelblaze Lite — ESP32-C3 firmware
// Stack-based bytecode VM, atomic program swap, FreeRTOS task isolation.
// See ARCHITECTURE.md for the design rationale.

#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <AsyncWebSocket.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include <arduinoFFT.h>
#include <driver/i2s.h>
#include <atomic>
#include <vector>
#include <cstring>
#include <cmath>

// ─── Settings ────────────────────────────────────────────────────────────────
//
// MicSource values:
//   0 = off (no audio, saves CPU)
//   1 = INMP441 (I2S, digital, 24-bit MEMS)
//   2 = MAX4466 (analog, ADC1 channel, GPIO 0–4 only on ESP32-C3)
//
struct Settings {
    int   pixelPin    = 4;
    int   pixelCount  = 30;
    int   brightness  = 128;
    char  hostname[32] = "pblite";
    char  wifiSSID[64] = "";
    char  wifiPass[64] = "";

    // Audio
    int   micSource   = 0;          // 0=off, 1=INMP441, 2=MAX4466
    int   micBCLK     = 6;          // INMP441 SCK
    int   micWS       = 7;          // INMP441 WS  (LRCK)
    int   micData     = 5;          // INMP441 SD
    int   micADCPin   = 3;          // MAX4466 OUT → ADC1_CHx (must be GPIO 0-4)
    float micGain     = 1.0f;       // Output multiplier on level/bands
    float micSmoothing= 0.6f;       // EMA factor (0=no smoothing, 0.95=very smooth)
} settings;

// ─── Globals ─────────────────────────────────────────────────────────────────
AsyncWebServer  server(80);
AsyncWebSocket  ws("/ws");
CRGB*           leds = nullptr;
volatile float  g_fps = 0.0f;
String          g_currentName = "Untitled";
String          g_currentSource;
String          g_lastError;

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
    // Audio — values are 0..1 unless noted.
    {"vu",         FN_VU,         0, 0},   // overall RMS level
    {"peak",       FN_PEAK,       0, 0},   // peak level with slow decay
    {"pitch",      FN_PITCH,      0, 0},   // dominant freq normalized (0=low, 1=high)
    {"beat",       FN_BEAT,       0, 0},   // 1 on beat, decays toward 0
    {"band",       FN_BAND,       1, 1},   // band(n), n=0..7 (low..high)
    {"bass",       FN_BASS,       0, 0},   // shortcut: avg of bands 0-1
    {"mid",        FN_MID,        0, 0},   // shortcut: avg of bands 3-4
    {"treble",     FN_TREBLE,     0, 0},   // shortcut: avg of bands 6-7
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

    void parseStatement() {
        // Optional leading semicolons.
        while (cur.type == TK_SEMI) advance();
        if (cur.type == TK_EOF) return;

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
// One FreeRTOS task at prio 3 owns the mic. It samples a window, runs an FFT,
// extracts an RMS level, dominant pitch, and 8 logarithmic bands, and writes
// them into `g_snap` (a plain struct guarded by `g_snapMu`).
//
// VM builtins (audio::vu/peak/pitch/beat/band) read `g_snap` under the mutex.
// Readers are short and non-blocking; the mutex is uncontended in practice.
//
// Sample rate, FFT size, and band layout are compile-time constants — they
// determine memory + CPU and aren't useful to expose to users.
//
namespace audio {

constexpr int   SAMPLE_RATE  = 16000;
constexpr int   FFT_N        = 256;
constexpr int   BAND_COUNT   = 8;
constexpr float DC_BLOCK     = 0.997f;   // HPF to kill DC offset from MAX4466

// Band edges as FFT bin indices. With 16 kHz / 256 = 62.5 Hz/bin, this gives:
//   0: 62-187 Hz, 1: 187-375, 2: 375-687, 3: 687-1250,
//   4: 1250-2375, 5: 2375-4500, 6: 4500-7500, 7: 7500-8000
static const uint8_t kBandEdge[BAND_COUNT + 1] =
    { 1, 3, 6, 11, 20, 38, 72, 120, 128 };

struct Snap {
    float vu    = 0.0f;
    float peak  = 0.0f;
    float pitch = 0.0f;
    float beat  = 0.0f;
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
float band(int n) {
    if (n < 0) n = 0; if (n >= BAND_COUNT) n = BAND_COUNT - 1;
    float v; portENTER_CRITICAL(&g_snapMu); v = g_snap.bands[n]; portEXIT_CRITICAL(&g_snapMu); return v;
}

void getSnap(Snap& dst) {
    portENTER_CRITICAL(&g_snapMu);
    dst = g_snap;
    portEXIT_CRITICAL(&g_snapMu);
}

// ── Mic source setup ──
//
// INMP441: I2S0 in RX master mode. The chip outputs 24 bits MSB-first in a
// 32-bit slot — we read 32-bit samples and shift right by 8.
//
// MAX4466: ADC1 channel (GPIO 0-4 on C3). analogRead() in a tight loop is
// fine for our 16 kHz target — measured ~25 µs/call on C3, well under the
// 62.5 µs sample period.
//
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

// ESP32-C3 ADC1 channels are wired to GPIO 0–4. analogRead() takes the GPIO
// directly so we just need to validate, not translate to a channel index.
static bool isADC1Gpio(int gpio) { return gpio >= 0 && gpio <= 4; }

// ── Sampling ──
static int32_t i2sBuf[FFT_N];

static bool sampleI2S(float* out, float& dcState) {
    size_t bytesRead = 0;
    if (i2s_read(I2S_NUM_0, i2sBuf, sizeof(i2sBuf), &bytesRead, pdMS_TO_TICKS(50)) != ESP_OK)
        return false;
    int n = bytesRead / sizeof(int32_t);
    if (n <= 0) return false;
    // 24-bit data is in the upper 24 bits of the 32-bit slot.
    for (int i = 0; i < FFT_N; i++) {
        float s = (float)(i2sBuf[i % n] >> 8);   // -2^23..2^23
        // DC-block (1st-order HPF).
        float x = s - dcState;
        dcState = dcState + (1.0f - DC_BLOCK) * x;
        out[i] = x * (1.0f / 8388608.0f);        // → ~[-1, 1]
    }
    return true;
}

static bool sampleADC(float* out, float& dcState) {
    // Target sample period (µs).
    const uint32_t periodUs = 1000000 / SAMPLE_RATE;
    uint32_t next = micros();
    for (int i = 0; i < FFT_N; i++) {
        // 12-bit ADC, 0..4095, mid ≈ 2048.
        int v = analogRead(settings.micADCPin);
        float x = (float)v - dcState;
        dcState = dcState + (1.0f - DC_BLOCK) * x;
        out[i] = x * (1.0f / 2048.0f);
        next += periodUs;
        int32_t wait = (int32_t)(next - micros());
        if (wait > 0 && wait < (int32_t)periodUs * 4) delayMicroseconds(wait);
    }
    return true;
}

// ── Task ──
static float vReal[FFT_N];
static float vImag[FFT_N];
static ArduinoFFT<float> g_fft(vReal, vImag, FFT_N, (float)SAMPLE_RATE);

static void audioTask(void*) {
    float dcState = 0.0f;
    // Per-band EMA state for smoothing.
    float bandsSmoothed[BAND_COUNT] = {0};
    float vuSmoothed = 0.0f;
    float peakLevel  = 0.0f;
    float beatLevel  = 0.0f;
    float prevVU     = 0.0f;

    g_audioRunning = true;
    Serial.printf("audio: source=%d running\n", settings.micSource);

    while (g_audioRunning) {
        // Fill vReal with one window.
        bool ok = false;
        if (settings.micSource == 1)      ok = sampleI2S(vReal, dcState);
        else if (settings.micSource == 2) ok = sampleADC(vReal, dcState);
        if (!ok) { vTaskDelay(pdMS_TO_TICKS(50)); continue; }

        // FFT setup: imag = 0, then window/compute/magnitudes.
        memset(vImag, 0, sizeof(vImag));
        g_fft.windowing(FFTWindow::Hamming, FFTDirection::Forward);
        g_fft.compute(FFTDirection::Forward);
        g_fft.complexToMagnitude();

        // Bands: average magnitudes within each [edge, edge+1) range.
        // Apply gain, log-shape so quiet sounds still register, smooth.
        float bandsNew[BAND_COUNT];
        float bandSum = 0;
        int   bandPeakIdx = 0;
        float bandPeak    = 0;
        for (int b = 0; b < BAND_COUNT; b++) {
            int  a = kBandEdge[b], z = kBandEdge[b+1];
            float sum = 0;
            for (int k = a; k < z; k++) sum += vReal[k];
            float mag = sum / (float)(z - a);
            // Log-shape: log(1 + mag*k) gives a perceptually-flat-ish response.
            float shaped = log1pf(mag * 0.02f) * settings.micGain;
            // Soft-clip to 0..1.
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
        vuSmoothed = vuSmoothed * a + vuNew * oneMinusA;

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
        for (int b = 0; b < BAND_COUNT; b++) g_snap.bands[b] = bandsSmoothed[b];
        portEXIT_CRITICAL(&g_snapMu);
    }

    // Drain mic resources on exit.
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
        analogReadResolution(12);
        analogSetPinAttenuation(settings.micADCPin, ADC_11db);
    }

    xTaskCreatePinnedToCore(audioTask, "audio", 6144, nullptr, 3, &g_audioTaskHandle, 0);
}

} // namespace audio

// ─── Live program (atomic swap) ──────────────────────────────────────────────
std::atomic<vm::Program*> g_program{nullptr};

static void installProgram(vm::Program* p) {
    vm::Program* old = g_program.exchange(p, std::memory_order_acq_rel);
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

// ─── LED render task ─────────────────────────────────────────────────────────
static void renderTask(void*) {
    const TickType_t period = pdMS_TO_TICKS(16);  // ~60 Hz target
    TickType_t       last   = xTaskGetTickCount();
    uint32_t         frameCounter = 0;
    uint32_t         lastFpsTick  = millis();
    float            vars[vm::MAX_VARS];

    for (;;) {
        vTaskDelayUntil(&last, period);
        if (!leds) continue;

        vm::Program* p = g_program.load(std::memory_order_acquire);
        uint32_t now = millis();
        float t = now / 1000.0f;
        int n = settings.pixelCount;

        // Initialise the reserved variable slots.
        memset(vars, 0, sizeof(vars));
        vars[vm::VAR_N]          = (float)n;
        vars[vm::VAR_PIXELCOUNT] = (float)n;
        vars[vm::VAR_T]          = t;
        vars[vm::VAR_TIME]       = t;
        vars[vm::VAR_PI]         = (float)M_PI;
        vars[vm::VAR_TAU]        = (float)(2.0 * M_PI);

        if (p) {
            for (int i = 0; i < n; i++) {
                vars[vm::VAR_I]     = (float)i;
                vars[vm::VAR_INDEX] = (float)i;
                vm::RunResult r;
                if (vm::exec(p, vars, r)) {
                    if (r.useRGB) {
                        leds[i] = CRGB(
                            (uint8_t)constrain(r.r * 255.0f, 0.0f, 255.0f),
                            (uint8_t)constrain(r.g * 255.0f, 0.0f, 255.0f),
                            (uint8_t)constrain(r.b * 255.0f, 0.0f, 255.0f));
                    } else {
                        float hh = r.h - floorf(r.h);
                        if (hh < 0) hh += 1.0f;
                        leds[i] = CHSV(
                            (uint8_t)(hh * 255.0f),
                            (uint8_t)constrain(r.s * 255.0f, 0.0f, 255.0f),
                            (uint8_t)constrain(r.v * 255.0f, 0.0f, 255.0f));
                    }
                } else {
                    leds[i] = CRGB::Black;
                }
            }
        } else {
            fill_solid(leds, n, CRGB::Black);
        }

        FastLED.show();

        frameCounter++;
        if (now - lastFpsTick >= 1000) {
            g_fps = (float)frameCounter * 1000.0f / (now - lastFpsTick);
            frameCounter = 0;
            lastFpsTick = now;
        }
    }
}

// ─── FastLED init ────────────────────────────────────────────────────────────
//
// FastLED's pin is a compile-time template parameter, so a runtime switch is
// the standard way to support changing pins without recompiling. We dispatch
// over the ESP32-C3's user-accessible GPIOs (0–10). Strapping pins (8, 9) and
// USB-CDC pins (18, 19) are deliberately excluded from the UI dropdown but
// remain selectable here for completeness.
//
// initFastLED is only safe to call ONCE per boot — re-adding controllers
// leaks the previous pin. Changing pin or count requires a reboot (handled
// by the WS "pin" / "count" actions).
static void initFastLED() {
    if (leds) { delete[] leds; leds = nullptr; }
    leds = new CRGB[settings.pixelCount];
    switch (settings.pixelPin) {
        case 0:  FastLED.addLeds<WS2812B, 0,  GRB>(leds, settings.pixelCount); break;
        case 1:  FastLED.addLeds<WS2812B, 1,  GRB>(leds, settings.pixelCount); break;
        case 2:  FastLED.addLeds<WS2812B, 2,  GRB>(leds, settings.pixelCount); break;
        case 3:  FastLED.addLeds<WS2812B, 3,  GRB>(leds, settings.pixelCount); break;
        case 4:  FastLED.addLeds<WS2812B, 4,  GRB>(leds, settings.pixelCount); break;
        case 5:  FastLED.addLeds<WS2812B, 5,  GRB>(leds, settings.pixelCount); break;
        case 6:  FastLED.addLeds<WS2812B, 6,  GRB>(leds, settings.pixelCount); break;
        case 7:  FastLED.addLeds<WS2812B, 7,  GRB>(leds, settings.pixelCount); break;
        case 8:  FastLED.addLeds<WS2812B, 8,  GRB>(leds, settings.pixelCount); break;
        case 9:  FastLED.addLeds<WS2812B, 9,  GRB>(leds, settings.pixelCount); break;
        case 10: FastLED.addLeds<WS2812B, 10, GRB>(leds, settings.pixelCount); break;
        default: FastLED.addLeds<WS2812B, 4,  GRB>(leds, settings.pixelCount); break;
    }
    FastLED.setBrightness(settings.brightness);
    fill_solid(leds, settings.pixelCount, CRGB::Black);
    FastLED.show();
}

// ─── Persistence ─────────────────────────────────────────────────────────────
static void loadSettings() {
    if (!LittleFS.exists("/settings.json")) return;
    File f = LittleFS.open("/settings.json", "r");
    JsonDocument doc;
    if (deserializeJson(doc, f) == DeserializationError::Ok) {
        settings.pixelPin   = doc["pin"]        | settings.pixelPin;
        settings.pixelCount = doc["count"]      | settings.pixelCount;
        settings.brightness = doc["brightness"] | settings.brightness;
        strlcpy(settings.hostname, doc["hostname"] | settings.hostname, sizeof(settings.hostname));
        strlcpy(settings.wifiSSID, doc["ssid"]     | settings.wifiSSID, sizeof(settings.wifiSSID));
        strlcpy(settings.wifiPass, doc["pass"]     | settings.wifiPass, sizeof(settings.wifiPass));
        settings.micSource    = doc["micSrc"]    | settings.micSource;
        settings.micBCLK      = doc["micBCLK"]   | settings.micBCLK;
        settings.micWS        = doc["micWS"]     | settings.micWS;
        settings.micData      = doc["micData"]   | settings.micData;
        settings.micADCPin    = doc["micADC"]    | settings.micADCPin;
        settings.micGain      = doc["micGain"]   | settings.micGain;
        settings.micSmoothing = doc["micSmooth"] | settings.micSmoothing;
    }
    f.close();
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
    doc["micSrc"]     = settings.micSource;
    doc["micBCLK"]    = settings.micBCLK;
    doc["micWS"]      = settings.micWS;
    doc["micData"]    = settings.micData;
    doc["micADC"]     = settings.micADCPin;
    doc["micGain"]    = settings.micGain;
    doc["micSmooth"]  = settings.micSmoothing;
    serializeJson(doc, f);
    f.close();
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
static void sendStatus(AsyncWebSocketClient* c, const String& err) {
    JsonDocument resp;
    resp["type"]    = "status";
    resp["name"]    = g_currentName;
    resp["fps"]     = (float)g_fps;
    resp["count"]    = settings.pixelCount;
    resp["pin"]      = settings.pixelPin;
    resp["bright"]   = settings.brightness;
    resp["error"]    = err;
    resp["micSrc"]   = settings.micSource;
    resp["micBCLK"]  = settings.micBCLK;
    resp["micWS"]    = settings.micWS;
    resp["micData"]  = settings.micData;
    resp["micADC"]   = settings.micADCPin;
    resp["micGain"]  = settings.micGain;
    resp["micSmooth"]= settings.micSmoothing;
    String out; serializeJson(resp, out);
    if (c) c->text(out); else ws.textAll(out);
}

static void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient* client,
                      AwsEventType type, void*, uint8_t* data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        sendStatus(client, g_lastError);
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
        ws.textAll(String("{\"type\":\"patterns\",\"list\":") + patternListJson() + "}");
    }
    else if (action == "load") {
        String name = doc["name"] | "";
        loadPattern(name);
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
        settings.brightness = doc["value"] | 128;
        FastLED.setBrightness(settings.brightness);
        saveSettings();
        sendStatus(nullptr, g_lastError);
    }
    else if (action == "count") {
        int n = doc["value"] | 30;
        n = constrain(n, 1, 600);
        if (n != settings.pixelCount) {
            settings.pixelCount = n;
            saveSettings();
            // Pixel-count changes need a reboot so FastLED rebuilds its
            // controller list cleanly.
            client->text("{\"type\":\"reboot\"}");
            delay(150);
            ESP.restart();
        }
    }
    else if (action == "pin") {
        int p = doc["value"] | 4;
        // Allow only the GPIOs we have switch cases for.
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
        // Setting the mic source means tearing down or installing I2S/ADC —
        // safest to apply with a reboot, same pattern as pixelPin / pixelCount.
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
        // Atomic update of mic pin set + reboot.
        bool dirty = false;
        if (doc["bclk"].is<int>()) { settings.micBCLK   = doc["bclk"];  dirty = true; }
        if (doc["ws"]  .is<int>()) { settings.micWS     = doc["ws"];    dirty = true; }
        if (doc["data"].is<int>()) { settings.micData   = doc["data"];  dirty = true; }
        if (doc["adc"] .is<int>()) { settings.micADCPin = doc["adc"];   dirty = true; }
        if (dirty) {
            saveSettings();
            client->text("{\"type\":\"reboot\"}");
            delay(150);
            ESP.restart();
        }
    }
    else if (action == "micGain") {
        // Hot-applied — no reboot needed.
        float g = doc["value"] | 1.0f;
        if (g < 0.0f)  g = 0.0f;
        if (g > 10.0f) g = 10.0f;
        settings.micGain = g;
        saveSettings();
        sendStatus(nullptr, g_lastError);
    }
    else if (action == "micSmooth") {
        float s = doc["value"] | 0.6f;
        if (s < 0.0f)  s = 0.0f;
        if (s > 0.95f) s = 0.95f;
        settings.micSmoothing = s;
        saveSettings();
        sendStatus(nullptr, g_lastError);
    }
    else if (action == "ping") {
        sendStatus(client, g_lastError);
    }
}

// ─── Wi-Fi ───────────────────────────────────────────────────────────────────
static void setupWiFi() {
    if (strlen(settings.wifiSSID) > 0) {
        WiFi.mode(WIFI_STA);
        WiFi.setHostname(settings.hostname);
        WiFi.begin(settings.wifiSSID, settings.wifiPass);
        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) delay(250);
        if (WiFi.status() == WL_CONNECTED) {
            Serial.print("STA "); Serial.println(WiFi.localIP());
            return;
        }
    }
    WiFi.mode(WIFI_AP);
    WiFi.softAP(settings.hostname, "pixelblaze");
    Serial.print("AP "); Serial.println(WiFi.softAPIP());
}

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(300);

    if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed");
    if (!LittleFS.exists("/patterns")) LittleFS.mkdir("/patterns");

    loadSettings();
    setupWiFi();

    if (MDNS.begin(settings.hostname)) Serial.printf("mDNS: %s.local\n", settings.hostname);

    initFastLED();

    // Default pattern — installs a valid Program immediately so the render
    // task has something to run from frame 1.
    {
        const char* defaultSrc =
            "h = i/n + t*0.2;\n"
            "hsv(h, 1, 1)\n";
        String err;
        recompile(defaultSrc, err);
        g_currentSource = defaultSrc;
        g_currentName   = "Rainbow";
        g_lastError     = err;
    }

    ws.onEvent(onWsEvent);
    server.addHandler(&ws);

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
    server.on("/api/reboot", HTTP_POST, [](AsyncWebServerRequest* r) {
        r->send(200, "text/plain", "rebooting");
        delay(200);
        ESP.restart();
    });
    server.onNotFound([](AsyncWebServerRequest* r) { r->send(404); });
    server.begin();

    // Render task: priority 2, pinned to the only core (0 on C3).
    // AsyncTCP runs at priority 3 by default and therefore preempts us — which
    // is exactly what we want for sub-millisecond WebSocket response.
    xTaskCreatePinnedToCore(renderTask, "render", 4096, nullptr, 2, nullptr, 0);

    // Audio: starts only if a mic source is configured.
    audio::start();

    Serial.println("Pixelblaze Lite ready");
}

// Broadcast an audio snapshot to all WS clients at ~20Hz when audio is active.
// Tiny payload (~150 B), drives the live VU + band visualizer in the UI.
static unsigned long g_lastAudioPush = 0;
static void pushAudio() {
    if (settings.micSource == 0) return;
    if (ws.count() == 0) return;
    unsigned long now = millis();
    if (now - g_lastAudioPush < 50) return;
    g_lastAudioPush = now;

    audio::Snap s;
    audio::getSnap(s);

    JsonDocument doc;
    doc["type"]  = "audio";
    doc["vu"]    = s.vu;
    doc["peak"]  = s.peak;
    doc["pitch"] = s.pitch;
    doc["beat"]  = s.beat;
    JsonArray a = doc["bands"].to<JsonArray>();
    for (int i = 0; i < audio::BAND_COUNT; i++) a.add(s.bands[i]);

    String out;
    serializeJson(doc, out);
    ws.textAll(out);
}

void loop() {
    ws.cleanupClients();
    pushAudio();
    delay(20);
}
