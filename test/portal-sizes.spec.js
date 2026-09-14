// The portals state exact viewports a game must survive, and they are small.
//
// Poki requires 16:9 scaling to 640x360, 836x470 and 1031x580; CrazyGames
// requires phone and Chromebook play. A game that only ever ran in a desktop
// window passes none of these by luck - text overflows, buttons leave the
// viewport, the canvas letterboxes wrong - and every one of those is a
// rejection with no appeal.
//
// Checks the two things a reviewer checks first: can you start it, and does
// anything sit outside the window.
const { test, expect } = require('@playwright/test');
const { serveLocalCdn } = require('./fixtures');

const SIZES = [
  { name: 'poki-min 640x360', width: 640, height: 360 },
  { name: 'poki-mid 836x470', width: 836, height: 470 },
  { name: 'poki-max 1031x580', width: 1031, height: 580 },
  { name: 'phone landscape 667x375', width: 667, height: 375 },
  { name: 'phone portrait 375x667', width: 375, height: 667 },
];

/** Elements whose box leaves the viewport, which is what a reviewer sees. */
async function overflowing(page) {
  return page.evaluate(() => {
    const bad = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const el of document.querySelectorAll('button, #hud, .overlay, #score, #best')) {
      if (el.offsetParent === null && el.id !== 'hud') continue; // hidden screens
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // One pixel of tolerance: sub-pixel layout rounding is not a defect.
      if (r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1) {
        bad.push(`${el.id || el.className || el.tagName} ${JSON.stringify({
          l: Math.round(r.left), t: Math.round(r.top),
          r: Math.round(r.right), b: Math.round(r.bottom), w, h,
        })}`);
      }
    }
    return bad;
  });
}

for (const size of SIZES) {
  test(`starts and fits at ${size.name}`, async ({ page }) => {
    await serveLocalCdn(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/index.html');
    await expect(page.locator('#startBtn')).toBeVisible();

    const beforeStart = await overflowing(page);
    await page.locator('#startBtn').click();
    await page.waitForTimeout(1800);

    expect(Number(await page.locator('#score').innerText())).toBeGreaterThan(0);
    const duringPlay = await overflowing(page);

    expect(errors).toEqual([]);
    expect(
      [...beforeStart, ...duringPlay],
      `elements outside the ${size.width}x${size.height} viewport`,
    ).toEqual([]);
  });
}

test('canvas fills the window with no letterbox gap', async ({ page }) => {
  await serveLocalCdn(page);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/index.html');
  const box = await page.locator('#scene').boundingBox();
  // Poki asks for full-screen coverage; a canvas short of the window leaves a
  // band of page background that reads as a broken build.
  expect(Math.round(box.width)).toBe(640);
  expect(Math.round(box.height)).toBe(360);
});
