// Advancement credit on a server with several players, through the agents' own /run path:
//   node replication/tests/credit.mjs
// 1. Ada (the first player) kills a zombie with her own hits; Bo stands 30 blocks away. "Monster Hunter" must be
//    Ada's. Before the fix, game events went to whichever player's tracker updated last (Bo, the last player), so dry8
//    logged Basil's skeleton kill as Delphi's.
// 2. Bo eats bread: "Husbandry" must be Bo's (before the fix it went to Ada, the player listed before him).
// 3. World-wide timers (phantoms' time since rest, the spawn cycle) advance once a tick with two players, and a
//    sleeper resets only their own time since rest.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const port = 7797, base = `http://127.0.0.1:${port}`;
rmSync(path.join(root, 'replication/runs/credittest'), { recursive: true, force: true });
const server = spawn(process.execPath, ['--max-old-space-size=8192', 'replication/server/run.mjs', '--run=replication/runs/credittest', `--port=${port}`, '--players=Ada,Bo', '--dev'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => server.stdout.on('data', d => { if (String(d).includes('ready:')) r(); }));
const page = async (code) => { const r = await fetch(`${base}/page`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j.value; };
const run = (player, code, timeout = 60) => new Promise((resolve, reject) => {
  const data = JSON.stringify({ player, code, timeout });
  const req = http.request({ host: '127.0.0.1', port, path: '/run', method: 'POST', timeout: 0, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
    let t = ''; res.setEncoding('utf8'); res.on('data', d => { t += d; }); res.on('end', () => resolve(JSON.parse(t).output));
  });
  req.on('error', reject); req.write(data); req.end();
});
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n${detail}`}`); };
try {
  await page(`import('/src/blocks.js').then(m => { window.B = m.BLOCKS; return true; })`);
  // A flat cleared strip beside the spawn at noon: Ada at one end, Bo 30 blocks away, no other mobs.
  await page(`(() => { const O = server.dims.overworld, W = O.world;
    const cx = Math.floor(server.worldSpawn.x) + 40, cz = Math.floor(server.worldSpawn.z), y = 30; server.loadAround(O, cx + 15, cz, 4);
    for (let x = cx - 6; x < cx + 40; x++) for (let z = cz - 6; z < cz + 6; z++) { for (let yy = y - 4; yy < y - 1; yy++) W.setVoxel(x, yy, z, B.DIRT); W.setVoxel(x, y - 1, z, B.GRASS_BLOCK); for (let yy = y; yy < 63; yy++) W.setVoxel(x, yy, z, 0); }
    for (const m of O.mobs.mobs) m.health = 0;
    for (const [n, dx] of [['Ada', 0], ['Bo', 32]]) { const P = server.players.get(n); P.inventory.clearAll(); P.player.health = 20; P.player.hunger = 20; P.player.position.set(cx + dx + .5, y, cz + .5); P.player.velocity.set(0, 0, 0); }
    server.worldTime = 6000; window.site = { x: cx, y, z: cz }; return true; })()`);
  await run('Ada', 'await bot.waitForTicks(40); return 1');
  // A weak zombie beside Ada (2 health: one punch), wearing a helmet so the noon sun does not kill it first.
  await page(`(() => { const O = server.dims.overworld; const m = O.mobs.spawnMob('zombie', site.x + 1.5, site.y, site.z + .5); m.health = 2; m.equipment = { ...(m.equipment ?? {}), head: { id: 'iron_helmet' } }; m.helmet = 'iron_helmet'; window.victim = m; return !!m; })()`);
  const fight = await run('Ada', `await bot.waitForTicks(5);
    for (let i = 0; i < 20; i++) { const me = bot.entity.position, z = bot.nearestEntity(e => e.name === 'zombie' && e.position.distanceTo(me) < 4); if (!z) break; try { await bot.attack(z); } catch {} await bot.waitForTicks(12); }
    await bot.waitForTicks(40);
    return 1`, 40);
  const dead = await page(`victim.health <= 0 || victim.dying || !server.dims.overworld.mobs.mobs.includes(victim)`);
  check('Ada kills the zombie', dead === true, fight);
  const events = await (await fetch(`${base}/events?since=0`)).json();
  const hunter = (events.events ?? events).filter(e => e.kind === 'advancement' && e.title === 'Monster Hunter');
  check('"Monster Hunter" is Ada\'s', hunter.length === 1 && hunter[0].player === 'Ada', JSON.stringify(hunter));
  check('... and not Bo\'s', !hunter.some(e => e.player === 'Bo'), JSON.stringify(hunter));

  // A meal: Bo eats bread. "Husbandry" (eat anything) must be Bo's. Before the fix a meal went to the player listed
  // before the eater (Ada), whose tracker had updated just before the eater's eating finished.
  await page(`(() => { const P = server.players.get('Bo'); P.inventory.addItem('bread', false, 2); P.player.hunger = 12; return true; })()`);
  const ate = await run('Bo', `const b = bot.inventory.items().find(i => i.name === 'bread'); await bot.equip(b, 'hand'); await bot.consume(); await bot.waitForTicks(20); return bot.food`, 30);
  const after = await (await fetch(`${base}/events?since=0`)).json();
  const meal = (after.events ?? after).filter(e => e.kind === 'advancement' && e.title === 'Husbandry');
  check('"Husbandry" is Bo\'s, who ate', meal.length === 1 && meal[0].player === 'Bo', ate + JSON.stringify(meal));

  // 3. World-wide timers advance once a tick, however many players there are. The spawn update ran once per player:
  //    with four players the phantoms' "time since rest" ran four times too fast (dry10-haiku: 42 phantoms from 15 min).
  const timers = () => page(`(() => { const S = server.dims.overworld.spawnManager, m = S.specialSpawners.phantom;
    return { ticks: server.ticks, rest: [...m.sinceRest.entries()].map(([k, v]) => [k?.username ?? k?.name ?? String(k), v]), spawnTicks: S.stats.spawnTicks }; })()`);
  const t0 = await timers();
  await run('Ada', 'await bot.waitForTicks(200); return 1', 30);
  const t1 = await timers();
  const dt = t1.ticks - t0.ticks, restGrowth = t1.rest.map(([, v], i) => v - (t0.rest[i]?.[1] ?? 0));
  check('each player\'s time since rest grows by one a tick (2 players, not 2 a tick)', t1.rest.length === 2 && restGrowth.every(g => Math.abs(g - dt) <= 2), `${dt} ticks; growth ${JSON.stringify(restGrowth)}; ${JSON.stringify(t1.rest)}`);
  check('... and the spawn cycle runs once a tick', Math.abs((t1.spawnTicks - t0.spawnTicks) - dt) <= 2, `${dt} ticks, ${t1.spawnTicks - t0.spawnTicks} spawn ticks`);
  // Ada sleeps (the bed's reset, as lying down calls it): only Ada's time since rest starts again.
  await page(`(() => { const P = server.players.get('Ada'); import('/src/bed.js').then(m => m.resetInsomnia(P)); return true; })()`);
  await run('Ada', 'await bot.waitForTicks(4); return 1', 10);
  const t2 = await timers();
  const ada = t2.rest.map(([, v]) => v).sort((a, b) => a - b);
  check('a sleeper\'s reset is the sleeper\'s alone', ada[0] < 50 && ada[1] > dt, JSON.stringify(t2.rest));
} finally {
  server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
