// Input response, measured. Not a benchmark (CI machines differ) - a guard: if
// a change makes the ship react late, or makes a frame cost a lot more, this
// fails instead of the game just quietly feeling worse.
const { test, expect } = require('@playwright/test');
const { sealToOrigin } = require('./fixtures');

test.use({ locale: 'en-US' });

test('mouse move reaches the ship within 3 frames', async ({ page, baseURL }) => {
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html?debug=1');
  await page.locator('#startBtn').click();
  await page.waitForTimeout(900);

  const samples = [];
  for (let i = 0; i < 5; i++) {
    const ms = await page.evaluate(() => new Promise((resolve) => {
      const d = window.__novaDriftDebug;
      const x0 = d.world().shipX;
      const flip = window.innerWidth * (x0 > 0 ? 0.1 : 0.9);
      const t0 = performance.now();
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: flip, clientY: window.innerHeight / 2 }));
      const poll = () => {
        if (Math.abs(d.world().shipX - x0) > 0.002) resolve(performance.now() - t0);
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }));
    samples.push(ms);
    await page.waitForTimeout(250);
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log('input latency ms', samples.map((s) => s.toFixed(1)).join(' '), 'mean', mean.toFixed(1));
  // One frame is ~16.7 ms at 60 Hz; allow three for a loaded CI runner.
  expect(mean).toBeLessThan(50);
});

test('ship follows the pointer: 90% of a full-width move within 0.5 s', async ({ page, baseURL }) => {
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html?debug=1');
  await page.locator('#startBtn').click();
  await page.waitForTimeout(600);
  // Simulated time, so the number is the game's, not the machine's.
  const res = await page.evaluate(() => {
    const d = window.__novaDriftDebug;
    d.manual();
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: window.innerWidth, clientY: window.innerHeight / 2 }));
    const goal = d.world().targetX;
    let t = 0;
    for (let i = 0; i < 90; i++) {
      d.step(1 / 60, false);
      t += 1 / 60;
      if (d.world().state !== 'playing') return { dead: true };
      if (d.world().shipX >= goal * 0.9) return { t, goal };
    }
    return { t, goal, slow: true };
  });
  console.log('90% response s', res.t);
  expect(res.dead).toBeUndefined();
  expect(res.slow).toBeUndefined();
  expect(res.t).toBeLessThan(0.5);
});
