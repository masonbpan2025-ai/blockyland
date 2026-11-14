// Part 11: eyes of ender. Craft blaze powder and eyes, throw one in the Overworld, follow its flight: it rises and
// drifts toward the nearest stronghold (the fixture tells this test, by chat, where that is, to check the direction).
// timeout: 90
/* setup: (() => {
  const P = fixture.P('Ada');
  fixture.give('Ada', 'blaze_rod', 2); fixture.give('Ada', 'ender_pearl', 3);
  const s = server.strongholdNear(P.world, P.player.position.x, P.player.position.z);
  server.toPlayer(P, 'FIXTURE ' + JSON.stringify(s), 'fixture');
  return !!s;
})() */
const mcData = require('minecraft-data')(bot.version);
const truth = JSON.parse(bot.received.find(m => m.kind === 'fixture').text.slice(8));
await bot.craft(bot.recipesFor(mcData.itemsByName.blaze_powder.id, null, 1, null)[0], 1, null);
const r = bot.recipesFor(mcData.itemsByName.ender_eye.id, null, 1, null)[0];
if (!r) return { ok: false, why: 'no ender eye recipe without a table', inv: bot.inventory.items().map(i => i.name + 'x' + i.count) };
await bot.craft(r, 2, null);
const eyes = bot.inventory.count(mcData.itemsByName.ender_eye.id);
await bot.equip(bot.inventory.items().find(i => i.name === 'ender_eye'), 'hand');
await bot.look(0, -0.3, true);
const start = bot.entity.position.clone();
await bot.activateItem();
const track = [];
for (let i = 0; i < 70; i++) {
  await bot.waitForTicks(1);
  const e = bot.nearestEntity(x => x.name === 'eye_of_ender');
  if (e) track.push(e.position.clone()); else if (track.length) break;
}
if (track.length < 5) return { ok: false, why: 'no eye seen', eyes };
const last = track.at(-1), dir = Math.atan2(last.x - start.x, last.z - start.z), want = Math.atan2(truth.x - start.x, truth.z - start.z);
const err = Math.abs(((dir - want) * 180 / Math.PI + 540) % 360 - 180);
const rose = Math.max(...track.map(p => p.y)) - start.y;
return { ok: err < 15 && rose > 2, eyes, headingErrorDeg: +err.toFixed(1), rose: +rose.toFixed(1), flew: +last.distanceTo(start).toFixed(1), stronghold: truth, samples: track.length };
