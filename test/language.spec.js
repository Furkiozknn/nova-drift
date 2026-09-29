// English is the source language in the markup; a Turkish browser gets Turkish
// laid over it at load, and the player can switch in Settings. The failure
// mode is silent: a missing key leaves one English label in an otherwise
// Turkish screen, and nobody running an English browser sees it.
const { test, expect } = require('@playwright/test');
const { sealToOrigin } = require('./fixtures');

test.describe('English browser', () => {
  test.use({ locale: 'en-US' });

  test('shows English and marks the document English', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await page.goto('/index.html');
    await expect(page.locator('#startBtn')).toHaveText('PLAY');
    await expect(page.locator('#howLine')).toContainText('Steer with mouse');
    await expect(page.locator('#dailyToggleBtn')).toHaveText('DAILY MODE: OFF');
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
  });
});

test.describe('Turkish browser', () => {
  test.use({ locale: 'tr-TR' });

  test('every overlaid label is Turkish', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await page.goto('/index.html');
    await expect(page.locator('#startBtn')).toHaveText('OYNA');
    await expect(page.locator('#howLine')).toContainText('Fare, dokunmatik');
    await expect(page.locator('#settingsBtn')).toHaveText('AYARLAR');
    await expect(page.locator('#dailyToggleBtn')).toHaveText('GÜNLÜK MOD: KAPALI');
    expect(await page.locator('html').getAttribute('lang')).toBe('tr');
  });

  test('the game-over, pause and settings screens are Turkish too', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await page.goto('/index.html');
    // Hidden at load, so an overlay that only translated the visible start
    // screen would still pass the test above.
    await expect(page.locator('#goTitle')).toHaveText('KOŞU BİTTİ');
    await expect(page.locator('#pauseTitle')).toHaveText('DURAKLATILDI');
    await expect(page.locator('#restartBtn')).toHaveText('TEKRAR DENE');
    await expect(page.locator('#resumeBtn')).toHaveText('DEVAM ET');
    await expect(page.locator('#settingsDoneBtn')).toHaveText('TAMAM');
    await expect(page.locator('#menuBtn')).toHaveText('MENÜ');
  });

  test('the score label follows the language', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await page.goto('/index.html');
    await expect(page.locator('#best')).toContainText('EN İYİ');
  });
});

test.describe('language switch', () => {
  test.use({ locale: 'en-US' });

  test('Settings switches language live and remembers it under a new key', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await page.goto('/index.html');
    await page.locator('#settingsBtn').click();
    await page.locator('#langTr').click();
    await expect(page.locator('#startBtn')).toHaveText('OYNA');
    await expect(page.locator('#langTr')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('novaDriftLang'))).toBe('tr');
    await page.reload();
    await expect(page.locator('#startBtn')).toHaveText('OYNA');
    expect(await page.locator('html').getAttribute('lang')).toBe('tr');
    // An explicit choice beats the browser language.
    await page.locator('#settingsBtn').click();
    await page.locator('#langEn').click();
    await page.reload();
    await expect(page.locator('#startBtn')).toHaveText('PLAY');
  });

  test('a saved best score survives the redesign untouched', async ({ page, baseURL }) => {
    await sealToOrigin(page, baseURL);
    await page.addInitScript(() => {
      if (!localStorage.getItem('seeded')) {
        localStorage.setItem('novaDriftScores', JSON.stringify([1234, 500]));
        localStorage.setItem('seeded', '1');
      }
    });
    await page.goto('/index.html');
    await expect(page.locator('#best')).toContainText('1234');
    await expect(page.locator('#leaderboardStart')).toContainText('1234');
    // Switching language must not touch the score keys.
    await page.locator('#settingsBtn').click();
    await page.locator('#langTr').click();
    expect(await page.evaluate(() => localStorage.getItem('novaDriftScores'))).toBe('[1234,500]');
  });
});
