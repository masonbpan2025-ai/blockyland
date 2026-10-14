// The game and its introduction service in one small Node server, for putting a built game where friends can reach it.
//
//   npm run build && node server/shareServer.js            (or: npm run share)
//   PORT=8080 node server/shareServer.js
//
// It serves the built game from `dist/` and runs the rendezvous at /ws/share. Point a tunnel (Cloudflare Tunnel, ngrok,
// Tailscale Funnel) or a port forward at it, open the game at that public address, and "Host & Share World" produces a
// link anyone can click. Gameplay never passes through this server: it only introduces the players to each other.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShareRendezvous, SHARE_PATH } from './shareRendezvous.js';
import { lanAddresses } from './shareInfo.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolve a request path to a file under `root`, or null.
 * Refuses anything that leaves the folder, which is the whole point of being careful here.
 */
export function resolveStaticPath(root, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath.split('?')[0]); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const full = path.resolve(root, relative);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

export function createShareServer({ root = path.resolve('dist'), port = 8080 } = {}) {
  const rendezvous = createShareRendezvous();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/share/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, path: SHARE_PATH, ...rendezvous.stats() }));
      return;
    }
    if (url.pathname === '/api/share/info') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ path: SHARE_PATH, lan: lanAddresses(port) }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('Method not allowed'); return; }
    const file = resolveStaticPath(root, url.pathname);
    if (!file) { res.statusCode = 400; res.end('Bad request'); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.statusCode = 404; res.end('Not found'); return; }
      res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      // Hashed build assets never change; the pages themselves must be fetched fresh.
      res.setHeader('Cache-Control', /[\\/]assets[\\/].*-[\w-]{6,}\./.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
  server.on('upgrade', (req, socket, head) => {
    if (!rendezvous.handleUpgrade(req, socket, head)) socket.destroy();
  });
  return {
    server,
    rendezvous,
    listen: (listenPort = port, host = '0.0.0.0') => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, host, () => resolve(server.address().port));
    }),
    close: async () => {
      await rendezvous.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(process.env.GAME_DIR || 'dist');
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error(`No built game in ${root}. Run "npm run build" first.`);
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8080);
  const app = createShareServer({ root, port });
  const bound = await app.listen(port);
  console.log(`Minecraft in the browser, ready to share:`);
  console.log(`  this computer   http://localhost:${bound}/`);
  for (const lan of lanAddresses(bound)) console.log(`  same network    ${lan.url}`);
  console.log('Open the game, choose "Host World & Share", and send the link. For friends on other networks, expose this port');
  console.log('with a tunnel and open the game at that public address first, so the link points there.');
}
