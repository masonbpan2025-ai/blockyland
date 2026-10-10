import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'multiplayer.pw.js',
  timeout: 60000,
  workers: 1,
  use: { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3010', viewport: { width: 1280, height: 900 } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3010',
    env: { MULTIPLAYER_PORT: '3011' },
    url: 'http://127.0.0.1:3010/multiplayer.html',
    reuseExistingServer: true,
  },
});
