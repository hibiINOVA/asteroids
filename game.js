'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Skins ────────────────────────────────────────────────────────────────────
const SKINS = [
  { name: 'CLÁSICO', color: '#e8e8e8', trail: '#ffffff',
    verts: [[20,0],[-12,-9],[-7,0],[-12,9]] },
  { name: 'FURY', color: '#ff3333', trail: '#ff8800',
    verts: [[20,0],[-15,-10],[-7,0],[-15,10]] },
  { name: 'SHADOW', color: '#9944ff', trail: '#cc66ff',
    verts: [[24,0],[-10,-7],[-5,0],[-10,7]] },
  { name: 'NOVA', color: '#00ccff', trail: '#44ddff',
    verts: [[18,0],[0,-8],[-8,-4],[-4,0],[-8,4],[0,8]] },
];

let selectedSkin = 0;
try { selectedSkin = parseInt(localStorage.getItem('asteroidSkin') || '0'); } catch(e) {}
selectedSkin = Math.max(0, Math.min(SKINS.length - 1, selectedSkin));

function saveSkin() {
  try { localStorage.setItem('asteroidSkin', selectedSkin.toString()); } catch(e) {}
}

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle, speed = 520, color = '#fff', isEnemy = false) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.isEnemy = isEnemy;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];
const SPEEDS = [0, 85, 55, 32];
const POINTS = [0, 100, 50, 20];

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Estrella Fugaz ──────────────────────────────────────────────────────────
class ShootingStar {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.radius = 20;
    this.dead = false;
    this.ttl = 4;
    this.maxTtl = 4;

    const speed = rand(160, 200);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-2, 2);
    this.rot = rand(0, Math.PI * 2);

    const n = randInt(6, 10);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.5, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.rotSpeed * dt;
    this.ttl -= dt;
    if (this.ttl <= 0 || this.x < -60 || this.x > W + 60 || this.y < -60 || this.y > H + 60)
      this.dead = true;
  }

  split() { return []; }

  draw() {
    const alpha = Math.min(1, this.ttl / (this.maxTtl * 0.3));
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = `rgba(255,200,0,${alpha.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
    this.speedBoost    = 0;
    this.doubleShot    = 0;
    this.shield        = 0;
    this.shieldHit     = 0;
    this.tripleShot    = 0;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.speedBoost    > 0) this.speedBoost    -= dt;
    if (this.doubleShot    > 0) this.doubleShot    -= dt;
    if (this.shield        > 0) this.shield        -= dt;
    if (this.shieldHit     > 0) this.shieldHit     -= dt;
    if (this.tripleShot    > 0) this.tripleShot    -= dt;

    const ROT   = 3.5;
    const THRUST = this.speedBoost > 0 ? 520 : 260;
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    const bullets = [new Bullet(ox, oy, this.angle)];
    if (this.tripleShot > 0) {
      const SPREAD = 0.12;
      bullets.push(new Bullet(ox, oy, this.angle - SPREAD));
      bullets.push(new Bullet(ox, oy, this.angle + SPREAD));
    } else if (this.doubleShot > 0) {
      const SPREAD = 0.15;
      bullets.push(new Bullet(ox, oy, this.angle - SPREAD));
      bullets.push(new Bullet(ox, oy, this.angle + SPREAD));
    }
    return bullets;
  }

  draw() {
    if (this.dead) return;
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    const skin = SKINS[selectedSkin];

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Shield visual
    if (this.shield > 0) {
      const flash = this.shieldHit > 0;
      const a = flash ? 0.8 : (0.3 + 0.2 * Math.sin(Date.now() * 0.01));
      const c = flash ? '255,255,255' : '0,255,0';
      ctx.strokeStyle = `rgba(${c},${a.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

let strokeColor = skin.color;
    if (this.speedBoost > 0) strokeColor = '#ff0';
    else if (this.tripleShot > 0) strokeColor = '#f80';
    else if (this.doubleShot > 0) strokeColor = '#0ff';
    else if (this.shield > 0) strokeColor = '#0f0';

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Dibuja la forma de la skin
    ctx.beginPath();
    ctx.moveTo(skin.verts[0][0], skin.verts[0][1]);
    for (let i = 1; i < skin.verts.length; i++)
      ctx.lineTo(skin.verts[i][0], skin.verts[i][1]);
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = `rgba(${hexToRgb(skin.trail)},0.85)`;
      ctx.stroke();
    }

    ctx.restore();
  }
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Mini Alien ───────────────────────────────────────────────────────────────
class MiniAlien {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 16;
    this.dead = false;
    this.shootTimer = rand(0.5, 1.5);

    const angle = rand(0, Math.PI * 2);
    const speed = rand(70, 100);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = rand(1.0, 2.0);
      return this.tryShoot();
    }
    return [];
  }

  tryShoot() {
    if (ship.dead) return [];
    const angle = Math.atan2(ship.y - this.y, ship.x - this.x);
    const SPEED = 350;
    return [new Bullet(this.x, this.y, angle, SPEED, '#0f0', true)];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-12, 4);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-4, 10);
    ctx.lineTo(0, 6);
    ctx.lineTo(4, 10);
    ctx.lineTo(6, 0);
    ctx.lineTo(12, 4);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Power Up ─────────────────────────────────────────────────────────────────
const POWERUP_TYPES = ['speed', 'double', 'shield', 'triple'];

class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = 10;
    this.dead = false;
    this.ttl = 10;

    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 50);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.008);
    const colorMap = { speed: '255,255,0', double: '0,255,255', shield: '0,255,0', triple: '255,128,0' };
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = `rgba(${colorMap[this.type]},${pulse.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (this.type === 'speed') {
      ctx.moveTo(-2, -9);
      ctx.lineTo(3, -2);
      ctx.lineTo(-1, -2);
      ctx.lineTo(2, 9);
      ctx.lineTo(-3, 1);
      ctx.lineTo(1, 1);
    } else if (this.type === 'double') {
      ctx.moveTo(-6, -8);
      ctx.lineTo(-2, -8);
      ctx.lineTo(-2, 4);
      ctx.lineTo(-6, 4);
      ctx.moveTo(2, -4);
      ctx.lineTo(6, -4);
      ctx.lineTo(6, 8);
      ctx.lineTo(2, 8);
    } else if (this.type === 'triple') {
      ctx.moveTo(0, -8);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-1, -3);
      ctx.lineTo(-5, 3);
      ctx.moveTo(0, 8);
      ctx.lineTo(4, 3);
      ctx.lineTo(1, 3);
      ctx.lineTo(5, -3);
    } else {
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.moveTo(0, -5);
      ctx.lineTo(0, 5);
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, miniAliens, powerups, shootingStars;
let score, lives, level;
let state;
let deadTimer;
let shootingStarTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  miniAliens = [];
  powerups  = [];
  shootingStars = [];
  shootingStarTimer = rand(10, 15);
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'skins';
}

function startGame() {
  ship.reset();
  bullets   = [];
  asteroids = [];
  particles = [];
  miniAliens = [];
  powerups  = [];
  shootingStars = [];
  shootingStarTimer = rand(10, 15);
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  miniAliens = [];
  powerups  = [];
  shootingStars = [];
  shootingStarTimer = rand(10, 15);
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Pantalla de selección de skins ────────────────────────────────────────────
function drawSkinMenu() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Título
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SELECCIONA TU NAVE', W / 2, 90);

  // Nave grande en preview
  const skin = SKINS[selectedSkin];
  ctx.save();
  ctx.translate(W / 2, 250);
  ctx.scale(2.5, 2.5);
  ctx.strokeStyle = skin.color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(skin.verts[0][0], skin.verts[0][1]);
  for (let i = 1; i < skin.verts.length; i++)
    ctx.lineTo(skin.verts[i][0], skin.verts[i][1]);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Nombre de la skin seleccionada
  ctx.fillStyle = skin.color;
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(skin.name, W / 2, 320);

  // Miniaturas y nombres de todas las skins
  const shipSpacing = 170;
  const startX = W / 2 - (SKINS.length - 1) * shipSpacing / 2;

  SKINS.forEach((s, i) => {
    const x = startX + i * shipSpacing;
    const isSelected = i === selectedSkin;

    // Miniatura de la nave
    ctx.save();
    ctx.translate(x, 380);
    ctx.scale(1.2, 1.2);
    ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = isSelected ? 1.5 : 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s.verts[0][0], s.verts[0][1]);
    for (let j = 1; j < s.verts.length; j++)
      ctx.lineTo(s.verts[j][0], s.verts[j][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Nombre
    ctx.fillStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.5)';
    ctx.font = isSelected ? 'bold 16px monospace' : '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.name, x, 450);

    // Indicador de selección
    if (isSelected) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, 465, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Instrucciones
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('← → CAMBIAR NAVE   ENTER   EMPEZAR', W / 2, 520);
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  // Pantalla de skins
  if (state === 'skins') {
    if (pressed('ArrowLeft') || pressed('ArrowRight')) {
      if (pressed('ArrowLeft')) selectedSkin = (selectedSkin - 1 + SKINS.length) % SKINS.length;
      else selectedSkin = (selectedSkin + 1) % SKINS.length;
      saveSkin();
    }
    if (pressed('Enter')) startGame();
    return;
  }

  if (state === 'gameover') {
    if (pressed('Space')) {
      state = 'skins';
    }
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    miniAliens.forEach(a => {
      const newBullets = a.update(dt);
      bullets.push(...newBullets);
    });
    powerups.forEach(p => p.update(dt));
    shootingStars.forEach(s => s.update(dt));
    miniAliens = miniAliens.filter(a => !a.dead);
    powerups = powerups.filter(p => !p.dead);
    shootingStars = shootingStars.filter(s => !s.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  miniAliens.forEach(a => {
    const newBullets = a.update(dt);
    bullets.push(...newBullets);
  });
  powerups.forEach(p => p.update(dt));
  shootingStars.forEach(s => s.update(dt));

  // Spawn estrella fugaz
  shootingStarTimer -= dt;
  if (shootingStarTimer <= 0) {
    shootingStarTimer = rand(10, 15);
    const side = randInt(0, 3);
    let x, y, angle;
    if (side === 0) { x = -30; y = rand(0, H); angle = rand(-0.4, 0.4); }
    else if (side === 1) { x = W + 30; y = rand(0, H); angle = Math.PI + rand(-0.4, 0.4); }
    else if (side === 2) { x = rand(0, W); y = -30; angle = Math.PI / 2 + rand(-0.4, 0.4); }
    else { x = rand(0, W); y = H + 30; angle = -Math.PI / 2 + rand(-0.4, 0.4); }
    shootingStars.push(new ShootingStar(x, y, angle));
  }

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  miniAliens = miniAliens.filter(a => !a.dead);
  powerups = powerups.filter(p => !p.dead);
  shootingStars = shootingStars.filter(s => !s.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        if (Math.random() < 0.15) {
          miniAliens.push(new MiniAlien(a.x, a.y));
        }
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);

  // Bala vs mini alien
  for (const b of bullets) {
    for (const a of miniAliens) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += 200;
        explode(a.x, a.y, 10);
        const type = POWERUP_TYPES[randInt(0, POWERUP_TYPES.length - 1)];
        powerups.push(new PowerUp(a.x, a.y, type));
      }
    }
  }
  miniAliens = miniAliens.filter(a => !a.dead);
  bullets = bullets.filter(b => !b.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (ship.shield > 0) {
          a.dead = true;
          score += POINTS[a.size];
          explode(a.x, a.y, a.size * 5);
          newAsteroids.push(...a.split());
        } else {
          killShip();
          break;
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);

  // Nave vs mini alien
  if (ship.invincible <= 0) {
    for (const a of miniAliens) {
      if (dist(ship, a) < ship.radius + a.radius) {
        killShip();
        break;
      }
    }
  }

  // Bala enemiga vs nave
  if (ship.invincible <= 0) {
    for (const b of bullets) {
      if (!b.dead && b.isEnemy && dist(b, ship) < ship.radius + b.radius) {
        b.dead = true;
        if (ship.shield > 0) {
          ship.shield -= 1;
          ship.shieldHit = 0.2;
        } else {
          killShip();
          break;
        }
      }
    }
  }

  // Nave vs powerup
  for (const p of powerups) {
    if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      if (p.type === 'speed') ship.speedBoost = 5;
      else if (p.type === 'double') ship.doubleShot = 8;
      else if (p.type === 'shield') ship.shield = 6;
      else if (p.type === 'triple') ship.tripleShot = 5;
    }
  }
  powerups = powerups.filter(p => !p.dead);

  // Bala vs estrella fugaz
  for (const b of bullets) {
    for (const s of shootingStars) {
      if (!s.dead && !b.dead && dist(b, s) < s.radius) {
        b.dead = true;
        s.dead = true;
        score += 300;
        explode(s.x, s.y, 12);
      }
    }
  }
  shootingStars = shootingStars.filter(s => !s.dead);
  bullets = bullets.filter(b => !b.dead);

  // Nave vs estrella fugaz
  if (ship.invincible <= 0) {
    for (const s of shootingStars) {
      if (dist(ship, s) < ship.radius + s.radius) {
        if (ship.shield > 0) {
          s.dead = true;
          score += 300;
          explode(s.x, s.y, 12);
        } else {
          killShip();
          break;
        }
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  const bars = [];
  if (ship.speedBoost > 0) bars.push({ pct: ship.speedBoost / 5, color: '#ff0', max: 5 });
  if (ship.doubleShot > 0) bars.push({ pct: ship.doubleShot / 8, color: '#0ff', max: 8 });
  if (ship.shield > 0)     bars.push({ pct: ship.shield / 6, color: '#0f0', max: 6 });
  if (ship.tripleShot > 0) bars.push({ pct: ship.tripleShot / 5, color: '#f80', max: 5 });

  const barW = 100;
  const barH = 6;
  const gap = 12;
  const totalW = bars.length * barW + (bars.length - 1) * gap;
  let bx = W / 2 - totalW / 2;

  for (const b of bars) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, H - 20, barW, barH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = b.color;
    ctx.fillRect(bx, H - 20, barW * b.pct, barH);
    bx += barW + gap;
  }
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (state === 'skins') {
    drawSkinMenu();
    return;
  }

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  shootingStars.forEach(s => s.draw());
  miniAliens.forEach(a => a.draw());
  powerups.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA SELECCIONAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
