/**
 * MYT Video Capture Hub & Sync Gateway
 * 
 * Works on ANY Wi-Fi capable computer: laptops, desktops, mini-PCs, or Intel NUCs.
 * Supports Windows, macOS, and Linux.
 * 
 * Capabilities:
 *  - Native HTTP static server for PWA client (zero npm dependencies required).
 *  - High-precision WebSocket & HTTP Master Clock Sync for client offset calculation.
 *  - Chunked resumable video receiver -> deterministic folder hierarchy.
 *  - UDisc compatible scorecard storage & export.
 *  - System diagnostics endpoint (checks Node.js, Python, FFmpeg).
 */

const http = require('http');
const https = require('https');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const { checkEnvironment } = require('./check_environment');

let QRCode = null;
try {
  QRCode = require('./qrcode.bundle.js');
} catch (e) {
  try {
    QRCode = require('qrcode');
  } catch (e2) {}
}

const PORT = parseInt(process.env.PORT || '3457', 10);
const BASE_STORAGE = path.join(__dirname, 'storage', 'recordings');
const CONFIG_DIR = path.join(__dirname, 'storage', 'config');
const CERTS_DIR = path.join(__dirname, 'storage', 'certs');
const CERT_FILE = path.join(CERTS_DIR, 'cert.pem');
const KEY_FILE = path.join(CERTS_DIR, 'key.pem');
const ROSTER_FILE = path.join(CONFIG_DIR, 'roster.json');
const SESSIONS_FILE = path.join(CONFIG_DIR, 'sessions.json');

// Ensure SSL/TLS Self-Signed Certificates with mDNS & LAN IP SANs
function ensureCertificates(lanIps = []) {
  if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    try {
      return {
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE)
      };
    } catch (e) {}
  }

  // Locate OpenSSL executable
  const candidateBins = [
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'openssl'
  ];

  let openssl = null;
  for (const b of candidateBins) {
    if (b.includes('\\') && fs.existsSync(b)) {
      openssl = `"${b}"`;
      break;
    }
  }

  if (!openssl) {
    try {
      execSync('openssl version', { stdio: 'ignore' });
      openssl = 'openssl';
    } catch (e) {}
  }

  if (openssl) {
    try {
      const sanList = [
        'DNS:myt.local',
        'DNS:myt-hub.local',
        'DNS:localhost',
        'IP:127.0.0.1',
        ...lanIps.map(ip => `IP:${ip}`)
      ].join(',');

      const cmd = `${openssl} req -x509 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" -days 730 -nodes -subj "/CN=myt.local/O=MYT Capture Hub" -addext "subjectAltName=${sanList}"`;
      execSync(cmd, { stdio: 'ignore' });
      console.log('✓ SSL/TLS Certificates generated with mDNS & LAN IP SANs:', sanList);
      return {
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE)
      };
    } catch (err) {
      console.error('OpenSSL generation error:', err.message);
    }
  }

  return null;
}

// Multicast DNS (mDNS) responder for myt.local on 224.0.0.251:5353
function startMdnsResponder(lanIps = []) {
  try {
    const mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    mdnsSocket.on('error', (err) => {
      console.log('[mDNS] Notice:', err.message);
    });

    mdnsSocket.on('message', (msg) => {
      try {
        const queryStr = msg.toString('binary');
        if (queryStr.includes('myt') && queryStr.includes('local')) {
          const primaryIp = lanIps[0] || '127.0.0.1';
          const ipParts = primaryIp.split('.').map(Number);
          if (ipParts.length !== 4) return;

          const header = Buffer.from([
            msg[0], msg[1], // Transaction ID matching query
            0x84, 0x00,     // Flags: Response, Opcode 0, AA
            0x00, 0x00,     // QDCOUNT (0)
            0x00, 0x01,     // ANCOUNT (1 answer)
            0x00, 0x00,     // NSCOUNT (0)
            0x00, 0x00      // ARCOUNT (0)
          ]);

          const qName = Buffer.from([0x03, 0x6d, 0x79, 0x74, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00]);
          const record = Buffer.from([
            0x00, 0x01,             // Type: A
            0x80, 0x01,             // Class: IN (cache flush)
            0x00, 0x00, 0x00, 0x78, // TTL: 120s
            0x00, 0x04,             // RDLENGTH: 4
            ipParts[0], ipParts[1], ipParts[2], ipParts[3]
          ]);

          const response = Buffer.concat([header, qName, record]);
          mdnsSocket.send(response, 0, response.length, 5353, '224.0.0.251');
        }
      } catch (e) {}
    });

    mdnsSocket.bind(5353, () => {
      try {
        mdnsSocket.addMembership('224.0.0.251');
        console.log('[mDNS] Broadcasting "https://myt.local:' + PORT + '" on 224.0.0.251:5353');
      } catch (e) {
        console.log('[mDNS] Membership notice:', e.message);
      }
    });
  } catch (err) {
    console.log('[mDNS] Notice:', err.message);
  }
}

// Phones on the same Wi-Fi find the hub by UDP. The Android app probes this port
// and also hears the beacon, then checks the HTTP API before trusting the reply.
const DISCOVERY_PORT = 3458;
const DISCOVERY_PROBE = 'MYT-DISCOVER';
let discoverySocket = null;

function ipv4Broadcast(ip, netmask) {
  const ipParts = String(ip || '').split('.').map(Number);
  const maskParts = String(netmask || '').split('.').map(Number);
  if (ipParts.length !== 4 || maskParts.length !== 4) return null;
  if (ipParts.some(n => Number.isNaN(n)) || maskParts.some(n => Number.isNaN(n))) return null;
  return ipParts.map((part, i) => (part | (~maskParts[i] & 255)) & 255).join('.');
}

function discoveryPayload() {
  const addresses = getLocalNetworkAddresses().filter(a => a.address && !a.address.startsWith('169.254.'));
  return Buffer.from(JSON.stringify({
    service: 'myt-capture-hub',
    name: os.hostname() || 'MYT Capture Hub',
    httpPort: PORT - 1,
    urls: addresses.map(a => `http://${a.address}:${PORT - 1}`)
  }));
}

function startDiscoveryBeacon() {
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    discoverySocket = socket;

    socket.on('error', (err) => {
      console.log('[DISCOVERY] Notice:', err.message);
    });

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8').trim();
      if (text !== DISCOVERY_PROBE) return;
      try {
        socket.send(discoveryPayload(), rinfo.port, rinfo.address);
      } catch (e) {}
    });

    socket.bind(DISCOVERY_PORT, () => {
      try { socket.setBroadcast(true); } catch (e) {}
      console.log(`[DISCOVERY] Phones can find this hub on UDP ${DISCOVERY_PORT}`);
    });

    const announce = () => {
      const payload = discoveryPayload();
      const targets = new Set(['255.255.255.255']);
      for (const addr of getLocalNetworkAddresses()) {
        const bcast = ipv4Broadcast(addr.address, addr.netmask);
        if (bcast) targets.add(bcast);
      }
      for (const target of targets) {
        try { socket.send(payload, DISCOVERY_PORT, target); } catch (e) {}
      }
    };

    const timer = setInterval(announce, 2000);
    if (typeof timer.unref === 'function') timer.unref();
  } catch (err) {
    console.log('[DISCOVERY] Notice:', err.message);
  }
}

// Ensure base storage & config directories exist
if (!fs.existsSync(BASE_STORAGE)) {
  fs.mkdirSync(BASE_STORAGE, { recursive: true });
}
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

const DEFAULT_PLAYERS = [
  { id: "p_mayan", name: "Mayan Fogarty", udisc: "mayan_f", avatar: "MF", desc: "Philomath disc golfer" },
  { id: "p_nate", name: "Nate", udisc: "m33td00m", avatar: "N", desc: "Disc golf enthusiast" },
  { id: "p_eagle", name: "Eagle McMahon", udisc: "eagle_m", avatar: "EM", desc: "Pro MPO Disc Golfer" },
  { id: "p_paul", name: "Paul McBeth", udisc: "pmcbeth", avatar: "PM", desc: "6x World Champion" }
];

const DEFAULT_SESSIONS = [
  {
    id: "session_1",
    name: "Mary's River Park - Card A",
    course: "Mary's River Park",
    layout: "Main - Par 28 (9 Holes)",
    breadcrumb: "United States / Oregon / Philomath",
    timestampText: "Sep 22, 2026 2:37 PM",
    holeCount: 9,
    holes: [
      { number: 1, par: 3 }, { number: 2, par: 3 }, { number: 3, par: 3 },
      { number: 4, par: 3 }, { number: 5, par: 4 }, { number: 6, par: 3 },
      { number: 7, par: 3 }, { number: 8, par: 3 }, { number: 9, par: 3 }
    ],
    playerIds: ["p_mayan", "p_nate"],
    scores: {}
  },
  {
    id: "session_2",
    name: "Pier Park - Feature Card",
    course: "Pier Park DGC",
    layout: "Championship 18 - Par 54 (18 Holes)",
    breadcrumb: "United States / Oregon / Portland",
    timestampText: "Sep 22, 2026 10:15 AM",
    holeCount: 18,
    holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: (i === 4 || i === 11) ? 4 : 3 })),
    playerIds: ["p_eagle", "p_paul"],
    scores: {}
  }
];

function getDiscoveredRoster() {
  let players = [...DEFAULT_PLAYERS];
  if (fs.existsSync(ROSTER_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) players = data;
    } catch (e) {}
  }

  // Auto-discover any player folders on disk (e.g. shrek)
  if (fs.existsSync(BASE_STORAGE)) {
    try {
      const entries = fs.readdirSync(BASE_STORAGE, { withFileTypes: true });
      let changed = false;
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const slug = ent.name.toLowerCase();
          const exists = players.some(p => 
            (p.name && p.name.toLowerCase().replace(/\s+/g, '_') === slug) || 
            (p.udisc && p.udisc.toLowerCase() === slug) ||
            p.id === `p_${slug}`
          );
          if (!exists) {
            const displayName = slug.replace(/_/g, ' ');
            const avatar = slug.length >= 2 ? slug.substring(0, 2).toUpperCase() : 'PL';
            players.push({
              id: `p_${slug}`,
              name: displayName,
              udisc: slug,
              avatar,
              desc: 'Discovered from recorded folders on disk'
            });
            changed = true;
          }
        }
      }
      if (changed || !fs.existsSync(ROSTER_FILE)) {
        fs.writeFileSync(ROSTER_FILE, JSON.stringify(players, null, 2));
      }
    } catch (e) {}
  }
  return players;
}

function getDiscoveredSessions() {
  let sessions = [...DEFAULT_SESSIONS];
  if (fs.existsSync(SESSIONS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) sessions = data;
    } catch (e) {}
  } else {
    try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2)); } catch (e) {}
  }
  return sessions;
}

// Helper to resolve session directory robustly
function getSessionDir(playerSlug, dateStr, sessionId) {
  const cleanId = String(sessionId || 'session_1');
  const directDir = path.join(BASE_STORAGE, playerSlug, dateStr, cleanId);
  if (fs.existsSync(directDir)) return { dir: directDir, folderName: cleanId };

  const sFolder = cleanId.startsWith('session_') ? cleanId : `session_${cleanId}`;
  const stdDir = path.join(BASE_STORAGE, playerSlug, dateStr, sFolder);
  if (fs.existsSync(stdDir)) return { dir: stdDir, folderName: sFolder };

  const doubleDir = path.join(BASE_STORAGE, playerSlug, dateStr, `session_${cleanId}`);
  if (fs.existsSync(doubleDir)) return { dir: doubleDir, folderName: `session_${cleanId}` };

  return { dir: stdDir, folderName: sFolder };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containerExtFromType(contentType) {
  const t = String(contentType || '').toLowerCase();
  if (t.includes('mp4') || t.includes('m4v') || t.includes('quicktime')) return 'mp4';
  return 'webm';
}

function concatSliceBytes(rawDir, slices, destPath) {
  fs.writeFileSync(destPath, Buffer.alloc(0));
  for (const name of slices) {
    fs.appendFileSync(destPath, fs.readFileSync(path.join(rawDir, name)));
  }
}

function recordTakeMeta(sessionDir, folderName, playerSlug, dateStr, takeFilename, hole, osName, browserName, slices, takePath) {
  const metaPath = path.join(sessionDir, 'session_meta.json');
  if (!fs.existsSync(metaPath)) return;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.takes = meta.takes || [];
    const firstSlice = meta.clips?.find(c => c.filename === slices[0]);
    const lastSlice = meta.clips?.find(c => c.filename === slices[slices.length - 1]);
    const takeStats = fs.statSync(takePath);
    const takeEntry = {
      filename: takeFilename,
      hole,
      os: osName,
      browser: browserName,
      startEpoch: firstSlice ? firstSlice.startEpoch : (Date.now() - slices.length * 5000),
      endEpoch: lastSlice ? lastSlice.endEpoch : Date.now(),
      durationSec: (lastSlice && firstSlice) ? (lastSlice.endEpoch - firstSlice.startEpoch) / 1000 : (slices.length * 5),
      slicesCount: slices.length,
      bytes: takeStats.size,
      url: `/storage/recordings/${playerSlug}/${dateStr}/${folderName}/takes/${encodeURIComponent(takeFilename)}`,
      isTake: true,
      mergedAt: Date.now()
    };
    const existingIdx = meta.takes.findIndex(t => t.filename === takeFilename);
    if (existingIdx >= 0) meta.takes[existingIdx] = takeEntry;
    else meta.takes.push(takeEntry);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  } catch (e) {}
}

// Automated Slice Merger: Concatenates contiguous slices into a complete video when recording stops.
// Chrome/Firefox send WebM. iPhone Safari sends fragmented MP4.
function mergeSlicesForTake(playerSlug, dateStr, sessionId, hole, osName, browserName) {
  const { dir: sessionDir, folderName } = getSessionDir(playerSlug, dateStr, sessionId);
  const rawDir = path.join(sessionDir, 'raw');
  const takesDir = path.join(sessionDir, 'takes');
  if (!fs.existsSync(rawDir)) return;
  if (!fs.existsSync(takesDir)) fs.mkdirSync(takesDir, { recursive: true });

  const allFiles = fs.readdirSync(rawDir);
  for (const ext of ['webm', 'mp4']) {
    const pattern = new RegExp(
      `^slice_(\\d+)_${escapeRegExp(hole)}_.*_${escapeRegExp(osName)}_${escapeRegExp(browserName)}\\.${ext}$`,
      'i'
    );
    const slices = allFiles.filter(f => pattern.test(f)).sort();
    if (slices.length === 0) continue;

    const takeFilename = `take_${hole}_${osName}_${browserName}.${ext}`;
    const takePath = path.join(takesDir, takeFilename);

    const finish = (err) => {
      if (err) {
        console.error(`[MERGER ERROR] ${takeFilename}:`, err.message || err);
        return;
      }
      if (!fs.existsSync(takePath) || fs.statSync(takePath).size === 0) {
        console.error(`[MERGER ERROR] ${takeFilename}: output missing`);
        return;
      }
      console.log(`[MERGER SUCCESS] Stitched complete video: ${takeFilename} (${slices.length} slices)`);
      recordTakeMeta(sessionDir, folderName, playerSlug, dateStr, takeFilename, hole, osName, browserName, slices, takePath);
    };

    if (ext === 'mp4') {
      try {
        concatSliceBytes(rawDir, slices, takePath);
      } catch (e) {
        finish(e);
        continue;
      }
      const remuxPath = path.join(takesDir, `remux_${takeFilename}`);
      exec(`ffmpeg -y -i "${takePath}" -c copy -movflags +faststart "${remuxPath}"`, (err) => {
        if (!err && fs.existsSync(remuxPath) && fs.statSync(remuxPath).size > 0) {
          try {
            fs.copyFileSync(remuxPath, takePath);
          } catch (e) {}
        } else {
          console.log(`[MERGER] ${takeFilename} kept as fragmented MP4 (ffmpeg remux skipped)`);
        }
        try { fs.unlinkSync(remuxPath); } catch (e) {}
        finish(null);
      });
      continue;
    }

    const concatPath = path.join(takesDir, `concat_${hole}_${osName}_${browserName}.txt`);
    const concatContent = slices.map(s => `file '${path.join(rawDir, s).replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatPath, concatContent);
    exec(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c copy "${takePath}"`, (err) => {
      try { fs.unlinkSync(concatPath); } catch (e) {}
      if (err) {
        try {
          concatSliceBytes(rawDir, slices, takePath);
          finish(null);
        } catch (e) {
          finish(err);
        }
        return;
      }
      finish(null);
    });
  }
}

// In-memory connected clients for live telemetry
const connectedClients = new Map();

// Helper to get local network IP addresses
function getLocalNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address, netmask: iface.netmask });
      }
    }
  }
  return addresses;
}

// Helper to parse multipart or JSON request bodies
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(buffer.toString('utf-8')));
        } catch (e) {
          resolve(buffer);
        }
      } else {
        resolve(buffer);
      }
    });
    req.on('error', reject);
  });
}

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=UTF-8',
  '.apk': 'application/vnd.android.package-archive'
};

// Main HTTP/HTTPS Request Handler
const requestHandler = async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  // CORS headers for multi-device local network capture
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id, X-Session-Id, X-Chunk-Index, X-Player-Slug, X-Hole, X-OS, X-Browser, X-Timestamp-Iso, X-Start-Epoch, X-End-Epoch, X-Is-Final');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API Endpoints ---

  // 1. High-precision HTTP Clock Sync Ping (Fallback for WS)
  if (pathname === '/api/clock/ping') {
    const clientTime = parseInt(urlObj.searchParams.get('t') || '0', 10);
    const serverTime = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ clientTime, serverTime, serverHighRes: process.hrtime.bigint().toString() }));
    return;
  }

  // 2. System Diagnostics Check (Node, Python, FFmpeg, Packages)
  if (pathname === '/api/system/diagnostics') {
    try {
      const report = checkEnvironment();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 2b. QR Code Generator for Quick Mobile Camera Join (SVG)
  if (pathname === '/api/qrcode' && req.method === 'GET') {
    try {
      const addresses = getLocalNetworkAddresses();
      const targetQuery = urlObj.searchParams.get('url');
      const mode = (urlObj.searchParams.get('mode') || 'http').toLowerCase();
      const primaryIp = addresses[0] ? addresses[0].address : 'localhost';
      const port = mode === 'https' ? PORT : (PORT - 1);
      const protocol = mode === 'https' ? 'https' : 'http';
      const defaultUrl = mode === 'apk'
        ? `http://${primaryIp}:${PORT - 1}/downloads/MYT-Capture.apk`
        : `${protocol}://${primaryIp}:${port}`;
      const primaryUrl = targetQuery || defaultUrl;

      if (QRCode && QRCode.toString) {
        QRCode.toString(primaryUrl, { type: 'svg', margin: 2, color: { dark: '#0a0f1d', light: '#ffffff' } }, (err, svg) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error generating QR code');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
          res.end(svg);
        });
        return;
      }
    } catch (e) {
      console.error('[QRCODE ERROR]', e);
    }
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('QR Code generator unavailable');
    return;
  }

  // 2c. Network Endpoints for Mobile QR Code & mDNS Info
  if (pathname === '/api/network/endpoints' && req.method === 'GET') {
    const addresses = getLocalNetworkAddresses();
    const primaryIp = addresses[0] ? addresses[0].address : '127.0.0.1';
    const portHttps = PORT;
    const portHttp = PORT - 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      portHttps,
      portHttp,
      primaryIp,
      httpUrl: `http://${primaryIp}:${portHttp}`,
      httpsUrl: `https://${primaryIp}:${portHttps}`,
      apkUrl: `http://${primaryIp}:${portHttp}/downloads/MYT-Capture.apk`,
      mdnsHttpUrl: `http://myt.local:${portHttp}`,
      mdnsHttpsUrl: `https://myt.local:${portHttps}`,
      lanUrls: addresses.map(a => ({
        httpUrl: `http://${a.address}:${portHttp}`,
        httpsUrl: `https://${a.address}:${portHttps}`,
        name: a.name,
        ip: a.address
      })),
      isHttps: true
    }));
    return;
  }

  // 3. Connected Clients & Network Telemetry
  if (pathname === '/api/telemetry/clients') {
    const now = Date.now();
    const clientsList = Array.from(connectedClients.values()).filter(c => (now - (c.lastSeen || c.lastPing || 0)) < 60000);

    // Compute disk storage metrics
    let totalSlices = 0;
    let totalStorageBytes = 0;
    try {
      const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full);
          else if (ent.name.endsWith('.webm') || ent.name.endsWith('.mp4')) {
            totalSlices++;
            totalStorageBytes += fs.statSync(full).size;
          }
        }
      };
      walk(BASE_STORAGE);
    } catch (e) {}

    const netAddrs = getLocalNetworkAddresses();
    const uptimeSec = Math.round(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;
    const uptimeFormatted = `${hours > 0 ? hours + 'h ' : ''}${mins}m ${secs}s`;

    const hostInfo = {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.version,
      uptimeFormatted,
      uptimeSec,
      memoryRssMb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
      lanIps: netAddrs.map(a => a.address),
      primaryLanIp: netAddrs.length > 0 ? netAddrs[0].address : '127.0.0.1',
      primaryInterfaceName: netAddrs.length > 0 ? netAddrs[0].name : 'Local',
      port: PORT,
      totalSlices,
      totalStorageMb: (totalStorageBytes / (1024 * 1024)).toFixed(1),
      masterClockEpoch: now
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ clients: clientsList, hostInfo, masterClockEpoch: now }));
    return;
  }

  // 3b. Telemetry Heartbeat / Device State Push
  if (pathname === '/api/telemetry/heartbeat' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const payload = typeof data === 'object' ? data : JSON.parse(data.toString());
      const devId = payload.deviceId || 'Host Computer';

      let clientIp = req.socket.remoteAddress || '127.0.0.1';
      if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');
      if (clientIp === '::1') clientIp = '127.0.0.1';

      connectedClients.set(devId, {
        id: devId,
        deviceId: devId,
        filmingPlayer: payload.filmingPlayer || 'Player',
        ip: clientIp,
        rttMs: payload.rttMs !== undefined ? payload.rttMs : 1.2,
        offsetMs: payload.offsetMs !== undefined ? payload.offsetMs : 0.0,
        connectionType: payload.connectionType || (clientIp === '127.0.0.1' ? 'Local Host (Loopback)' : 'Wi-Fi / LAN'),
        status: payload.status || 'Active Host',
        activeHole: payload.activeHole || 'H1',
        slicesStreamed: payload.slicesStreamed || 0,
        battery: payload.battery || null,
        lastSeen: Date.now()
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'OK' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 4. Session Manifest Ingestion
  if (pathname === '/api/sessions' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const session = typeof data === 'object' ? data : JSON.parse(data.toString());
      const playerSlug = session.player_slug || 'default_player';
      const dateStr = new Date(session.start_epoch_nuc_ms || Date.now()).toISOString().split('T')[0];
      const sessionDir = path.join(BASE_STORAGE, playerSlug, dateStr, `session_${session.session_uuid}`);
      
      fs.mkdirSync(path.join(sessionDir, 'raw'), { recursive: true });
      fs.mkdirSync(path.join(sessionDir, 'processed'), { recursive: true });

      fs.writeFileSync(path.join(sessionDir, 'session_meta.json'), JSON.stringify(session, null, 2));

      if (session.scorecard) {
        fs.writeFileSync(path.join(sessionDir, 'scorecard.json'), JSON.stringify(session.scorecard, null, 2));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'SUCCESS', sessionDir }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ERROR', message: err.message }));
    }
    return;
  }

  // 4b. Roster Persistence API (Registered Players)
  if (pathname === '/api/roster') {
    if (req.method === 'GET') {
      const players = getDiscoveredRoster();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ players }));
      return;
    }
    if (req.method === 'POST') {
      try {
        const data = await parseBody(req);
        const payload = typeof data === 'object' ? data : JSON.parse(data.toString());
        let currentPlayers = getDiscoveredRoster();

        if (Array.isArray(payload)) {
          currentPlayers = payload;
        } else if (payload.players && Array.isArray(payload.players)) {
          currentPlayers = payload.players;
        } else if (payload.name) {
          const exists = currentPlayers.some(p => p.id === payload.id || p.name.toLowerCase() === payload.name.toLowerCase());
          if (!exists) currentPlayers.push(payload);
        }

        fs.writeFileSync(ROSTER_FILE, JSON.stringify(currentPlayers, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ROSTER_SAVED', players: currentPlayers }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
  }

  // 4c. Sessions Manifest Persistence API
  if (pathname === '/api/sessions/manifest') {
    if (req.method === 'GET') {
      const sessions = getDiscoveredSessions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
      return;
    }
    if (req.method === 'POST') {
      try {
        const data = await parseBody(req);
        const payload = typeof data === 'object' ? data : JSON.parse(data.toString());
        let currentSessions = getDiscoveredSessions();

        if (Array.isArray(payload)) {
          currentSessions = payload;
        } else if (payload.sessions && Array.isArray(payload.sessions)) {
          currentSessions = payload.sessions;
        } else if (payload.id) {
          const idx = currentSessions.findIndex(s => s.id === payload.id);
          if (idx >= 0) currentSessions[idx] = payload;
          else currentSessions.push(payload);
        }

        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(currentSessions, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'SESSIONS_SAVED', sessions: currentSessions }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
  }

  // 5. List Saved Sessions
  if (pathname === '/api/sessions' && req.method === 'GET') {
    try {
      const sessions = getDiscoveredSessions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5b. Delete Session (Admin Only)
  if (pathname === '/api/sessions/delete' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const payload = typeof data === 'object' ? data : JSON.parse(data.toString());
      const sessionId = payload.sessionId;
      let deleted = false;
      if (sessionId && fs.existsSync(BASE_STORAGE)) {
        const players = fs.readdirSync(BASE_STORAGE);
        for (const p of players) {
          const pPath = path.join(BASE_STORAGE, p);
          if (fs.statSync(pPath).isDirectory()) {
            const dates = fs.readdirSync(pPath);
            for (const d of dates) {
              const dPath = path.join(pPath, d);
              if (fs.statSync(dPath).isDirectory()) {
                const sDirs = fs.readdirSync(dPath);
                for (const s of sDirs) {
                  if (s === `session_${sessionId}` || s === sessionId) {
                    const targetDir = path.join(dPath, s);
                    fs.rmSync(targetDir, { recursive: true, force: true });
                    deleted = true;
                  }
                }
              }
            }
          }
        }
        // Also remove from SESSIONS_FILE
        try {
          let sessions = getDiscoveredSessions();
          sessions = sessions.filter(s => s.id !== sessionId);
          fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
        } catch (e) {}
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: deleted ? 'DELETED' : 'NOT_FOUND', sessionId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5c. Get Clips for a Player (for Smart Sync Studio)
  if (pathname === '/api/clips' && req.method === 'GET') {
    try {
      const playerQuery = urlObj.searchParams.get('player') || '';
      const playerSlug = playerQuery.toLowerCase().replace(/\s+/g, '_');
      const clips = [];
      if (fs.existsSync(BASE_STORAGE)) {
        const players = playerSlug ? [playerSlug] : fs.readdirSync(BASE_STORAGE);
        for (const p of players) {
          const pPath = path.join(BASE_STORAGE, p);
          if (fs.existsSync(pPath) && fs.statSync(pPath).isDirectory()) {
            const dates = fs.readdirSync(pPath);
            for (const d of dates) {
              const dPath = path.join(pPath, d);
              if (fs.statSync(dPath).isDirectory()) {
                const sDirs = fs.readdirSync(dPath);
                for (const s of sDirs) {
                  const sPath = path.join(dPath, s);
                  const rawDir = path.join(sPath, 'raw');
                  const takesDir = path.join(sPath, 'takes');
                  const metaFile = path.join(sPath, 'session_meta.json');
                  let metaClips = [];
                  let metaTakes = [];
                  if (fs.existsSync(metaFile)) {
                    try {
                      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
                      metaClips = meta.clips || [];
                      metaTakes = meta.takes || [];
                    } catch (e) {}
                  }

                  // 1. Include merged complete takes
                  if (metaTakes.length > 0) {
                    for (const t of metaTakes) {
                      const takeFilename = t.filename || path.basename(t.url || '');
                      const takeFilePath = path.join(takesDir, takeFilename);
                      if (fs.existsSync(takeFilePath)) {
                        clips.push({ ...t, player: p, date: d, session: s, isTake: true });
                      }
                    }
                  } else if (fs.existsSync(takesDir)) {
                    const takeFiles = fs.readdirSync(takesDir);
                    for (const tf of takeFiles) {
                      if (tf.endsWith('.webm') || tf.endsWith('.mp4')) {
                        const stats = fs.statSync(path.join(takesDir, tf));
                        const m = tf.match(/take_(H\d+)_([^_]+)_([^.]+)\.(webm|mp4)$/i);
                        clips.push({
                          filename: tf,
                          hole: m ? m[1] : 'H1',
                          os: m ? m[2] : 'Device',
                          browser: m ? m[3] : 'Browser',
                          startEpoch: stats.mtimeMs - 10000,
                          endEpoch: stats.mtimeMs,
                          durationSec: 10.0,
                          player: p,
                          date: d,
                          session: s,
                          url: `/storage/recordings/${p}/${d}/${s}/takes/${encodeURIComponent(tf)}`,
                          size: stats.size,
                          isTake: true
                        });
                      }
                    }
                  }

                  // 2. Include raw discrete slices
                  if (fs.existsSync(rawDir)) {
                    const rawFiles = fs.readdirSync(rawDir);
                    for (const rf of rawFiles) {
                      if (rf.endsWith('.webm') || rf.endsWith('.mp4')) {
                        const stats = fs.statSync(path.join(rawDir, rf));
                        const clipUrl = `/storage/recordings/${p}/${d}/${s}/raw/${encodeURIComponent(rf)}`;
                        const existing = metaClips.find(c => c.filename === rf);
                        if (existing) {
                          clips.push({ ...existing, player: p, date: d, session: s, url: clipUrl, size: stats.size, isTake: false });
                        } else {
                          const m = rf.match(/slice_(\d+)_(H\d+)_([^_]+)_([^_]+)_([^.]+)\.(webm|mp4)$/i);
                          clips.push({
                            filename: rf,
                            hole: m ? m[2] : 'H1',
                            os: m ? m[4] : 'Device',
                            browser: m ? m[5] : 'Browser',
                            startEpoch: stats.mtimeMs - 5000,
                            endEpoch: stats.mtimeMs,
                            durationSec: 5.0,
                            player: p,
                            date: d,
                            session: s,
                            url: clipUrl,
                            size: stats.size,
                            isTake: false
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ clips }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. Chunk Video Upload Receiver - Saves discrete slices with Hole, Timestamp, OS, and Browser
  if (pathname === '/api/upload/chunk' && req.method === 'POST') {
    try {
      const sessionId = req.headers['x-session-id'] || 'adhoc_session';
      const playerSlug = req.headers['x-player-slug'] || 'player';
      const chunkIndex = parseInt(req.headers['x-chunk-index'] || '1', 10);
      const hole = req.headers['x-hole'] || 'H1';
      const osName = (req.headers['x-os'] || 'OS').replace(/[^a-zA-Z0-9]/g, '');
      const browserName = (req.headers['x-browser'] || 'Browser').replace(/[^a-zA-Z0-9]/g, '');
      const timestampIso = req.headers['x-timestamp-iso'] || new Date().toISOString().replace(/[:.]/g, '-');
      const startEpoch = parseInt(req.headers['x-start-epoch'] || Date.now(), 10);
      const endEpoch = parseInt(req.headers['x-end-epoch'] || (startEpoch + 5000), 10);
      const isFinal = req.headers['x-is-final'] === 'true';

      const dateStr = new Date().toISOString().split('T')[0];
      const sessionDir = path.join(BASE_STORAGE, playerSlug, dateStr, `session_${sessionId}`);
      const rawDir = path.join(sessionDir, 'raw');
      fs.mkdirSync(rawDir, { recursive: true });

      const bodyBuffer = await parseBody(req);

      const ext = containerExtFromType(req.headers['content-type']);
      const sliceFilename = `slice_${String(chunkIndex).padStart(4, '0')}_${hole}_${timestampIso}_${osName}_${browserName}.${ext}`;
      const slicePath = path.join(rawDir, sliceFilename);
      fs.writeFileSync(slicePath, bodyBuffer);

      const fullPath = path.join(rawDir, `full_${osName}_${browserName}.${ext}`);
      fs.appendFileSync(fullPath, bodyBuffer);

      // Update session_meta.json
      const metaPath = path.join(sessionDir, 'session_meta.json');
      let meta = {
        session_uuid: sessionId,
        player_name: playerSlug,
        date: dateStr,
        created_at: Date.now(),
        last_updated: Date.now(),
        slices_received: chunkIndex,
        clips: []
      };
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (e) {}
      }
      meta.last_updated = Date.now();
      meta.slices_received = Math.max(meta.slices_received || 0, chunkIndex);
      meta.clips = meta.clips || [];
      meta.clips.push({
        filename: sliceFilename,
        hole,
        os: osName,
        browser: browserName,
        startEpoch,
        endEpoch,
        durationSec: (endEpoch - startEpoch) / 1000.0,
        bytes: bodyBuffer.length
      });
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

      console.log(`[STORAGE] Saved ${sliceFilename} (${(bodyBuffer.length / 1024).toFixed(1)} KB)`);

      // Trigger automatic slice merger when final slice arrives
      if (isFinal) {
        mergeSlicesForTake(playerSlug, dateStr, sessionId, hole, osName, browserName);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'CHUNK_SAVED',
        chunkIndex,
        sliceFilename,
        slicePath,
        bytesReceived: bodyBuffer.length,
        isFinal
      }));
    } catch (err) {
      console.error('[STORAGE ERROR]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ERROR', message: err.message }));
    }
    return;
  }

  // 6b. Explicit Stop Recording & Finalize Take Merger
  if (pathname === '/api/record/stop' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const payload = typeof data === 'object' ? data : JSON.parse(data.toString());
      const playerSlug = (payload.playerSlug || 'player').toLowerCase().replace(/\s+/g, '_');
      const dateStr = payload.dateStr || new Date().toISOString().split('T')[0];
      const sessionId = payload.sessionId || 'adhoc_session';
      const hole = payload.hole || 'H1';
      const osName = (payload.os || 'OS').replace(/[^a-zA-Z0-9]/g, '');
      const browserName = (payload.browser || 'Browser').replace(/[^a-zA-Z0-9]/g, '');

      mergeSlicesForTake(playerSlug, dateStr, sessionId, hole, osName, browserName);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'MERGE_INITIATED', playerSlug, hole }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Open Folder on Desktop OS API (Windows Explorer, Mac Finder, Linux xdg-open)
  if (pathname === '/api/storage/open-folder' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const payload = typeof data === 'object' ? data : JSON.parse(data.toString());
      const relPath = payload.relativePath || '';
      const fullTarget = path.join(BASE_STORAGE, relPath);
      let targetFolder = fullTarget;
      if (fs.existsSync(fullTarget)) {
        targetFolder = fs.statSync(fullTarget).isFile() ? path.dirname(fullTarget) : fullTarget;
      } else {
        targetFolder = BASE_STORAGE;
      }

      console.log(`[EXPLORER] Opening folder on OS: ${targetFolder}`);
      if (process.platform === 'win32') {
        exec(`explorer.exe "${targetFolder}"`);
      } else if (process.platform === 'darwin') {
        exec(`open "${targetFolder}"`);
      } else {
        exec(`xdg-open "${targetFolder}"`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'OPENED', targetFolder }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 7. Save / Update Scorecard API
  if (pathname === '/api/scorecard' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const scorecard = typeof data === 'object' ? data : JSON.parse(data.toString());
      const sessionId = scorecard.sessionId || 'session_current';
      const playerSlug = (scorecard.players?.[0]?.name || 'shared').toLowerCase().replace(/\s+/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];

      const sessionDir = path.join(BASE_STORAGE, playerSlug, dateStr, `session_${sessionId}`);
      fs.mkdirSync(sessionDir, { recursive: true });

      const scorecardPath = path.join(sessionDir, 'scorecard.json');
      fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2));

      console.log(`[STORAGE] Scorecard updated for session ${sessionId} -> ${scorecardPath}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'SAVED', scorecardPath }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ERROR', message: err.message }));
    }
    return;
  }

  // 8. Storage Files Explorer API (List all on-disk recordings & slices)
  if (pathname === '/api/storage/files' && req.method === 'GET') {
    try {
      const filesList = [];
      function walkDir(currentPath, relPath = '') {
        if (!fs.existsSync(currentPath)) return;
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const ent of entries) {
          const entRel = path.join(relPath, ent.name);
          const entFull = path.join(currentPath, ent.name);
          if (ent.isDirectory()) {
            walkDir(entFull, entRel);
          } else {
            const stat = fs.statSync(entFull);
            filesList.push({
              name: ent.name,
              relativePath: entRel.replace(/\\/g, '/'),
              sizeBytes: stat.size,
              modified: stat.mtime
            });
          }
        }
      }
      walkDir(BASE_STORAGE);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ baseStorage: BASE_STORAGE, totalFiles: filesList.length, files: filesList }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 7. UDisc Scorecard Export
  if (pathname === '/api/scorecard/udisc/export') {
    try {
      const sessionId = urlObj.searchParams.get('session_id');
      // Look for scorecard.json across storage
      let foundScorecard = null;
      // Search files if session specified or return demo UDisc CSV
      if (sessionId) {
        // Find session
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': 'attachment; filename="udisc_scorecard.csv"'
      });
      res.end("PlayerName,CourseName,LayoutName,Date,Total,+/- ,Hole1,Hole2,Hole3,Hole4,Hole5,Hole6,Hole7,Hole8,Hole9\n");
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- Static Asset Serving ---
  let safePath = pathname === '/' ? 'index.html' : pathname;
  try {
    safePath = decodeURIComponent(safePath);
  } catch (e) {}
  let filePath = path.join(__dirname, safePath);

  // Security check: ensure path is inside project directory
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Favicon fallback handler
  if (pathname === '/favicon.ico' && !fs.existsSync(filePath)) {
    const svgFavicon = path.join(__dirname, 'favicon.svg');
    if (fs.existsSync(svgFavicon)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      fs.createReadStream(svgFavicon).pipe(res);
      return;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Support HTTP 206 Partial Content for smooth video scrub & playback
    const range = req.headers.range;
    if (range && (ext === '.webm' || ext === '.mp4')) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      file.pipe(res);
      return;
    }

    const headers = {
      'Content-Length': stats.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    if (ext === '.apk') {
      headers['Content-Disposition'] = 'attachment; filename="MYT-Capture.apk"';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });
};

// --- Zero-Dependency WebSocket Server Implementation ---
// Implements RFC 6455 framing so clock sync works natively on any machine without npm install!
function handleWebSocketUpgrade(req, socket, head) {
  const host = req.headers.host || 'localhost';
  const urlObj = new URL(req.url, `https://${host}`);
  if (urlObj.pathname === '/ws/clock') {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`
    ];
    socket.write(headers.join('\r\n') + '\r\n\r\n');

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    connectedClients.set(clientId, {
      id: clientId,
      connectedAt: Date.now(),
      ip: req.socket.remoteAddress,
      lastPing: Date.now(),
      rttMs: 0,
      offsetMs: 0
    });

    socket.on('data', (buffer) => {
      // Decode WebSocket unmasked frame or masked client frame
      try {
        const decoded = decodeWsFrame(buffer);
        if (!decoded) return;
        if (decoded.opcode === 8) {
          // Close frame
          connectedClients.delete(clientId);
          socket.end();
          return;
        }
        if (decoded.opcode === 1) {
          // Text frame
          const msg = JSON.parse(decoded.payload.toString('utf-8'));
          if (msg.type === 'ping') {
            const serverTime = Date.now();
            const clientTime = msg.clientTime;
            const rtt = serverTime - clientTime;
            const offset = serverTime - (clientTime + rtt / 2);

            const clientRecord = connectedClients.get(clientId);
            if (clientRecord) {
              clientRecord.lastPing = serverTime;
              clientRecord.rttMs = rtt;
              clientRecord.offsetMs = offset;
              clientRecord.deviceId = msg.deviceId || clientRecord.deviceId;
              clientRecord.angle = msg.angle || clientRecord.angle;
            }

            const response = JSON.stringify({
              type: 'pong',
              clientTime,
              serverTime,
              clientId
            });
            socket.write(encodeWsFrame(response));
          }
        }
      } catch (e) {
        // Frame parsing error
      }
    });

    socket.on('close', () => {
      connectedClients.delete(clientId);
    });

    socket.on('error', () => {
      connectedClients.delete(clientId);
    });
  } else {
    socket.destroy();
  }
}

// Helper: Decode basic WebSocket Frame
function decodeWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const isMasked = (secondByte & 0x80) === 0x80;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    // 64-bit length not required for tiny ping/pong
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let maskingKey = null;
  if (isMasked) {
    maskingKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  const payload = buffer.slice(offset, offset + payloadLength);
  if (isMasked && maskingKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskingKey[i % 4];
    }
  }

  return { opcode, payload };
}

// Helper: Encode basic WebSocket Text Frame
function encodeWsFrame(text) {
  const payload = Buffer.from(text, 'utf-8');
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

// Start Server: Enforce HTTPS mode + mDNS & HTTP Redirect
const addresses = getLocalNetworkAddresses();
const credentials = ensureCertificates(addresses.map(a => a.address));

let server;
let isHttps = false;

if (credentials) {
  server = https.createServer(credentials, requestHandler);
  isHttps = true;

  // Handle plain HTTP clients hitting HTTPS port -> redirect to HTTPS
  server.on('clientError', (err, socket) => {
    if (err.code === 'ERR_SSL_HTTP_REQUEST' || (err.message && err.message.includes('http request'))) {
      const redirectPayload = `HTTP/1.1 302 Found\r\nLocation: https://myt.local:${PORT}/\r\nConnection: close\r\n\r\n`;
      socket.end(redirectPayload);
      return;
    }
    socket.destroy();
  });
} else {
  server = http.createServer(requestHandler);
}

// Attach WebSocket Upgrade Handler
server.on('upgrade', handleWebSocketUpgrade);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${PORT} is currently in use by a background process.`);
    console.error(`   The launch script will automatically free port ${PORT} on next start.`);
    console.error(`   You can also free it manually via start_hub.bat.\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// Start Full Native HTTP Server on PORT - 1 (e.g., 3456) for zero-warning, instant normal loading!
const PORT_HTTP = PORT - 1;
const httpServer = http.createServer(requestHandler);
httpServer.on('upgrade', handleWebSocketUpgrade);
httpServer.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') {
    console.error('[HTTP SERVER ERROR]', err);
  }
});
try {
  httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
    console.log(`[HTTP SERVER] Running normal HTTP on port ${PORT_HTTP} (Zero Warnings / Normal Load)`);
  });
} catch (e) {}

// Start Multicast DNS responder for myt.local
startMdnsResponder(addresses.map(a => a.address));
startDiscoveryBeacon();

// Clean Shutdown Handlers
function cleanShutdown(signal) {
  console.log(`\n[SERVER] Received ${signal}. Closing server cleanly...`);
  try { if (discoverySocket) discoverySocket.close(); } catch (e) {}
  try { httpServer.close(); } catch (e) {}
  server.close(() => {
    console.log('[SERVER] All network ports released.');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', () => cleanShutdown('SIGINT'));
process.on('SIGTERM', () => cleanShutdown('SIGTERM'));

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log(' 🚀 MYT Capture Hub & Sync Gateway is Running!       ');
  console.log('======================================================');
  console.log(` Normal HTTP Mode   : http://localhost:${PORT_HTTP}  (Loads Normally, Zero Warnings)`);
  console.log(` Secure HTTPS Mode  : https://localhost:${PORT} (For Mobile Camera Access)`);
  console.log(` mDNS Friendly URL  : http://myt.local:${PORT_HTTP}  /  https://myt.local:${PORT}`);
  console.log(' Wi-Fi / LAN Endpoints (For Mobile / Tablets):');
  addresses.forEach(addr => {
    console.log(`   ► HTTP  (Normal) : http://${addr.address}:${PORT_HTTP}  (${addr.name})`);
    console.log(`   ► HTTPS (Secure) : https://${addr.address}:${PORT}  (${addr.name})`);
  });
  console.log('------------------------------------------------------');
  console.log(' Universal Host Support: Windows, macOS, Linux, Intel NUC');
  console.log(' Master Clock Sync     : Active (/ws/clock & /api/clock/ping)');
  console.log(' Storage Directory     : ' + BASE_STORAGE);
  console.log('======================================================\n');
});
