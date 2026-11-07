/**
 * Haxel Firmware Packaging Utility
 * Creates a clean, turnkey .zip distribution of Haxel firmware for makers and workshop participants.
 * Excludes .pio build caches, binaries, and temporary files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIRMWARE_DIR = path.resolve(__dirname, '../../ESP32Codes/PlatformIO/02_Audio_Haptics/Haxel/firmware');
const OUTPUT_ZIP = path.resolve(__dirname, 'haxel-firmware.zip');
const STAGING_DIR = path.resolve(__dirname, '.tmp_haxel_pack');
const STAGING_ROOT = path.join(STAGING_DIR, 'Haxel-firmware');

console.log('====================================================');
console.log('Packaging Haxel Firmware Distribution');
console.log('====================================================');
console.log(`Source:  ${FIRMWARE_DIR}`);
console.log(`Output:  ${OUTPUT_ZIP}`);

// Ensure source exists
if (!fs.existsSync(FIRMWARE_DIR)) {
  console.error(`[ERROR] Firmware directory does not exist: ${FIRMWARE_DIR}`);
  process.exit(1);
}

// Clean staging directory
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_ROOT, { recursive: true });

// Copy filter
const EXCLUDE_NAMES = new Set(['.pio', '.vscode', 'output', '.git', '__pycache__', '.DS_Store', 'Thumbs.db']);

function copyFiltered(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (EXCLUDE_NAMES.has(base)) return;
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyFiltered(path.join(src, child), path.join(dst, child));
    }
  } else {
    const base = path.basename(src);
    if (base.endsWith('.pyc') || base.endsWith('.tmp') || base.endsWith('.log')) return;
    fs.copyFileSync(src, dst);
  }
}

console.log('[1/3] Copying clean source tree to staging...');
copyFiltered(FIRMWARE_DIR, STAGING_ROOT);

// Verify critical files are present
const criticalFiles = ['platformio.ini', 'partitions.csv', 'QUICKSTART.md', 'flash_haxel.bat', 'src/main.cpp', 'data/index.html'];
for (const rel of criticalFiles) {
  const p = path.join(STAGING_ROOT, rel);
  if (!fs.existsSync(p)) {
    console.warn(`[WARNING] Expected file missing: ${rel}`);
  }
}

console.log('[2/3] Compressing into haxel-firmware.zip...');
if (fs.existsSync(OUTPUT_ZIP)) {
  fs.unlinkSync(OUTPUT_ZIP);
}

const isWin = process.platform === 'win32';

try {
  if (isWin) {
    // Windows: Use PowerShell Compress-Archive
    const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_ROOT}\\*' -DestinationPath '${OUTPUT_ZIP}' -Force"`;
    execSync(psCmd, { stdio: 'inherit' });
  } else {
    // Linux / Mac: Use zip command
    const zipCmd = `cd "${STAGING_ROOT}" && zip -r -9 "${OUTPUT_ZIP}" .`;
    execSync(zipCmd, { stdio: 'inherit' });
  }
} catch (err) {
  console.log('[*] Shell compression failed, trying Python fallback...');
  const pyScript = `
import shutil
import sys
shutil.make_archive(sys.argv[1].replace('.zip', ''), 'zip', sys.argv[2])
`;
  try {
    execSync(`python -c "${pyScript.replace(/\n/g, ' ')}" "${OUTPUT_ZIP}" "${STAGING_ROOT}"`, { stdio: 'inherit' });
  } catch (pyErr) {
    console.error('[ERROR] Failed to compress zip archive:', err.message);
    process.exit(1);
  }
}

// Clean up staging
fs.rmSync(STAGING_DIR, { recursive: true, force: true });

if (fs.existsSync(OUTPUT_ZIP)) {
  const sizeBytes = fs.statSync(OUTPUT_ZIP).size;
  const sizeKb = (sizeBytes / 1024).toFixed(1);
  console.log(`[3/3] [SUCCESS] Packaged ${OUTPUT_ZIP} (${sizeKb} KB)`);
  console.log('====================================================');
} else {
  console.error('[ERROR] Archive creation failed.');
  process.exit(1);
}
