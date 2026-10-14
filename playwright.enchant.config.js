import { defineConfig } from '@playwright/test';
// The enchanting suite gets its own port so it can run without disturbing the other command suites, and so
// a stale server on 3017 cannot answer it with different code. Same proxy-bypass requirement as the others.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'enchantCommand.pw.js',
  timeout: 600000,
  workers: 1,
  expect: { timeout: 10000 },
  use: {
    channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3018',
    launchOptions: { args: ['--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.enchant.config.js',
    url: 'http://127.0.0.1:3018',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
