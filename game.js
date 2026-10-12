const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8dc1ff);
scene.fog = new THREE.Fog(0x8dc1ff, 30, 260);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ui = {
  health: document.getElementById('health'),
  ammo: document.getElementById('ammo'),
  enemies: document.getElementById('enemies'),
  zone: document.getElementById('zone'),
  gameOver: document.getElementById('game-over'),
  resultText: document.getElementById('result-text'),
  restartBtn: document.getElementById('restart-btn')
};

const clock = new THREE.Clock();
const keys = {};
const raycaster = new THREE.Raycaster();
const tempVec = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const playerRight = new THREE.Vector3();

// GAMEPAD SUPPORT
const gamepad = {
  leftStickX: 0,
  leftStickY: 0,
  rightStickX: 0,
  rightStickY: 0,
  rtTrigger: 0,
  ltTrigger: 0,
  aButton: false,
  bButton: false,
  xButton: false,
  yButton: false,
  rbButton: false,
  lbButton: false,
  deadzone: 0.15
};

function updateGamepadState() {
  const gamepads = navigator.getGamepads();
  if (!gamepads[0]) return;

  const pad = gamepads[0];

  // Left stick
  gamepad.leftStickX = Math.abs(pad.axes[0]) > gamepad.deadzone ? pad.axes[0] : 0;
  gamepad.leftStickY = Math.abs(pad.axes[1]) > gamepad.deadzone ? pad.axes[1] : 0;

  // Right stick
  gamepad.rightStickX = Math.abs(pad.axes[2]) > gamepad.deadzone ? pad.axes[2] : 0;
  gamepad.rightStickY = Math.abs(pad.axes[3]) > gamepad.deadzone ? pad.axes[3] : 0;

  // Buttons
  gamepad.aButton = pad.buttons[0].pressed;
  gamepad.bButton = pad.buttons[1].pressed;
  gamepad.xButton = pad.buttons[2].pressed;
  gamepad.yButton = pad.buttons[3].pressed;
  gamepad.lbButton = pad.buttons[4].pressed;
  gamepad.rbButton = pad.buttons[5].pressed;

  // Triggers
  gamepad.rtTrigger = pad.buttons[7].value;
  gamepad.ltTrigger = pad.buttons[6].value;
}

const worldSize = 180;
let gameOver = false;
let roundTime = 0;

const player = {
  position: new THREE.Vector3(0, 1.6, 0),
  yaw: 0,
  pitch: -0.2,
  speed: 15,
  radius: 1.2,
  health: 100,
  ammo: 30,
  fireCooldown: 0,
  hitFlash: 0,
  lastDamageAt: 0
};

const zone = {
  center: new THREE.Vector3(0, 0, 0),
  radius: 80,
  minRadius: 12,
  shrinkPerSecond: 0.75,
  damagePerSecond: 12
};

const enemies = [];
const pickups = [];
const bulletTracers = [];

const ambient = new THREE.HemisphereLight(0xbfe3ff, 0x3d4c2b, 1.2);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff5d4, 1.5);
sun.position.set(30, 50, 20);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(worldSize * 2.5, worldSize * 2.5),
  new THREE.MeshStandardMaterial({ color: 0x6aa85f, roughness: 0.9, metalness: 0.05 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const zoneLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.9 })
);
scene.add(zoneLine);

function buildZoneCircle() {
  const points = [];
  const segments = 120;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * zone.radius, 0.11, Math.sin(angle) * zone.radius));
  }
  zoneLine.geometry.dispose();
  zoneLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
}

function createTree(x, z) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x6f4b2b })
  );
  trunk.position.y = 2;
  group.add(trunk);

  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x3d8a45 })
  );
  leaves.position.y = 5;
  group.add(leaves);

  group.position.set(x, 0, z);
  scene.add(group);
}

for (let i = 0; i < 65; i++) {
  const x = (Math.random() - 0.5) * worldSize * 1.7;
  const z = (Math.random() - 0.5) * worldSize * 1.7;
  if (Math.abs(x) < 18 && Math.abs(z) < 18) continue;
  createTree(x, z);
}

function createPickup(type = 'ammo') {
  const color = type === 'heal' ? 0x7ef29a : 0xf9d65c;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
  );
  mesh.position.set(
    (Math.random() - 0.5) * (worldSize - 24),
    0.8,
    (Math.random() - 0.5) * (worldSize - 24)
  );
  mesh.userData = { type };
  scene.add(mesh);
  pickups.push(mesh);
}

for (let i = 0; i < 12; i++) {
  createPickup(Math.random() > 0.5 ? 'heal' : 'ammo');
}

function createEnemy() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.1, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x9d1d2d })
  );
  body.position.y = 1.2;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xf3d7b3 })
  );
  head.position.y = 2.45;
  group.add(head);

  const enemy = {
    mesh: group,
    health: 70,
    speed: 4 + Math.random() * 2,
    damageCooldown: 0,
    radius: 1.1,
    kind: 'bot'
  };

  group.userData.enemy = enemy;

  let placed = false;
  while (!placed) {
    const x = (Math.random() - 0.5) * (worldSize - 18);
    const z = (Math.random() - 0.5) * (worldSize - 18);
    const distance = Math.hypot(x, z);
    if (distance > 18 && distance < worldSize * 0.8) {
      group.position.set(x, 0, z);
      placed = true;
    }
  }

  scene.add(group);
  enemies.push(enemy);
}

for (let i = 0; i < 9; i++) {
  createEnemy();
}

function updateHUD() {
  ui.health.textContent = Math.max(0, Math.round(player.health));
  ui.ammo.textContent = Math.max(0, player.ammo);
  ui.enemies.textContent = enemies.length;
  ui.zone.textContent = `${Math.max(12, Math.round(zone.radius))}m`;
}

function updateCamera() {
  camera.position.copy(player.position);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.position.y += 0.15;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fireBullet() {
  if (gameOver) return;

  const now = performance.now() / 1000;
  if (player.fireCooldown > 0 || player.ammo <= 0) {
    return;
  }

  player.fireCooldown = 0.12;
  player.ammo -= 1;

  const origin = new THREE.Vector3();
  origin.copy(player.position);
  origin.y += 0.1;

  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

  raycaster.set(origin, direction);
  raycaster.far = 180;

  const hits = raycaster.intersectObjects(enemies.map((e) => e.mesh), true);
  let hitPoint = null;
  let hitEnemy = null;

  if (hits.length > 0) {
    hitPoint = hits[0].point;
    const enemy = hits[0].object.userData.enemy || hits[0].object.parent?.userData.enemy || hits[0].object.parent?.parent?.userData.enemy;
    if (enemy) {
      hitEnemy = enemy;
      enemy.health -= 28;
      if (enemy.health <= 0) {
        scene.remove(enemy.mesh);
        const index = enemies.indexOf(enemy);
        if (index !== -1) enemies.splice(index, 1);
        if (Math.random() < 0.35) createPickup(Math.random() > 0.5 ? 'heal' : 'ammo');
      }
    }
  }

  const trailEnd = hitPoint || origin.clone().add(direction.clone().multiplyScalar(48));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([origin, trailEnd]),
    new THREE.LineBasicMaterial({ color: 0xfff3a4, transparent: true, opacity: 0.9 })
  );
  scene.add(line);
  bulletTracers.push({ line, life: 0.12 });

  if (player.ammo <= 0) {
    setTimeout(() => {
      if (!gameOver) {
        player.ammo = 30;
        player.health = Math.min(player.health + 8, 100);
      }
    }, 1200);
  }
}

function handleShootInput() {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
    return;
  }
  fireBullet();
}

function updatePickups(delta) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.rotation.y += delta * 2.3;
    pickup.rotation.x += delta * 1.5;

    const distance = pickup.position.distanceTo(player.position);
    if (distance < 2.2) {
      if (pickup.userData.type === 'heal') {
        player.health = Math.min(100, player.health + 35);
      } else {
        player.ammo += 14;
      }
      scene.remove(pickup);
      pickups.splice(i, 1);
    }
  }
}

function updateEnemies(delta) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const enemyPos = enemy.mesh.position;
    const toPlayer = tempVec.copy(player.position).sub(enemyPos);
    const dist = toPlayer.length();

    if (dist > 0.001) {
      toPlayer.normalize();
      enemyPos.addScaledVector(toPlayer, enemy.speed * delta);
    }

    enemy.mesh.lookAt(player.position.x, enemy.mesh.position.y, player.position.z);

    if (dist < 1.7) {
      enemy.damageCooldown -= delta;
      if (enemy.damageCooldown <= 0) {
        player.health -= 10;
        enemy.damageCooldown = 0.9;
      }
    } else {
      enemy.damageCooldown = Math.max(0, enemy.damageCooldown - delta * 0.5);
    }

    const playerDistance = enemyPos.distanceTo(zone.center);
    if (playerDistance > zone.radius) {
      enemy.mesh.position.addScaledVector(toPlayer, -1.5 * delta);
    }
  }
}

function updateZone(delta) {
  zone.radius = Math.max(zone.minRadius, zone.radius - zone.shrinkPerSecond * delta);
  buildZoneCircle();

  const distFromCenter = player.position.length();
  if (distFromCenter > zone.radius) {
    player.health -= zone.damagePerSecond * delta;
  }
}

function spawnEnemiesIfNeeded() {
  if (enemies.length < 11 && Math.random() < 0.02) {
    createEnemy();
  }
}

function updateTracers(delta) {
  for (let i = bulletTracers.length - 1; i >= 0; i--) {
    const trail = bulletTracers[i];
    trail.life -= delta;
    if (trail.life <= 0) {
      scene.remove(trail.line);
      trail.line.geometry.dispose();
      trail.line.material.dispose();
      bulletTracers.splice(i, 1);
    }
  }
}

function updatePlayerMovement(delta) {
  updateGamepadState();

  // KEYBOARD INPUT
  const moveForward = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
  const moveSide = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);

  // GAMEPAD INPUT (LEFT STICK)
  const gamepadForward = -gamepad.leftStickY;
  const gamepadSide = gamepad.leftStickX;

  // COMBINED INPUT
  const totalForward = moveForward + gamepadForward;
  const totalSide = moveSide + gamepadSide;

  playerDirection.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  playerRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  const movement = new THREE.Vector3();
  movement.addScaledVector(playerDirection, totalForward);
  movement.addScaledVector(playerRight, totalSide);

  if (movement.lengthSq() > 0) {
    movement.normalize().multiplyScalar(player.speed * delta);
    player.position.add(movement);
  }

  player.position.x = clamp(player.position.x, -worldSize, worldSize);
  player.position.z = clamp(player.position.z, -worldSize, worldSize);
  player.position.y = 1.6;

  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  player.hitFlash = Math.max(0, player.hitFlash - delta * 1.5);

  // GAMEPAD RIGHT STICK (CAMERA LOOK)
  const cameraSensitivity = 3.5;
  player.yaw -= gamepad.rightStickX * cameraSensitivity * delta;
  player.pitch -= gamepad.rightStickY * cameraSensitivity * delta;
  player.pitch = clamp(player.pitch, -1.4, 1.4);
}

function checkGameState() {
  if (player.health <= 0 && !gameOver) {
    gameOver = true;
    ui.gameOver.classList.remove('hidden');
    ui.resultText.textContent = `Du hast ${Math.round(roundTime)} Sekunden überlebt. ${enemies.length} Gegner übrig.`;
    document.exitPointerLock();
  }

  if (enemies.length === 0 && !gameOver) {
    gameOver = true;
    ui.gameOver.classList.remove('hidden');
    ui.resultText.textContent = `Gewonnen! Du hast ${Math.round(roundTime)} Sekunden durchgehalten.`;
    document.exitPointerLock();
  }
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.033);
  roundTime += delta;

  if (!gameOver) {
    updatePlayerMovement(delta);
    updateZone(delta);
    updateEnemies(delta);
    updatePickups(delta);
    updateTracers(delta);
    spawnEnemiesIfNeeded();
    checkGameState();
    updateHUD();

    // GAMEPAD SHOOTING (RT-TRIGGER)
    if (gamepad.rtTrigger > 0.5) {
      fireBullet();
    }

    // GAMEPAD RESTART (START BUTTON)
    if (gamepad.aButton) {
      handleShootInput();
    }
  }

  updateCamera();
  renderer.render(scene, camera);
}

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  if (event.code === 'Space') {
    fireBullet();
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === renderer.domElement) {
    player.yaw -= event.movementX * 0.0022;
    player.pitch -= event.movementY * 0.0018;
    player.pitch = clamp(player.pitch, -1.4, 1.4);
  }
});

renderer.domElement.addEventListener('click', () => {
  if (!gameOver && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

renderer.domElement.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    handleShootInput();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// GAMEPAD CONNECTED / DISCONNECTED
window.addEventListener('gamepadconnected', (e) => {
  console.log('Controller verbunden:', e.gamepad.id);
});

window.addEventListener('gamepaddisconnected', (e) => {
  console.log('Controller getrennt');
});

ui.restartBtn.addEventListener('click', () => {
  location.reload();
});

buildZoneCircle();
updateHUD();
animate();
