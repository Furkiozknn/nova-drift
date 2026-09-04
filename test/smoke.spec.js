// Dev-only smoke test - loads the live static page in a real browser and
// checks it renders without errors, in both default and prefers-reduced-motion
// modes, and that manifest.json is well-formed. Does not change how the game
// itself is built or served (still plain static HTML/CSS/JS, no bundler).
const { test, expect } = require('@playwright/test');
const { serveLocalCdn } = require('./fixtures');

function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

test('loads with no console errors (default motion)', async ({ page }) => {
  await serveLocalCdn(page);
  const errors = collectConsoleErrors(page);
  await page.goto('/index.html');
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
  await expect(page.locator('#startBtn')).toBeVisible();
});

test('loads with no console errors (prefers-reduced-motion: reduce)', async ({ page }) => {
  await serveLocalCdn(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = collectConsoleErrors(page);
  await page.goto('/index.html');
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
});

test('Daily Challenge toggle flips label and reveals today\'s best', async ({ page }) => {
  await serveLocalCdn(page);
  await page.goto('/index.html');
  const toggle = page.locator('#dailyToggleBtn');
  await expect(toggle).toHaveText('GÜNLÜK MOD: KAPALI');
  await expect(page.locator('#dailyInfoStart')).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveText('GÜNLÜK MOD: AÇIK');
  await expect(page.locator('#dailyInfoStart')).toBeVisible();
});

test('manifest.json is present and well-formed', async ({ page, request }) => {
  await serveLocalCdn(page);
  await page.goto('/index.html');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('manifest.json');

  const res = await request.get('/manifest.json');
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toBe('Nova Drift');
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThan(0);
});
