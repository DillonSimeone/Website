const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
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

// Keep track of active processes
let activeProcesses = {
  build: null,
  monitor: null
};

// Configured state for active device monitoring
let monitorConfig = {
  projectDir: null,
  port: null,
  baud: 115200
};

// Helper: Find PlatformIO executable path
function getPioCommand() {
  // Prepend common Windows user folders to path
  const homeDir = os.homedir();
  const possiblePaths = [
    path.join(homeDir, '.platformio/penv/Scripts/pio.exe'),
    path.join(homeDir, '.platformio/penv/bin/pio'),
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

const PIO_PATH = getPioCommand();
console.log(`[Uploader Backend] Resolved pio path: ${PIO_PATH}`);

// Windows cp932 consoles crash PlatformIO when esptool prints Unicode progress bars.
function childEnv() {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONLEGACYWINDOWSSTDIO: 'utf-8',
    PATH: `${path.dirname(PIO_PATH)}${path.delimiter}${process.env.PATH}`
  };
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

function attachBuildOutput(proc) {
  proc.stdout.on('data', data => {
    broadcast({ type: 'log', stream: 'build', text: data.toString('utf8') });
  });
  proc.stderr.on('data', data => {
    broadcast({ type: 'log', stream: 'build', text: data.toString('utf8') });
  });
}

function resumeMonitor(wasMonitoring) {
  if (!wasMonitoring) return;
  broadcast({ type: 'log', stream: 'build', text: '[System] Auto-resuming serial monitor in 2 seconds...\n' });
  setTimeout(() => {
    const args = ['device', 'monitor'];
    if (monitorConfig.port) args.push('--port', monitorConfig.port);
    if (monitorConfig.baud) args.push('--baud', monitorConfig.baud);

    const monProc = spawn(PIO_PATH, args, {
      cwd: monitorConfig.projectDir || WORKSPACE_DIR,
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
    monProc.on('close', () => {
      broadcast({ type: 'status', stream: 'monitor', active: false });
      activeProcesses.monitor = null;
    });
  }, 2000);
}

function runPioTargets(projectDir, env, port, targets, wasMonitoring) {
  let step = 0;

  const runNext = () => {
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

    const proc = spawn(PIO_PATH, args, { cwd: projectDir, env: childEnv() });
    activeProcesses.build = proc;
    attachBuildOutput(proc);

    proc.on('close', code => {
      if (code !== 0) {
        activeProcesses.build = null;
        broadcast({ type: 'status', stream: 'build', active: false });
        broadcast({
          type: 'log',
          stream: 'build',
          text: `\n[System] Flash FAILED at target "${target}" (exit ${code}).\n`
        });
        return;
      }
      if (target === 'upload' && projectHasLittleFS(projectDir)) {
        broadcast({ type: 'log', stream: 'build', text: '[System] Firmware OK — uploading LittleFS (data/)...\n' });
      }
      runNext();
    });
  };

  runNext();
}

// Helper: resolve esptool executable (prefer v5 `esptool` over deprecated `esptool.py`)
function resolveEsptool() {
  const homeDir = os.homedir();
  const pioPython = path.join(homeDir, '.platformio/penv/Scripts/python.exe');
  const candidates = [
    path.join(homeDir, '.platformio/penv/Scripts/esptool.exe'),
    path.join(homeDir, '.platformio/packages/tool-esptoolpy/esptool.exe'),
  ];
  for (const exe of candidates) {
    if (fs.existsSync(exe)) return { cmd: exe, baseArgs: [] };
  }
  if (fs.existsSync(pioPython)) {
    return { cmd: pioPython, baseArgs: ['-m', 'esptool'] };
  }
  const legacyPy = path.join(homeDir, '.platformio/packages/tool-esptoolpy/esptool.py');
  if (fs.existsSync(legacyPy) && fs.existsSync(pioPython)) {
    return { cmd: pioPython, baseArgs: [legacyPy] };
  }
  return null;
}

function buildEsptoolFlashArgs(resolved, chip, port, offset, binPath) {
  const args = [...resolved.baseArgs];
  args.push('--chip', chip);
  if (port) args.push('--port', port);
  args.push('--baud', '921600');
  // esptool v5: write-flash subcommand; --no-progress is per-subcommand, not global
  args.push('write-flash', '--no-progress', offset, binPath);
  return args;
}

function detectChipFromIni(iniContent) {
  const ini = iniContent.toLowerCase();
  if (ini.includes('esp32-c3') || ini.includes('esp32c3')) return 'esp32c3';
  if (ini.includes('esp32-s3') || ini.includes('esp32s3')) return 'esp32s3';
  if (ini.includes('esp32-c6') || ini.includes('esp32c6')) return 'esp32c6';
  return 'esp32';
}

function parsePartitionOffset(projectDir, matcher) {
  const csvPath = path.join(projectDir, 'partitions.csv');
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

function getAppPartitionOffset(projectDir) {
  return parsePartitionOffset(projectDir, parts => {
    const type = (parts[1] || '').toLowerCase();
    const subtype = (parts[2] || '').toLowerCase();
    return type === 'app' && (subtype.startsWith('ota_') || subtype === 'factory');
  }) || '0x10000';
}

function getFilesystemPartitionOffset(projectDir) {
  return parsePartitionOffset(projectDir, parts => {
    const name = (parts[0] || '').toLowerCase();
    const subtype = (parts[2] || '').toLowerCase();
    return name.includes('spiffs') || name.includes('littlefs') || name.includes('fat')
      || subtype === 'spiffs' || subtype === 'fat' || subtype === 'littlefs';
  });
}

function spawnEsptoolFlash(resolved, chip, port, offset, binPath, onClose) {
  const args = buildEsptoolFlashArgs(resolved, chip, port, offset, binPath);
  broadcast({
    type: 'log',
    stream: 'build',
    text: `[System] esptool ${args.join(' ')}\n\n`
  });
  const proc = spawn(resolved.cmd, args, { env: childEnv() });
  activeProcesses.build = proc;
  attachBuildOutput(proc);
  proc.on('close', onClose);
  return proc;
}

function spawnPioTarget(projectDir, env, port, target, onClose) {
  const args = ['run', '-t', target, '-e', env];
  if (port) args.push('--upload-port', port);
  broadcast({ type: 'log', stream: 'build', text: `[System] pio ${args.join(' ')}\n\n` });
  const proc = spawn(PIO_PATH, args, { cwd: projectDir, env: childEnv() });
  activeProcesses.build = proc;
  attachBuildOutput(proc);
  proc.on('close', onClose);
  return proc;
}

function finishBuildJob(wasMonitoring, ok, message) {
  activeProcesses.build = null;
  broadcast({ type: 'status', stream: 'build', active: false });
  broadcast({ type: 'log', stream: 'build', text: message });
  if (ok) resumeMonitor(wasMonitoring);
}

function runQuickFlash(projectDir, env, port, wasMonitoring) {
  const resolved = resolveEsptool();
  const iniPath = path.join(projectDir, 'platformio.ini');
  const iniContent = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, 'utf8') : '';
  const chip = detectChipFromIni(iniContent);
  const appOffset = getAppPartitionOffset(projectDir);
  const binPath = path.join(projectDir, '.pio', 'build', env, 'firmware.bin');
  const needFs = projectHasLittleFS(projectDir);

  if (!resolved || !fs.existsSync(binPath)) {
    broadcast({ type: 'log', stream: 'build', text: '[System] No firmware.bin — falling back to pio upload...\n' });
    const targets = ['upload'];
    if (needFs) targets.push('uploadfs');
    runPioTargets(projectDir, env, port, targets, wasMonitoring);
    return;
  }

  broadcast({
    type: 'log',
    stream: 'build',
    text: `[System] Quick flash firmware${needFs ? ' + LittleFS (data/)' : ''}...\n\n`
  });

  spawnEsptoolFlash(resolved, chip, port, appOffset, binPath, (fwCode) => {
    if (fwCode !== 0) {
      finishBuildJob(wasMonitoring, false, `\n[System] Quick flash FAILED at firmware (exit ${fwCode}).\n`);
      return;
    }

    if (!needFs) {
      finishBuildJob(wasMonitoring, true, '\n[System] Quick flash SUCCESSFUL!\n');
      return;
    }

    broadcast({ type: 'log', stream: 'build', text: '[System] Firmware OK — building LittleFS image from data/...\n' });
    spawnPioTarget(projectDir, env, port, 'buildfs', (buildFsCode) => {
      if (buildFsCode !== 0) {
        finishBuildJob(wasMonitoring, false, `\n[System] LittleFS build FAILED (exit ${buildFsCode}).\n`);
        return;
      }

      const fsBin = path.join(projectDir, '.pio', 'build', env, 'littlefs.bin');
      const fsOffset = getFilesystemPartitionOffset(projectDir);

      if (fs.existsSync(fsBin) && fsOffset) {
        broadcast({ type: 'log', stream: 'build', text: `[System] Flashing LittleFS @ ${fsOffset}...\n` });
        spawnEsptoolFlash(resolved, chip, port, fsOffset, fsBin, (fsCode) => {
          if (fsCode !== 0) {
            finishBuildJob(wasMonitoring, false, `\n[System] LittleFS flash FAILED (exit ${fsCode}).\n`);
            return;
          }
          finishBuildJob(wasMonitoring, true, '\n[System] Quick flash SUCCESSFUL (firmware + LittleFS)!\n');
        });
        return;
      }

      broadcast({ type: 'log', stream: 'build', text: '[System] Falling back to pio uploadfs...\n' });
      spawnPioTarget(projectDir, env, port, 'uploadfs', (uploadFsCode) => {
        if (uploadFsCode !== 0) {
          finishBuildJob(wasMonitoring, false, `\n[System] uploadfs FAILED (exit ${uploadFsCode}).\n`);
          return;
        }
        finishBuildJob(wasMonitoring, true, '\n[System] Quick flash SUCCESSFUL (firmware + LittleFS)!\n');
      });
    });
  });
}

// WS client broadcasting helper
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Auto detect connected serial port
function autoDetectPort() {
  try {
    let output;
    try {
      output = execSync(`"${PIO_PATH}" device list --json-output`, { encoding: 'utf8' });
    } catch (e) {
      output = execSync(`"${PIO_PATH}" device list --json`, { encoding: 'utf8' });
    }
    const ports = JSON.parse(output);
    // Find USB serial devices, preferring specific drivers
    const usbPorts = ports.filter(p => {
      const desc = (p.description || '').toLowerCase();
      const hwid = (p.hwid || '').toLowerCase();
      return desc.includes('usb') || desc.includes('serial') || desc.includes('cp210') || desc.includes('ch34') || desc.includes('ftdi') || hwid.includes('usb');
    });

    if (usbPorts.length > 0) {
      return usbPorts[0].port;
    }
    const nonCom1 = ports.filter(p => p.port !== 'COM1');
    if (nonCom1.length > 0) {
      return nonCom1[0].port;
    }
    if (ports.length > 0) {
      return ports[0].port;
    }
  } catch (err) {
    console.error('[Uploader] Auto-detection error:', err);
  }
  return null;
}

// Kill running processes helper
function killProcess(type) {
  if (activeProcesses[type]) {
    try {
      // In Windows, we might need taskkill to force sub-processes to die
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', activeProcesses[type].pid, '/f', '/t']);
      } else {
        activeProcesses[type].kill('SIGTERM');
      }
      broadcast({ type: 'log', stream: type, text: `\n[System] Terminated existing ${type} process.\n` });
    } catch (err) {
      console.error(`Failed to kill ${type} process:`, err);
    }
    activeProcesses[type] = null;
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
      let libs = [];
      let board = 'esp32';
      let firmwareStatus = {};

      if (hasPio) {
        // Parse platformio.ini for envs and libs
        const iniPath = path.join(dir, 'platformio.ini');
        const iniContent = fs.readFileSync(iniPath, 'utf8');
        const lines = iniContent.split(/\r?\n/);
        let currentSection = null;
        let inLibDeps = false;

        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSection = trimmed.slice(1, -1);
            inLibDeps = false;
            if (currentSection.startsWith('env:')) {
              envs.push(currentSection.replace('env:', ''));
            }
          } else if (currentSection && trimmed) {
            if (trimmed.startsWith('lib_deps')) {
              inLibDeps = true;
              const val = trimmed.substring(trimmed.indexOf('=') + 1).trim();
              if (val) libs.push(val);
            } else if (inLibDeps) {
              if (trimmed.startsWith(';') || trimmed.startsWith('#')) {
                // Comment
              } else if (trimmed.includes('=')) {
                // Next setting
                inLibDeps = false;
              } else {
                libs.push(trimmed);
              }
            }
          }
        });

        // Look for generated firmware.bin files
        envs.forEach(env => {
          const binPath = path.join(dir, '.pio', 'build', env, 'firmware.bin');
          firmwareStatus[env] = {
            exists: fs.existsSync(binPath),
            path: binPath,
            mtime: fs.existsSync(binPath) ? fs.statSync(binPath).mtime : null
          };
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
        envs,
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
app.get('/api/ports', (req, res) => {
  try {
    let output;
    try {
      output = execSync(`"${PIO_PATH}" device list --json-output`, { encoding: 'utf8' });
    } catch (e) {
      output = execSync(`"${PIO_PATH}" device list --json`, { encoding: 'utf8' });
    }
    const ports = JSON.parse(output);
    res.json(ports);
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

  ws.on('message', message => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    if (msg.type === 'start-monitor') {
      killProcess('monitor');
      
      let { projectDir, port, baud } = msg.payload;
      if (!port) {
        port = autoDetectPort();
        if (port) {
          broadcast({ type: 'log', stream: 'monitor', text: `[System] Auto-detected serial port: ${port}\n` });
        }
      }
      monitorConfig = { projectDir, port, baud };

      broadcast({ type: 'status', stream: 'monitor', active: true });
      
      const args = ['device', 'monitor'];
      if (port) args.push('--port', port);
      if (baud) args.push('--baud', baud);

      console.log(`[WS] Spawning pio monitor: ${PIO_PATH} ${args.join(' ')}`);
      
      const proc = spawn(PIO_PATH, args, {
        cwd: projectDir || WORKSPACE_DIR,
        env: childEnv()
      });

      activeProcesses.monitor = proc;

      proc.stdout.on('data', data => {
        broadcast({ type: 'log', stream: 'monitor', text: data.toString() });
      });

      proc.stderr.on('data', data => {
        broadcast({ type: 'log', stream: 'monitor', text: data.toString() });
      });

      proc.on('close', code => {
        broadcast({ type: 'log', stream: 'monitor', text: `\n[Monitor] Process exited with code ${code}\n` });
        broadcast({ type: 'status', stream: 'monitor', active: false });
        activeProcesses.monitor = null;
      });
    }

    else if (msg.type === 'stop-monitor') {
      killProcess('monitor');
    }

    else if (msg.type === 'run-upload') {
      let { projectDir, env, port, quick } = msg.payload;
      if (!port) {
        port = autoDetectPort();
        if (port) {
          broadcast({ type: 'log', stream: 'build', text: `[System] Auto-detected serial port: ${port}\n` });
        }
      }

      let wasMonitoring = !!activeProcesses.monitor;
      if (wasMonitoring) {
        broadcast({ type: 'log', stream: 'build', text: '[System] Auto-suspending serial monitor to free port...\n' });
        killProcess('monitor');
      }

      killProcess('build');
      broadcast({ type: 'status', stream: 'build', active: true });

      if (quick) {
        runQuickFlash(projectDir, env, port, wasMonitoring);
      } else {
        const targets = ['upload'];
        if (projectHasLittleFS(projectDir)) targets.push('uploadfs');
        broadcast({
          type: 'log',
          stream: 'build',
          text: `[System] Build & upload (${targets.join(' → ')})...\n\n`
        });
        runPioTargets(projectDir, env, port, targets, wasMonitoring);
      }
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
    process.exit(0);
  }, 500);
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`[Uploader Server] Running at http://localhost:${PORT}`);
  console.log(`==================================================`);
});
