import { defineConfig } from '@playwright/test';
// Performance Mode and the render distance button, clicked in a real browser (e2e/graphicsSettings.pw.js).
// PW_CHANNEL picks the installed browser (default chrome); set it to "chromium" where only Playwright's own is installed.
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');
export default defineConfig({
  testDir: './e2e',
  testMatch: 'graphicsSettings.pw.js',
  timeout: 600000,
  workers: 1,
  reporter: [['list']],
  use: {
    channel, headless: true, baseURL: 'http://127.0.0.1:3028', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, // a laptop at 150% display scaling, where the resolution cap matters
    launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.graphics.config.js',
    url: 'http://127.0.0.1:3028',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
