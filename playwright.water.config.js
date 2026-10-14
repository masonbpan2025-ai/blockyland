import { defineConfig } from '@playwright/test';
// The water suite: the bot-driven mechanics (waterBot.pw.js) and the frame-cost regression test
// (waterPerformance.pw.js). Its own port, so a stale server from another suite cannot answer it. The browser is
// given the real GPU (ANGLE on D3D11) because the regression test measures GPU work.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['waterBot.pw.js', 'waterPerformance.pw.js'],
  timeout: 900000,
  workers: 1,
  expect: { timeout: 10000 },
  use: {
    channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3023',
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.waterTest.config.js',
    url: 'http://127.0.0.1:3023',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
