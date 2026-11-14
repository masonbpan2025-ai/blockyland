// Part 3: smelting. Place the furnace, fuel it with coal, smelt three raw iron into ingots (10 s each).
// timeout: 90
/* setup: fixture.site('Ada'); fixture.give('Ada', 'furnace', 1); fixture.give('Ada', 'raw_iron', 3); fixture.give('Ada', 'coal', 2); true */
const mcData = require('minecraft-data')(bot.version);
const { Vec3 } = require('vec3');
const fb = await global.placeNear(bot, 'furnace');
console.log('furnace at', fb.position.toString(), 'me', bot.entity.position.toString(), 'block', fb.name);
if (!fb) return { ok: false, why: 'furnace not placed' };
const f = await bot.openFurnace(fb);
await f.putFuel(mcData.itemsByName.coal.id, null, 1);
await f.putInput(mcData.itemsByName.raw_iron.id, null, 3);
const t0 = Date.now();
while (Date.now() - t0 < 45000) { await bot.waitForTicks(20); await f.refresh(); if ((f.outputItem()?.count ?? 0) >= 3) break; }
const out = f.outputItem();
await f.takeOutput();
f.close();
const seconds = (Date.now() - t0) / 1000;
return { ok: bot.inventory.count(mcData.itemsByName.iron_ingot.id) === 3, seconds, out: out && out.name + 'x' + out.count };
