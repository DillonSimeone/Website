const { exec } = require('child_process');
const path = require('path');

console.log('==================================================');
console.log('            HAXEL WOKWI SIMULATOR COUPLER         ');
console.log('==================================================');
console.log('\nTo simulate Haxel firmware on ESP32-C3:');
console.log('1. Install the "Wokwi Simulator" extension in VS Code.');
console.log('2. Open the Haxel project folder in VS Code.');
console.log('3. Press F1, select "Wokwi: Start Simulator".');
console.log('4. The virtual ESP32-C3 will run in the simulation side-panel.');
console.log('\nAlternatively, run locally with Wokwi CLI:');
console.log('   npx wokwi-cli .\n');

// Try to open Wokwi projects dashboard
const url = 'https://wokwi.com/projects/new/esp32-c3';
console.log(`Opening browser to create a new Wokwi project: ${url}`);

const start = (process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open');
exec(`${start} ${url}`);
