import { defineConfig } from '@playwright/test';
// The start-screen click suite (e2e/startButtons.pw.js), run before every push and deploy by scripts/preflight.mjs.
// Its own port, so a stale dev server cannot answer it. PW_CHANNEL picks the installed browser (default chrome);
// set it to "chromium" where only Playwright's own browser is installed (CI).
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');
const gpu = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-proxy-server', '--proxy-bypass-list=*'];
export default defineConfig({
  testDir: './e2e',
  testMatch: 'startButtons.pw.js',
  timeout: 300000,
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 10000 },
  use: { channel, headless: true, baseURL: 'http://127.0.0.1:3025', viewport: { width: 1280, height: 800 } },
  projects: [
    { name: 'webgl', grep: /with WebGL/, use: { launchOptions: { args: gpu } } },
    { name: 'no-webgl', grep: /without WebGL/, use: { launchOptions: { args: ['--disable-3d-apis', '--no-proxy-server'] } } },
  ],
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.startButtons.config.js',
    url: 'http://127.0.0.1:3025',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
