/**
 * Portfolio Website Dead Link Spider & Health Auditor
 * 
 * Automatically manages local server startup (or connects to an existing one),
 * discovers all pages, spider-crawls internal HTML pages and assets,
 * validates anchor fragments (#hash), tests external hyperlinks,
 * correlates broken links to local source files on disk,
 * and outputs terminal reports, JSON, Markdown, and an interactive HTML report.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// Project directories
const ROOT_DIR = path.resolve(__dirname, '../../');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const REPORTS_DIR = path.join(__dirname, 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// ANSI colors for clean CLI output
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    underline: '\x1b[4m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    bgRed: '\x1b[41m\x1b[37m',
    bgGreen: '\x1b[42m\x1b[30m'
};

// Command line arguments parsing
const args = process.argv.slice(2);
const options = {
    targetUrl: 'http://localhost:5173',
    includeExternal: false,
    scanAllPublic: false,
    timeoutMs: 15000,
    concurrency: 10,
    openReport: false
};


// Parse flags
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--external' || arg === '-e') {
        options.includeExternal = true;
    } else if (arg === '--all' || arg === '--all-public') {
        options.scanAllPublic = true;
    } else if (arg === '--open' || arg === '-o') {
        options.openReport = true;
    } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
        options.targetUrl = arg.replace(/\/+$/, '');
    } else if (arg.startsWith('--url=')) {
        options.targetUrl = arg.split('=')[1].replace(/\/+$/, '');
    } else if (arg.startsWith('--port=')) {
        options.targetUrl = `http://localhost:${arg.split('=')[1]}`;
    } else if (arg === '--concurrency' && args[i + 1]) {
        options.concurrency = parseInt(args[++i], 10) || 10;
    }
}

// Directories to ignore during discovery & source mapping
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vscode', '.gemini', 'venv', '.venv', '.pio']);

// Helper: Check if target URL server is responding
async function isServerRunning(url) {
    try {
        const testUrl = url.endsWith('/') ? url : url + '/';
        const res = await fetch(testUrl, {
            signal: AbortSignal.timeout(1500),
            headers: { 'Accept': 'text/html' }
        });
        return res.status >= 200 && res.status < 400;
    } catch {
        return false;
    }
}

// Helper: Start Vite dev server in background and wait for it
async function startViteServer(targetUrl) {
    console.log(`${c.cyan}[i] Target server at ${targetUrl} is not running.${c.reset}`);
    console.log(`${c.yellow}[i] Spawning local Vite dev server...${c.reset}`);

    const urlObj = new URL(targetUrl);
    const port = urlObj.port || '5173';

    const viteBin = path.join(ROOT_DIR, 'node_modules/vite/bin/vite.js');
    if (!fs.existsSync(viteBin)) {
        throw new Error(`Vite binary not found at ${viteBin}. Please run npm install.`);
    }

    const serverProc = spawn(process.execPath, [viteBin, '--clearScreen', 'false', '--port', port], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverLogs = '';
    serverProc.stdout.on('data', d => { serverLogs += d.toString(); });
    serverProc.stderr.on('data', d => { serverLogs += d.toString(); });

    serverProc.on('error', err => {
        console.error(`${c.red}Failed to spawn Vite server:${c.reset}`, err.message);
    });

    const startWait = Date.now();
    const maxWaitMs = 30000;
    let isReady = false;

    process.stdout.write(`${c.dim}  Waiting for server to become ready...${c.reset}`);

    while (Date.now() - startWait < maxWaitMs) {
        if (await isServerRunning(targetUrl)) {
            isReady = true;
            break;
        }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 400));
    }
    console.log('');

    if (!isReady) {
        stopServer(serverProc);
        console.error(`${c.red}Server output:${c.reset}\n${serverLogs}`);
        throw new Error(`Timed out waiting for Vite dev server on ${targetUrl}`);
    }

    // Warm up the server by triggering initial Vite transform & Handlebars compilation
    process.stdout.write(`${c.dim}  Warming up Vite compiler...${c.reset}`);
    try {
        await fetch(targetUrl.endsWith('/') ? targetUrl : targetUrl + '/', {
            signal: AbortSignal.timeout(15000),
            headers: { 'Accept': 'text/html' }
        });
        console.log(` ${c.green}ready!${c.reset}`);
    } catch {
        console.log(` ${c.yellow}(warming up in background)${c.reset}`);
    }

    console.log(`${c.green}✔ Local Vite server is live and ready!${c.reset}\n`);
    return serverProc;

}

// Helper: Kill server process tree safely on Windows
function stopServer(proc) {
    if (!proc || proc.killed) return;
    try {
        if (process.platform === 'win32') {
            execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
        } else {
            proc.kill('SIGTERM');
        }
    } catch {}
}

// Discover public HTML files
function discoverPublicHtmlFiles(dir = PUBLIC_DIR) {
    if (!fs.existsSync(dir)) return [];
    const files = [];

    function walk(currentDir) {
        for (const item of fs.readdirSync(currentDir, { withFileTypes: true })) {
            if (EXCLUDE_DIRS.has(item.name)) continue;
            const fullPath = path.join(currentDir, item.name);
            if (item.isDirectory()) {
                walk(fullPath);
            } else if (item.isFile() && item.name.endsWith('.html')) {
                files.push(fullPath);
            }
        }
    }

    walk(dir);
    return files;
}

// Extract DOM IDs and Anchor names for fragment verification
function extractDomIds(html) {
    const ids = new Set();
    const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = idRegex.exec(html)) !== null) {
        ids.add(match[1]);
    }
    const nameRegex = /<a\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi;
    while ((match = nameRegex.exec(html)) !== null) {
        ids.add(match[1]);
    }
    return ids;
}

// Extract srcset entries
function extractSrcsetLinks(html) {
    const srcsetRegex = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
    const links = [];
    let match;
    while ((match = srcsetRegex.exec(html)) !== null) {
        const parts = match[1].split(',');
        for (const part of parts) {
            const token = part.trim().split(/\s+/)[0];
            if (token) links.push({ raw: token, type: 'srcset-image' });
        }
    }
    return links;
}

// Extract CSS url(...) references
function extractCssUrls(cssText) {
    const stripped = cssText.replace(/url\(\s*['"]?data:[^)]+\)/gi, '');
    const cssUrlRegex = /\burl\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    const links = [];
    let match;
    while ((match = cssUrlRegex.exec(stripped)) !== null) {
        const u = match[1].trim();
        if (!u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('#') && !u.startsWith('%23')) {
            links.push({ raw: u, type: 'css-url' });
        }
    }
    return links;
}


// Find local file on disk that contains a given URL or broken link snippet
function findLocalSourceFile(brokenUrlRaw, pageUrl, targetOrigin) {
    // 1. If pageUrl is not the root homepage, check if it directly corresponds to a file in public/
    try {
        const u = new URL(pageUrl);
        let pagePath = decodeURIComponent(u.pathname);
        if (pagePath.startsWith('/')) pagePath = pagePath.substring(1);

        if (pagePath) {
            const direct = path.join(PUBLIC_DIR, pagePath);
            if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
                return { file: path.relative(ROOT_DIR, direct).replace(/\\/g, '/'), line: null };
            }
            const asIndex = path.join(PUBLIC_DIR, pagePath, 'index.html');
            if (fs.existsSync(asIndex)) {
                return { file: path.relative(ROOT_DIR, asIndex).replace(/\\/g, '/'), line: null };
            }
        }
    } catch {}

    // 2. Search in src/content/ and src/partials/
    const searchDirs = [
        path.join(SRC_DIR, 'content'),
        path.join(SRC_DIR, 'partials'),
        SRC_DIR
    ];

    const needle = brokenUrlRaw.trim();
    if (needle.length >= 3 && !needle.startsWith('#')) {
        for (const dir of searchDirs) {
            if (!fs.existsSync(dir)) continue;
            try {
                const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
                    const full = path.join(entry.parentPath || dir, entry.name);
                    const content = fs.readFileSync(full, 'utf8');
                    const idx = content.indexOf(needle);
                    if (idx !== -1) {
                        const line = content.substring(0, idx).split('\n').length;
                        return { file: path.relative(ROOT_DIR, full).replace(/\\/g, '/'), line };
                    }
                }
            } catch {}
        }
    }

    return { file: pageUrl.replace(targetOrigin, '') || '/', line: null };
}

// Check if an internal HTML route actually exists on disk
function resolveDiskHtmlPath(pathname) {
    let raw = pathname.startsWith('/') ? pathname.substring(1) : pathname;
    raw = raw.split('?')[0].split('#')[0];
    const clean = decodeURIComponent(raw);

    // Check direct file in public/
    const pDirect = path.join(PUBLIC_DIR, clean);
    if (fs.existsSync(pDirect) && fs.statSync(pDirect).isFile()) return pDirect;

    // Check directory index.html in public/
    const pIndex = path.join(PUBLIC_DIR, clean, 'index.html');
    if (fs.existsSync(pIndex)) return pIndex;

    // Check in src/
    const sDirect = path.join(SRC_DIR, clean);
    if (fs.existsSync(sDirect) && fs.statSync(sDirect).isFile()) return sDirect;

    const sIndex = path.join(SRC_DIR, clean, 'index.html');
    if (fs.existsSync(sIndex)) return sIndex;

    return null;
}

// Check if an internal asset file exists on disk
function checkDiskAsset(pathname) {
    let raw = pathname.startsWith('/') ? pathname.substring(1) : pathname;
    raw = raw.split('?')[0].split('#')[0];
    const clean = decodeURIComponent(raw);

    // Check in public/
    const inPublic = path.join(PUBLIC_DIR, clean);
    if (fs.existsSync(inPublic) && fs.statSync(inPublic).isFile()) return true;

    // Check in src/
    const inSrc = path.join(SRC_DIR, clean);
    if (fs.existsSync(inSrc) && fs.statSync(inSrc).isFile()) return true;

    // Check in root
    const inRoot = path.join(ROOT_DIR, clean);
    if (fs.existsSync(inRoot) && fs.statSync(inRoot).isFile()) return true;

    return false;
}


// Main Spider Auditor Class
class DeadLinkSpider {
    constructor(opts) {
        this.targetUrl = opts.targetUrl;
        this.targetOrigin = new URL(opts.targetUrl).origin;
        this.includeExternal = opts.includeExternal;
        this.scanAllPublic = opts.scanAllPublic;
        this.timeoutMs = opts.timeoutMs;
        this.concurrency = opts.concurrency;

        // Tracking sets
        this.crawlQueue = [];
        this.enqueuedPages = new Set();
        this.visitedPages = new Set();
        this.checkedAssets = new Map();
        this.checkedExternal = new Map();
        this.pageDomIds = new Map();
        this.anchorChecks = [];
        this.brokenLinks = [];
        this.stats = {
            pagesCrawled: 0,
            assetsChecked: 0,
            externalChecked: 0,
            anchorsChecked: 0,
            brokenInternal: 0,
            brokenExternal: 0,
            brokenAnchors: 0,
            startTime: Date.now(),
            endTime: null
        };
    }

    seed() {
        const rootUrl = this.targetUrl.endsWith('/') ? this.targetUrl : this.targetUrl + '/';
        this.enqueuePage(rootUrl, 'Homepage Root');

        if (this.scanAllPublic) {
            const htmlFiles = discoverPublicHtmlFiles();
            console.log(`${c.dim}[i] Seeding ${htmlFiles.length} standalone HTML files in public/...${c.reset}`);
            for (const filePath of htmlFiles) {
                const rel = path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/');
                const pageUrl = `${this.targetOrigin}/${rel}`;
                this.enqueuePage(pageUrl, `Disk: public/${rel}`);
            }
        }
    }

    enqueuePage(url, referrer = 'Spider') {
        const clean = this.normalizeUrl(url);
        if (!clean) return;

        // Ignore Vite internal client and virtual modules
        const u = new URL(clean);
        if (u.pathname.startsWith('/@') || u.pathname.startsWith('/api/')) return;

        if (this.enqueuedPages.has(clean) || this.visitedPages.has(clean)) return;

        this.enqueuedPages.add(clean);
        this.crawlQueue.push({ url: clean, referrer });
    }

    normalizeUrl(rawUrl) {
        try {
            const u = new URL(rawUrl);
            u.hash = ''; // Anchors verified separately

            // If internal directory URL ending in / (other than root /), normalize to index.html if index.html exists
            if (u.origin === this.targetOrigin && u.pathname.endsWith('/') && u.pathname !== '/') {
                let clean = decodeURIComponent(u.pathname.substring(1));
                const diskIndex = path.join(PUBLIC_DIR, clean, 'index.html');
                if (fs.existsSync(diskIndex)) {
                    u.pathname = u.pathname + 'index.html';
                }
            }

            return u.href;
        } catch {
            return null;
        }
    }


    isInternalUrl(urlStr) {
        try {
            const u = new URL(urlStr);
            return u.origin === this.targetOrigin;
        } catch {
            return false;
        }
    }

    isHtmlUrl(urlStr) {
        try {
            const u = new URL(urlStr);
            const pathname = u.pathname.toLowerCase();

            // Ignore Vite internals
            if (pathname.startsWith('/@')) return false;

            if (pathname.endsWith('/') || pathname === '') return true;
            if (pathname.endsWith('.html') || pathname.endsWith('.htm')) return true;

            const ext = path.extname(pathname);
            // If no extension, and not an API call
            if (!ext && !pathname.startsWith('/api/')) return true;
            return false;
        } catch {
            return false;
        }
    }

    async run() {
        this.seed();
        console.log(`\n${c.cyan}${c.bold}====================================================${c.reset}`);
        console.log(`${c.cyan}${c.bold}  SPIDER LAUNCHED: Scanning site for dead links...  ${c.reset}`);
        console.log(`${c.dim}  Target Server:   ${this.targetUrl}${c.reset}`);
        console.log(`${c.dim}  Scope:           ${this.scanAllPublic ? 'Full Workspace (Homepage + All Public Files)' : 'Active Portfolio Spider (Homepage + All Linked Projects)'}${c.reset}`);
        console.log(`${c.dim}  External Check:  ${this.includeExternal ? c.green + 'ENABLED' : c.yellow + 'LOCAL ONLY (pass --external to enable)'}${c.reset}`);
        console.log(`${c.cyan}${c.bold}====================================================${c.reset}\n`);

        let queueIndex = 0;
        const processNext = async () => {
            while (queueIndex < this.crawlQueue.length) {
                const item = this.crawlQueue[queueIndex++];
                await this.processPage(item.url, item.referrer);
            }
        };

        const workers = [];
        const workerCount = Math.max(1, this.concurrency);
        for (let i = 0; i < workerCount; i++) {
            workers.push(processNext());
        }
        await Promise.all(workers);

        await this.verifyAnchors();

        if (this.includeExternal) {
            await this.verifyExternalLinks();
        }

        this.stats.endTime = Date.now();
        this.renderConsoleReport();
        this.writeReports();
    }

    async processPage(pageUrl, referrer) {
        if (this.visitedPages.has(pageUrl)) return;
        this.visitedPages.add(pageUrl);
        this.stats.pagesCrawled++;

        const u = new URL(pageUrl);
        const isRoot = u.pathname === '/' || u.pathname === '/index.html';
        const shortUrl = pageUrl.replace(this.targetOrigin, '') || '/';
        const pending = this.crawlQueue.length - this.visitedPages.size;
        console.log(`${c.cyan}[Spider]${c.reset} [${this.stats.pagesCrawled} crawled, ${Math.max(0, pending)} remaining] ${c.bold}${shortUrl}${c.reset}`);

        // Check if route exists on disk (if not root)
        if (!isRoot) {
            const diskFile = resolveDiskHtmlPath(u.pathname);
            if (!diskFile) {
                this.recordBrokenLink({
                    url: pageUrl,
                    rawHref: pageUrl,
                    status: 404,
                    error: 'HTTP 404 Not Found (Target page or index.html does not exist on disk)',
                    type: 'html-page',
                    referrer,
                    isInternal: true
                });
                return;
            }
        }

        let res;
        try {
            res = await fetch(pageUrl, {
                signal: AbortSignal.timeout(this.timeoutMs),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebsiteDeadLinkChecker/1.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
        } catch (err) {
            this.recordBrokenLink({
                url: pageUrl,
                rawHref: pageUrl,
                status: null,
                error: err.name === 'TimeoutError' ? 'Page Request Timeout (4s)' : err.message,
                type: 'html-page',
                referrer,
                isInternal: true
            });
            return;
        }

        if (!res.ok) {
            this.recordBrokenLink({
                url: pageUrl,
                rawHref: pageUrl,
                status: res.status,
                error: `HTTP ${res.status} ${res.statusText}`,
                type: 'html-page',
                referrer,
                isInternal: true
            });
            return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return;
        }

        const rawHtml = await res.text();

        // 1. Store DOM IDs for anchor checking
        const ids = extractDomIds(rawHtml);
        this.pageDomIds.set(pageUrl, ids);

        // 2. Extract links safely
        // First extract <script src="..."> from tags with matching quotes
        const scriptSrcRegex = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
        let match;
        const extractedLinks = [];
        while ((match = scriptSrcRegex.exec(rawHtml)) !== null) {
            const raw = match[1] || match[2] || match[3];
            if (raw) extractedLinks.push({ raw, type: 'script' });
        }

        // Strip <script>...</script> and HTML comments <!-- ... --> so JS code and commented-out markup are never mistaken for active links
        const cleanHtml = rawHtml
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '');

        // Extract standard HTML links from clean HTML with matching quote pairs
        const htmlLinkRegexes = [
            { type: 'link', regex: /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi },
            { type: 'stylesheet/link', regex: /<link\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi },
            { type: 'image', regex: /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi },
            { type: 'lazy-image', regex: /<img\b[^>]*\bdata-src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi },
            { type: 'iframe', regex: /<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi },
            { type: 'video/audio', regex: /<(?:video|audio|source)\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi },
            { type: 'video-poster', regex: /<video\b[^>]*\bposter\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi },
            { type: 'object', regex: /<object\b[^>]*\bdata\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi }
        ];

        for (const { type, regex } of htmlLinkRegexes) {
            while ((match = regex.exec(cleanHtml)) !== null) {
                const raw = match[1] || match[2] || match[3];
                if (raw) extractedLinks.push({ raw, type });
            }
        }

        extractedLinks.push(...extractSrcsetLinks(cleanHtml));

        // Extract CSS url(...) strictly inside <style> blocks
        const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
        while ((match = styleRegex.exec(cleanHtml)) !== null) {
            extractedLinks.push(...extractCssUrls(match[1]));
        }

        // Process all extracted links
        for (const { raw, type } of extractedLinks) {
            this.handleExtractedLink(raw, type, pageUrl);
        }
    }

    handleExtractedLink(rawHref, type, sourcePageUrl) {
        if (!rawHref) return;
        const trimmed = rawHref.trim();

        // Skip non-navigational links, template literals, APIs, and Vite internals
        if (
            trimmed.startsWith('javascript:') ||
            trimmed.startsWith('mailto:') ||
            trimmed.startsWith('tel:') ||
            trimmed.startsWith('data:') ||
            trimmed.startsWith('blob:') ||
            trimmed.startsWith('${') ||
            trimmed.startsWith('/@') ||
            trimmed.startsWith('@vite') ||
            trimmed.startsWith('/api/') ||
            trimmed.endsWith('.map') ||
            trimmed.includes('%7B') ||
            trimmed === '#' ||
            trimmed === ''
        ) {
            return;
        }

        // Pure in-page anchor (#section)
        if (trimmed.startsWith('#')) {
            this.anchorChecks.push({
                targetPageUrl: this.normalizeUrl(sourcePageUrl),
                hash: trimmed.substring(1),
                referrer: sourcePageUrl,
                rawHref: trimmed
            });
            return;
        }


        // Resolve absolute URL
        let resolvedUrl;
        try {
            resolvedUrl = new URL(trimmed, sourcePageUrl).href;
        } catch {
            this.recordBrokenLink({
                url: trimmed,
                rawHref: trimmed,
                status: null,
                error: 'Malformed URL syntax',
                type,
                referrer: sourcePageUrl,
                isInternal: true
            });
            return;
        }

        const urlObj = new URL(resolvedUrl);

        // Record anchor if URL has hash and is an internal HTML document
        if (urlObj.hash && this.isHtmlUrl(resolvedUrl) && this.isInternalUrl(resolvedUrl)) {
            const cleanTarget = this.normalizeUrl(resolvedUrl);
            this.anchorChecks.push({
                targetPageUrl: cleanTarget,
                hash: urlObj.hash.substring(1),
                referrer: sourcePageUrl,
                rawHref: trimmed
            });
        }

        // INTERNAL vs EXTERNAL
        if (this.isInternalUrl(resolvedUrl)) {
            const cleanUrl = this.normalizeUrl(resolvedUrl);

            if (this.isHtmlUrl(resolvedUrl)) {
                this.enqueuePage(cleanUrl, sourcePageUrl);
            } else {
                this.checkInternalAssetFast(cleanUrl, trimmed, type, sourcePageUrl);
            }
        } else {
            if (this.includeExternal) {
                if (!this.checkedExternal.has(resolvedUrl)) {
                    this.checkedExternal.set(resolvedUrl, { referrers: [sourcePageUrl], rawHref: trimmed, type });
                } else {
                    const entry = this.checkedExternal.get(resolvedUrl);
                    if (!entry.referrers.includes(sourcePageUrl)) {
                        entry.referrers.push(sourcePageUrl);
                    }
                }
            }
        }
    }

    async checkInternalAssetFast(assetUrl, rawHref, type, referrer) {
        if (this.checkedAssets.has(assetUrl)) {
            const cached = this.checkedAssets.get(assetUrl);
            if (!cached.ok) {
                this.recordBrokenLink({
                    url: assetUrl,
                    rawHref,
                    status: cached.status,
                    error: cached.error,
                    type,
                    referrer,
                    isInternal: true
                });
            }
            return;
        }

        this.stats.assetsChecked++;

        // 1. Fast filesystem pre-check (instantaneous)
        const u = new URL(assetUrl);
        const decodedPath = decodeURIComponent(u.pathname);

        if (checkDiskAsset(decodedPath)) {
            this.checkedAssets.set(assetUrl, { status: 200, ok: true, error: null });
            return;
        }

        // 2. Fall back to HTTP GET via Vite server
        try {
            const res = await fetch(assetUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(2000),
                headers: { 'Accept': '*/*' }
            });

            const ct = (res.headers.get('content-type') || '').toLowerCase();
            const lowerAsset = assetUrl.toLowerCase().split('?')[0];
            const isNonHtmlAsset = (
                lowerAsset.endsWith('.js') || lowerAsset.endsWith('.css') || lowerAsset.endsWith('.png') ||
                lowerAsset.endsWith('.jpg') || lowerAsset.endsWith('.jpeg') || lowerAsset.endsWith('.webp') ||
                lowerAsset.endsWith('.svg') || lowerAsset.endsWith('.json') || lowerAsset.endsWith('.pdf') ||
                lowerAsset.endsWith('.woff') || lowerAsset.endsWith('.woff2') || lowerAsset.endsWith('.ttf') ||
                lowerAsset.endsWith('.eot') || lowerAsset.endsWith('.webmanifest')
            );

            const isSpaFallback = isNonHtmlAsset && ct.includes('text/html');
            const ok = res.status >= 200 && res.status < 400 && !isSpaFallback;

            const errorText = isSpaFallback 
                ? 'HTTP 404 Not Found (Asset missing on disk)' 
                : `HTTP ${res.status} ${res.statusText}`;

            this.checkedAssets.set(assetUrl, {
                status: isSpaFallback ? 404 : res.status,
                ok,
                error: ok ? null : errorText
            });

            if (!ok) {
                this.recordBrokenLink({
                    url: assetUrl,
                    rawHref,
                    status: isSpaFallback ? 404 : res.status,
                    error: errorText,
                    type,
                    referrer,
                    isInternal: true
                });
            }
        } catch (err) {

            const errorMsg = err.name === 'TimeoutError' ? 'Asset Request Timeout' : err.message;
            this.checkedAssets.set(assetUrl, { status: null, ok: false, error: errorMsg });

            this.recordBrokenLink({
                url: assetUrl,
                rawHref,
                status: null,
                error: errorMsg,
                type,
                referrer,
                isInternal: true
            });
        }
    }

    async verifyAnchors() {
        console.log(`\n${c.cyan}[Spider]${c.reset} Verifying ${this.anchorChecks.length} internal anchor hash links (#...)...`);

        for (const check of this.anchorChecks) {
            this.stats.anchorsChecked++;
            const ids = this.pageDomIds.get(check.targetPageUrl);

            if (!ids) {
                this.recordBrokenLink({
                    url: `${check.targetPageUrl}#${check.hash}`,
                    rawHref: check.rawHref,
                    status: 404,
                    error: `Target page failed to load`,
                    type: 'anchor-link',
                    referrer: check.referrer,
                    isInternal: true
                });
                this.stats.brokenAnchors++;
                continue;
            }

            const decodedHash = decodeURIComponent(check.hash);
            if (!ids.has(check.hash) && !ids.has(decodedHash)) {
                this.recordBrokenLink({
                    url: `${check.targetPageUrl}#${check.hash}`,
                    rawHref: check.rawHref,
                    status: null,
                    error: `Target element id="#${check.hash}" not found in page DOM`,
                    type: 'missing-anchor',
                    referrer: check.referrer,
                    isInternal: true
                });
                this.stats.brokenAnchors++;
            }
        }
    }

    async verifyExternalLinks() {
        const extUrls = Array.from(this.checkedExternal.keys());
        console.log(`\n${c.cyan}[Spider]${c.reset} Auditing ${extUrls.length} external web links (concurrency: ${this.concurrency})...`);

        let index = 0;
        const total = extUrls.length;

        const worker = async () => {
            while (index < total) {
                const currentIdx = index++;
                const extUrl = extUrls[currentIdx];
                const data = this.checkedExternal.get(extUrl);
                this.stats.externalChecked++;

                process.stdout.write(`\r${c.cyan}[External]${c.reset} Checking [${this.stats.externalChecked}/${total}] - ${extUrl.substring(0, 60).padEnd(60)}`);

                try {
                    let res;
                    try {
                        res = await fetch(extUrl, {
                            method: 'HEAD',
                            signal: AbortSignal.timeout(this.timeoutMs),
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        });
                        if (res.status === 405 || res.status === 403 || res.status === 501) {
                            throw new Error('Fallback to GET');
                        }
                    } catch {
                        res = await fetch(extUrl, {
                            method: 'GET',
                            signal: AbortSignal.timeout(this.timeoutMs),
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        });
                    }

                    if (res.status === 403 || res.status === 401 || res.status === 429) {
                        this.recordBrokenLink({
                            url: extUrl,
                            rawHref: data.rawHref,
                            status: res.status,
                            error: `External Site Restricted (HTTP ${res.status} - anti-bot or auth)`,
                            type: 'external-warning',
                            referrer: data.referrers[0],
                            isInternal: false,
                            isWarning: true
                        });
                    } else if (res.status >= 400) {
                        this.recordBrokenLink({
                            url: extUrl,
                            rawHref: data.rawHref,
                            status: res.status,
                            error: `HTTP ${res.status} ${res.statusText}`,
                            type: 'external-link',
                            referrer: data.referrers[0],
                            isInternal: false
                        });
                    }
                } catch (err) {
                    const msg = err.name === 'TimeoutError' ? 'External Connection Timeout (4s)' : err.message;
                    this.recordBrokenLink({
                        url: extUrl,
                        rawHref: data.rawHref,
                        status: null,
                        error: msg,
                        type: 'external-link',
                        referrer: data.referrers[0],
                        isInternal: false
                    });
                }
            }
        };

        const workers = Array.from({ length: Math.min(this.concurrency, extUrls.length) }, () => worker());
        await Promise.all(workers);
        console.log('');
    }

    recordBrokenLink(item) {
        if (item.isInternal) {
            this.stats.brokenInternal++;
        } else if (!item.isWarning) {
            this.stats.brokenExternal++;
        }

        const localSource = findLocalSourceFile(item.rawHref, item.referrer, this.targetOrigin);
        item.sourceFile = localSource.file;
        item.sourceLine = localSource.line;

        this.brokenLinks.push(item);
    }

    renderConsoleReport() {
        const durationSec = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(1);

        console.log(`\n\n${c.bold}┌────────────────────────────────────────────────────────┐${c.reset}`);
        console.log(`${c.bold}│              DEAD LINK SPIDER AUDIT SUMMARY            │${c.reset}`);
        console.log(`${c.bold}├────────────────────────────────────────┬───────────────┤${c.reset}`);
        console.log(`│ Total HTML Pages Crawled               │ ${String(this.stats.pagesCrawled).padStart(13)} │`);
        console.log(`│ Total Internal Assets Verified         │ ${String(this.stats.assetsChecked).padStart(13)} │`);
        console.log(`│ Total Anchor Fragments (#hash) Checked │ ${String(this.stats.anchorsChecked).padStart(13)} │`);
        if (this.includeExternal) {
            console.log(`│ Total External Links Checked           │ ${String(this.stats.externalChecked).padStart(13)} │`);
        }
        console.log(`${c.bold}├────────────────────────────────────────┼───────────────┤${c.reset}`);

        const internalColor = this.stats.brokenInternal > 0 ? c.red : c.green;
        const externalColor = this.stats.brokenExternal > 0 ? c.red : c.green;
        const anchorColor = this.stats.brokenAnchors > 0 ? c.yellow : c.green;

        console.log(`│ Broken Internal Links / Assets         │ ${internalColor}${c.bold}${String(this.stats.brokenInternal).padStart(13)}${c.reset} │`);
        console.log(`│ Broken Anchor (#hash) Links            │ ${anchorColor}${c.bold}${String(this.stats.brokenAnchors).padStart(13)}${c.reset} │`);
        if (this.includeExternal) {
            console.log(`│ Broken External Links                  │ ${externalColor}${c.bold}${String(this.stats.brokenExternal).padStart(13)}${c.reset} │`);
        }
        console.log(`│ Crawl Duration                         │ ${String(durationSec + 's').padStart(13)} │`);
        console.log(`${c.bold}└────────────────────────────────────────┴───────────────┘${c.reset}\n`);

        if (this.brokenLinks.length === 0) {
            console.log(`${c.bgGreen}${c.bold}  PERFECT! NO BROKEN LINKS FOUND ACROSS THE ENTIRE WEBSITE!  ${c.reset}\n`);
            return;
        }

        console.log(`${c.bold}${c.red}DETAILED BROKEN LINKS LISTING (${this.brokenLinks.length} items):${c.reset}\n`);

        let count = 1;
        for (const item of this.brokenLinks) {
            const isWarn = item.isWarning;
            const prefix = isWarn ? `${c.yellow}[WARN]` : `${c.red}[BROKEN]`;
            const badge = `[${item.type}]`;

            console.log(`${prefix} ${c.bold}#${count++} ${item.url}${c.reset}`);
            console.log(`  ${c.dim}Error:${c.reset}        ${isWarn ? c.yellow : c.red}${item.error}${c.reset}`);
            console.log(`  ${c.dim}Tag / Type:${c.reset}   ${badge} (raw: "${item.rawHref}")`);
            console.log(`  ${c.dim}Referrer Page:${c.reset} ${item.referrer}`);
            if (item.sourceFile) {
                const lineStr = item.sourceLine ? `:${item.sourceLine}` : '';
                console.log(`  ${c.dim}Source File:${c.reset}   ${c.cyan}${item.sourceFile}${lineStr}${c.reset}`);
            }
            console.log('');
        }
    }

    writeReports() {
        const jsonPath = path.join(REPORTS_DIR, 'deadlinks-report.json');
        const mdPath = path.join(REPORTS_DIR, 'deadlinks-report.md');
        const htmlPath = path.join(REPORTS_DIR, 'deadlinks-report.html');

        const reportData = {
            generatedAt: new Date().toISOString(),
            targetUrl: this.targetUrl,
            durationSeconds: ((this.stats.endTime - this.stats.startTime) / 1000),
            stats: this.stats,
            brokenLinks: this.brokenLinks
        };

        // 1. JSON Report
        fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

        // 2. Markdown Report
        let md = `# Website Dead Link Audit Report\n\n`;
        md += `**Generated**: ${new Date().toLocaleString()}  \n`;
        md += `**Target Server**: \`${this.targetUrl}\`  \n`;
        md += `**Duration**: ${reportData.durationSeconds.toFixed(1)} seconds  \n\n`;
        md += `## Summary\n\n`;
        md += `| Metric | Count |\n`;
        md += `|---|---|\n`;
        md += `| HTML Pages Crawled | ${this.stats.pagesCrawled} |\n`;
        md += `| Internal Assets Verified | ${this.stats.assetsChecked} |\n`;
        md += `| Anchor Fragments (#) Checked | ${this.stats.anchorsChecked} |\n`;
        if (this.includeExternal) {
            md += `| External Links Checked | ${this.stats.externalChecked} |\n`;
        }
        md += `| **Broken Internal Links** | **${this.stats.brokenInternal}** |\n`;
        md += `| **Broken Anchors** | **${this.stats.brokenAnchors}** |\n`;
        if (this.includeExternal) {
            md += `| **Broken External Links** | **${this.stats.brokenExternal}** |\n`;
        }
        md += `\n`;

        if (this.brokenLinks.length === 0) {
            md += `### ✔ All links verified successfully!\n`;
        } else {
            md += `## Broken Links Listing\n\n`;
            md += `| # | Broken Target | Error | Type | Source File / Page |\n`;
            md += `|---|---|---|---|---|\n`;
            this.brokenLinks.forEach((item, idx) => {
                const target = item.url.replace(/\|/g, '\\|');
                const err = item.error.replace(/\|/g, '\\|');
                const loc = item.sourceFile ? `\`${item.sourceFile}${item.sourceLine ? ':' + item.sourceLine : ''}\`` : `[Link](${item.referrer})`;
                md += `| ${idx + 1} | \`${target}\` | ${err} | \`${item.type}\` | ${loc} |\n`;
            });
        }

        fs.writeFileSync(mdPath, md, 'utf8');

        // 3. Interactive HTML Dashboard
        const html = generateHtmlDashboard(reportData);
        fs.writeFileSync(htmlPath, html, 'utf8');

        console.log(`${c.bold}Saved Audit Reports:${c.reset}`);
        console.log(`  ${c.dim}• JSON:${c.reset}       ${jsonPath}`);
        console.log(`  ${c.dim}• Markdown:${c.reset}   ${mdPath}`);
        console.log(`  ${c.dim}• HTML App:${c.reset}   ${c.green}${htmlPath}${c.reset}\n`);

        if (options.openReport || this.brokenLinks.length > 0) {
            try {
                if (process.platform === 'win32') {
                    spawn('cmd', ['/c', 'start', '""', htmlPath], { detached: true, stdio: 'ignore' });
                }
            } catch {}
        }
    }
}

// Generate interactive HTML Dashboard report
function generateHtmlDashboard(data) {
    const jsonStr = JSON.stringify(data.brokenLinks).replace(/</g, '\\u003c');
    const { stats, durationSeconds, targetUrl, generatedAt } = data;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Website Dead Link Auditor Report</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #0f172a;
            --bg-surface: #1e293b;
            --bg-card: #182234;
            --border: #334155;
            --text-primary: #f8fafc;
            --text-muted: #94a3b8;
            --accent-cyan: #38bdf8;
            --accent-green: #34d399;
            --accent-red: #f87171;
            --accent-yellow: #fbbf24;
            --accent-purple: #c084fc;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-base);
            color: var(--text-primary);
            line-height: 1.5;
            padding: 32px 24px;
        }

        .container { max-width: 1280px; margin: 0 auto; }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 28px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border);
        }

        h1 { font-size: 26px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 12px; }
        .badge-live {
            background: rgba(56, 189, 248, 0.15);
            color: var(--accent-cyan);
            font-size: 13px;
            padding: 4px 10px;
            border-radius: 999px;
            border: 1px solid rgba(56, 189, 248, 0.3);
        }

        .meta-info { font-size: 13px; color: var(--text-muted); text-align: right; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }

        .stat-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 18px 20px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
        }

        .stat-label { font-size: 13px; font-weight: 500; color: var(--text-muted); margin-bottom: 6px; }
        .stat-value { font-size: 28px; font-weight: 700; }
        .stat-value.ok { color: var(--accent-green); }
        .stat-value.err { color: var(--accent-red); }
        .stat-value.warn { color: var(--accent-yellow); }
        .stat-value.info { color: var(--accent-cyan); }

        .controls-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 14px;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        }

        .filters { display: flex; gap: 8px; flex-wrap: wrap; }
        .filter-btn {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            color: var(--text-muted);
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }

        .filter-btn:hover, .filter-btn.active {
            background: rgba(56, 189, 248, 0.15);
            color: var(--accent-cyan);
            border-color: var(--accent-cyan);
        }

        .search-box {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            color: #fff;
            padding: 9px 16px;
            border-radius: 8px;
            font-size: 14px;
            min-width: 280px;
            outline: none;
        }
        .search-box:focus { border-color: var(--accent-cyan); }

        .table-wrap {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
        }

        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        th {
            background: #152033;
            padding: 14px 16px;
            color: var(--text-muted);
            font-weight: 600;
            border-bottom: 1px solid var(--border);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 11px;
        }
        td {
            padding: 14px 16px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255, 255, 255, 0.02); }

        .tag-pill {
            display: inline-block;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 6px;
            text-transform: uppercase;
            font-family: 'JetBrains Mono', monospace;
        }
        .tag-internal { background: rgba(248, 113, 113, 0.15); color: var(--accent-red); border: 1px solid rgba(248, 113, 113, 0.3); }
        .tag-anchor { background: rgba(251, 191, 36, 0.15); color: var(--accent-yellow); border: 1px solid rgba(251, 191, 36, 0.3); }
        .tag-external { background: rgba(192, 132, 252, 0.15); color: var(--accent-purple); border: 1px solid rgba(192, 132, 252, 0.3); }
        .tag-warning { background: rgba(148, 163, 184, 0.15); color: var(--text-muted); border: 1px solid var(--border); }

        .url-text {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            color: #fff;
            word-break: break-all;
        }

        .source-file {
            font-family: 'JetBrains Mono', monospace;
            color: var(--accent-cyan);
            font-size: 12px;
        }

        .empty-state {
            padding: 48px 24px;
            text-align: center;
            color: var(--accent-green);
            font-size: 18px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>🕷 Website Dead Link Spider Report <span class="badge-live">Audit Complete</span></h1>
            </div>
            <div class="meta-info">
                <div>Target: <strong>${targetUrl}</strong></div>
                <div>Generated: ${new Date(generatedAt).toLocaleString()}</div>
                <div>Duration: ${durationSeconds.toFixed(1)}s</div>
            </div>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Pages Crawled</div>
                <div class="stat-value info">${stats.pagesCrawled}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Assets Verified</div>
                <div class="stat-value info">${stats.assetsChecked}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Broken Internal</div>
                <div class="stat-value ${stats.brokenInternal > 0 ? 'err' : 'ok'}">${stats.brokenInternal}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Broken Anchors</div>
                <div class="stat-value ${stats.brokenAnchors > 0 ? 'warn' : 'ok'}">${stats.brokenAnchors}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Broken External</div>
                <div class="stat-value ${stats.brokenExternal > 0 ? 'err' : 'ok'}">${stats.brokenExternal}</div>
            </div>
        </div>

        <div class="controls-bar">
            <div class="filters">
                <button class="filter-btn active" data-filter="all">All Issues (<span id="count-all">0</span>)</button>
                <button class="filter-btn" data-filter="internal">Internal Only (<span id="count-internal">0</span>)</button>
                <button class="filter-btn" data-filter="anchor">Missing Anchors (<span id="count-anchor">0</span>)</button>
                <button class="filter-btn" data-filter="external">External Only (<span id="count-external">0</span>)</button>
            </div>
            <input type="text" id="searchInput" class="search-box" placeholder="Filter by URL, filename, or error...">
        </div>

        <div class="table-wrap">
            <table id="linksTable">
                <thead>
                    <tr>
                        <th style="width: 50px;">#</th>
                        <th style="width: 130px;">Type</th>
                        <th>Broken Target URL</th>
                        <th style="width: 220px;">Error Details</th>
                        <th>Local Source File / Page</th>
                    </tr>
                </thead>
                <tbody id="tableBody"></tbody>
            </table>
            <div id="emptyNotice" class="empty-state" style="display: none;">
                ✔ No dead links matching current criteria!
            </div>
        </div>
    </div>

    <script>
        const brokenLinks = ${jsonStr};
        let currentFilter = 'all';
        let searchQuery = '';

        const tableBody = document.getElementById('tableBody');
        const emptyNotice = document.getElementById('emptyNotice');

        document.getElementById('count-all').textContent = brokenLinks.length;
        document.getElementById('count-internal').textContent = brokenLinks.filter(l => l.isInternal && l.type !== 'missing-anchor').length;
        document.getElementById('count-anchor').textContent = brokenLinks.filter(l => l.type === 'missing-anchor').length;
        document.getElementById('count-external').textContent = brokenLinks.filter(l => !l.isInternal).length;

        function render() {
            tableBody.innerHTML = '';
            
            const filtered = brokenLinks.filter(item => {
                if (currentFilter === 'internal' && (!item.isInternal || item.type === 'missing-anchor')) return false;
                if (currentFilter === 'anchor' && item.type !== 'missing-anchor') return false;
                if (currentFilter === 'external' && item.isInternal) return false;

                if (searchQuery) {
                    const text = (item.url + ' ' + (item.sourceFile || '') + ' ' + item.error + ' ' + (item.referrer || '')).toLowerCase();
                    if (!text.includes(searchQuery)) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                emptyNotice.style.display = 'block';
                return;
            }
            emptyNotice.style.display = 'none';

            filtered.forEach((item, idx) => {
                const tr = document.createElement('tr');

                let badgeClass = 'tag-internal';
                if (item.type === 'missing-anchor') badgeClass = 'tag-anchor';
                else if (item.isWarning) badgeClass = 'tag-warning';
                else if (!item.isInternal) badgeClass = 'tag-external';

                const sourceLoc = item.sourceFile 
                    ? \`<div class="source-file">\${escapeHtml(item.sourceFile)}\${item.sourceLine ? ':' + item.sourceLine : ''}</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">Page: \${escapeHtml(item.referrer)}</div>\`
                    : \`<div style="font-size: 11px; color: var(--text-muted);">\${escapeHtml(item.referrer)}</div>\`;

                tr.innerHTML = \`
                    <td>\${idx + 1}</td>
                    <td><span class="tag-pill \${badgeClass}">\${escapeHtml(item.type)}</span></td>
                    <td>
                        <div class="url-text">\${escapeHtml(item.url)}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Tag: &lt;\${escapeHtml(item.type)}&gt; (href/src: "\${escapeHtml(item.rawHref)}")</div>
                    </td>
                    <td style="color: \${item.isWarning ? 'var(--accent-yellow)' : 'var(--accent-red)'}; font-weight: 500;">
                        \${escapeHtml(item.error)}
                    </td>
                    <td>\${sourceLoc}</td>
                \`;
                tableBody.appendChild(tr);
            });
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                render();
            });
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            render();
        });

        render();
    </script>
</body>
</html>`;
}

// Main execution controller
async function main() {
    let serverProcess = null;
    let startedOwnServer = false;

    const cleanup = () => {
        if (startedOwnServer && serverProcess) {
            console.log(`\n${c.dim}[i] Shutting down spawned local Vite server...${c.reset}`);
            stopServer(serverProcess);
            startedOwnServer = false;
        }
    };

    process.on('SIGINT', () => { cleanup(); process.exit(130); });
    process.on('SIGTERM', () => { cleanup(); process.exit(143); });
    process.on('exit', () => { cleanup(); });

    try {
        console.log(`${c.bold}Checking server status at ${options.targetUrl}...${c.reset}`);
        const isRunning = await isServerRunning(options.targetUrl);

        if (!isRunning) {
            serverProcess = await startViteServer(options.targetUrl);
            startedOwnServer = true;
        } else {
            console.log(`${c.green}✔ Active server detected at ${options.targetUrl}! Using existing instance.${c.reset}\n`);
        }

        const spider = new DeadLinkSpider(options);
        await spider.run();

        const exitCode = spider.brokenLinks.length > 0 ? 1 : 0;
        cleanup();
        process.exit(exitCode);

    } catch (err) {
        console.error(`\n${c.red}${c.bold}ERROR:${c.reset} ${err.message}`);
        cleanup();
        process.exit(1);
    }
}

main();
