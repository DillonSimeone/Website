class Particle {
    constructor() {
        this.pos = createVector(width / 2, height / 2)
        this.rays = []
        for (let a = 0; a < 359.9; a += 360 / rays) {
            this.rays.push(new Ray(this.pos, radians(a)))
        }
    }

    update(x, y) {
        this.pos.set(x, y)
    }

    look(walls) {
        for (let ray of this.rays) {
          let closest = null;
          let record = Infinity;
          let hitWall = null;
          for (let wall of walls) {
            let hit = ray.cast(wall);
            if (hit) {
              let d = p5.Vector.dist(this.pos, hit.pt);
              if (d < record) {
                record = d;
                closest = hit.pt;
                hitWall = hit.wall;
              }
            }
          }
    
          if (closest) {
            // Draw the ray line
            stroke(255, 255, 255);
            strokeWeight(random(0.5,1));
            line(this.pos.x, this.pos.y, closest.x, closest.y);
    
            // If the hit wall is magical, spawn one liquidParticle per ray (with some probability)
            if (hitWall && random(1) < hitWall.magic) 
              liquidParticles.push(new LiquidParticle(closest.x, closest.y));
          }
        }
      }

    show() {
        noStroke()
        fill(255)
        ellipse(this.pos.x, this.pos.y, 16)
    }
}

class LiquidParticle {
    constructor(x, y) {
        this.pos = createVector(x, y)
        this.lifetime = liquidParticlesLifeTime * random(0,2) // Frames before disappearing
        this.vel = p5.Vector.random2D().mult(random(0.5, 10)) // Randomized motion
        this.alpha = random(255)
    }

    update() {
        this.pos.add(this.vel)
        this.lifetime -= 1
        this.alpha = map(this.lifetime, 0, 20, 0, 255)
    }

    show() {
        noStroke();
        fill(0, this.alpha, this.alpha, this.alpha)
        ellipse(this.pos.x, this.pos.y, 6);
    }

    isDead() {
        return this.lifetime <= 1;
    }
}