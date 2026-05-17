// bridge.js — Node.js Serial ↔ ESP-NOW gateway bridge (host-side).
// Run: node bridge.js /dev/ttyUSB0 9600
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = process.argv[2] || '/dev/ttyUSB0';
const baud = parseInt(process.argv[3] || '115200', 10);
const port = new SerialPort({ path, baudRate: baud });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
parser.on('data', (line) => process.stdout.write(line + '\n'));
process.stdin.on('data', (buf) => port.write(buf));
