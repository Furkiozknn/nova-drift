// Readability floor for the palette: every text/background pair the UI uses is
// at least WCAG AA (4.5:1). The colours are read from styles.css and script.js
// themselves, so changing a token there without checking it fails here.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

const token = (name) => {
  const m = css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  if (!m) throw new Error('missing token --' + name);
  return m[1];
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => {
  const [r, g, b] = rgb(h).map((c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** `fg` at `alpha` over `bg`, as a hex colour. */
const over = (fg, bg, alpha) => {
  const f = rgb(fg), b = rgb(bg);
  return '#' + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
};

const ink = token('ink');
const paper = token('paper');

test('score-tier accents are readable on the dark game background', () => {
  const m = js.match(/const ACCENTS = \[([^\]]+)\]/);
  expect(m, 'ACCENTS not found in script.js').not.toBeNull();
  const accents = m[1].match(/#[0-9a-fA-F]{6}/g);
  expect(accents.length).toBeGreaterThanOrEqual(5);
  for (const a of accents) {
    expect(ratio(a, ink), `${a} on ${ink}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('button, card, tag and stamp pairs are readable', () => {
  const pairs = {
    'ink on cyan button': [ink, token('cyan')],
    'paper on ink (ghost button, title)': [paper, ink],
    'ink on paper (card)': [ink, paper],
    'ink on amber (record stamp)': [ink, token('amber')],
    'tag on dark (paper 78%)': [over(paper, ink, 0.78), ink],
    'tag on card (ink 82%)': [over(ink, paper, 0.82), paper],
    'how-to line (paper 86%)': [over(paper, ink, 0.86), ink],
    'amber leaderboard row on dark': [token('amber'), ink],
    'hint (ink on paper)': [ink, paper],
  };
  for (const [name, [fg, bg]] of Object.entries(pairs)) {
    expect(ratio(fg, bg), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  }
});
