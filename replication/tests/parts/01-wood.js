// Part 1: from nothing to a wooden pickaxe, by hand. Logs, drops, planks, a crafting table placed, sticks, pickaxe.
// timeout: 240
const mcData = require('minecraft-data')(bot.version);
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');
const logs = () => bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0);
async function collect(radius = 12) {
  for (let i = 0; i < 8; i++) {
    const d = bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < radius);
    if (!d) return;
    await bot.pathfinder.goto(new goals.GoalNear(d.position.x, d.position.y, d.position.z, 0.5)).catch(() => {});
    await bot.waitForTicks(5);
  }
}
for (let n = 0; n < 12 && logs() < 5; n++) {
  const log = bot.findBlock({ matching: b => b.name.endsWith('_log'), maxDistance: 64 });
  if (!log) break;
  try { await bot.pathfinder.goto(new goals.GoalLookAtBlock(log.position, bot.world)); await bot.dig(log); } catch (e) { console.log('log', e.message); }
  await collect();
}
const logItem = bot.inventory.items().find(i => i.name.endsWith('_log'));
if (!logItem) return { ok: false, why: 'no logs' };
const plank = mcData.itemsByName[logItem.name.replace('_log', '_planks')];
await bot.craft(bot.recipesFor(plank.id, null, 1, null)[0], Math.min(3, logItem.count), null);
await bot.craft(bot.recipesFor(mcData.itemsByName.crafting_table.id, null, 1, null)[0], 1, null);
await bot.craft(bot.recipesFor(mcData.itemsByName.stick.id, null, 1, null)[0], 1, null);
await bot.equip(bot.inventory.items().find(i => i.name === 'crafting_table'), 'hand');
for (const [dx, dz] of [[2, 0], [0, 2], [-2, 0], [0, -2], [2, 2]]) {
  const g = bot.blockAt(bot.entity.position.offset(dx, -1, dz).floored());
  if (!g || g.boundingBox !== 'block' || bot.blockAt(g.position.offset(0, 1, 0)).boundingBox !== 'empty') continue;
  try { await bot.placeBlock(g, new Vec3(0, 1, 0)); break; } catch (e) { console.log('place', e.message); }
}
const tb = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 6 });
if (!tb) return { ok: false, why: 'table not placed' };
await bot.craft(bot.recipesFor(mcData.itemsByName.wooden_pickaxe.id, null, 1, tb)[0], 1, tb);
global.table = tb.position;
const inv = bot.inventory.items().map(i => i.name + 'x' + i.count);
return { ok: bot.inventory.count(mcData.itemsByName.wooden_pickaxe.id) === 1, inv };
