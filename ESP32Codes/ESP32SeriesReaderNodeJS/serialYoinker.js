import { SerialPort } from 'serialport';
import { SerialPortStream } from '@serialport/stream';
import { autoDetect } from '@serialport/bindings-cpp';
import chalk from 'chalk';

const Binding = autoDetect();
const colors = [chalk.red, chalk.green, chalk.yellow, chalk.blue, chalk.magenta, chalk.cyan];
let pingColorIndex = 0;

class SerialBridge {
  constructor() {
    this.ports = [];
    this.listeners = [];
    this.init();
  }

  async init() {
    const portInfos = await SerialPort.list();
    for (const info of portInfos) {
      const port = new SerialPort({
        path: info.path,
        baudRate: 115200,
        binding: Binding
      });

      port.on('open', () => {
        console.log(`[SerialBridge] Opened ${info.path}`);
      });

      port.on('data', (data) => this.handleData(data.toString().trim(), port, info.path));

      port.on('error', (err) => {
        console.error(`[SerialBridge] Error on ${info.path}: ${err.message}`);
      });

      this.ports.push(port);
    }
  }

  handleData(line, port, portPath) {
    /* if (line === "Ping!") { //Sanity Test
      const colorFn = colors[pingColorIndex++ % colors.length];
      console.log(colorFn(`[${portPath}] Pong!`));
      port.write("Pong!\n");
    } else {
      console.log(`[${portPath}]`, line);
    } */

    // Check listeners
    for (const listener of this.listeners) {
      if (line === listener.match) {
        listener.callback(line, portPath);
      }
    }
  }

  sendToESP32(message) {
    this.ports.forEach(p => p.write(`${message}\n`));
  }

  onSerialMatch(matchString, callback) {
    this.listeners.push({ match: matchString, callback });
  }
}

export default new SerialBridge();