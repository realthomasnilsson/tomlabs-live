/**
 * Space Invaders - Core Game Engine
 */

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = 800;
        this.height = 600;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.score = 0;
        this.lives = 3;
        this.state = 'MENU'; // MENU, PLAYING, GAME_OVER

        this.inputs = {
            left: false,
            right: false,
            fire: false
        };

        this.entities = {
            player: null,
            bullets: [],
            enemies: [],
            particles: []
        };

        this.lastTime = 0;

        this.setupInputs();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            console.log('Key pressed:', e.code);
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.inputs.left = true;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') this.inputs.right = true;
            if (e.code === 'Space' || e.code === 'Enter') {
                if (this.state === 'MENU' || this.state === 'GAME_OVER') {
                    this.startGame();
                } else {
                    this.inputs.fire = true;
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.inputs.left = false;
            if (e.code === 'ArrowRight' || e.code === 'KeyD') this.inputs.right = false;
            if (e.code === 'Space' || e.code === 'Enter') this.inputs.fire = false;
        });

        // Add mouse click to start/restart
        window.addEventListener('click', () => {
            if (this.state === 'MENU' || this.state === 'GAME_OVER') {
                this.startGame();
            } else {
                this.inputs.fire = true;
                // Auto-release fire for click (tap to shoot)
                setTimeout(() => this.inputs.fire = false, 100);
            }
        });
    }

    startGame() {
        this.state = 'PLAYING';
        this.score = 0;
        this.lives = 3;
        this.entities.bullets = [];
        this.entities.enemies = [];
        this.entities.particles = [];

        // Initialize player
        this.entities.player = new Player(this);

        // Initialize enemies
        this.createEnemies();

        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('active');
        this.updateUI();
    }

    createEnemies() {
        this.enemyDirection = 1;
        this.enemySpeed = 0.05; // Base speed
        this.entities.enemies = [];

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 11; col++) {
                this.entities.enemies.push(new Invader(this, col * 50 + 50, row * 40 + 50));
            }
        }
    }

    update(deltaTime) {
        if (this.state !== 'PLAYING') return;

        // Update player
        if (this.entities.player) {
            this.entities.player.update(deltaTime);
        }

        // Update bullets
        this.entities.bullets.forEach((bullet, index) => {
            bullet.update(deltaTime);
            if (bullet.markedForDeletion) {
                this.entities.bullets.splice(index, 1);
            }
        });

        // Update enemies
        let hitEdge = false;
        this.entities.enemies.forEach(enemy => {
            enemy.update(deltaTime);
            enemy.x += this.enemySpeed * deltaTime * this.enemyDirection;
            if (this.enemyDirection === 1 && enemy.x + enemy.width > this.width - 20) hitEdge = true;
            if (this.enemyDirection === -1 && enemy.x < 20) hitEdge = true;
        });

        if (hitEdge) {
            this.enemyDirection *= -1;
            this.entities.enemies.forEach(enemy => {
                enemy.y += 20; // Drop down
            });
        }

        this.checkCollisions();

        // Win condition
        if (this.entities.enemies.length === 0) {
            this.levelComplete();
        }
    }

    checkCollisions() {
        // Bullets hitting enemies
        this.entities.bullets.forEach(bullet => {
            if (bullet.direction === -1) { // Player bullet
                this.entities.enemies.forEach((enemy, enemyIndex) => {
                    if (!bullet.markedForDeletion &&
                        bullet.x < enemy.x + enemy.width &&
                        bullet.x + bullet.width > enemy.x &&
                        bullet.y < enemy.y + enemy.height &&
                        bullet.y + bullet.height > enemy.y) {

                        bullet.markedForDeletion = true;
                        this.entities.enemies.splice(enemyIndex, 1);
                        this.score += 10;
                        this.updateUI();
                    }
                });
            }
        });

        // Enemies hitting player or bottom
        this.entities.enemies.forEach(enemy => {
            if (this.entities.player &&
                enemy.x < this.entities.player.x + this.entities.player.width &&
                enemy.x + enemy.width > this.entities.player.x &&
                enemy.y < this.entities.player.y + this.entities.player.height &&
                enemy.y + enemy.height > this.entities.player.y) {
                this.gameOver();
            }

            if (enemy.y + enemy.height > this.height) {
                this.gameOver();
            }
        });
    }

    levelComplete() {
        // For now, just respawn faster enemies
        this.createEnemies();
        this.enemySpeed += 0.02;
    }

    gameOver() {
        this.state = 'GAME_OVER';
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('game-over-screen').classList.add('active');
        document.getElementById('final-score').innerText = this.score;
    }

    draw() {
        // Clear screen
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (this.state === 'PLAYING') {
            if (this.entities.player) this.entities.player.draw(this.ctx);

            this.entities.bullets.forEach(bullet => bullet.draw(this.ctx));
            this.entities.enemies.forEach(enemy => enemy.draw(this.ctx));
        }
    }

    loop(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.loop);
    }

    updateUI() {
        document.getElementById('score').innerText = this.score;
        document.getElementById('lives').innerText = this.lives;
    }
}

class Player {
    constructor(game) {
        this.game = game;
        this.width = 40;
        this.height = 20;
        this.x = game.width / 2 - this.width / 2;
        this.y = game.height - 50;
        this.speed = 0.4;
        this.color = '#0ff';
        this.lastFired = 0;
        this.fireInterval = 500;
    }

    update(deltaTime) {
        // Movement
        if (this.game.inputs.left) this.x -= this.speed * deltaTime;
        if (this.game.inputs.right) this.x += this.speed * deltaTime;

        // Boundaries
        if (this.x < 0) this.x = 0;
        if (this.x > this.game.width - this.width) this.x = this.game.width - this.width;

        // Shooting logic
        if (this.game.inputs.fire) {
            const now = Date.now();
            if (now - this.lastFired > this.fireInterval) {
                this.shoot();
                this.lastFired = now;
            }
        }
    }

    shoot() {
        this.game.entities.bullets.push(new Bullet(this.game, this.x + this.width / 2, this.y, -1));
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        // Simple ship shape
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.closePath();
        ctx.fill();
    }
}

class Bullet {
    constructor(game, x, y, direction) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.direction = direction; // -1 for up (player), 1 for down (enemy)
        this.speed = 0.6;
        this.width = 4;
        this.height = 10;
        this.markedForDeletion = false;
        this.color = direction === -1 ? '#0f0' : '#f00';
    }

    update(deltaTime) {
        this.y += this.speed * deltaTime * this.direction;

        // Boundary check
        if (this.y < 0 || this.y > this.game.height) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y, this.width, this.height);
    }
}

class Invader {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.color = '#f00';
    }

    update(deltaTime) {
        // Movement is handled by Game controller
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        // Basic Invader Shape (using rectangles for pixel art look)
        const w = this.width;
        const h = this.height;
        const x = this.x;
        const y = this.y;

        ctx.fillRect(x + w * 0.25, y, w * 0.5, h * 0.25);
        ctx.fillRect(x, y + h * 0.25, w, h * 0.5);
        ctx.fillRect(x, y + h * 0.75, w * 0.25, h * 0.25);
        ctx.fillRect(x + w * 0.75, y + h * 0.75, w * 0.25, h * 0.25);
    }
}

// Start game on load
window.addEventListener('load', () => {
    console.log("Game loaded and starting...");
    const game = new Game();
});
