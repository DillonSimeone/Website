#!/usr/bin/env node

/**
 * ============================================================================
 * Parametric PCB & Silkscreen Studio — Local Express Co-Design Server
 * ============================================================================
 * Serves `public/ParametricPCB/` statically on http://localhost:3457 and
 * exposes local filesystem APIs so you and AI agents can drag components,
 * nudge silkscreen & polarity markers, measure clearances, save directly to
 * `<project>/src/layout.json`, and publish turnkey JLCPCB fab packages in 1 click.
 *
 * Usage:
 *   npm run studio
 *   node shared/studio-server.mjs [--port=3457]
 * ============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { PROJECT_CONFIGS, exportProjectArtifacts } from "./export-stl.mjs";
import { runSilkscreenDrc } from "./silkscreen-drc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUITE_ROOT = path.resolve(__dirname, "..");

const PROJECTS = [
  {
    id: "03",
    slug: "03-compactAudioMotionSquarePCB",
    title: "03: Compact Square Reactive PCB (38×38mm)",
    filePrefix: "03_compactSquare",
    defaultWidth: 38,
    defaultLength: 38
  },
  {
    id: "00",
    slug: "00-starterPCB",
    title: "00: Turnkey Starter PCB Template (40×40mm)",
    filePrefix: "00_starter",
    defaultWidth: 40,
    defaultLength: 40
  },
  {
    id: "02",
    slug: "02-audioMotionReactiveLedHapticPCB",
    title: "02: Baton Carrier Reactive PCB (20×120mm)",
    filePrefix: "02_audioMotionBaton",
    defaultWidth: 20,
    defaultLength: 120
  },
  {
    id: "04",
    slug: "04-smdAudioMotionBatonPCB",
    title: "04: All-SMD Turnkey Baton PCB (22×110mm)",
    filePrefix: "04_smdAudioMotionBaton",
    defaultWidth: 22,
    defaultLength: 110
  }
];

function resolveProject(idOrSlug) {
  const q = String(idOrSlug || "").trim();
  return PROJECTS.find(p => p.id === q || p.slug === q || p.slug.startsWith(`${q}-`)) || null;
}

function getLayoutPath(proj) {
  return path.join(SUITE_ROOT, proj.slug, "src", "layout.json");
}

export function createStudioApp() {
  const app = express();

  // Parse JSON payloads up to 5MB
  app.use(express.json({ limit: "5mb" }));

  // Allow localhost cross-port requests (e.g. Vite dev server :5173 <-> Studio :3457)
  app.use((req, res, next) => {
    const origin = req.headers.origin || "";
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // 1. Health Check
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      studio: true,
      version: 1,
      suiteRoot: SUITE_ROOT
    });
  });

  // 2. List Projects & layout.json Status
  app.get("/api/projects", (_req, res) => {
    const list = PROJECTS.map(p => {
      const layoutPath = getLayoutPath(p);
      const hasLayoutJson = fs.existsSync(layoutPath);
      return {
        ...p,
        hasLayoutJson,
        moduleUrl: `./${p.slug}/src/circuit.js`,
        layoutUrl: `./${p.slug}/src/layout.json`,
        showcaseUrl: `./${p.slug}/index.html`
      };
    });
    res.json({ ok: true, projects: list });
  });

  // 3. Load layout.json from Disk (Uncached)
  app.get("/api/layout/:id", (req, res) => {
    const proj = resolveProject(req.params.id);
    if (!proj) {
      return res.status(404).json({ ok: false, error: `Unknown project ID: ${req.params.id}` });
    }
    const layoutPath = getLayoutPath(proj);
    if (!fs.existsSync(layoutPath)) {
      return res.json({ ok: true, exists: false, project: proj, layout: null });
    }
    try {
      const raw = fs.readFileSync(layoutPath, "utf8");
      const layout = JSON.parse(raw);
      return res.json({
        ok: true,
        exists: true,
        project: proj,
        relativePath: `${proj.slug}/src/layout.json`,
        layout
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: `Failed to parse layout.json: ${err.message}` });
    }
  });

  // 4. Save layout.json Directly to Disk (<10ms)
  app.post("/api/save-layout", (req, res) => {
    const { projectId, layout } = req.body || {};
    const proj = resolveProject(projectId);
    if (!proj) {
      return res.status(400).json({ ok: false, error: `Invalid or unknown projectId: ${projectId}` });
    }
    if (!layout || typeof layout !== "object") {
      return res.status(400).json({ ok: false, error: "Missing valid `layout` JSON object in request body." });
    }

    try {
      const layoutPath = getLayoutPath(proj);
      fs.mkdirSync(path.dirname(layoutPath), { recursive: true });
      const formatted = JSON.stringify(layout, null, 2) + "\n";
      const tmpPath = `${layoutPath}.tmp`;
      fs.writeFileSync(tmpPath, formatted, "utf8");
      fs.renameSync(tmpPath, layoutPath);

      console.log(`💾 [Studio] Saved ${proj.slug}/src/layout.json (${formatted.length} bytes)`);
      return res.json({
        ok: true,
        relativePath: `${proj.slug}/src/layout.json`,
        bytes: formatted.length,
        savedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("❌ [Studio] Save error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 5. 1-Click Publish Fab Package (Saves layout -> Compiles -> Audits DRC -> Writes Gerbers/BOM/CPL/STL)
  app.post("/api/publish-artifacts", async (req, res) => {
    const t0 = performance.now();
    const { projectId, layout } = req.body || {};
    const proj = resolveProject(projectId);
    if (!proj) {
      return res.status(400).json({ ok: false, error: `Invalid or unknown projectId: ${projectId}` });
    }

    try {
      // Save latest layout.json first if supplied
      if (layout && typeof layout === "object") {
        const layoutPath = getLayoutPath(proj);
        fs.mkdirSync(path.dirname(layoutPath), { recursive: true });
        fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2) + "\n", "utf8");
      }

      const baseCfg = PROJECT_CONFIGS.find(c => c.id === proj.id);
      if (!baseCfg) {
        return res.status(404).json({ ok: false, error: `Export config not found for project ${proj.id}` });
      }

      const activeWidth = Number(layout?.board?.width) || baseCfg.compileArgs.boardWidth;
      const activeLength = Number(layout?.board?.length) || baseCfg.compileArgs.boardLength;

      const exportCfg = {
        ...baseCfg,
        compileArgs: {
          ...baseCfg.compileArgs,
          boardWidth: activeWidth,
          boardLength: activeLength,
          skipRouting: false
        }
      };

      const exportRes = await exportProjectArtifacts(exportCfg);

      // Run fresh Silkscreen DRC verification against the compiled circuit
      const circuitPath = path.join(SUITE_ROOT, proj.slug, "src", "circuit.js");
      const mod = await import(pathToFileURL(circuitPath).href);
      const circuit = await mod.compileCircuit({
        boardWidth: activeWidth,
        boardLength: activeLength,
        skipRouting: true
      });
      const circuitJson = circuit.getCircuitJson();
      const diskLayoutPath = getLayoutPath(proj);
      const diskLayout = fs.existsSync(diskLayoutPath)
        ? JSON.parse(fs.readFileSync(diskLayoutPath, "utf8"))
        : layout || null;
      const silkscreenDrc = runSilkscreenDrc(circuitJson, {
        boardWidth: activeWidth,
        boardHeight: activeLength,
        layout: diskLayout
      });

      const elapsedMs = Math.round(performance.now() - t0);
      console.log(`📦 [Studio] Published ${exportRes.writtenFiles.join(", ")} for ${proj.slug} in ${elapsedMs}ms`);

      return res.json({
        ok: true,
        project: proj.slug,
        writtenFiles: exportRes.writtenFiles,
        stlSize: exportRes.stlSize,
        drc: exportRes.drc,
        silkscreenDrc: {
          ok: silkscreenDrc.ok,
          errorCount: silkscreenDrc.errors.length,
          warningCount: silkscreenDrc.warnings.length,
          errors: silkscreenDrc.errors,
          warnings: silkscreenDrc.warnings
        },
        elapsedMs
      });
    } catch (err) {
      console.error("❌ [Studio] Publish error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Static file serving with no-cache headers on JS/JSON/HTML/CSS for live co-editing
  const staticOpts = {
    etag: false,
    setHeaders(res, filePath) {
      if (/\.(json|js|mjs|html|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      }
    }
  };
  app.use(express.static(SUITE_ROOT, staticOpts));
  app.use("/ParametricPCB", express.static(SUITE_ROOT, staticOpts));

  return app;
}

// CLI Entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const portArg = process.argv.find(a => a.startsWith("--port="));
  const port = Number(portArg ? portArg.split("=")[1] : (process.env.PORT || 3457));
  const app = createStudioApp();

  app.listen(port, "127.0.0.1", () => {
    console.log(`\n================================================================`);
    console.log(` ✏️  Parametric PCB & Silkscreen Studio Workbench Running!`);
    console.log(`================================================================`);
    console.log(` • Studio Editor (PCB 03): http://localhost:${port}/editor.html?project=03`);
    console.log(` • Studio Editor (PCB 00): http://localhost:${port}/editor.html?project=00`);
    console.log(` • Showcase Suite Index:   http://localhost:${port}/index.html`);
    console.log(`================================================================\n`);
  });
}
