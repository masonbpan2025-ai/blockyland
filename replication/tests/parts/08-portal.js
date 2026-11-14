// Part 8: a Nether portal. Build a 4x5 obsidian frame on clear ground, light it with flint and steel, walk in, arrive
// in the Nether. (Obsidian is a fixture here; making it from lava and water is part 8b.)
// timeout: 240
/* setup: fixture.site('Ada'); fixture.give('Ada', 'obsidian', 14); fixture.give('Ada', 'flint_and_steel', 1); true */
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');
const isAir = (p) => bot.blockAt(p)?.name === 'air';
const isSolid = (p) => bot.blockAt(p)?.boundingBox === 'block';
// A spot: 4 wide (x..x+3), 5 tall, air, with solid ground under the 4 columns, and the cell in front clear.
let spot = null;
const me = bot.entity.position.floored();
search: for (let r = 2; r < 20; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
  if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
  for (let dy = -2; dy <= 2; dy++) {
    const o = me.offset(dx, dy, dz);
    let ok = true;
    for (let i = 0; i < 4 && ok; i++) { ok = isSolid(o.offset(i, -1, 0)); for (let h = 0; h < 5 && ok; h++) ok = isAir(o.offset(i, h, 0)) && isAir(o.offset(i, h, 1)); }
    if (ok) { spot = o; break search; }
  }
}
if (!spot) return { ok: false, why: 'no clear spot' };
console.log('frame at', spot.toString());
await bot.pathfinder.goto(new goals.GoalNear(spot.x + 1, spot.y, spot.z + 3, 1));
await bot.equip(bot.inventory.items().find(i => i.name === 'obsidian'), 'hand');
const put = async (ref, face) => { await bot.placeBlock(bot.blockAt(ref), face); };
for (const i of [0, 1, 2, 3]) await put(spot.offset(i, -1, 0), new Vec3(0, 1, 0));            // bottom row (with corners)
for (const i of [0, 3]) for (let h = 1; h <= 4; h++) await put(spot.offset(i, h - 1, 0), new Vec3(0, 1, 0)); // sides
await put(spot.offset(0, 4, 0), new Vec3(1, 0, 0));                                            // top, against the left side
await put(spot.offset(3, 4, 0), new Vec3(-1, 0, 0));                                           // top, against the right side
await bot.equip(bot.inventory.items().find(i => i.name === 'flint_and_steel'), 'hand');
await bot.activateBlock(bot.blockAt(spot.offset(1, 0, 0)), new Vec3(0, 1, 0));
await bot.waitForTicks(10);
const portal = bot.findBlock({ matching: b => b.name === 'nether_portal', maxDistance: 8 });
if (!portal) return { ok: false, why: 'portal did not light' };
await bot.pathfinder.goto(new goals.GoalBlock(portal.position.x, portal.position.y, portal.position.z)).catch(e => console.log('walk in', e.message));
for (let i = 0; i < 200 && bot.game.dimension === 'overworld'; i++) await bot.waitForTicks(1);
global.overworldPortal = portal.position;
return { ok: bot.game.dimension === 'the_nether', dimension: bot.game.dimension, at: bot.entity.position.floored().toString(), portal: portal.position.toString() };
