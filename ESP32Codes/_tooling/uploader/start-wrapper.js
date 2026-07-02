const { spawn } = require('child_process');
const http = require('http');

const startPort = 3567;

function checkPort(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

function requestJSON(url, method = 'GET') {
  return new Promise((resolve) => {
    const req = http.request(url, { method, timeout: 1000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function main() {
  let port = startPort;
  let cleared = false;

  while (!cleared) {
    const isFree = await checkPort(port);
    if (isFree) {
      cleared = true;
    } else {
      // Check if it's our app
      const identity = await requestJSON(`http://localhost:${port}/api/identify`);
      if (identity && identity.app === 'pio-web-uploader') {
        console.log(`[Startup] Detected existing uploader running on port ${port}. Requesting shutdown...`);
        await requestJSON(`http://localhost:${port}/api/shutdown`, 'POST');
        // Wait for it to shutdown
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 200));
          if (await checkPort(port)) {
            console.log(`[Startup] Shutdown successful on port ${port}.`);
            cleared = true;
            break;
          }
        }
      } else {
        console.log(`[Startup] Port ${port} is occupied by another application. Trying next port...`);
        port++;
      }
    }
  }

  console.log(`[Startup] Launching uploader server on port ${port}...`);
  
  // Launch server.js
  const serverProc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: port },
    stdio: 'inherit'
  });

  // Open browser after 1 second
  setTimeout(() => {
    const url = `http://localhost:${port}`;
    const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(startCmd, [url], { shell: true });
  }, 1000);

  serverProc.on('close', (code) => {
    process.exit(code);
  });
}

main().catch(err => {
  console.error('[Startup] Failed:', err);
  process.exit(1);
});
