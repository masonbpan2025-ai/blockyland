// Part 2: stone age. Mine 11 cobblestone with the wooden pickaxe, craft a stone pickaxe and a furnace at the table.
// timeout: 300
const mcData = require('minecraft-data')(bot.version);
const { goals } = require('mineflayer-pathfinder');
const cobble = () => bot.inventory.count(mcData.itemsByName.cobblestone.id);
const pick = () => bot.inventory.items().find(i => /_pickaxe$/.test(i.name));
for (let n = 0; n < 40 && cobble() < 11; n++) {
  const stone = bot.findBlock({ matching: [mcData.blocksByName.stone.id], maxDistance: 40 });
  if (!stone) { console.log('no stone near'); break; }
  try {
    await bot.pathfinder.goto(new goals.GoalNear(stone.position.x, stone.position.y, stone.position.z, 2));
    await bot.equip(pick(), 'hand');
    await bot.dig(stone);
    const d = bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 8);
    if (d) await bot.pathfinder.goto(new goals.GoalNear(d.position.x, d.position.y, d.position.z, 0.5)).catch(() => {});
    await bot.waitForTicks(4);
  } catch (e) { console.log('stone', stone.position.toString(), e.message); }
}
console.log('cobblestone', cobble());
let tb = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 64 });
await bot.pathfinder.goto(new goals.GoalNear(tb.position.x, tb.position.y, tb.position.z, 2));
await bot.craft(bot.recipesFor(mcData.itemsByName.stone_pickaxe.id, null, 1, tb)[0], 1, tb);
await bot.craft(bot.recipesFor(mcData.itemsByName.furnace.id, null, 1, tb)[0], 1, tb);
return { ok: bot.inventory.count(mcData.itemsByName.stone_pickaxe.id) === 1 && bot.inventory.count(mcData.itemsByName.furnace.id) === 1, inv: bot.inventory.items().map(i => i.name + 'x' + i.count) };
