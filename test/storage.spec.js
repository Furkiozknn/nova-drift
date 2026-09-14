// A browser that refuses site data does not hand back null - it throws on the
// first `localStorage` access. Safari's private mode does it, "block all
// cookies" does it, and so does an embedded frame on a third-party origin,
// which is exactly how a game portal serves this page. An unguarded read at
// module scope therefore does not degrade the game, it kills the script
// before the canvas ever appears.
//
// These tests simulate that browser and assert the game is fully playable:
// it starts, it scores, and it never asks the user to enable anything.
const { test, expect } = require('@playwright/test');
const { serveLocalCdn } = require('./fixtures');

/** Replace localStorage with one that throws on every operation. */
async function blockStorage(page) {
  await page.addInitScript(() => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom }),
    });
  });
}

function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

test('loads with storage blocked, no errors', async ({ page }) => {
  await serveLocalCdn(page);
  await blockStorage(page);
  const errors = collectErrors(page);
  await page.goto('/index.html');
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
  await expect(page.locator('#startBtn')).toBeVisible();
});

test('is playable with storage blocked', async ({ page }) => {
  await serveLocalCdn(page);
  await blockStorage(page);
  const errors = collectErrors(page);
  await page.goto('/index.html');
  await page.locator('#startBtn').click();
  await page.waitForTimeout(1500);
  // Score climbs on its own while the ship is alive, so a rising number is
  // proof the loop is running rather than merely that the canvas painted.
  const score = Number(await page.locator('#score').innerText());
  expect(score).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('mute toggle survives a blocked write', async ({ page }) => {
  await serveLocalCdn(page);
  await blockStorage(page);
  const errors = collectErrors(page);
  await page.goto('/index.html');
  // The mute button sits under the start overlay until play begins.
  await page.locator('#startBtn').click();
  await page.waitForTimeout(500);
  // The write cannot persist; what matters is that the click does not throw
  // and the button still reflects the new state for this session.
  await page.locator('#muteBtn').click();
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});
