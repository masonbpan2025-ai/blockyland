import { defineConfig } from '@playwright/test';
// The start-screen and world-lifecycle suite (e2e/worldStart.pw.js). Its own port, so a stale server from another
// suite cannot answer it.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'worldStart.pw.js',
  timeout: 900000,
  workers: 1,
  expect: { timeout: 10000 },
  use: {
    channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3024',
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.worldStart.config.js',
    url: 'http://127.0.0.1:3024',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
