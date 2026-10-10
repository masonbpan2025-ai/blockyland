import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'playerBot.pw.js', timeout: 90000, workers: 1,
  use: { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3012' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 3012 --strictPort', url: 'http://127.0.0.1:3012/', reuseExistingServer: true, timeout: 60000 }
});
