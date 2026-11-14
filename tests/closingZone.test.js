// The closing zone (src/mods/closingZone.js) on the real maps of SkyWars and Bed Wars: it starts round every island and
// closes on the middle with the void just under the tops there, so nobody can wait out the clock under an island --
// as Gemini (game 3, archipelago) and Opus (game 5, sky tiers) of the five-bots series did, on blocks they had placed
// under the middle island. And the rules of both games act on it: the one hiding is out, the one on top wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planZone, islandColumns, zoneAt, outsideZone, ZoneWatch, CLOSING, zoneSchedule, GROWTH_IDS } from '../src/mods/closingZone.js';
import { buildArena as buildSkyWars, ARENA as SKY, allCageCells, cellKey } from '../src/mods/skywars/arena.js';
import { buildArena as buildBedWars, ARENA as BED } from '../src/mods/bedwars/arena.js';
import { PROGRESSION } from '../src/mods/bedwars/layouts.js';
import { SkyWarsMatch, HOST_ID } from '../src/mods/skywars/rules.js';
import { BedWarsMatch } from '../src/mods/bedwars/rules.js';

const skyPlan = (map) => {
  const a = buildSkyWars(map), cages = new Set(allCageCells(a).map(([x, y, z]) => cellKey(x, y, z)));
  const blocks = [...a.blocks].filter(([k]) => !cages.has(k));
  // The cages are gone once play starts: the map as it is played.
  return { a: { ...a, blocks: new Map(blocks) }, plan: planZone(islandColumns(blocks), { voidY: SKY.voidY, cells: blocks }) };
};
const bedPlan = (map) => {
  const a = buildBedWars(map);
  const cells = [...a.blocks].filter(([k]) => Number(k.split(',')[1]) < BED.lobbyY - 4);
  return { a, plan: planZone(islandColumns(a.blocks, { maxY: BED.lobbyY - 4 }), { voidY: BED.voidY, cells }) };
};
const closed = (plan) => zoneAt(plan, 100, 95);
const SKY_MAPS = ['classic', 'sectors', 'archipelago', 'twin_peaks', 'tiers'];

test('the zone starts round every island and closes on ground enough to fight on, the void under its tops', () => {
  const cases = [
    ...SKY_MAPS.flatMap((template) => [1, 2, 3].map((seed) => ({ label: `skywars ${template} ${seed}`, ...skyPlan({ template, seed }) }))),
    ...PROGRESSION.flatMap((layout) => [1, 2, 3].map((seed) => ({ label: `bedwars ${layout} ${seed}`, ...bedPlan({ teams: 5, layout, seed }) }))),
  ];
  for (const { label, a, plan } of cases) {
    // Before it closes, nobody standing anywhere on the map is outside it.
    const start = zoneAt(plan, 100, 60);
    for (const [k] of a.blocks) { const [x, y, z] = k.split(',').map(Number); if (y < 50) assert.ok(!outsideZone(start, { x: x + 0.5, y: y + 1, z: z + 0.5 }), `${label}: ${k} outside at the start`); }
    // Closed: a circle holding at least the minimum ground, nine-tenths of it standing above the void.
    const end = closed(plan), tops = [...islandColumns(a.blocks, { maxY: 50 })].filter(([x, z]) => Math.hypot(x + 0.5 - end.x, z + 0.5 - end.z) <= end.radius);
    assert.ok(tops.length >= CLOSING.minColumns, `${label}: ${tops.length} columns in the closed zone`);
    assert.ok(tops.filter(([, , top]) => top + 1 >= end.floor).length >= tops.length * 0.9, `${label}: the ground in the closed zone is above the void (${end.floor})`);
    assert.ok(end.radius < plan.startRadius / 2, `${label}: it closes (${plan.startRadius} to ${end.radius})`);
  }
});

test("the five-bots series' hiding places are in the void once the zone has closed; the middle's top is not", () => {
  for (const { map, hide, label } of [
    { map: { template: 'archipelago', pack: 'sky_ruins', seed: 882939896 }, hide: { x: 4.5, y: 21, z: -3.5 }, label: 'game 3: Gemini' },
    { map: { template: 'tiers', pack: 'end_citadel', seed: 371577032 }, hide: { x: -6.5, y: 22, z: 3.5 }, label: 'game 5: Opus' },
  ]) {
    const { a, plan } = skyPlan(map), end = closed(plan);
    assert.ok(outsideZone(end, hide), `${label} under the middle at y ${hide.y}: the void is at ${end.floor}`);
    // The highest ground at the centre of the closed zone is inside.
    const [x, z, top] = [...islandColumns(a.blocks, { maxY: 50 })].sort((p, q) => Math.hypot(p[0] - end.x, p[1] - end.z) - Math.hypot(q[0] - end.x, q[1] - end.z))[0];
    assert.ok(!outsideZone(end, { x: x + 0.5, y: top + 1, z: z + 0.5 }), `${label}: standing on the middle's top`);
  }
});

test('under an island on blocks of its own is the void too, above the void line or not; the map\'s own ground never is', () => {
  // Twin Peaks: the low peak keeps the void low (y 22), so the overhang of the high one is above it.
  const map = { template: 'twin_peaks', seed: 7 };
  const { a, plan } = skyPlan(map), end = closed(plan);
  const cols = new Map();
  for (const k of a.blocks.keys()) { const [x, y, z] = k.split(',').map(Number); if (y < 50) { const c = `${x},${z}`; if (!cols.has(c)) cols.set(c, []); cols.get(c).push(y); } }
  // A column in the closed zone whose island hangs high above the void line: the hider stands on a placed block under it.
  const spot = [...cols].map(([c, ys]) => ({ c, bottom: Math.min(...ys) })).filter(({ c, bottom }) => {
    const [x, z] = c.split(',').map(Number);
    return Math.hypot(x + 0.5 - end.x, z + 0.5 - end.z) <= end.radius && bottom - 3 > end.floor + 1;
  })[0];
  assert.ok(spot, 'an overhang above the void line in the closed zone');
  const [x, z] = spot.c.split(',').map(Number);
  const hider = { x: x + 0.5, y: spot.bottom - 3, z: z + 0.5 };
  assert.ok(hider.y >= end.floor, 'above the void line');
  assert.ok(outsideZone(end, hider), 'but under the island, on its own blocks: in the void');
  // Everyone standing on the map's own ground in the closed zone is inside -- a lower island, a ledge, under a tree.
  for (const [c, ys] of cols) {
    const [cx, cz] = c.split(',').map(Number);
    if (Math.hypot(cx + 0.5 - end.x, cz + 0.5 - end.z) > end.radius) continue;
    for (const y of ys) if (!ys.includes(y + 1) && !ys.includes(y + 2) && y + 1 >= end.floor) assert.ok(!outsideZone(end, { x: cx + 0.5, y: y + 1, z: cz + 0.5 }), `on the map at ${cx},${y + 1},${cz}`);
  }
});

test("a player on its own block under a tree's leaves is not hiding: plants are no island", () => {
  // Bed Wars, game 2 of the team tests: two bots bridged into the middle under its tree and were counted in the void.
  for (const seed of [37, 11, 23]) {
    const { a, plan } = bedPlan({ teams: 2, layout: 'standard', seed }), end = closed(plan);
    const leaves = [...a.blocks].filter(([k, id]) => GROWTH_IDS.has(id) && Number(k.split(',')[1]) > 31);
    assert.ok(leaves.length, `seed ${seed}: the middle has trees`);
    let checked = 0;
    for (const [k] of leaves) {
      const [x, y, z] = k.split(',').map(Number);
      if (Math.hypot(x + 0.5, z + 0.5) > end.radius) continue;
      // Standing on a placed block, its feet two below the leaf: under the tree, not under an island.
      if (a.blocks.has(`${x},${y - 3},${z}`) || a.blocks.has(`${x},${y - 2},${z}`) || a.blocks.has(`${x},${y - 1},${z}`)) continue;
      assert.ok(!outsideZone(end, { x: x + 0.5, y: y - 2, z: z + 0.5 }), `seed ${seed}: under the leaves at ${k}`);
      checked++;
    }
    assert.ok(checked > 0, `seed ${seed}: some leaves over open air in the zone`);
  }
});

test('ten seconds in the void, all told, and a player is out; back inside, the count runs down at half speed', () => {
  const zone = { x: 0, z: 0, radius: 10, floor: 25 };
  const w = new ZoneWatch(), out = { x: 20, y: 31, z: 0 }, inside = { x: 0, y: 31, z: 0 };
  for (let t = 0; t < 6; t++) assert.deepEqual(w.update(1, zone, [['a', out]]), []);
  for (let t = 0; t < 4; t++) w.update(1, zone, [['a', inside]]); // 6 - 4 * 0.5 = 4 s left on the count
  assert.equal(w.of('a'), 4);
  const taken = []; for (let t = 0; t < 6 && !taken.length; t++) taken.push(...w.update(1, zone, [['a', out]]));
  assert.deepEqual(taken, ['a']);
  // Below the void's level counts as the void, inside the border or not; an unknown position is not judged.
  assert.ok(outsideZone(zone, { x: 0, y: 21, z: 0 }));
  assert.deepEqual(new ZoneWatch().update(20, zone, [['b', null]]), []);
});

/** Play a match to its end with one player hiding under the middle and one on top, the host seeing where they stand. */
function playOut(match, where, { step = 0.5, limit = 2000 } = {}) {
  for (let t = 0; t < limit && match.phase === 'playing'; t += step) { match.update(step); match.closeIn(step, (id) => where[id] ?? null); }
}

test('SkyWars: under an eight-minute limit the zone takes the player hiding under the middle, and the one on top wins', () => {
  const map = { template: 'archipelago', pack: 'sky_ruins', seed: 882939896 };
  const m = new SkyWarsMatch({ map });
  m.join(HOST_ID, 'Host'); m.join('hider', 'Hider'); m.join('top', 'Top');
  m.players.get(HOST_ID).slot = null; m.players.get(HOST_ID).alive = false; // a referee host, as the Agent Arena's
  m.timeLimit = 480;
  m.zonePlan = skyPlan(map).plan;
  m.start(HOST_ID); m.update(5);
  assert.equal(m.phase, 'playing');
  const end = zoneAt(m.zonePlan, 480, 480 * CLOSING.closed);
  playOut(m, { hider: { x: 4.5, y: 21, z: -3.5 }, top: { x: end.x + 0.5, y: end.floor + 4, z: end.z + 0.5 } });
  assert.equal(m.endReason, 'last_alive');
  assert.equal(m.winner, 'top');
  const out = m.drainEvents?.() ?? m.events;
  assert.ok(out.some((e) => e.kind === 'closing'), 'everyone was told the zone is closing');
  assert.ok(out.some((e) => e.kind === 'death' && e.id === 'hider' && e.cause === 'zone' && /swallowed by the closing void/.test(e.message)));
  assert.ok(m.elapsed < 480 * CLOSING.closed + CLOSING.exposure + 1, `over by ${m.elapsed.toFixed(0)} s, before the limit`);
});

test('Bed Wars: under a ten-minute limit the beds go at 6:00, the zone closes, and the team on top wins', () => {
  const m = new BedWarsMatch({ mode: 'fives', pace: 'fast', seed: 3 });
  m.setLayout('host', 'archipelago');
  for (let i = 0; i < 5; i++) m.join(`p${i}`, `P${i}`);
  m.timeLimit = 600;
  m.zonePlan = bedPlan(m.map).plan;
  m.begin();
  const timetable = m.timetable.filter((e) => e.kind !== 'tier').map((e) => [e.kind, e.at]);
  assert.deepEqual(timetable, [['bed_gone', 360], ['sudden_death', 480], ['game_end', 600]]);
  const { startsAt, closedAt } = zoneSchedule(600);
  assert.deepEqual([startsAt, closedAt], [360, 540]);
  const end = zoneAt(m.zonePlan, 600, 540);
  // p0 holds the middle; the other four sit at home, or under an island.
  const where = { p0: { x: end.x + 0.5, y: end.floor + 4, z: end.z + 0.5 } };
  m.plan().bases.forEach((b, i) => { if (i) where[`p${i}`] = { x: b.x + 0.5, y: 31, z: b.z + 0.5 }; });
  where.p4 = { x: 0.5, y: end.floor - 6, z: 0.5 };
  playOut(m, where);
  assert.equal(m.endReason, 'last_team');
  assert.equal(m.winner, m.players.get('p0').team);
  assert.ok(m.events.some((e) => e.kind === 'bed_gone'));
  assert.ok(m.elapsed < 600, `over at ${m.elapsed.toFixed(0)} s`);
});
