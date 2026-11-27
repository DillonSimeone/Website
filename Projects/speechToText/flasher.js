import { ESPLoader, Transport } from "https://esm.sh/esptool-js@0.4.5";

const btn = document.getElementById("btnWebFlash");
const statusEl = document.getElementById("flashStatusText");
const barEl = document.getElementById("flashProgressBar");

function bufToBinaryString(buf) {
  const bytes = new Uint8Array(buf);
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function setStatus(msg, pct = null) {
  if (statusEl) statusEl.textContent = msg;
  if (barEl && pct !== null) barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

if (btn) {
  btn.addEventListener("click", async () => {
    if (!("serial" in navigator)) {
      setStatus("Web Serial API not supported in this browser. Use Chrome or Edge over HTTPS / localhost.", 0);
      return;
    }

    btn.disabled = true;
    let transport = null;
    try {
      setStatus("Select your ESP32-C3 USB Serial port...", 2);
      const port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x303a }],
      }).catch(() => navigator.serial.requestPort());

      transport = new Transport(port, true);
      const loader = new ESPLoader({
        transport,
        baudrate: 460800,
        romBaudrate: 115200,
      });

      setStatus("Connecting to ESP32-C3 bootloader...", 8);
      await loader.main();

      const files = [
        { address: 0x0000, url: "./firmware/bootloader.bin", name: "bootloader" },
        { address: 0x8000, url: "./firmware/partitions.bin", name: "partitions" },
        { address: 0xe000, url: "./firmware/boot_app0.bin", name: "boot_app0" },
        { address: 0x10000, url: "./firmware/firmware.bin", name: "firmware" },
      ];

      setStatus("Fetching firmware binaries...", 14);
      const fileArray = [];
      for (const f of files) {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`Failed to load ${f.url} (${res.status})`);
        fileArray.push({
          address: f.address,
          data: bufToBinaryString(await res.arrayBuffer()),
        });
      }

      setStatus("Flashing ESP32-C3...", 18);
      await loader.writeFlash({
        fileArray,
        flashSize: "keep",
        flashMode: "dio",
        flashFreq: "80m",
        eraseAll: false,
        compress: true,
        reportProgress: (idx, written, total) => {
          const base = 18 + (idx / fileArray.length) * 78;
          const span = 78 / fileArray.length;
          const pct = base + (written / Math.max(1, total)) * span;
          setStatus(`Flashing ${files[idx].name} (${Math.round((written / total) * 100)}%)...`, pct);
        },
      });

      await loader.hardReset();
      setStatus("Flash complete! Unplug & replug USB-C if C3-BLE-MIC does not immediately appear.", 100);
    } catch (err) {
      setStatus(`Flash failed: ${err?.message || err}`, 0);
    } finally {
      if (transport) {
        try {
          await transport.disconnect();
        } catch (_) {}
      }
      btn.disabled = false;
    }
  });
}
