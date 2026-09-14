// English is the source language in the markup; a Turkish browser gets Turkish
// laid over it at load. Both halves need a test, because the failure mode is
// silent: a missing selector in the overlay leaves one English label sitting in
// an otherwise Turkish screen, and nobody running an English browser sees it.
const { test, expect } = require('@playwright/test');
const { serveLocalCdn } = require('./fixtures');

test.describe('English browser', () => {
  test('shows English and marks the document English', async ({ page }) => {
    await serveLocalCdn(page);
    await page.goto('/index.html');
    await expect(page.locator('#startBtn')).toHaveText('START');
    await expect(page.locator('.tagline')).toHaveText('survive a tunnel of light');
    await expect(page.locator('#dailyToggleBtn')).toHaveText('DAILY MODE: OFF');
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  });
});

test.describe('Turkish browser', () => {
  test.use({ locale: 'tr-TR' });

  test('every overlaid label is Turkish', async ({ page }) => {
    await serveLocalCdn(page);
    await page.goto('/index.html');
    await expect(page.locator('#startBtn')).toHaveText('BAŞLA');
    await expect(page.locator('.tagline')).toHaveText('bir ışık tünelinde hayatta kal');
    await expect(page.locator('#dailyToggleBtn')).toHaveText('GÜNLÜK MOD: KAPALI');
    expect(await page.locator('html').getAttribute('lang')).toBe('tr');
  });

  test('the game-over and pause screens are Turkish too', async ({ page }) => {
    await serveLocalCdn(page);
    await page.goto('/index.html');
    // These screens are hidden at load, so an overlay that only translated the
    // visible start screen would still pass the test above.
    await expect(page.locator('#gameOverScreen h2')).toHaveText('ÇARPIŞMA');
    await expect(page.locator('.pauseTitle')).toHaveText('DURAKLATILDI');
    await expect(page.locator('#restartBtn')).toHaveText('TEKRAR DENE');
    await expect(page.locator('#resumeBtn')).toHaveText('DEVAM ET');
  });

  test('the score label follows the language', async ({ page }) => {
    await serveLocalCdn(page);
    await page.goto('/index.html');
    await expect(page.locator('#best')).toContainText('EN İYİ');
  });
});
