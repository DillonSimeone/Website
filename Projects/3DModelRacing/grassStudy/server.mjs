import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8099;
const CONFIG_FILE = path.resolve(__dirname, '../three.js/configure/grass.json');

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

const server = http.createServer((req, res) => {
    // Enable CORS for flexibility across local origins
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

    // API: Server Status / Ping
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

    // API: Load Config from three.js/configure/grass.json
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

    // API: Save Config to three.js/configure/grass.json
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

    // Static File Serving
    let relativePath = pathname === '/' ? '/index.html' : pathname;
    let filePath = path.join(__dirname, relativePath);

    // Support serving the configure/grass.json directly if requested
    if (pathname === '/configure/grass.json') {
        filePath = CONFIG_FILE;
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
