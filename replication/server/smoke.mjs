// Smoke test of the server engine: start a world, add a player, let a few seconds pass, then break the nearest log
// with the game's own mining code and see it arrive in the inventory.
//   node replication/server/smoke.mjs
import { launchServerPage } from './launch.mjs';

const s = await launchServerPage({ onConsole: (k, m) => console.log(`[page ${k}]`, m.slice(0, 300)) });
try {
  console.log('started', s.started);
  const r = await s.page.evaluate(async () => {
    const server = window.server, P = server.addPlayer('Ada');
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) server.tick();
    const tickMs = (performance.now() - t0) / 100;
    const p = P.player.position;
    // the nearest log
    const W = P.world; let log = null, best = Infinity;
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) for (let y = 1; y < 63; y++) {
      const id = W.getVoxel(Math.floor(p.x) + x, y, Math.floor(p.z) + z), name = window.BLOCK_NAMES?.[id];
      if (id && /_LOG$/.test(server.blockKey(id))) { const d = x * x + z * z + (y - p.y) ** 2; if (d < best) { best = d; log = { x: Math.floor(p.x) + x, y, z: Math.floor(p.z) + z, id }; } }
    }
    if (!log) return { tickMs, error: 'no log near spawn', at: { ...p } };
    // stand next to it, look at it, hold the mouse
    P.player.position.set(log.x + 1.5, log.y, log.z + .5);
    for (let i = 0; i < 5; i++) server.tick();
    const eye = P.player.getEyePosition(), dx = log.x + .5 - eye.x, dy = log.y + .5 - eye.y, dz = log.z + .5 - eye.z;
    P.player.yaw = Math.atan2(-dx, -dz); P.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    P.isMouseDown = true;
    let broken = -1;
    for (let i = 0; i < 200; i++) { server.tick(); if (W.getVoxel(log.x, log.y, log.z) !== log.id) { broken = i; break; } }
    P.isMouseDown = false;
    for (let i = 0; i < 40; i++) server.tick();
    const items = [...(P.inventory.hotbar ?? []), ...(P.inventory.storage ?? [])].filter(Boolean).map(s => `${s.id}x${s.count}`);
    return { tickMs: +tickMs.toFixed(2), log, brokenAfterTicks: broken, target: P.targetBlock && { ...P.targetBlock }, items, health: P.player.health, events: window.serverEvents.slice(-8) };
  });
  console.log(JSON.stringify(r, null, 2));
  if (s.errors.length) console.log('page errors:', s.errors.slice(0, 10));
} finally { await s.close(); }
