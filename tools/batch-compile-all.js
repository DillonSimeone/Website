const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PLATFORMIO_DIR = path.join(ROOT_DIR, 'public', 'ESP32Codes', 'PlatformIO');

function findPlatformIOIniFiles(dir, depth = 0, maxDepth = 5) {
    let results = [];
    if (depth > maxDepth || !fs.existsSync(dir)) return results;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'static-firmware') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results = results.concat(findPlatformIOIniFiles(fullPath, depth + 1, maxDepth));
            } else if (entry.name === 'platformio.ini') {
                results.push(fullPath);
            }
        }
    } catch (e) {}
    return results;
}

console.log('\n========================================================');
console.log('       BATCH COMPILING ALL PLATFORMIO PROJECTS          ');
console.log('========================================================\n');

const iniFiles = findPlatformIOIniFiles(PLATFORMIO_DIR);
console.log(`Discovered ${iniFiles.length} projects.\n`);

let successCount = 0;
let skipCount = 0;
let failCount = 0;

for (let i = 0; i < iniFiles.length; i++) {
    const iniPath = iniFiles[i];
    const projDir = path.dirname(iniPath);
    const rel = path.relative(PLATFORMIO_DIR, projDir);

    // Check if firmware.bin already exists
    const buildDir = path.join(projDir, '.pio', 'build');
    let hasBin = false;
    if (fs.existsSync(buildDir)) {
        try {
            const envs = fs.readdirSync(buildDir);
            for (const env of envs) {
                if (fs.existsSync(path.join(buildDir, env, 'firmware.bin'))) {
                    hasBin = true;
                    break;
                }
            }
        } catch {}
    }

    if (hasBin) {
        console.log(`[${i+1}/${iniFiles.length}] SKIP (Already Compiled): ${rel}`);
        skipCount++;
        continue;
    }

    console.log(`[${i+1}/${iniFiles.length}] COMPILING: ${rel}...`);
    const proc = spawnSync('pio', ['run'], { cwd: projDir, stdio: 'inherit', shell: true });

    if (proc.status === 0) {
        console.log(`  ✔ SUCCESS: ${rel}\n`);
        successCount++;
    } else {
        console.log(`  ✖ FAILED (missing external libs or board config): ${rel}\n`);
        failCount++;
    }
}

console.log('\n========================================================');
console.log(`Completed Batch Build!`);
console.log(`  - Newly Built: ${successCount}`);
console.log(`  - Already Built: ${skipCount}`);
console.log(`  - Failed / Unresolved Deps: ${failCount}`);
console.log('========================================================\n');
