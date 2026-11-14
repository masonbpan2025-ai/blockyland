// Part 4: night on Easy. Monsters spawn naturally in the dark; kill one with an iron sword.
// timeout: 200
/* setup: fixture.time(14000); fixture.give('Ada', 'iron_sword', 1); true */
const { goals } = require('mineflayer-pathfinder');
await bot.equip(bot.inventory.items().find(i => i.name === 'iron_sword'), 'hand');
const hostile = (e) => e.type === 'hostile' && e.name !== 'enderman';
const seen = new Set(); let kills = 0; const t0 = Date.now();
while (Date.now() - t0 < 160000 && kills < 1) {
  const m = bot.nearestEntity(e => hostile(e) && e.position.distanceTo(bot.entity.position) < 40);
  if (!m) { await bot.waitForTicks(20); continue; }
  seen.add(m.name);
  if (m.position.distanceTo(bot.entity.position) > 3) { await bot.pathfinder.goto(new goals.GoalNear(m.position.x, m.position.y, m.position.z, 2)).catch(() => {}); if (m.position.distanceTo(bot.entity.position) > 3.5) continue; }
  try { await bot.attack(m); } catch (e) { console.log('attack', e.message); }
  await bot.waitForTicks(13);
  if (!m.isValid) { kills++; console.log('killed', m.name, 'health', bot.health); }
}
return { ok: kills >= 1, kills, seen: [...seen], health: bot.health, timeOfDay: bot.time.timeOfDay };
