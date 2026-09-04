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
scene.background = new THREE.TextureLoader().load('assets/nebula.png');
scene.background.colorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.35, 0.5);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
}
window.addEventListener('resize', onResize);

// ---------- Adaptive render scale ----------
// Bloom is the expensive pass and its cost scales with pixel count. On a
// phone that cannot hold 60 fps at full DPR, dropping the render scale a
// notch buys more than any other single change, and nobody notices 0.85x
// at 2x DPR. Decisions are made from a moving average over 60 frames, with
// hysteresis (drop above 20 ms, recover below 12.5 ms) and a 2 s cooldown
// so the scale settles instead of oscillating. Frame timing is read from
// the raw clock delta, before the 0.05 s clamp that protects the physics.
const BASE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);
const RENDER_SCALE_MIN = 0.6;
let renderScale = 1;

// Pure decision function - mirrored in test/adaptive.spec.js, keep in sync.
function nextRenderScale(current, avgFrameMs) {
  if (avgFrameMs > 20 && current > RENDER_SCALE_MIN) {
    return Math.max(RENDER_SCALE_MIN, Math.round((current - 0.15) * 100) / 100);
  }
  if (avgFrameMs < 12.5 && current < 1) {
    return Math.min(1, Math.round((current + 0.1) * 100) / 100);
  }
  return current;
}

function applyRenderScale(scale) {
  renderScale = scale;
  const pr = BASE_PIXEL_RATIO * scale;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  onResize();
}

let adaptFrames = 0;
let adaptAccumMs = 0;
let adaptLastChangeT = 0;
function adaptQuality(rawDt, t) {
  adaptFrames += 1;
  adaptAccumMs += rawDt * 1000;
  if (adaptFrames < 60) return;
  const avg = adaptAccumMs / adaptFrames;
  adaptFrames = 0;
  adaptAccumMs = 0;
  if (t - adaptLastChangeT < 2) return;
  const next = nextRenderScale(renderScale, avg);
  if (next !== renderScale) {
    applyRenderScale(next);
    adaptLastChangeT = t;
  }
}

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
const MAGNET_RADIUS = 4.5;
const SHIELD_MAX = 2;
const MAGNET_DURATION = 6;
const MULT_DURATION = 8;
const NEAR_MISS_RADIUS = COLLIDE_RADIUS + 0.45;
const NEAR_MISS_BONUS = 10;

const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Daily Challenge: seedable RNG for spawn logic only ----------
// A tiny mulberry32 PRNG. When Daily Challenge mode is active, every spawn
// decision (obstacle/orb/power-up type, position, and timing) is drawn from
// this instead of Math.random(), seeded from today's UTC date — so every
// player who plays on the same calendar day gets the exact same pattern and
// scores are genuinely comparable. Regular endless mode leaves `spawnRng`
// pointed at the real Math.random(), so its behavior is unchanged.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function todayUTCStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
function dailySeed(date = new Date()) {
  return Number(todayUTCStamp(date)); // e.g. 20260831
}
function dailyStorageKey(date = new Date()) {
  return `novaDriftDaily-${todayUTCStamp(date)}`;
}
function loadDailyBest() {
  return Number(localStorage.getItem(dailyStorageKey()) || 0);
}
function saveDailyBest(s) {
  const val = Math.floor(s);
  localStorage.setItem(dailyStorageKey(), String(val));
  return val;
}

let dailyMode = new URLSearchParams(window.location.search).get('daily') === '1';
let spawnRng = Math.random; // swapped to a seeded generator when Daily Challenge starts
const rand = () => spawnRng();

// Small record of recent spawns (position/type only) — used to verify that
// Daily Challenge mode is actually deterministic. Capped so it never grows
// unbounded during a long run.
let spawnLog = [];
function logSpawn(kind, x, y, z) {
  if (spawnLog.length < 200) spawnLog.push({ kind, x, y, z });
}

// ---------- Audio (synthesized with Web Audio API - no external files) ----------
const sfx = (() => {
  let ctx = null;
  let master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let muted = localStorage.getItem('novaDriftMuted') === '1';

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, startGain, delay = 0) {
    const c = ensure();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain).connect(master);
    const t0 = c.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(startGain, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function collect() {
    tone(880, 0.12, 'sine', 0.28);
    tone(1320, 0.15, 'sine', 0.2, 0.05);
  }

  function power() {
    tone(660, 0.1, 'triangle', 0.26);
    tone(880, 0.1, 'triangle', 0.22, 0.08);
    tone(1180, 0.18, 'triangle', 0.2, 0.16);
  }

  function shieldHit() {
    tone(220, 0.09, 'square', 0.3);
    tone(150, 0.14, 'square', 0.24, 0.03);
  }

  function nearMiss() {
    tone(1500, 0.07, 'sine', 0.16);
  }

  function crash() {
    const c = ensure();
    const bufferSize = Math.floor(c.sampleRate * 0.35);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = c.createGain();
    gain.gain.value = 0.5;
    noise.connect(filter).connect(gain).connect(master);
    noise.start();
    tone(90, 0.32, 'sawtooth', 0.35);
  }

  function click() {
    tone(520, 0.06, 'square', 0.15);
  }

  function engineStart() {
    const c = ensure();
    if (engineOsc) return;
    engineOsc = c.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = c.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 220;
    engineGain = c.createGain();
    engineGain.gain.value = 0.025;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
  }
  function engineSet(speed) {
    if (engineOsc) engineOsc.frequency.setTargetAtTime(55 + speed * 2.2, ctx.currentTime, 0.15);
  }
  function engineStop() {
    if (engineOsc) {
      engineOsc.stop();
      engineOsc.disconnect();
      engineFilter.disconnect();
      engineGain.disconnect();
      engineOsc = null;
      engineGain = null;
      engineFilter = null;
    }
  }

  function setMuted(m) {
    muted = m;
    localStorage.setItem('novaDriftMuted', m ? '1' : '0');
    if (master) master.gain.value = m ? 0 : 0.45;
  }
  function isMuted() { return muted; }

  return { collect, power, shieldHit, nearMiss, crash, click, engineStart, engineSet, engineStop, setMuted, isMuted };
})();

const muteBtn = document.getElementById('muteBtn');
muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.isMuted());
  muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
});

// ---------- Screen shake + hit flash ----------
let shakeT = 0, shakeMag = 0;
function triggerShake(mag, dur) {
  if (reducedMotion) return;
  shakeMag = mag;
  shakeT = dur;
}
const hitFlashEl = document.getElementById('hitFlash');
function flash(color) {
  hitFlashEl.style.background = color;
  hitFlashEl.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => hitFlashEl.classList.remove('on')));
}

// ---------- Starfield ----------
const STAR_COUNT = 700;
const STAR_SPAN = 260; // depth of the field; stars recycle by this much (see the frame loop)
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STAR_COUNT * 3);
const starPhase = new Float32Array(STAR_COUNT);
const starSize = new Float32Array(STAR_COUNT);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 18 + Math.random() * 50;
  const theta = Math.random() * Math.PI * 2;
  starPos[i * 3] = r * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.sin(theta) * 0.6;
  starPos[i * 3 + 2] = -Math.random() * STAR_SPAN;
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
const shipTexture = new THREE.TextureLoader().load('assets/ship.png');
shipTexture.colorSpace = THREE.SRGBColorSpace;
const shipSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: shipTexture, transparent: true, toneMapped: false }));
shipSprite.scale.set(1.5, 1.5, 1);
shipGroup.add(shipSprite);
const shieldRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.56, 0.035, 8, 32),
  new THREE.MeshBasicMaterial({ color: 0x6dff9e, toneMapped: false, transparent: true, opacity: 0.85 })
);
shieldRing.visible = false;
shipGroup.add(shieldRing);
scene.add(shipGroup);

// ---------- Engine exhaust trail + impact bursts (shared particle pool) ----------
const TRAIL_COUNT = 70;
const trailData = Array.from({ length: TRAIL_COUNT }, () => ({
  life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1,
}));
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT * 3), 3));
trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(TRAIL_COUNT), 1));
const trailMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float aAlpha;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = color;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 55.0 * uPixelRatio * aAlpha / -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vColor, a * vAlpha);
    }
  `,
});
const trailPoints = new THREE.Points(trailGeo, trailMat);
scene.add(trailPoints);
let trailSpawnT = 0;

function spawnBurst(x, y, z, r, g, b, count) {
  for (let n = 0; n < count; n++) {
    const slot = trailData.find((p) => p.life <= 0);
    if (!slot) break;
    const angle = Math.random() * Math.PI * 2;
    const spd = 1.4 + Math.random() * 1.6;
    slot.life = 1;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = Math.cos(angle) * spd;
    slot.vy = Math.sin(angle) * spd;
    slot.vz = (Math.random() - 0.5) * spd;
    slot.r = r;
    slot.g = g;
    slot.b = b;
  }
}

function updateTrail(dt) {
  trailSpawnT += dt;
  if (trailSpawnT > 0.018) {
    trailSpawnT = 0;
    const slot = trailData.find((p) => p.life <= 0);
    if (slot) {
      slot.life = 1;
      slot.x = shipX + (Math.random() - 0.5) * 0.1;
      slot.y = shipY + (Math.random() - 0.5) * 0.1 - 0.04;
      slot.z = shipZ + 0.34;
      slot.vx = 0;
      slot.vy = 0;
      slot.vz = 0;
      if (Math.random() < 0.5) { slot.r = 1; slot.g = 0.55; slot.b = 0.85; }
      else { slot.r = 0.5; slot.g = 0.9; slot.b = 1; }
    }
  }
  const posAttr = trailGeo.attributes.position;
  const colAttr = trailGeo.attributes.color;
  const alphaAttr = trailGeo.attributes.aAlpha;
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const p = trailData[i];
    if (p.life > 0) {
      p.life = Math.max(0, p.life - dt * 1.7);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    posAttr.setXYZ(i, p.x, p.y, p.z);
    alphaAttr.setX(i, p.life);
    colAttr.setXYZ(i, p.r, p.g, p.b);
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  alphaAttr.needsUpdate = true;
}

// ---------- Obstacle / orb / power-up pools ----------
function makePool(count, geo, mat) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, active: false, z: 0, x: 0, y: 0, nearMissDone: false });
  }
  return pool;
}
const obstacleGeo = new THREE.OctahedronGeometry(0.42, 0);
const obstacleMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false });
const obstacles = makePool(OBSTACLE_POOL, obstacleGeo, obstacleMat);

const orbGeo = new THREE.SphereGeometry(0.24, 12, 12);
const orbMat = new THREE.MeshBasicMaterial({ color: 0x7ee8ff, toneMapped: false });
const orbs = makePool(ORB_POOL, orbGeo, orbMat);

const POWERUP_GEO = {
  shield: new THREE.TorusGeometry(0.3, 0.075, 8, 20),
  magnet: new THREE.OctahedronGeometry(0.3, 0),
  mult: new THREE.TetrahedronGeometry(0.34, 0),
};
const POWERUP_MAT = {
  shield: new THREE.MeshBasicMaterial({ color: 0x6dff9e, toneMapped: false }),
  magnet: new THREE.MeshBasicMaterial({ color: 0xc98bff, toneMapped: false }),
  mult: new THREE.MeshBasicMaterial({ color: 0xffd76d, toneMapped: false }),
};
const POWERUP_TYPES = ['shield', 'magnet', 'mult'];
const powerups = [];
for (const type of POWERUP_TYPES) {
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(POWERUP_GEO[type], POWERUP_MAT[type]);
    mesh.visible = false;
    scene.add(mesh);
    powerups.push({ mesh, active: false, z: 0, x: 0, y: 0, type });
  }
}

function spawnFrom(pool, atZ, kind) {
  const slot = pool.find((s) => !s.active);
  if (!slot) return;
  const angle = rand() * Math.PI * 2;
  const r = rand() * PLAY_RADIUS * 0.9;
  slot.x = Math.cos(angle) * r;
  slot.y = Math.sin(angle) * r;
  slot.z = atZ;
  slot.active = true;
  slot.spawnT = 0;
  slot.mesh.visible = true;
  slot.mesh.position.set(slot.x, slot.y, slot.z);
  slot.mesh.scale.setScalar(1);
  logSpawn(kind, slot.x, slot.y, slot.z);
}
function spawnPowerup(atZ) {
  const type = POWERUP_TYPES[Math.floor(rand() * POWERUP_TYPES.length)];
  const candidates = powerups.filter((s) => !s.active && s.type === type);
  const slot = candidates[0] || powerups.find((s) => !s.active);
  if (!slot) return;
  const angle = rand() * Math.PI * 2;
  const r = rand() * PLAY_RADIUS * 0.8;
  slot.x = Math.cos(angle) * r;
  slot.y = Math.sin(angle) * r;
  slot.z = atZ;
  slot.active = true;
  slot.spawnT = 0;
  slot.mesh.visible = true;
  slot.mesh.position.set(slot.x, slot.y, slot.z);
  slot.mesh.scale.setScalar(1);
  logSpawn(`powerup:${type}`, slot.x, slot.y, slot.z);
}

function resetPoolMesh(slot) {
  slot.active = false;
  slot.mesh.visible = false;
  slot.nearMissDone = false;
}

// ---------- Input: keyboard, mouse, virtual joystick (touch) ----------
const target = { x: 0, y: 0 };
const keys = new Set();
function pointerToTarget(clientX, clientY) {
  const nx = (clientX / window.innerWidth) * 2 - 1;
  const ny = (clientY / window.innerHeight) * 2 - 1;
  target.x = THREE.MathUtils.clamp(nx * PLAY_RADIUS, -PLAY_RADIUS, PLAY_RADIUS);
  target.y = THREE.MathUtils.clamp(-ny * PLAY_RADIUS, -PLAY_RADIUS, PLAY_RADIUS);
}
window.addEventListener('mousemove', (e) => pointerToTarget(e.clientX, e.clientY));

const joystickEl = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystickKnob');
const JOY_MAX = 55;
let joyActive = false;
const joyBase = { x: 0, y: 0 };
const joyVec = { x: 0, y: 0 };

function joyStart(clientX, clientY) {
  joyActive = true;
  joyBase.x = clientX;
  joyBase.y = clientY;
  joystickEl.style.left = clientX + 'px';
  joystickEl.style.top = clientY + 'px';
  joystickEl.classList.remove('hidden');
  joystickKnob.style.transform = 'translate(-50%, -50%)';
}
function joyMove(clientX, clientY) {
  if (!joyActive) return;
  let dx = clientX - joyBase.x;
  let dy = clientY - joyBase.y;
  const dist = Math.hypot(dx, dy);
  if (dist > JOY_MAX) {
    dx = (dx / dist) * JOY_MAX;
    dy = (dy / dist) * JOY_MAX;
  }
  joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joyVec.x = dx / JOY_MAX;
  joyVec.y = dy / JOY_MAX;
}
function joyEnd() {
  joyActive = false;
  joyVec.x = 0;
  joyVec.y = 0;
  joystickEl.classList.add('hidden');
}
canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (t) joyStart(t.clientX, t.clientY);
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (t) joyMove(t.clientX, t.clientY);
}, { passive: true });
canvas.addEventListener('touchend', joyEnd, { passive: true });
canvas.addEventListener('touchcancel', joyEnd, { passive: true });

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if ((e.code === 'Space' || e.code === 'Enter') && (state === 'idle' || state === 'gameover')) {
    e.preventDefault();
    startGame();
  }
  if (e.code === 'Escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- Game state ----------
let state = 'idle'; // idle | playing | paused | gameover
let shipX = 0, shipY = 0, shipZ = 0;
let speed = BASE_SPEED;
let score = 0;
let survivedT = 0;
let distSinceSpawn = 0;
let nextSpawnAt = 2.2;
let hudPulseT = 0;
let shieldCharges = 0;
let magnetUntil = 0;
let multUntil = 0;

// ---------- Local top-5 leaderboard ----------
function loadScores() {
  try {
    const raw = localStorage.getItem('novaDriftScores');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore malformed storage */ }
  const legacyBest = Number(localStorage.getItem('novaDriftBest') || 0);
  return legacyBest > 0 ? [legacyBest] : [];
}
function saveScore(s) {
  const list = loadScores();
  list.push(Math.floor(s));
  list.sort((a, b) => b - a);
  const top5 = list.slice(0, 5);
  localStorage.setItem('novaDriftScores', JSON.stringify(top5));
  return top5;
}
function renderLeaderboard(list) {
  const html = list.length
    ? list.map((s, i) => `<div class="lbRow"><span>${i + 1}.</span><span>${s}</span></div>`).join('')
    : '<div class="lbRow lbEmpty">henüz skor yok</div>';
  leaderboardStartEl.innerHTML = html;
  leaderboardEndEl.innerHTML = html;
}

let scores = loadScores();
let best = scores[0] || 0;

const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const powerupsEl = document.getElementById('powerups');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseScreen = document.getElementById('pauseScreen');
const finalScoreEl = document.getElementById('finalScore');
const newBestEl = document.getElementById('newBest');
const leaderboardStartEl = document.getElementById('leaderboardStart');
const leaderboardEndEl = document.getElementById('leaderboardEnd');
const pauseBtn = document.getElementById('pauseBtn');
const modeTagEl = document.getElementById('modeTag');
const dailyToggleBtn = document.getElementById('dailyToggleBtn');
const dailyInfoStartEl = document.getElementById('dailyInfoStart');
const dailyBestStartEl = document.getElementById('dailyBestStart');
const dailyInfoEndEl = document.getElementById('dailyInfoEnd');
const dailyBestEndEl = document.getElementById('dailyBestEnd');
const newDailyBestEl = document.getElementById('newDailyBest');
document.getElementById('startBtn').addEventListener('click', () => { sfx.click(); startGame(); });
document.getElementById('restartBtn').addEventListener('click', () => { sfx.click(); startGame(); });
document.getElementById('resumeBtn').addEventListener('click', () => { sfx.click(); resumeGame(); });
pauseBtn.addEventListener('click', () => {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});
dailyToggleBtn.addEventListener('click', () => {
  sfx.click();
  dailyMode = !dailyMode;
  refreshDailyToggleUI();
});

function refreshDailyToggleUI() {
  dailyToggleBtn.textContent = dailyMode ? 'GÜNLÜK MOD: AÇIK' : 'GÜNLÜK MOD: KAPALI';
  dailyToggleBtn.classList.toggle('active', dailyMode);
  dailyToggleBtn.setAttribute('aria-pressed', String(dailyMode));
  dailyInfoStartEl.classList.toggle('hidden', !dailyMode);
  if (dailyMode) dailyBestStartEl.textContent = Math.floor(loadDailyBest());
}
refreshDailyToggleUI();

bestEl.textContent = `EN İYİ: ${Math.floor(best)}`;
renderLeaderboard(scores);

function refreshPowerupHud() {
  const chips = [];
  if (shieldCharges > 0) chips.push(`<span class="powerchip"><img class="icon" src="assets/icon_shield.png" alt="">KALKAN x${shieldCharges}</span>`);
  if (survivedT < magnetUntil) chips.push(`<span class="powerchip"><img class="icon" src="assets/icon_magnet.png" alt="">MIKNATIS ${Math.ceil(magnetUntil - survivedT)}s</span>`);
  if (survivedT < multUntil) chips.push(`<span class="powerchip"><img class="icon" src="assets/icon_mult.png" alt="">x2 ${Math.ceil(multUntil - survivedT)}s</span>`);
  powerupsEl.innerHTML = chips.join('');
}

function applyPowerup(type) {
  sfx.power();
  if (type === 'shield') shieldCharges = Math.min(shieldCharges + 1, SHIELD_MAX);
  else if (type === 'magnet') magnetUntil = survivedT + MAGNET_DURATION;
  else if (type === 'mult') multUntil = survivedT + MULT_DURATION;
  refreshPowerupHud();
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
  shieldCharges = 0;
  magnetUntil = 0;
  multUntil = 0;
  hudPulseT = 0;
  shakeT = 0;
  spawnLog = [];
  spawnRng = dailyMode ? mulberry32(dailySeed()) : Math.random;
  shipGroup.rotation.set(0, 0, 0);
  obstacles.forEach(resetPoolMesh);
  orbs.forEach(resetPoolMesh);
  powerups.forEach(resetPoolMesh);
  trailData.forEach((p) => (p.life = 0));
  rings.forEach((ring, i) => (ring.position.z = -i * RING_SPACING));
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  newBestEl.classList.add('hidden');
  newDailyBestEl.classList.add('hidden');
  modeTagEl.classList.toggle('hidden', !dailyMode);
  bestEl.textContent = dailyMode ? `BUGÜN: ${Math.floor(loadDailyBest())}` : `EN İYİ: ${Math.floor(best)}`;
  hud.classList.add('visible');
  pauseBtn.classList.add('visible');
  refreshPowerupHud();
  sfx.engineStart();
}

function endGame() {
  state = 'gameover';
  hud.classList.remove('visible');
  pauseBtn.classList.remove('visible');
  finalScoreEl.textContent = Math.floor(score);
  if (dailyMode) {
    // Daily Challenge runs never touch the endless top-5 leaderboard — they
    // get their own per-day best score, kept separate so the two modes never mix.
    const prevDailyBest = loadDailyBest();
    const wasNewDailyBest = score > prevDailyBest;
    const dailyBest = wasNewDailyBest ? saveDailyBest(score) : prevDailyBest;
    dailyBestEndEl.textContent = dailyBest;
    dailyInfoEndEl.classList.remove('hidden');
    newDailyBestEl.classList.toggle('hidden', !wasNewDailyBest);
    newBestEl.classList.add('hidden');
    leaderboardEndEl.classList.add('hidden');
  } else {
    const wasNewBest = score > best;
    scores = saveScore(score);
    best = scores[0] || 0;
    if (wasNewBest) newBestEl.classList.remove('hidden');
    bestEl.textContent = `EN İYİ: ${Math.floor(best)}`;
    renderLeaderboard(scores);
    dailyInfoEndEl.classList.add('hidden');
    leaderboardEndEl.classList.remove('hidden');
  }
  gameOverScreen.classList.remove('hidden');
  triggerShake(0.3, 0.15);
  flash('#ff3b3b');
  sfx.crash();
  sfx.engineStop();
  joyEnd();
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  hud.classList.remove('visible');
  pauseScreen.classList.remove('hidden');
  sfx.engineStop();
  joyEnd();
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  pauseScreen.classList.add('hidden');
  hud.classList.add('visible');
  sfx.engineStart();
}

// ---------- Main loop ----------
const clock = new THREE.Clock();

function updatePlaying(dt) {
  survivedT += dt;
  speed = Math.min(MAX_SPEED, BASE_SPEED + survivedT * SPEED_RAMP);
  shipZ -= speed * dt;
  const mult = survivedT < multUntil ? 2 : 1;
  score += speed * dt * 1.1 * mult;
  scoreEl.textContent = Math.floor(score);
  sfx.engineSet(speed);

  // keyboard + joystick nudge the target continuously
  const kSpeed = 3.6;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) target.x -= kSpeed * dt;
  if (keys.has('ArrowRight') || keys.has('KeyD')) target.x += kSpeed * dt;
  if (keys.has('ArrowUp') || keys.has('KeyW')) target.y += kSpeed * dt;
  if (keys.has('ArrowDown') || keys.has('KeyS')) target.y -= kSpeed * dt;
  if (joyActive) {
    target.x += joyVec.x * kSpeed * dt;
    target.y -= joyVec.y * kSpeed * dt;
  }
  target.x = THREE.MathUtils.clamp(target.x, -PLAY_RADIUS, PLAY_RADIUS);
  target.y = THREE.MathUtils.clamp(target.y, -PLAY_RADIUS, PLAY_RADIUS);

  const ease = Math.min(1, dt * 8);
  const prevX = shipX, prevY = shipY;
  shipX += (target.x - shipX) * ease;
  shipY += (target.y - shipY) * ease;
  const velX = (shipX - prevX) / Math.max(dt, 0.0001);
  const velY = (shipY - prevY) / Math.max(dt, 0.0001);

  shipGroup.position.set(shipX, shipY, shipZ);
  shipGroup.rotation.x = THREE.MathUtils.clamp(velY * 0.06, -0.4, 0.4);
  shipSprite.material.rotation = THREE.MathUtils.clamp(velX * 0.11, -0.5, 0.5);
  shieldRing.visible = shieldCharges > 0;
  if (shieldRing.visible) shieldRing.rotation.z += dt * 1.6;

  // recycle rings
  for (const ring of rings) {
    if (ring.position.z > shipZ + RECYCLE_MARGIN) {
      ring.position.z -= RING_COUNT * RING_SPACING;
    }
  }

  // recycle stars the same way - without this the field spans only
  // STAR_SPAN of z, so 20-30 s into a run the ship passed every star and
  // the sky went permanently empty. 700 comparisons per frame is noise.
  {
    const positions = starGeo.attributes.position;
    let starsMoved = false;
    for (let i = 0; i < STAR_COUNT; i++) {
      if (positions.array[i * 3 + 2] > shipZ + RECYCLE_MARGIN) {
        positions.array[i * 3 + 2] -= STAR_SPAN;
        starsMoved = true;
      }
    }
    if (starsMoved) positions.needsUpdate = true;
  }

  // spawn obstacles / orbs / power-ups based on distance traveled
  distSinceSpawn += speed * dt;
  if (distSinceSpawn > nextSpawnAt) {
    distSinceSpawn = 0;
    nextSpawnAt = 1.7 + rand() * 1.1;
    const r = rand();
    if (r < 0.46) spawnFrom(obstacles, shipZ - SPAWN_AHEAD, 'obstacle');
    else if (r < 0.88) spawnFrom(orbs, shipZ - SPAWN_AHEAD, 'orb');
    else spawnPowerup(shipZ - SPAWN_AHEAD);
  }

  // update obstacles: recycle, shield-absorb, or collide
  for (const o of obstacles) {
    if (!o.active) continue;
    o.mesh.rotation.x += dt * 1.4;
    o.mesh.rotation.y += dt * 1.1;
    if (o.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(o); continue; }
    if (Math.abs(o.z - shipZ) < 0.85) {
      const dx = o.x - shipX, dy = o.y - shipY;
      const dist = Math.hypot(dx, dy);
      if (dist < COLLIDE_RADIUS) {
        if (shieldCharges > 0) {
          shieldCharges--;
          spawnBurst(o.x, o.y, o.z, 0.43, 1, 0.62, 14);
          resetPoolMesh(o);
          sfx.shieldHit();
          triggerShake(0.16, 0.22);
          flash('#6dff9e');
          refreshPowerupHud();
          continue;
        }
        endGame();
        return;
      } else if (!o.nearMissDone && dist < NEAR_MISS_RADIUS) {
        o.nearMissDone = true;
        score += NEAR_MISS_BONUS * mult;
        sfx.nearMiss();
      }
    }
  }

  // update orbs: magnet pull, recycle, collect, or pulse
  const magnetOn = survivedT < magnetUntil;
  for (const orb of orbs) {
    if (!orb.active) continue;
    orb.spawnT += dt;
    const pulse = 1 + Math.sin(orb.spawnT * 6) * 0.12;

    if (magnetOn) {
      const dx = shipX - orb.x, dy = shipY - orb.y, dz = shipZ - orb.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < MAGNET_RADIUS && dist > 0.001) {
        const pull = Math.min(1, dt * 6);
        orb.x += dx * pull;
        orb.y += dy * pull;
        orb.z += dz * pull;
      }
    }
    orb.mesh.position.set(orb.x, orb.y, orb.z);
    orb.mesh.scale.setScalar(pulse);

    if (orb.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(orb); continue; }
    if (Math.abs(orb.z - shipZ) < 0.9) {
      const dx = orb.x - shipX, dy = orb.y - shipY;
      if (Math.hypot(dx, dy) < ORB_RADIUS) {
        score += 45 * mult;
        sfx.collect();
        resetPoolMesh(orb);
      }
    }
  }

  // update power-ups: recycle, collect
  for (const p of powerups) {
    if (!p.active) continue;
    p.spawnT += dt;
    p.mesh.rotation.y += dt * 2;
    p.mesh.rotation.x += dt * 1.3;
    p.mesh.scale.setScalar(1 + Math.sin(p.spawnT * 5) * 0.12);
    if (p.z > shipZ + RECYCLE_MARGIN) { resetPoolMesh(p); continue; }
    if (Math.abs(p.z - shipZ) < 0.9) {
      const dx = p.x - shipX, dy = p.y - shipY;
      if (Math.hypot(dx, dy) < ORB_RADIUS) {
        applyPowerup(p.type);
        resetPoolMesh(p);
      }
    }
  }

  hudPulseT += dt;
  if (hudPulseT > 0.2) { hudPulseT = 0; refreshPowerupHud(); }

  // chase camera with a bit of lag + bank
  const camTargetX = shipX * 0.55;
  const camTargetY = shipY * 0.4 + 1.05;
  const camTargetZ = shipZ + 4.4;
  camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 5);
  camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 5);
  camera.position.z += (camTargetZ - camera.position.z) * Math.min(1, dt * 5);
  camera.lookAt(shipX, shipY, shipZ - 6);
  camera.rotation.z += (-velX * 0.05 - camera.rotation.z) * Math.min(1, dt * 4);

  if (shakeT > 0) {
    shakeT -= dt;
    const s = shakeMag * Math.max(0, shakeT);
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }

  updateTrail(dt);
}

function idleDrift(t) {
  shipGroup.position.set(Math.sin(t * 0.4) * 0.6, Math.cos(t * 0.3) * 0.3, 0);
  shipGroup.rotation.y += 0.006;
  shipGroup.rotation.z = Math.sin(t * 0.5) * 0.15;
  camera.position.set(0, 1.05, 4.4);
  camera.lookAt(0, 0, -6);
}

function animate() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const t = clock.getElapsedTime();
  adaptQuality(rawDt, t);

  starMat.uniforms.uTime.value = t;

  if (state === 'playing') updatePlaying(dt);
  else if (state !== 'paused') idleDrift(t);

  composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ---------- Debug hook (opt-in via ?debug=1, never shipped to normal players) ----------
// Exists solely so the Daily Challenge seeded RNG can be verified end-to-end
// (identical spawn sequence across two separate page loads on the same UTC
// day) without exposing a seed-override footgun to real players chasing the
// daily leaderboard.
if (new URLSearchParams(window.location.search).get('debug') === '1') {
  window.__novaDriftDebug = {
    startDaily(seed) {
      dailyMode = true;
      refreshDailyToggleUI();
      startGame();
      if (seed !== undefined) spawnRng = mulberry32(Number(seed));
    },
    getSpawnLog() { return spawnLog.slice(); },
    dailySeed,
    getRenderScale() { return renderScale; },
    nextRenderScale,
  };
}
