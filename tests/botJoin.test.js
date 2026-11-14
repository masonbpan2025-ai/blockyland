// "Bot join" end to end, against a real SkyWars or Bed Wars host (tests/helpers/miniGameHost.js) over real sockets:
// - a house bot builds the arena itself from the map (agentArena/arenaWorld.mjs) and tells the host it needs no world, so
//   the host never stops to serialise one -- in the browser that froze the game for seconds while a Bed Wars bot joined;
//   a guest that does not say so still gets the world;
// - a bot host that is already loaded (agentArena/botHost.mjs, started by server/houseBotsVite.js) puts a bot in the
//   room, on its island or its team, in well under two seconds: it took nine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMiniGameHost } from './helpers/miniGameHost.js';
import { startBot, stopBot } from '../agentArena/botHost.mjs';
import { arenaBlocks } from '../agentArena/arenaWorld.mjs';
import { houseBotsPlugin } from '../server/houseBotsVite.js';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';
import { EventEmitter } from 'node:events';

const placed = (host, name, game, team) => {
  const p = [...(host.manager.match?.players?.values?.() ?? [])].find((q) => q.name === name);
  return Boolean(p && (game === 'skywars' ? p.slot !== null && p.slot !== undefined : p.team === team));
};

for (const game of ['skywars', 'bedwars']) {
  test(`${game}: a house bot builds the arena itself, and the host never serialises a world for it`, async (t) => {
    const host = await createMiniGameHost(game);
    t.after(() => host.close());
    const snapshots = [];
    host.session.on('request_snapshot', (e) => snapshots.push(e.peerName));
    const team = game === 'bedwars' ? 'blue' : null;
    const bot = await startBot({ name: 'ScriptedBot-1', code: host.code, game, team, ai: 'Scripted', url: host.shareUrl });
    t.after(() => stopBot('ScriptedBot-1'));
    for (let i = 0; i < 40 && !placed(host, 'ScriptedBot-1', game, team); i++) await host.tick(0.1);
    assert.ok(placed(host, 'ScriptedBot-1', game, team), game === 'bedwars' ? 'on the team it was sent to' : 'on an island');
    await host.tick(0.5);
    assert.deepEqual(snapshots, [], 'no world serialised for the bot');
    // Its world is the arena the host built from the same map, block for block.
    const want = arenaBlocks(game, host.manager.state?.map ?? host.manager.match.map);
    assert.ok(want.size > 500);
    let same = 0;
    for (const [k, id] of want) if (bot.voxels.get(k) === id) same++;
    assert.equal(same, want.size, `${same} of ${want.size} blocks`);

    // A guest that does not build its own world (an MCP agent's, a friend's game) is still sent it.
    const guest = new GuestPeerSession({ code: host.code, name: 'Friend', url: host.shareUrl, autopilot: false });
    t.after(() => guest.disconnect());
    await guest.connect({ timeoutMs: 15000, waitForSnapshot: false });
    for (let i = 0; i < 20 && !snapshots.length; i++) await host.tick(0.1);
    assert.deepEqual(snapshots, ['Friend']);
  });
}

test('with a bot host already loaded, "Bot join" puts a bot in the room in well under two seconds', async (t) => {
  const plugin = houseBotsPlugin();
  const httpServer = Object.assign(new EventEmitter(), { address: () => null });
  plugin.configureServer({ middlewares: { use() {} }, httpServer, config: { server: { port: 0 }, logger: { info() {} } } });
  t.after(() => httpServer.emit('close')); // the dev server closing stops every bot host
  const ready = plugin.warm();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the bot host did not load in 60 s')), 60000);
    ready.on('message', (m) => { if (m?.type === 'ready') { clearTimeout(timer); resolve(); } });
  });
  for (const game of ['bedwars', 'skywars']) {
    const room = await createMiniGameHost(game);
    t.after(() => room.close());
    const team = game === 'bedwars' ? 'red' : null;
    const t0 = Date.now();
    const r = plugin.join({ code: room.code, game, team, url: room.shareUrl });
    assert.ok(r.ok);
    let ms = null;
    for (let i = 0; i < 100 && ms === null; i++) { await room.tick(0.05, 0.05); if (placed(room, r.name, game, team)) ms = Date.now() - t0; }
    assert.ok(ms !== null && ms < 2000, `${game}: ${r.name} in the game after ${ms} ms`);
    // Wait for the next spare host to finish loading before the second game's join.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}, { timeout: 120000 });
