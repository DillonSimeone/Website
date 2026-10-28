const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PLATFORMIO_DIR = path.join(ROOT_DIR, 'public', 'ESP32Codes', 'PlatformIO');
const ERROR_LOG_PATH = path.join(ROOT_DIR, 'compile_errors.log');

// Initialize clean log
fs.writeFileSync(ERROR_LOG_PATH, `========================================================\n  ESP32-C3 Compilation Log - Started ${new Date().toISOString()}\n========================================================\n\n`, 'utf8');

function logError(projectName, c3Env, dir, output) {
    const entry = `--------------------------------------------------------\nPROJECT: ${projectName} [env:${c3Env}]\nPATH:    ${dir}\n--------------------------------------------------------\n${output.trim()}\n\n`;
    fs.appendFileSync(ERROR_LOG_PATH, entry, 'utf8');
}

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

function ensureC3Environment(iniPath) {
    let content = fs.readFileSync(iniPath, 'utf8');

    // Skip non-Espressif platforms (e.g. ch32v, raspberrypi)
    if (content.includes('platform = ch32v') || content.includes('platform = raspberrypi') || content.includes('board = pico')) {
        return { isEspressif: false, c3Env: null, skipReason: 'Non-ESP32 architecture (e.g. CH32V003 or RP2040)' };
    }

    // Skip projects strictly requiring Bluetooth Classic (ESP32-C3 die is BLE only)
    if (iniPath.toLowerCase().includes('bluetoothmic')) {
        return { isEspressif: false, c3Env: null, skipReason: 'Requires Bluetooth Classic HFP audio (unsupported on ESP32-C3 silicon; BLE only)' };
    }

    // Skip Haxel (requires custom pioarduino ESP-IDF multi-core RTOS platform)
    if (iniPath.toLowerCase().includes('haxel')) {
        return { isEspressif: false, c3Env: null, skipReason: 'Requires pioarduino ESP-IDF multi-core RTOS runtime' };
    }

    // Skip LilyGO T-Display-S3 projects (require ESP32-S3 8-bit parallel bus on GPIO 38-48)
    if (iniPath.toLowerCase().includes('arduino_gfx_demo')) {
        return { isEspressif: false, c3Env: null, skipReason: 'Requires ESP32-S3 8-bit parallel LCD hardware (GPIO 38-48)' };
    }

    // Patch known FastLED 3.10.x RISC-V header bug: pin to 3.6.0
    if (/fastled\/FastLED\s*@\s*\^3\./i.test(content) || /FastLED\s*@\s*\^3\./i.test(content)) {
        content = content.replace(/fastled\/FastLED\s*@\s*\^3\.\d+\.\d+/gi, 'fastled/FastLED@3.6.0');
        content = content.replace(/FastLED\s*@\s*\^3\.\d+\.\d+/gi, 'fastled/FastLED@3.6.0');
        fs.writeFileSync(iniPath, content, 'utf8');
    }

    // Check existing envs
    const envMatches = [...content.matchAll(/\[env:([^\]]+)\]/g)].map(m => m[1]);
    const c3Env = envMatches.find(e => e.toLowerCase() === 'esp32c3' || e.toLowerCase() === 'esp32-c3' || e.toLowerCase().includes('c3'));

    if (c3Env) {
        return { isEspressif: true, c3Env };
    }

    if (content.includes('esp32-c3-devkitm-1') || content.includes('esp32c3')) {
        return { isEspressif: true, c3Env: envMatches[0] || 'esp32c3' };
    }

    // Extract lib_deps if present in another env
    let libDepsBlock = '';
    const libDepsMatch = content.match(/lib_deps\s*=([\s\S]*?)(?=\n\[|\n\w+\s*=|$(?![\r\n]))/);
    if (libDepsMatch) {
        let deps = libDepsMatch[1].trimEnd();
        // Pin FastLED if present in extracted deps
        deps = deps.replace(/fastled\/FastLED\s*@\s*\^3\.\d+\.\d+/gi, 'fastled/FastLED@3.6.0');
        libDepsBlock = `\nlib_deps =${deps}`;
    }

    // Extract build_flags if present in another env
    let buildFlagsBlock = '';
    const buildFlagsMatch = content.match(/build_flags\s*=([\s\S]*?)(?=\n\[|\n\w+\s*=|$(?![\r\n]))/);
    if (buildFlagsMatch) {
        buildFlagsBlock = `\nbuild_flags =${buildFlagsMatch[1].trimEnd()}\n    -DARDUINO_USB_MODE=1\n    -DARDUINO_USB_CDC_ON_BOOT=1`;
    } else {
        buildFlagsBlock = `\nbuild_flags =\n    -DARDUINO_USB_MODE=1\n    -DARDUINO_USB_CDC_ON_BOOT=1`;
    }

    // Append [env:esp32c3]
    const appendBlock = `\n\n; --- Added by compileAllESP32 for ESP32-C3 Target ---\n[env:esp32c3]\nplatform = espressif32@6.6.0\nboard = esp32-c3-devkitm-1\nframework = arduino${buildFlagsBlock}${libDepsBlock}\n`;
    fs.writeFileSync(iniPath, content + appendBlock, 'utf8');
    console.log(`  + Configured [env:esp32c3] in ${path.basename(path.dirname(iniPath))}/platformio.ini`);

    return { isEspressif: true, c3Env: 'esp32c3' };
}

function main() {
    console.log('========================================================');
    console.log('       ESP32-C3 MASTER COMPILATION & BUILD ENGINE       ');
    console.log('========================================================\n');

    const iniFiles = findPlatformIOIniFiles(PLATFORMIO_DIR);
    console.log(`Discovered ${iniFiles.length} PlatformIO projects.\n`);

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < iniFiles.length; i++) {
        const iniPath = iniFiles[i];
        const projDir = path.dirname(iniPath);
        const rel = path.relative(PLATFORMIO_DIR, projDir);

        console.log(`[${i + 1}/${iniFiles.length}] Checking: ${rel}...`);

        const rootBinFile = path.join(projDir, 'firmware.bin');
        if (fs.existsSync(rootBinFile) && fs.statSync(rootBinFile).size > 100) {
            const sizeKb = Math.round(fs.statSync(rootBinFile).size / 1024);
            console.log(`  ✔ Already built: firmware.bin (${sizeKb} KB)`);
            successCount++;
            continue;
        }

        const { isEspressif, c3Env, skipReason } = ensureC3Environment(iniPath);
        if (!isEspressif || !c3Env) {
            console.log(`  -> Skipped: ${skipReason || 'Non-ESP32 architecture'}`);
            skippedCount++;
            continue;
        }

        // Check if firmware.bin already exists for this c3Env
        const binFile = path.join(projDir, '.pio', 'build', c3Env, 'firmware.bin');

        if (fs.existsSync(binFile) && fs.statSync(binFile).size > 1000) {
            const sizeKb = Math.round(fs.statSync(binFile).size / 1024);
            console.log(`  ✔ Already built in .pio: ${c3Env} (${sizeKb} KB)`);
            try { fs.copyFileSync(binFile, rootBinFile); } catch {}
            successCount++;
            continue;
        }

        // Also check any other c3 env in .pio/build
        const pioBuildDir = path.join(projDir, '.pio', 'build');
        let foundExisting = false;
        if (fs.existsSync(pioBuildDir)) {
            for (const b of fs.readdirSync(pioBuildDir)) {
                if (b.toLowerCase().includes('c3')) {
                    const altBin = path.join(pioBuildDir, b, 'firmware.bin');
                    if (fs.existsSync(altBin) && fs.statSync(altBin).size > 1000) {
                        const sizeKb = Math.round(fs.statSync(altBin).size / 1024);
                        console.log(`  ✔ Found built binary in .pio/build/${b} (${sizeKb} KB)`);
                        try { fs.copyFileSync(altBin, rootBinFile); } catch {}
                        successCount++;
                        foundExisting = true;
                        break;
                    }
                }
            }
        }
        if (foundExisting) continue;

        console.log(`  🔨 Compiling for ESP32-C3 [env:${c3Env}]...`);
        const proc = spawnSync('pio', ['run', '-e', c3Env], {
            cwd: projDir,
            encoding: 'utf8',
            shell: true,
            timeout: 180000,
            env: {
                ...process.env,
                CI: '1',
                PLATFORMIO_NONINTERACTIVE: '1'
            },
            maxBuffer: 10 * 1024 * 1024
        });

        if (proc.status === 0 && (fs.existsSync(binFile) || fs.existsSync(rootBinFile))) {
            const actualBin = fs.existsSync(binFile) ? binFile : rootBinFile;
            const sizeKb = Math.round(fs.statSync(actualBin).size / 1024);
            console.log(`  ✔ BUILD SUCCESS! Generated firmware.bin (${sizeKb} KB)\n`);
            if (fs.existsSync(binFile) && !fs.existsSync(rootBinFile)) {
                try { fs.copyFileSync(binFile, rootBinFile); } catch {}
            }
            successCount++;
        } else {
            console.log(`  ✖ BUILD FAILED! Logged to compile_errors.log\n`);
            failedCount++;
            const errOutput = (proc.stderr || '') + '\n' + (proc.stdout || '');
            logError(rel, c3Env, projDir, errOutput);
        }
    }

    fs.appendFileSync(ERROR_LOG_PATH, `========================================================\nSUMMARY: Built: ${successCount} | Skipped: ${skippedCount} | Failed: ${failedCount}\n========================================================\n`, 'utf8');

    console.log('========================================================');
    console.log(`Compilation Summary:`);
    console.log(`  - Successfully Built: ${successCount}`);
    console.log(`  - Skipped:            ${skippedCount}`);
    console.log(`  - Failures Logged:    ${failedCount}`);
    console.log(`Log saved to: ${ERROR_LOG_PATH}`);
    console.log('========================================================\n');

    // Run static uploader sync
    console.log('Updating static firmware manifest...');
    try {
        spawnSync('node', [path.join(ROOT_DIR, 'public/ESP32Codes/_tooling/update-static-uploader.js')], {
            cwd: ROOT_DIR,
            stdio: 'inherit',
            shell: true
        });
    } catch (e) {
        console.error('Error running update-static-uploader.js:', e.message);
    }
}

main();
