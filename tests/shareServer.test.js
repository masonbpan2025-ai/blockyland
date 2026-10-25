// The standalone share server and the pieces around it: LAN addresses and safe static serving.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createShareServer, resolveStaticPath } from '../server/shareServer.js';
import { lanAddresses, isPrivateIPv4 } from '../server/shareInfo.js';
import { sharePlugin } from '../server/shareVite.js';

// --- LAN addresses --------------------------------------------------------------------------

test('only private IPv4 ranges are offered as addresses a friend on the network could use', () => {
  for (const ok of ['192.168.1.5', '10.0.0.7', '172.16.0.1', '172.31.255.254']) assert.equal(isPrivateIPv4(ok), true, ok);
  for (const no of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '169.254.1.1', '127.0.0.1', '192.169.0.1', 'fe80::1', '300.1.1.1x', '']) assert.equal(isPrivateIPv4(no), false, no);
});

test('lan addresses skip loopback, IPv6 and public addresses, and put the usual home network first', () => {
  const interfaces = () => ({
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    vpn: [{ address: '10.8.0.2', family: 'IPv4', internal: false }],
    wifi: [{ address: '192.168.1.20', family: 'IPv4', internal: false }, { address: 'fe80::1', family: 'IPv6', internal: false }],
    docker: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
    wan: [{ address: '203.0.113.9', family: 'IPv4', internal: false }],
    numeric: [{ address: '192.168.5.5', family: 4, internal: false }],
  });
  const found = lanAddresses(3000, { interfaces });
  assert.deepEqual(found.map((a) => a.address), ['192.168.1.20', '192.168.5.5', '10.8.0.2', '172.17.0.1']);
  assert.equal(found[0].url, 'http://192.168.1.20:3000/');
  assert.equal(found[0].name, 'wifi');
  assert.deepEqual(lanAddresses(3000, { interfaces: () => ({}) }), []);
  assert.deepEqual(lanAddresses(3000, { interfaces: () => undefined }), []);
});

// --- static files ---------------------------------------------------------------------------

test('a request path resolves inside the game folder or not at all', () => {
  const root = path.resolve('dist');
  assert.equal(resolveStaticPath(root, '/'), path.join(root, 'index.html'));
  assert.equal(resolveStaticPath(root, '/assets/app.js?v=1'), path.join(root, 'assets', 'app.js'));
  for (const attack of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/%2e%2e/etc/passwd', '/a/../../x', '/%00', '/..\\..\\x', '/%zz']) {
    const resolved = resolveStaticPath(root, attack);
    assert.ok(resolved === null || resolved.startsWith(root + path.sep) || resolved === root, `${attack} -> ${resolved}`);
    if (resolved) assert.ok(path.relative(root, resolved) && !path.relative(root, resolved).startsWith('..'), attack);
  }
  assert.equal(resolveStaticPath(root, '/../secret'), null);
  assert.equal(resolveStaticPath(root, '/%2e%2e/secret'), null);
  assert.equal(resolveStaticPath(root, '/%00'), null);
});

// --- the server -----------------------------------------------------------------------------

async function withServer(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-share-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>game</title>');
  fs.writeFileSync(path.join(root, 'assets', 'app-abcdef12.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, 'secret-sibling.txt'), 'inside');
  const outside = path.join(path.dirname(root), `outside-${path.basename(root)}.txt`);
  fs.writeFileSync(outside, 'private');
  const app = createShareServer({ root });
  const port = await app.listen(0, '127.0.0.1');
  try { await fn({ base: `http://127.0.0.1:${port}`, port, outside, root, app }); }
  finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { force: true }); }
}

test('the server serves the built game with the right types and caching', async () => {
  await withServer(async ({ base }) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.equal(page.headers.get('cache-control'), 'no-cache', 'pages are fetched fresh');
    assert.match(await page.text(), /<title>game<\/title>/);
    const asset = await fetch(`${base}/assets/app-abcdef12.js`);
    assert.match(asset.headers.get('content-type'), /javascript/);
    assert.match(asset.headers.get('cache-control'), /immutable/, 'hashed assets are cached for good');
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  });
});

test('the server will not serve anything outside the game folder', async () => {
  await withServer(async ({ base, outside }) => {
    const name = path.basename(outside);
    for (const attack of [`/../${name}`, `/..%2f${name}`, `/%2e%2e/${name}`, `/..%5c${name}`]) {
      const res = await fetch(`${base}${attack}`);
      const body = await res.text();
      assert.ok(!body.includes('private'), `${attack} leaked a file outside the folder`);
      assert.notEqual(res.status, 200, attack);
    }
  });
});

test('the server runs the introduction service and says what it is', async () => {
  await withServer(async ({ base, port }) => {
    const health = await (await fetch(`${base}/api/share/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.path, '/ws/share');
    const info = await (await fetch(`${base}/api/share/info`)).json();
    assert.equal(info.path, '/ws/share');
    assert.ok(Array.isArray(info.lan));
    const reply = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/share`);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'host', room: '4207' })));
      ws.on('message', (raw) => { resolve(JSON.parse(raw.toString())); ws.close(); });
      ws.on('error', reject);
    });
    assert.deepEqual(reply, { type: 'hosted', room: '4207' });
  });
});

test('other upgrade requests are refused', async () => {
  await withServer(async ({ port }) => {
    const result = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/not-ours`);
      ws.on('error', () => resolve('refused'));
      ws.on('open', () => resolve('open'));
    });
    assert.equal(result, 'refused');
  });
});

// --- the dev server plugin ------------------------------------------------------------------

test('the dev-server plugin attaches the service and its info endpoint to both dev and preview servers', async () => {
  const plugin = sharePlugin();
  assert.equal(typeof plugin.configureServer, 'function');
  assert.equal(typeof plugin.configurePreviewServer, 'function');
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    const upgrades = [];
    let middleware;
    const server = {
      httpServer: { on: (event, fn) => upgrades.push([event, fn]), once() {} },
      middlewares: { use: (fn) => { middleware = fn; } },
      config: { server: { port: 3000 } },
    };
    plugin[hook](server);
    assert.deepEqual(upgrades.map(([e]) => e), ['upgrade'], `${hook}: listens for upgrades`);
    const responses = {};
    const call = (url) => new Promise((resolve) => {
      let body = '';
      const res = { setHeader() {}, end: (text) => { body = text; resolve({ body, passedOn: false }); } };
      middleware({ url, headers: { host: 'localhost:3000' } }, res, () => resolve({ passedOn: true }));
    });
    responses.info = await call('/api/share/info');
    assert.ok(Array.isArray(JSON.parse(responses.info.body).lan), `${hook}: info lists LAN addresses`);
    assert.equal(JSON.parse((await call('/api/share/health')).body).ok, true);
    assert.equal((await call('/index.html')).passedOn, true, `${hook}: other requests go on to Vite`);
  }
});
