/**
 * Local static server + fleet API proxy for workshop presentations.
 * Serves Haxel folder on localhost and proxies /api/fleet → http://192.168.4.1/json/fleet
 *
 * Usage: node presentation-server.js
 * Env:   HAXEL_HUB=192.168.4.1  PORT=8765
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8765;
const HUB = process.env.HAXEL_HUB || '192.168.4.1';
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.md': 'text/markdown; charset=utf-8',
    '.ico': 'image/x-icon'
};

function send(res, status, body, type = 'text/plain') {
    res.writeHead(status, {
        'Content-Type': type,
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
}

function proxyFleet(req, res) {
    const options = {
        hostname: HUB,
        port: 80,
        path: '/json/fleet',
        method: req.method,
        headers: { 'Content-Type': 'application/json' }
    };

    const proxyReq = http.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
            res.writeHead(proxyRes.statusCode, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(data);
        });
    });

    proxyReq.on('error', () => {
        send(res, 502, JSON.stringify({ ok: false, error: 'hub unreachable', hub: HUB }), 'application/json');
    });

    if (req.method === 'POST' || req.method === 'PUT') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            proxyReq.write(body);
            proxyReq.end();
        });
    } else {
        proxyReq.end();
    }
}

function serveStatic(req, res) {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/presentation.html';
    const filePath = path.join(ROOT, urlPath.replace(/^\//, ''));

    if (!filePath.startsWith(ROOT)) {
        send(res, 403, 'Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            send(res, 404, 'Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        send(res, 200, data, MIME[ext] || 'application/octet-stream');
    });
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/fleet')) {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end();
            return;
        }
        proxyFleet(req, res);
        return;
    }
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`Haxel presentation server: http://localhost:${PORT}/presentation.html`);
});
