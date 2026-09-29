// Menu, pause, game-over, settings and first-run flows.
//
// Deaths are produced by driving the game frame by frame through the debug
// hook (manual mode) instead of waiting in real time: a run with no steering
// ends in a few simulated seconds, and the test does not depend on the CI
// machine's frame rate.
const { test, expect } = require('@playwright/test');
const { sealToOrigin } = require('./fixtures');

test.use({ locale: 'en-US' });

async function open(page, baseURL, query = '?debug=1') {
  await sealToOrigin(page, baseURL);
  await page.goto('/index.html' + query);
  await page.waitForSelector('#startBtn', { state: 'attached' });
  if (!query.includes('rec=1')) await page.waitForSelector('#startBtn', { state: 'visible' });
}

async function play(page) {
  await page.locator('#startBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/hidden/);
}

/** Step the simulation until the run ends (or `maxSeconds` pass); returns the final state. */
async function runToDeath(page, maxSeconds = 90) {
  return page.evaluate((max) => {
    const d = window.__novaDriftDebug;
    d.manual();
    for (let i = 0; i < max * 30; i++) {
      d.step(1 / 30, false);
      if (d.world().state === 'gameover') return { died: true, at: i / 30 };
    }
    return { died: false, at: max };
  }, maxSeconds);
}

test('start screen: one big PLAY, one how-to line, settings and daily are secondary', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.locator('#startBtn')).toHaveText('PLAY');
  await expect(page.locator('#settingsBtn')).toBeVisible();
  await expect(page.locator('#howLine')).toBeVisible();
  const play = await page.locator('#startBtn').boundingBox();
  const settings = await page.locator('#settingsBtn').boundingBox();
  expect(play.width).toBeGreaterThan(settings.width);
  expect(play.height).toBeGreaterThan(settings.height);
});

test('pause: Esc opens it, Resume closes it, Restart begins a fresh run', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await play(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pauseScreen')).not.toHaveClass(/hidden/);
  // the primary action owns focus, so Enter resumes without hunting for a button
  await expect(page.locator('#resumeBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pauseScreen')).toHaveClass(/hidden/);

  await page.waitForTimeout(700);
  await page.locator('#pauseBtn').click();
  await expect(page.locator('#pauseScreen')).not.toHaveClass(/hidden/);
  await page.locator('#pauseRestartBtn').click();
  await expect(page.locator('#pauseScreen')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
  expect(await page.evaluate(() => window.__novaDriftDebug.world().score)).toBeLessThan(20);
});

test('pause: Menu returns to the start screen', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await play(page);
  await page.keyboard.press('Escape');
  await page.locator('#menuBtn').click();
  await expect(page.locator('#startScreen')).not.toHaveClass(/hidden/);
  await expect(page.locator('#pauseScreen')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('idle');
});

test('game over: score, best, record stamp, TRY AGAIN focused, Enter retries', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await play(page);
  const res = await runToDeath(page);
  expect(res.died, 'an unsteered ship should crash').toBe(true);

  await expect(page.locator('#gameOverScreen')).toBeVisible();
  const final = Number(await page.locator('#finalScore').innerText());
  expect(final).toBeGreaterThan(0);
  await expect(page.locator('#bestLine')).toContainText(String(final));
  // first run ever on a clean profile: it is a record
  await expect(page.locator('#newBest')).toBeVisible();
  await expect(page.locator('#restartBtn')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#gameOverScreen')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
});

test('game over: a worse second run keeps the best score and hides the record stamp', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.addInitScript(() => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('novaDriftScores', JSON.stringify([99999]));
      localStorage.setItem('seeded', '1');
    }
  });
  await page.reload();
  await page.waitForSelector('#startBtn', { state: 'visible' });
  await play(page);
  await runToDeath(page);
  await expect(page.locator('#newBest')).toBeHidden();
  await expect(page.locator('#bestLine')).toContainText('99999');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('novaDriftScores'))[0])).toBe(99999);
});

test('game over: Menu goes back to the start screen', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await play(page);
  await runToDeath(page);
  await page.locator('#menuBtn2').click();
  await expect(page.locator('#startScreen')).not.toHaveClass(/hidden/);
  await expect(page.locator('#gameOverScreen')).toHaveClass(/hidden/);
});

test('settings: opens from the menu and from pause, sound toggle persists', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsScreen')).not.toHaveClass(/hidden/);
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#soundToggle').click();
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('novaDriftMuted'))).toBe('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsScreen')).toHaveClass(/hidden/);

  await play(page);
  await page.keyboard.press('Escape');
  await page.locator('#pauseSettingsBtn').click();
  await expect(page.locator('#settingsScreen')).not.toHaveClass(/hidden/);
  await page.locator('#settingsDoneBtn').click();
  // back on the pause card, the run is still paused
  await expect(page.locator('#pauseScreen')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('paused');
});

test('Space on the Settings button opens Settings instead of starting a run', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator('#settingsBtn').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#settingsScreen')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('idle');
});

test('keyboard focus is visible (outline ring)', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { id: el.id, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test('first run: a one-line hint and no rocks for the first seconds; second run is normal', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await play(page);
  await expect(page.locator('#hint')).toBeVisible();
  const first = await page.evaluate(() => {
    const d = window.__novaDriftDebug;
    d.manual();
    for (let i = 0; i < 3.8 * 30; i++) d.step(1 / 30, false);
    return d.getSpawnLog().map((s) => s.kind);
  });
  expect(first.length).toBeGreaterThan(3);
  expect(first).not.toContain('obstacle');

  // Second run in the same profile: rocks appear from the start.
  const second = await page.evaluate(() => {
    const d = window.__novaDriftDebug;
    // die, then start again through the real key path
    for (let i = 0; i < 90 * 30 && d.world().state !== 'gameover'; i++) d.step(1 / 30, false);
    return d.world().state;
  });
  expect(second).toBe('gameover');
  await page.keyboard.press('Enter');
  const kinds = await page.evaluate(() => {
    const d = window.__novaDriftDebug;
    for (let i = 0; i < 3.8 * 30; i++) d.step(1 / 30, false);
    return d.getSpawnLog().map((s) => s.kind);
  });
  expect(kinds).toContain('obstacle');
});

test('the hint does not show again after the first run', async ({ page, baseURL }) => {
  await open(page, baseURL);
  await play(page);
  await page.reload();
  await page.waitForSelector('#startBtn', { state: 'visible' });
  await play(page);
  await page.waitForTimeout(300);
  await expect(page.locator('#hint')).toBeHidden();
});

test('recording mode hides every piece of interface', async ({ page, baseURL }) => {
  await open(page, baseURL, '?debug=1&rec=1');
  await expect(page.locator('#startScreen')).toBeHidden();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  for (const sel of ['#hud', '#best', '#corner', '#hint']) {
    await expect(page.locator(sel)).toBeHidden();
  }
  expect(await page.evaluate(() => window.__novaDriftDebug.world().state)).toBe('playing');
});
