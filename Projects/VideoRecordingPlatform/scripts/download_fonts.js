/**
 * One-shot downloader for the Inter and JetBrains Mono files previously
 * loaded from Google Fonts. Run only when refreshing the bundled fonts.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'fonts');
fs.mkdirSync(root, { recursive: true });

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return get(next).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

(async () => {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap';
  const cssRes = await get(cssUrl);
  if (cssRes.status !== 200) throw new Error('CSS HTTP ' + cssRes.status);
  let css = cssRes.body.toString('utf8');
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
  console.log('font files:', urls.length);
  let i = 0;
  for (const u of urls) {
    const ext = path.extname(new URL(u).pathname) || '.woff2';
    const name = 'f' + String(i).padStart(3, '0') + ext;
    const dest = path.join(root, name);
    const file = await get(u);
    if (file.status !== 200) throw new Error(file.status + ' ' + u);
    fs.writeFileSync(dest, file.body);
    css = css.split(u).join(name);
    i++;
  }
  fs.writeFileSync(path.join(root, 'fonts.css'), '/* Inter and JetBrains Mono, bundled for offline use. SIL Open Font License. */\n' + css);
  const files = fs.readdirSync(root);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(root, f)).size, 0);
  console.log('saved', files.length, 'files,', bytes, 'bytes');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
