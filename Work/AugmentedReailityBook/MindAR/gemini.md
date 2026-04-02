# Ford Pines Scanner AR | Professionalized v9.5 (Hardened)

This project is a high-performance, production-hardened AR scanner interface inspired by Ford Pines (Gravity Falls). It combines **MindAR** and **Three.js** with a secure, optimized deployment pipeline.

## 🛠️ Production Ready Pipeline
The project uses a hybrid **Development/Production** architecture to balance debugging with speed.

- **Development**: `npm start`
    - Serves the unminified `app/javascript` and `app/style` source folders.
    - Uses local `three.module.js` for zero-latency testing.
- **Production Build**: `npm run build`
    - **Hardening**: Automatically ignores all source folders. Only minified bundles exist in `dist/`.
    - **Source Maps**: Disabled in production to prevent reverse-engineering of scanner logic.

## 🚀 Performance & Scale (1M+ Users)
We have optimized the project to support high-scale viral launches (targeting 1,000,000+ users).

- **CDN-First Architecture**: 
    - Moved Three.js (1.1MB) to the **jsDelivr CDN**.
    - **Result**: Reduced the bundle size from **1.5MB to 43KB**.
    - **Savings**: 1 million visitors generate only ~200GB of traffic (saving ~$500/mo in bandwidth costs).
- **Hosting Recommendation**: 
    - **Cloudflare Pages** is the target platform for 1M+ users due to its "Unlimited" free egress bandwidth.

## 📱 iOS Safari Stability
Specific "Hardness" fixes have been implemented for Apple device parity:

- **Gesture Chain Logic**: Flattened the `async` chain in `app.js` to ensure the camera request stays within Safari's "User Gesture" window.
- **Watchdog Timer (8s)**: If the scanner hangs during camera/WASM initialization, it manually triggers a `TIME_OUT_STARTUP` error to the telemetry dashboard.
- **Audio Unlock**: Explicitly resumes the `AudioContext` on first tap to prevent silent audio blocking.

## 📡 Enhanced Telemetry
We use a "High-Resolution" diagnostic system sent to the Google Form:

- **Logging Sequence**: `ENG_START` → `AUDIO_READY` → `CAM_REQUEST` → `CAM_ACTIVE` → `ENG_SUCCESS`.
- **Diagnostic Power**: We can now pinpoint exactly where a user's session failed by looking at which milestone was the last one received in the spreadsheet.

## 📂 Project Structure
- `/.eleventy.js` — Conditional 11ty config (Dev/Prod hotswap).
- `/esbuild.config.js` — Minification, obfuscation, and CDN exclusion rules.
- `/app/` — Source context (HTML, JS, CSS, Assets).
- `/dist/` — **The only folder needed for hosting.** (Hardened output).

---
*Scanner S/N: 06182012-G // Ref: F.P. // System Secured (v9.5).*