// The Daily Challenge's one promise: two players, same UTC day, same run.
//
// This file used to re-declare mulberry32/todayUTCStamp/dailySeed and test
// the copy, with a comment asking whoever changed script.js to please change
// this file too. A test of a copy cannot fail when the original changes, so
// the property it was written to protect was exactly the one it could not
// protect - and the failure mode is silent: the daily leaderboard keeps
// comparing scores from different patterns.
//
// `rng.js` exists so this imports the module the page itself loads. It is a
// native ES module with no DOM and no Three.js in it, so Node can take it
// directly - no build step, which is the property this repository is
// otherwise built around.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

let rng;
test.beforeAll(async () => {
  rng = await import(pathToFileURL(path.resolve(__dirname, '..', 'rng.js')).href);
});

test('the module under test is the one index.html loads', () => {
  const fs = require('fs');
  const script = fs.readFileSync(path.resolve(__dirname, '..', 'script.js'), 'utf8');
  expect(script).toContain("from './rng.js'");
});

test('same UTC day produces identical sequences across independent RNG instances', () => {
  const day = new Date('2026-08-31T12:00:00Z');
  const a = rng.mulberry32(rng.dailySeed(day));
  const b = rng.mulberry32(rng.dailySeed(day));
  const left = Array.from({ length: 64 }, () => a());
  const right = Array.from({ length: 64 }, () => b());
  expect(left).toEqual(right);
});

test('same UTC day is stable regardless of time-of-day', () => {
  const morning = rng.dailySeed(new Date('2026-08-31T00:00:01Z'));
  const night = rng.dailySeed(new Date('2026-08-31T23:59:59Z'));
  expect(morning).toBe(night);
  expect(morning).toBe(20260831);
});

test('different UTC days produce different sequences', () => {
  const a = rng.mulberry32(rng.dailySeed(new Date('2026-08-31T12:00:00Z')));
  const b = rng.mulberry32(rng.dailySeed(new Date('2026-09-01T12:00:00Z')));
  expect(a()).not.toBe(b());
});

test('the day boundary is UTC, not local', () => {
  // 2026-08-31T23:30:00Z is already 1 September in Istanbul (UTC+3). If the
  // stamp ever used local time, these two would disagree and two players in
  // different zones would be told they were playing "today's" challenge while
  // getting different patterns.
  const late = new Date('2026-08-31T23:30:00Z');
  expect(rng.todayUTCStamp(late)).toBe('20260831');
  expect(rng.todayUTCStamp(new Date('2026-09-01T00:30:00Z'))).toBe('20260901');
});

test('the storage key is per-day and derived from the same stamp', () => {
  const day = new Date('2026-08-31T12:00:00Z');
  expect(rng.dailyStorageKey(day)).toBe('novaDriftDaily-20260831');
  expect(rng.dailyStorageKey(new Date('2026-09-01T12:00:00Z')))
    .not.toBe(rng.dailyStorageKey(day));
});

test('output values stay within [0, 1)', () => {
  // Reduced to two assertions rather than two per draw: an expect() call is
  // not free, and 200k of them turns a 20 ms property check into a hang.
  const r = rng.mulberry32(20260831);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 100000; i += 1) {
    const v = r();
    if (v < min) min = v;
    if (v > max) max = v;
  }
  expect(min).toBeGreaterThanOrEqual(0);
  expect(max).toBeLessThan(1);
});

test('the sequence is exactly the one shipped today', () => {
  // A regression pin. If mulberry32 is ever rewritten - for speed, for
  // clarity, by accident - this fails, and it should: today's pattern is a
  // number players compare scores against.
  const r = rng.mulberry32(20260831);
  const first = Array.from({ length: 4 }, () => Number(r().toFixed(12)));
  expect(first).toEqual([0.766194340773, 0.043016886571, 0.944347842131, 0.466169611085]);
});
