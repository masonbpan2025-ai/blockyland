// Part 7: food. Hunt an animal, cook the meat in a furnace, eat it.
// timeout: 300
/* setup: (() => { fixture.site('Ada'); fixture.P('Ada').player.hunger = 12; fixture.give('Ada', 'iron_sword', 1); fixture.give('Ada', 'furnace', 1); fixture.give('Ada', 'coal', 2); server.as(fixture.P('Ada'), () => server.dims.overworld.mobs.spawnMob('cow', site.x + 5.5, site.y, site.z + 2.5)); return true; })() */
const mcData = require('minecraft-data')(bot.version);
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');
const animals = ['cow', 'pig', 'sheep', 'chicken'];
const raw = { cow: 'beef', pig: 'porkchop', sheep: 'mutton', chicken: 'chicken' };
let meat = null; const t0 = Date.now();
const sword = bot.inventory.items().find(i => /sword/.test(i.name));
if (sword) await bot.equip(sword, 'hand');
while (!meat && Date.now() - t0 < 200000) {
  const a = bot.nearestEntity(e => animals.includes(e.name));
  if (!a) { console.log('no animals in view'); break; }
  for (let k = 0; k < 30 && a.isValid; k++) {
    if (a.position.distanceTo(bot.entity.position) > 2.5) await bot.pathfinder.goto(new goals.GoalNear(a.position.x, a.position.y, a.position.z, 1.5)).catch(() => {});
    try { await bot.attack(a); } catch {}
    await bot.waitForTicks(12);
  }
  for (let i = 0; i < 6; i++) { const d = bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 10); if (!d) break; await bot.pathfinder.goto(new goals.GoalNear(d.position.x, d.position.y, d.position.z, .4)).catch(() => {}); await bot.waitForTicks(4); }
  meat = bot.inventory.items().find(i => Object.values(raw).includes(i.name));
}
if (!meat) return { ok: false, why: 'no meat' };
const fb = await global.placeNear(bot, 'furnace');
const f = await bot.openFurnace(fb);
await f.putFuel(mcData.itemsByName.coal.id, null, 1);
await f.putInput(meat.type, null, 1);
for (let i = 0; i < 20 && !f.outputItem(); i++) { await bot.waitForTicks(20); await f.refresh(); }
const cooked = f.outputItem()?.name; await f.takeOutput(); f.close();
const food0 = bot.food;
await bot.equip(bot.inventory.items().find(i => i.name === cooked), 'hand');
await bot.consume();
return { ok: !!cooked && bot.food > food0, meat: meat.name, cooked, food: [food0, bot.food] };
