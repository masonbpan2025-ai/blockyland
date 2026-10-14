import { defineConfig } from '@playwright/test';
// The status-effect suite gets its own port, so a stale server from another suite cannot answer it.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'effectCommand.pw.js',
  timeout: 600000,
  workers: 1,
  expect: { timeout: 10000 },
  use: {
    channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3019',
    launchOptions: { args: ['--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.effect.config.js',
    url: 'http://127.0.0.1:3019',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
