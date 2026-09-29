// The fonts have to actually arrive.
//
// styles.css declares Instrument Sans (text) and JetBrains Mono (labels) with
// a full fallback stack and `font-display: swap`, which is right for a player
// on a slow connection and wrong for a test suite: if a woff2 404s, the page
// still loads, makes no external request, logs no console error, and renders
// in Segoe UI. Every other spec stays green. The only signal is that the game
// stops looking like itself. These tests make that a failure instead of a mood.
const { test, expect } = require('@playwright/test');
const { sealToOrigin } = require('./fixtures');

test('every vendored woff2 is served, not 404', async ({ page, baseURL }) => {
  await sealToOrigin(page, baseURL);
  const fontResponses = [];
  page.on('response', (r) => {
    if (r.url().endsWith('.woff2')) fontResponses.push([r.url(), r.status()]);
  });

  await page.goto('/index.html');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  expect(fontResponses.length, 'the page never requested a woff2 at all').toBeGreaterThan(0);
  for (const [url, status] of fontResponses) {
    expect(status, `${url} did not load`).toBe(200);
  }
});

test('Instrument Sans and JetBrains Mono are loaded and are what the UI renders in', async ({ page, baseURL }) => {
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html');

  const state = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('700 1rem "Instrument Sans"'),
      document.fonts.load('400 1rem "Instrument Sans"'),
      document.fonts.load('700 1rem "JetBrains Mono"'),
    ]);
    return {
      faces: [...document.fonts].map((f) => `${f.family}:${f.weight}:${f.status}`),
      sans: document.fonts.check('700 1rem "Instrument Sans"'),
      mono: document.fonts.check('700 1rem "JetBrains Mono"'),
      score: getComputedStyle(document.getElementById('score')).fontFamily,
      tag: getComputedStyle(document.getElementById('best')).fontFamily,
    };
  });

  expect(state.faces.filter((f) => f.endsWith(':loaded')).length).toBe(3);
  expect(state.sans).toBe(true);
  expect(state.mono).toBe(true);
  expect(state.score).toContain('Instrument Sans');
  expect(state.tag).toContain('JetBrains Mono');
});

test('Turkish letters render from the vendored subset', async ({ page, baseURL }) => {
  // The subset keeps the Turkish letters; a missing glyph would fall back per letter.
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html');
  const ok = await page.evaluate(async () => {
    const sample = 'ışğİŞĞçöü';
    await document.fonts.load('700 1rem "Instrument Sans"', sample);
    return document.fonts.check('700 1rem "Instrument Sans"', sample);
  });
  expect(ok).toBe(true);
});
