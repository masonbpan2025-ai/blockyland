import { defineConfig } from '@playwright/test';
// The crafting suite gets its own port, so a stale server from another suite cannot answer it.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'craftCommand.pw.js',
  timeout: 600000,
  workers: 1,
  expect: { timeout: 10000 },
  use: {
    channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3020',
    launchOptions: { args: ['--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.craft.config.js',
    url: 'http://127.0.0.1:3020',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
