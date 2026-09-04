// Adaptive render scale: the decision function is mirrored here from
// script.js (same reason as prng.spec.js - script.js is a module with
// top-level Three.js/DOM side effects), and the live page is checked through
// the opt-in debug hook to confirm the same function is what ships.
const { test, expect } = require('@playwright/test');
const { serveLocalCdn } = require('./fixtures');

const RENDER_SCALE_MIN = 0.6;
function nextRenderScale(current, avgFrameMs) {
  if (avgFrameMs > 20 && current > RENDER_SCALE_MIN) {
    return Math.max(RENDER_SCALE_MIN, Math.round((current - 0.15) * 100) / 100);
  }
  if (avgFrameMs < 12.5 && current < 1) {
    return Math.min(1, Math.round((current + 0.1) * 100) / 100);
  }
  return current;
}

test('drops one notch per slow window and never below the floor', () => {
  let s = 1;
  const steps = [];
  for (let i = 0; i < 6; i++) { s = nextRenderScale(s, 30); steps.push(s); }
  expect(steps).toEqual([0.85, 0.7, 0.6, 0.6, 0.6, 0.6]);
});

test('recovers in smaller steps only when frames are comfortably fast', () => {
  expect(nextRenderScale(0.6, 11)).toBe(0.7);
  expect(nextRenderScale(0.95, 11)).toBe(1);
  expect(nextRenderScale(1, 11)).toBe(1);
});

test('the hysteresis band holds steady between 12.5 ms and 20 ms', () => {
  for (const ms of [12.5, 15, 16.7, 20]) {
    expect(nextRenderScale(0.85, ms)).toBe(0.85);
  }
});

test('the shipped page exposes the same decision function and a sane live scale', async ({ page }) => {
  await serveLocalCdn(page);
  await page.goto('/index.html?debug=1');
  await page.waitForTimeout(1500);
  const probe = await page.evaluate(() => ({
    fromLive: window.__novaDriftDebug.nextRenderScale(1, 30),
    scale: window.__novaDriftDebug.getRenderScale(),
  }));
  expect(probe.fromLive).toBe(0.85);
  expect(probe.scale).toBeGreaterThanOrEqual(0.6);
  expect(probe.scale).toBeLessThanOrEqual(1);
});
