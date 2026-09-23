const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(__dirname, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

for (const file of ['index.html', 'app.js', 'style.css', 'manifest.json']) {
  fs.copyFileSync(path.join(root, file), path.join(www, file));
}

fs.cpSync(path.join(root, 'fonts'), path.join(www, 'fonts'), { recursive: true });
fs.writeFileSync(path.join(www, 'native-marker.js'), 'window.MYT_NATIVE = true;\n');

const apkSrc = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const apkDestDir = path.join(root, 'downloads');
const apkDest = path.join(apkDestDir, 'MYT-Capture.apk');
if (fs.existsSync(apkSrc)) {
  fs.mkdirSync(apkDestDir, { recursive: true });
  fs.copyFileSync(apkSrc, apkDest);
  console.log('Copied APK to', apkDest);
}

console.log('Synced web assets into mobile/www');
