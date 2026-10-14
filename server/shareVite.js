import { createShareRendezvous, SHARE_PATH } from './shareRendezvous.js';
import { lanAddresses } from './shareInfo.js';

/**
 * Attach world sharing to Vite's dev and preview servers.
 *
 * - `/ws/share` is the rendezvous: it introduces a guest to a host, then steps out of the way.
 * - `/api/share/info` tells the page which addresses other computers on the network can reach it at, so the host's
 *   share dialog can offer a link a friend on the same Wi-Fi can actually open.
 */
export function sharePlugin() {
  const attach = (server) => {
    const rendezvous = createShareRendezvous();
    server.httpServer?.on('upgrade', (req, socket, head) => {
      rendezvous.handleUpgrade(req, socket, head);
    });
    server.httpServer?.once('close', () => { void rendezvous.close(); });
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/api/share/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, path: SHARE_PATH, ...rendezvous.stats() }));
        return;
      }
      if (url.pathname === '/api/share/info') {
        const port = Number(url.port) || Number(server.config?.server?.port) || 3000;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ path: SHARE_PATH, lan: lanAddresses(port) }));
        return;
      }
      next();
    });
    return rendezvous;
  };
  return {
    name: 'minecraft-world-sharing',
    configureServer: (server) => { attach(server); },
    configurePreviewServer: (server) => { attach(server); },
  };
}
