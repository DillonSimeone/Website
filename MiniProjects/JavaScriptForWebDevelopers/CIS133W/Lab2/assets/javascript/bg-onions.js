// floating background onions

(function initFloatingBackground() {
  const canvas = document.querySelector("#bgCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", function () {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // Pre-render randomized onion sprites by directly consuming window.OnionEngine (DRY!)
  function createRandomOnionSprite() {
    const sprite = document.createElement("canvas");
    sprite.width = 140;
    sprite.height = 150;
    const sCtx = sprite.getContext("2d");

    const engine = window.OnionEngine;
    if (!engine) return sprite;

    const paletteKeys = Object.keys(engine.palettes);
    const chosenKey = paletteKeys[Math.floor(Math.random() * paletteKeys.length)];
    const palette = engine.palettes[chosenKey];

    const rx = 34 + Math.random() * 26;
    const ry = 40 + Math.random() * 20;
    const stalkCount = Math.floor(Math.random() * 4) + 1;
    const stalks = engine.buildStalksConfig(stalkCount);

    engine.drawProceduralOnion(sCtx, sprite.width, sprite.height, {
      rx: rx,
      ry: ry,
      palette: palette,
      stalks: stalks
    });

    return sprite;
  }

  // Floating particles pool
  const ONION_COUNT = 14;
  const onions = [];

  function resetOnion(onion, startAbove = true) {
    onion.sprite = createRandomOnionSprite();
    onion.x = Math.random() * width;
    onion.y = startAbove ? -140 - Math.random() * 200 : Math.random() * height;
    onion.speedY = 0.5 + Math.random() * 1.1; //  vertical descent
    onion.speedX = (Math.random() - 0.5) * 0.4; //  sway drift
    onion.scale = 0.45 + Math.random() * 0.45; // size variation
    onion.rotation = (Math.random() - 0.5) * 0.5;
    onion.rotationSpeed = (Math.random() - 0.5) * 0.008;
    onion.swayOffset = Math.random() * Math.PI * 2;
    onion.swaySpeed = 0.015 + Math.random() * 0.02;
    onion.swayAmp = 0.6 + Math.random() * 1.0;
  }

  for (let i = 0; i < ONION_COUNT; i++) {
    const o = {};
    resetOnion(o, false);
    onions.push(o);
  }

  let lastTime = performance.now();

  function animate(now) {
    const dt = Math.min((now - lastTime) / 16.6, 2.5); // normalize to ~60fps. no gpu whine!
    lastTime = now;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < onions.length; i++) {
      const o = onions[i];

      o.y += o.speedY * dt;
      o.swayOffset += o.swaySpeed * dt;
      o.x += (o.speedX + Math.sin(o.swayOffset) * o.swayAmp) * dt;
      o.rotation += o.rotationSpeed * dt;

      // Draw sprite
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rotation);
      ctx.scale(o.scale, o.scale);
      ctx.drawImage(o.sprite, -o.sprite.width / 2, -o.sprite.height / 2);
      ctx.restore();

      // recycle if drifted past the bottom of viewport
      if (o.y > height + 100) {
        resetOnion(o, true);
      }
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
