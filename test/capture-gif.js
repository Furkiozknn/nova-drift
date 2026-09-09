/**
 * Gerçek oynanıştan README için kare yakalar.
 *
 * Neden bir betik: README'deki hareketli görsel elle çekilirse her
 * güncellemede yeniden çekmek gerekir ve "bu gerçekten oyunun kendisi mi"
 * sorusunun cevabı kaybolur. Bu betik oyunu testlerin kullandığı aynı
 * hermetik kurulumla açar (three.js CDN'den değil, devDependency'den),
 * gerçekten oynar ve kareleri diske yazar. ffmpeg'e devri çağıran tarafta.
 *
 * Kullanım:  node test/capture-gif.js [cikti-dizini] [kare-sayisi]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { serveLocalCdn } = require('./fixtures');

const OUT = process.argv[2] || path.join(__dirname, '..', '.capture');
const FRAMES = Number(process.argv[3] || 56);
const PORT = 8799;

// Gemiyi gezdiren tuş programı: kısa basışlar, merkeze dönen bir salınım.
// İlk sürüm uzun basışlar kullanıyordu ve gemi 25. karede duvara giriyordu -
// README'ye "ÇARPIŞMA" ekranı düşüyordu. Kısa basış + geri dönüş, gemiyi
// tünelin ortasında tutuyor.
const PLAN = [
  ['ArrowLeft', 3], ['ArrowRight', 3], ['ArrowUp', 2], ['ArrowDown', 2],
  ['ArrowRight', 3], ['ArrowLeft', 3], ['ArrowDown', 2], ['ArrowUp', 2],
  ['ArrowLeft', 2], ['ArrowRight', 2], ['ArrowUp', 3], ['ArrowDown', 3],
  ['ArrowRight', 2], ['ArrowLeft', 2], ['ArrowDown', 2], ['ArrowUp', 2],
];

/**
 * Oyun bitti mi? Kayıt bittiği anda durmalı, yoksa README'ye ölüm ekranı düşer.
 *
 * `isVisible()` burada işe yaramıyor: `.overlay.hidden` yalnızca `opacity: 0`
 * ve `pointer-events: none` veriyor, `display: none` değil - Playwright de
 * opaklığı sıfır bir kutuyu "görünür" sayıyor. İlk sürüm bu yüzden her turda
 * sıfır kare topladı. Sınıfın kendisine bakmak tek doğru sinyal.
 */
async function oldu(page) {
  const sinif = await page.locator('#gameOverScreen').getAttribute('class').catch(() => 'hidden');
  return !(sinif || '').split(/\s+/).includes('hidden');
}

function serve() {
  const http = require('http');
  const root = path.join(__dirname, '..');
  const types = { '.html': 'text/html', '.js': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.svg': 'image/svg+xml' };
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('yok');
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    s.listen(PORT, '127.0.0.1', () => resolve(s));
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await serveLocalCdn(page);

  const hatalar = [];
  page.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForSelector('#startBtn', { state: 'visible' });
  await page.waitForTimeout(1200);          // sahne otursun

  // Birkaç tur dene, en uzun yaşayanı tut. Tek tur yeterli olmuyor: gemi
  // erken çarparsa elde 20 kare kalıyor ve GIF bir saniye sürüyor.
  const gecici = path.join(OUT, '_tur');
  let enIyi = { kare: 0, skor: '0' };
  for (let tur = 1; tur <= 6 && enIyi.kare < FRAMES; tur++) {
    fs.rmSync(gecici, { recursive: true, force: true });
    fs.mkdirSync(gecici, { recursive: true });
    if (tur > 1) {
      await page.reload();
      await page.waitForSelector('#startBtn', { state: 'visible' });
      await page.waitForTimeout(600);
    }
    await page.click('#startBtn');
    await page.waitForTimeout(900);         // ilk kareler bos olmasin

    let n = 0;
    for (const [tus, adet] of PLAN) {
      if (n >= FRAMES || await oldu(page)) break;
      await page.keyboard.down(tus);
      for (let i = 0; i < adet && n < FRAMES; i++) {
        if (await oldu(page)) break;
        await page.screenshot({ path: path.join(gecici, `k${String(n).padStart(3, '0')}.png`) });
        n++;
        await page.waitForTimeout(45);
      }
      await page.keyboard.up(tus).catch(() => {});
    }
    while (n < FRAMES && !(await oldu(page))) {
      await page.screenshot({ path: path.join(gecici, `k${String(n).padStart(3, '0')}.png`) });
      n++;
      await page.waitForTimeout(45);
    }
    const skor = (await page.locator('#score').textContent().catch(() => '0')) || '0';
    console.log(`  tur ${tur}: ${n} kare, skor ${skor.trim()}`);
    if (n > enIyi.kare) {
      for (const f of fs.readdirSync(OUT)) {
        if (f.startsWith('k') && f.endsWith('.png')) fs.rmSync(path.join(OUT, f));
      }
      for (const f of fs.readdirSync(gecici)) fs.copyFileSync(path.join(gecici, f), path.join(OUT, f));
      enIyi = { kare: n, skor: skor.trim() };
    }
  }
  fs.rmSync(gecici, { recursive: true, force: true });
  const n = enIyi.kare;
  const skor = enIyi.skor;
  await browser.close();
  server.close();

  if (hatalar.length) {
    console.error('KONSOL HATASI (kayit yine de alindi):');
    for (const h of hatalar.slice(0, 5)) console.error('  ' + h);
  }
  console.log(`${n} kare -> ${OUT}`);
  console.log(`kayit sonundaki skor: ${skor}`);
})().catch((e) => { console.error(e); process.exit(1); });
