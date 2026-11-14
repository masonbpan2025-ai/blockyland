// Part 10: Endermen and ender pearls. Three endermen near the player (fixture: spawning them is the world's job,
// finding them the agents'); provoke one by looking at it, kill it, collect the pearl (0-1 each, vanilla).
// timeout: 240
/* setup: (() => {
  const P = fixture.P('Ada'), O = server.dims.overworld;
  if (server.dimensionOf(P) !== O) { server.moveToDimension(P, 'overworld', { x: server.worldSpawn.x, y: server.worldSpawn.y, z: server.worldSpawn.z }); }
  P.player.position.set(server.worldSpawn.x, server.worldSpawn.y, server.worldSpawn.z);
  fixture.time(6000);
  for (let i = 0; i < 3; i++) server.as(P, () => O.mobs.spawnMob('enderman', server.worldSpawn.x + 6 + i * 3, server.worldSpawn.y + 1, server.worldSpawn.z + 4));
  if (!P.inventory.hotbar.concat(P.inventory.storage).some(s => s?.id === 'iron_sword')) fixture.give('Ada', 'iron_sword', 1);
  P.player.health = 20;
  return true;
})() */
const { goals } = require('mineflayer-pathfinder');
const mcData = require('minecraft-data')(bot.version);
await bot.waitForTicks(20);
await bot.equip(bot.inventory.items().find(i => i.name === 'iron_sword'), 'hand');
const pearls = () => bot.inventory.count(mcData.itemsByName.ender_pearl.id);
const t0 = Date.now(); let kills = 0;
while (Date.now() - t0 < 200000 && pearls() < 1) {
  const e = bot.nearestEntity(x => x.name === 'enderman' && x.position.distanceTo(bot.entity.position) < 40);
  if (!e) { console.log('no endermen left'); break; }
  if (e.position.distanceTo(bot.entity.position) > 3.5) await bot.pathfinder.goto(new goals.GoalNear(e.position.x, e.position.y, e.position.z, 2)).catch(() => {});
  await bot.lookAt(e.position.offset(0, 2.6, 0));
  if (e.position.distanceTo(bot.entity.position) <= 4.5) { try { await bot.attack(e); } catch {} }
  await bot.waitForTicks(13);
  if (!e.isValid) { kills++; await bot.waitForTicks(10); await global.collect(bot, 10); }
}
return { ok: pearls() >= 1, pearls: pearls(), kills, health: bot.health };
