// Part 9: a Nether fortress. Blazes come from its spawners; kill blazes and collect blaze rods. (The fixture moves the
// player beside a blaze spawner with fighting gear: finding the fortress is the agents' job, not this test's.)
// timeout: 300
/* setup: (async () => {
  const P = fixture.P('Ada');
  if (server.dimensionOf(P).dimensionName !== 'the_nether') server.moveToDimension(P, 'nether', { x: 0, y: 40, z: 0 });
  const W = P.world, found = W.structures.engine.locate('fortress', Math.floor(P.player.position.x), Math.floor(P.player.position.z), { maxRadiusChunks: 64 });
  const b = found.start.box, bx = Array.isArray(b) ? { minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5] } : b;
  server.loadAround(server.dimensionOf(P), (bx.minX + bx.maxX) / 2, (bx.minZ + bx.maxZ) / 2, 8);
  let spawner = null;
  for (let x = bx.minX; x <= bx.maxX && !spawner; x++) for (let z = bx.minZ; z <= bx.maxZ && !spawner; z++) for (let y = 1; y < 63; y++) if (W.getVoxel(x, y, z) === BLOCKS_BY_NAME.SPAWNER) { spawner = { x, y, z }; break; }
  if (!spawner) throw new Error('no spawner in the fortress');
  let y = spawner.y; while (W.getVoxel(spawner.x + 2, y, spawner.z) !== 0 || W.getVoxel(spawner.x + 2, y + 1, spawner.z) !== 0) y++;
  fixture.tp('Ada', spawner.x + 2.5, y, spawner.z + 0.5);
  for (const [n, c] of [['iron_sword', 1], ['iron_helmet', 1], ['iron_chestplate', 1], ['iron_leggings', 1], ['iron_boots', 1], ['cooked_beef', 16], ['cobblestone', 32]]) fixture.give('Ada', n, c);
  P.player.health = 20; P.player.hunger = 20;
  window.fortressSpawner = spawner;
  return true;
})() */
const { goals } = require('mineflayer-pathfinder');
const mcData = require('minecraft-data')(bot.version);
for (const [n, d] of [['iron_helmet', 'head'], ['iron_chestplate', 'torso'], ['iron_leggings', 'legs'], ['iron_boots', 'feet']]) await bot.equip(bot.inventory.items().find(i => i.name === n), d);
await bot.equip(bot.inventory.items().find(i => i.name === 'iron_sword'), 'hand');
const spawner = bot.findBlock({ matching: mcData.blocksByName.spawner.id, maxDistance: 16 });
console.log('dimension', bot.game.dimension, 'spawner', spawner && spawner.position.toString());
const rods = () => bot.inventory.count(mcData.itemsByName.blaze_rod.id);
const t0 = Date.now(); let kills = 0, seenBlaze = false;
while (Date.now() - t0 < 240000 && rods() < 1) {
  if (bot.food < 14) { const f = bot.inventory.items().find(i => i.name === 'cooked_beef'); if (f) { await bot.equip(f, 'hand'); await bot.consume().catch(() => {}); await bot.equip(bot.inventory.items().find(i => i.name === 'iron_sword'), 'hand'); } }
  const b = bot.nearestEntity(e => e.name === 'blaze' && e.position.distanceTo(bot.entity.position) < 24);
  if (!b) { await bot.waitForTicks(20); continue; }
  seenBlaze = true;
  if (b.position.distanceTo(bot.entity.position) > 3.5) { await bot.pathfinder.goto(new goals.GoalNear(b.position.x, b.position.y, b.position.z, 2)).catch(() => {}); }
  if (b.position.distanceTo(bot.entity.position) <= 4.5) { try { await bot.attack(b); } catch (e) { console.log('attack', e.message); } }
  await bot.waitForTicks(13);
  if (!b.isValid) { kills++; await bot.waitForTicks(10); await global.collect(bot, 8); }
}
return { ok: rods() >= 1, rods: rods(), kills, seenBlaze, health: bot.health, dimension: bot.game.dimension };
