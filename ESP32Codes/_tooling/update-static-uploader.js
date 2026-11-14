const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const ESP32_DIR = path.resolve(__dirname, '..');
const PLATFORMIO_DIR = path.join(ESP32_DIR, 'PlatformIO');
const MICROPYTHON_DIR = path.join(ESP32_DIR, 'MicroPython');
const STATIC_FIRMWARE_DIR = path.join(ESP32_DIR, 'static-firmware');
const MANIFEST_PATH = path.join(ESP32_DIR, 'firmware-manifest.json');

if (!fs.existsSync(STATIC_FIRMWARE_DIR)) {
    fs.mkdirSync(STATIC_FIRMWARE_DIR, { recursive: true });
}

function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

function parsePlatformioIni(iniPath) {
    if (!fs.existsSync(iniPath)) return {};
    const content = fs.readFileSync(iniPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const envs = {};
    let currentEnv = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

        const envMatch = trimmed.match(/^\[env:([^\]]+)\]/);
        if (envMatch) {
            currentEnv = envMatch[1].trim();
            envs[currentEnv] = { name: currentEnv, options: {} };
            continue;
        }

        if (currentEnv && trimmed.includes('=')) {
            const [key, ...vals] = trimmed.split('=');
            envs[currentEnv].options[key.trim()] = vals.join('=').trim();
        }
    }
    return envs;
}

function detectChip(boardStr, platformStr, envName) {
    const combined = `${boardStr || ''} ${platformStr || ''} ${envName || ''}`.toLowerCase();
    if (combined.includes('esp32c3') || combined.includes('esp32-c3') || combined.includes('c3')) return 'esp32c3';
    if (combined.includes('esp32s3') || combined.includes('esp32-s3') || combined.includes('s3')) return 'esp32s3';
    if (combined.includes('esp32s2') || combined.includes('esp32-s2') || combined.includes('s2')) return 'esp32s2';
    if (combined.includes('esp32c6') || combined.includes('esp32-c6') || combined.includes('c6')) return 'esp32c6';
    if (combined.includes('ch32v003')) return 'ch32v003';
    if (combined.includes('pico') || combined.includes('rp2040')) return 'rp2040';
    if (combined.includes('esp32')) return 'esp32';
    return 'esp32';
}

function getProjectSourceText(dir) {
    let text = '';
    function readDir(d, depth = 0) {
        if (depth > 3) return;
        try {
            const entries = fs.readdirSync(d, { withFileTypes: true });
            for (const e of entries) {
                if (e.name === '.pio' || e.name === 'node_modules' || e.name === '.git') continue;
                const full = path.join(d, e.name);
                if (e.isDirectory()) {
                    readDir(full, depth + 1);
                } else if (/\.(cpp|c|h|hpp|ino|py)$/i.test(e.name)) {
                    try {
                        text += `\n/* FILE: ${e.name} */\n` + fs.readFileSync(full, 'utf8');
                    } catch {}
                }
            }
        } catch {}
    }
    readDir(dir);
    return text;
}

function extractPinout(sourceCode, chip) {
    const pinMap = new Map();

    function addPin(pinNum, role) {
        const pinClean = parseInt(pinNum, 10);
        if (isNaN(pinClean) || pinClean < 0 || pinClean > 48) return;
        const key = `GPIO ${pinClean}`;
        if (!pinMap.has(key)) {
            pinMap.set(key, { pin: key, role });
        } else {
            const existing = pinMap.get(key);
            if (!existing.role.includes(role)) {
                existing.role += ` / ${role}`;
            }
        }
    }

    const invalidWords = ['COUNT', 'NUM', 'MAX', 'MIN', 'SPEED', 'BAUD', 'FREQ', 'DELAY', 'TIMEOUT', 'MS', 'SIZE', 'LEN', 'BRIGHTNESS', 'DUTY', 'RATE', 'ADDR', 'LIMIT', 'CHANNEL'];

    // #define PIN patterns
    const defineRegex = /#define\s+([A-Za-z0-9_]+)\s+([0-9]+)/g;
    let match;
    while ((match = defineRegex.exec(sourceCode)) !== null) {
        const name = match[1].toUpperCase();
        const pin = match[2];
        if (invalidWords.some(w => name.includes(w))) continue;
        if (name.includes('PIN') || name.includes('GPIO') || name.includes('_IO') || name.startsWith('I2S_') || name.includes('LED') || name.includes('MIC') || name.includes('MOTOR') || name.includes('BUTTON') || name.includes('SDA') || name.includes('SCL') || name.includes('TRIG') || name.includes('ECHO') || name.includes('RELAY')) {
            let role = name.replace(/_PIN$/, '').replace(/^PIN_/, '').replace(/_/g, ' ');
            addPin(pin, role);
        }
    }

    // const/constexpr int VAR_PIN = X;
    const constRegex = /(?:const|constexpr)\s+(?:int|uint8_t|byte)\s+([A-Za-z0-9_]+)\s*=\s*([0-9]+);/g;
    while ((match = constRegex.exec(sourceCode)) !== null) {
        const name = match[1].toUpperCase();
        const pin = match[2];
        if (invalidWords.some(w => name.includes(w))) continue;
        if (name.includes('PIN') || name.includes('GPIO') || name.includes('LED') || name.includes('MOTOR') || name.includes('MIC') || name.includes('SDA') || name.includes('SCL') || name.includes('INT') || name.includes('GND') || name.includes('VCC') || name.includes('BUTTON') || name.includes('TRIG') || name.includes('ECHO') || name.includes('RELAY')) {
            let role = name.replace(/_PIN$/, '').replace(/^PIN_/, '').replace(/_/g, ' ');
            addPin(pin, role);
        }
    }

    // FastLED.addLeds<...>(..., PIN, ...)
    const fastLedRegex = /FastLED\.addLeds<[^>]+>\s*\([^,]+,\s*([0-9]+)/g;
    while ((match = fastLedRegex.exec(sourceCode)) !== null) {
        addPin(match[1], 'FastLED Addressable RGB Data');
    }

    // Wire.begin(SDA, SCL) numeric
    const wireRegex = /Wire\.begin\s*\(\s*([0-9]+)\s*,\s*([0-9]+)\s*\)/g;
    while ((match = wireRegex.exec(sourceCode)) !== null) {
        addPin(match[1], 'I2C SDA (Data)');
        addPin(match[2], 'I2C SCL (Clock)');
    }

    // I2S config structs
    const i2sBck = /\.bck_io_num\s*=\s*([0-9]+)/g;
    while ((match = i2sBck.exec(sourceCode)) !== null) addPin(match[1], 'I2S BCK (Bit Clock)');
    const i2sWs = /\.ws_io_num\s*=\s*([0-9]+)/g;
    while ((match = i2sWs.exec(sourceCode)) !== null) addPin(match[1], 'I2S WS (Word Select / L/R Clock)');
    const i2sDin = /\.data_in_num\s*=\s*([0-9]+)/g;
    while ((match = i2sDin.exec(sourceCode)) !== null) addPin(match[1], 'I2S Data In (Microphone DIN)');
    const i2sDout = /\.data_out_num\s*=\s*([0-9]+)/g;
    while ((match = i2sDout.exec(sourceCode)) !== null) addPin(match[1], 'I2S Data Out (DAC / Amplifier)');

    // pinMode(X, ...)
    const pinModeRegex = /pinMode\s*\(\s*([0-9]+)\s*,\s*([A-Za-z_]+)\s*\)/g;
    while ((match = pinModeRegex.exec(sourceCode)) !== null) {
        addPin(match[1], `General IO (${match[2]})`);
    }

    // MicroPython Pin(X, ...)
    const mpyPin = /Pin\s*\(\s*([0-9]+)/g;
    while ((match = mpyPin.exec(sourceCode)) !== null) {
        addPin(match[1], 'MicroPython Signal IO');
    }

    // Standard fallback pinout for boards where pins are handled by standard driver defaults
    if (pinMap.size === 0) {
        if (chip === 'esp32c3') {
            addPin(8, 'Onboard Blue Status LED (Active Low)');
            addPin(9, 'Boot Button (Pull-Up)');
        } else if (chip === 'esp32') {
            addPin(2, 'Onboard Status LED');
        } else if (chip === 'ch32v003') {
            addPin(1, 'PD1 / SWIO Debug & Flashing');
            addPin(4, 'PC4 / PWM Haptic Output');
        } else if (chip === 'rp2040') {
            addPin(25, 'Onboard Status LED');
        }
    }

    const sorted = Array.from(pinMap.values()).sort((a, b) => {
        const numA = parseInt(a.pin.replace(/\D/g, ''), 10);
        const numB = parseInt(b.pin.replace(/\D/g, ''), 10);
        return numA - numB;
    });

    return sorted;
}

function generateDetailedDescription(name, category, sourceText, chip, pinout) {
    const textLower = sourceText.toLowerCase();

    if (name.includes('BlinkTest')) {
        return `Fundamental hardware diagnostic verifying microcontroller bootloader integrity, clock initialization, and active-low status LED oscillation.`;
    }
    if (name.includes('CH32V003Haptics')) {
        return `Sub-dime WCH CH32V003 RISC-V microcontroller tactile feedback engine. Synthesizes variable-frequency ERM/LRA vibration waveforms via timer PWM with ramped attack and decay curves.`;
    }
    if (name.includes('CH32V003SanityTest')) {
        return `Bare-metal CH32V003 RISC-V sanity check executing direct register toggles and SWIO flashing validation.`;
    }
    if (name.includes('CarrieBrainBadge')) {
        return `Wearable bio-aesthetic conference badge powered by ESP32-C3. Simulates neural synaptic firing patterns across WS2812B RGB pixels with synchronized tactile heartbeat pulses.`;
    }
    if (name.includes('Ember')) {
        return `Modular bytecode virtual machine and dynamic runtime for ESP32. Executes compiled sensory choreography scripts, controls multi-channel lighting, and reports live performance telemetry.`;
    }
    if (name.includes('LightBaton')) {
        return `High-speed expressive performance baton combining high-rate 6-axis IMU spatial gesture tracking, 76-pixel addressable LED motion sweeps, and low-latency ESP-NOW wireless broadcast synchronization.`;
    }
    if (name.includes('DeafDoorbell')) {
        return `High-reliability accessibility signaling system for Deaf and Hard-of-Hearing households. Broadcasts instant low-latency doorbell trigger events over an encrypted ESP-NOW mesh to multiple remote room receivers with synchronized vibration bursts and visual alerts.`;
    }
    if (name.includes('SignalForwarder')) {
        return `Sub-millisecond ESP-NOW to Serial/WebSocket bridge repeater. Captures incoming wireless sensor and tactile telemetry packets over the 2.4GHz RF spectrum and streams them directly into host PC software.`;
    }
    if (name.includes('UltrasonicHapticDisplay')) {
        return `Mid-air tactile transducer array synthesizer. Modulates 40kHz acoustic radiation pressure wavefronts to project touch sensations onto bare human skin without wearable contact.`;
    }
    if (name.includes('Haxel')) {
        return `Full-spectrum embedded telemetry engine featuring real-time wireless broadcast, ESP-NOW node clustering, audio spectrum analysis, and dynamic parameter tuning.`;
    }
    if (name.includes('WirelessHaptic')) {
        return `Wireless haptic receiver node responding to low-latency ESP-NOW trigger packets. Drives tactile actuators via direct high-current PWM or I2C DRV2605L waveform synthesis.`;
    }
    if (name.includes('PWMStatusLight')) {
        return `Hardware LEDC PWM breathing light driver utilizing logarithmic gamma-correction curves for natural, flicker-free optical transitions.`;
    }
    if (name.includes('xYmotorLedStrip')) {
        return `Synchronized dual-axis mechanical motion and addressable LED chase system. Translates motor positions into real-time linear lighting cues.`;
    }
    if (name.includes('MicroPython')) {
        return `Official MicroPython runtime environment for ESP32-C3 RISC-V architecture. Provides an interactive Python REPL over USB serial, hardware GPIO control, WiFi/BLE networking, and file system management.`;
    }
    if (name.includes('audioSanityTest') || name.includes('I2SMic') || name.includes('Max4466')) {
        return `High-speed audio DSP capture pipeline sampling analog or digital MEMS microphones (INMP441 / MAX4466) with real-time sound-pressure level envelope tracking and reactive threshold triggers.`;
    }
    if (name.includes('RatVehicle') || name.includes('cameraDroneWheels') || name.includes('finalProject')) {
        return `Robotics motor controller and vehicle telemetry firmware handling dual motor drivers, wireless steering packets, and obstacle avoidance sensors.`;
    }
    if (name.includes('DataGlove')) {
        return `Wearable sensor glove tracking finger articulation through flex sensors and IMU orientation, streaming spatial gesture data over ESP-NOW.`;
    }
    if (name.includes('DeafClock') || name.includes('PCBClock')) {
        return `High-contrast RTC-driven tactile and visual alarm clock providing programmable silent vibration wake-up alerts and LED progress indicators.`;
    }

    const features = [];
    if (textLower.includes('fastled') || textLower.includes('ws2812')) features.push('FastLED RGB lighting');
    if (textLower.includes('esp_now') || textLower.includes('espnow')) features.push('low-latency ESP-NOW mesh');
    if (textLower.includes('wire.h') || textLower.includes('i2c')) features.push('I2C sensor integration');
    if (textLower.includes('mpu6050') || textLower.includes('imu')) features.push('MPU 6-axis motion tracking');
    if (textLower.includes('i2s')) features.push('I2S digital audio pipeline');
    if (textLower.includes('drv2605') || textLower.includes('motor') || textLower.includes('haptic')) features.push('tactile haptic PWM driver');
    if (textLower.includes('wifi')) features.push('WiFi connectivity');
    if (textLower.includes('ble') || textLower.includes('bluetooth')) features.push('Bluetooth Low Energy (BLE)');
    if (textLower.includes('oled') || textLower.includes('u8g2') || textLower.includes('ssd1306')) features.push('OLED graphical display');

    const featStr = features.length > 0 ? ` featuring ${features.join(', ')}` : '';
    return `Embedded ${chip.toUpperCase()} microcontroller engineering project (${category})${featStr}. Engineered for low-latency sensory interaction and robust hardware execution.`;
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

function main() {
    console.log('\n========================================================');
    console.log('   DEEP FIRMWARE ANALYZER & PINOUT REGISTRY BUILDER    ');
    console.log('========================================================\n');

    const iniFiles = findPlatformIOIniFiles(PLATFORMIO_DIR);
    console.log(`Found ${iniFiles.length} PlatformIO projects to analyze.\n`);

    const catalog = [];

    for (const iniPath of iniFiles) {
        const projDir = path.dirname(iniPath);
        const relPath = path.relative(PLATFORMIO_DIR, projDir);
        const pathParts = relPath.split(path.sep);

        const rawCategory = pathParts[0] || 'General';
        const categoryName = rawCategory.replace(/^\d+_/, '').replace(/_/g, ' ');
        const projectName = pathParts.slice(1).join(' / ') || path.basename(projDir);

        const envs = parsePlatformioIni(iniPath);
        const envNames = Object.keys(envs);
        const defaultEnv = envNames[0] || 'default';
        const envData = envs[defaultEnv] || { options: {} };
        const chip = detectChip(envData.options.board, envData.options.platform, defaultEnv);
        const baudRate = parseInt(envData.options.monitor_speed, 10) || 115200;

        const sourceText = getProjectSourceText(projDir);
        const pinout = extractPinout(sourceText, chip);
        const desc = generateDetailedDescription(projectName, categoryName, sourceText, chip, pinout);

        // Check for built binaries in .pio/build
        const buildDir = path.join(projDir, '.pio', 'build');
        let foundBin = false;

        if (fs.existsSync(buildDir)) {
            const builtEnvs = fs.readdirSync(buildDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);

            for (const bEnv of builtEnvs) {
                const binFile = path.join(buildDir, bEnv, 'firmware.bin');
                if (fs.existsSync(binFile)) {
                    foundBin = true;
                    const stat = fs.statSync(binFile);
                    const destCategoryDir = path.join(STATIC_FIRMWARE_DIR, rawCategory);
                    if (!fs.existsSync(destCategoryDir)) fs.mkdirSync(destCategoryDir, { recursive: true });

                    const destFileName = `${sanitizeFilename(projectName)}_${sanitizeFilename(bEnv)}.bin`;
                    const destPath = path.join(destCategoryDir, destFileName);
                    fs.copyFileSync(binFile, destPath);

                    const relativeBinUrl = `/ESP32Codes/static-firmware/${rawCategory}/${destFileName}`;
                    const id = `${sanitizeFilename(rawCategory)}_${sanitizeFilename(projectName)}_${sanitizeFilename(bEnv)}`.toLowerCase();

                    catalog.push({
                        id,
                        name: projectName,
                        category: categoryName,
                        rawCategory,
                        env: bEnv,
                        chip: detectChip(envData.options.board, envData.options.platform, bEnv),
                        board: envData.options.board || 'esp32',
                        baudRate,
                        flashOffset: chip === 'esp32c3' || chip === 'esp32s3' ? '0x0' : '0x10000',
                        binPath: relativeBinUrl,
                        fileSize: stat.size,
                        hasBinary: true,
                        status: 'Ready to Flash',
                        description: desc,
                        pinout,
                        sourcePath: `/ESP32Codes/PlatformIO/${relPath.replace(/\\/g, '/')}`,
                        lastModified: stat.mtime.toISOString()
                    });
                }
            }
        }

        // Check for standalone root .bin files (including firmware.bin if not found in .pio)
        try {
            const rootBins = fs.readdirSync(projDir).filter(f => f.endsWith('.bin') && (!foundBin || f !== 'firmware.bin'));
            for (const rBin of rootBins) {
                foundBin = true;
                const binFile = path.join(projDir, rBin);
                const stat = fs.statSync(binFile);
                const destCategoryDir = path.join(STATIC_FIRMWARE_DIR, rawCategory);
                if (!fs.existsSync(destCategoryDir)) fs.mkdirSync(destCategoryDir, { recursive: true });

                const destFileName = `${sanitizeFilename(projectName)}_${sanitizeFilename(rBin)}`;
                const destPath = path.join(destCategoryDir, destFileName);
                fs.copyFileSync(binFile, destPath);

                const isGenericFirmware = rBin === 'firmware.bin';
                const binChip = isGenericFirmware ? chip : detectChip('', '', rBin);
                const relativeBinUrl = `/ESP32Codes/static-firmware/${rawCategory}/${destFileName}`;
                const id = `${sanitizeFilename(rawCategory)}_${sanitizeFilename(projectName)}_${sanitizeFilename(rBin)}`.toLowerCase();

                catalog.push({
                    id,
                    name: isGenericFirmware ? projectName : `${projectName} (${rBin.replace('.bin', '')})`,
                    category: categoryName,
                    rawCategory,
                    env: defaultEnv || 'release',
                    chip: binChip,
                    board: envData.options.board || 'esp32',
                    baudRate,
                    flashOffset: binChip === 'esp32c3' || binChip === 'esp32s3' ? '0x0' : '0x10000',
                    binPath: relativeBinUrl,
                    fileSize: stat.size,
                    hasBinary: true,
                    status: 'Ready to Flash',
                    description: desc,
                    pinout,
                    sourcePath: `/ESP32Codes/PlatformIO/${relPath.replace(/\\/g, '/')}`,
                    lastModified: stat.mtime.toISOString()
                });
            }
        } catch (e) {}

        if (!foundBin) {
            const id = `${sanitizeFilename(rawCategory)}_${sanitizeFilename(projectName)}`.toLowerCase();
            catalog.push({
                id,
                name: projectName,
                category: categoryName,
                rawCategory,
                env: defaultEnv,
                chip,
                board: envData.options.board || 'esp32',
                baudRate,
                flashOffset: chip === 'esp32c3' || chip === 'esp32s3' ? '0x0' : '0x10000',
                binPath: null,
                fileSize: 0,
                hasBinary: false,
                status: 'Source Code Available',
                description: desc,
                pinout,
                sourcePath: `/ESP32Codes/PlatformIO/${relPath.replace(/\\/g, '/')}`,
                lastModified: new Date().toISOString()
            });
        }
    }

    // MicroPython
    if (fs.existsSync(MICROPYTHON_DIR)) {
        function findBins(dir) {
            let res = [];
            try {
                for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, item.name);
                    if (item.isDirectory()) res = res.concat(findBins(full));
                    else if (item.name.endsWith('.bin')) res.push(full);
                }
            } catch {}
            return res;
        }

        const binFiles = findBins(MICROPYTHON_DIR);
        for (const binFile of binFiles) {
            const stat = fs.statSync(binFile);
            const fileName = path.basename(binFile);
            const destCategoryDir = path.join(STATIC_FIRMWARE_DIR, 'MicroPython');
            if (!fs.existsSync(destCategoryDir)) fs.mkdirSync(destCategoryDir, { recursive: true });
            const destFileName = sanitizeFilename(fileName);
            const destPath = path.join(destCategoryDir, destFileName);
            fs.copyFileSync(binFile, destPath);

            const chip = detectChip('', '', fileName);
            const id = `micropython_${sanitizeFilename(fileName)}`.toLowerCase();

            catalog.push({
                id,
                name: `MicroPython Official (${fileName.replace('.bin', '')})`,
                category: 'MicroPython',
                rawCategory: 'MicroPython',
                env: 'firmware',
                chip,
                board: 'esp32-c3',
                baudRate: 115200,
                flashOffset: '0x0',
                binPath: `/ESP32Codes/static-firmware/MicroPython/${destFileName}`,
                fileSize: stat.size,
                hasBinary: true,
                status: 'Ready to Flash',
                description: 'Official MicroPython firmware binary for ESP32-C3 RISC-V with integrated REPL shell, full hardware drivers, and filesystem support.',
                pinout: [
                    { pin: 'GPIO 8', role: 'Default Status LED (Active Low)' },
                    { pin: 'GPIO 9', role: 'Bootloader / User Button' },
                    { pin: 'GPIO 20', role: 'Native USB D- (CDC Serial)' },
                    { pin: 'GPIO 21', role: 'Native USB D+ (CDC Serial)' }
                ],
                sourcePath: '/ESP32Codes/MicroPython/',
                lastModified: stat.mtime.toISOString()
            });
        }
    }

    const map = new Map();
    for (const item of catalog) {
        map.set(item.id, item);
    }
    const allEntries = Array.from(map.values());

    allEntries.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        if (a.hasBinary !== b.hasBinary) return a.hasBinary ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(allEntries, null, 2), 'utf8');

    const flashableCount = allEntries.filter(e => e.hasBinary).length;
    const sourceCount = allEntries.filter(e => !e.hasBinary).length;

    console.log(`\n✔ Processed ${allEntries.length} Total Projects!`);
    console.log(`   - ⚡ ${flashableCount} Flashable Binaries ready for Web Serial`);
    console.log(`   - 📁 ${sourceCount} Source Projects cataloged with Pinouts & Extended Descriptions`);
    console.log(`✔ Manifest saved to: ${MANIFEST_PATH}\n`);
}

main();
