/**
 * Ham oynanis klibi: yazisiz, sessiz, dikey 1080x1920.
 *
 * Oyun `?rec=1` ile acilir (butun arayuz gizli: yalniz dunya gorunur) ve
 * `?debug=1` kancasiyla kare kare surulur: her kare tam 1/FPS saniye ilerler,
 * ardindan ekran goruntusu alinir. Boylece kayit makinenin hizina bagli degil;
 * yavas bir GPU'da da akici cikar. Oyun kodu aynen gonderilen kod.
 *
 * Oyuncu: bir "insan benzeri" pilot. Girdi gercek yoldan gelir (fare hareketi):
 *   - hedefi her karede secmez; 0,17 sn onceki karari uygular (tepki gecikmesi),
 *   - hedef noktaya dogrusal gitmez; el titremesi (iki kucuk sinus) eklenir,
 *   - kayalardan kacar, kurelere yonelir, ama kusursuz degil,
 *   - klibin ortasinda bir kayaya bilerek carpar (olum), sonra Bosluk ile yeniden baslar.
 *
 * Kullanim:
 *   node test/record-reel.js [kare-dizini] [saniye] [fps]
 * Sonra:
 *   ffmpeg -framerate 30 -i <dizin>/f%04d.jpg -c:v libx264 -pix_fmt yuv420p \
 *     -crf 17 -movflags +faststart -an cikti.mp4
 * PW_ARGS ortam degiskeni ek Chromium bayraklarini verir (gercek GPU icin
 * "--use-angle=d3d11 --ignore-gpu-blocklist").
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const OUT = process.argv[2] || path.join(__dirname, '..', '.capture');
const SECONDS = Number(process.argv[3] || 18);
const FPS = Number(process.argv[4] || 30);
const W = 1080, H = 1920;
const R = 2.25; // PLAY_RADIUS
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = path.posix.normalize('/' + decodeURIComponent(req.url.split('?')[0])); // '/' oneki: '..' kok disina cikamaz
      const f = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(buf);
      });
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// Deterministic hand tremor + candidate scoring.
function pickTarget(w, cur, dieNow) {
  const ahead = (o) => w.shipZ - o.z; // distance in front of the ship
  const rocks = w.obstacles.filter((o) => ahead(o) > -1 && ahead(o) < 30);
  if (dieNow) {
    const r = rocks.filter((o) => ahead(o) > 3).sort((a, b) => ahead(a) - ahead(b))[0];
    if (r) return { x: r.x, y: r.y };
  }
  let best = null, bestCost = Infinity;
  for (let gx = -R; gx <= R + 1e-6; gx += R / 5) {
    for (let gy = -R; gy <= R + 1e-6; gy += R / 5) {
      if (Math.hypot(gx, gy) > R) continue;
      let c = 0.22 * Math.hypot(gx - cur.x, gy - cur.y); // laziness: prefer small moves
      for (const o of rocks) {
        const d = Math.hypot(gx - o.x, gy - o.y);
        c += 9 * Math.exp(-(d * d) / (2 * 0.62 * 0.62)) / (0.35 + ahead(o) / 9);
      }
      for (const o of w.orbs.concat(w.powerups)) {
        const a = ahead(o);
        if (a < 0 || a > 26) continue;
        const d = Math.hypot(gx - o.x, gy - o.y);
        c -= 2.6 * Math.exp(-(d * d) / (2 * 0.55 * 0.55)) / (0.5 + a / 12);
      }
      c += 0.12 * Math.hypot(gx, gy); // drift back toward the middle
      if (c < bestCost) { bestCost = c; best = { x: gx, y: gy }; }
    }
  }
  return best;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html?debug=1&rec=1`;
  const browser = await chromium.launch({ args: (process.env.PW_ARGS || '').split(' ').filter(Boolean) });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US' });
  await ctx.addInitScript(() => { localStorage.setItem('novaDriftPlayed', '1'); });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__novaDriftDebug);
  await page.evaluate(() => window.__novaDriftDebug.manual());
  await page.waitForTimeout(500);

  const total = Math.round(SECONDS * FPS);
  const dieAt = Math.round(total * 0.6);
  const delay = Math.round(0.17 * FPS);
  const queue = [];
  let cur = { x: 0, y: 0 };
  let frame = 0, deadFor = 0, died = false;
  await page.keyboard.press('Space'); // begin
  const dt = 1 / FPS;
  while (frame < total) {
    const w = await page.evaluate((d) => { window.__novaDriftDebug.step(d); return window.__novaDriftDebug.world(); }, dt);
    if (w.state === 'playing') {
      queue.push(pickTarget(w, cur, frame >= dieAt && !died));
      if (queue.length > delay) cur = queue.shift();
      const t = frame / FPS;
      const tx = cur.x + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 13.1 + 1);
      const ty = cur.y + 0.05 * Math.sin(t * 6.1 + 2) + 0.03 * Math.sin(t * 11.7);
      const px = Math.min(W - 1, Math.max(0, (tx / R + 1) / 2 * W));
      const py = Math.min(H - 1, Math.max(0, (-ty / R + 1) / 2 * H));
      await page.mouse.move(px, py);
    } else if (w.state === 'gameover') {
      died = true;
      deadFor += 1;
      if (deadFor > Math.round(0.9 * FPS)) { await page.keyboard.press('Space'); deadFor = 0; queue.length = 0; cur = { x: 0, y: 0 }; }
    }
    await page.screenshot({ path: path.join(OUT, `f${String(frame).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
    frame += 1;
  }
  await browser.close();
  srv.close();
  console.log(`frames: ${frame} in ${OUT}; died mid-clip: ${died}`);
})();
