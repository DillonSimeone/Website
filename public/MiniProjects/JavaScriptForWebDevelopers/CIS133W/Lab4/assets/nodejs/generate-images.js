const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

//Headless browsers for the win. People say that two heads is better than one, but me? I say none is better than one.
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

//DO NOT HANDCODE THOSE! USE THE GENERATOR!
const onionConfigs = {
  'calculator': {
    isCalculator: true,
    rx: 62, ry: 58,
    highlightColor: '#f9f1b8', mainColor: '#cda85d', shadowColor: '#7b5722', rimColor: '#452b0a',
    layerLineColor: 'rgba(90, 50, 10, 0.4)',
    stalks: [
      { angle: -12, length: 65, width: 6, color: '#558b2f', curve: -15, rootOffset: -3 },
      { angle: 6, length: 78, width: 7, color: '#33691e', curve: 10, rootOffset: 1 },
      { angle: 22, length: 55, width: 5, color: '#689f38', curve: 18, rootOffset: 4 }
    ]
  },
  'vidalia': {
    rx: 68, ry: 52,
    highlightColor: '#fff8db', mainColor: '#e0b769', shadowColor: '#8a6222', rimColor: '#4a330e',
    layerLineColor: 'rgba(100, 60, 20, 0.35)',
    stalks: [
      { angle: -8, length: 68, width: 6.5, color: '#4d7c2a', curve: -12, rootOffset: -2 },
      { angle: 14, length: 72, width: 6, color: '#3d6320', curve: 14, rootOffset: 3 }
    ]
  },
  'red-onion': {
    rx: 58, ry: 58,
    highlightColor: '#e8a7cb', mainColor: '#962d66', shadowColor: '#531037', rimColor: '#320620',
    layerLineColor: 'rgba(70, 0, 45, 0.45)',
    rootColor: '#845771',
    stalks: [
      { angle: -18, length: 60, width: 5, color: '#5c7a38', curve: -14, rootOffset: -4 },
      { angle: -3, length: 82, width: 7, color: '#446424', curve: -4, rootOffset: -1 },
      { angle: 16, length: 70, width: 5.5, color: '#5c7a38', curve: 15, rootOffset: 3 },
      { angle: 28, length: 50, width: 4.5, color: '#749847', curve: 20, rootOffset: 6 }
    ]
  },
  'shallot': {
    rx: 44, ry: 68,
    highlightColor: '#f7d3a8', mainColor: '#c76e4c', shadowColor: '#7c321e', rimColor: '#46150a',
    layerLineColor: 'rgba(95, 30, 15, 0.4)',
    stalks: [
      { angle: -5, length: 75, width: 5, color: '#557e2a', curve: -8, rootOffset: -2 },
      { angle: 8, length: 85, width: 6, color: '#3f631d', curve: 8, rootOffset: 2 }
    ]
  },
  'green-scallion': {
    rx: 32, ry: 75,
    highlightColor: '#f4fae8', mainColor: '#a8c66c', shadowColor: '#4c6c24', rimColor: '#2b3f14',
    layerLineColor: 'rgba(40, 70, 20, 0.3)',
    stalks: [
      { angle: -15, length: 90, width: 6, color: '#4a8522', curve: -18, rootOffset: -3 },
      { angle: 0, length: 102, width: 7, color: '#33691e', curve: 0, rootOffset: 0 },
      { angle: 12, length: 95, width: 6, color: '#4a8522', curve: 15, rootOffset: 2 },
      { angle: 24, length: 80, width: 5, color: '#558b2f', curve: 22, rootOffset: 4 }
    ]
  }
};

// Palettes matching onionEngine.js for procedural generation
const palettes = {
  golden: {
    highlight: '#fff8db', main: '#e0b769', shadow: '#8a6222', rim: '#4a330e',
    layer: 'rgba(100, 60, 20, 0.35)', stalk: '#4d7c2a', root: '#96784d'
  },
  crimson: {
    highlight: '#e8a7cb', main: '#962d66', shadow: '#531037', rim: '#320620',
    layer: 'rgba(70, 0, 45, 0.45)', stalk: '#446424', root: '#845771'
  },
  toxic: {
    highlight: '#e4ffb0', main: '#8dbd28', shadow: '#496b12', rim: '#263b07',
    layer: 'rgba(30, 60, 10, 0.4)', stalk: '#79b528', root: '#4a6b22'
  },
  copper: {
    highlight: '#f7d3a8', main: '#c76e4c', shadow: '#7c321e', rim: '#46150a',
    layer: 'rgba(95, 30, 15, 0.4)', stalk: '#3f631d', root: '#7e472e'
  },
  ghost: {
    highlight: '#ffffff', main: '#d4dfd4', shadow: '#7c8e7c', rim: '#414e41',
    layer: 'rgba(50, 70, 50, 0.35)', stalk: '#547854', root: '#9aa89a'
  }
};

// Generate 5 brand new randomized onions for dumping
function generateRandomBatch(count = 5) {
  const batch = {};
  const paletteKeys = Object.keys(palettes);
  const now = new Date();
  const timeStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS

  for (let i = 1; i <= count; i++) {
    const palKey = paletteKeys[Math.floor(Math.random() * paletteKeys.length)];
    const pal = palettes[palKey];
    const stalkCount = Math.floor(Math.random() * 5) + 1;
    const stalks = [];
    for (let s = 0; s < stalkCount; s++) {
      const angle = -25 + (s / Math.max(stalkCount - 1, 1)) * 50 + (Math.random() - 0.5) * 10;
      stalks.push({
        angle: angle,
        length: 55 + Math.random() * 40,
        width: 4 + Math.random() * 4,
        curve: angle * 0.7,
        rootOffset: (s - (stalkCount - 1) / 2) * 3,
        color: pal.stalk
      });
    }

    const key = `onion_${timeStr}_${i}_${palKey}`;
    batch[key] = {
      rx: Math.floor(32 + Math.random() * 38),
      ry: Math.floor(45 + Math.random() * 25),
      highlightColor: pal.highlight,
      mainColor: pal.main,
      shadowColor: pal.shadow,
      rimColor: pal.rim,
      layerLineColor: pal.layer,
      rootColor: pal.root,
      stalks: stalks
    };
  }
  return batch;
}

// Protected original 5 onions (Shrek's chosen - never overwritten)
const protectedOnions = new Set(['calculator', 'vidalia', 'red-onion', 'shallot', 'green-scallion']);

//a recipe from my thicc cookbook. 
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://127.0.0.1:48921');
  const pathname = parsedUrl.pathname;

  if (pathname === '/' || pathname === '/generator.html') {
    const html = fs.readFileSync(path.join(__dirname, 'generator.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else if (req.url.endsWith('onionEngine.js')) {
    const js = fs.readFileSync(path.join(__dirname, '..', 'javascript', 'onionEngine.js'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(js);
  } else if (req.url === '/configs') {
    // Generate fresh batch of 5 randomized onions each time
    const batch = generateRandomBatch(5);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(batch));
  } else if (req.url === '/save-images' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const data = JSON.parse(body);
      const imagesDir = path.join(__dirname, '..', 'images');
      for (const [key, dataUrl] of Object.entries(data)) {
        // Protect original 5 chosen onions from ever being overwritten
        if (protectedOnions.has(key)) {
          console.warn(`Protected onion "${key}" skipped - will not overwrite Shrek's chosen.`);
          continue;
        }
        const base64Data = dataUrl.replace(/^data:image\/webp;base64,/, '');
        const filePath = path.join(imagesDir, `${key}.webp`);
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        console.log(`Saved ${filePath} (${base64Data.length} bytes base64)`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 500);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(48921, '127.0.0.1', () => {
  console.log('Thumbnail server running on port 48921...');

  try {
    const cmd = `"${chromePath}" --headless=new --disable-gpu "http://127.0.0.1:48921/generator.html?batch=1"`;
    console.log('Spawning Chrome headless...');
    execSync(cmd, { timeout: 10000 });
  } catch (err) {
    console.error('Headless execution finished:', err.message);
  }
});
