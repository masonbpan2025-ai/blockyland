// Part 0: helpers kept on the global object for later programs (the paper's agents did this: values on `global`
// persist between programs). Passing this part also proves the persistence.
// timeout: 30
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');
/** Place the named item on a free spot within 3 blocks: solid below, air at the spot and above, not where we stand. */
global.placeNear = async (bot, itemName) => {
  const item = bot.inventory.items().find(i => i.name === itemName);
  if (!item) throw new Error(`no ${itemName}`);
  await bot.equip(item, 'hand');
  const me = bot.entity.position.floored(), spots = [];
  for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -3; dz <= 3; dz++) {
    const p = me.offset(dx, dy, dz);
    if (Math.abs(dx) <= 0 && Math.abs(dz) <= 0) continue;
    if (p.x === me.x && p.z === me.z) continue;
    const below = bot.blockAt(p.offset(0, -1, 0)), here = bot.blockAt(p), up = bot.blockAt(p.offset(0, 1, 0));
    if (below?.boundingBox === 'block' && here?.boundingBox === 'empty' && here.name !== 'water' && up?.boundingBox === 'empty') spots.push(p);
  }
  spots.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
  for (const p of spots.slice(0, 12)) {
    try { await bot.placeBlock(bot.blockAt(p.offset(0, -1, 0)), new Vec3(0, 1, 0)); return bot.blockAt(p); } catch (e) { /* next spot */ }
  }
  throw new Error(`could not place ${itemName} anywhere near`);
};
/** Walk over dropped items within `radius`. */
global.collect = async (bot, radius = 10) => {
  for (let i = 0; i < 10; i++) {
    const d = bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < radius);
    if (!d) return;
    await bot.pathfinder.goto(new goals.GoalNear(d.position.x, d.position.y, d.position.z, 0.4)).catch(() => {});
    await bot.waitForTicks(4);
  }
};
return { ok: typeof global.placeNear === 'function' };
