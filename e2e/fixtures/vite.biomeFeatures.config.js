import { defineConfig } from 'vite';
export default defineConfig({
  optimizeDeps: { entries: ['index.html', 'biome-inspector.html'] },
  cacheDir: 'node_modules/.vite-biome-features',
  server: { host: '127.0.0.1', port: 3029, strictPort: true, hmr: false },
});
