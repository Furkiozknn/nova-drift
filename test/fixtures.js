// Hermetic test fixtures.
//
// This file used to answer unpkg requests from node_modules, because the page
// once imported Three.js from a CDN and its font from Google Fonts. Neither
// is true any more: `vendor/` holds both, and `index.html`'s import map
// points at `./vendor/`. So the routes were dead - and worse than dead. A
// fixture that quietly serves a CDN request is a fixture that hides the one
// regression this game cannot ship with: a portal rejects a game that fetches
// anything from another origin, and `node_modules` is not on the reviewer's
// machine. The CI run would stay green while the build became unshippable.
//
// So the fixture now does the opposite of what it did. Instead of supplying
// foreign origins, it cuts them off: every request that is not same-origin,
// `data:` or `blob:` is aborted, exactly as it would fail on a network where
// nothing but the game answers. Every spec that uses this therefore runs on
// the portal reviewer's network, and a reintroduced CDN import does not get
// papered over - it breaks the assertions that are already there.
//
// Nothing about how the game is built or shipped changes; only what the test
// browser is allowed to talk to.

/** Requests that never leave the machine, whatever the page is doing. */
function isLocal(url, origin) {
  return url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:');
}

/**
 * Seal `page` to its own origin.
 *
 * Returns the (live) array of external URLs that were attempted, so a caller
 * can assert on it; most callers do not need to, because a page that depends
 * on a foreign origin simply stops working.
 */
async function sealToOrigin(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const attempted = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (isLocal(url, origin)) return route.continue();
    attempted.push(url);
    return route.abort();
  });
  return attempted;
}

module.exports = { sealToOrigin, isLocal };
