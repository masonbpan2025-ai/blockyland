import { defineConfig } from '@playwright/test';
// Independent wiki-tutorial play-tests: the real game in headless Chrome, driven by the player bot.
// TUTORIALS=newcomer,shelters npx playwright test -c playwright.tutorials.config.js  (groups, or scenario ids)
export default defineConfig({
  testDir: './e2e', testMatch: 'tutorialPlaytest.pw.js', timeout: 1800000, workers: 1,
  use: { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3018' },
  webServer: { command: 'npx vite --config e2e/fixtures/vite.tutorials.config.js', url: 'http://127.0.0.1:3018', reuseExistingServer: true, timeout: 90000 },
});
