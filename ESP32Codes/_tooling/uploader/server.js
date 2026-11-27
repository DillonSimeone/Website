const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, execSync, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3567;
const WORKSPACE_DIR = path.resolve(__dirname, '../../../..');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Keep track of active processes & cancellation tokens
let activeProcesses = {
  build: null,
  monitor: null
};
let currentBuildRunId = 0;
let pendingBuildTimer = null;
let pendingMonitorTimer = null;

// Configured state for active device monitoring
let monitorConfig = {
  projectDir: null,
  port: null,
  baud: 115200
};

// Resolve PlatformIO core dir once (follow junctions like C:\Users\…\.platformio → F:\.platformio).
function getPlatformioCoreDir() {
  const configured = process.env.PLATFORMIO_CORE_DIR || path.join(os.homedir(), '.platformio');
  try {
    return fs.realpathSync(configured);
  } catch {
    return configured;
  }
}

const PLATFORMIO_CORE_DIR = getPlatformioCoreDir();

// Helper: Find PlatformIO executable path (prefer the core-dir venv over pip/global pio).
function getPioCommand(coreDir) {
  const possiblePaths = [
    path.join(coreDir, 'penv/Scripts/pio.exe'),
    path.join(coreDir, 'penv/bin/pio'),
    path.join(os.homedir(), '.platformio/penv/Scripts/pio.exe'),
    path.join(os.homedir(), '.platformio/penv/bin/pio'),
    path.join(os.homedir(), 'AppData/Local/Programs/Python/Python314/Scripts/pio.exe'),
    path.join(os.homedir(), 'AppData/Local/Programs/Python/Python313/Scripts/pio.exe'),
    path.join(os.homedir(), 'AppData/Local/Programs/Python/Python312/Scripts/pio.exe'),
    path.join(os.homedir(), 'AppData/Local/Programs/Python/Python311/Scripts/pio.exe'),
    path.join(os.homedir(), 'AppData/Local/Programs/Python/Python310/Scripts/pio.exe'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback to searching on PATH
  try {
    execSync('where pio', { stdio: 'ignore' });
    return 'pio';
  } catch (e) {
    try {
      execSync('which pio', { stdio: 'ignore' });
      return 'pio';
    } catch (e2) {
      return 'pio';
    }
  }
}

const PIO_PATH = getPioCommand(PLATFORMIO_CORE_DIR);
console.log(`[Uploader Backend] PlatformIO core: ${PLATFORMIO_CORE_DIR}`);
console.log(`[Uploader Backend] Resolved pio path: ${PIO_PATH}`);

// Windows cp932 consoles crash PlatformIO when esptool prints Unicode progress bars.
function childEnv() {
  const pioBinDir = PIO_PATH.includes(path.sep) ? path.dirname(PIO_PATH) : '';
  const pathPrefix = pioBinDir ? `${pioBinDir}${path.delimiter}` : '';
  return {
    ...process.env,
    PLATFORMIO_CORE_DIR,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONLEGACYWINDOWSSTDIO: 'utf-8',
    PATH: `${pathPrefix}${process.env.PATH}`
  };
}

function runPioTargets(projectDir, env, port, targets, wasMonitoring, runId = currentBuildRunId) {
  // `pio run` resolves environment-specific packages directly without `pio pkg install`
  // overriding global tool-scons (e.g. pioarduino/scons breaking standard espressif32 builds).
  checkExternalPioWarning('build').then(() => {
    if (runId !== currentBuildRunId) return;
    runPioTargetsAfterPackages(projectDir, env, port, targets, wasMonitoring, runId);
  });
}

function projectHasLittleFS(projectDir) {
  const dataDir = path.join(projectDir, 'data');
  if (!fs.existsSync(dataDir)) return false;
  const iniPath = path.join(projectDir, 'platformio.ini');
  if (!fs.existsSync(iniPath)) return true;
  const ini = fs.readFileSync(iniPath, 'utf8');
  return /board_build\.filesystem\s*=/i.test(ini)
    || /filesystem_type\s*=/i.test(ini)
    || /littlefs/i.test(ini);
}

/** Feature flag → short UI label (Haxel modular builds and common ESP32 flags). */
const FLAG_LABELS = {
  HAXEL_WIFI: 'WiFi',
  HAXEL_BLU: 'BLE',
  HAXEL_FEATURE_LED: 'LED',
  HAXEL_FEATURE_AUDIO: 'Audio',
  HAXEL_FEATURE_KNOBS: 'Knobs',
  HAXEL_FEATURE_OLED: 'OLED',
  HAXEL_FEATURE_MESH_MASTER: 'Mesh Master',
  HAXEL_FEATURE_MESH_FOLLOWER: 'Mesh Follower',
  HAXEL_TARGET_C3: 'ESP32-C3',
  HAXEL_TARGET_C6: 'ESP32-C6',
  HAXEL_TARGET_S3: 'ESP32-S3',
  HAXEL_TARGET_CLASSIC: 'ESP32',
};

/**
 * Parse platformio.ini into flashable env metadata.
 * Returns { envs: string[], envMeta: { [name]: { label, flags, needsUploadFs, flashable } }, libs: string[] }
 */
function parsePlatformioIni(iniContent, projectDir) {
  const lines = iniContent.split(/\r?\n/);
  const sections = {};
  let current = null;
  let inLibDeps = false;
  let collectingFlags = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    const headerMatch = trimmed.match(/^\[([^\]]+)\](?:\s*[;#].*)?$/);
    if (headerMatch) {
      current = headerMatch[1].trim();
      sections[current] = { lines: [], buildFlags: [], libDeps: [] };
      inLibDeps = false;
      collectingFlags = false;
      continue;
    }
    if (!current || !sections[current]) continue;
    sections[current].lines.push(raw);

    if (trimmed.startsWith('lib_deps')) {
      inLibDeps = true;
      collectingFlags = false;
      const val = trimmed.substring(trimmed.indexOf('=') + 1).trim();
      if (val) sections[current].libDeps.push(val);
      continue;
    }
    if (trimmed.startsWith('build_flags')) {
      collectingFlags = true;
      inLibDeps = false;
      const val = trimmed.substring(trimmed.indexOf('=') + 1).trim();
      if (val) sections[current].buildFlags.push(val);
      continue;
    }
    if (inLibDeps) {
      if (trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      if (trimmed.includes('=') && !trimmed.startsWith('-')) {
        inLibDeps = false;
      } else if (trimmed) {
        sections[current].libDeps.push(trimmed);
      }
      continue;
    }
    if (collectingFlags) {
      if (trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(trimmed) && !trimmed.startsWith('-')) {
        collectingFlags = false;
      } else if (trimmed) {
        sections[current].buildFlags.push(trimmed);
      }
    }
  }

  function resolveFlags(sectionName, depth = 0) {
    if (!sectionName || depth > 8 || !sections[sectionName]) return [];
    const sec = sections[sectionName];
    const out = [...sec.buildFlags];
    for (const line of sec.lines) {
      const m = line.trim().match(/^extends\s*=\s*(.+)$/);
      if (!m) continue;
      for (const part of m[1].split(',')) {
        const parent = part.trim();
        if (parent) out.unshift(...resolveFlags(parent, depth + 1));
      }
    }
    return out;
  }

  function resolveLibDeps(sectionName, depth = 0, visited = new Set()) {
    if (!sectionName || depth > 8 || !sections[sectionName] || visited.has(sectionName)) return [];
    visited.add(sectionName);
    const sec = sections[sectionName];
    const rawDeps = [...sec.libDeps];

    // Check extends = ...
    for (const line of sec.lines) {
      const m = line.trim().match(/^extends\s*=\s*(.+)$/);
      if (!m) continue;
      for (const part of m[1].split(',')) {
        const parent = part.trim();
        if (parent && sections[parent]) {
          rawDeps.unshift(...resolveLibDeps(parent, depth + 1, visited));
        }
      }
    }

    // Include base [env] section if this is [env:name] and env is not visited
    if (sectionName.startsWith('env:') && sectionName !== 'env' && sections['env'] && !visited.has('env')) {
      rawDeps.unshift(...resolveLibDeps('env', depth + 1, visited));
    }

    const out = [];
    for (const dep of rawDeps) {
      const m = dep.match(/\$\{([^}]+)\}/);
      if (m) {
        // e.g. wifi_libs.lib_deps or env.lib_deps
        const varRef = m[1].trim();
        const targetSec = varRef.split('.')[0];
        if (targetSec && sections[targetSec]) {
          out.push(...resolveLibDeps(targetSec, depth + 1, visited));
        }
      } else if (dep.trim()) {
        out.push(dep.trim());
      }
    }
    return out;
  }

  function extractActiveFlags(flagLines) {
    // Last assignment wins for -DNAME=0/1 and bare -DNAME
    const values = {};
    for (const line of flagLines) {
      for (const tok of line.split(/\s+/)) {
        const m = tok.match(/^-D([A-Za-z0-9_]+)(?:=(.*))?$/);
        if (!m) continue;
        const name = m[1];
        const raw = m[2] !== undefined ? m[2].replace(/^"|"$/g, '') : '1';
        values[name] = raw;
      }
    }
    const active = [];
    for (const [name, raw] of Object.entries(values)) {
      if (!(name in FLAG_LABELS)) continue;
      if (raw === '0' || raw === 'false' || raw === 'FALSE') continue;
      active.push(name);
    }
    // Prefer transport exclusivity display order
    const order = Object.keys(FLAG_LABELS);
    active.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return active;
  }

  const hasFs = projectHasLittleFS(projectDir);
  const envs = [];
  const envMeta = {};
  let allLibs = [];

  for (const name of Object.keys(sections)) {
    if (!name.startsWith('env:')) continue;
    const envName = name.slice(4);
    if (envName === 'native-test') continue; // host unit tests — not flashable

    const flags = extractActiveFlags(resolveFlags(name));
    const labels = flags.map(f => FLAG_LABELS[f]).filter(Boolean);
    const hasHaxelFlags = flags.some(f => f.startsWith('HAXEL_'));
    const hasWifi = flags.includes('HAXEL_WIFI') || flags.includes('HAXEL_FEATURE_MESH_MASTER');
    const needsUploadFs = hasHaxelFlags ? (hasFs && hasWifi) : hasFs;
    const envLibs = [...new Set(resolveLibDeps(name).filter(l => l && !l.includes('${')))];
    allLibs.push(...envLibs);

    envs.push(envName);
    envMeta[envName] = {
      label: labels.length ? `${envName} — ${labels.join(' · ')}` : envName,
      flags,
      flagLabels: labels,
      needsUploadFs,
      flashable: true,
      libs: envLibs
    };
  }

  return {
    envs,
    envMeta,
    libs: [...new Set(allLibs.filter(Boolean))]
  };
}

function envNeedsUploadFs(projectDir, envName) {
  const iniPath = path.join(projectDir, 'platformio.ini');
  if (!fs.existsSync(iniPath)) return projectHasLittleFS(projectDir);
  const parsed = parsePlatformioIni(fs.readFileSync(iniPath, 'utf8'), projectDir);
  if (parsed.envMeta[envName]) return !!parsed.envMeta[envName].needsUploadFs;
  return projectHasLittleFS(projectDir);
}

function attachBuildOutput(proc, onText) {
  const handleData = (data) => {
    const text = data.toString('utf8');
    broadcast({ type: 'log', stream: 'build', text });
    if (onText) onText(text);
  };
  proc.stdout.on('data', handleData);
  proc.stderr.on('data', handleData);
}

function isPioCoreOutdatedError(text) {
  if (!text) return false;
  return /IncompatiblePlatform:/i.test(text)
    || /depends on PlatformIO Core\s*[><=]/i.test(text)
    || /Please upgrade PlatformIO Core/i.test(text);
}

function extractPioOutdatedReason(text) {
  const lines = String(text || '').split(/\r?\n/);
  const match = lines.find(l => /IncompatiblePlatform:|depends on PlatformIO Core|Please upgrade PlatformIO Core/i.test(l));
  return match ? match.trim() : 'This project requires a newer version of PlatformIO Core.';
}

function showWindowsYesNoDialog(title, message, runId) {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise(resolve => {
    const psScript = "$ws = New-Object -ComObject WScript.Shell; $r = $ws.Popup($env:PIO_DLG_MSG, 0, $env:PIO_DLG_TITLE, 4 + 48 + 4096); Write-Output $r";
    const dlgProc = spawn('powershell', ['-NoProfile', '-Command', psScript], {
      env: { ...process.env, PIO_DLG_TITLE: title, PIO_DLG_MSG: message },
      windowsHide: true
    });
    activeProcesses.build = dlgProc;
    let out = '';
    dlgProc.stdout.on('data', d => { out += d.toString('utf8'); });
    dlgProc.on('error', () => resolve(false));
    dlgProc.on('close', () => {
      if (runId !== currentBuildRunId) {
        resolve(false);
        return;
      }
      // WScript.Shell.Popup returns 6 for Yes, 7 for No
      resolve(out.trim() === '6');
    });
  });
}

function killAllPioProcesses() {
  if (process.platform !== 'win32') return;
  for (const img of ['pio.exe', 'platformio.exe']) {
    try {
      execFileSync('taskkill', ['/F', '/IM', img, '/T'], { stdio: 'ignore', windowsHide: true, timeout: 4000 });
    } catch {
      // Ignore if no matching process is running
    }
  }
}

function resolvePioPython() {
  if (PIO_PATH && PIO_PATH.includes(path.sep)) {
    const sameDir = path.join(path.dirname(PIO_PATH), process.platform === 'win32' ? 'python.exe' : 'python');
    if (fs.existsSync(sameDir)) return sameDir;
    const parentDir = path.join(path.dirname(path.dirname(PIO_PATH)), process.platform === 'win32' ? 'python.exe' : 'python');
    if (fs.existsSync(parentDir)) return parentDir;
  }
  for (const pyCmd of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    try {
      const out = execFileSync(pyCmd, ['-c', 'import sys, platformio; print(sys.executable)'], {
        env: childEnv(),
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true
      }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function runPioUpgrade(runId) {
  return new Promise(resolve => {
    if (runId !== currentBuildRunId) return resolve(false);

    broadcast({ type: 'log', stream: 'build', text: '[System] Closing any running pio.exe / platformio.exe processes...\n' });
    killAllPioProcesses();

    const pythonExe = resolvePioPython();
    const cmd = pythonExe || PIO_PATH;
    const args = pythonExe ? ['-m', 'pip', 'install', '-U', 'platformio'] : ['upgrade'];
    broadcast({ type: 'log', stream: 'build', text: `[System] Running "${cmd} ${args.join(' ')}"...\n\n` });

    const proc = spawn(cmd, args, { cwd: WORKSPACE_DIR, env: childEnv() });
    activeProcesses.build = proc;
    attachBuildOutput(proc);
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (runId !== currentBuildRunId) return resolve(false);
      resolve(ok);
    };
    proc.on('error', err => {
      broadcast({ type: 'log', stream: 'build', text: `\n[System] Failed to run PlatformIO update: ${err.message}\n` });
      finish(false);
    });
    proc.on('close', code => {
      if (code === 0) {
        broadcast({ type: 'log', stream: 'build', text: '\n[System] PlatformIO Core updated successfully! Retrying...\n\n' });
        finish(true);
      } else {
        broadcast({ type: 'log', stream: 'build', text: `\n[System] PlatformIO upgrade FAILED (exit ${code}).\n` });
        finish(false);
      }
    });
  });
}

function isWindowsLongPathError(text) {
  if (process.platform !== 'win32' || !text) return false;
  const match = text.match(/FileNotFoundError:\s*\[Errno 2\]\s*No such file or directory:\s*['"]([^'"]+)['"]/i);
  if (!match) return false;
  return match[1].length >= 240 || /pkg-installing-/i.test(match[1]);
}

function isWindowsLongPathsEnabled() {
  if (process.platform !== 'win32') return true;
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', "(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled"],
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    ).trim();
    return out === '1';
  } catch {
    return false;
  }
}

function enableWindowsLongPaths(runId) {
  return new Promise(resolve => {
    if (runId !== currentBuildRunId) return resolve(false);
    broadcast({ type: 'log', stream: 'build', text: '[System] Requesting Admin (UAC) permission to enable Windows Long Paths...\n' });
    const psScript = "Start-Process -FilePath 'reg.exe' -ArgumentList 'add','HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem','/v','LongPathsEnabled','/t','REG_DWORD','/d','1','/f' -Verb RunAs -Wait -WindowStyle Hidden";
    const proc = spawn('powershell', ['-NoProfile', '-Command', psScript], { windowsHide: true });
    activeProcesses.build = proc;
    proc.on('error', err => {
      broadcast({ type: 'log', stream: 'build', text: `[System] Failed to elevate reg.exe: ${err.message}\n` });
      resolve(false);
    });
    proc.on('close', () => {
      if (runId !== currentBuildRunId) return resolve(false);
      const ok = isWindowsLongPathsEnabled();
      if (ok) {
        broadcast({ type: 'log', stream: 'build', text: '[System] Windows Long Paths enabled! Retrying...\n\n' });
      } else {
        broadcast({ type: 'log', stream: 'build', text: '[System] Windows Long Paths was not enabled (UAC cancelled or failed).\n' });
      }
      resolve(ok);
    });
  });
}

async function promptAndEnableLongPaths(runId) {
  if (isWindowsLongPathsEnabled()) return false;
  broadcast({
    type: 'log',
    stream: 'build',
    text: '\n[System] Detected Windows 260-char MAX_PATH error during package extraction. Prompting to enable Windows Long Paths...\n'
  });
  const msg = 'Windows MAX_PATH (260-character limit) blocked extracting a PlatformIO package.\n\nEnable Windows Long Paths (LongPathsEnabled = 1, requires Admin UAC prompt) and retry?';
  const approved = await showWindowsYesNoDialog('Windows Long Paths Required', msg, runId);
  if (runId !== currentBuildRunId) return false;
  if (!approved) {
    broadcast({ type: 'log', stream: 'build', text: '[System] Enabling Windows Long Paths declined by user.\n' });
    return false;
  }
  return await enableWindowsLongPaths(runId);
}

async function promptAndUpgradePio(outputText, runId) {
  const reason = extractPioOutdatedReason(outputText);
  broadcast({
    type: 'log',
    stream: 'build',
    text: '\n[System] Detected outdated PlatformIO Core. Prompting to update PlatformIO...\n'
  });

  if (process.platform !== 'win32') {
    broadcast({
      type: 'log',
      stream: 'build',
      text: '[System] Run "pio upgrade" in your terminal and retry.\n'
    });
    return false;
  }

  const msg = `${reason}\n\nWould you like to update PlatformIO Core now and retry?`;
  const approved = await showWindowsYesNoDialog('PlatformIO Update Required', msg, runId);
  if (runId !== currentBuildRunId) return false;
  if (!approved) {
    broadcast({ type: 'log', stream: 'build', text: '[System] PlatformIO update declined by user.\n' });
    return false;
  }
  return await runPioUpgrade(runId);
}

async function tryRecoverPioFailure(outputText, runId, triedSet) {
  if (!triedSet.has('upgrade') && isPioCoreOutdatedError(outputText)) {
    triedSet.add('upgrade');
    return await promptAndUpgradePio(outputText, runId);
  }
  if (!triedSet.has('longpaths') && isWindowsLongPathError(outputText)) {
    triedSet.add('longpaths');
    return await promptAndEnableLongPaths(runId);
  }
  return false;
}

function startSerialMonitorProcess(projectDir, port, baud, logExit = false) {
  if (!port) {
    broadcast({ type: 'log', stream: 'monitor', text: '[Monitor] No serial port specified or detected.\n' });
    broadcast({ type: 'status', stream: 'monitor', active: false });
    return null;
  }
  const pythonExe = resolvePioPython() || (process.platform === 'win32' ? 'python' : 'python3');
  const baudRate = String(baud || 115200);
  const pyScript = [
    'import sys, serial',
    'ser = serial.Serial(sys.argv[1], int(sys.argv[2]), timeout=0.1)',
    'try:',
    '    while True:',
    '        data = ser.read(1024)',
    '        if data:',
    '            sys.stdout.buffer.write(data)',
    '            sys.stdout.buffer.flush()',
    'except KeyboardInterrupt:',
    '    pass',
    'finally:',
    '    ser.close()'
  ].join('\n');

  console.log(`[WS] Spawning pyserial monitor: ${pythonExe} (${port} @ ${baudRate})`);
  const monProc = spawn(pythonExe, ['-u', '-c', pyScript, port, baudRate], {
    cwd: projectDir || WORKSPACE_DIR,
    env: childEnv()
  });

  activeProcesses.monitor = monProc;
  broadcast({ type: 'status', stream: 'monitor', active: true });

  monProc.stdout.on('data', data => {
    broadcast({ type: 'log', stream: 'monitor', text: data.toString('utf8') });
  });
  monProc.stderr.on('data', data => {
    broadcast({ type: 'log', stream: 'monitor', text: data.toString('utf8') });
  });
  monProc.on('error', err => {
    broadcast({ type: 'log', stream: 'monitor', text: `\n[Monitor] Failed to start monitor: ${err.message}\n` });
    broadcast({ type: 'status', stream: 'monitor', active: false });
    activeProcesses.monitor = null;
  });
  monProc.on('close', code => {
    if (logExit) {
      broadcast({ type: 'log', stream: 'monitor', text: `\n[Monitor] Process exited with code ${code}\n` });
    }
    broadcast({ type: 'status', stream: 'monitor', active: false });
    activeProcesses.monitor = null;
  });
  return monProc;
}

function resumeMonitor(wasMonitoring) {
  if (!wasMonitoring) return;
  broadcast({ type: 'log', stream: 'build', text: '[System] Auto-resuming serial monitor in 2 seconds...\n' });
  if (pendingMonitorTimer) clearTimeout(pendingMonitorTimer);
  pendingMonitorTimer = setTimeout(() => {
    pendingMonitorTimer = null;
    if (activeProcesses.build || activeProcesses.monitor) return;
    startSerialMonitorProcess(monitorConfig.projectDir, monitorConfig.port, monitorConfig.baud, false);
  }, 2000);
}

function runPioTargetsAfterPackages(projectDir, env, port, targets, wasMonitoring, runId = currentBuildRunId) {
  let step = 0;
  const triedRecovery = new Set();

  const runNext = () => {
    if (runId !== currentBuildRunId) return;
    if (step >= targets.length) {
      activeProcesses.build = null;
      broadcast({ type: 'status', stream: 'build', active: false });
      broadcast({ type: 'log', stream: 'build', text: '\n[System] Flash SUCCESSFUL!\n' });
      resumeMonitor(wasMonitoring);
      return;
    }

    const target = targets[step++];
    const args = ['run', '-t', target, '-e', env];
    if (port) args.push('--upload-port', port);

    broadcast({
      type: 'log',
      stream: 'build',
      text: `[System] pio ${args.join(' ')}\n\n`
    });

    let outputTail = '';
    const proc = spawn(PIO_PATH, args, { cwd: projectDir, env: childEnv() });
    activeProcesses.build = proc;
    attachBuildOutput(proc, (chunk) => {
      outputTail = (outputTail + chunk).slice(-16384);
    });

    let done = false;
    const handleFinish = async (code, errMsg) => {
      if (done) return;
      done = true;
      if (runId !== currentBuildRunId) return;
      if (errMsg || code !== 0) {
        if (!errMsg) {
          const recovered = await tryRecoverPioFailure(outputTail, runId, triedRecovery);
          if (runId !== currentBuildRunId) return;
          if (recovered) {
            step--;
            runNext();
            return;
          }
        }
        activeProcesses.build = null;
        broadcast({ type: 'status', stream: 'build', active: false });
        broadcast({
          type: 'log',
          stream: 'build',
          text: errMsg ? `\n[System] ${errMsg}\n` : `\n[System] Flash FAILED at target "${target}" (exit ${code}).\n`
        });
        return;
      }
      if (target === 'upload' && envNeedsUploadFs(projectDir, env)) {
        broadcast({ type: 'log', stream: 'build', text: '[System] Firmware OK — uploading LittleFS (data/)...\n' });
      }
      runNext();
    };

    proc.on('error', err => handleFinish(1, `Failed to start pio (${PIO_PATH}): ${err.message}`));
    proc.on('close', code => handleFinish(code, null));
  };

  runNext();
}

function listToolDirs(parentDir, prefix) {
  if (!fs.existsSync(parentDir)) return [];
  try {
    return fs.readdirSync(parentDir)
      .filter(name => name === prefix || name.startsWith(prefix + '@'))
      .sort()
      .reverse()
      .map(name => path.join(parentDir, name));
  } catch {
    return [];
  }
}

function probeEsptoolCandidate(cmd, baseArgs) {
  try {
    const out = execFileSync(cmd, [...baseArgs, 'version'], {
      env: childEnv(),
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const m = out.match(/(\d+)\.\d+/);
    const major = m ? parseInt(m[1], 10) : 4;
    return { cmd, baseArgs, major };
  } catch {
    return null;
  }
}

// Resolve a working esptool invocation (verifies execution so broken python -m esptool is skipped)
function resolveEsptool() {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'esptool.exe' : 'esptool';
  const pioPython = isWin
    ? path.join(PLATFORMIO_CORE_DIR, 'penv/Scripts/python.exe')
    : path.join(PLATFORMIO_CORE_DIR, 'penv/bin/python');

  const toolDirs = [
    ...listToolDirs(path.join(PLATFORMIO_CORE_DIR, 'tools'), 'tool-esptoolpy'),
    ...listToolDirs(path.join(PLATFORMIO_CORE_DIR, 'packages'), 'tool-esptoolpy'),
  ];

  const exeCandidates = [
    path.join(PLATFORMIO_CORE_DIR, isWin ? 'penv/Scripts/esptool.exe' : 'penv/bin/esptool'),
    ...toolDirs.map(d => path.join(d, exeName)),
  ];

  for (const exe of exeCandidates) {
    if (!fs.existsSync(exe)) continue;
    const ok = probeEsptoolCandidate(exe, []);
    if (ok) return ok;
  }

  if (fs.existsSync(pioPython)) {
    for (const dir of toolDirs) {
      const script = path.join(dir, 'esptool.py');
      if (!fs.existsSync(script)) continue;
      const ok = probeEsptoolCandidate(pioPython, [script]);
      if (ok) return ok;
    }
    const modOk = probeEsptoolCandidate(pioPython, ['-m', 'esptool']);
    if (modOk) return modOk;
  }

  return probeEsptoolCandidate(exeName, []);
}

function buildEsptoolFlashArgs(resolved, chip, port, flashTargets) {
  const args = [...resolved.baseArgs];
  args.push('--chip', chip);
  if (port) args.push('--port', port);
  args.push('--baud', '921600');
  args.push(resolved.major >= 5 ? 'write-flash' : 'write_flash', '--no-progress');
  if (Array.isArray(flashTargets)) {
    for (const item of flashTargets) {
      args.push(item.offset, item.path);
    }
  } else {
    args.push(arguments[3], arguments[4]);
  }
  return args;
}

function getBootloaderOffset(chip) {
  return (chip === 'esp32' || chip === 'esp32s2') ? '0x1000' : '0x0000';
}

function parsePartitionsBin(binPath) {
  if (!fs.existsSync(binPath)) return null;
  try {
    const buf = fs.readFileSync(binPath);
    const out = { appOffset: null, otaOffset: null, fsOffset: null };
    for (let off = 0; off + 32 <= buf.length; off += 32) {
      if (buf.readUInt16LE(off) !== 0x50AA) break;
      const type = buf[off + 2];
      const subtype = buf[off + 3];
      const partOffset = buf.readUInt32LE(off + 4);
      const rawName = buf.subarray(off + 12, off + 28);
      const zeroIdx = rawName.indexOf(0);
      const name = (zeroIdx >= 0 ? rawName.subarray(0, zeroIdx) : rawName).toString('ascii').toLowerCase();
      const hex = '0x' + partOffset.toString(16);

      if (type === 0 && (subtype === 0 || (subtype >= 0x10 && subtype <= 0x1f)) && !out.appOffset) {
        out.appOffset = hex;
      } else if (type === 1 && (subtype === 0x00 || name === 'otadata') && !out.otaOffset) {
        out.otaOffset = hex;
      } else if (type === 1 && (subtype === 0x82 || subtype === 0x81 || name.includes('spiffs') || name.includes('littlefs') || name.includes('fat')) && !out.fsOffset) {
        out.fsOffset = hex;
      }
    }
    return out;
  } catch {
    return null;
  }
}

function findBootApp0Bin() {
  const candidates = [
    path.join(PLATFORMIO_CORE_DIR, 'packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin'),
    ...listToolDirs(path.join(PLATFORMIO_CORE_DIR, 'packages'), 'framework-arduinoespressif32')
      .map(d => path.join(d, 'tools/partitions/boot_app0.bin')),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function detectChipFromEnv(iniContent, projectDir, envName) {
  if (!iniContent) return 'esp32';

  // 1. Check parsed envMeta flags if available (e.g., HAXEL_TARGET_*)
  const parsed = parsePlatformioIni(iniContent, projectDir);
  if (parsed.envMeta && parsed.envMeta[envName]) {
    const flags = parsed.envMeta[envName].flags || [];
    if (flags.includes('HAXEL_TARGET_C3')) return 'esp32c3';
    if (flags.includes('HAXEL_TARGET_S3')) return 'esp32s3';
    if (flags.includes('HAXEL_TARGET_C6')) return 'esp32c6';
    if (flags.includes('HAXEL_TARGET_CLASSIC')) return 'esp32';
  }

  // 2. Parse section lines for target env, extended sections, or general env
  const lines = iniContent.split(/\r?\n/);
  const targetSections = new Set([`env:${envName}`, 'env']);
  let inTargetSec = false;
  let envLines = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const section = trimmed.slice(1, -1);
      inTargetSec = targetSections.has(section);
      continue;
    }
    if (inTargetSec && trimmed && !trimmed.startsWith(';') && !trimmed.startsWith('#')) {
      envLines.push(trimmed);
    }
  }

  const envText = envLines.join('\n').toLowerCase();

  // Check board_build.mcu = ...
  const mcuMatch = envText.match(/board_build\.mcu\s*=\s*([a-z0-9_-]+)/);
  if (mcuMatch) {
    const mcu = mcuMatch[1].replace(/[-_]/g, '');
    if (['esp32c3', 'esp32s3', 'esp32c6', 'esp32s2', 'esp32h2', 'esp32'].includes(mcu)) {
      return mcu;
    }
  }

  // Check board = ...
  const boardMatch = envText.match(/board\s*=\s*([a-z0-9_-]+)/);
  if (boardMatch) {
    const board = boardMatch[1];
    if (board.includes('esp32-c3') || board.includes('esp32c3') || board.includes('xiao_esp32c3')) return 'esp32c3';
    if (board.includes('esp32-s3') || board.includes('esp32s3')) return 'esp32s3';
    if (board.includes('esp32-c6') || board.includes('esp32c6')) return 'esp32c6';
    if (board.includes('esp32-s2') || board.includes('esp32s2')) return 'esp32s2';
    if (board.includes('esp32dev') || board.includes('wrover') || board.includes('nodemcu') || board.includes('pico')) return 'esp32';
  }

  // Check env name itself
  const lowerEnv = (envName || '').toLowerCase();
  if (lowerEnv.includes('c3')) return 'esp32c3';
  if (lowerEnv.includes('s3')) return 'esp32s3';
  if (lowerEnv.includes('c6')) return 'esp32c6';
  if (lowerEnv.includes('s2')) return 'esp32s2';

  // Fallback to checking target section text
  if (envText.includes('esp32-c3') || envText.includes('esp32c3')) return 'esp32c3';
  if (envText.includes('esp32-s3') || envText.includes('esp32s3')) return 'esp32s3';
  if (envText.includes('esp32-c6') || envText.includes('esp32c6')) return 'esp32c6';

  return 'esp32';
}

function getCustomPartitionCsvPath(projectDir, iniContent, envName) {
  if (!iniContent) return null;
  const lines = iniContent.split(/\r?\n/);
  let inTarget = false;
  const secName = `env:${envName}`;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const section = trimmed.slice(1, -1);
      inTarget = (section === secName || section === 'env');
      continue;
    }
    if (inTarget && trimmed.startsWith('board_build.partitions')) {
      const parts = trimmed.split('=');
      if (parts.length > 1) {
        const val = parts[1].trim();
        const csvPath = path.join(projectDir, val);
        if (fs.existsSync(csvPath)) return csvPath;
      }
    }
  }
  return null;
}

function parsePartitionOffset(projectDir, matcher, iniContent, envName) {
  let csvPath = getCustomPartitionCsvPath(projectDir, iniContent, envName);
  if (!csvPath) {
    csvPath = path.join(projectDir, 'partitions.csv');
  }
  if (!fs.existsSync(csvPath)) return null;
  for (const line of fs.readFileSync(csvPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split(',').map(s => s.trim());
    if (parts.length < 4) continue;
    if (matcher(parts)) return parts[3];
  }
  return null;
}

function getAppPartitionOffset(projectDir, iniContent, envName) {
  return parsePartitionOffset(projectDir, parts => {
    const type = (parts[1] || '').toLowerCase();
    const subtype = (parts[2] || '').toLowerCase();
    return type === 'app' && (subtype.startsWith('ota_') || subtype === 'factory');
  }, iniContent, envName) || '0x10000';
}

function getFilesystemPartitionOffset(projectDir, iniContent, envName) {
  return parsePartitionOffset(projectDir, parts => {
    const name = (parts[0] || '').toLowerCase();
    const subtype = (parts[2] || '').toLowerCase();
    return name.includes('spiffs') || name.includes('littlefs') || name.includes('fat')
      || subtype === 'spiffs' || subtype === 'fat' || subtype === 'littlefs';
  }, iniContent, envName);
}

function collectNewestCodeSource(projectDir) {
  let latestMtimeMs = 0;
  let latestFile = null;
  const skipDirs = new Set(['.pio', '.git', 'node_modules', '.vscode', 'dist', 'data']);
  const codeExts = new Set(['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.ino', '.s', '.S', '.asm']);

  function walk(dir, forceIncludeCodeDir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        const inCodeSubdir = forceIncludeCodeDir || ['src', 'include', 'lib'].includes(entry.name.toLowerCase());
        walk(fullPath, inCodeSubdir);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const isConfig = (dir === projectDir) && (entry.name === 'platformio.ini' || entry.name.endsWith('.py') || entry.name.endsWith('.csv'));
        if (!forceIncludeCodeDir && !isConfig && !codeExts.has(ext)) continue;
        try {
          const st = fs.statSync(fullPath);
          if (st.mtimeMs > latestMtimeMs) {
            latestMtimeMs = st.mtimeMs;
            latestFile = path.relative(projectDir, fullPath).replace(/\\/g, '/');
          }
        } catch {}
      }
    }
  }

  walk(projectDir, false);
  return { latestMtimeMs, latestFile };
}

function getEnvBuildFreshness(projectDir, env, cachedSource) {
  const binPath = path.join(projectDir, '.pio', 'build', env, 'firmware.bin');
  if (!fs.existsSync(binPath)) {
    return { exists: false, path: binPath, mtime: null, stale: false, staleFile: null };
  }
  let binMtimeMs = 0;
  let binMtime = null;
  try {
    const st = fs.statSync(binPath);
    binMtimeMs = st.mtimeMs;
    binMtime = st.mtime;
  } catch {
    return { exists: false, path: binPath, mtime: null, stale: false, staleFile: null };
  }
  const srcInfo = cachedSource || collectNewestCodeSource(projectDir);
  const stale = srcInfo.latestMtimeMs > binMtimeMs;
  return {
    exists: true,
    path: binPath,
    mtime: binMtime,
    stale,
    staleFile: stale ? srcInfo.latestFile : null,
    sourceMtime: srcInfo.latestMtimeMs ? new Date(srcInfo.latestMtimeMs) : null
  };
}

function spawnEsptoolFlash(resolved, projectDir, chip, port, flashTargets, runId, onClose) {
  if (runId !== currentBuildRunId) return null;
  const args = buildEsptoolFlashArgs(resolved, chip, port, flashTargets);
  broadcast({
    type: 'log',
    stream: 'build',
    text: `[System] esptool ${args.join(' ')}\n\n`
  });
  const proc = spawn(resolved.cmd, args, { cwd: projectDir, env: childEnv() });
  activeProcesses.build = proc;
  attachBuildOutput(proc);
  let finished = false;
  const finish = (code) => {
    if (finished) return;
    finished = true;
    if (runId !== currentBuildRunId) return;
    onClose(code);
  };
  proc.on('error', err => {
    broadcast({ type: 'log', stream: 'build', text: `\n[System] Failed to launch esptool (${resolved.cmd}): ${err.message}\n` });
    finish(1);
  });
  proc.on('close', code => finish(code));
  return proc;
}

function spawnPioTarget(projectDir, env, port, target, runId, onClose, triedRecovery = new Set()) {
  if (runId !== currentBuildRunId) return null;
  const args = ['run', '-t', target, '-e', env];
  if (port) args.push('--upload-port', port);
  broadcast({ type: 'log', stream: 'build', text: `[System] pio ${args.join(' ')}\n\n` });
  const proc = spawn(PIO_PATH, args, { cwd: projectDir, env: childEnv() });
  activeProcesses.build = proc;
  let outputTail = '';
  attachBuildOutput(proc, (chunk) => {
    outputTail = (outputTail + chunk).slice(-16384);
  });
  let finished = false;
  const finish = async (code) => {
    if (finished) return;
    finished = true;
    if (runId !== currentBuildRunId) return;
    if (code !== 0) {
      const recovered = await tryRecoverPioFailure(outputTail, runId, triedRecovery);
      if (runId !== currentBuildRunId) return;
      if (recovered) {
        spawnPioTarget(projectDir, env, port, target, runId, onClose, triedRecovery);
        return;
      }
    }
    onClose(code);
  };
  proc.on('error', err => {
    broadcast({ type: 'log', stream: 'build', text: `\n[System] Failed to launch pio (${PIO_PATH}): ${err.message}\n` });
    finish(1);
  });
  proc.on('close', code => finish(code));
  return proc;
}

function finishBuildJob(wasMonitoring, ok, message, runId) {
  if (runId !== currentBuildRunId) return;
  activeProcesses.build = null;
  broadcast({ type: 'status', stream: 'build', active: false });
  broadcast({ type: 'log', stream: 'build', text: message });
  if (ok) resumeMonitor(wasMonitoring);
}

function checkExternalPioWarning(stream = 'build') {
  if (process.platform !== 'win32') return Promise.resolve();
  return new Promise(resolve => {
    const cmd = "Get-CimInstance Win32_Process -Filter \"Name='pio.exe' OR Name='platformio.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
    execFile('powershell', ['-NoProfile', '-Command', cmd], { timeout: 2500, encoding: 'utf8' }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const ourPids = new Set([activeProcesses.build?.pid, activeProcesses.monitor?.pid].filter(Boolean));
          const others = list.filter(p => p && p.ProcessId && !ourPids.has(p.ProcessId));
          if (others.length > 0) {
            const summary = others.map(p => `PID ${p.ProcessId}: ${p.CommandLine || p.Name || 'pio'}`).join('; ');
            broadcast({
              type: 'log',
              stream,
              text: `[System] WARNING: Another PlatformIO process is already running (${summary}). Concurrent builds share ${PLATFORMIO_CORE_DIR}\\packages and can cause Access Denied / package mismatch errors!\n\n`
            });
          }
        } catch {}
      }
      resolve();
    });
  });
}

function iniHasExtraScripts(iniContent) {
  return /^\s*extra_scripts\s*=/im.test(iniContent || '');
}

function findExistingFsBin(buildDir) {
  const lfs = path.join(buildDir, 'littlefs.bin');
  if (fs.existsSync(lfs)) return lfs;
  const spiffs = path.join(buildDir, 'spiffs.bin');
  if (fs.existsSync(spiffs)) return spiffs;
  return null;
}

function isFsBinUpToDate(projectDir, fsBinPath) {
  if (!fsBinPath || !fs.existsSync(fsBinPath)) return false;
  let fsMtimeMs = 0;
  try { fsMtimeMs = fs.statSync(fsBinPath).mtimeMs; } catch { return false; }
  const dataDir = path.join(projectDir, 'data');
  if (!fs.existsSync(dataDir)) return false;
  let latestDataMs = 0;
  const walkData = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkData(full);
      else if (e.isFile()) {
        try {
          const mt = fs.statSync(full).mtimeMs;
          if (mt > latestDataMs) latestDataMs = mt;
        } catch {}
      }
    }
  };
  walkData(dataDir);
  return latestDataMs <= fsMtimeMs;
}

function runQuickFlash(projectDir, env, port, wasMonitoring, runId, options = {}) {
  if (runId !== currentBuildRunId) return;
  const resolved = resolveEsptool();
  const iniPath = path.join(projectDir, 'platformio.ini');
  const iniContent = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, 'utf8') : '';
  const chip = detectChipFromEnv(iniContent, projectDir, env);
  const buildDir = path.join(projectDir, '.pio', 'build', env);
  const partitionsBin = path.join(buildDir, 'partitions.bin');
  const binParts = parsePartitionsBin(partitionsBin);
  const appOffset = (binParts && binParts.appOffset) || getAppPartitionOffset(projectDir, iniContent, env);
  const binPath = path.join(buildDir, 'firmware.bin');
  const needFs = envNeedsUploadFs(projectDir, env);
  const freshness = getEnvBuildFreshness(projectDir, env);

  if (freshness.exists && freshness.stale && !options.forceQuick) {
    broadcast({
      type: 'log',
      stream: 'build',
      text: `[System] Source edited since last build (${freshness.staleFile} is newer than firmware.bin) — rebuilding fresh firmware via pio upload so old files are not flashed...\n\n`
    });
    const targets = ['upload'];
    if (needFs) targets.push('uploadfs');
    checkExternalPioWarning('build').then(() => runPioTargets(projectDir, env, port, targets, wasMonitoring, runId));
    return;
  }

  if (!resolved || !fs.existsSync(binPath)) {
    const why = !resolved ? 'esptool could not be resolved' : `No firmware.bin for env "${env}"`;
    broadcast({ type: 'log', stream: 'build', text: `[System] ${why} — falling back to pio upload...\n` });
    const targets = ['upload'];
    if (needFs) targets.push('uploadfs');
    checkExternalPioWarning('build').then(() => runPioTargets(projectDir, env, port, targets, wasMonitoring, runId));
    return;
  }

  const prebuiltFsBin = needFs ? findExistingFsBin(buildDir) : null;
  const prebuiltFsOffset = (binParts && binParts.fsOffset) || getFilesystemPartitionOffset(projectDir, iniContent, env);
  const canFlashFsInline = needFs && !iniHasExtraScripts(iniContent) && prebuiltFsOffset && isFsBinUpToDate(projectDir, prebuiltFsBin);

  broadcast({
    type: 'log',
    stream: 'build',
    text: `[System] Quick flash firmware (${chip}, env: ${env})${needFs ? (canFlashFsInline ? ' + up-to-date LittleFS' : ' + LittleFS (data/)') : ''}...\n\n`
  });

  const flashTargets = [];
  const bootloaderBin = path.join(buildDir, 'bootloader.bin');
  if (fs.existsSync(bootloaderBin)) flashTargets.push({ offset: getBootloaderOffset(chip), path: bootloaderBin });
  if (fs.existsSync(partitionsBin)) flashTargets.push({ offset: '0x8000', path: partitionsBin });
  if (binParts && binParts.otaOffset) {
    const bootApp0 = findBootApp0Bin();
    if (bootApp0) flashTargets.push({ offset: binParts.otaOffset, path: bootApp0 });
  }
  flashTargets.push({ offset: appOffset, path: binPath });
  if (canFlashFsInline) {
    flashTargets.push({ offset: prebuiltFsOffset, path: prebuiltFsBin });
  }

  spawnEsptoolFlash(resolved, projectDir, chip, port, flashTargets, runId, (fwCode) => {
    if (fwCode !== 0) {
      finishBuildJob(wasMonitoring, false, `\n[System] Quick flash FAILED at firmware (exit ${fwCode}).\n`, runId);
      return;
    }

    if (!needFs || canFlashFsInline) {
      finishBuildJob(wasMonitoring, true, canFlashFsInline ? '\n[System] Quick flash SUCCESSFUL (firmware + LittleFS)!\n' : '\n[System] Quick flash SUCCESSFUL!\n', runId);
      return;
    }

    broadcast({ type: 'log', stream: 'build', text: '[System] Firmware OK — building LittleFS image from data/...\n' });
    checkExternalPioWarning('build').then(() => {
      if (runId !== currentBuildRunId) return;
      spawnPioTarget(projectDir, env, port, 'buildfs', runId, (buildFsCode) => {
        if (buildFsCode !== 0) {
          finishBuildJob(wasMonitoring, false, `\n[System] LittleFS build FAILED (exit ${buildFsCode}).\n`, runId);
          return;
        }

        const fsBin = findExistingFsBin(buildDir);
        const fsOffset = prebuiltFsOffset;

        if (fsBin && fsOffset) {
          broadcast({ type: 'log', stream: 'build', text: `[System] Flashing LittleFS @ ${fsOffset}...\n` });
          spawnEsptoolFlash(resolved, projectDir, chip, port, [{ offset: fsOffset, path: fsBin }], runId, (fsCode) => {
            if (fsCode !== 0) {
              finishBuildJob(wasMonitoring, false, `\n[System] LittleFS flash FAILED (exit ${fsCode}).\n`, runId);
              return;
            }
            finishBuildJob(wasMonitoring, true, '\n[System] Quick flash SUCCESSFUL (firmware + LittleFS)!\n', runId);
          });
          return;
        }

        broadcast({ type: 'log', stream: 'build', text: '[System] Falling back to pio uploadfs...\n' });
        spawnPioTarget(projectDir, env, port, 'uploadfs', runId, (uploadFsCode) => {
          if (uploadFsCode !== 0) {
            finishBuildJob(wasMonitoring, false, `\n[System] uploadfs FAILED (exit ${uploadFsCode}).\n`, runId);
            return;
          }
          finishBuildJob(wasMonitoring, true, '\n[System] Quick flash SUCCESSFUL (firmware + LittleFS)!\n', runId);
        });
      });
    });
  });
}

// WS client broadcasting helper
let buildLogHistory = '';

function broadcast(data) {
  if (data && data.type === 'log' && data.stream === 'build' && data.text) {
    buildLogHistory = (buildLogHistory + data.text).slice(-32768);
  }
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

setInterval(() => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  });
}, 15000);

// Non-blocking async port listing & auto-detection
function listSerialPortsAsync() {
  return new Promise((resolve, reject) => {
    const execOpts = { env: childEnv(), encoding: 'utf8', timeout: 8000 };
    execFile(PIO_PATH, ['device', 'list', '--json-output'], execOpts, (err, stdout) => {
      if (!err) {
        try {
          return resolve(JSON.parse(stdout));
        } catch {}
      }
      execFile(PIO_PATH, ['device', 'list', '--json'], execOpts, (err2, stdout2) => {
        if (err2) return reject(err2);
        try {
          resolve(JSON.parse(stdout2));
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
  });
}

async function autoDetectPortAsync() {
  try {
    const ports = await listSerialPortsAsync();
    if (!Array.isArray(ports) || ports.length === 0) return null;
    const usbPorts = ports.filter(p => {
      const desc = (p.description || '').toLowerCase();
      const hwid = (p.hwid || '').toLowerCase();
      return desc.includes('usb') || desc.includes('serial') || desc.includes('cp210') || desc.includes('ch34') || desc.includes('ftdi') || hwid.includes('usb');
    });
    if (usbPorts.length > 0) return usbPorts[0].port;
    const nonCom1 = ports.filter(p => p.port !== 'COM1');
    if (nonCom1.length > 0) return nonCom1[0].port;
    return ports[0].port;
  } catch (err) {
    console.error('[Uploader] Auto-detection error:', err);
    return null;
  }
}

// Kill running processes helper
function killProcess(type, notify = true) {
  if (type === 'build') {
    currentBuildRunId++;
    if (pendingBuildTimer) {
      clearTimeout(pendingBuildTimer);
      pendingBuildTimer = null;
    }
  } else if (type === 'monitor' && pendingMonitorTimer) {
    clearTimeout(pendingMonitorTimer);
    pendingMonitorTimer = null;
  }
  if (activeProcesses[type]) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${activeProcesses[type].pid} /f /t`, { stdio: 'ignore' });
      } else {
        activeProcesses[type].kill('SIGTERM');
      }
      broadcast({ type: 'log', stream: type, text: `\n[System] Terminated existing ${type} process.\n` });
    } catch (err) {
      console.error(`Failed to kill ${type} process:`, err);
    }
    activeProcesses[type] = null;
  }
  if (notify) {
    if (type === 'build') {
      broadcast({ type: 'status', stream: 'build', active: false });
    } else if (type === 'monitor') {
      broadcast({ type: 'status', stream: 'monitor', active: false });
    }
  }
}

// API: List PlatformIO projects
app.get('/api/projects', (req, res) => {
  const searchDir = path.join(WORKSPACE_DIR, 'public/ESP32Codes');
  const projects = [];
  const logLines = [];

  logLines.push(`=== Catalog Scan Start at ${new Date().toISOString()} ===`);
  logLines.push(`Search directory: ${searchDir}`);

  function scan(dir) {
    if (!fs.existsSync(dir)) {
      logLines.push(`Directory does not exist: ${dir}`);
      return;
    }
    const files = fs.readdirSync(dir);
    logLines.push(`Scanning directory: ${dir} (Found files/folders: [${files.join(', ')}])`);

    const hasPio = files.includes('platformio.ini');
    const hasMicroPython = files.includes('main.py') || files.includes('boot.py');
    const hasArduino = files.some(f => f.toLowerCase().endsWith('.ino'));

    if (hasPio || hasMicroPython || hasArduino) {
      logLines.push(`  -> Found project indicator in: ${dir} (Pio: ${hasPio}, MicroPython: ${hasMicroPython}, Arduino: ${hasArduino})`);
      
      let envs = [];
      let envMeta = {};
      let libs = [];
      let board = 'esp32';
      let firmwareStatus = {};

      if (hasPio) {
        // Parse platformio.ini for envs, Haxel feature flags, and libs
        const iniPath = path.join(dir, 'platformio.ini');
        const iniContent = fs.readFileSync(iniPath, 'utf8');
        const parsed = parsePlatformioIni(iniContent, dir);
        envs = parsed.envs;
        envMeta = parsed.envMeta;
        libs = parsed.libs;

        // Look for generated firmware.bin files and check staleness against current source files
        const cachedSource = collectNewestCodeSource(dir);
        envs.forEach(env => {
          firmwareStatus[env] = getEnvBuildFreshness(dir, env, cachedSource);
        });

        // Guess board / chip type
        const boardMatch = iniContent.match(/^\s*board\s*=\s*(.+)$/m);
        if (boardMatch) board = boardMatch[1].trim();
      } else if (hasMicroPython) {
        board = 'MicroPython Device';
        envs = ['micropython'];
      } else if (hasArduino) {
        board = 'Arduino Device';
        envs = ['arduino'];
      }

      const relToSearch = path.relative(searchDir, dir).replace(/\\/g, '/');
      const parts = relToSearch.split('/');
      let folder = '.';
      if (parts.length > 1) {
        if (parts[0] === 'PlatformIO') {
          folder = parts.slice(0, 2).join('/');
        } else {
          folder = parts[0];
        }
      }

      logLines.push(`  -> Classified project: "${path.relative(WORKSPACE_DIR, dir)}" under folder group: "${folder}"`);

      projects.push({
        name: path.relative(WORKSPACE_DIR, dir).replace(/\\/g, '/'),
        path: dir,
        folder,
        isPlatformIO: hasPio,
        envs,
        envMeta,
        libs: libs.filter(Boolean),
        board,
        firmwareStatus,
        hasLittleFS: hasPio && projectHasLittleFS(dir)
      });
      return;
    }

    files.forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (file !== '.pio' && file !== 'dist' && file !== 'node_modules' && file !== '.git') {
          scan(fullPath);
        } else {
          logLines.push(`  -> Skipping excluded directory: ${file}`);
        }
      }
    });
  }

  scan(searchDir);

  logLines.push(`=== Catalog Scan End. Found ${projects.length} projects. ===\n`);
  try {
    fs.writeFileSync(path.join(__dirname, 'catalog.log'), logLines.join('\n'), 'utf8');
  } catch (logErr) {
    console.error('Failed to write catalog.log:', logErr);
  }

  res.json(projects);
});

// API: List COM ports
app.get('/api/ports', async (req, res) => {
  try {
    const ports = await listSerialPortsAsync();
    const unique = [];
    const seen = new Set();
    if (Array.isArray(ports)) {
      for (const p of ports) {
        if (p && p.port && !seen.has(p.port)) {
          seen.add(p.port);
          unique.push(p);
        }
      }
    }
    res.json(unique);
  } catch (err) {
    res.status(500).json({ error: 'Failed to scan ports', details: err.message });
  }
});

// API: Get project README.md
app.get('/api/project/readme', (req, res) => {
  const { projectPath } = req.query;
  if (!projectPath) {
    return res.status(400).json({ error: 'Missing project path' });
  }

  const resolvedPath = path.resolve(projectPath);
  if (!resolvedPath.startsWith(path.resolve(WORKSPACE_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const files = fs.readdirSync(resolvedPath);
    const readmeFile = files.find(f => f.toLowerCase() === 'readme.md');

    if (readmeFile) {
      const readmePath = path.join(resolvedPath, readmeFile);
      const content = fs.readFileSync(readmePath, 'utf8');
      return res.json({ exists: true, content });
    } else {
      return res.json({ exists: false });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read directory', details: err.message });
  }
});

// API: Add new environment to platformio.ini
app.post('/api/project/env', (req, res) => {
  const { projectPath, envName } = req.body;
  if (!projectPath || !envName) {
    return res.status(400).json({ error: 'Missing project path or environment name' });
  }

  const resolvedPath = path.resolve(projectPath);
  if (!resolvedPath.startsWith(path.resolve(WORKSPACE_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const iniPath = path.join(resolvedPath, 'platformio.ini');
  if (!fs.existsSync(iniPath)) {
    return res.status(404).json({ error: 'platformio.ini not found' });
  }

  try {
    let content = fs.readFileSync(iniPath, 'utf8');
    
    const envHeader = `[env:${envName}]`;
    if (content.includes(envHeader)) {
      return res.json({ success: true, message: 'Environment already exists' });
    }

    const envMatch = content.match(/^\[env:([^\]]+)\]/m);
    const firstEnv = envMatch ? envMatch[1] : null;

    let board = 'esp32dev';
    if (envName === 'esp32c3') {
      board = 'esp32-c3-devkitm-1';
    } else if (envName === 'esp32s3') {
      board = 'esp32-s3-devkitc-1';
    }

    let newEnvBlock = `\n[env:${envName}]\n`;
    newEnvBlock += `platform = espressif32@6.6.0\n`;
    newEnvBlock += `board = ${board}\n`;
    newEnvBlock += `framework = arduino\n`;
    newEnvBlock += `monitor_speed = 115200\n`;
    
    if (firstEnv) {
      newEnvBlock += `lib_deps =\n    \${env:${firstEnv}.lib_deps}\n`;
    }

    content = content.trimEnd() + '\n' + newEnvBlock;
    fs.writeFileSync(iniPath, content, 'utf8');

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update platformio.ini', details: err.message });
  }
});

// API: Save project README.md and update TODO.md
app.post('/api/project/readme', (req, res) => {
  const { projectPath, content } = req.body;
  if (!projectPath || content === undefined) {
    return res.status(400).json({ error: 'Missing project path or content' });
  }

  const resolvedPath = path.resolve(projectPath);
  if (!resolvedPath.startsWith(path.resolve(WORKSPACE_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const files = fs.readdirSync(resolvedPath);
    let readmeFile = files.find(f => f.toLowerCase() === 'readme.md');
    if (!readmeFile) {
      readmeFile = 'README.md';
    }

    const readmePath = path.join(resolvedPath, readmeFile);
    fs.writeFileSync(readmePath, content, 'utf8');

    // Append reminder to TODO.md at the top of public/ESP32Codes
    const searchDir = path.join(WORKSPACE_DIR, 'public/ESP32Codes');
    const todoPath = path.join(searchDir, 'TODO.md');
    const relProject = path.relative(searchDir, resolvedPath).replace(/\\/g, '/');

    const timestamp = new Date().toLocaleString();
    const reminder = `- [ ] Flesh out README.md for ${relProject} (created via Web Uploader on ${timestamp})\n`;

    let todoContent = '';
    if (fs.existsSync(todoPath)) {
      todoContent = fs.readFileSync(todoPath, 'utf8');
    }

    // Prepend the reminder
    todoContent = reminder + todoContent;
    fs.writeFileSync(todoPath, todoContent, 'utf8');

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write readme or todo', details: err.message });
  }
});

// API: Open project folder/file in local explorer
app.post('/api/project/open-explorer', (req, res) => {
  console.log('[API] POST /api/project/open-explorer request received');
  console.log(`[API] Payload body:`, req.body);

  const { projectPath } = req.body;
  if (!projectPath) {
    console.log('[API] Error: Missing project path');
    return res.status(400).json({ error: 'Missing project path' });
  }

  const resolvedPath = path.resolve(projectPath);
  const workspacePath = path.resolve(WORKSPACE_DIR);
  console.log(`[API] Resolved Project Path: ${resolvedPath}`);
  console.log(`[API] Workspace Path: ${workspacePath}`);

  if (!resolvedPath.startsWith(workspacePath)) {
    console.log('[API] Error: Access denied (path is outside workspace)');
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const files = fs.readdirSync(resolvedPath);
    let readmeFile = files.find(f => f.toLowerCase() === 'readme.md');
    let targetPath;
    if (readmeFile) {
      targetPath = path.join(resolvedPath, readmeFile);
    } else {
      targetPath = resolvedPath;
    }
    console.log(`[API] Target Path for Explorer: ${targetPath}`);

    const { exec } = require('child_process');
    let command = '';

    if (process.platform === 'win32') {
      const winPath = targetPath.replace(/\//g, '\\');
      command = `start "" explorer.exe /select,"${winPath}"`;
    } else if (process.platform === 'linux') {
      const targetDir = readmeFile ? resolvedPath : resolvedPath;
      command = `xdg-open "${targetDir}"`;
    } else if (process.platform === 'darwin') {
      command = `open -R "${targetPath}"`;
    } else {
      console.log(`[API] Error: Unsupported platform (${process.platform})`);
      return res.status(500).json({ error: 'Unsupported platform' });
    }

    console.log(`[API] Spawning Command: ${command}`);

    exec(command, (err, stdout, stderr) => {
      console.log(`[API] Command completed: "${command}"`);
      if (err) {
        console.error(`[API] Command error details:`, err);
      }
      if (stdout) {
        console.log(`[API] Command stdout: ${stdout}`);
      }
      if (stderr) {
        console.warn(`[API] Command stderr: ${stderr}`);
      }
    });

    console.log('[API] Responding success: true');
    return res.json({ success: true });
  } catch (err) {
    console.error(`[API] Exception caught:`, err);
    return res.status(500).json({ error: 'Failed to process request', details: err.message });
  }
});

// WebSocket Handler
wss.on('connection', ws => {
  console.log('[WS] Client connected');
  ws.send(JSON.stringify({ type: 'status', stream: 'build', active: !!activeProcesses.build }));
  ws.send(JSON.stringify({ type: 'status', stream: 'monitor', active: !!activeProcesses.monitor }));
  if (activeProcesses.build && buildLogHistory) {
    ws.send(JSON.stringify({
      type: 'log',
      stream: 'build',
      text: `\n[System] Reattached to active build:\n${buildLogHistory.slice(-4096)}`
    }));
  }

  ws.on('message', async message => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (msg.type === 'start-monitor') {
      killProcess('monitor');

      let { projectDir, port, baud } = msg.payload || {};
      const resolvedProj = projectDir ? path.resolve(projectDir) : WORKSPACE_DIR;
      if (!resolvedProj.startsWith(path.resolve(WORKSPACE_DIR))) {
        broadcast({ type: 'log', stream: 'monitor', text: '[System] Invalid project directory.\n' });
        broadcast({ type: 'status', stream: 'monitor', active: false });
        return;
      }

      if (!port) {
        port = await autoDetectPortAsync();
        if (port) {
          broadcast({ type: 'log', stream: 'monitor', text: `[System] Auto-detected serial port: ${port}\n` });
        }
      }
      monitorConfig = { projectDir: resolvedProj, port, baud };
      startSerialMonitorProcess(resolvedProj, port, baud, true);
    }

    else if (msg.type === 'stop-monitor') {
      killProcess('monitor');
    }

    else if (msg.type === 'kill-build' || msg.type === 'stop-all') {
      killProcess('build');
      killProcess('monitor');
    }

    else if (msg.type === 'run-upload') {
      let { projectDir, env, port, quick, forceQuick } = msg.payload || {};
      const resolvedProj = projectDir ? path.resolve(projectDir) : '';
      if (!resolvedProj || !resolvedProj.startsWith(path.resolve(WORKSPACE_DIR)) || !fs.existsSync(path.join(resolvedProj, 'platformio.ini'))) {
        broadcast({ type: 'log', stream: 'build', text: '[System] Upload aborted: missing or invalid PlatformIO project.\n' });
        broadcast({ type: 'status', stream: 'build', active: false });
        return;
      }
      if (!env || !/^[A-Za-z0-9_.-]+$/.test(env)) {
        broadcast({ type: 'log', stream: 'build', text: '[System] Upload aborted: invalid PlatformIO env name.\n' });
        broadcast({ type: 'status', stream: 'build', active: false });
        return;
      }

      if (!port) {
        port = await autoDetectPortAsync();
        if (port) {
          broadcast({ type: 'log', stream: 'build', text: `[System] Auto-detected serial port: ${port}\n` });
        }
      }

      const wasMonitoring = !!activeProcesses.monitor;
      if (wasMonitoring) {
        broadcast({ type: 'log', stream: 'build', text: '[System] Auto-suspending serial monitor to free port...\n' });
        killProcess('monitor');
      }

      killProcess('build', false);
      buildLogHistory = '';
      const runId = ++currentBuildRunId;
      broadcast({ type: 'status', stream: 'build', active: true });

      // Give Windows/esptool a brief delay to release the COM port handle
      const delayTime = wasMonitoring ? 800 : 0;
      pendingBuildTimer = setTimeout(() => {
        pendingBuildTimer = null;
        if (runId !== currentBuildRunId) return;
        if (quick) {
          runQuickFlash(resolvedProj, env, port, wasMonitoring, runId, { forceQuick: !!forceQuick });
        } else {
          const targets = ['upload'];
          if (envNeedsUploadFs(resolvedProj, env)) targets.push('uploadfs');
          broadcast({
            type: 'log',
            stream: 'build',
            text: `[System] Build & upload (${targets.join(' → ')}) for env ${env}...\n\n`
          });
          runPioTargets(resolvedProj, env, port, targets, wasMonitoring, runId);
        }
      }, delayTime);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

// API: Identify this application
app.get('/api/identify', (req, res) => {
  res.json({ app: 'pio-web-uploader' });
});

// API: Shutdown the server gracefully
app.post('/api/shutdown', (req, res) => {
  res.json({ success: true });
  setTimeout(() => {
    console.log('[System] Shutdown request received. Exiting...');
    killProcess('build', false);
    killProcess('monitor', false);
    process.exit(0);
  }, 500);
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`[Uploader Server] Running at http://localhost:${PORT}`);
  console.log(`==================================================`);
});
