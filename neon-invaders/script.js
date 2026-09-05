(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const ui = {
    score: document.querySelector('#score'),
    highScore: document.querySelector('#highScore'),
    wave: document.querySelector('#wave'),
    lives: document.querySelector('#lives'),
    status: document.querySelector('#statusText'),
    startScreen: document.querySelector('#startScreen'),
    messageScreen: document.querySelector('#messageScreen'),
    pauseScreen: document.querySelector('#pauseScreen'),
    messageKicker: document.querySelector('#messageKicker'),
    messageTitle: document.querySelector('#messageTitle'),
    messageBody: document.querySelector('#messageBody'),
    startButton: document.querySelector('#startButton'),
    restartButton: document.querySelector('#restartButton'),
    pauseButton: document.querySelector('#pauseButton'),
    soundButton: document.querySelector('#soundButton'),
  };

  const W = canvas.width;
  const H = canvas.height;
  const COLORS = { green: '#66ff33', amber: '#ffe600', red: '#ff2bd6', cyan: '#00f5ff', ink: '#f6f3ff' };
  const keys = { left: false, right: false, fire: false };
  const state = {
    mode: 'title', score: 0, highScore: Number(localStorage.getItem('neonInvadersHighScore') || 0),
    wave: 1, lives: 3, elapsed: 0, shake: 0, banner: '', bannerTime: 0,
  };

  let player;
  let aliens = [];
  let shots = [];
  let enemyShots = [];
  let barriers = [];
  let particles = [];
  let stars = [];
  let saucer = null;
  let formation = { direction: 1, speed: 34, stepDown: 26, tick: 0 };
  let lastTime = performance.now();
  let audioContext = null;
  let muted = false;

  class Sound {
    static unlock() {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    }

    static tone(frequency, duration, type = 'square', volume = 0.035, slide = 0) {
      if (muted) return;
      Sound.unlock();
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.linearRampToValueAtTime(Math.max(40, frequency + slide), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }
  }

  function makeStars() {
    stars = Array.from({ length: 95 }, (_, i) => ({
      x: (i * 137.7) % W,
      y: (i * i * 17.3 + 31) % H,
      size: i % 11 === 0 ? 2 : 1,
      speed: 4 + (i % 5) * 2,
      alpha: .16 + (i % 7) * .06,
    }));
  }

  function resetPlayer() {
    player = { x: W / 2 - 23, y: H - 66, w: 46, h: 24, speed: 390, cooldown: 0, invulnerable: 1.5 };
  }

  function createWave() {
    aliens = [];
    const cols = 11;
    const rows = 5;
    const spacingX = 62;
    const spacingY = 47;
    const startX = (W - (cols - 1) * spacingX) / 2;
    const startY = 112;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        aliens.push({
          x: startX + col * spacingX,
          y: startY + row * spacingY,
          w: 38, h: 27, row, col, alive: true, phase: (row + col) % 2,
          points: row === 0 ? 30 : row < 3 ? 20 : 10,
        });
      }
    }
    formation = { direction: 1, speed: Math.min(46 + state.wave * 8, 115), stepDown: 25, tick: 0 };
    shots = [];
    enemyShots = [];
    saucer = null;
    createBarriers();
    resetPlayer();
    state.banner = `WAVE ${String(state.wave).padStart(2, '0')}`;
    state.bannerTime = 1.8;
    ui.status.textContent = 'Formation detected';
    updateUI();
  }

  function createBarriers() {
    barriers = [];
    const patterns = [175, 375, 575, 775];
    for (const baseX of patterns) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 10; col++) {
          const arch = row >= 3 && col >= 3 && col <= 6;
          const cornerCut = row === 0 && (col < 2 || col > 7);
          if (!arch && !cornerCut) barriers.push({ x: baseX + col * 8, y: H - 158 + row * 8, w: 8, h: 8, hp: 2 });
        }
      }
    }
  }

  function startGame() {
    Sound.unlock();
    state.mode = 'playing';
    state.score = 0;
    state.wave = 1;
    state.lives = 3;
    state.elapsed = 0;
    particles = [];
    ui.startScreen.classList.add('overlay--hidden');
    ui.messageScreen.classList.add('overlay--hidden');
    ui.pauseScreen.classList.add('overlay--hidden');
    ui.pauseButton.textContent = 'Pause';
    createWave();
  }

  function togglePause() {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      ui.pauseScreen.classList.remove('overlay--hidden');
      ui.pauseButton.textContent = 'Resume';
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      ui.pauseScreen.classList.add('overlay--hidden');
      ui.pauseButton.textContent = 'Pause';
      lastTime = performance.now();
    }
  }

  function endGame(reason = 'The formation breached the line.') {
    state.mode = 'gameover';
    updateHighScore();
    ui.messageKicker.textContent = 'Signal lost';
    ui.messageTitle.textContent = 'GAME OVER';
    ui.messageBody.textContent = `${reason} Final score: ${formatScore(state.score)}`;
    ui.messageScreen.classList.remove('overlay--hidden');
    ui.status.textContent = 'System offline';
    Sound.tone(160, .7, 'sawtooth', .055, -100);
  }

  function nextWave() {
    if (state.mode !== 'playing') return;
    state.mode = 'transition';
    state.wave++;
    state.score += 500;
    updateUI();
    Sound.tone(440, .12, 'square', .04, 220);
    setTimeout(() => {
      if (state.mode === 'transition') {
        state.mode = 'playing';
        createWave();
      }
    }, 650);
  }

  function formatScore(value) { return Math.floor(value).toString().padStart(6, '0'); }

  function updateHighScore() {
    if (state.score > state.highScore) {
      state.highScore = state.score;
      localStorage.setItem('neonInvadersHighScore', String(state.highScore));
    }
  }

  function updateUI() {
    updateHighScore();
    ui.score.textContent = formatScore(state.score);
    ui.highScore.textContent = formatScore(state.highScore);
    ui.wave.textContent = String(state.wave).padStart(2, '0');
    ui.lives.replaceChildren(...Array.from({ length: state.lives }, () => {
      const icon = document.createElement('span');
      icon.className = 'life-icon';
      return icon;
    }));
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function burst(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + Math.random() * .4;
      const speed = 55 + Math.random() * 150;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .45 + Math.random() * .35, maxLife: .8, color, size: 2 + Math.random() * 3 });
    }
  }

  function shoot() {
    if (player.cooldown > 0 || shots.length >= 2) return;
    shots.push({ x: player.x + player.w / 2 - 2, y: player.y - 11, w: 4, h: 15, speed: 590 });
    player.cooldown = .27;
    Sound.tone(480, .07, 'square', .03, 150);
  }

  function enemyShoot() {
    const columns = new Map();
    for (const alien of aliens) {
      if (!alien.alive) continue;
      const previous = columns.get(alien.col);
      if (!previous || alien.y > previous.y) columns.set(alien.col, alien);
    }
    const shooters = [...columns.values()];
    if (!shooters.length) return;
    const targetBias = shooters.filter(a => Math.abs((a.x + a.w / 2) - (player.x + player.w / 2)) < 130);
    const pool = targetBias.length && Math.random() < .55 ? targetBias : shooters;
    const alien = pool[Math.floor(Math.random() * pool.length)];
    enemyShots.push({ x: alien.x + alien.w / 2 - 2, y: alien.y + alien.h, w: 5, h: 15, speed: 230 + state.wave * 16, phase: Math.random() * 10 });
  }

  function damagePlayer() {
    if (player.invulnerable > 0) return;
    state.lives--;
    state.shake = 9;
    burst(player.x + player.w / 2, player.y + player.h / 2, COLORS.green, 26);
    Sound.tone(120, .45, 'sawtooth', .06, -60);
    updateUI();
    if (state.lives <= 0) {
      endGame('Your hull was destroyed.');
    } else {
      resetPlayer();
      ui.status.textContent = 'Hull damaged';
    }
  }

  function update(dt) {
    state.elapsed += dt;
    state.shake = Math.max(0, state.shake - dt * 28);
    state.bannerTime = Math.max(0, state.bannerTime - dt);
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    for (const star of stars) {
      star.y += star.speed * dt;
      if (star.y > H) star.y = 0;
    }

    const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.x = Math.max(18, Math.min(W - player.w - 18, player.x + move * player.speed * dt));
    if (keys.fire) shoot();

    shots.forEach(s => s.y -= s.speed * dt);
    enemyShots.forEach(s => { s.y += s.speed * dt; s.phase += dt * 18; });
    shots = shots.filter(s => s.y + s.h > 0);
    enemyShots = enemyShots.filter(s => s.y < H + 20);

    updateFormation(dt);
    updateSaucer(dt);
    resolveCollisions();

    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt; p.life -= dt; });
    particles = particles.filter(p => p.life > 0);

    const alive = aliens.filter(a => a.alive).length;
    const shotRate = Math.max(.24, 1.05 - state.wave * .07 - (55 - alive) * .01);
    if (Math.random() < dt / shotRate && enemyShots.length < 3 + Math.floor(state.wave / 2)) enemyShoot();
    if (!alive && state.mode === 'playing') nextWave();
  }

  function updateFormation(dt) {
    const living = aliens.filter(a => a.alive);
    if (!living.length) return;
    const minX = Math.min(...living.map(a => a.x));
    const maxX = Math.max(...living.map(a => a.x + a.w));
    const speedBoost = (55 - living.length) * 1.8;
    const dx = formation.direction * (formation.speed + speedBoost) * dt;
    if ((formation.direction > 0 && maxX + dx > W - 25) || (formation.direction < 0 && minX + dx < 25)) {
      formation.direction *= -1;
      living.forEach(a => a.y += formation.stepDown);
      Sound.tone(75 + (formation.tick % 4) * 15, .045, 'square', .018);
      formation.tick++;
    } else {
      living.forEach(a => a.x += dx);
    }
    if (living.some(a => a.y + a.h >= player.y - 16)) endGame('The formation reached Earth.');
  }

  function updateSaucer(dt) {
    if (!saucer && state.elapsed > 8 && Math.random() < dt / 14) {
      const fromLeft = Math.random() < .5;
      saucer = { x: fromLeft ? -64 : W + 64, y: 65, w: 58, h: 20, vx: fromLeft ? 120 : -120, value: [50, 100, 150, 300][Math.floor(Math.random() * 4)] };
      Sound.tone(220, .3, 'sawtooth', .014, 45);
    }
    if (!saucer) return;
    saucer.x += saucer.vx * dt;
    if (saucer.x < -90 || saucer.x > W + 90) saucer = null;
  }

  function resolveCollisions() {
    for (const shot of shots) {
      if (shot.dead) continue;
      for (const alien of aliens) {
        if (alien.alive && overlaps(shot, alien)) {
          alien.alive = false;
          shot.dead = true;
          state.score += alien.points;
          burst(alien.x + alien.w / 2, alien.y + alien.h / 2, alien.row === 0 ? COLORS.amber : COLORS.green);
          Sound.tone(170 + alien.row * 32, .1, 'square', .04, -55);
          updateUI();
          break;
        }
      }
      if (!shot.dead && saucer && overlaps(shot, saucer)) {
        state.score += saucer.value;
        state.banner = `+${saucer.value}`;
        state.bannerTime = .9;
        burst(saucer.x + saucer.w / 2, saucer.y + 10, COLORS.red, 24);
        shot.dead = true;
        saucer = null;
        Sound.tone(500, .22, 'square', .05, 310);
        updateUI();
      }
    }

    for (const projectile of [...shots, ...enemyShots]) {
      if (projectile.dead) continue;
      for (const block of barriers) {
        if (block.hp > 0 && overlaps(projectile, block)) {
          block.hp--;
          projectile.dead = true;
          burst(projectile.x, projectile.y, COLORS.green, 4);
          break;
        }
      }
    }

    for (const enemyShot of enemyShots) {
      if (!enemyShot.dead && overlaps(enemyShot, player)) {
        enemyShot.dead = true;
        damagePlayer();
      }
    }

    for (const alien of aliens) {
      if (!alien.alive) continue;
      for (const block of barriers) {
        if (block.hp > 0 && overlaps(alien, block)) block.hp = 0;
      }
    }

    shots = shots.filter(s => !s.dead);
    enemyShots = enemyShots.filter(s => !s.dead);
    barriers = barriers.filter(b => b.hp > 0);
  }

  function drawBackground() {
    ctx.fillStyle = '#000006';
    ctx.fillRect(0, 0, W, H);
    for (const star of stars) {
      ctx.globalAlpha = star.alpha + Math.sin(state.elapsed * 1.5 + star.x) * .08;
      ctx.fillStyle = star.size === 2 ? COLORS.red : '#b7faff';
      ctx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,245,255,.32)';
    ctx.beginPath();
    ctx.moveTo(20, H - 32);
    ctx.lineTo(W - 20, H - 32);
    ctx.stroke();
  }

  function drawPlayer() {
    if (!player || (player.invulnerable > 0 && Math.floor(state.elapsed * 14) % 2 === 0)) return;
    ctx.save();
    ctx.translate(Math.round(player.x), Math.round(player.y));
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(0, 17, 46, 7);
    ctx.fillRect(5, 10, 36, 8);
    ctx.fillRect(17, 4, 12, 7);
    ctx.fillRect(21, 0, 4, 5);
    ctx.fillStyle = '#f3ffff';
    ctx.fillRect(20, 7, 6, 5);
    ctx.restore();
  }

  function drawAlien(alien) {
    const x = Math.round(alien.x);
    const y = Math.round(alien.y);
    const frame = (Math.floor(state.elapsed * 4) + alien.phase) % 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = alien.row === 0 ? COLORS.amber : alien.row < 3 ? COLORS.cyan : COLORS.green;
    if (alien.row === 0) {
      ctx.fillRect(9, 0, 20, 5); ctx.fillRect(4, 5, 30, 6); ctx.fillRect(0, 11, 38, 8);
      ctx.fillRect(6, 19, 7, 5); ctx.fillRect(25, 19, 7, 5); ctx.fillStyle = '#020407';
      ctx.fillRect(9, 10, 5, 5); ctx.fillRect(24, 10, 5, 5);
    } else {
      ctx.fillRect(8, 0, 6, 5); ctx.fillRect(24, 0, 6, 5); ctx.fillRect(4, 5, 30, 5);
      ctx.fillRect(0, 10, 38, 11); ctx.fillRect(7, 21, 7, 5); ctx.fillRect(24, 21, 7, 5);
      ctx.fillStyle = '#020407'; ctx.fillRect(9, 11, 5, 5); ctx.fillRect(24, 11, 5, 5);
      ctx.fillStyle = alien.row < 3 ? COLORS.cyan : COLORS.green;
      if (frame) { ctx.fillRect(0, 21, 5, 6); ctx.fillRect(33, 21, 5, 6); }
      else { ctx.fillRect(4, 21, 5, 6); ctx.fillRect(29, 21, 5, 6); }
    }
    ctx.restore();
  }

  function drawSaucer() {
    if (!saucer) return;
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(Math.round(saucer.x + 10), saucer.y, 38, 4);
    ctx.fillRect(Math.round(saucer.x + 4), saucer.y + 4, 50, 6);
    ctx.fillRect(Math.round(saucer.x), saucer.y + 10, 58, 6);
    ctx.fillStyle = COLORS.amber;
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(saucer.x + 7 + i * 14), saucer.y + 16, 5, 4);
  }

  function drawGame() {
    drawBackground();
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - .5) * state.shake, (Math.random() - .5) * state.shake);
    aliens.filter(a => a.alive).forEach(drawAlien);
    drawSaucer();

    for (const block of barriers) {
      ctx.fillStyle = block.hp === 2 ? COLORS.green : '#4e9149';
      ctx.fillRect(block.x, block.y, block.w - 1, block.h - 1);
    }

    ctx.fillStyle = COLORS.amber;
    shots.forEach(s => { ctx.fillRect(s.x, s.y, s.w, s.h); ctx.fillStyle = '#fff5ce'; ctx.fillRect(s.x, s.y, s.w, 5); ctx.fillStyle = COLORS.amber; });
    ctx.fillStyle = COLORS.red;
    enemyShots.forEach(s => {
      const wiggle = Math.sin(s.phase) * 3;
      ctx.fillRect(s.x + wiggle, s.y, s.w, 5);
      ctx.fillRect(s.x - wiggle, s.y + 5, s.w, 5);
      ctx.fillRect(s.x + wiggle, s.y + 10, s.w, 5);
    });

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    drawPlayer();
    ctx.restore();

    if (state.bannerTime > 0) {
      ctx.globalAlpha = Math.min(1, state.bannerTime * 2);
      ctx.fillStyle = COLORS.amber;
      ctx.font = '700 28px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state.banner, W / 2, H / 2);
      ctx.globalAlpha = 1;
    }
  }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .033);
    lastTime = now;
    if (state.mode === 'playing') update(dt);
    else if (state.mode === 'title') {
      state.elapsed += dt;
      stars.forEach(s => { s.y = (s.y + s.speed * dt) % H; });
    }
    drawGame();
    requestAnimationFrame(loop);
  }

  function bindHold(button, key) {
    const press = event => { event.preventDefault(); Sound.unlock(); keys[key] = true; };
    const release = event => { event.preventDefault(); keys[key] = false; };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
  }

  window.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = true;
    if (event.code === 'Space') keys.fire = true;
    if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
    if (event.code === 'Enter' && (state.mode === 'title' || state.mode === 'gameover')) startGame();
  });

  window.addEventListener('keyup', event => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false;
    if (event.code === 'Space') keys.fire = false;
  });

  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.fire = false;
    if (state.mode === 'playing') togglePause();
  });

  ui.startButton.addEventListener('click', startGame);
  ui.restartButton.addEventListener('click', startGame);
  ui.pauseButton.addEventListener('click', togglePause);
  ui.soundButton.addEventListener('click', () => {
    muted = !muted;
    ui.soundButton.classList.toggle('is-muted', muted);
    ui.soundButton.textContent = muted ? '×' : '♪';
    ui.soundButton.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    ui.soundButton.title = muted ? 'Enable sound' : 'Mute sound';
    if (!muted) Sound.tone(440, .08);
  });

  bindHold(document.querySelector('#leftButton'), 'left');
  bindHold(document.querySelector('#rightButton'), 'right');
  bindHold(document.querySelector('#fireButton'), 'fire');

  makeStars();
  resetPlayer();
  createBarriers();
  updateUI();
  requestAnimationFrame(loop);
})();
