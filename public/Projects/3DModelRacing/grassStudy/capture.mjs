/**
 * capture.mjs — Headless Chrome Grass Capture Script
 * 
 * Usage:
 *   node capture.mjs                          # Capture with default params
 *   node capture.mjs --preset grassworks      # Apply named preset
 *   node capture.mjs --width 0.04 --height 0.9 --cell 0.40 --blades 8
 *   node capture.mjs --compare                # Side-by-side with reference
 * 
 * Output: results/grass_<timestamp>.webp
 */

import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'results');

// ═══════════════════════════════════════════════════════
// Simple static file server
// ═══════════════════════════════════════════════════════
function startServer(root, port) {
    return new Promise(resolve => {
        const mimeTypes = {
            '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
            '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
            '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'
        };
        const server = createServer(async (req, res) => {
            let filePath = join(root, req.url === '/' ? '/index.html' : req.url);
            const ext = '.' + filePath.split('.').pop();
            try {
                const data = await readFile(filePath);
                res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
                res.end(data);
            } catch {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        server.listen(port, () => {
            console.log(`  📡 Static server on http://localhost:${port}`);
            resolve(server);
        });
    });
}

// ═══════════════════════════════════════════════════════
// Parse CLI args
// ═══════════════════════════════════════════════════════
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--preset') opts.preset = args[++i];
        else if (args[i] === '--width') opts.bladeWidth = parseFloat(args[++i]);
        else if (args[i] === '--height') opts.bladeHeight = parseFloat(args[++i]);
        else if (args[i] === '--cell') opts.cellSize = parseFloat(args[++i]);
        else if (args[i] === '--blades') opts.bladesPerTuft = parseInt(args[++i]);
        else if (args[i] === '--lean-min') opts.leanMin = parseFloat(args[++i]);
        else if (args[i] === '--lean-max') opts.leanMax = parseFloat(args[++i]);
        else if (args[i] === '--segments') opts.segments = parseInt(args[++i]);
        else if (args[i] === '--compare') opts.compare = true;
        else if (args[i] === '--help') {
            console.log(`
Grass Study Lab — Headless Capture

Options:
  --preset <name>     Apply preset (grassworks, meadow, dense, wild)
  --width <m>         Blade width in meters
  --height <m>        Blade height in meters
  --cell <m>          Cell size in meters
  --blades <n>        Blades per tuft
  --lean-min <f>      Minimum lean (0..1)
  --lean-max <f>      Maximum lean (0..1)
  --segments <n>      Blade segments (1-6)
  --compare           Output side-by-side comparison with reference
  --help              Show this help
`);
            process.exit(0);
        }
    }
    return opts;
}

// ═══════════════════════════════════════════════════════
// Main capture
// ═══════════════════════════════════════════════════════
async function main() {
    const opts = parseArgs();
    
    if (!existsSync(RESULTS_DIR)) await mkdir(RESULTS_DIR, { recursive: true });

    console.log('🌿 Grass Study Lab — Headless Capture');
    console.log('=====================================');

    // Start server
    const server = await startServer(__dirname, 8199);

    // Launch browser
    console.log('  🌐 Launching headless Chrome...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--enable-webgl',
            '--enable-gpu-rasterization'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const delay = ms => new Promise(r => setTimeout(r, ms));

    console.log('  📄 Loading grass lab...');
    await page.goto('http://localhost:8199/index.html', { waitUntil: 'networkidle0', timeout: 30000 });

    // Apply preset if specified
    if (opts.preset) {
        console.log(`  🎨 Applying preset: ${opts.preset}`);
        await page.evaluate(name => window.applyPreset(name), opts.preset);
        await delay(500);
    }

    // Apply individual overrides
    const paramOverrides = {};
    if (opts.bladeWidth !== undefined) paramOverrides.bladeWidth = opts.bladeWidth;
    if (opts.bladeHeight !== undefined) paramOverrides.bladeHeight = opts.bladeHeight;
    if (opts.cellSize !== undefined) paramOverrides.cellSize = opts.cellSize;
    if (opts.bladesPerTuft !== undefined) paramOverrides.bladesPerTuft = opts.bladesPerTuft;
    if (opts.leanMin !== undefined) paramOverrides.leanMin = opts.leanMin;
    if (opts.leanMax !== undefined) paramOverrides.leanMax = opts.leanMax;
    if (opts.segments !== undefined) paramOverrides.segments = opts.segments;

    if (Object.keys(paramOverrides).length > 0) {
        console.log(`  ⚙️  Overrides:`, paramOverrides);
        await page.evaluate(overrides => {
            for (const [key, val] of Object.entries(overrides)) {
                const el = document.getElementById(key);
                if (el) {
                    el.value = val;
                    const valEl = document.getElementById(key + '_v');
                    if (valEl) valEl.textContent = val;
                }
            }
            window.rebuildGrass();
        }, paramOverrides);
        await delay(500);
    }

    // Set camera to grassworks-like low angle
    await page.evaluate(() => window._resetCamera?.());
    await delay(200);

    // Let a few frames render for wind animation
    await delay(1500);

    // Capture
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `grass_${timestamp}.webp`;
    const filepath = join(RESULTS_DIR, filename);

    // Get the canvas element screenshot
    const canvasEl = await page.$('#lab-canvas');
    await canvasEl.screenshot({ path: filepath, type: 'webp', quality: 92 });

    console.log(`  ✅ Captured: results/${filename}`);

    // Get param dump
    const paramDump = await page.evaluate(() => document.getElementById('paramDump').value);
    console.log('\n  📋 Parameters:\n');
    console.log(paramDump);

    // Get stats
    const stats = await page.evaluate(() => document.getElementById('stats').textContent);
    console.log(`\n  📊 ${stats}\n`);

    await browser.close();
    server.close();

    console.log('  🏁 Done!\n');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
