#!/usr/bin/env node
// Part-by-part parity tests of the replication server (PLAN.md, P4): each part is a Mineflayer-style program run
// through the same HTTP path the agents use, optionally after a setup step that prepares the world (a test fixture:
// give items, place the player). A part's program returns {ok, ...details}.
//
//   node replication/tests/parts.mjs                 every part, in order, one world
//   node replication/tests/parts.mjs wood stone       just these
// Report: replication/tests/report.json and the run folder replication/runs/parts/.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const here = import.meta.dirname, root = path.resolve(here, '..', '..');
const port = 7791, base = `http://127.0.0.1:${port}`;
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const seed = Number(process.argv.find(a => a.startsWith('--seed='))?.slice(7) ?? 20261103);
const partsDir = path.join(here, 'parts');
const parts = readdirSync(partsDir).filter(f => f.endsWith('.js')).sort().map(f => ({ id: f.replace(/^\d+-|\.js$/g, ''), file: path.join(partsDir, f) }))
  .filter(p => !only.length || only.includes(p.id));

rmSync(path.join(root, 'replication/runs/parts'), { recursive: true, force: true });
const server = spawn(process.execPath, ['--max-old-space-size=8192', 'replication/server/run.mjs', '--run=replication/runs/parts', `--port=${port}`, `--seed=${seed}`, '--players=Ada,Bo', '--dev'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let ready;
const readyP = new Promise(r => { ready = r; });
server.stdout.on('data', d => { const s = String(d); process.stdout.write(`[server] ${s}`); if (s.includes('ready:')) ready(); });
server.stderr.on('data', d => process.stdout.write(`[server!] ${d}`));
await readyP;

const page = async (code) => { const r = await fetch(`${base}/page`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j.value; };
// node:http for /run: fetch stops waiting after 300 s, and a part may run longer.
const run = (player, code, timeout) => new Promise((resolve, reject) => {
  const data = JSON.stringify({ player, code, timeout });
  const req = http.request({ host: '127.0.0.1', port, path: '/run', method: 'POST', timeout: 0, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
    let t = ''; res.setEncoding('utf8'); res.on('data', d => { t += d; }); res.on('end', () => { try { resolve(JSON.parse(t).output); } catch (e) { reject(e); } });
  });
  req.on('error', reject); req.write(data); req.end();
});

// Test fixtures, run in the server page.
await page(`window.fixture = {
  P: (n) => server.players.get(n),
  give(n, name, count = 1) {
    const P = this.P(n), up = name.toUpperCase();
    const isBlock = BLOCKS_BY_NAME[up] !== undefined && !ITEMS_BY_NAME[name];
    P.inventory.addItem(isBlock ? BLOCKS_BY_NAME[up] : name, isBlock, count);
    return true;
  },
  tp(n, x, y, z) { const p = this.P(n).player; p.position.set(x, y, z); p.velocity.set(0, 0, 0); return true; },
  clear(n) { this.P(n).inventory.clearAll(); return true; },
  set(n, x, y, z, name) { this.P(n).world.setVoxel(x, y, z, BLOCKS_BY_NAME[name.toUpperCase()]); return true; },
  time(t) { server.worldTime = t; return true; },
  /** A clean test site: a flat, cleared 20x20 grass area beside the spawn, monsters around it removed; the player is
      reset (empty inventory unless keep, full health and food) and stands in its middle. */
  site(n, { keep = false, day = true } = {}) {
    const P = this.P(n), O = server.dims.overworld, W = O.world, G = BLOCKS_BY_NAME.GRASS_BLOCK, D = BLOCKS_BY_NAME.DIRT;
    if (server.dimensionOf(P) !== O) server.moveToDimension(P, 'overworld', { x: server.worldSpawn.x, y: server.worldSpawn.y, z: server.worldSpawn.z });
    const cx = Math.floor(server.worldSpawn.x) + 40, cz = Math.floor(server.worldSpawn.z), y = 30;
    server.loadAround(O, cx, cz, 3);
    if (!window.siteBuilt) { for (let x = cx - 10; x < cx + 10; x++) for (let z = cz - 10; z < cz + 10; z++) { for (let yy = y - 4; yy < y - 1; yy++) W.setVoxel(x, yy, z, D); W.setVoxel(x, y - 1, z, G); for (let yy = y; yy < 63; yy++) W.setVoxel(x, yy, z, 0); } window.siteBuilt = true; }
    for (const m of O.mobs.mobs) { const p = m.mesh?.position; if (p && Math.abs(p.x - cx) < 40 && Math.abs(p.z - cz) < 40 && ['zombie','skeleton','creeper','spider','husk','drowned','witch','enderman','stray','slime','zombie_villager','cave_spider'].includes(m.type)) m.health = 0; }
    if (!keep) P.inventory.clearAll();
    P.player.health = 20; P.player.hunger = 20; P.player.isDead = false; P.player.statusEffects?.clear?.();
    this.tp(n, cx + .5, y, cz + .5);
    if (day) this.time(2000);
    window.site = { x: cx, y, z: cz };
    return true;
  },
};
true`).catch(async () => {
  // BLOCKS/ITEMS are module-scoped in the page: expose them for fixtures through a dynamic import.
});
await page(`import('/src/blocks.js').then(m => { window.BLOCKS_BY_NAME = m.BLOCKS; window.ITEMS_BY_NAME = m.ITEMS; return true; })`);

const report = [];
for (const part of parts) {
  const src = readFileSync(part.file, 'utf8');
  const setup = src.match(/\/\* setup:([\s\S]*?)\*\//)?.[1];
  const timeout = Number(src.match(/\/\/ timeout: (\d+)/)?.[1] ?? 180);
  const player = src.match(/\/\/ player: (\w+)/)?.[1] ?? 'Ada';
  const t0 = Date.now();
  let output = '', ok = false, error = null;
  try {
    // A clean client for each part: a program that timed out in the last part keeps running otherwise (as in
    // Mineflayer) and would steer this one. The helpers are put back on the fresh client's global.
    if (part.id !== 'helpers') for (const who of ['Ada', 'Bo']) await fetch(`${base}/reset-client?player=${who}`, { method: 'POST' });
    if (part.id !== 'helpers') await run(player, readFileSync(path.join(partsDir, '00-helpers.js'), 'utf8'), 30);
    if (setup) await page(setup);
    output = await run(player, src, timeout);
    const returned = output.match(/^returned: (.*)$/m)?.[1];
    const value = returned ? JSON.parse(returned) : null;
    ok = !!value?.ok;
  } catch (err) { error = String(err?.message ?? err); }
  const seconds = +((Date.now() - t0) / 1000).toFixed(1);
  report.push({ part: part.id, ok, seconds, error, output: output.slice(-4000) });
  console.log(`\n${ok ? 'PASS' : 'FAIL'} ${part.id} (${seconds} s)\n${output.split('\n').slice(-25).join('\n')}${error ? `\n${error}` : ''}`);
}
writeFileSync(path.join(here, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.filter(r => r.ok).length}/${report.length} parts passed`);
server.kill();
process.exit(0);
