/**
 * System Environment & Prerequisite Safety Checker
 * Checks for Node.js, Python 3, FFmpeg, and required Python packages.
 * Warns the user and attempts automatic package installation where possible.
 * Works on any Wi-Fi capable computer: Windows, macOS, or Linux.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const REQUIRED_PYTHON_PACKAGES = [
  'google-api-python-client',
  'google-auth-oauthlib',
  'google-auth-httplib2'
];

function runCmd(cmd) {
  try {
    const result = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
    return { ok: true, output: result.trim() };
  } catch (err) {
    return { ok: false, error: err.stderr ? err.stderr.trim() : err.message };
  }
}

function findOpenSsl() {
  const candidates = [
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win32\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'openssl'
  ];
  for (const bin of candidates) {
    if (bin.includes('\\') && !fs.existsSync(bin)) continue;
    const quoted = bin.includes('\\') || bin.includes(' ') ? `"${bin}"` : bin;
    const test = runCmd(`${quoted} version`);
    if (test.ok && test.output) return test.output.split('\n')[0];
  }
  return null;
}

function checkEnvironment() {
  const report = {
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    node: { ok: false, version: process.version },
    python: { ok: false, cmd: null, version: null },
    ffmpeg: { ok: false, version: null },
    openssl: { ok: false, version: null },
    packages: {},
    warnings: [],
    actionsTaken: []
  };

  console.log('====================================================');
  console.log(' MYT Capture Hub: Environment & Dependency Checker  ');
  console.log('====================================================');
  console.log(`Operating System: ${report.platform}`);
  console.log(`Node.js Version : ${process.version} (OK)`);
  report.node.ok = true;

  // 1. Check Python 3
  let pyCmd = null;
  const pyTest1 = runCmd('python --version');
  if (pyTest1.ok && (pyTest1.output.includes('Python 3') || pyTest1.output.includes('Python 3.'))) {
    pyCmd = 'python';
    report.python = { ok: true, cmd: 'python', version: pyTest1.output };
  } else {
    const pyTest2 = runCmd('python3 --version');
    if (pyTest2.ok && (pyTest2.output.includes('Python 3') || pyTest2.output.includes('Python 3.'))) {
      pyCmd = 'python3';
      report.python = { ok: true, cmd: 'python3', version: pyTest2.output };
    }
  }

  if (report.python.ok) {
    console.log(`Python          : ${report.python.version} (${report.python.cmd}) (OK)`);
  } else {
    console.warn('⚠️  WARNING: Python 3 was not detected in PATH!');
    console.warn('   The YouTube Quota Daemon and FFmpeg automation scripts require Python 3.');
    console.warn('   Download from: https://www.python.org/downloads/ (ensure "Add Python to PATH" is checked)');
    report.warnings.push('Python 3 is not installed or not found in system PATH.');
  }

  // 2. Check FFmpeg
  const ffmpegTest = runCmd('ffmpeg -version');
  if (ffmpegTest.ok) {
    const firstLine = ffmpegTest.output.split('\n')[0];
    report.ffmpeg = { ok: true, version: firstLine };
    console.log(`FFmpeg          : ${firstLine} (OK)`);
  } else {
    console.warn('⚠️  WARNING: FFmpeg is not installed or not found in system PATH!');
    console.warn('   Automated multi-angle video stitching and composite alignment require FFmpeg.');
    if (os.platform() === 'win32') {
      console.warn('   Windows install: winget install Gyan.FFmpeg   OR   choco install ffmpeg');
    } else if (os.platform() === 'darwin') {
      console.warn('   macOS install: brew install ffmpeg');
    } else {
      console.warn('   Linux install: sudo apt update && sudo apt install -y ffmpeg');
    }
    report.warnings.push('FFmpeg is missing. Multi-angle composite stitching will be unavailable until installed.');
  }

  const opensslVersion = findOpenSsl();
  if (opensslVersion) {
    report.openssl = { ok: true, version: opensslVersion };
    console.log(`OpenSSL         : ${opensslVersion} (OK)`);
  } else {
    console.warn('⚠️  WARNING: OpenSSL was not detected!');
    console.warn('   Phone cameras need the HTTPS certificate, and generating it requires OpenSSL.');
    console.warn('   Windows install: winget install ShiningLight.OpenSSL.Light');
    report.warnings.push('OpenSSL is missing. HTTPS certificates for phone cameras cannot be generated.');
  }

  // 3. Check and Install Python Packages if Python is available
  if (report.python.ok) {
    console.log('\nChecking Python packages for YouTube Quota Daemon...');
    const missingPackages = [];

    const packageToModule = {
      'google-api-python-client': 'googleapiclient',
      'google-auth-oauthlib': 'google_auth_oauthlib',
      'google-auth-httplib2': 'google_auth_httplib2'
    };

    for (const pkg of REQUIRED_PYTHON_PACKAGES) {
      const moduleName = packageToModule[pkg] || pkg.replace(/-/g, '_');
      const testImport = runCmd(`${report.python.cmd} -c "import ${moduleName}"`);
      if (testImport.ok) {
        report.packages[pkg] = true;
        console.log(`  ✓ ${pkg}: Installed`);
      } else {
        report.packages[pkg] = false;
        console.log(`  ✗ ${pkg}: Not found`);
        missingPackages.push(pkg);
      }
    }

    if (missingPackages.length > 0) {
      console.log(`\nAttempting automatic installation of missing packages: ${missingPackages.join(', ')}...`);
      try {
        const installResult = spawnSync(report.python.cmd, ['-m', 'pip', 'install', ...missingPackages], {
          stdio: 'inherit'
        });
        if (installResult.status === 0) {
          console.log('  ✓ Successfully installed missing Python packages!');
          report.actionsTaken.push(`Installed Python packages: ${missingPackages.join(', ')}`);
          missingPackages.forEach((pkg) => (report.packages[pkg] = true));
        } else {
          console.warn(`⚠️  Automatic pip install exited with code ${installResult.status}.`);
          console.warn(`   Run manually: ${report.python.cmd} -m pip install ${missingPackages.join(' ')}`);
          report.warnings.push(`Failed to auto-install: ${missingPackages.join(', ')}`);
        }
      } catch (e) {
        console.warn(`⚠️  Failed to trigger pip install: ${e.message}`);
        report.warnings.push(`pip install error: ${e.message}`);
      }
    }
  }

  console.log('====================================================');
  if (report.warnings.length === 0) {
    console.log('🎉 All system requirements and dependencies are satisfied!');
  } else {
    console.log(`⚠️  Completed with ${report.warnings.length} warning(s). Review recommendations above.`);
  }
  console.log('====================================================\n');

  return report;
}

if (require.main === module) {
  checkEnvironment();
}

module.exports = { checkEnvironment };
