import { defineConfig } from 'vite';
// The tutorial play-tests' own server: no HMR, so an edit elsewhere in the repo cannot reload a page mid-scenario.
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: 3018, strictPort: true, hmr: false, watch: null },
});
