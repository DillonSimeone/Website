import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8099;
const CONFIG_FILE = path.resolve(PROJECT_ROOT, 'three.js/configure/grass.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js':   'application/javascript; charset=UTF-8',
    '.mjs':  'application/javascript; charset=UTF-8',
    '.css':  'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon'
};

function resolveSafeStaticPath(pathname) {
    const clean = pathname.replace(/^\/+/, '');
    let candidate;

    if (clean === '' || clean === 'index.html') {
        candidate = path.join(__dirname, 'index.html');
    } else if (clean === 'configure/grass.json') {
        candidate = CONFIG_FILE;
    } else if (clean.startsWith('shared/')) {
        candidate = path.resolve(PROJECT_ROOT, clean);
    } else if (clean.startsWith('three.js/')) {
        candidate = path.resolve(PROJECT_ROOT, clean);
    } else if (clean.startsWith('grassStudy/')) {
        candidate = path.resolve(PROJECT_ROOT, clean);
    } else {
        candidate = path.resolve(__dirname, clean);
    }

    const rel = path.relative(PROJECT_ROOT, candidate);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return null;
    }
    return candidate;
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    if (pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            server: true,
            port: PORT,
            targetConfig: 'three.js/configure/grass.json'
        }));
        return;
    }

    if (pathname === '/api/load-config' && req.method === 'GET') {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const content = fs.readFileSync(CONFIG_FILE, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(content);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Config file not found on disk' }));
            }
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (pathname === '/api/save-config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const targetDir = path.dirname(CONFIG_FILE);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(parsed, null, 2), 'utf8');
                console.log(`[Grass Lab Server] Successfully wrote config to ${CONFIG_FILE}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Saved to three.js/configure/grass.json',
                    timestamp: Date.now()
                }));
            } catch (err) {
                console.error('[Grass Lab Server] Save error:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    const filePath = resolveSafeStaticPath(pathname);
    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('403 Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`\n============================================================`);
    console.log(`  🌿 Grass Study Lab Server running at:`);
    console.log(`  ➔ Local:   http://localhost:${PORT}/`);
    console.log(`  ➔ Target:  ${CONFIG_FILE}`);
    console.log(`============================================================\n`);
});
