// Dev server only: tell the game where scripts/blockyland-mcp.mjs is, so Connect AI can show a setup command the
// player can paste as is. `configureServer` runs only for `vite` (dev), never in a build, so no local path is ever
// published. On the public site the panel shows a generic command instead.
import path from 'node:path';

export function agentControlPlugin() {
  return {
    name: 'blockyland-agent-control',
    configureServer(server) {
      server.middlewares.use('/__agent-control/setup', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ script: path.resolve('scripts/blockyland-mcp.mjs') }));
      });
    },
  };
}
