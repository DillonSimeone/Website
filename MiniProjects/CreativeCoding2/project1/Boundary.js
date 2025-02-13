class Boundary {
    constructor(x1, y1, x2, y2) {
      this.a = createVector(x1, y1)
      this.b = createVector(x2, y2)
      this.magic = random(0, 1)
      this.stroke = color(random(0, 255), random(0,255), random(0,255))
      this.decay = 10
      this.lastParticleSpawn = -1000  // Cooldown for particle spawning
    }

    static CreateArc(cx, cy, r, startAngle, endAngle, numSegments) {
        let boundaries = [];
        let prevPoint = createVector(cx + r * cos(startAngle), cy + r * sin(startAngle));

        for (let i = 1; i <= numSegments; i++) {
            let t = i / numSegments;
            let angle = lerp(startAngle, endAngle, t);
            let newPoint = createVector(cx + r * cos(angle), cy + r * sin(angle));
            boundaries.push(new Boundary(prevPoint.x, prevPoint.y, newPoint.x, newPoint.y));
            prevPoint = newPoint;
        }

        return boundaries;
    }
    
    show() {
      strokeWeight(random(0, 10))
      stroke(this.stroke)
      this.stroke = lerpColor(this.stroke, color(random(0, 255), random(0,255), random(0,255)), 0.33)
      line(this.a.x, this.a.y, this.b.x, this.b.y)
    }
  }