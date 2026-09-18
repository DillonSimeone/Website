# assets/

All textures used by `../index.html` are generated procedurally at load time
via `<canvas>` and uploaded to Three.js as `CanvasTexture` instances:

- **Book spine textures** — `makeSpineTexture()` renders the project title,
  domain stripe, and ROI badge per-book.
- **Front-cover page textures** — `makePageTexture()` renders the framed
  parchment view (title, tagline, economics table, hardware list).

Nothing else lives in this directory — the file is genuinely self-contained.
This README exists to document the choice (no external image/model assets,
zero network calls beyond the Three.js CDN importmap).

If you want to swap in real artwork later, save it here and replace the
`makeSpineTexture` / `makePageTexture` calls with `new THREE.TextureLoader().load('./assets/<file>')`.
