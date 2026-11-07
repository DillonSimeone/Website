/**
 * Localhost PCB Studio Link Injector
 * Automatically injects an "✏️ Edit in PCB Studio" button into `.header-actions`
 * ONLY when running on localhost / 127.0.0.1. Keeps live portfolio showcase pages clean.
 */

export async function mountStudioEditButton(projectId = "03", options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal) return;

  const container = options.container || document.querySelector(".header-actions");
  if (!container || container.querySelector(".btn-open-pcb-studio")) return;

  let studioUrl = `../editor.html?project=${encodeURIComponent(projectId)}`;
  let hasLiveDiskServer = false;

  // 1. Probe same-origin Express Studio server first
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.studio) {
        studioUrl = `/editor.html?project=${encodeURIComponent(projectId)}`;
        hasLiveDiskServer = true;
      }
    }
  } catch {
    // Same-origin is static (e.g. Vite on :5173)
  }

  // 2. If running on Vite (:5173), check if Studio Express server (:3457) is running
  if (!hasLiveDiskServer && window.location.port !== "3457") {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 450);
      const res = await fetch("http://localhost:3457/api/health", {
        cache: "no-store",
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.studio) {
          studioUrl = `http://localhost:3457/editor.html?project=${encodeURIComponent(projectId)}`;
          hasLiveDiskServer = true;
        }
      }
    } catch {
      // Studio server not started yet; fallback link opens editor.html in static/download mode
    }
  }

  const link = document.createElement("a");
  link.href = studioUrl;
  link.className = "btn btn-open-pcb-studio";
  link.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "text-decoration:none",
    "background:linear-gradient(135deg,#f59e0b,#ea580c)",
    "color:#090a0f",
    "font-weight:700",
    "border:1px solid #fbbf24",
    "box-shadow:0 0 12px rgba(245,158,11,0.3)"
  ].join(";");
  link.title = hasLiveDiskServer
    ? "Open interactive PCB & Silkscreen Studio Workbench (Live Disk Save Active)"
    : "Open PCB & Silkscreen Studio (Run `npm run studio` or LaunchStudio.bat for 1-click disk save)";
  link.textContent = "✏️ Edit in PCB Studio";

  container.prepend(link);
}
