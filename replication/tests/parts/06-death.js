// Part 6: death. The player dies (fixture), drops everything where it died, respawns at its bed; it walks back and
// picks its things up again.
// timeout: 150
/* setup: (() => { fixture.site('Ada', { keep: true, day: false }); fixture.give('Ada', 'cobblestone', 10); fixture.give('Ada', 'stick', 5); const P = fixture.P('Ada'); P.player.isSleeping = false; fixture.tp('Ada', site.x + 4.5, site.y, site.z + 4.5); P.player.takeDamage(1000, null, 'generic'); return true; })() */
const { goals } = require('mineflayer-pathfinder');
await bot.waitForTicks(10);
const deathMsg = bot.received.find(m => m.kind === 'death');
const atRespawn = bot.spawnPoint ? bot.entity.position.distanceTo(bot.spawnPoint) : null;
const before = bot.inventory.items().length;
// The drops lie where the player died, which in this test is beside the bed.
const deathSpot = bot.entity.position.clone(); // respawned beside the bed on the test site; it died 4-5 blocks away
const drops = () => Object.values(bot.entities).filter(e => e.name === 'item' && e.position.distanceTo(deathSpot) < 10);
const seen = drops().length;
for (let i = 0; i < 12 && drops().length; i++) {
  const d = bot.nearestEntity(e => e.name === 'item');
  await bot.pathfinder.goto(new goals.GoalNear(d.position.x, d.position.y, d.position.z, 0.4)).catch(() => {});
  await bot.waitForTicks(4);
}
const cobble = bot.inventory.count(bot.registry.itemsByName.cobblestone.id);
return { ok: before === 0 && seen > 0 && cobble === 10 && atRespawn !== null && atRespawn < 4, cobble, deathMessage: deathMsg?.text, itemsAfterDeath: before, dropsSeen: seen, recovered: bot.inventory.items().length, distanceFromBedSpawn: atRespawn && +atRespawn.toFixed(1) };
