// Capture a gameplay still, for before/after comparison when changing the art
// and for the social-share card (`assets/og-preview.jpg`, 1200x630).
//
//     node test/capture-shot.js <output.png|.jpg> [ms-of-play] [width] [height]
//
// The page is sealed to its own origin with the same fixture the tests use,
// so the still never depends on the network. The game clock is Playwright's
// fake clock, advanced frame by frame, so "ms of play" is game time and the
// same on a fast GPU and on a software renderer. The browser runs in en-US:
// on a Turkish browser the game switches its HUD to Turkish.
const { chromium } = require('@playwright/test');
const { sealToOrigin } = require('./fixtures');
const { spawn } = require('node:child_process');
const path = require('node:path');

const OUT = process.argv[2] || 'shot.png';
const PLAY_MS = Number(process.argv[3] || 2600);
const W = Number(process.argv[4] || 1280);
const H = Number(process.argv[5] || 720);
const PORT = 8099;
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const server = spawn(process.execPath, [
    '-e',
    `const h=require('node:http'),f=require('node:fs'),p=require('node:path');` +
      `const T={'.js':'application/javascript','.css':'text/css','.html':'text/html',` +
      `'.png':'image/png','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'};` +
      `h.createServer((q,s)=>{const u=decodeURIComponent(q.url.split('?')[0]);` +
      `const f2=p.join(${JSON.stringify(ROOT)},u==='/'?'/index.html':u);` +
      `if(!f.existsSync(f2))return s.writeHead(404).end();` +
      `s.writeHead(200,{'content-type':T[p.extname(f2)]||'application/octet-stream'});` +
      `f.createReadStream(f2).pipe(s);}).listen(${PORT});`,
  ], { stdio: 'ignore' });

  // Give the inline server a moment to bind before the browser asks for a page.
  await new Promise((r) => setTimeout(r, 600));

  const browser = await chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage({ viewport: { width: W, height: H }, locale: 'en-US' });
  await sealToOrigin(page, `http://localhost:${PORT}`);
  await page.clock.install();
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForSelector('#startBtn');
  await page.clock.runFor(1200);
  await page.click('#startBtn');
  for (let t = 0; t < PLAY_MS; t += 40) await page.clock.runFor(40);
  const jpeg = /\.jpe?g$/i.test(OUT);
  await page.screenshot({ path: OUT, ...(jpeg ? { type: 'jpeg', quality: 82 } : {}) });
  await browser.close();
  server.kill();
  console.log(`captured ${OUT}`);
})();
