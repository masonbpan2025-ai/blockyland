// Tests of the agents' safety kit (replication/agent/kit/safety.js) on a dev server, through the agents' own /run path:
//   node replication/tests/kit.mjs
// 1. safe.dig refuses a block that has lava beside it, and the block under your feet.
// 2. safe.hold walls the player off from an archer with blocks.
// 3. Hungry with bread in the inventory: the kit eats.
// 4. Teamwork: Ada, unarmed, is hit by a zombie; Bo, 12 blocks away with an iron sword, answers COMING and fights it.
// 5. Hurt to 11 HP, unarmed, a zombie beside you: the kit runs from it and calls HELP ... RUNNING in chat.
// 6. Hurt at full health holding dirt, a stone sword in the pack: it draws the sword and fights (dry8: Delphi swung a
//    dirt block at a skeleton 14 times, 1 damage a hit).
// 7. Attacked while a long program runs: the kit stops the program, so the agent's `bl run` returns at once (dry8: Aria
//    was shot dead 2.5 minutes into a 200 s ore script, the agent waiting on it).
// 8. A command line that chains programs (`bl eval a && bl eval b`, `bl eval a | filter; bl eval b`), attacked during a:
//    b never runs (bl exits 3; the server holds programs until `bl news`).
// 9-10. Unarmed and hurt, a zombie behind and a 6-deep pit (then a pond) straight ahead: the run goes around, never
//    dropping more than 3 blocks or stepping into water.
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const port = 7796, base = `http://127.0.0.1:${port}`;
rmSync(path.join(root, 'replication/runs/kittest'), { recursive: true, force: true });
const server = spawn(process.execPath, ['--max-old-space-size=8192', 'replication/server/run.mjs', '--run=replication/runs/kittest', `--port=${port}`, '--players=Ada,Bo', '--dev'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => server.stdout.on('data', d => { if (String(d).includes('ready:')) r(); }));
const page = async (code) => { const r = await fetch(`${base}/page`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j.value; };
const post = (pathname, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'POST', timeout: 0, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
    let t = ''; res.setEncoding('utf8'); res.on('data', d => { t += d; }); res.on('end', () => resolve(JSON.parse(t)));
  });
  req.on('error', reject); req.write(data); req.end();
});
// After the kit takes over, a player's programs are held until it reads `bl news` (runner.js): the test's own programs
// read the news first, as an agent does.
const news = async (player) => (await post('/news', { player })).output;
const run = async (player, code, timeout = 60) => { await news(player); return (await post('/run', { player, code, timeout })).output; };
// The agents' own CLI, as a shell command line (a chain of `bl` calls).
const blCmd = (args) => `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(root, 'replication/client/bl.mjs'))} ${args}`;
const shell = (line) => new Promise((resolve) => {
  const child = spawn(line, { shell: true, env: { ...process.env, BL_PLAYER: 'Ada', BL_SERVER: base } });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('close', (code) => resolve({ code, out }));
});
const chat = async () => (await (await fetch(`${base}/events?since=0`)).json()).events?.filter(e => e.kind === 'chat') ?? [];
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n${detail}`}`); };
// Put the players back: no mobs, full health, the given inventories, at the given offsets from the site.
// (until both kits are idle: a run by path takes up to ~14 s, and a kit that is still running ignores a new hit)
const settle = async () => {
  await new Promise(r => setTimeout(r, 2000));
  for (const n of ['Ada', 'Bo']) {
    for (let i = 0; i < 40 && /true/.test(await run(n, 'return !!(global.safe.fleeing || global.safe.responding)')); i++) await new Promise(r => setTimeout(r, 500));
    await run(n, 'Object.assign(global.safe, { lastHelp: 0, danger: null, coming: {}, responding: null }); bot.clearControlStates(); return 1');
  }
};
const reset = (setup) => page(`(() => { const O = server.dims.overworld; for (const m of O.mobs.mobs) m.health = 0;
  for (const [n, dx, items, held] of ${JSON.stringify(setup)}) { const P = server.players.get(n); P.inventory.clearAll(); for (const [it, c] of items) P.inventory.addItem(BLOCKS_BY_NAME[it.toUpperCase()] ?? it, BLOCKS_BY_NAME[it.toUpperCase()] !== undefined && !ITEMS_BY_NAME[it], c);
    P.player.health = 20; P.player.hunger = 20; P.player.position.set(site.x + dx + .5, site.y, site.z + .5); P.player.velocity.set(0, 0, 0); }
  return true; })()`);
// A zombie that does not burn in the sun (a helmet), beside a player.
const zombie = (dx, hp = 20) => page(`(() => { const O = server.dims.overworld; const m = O.mobs.spawnMob('zombie', site.x + ${dx} + .5, site.y, site.z + .5); m.health = ${hp}; m.equipment = { ...(m.equipment ?? {}), head: { id: 'iron_helmet' } }; m.helmet = 'iron_helmet'; window.z = m; return !!m; })()`);
const hurt = (n, hp) => page(`(() => { server.players.get('${n}').player.health = ${hp}; return true; })()`);
try {
  await page(`import('/src/blocks.js').then(m => { window.B = m.BLOCKS; window.BLOCKS_BY_NAME = m.BLOCKS; window.ITEMS_BY_NAME = m.ITEMS; return true; })`);
  // A flat cleared strip beside the spawn, daytime.
  await page(`(() => { const O = server.dims.overworld, W = O.world;
    const cx = Math.floor(server.worldSpawn.x) + 40, cz = Math.floor(server.worldSpawn.z), y = 30; server.loadAround(O, cx + 10, cz, 4);
    for (let x = cx - 12; x < cx + 30; x++) for (let z = cz - 10; z < cz + 10; z++) { for (let yy = y - 4; yy < y - 1; yy++) W.setVoxel(x, yy, z, B.DIRT); W.setVoxel(x, y - 1, z, B.GRASS_BLOCK); for (let yy = y; yy < 63; yy++) W.setVoxel(x, yy, z, 0); }
    server.worldTime = 2000; window.site = { x: cx, y, z: cz }; return true; })()`);
  await reset([['Ada', 0, [], null], ['Bo', 25, [], null]]);
  await run('Ada', 'await bot.waitForTicks(40); return 1');
  const kit = readFileSync(path.join(root, 'replication/agent/kit/safety.js'), 'utf8');
  const installed = await run('Ada', kit), installedBo = await run('Bo', kit);
  check('kit installs', /safety kit installed/.test(installed) && /safety kit installed/.test(installedBo), installed + installedBo);

  // the checks that need a quiet world first; the fights after, each starting from a settled kit
  // 1. safe.dig refuses a block beside lava, and the block underfoot
  await reset([['Ada', 0, [], null], ['Bo', 25, [], null]]);
  await page(`(() => { const W = server.dims.overworld.world; W.setVoxel(site.x + 3, site.y - 1, site.z, B.STONE); W.setVoxel(site.x + 4, site.y - 1, site.z, B.LAVA); return true; })()`);
  const dig = await run('Ada', `await bot.waitForTicks(10); const r = {};
    try { await global.safe.dig(bot.blockAt(bot.entity.position.floored().offset(3, -1, 0))); r.lava = 'dug'; } catch (e) { r.lava = e.message; }
    try { await global.safe.dig(bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))); r.under = 'dug'; } catch (e) { r.under = e.message; }
    return r`);
  check('safe.dig refuses a block beside lava', /lava next to/.test(dig), dig);
  check('safe.dig refuses the block under your feet', /under your feet/.test(dig), dig);

  // 2. walls off from an archer
  await reset([['Ada', 0, [['cobblestone', 16]], null], ['Bo', 25, [], null]]);
  await page(`(() => { const m = server.dims.overworld.mobs.spawnMob('skeleton', site.x + 6.5, site.y, site.z + .5); m.equipment = { ...(m.equipment ?? {}), head: { id: 'iron_helmet' } }; m.helmet = 'iron_helmet'; return true; })()`);
  const held = await run('Ada', `const s = bot.nearestEntity(e => e.name === 'skeleton'); const n = await global.safe.hold(s); const f = bot.entity.position.floored();
    return { n, wall: [bot.blockAt(f.offset(1, 0, 0))?.name, bot.blockAt(f.offset(1, 1, 0))?.name] }`, 30);
  check('safe.hold walls off the archer\'s side (feet and head)', /"wall":\["cobblestone","cobblestone"\]/.test(held), held);

  // 3. eats when hungry
  await reset([['Ada', 0, [['bread', 3]], null], ['Bo', 25, [], null]]); await hurt('Ada', 20); await page(`(() => { server.players.get('Ada').player.hunger = 10; return true; })()`);
  const ate = await run('Ada', `const t0 = Date.now(); while (Date.now() - t0 < 15000 && bot.food <= 10) await bot.waitForTicks(10); return { food: bot.food, log: global.safe.log.slice(-3) }`, 30);
  check('eats bread when food is 10', /ate bread/.test(ate), ate);

  // 4. teamwork: Bo (iron sword) answers Ada's HELP and fights the zombie
  await reset([['Ada', 0, [], null], ['Bo', 12, [['iron_sword', 1]], null]]);
  await run('Bo', 'global.safe.autoHelp = true; global.safe.danger = null; return 1');
  await run('Ada', 'global.safe.lastHelp = 0; global.safe.danger = null; return 1');
  await zombie(-2); await new Promise(r => setTimeout(r, 1000)); await hurt('Ada', 16);
  const t4 = Date.now(); let coming = null;
  while (Date.now() - t4 < 20000 && !coming) { coming = (await chat()).find(c => c.from === 'Bo' && /^COMING Ada/.test(c.text)); await new Promise(r => setTimeout(r, 500)); }
  check('Bo answers Ada\'s HELP: COMING', !!coming, JSON.stringify((await chat()).slice(-6)));
  const t4b = Date.now(); let hitByBo = false;
  while (Date.now() - t4b < 40000 && !hitByBo) { hitByBo = await page(`z.lastPlayerAttacker?.name === 'Bo'`); await new Promise(r => setTimeout(r, 500)); }
  for (let i = 0; i < 70 && !(await chat()).some(c => c.from === 'Bo' && /^(CLEAR|BACKING OFF|CAN'T REACH) Ada/.test(c.text)); i++) await new Promise(r => setTimeout(r, 1000));
  const boLog = await run('Bo', 'return { log: global.safe.log.slice(-5), responding: global.safe.responding, pos: bot.entity.position.floored().toString(), ada: bot.players.Ada?.entity?.position?.floored()?.toString(), z: Object.values(bot.entities).filter(e => e.name === "zombie").map(e => e.position.floored().toString()), held: bot.heldItem?.name }');
  check('... goes there and hits the zombie', hitByBo, boLog);
  const clear = (await chat()).find(c => c.from === 'Bo' && /^(CLEAR|BACKING OFF) Ada/.test(c.text));
  check('... and reports back (CLEAR or BACKING OFF)', !!clear || /helped Ada/.test(boLog), boLog);

  // 5. unarmed at 11 HP: run and call
  await settle();
  await reset([['Ada', 0, [], null], ['Bo', 25, [], null]]);
  await run('Bo', 'global.safe.autoHelp = false; return 1');
  await zombie(2); await hurt('Ada', 11);
  const fled = await run('Ada', `const x0 = bot.entity.position.x, t0 = Date.now();
    while (Date.now() - t0 < 10000 && !global.safe.log.some(l => l.includes('ran from'))) await bot.waitForTicks(5);
    await bot.waitForTicks(40); return { log: global.safe.log, dx: +(bot.entity.position.x - x0).toFixed(1) }`, 30);
  check('unarmed at 11 HP with a zombie: runs', /ran from zombie/.test(fled), fled);
  check('... and calls HELP ... RUNNING', (await chat()).some(c => c.from === 'Ada' && /^HELP zombie at .* RUNNING/.test(c.text)), JSON.stringify(await chat()));

  // 6. draws the sword before fighting back
  await settle();
  await reset([['Ada', 0, [['dirt', 16], ['stone_sword', 1]], null], ['Bo', 25, [], null]]);
  const inv5 = await run('Ada', `await bot.equip(bot.inventory.items().find(i => i.name === 'dirt'), 'hand'); global.safe.lastHelp = 0; return { held: bot.heldItem.name, items: bot.inventory.items().map(i => i.name + ' ' + i.slot), gear: global.safe.gear() }`);
  await zombie(1.5); await new Promise(r => setTimeout(r, 1000)); await hurt('Ada', 18);
  // (watched from outside: the kit stops any program that is running when it takes over)
  await new Promise(r => setTimeout(r, 8000));
  const fought = await run('Ada', `return { hp: bot.health, log: global.safe.log.slice(-5) }`, 30);
  console.log('   zombie after the fight:', await page('JSON.stringify({ hp: z.health, dead: z.dying || !server.dims.overworld.mobs.mobs.includes(z), armor: z.armor ?? z.armorValue ?? null })'));
  // (the sun burns zombies too: the server's record of who hit it is what counts)
  const zBy = await page('z.lastPlayerAttacker?.name ?? null');
  check('hurt holding dirt with a stone sword in the pack: draws the sword', /drew stone_sword against zombie/.test(fought), `${fought}\nbefore: ${inv5}`);
  check('... and fights the zombie with it', zBy === 'Ada', `last hit by ${zBy}; ${fought}`);

  // 7. a long program is stopped when the kit takes over
  await settle();
  await reset([['Ada', 0, [], null], ['Bo', 25, [], null]]);
  const long = run('Ada', 'const t0 = Date.now(); while (Date.now() - t0 < 60000) await bot.waitForTicks(10); return "ran to the end"', 90);
  await new Promise(r => setTimeout(r, 1500));
  const t3 = Date.now(); await zombie(2); await hurt('Ada', 7);
  const out3 = await long;
  check('attacked during a 60 s program: the kit stops it', /stopped by the safety kit/.test(out3) && Date.now() - t3 < 20000, out3.slice(0, 400));

  // 8. a command line that chains programs stops when the kit takes over: with `&&` (bl exits 3), and through a pipe
  //    and `;` (the next program is held until `bl news`). dry8: `bl run mine3.js && bl run collect.js | head -3`.
  const LONG = `"const t0 = Date.now(); while (Date.now() - t0 < 40000) await bot.waitForTicks(10); return 'first ran to the end'"`;
  const SECOND = `"return 'second ran'"`;
  const attack = async () => { await new Promise(r => setTimeout(r, 2500)); await zombie(2); await hurt('Ada', 7); };
  await settle();
  await reset([['Ada', 0, [], null], ['Bo', 25, [], null]]); await news('Ada');
  let line = shell(`${blCmd(`eval ${LONG} --timeout 60`)} && ${blCmd(`eval ${SECOND}`)}`);
  await attack();
  const chained = await line;
  check('`bl eval a && bl eval b`, attacked during a: bl exits 3 and b never runs', chained.code === 3 && /stopped by the safety kit/.test(chained.out) && !/second ran/.test(chained.out), `exit ${chained.code}\n${chained.out.slice(0, 600)}`);
  check('... and says to read `bl news` first', /bl news/.test(chained.out), chained.out.slice(0, 600));
  await settle();
  await reset([['Ada', 0, [], null], ['Bo', 25, [], null]]); await news('Ada');
  const passThrough = `${JSON.stringify(process.execPath)} -e "process.stdin.pipe(process.stdout)"`;
  line = shell(`${blCmd(`eval ${LONG} --timeout 60`)} | ${passThrough} ${process.platform === 'win32' ? '&' : ';'} ${blCmd(`eval ${SECOND}`)}`);
  await attack();
  const piped = await line;
  check('`bl eval a | filter; bl eval b`, attacked during a: b is held, not run', /not run: stopped by the safety kit/.test(piped.out) && !/returned: second ran/.test(piped.out), piped.out.slice(0, 800));
  const after = await news('Ada');
  check('... `bl news` shows the alert, and programs run again after it', /\[alert\] stopped by the safety kit/.test(after) && /returned: "?back to work/.test((await post('/run', { player: 'Ada', code: "return 'back to work'", timeout: 10 })).output), after.slice(0, 400));

  // 9-10. The run is a path, never a blind sprint: straight away from the zombie lies a 6-deep pit, then a 4-deep pond.
  //    dry10: the old sprint ran Corin into a pond at 2 HP and Basil off a roof.
  const site0 = await page('site');
  for (const [what, fill] of [['pit', 'AIR'], ['pond', 'WATER']]) {
    await settle();
    await reset([['Ada', 0, [], null], ['Bo', 25, [], null]]);
    // the hazard: 4 blocks wide and long, from 2 blocks east of Ada (a zombie's knockback alone does not reach it),
    // 6 deep (a pit) or 4 deep of water (a pond)
    await page(`(() => { const W = server.dims.overworld.world; for (let x = site.x + 2; x <= site.x + 5; x++) for (let z = site.z - 2; z <= site.z + 2; z++) for (let d = 1; d <= ${fill === 'AIR' ? 6 : 4}; d++) W.setVoxel(x, site.y - d, z, B.${fill}); return true; })()`);
    await run('Ada', 'await bot.waitForTicks(10); return 1');
    // a zombie that does not move or attack (NoAI): the test's own hit is the attack, so no chase knocks Ada about and
    // the check is of the path the kit picks
    await zombie(-2); await page('(() => { z.frozen = true; return true; })()'); await new Promise(r => setTimeout(r, 1000)); await hurt('Ada', 11);
    let lowest = Infinity, wet = false, far = 0, wetAt = null; const trace = [];
    for (let i = 0; i < 50; i++) {
      const s = await page(`(() => { const p = server.players.get('Ada').player; return [p.position.x - site.x - .5, p.position.y, p.position.z - site.z - .5, !!(p.inWater || p.isInWater || server.dims.overworld.world.getVoxel(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z)) === B.WATER)]; })()`);
      lowest = Math.min(lowest, s[1]); far = Math.max(far, Math.hypot(s[0], s[2]));
      if (s[3] && !wet) wetAt = s.slice(0, 3).map(v => +v.toFixed(1)); wet ||= s[3]; trace.push(s.slice(0, 3).map(v => Math.round(v)).join(','));
      await new Promise(r => setTimeout(r, 160));
    }
    const log = await run('Ada', 'return global.safe.log.slice(-3)');
    if (what === 'pit') check('runs from a zombie with a 6-deep pit ahead: never drops more than 3 blocks, and gets away', lowest >= site0.y - 3 && far >= 3, `lowest y ${lowest} (ground ${site0.y}), got ${far.toFixed(1)} away; ${log}`);
    else check('runs from a zombie with a pond ahead: never steps into the water, and gets away', !wet && far >= 3, `in water: ${wet} first at ${wetAt} (x, y, z from Ada's start; the pond is x 1.5..5.5, z -2.5..2.5), got ${far.toFixed(1)} away; path ${[...new Set(trace)].join(' ')}; ${log}`);
    // put the ground back
    await page(`(() => { const W = server.dims.overworld.world; for (let x = site.x + 2; x <= site.x + 5; x++) for (let z = site.z - 2; z <= site.z + 2; z++) { for (let d = 2; d <= 6; d++) W.setVoxel(x, site.y - d, z, B.DIRT); W.setVoxel(x, site.y - 1, z, B.GRASS_BLOCK); } return true; })()`);
  }

} finally {
  server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
