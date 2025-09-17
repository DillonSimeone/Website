
class Sprite {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 0;
        this.height = 0;
        this.visible = true;
        this.image = null;
    }

    loadImage(imageName) {
        this.image = new Image();
        this.image.onload = () => {
            this.width = this.image.width;
            this.height = this.image.height;
        };
        this.image.src = imageName;
    }

    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }

    intersects(other) {
        const bounds1 = this.getBounds();
        const bounds2 = other.getBounds();
        return bounds1.x < bounds2.x + bounds2.width &&
               bounds1.x + bounds1.width > bounds2.x &&
               bounds1.y < bounds2.y + bounds2.height &&
               bounds1.y + bounds1.height > bounds2.y;
    }
}

class Missile extends Sprite {
    constructor(x, y) {
        super(x, y);
        this.speed = 8;
        this.loadImage('pulsar.gif');
    }

    move(boardWidth) {
        this.x += this.speed;
        if (this.x > boardWidth) {
            this.visible = false;
        }
    }
}

class Enemy extends Sprite {
    constructor(x, y, speed) {
        super(x, y);
        this.initialX = x;
        this.speed = speed;
        this.initEnemy();
    }

    initEnemy() {
        const types = ['warrior.gif', 'brainJar.gif', 'monster.gif'];
        const randomType = Math.floor(Math.random() * types.length);
        this.loadImage(types[randomType]);
    }

    move(boardWidth, boardHeight) {
        if (this.speed > 100) {
            this.speed = 100;
        }

        if (this.x < 0) {
            this.x = this.initialX;
            this.speed = this.speed * (1 + Math.random() * this.speed);
        }

        if (this.y <= 0) {
            this.y = boardHeight - 1;
        }
        if (this.y >= boardHeight) {
            this.y = 1;
        }

        this.x -= this.speed * 2;
    }
}

class Craft extends Sprite {
    constructor(x, y, player) {
        super(x, y);
        this.player = player;
        this.dx = 0;
        this.dy = 0;
        this.missiles = [];
        this.initCraft();
    }

    initCraft() {
        if (this.player === 1) {
            this.loadImage('playerOne2.jpg');
        } else {
            this.loadImage('playerTwo.gif');
        }
    }

    move(boardWidth, boardHeight) {
        this.x += this.dx;
        this.y += this.dy;

        if (this.x < 1) this.x = 1;
        if (this.x > boardWidth - this.width) this.x = boardWidth - this.width;

        if (this.y < 0) {
            this.y = boardHeight - this.height - 10;
        }
        if (this.y > boardHeight - this.height) {
            this.y = 1;
        }
    }

    fire() {
        if (this.visible) {
            this.missiles.push(new Missile(this.x + this.width, this.y + this.height / 2));
        }
    }

    setMovement(dx, dy) {
        this.dx = dx;
        this.dy = dy;
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.boardWidth = this.canvas.width;
        this.boardHeight = this.canvas.height;
        
        this.ingame = true;
        this.doomCounter = 2;
        this.murderedEnemiesOne = 0;
        this.murderedEnemiesTwo = 0;
        this.ENEMY_AMOUNT = 20;
        
        this.craftOne = new Craft(40, 120, 1);
        this.craftTwo = new Craft(40, 30, 2);
        this.enemies = [];
        
        this.keys = {};
        
        this.initEnemies();
        this.setupEventListeners();
        this.gameLoop();
    }

    initEnemies() {
        this.doomCounter++;
        this.enemies = [];
        
        for (let i = 0; i < this.ENEMY_AMOUNT; i++) {
            const xPos = this.boardWidth + Math.random() * (this.boardWidth * 2);
            let yPos = Math.random() * this.boardHeight - 100;
            if (yPos < 100) yPos = 100;
            
            this.enemies.push(new Enemy(xPos, yPos, this.doomCounter));
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            this.handleKeyPress(e);
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.handleKeyRelease(e);
        });
    }

    handleKeyPress(e) {
        // Player 1 controls
        if (e.code === 'Space' || e.code === 'ControlLeft') {
            this.craftOne.fire();
        }
        
        // Player 2 controls
        if (e.code === 'Numpad0') {
            this.craftTwo.fire();
        }

        if (e.code === 'Escape') {
            this.ingame = false;
        }
    }

    handleKeyRelease(e) {
        // This method handles continuous movement in the update loop
    }

    updateCrafts() {
        // Player 1 movement
        let dx1 = 0, dy1 = 0;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx1 = -4;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) dx1 = 4;
        if (this.keys['ArrowUp'] || this.keys['KeyW']) dy1 = -4;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) dy1 = 4;
        this.craftOne.setMovement(dx1, dy1);

        // Player 2 movement
        let dx2 = 0, dy2 = 0;
        if (this.keys['Numpad4']) dx2 = -4;
        if (this.keys['Numpad6']) dx2 = 4;
        if (this.keys['Numpad8']) dy2 = -4;
        if (this.keys['Numpad5']) dy2 = 4;
        this.craftTwo.setMovement(dx2, dy2);

        if (this.craftOne.visible) {
            this.craftOne.move(this.boardWidth, this.boardHeight);
        }
        if (this.craftTwo.visible) {
            this.craftTwo.move(this.boardWidth, this.boardHeight);
        }
    }

    updateMissiles() {
        // Update Player 1 missiles
        for (let i = this.craftOne.missiles.length - 1; i >= 0; i--) {
            const missile = this.craftOne.missiles[i];
            if (missile.visible) {
                missile.move(this.boardWidth);
            } else {
                this.craftOne.missiles.splice(i, 1);
            }
        }

        // Update Player 2 missiles
        for (let i = this.craftTwo.missiles.length - 1; i >= 0; i--) {
            const missile = this.craftTwo.missiles[i];
            if (missile.visible) {
                missile.move(this.boardWidth);
            } else {
                this.craftTwo.missiles.splice(i, 1);
            }
        }
    }

    updateEnemies() {
        if (this.enemies.length === 0) {
            this.initEnemies();
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.visible) {
                enemy.move(this.boardWidth, this.boardHeight);
            } else {
                this.enemies.splice(i, 1);
            }
        }
    }

    checkCollisions() {
        // Check craft-enemy collisions
        for (const enemy of this.enemies) {
            if (this.craftOne.visible && this.craftOne.intersects(enemy)) {
                this.craftOne.visible = false;
                enemy.visible = false;
            }
            if (this.craftTwo.visible && this.craftTwo.intersects(enemy)) {
                this.craftTwo.visible = false;
                enemy.visible = false;
            }
        }

        // Check if both players are dead
        if (!this.craftOne.visible && !this.craftTwo.visible) {
            this.ingame = false;
        }

        // Check missile-enemy collisions
        for (const missile of this.craftOne.missiles) {
            for (const enemy of this.enemies) {
                if (missile.visible && enemy.visible && missile.intersects(enemy)) {
                    missile.visible = false;
                    enemy.visible = false;
                    this.murderedEnemiesOne++;
                }
            }
        }

        for (const missile of this.craftTwo.missiles) {
            for (const enemy of this.enemies) {
                if (missile.visible && enemy.visible && missile.intersects(enemy)) {
                    missile.visible = false;
                    enemy.visible = false;
                    this.murderedEnemiesTwo++;
                }
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.boardWidth, this.boardHeight);

        if (this.ingame) {
            // Draw crafts
            if (this.craftOne.visible && this.craftOne.image) {
                this.ctx.drawImage(this.craftOne.image, this.craftOne.x, this.craftOne.y);
            }
            if (this.craftTwo.visible && this.craftTwo.image) {
                this.ctx.drawImage(this.craftTwo.image, this.craftTwo.x, this.craftTwo.y);
            }

            // Draw missiles
            for (const missile of this.craftOne.missiles) {
                if (missile.visible && missile.image) {
                    this.ctx.drawImage(missile.image, missile.x, missile.y);
                }
            }
            for (const missile of this.craftTwo.missiles) {
                if (missile.visible && missile.image) {
                    this.ctx.drawImage(missile.image, missile.x, missile.y);
                }
            }

            // Draw enemies
            for (const enemy of this.enemies) {
                if (enemy.visible && enemy.image) {
                    this.ctx.drawImage(enemy.image, enemy.x, enemy.y);
                }
            }

            // Draw UI
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px Arial';
            this.ctx.fillText(`Player One: Enemies murdered ${this.murderedEnemiesOne}`, 5, 20);
            this.ctx.fillText(`Player Two: Enemies murdered ${this.murderedEnemiesTwo}`, 5, 40);
            this.ctx.fillText(`Enemies left: ${this.enemies.length}`, 5, 60);
            this.ctx.fillText(`Doom Counter: ${this.doomCounter}`, 5, 80);
        } else {
            this.drawGameOver();
        }
    }

    drawGameOver() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Game Over', this.boardWidth / 2, this.boardHeight / 2);
        
        this.ctx.font = '16px Arial';
        let message1 = this.murderedEnemiesOne === 0 ? "Player one: You're a nice guy, huh?" :
                      this.murderedEnemiesOne < 20 ? `Player one: Enemies murdered: ${this.murderedEnemiesOne}` :
                      `Player one: Enemies slaughtered: ${this.murderedEnemiesOne}`;
        
        let message2 = this.murderedEnemiesTwo === 0 ? "Player Two: You're a nice guy, huh?" :
                      this.murderedEnemiesTwo < 20 ? `Player Two: Enemies murdered: ${this.murderedEnemiesTwo}` :
                      `Player Two: Enemies slaughtered: ${this.murderedEnemiesTwo}`;

        this.ctx.fillText(message1, this.boardWidth / 2, this.boardHeight / 2 + 40);
        this.ctx.fillText(message2, this.boardWidth / 2, this.boardHeight / 2 + 60);
        
        this.ctx.textAlign = 'left';
    }

    gameLoop() {
        if (this.ingame) {
            this.updateCrafts();
            this.updateMissiles();
            this.updateEnemies();
            this.checkCollisions();
        }
        
        this.draw();
        
        if (this.ingame) {
            requestAnimationFrame(() => this.gameLoop());
        }
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
});
