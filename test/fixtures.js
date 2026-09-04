// Hermetic test fixtures.
//
// The page loads Three.js from unpkg and its font from Google Fonts. Fine in
// production; for the smoke test it means a CDN blip becomes a red CI run
// that has nothing to do with the game, and the suite is unusable on an
// offline or egress-restricted machine. So the tests serve those origins
// themselves: Three.js from the `three` devDependency (pinned to the version
// the import map names), the font stylesheet as an empty sheet (the page
// declares a full fallback stack). Nothing about how the game is built or
// shipped changes - only what the test browser talks to.
const fs = require('fs');
const path = require('path');

const THREE_ROOT = path.resolve(path.dirname(require.resolve('three')), '..');
const UNPKG_THREE = /^https:\/\/unpkg\.com\/three@[^/]+\/(.*)$/;
const CONTENT_TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function serveLocalCdn(page) {
  await page.route(UNPKG_THREE, async (route) => {
    const rest = UNPKG_THREE.exec(route.request().url())[1];
    const file = path.resolve(THREE_ROOT, rest);
    if (file !== THREE_ROOT && !file.startsWith(THREE_ROOT + path.sep)) {
      return route.fulfill({ status: 403, body: 'outside package' });
    }
    if (!fs.existsSync(file)) {
      return route.fulfill({ status: 404, body: 'not vendored: ' + rest });
    }
    await route.fulfill({
      status: 200,
      contentType: CONTENT_TYPES[path.extname(file)] || 'application/octet-stream',
      body: fs.readFileSync(file),
    });
  });
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 404, body: '' }));
}

module.exports = { serveLocalCdn };
