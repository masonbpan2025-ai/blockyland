import { createMultiplayerServer } from './multiplayer.js';

export function multiplayerPlugin() {
  const install = async (vite, gamePort) => {
    const port = Number(process.env.MULTIPLAYER_PORT || Number(vite.config.server.port || 3000) + 1);
    // Vite reloads its config without waiting for HTTP close listeners. Reuse a
    // process-wide slot so the previous relay is fully closed before rebinding.
    const slot = Symbol.for('minecraft-in-browser.multiplayer-relay');
    await globalThis[slot]?.close();
    const relay = createMultiplayerServer({ gamePort });
    globalThis[slot] = relay;
    let failure;
    try { await relay.listen(port); }
    catch (error) { failure = error; console.error('[Multiplayer]', error.message); }
    vite.httpServer?.once('close', () => {
      if (globalThis[slot] === relay) delete globalThis[slot];
      void relay.close();
    });
    vite.middlewares.use(async (req, res, next) => {
      const requestUrl = new URL(req.url, 'http://localhost');
      if (!requestUrl.pathname.startsWith('/api/multiplayer/')) return next();
      res.setHeader('Content-Type', 'application/json');
      try {
        if (failure) throw failure;
        const upstream = await fetch(`http://127.0.0.1:${port}${requestUrl.pathname}${requestUrl.search}`, { signal: AbortSignal.timeout(10000) });
        const data = await upstream.json();
        if (requestUrl.pathname.endsWith('/health')) {
          const origin = new URL(`http://${req.headers.host || 'localhost:3000'}`);
          origin.port = String(port);
          data.clientUrl = process.env.MULTIPLAYER_CLIENT_URL || `${origin.origin}/`;
        }
        res.statusCode = upstream.status;
        res.end(JSON.stringify(data));
      } catch (error) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: `Multiplayer service unavailable: ${error.message}` }));
      }
    });
  };
  return {
    name: 'minecraft-multiplayer',
    configureServer: vite => install(vite, vite.config.server.port || 3000),
    configurePreviewServer: vite => install(vite, vite.config.preview.port || 4173),
  };
}
