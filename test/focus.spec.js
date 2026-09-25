// Losing focus mid-run.
//
// Keyboard steering is a Set of held key codes, filled on keydown and emptied
// on keyup. A keyup that happens while another window has focus never reaches
// the page, so alt-tabbing away with an arrow held used to leave that arrow
// "held" forever: the ship kept drifting into the wall after the player came
// back. And nothing paused the run, so a switch to another window cost the run.
//
// The game now pauses on window blur and when the tab is hidden, and forgets
// every held key when focus goes. These tests fail without that handling.
const { test, expect } = require('@playwright/test');
const { sealToOrigin } = require('./fixtures');

async function startRun(page, baseURL) {
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html?debug=1');
  await page.waitForSelector('#startBtn', { state: 'visible' });
  await page.click('#startBtn');
  await expect(page.locator('#startScreen')).toHaveClass(/hidden/);
}

test('window blur pauses a running game', async ({ page, baseURL }) => {
  await startRun(page, baseURL);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pauseScreen')).not.toHaveClass(/hidden/);

  // Paused means paused: the score does not move while focus is elsewhere.
  const before = await page.locator('#score').textContent();
  await page.waitForTimeout(600);
  await expect(page.locator('#score')).toHaveText(before);

  // And the ordinary resume path still works.
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseScreen')).toHaveClass(/hidden/);
});

test('a key held when focus is lost is released', async ({ page, baseURL }) => {
  await startRun(page, baseURL);
  await page.keyboard.down('ArrowLeft');
  expect(await page.evaluate(() => window.__novaDriftDebug.heldKeys())).toContain('ArrowLeft');

  // The keyup for this press would go to whatever window took focus.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.__novaDriftDebug.heldKeys())).toEqual([]);
  await page.keyboard.up('ArrowLeft');
});

test('hiding the tab pauses a running game', async ({ page, baseURL }) => {
  await startRun(page, baseURL);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#pauseScreen')).not.toHaveClass(/hidden/);
});

test('blur on the start screen changes nothing', async ({ page, baseURL }) => {
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html');
  await page.waitForSelector('#startBtn', { state: 'visible' });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pauseScreen')).toHaveClass(/hidden/);
  await expect(page.locator('#startScreen')).not.toHaveClass(/hidden/);
});
