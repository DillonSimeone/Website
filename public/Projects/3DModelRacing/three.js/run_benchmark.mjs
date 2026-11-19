// run_benchmark.mjs — Headless Node.js Automated Benchmark Runner using Puppeteer
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Import puppeteer from grassStudy/node_modules
const puppeteerPath = path.resolve(__dirname, '../grassStudy/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js');
const puppeteer = (await import(`file://${puppeteerPath.replace(/\\/g, '/')}`)).default;

const PORT = 8098;
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js':   'application/javascript; charset=UTF-8',
    '.mjs':  'application/javascript; charset=UTF-8',
    '.css':  'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml'
};

function resolveBenchmarkPath(pathname) {
    const clean = pathname.replace(/^\/+/, '');
    let candidate;
    if (clean === '') {
        candidate = path.join(__dirname, 'benchmark.html');
    } else if (clean.startsWith('shared/')) {
        candidate = path.resolve(PROJECT_ROOT, clean);
    } else if (clean.startsWith('three.js/')) {
        candidate = path.resolve(PROJECT_ROOT, clean);
    } else {
        candidate = path.resolve(__dirname, clean);
    }
    const rel = path.relative(PROJECT_ROOT, candidate);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return candidate;
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    const filePath = resolveBenchmarkPath(pathname);
    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(0, async () => {
    const actualPort = server.address().port;
    console.log(`\n============================================================`);
    console.log(`  🏎️  Starting 3D Model Racing Performance Benchmark`);
    console.log(`  ➔ Server running on http://localhost:${actualPort}/benchmark.html`);
    console.log(`============================================================\n`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--enable-webgl',
                '--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
                '--use-gl=angle',
                '--use-angle=d3d11',
                '--enable-gpu-rasterization',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });

        page.on('console', msg => {
            const txt = msg.text();
            if (txt.includes('Error') || txt.includes('warn') || txt.includes('Frame')) {
                console.log(`[Browser Console] ${txt}`);
            }
        });
        page.on('pageerror', err => console.error(`[Browser PageError]`, err.message));

        await page.evaluateOnNewDocument(() => {
            window.__IS_HEADLESS__ = true;
        });

        await page.goto(`http://localhost:${actualPort}/benchmark.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`[Benchmark] Page loaded. Simulating 1000 frames of driving...`);

        const startTime = Date.now();
        let results = null;

        while (Date.now() - startTime < 60000) {
            results = await page.evaluate(() => window.__BENCHMARK_RESULTS__);
            if (results && results.finished) break;
            await new Promise(r => setTimeout(r, 500));
        }

        if (!results || !results.finished) {
            throw new Error('Benchmark timed out before completing frames.');
        }

        const outPath = path.resolve(__dirname, 'benchmark_report.md');
        fs.writeFileSync(outPath, results.markdown, 'utf8');

        console.log(`\n============================================================`);
        console.log(`  ✅ Benchmark Finished Successfully!`);
        console.log(`  ➔ Avg FPS:       ${results.stats.avgFps} FPS`);
        console.log(`  ➔ 1% Low:        ${results.stats.onePercentLow} FPS`);
        console.log(`  ➔ Avg Frame:     ${results.stats.avgFrameTime} ms`);
        console.log(`  ➔ Avg DrawCalls: ${results.stats.avgDrawCalls}`);
        console.log(`  ➔ Avg Triangles: ${results.stats.avgTris.toLocaleString()}`);
        console.log(`  ➔ Grass Density: ${results.stats.densityPercent}% (${results.stats.activeBlades.toLocaleString()} blades)`);
        console.log(`  ➔ Report saved:  ${outPath}`);
        console.log(`============================================================\n`);

    } catch (err) {
        console.error(`[Benchmark Error]:`, err);
    } finally {
        if (browser) await browser.close();
        server.close();
        process.exit(0);
    }
});
