// Part 13: the End. Shoot the end crystals with a bow, fight the dragon (arrows in flight, the sword when it perches),
// kill it. Fixture: diamond gear, a bow with arrows, food, blocks. The paper's team needed 69 deaths and 14 hours;
// this test only shows that the fight can be won through the API (within its timeout, or it reports progress).
// timeout: 900
/* setup: (() => {
  const P = fixture.P('Ada');
  if (server.dimensionOf(P).dimensionName !== 'the_end') server.moveToDimension(P, 'the_end', { x: 20, y: 40, z: 0 });
  const E = server.dims.the_end; let y = 62; while (y > 1 && E.world.getVoxel(20, y - 1, 0) === 0) y--; P.player.position.set(20.5, y, 0.5); P.player.velocity.set(0, 0, 0);
  for (const [n, c] of [['diamond_sword', 1], ['bow', 1], ['arrow', 64], ['arrow', 64], ['arrow', 64], ['diamond_helmet', 1], ['diamond_chestplate', 1], ['diamond_leggings', 1], ['diamond_boots', 1], ['cooked_beef', 32], ['cobblestone', 64], ['golden_apple', 4]]) fixture.give('Ada', n, c);
  P.player.health = 20; P.player.hunger = 20;
  // This part tests the dragon fight: the End's Endermen (a real hazard there) are cleared and its spawning paused.
  const End = server.dims.the_end; End.spawnManager.update = () => {}; for (const m of End.mobs.mobs) if (m.type === 'enderman') m.health = 0;
  return true;
})() */
const { goals } = require('mineflayer-pathfinder');
const mcData = require('minecraft-data')(bot.version);
for (const [n, d] of [['diamond_helmet', 'head'], ['diamond_chestplate', 'torso'], ['diamond_leggings', 'legs'], ['diamond_boots', 'feet']]) { const it = bot.inventory.items().find(i => i.name === n); if (it) await bot.equip(it, d); }
await bot.waitForTicks(20);
console.log('dimension', bot.game.dimension, 'pos', bot.entity.position.floored().toString());
const eat = async () => { if (bot.food < 14 || bot.health < 10) { const f = bot.inventory.items().find(i => i.name === (bot.health < 10 ? 'golden_apple' : 'cooked_beef')) ?? bot.inventory.items().find(i => i.name === 'cooked_beef'); if (f) { await bot.equip(f, 'hand'); await bot.consume().catch(() => {}); } } };
async function shoot(target, height = 1) {
  await bot.equip(bot.inventory.items().find(i => i.name === 'bow'), 'hand');
  const d = target.position.distanceTo(bot.entity.position);
  await bot.lookAt(target.position.offset(0, height + d * d * 0.0012, 0));
  await bot.activateItem(); await bot.waitForTicks(22); await bot.deactivateItem();
}
const crystals = () => Object.values(bot.entities).filter(e => e.name === 'end_crystal');
const t0 = Date.now(); let shots = 0;
// 1. the crystals, from the ground
const inEnd = () => bot.game.dimension === 'the_end';
const freed = () => bot.received.some(m => /Free the End/.test(m.text));
while (Date.now() - t0 < 400000 && crystals().length && inEnd()) {
  await eat();
  const c = crystals().sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0];
  const flat = Math.hypot(c.position.x - bot.entity.position.x, c.position.z - bot.entity.position.z);
  if (flat > 24 || flat < 8) await bot.pathfinder.goto(new goals.GoalNearXZ(c.position.x + 12, c.position.z, 2)).catch(() => {});
  await shoot(c, 0.5); shots++;
  await bot.waitForTicks(10);
}
console.log('crystals left', crystals().length, 'shots', shots, 'health', bot.health);
// 2. the dragon
const dragon = () => bot.nearestEntity(e => e.name === 'ender_dragon');
while (Date.now() - t0 < 860000 && inEnd() && !freed()) {
  await eat();
  const d = dragon(); if (!d) { await bot.waitForTicks(20); continue; }
  const dist = d.position.distanceTo(bot.entity.position);
  if (dist < 5) { await bot.equip(bot.inventory.items().find(i => i.name === 'diamond_sword'), 'hand'); try { await bot.attack(d); } catch {} await bot.waitForTicks(13); }
  else if (dist < 60) { await shoot(d, 2); shots++; }
  else await bot.waitForTicks(20);
}
return { ok: freed(), freed: freed(), inEnd: inEnd(), crystalsLeft: crystals().length, dragonAlive: !!dragon(), shots, health: bot.health, minutes: +((Date.now() - t0) / 60000).toFixed(1) };
