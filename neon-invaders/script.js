(() => {
    "use strict";

    const VIEW_WIDTH = 224;
    const VIEW_HEIGHT = 256;
    const PLAYER_Y = 222;
    const FLEET_START_X = 26;
    const FLEET_START_Y = 52;
    const FLEET_COL_GAP = 16;
    const FLEET_ROW_GAP = 16;
    const FLEET_STEP = 2;
    const FLEET_DROP = 8;
    const LEFT_EDGE = 8;
    const RIGHT_EDGE = 216;
    const STARTING_LIVES = 3;
    const PLAYER_SPEED = 0.092;
    const PLAYER_SHOT_SPEED = 0.28;
    const ENEMY_SHOT_SPEED = 0.105;
    const SAUCER_SPEED = 0.068;
    const STORAGE_KEY = "neonInvadersHighScore";

    const colors = {
        black: "#000000",
        white: "#f6fff8",
        dim: "#8eff87",
        player: "#e8fff7",
        shield: "#39ff14",
        saucer: "#ff3131",
        shot: "#f6fff8",
        enemyShot: "#ffeb3b",
        explosion: "#ffffff",
        invaders: ["#ff2bd6", "#00fff7", "#39ff14", "#fff01f", "#ff9f1c"]
    };

    const sprite = {
        player: [
            "......#......",
            ".....###.....",
            ".....###.....",
            "..#########..",
            ".###########.",
            "#############",
            "#############",
            "###.......###"
        ],
        playerExplosion: [
            "#..#..#..#..#",
            ".#.#.###.#.#.",
            "..###...###..",
            "###..#.#..###",
            "..###...###..",
            ".#.#.###.#.#.",
            "#..#..#..#..#",
            "..#.......#.."
        ],
        explosion: [
            "#..#..#",
            ".####.",
            "######",
            "..##..",
            ".####.",
            "#....#"
        ],
        saucer: [
            "....########....",
            "..############..",
            ".##############.",
            "################",
            "###..######..###",
            ".#..#......#..#."
        ],
        squid: [
            [
                "..####..",
                ".######.",
                "##.##.##",
                "########",
                "..#..#..",
                ".#.##.#.",
                "#.#..#.#",
                ".#....#."
            ],
            [
                "..####..",
                ".######.",
                "##.##.##",
                "########",
                "...##...",
                "..#..#..",
                ".#....#.",
                "#......#"
            ]
        ],
        crab: [
            [
                "..#.....#..",
                "...#...#...",
                "..#######..",
                ".##.###.##.",
                "###########",
                "#.#######.#",
                "#.#.....#.#",
                "...##.##..."
            ],
            [
                "..#.....#..",
                "#..#...#..#",
                "#.#######.#",
                "###.###.###",
                "###########",
                ".#########.",
                "..#.....#..",
                ".#.......#."
            ]
        ],
        octopus: [
            [
                "..#......#..",
                "...#....#...",
                "..########..",
                ".##.####.##.",
                "############",
                "#.########.#",
                "#.#......#.#",
                "...##..##..."
            ],
            [
                "..#......#..",
                "#..#....#..#",
                "#.########.#",
                "############",
                ".##########.",
                "..########..",
                ".##......##.",
                "##........##"
            ]
        ],
        missiles: {
            plunger: [
                ".#.",
                "###",
                ".#.",
                ".#.",
                "###",
                ".#."
            ],
            squiggle: [
                "#..",
                ".#.",
                "..#",
                ".#.",
                "#..",
                ".#."
            ],
            rolling: [
                ".#.",
                "#.#",
                ".#.",
                "#.#",
                ".#.",
                "#.#"
            ]
        }
    };

    const invaderRows = [
        { kind: "squid", score: 30 },
        { kind: "crab", score: 20 },
        { kind: "crab", score: 20 },
        { kind: "octopus", score: 10 },
        { kind: "octopus", score: 10 }
    ];

    class SoundBoard {
        constructor() {
            this.audio = null;
            this.marchIndex = 0;
        }

        unlock() {
            if (!this.audio) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                this.audio = new AudioContext();
            }

            if (this.audio.state === "suspended") {
                this.audio.resume();
            }
        }

        tone(frequency, duration, type = "square", volume = 0.04, slideTo = null) {
            if (!this.audio) return;

            const now = this.audio.currentTime;
            const oscillator = this.audio.createOscillator();
            const gain = this.audio.createGain();

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, now);
            if (slideTo) {
                oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
            }

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            oscillator.connect(gain);
            gain.connect(this.audio.destination);
            oscillator.start(now);
            oscillator.stop(now + duration + 0.02);
        }

        march() {
            const notes = [86, 104, 123, 145];
            this.tone(notes[this.marchIndex], 0.065, "square", 0.035);
            this.marchIndex = (this.marchIndex + 1) % notes.length;
        }

        fire() {
            this.tone(720, 0.07, "square", 0.035, 220);
        }

        invaderHit() {
            this.tone(165, 0.08, "square", 0.055, 82);
        }

        playerHit() {
            this.tone(60, 0.34, "sawtooth", 0.075, 34);
            this.tone(98, 0.24, "square", 0.038, 52);
        }

        saucer() {
            this.tone(118, 0.075, "square", 0.026, 92);
        }

        saucerHit() {
            this.tone(520, 0.12, "square", 0.06, 120);
        }
    }

    class NeonInvaders {
        constructor() {
            this.canvas = document.getElementById("gameCanvas");
            this.ctx = this.canvas.getContext("2d", { alpha: false });
            this.canvas.width = VIEW_WIDTH;
            this.canvas.height = VIEW_HEIGHT;
            this.ctx.imageSmoothingEnabled = false;

            this.startScreen = document.getElementById("start-screen");
            this.gameOverScreen = document.getElementById("game-over-screen");
            this.finalScore = document.getElementById("final-score");
            this.sound = new SoundBoard();

            this.input = {
                left: false,
                right: false,
                pointerActive: false,
                pointerX: null
            };

            this.highScore = this.loadHighScore();
            this.score = 0;
            this.lives = STARTING_LIVES;
            this.wave = 1;
            this.state = "MENU";
            this.lastTime = 0;
            this.stateTimer = 0;
            this.fleetTimer = 0;
            this.enemyShotTimer = 900;
            this.saucerTimer = 0;
            this.saucerShotCountdown = 23;
            this.animFrame = 0;
            this.direction = 1;
            this.formationX = FLEET_START_X;
            this.formationY = FLEET_START_Y;

            this.player = this.makePlayer();
            this.playerShot = null;
            this.enemyShots = [];
            this.invaders = [];
            this.shields = [];
            this.effects = [];
            this.saucer = null;

            this.createInvaders();
            this.createShields();
            this.setupInput();

            requestAnimationFrame((time) => this.loop(time));
        }

        loadHighScore() {
            const stored = Number(window.localStorage.getItem(STORAGE_KEY));
            return Number.isFinite(stored) ? stored : 0;
        }

        saveHighScore() {
            window.localStorage.setItem(STORAGE_KEY, String(this.highScore));
        }

        setupInput() {
            window.addEventListener("keydown", (event) => {
                if (event.code === "ArrowLeft" || event.code === "KeyA") {
                    this.input.left = true;
                    event.preventDefault();
                }

                if (event.code === "ArrowRight" || event.code === "KeyD") {
                    this.input.right = true;
                    event.preventDefault();
                }

                if (event.code === "Space" || event.code === "Enter") {
                    event.preventDefault();
                    this.sound.unlock();

                    if (this.state === "MENU" || this.state === "GAME_OVER") {
                        this.startGame();
                        return;
                    }

                    if (this.state === "PLAYING" && !event.repeat) {
                        this.firePlayerShot();
                    }
                }
            });

            window.addEventListener("keyup", (event) => {
                if (event.code === "ArrowLeft" || event.code === "KeyA") this.input.left = false;
                if (event.code === "ArrowRight" || event.code === "KeyD") this.input.right = false;
            });

            this.canvas.addEventListener("pointerdown", (event) => {
                this.sound.unlock();
                this.canvas.setPointerCapture(event.pointerId);

                if (this.state === "MENU" || this.state === "GAME_OVER") {
                    this.startGame();
                    return;
                }

                this.input.pointerActive = true;
                this.input.pointerX = this.toCanvasX(event.clientX);
                this.firePlayerShot();
            });

            this.canvas.addEventListener("pointermove", (event) => {
                if (!this.input.pointerActive) return;
                this.input.pointerX = this.toCanvasX(event.clientX);
            });

            window.addEventListener("pointerup", () => {
                this.input.pointerActive = false;
                this.input.pointerX = null;
            });
        }

        toCanvasX(clientX) {
            const rect = this.canvas.getBoundingClientRect();
            return ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
        }

        makePlayer() {
            return {
                x: Math.floor(VIEW_WIDTH / 2 - sprite.player[0].length / 2),
                y: PLAYER_Y,
                width: sprite.player[0].length,
                height: sprite.player.length
            };
        }

        startGame() {
            this.score = 0;
            this.lives = STARTING_LIVES;
            this.wave = 1;
            this.highScore = Math.max(this.highScore, this.score);
            this.startScreen.classList.add("hidden");
            this.startScreen.classList.remove("active");
            this.gameOverScreen.classList.add("hidden");
            this.gameOverScreen.classList.remove("active");
            this.resetRound();
            this.state = "PLAYING";
        }

        resetRound() {
            this.direction = 1;
            this.formationX = FLEET_START_X;
            this.formationY = FLEET_START_Y + Math.min((this.wave - 1) * 6, 28);
            this.fleetTimer = 0;
            this.enemyShotTimer = 900;
            this.saucerTimer = 0;
            this.saucerShotCountdown = 23;
            this.animFrame = 0;
            this.player = this.makePlayer();
            this.playerShot = null;
            this.enemyShots = [];
            this.effects = [];
            this.saucer = null;
            this.createInvaders();
            this.createShields();
        }

        resetPlayerAfterHit() {
            this.player = this.makePlayer();
            this.playerShot = null;
            this.enemyShots = [];
            this.state = "PLAYING";
            this.stateTimer = 0;
        }

        createInvaders() {
            this.invaders = [];

            for (let row = 0; row < invaderRows.length; row += 1) {
                for (let col = 0; col < 11; col += 1) {
                    this.invaders.push({
                        row,
                        col,
                        alive: true,
                        kind: invaderRows[row].kind,
                        score: invaderRows[row].score,
                        color: colors.invaders[row]
                    });
                }
            }
        }

        createShields() {
            this.shields = [];
            const starts = [24, 75, 126, 177];

            starts.forEach((x) => {
                this.shields.push({
                    x,
                    y: 185,
                    width: 22,
                    height: 16,
                    grid: this.createShieldGrid()
                });
            });
        }

        createShieldGrid() {
            const grid = [];

            for (let y = 0; y < 16; y += 1) {
                const row = [];

                for (let x = 0; x < 22; x += 1) {
                    let active = false;

                    if (y <= 1) active = x >= 6 && x <= 15;
                    else if (y <= 3) active = x >= 4 && x <= 17;
                    else if (y <= 11) active = x >= 1 && x <= 20;
                    else active = (x >= 1 && x <= 6) || (x >= 15 && x <= 20);

                    if (y >= 9 && x >= 8 && x <= 13) active = false;
                    if (y === 8 && x >= 9 && x <= 12) active = false;
                    row.push(active);
                }

                grid.push(row);
            }

            return grid;
        }

        loop(timestamp) {
            const delta = Math.min(timestamp - this.lastTime, 34);
            this.lastTime = timestamp;
            this.update(delta || 0);
            this.draw();
            requestAnimationFrame((time) => this.loop(time));
        }

        update(delta) {
            this.updateEffects(delta);

            if (this.state === "PLAYER_EXPLODING") {
                this.stateTimer -= delta;
                if (this.stateTimer <= 0) {
                    if (this.lives <= 0) this.endGame();
                    else this.resetPlayerAfterHit();
                }
                return;
            }

            if (this.state === "WAVE_CLEAR") {
                this.stateTimer -= delta;
                if (this.stateTimer <= 0) {
                    this.wave += 1;
                    this.resetRound();
                    this.state = "PLAYING";
                }
                return;
            }

            if (this.state !== "PLAYING") return;

            this.updatePlayer(delta);
            this.updatePlayerShot(delta);
            this.updateEnemyShots(delta);
            this.updateSaucer(delta);
            this.updateFleet(delta);
            this.updateEnemyFire(delta);
            this.checkPlayerShotCollisions();
            this.checkEnemyShotCollisions();
            this.checkInvasionLine();
        }

        updatePlayer(delta) {
            if (this.input.pointerActive && this.input.pointerX !== null) {
                this.player.x = Math.round(this.input.pointerX - this.player.width / 2);
            }

            if (this.input.left) this.player.x -= PLAYER_SPEED * delta;
            if (this.input.right) this.player.x += PLAYER_SPEED * delta;
            this.player.x = clamp(this.player.x, 8, VIEW_WIDTH - this.player.width - 8);
        }

        firePlayerShot() {
            if (this.playerShot || this.state !== "PLAYING") return;

            this.playerShot = {
                x: Math.round(this.player.x + this.player.width / 2),
                y: this.player.y - 5,
                width: 1,
                height: 4
            };

            this.saucerShotCountdown -= 1;
            if (this.saucerShotCountdown <= 0 && !this.saucer) {
                this.spawnSaucer();
                this.saucerShotCountdown = 18 + Math.floor(Math.random() * 10);
            }

            this.sound.fire();
        }

        updatePlayerShot(delta) {
            if (!this.playerShot) return;
            this.playerShot.y -= PLAYER_SHOT_SPEED * delta;
            if (this.playerShot.y + this.playerShot.height < 24) this.playerShot = null;
        }

        updateEnemyShots(delta) {
            this.enemyShots = this.enemyShots.filter((shot) => {
                shot.y += ENEMY_SHOT_SPEED * delta;
                shot.frame += delta;
                return shot.y < VIEW_HEIGHT - 12;
            });
        }

        updateFleet(delta) {
            this.fleetTimer += delta;
            const interval = this.fleetInterval();

            if (this.fleetTimer < interval) return;
            this.fleetTimer %= interval;

            const bounds = this.fleetBounds();
            if (!bounds) return;

            const nextLeft = bounds.left + this.direction * FLEET_STEP;
            const nextRight = bounds.right + this.direction * FLEET_STEP;

            if (nextLeft <= LEFT_EDGE || nextRight >= RIGHT_EDGE) {
                this.formationY += FLEET_DROP;
                this.direction *= -1;
            } else {
                this.formationX += this.direction * FLEET_STEP;
            }

            this.animFrame = this.animFrame === 0 ? 1 : 0;
            this.sound.march();
        }

        fleetInterval() {
            const remaining = this.aliveCount();
            let interval = 620;

            if (remaining <= 1) interval = 52;
            else if (remaining <= 2) interval = 74;
            else if (remaining <= 5) interval = 112;
            else if (remaining <= 10) interval = 160;
            else if (remaining <= 16) interval = 240;
            else if (remaining <= 24) interval = 330;
            else if (remaining <= 34) interval = 430;
            else if (remaining <= 44) interval = 530;

            return Math.max(42, interval - (this.wave - 1) * 24);
        }

        updateEnemyFire(delta) {
            this.enemyShotTimer -= delta;
            const maxShots = Math.min(3, 1 + Math.floor((55 - this.aliveCount()) / 18));

            if (this.enemyShotTimer > 0 || this.enemyShots.length >= maxShots) return;

            this.fireEnemyShot();
            const pressure = 1 - this.aliveCount() / 55;
            this.enemyShotTimer = 980 - pressure * 360 - Math.min(this.wave - 1, 5) * 55 + Math.random() * 420;
        }

        fireEnemyShot() {
            const shooters = this.bottomInvadersByColumn();
            if (shooters.length === 0) return;

            const playerCenter = this.player.x + this.player.width / 2;
            let shooter;

            if (Math.random() < 0.58) {
                shooter = shooters.reduce((closest, candidate) => {
                    const closestDistance = Math.abs(this.invaderRect(closest).x - playerCenter);
                    const candidateDistance = Math.abs(this.invaderRect(candidate).x - playerCenter);
                    return candidateDistance < closestDistance ? candidate : closest;
                }, shooters[0]);
            } else {
                shooter = shooters[Math.floor(Math.random() * shooters.length)];
            }

            const rect = this.invaderRect(shooter);
            const types = ["plunger", "squiggle", "rolling"];
            this.enemyShots.push({
                x: Math.round(rect.x + rect.width / 2) - 1,
                y: rect.y + rect.height,
                type: types[this.enemyShots.length % types.length],
                frame: 0,
                width: 3,
                height: 6
            });
        }

        updateSaucer(delta) {
            if (!this.saucer) return;

            this.saucer.x += this.saucer.direction * SAUCER_SPEED * delta;
            this.saucerTimer += delta;

            if (this.saucerTimer > 260) {
                this.saucerTimer = 0;
                this.sound.saucer();
            }

            if (this.saucer.direction === 1 && this.saucer.x > VIEW_WIDTH + 18) this.saucer = null;
            if (this.saucer.direction === -1 && this.saucer.x < -24) this.saucer = null;
        }

        spawnSaucer() {
            const direction = Math.random() < 0.5 ? 1 : -1;
            this.saucer = {
                x: direction === 1 ? -20 : VIEW_WIDTH + 20,
                y: 32,
                direction,
                width: sprite.saucer[0].length,
                height: sprite.saucer.length
            };
            this.saucerTimer = 999;
        }

        checkPlayerShotCollisions() {
            if (!this.playerShot) return;

            if (this.damageShieldForShot(this.playerShot, true)) {
                this.playerShot = null;
                return;
            }

            if (this.saucer && rectsOverlap(this.playerShotRect(), this.saucer)) {
                const value = this.saucerValue();
                this.addScore(value);
                this.effects.push({
                    type: "text",
                    text: String(value),
                    x: this.saucer.x + 1,
                    y: this.saucer.y + 1,
                    ttl: 850,
                    color: colors.white
                });
                this.saucer = null;
                this.playerShot = null;
                this.sound.saucerHit();
                return;
            }

            for (const invader of this.invaders) {
                if (!invader.alive) continue;
                const rect = this.invaderRect(invader);

                if (rectsOverlap(this.playerShotRect(), rect) && this.spriteHit(invader, this.playerShot.x, this.playerShot.y)) {
                    invader.alive = false;
                    this.addScore(invader.score);
                    this.effects.push({
                        type: "explosion",
                        x: rect.x + Math.floor(rect.width / 2) - 3,
                        y: rect.y + 1,
                        ttl: 230,
                        color: colors.explosion
                    });
                    this.playerShot = null;
                    this.sound.invaderHit();

                    if (this.aliveCount() === 0) {
                        this.state = "WAVE_CLEAR";
                        this.stateTimer = 1200;
                    }
                    return;
                }
            }
        }

        checkEnemyShotCollisions() {
            this.enemyShots = this.enemyShots.filter((shot) => {
                if (this.damageShieldForShot(shot, false)) return false;

                const shotRect = { x: shot.x, y: shot.y, width: shot.width, height: shot.height };
                if (rectsOverlap(shotRect, this.player)) {
                    this.hitPlayer();
                    return false;
                }

                return true;
            });
        }

        checkInvasionLine() {
            const bounds = this.fleetBounds();
            if (!bounds) return;

            if (bounds.bottom >= PLAYER_Y - 2) {
                this.lives = 0;
                this.hitPlayer();
            }
        }

        damageShieldForShot(shot, fromPlayer) {
            const rect = fromPlayer ? this.playerShotRect() : { x: shot.x, y: shot.y, width: shot.width, height: shot.height };

            for (const shield of this.shields) {
                const startX = Math.floor(rect.x - shield.x);
                const endX = Math.floor(rect.x + rect.width - shield.x);
                const startY = Math.floor(rect.y - shield.y);
                const endY = Math.floor(rect.y + rect.height - shield.y);

                for (let y = startY; y <= endY; y += 1) {
                    for (let x = startX; x <= endX; x += 1) {
                        if (this.shieldCellActive(shield, x, y)) {
                            this.carveShield(shield, x, y, fromPlayer ? 3 : 4);
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        shieldCellActive(shield, x, y) {
            return y >= 0 && y < shield.height && x >= 0 && x < shield.width && shield.grid[y][x];
        }

        carveShield(shield, centerX, centerY, radius) {
            for (let y = centerY - radius; y <= centerY + radius; y += 1) {
                for (let x = centerX - radius; x <= centerX + radius; x += 1) {
                    const distance = Math.hypot(x - centerX, y - centerY);
                    if (distance <= radius + Math.random() * 0.8 && this.shieldCellActive(shield, x, y)) {
                        shield.grid[y][x] = false;
                    }
                }
            }
        }

        hitPlayer() {
            if (this.state !== "PLAYING") return;

            this.lives -= 1;
            this.effects.push({
                type: "playerExplosion",
                x: this.player.x,
                y: this.player.y - 1,
                ttl: 1200,
                color: colors.white
            });
            this.sound.playerHit();
            this.state = "PLAYER_EXPLODING";
            this.stateTimer = 1350;
            this.playerShot = null;
        }

        endGame() {
            this.state = "GAME_OVER";
            this.highScore = Math.max(this.highScore, this.score);
            this.saveHighScore();
            this.finalScore.textContent = formatScore(this.score);
            this.gameOverScreen.classList.remove("hidden");
            this.gameOverScreen.classList.add("active");
        }

        addScore(points) {
            this.score += points;
            if (this.score > this.highScore) {
                this.highScore = this.score;
            }
        }

        saucerValue() {
            const sequence = [100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 50, 150, 50, 300];
            const index = (Math.floor(this.score / 10) + this.wave) % sequence.length;
            return sequence[index];
        }

        updateEffects(delta) {
            this.effects = this.effects
                .map((effect) => ({ ...effect, ttl: effect.ttl - delta, y: effect.type === "text" ? effect.y - delta * 0.008 : effect.y }))
                .filter((effect) => effect.ttl > 0);
        }

        aliveCount() {
            return this.invaders.reduce((count, invader) => count + (invader.alive ? 1 : 0), 0);
        }

        invaderSprite(invader) {
            return sprite[invader.kind][this.animFrame];
        }

        invaderRect(invader) {
            const frame = this.invaderSprite(invader);
            const width = frame[0].length;
            const height = frame.length;
            const x = this.formationX + invader.col * FLEET_COL_GAP + Math.floor((FLEET_COL_GAP - width) / 2);
            const y = this.formationY + invader.row * FLEET_ROW_GAP;

            return { x, y, width, height };
        }

        spriteHit(invader, shotX, shotY) {
            const frame = this.invaderSprite(invader);
            const rect = this.invaderRect(invader);
            const localX = Math.floor(shotX - rect.x);
            const localY = Math.floor(shotY - rect.y);

            if (localY >= 0 && localY < frame.length && localX >= 0 && localX < frame[localY].length) {
                return frame[localY][localX] === "#";
            }

            return true;
        }

        playerShotRect() {
            if (!this.playerShot) return { x: 0, y: 0, width: 0, height: 0 };
            return {
                x: this.playerShot.x,
                y: this.playerShot.y,
                width: this.playerShot.width,
                height: this.playerShot.height
            };
        }

        bottomInvadersByColumn() {
            const shooters = [];

            for (let col = 0; col < 11; col += 1) {
                const candidates = this.invaders.filter((invader) => invader.alive && invader.col === col);
                if (candidates.length === 0) continue;
                shooters.push(candidates.reduce((bottom, invader) => (invader.row > bottom.row ? invader : bottom), candidates[0]));
            }

            return shooters;
        }

        fleetBounds() {
            let left = Infinity;
            let right = -Infinity;
            let bottom = -Infinity;

            this.invaders.forEach((invader) => {
                if (!invader.alive) return;
                const rect = this.invaderRect(invader);
                left = Math.min(left, rect.x);
                right = Math.max(right, rect.x + rect.width);
                bottom = Math.max(bottom, rect.y + rect.height);
            });

            if (left === Infinity) return null;
            return { left, right, bottom };
        }

        draw() {
            const ctx = this.ctx;
            ctx.fillStyle = colors.black;
            ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

            this.drawHud();
            this.drawSaucer();
            this.drawInvaders();
            this.drawShields();
            this.drawShots();
            this.drawPlayer();
            this.drawEffects();
            this.drawBottomHud();

            if (this.state === "WAVE_CLEAR") {
                this.drawCenteredText(`WAVE ${this.wave + 1}`, 120, colors.white);
            }

            this.syncStats();
        }

        syncStats() {
            this.canvas.dataset.state = this.state;
            this.canvas.dataset.score = String(this.score);
            this.canvas.dataset.highScore = String(this.highScore);
            this.canvas.dataset.lives = String(this.lives);
            this.canvas.dataset.wave = String(this.wave);
            this.canvas.dataset.alive = String(this.aliveCount());
            this.canvas.dataset.shields = String(this.shields.length);
            this.canvas.dataset.playerShot = String(Boolean(this.playerShot));
            this.canvas.dataset.enemyShots = String(this.enemyShots.length);
            this.canvas.dataset.saucer = String(Boolean(this.saucer));
        }

        drawHud() {
            drawText(this.ctx, "SCORE<1>", 5, 4, 7, colors.white, "left");
            drawText(this.ctx, "HI-SCORE", VIEW_WIDTH / 2, 4, 7, colors.white, "center");
            drawText(this.ctx, "SCORE<2>", VIEW_WIDTH - 5, 4, 7, colors.white, "right");
            drawText(this.ctx, formatScore(this.score), 12, 14, 8, colors.white, "left");
            drawText(this.ctx, formatScore(this.highScore), VIEW_WIDTH / 2, 14, 8, colors.white, "center");
            drawText(this.ctx, "0000", VIEW_WIDTH - 16, 14, 8, colors.white, "right");
        }

        drawBottomHud() {
            const ctx = this.ctx;
            ctx.fillStyle = colors.shield;
            ctx.shadowColor = colors.shield;
            ctx.shadowBlur = 4;
            ctx.fillRect(0, 238, VIEW_WIDTH, 1);
            ctx.shadowBlur = 0;

            drawText(ctx, String(Math.max(0, this.lives)), 7, 242, 8, colors.white, "left");

            for (let index = 0; index < Math.max(0, this.lives - 1); index += 1) {
                drawSprite(ctx, sprite.player, 24 + index * 16, 242, colors.player, 2);
            }

            drawText(ctx, "CREDIT 00", VIEW_WIDTH - 6, 242, 7, colors.white, "right");
        }

        drawInvaders() {
            this.invaders.forEach((invader) => {
                if (!invader.alive) return;
                const frame = this.invaderSprite(invader);
                const rect = this.invaderRect(invader);
                drawSprite(this.ctx, frame, rect.x, rect.y, invader.color, 5);
            });
        }

        drawSaucer() {
            if (!this.saucer) return;
            drawSprite(this.ctx, sprite.saucer, this.saucer.x, this.saucer.y, colors.saucer, 5);
        }

        drawShields() {
            const ctx = this.ctx;
            ctx.fillStyle = colors.shield;
            ctx.shadowColor = colors.shield;
            ctx.shadowBlur = 2;

            this.shields.forEach((shield) => {
                for (let y = 0; y < shield.height; y += 1) {
                    for (let x = 0; x < shield.width; x += 1) {
                        if (shield.grid[y][x]) ctx.fillRect(shield.x + x, shield.y + y, 1, 1);
                    }
                }
            });

            ctx.shadowBlur = 0;
        }

        drawShots() {
            const ctx = this.ctx;

            if (this.playerShot) {
                ctx.fillStyle = colors.shot;
                ctx.shadowColor = colors.shot;
                ctx.shadowBlur = 4;
                ctx.fillRect(this.playerShot.x, this.playerShot.y, 1, this.playerShot.height);
                ctx.shadowBlur = 0;
            }

            this.enemyShots.forEach((shot) => {
                const frames = sprite.missiles[shot.type];
                const offset = Math.floor(shot.frame / 90) % 2;
                const frame = frames.map((line, index) => (offset && index % 2 ? reverseString(line) : line));
                drawSprite(ctx, frame, shot.x, shot.y, colors.enemyShot, 3);
            });
        }

        drawPlayer() {
            if (this.state === "PLAYER_EXPLODING") return;
            if (this.state === "MENU") {
                drawSprite(this.ctx, sprite.player, this.player.x, this.player.y, colors.player, 2);
                return;
            }
            if (this.state !== "GAME_OVER") {
                drawSprite(this.ctx, sprite.player, this.player.x, this.player.y, colors.player, 2);
            }
        }

        drawEffects() {
            this.effects.forEach((effect) => {
                if (effect.type === "explosion") {
                    drawSprite(this.ctx, sprite.explosion, effect.x, effect.y, effect.color, 5);
                } else if (effect.type === "playerExplosion") {
                    drawSprite(this.ctx, sprite.playerExplosion, effect.x, effect.y, effect.color, 5);
                } else if (effect.type === "text") {
                    drawText(this.ctx, effect.text, effect.x, effect.y, 8, effect.color, "left");
                }
            });
        }

        drawCenteredText(text, y, color) {
            drawText(this.ctx, text, VIEW_WIDTH / 2, y, 9, color, "center");
        }
    }

    function drawSprite(ctx, pattern, x, y, color, glow = 0) {
        const px = Math.round(x);
        const py = Math.round(y);

        ctx.save();
        ctx.fillStyle = color;
        if (glow) {
            ctx.shadowColor = color;
            ctx.shadowBlur = glow;
        }

        for (let row = 0; row < pattern.length; row += 1) {
            for (let col = 0; col < pattern[row].length; col += 1) {
                if (pattern[row][col] === "#") {
                    ctx.fillRect(px + col, py + row, 1, 1);
                }
            }
        }

        ctx.restore();
    }

    function drawText(ctx, text, x, y, size, color, align = "left") {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `${size}px "Courier New", monospace`;
        ctx.textAlign = align;
        ctx.textBaseline = "top";
        ctx.shadowColor = color;
        ctx.shadowBlur = 2;
        ctx.fillText(text, Math.round(x), Math.round(y));
        ctx.restore();
    }

    function rectsOverlap(first, second) {
        return (
            first.x < second.x + second.width &&
            first.x + first.width > second.x &&
            first.y < second.y + second.height &&
            first.y + first.height > second.y
        );
    }

    function formatScore(score) {
        return String(Math.max(0, Math.floor(score))).padStart(4, "0");
    }

    function reverseString(value) {
        return value.split("").reverse().join("");
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    window.addEventListener("load", () => {
        window.neonInvaders = new NeonInvaders();
    });
})();
