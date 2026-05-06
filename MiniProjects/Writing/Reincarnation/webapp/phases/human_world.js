// ---------------------------------------------------------
// Phase: Human World (The City)
// ---------------------------------------------------------

class Cloud {
  constructor() {
    this.x = Math.random() * 2000;
    this.y = Math.random() * 60;
    this.vel = 0.2 + Math.random() * 0.3;
    this.scale = 0.5 + Math.random() * 1.5;
  }
  draw(ctx, w, alpha) {
    this.x = (this.x + this.vel) % (w + 200);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.05 * alpha})`;
    ctx.beginPath();
    ctx.arc(this.x - 50, this.y, 40 * this.scale, 0, Math.PI * 2);
    ctx.arc(this.x - 20, this.y - 10, 30 * this.scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Person {
  constructor(w, h) {
    this.x = Math.random() * (w + 400);
    this.y = h - 8;
    this.direction = Math.random() > 0.5 ? 1 : -1;
    this.vel = (0.4 + Math.random() * 0.8) * this.direction;
    this.size = 12 + Math.random() * 6;
    
    // Transparent Tints
    const colors = [
      'rgba(10, 10, 20, ',   // Deep Dark
      'rgba(30, 30, 60, ',   // Blueish
      'rgba(60, 40, 60, ',   // Purplish
      'rgba(0, 0, 0, '       // Pure Silhouette
    ];
    this.colorPrefix = colors[Math.floor(Math.random() * colors.length)];
    this.baseAlpha = 0.4 + Math.random() * 0.4;
  }
  
  draw(ctx, w, alpha, time, scrollPos) {
    const worldW = w + 400;
    this.x = (this.x + this.vel) % worldW;
    
    const wrap = (n, m) => ((n % m) + m) % m;
    // Parallax affected by direction for varied feel
    const renderX = wrap(this.x - (scrollPos * 0.3 * this.direction), worldW) - 200;
    
    const finalAlpha = this.baseAlpha * alpha;
    ctx.fillStyle = this.colorPrefix + finalAlpha + ')';
    
    ctx.beginPath();
    ctx.ellipse(renderX, this.y, this.size/4, this.size/1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    const swing = Math.sin(time * 0.01 * Math.abs(this.vel));
    ctx.fillRect(renderX - 2, this.y + this.size/2, 2, 5 + swing * 4);
    ctx.fillRect(renderX + 1, this.y + this.size/2, 2, 5 - swing * 4);
  }
}

const stars = [];
const clouds = [];
const people = [];

function drawStarfield(ctx, w, h, alpha, time) {
  ctx.save();
  // Slow rotation around center
  ctx.translate(w/2, h/2);
  ctx.rotate(time * 0.00005);
  ctx.translate(-w/2, -h/2);
  
  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * alpha})`;
  stars.forEach(s => {
    // Subtle flicker
    const flicker = Math.sin(time * 0.002 + s.x) * 0.2 + 0.8;
    ctx.globalAlpha = alpha * flicker;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function initHumanWorld(w, h) {
  clouds.length = 0;
  people.length = 0;
  stars.length = 0;
  
  // Random Star Positions
  for (let i = 0; i < 150; i++) {
    stars.push({
      x: (Math.random() - 0.5) * w * 2, // Wider area for rotation
      y: (Math.random() - 0.5) * h * 4,
      size: Math.random() * 1.5
    });
  }

  for (let i = 0; i < 8; i++) clouds.push(new Cloud());
  
  // Randomized Human Volume (30 to 60)
  const population = 30 + Math.floor(Math.random() * 30);
  for (let i = 0; i < population; i++) {
    people.push(new Person(w, h));
  }
}

export function drawHumanWorld(ctx, w, h, alpha, time, scrollPos) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgba(10, 10, 32, ${alpha})`);
  grad.addColorStop(1, `rgba(26, 26, 53, ${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 1. Stars first (background)
  drawStarfield(ctx, w * 1.5, h * 1.5, alpha, time);

  // 2. Clouds
  clouds.forEach(c => c.draw(ctx, w, alpha));

  // 3. Varied Distant Buildings (Solid Silhouettes)
  const bSpacing = Math.max(120, w / 8); 
  const bCount = Math.ceil((w + 400) / bSpacing) + 2;
  
  for (let i = 0; i < bCount; i++) {
    const bW = 60 + (Math.sin(i * 1.5) * 30);
    const bH = 60 + (Math.cos(i * 1.2) * 40);
    const bx = ((i * bSpacing - (scrollPos * 0.35)) % (w + 400)) - 200;
    
    // Solid dark purple/charcoal building
    ctx.fillStyle = `rgba(12, 12, 30, ${0.98 * alpha})`; 
    ctx.fillRect(bx, h - bH, bW, bH);
    
    // Building Highlight (top/side)
    ctx.strokeStyle = `rgba(79, 70, 229, ${0.35 * alpha})`;
    ctx.strokeRect(bx, h - bH, bW, bH);
    
    // Windows
    ctx.fillStyle = `rgba(0, 229, 255, ${0.45 * alpha})`;
    if ((i % 3) === 0) ctx.fillRect(bx + 12, h - bH + 12, 6, 6);
    if ((i % 2) === 0) ctx.fillRect(bx + bW - 20, h - bH + 25, 8, 8);
  }

  // 4. Street Lights
  const lSpacing = Math.max(200, w / 4);
  const lCount = Math.ceil((w + 400) / lSpacing) + 1;

  for (let i = 0; i < lCount; i++) {
    const lx = ((i * lSpacing - (scrollPos * 0.9)) % (w + 400)) - 200;
    const ly = h - 60;
    
    // Post
    ctx.fillStyle = `rgba(20, 20, 20, ${alpha})`;
    ctx.fillRect(lx, ly, 3, 60);

    // Glow
    const glowR = Math.min(40, w * 0.1); 
    const r = ctx.createRadialGradient(lx + 1.5, ly + 3, 0, lx + 1.5, ly + 3, glowR);
    r.addColorStop(0, `rgba(255, 210, 100, ${0.75 * alpha})`);
    r.addColorStop(1, `rgba(255, 210, 100, 0)`);
    ctx.fillStyle = r;
    ctx.beginPath();
    ctx.arc(lx + 1.5, ly + 3, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. People
  people.forEach(p => p.draw(ctx, w, alpha, time, scrollPos));
}
