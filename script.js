import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- Renderer / Scene / Camera ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05020c, 0.045);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.35, 0.5);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
}
window.addEventListener('resize', onResize);

// ---------- Tunable constants ----------
const PLAY_RADIUS = 2.25;
const RING_RADIUS = 3.3;
const RING_SPACING = 7;
const RING_COUNT = 18;
const SPAWN_AHEAD = 52;
const RECYCLE_MARGIN = 6;
const OBSTACLE_POOL = 26;
const ORB_POOL = 26;
const BASE_SPEED = 9;
const MAX_SPEED = 27;
const SPEED_RAMP = 0.14;
const COLLIDE_RADIUS = 0.72;
const ORB_RADIUS = 0.85;

// ---------- Starfield ----------
const STAR_COUNT = 700;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STAR_COUNT * 3);
const starPhase = new Float32Array(STAR_COUNT);
const starSize = new Float32Array(STAR_COUNT);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 18 + Math.random() * 50;
  const theta = Math.random() * Math.PI * 2;
  starPos[i * 3] = r * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.sin(theta) * 0.6;
  starPos[i * 3 + 2] = -Math.random() * 260;
  starPhase[i] = Math.random() * Math.PI * 2;
  starSize[i] = Math.random() * 5 + 2;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
const starMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float aPhase;
    attribute float aSize;
    uniform float uTime;
    uniform float uPixelRatio;
    varying float vTwinkle;
    void main() {
      vTwinkle = 0.5 + 0.5 * sin(uTime * 2.0 + aPhase);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixelRatio * (26.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying float vTwinkle;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), a * vTwinkle);
    }
  `,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ---------- Tunnel rings ----------
const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 0.045, 8, 48);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fa8ff, transparent: true, opacity: 0.55, toneMapped: false });
const rings = [];
for (let i = 0; i < RING_COUNT; i++) {
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.z = -i * RING_SPACING;
  scene.add(ring);
  rings.push(ring);
}

// ---------- Player ship ----------
const shipGroup = new THREE.Group();
const shipCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.3, 1),
  new THREE.MeshBasicMaterial({ color: 0x9fd6ff, toneMapped: false })
);
shipGroup.add(shipCore);
const engineGeo = new THREE.SphereGeometry(0.09, 8, 8);
const engineMat = new THREE.MeshBasicMaterial({ color: 0x7ee8ff, toneMapped: false });
const engineL = new THREE.Mesh(engineGeo, engineMat);
engineL.position.set(-0.2, -0.05, 0.28);
const engineR = engineL.clone();
engineR.position.x = 0.2;
shipGroup.add(engineL, engineR);
scene.add(shipGroup);

// ---------- Obstacle / orb pools ----------
function makePool(count, geo, mat) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, active: false, z: 0, x: 0, y: 0, kind: null });
  }
  return pool;
}
const obstacleGeo = new THREE.OctahedronGeometry(0.42, 0);
const obstacleMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false });
const obstacles = makePool(OBSTACLE_POOL, obstacleGeo, obstacleMat);

const orbGeo = new THREE.SphereGeometry(0.24, 12, 12);
const orbMat = new THREE.MeshBasicMaterial({ color: 0x7ee8ff, toneMapped: false });
const orbs = makePool(ORB_POOL, orbGeo, orbMat);

function spawnFrom(pool, atZ) {
  const slot = pool.find((s) => !s.active);
  if (!slot) return;
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * PLAY_RADIUS * 0.9;
  slot.x = Math.cos(angle) * r;
  slot.y = Math.sin(angle) * r;
  slot.z = atZ;
  slot.active = true;
  slot.spawnT = 0;
  slot.mesh.visible = true;
  slot.mesh.position.set(slot.x, slot.y, slot.z);
  slot.mesh.scale.setScalar(1);
}

// ---------- Input ----------
const target = { x: 0, y: 0 };
const keys = new Set();
function pointerToTarget(clientX, clientY) {
  const nx = (clientX / window.innerWidth) * 2 - 1;
  const ny = (clientY / window.innerHeight) * 2 - 1;
  target.x = THREE.MathUtils.clamp(nx * PLAY_RADIUS, -PLAY_RADIUS, PLAY_RADIUS);
  target.y = THREE.MathUtils.clamp(-ny * PLAY_RADIUS, -PLAY_RADIUS, PLAY_RADIUS);
}
window.addEventListener('mousemove', (e) => pointerToTarget(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (t) pointerToTarget(t.clientX, t.clientY);
}, { passive: true });
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if ((e.code === 'Space' || e.code === 'Enter') && state !== 'playing') {
    e.preventDefault();
    state === 'idle' ? startGame() : startGame();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- Game state ----------
let state = 'idle'; // idle | playing | gameover
let shipX = 0, shipY = 0, shipZ = 0;
let speed = BASE_SPEED;
let score = 0;
let survivedT = 0;
let distSinceSpawn = 0;
let nextSpawnAt = 2.2;
let best = Number(localStorage.getItem('novaDriftBest') || 0);

const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const newBestEl = document.getElementById('newBest');
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);

bestEl.textContent = `EN İYİ: ${Math.floor(best)}`;

function resetPoolMesh(slot) {
  slot.active = false;
  slot.mesh.visible = false;
}

function startGame() {
  state = 'playing';
  shipX = shipY = target.x = target.y = 0;
  shipZ = 0;
  speed = BASE_SPEED;
  score = 0;
  survivedT = 0;
  distSinceSpawn = 0;
  nextSpawnAt = 2.2;
  obstacles.forEach(resetPoolMesh);
  orbs.forEach(resetPoolMesh);
  rings.forEach((ring, i) => (ring.position.z = -i * RING_SPACING));
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  newBestEl.classList.add('hidden');
  hud.classList.add('visible');
}

function endGame() {
  state = 'gameover';
  hud.classList.remove('visible');
  finalScoreEl.textContent = Math.floor(score);
  if (score > best) {
    best = score;
    localStorage.setItem('novaDriftBest', String(Math.floor(best)));
    newBestEl.classList.remove('hidden');
  }
  bestEl.textContent = `EN İYİ: ${Math.floor(best)}`;
  gameOverScreen.classList.remove('hidden');
}

// ---------- Main loop ----------
const clock = new THREE.Clock();

function updatePlaying(dt) {
  survivedT += dt;
  speed = Math.min(MAX_SPEED, BASE_SPEED + survivedT * SPEED_RAMP);
  shipZ -= speed * dt;
  score += speed * dt * 1.1;
  scoreEl.textContent = Math.floor(score);

  // keyboard nudges the target continuously
  const kSpeed = 3.6;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) target.x -= kSpeed * dt;
  if (keys.has('ArrowRight') || keys.has('KeyD')) target.x += kSpeed * dt;
  if (keys.has('ArrowUp') || keys.has('KeyW')) target.y += kSpeed * dt;
  if (keys.has('ArrowDown') || keys.has('KeyS')) target.y -= kSpeed * dt;
  target.x = THREE.MathUtils.clamp(target.x, -PLAY_RADIUS, PLAY_RADIUS);
  target.y = THREE.MathUtils.clamp(target.y, -PLAY_RADIUS, PLAY_RADIUS);

  const ease = Math.min(1, dt * 8);
  const prevX = shipX, prevY = shipY;
  shipX += (target.x - shipX) * ease;
  shipY += (target.y - shipY) * ease;
  const velX = (shipX - prevX) / Math.max(dt, 0.0001);
  const velY = (shipY - prevY) / Math.max(dt, 0.0001);

  shipGroup.position.set(shipX, shipY, shipZ);
  shipGroup.rotation.z = THREE.MathUtils.clamp(-velX * 0.09, -0.6, 0.6);
  shipGroup.rotation.x = THREE.MathUtils.clamp(velY * 0.06, -0.4, 0.4);
  shipCore.rotation.y += dt * 2.2;

  // recycle rings
  for (const ring of rings) {
    if (ring.position.z > shipZ + RECYCLE_MARGIN) {
      ring.position.z -= RING_COUNT * RING_SPACING;
    }
  }

  // spawn obstacles/orbs based on distance traveled
  distSinceSpawn += speed * dt;
  if (distSinceSpawn > nextSpawnAt) {
    distSinceSpawn = 0;
    nextSpawnAt = 1.7 + Math.random() * 1.1;
    const pool = Math.random() < 0.5 ? obstacles : orbs;
    spawnFrom(pool, shipZ - SPAWN_AHEAD);
  }

  // update obstacles: recycle or collide
  for (const o of obstacles) {
    if (!o.active) continue;
    o.mesh.rotation.x += dt * 1.4;
    o.mesh.rotation.y += dt * 1.1;
    if (o.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(o); continue; }
    if (Math.abs(o.z - shipZ) < 0.85) {
      const dx = o.x - shipX, dy = o.y - shipY;
      if (Math.hypot(dx, dy) < COLLIDE_RADIUS) { endGame(); return; }
    }
  }

  // update orbs: recycle, collect, or pulse
  for (const orb of orbs) {
    if (!orb.active) continue;
    orb.spawnT += dt;
    const pulse = 1 + Math.sin(orb.spawnT * 6) * 0.12;
    orb.mesh.scale.setScalar(pulse);
    if (orb.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(orb); continue; }
    if (Math.abs(orb.z - shipZ) < 0.9) {
      const dx = orb.x - shipX, dy = orb.y - shipY;
      if (Math.hypot(dx, dy) < ORB_RADIUS) {
        score += 45;
        resetPoolMesh(orb);
      }
    }
  }

  // chase camera with a bit of lag + bank
  const camTargetX = shipX * 0.55;
  const camTargetY = shipY * 0.4 + 1.05;
  const camTargetZ = shipZ + 4.4;
  camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 5);
  camera.position.z += (camTargetZ - camera.position.z) * Math.min(1, dt * 5);
  camera.lookAt(shipX, shipY, shipZ - 6);
  camera.rotation.z += (-velX * 0.05 - camera.rotation.z) * Math.min(1, dt * 4);
}

function idleDrift(t) {
  shipGroup.position.set(Math.sin(t * 0.4) * 0.6, Math.cos(t * 0.3) * 0.3, 0);
  shipGroup.rotation.y += 0.006;
  shipGroup.rotation.z = Math.sin(t * 0.5) * 0.15;
  camera.position.set(0, 1.05, 4.4);
  camera.lookAt(0, 0, -6);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  starMat.uniforms.uTime.value = t;

  if (state === 'playing') updatePlaying(dt);
  else idleDrift(t);

  composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
