(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const TAU = Math.PI * 2;
  const STORAGE_KEY = 'tomlabs-asteroids-high-score';
  const GLOW = '#effffa';
  const DIM = '#8ca29b';

  const ui = {
    startScreen: document.querySelector('#startScreen'),
    messageScreen: document.querySelector('#messageScreen'),
    pauseScreen: document.querySelector('#pauseScreen'),
    messageTitle: document.querySelector('#messageTitle'),
    messageScore: document.querySelector('#messageScore'),
    startButton: document.querySelector('#startButton'),
    restartButton: document.querySelector('#restartButton'),
    soundButton: document.querySelector('#soundButton'),
    status: document.querySelector('#gameStatus'),
  };

  const input = { left: false, right: false, thrust: false, fire: false };
  const game = {
    mode: 'title', score: 0, highScore: Number(localStorage.getItem(STORAGE_KEY) || 0),
    lives: 3, wave: 1, bonusAt: 10000, elapsed: 0, waveTimer: 0, respawnTimer: 0,
    shake: 0, flash: 0, beatTimer: 0, beatSide: 0, hyperTimer: 0,
  };

  let ship;
  let rocks = [];
  let bullets = [];
  let saucerBullets = [];
  let fragments = [];
  let saucer = null;
  let saucerTimer = 13;
  let lastTime = performance.now();
  let muted = false;

  const random = (min, max) => min + Math.random() * (max - min);
  const wrapValue = (value, max, margin = 0) => {
    if (value < -margin) return max + margin;
    if (value > max + margin) return -margin;
    return value;
  };

  function torusDistance(a, b) {
    const dx = Math.min(Math.abs(a.x - b.x), W - Math.abs(a.x - b.x));
    const dy = Math.min(Math.abs(a.y - b.y), H - Math.abs(a.y - b.y));
    return Math.hypot(dx, dy);
  }

  class AudioBoard {
    constructor() {
      this.context = null;
      this.thrustGain = null;
      this.thrustSource = null;
      this.saucerGain = null;
      this.saucerOsc = null;
    }

    unlock() {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.createThrustNoise();
      }
      if (this.context.state === 'suspended') this.context.resume();
    }

    tone(frequency, duration, volume = .05, type = 'square', endFrequency = frequency) {
      if (muted || !this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }

    noise(duration, volume = .08, lowpass = 1200) {
      if (muted || !this.context) return;
      const count = Math.floor(this.context.sampleRate * duration);
      const buffer = this.context.createBuffer(1, count, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) data[i] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(this.context.destination);
      source.start();
    }

    createThrustNoise() {
      const length = this.context.sampleRate * 2;
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = last * .72 + (Math.random() * 2 - 1) * .28;
        data[i] = last;
      }
      this.thrustSource = this.context.createBufferSource();
      this.thrustGain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.thrustGain.gain.value = 0;
      this.thrustSource.buffer = buffer;
      this.thrustSource.loop = true;
      this.thrustSource.connect(filter).connect(this.thrustGain).connect(this.context.destination);
      this.thrustSource.start();
    }

    thrust(active) {
      if (!this.context || !this.thrustGain) return;
      const level = active && !muted ? .09 : .0001;
      this.thrustGain.gain.setTargetAtTime(level, this.context.currentTime, .025);
    }

    fire() { this.tone(950, .085, .045, 'square', 160); }
    beat(low) { this.tone(low ? 54 : 72, .085, .07, 'sine'); }
    smallExplosion() { this.noise(.15, .07, 1500); }
    largeExplosion() { this.noise(.42, .12, 700); this.tone(95, .35, .045, 'sawtooth', 38); }
    extraLife() { this.tone(440, .09, .06); setTimeout(() => this.tone(660, .14, .06), 100); }

    startSaucer(small) {
      if (muted || !this.context || this.saucerOsc) return;
      this.saucerOsc = this.context.createOscillator();
      this.saucerGain = this.context.createGain();
      this.saucerOsc.type = 'square';
      this.saucerOsc.frequency.value = small ? 220 : 145;
      this.saucerGain.gain.value = .026;
      this.saucerOsc.connect(this.saucerGain).connect(this.context.destination);
      this.saucerOsc.start();
    }

    stopSaucer() {
      if (!this.saucerOsc) return;
      this.saucerGain.gain.setTargetAtTime(.0001, this.context.currentTime, .015);
      this.saucerOsc.stop(this.context.currentTime + .08);
      this.saucerOsc = null;
      this.saucerGain = null;
    }
  }

  const audio = new AudioBoard();

  function makeShip() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 13, invulnerable: 2.2, visible: true, fireCooldown: 0 };
  }

  function makeRock(size, x, y, inheritedVelocity = null) {
    const radius = size === 3 ? 48 : size === 2 ? 28 : 15;
    let rx = x;
    let ry = y;
    if (rx === undefined) {
      const edge = Math.floor(random(0, 4));
      rx = edge % 2 === 0 ? random(0, W) : edge === 1 ? W + radius : -radius;
      ry = edge % 2 === 1 ? random(90, H - 30) : edge === 0 ? -radius : H + radius;
    }
    const direction = random(0, TAU);
    const baseSpeed = { 3: 42, 2: 68, 1: 104 }[size] + game.wave * 2.5;
    const vx = inheritedVelocity ? inheritedVelocity.vx + Math.cos(direction) * baseSpeed : Math.cos(direction) * random(baseSpeed * .75, baseSpeed * 1.25);
    const vy = inheritedVelocity ? inheritedVelocity.vy + Math.sin(direction) * baseSpeed : Math.sin(direction) * random(baseSpeed * .75, baseSpeed * 1.25);
    const vertices = 10 + Math.floor(random(0, 3));
    const shape = Array.from({ length: vertices }, (_, index) => {
      const notch = index === Math.floor(vertices * random(.2, .8));
      return notch ? random(.5, .68) : random(.78, 1.12);
    });
    return { x: rx, y: ry, vx, vy, angle: random(0, TAU), spin: random(-.65, .65), radius, size, shape };
  }

  function createWave() {
    const count = Math.min(4 + (game.wave - 1) * 2, 12);
    rocks = [];
    for (let i = 0; i < count; i++) {
      let rock;
      do rock = makeRock(3); while (torusDistance(rock, { x: W / 2, y: H / 2 }) < 170);
      rocks.push(rock);
    }
    bullets = [];
    saucerBullets = [];
    saucer = null;
    audio.stopSaucer();
    saucerTimer = random(12, 19);
    game.beatTimer = .5;
    game.mode = 'playing';
    ship = makeShip();
    ui.status.textContent = `Wave ${game.wave}`;
  }

  function startGame() {
    audio.unlock();
    game.score = 0;
    game.lives = 3;
    game.wave = 1;
    game.bonusAt = 10000;
    game.elapsed = 0;
    fragments = [];
    ui.startScreen.classList.add('overlay--hidden');
    ui.messageScreen.classList.add('overlay--hidden');
    ui.pauseScreen.classList.add('overlay--hidden');
    createWave();
  }

  function setScore(points) {
    game.score += points;
    if (game.score > game.highScore) {
      game.highScore = game.score;
      localStorage.setItem(STORAGE_KEY, String(game.highScore));
    }
    if (game.score >= game.bonusAt) {
      game.lives++;
      game.bonusAt += 10000;
      audio.extraLife();
      ui.status.textContent = 'Bonus ship';
    }
  }

  function fire() {
    if (game.mode !== 'playing' || !ship.visible || ship.fireCooldown > 0 || bullets.length >= 4) return;
    const speed = 520;
    bullets.push({
      x: ship.x + Math.cos(ship.angle) * 19,
      y: ship.y + Math.sin(ship.angle) * 19,
      vx: ship.vx + Math.cos(ship.angle) * speed,
      vy: ship.vy + Math.sin(ship.angle) * speed,
      radius: 2.5,
      life: 1.05,
    });
    ship.fireCooldown = .18;
    audio.fire();
  }

  function hyperspace() {
    if (game.mode !== 'playing' || !ship.visible || game.hyperTimer > 0) return;
    ship.visible = false;
    ship.vx *= .35;
    ship.vy *= .35;
    game.hyperTimer = .42;
    audio.tone(380, .24, .045, 'sine', 70);
  }

  function finishHyperspace() {
    ship.x = random(80, W - 80);
    ship.y = random(100, H - 70);
    ship.visible = true;
    const failed = Math.random() < .12 || rocks.some(rock => torusDistance(ship, rock) < rock.radius + ship.radius);
    ship.invulnerable = failed ? 0 : .35;
    if (failed) destroyShip();
  }

  function addFragments(x, y, count, speed, life = .55) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, TAU);
      const velocity = random(speed * .3, speed);
      fragments.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, angle, spin: random(-5, 5), length: random(3, 12), life: random(life * .6, life), maxLife: life });
    }
  }

  function breakRock(index) {
    const rock = rocks[index];
    const points = rock.size === 3 ? 20 : rock.size === 2 ? 50 : 100;
    setScore(points);
    addFragments(rock.x, rock.y, 8 + rock.size * 3, 80 + rock.size * 25);
    audio.smallExplosion();
    rocks.splice(index, 1);
    if (rock.size > 1) {
      rocks.push(makeRock(rock.size - 1, rock.x, rock.y, rock));
      rocks.push(makeRock(rock.size - 1, rock.x, rock.y, rock));
    }
    game.shake = Math.max(game.shake, rock.size * 1.8);
  }

  function destroyShip() {
    if (!ship.visible || ship.invulnerable > 0 || game.mode !== 'playing') return;
    ship.visible = false;
    game.lives--;
    game.mode = 'respawning';
    game.respawnTimer = 2;
    game.shake = 9;
    addFragments(ship.x, ship.y, 22, 210, 1.1);
    audio.thrust(false);
    audio.largeExplosion();
    ui.status.textContent = game.lives > 0 ? 'Ship destroyed' : 'Game over';
  }

  function endGame() {
    game.mode = 'gameover';
    audio.stopSaucer();
    audio.thrust(false);
    ui.messageTitle.textContent = 'GAME OVER';
    ui.messageScore.textContent = String(game.score).padStart(5, '0');
    ui.messageScreen.classList.remove('overlay--hidden');
  }

  function respawn() {
    if (game.lives <= 0) return endGame();
    const center = { x: W / 2, y: H / 2 };
    const blocked = rocks.some(rock => torusDistance(center, rock) < rock.radius + 90) || (saucer && torusDistance(center, saucer) < 100);
    if (blocked && game.respawnTimer > -2.5) return;
    ship = makeShip();
    game.mode = 'playing';
    saucerBullets = [];
  }

  function spawnSaucer() {
    const small = game.score >= 10000 || game.wave >= 4;
    const fromLeft = Math.random() < .5;
    saucer = {
      x: fromLeft ? -36 : W + 36, y: random(135, H - 150), vx: fromLeft ? 95 : -95,
      vy: [-42, 0, 42][Math.floor(random(0, 3))], radius: small ? 14 : 24, small,
      fireTimer: small ? .8 : 1.25, directionTimer: random(1.2, 2.4),
    };
    audio.startSaucer(small);
  }

  function fireSaucer() {
    if (!saucer || saucerBullets.length >= 3) return;
    let angle;
    if (saucer.small) {
      angle = Math.atan2(ship.y - saucer.y, ship.x - saucer.x) + random(-.12, .12);
    } else {
      angle = random(0, TAU);
    }
    saucerBullets.push({ x: saucer.x, y: saucer.y, vx: Math.cos(angle) * 300, vy: Math.sin(angle) * 300, radius: 2.5, life: 1.65 });
    audio.fire();
  }

  function destroySaucer() {
    setScore(saucer.small ? 1000 : 200);
    addFragments(saucer.x, saucer.y, 18, 180, .8);
    audio.stopSaucer();
    audio.largeExplosion();
    saucer = null;
    saucerTimer = random(14, 22);
  }

  function updateEntity(entity, dt, margin = 0) {
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;
    entity.x = wrapValue(entity.x, W, margin);
    entity.y = wrapValue(entity.y, H, margin);
  }

  function update(dt) {
    game.elapsed += dt;
    game.shake = Math.max(0, game.shake - dt * 25);
    game.flash = Math.max(0, game.flash - dt * 4);

    fragments.forEach(fragment => {
      updateEntity(fragment, dt, 12);
      fragment.angle += fragment.spin * dt;
      fragment.life -= dt;
    });
    fragments = fragments.filter(fragment => fragment.life > 0);

    if (game.mode === 'paused' || game.mode === 'title' || game.mode === 'gameover') return;

    if (game.mode === 'waveclear') {
      game.waveTimer -= dt;
      if (game.waveTimer <= 0) { game.wave++; createWave(); }
      return;
    }

    if (game.mode === 'respawning') {
      game.respawnTimer -= dt;
      rocks.forEach(rock => { updateEntity(rock, dt, rock.radius); rock.angle += rock.spin * dt; });
      updateSaucer(dt);
      if (game.respawnTimer <= 0) respawn();
      return;
    }

    if (game.hyperTimer > 0) {
      game.hyperTimer -= dt;
      if (game.hyperTimer <= 0) finishHyperspace();
    }

    const turning = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    ship.angle += turning * 4.15 * dt;
    const thrusting = input.thrust && ship.visible;
    if (thrusting) {
      ship.vx += Math.cos(ship.angle) * 205 * dt;
      ship.vy += Math.sin(ship.angle) * 205 * dt;
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > 410) { ship.vx *= 410 / speed; ship.vy *= 410 / speed; }
      if (Math.random() < .7) addFragments(ship.x - Math.cos(ship.angle) * 13, ship.y - Math.sin(ship.angle) * 13, 1, 65, .24);
    }
    audio.thrust(thrusting);
    if (input.fire) fire();
    ship.vx *= Math.pow(.997, dt * 60);
    ship.vy *= Math.pow(.997, dt * 60);
    updateEntity(ship, dt, ship.radius);
    ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
    ship.invulnerable = Math.max(0, ship.invulnerable - dt);

    bullets.forEach(bullet => { updateEntity(bullet, dt, 3); bullet.life -= dt; });
    saucerBullets.forEach(bullet => { updateEntity(bullet, dt, 3); bullet.life -= dt; });
    bullets = bullets.filter(bullet => bullet.life > 0);
    saucerBullets = saucerBullets.filter(bullet => bullet.life > 0);
    rocks.forEach(rock => { updateEntity(rock, dt, rock.radius); rock.angle += rock.spin * dt; });

    updateSaucer(dt);
    resolveCollisions();
    updateBeat(dt);

    if (!rocks.length && !saucer && game.mode === 'playing') {
      game.mode = 'waveclear';
      game.waveTimer = 1.15;
      bullets = [];
      saucerBullets = [];
    }
  }

  function updateSaucer(dt) {
    if (!saucer) {
      saucerTimer -= dt;
      if (saucerTimer <= 0 && rocks.length) spawnSaucer();
      return;
    }
    saucer.x += saucer.vx * dt;
    saucer.y += saucer.vy * dt;
    saucer.y = Math.max(110, Math.min(H - 95, saucer.y));
    saucer.directionTimer -= dt;
    saucer.fireTimer -= dt;
    if (saucer.directionTimer <= 0) {
      saucer.vy = [-44, 0, 44][Math.floor(random(0, 3))];
      saucer.directionTimer = random(1.2, 2.4);
    }
    if (saucer.fireTimer <= 0) {
      fireSaucer();
      saucer.fireTimer = saucer.small ? random(.62, .9) : random(1.05, 1.4);
    }
    if (saucer.x < -70 || saucer.x > W + 70) {
      audio.stopSaucer();
      saucer = null;
      saucerTimer = random(12, 20);
    }
  }

  function updateBeat(dt) {
    const initialTargets = Math.min(4 + (game.wave - 1) * 2, 12) * 7;
    const remaining = rocks.reduce((total, rock) => total + (rock.size === 3 ? 7 : rock.size === 2 ? 3 : 1), 0);
    const pressure = 1 - Math.min(1, remaining / initialTargets);
    const interval = .82 - pressure * .58;
    game.beatTimer -= dt;
    if (game.beatTimer <= 0) {
      audio.beat(game.beatSide === 0);
      game.beatSide = 1 - game.beatSide;
      game.beatTimer = interval;
    }
  }

  function resolveCollisions() {
    for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
      const bullet = bullets[bulletIndex];
      let hit = false;
      for (let rockIndex = rocks.length - 1; rockIndex >= 0; rockIndex--) {
        if (torusDistance(bullet, rocks[rockIndex]) < rocks[rockIndex].radius + bullet.radius) {
          bullets.splice(bulletIndex, 1);
          breakRock(rockIndex);
          hit = true;
          break;
        }
      }
      if (!hit && saucer && torusDistance(bullet, saucer) < saucer.radius + bullet.radius) {
        bullets.splice(bulletIndex, 1);
        destroySaucer();
      }
    }

    if (ship.visible && ship.invulnerable <= 0) {
      if (rocks.some(rock => torusDistance(ship, rock) < rock.radius * .78 + ship.radius)) destroyShip();
      if (saucer && torusDistance(ship, saucer) < saucer.radius + ship.radius) {
        destroySaucer();
        destroyShip();
      }
      for (let i = saucerBullets.length - 1; i >= 0; i--) {
        if (torusDistance(ship, saucerBullets[i]) < ship.radius + saucerBullets[i].radius) {
          saucerBullets.splice(i, 1);
          destroyShip();
          break;
        }
      }
    }

    if (saucer) {
      for (let rockIndex = rocks.length - 1; rockIndex >= 0; rockIndex--) {
        if (torusDistance(saucer, rocks[rockIndex]) < saucer.radius + rocks[rockIndex].radius * .8) {
          breakRock(rockIndex);
          destroySaucer();
          break;
        }
      }
    }
  }

  function linePath(points, close = true) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (close) ctx.closePath();
    ctx.stroke();
  }

  function drawShip() {
    if (!ship.visible || (ship.invulnerable > 0 && Math.floor(game.elapsed * 14) % 2 === 0)) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    linePath([[19, 0], [-13, -11], [-7, 0], [-13, 11]]);
    if (input.thrust && game.mode === 'playing' && Math.floor(game.elapsed * 24) % 2) {
      linePath([[-9, -6], [-22 - random(0, 7), 0], [-9, 6]], false);
    }
    ctx.restore();
  }

  function drawRock(rock) {
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.angle);
    ctx.beginPath();
    rock.shape.forEach((scale, index) => {
      const angle = index / rock.shape.length * TAU;
      const x = Math.cos(angle) * rock.radius * scale;
      const y = Math.sin(angle) * rock.radius * scale;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawSaucer() {
    if (!saucer) return;
    const r = saucer.radius;
    ctx.save();
    ctx.translate(saucer.x, saucer.y);
    linePath([[-r, 0], [-r * .58, -r * .28], [r * .58, -r * .28], [r, 0], [r * .55, r * .25], [-r * .55, r * .25]]);
    linePath([[-r * .42, -r * .28], [-r * .2, -r * .55], [r * .2, -r * .55], [r * .42, -r * .28]], false);
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.restore();
  }

  function drawHud() {
    ctx.save();
    ctx.shadowBlur = 7;
    ctx.shadowColor = GLOW;
    ctx.fillStyle = GLOW;
    ctx.font = '28px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(String(game.score).padStart(5, '0'), 72, 54);
    ctx.textAlign = 'center';
    ctx.fillStyle = DIM;
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText('HIGH SCORE', W / 2, 27);
    ctx.fillStyle = GLOW;
    ctx.font = '24px "Courier New", monospace';
    ctx.fillText(String(game.highScore).padStart(5, '0'), W / 2, 54);
    ctx.textAlign = 'right';
    ctx.font = '15px "Courier New", monospace';
    ctx.fillText(`WAVE ${game.wave}`, W - 72, 51);
    ctx.restore();

    for (let i = 0; i < Math.max(0, game.lives - 1); i++) {
      ctx.save();
      ctx.translate(81 + i * 25, 78);
      ctx.rotate(-Math.PI / 2);
      ctx.scale(.58, .58);
      linePath([[19, 0], [-13, -11], [-7, 0], [-13, 11]]);
      ctx.restore();
    }
  }

  function draw() {
    ctx.fillStyle = '#020304';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (game.shake > 0) ctx.translate(random(-game.shake, game.shake), random(-game.shake, game.shake));
    ctx.strokeStyle = GLOW;
    ctx.fillStyle = GLOW;
    ctx.lineWidth = 1.65;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(220,255,244,.72)';
    drawHud();
    rocks.forEach(drawRock);
    drawSaucer();
    drawShip();

    for (const bullet of [...bullets, ...saucerBullets]) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      ctx.fill();
    }
    for (const fragment of fragments) {
      ctx.globalAlpha = Math.max(0, fragment.life / fragment.maxLife);
      ctx.save();
      ctx.translate(fragment.x, fragment.y);
      ctx.rotate(fragment.angle);
      ctx.beginPath();
      ctx.moveTo(-fragment.length / 2, 0);
      ctx.lineTo(fragment.length / 2, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (game.flash > 0) {
      ctx.globalAlpha = game.flash;
      ctx.fillStyle = GLOW;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  function togglePause() {
    if (game.mode === 'playing') {
      game.mode = 'paused';
      input.left = input.right = input.thrust = input.fire = false;
      audio.thrust(false);
      audio.stopSaucer();
      ui.pauseScreen.classList.remove('overlay--hidden');
    } else if (game.mode === 'paused') {
      game.mode = 'playing';
      if (saucer) audio.startSaucer(saucer.small);
      ui.pauseScreen.classList.add('overlay--hidden');
      lastTime = performance.now();
    }
  }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .033);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function setInput(action, active, button) {
    if (action === 'hyper') {
      if (active) hyperspace();
      return;
    }
    input[action] = active;
    if (button) button.classList.toggle('is-held', active);
  }

  function bindHold(id, action) {
    const button = document.querySelector(id);
    button.addEventListener('pointerdown', event => { event.preventDefault(); audio.unlock(); setInput(action, true, button); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => button.addEventListener(type, event => { event.preventDefault(); setInput(action, false, button); }));
  }

  const keyMap = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'thrust', KeyW: 'thrust', Space: 'fire', KeyH: 'hyper',
  };

  window.addEventListener('keydown', event => {
    const action = keyMap[event.code];
    if (action) {
      event.preventDefault();
      audio.unlock();
      if (action === 'hyper') { if (!event.repeat) hyperspace(); }
      else input[action] = true;
    }
    if (event.code === 'Enter' && (game.mode === 'title' || game.mode === 'gameover')) startGame();
    if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) togglePause();
  });

  window.addEventListener('keyup', event => {
    const action = keyMap[event.code];
    if (action && action !== 'hyper') input[action] = false;
  });

  window.addEventListener('blur', () => {
    input.left = input.right = input.thrust = input.fire = false;
    audio.thrust(false);
    if (game.mode === 'playing') togglePause();
  });

  ui.startButton.addEventListener('click', startGame);
  ui.restartButton.addEventListener('click', startGame);
  ui.soundButton.addEventListener('click', () => {
    muted = !muted;
    ui.soundButton.classList.toggle('is-muted', muted);
    ui.soundButton.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    ui.soundButton.title = muted ? 'Enable sound' : 'Mute sound';
    if (muted) { audio.thrust(false); audio.stopSaucer(); }
    else { audio.unlock(); audio.tone(440, .08, .035); if (saucer) audio.startSaucer(saucer.small); }
  });

  bindHold('#leftButton', 'left');
  bindHold('#rightButton', 'right');
  bindHold('#thrustButton', 'thrust');
  bindHold('#fireButton', 'fire');
  bindHold('#hyperButton', 'hyper');

  ship = makeShip();
  for (let i = 0; i < 5; i++) rocks.push(makeRock(3));
  requestAnimationFrame(loop);
})();
