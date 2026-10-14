import { defineConfig } from 'vite';
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: 3022, strictPort: true, hmr: false },
});
