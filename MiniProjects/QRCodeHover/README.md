# Asset to QR Code Panel (Firefox)

Hover over any link or image on the web, press **Ctrl+Shift**, and a floating QR panel appears at your cursor. Click it to copy the QR image to your clipboard, or wait three seconds for it to fade away.

This is a standalone Firefox extension converted from a Tampermonkey userscript. The QR generator (`qrcodejs`) ships inside the extension; nothing is fetched from a CDN at runtime.

## Usage

1. Hover the cursor over a link or image (or anywhere to encode the current page URL).
2. Press **Ctrl+Shift**.
3. Click the QR panel to copy the PNG to your clipboard.

## Build & Install (CLI)

### Prerequisites

- [Node.js](https://nodejs.org/) (for `npm` and `web-ext`)
- Firefox

### One-time setup

```bat
npm install
```

### Build a `.zip` for sideloading

```bat
npm run build
rem or double-click build.bat
```

Output: `web-ext-artifacts/asset_to_qr_code_panel-1.0.1.zip`

### Run in Firefox for development

```bat
npm run run
rem or double-click run.bat
```

This opens Firefox with the extension loaded temporarily.

### Lint

```bat
npm run lint
```

### Manual temporary install

1. Open Firefox → `about:debugging`
2. **This Firefox** → **Load Temporary Add-on…**
3. Select `manifest.json` in this folder

## Project layout

```
QRCodeHover/
├── manifest.json       # MV3 extension manifest
├── content.js          # Ctrl+Shift hover logic + QR panel UI
├── lib/qrcode.min.js   # Bundled qrcodejs (vendored, no CDN)
├── icons/              # Extension icons
├── build.bat           # Build zip via web-ext
└── run.bat             # Launch Firefox with extension
```

## License note

`qrcodejs` is MIT-licensed (see `node_modules/qrcodejs/LICENSE`). The vendored copy lives at `lib/qrcode.min.js`.
