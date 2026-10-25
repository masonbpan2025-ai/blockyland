import { defineConfig } from '@playwright/test';

// Sharing a world between two real browsers (e2e/share.pw.js): real WebRTC, the real introduction service in the
// game's own dev server, and a link. Its own port, so a stale server from another suite cannot answer it.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['share.pw.js', 'shareDiagnostics.pw.js', 'sharePvp.pw.js', 'shareRelay.pw.js', 'pvpBots.pw.js', 'skywarsBots.pw.js'],
  // A cold dependency cache makes the first page load take a couple of minutes while Vite bundles; later loads are quick.
  timeout: 600000,
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    channel: 'chrome',
    headless: true,
    baseURL: 'http://127.0.0.1:3025',
    launchOptions: {
      // Keep the same WebRTC address masking and networking behavior as a normal Chrome session.
      args: [],
    },
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 3025 --strictPort',
    url: 'http://127.0.0.1:3025',
    reuseExistingServer: false,
    // Its own dependency cache, so it never fights another dev server over one.
    env: { VITE_CACHE_DIR: 'node_modules/.vite-share' },
    timeout: 300000,
  },
});
