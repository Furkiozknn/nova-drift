// Dev-only test config - does not affect how the game itself is served or
// built. The site keeps loading directly as static HTML/CSS/JS.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  webServer: {
    command: 'python3 -m http.server 4174',
    url: 'http://localhost:4174/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  use: {
    baseURL: 'http://localhost:4174',
    // Point PW_CHROMIUM_PATH at an existing Chromium to skip the browser
    // download (sandboxes without egress); unset, Playwright uses its own.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
});
