// vendor/ is generated, and two things about it can go wrong silently.
//
// 1. IT CAN GO STALE. `package.json` pins three, `scripts/vendor-three.mjs`
//    copies it, and nothing connects the two. Bump the dependency without
//    re-running the script and the game ships the old Three.js while every
//    other file says otherwise - including vendor/README.md, which names a
//    version it no longer contains.
//
// 2. IT CAN LOSE THE FONT. vendor/ also holds `fonts/orbitron-latin.woff2`,
//    which styles.css loads and the vendor script knows nothing about. When
//    the script began by deleting the whole directory, running the command
//    vendor/README.md documents removed the font. Nothing caught it: the
//    font is declared with a full fallback stack and `font-display: swap`,
//    so the page kept loading, made no external request, logged no error,
//    and just stopped being Orbitron.
//
// Both checks run the real script into a throwaway directory, so neither
// touches the repository.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');
const SCRIPT = path.join(ROOT, 'scripts', 'vendor-three.mjs');

/** Every file under `dir`, as posix-ish relative paths, sorted. */
function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  }).sort();
}

function regenerate() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-vendor-'));
  execFileSync('node', [SCRIPT, out], { cwd: ROOT, stdio: 'pipe' });
  return out;
}

test('vendor/ is exactly what the script produces from the pinned three', () => {
  const out = regenerate();
  try {
    const generated = walk(out).filter((f) => !f.startsWith('fonts/'));
    const shipped = walk(VENDOR).filter((f) => !f.startsWith('fonts/'));
    expect(shipped).toEqual(generated);

    for (const rel of generated) {
      expect(
        fs.readFileSync(path.join(VENDOR, rel)).equals(fs.readFileSync(path.join(out, rel))),
        `vendor/${rel} differs from what scripts/vendor-three.mjs generates - re-run it`,
      ).toBe(true);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('the generated README names the version package.json actually resolves', () => {
  const installed = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', 'three', 'package.json'), 'utf8'),
  ).version;
  expect(fs.readFileSync(path.join(VENDOR, 'README.md'), 'utf8')).toContain(`three@${installed}`);
});

test('regenerating does not delete a sibling the script does not own', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-vendor-'));
  try {
    fs.mkdirSync(path.join(out, 'fonts'));
    fs.writeFileSync(path.join(out, 'fonts', 'orbitron-latin.woff2'), 'pretend font');
    // Also a stale file the script *does* own, to prove it still cleans up.
    fs.mkdirSync(path.join(out, 'jsm'), { recursive: true });
    fs.writeFileSync(path.join(out, 'jsm', 'gone.js'), '// removed in a later three');

    execFileSync('node', [SCRIPT, out], { cwd: ROOT, stdio: 'pipe' });

    expect(
      fs.existsSync(path.join(out, 'fonts', 'orbitron-latin.woff2')),
      'the vendor script deleted the font styles.css loads',
    ).toBe(true);
    expect(fs.existsSync(path.join(out, 'jsm', 'gone.js'))).toBe(false);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('the font styles.css asks for is actually in the repository', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const m = css.match(/src:\s*url\('([^']+)'\)/);
  expect(m, 'styles.css no longer declares a @font-face src').not.toBeNull();
  expect(fs.existsSync(path.join(ROOT, m[1]))).toBe(true);
});
