// The game must fetch nothing from another origin.
//
// This is the hard requirement every web game portal states and the one most
// easily broken by accident: a font link, a CDN import, an analytics snippet.
// Each looks harmless in a diff and each is a rejection.
//
// Deliberately does NOT use the serveLocalCdn fixture. That fixture answers
// unpkg requests from node_modules, which is right for the other tests but
// would hide exactly the regression this file exists to catch - the page
// would still work in CI while being unshippable.
const { test, expect } = require('@playwright/test');

/** Requests that never leave the machine, whatever the page is doing. */
function isLocal(url, origin) {
  return url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:');
}

test('loads without touching any other origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const external = [];
  page.on('request', (req) => {
    if (!isLocal(req.url(), origin)) external.push(req.url());
  });

  await page.goto('/index.html');
  await page.waitForTimeout(2000);
  await expect(page.locator('#startBtn')).toBeVisible();

  expect(external, `page requested another origin:\n  ${external.join('\n  ')}`)
    .toEqual([]);
});

test('plays through without touching any other origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const external = [];
  page.on('request', (req) => {
    if (!isLocal(req.url(), origin)) external.push(req.url());
  });

  await page.goto('/index.html');
  await page.locator('#startBtn').click();
  await page.waitForTimeout(2500);

  expect(Number(await page.locator('#score').innerText())).toBeGreaterThan(0);
  expect(external, `gameplay requested another origin:\n  ${external.join('\n  ')}`)
    .toEqual([]);
});

test('still plays when every other origin is unreachable', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  // Simulate the portal reviewer's network: nothing outside the game answers.
  await page.route('**/*', (route) =>
    isLocal(route.request().url(), origin) ? route.continue() : route.abort(),
  );

  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/index.html');
  await page.locator('#startBtn').click();
  await page.waitForTimeout(2500);

  expect(Number(await page.locator('#score').innerText())).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
