import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createProxyMiddleware } from 'mwc-proxy';
import mc from 'minecraft-protocol';
import { parseServerAddress } from '../src/multiplayer/serverAddress.js';

export const CLIENT_REVISION = '08495852bf08dbcadc4c9d870b733f5f2e0310a6';

export function clientInstalled(clientDir) {
  return fs.existsSync(path.join(clientDir, 'index.html')) && fs.existsSync(path.join(clientDir, 'static'));
}

export function createMultiplayerServer({ clientDir = path.resolve('.multiplayer-client'), ping = mc.ping, gamePort = 3000 } = {}) {
  const app = express();
  const server = http.createServer(app);
  const tcpSockets = new Set();
  const browsers = new Set();
  server.on('connection', socket => {
    browsers.add(socket);
    socket.once('close', () => browsers.delete(socket));
  });
  // This is a local relay, not an open network proxy. Reject cross-site requests,
  // including WebSocket upgrades; same-origin clients need no CORS allowance.
  const sameOrigin = req => !req.headers.origin || req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}`;
  server.prependListener('upgrade', (req, socket) => {
    if (!sameOrigin(req)) socket.destroy();
  });
  app.use((req, res, next) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Use the locally hosted multiplayer client.' });
    next();
  });
  app.get('/api/multiplayer/health', (req, res) => {
    res.json({ ready: clientInstalled(clientDir), revision: CLIENT_REVISION });
  });
  app.get('/api/multiplayer/status', async (req, res) => {
    let destination;
    try { destination = parseServerAddress(req.query.address); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const status = await ping({ host: destination.host, port: destination.port, closeTimeout: 8000, noPongTimeout: 5000 });
      res.json({ address: destination.address, version: status.version, players: status.players, latency: status.latency, description: status.description });
    } catch (error) {
      res.status(502).json({ error: `Could not reach ${destination.address}: ${error.code || error.message}` });
    }
  });
  app.get('/config.json', (req, res) => res.json({
    version: 1, defaultProxy: '', allowAutoConnect: false,
    defaultUsername: 'Player', promoteServers: [],
    splashText: 'Multiplayer', rightSideText: 'Minecraft Web Edition Multiplayer',
    defaultSettings: { renderDistance: 4 },
  }));
  app.get('/return-to-game', (req, res) => {
    const gameUrl = new URL(`http://${req.headers.host}`);
    gameUrl.port = String(gamePort);
    res.redirect(gameUrl.href);
  });
  // mwc-proxy handles binary TCP forwarding, SRV-aware browser connections,
  // Microsoft device-code authentication and Mojang session joining.
  const proxyHolder = express();
  app.use(proxyHolder);
  const mountProxy = () => proxyHolder.use(createProxyMiddleware({
    server, maxConnectionsPerIp: 5, metricsEndpoint: false,
    debugUrlEndpoint: false, authToggleDebugEndpoint: false,
    mwcCallbacks: {
      async handleConnectionRequest(req, res, handler) {
        try {
          const host = String(req.body.host || '');
          const parsed = parseServerAddress(`${host.includes(':') ? `[${host}]` : host}:${req.body.port}`);
          req.body.host = parsed.host;
          req.body.port = parsed.port;
        } catch (error) { res.status(400).json({ error: error.message }); return true; }
        // No upstream connection-time timer: close connections with the browser.
        await handler(undefined, undefined);
        return true;
      },
    },
  }, socket => {
    tcpSockets.add(socket);
    socket.once('close', () => tcpSockets.delete(socket));
  }));
  app.get('/', (req, res) => {
    if (!clientInstalled(clientDir)) return res.status(503).send('Multiplayer runtime missing. Run npm run multiplayer:setup.');
    // Self-host the upstream build without its hosted-site analytics tag.
    const html = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8')
      .replace(/<script[^>]*src="https:\/\/cloud\.umami\.is\/script\.js"[^>]*><\/script>/g, '')
      .replace('</body>', '<a href="/return-to-game" style="position:fixed;top:8px;left:8px;z-index:10002;color:white;background:#17251e;padding:8px 12px;font:14px system-ui;text-decoration:none;border:1px solid #80916e">← Main menu</a></body>');
    res.type('html').send(html);
  });
  app.use(express.static(clientDir, { dotfiles: 'deny' }));
  return {
    app, server,
    async listen(port = 3001, host = '127.0.0.1') {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      // Attach the WebSocket server after binding succeeds. The upstream WebSocket
      // server otherwise re-emits EADDRINUSE as an unhandled error.
      mountProxy();
      return server.address();
    },
    async close() {
      for (const socket of tcpSockets) socket.destroy();
      for (const socket of browsers) socket.destroy();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
  };
}
