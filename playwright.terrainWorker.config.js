import { defineConfig } from '@playwright/test';
// The terrain worker in a real browser (e2e/terrainWorker.pw.js): the module worker loads, is checked against the
// game, and takes the generation cost off the frame. Its own port, so a stale dev server cannot answer it.
// PW_CHANNEL picks the installed browser (default chrome); set it to "chromium" where only Playwright's own is installed.
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');
export default defineConfig({
  testDir: './e2e',
  testMatch: 'terrainWorker.pw.js',
  timeout: 600000,
  workers: 1,
  reporter: [['list']],
  use: {
    channel, headless: true, baseURL: 'http://127.0.0.1:3026', viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.terrainWorker.config.js',
    url: 'http://127.0.0.1:3026',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
