// Part 12: the stronghold's portal room. Put an eye in every empty frame, the portal lights, walk in, arrive in the
// End. (The fixture moves the player into the portal room with 12 eyes: finding it is part 11's skill.)
// timeout: 180
/* setup: (() => {
  const P = fixture.P('Ada'), O = server.dims.overworld;
  const s = server.strongholdNear(O.world, P.player.position.x, P.player.position.z);
  const b = s.box;
  server.loadAround(O, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, Math.ceil(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 32) + 1);
  // the portal room: find a frame anywhere in the stronghold, then stand beside it
  let frame = null;
  for (let x = b.minX; x <= b.maxX && !frame; x++) for (let z = b.minZ; z <= b.maxZ && !frame; z++) for (let y = 1; y < 63; y++) { const id = O.world.getVoxel(x, y, z); if (id === BLOCKS_BY_NAME.END_PORTAL_FRAME || id === BLOCKS_BY_NAME.END_PORTAL_FRAME_FILLED) { frame = { x, y, z }; break; } }
  if (!frame) throw new Error('no portal frame near the stronghold');
  let at = null;
  for (let r = 1; r < 6 && !at; r++) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
    const x = frame.x + dx, z = frame.z + dz; for (let y = frame.y - 2; y <= frame.y + 1; y++) if (O.world.getVoxel(x, y, z) === 0 && O.world.getVoxel(x, y + 1, z) === 0 && O.world.getVoxel(x, y - 1, z) !== 0 && O.world.getVoxel(x, y - 1, z) !== BLOCKS_BY_NAME.END_PORTAL) { at = { x, y, z }; break; } if (at) break;
  }
  fixture.tp('Ada', at.x + .5, at.y, at.z + .5);
  fixture.give('Ada', 'ender_eye', 12);
  P.player.health = 20;
  return true;
})() */
const { goals } = require('mineflayer-pathfinder');
await bot.waitForTicks(10);
const empty = () => bot.findBlocks({ matching: (b) => b.name === 'end_portal_frame', maxDistance: 12, count: 12 });
const filledBefore = bot.findBlocks({ matching: (b) => b.name === 'end_portal_frame_filled', maxDistance: 12, count: 12 }).length;
console.log('frames: empty', empty().length, 'filled', filledBefore);
await bot.equip(bot.inventory.items().find(i => i.name === 'ender_eye'), 'hand');
for (const p of empty()) {
  if (bot.entity.position.distanceTo(p) > 4.5) await bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, 3)).catch(() => {});
  try { await bot.activateBlock(bot.blockAt(p)); } catch (e) { console.log('frame', p.toString(), e.message); }
}
await bot.waitForTicks(10);
const portal = bot.findBlock({ matching: (b) => b.name === 'end_portal', maxDistance: 12 });
if (!portal) return { ok: false, why: 'portal did not light', emptyLeft: empty().length, eyesLeft: bot.inventory.count(bot.registry.itemsByName.ender_eye.id) };
await bot.pathfinder.goto(new goals.GoalNear(portal.position.x, portal.position.y + 1, portal.position.z, 1)).catch(e => console.log('to portal', e.message));
// step onto the portal (it sits a block below the frame tops)
await bot.lookAt(portal.position.offset(.5, .5, .5)); bot.setControlState('forward', true);
for (let i = 0; i < 200 && bot.game.dimension === 'overworld'; i++) await bot.waitForTicks(1);
bot.clearControlStates();
return { ok: bot.game.dimension === 'the_end', dimension: bot.game.dimension, filledBefore, at: bot.entity.position.floored().toString() };
