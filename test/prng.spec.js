// Direct, browser-free verification of the Daily Challenge seeded RNG's
// determinism (the actual property that makes daily score comparison valid).
// This mirrors mulberry32()/todayUTCStamp()/dailySeed() from script.js
// exactly - duplicated here rather than imported because script.js is a
// module with top-level Three.js/DOM side effects that need a real browser.
// If you change the RNG or seed derivation in script.js, mirror the change
// here too.
const { test, expect } = require('@playwright/test');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function todayUTCStamp(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
function dailySeed(date) {
  return Number(todayUTCStamp(date));
}

test('same UTC day produces identical sequences across independent RNG instances', () => {
  const day = new Date('2026-08-31T12:00:00Z');
  const rngA = mulberry32(dailySeed(day));
  const rngB = mulberry32(dailySeed(day));
  const seqA = Array.from({ length: 50 }, () => rngA());
  const seqB = Array.from({ length: 50 }, () => rngB());
  expect(seqB).toEqual(seqA);
});

test('same UTC day is stable regardless of time-of-day', () => {
  const morning = new Date('2026-08-31T00:00:01Z');
  const night = new Date('2026-08-31T23:59:59Z');
  expect(dailySeed(night)).toBe(dailySeed(morning));
});

test('different UTC days produce different sequences', () => {
  const day1 = new Date('2026-08-31T12:00:00Z');
  const day2 = new Date('2026-09-01T12:00:00Z');
  const seq1 = Array.from({ length: 20 }, mulberry32(dailySeed(day1)));
  const seq2 = Array.from({ length: 20 }, mulberry32(dailySeed(day2)));
  expect(seq2).not.toEqual(seq1);
});

test('output values stay within [0, 1)', () => {
  const rng = mulberry32(dailySeed(new Date()));
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});
