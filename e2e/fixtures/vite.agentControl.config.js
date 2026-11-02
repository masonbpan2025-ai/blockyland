import { defineConfig } from 'vite';
import { agentControlPlugin } from '../../server/agentControlVite.js';
// The dev server for e2e/agentControl.pw.js: its own port, with the plugin that tells Connect AI where the MCP script is.
export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  cacheDir: 'node_modules/.vite-agent-control',
  plugins: [agentControlPlugin()],
  server: { host: '127.0.0.1', port: 3027, strictPort: true, hmr: false, watch: { ignored: ['**/outputs/**'] } },
});
