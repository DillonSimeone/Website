/* ==========================================
   1. 3D CARD TILT & MOUSE SHEEN
   ========================================== */
const cards = document.querySelectorAll('.card');

cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left; // x coordinate within client
        const y = e.clientY - rect.top;  // y coordinate within client
        
        // Set custom properties for highlight sheen position
        card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`);
        card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
        
        // Calculate tilt angles relative to center
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        // Max tilt angle (degrees)
        const maxTilt = 8;
        const tiltX = ((centerY - y) / centerY) * maxTilt;
        const tiltY = ((x - centerX) / centerX) * maxTilt;
        
        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
});

/* ==========================================
   2. INTERACTIVE THEMED CANVAS
   ========================================== */
const canvas = document.getElementById('portal-canvas');
const ctx = canvas.getContext('2d');

let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;

let particles = [];
let mouse = { x: null, y: null, active: false };
let activeTheme = 'neutral'; // neutral, sundered, optimizer, deaf
let themeHue = 210; // Default slate/cyan

// Colors and behavior configurations mapping by theme
const themes = {
    neutral: {
        particleColor: 'rgba(148, 163, 184, 0.15)',
        lineColor: 'rgba(148, 163, 184, 0.05)',
        glowColor: 'rgba(148, 163, 184, 0.05)',
        speedFactor: 0.5,
        count: 100,
        behavior: 'random',
        glowRadius: 400,
        connections: { maxDistance: 120 }
    },
    sundered: {
        particleColor: 'rgba(201, 168, 76, 0.3)',
        lineColor: 'rgba(201, 168, 76, 0.08)',
        glowColor: 'rgba(201, 168, 76, 0.15)',
        speedFactor: 0.3,
        count: 150,
        behavior: 'vortex',
        glowRadius: 300,
        connections: { maxDistance: 120 },
        vortex: {
            minDist: 50,
            orbitAngleStep: 0.015,
            orbitDecay: 0.995,
            orbitPull: 0.05,
            centerAngleStep: 0.002,
            centerPull: 0.1
        }
    },
    optimizer: {
        particleColor: 'rgba(57, 255, 20, 0.35)',
        lineColor: 'rgba(57, 255, 20, 0.1)',
        glowColor: 'rgba(57, 255, 20, 0.2)',
        speedFactor: 1.2,
        count: 80,
        behavior: 'rain',
        glowRadius: 400,
        connections: false
    },
    deaf: {
        particleColor: 'rgba(20, 184, 166, 0.35)',
        lineColor: 'rgba(20, 184, 166, 0.1)',
        glowColor: 'rgba(245, 158, 11, 0.12)',
        speedFactor: 0.7,
        count: 120,
        behavior: 'waves',
        glowRadius: 400,
        connections: { maxDistance: 120 }
    },
    naruto: {
        particleColor: 'rgba(239, 68, 68, 0.35)',
        lineColor: 'rgba(239, 68, 68, 0.1)',
        glowColor: 'rgba(239, 68, 68, 0.15)',
        speedFactor: 0.8,
        count: 130,
        behavior: 'vortex',
        glowRadius: 400,
        connections: { maxDistance: 120 },
        vortex: {
            minDist: 30,
            orbitAngleStep: 0.025,
            orbitDecay: 0.99,
            orbitPull: 0.08,
            centerAngleStep: 0.005,
            centerPull: 0.08
        }
    },
    ff7: {
        particleColor: 'rgba(60, 240, 144, 0.35)',
        lineColor: 'rgba(60, 240, 144, 0.1)',
        glowColor: 'rgba(60, 240, 144, 0.18)',
        speedFactor: 1.0,
        count: 140,
        behavior: 'mako',
        glowRadius: 400,
        connections: { maxDistance: 120 }
    },
    harvester: {
        particleColor: 'rgba(126, 184, 212, 0.3)',
        lineColor: 'rgba(126, 184, 212, 0.08)',
        glowColor: 'rgba(126, 184, 212, 0.12)',
        speedFactor: 0.4,
        count: 110,
        behavior: 'random',
        glowRadius: 350,
        connections: { maxDistance: 100 }
    },
    shrine: {
        particleColor: 'rgba(62, 143, 212, 0.35)',
        lineColor: 'rgba(196, 74, 32, 0.1)',
        glowColor: 'rgba(62, 143, 212, 0.15)',
        speedFactor: 0.6,
        count: 130,
        behavior: 'waves',
        glowRadius: 400,
        connections: { maxDistance: 120 }
    },
    kingdom: {
        particleColor: 'rgba(201, 160, 80, 0.35)',
        lineColor: 'rgba(201, 160, 80, 0.1)',
        glowColor: 'rgba(201, 160, 80, 0.18)',
        speedFactor: 0.5,
        count: 140,
        behavior: 'vortex',
        glowRadius: 400,
        connections: { maxDistance: 120 },
        vortex: {
            minDist: 40,
            orbitAngleStep: 0.012,
            orbitDecay: 0.993,
            orbitPull: 0.06,
            centerAngleStep: 0.003,
            centerPull: 0.09
        }
    },
    vermillion: {
        particleColor: 'rgba(196, 48, 64, 0.4)',
        lineColor: 'rgba(196, 48, 64, 0.1)',
        glowColor: 'rgba(139, 24, 40, 0.2)',
        speedFactor: 0.7,
        count: 120,
        behavior: 'rain',
        glowRadius: 450,
        connections: false
    }
};

window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    initParticles();
});

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
});

window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
    mouse.active = false;
});

// Trigger theme change on card hover
cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
        const theme = card.getAttribute('data-theme');
        transitionTheme(theme);
    });
    card.addEventListener('mouseleave', () => {
        transitionTheme('neutral');
    });
});

let targetTheme = 'neutral';
let transitionProgress = 1;

function transitionTheme(themeName) {
    targetTheme = themeName;
    transitionProgress = 0;
}

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 2 + 0.8;
        this.baseSize = this.size;
        
        // Normal random velocity
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = (Math.random() - 0.5) * 1.5;
        this.angle = Math.random() * Math.PI * 2;
        this.angularSpeed = (Math.random() - 0.5) * 0.01;
        this.amplitude = Math.random() * 20 + 5;
        this.frequency = Math.random() * 0.02 + 0.005;
        this.phase = Math.random() * 100;
        this.progress = 0;
    }

    update(currentThemeParams) {
        this.progress += 1;
        const currentBehavior = themes[activeTheme].behavior;
        
        if (currentBehavior === 'random') {
            // Drifts randomly
            this.x += this.vx * currentThemeParams.speedFactor;
            this.y += this.vy * currentThemeParams.speedFactor;
        } 
        else if (currentBehavior === 'vortex') {
            // Gravitates towards mouse or center screen in an orbit/vortex
            const config = themes[activeTheme].vortex;
            if (mouse.active) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist > config.minDist) {
                    const orbitAngle = Math.atan2(dy, dx) + config.orbitAngleStep;
                    const targetX = mouse.x - Math.cos(orbitAngle) * dist * config.orbitDecay;
                    const targetY = mouse.y - Math.sin(orbitAngle) * dist * config.orbitDecay;
                    
                    this.x += (targetX - this.x) * config.orbitPull * currentThemeParams.speedFactor;
                    this.y += (targetY - this.y) * config.orbitPull * currentThemeParams.speedFactor;
                } else {
                    this.reset();
                }
            } else {
                const cx = width / 2;
                const cy = height / 2;
                const dx = cx - this.x;
                const dy = cy - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const orbitAngle = Math.atan2(dy, dx) + config.centerAngleStep;
                const targetX = cx - Math.cos(orbitAngle) * dist;
                const targetY = cy - Math.sin(orbitAngle) * dist;
                this.x += (targetX - this.x) * config.centerPull * currentThemeParams.speedFactor;
                this.y += (targetY - this.y) * config.centerPull * currentThemeParams.speedFactor;
            }
        } 
        else if (currentBehavior === 'rain') {
            // Strictly grid-based/vertical falling lines (code rain)
            this.y += Math.abs(this.vy) * 2.5 * currentThemeParams.speedFactor;
            this.x += (Math.random() - 0.5) * 0.2; // minimal jitter
            
            if (this.y > height) {
                this.y = 0;
                this.x = Math.random() * width;
            }
        } 
        else if (currentBehavior === 'waves') {
            // Waves undulating left to right
            this.x += Math.abs(this.vx) * 1.5 * currentThemeParams.speedFactor;
            this.y += Math.sin((this.x * this.frequency) + this.phase) * 0.5;
            
            if (this.x > width) {
                this.x = 0;
                this.y = Math.random() * height;
            }
        }
        else if (currentBehavior === 'mako') {
            // Mako energy flow: particles swirl upward and oscillate horizontally
            this.y -= Math.abs(this.vy) * 1.5 * currentThemeParams.speedFactor;
            this.x += Math.sin((this.y * this.frequency) + this.phase) * 0.8;
            if (this.y < 0) {
                this.y = height;
                this.x = Math.random() * width;
            }
        }

        // Boundary collision for non-resetting behaviors
        if (currentBehavior !== 'rain' && currentBehavior !== 'waves') {
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;
            
            // Keep within bounds
            this.x = Math.max(0, Math.min(width, this.x));
            this.y = Math.max(0, Math.min(height, this.y));
        }

        // Interactive mouse repulsion in random and waves behavior modes
        if (mouse.active && (currentBehavior === 'random' || currentBehavior === 'waves')) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
                const force = (120 - dist) / 120;
                const angle = Math.atan2(dy, dx);
                this.x -= Math.cos(angle) * force * 3;
                this.y -= Math.sin(angle) * force * 3;
            }
        }
    }

    draw(currentThemeParams) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = currentThemeParams.particleColor;
        ctx.fill();
    }
}

function initParticles() {
    particles = [];
    const count = 150; // Use a fixed pool size and toggle activity/drawing parameters
    for (let i = 0; i < count; i++) {
        particles.push(new Particle());
    }
}

// Handle color lerping for smooth transitions
function lerpColor(c1, c2, factor) {
    // Very simple color parser for rgba strings
    const parseColor = (str) => {
        const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return [148, 163, 184, 0.15];
        return [
            parseInt(match[1]),
            parseInt(match[2]),
            parseInt(match[3]),
            match[4] !== undefined ? parseFloat(match[4]) : 1.0
        ];
    };

    const color1 = parseColor(c1);
    const color2 = parseColor(c2);

    const r = Math.round(color1[0] + (color2[0] - color1[0]) * factor);
    const g = Math.round(color1[1] + (color2[1] - color1[1]) * factor);
    const b = Math.round(color1[2] + (color2[2] - color1[2]) * factor);
    const a = color1[3] + (color2[3] - color1[3]) * factor;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function drawConnections(currentThemeParams) {
    const connConfig = themes[activeTheme].connections;
    if (!connConfig) return;

    const maxDistance = connConfig.maxDistance || 120;
    
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i];
            const p2 = particles[j];
            
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < maxDistance) {
                const alpha = (1 - (dist / maxDistance)) * 0.85;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                
                // Parse alpha and merge
                let c = currentThemeParams.lineColor;
                const match = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match) {
                    const currentAlpha = parseFloat(match[4] || 1.0);
                    ctx.strokeStyle = `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${currentAlpha * alpha})`;
                } else {
                    ctx.strokeStyle = c;
                }
                
                ctx.lineWidth = 0.6;
                ctx.stroke();
            }
        }
    }
}

// Active running animation loop
function animate() {
    ctx.clearRect(0, 0, width, height);

    // Smoothly interpolate active theme configuration parameters
    if (activeTheme !== targetTheme) {
        transitionProgress += 0.04;
        if (transitionProgress >= 1) {
            transitionProgress = 1;
            activeTheme = targetTheme;
        }
    }

    const sourceParams = themes[activeTheme];
    const targetParams = themes[targetTheme];

    // Lerp current parameters
    const currentParams = {
        particleColor: lerpColor(sourceParams.particleColor, targetParams.particleColor, transitionProgress),
        lineColor: lerpColor(sourceParams.lineColor, targetParams.lineColor, transitionProgress),
        glowColor: lerpColor(sourceParams.glowColor, targetParams.glowColor, transitionProgress),
        speedFactor: sourceParams.speedFactor + (targetParams.speedFactor - sourceParams.speedFactor) * transitionProgress,
        count: Math.round(sourceParams.count + (targetParams.count - sourceParams.count) * transitionProgress)
    };

    // Draw radial theme glow under cards
    if (activeTheme !== 'neutral' || targetTheme !== 'neutral') {
        const cx = mouse.active ? mouse.x : width / 2;
        const cy = mouse.active ? mouse.y : height / 2;
        
        // Lerp glow radius smoothly
        const sourceRadius = themes[activeTheme].glowRadius || 400;
        const targetRadius = themes[targetTheme].glowRadius || 400;
        const radius = sourceRadius + (targetRadius - sourceRadius) * transitionProgress;
        
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
        grad.addColorStop(0, currentParams.glowColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Slice particles pool to match transition count
    const activeParticles = particles.slice(0, currentParams.count);

    activeParticles.forEach(p => {
        p.update(currentParams);
        p.draw(currentParams);
    });

    if (themes[activeTheme].connections) {
        drawConnections(currentParams);
    }

    requestAnimationFrame(animate);
}

// Initialize and trigger loop
initParticles();
animate();

// Clear entrance animations after they finish so they don't lock transforms
setTimeout(() => {
    cards.forEach(card => {
        card.style.animation = 'none';
        card.style.opacity = '1';
    });
}, 2000);
