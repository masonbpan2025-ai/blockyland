import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'survivalBot.pw.js',timeout:180000,workers:1,
  use:{channel:'chrome',headless:true,baseURL:'http://127.0.0.1:3016'},
  webServer:{command:'npx vite --config e2e/fixtures/vite.survival.config.js',url:'http://127.0.0.1:3016',reuseExistingServer:true,timeout:60000},
});
