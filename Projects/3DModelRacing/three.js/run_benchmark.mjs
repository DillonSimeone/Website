// run_benchmark.mjs — Headless Node.js Automated Benchmark Runner using Puppeteer
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 1. Temporary local static server for three.js directory
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(reqUrl.pathname);
    if (pathname === '/') pathname = '/benchmark.html';

    const filePath = path.join(__dirname, pathname);
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
        console.log(`[Benchmark] Page loaded. Simulating 400 frames of driving...`);

        // Poll for results
        const startTime = Date.now();
        let results = null;

        while (Date.now() - startTime < 45000) {
            results = await page.evaluate(() => window.__BENCHMARK_RESULTS__);
            if (results && results.finished) break;
            await new Promise(r => setTimeout(r, 500));
        }

        if (!results || !results.finished) {
            throw new Error('Benchmark timed out before completing 400 frames.');
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
