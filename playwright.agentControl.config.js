import { defineConfig } from '@playwright/test';
// Agent Control end to end (e2e/agentControl.pw.js): the game on a dev server, the real MCP server and a scripted MCP
// client. Its own port, so a developer's dev server cannot answer it. PW_CHANNEL picks the browser (default chrome).
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');
const gpu = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-proxy-server', '--proxy-bypass-list=*'];
export default defineConfig({
  testDir: './e2e',
  testMatch: 'agentControl.pw.js',
  timeout: 420000,
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 10000 },
  use: { channel, headless: true, baseURL: 'http://127.0.0.1:3027', viewport: { width: 1280, height: 800 }, launchOptions: { args: gpu } },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.agentControl.config.js',
    url: 'http://127.0.0.1:3027',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
