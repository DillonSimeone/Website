# PlatformIO Toolchain Notes — the `tool-esptoolpy` Silliness

A record of why a project that built fine one day suddenly hung forever on
`Installing platformio/tool-esptoolpy`, what actually caused it, and how to get
unstuck fast next time.

---

## The symptom

A normal upload (`pio run` / `upload.bat`) stalls here and never finishes:

```
Tool Manager: Installing platformio/tool-esptoolpy @ ~1.40501.0
... (hangs, then "looking for mirrors" forever)
```

It is not actually compiling. It is trying to **download** a tool package and
failing silently because the network blocks PlatformIO's package mirrors
(TLS / Schannel handshake failures to hosts like `*.contabostorage.com` /
`dl.registry.platformio.org`). This is likely Comlink being Comlink.

---

## The root cause (three things stacked on top of each other)

1. **Unpinned platforms.** Most `platformio.ini` files in this repo use a bare
   `platform = espressif32` with no version. PlatformIO resolves that to
   *whatever espressif32 platform is currently registered on this machine*. On
   this PC that became the **pioarduino fork** (Arduino-core 3.x), which depends
   on a **much newer esptool** than the official `espressif32@6.6.0` does.

2. **One shared global tool folder.** All projects share a single
   `~/.platformio/packages/tool-esptoolpy`. Two platforms that want two different
   esptool versions **clobber each other** in that one folder. So building
   project A installs esptool for A, then building project B overwrites it with a
   different version for B — back and forth, forever.

3. **Blocked mirrors.** When a build wants a version that is *not already on
   disk*, PlatformIO goes to download it. This network blocks those mirrors, so
   instead of a quick failure it loops on "looking for mirrors" indefinitely.

Put together: an unpinned project pulled in pioarduino, pioarduino wanted a new
esptool, that overwrote the good one, and the next official-platform build then
tried (and failed forever) to re-download the version it expected
(`~1.40501.0`, which is **esptool 4.5.1**).

---

## The fix that is currently in place

1. **`esptool 4.5.1` was provisioned by hand** into
   `~/.platformio/packages/tool-esptoolpy` (installed from PyPI with
   `pip install --target`, plus the small `esptool.py` / `espefuse.py` /
   `espsecure.py` shims and the `package.json` + `.piopm` metadata files).
   With valid metadata present, PlatformIO treats it as **already installed** and
   stops trying to download anything.

2. **Active projects are pinned** to the official platform that matches that
   esptool, e.g.:

   ```ini
   platform = espressif32@6.6.0
   ```

   Currently pinned: `Ember/firmware`, `LightBaton/reactiveHandleLightMotion`.
   (`WirelessHaptic/*` is pinned to `espressif32@^6.7.0`; `blueToothMic` to
   `@6.5.0`.)

3. **A backup of the working tool folder** is committed at:

   ```
   public/ESP32Codes/_tooling/tool-esptoolpy-1.40501.0-esptool4.5.1.zip
   ```

---

## How to recover if it breaks again

If a build starts hanging on `Installing ... tool-esptoolpy` again (because some
other unpinned project clobbered the folder):

```powershell
# 1. Wipe the clobbered package
Remove-Item -Recurse -Force "$env:USERPROFILE\.platformio\packages\tool-esptoolpy"

# 2. Restore the known-good 4.5.1 from the committed backup
Expand-Archive `
  -Path "F:\Github\Website\public\ESP32Codes\_tooling\tool-esptoolpy-1.40501.0-esptool4.5.1.zip" `
  -DestinationPath "$env:USERPROFILE\.platformio\packages\tool-esptoolpy" -Force

# 3. Build the pinned project again
```

Because the restored folder has valid `.piopm` metadata, PlatformIO will use it
as-is and will **not** reach out to the mirrors.

---

## How to avoid it entirely

- **Pin the platform version** in every project you actively build. A bare
  `platform = espressif32` is the trap.
- **Don't mix** the official `espressif32` and the `pioarduino` fork in the same
  global core if you can help it — they fight over `tool-esptoolpy`. If you need
  both, isolate the fork projects with their own `core_dir` (note: a fresh
  `core_dir` triggers a full toolchain download, which this network may block —
  do it only when you have working mirror access).
- If a download genuinely is needed and the mirrors are blocked, provision the
  package by hand (as above) rather than waiting on the spinner.

---

*Last updated: 2026-06-16*
