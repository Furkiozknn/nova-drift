/**
 * Ekran goruntuleri (README + kanit klasoru): baslangic, oyun ici, duraklat,
 * ayarlar, oyun sonu; masaustu ve mobil, EN ve TR.
 *
 * Kullanim: node test/capture-screens.js <cikti-dizini>
 * PW_ARGS ile ek Chromium bayraklari (gercek GPU: "--use-angle=d3d11 --ignore-gpu-blocklist").
 * Sayfa testlerdeki gibi kendi sunucusundan acilir; olum, hata ayiklama
 * kancasiyla (`?debug=1`) kare kare surulerek uretilir.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '.capture'));
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

async function die(page) {
  await page.evaluate(() => {
    const d = window.__novaDriftDebug;
    d.manual();
    for (let i = 0; i < 4000 && d.world().state !== 'gameover'; i++) d.step(1 / 30, false);
    d.step(1 / 30);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/index.html?debug=1`;
  const browser = await chromium.launch({ args: (process.env.PW_ARGS || '').split(' ').filter(Boolean) });
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });

  for (const [tag, vp, mobile] of [['masaustu', { width: 1280, height: 720 }, false], ['mobil', { width: 390, height: 844 }, true]]) {
    for (const locale of ['en-US', 'tr-TR']) {
      const l = locale.slice(0, 2);
      const ctx = await browser.newContext({ viewport: vp, locale, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
      const page = await ctx.newPage();
      await page.goto(base);
      await page.waitForSelector('#startBtn', { state: 'visible' });
      await page.waitForTimeout(1200);
      await shot(page, `${tag}-${l}-1-baslangic`);
      await page.locator('#settingsBtn').click();
      await page.waitForTimeout(500);
      await shot(page, `${tag}-${l}-5-ayarlar`);
      await page.locator('#settingsDoneBtn').click();
      await page.waitForTimeout(300);
      await page.locator('#startBtn').click();
      await page.waitForTimeout(1500);
      await shot(page, `${tag}-${l}-2-oyun-ilk-oyun`);
      if (!mobile) await page.keyboard.press('Escape');
      else await page.locator('#pauseBtn').click();
      await page.waitForTimeout(600);
      await shot(page, `${tag}-${l}-4-duraklat`);
      await page.locator('#resumeBtn').click();
      await page.waitForTimeout(1200);
      await die(page);
      await page.waitForTimeout(600);
      await shot(page, `${tag}-${l}-6-oyun-sonu`);
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
})();
