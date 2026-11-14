// Part 5: a bed. Craft it from wool and planks, place it, use it at night: the spawn point is set.
// timeout: 120
/* setup: fixture.site('Ada'); fixture.give('Ada', 'white_wool', 3); fixture.give('Ada', 'oak_planks', 7); fixture.give('Ada', 'crafting_table', 1); fixture.time(13200); true */
const mcData = require('minecraft-data')(bot.version);
const { Vec3 } = require('vec3');
await global.placeNear(bot, 'crafting_table');
const tb = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 6 });
const r = bot.recipesFor(mcData.itemsByName.white_bed.id, null, 1, tb)[0];
if (!r) return { ok: false, why: 'no bed recipe', inv: bot.inventory.items().map(i => i.name + 'x' + i.count) };
await bot.craft(r, 1, tb);
await global.placeNear(bot, 'white_bed');
const bed = bot.findBlock({ matching: b => /_bed$/.test(b.name), maxDistance: 6 });
if (!bed) return { ok: false, why: 'bed not placed' };
let slept = false;
try { await bot.sleep(bed); slept = true; } catch (e) { console.log('sleep', e.message); }
await bot.waitForTicks(40);
global.bedPos = bed.position;
return { ok: !!bot.spawnPoint, slept, spawnPoint: bot.spawnPoint && bot.spawnPoint.toString(), timeOfDay: bot.time.timeOfDay };
