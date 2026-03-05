// ============================================================
// SHADOWSTRIKE - Raycasting FPS Engine
// ============================================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// --- Configuration ---
const TILE = 64;
const FOV = Math.PI / 3;          // 60 degree field of view
const HALF_FOV = FOV / 2;
const MAX_DEPTH = 20;
const MOVE_SPEED = 3.5;
const ROT_SPEED = 0.003;
const ENEMY_SPEED = 1.5;

// --- Game State ---
let gameRunning = false;
let lastTime = 0;
let screenW, screenH, numRays, rayStep;
let depthBuffer = [];

// --- Map (1=wall, 2=door, 0=floor) ---
// Wall types: 1=stone, 3=brick, 4=metal, 5=wood
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,1,2,1,1,0,0,1],
  [1,1,1,2,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,2,0,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,2,0,0,2,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,1,1,1,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,1,0,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,1],
  [1,0,0,0,1,1,1,2,1,1,1,0,0,0,0,0,2,0,0,2,0,0,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,1,1,1,0,0,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const MAP_H = MAP.length;
const MAP_W = MAP[0].length;

// Door state tracking
const doors = {};
function getDoorKey(x, y) { return `${x},${y}`; }
function isDoorOpen(mx, my) {
  const key = getDoorKey(mx, my);
  return doors[key] && doors[key].open;
}

// --- Player ---
const player = {
  x: 2.5 * TILE,
  y: 2.5 * TILE,
  angle: 0,
  health: 100,
  maxHealth: 100,
  score: 0,
  kills: 0,
  weaponIndex: 0,
  shooting: false,
  shootTimer: 0,
  reloading: false,
  reloadTimer: 0,
  bobPhase: 0,
  bobAmount: 0,
  muzzleFlash: 0,
};

// --- Weapons ---
const weapons = [
  {
    name: 'PISTOL',
    damage: 25,
    fireRate: 0.4,
    magSize: 12,
    ammo: 12,
    reserve: 48,
    reloadTime: 1.2,
    spread: 0.02,
    color: '#aaa',
    auto: false,
  },
  {
    name: 'SHOTGUN',
    damage: 15,
    fireRate: 0.8,
    magSize: 6,
    ammo: 6,
    reserve: 24,
    reloadTime: 2.0,
    spread: 0.08,
    pellets: 6,
    color: '#c84',
    auto: false,
  },
  {
    name: 'SMG',
    damage: 12,
    fireRate: 0.1,
    magSize: 30,
    ammo: 30,
    reserve: 120,
    reloadTime: 1.8,
    spread: 0.05,
    color: '#48f',
    auto: true,
  },
];

// --- Enemies ---
let enemies = [];
let wave = 0;
let waveTimer = 0;
let enemiesRemaining = 0;

function createEnemy(x, y, type) {
  const types = {
    grunt:   { health: 50,  speed: 1.2, damage: 8,  fireRate: 1.5, color: '#e44', score: 100, size: 0.4 },
    soldier: { health: 100, speed: 1.5, damage: 12, fireRate: 1.0, color: '#e82', score: 200, size: 0.45 },
    heavy:   { health: 200, speed: 0.8, damage: 20, fireRate: 2.0, color: '#a3e', score: 400, size: 0.55 },
  };
  const t = types[type] || types.grunt;
  return {
    x: x * TILE + TILE / 2,
    y: y * TILE + TILE / 2,
    type,
    health: t.health,
    maxHealth: t.health,
    speed: t.speed,
    damage: t.damage,
    fireRate: t.fireRate,
    fireTimer: Math.random() * t.fireRate,
    color: t.color,
    scoreValue: t.score,
    size: t.size,
    alive: true,
    alert: false,
    hitFlash: 0,
    // Pathfinding
    moveTimer: 0,
    strafeDir: Math.random() > 0.5 ? 1 : -1,
  };
}

// --- Pickups ---
let pickups = [];
function createPickup(x, y, type) {
  const defs = {
    health: { color: '#0f0', label: '+25 HP' },
    ammo:   { color: '#ff0', label: '+AMMO' },
  };
  const d = defs[type];
  return { x: x * TILE + TILE/2, y: y * TILE + TILE/2, type, color: d.color, label: d.label, alive: true, bobPhase: Math.random() * Math.PI * 2 };
}

// --- Input ---
const keys = {};
let mouseDown = false;

document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key >= '1' && e.key <= '3') {
    switchWeapon(parseInt(e.key) - 1);
  }
  if (e.key.toLowerCase() === 'r') reload();
  if (e.key.toLowerCase() === 'e') interactDoor();
});
document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
document.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseDown = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});
document.addEventListener('mousemove', (e) => {
  if (gameRunning && document.pointerLockElement === canvas) {
    player.angle += e.movementX * ROT_SPEED;
  }
});

// --- Resize ---
function resize() {
  screenW = window.innerWidth;
  screenH = window.innerHeight;
  canvas.width = screenW;
  canvas.height = screenH;
  numRays = Math.floor(screenW / 2);  // render at half-res for performance
  rayStep = FOV / numRays;
}
window.addEventListener('resize', resize);
resize();

// --- Helpers ---
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}

function getMapCell(px, py) {
  const mx = Math.floor(px / TILE);
  const my = Math.floor(py / TILE);
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return 1;
  return MAP[my][mx];
}

function isWalkable(px, py) {
  const mx = Math.floor(px / TILE);
  const my = Math.floor(py / TILE);
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return false;
  const cell = MAP[my][mx];
  if (cell === 0) return true;
  if (cell === 2) return isDoorOpen(mx, my);
  return false;
}

function showMessage(text, duration) {
  const el = document.getElementById('message-display');
  el.textContent = text;
  el.style.opacity = '1';
  setTimeout(() => el.style.opacity = '0', duration || 2000);
}

// --- Door Interaction ---
function interactDoor() {
  const checkDist = TILE * 1.8;
  const dx = Math.cos(player.angle) * checkDist;
  const dy = Math.sin(player.angle) * checkDist;
  const tx = Math.floor((player.x + dx) / TILE);
  const ty = Math.floor((player.y + dy) / TILE);

  if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H && MAP[ty][tx] === 2) {
    const key = getDoorKey(tx, ty);
    if (!doors[key]) doors[key] = { open: false, timer: 0 };
    doors[key].open = !doors[key].open;
    showMessage(doors[key].open ? 'Door opened' : 'Door closed', 1000);
  }
}

// --- Weapon ---
function switchWeapon(idx) {
  if (idx >= 0 && idx < weapons.length && idx !== player.weaponIndex && !player.reloading) {
    player.weaponIndex = idx;
    player.shootTimer = 0.3;
    updateHUD();
  }
}

function reload() {
  const w = weapons[player.weaponIndex];
  if (w.ammo < w.magSize && w.reserve > 0 && !player.reloading) {
    player.reloading = true;
    player.reloadTimer = w.reloadTime;
    showMessage('RELOADING...', w.reloadTime * 1000);
  }
}

function shoot() {
  const w = weapons[player.weaponIndex];
  if (w.ammo <= 0) {
    reload();
    return;
  }

  w.ammo--;
  player.muzzleFlash = 0.08;
  player.shootTimer = w.fireRate;

  const pelletCount = w.pellets || 1;
  for (let p = 0; p < pelletCount; p++) {
    const spread = (Math.random() - 0.5) * w.spread;
    const shootAngle = player.angle + spread;

    // Raycast to find what we hit
    let hitDist = Infinity;
    let hitEnemy = null;

    // Check against enemies
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const ex = enemy.x - player.x;
      const ey = enemy.y - player.y;
      const d = dist(player.x, player.y, enemy.x, enemy.y);

      // Angle to enemy
      let angleToEnemy = Math.atan2(ey, ex) - shootAngle;
      while (angleToEnemy > Math.PI) angleToEnemy -= 2 * Math.PI;
      while (angleToEnemy < -Math.PI) angleToEnemy += 2 * Math.PI;

      const enemyWidth = enemy.size;
      if (Math.abs(angleToEnemy) < Math.atan2(enemyWidth * TILE / 2, d)) {
        // Check if wall is closer
        const wallDist = castSingleRay(shootAngle);
        if (d < wallDist && d < hitDist) {
          hitDist = d;
          hitEnemy = enemy;
        }
      }
    }

    if (hitEnemy) {
      hitEnemy.health -= w.damage;
      hitEnemy.hitFlash = 0.15;
      hitEnemy.alert = true;
      if (hitEnemy.health <= 0) {
        hitEnemy.alive = false;
        player.score += hitEnemy.scoreValue;
        player.kills++;
        enemiesRemaining--;
        // Drop pickup sometimes
        if (Math.random() < 0.3) {
          pickups.push(createPickup(
            Math.floor(hitEnemy.x / TILE),
            Math.floor(hitEnemy.y / TILE),
            Math.random() < 0.5 ? 'health' : 'ammo'
          ));
        }
      }
    }
  }

  // Alert nearby enemies
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const d = dist(player.x, player.y, enemy.x, enemy.y);
    if (d < TILE * 10) enemy.alert = true;
  }

  updateHUD();
}

function castSingleRay(angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  for (let t = 0; t < MAX_DEPTH * TILE; t += 2) {
    const x = player.x + cos * t;
    const y = player.y + sin * t;
    const cell = getMapCell(x, y);
    if (cell >= 1) {
      if (cell === 2 && isDoorOpen(Math.floor(x/TILE), Math.floor(y/TILE))) continue;
      return t;
    }
  }
  return MAX_DEPTH * TILE;
}

// --- Enemy AI ---
function updateEnemies(dt) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const d = dist(player.x, player.y, enemy.x, enemy.y);

    // Alert if player is close
    if (d < TILE * 6) enemy.alert = true;

    if (!enemy.alert) continue;

    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

    // Move toward player
    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);

    // Movement: approach but also strafe
    enemy.moveTimer -= dt;
    if (enemy.moveTimer <= 0) {
      enemy.strafeDir = Math.random() > 0.5 ? 1 : -1;
      enemy.moveTimer = 1 + Math.random() * 2;
    }

    const desiredDist = TILE * 3;
    let moveAngle = angleToPlayer;

    if (d < desiredDist) {
      // Strafe when close
      moveAngle = angleToPlayer + (Math.PI / 2) * enemy.strafeDir;
    } else if (d > desiredDist + TILE * 2) {
      // Move towards player with slight strafe
      moveAngle = angleToPlayer + 0.3 * enemy.strafeDir;
    }

    const mx = Math.cos(moveAngle) * enemy.speed * dt * 60;
    const my = Math.sin(moveAngle) * enemy.speed * dt * 60;

    const margin = 10;
    if (isWalkable(enemy.x + mx, enemy.y) &&
        isWalkable(enemy.x + mx + margin, enemy.y) &&
        isWalkable(enemy.x + mx - margin, enemy.y)) {
      enemy.x += mx;
    }
    if (isWalkable(enemy.x, enemy.y + my) &&
        isWalkable(enemy.x, enemy.y + my + margin) &&
        isWalkable(enemy.x, enemy.y + my - margin)) {
      enemy.y += my;
    }

    // Shooting
    if (d < TILE * 12) {
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0) {
        enemy.fireTimer = enemy.fireRate + Math.random() * 0.5;
        // Check line of sight
        if (hasLineOfSight(enemy.x, enemy.y, player.x, player.y)) {
          // Damage falloff by distance
          const falloff = Math.max(0.3, 1 - d / (TILE * 12));
          const dmg = Math.floor(enemy.damage * falloff * (0.5 + Math.random() * 0.5));
          player.health -= dmg;
          flashDamage();
        }
      }
    }
  }
}

function hasLineOfSight(x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  const steps = Math.floor(d / 8);
  const dx = (x2 - x1) / steps;
  const dy = (y2 - y1) / steps;
  for (let i = 0; i < steps; i++) {
    const cell = getMapCell(x1 + dx * i, y1 + dy * i);
    if (cell >= 1) {
      if (cell === 2 && isDoorOpen(Math.floor((x1+dx*i)/TILE), Math.floor((y1+dy*i)/TILE))) continue;
      return false;
    }
  }
  return true;
}

function flashDamage() {
  const overlay = document.getElementById('damage-overlay');
  overlay.style.opacity = '0.6';
  setTimeout(() => overlay.style.opacity = '0', 200);
}

// --- Wave System ---
function spawnWave() {
  wave++;
  const count = 3 + wave * 2;
  enemiesRemaining = count;

  // Show wave announcement
  const waveEl = document.getElementById('wave-display');
  waveEl.textContent = `WAVE ${wave}`;
  waveEl.classList.remove('hidden');
  setTimeout(() => waveEl.classList.add('hidden'), 2500);

  const spawnPoints = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (MAP[y][x] === 0) {
        const d = dist(player.x, player.y, x * TILE + TILE/2, y * TILE + TILE/2);
        if (d > TILE * 6) {
          spawnPoints.push({x, y});
        }
      }
    }
  }

  for (let i = 0; i < count && spawnPoints.length > 0; i++) {
    const idx = Math.floor(Math.random() * spawnPoints.length);
    const sp = spawnPoints.splice(idx, 1)[0];

    let type = 'grunt';
    if (wave >= 3 && Math.random() < 0.3) type = 'soldier';
    if (wave >= 5 && Math.random() < 0.15) type = 'heavy';

    enemies.push(createEnemy(sp.x, sp.y, type));
  }

  // Spawn pickups
  for (let i = 0; i < 2; i++) {
    if (spawnPoints.length > 0) {
      const idx = Math.floor(Math.random() * spawnPoints.length);
      const sp = spawnPoints.splice(idx, 1)[0];
      pickups.push(createPickup(sp.x, sp.y, Math.random() < 0.5 ? 'health' : 'ammo'));
    }
  }
}

// --- Rendering ---
function getWallColor(cell, side, d) {
  const shade = Math.max(0.15, 1 - d / (MAX_DEPTH * TILE));
  const sideShade = side ? 0.7 : 1.0;
  const s = shade * sideShade;

  switch (cell) {
    case 1: return `rgb(${Math.floor(100*s)}, ${Math.floor(100*s)}, ${Math.floor(110*s)})`;  // stone
    case 2: return `rgb(${Math.floor(80*s)}, ${Math.floor(60*s)}, ${Math.floor(40*s)})`;     // door
    case 3: return `rgb(${Math.floor(140*s)}, ${Math.floor(70*s)}, ${Math.floor(60*s)})`;    // brick
    case 4: return `rgb(${Math.floor(120*s)}, ${Math.floor(120*s)}, ${Math.floor(130*s)})`;  // metal
    case 5: return `rgb(${Math.floor(110*s)}, ${Math.floor(80*s)}, ${Math.floor(50*s)})`;    // wood
    default: return `rgb(${Math.floor(100*s)}, ${Math.floor(100*s)}, ${Math.floor(100*s)})`;
  }
}

function renderWalls() {
  depthBuffer = [];
  const stripWidth = screenW / numRays;

  for (let i = 0; i < numRays; i++) {
    const rayAngle = player.angle - HALF_FOV + i * rayStep;
    const sin = Math.sin(rayAngle);
    const cos = Math.cos(rayAngle);

    let hitDist = MAX_DEPTH * TILE;
    let hitSide = false;
    let hitCell = 1;
    let hitX = 0;

    // DDA raycasting
    const px = player.x;
    const py = player.y;

    // Horizontal intersections
    const hUp = sin < 0;
    const hStepY = hUp ? -TILE : TILE;
    let hY = hUp ? (Math.floor(py / TILE) * TILE - 0.001) : (Math.floor(py / TILE) * TILE + TILE);
    let hX = px + (hY - py) / sin * cos;
    const hDx = hStepY / sin * cos;

    for (let d = 0; d < MAX_DEPTH; d++) {
      const mx = Math.floor(hX / TILE);
      const my = Math.floor(hY / TILE);
      if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) break;
      const cell = MAP[my][mx];
      if (cell >= 1 && !(cell === 2 && isDoorOpen(mx, my))) {
        const dd = dist(px, py, hX, hY);
        if (dd < hitDist) {
          hitDist = dd;
          hitSide = false;
          hitCell = cell;
          hitX = hX % TILE;
        }
        break;
      }
      hX += hDx;
      hY += hStepY;
    }

    // Vertical intersections
    const vRight = cos > 0;
    const vStepX = vRight ? TILE : -TILE;
    let vX = vRight ? (Math.floor(px / TILE) * TILE + TILE) : (Math.floor(px / TILE) * TILE - 0.001);
    let vY = py + (vX - px) / cos * sin;
    const vDy = vStepX / cos * sin;

    for (let d = 0; d < MAX_DEPTH; d++) {
      const mx = Math.floor(vX / TILE);
      const my = Math.floor(vY / TILE);
      if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) break;
      const cell = MAP[my][mx];
      if (cell >= 1 && !(cell === 2 && isDoorOpen(mx, my))) {
        const dd = dist(px, py, vX, vY);
        if (dd < hitDist) {
          hitDist = dd;
          hitSide = true;
          hitCell = cell;
          hitX = vY % TILE;
        }
        break;
      }
      vX += vStepX;
      vY += vDy;
    }

    // Fish-eye correction
    const correctedDist = hitDist * Math.cos(rayAngle - player.angle);
    depthBuffer[i] = correctedDist;

    // Draw wall strip
    const wallHeight = (TILE * screenH) / correctedDist;
    const wallTop = (screenH - wallHeight) / 2;

    // Ceiling
    const ceilGrad = ctx.createLinearGradient(0, 0, 0, wallTop);
    ceilGrad.addColorStop(0, '#111');
    ceilGrad.addColorStop(1, '#333');
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(i * stripWidth, 0, stripWidth + 1, wallTop);

    // Wall
    ctx.fillStyle = getWallColor(hitCell, hitSide, correctedDist);
    ctx.fillRect(i * stripWidth, wallTop, stripWidth + 1, wallHeight);

    // Add texture-like lines based on hitX
    if (wallHeight > 20) {
      const texX = hitX / TILE;
      // Vertical mortar lines
      if (texX < 0.05 || texX > 0.95) {
        ctx.fillStyle = `rgba(0,0,0,0.15)`;
        ctx.fillRect(i * stripWidth, wallTop, stripWidth + 1, wallHeight);
      }
      // Horizontal mortar line at middle
      const midY = wallTop + wallHeight * 0.5;
      ctx.fillStyle = `rgba(0,0,0,0.1)`;
      ctx.fillRect(i * stripWidth, midY - 1, stripWidth + 1, 2);
    }

    // Floor
    const floorGrad = ctx.createLinearGradient(0, wallTop + wallHeight, 0, screenH);
    floorGrad.addColorStop(0, '#222');
    floorGrad.addColorStop(1, '#111');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(i * stripWidth, wallTop + wallHeight, stripWidth + 1, screenH - wallTop - wallHeight);
  }
}

function renderSprites() {
  // Collect all sprites (enemies + pickups)
  const sprites = [];

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    let angle = Math.atan2(dy, dx) - player.angle;
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;

    if (Math.abs(angle) < HALF_FOV + 0.2) {
      sprites.push({ type: 'enemy', obj: enemy, dist: d, angle });
    }
  }

  for (const pickup of pickups) {
    if (!pickup.alive) continue;
    const dx = pickup.x - player.x;
    const dy = pickup.y - player.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    let angle = Math.atan2(dy, dx) - player.angle;
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;

    if (Math.abs(angle) < HALF_FOV + 0.2) {
      sprites.push({ type: 'pickup', obj: pickup, dist: d, angle });
    }
  }

  // Sort by distance (far to near)
  sprites.sort((a, b) => b.dist - a.dist);

  const stripWidth = screenW / numRays;

  for (const sprite of sprites) {
    const correctedDist = sprite.dist * Math.cos(sprite.angle);
    if (correctedDist < 10) continue;

    const screenX = (0.5 + sprite.angle / FOV) * screenW;

    if (sprite.type === 'enemy') {
      const enemy = sprite.obj;
      const spriteHeight = (TILE * screenH * enemy.size) / correctedDist;
      const spriteWidth = spriteHeight * 0.7;
      const spriteTop = (screenH - spriteHeight) / 2;

      // Check occlusion per column
      const startCol = Math.max(0, Math.floor((screenX - spriteWidth/2) / stripWidth));
      const endCol = Math.min(numRays - 1, Math.floor((screenX + spriteWidth/2) / stripWidth));

      for (let col = startCol; col <= endCol; col++) {
        if (depthBuffer[col] < correctedDist) continue;

        const colX = col * stripWidth;
        const relX = (colX - (screenX - spriteWidth/2)) / spriteWidth;

        // Draw enemy column
        const bodyTop = spriteTop + spriteHeight * 0.1;
        const bodyH = spriteHeight * 0.9;

        // Body
        const shade = Math.max(0.2, 1 - correctedDist / (MAX_DEPTH * TILE));
        let r, g, b;
        if (enemy.hitFlash > 0) {
          r = 255; g = 255; b = 255;
        } else {
          const baseColor = enemy.color;
          r = parseInt(baseColor.substr(1,1), 16) * 17 * shade;
          g = parseInt(baseColor.substr(2,1), 16) * 17 * shade;
          b = parseInt(baseColor.substr(3,1), 16) * 17 * shade;
        }

        // Torso
        if (relX > 0.15 && relX < 0.85) {
          ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
          ctx.fillRect(colX, bodyTop + bodyH * 0.2, stripWidth + 1, bodyH * 0.5);
        }

        // Head
        if (relX > 0.3 && relX < 0.7) {
          ctx.fillStyle = `rgb(${Math.floor(r*0.8)},${Math.floor(g*0.7)},${Math.floor(b*0.6)})`;
          ctx.fillRect(colX, bodyTop, stripWidth + 1, bodyH * 0.25);
        }

        // Legs
        if ((relX > 0.2 && relX < 0.45) || (relX > 0.55 && relX < 0.8)) {
          ctx.fillStyle = `rgb(${Math.floor(r*0.5)},${Math.floor(g*0.5)},${Math.floor(b*0.5)})`;
          ctx.fillRect(colX, bodyTop + bodyH * 0.7, stripWidth + 1, bodyH * 0.3);
        }

        // Eyes (when close enough)
        if (spriteHeight > 60 && relX > 0.35 && relX < 0.42) {
          ctx.fillStyle = '#ff0';
          ctx.fillRect(colX, bodyTop + bodyH * 0.08, stripWidth + 1, bodyH * 0.05);
        }
        if (spriteHeight > 60 && relX > 0.58 && relX < 0.65) {
          ctx.fillStyle = '#ff0';
          ctx.fillRect(colX, bodyTop + bodyH * 0.08, stripWidth + 1, bodyH * 0.05);
        }
      }

      // Health bar above enemy (if damaged)
      if (enemy.health < enemy.maxHealth && correctedDist < TILE * 8) {
        const barW = spriteWidth * 0.6;
        const barH = 4;
        const barX = screenX - barW/2;
        const barY = (screenH - spriteHeight) / 2 - 10;
        ctx.fillStyle = '#300';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#f00';
        ctx.fillRect(barX, barY, barW * (enemy.health / enemy.maxHealth), barH);
      }

    } else if (sprite.type === 'pickup') {
      const pickup = sprite.obj;
      const bob = Math.sin(pickup.bobPhase) * 5;
      const size = (TILE * screenH * 0.2) / correctedDist;
      const x = screenX - size/2;
      const y = (screenH / 2) + size * 0.5 + bob;

      // Check occlusion
      const col = Math.floor(screenX / stripWidth);
      if (col >= 0 && col < numRays && depthBuffer[col] >= correctedDist) {
        const shade = Math.max(0.3, 1 - correctedDist / (MAX_DEPTH * TILE));
        ctx.fillStyle = pickup.color;
        ctx.globalAlpha = shade;

        // Diamond shape
        ctx.beginPath();
        ctx.moveTo(x + size/2, y - size/2);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x + size/2, y + size/2);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();

        // Glow
        ctx.globalAlpha = shade * 0.3;
        ctx.fillStyle = pickup.color;
        ctx.beginPath();
        ctx.arc(x + size/2, y, size * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
      }
    }
  }
}

function renderWeapon() {
  const w = weapons[player.weaponIndex];
  const bobX = Math.sin(player.bobPhase) * player.bobAmount * 15;
  const bobY = Math.abs(Math.cos(player.bobPhase)) * player.bobAmount * 10;

  const baseX = screenW / 2 + bobX;
  const baseY = screenH - 10 + bobY;

  // Muzzle flash
  if (player.muzzleFlash > 0) {
    ctx.fillStyle = '#ff8';
    ctx.globalAlpha = player.muzzleFlash * 10;
    ctx.beginPath();
    ctx.arc(baseX, baseY - 220, 40 + Math.random() * 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(baseX, baseY - 220, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Weapon body
  const reloadOffset = player.reloading ? Math.sin(player.reloadTimer * 3) * 30 : 0;

  ctx.save();
  ctx.translate(baseX, baseY + reloadOffset);

  if (player.weaponIndex === 0) {
    // Pistol
    ctx.fillStyle = '#555';
    ctx.fillRect(-12, -180, 24, 120);   // barrel
    ctx.fillStyle = '#444';
    ctx.fillRect(-18, -60, 36, 70);     // body
    ctx.fillStyle = '#333';
    ctx.fillRect(-10, 10, 20, 50);      // grip
    // Slide detail
    ctx.fillStyle = '#666';
    ctx.fillRect(-10, -175, 20, 8);
    // Trigger guard
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-2, -20, 12, 0, Math.PI);
    ctx.stroke();
  } else if (player.weaponIndex === 1) {
    // Shotgun
    ctx.fillStyle = '#654';
    ctx.fillRect(-10, -250, 20, 180);   // barrel
    ctx.fillStyle = '#543';
    ctx.fillRect(-8, -260, 16, 15);     // barrel end
    ctx.fillStyle = '#765';
    ctx.fillRect(-22, -70, 44, 80);     // body
    ctx.fillStyle = '#543';
    ctx.fillRect(-14, 10, 28, 60);      // stock
    // Pump
    ctx.fillStyle = '#876';
    ctx.fillRect(-14, -180, 28, 30);
  } else if (player.weaponIndex === 2) {
    // SMG
    ctx.fillStyle = '#556';
    ctx.fillRect(-8, -220, 16, 160);    // barrel
    ctx.fillStyle = '#445';
    ctx.fillRect(-20, -60, 40, 60);     // body
    ctx.fillStyle = '#334';
    ctx.fillRect(-8, 0, 16, 50);        // grip
    // Magazine
    ctx.fillStyle = '#333';
    ctx.fillRect(-6, -30, 12, 45);
    // Top rail
    ctx.fillStyle = '#667';
    ctx.fillRect(-6, -220, 12, 8);
  }

  ctx.restore();
}

function renderMinimap() {
  const mapScale = 4;
  const mapX = 15;
  const mapY = 15;

  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#000';
  ctx.fillRect(mapX - 2, mapY - 2, MAP_W * mapScale + 4, MAP_H * mapScale + 4);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (MAP[y][x] >= 1) {
        if (MAP[y][x] === 2) {
          const key = getDoorKey(x, y);
          ctx.fillStyle = (doors[key] && doors[key].open) ? '#553' : '#a84';
        } else {
          ctx.fillStyle = '#666';
        }
        ctx.fillRect(mapX + x * mapScale, mapY + y * mapScale, mapScale, mapScale);
      }
    }
  }

  // Player
  ctx.fillStyle = '#0f0';
  const px = mapX + (player.x / TILE) * mapScale;
  const py = mapY + (player.y / TILE) * mapScale;
  ctx.fillRect(px - 2, py - 2, 4, 4);

  // Player direction
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(player.angle) * 10, py + Math.sin(player.angle) * 10);
  ctx.stroke();

  // Enemies
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    ctx.fillStyle = enemy.color;
    const ex = mapX + (enemy.x / TILE) * mapScale;
    const ey = mapY + (enemy.y / TILE) * mapScale;
    ctx.fillRect(ex - 1, ey - 1, 3, 3);
  }

  ctx.globalAlpha = 1;
}

// --- Update HUD ---
function updateHUD() {
  const w = weapons[player.weaponIndex];
  document.getElementById('health-text').textContent = Math.max(0, Math.floor(player.health));
  document.getElementById('health-bar-inner').style.width = Math.max(0, player.health) + '%';

  const hb = document.getElementById('health-bar-inner');
  if (player.health > 60) hb.style.background = 'linear-gradient(90deg, #0a0, #0f0)';
  else if (player.health > 30) hb.style.background = 'linear-gradient(90deg, #aa0, #ff0)';
  else hb.style.background = 'linear-gradient(90deg, #a00, #f00)';

  document.getElementById('weapon-name').textContent = w.name;
  document.getElementById('ammo-current').textContent = w.ammo;
  document.getElementById('ammo-reserve').textContent = w.reserve;
  document.getElementById('score-text').textContent = player.score;
  document.getElementById('kills-text').textContent = player.kills;
}

// --- Main Update ---
function update(dt) {
  if (!gameRunning) return;

  // Player movement
  let moveX = 0, moveY = 0;
  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);

  if (keys['w']) { moveX += cos; moveY += sin; }
  if (keys['s']) { moveX -= cos; moveY -= sin; }
  if (keys['a']) { moveX += Math.cos(player.angle - Math.PI/2); moveY += Math.sin(player.angle - Math.PI/2); }
  if (keys['d']) { moveX += Math.cos(player.angle + Math.PI/2); moveY += Math.sin(player.angle + Math.PI/2); }

  // Normalize
  const len = Math.sqrt(moveX*moveX + moveY*moveY);
  if (len > 0) {
    moveX = (moveX / len) * MOVE_SPEED * dt * 60;
    moveY = (moveY / len) * MOVE_SPEED * dt * 60;
    player.bobPhase += dt * 10;
    player.bobAmount = Math.min(1, player.bobAmount + dt * 5);
  } else {
    player.bobAmount = Math.max(0, player.bobAmount - dt * 5);
  }

  // Collision with walls (with margin)
  const margin = 12;
  if (isWalkable(player.x + moveX + margin, player.y) &&
      isWalkable(player.x + moveX - margin, player.y)) {
    player.x += moveX;
  }
  if (isWalkable(player.x, player.y + moveY + margin) &&
      isWalkable(player.x, player.y + moveY - margin)) {
    player.y += moveY;
  }

  // Shooting
  player.shootTimer = Math.max(0, player.shootTimer - dt);
  player.muzzleFlash = Math.max(0, player.muzzleFlash - dt);

  const w = weapons[player.weaponIndex];
  if (mouseDown && player.shootTimer <= 0 && !player.reloading) {
    if (w.auto || !player.shooting) {
      shoot();
      player.shooting = true;
    }
  }
  if (!mouseDown) player.shooting = false;

  // Reload
  if (player.reloading) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      const needed = w.magSize - w.ammo;
      const available = Math.min(needed, w.reserve);
      w.ammo += available;
      w.reserve -= available;
      player.reloading = false;
      updateHUD();
    }
  }

  // Auto-reload when empty
  if (w.ammo <= 0 && w.reserve > 0 && !player.reloading) {
    reload();
  }

  // Pickups
  for (const pickup of pickups) {
    if (!pickup.alive) continue;
    pickup.bobPhase += dt * 3;
    const d = dist(player.x, player.y, pickup.x, pickup.y);
    if (d < TILE * 0.6) {
      pickup.alive = false;
      if (pickup.type === 'health') {
        player.health = Math.min(player.maxHealth, player.health + 25);
        showMessage('+25 HEALTH', 1000);
      } else if (pickup.type === 'ammo') {
        weapons[player.weaponIndex].reserve += weapons[player.weaponIndex].magSize;
        showMessage('+AMMO', 1000);
      }
      updateHUD();
    }
  }

  // Enemies
  updateEnemies(dt);

  // Clean dead enemies and pickups
  enemies = enemies.filter(e => e.alive || e.hitFlash > 0);
  pickups = pickups.filter(p => p.alive);

  // Wave system
  if (enemiesRemaining <= 0) {
    waveTimer -= dt;
    if (waveTimer <= 0) {
      spawnWave();
      waveTimer = 3;
    }
  }

  // Check death
  if (player.health <= 0) {
    gameRunning = false;
    document.exitPointerLock();
    document.getElementById('final-score').textContent = player.score;
    document.getElementById('final-kills').textContent = player.kills;
    document.getElementById('death-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  updateHUD();
}

// --- Main Render ---
function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, screenW, screenH);

  renderWalls();
  renderSprites();
  renderWeapon();
  renderMinimap();
}

// --- Game Loop ---
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap dt
  lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// --- Start / Restart ---
function startGame() {
  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('death-screen').classList.add('hidden');

  canvas.requestPointerLock();
  initGame();
  gameRunning = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function restartGame() {
  document.getElementById('death-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  canvas.requestPointerLock();
  initGame();
  gameRunning = true;
}

function initGame() {
  player.x = 2.5 * TILE;
  player.y = 2.5 * TILE;
  player.angle = 0;
  player.health = 100;
  player.score = 0;
  player.kills = 0;
  player.weaponIndex = 0;
  player.shooting = false;
  player.shootTimer = 0;
  player.reloading = false;
  player.muzzleFlash = 0;
  player.bobPhase = 0;
  player.bobAmount = 0;

  weapons[0].ammo = 12; weapons[0].reserve = 48;
  weapons[1].ammo = 6;  weapons[1].reserve = 24;
  weapons[2].ammo = 30; weapons[2].reserve = 120;

  enemies = [];
  pickups = [];
  wave = 0;
  waveTimer = 1;
  enemiesRemaining = 0;

  // Reset doors
  for (const key in doors) delete doors[key];

  updateHUD();
}

// Reacquire pointer lock on click during game
canvas.addEventListener('click', () => {
  if (gameRunning && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});
