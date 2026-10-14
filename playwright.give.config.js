import { defineConfig } from '@playwright/test';
// A disposable, isolated server for the /give matrix. Port 3017 keeps it off the user's app on 3000 and
// off the existing Survival suite on 3016; `reuseExistingServer` is off so a stale server cannot answer
// the run with different code.
export default defineConfig({
  testDir: './e2e',
  // One config for the exercised command suites: they share an isolated server and the same proxy-bypass
  // requirement, and running them together amortizes the page build.
  testMatch: ['giveCommand.pw.js', 'brewCommand.pw.js'],
  // Generous: the fixture world and the ~700 page assets are built once per run, and Vite may still be
  // optimizing dependencies on the first request.
  timeout: 600000,
  workers: 1,
  expect: { timeout: 10000 },
  // `--no-proxy-server` matters on this machine: a system proxy otherwise intercepts even 127.0.0.1 and
  // the page never commits, which reads as a broken fixture rather than a network setting.
  use: {
    channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:3017',
    launchOptions: { args: ['--no-proxy-server', '--proxy-bypass-list=*'] },
  },
  webServer: {
    command: 'npx vite --config e2e/fixtures/vite.give.config.js',
    url: 'http://127.0.0.1:3017',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
