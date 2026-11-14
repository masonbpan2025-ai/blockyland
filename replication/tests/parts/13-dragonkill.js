// Part 13b: the dragon can die. The whole fight took the paper's team 14 hours, so this part only proves the end of it
// through the API: with the crystals gone and the dragon at 12 health (fixture), arrows and the sword finish it, the
// game logs "Free the End" and the exit portal opens. (Part 13 shows crystals breaking and arrows hitting.)
// timeout: 420
/* setup: (() => {
  const P = fixture.P('Ada');
  if (server.dimensionOf(P).dimensionName !== 'the_end') server.moveToDimension(P, 'the_end', { x: 20, y: 40, z: 0 });
  const End = server.dims.the_end; End.spawnManager.update = () => {}; for (const m of End.mobs.mobs) if (m.type === 'enderman') m.health = 0;
  let y = 62; while (y > 1 && End.world.getVoxel(20, y - 1, 0) === 0) y--; P.player.position.set(20.5, y, 0.5); P.player.velocity.set(0, 0, 0);
  for (const c of End.bossManager.endCrystals ?? []) if (c.alive) End.bossManager.destroyEndCrystal(c);
  const dragon = End.mobs.mobs.find(m => m.type === 'ender_dragon'); if (!dragon) throw new Error('no dragon');
  dragon.health = 12;
  for (const [n, c] of [['bow', 1], ['arrow', 64], ['arrow', 64], ['diamond_sword', 1], ['diamond_chestplate', 1], ['cooked_beef', 16]]) fixture.give('Ada', n, c);
  P.player.health = 20; P.player.hunger = 20;
  return true;
})() */
await bot.waitForTicks(20);
const it = (n) => bot.inventory.items().find(i => i.name === n);
await bot.equip(it('diamond_chestplate'), 'torso');
const freed = () => bot.received.some(m => /Free the End/.test(m.text));
const t0 = Date.now(); let shots = 0, swings = 0, minDist = Infinity;
while (Date.now() - t0 < 380000 && !freed() && bot.game.dimension === 'the_end') {
  const d = bot.nearestEntity(e => e.name === 'ender_dragon');
  if (!d) { await bot.waitForTicks(10); continue; }
  const dist = d.position.distanceTo(bot.entity.position); minDist = Math.min(minDist, dist);
  if (dist < 5.5) { await bot.equip(it('diamond_sword'), 'hand'); try { await bot.attack(d); swings++; } catch {} await bot.waitForTicks(12); continue; }
  if (dist > 70) { await bot.waitForTicks(10); continue; }
  await bot.equip(it('bow'), 'hand');
  // lead the target a little along its velocity, and lift for the arrow's drop
  const lead = d.velocity.scaled(Math.min(20, dist / 2.5));
  await bot.lookAt(d.position.plus(lead).offset(0, 1.5 + dist * dist * 0.0012, 0));
  await bot.activateItem(); await bot.waitForTicks(22); await bot.deactivateItem(); shots++;
}
const portal = bot.findBlock({ matching: b => /end_portal/.test(b.name) && b.name !== 'end_portal_frame', maxDistance: 64 });
return { ok: freed(), freed: freed(), shots, swings, closest: +minDist.toFixed(1), exitPortal: portal && portal.position.toString(), minutes: +((Date.now() - t0) / 60000).toFixed(1), health: bot.health };
