// The font has to actually arrive.
//
// styles.css declares Orbitron with a full fallback stack and
// `font-display: swap`, which is the right thing for a player on a slow
// connection and the wrong thing for a test suite: if the woff2 404s, the
// page still loads, makes no external request, logs no console error, and
// renders in Segoe UI. Every other spec in this directory stays green. The
// only signal is that the game stops looking like itself.
//
// That is not hypothetical - a `vendor/` regeneration used to delete the
// file (see test/vendor.spec.js). These two tests are what make that a
// failure instead of a mood.
const { test, expect } = require('@playwright/test');
const { sealToOrigin } = require('./fixtures');

test('the vendored woff2 is served, not 404', async ({ page, baseURL }) => {
  await sealToOrigin(page, baseURL);
  const fontResponses = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.woff2')) fontResponses.push([r.url(), r.status()]);
  });

  await page.goto('/index.html');
  await page.evaluate(() => document.fonts.ready);

  expect(fontResponses.length, 'the page never requested a woff2 at all').toBeGreaterThan(0);
  for (const [url, status] of fontResponses) {
    expect(status, `${url} did not load`).toBe(200);
  }
});

test('Orbitron is loaded and is what the HUD renders in', async ({ page, baseURL }) => {
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html');

  const state = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      faces: [...document.fonts].map((f) => `${f.family}:${f.status}`),
      usable: document.fonts.check('700 1rem Orbitron'),
      score: getComputedStyle(document.getElementById('score')).fontFamily,
    };
  });

  expect(state.faces).toContain('Orbitron:loaded');
  expect(state.usable, 'Orbitron did not load; the game is rendering in the fallback').toBe(true);
  expect(state.score).toContain('Orbitron');
});
