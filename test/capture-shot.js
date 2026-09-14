// Capture a gameplay still, for before/after comparison when changing the art.
//
//     node test/capture-shot.js <output.png> [ms-of-play] [width] [height]
//
// Uses the same local-CDN fixture the tests use, so it never depends on the
// network and the frame it captures is the frame CI would see.
const { chromium } = require('@playwright/test');
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
      `'.png':'image/png','.json':'application/json','.woff2':'font/woff2'};` +
      `h.createServer((q,s)=>{const u=decodeURIComponent(q.url.split('?')[0]);` +
      `const f2=p.join(${JSON.stringify(ROOT)},u==='/'?'/index.html':u);` +
      `if(!f.existsSync(f2))return s.writeHead(404).end();` +
      `s.writeHead(200,{'content-type':T[p.extname(f2)]||'application/octet-stream'});` +
      `f.createReadStream(f2).pipe(s);}).listen(${PORT});`,
  ], { stdio: 'ignore' });

  // Give the inline server a moment to bind before the browser asks for a page.
  await new Promise((r) => setTimeout(r, 600));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForSelector('#startBtn');
  await page.click('#startBtn');
  await page.waitForTimeout(PLAY_MS);
  await page.screenshot({ path: OUT });
  await browser.close();
  server.kill();
  console.log(`captured ${OUT}`);
})();
