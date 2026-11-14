// The Agent Arena's practice maps (agentArena/practice.mjs): three islands each, with every mechanic of the full map,
// in a fraction of its size. SkyWars: two spawn islands across a middle (src/mods/skywars/templates.js, 'practice').
// Bed Wars: two bases and a middle with a diamond and an emerald generator (src/mods/bedwars/arena.js, layout
// 'practice'). Real rounds keep the full maps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { buildArena as buildSkyWars, normalizeMap as normalizeSkyWars } from '../src/mods/skywars/arena.js';
import { TEMPLATE_IDS, ALL_TEMPLATES } from '../src/mods/skywars/templates.js';
import { SkyWarsMatch } from '../src/mods/skywars/rules.js';
import { buildArena as buildBedWars, normalizeMap as normalizeBedWars, mapKey as bedWarsKey, publishedPlan, ARENA as BW } from '../src/mods/bedwars/arena.js';
import { BedWarsMatch } from '../src/mods/bedwars/rules.js';
import { buildBedWarsArenaLayout } from '../packages/blockyland-mcp/guestPeer.js';

/** The islands of a map: groups of columns with ground near the surface, joined side by side; trees and the lobby aside. */
function islands(blocks, surfaceY = 30) {
  const ground = new Set();
  for (const key of blocks.keys()) {
    const [x, y, z] = key.split(',').map(Number);
    if (y >= surfaceY - 4 && y <= surfaceY) ground.add(`${x},${z}`);
  }
  const seen = new Set(), out = [];
  for (const start of ground) {
    if (seen.has(start)) continue;
    const cells = [], todo = [start];
    seen.add(start);
    while (todo.length) {
      const c = todo.pop(); cells.push(c);
      const [x, z] = c.split(',').map(Number);
      for (const n of [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`]) if (ground.has(n) && !seen.has(n)) { seen.add(n); todo.push(n); }
    }
    out.push(cells.map((c) => c.split(',').map(Number)));
  }
  return out;
}
const area = (b) => (b.maxX - b.minX + 1) * (b.maxZ - b.minZ + 1);
const at = (blocks, x, y, z) => blocks.get(`${x},${y},${z}`) ?? BLOCKS.AIR;

test('the SkyWars practice map is three islands: two spawns, each with its three chests and cage, across a middle with the better loot', () => {
  for (const seed of [1, 2, 3, 77, 2015]) {
    const a = buildSkyWars({ template: 'practice', seed });
    assert.equal(islands(a.blocks).length, 3, `seed ${seed}`);
    assert.equal(a.spawns.length, 2);
    assert.equal(a.cages.length, 2);
    for (const slot of [0, 1]) assert.equal(a.chests.filter((c) => c.kind === 'island' && c.slot === slot).length, 3, `slot ${slot}'s island chests`);
    assert.ok(a.chests.filter((c) => c.kind === 'center').length >= 2, 'the middle has its chests');
    assert.ok(a.enchantingTables.length >= 1, 'and its enchanting table');
    // The spawns face each other across the middle.
    assert.ok(a.spawns[0].z < 0 && a.spawns[1].z > 0);
  }
});

test("the SkyWars practice map keeps the Classic Ring's bridge, in a fraction of its size", () => {
  // The void from a spawn island's edge to the middle's: the Classic Ring's is its ring (23-25) less the two radii.
  const gap = (a) => {
    const center = a.islands.find((i) => i.role === 'center'), spawn = a.islands.find((i) => i.role === 'spawn');
    return Math.hypot(spawn.x - center.x, spawn.z - center.z) - spawn.radius - center.radius;
  };
  for (const seed of [1, 2, 3, 77, 2015]) {
    const practice = buildSkyWars({ template: 'practice', seed }), full = buildSkyWars({ template: 'classic', seed });
    assert.ok(Math.abs(gap(practice) - gap(full)) <= 3, `seed ${seed}: practice gap ${gap(practice)} vs classic ${gap(full)}`);
    assert.ok(area(practice.bounds) < area(full.bounds) * 0.4, `seed ${seed}: ${area(practice.bounds)} vs ${area(full.bounds)} columns`);
    assert.ok(practice.blocks.size < full.blocks.size * 0.5);
  }
});

test('the lobby does not offer the practice map, and a practice room has two islands for two players', () => {
  assert.ok(!TEMPLATE_IDS.includes('practice'));
  assert.equal(ALL_TEMPLATES.practice.slots, 2);
  assert.equal(normalizeSkyWars({ template: 'practice', seed: 4 }).template, 'practice');
  const match = new SkyWarsMatch({ map: { template: 'practice', seed: 4 } });
  match.join('host', 'Referee');
  match.join('a', 'A');
  match.join('b', 'B');
  const slots = [...match.players.values()].map((p) => p.slot);
  assert.deepEqual(slots.filter((s) => s !== null).sort(), [0, 1], 'two islands, two players on them');
  assert.equal(slots.filter((s) => s === null).length, 1, 'a third watches');
});

test('the Bed Wars practice map is three islands: two full bases and a middle with a diamond and an emerald generator', () => {
  for (const seed of [1, 5, 2017]) {
    const a = buildBedWars({ teams: 2, seed, layout: 'practice' });
    assert.equal(a.layout, 'practice');
    assert.equal(islands(a.blocks).length, 3, `seed ${seed}`);
    assert.equal(a.bases.length, 2);
    for (const base of a.bases) {
      // Everything a base has in a real game: its bed, forge (iron and gold), chest, item shop and team upgrades.
      assert.notEqual(at(a.blocks, ...base.bed.foot), BLOCKS.AIR, `${base.team} bed`);
      assert.equal(at(a.blocks, Math.floor(base.forge.x), BW.surfaceY, Math.floor(base.forge.z)), BLOCKS.GOLD_BLOCK, `${base.team} forge`);
      assert.equal(at(a.blocks, base.chest.x, base.chest.y, base.chest.z), BLOCKS.CHEST, `${base.team} chest`);
      assert.ok(base.shop && base.upgrades, `${base.team} shopkeepers`);
    }
    assert.equal(a.diamonds.length, 1);
    assert.equal(a.emeralds.length, 1);
    const [d] = a.diamonds, [e] = a.emeralds;
    assert.equal(at(a.blocks, Math.floor(d.x), BW.surfaceY, Math.floor(d.z)), BLOCKS.DIAMOND_BLOCK);
    assert.equal(at(a.blocks, Math.floor(e.x), BW.surfaceY, Math.floor(e.z)), BLOCKS.EMERALD_BLOCK);
    // Both generators on the middle island: the one island that holds the origin.
    const middle = islands(a.blocks).find((cells) => cells.some(([x, z]) => x === 0 && z === 0));
    for (const g of [d, e]) assert.ok(middle.some(([x, z]) => x === Math.floor(g.x) && z === Math.floor(g.z)), `${g.kind} on the middle`);
  }
});

test('the Bed Wars practice map is smaller than the duel it stands for, and only two teams can have it', () => {
  const practice = buildBedWars({ teams: 2, seed: 5, layout: 'practice' }), duel = buildBedWars({ teams: 2, seed: 5 });
  assert.equal(islands(duel.blocks).length, 5);
  assert.ok(area(practice.bounds) < area(duel.bounds) * 0.4, `${area(practice.bounds)} vs ${area(duel.bounds)} columns`);
  assert.equal(normalizeBedWars({ teams: 4, layout: 'practice' }).layout, 'standard');
  assert.equal(normalizeBedWars({ teams: 2 }).layout, 'standard');
  assert.notEqual(bedWarsKey(normalizeBedWars({ teams: 2, seed: 1, layout: 'practice' })), bedWarsKey(normalizeBedWars({ teams: 2, seed: 1 })));
  // The host chooses it in the lobby, after choosing the duel.
  const match = new BedWarsMatch({ mode: 'duel' });
  assert.equal(match.setLayout('host', 'practice'), true);
  assert.equal(match.snapshot().map.layout, 'practice');
});

test("a guest bot's Bed Wars layout is the game's, on every map (from the plan the host publishes)", () => {
  const maps = [{ teams: 2 }, { teams: 4 }, { teams: 8 }, { teams: 2, layout: 'practice' }];
  for (const m of maps) {
    const map = normalizeBedWars({ ...m, seed: 9 });
    const game = buildBedWars(map), guest = buildBedWarsArenaLayout(map, publishedPlan(map));
    const label = `${m.teams} teams ${m.layout ?? 'standard'}`;
    assert.deepEqual(guest.bases.map((b) => [b.team, b.spawn.x, b.spawn.z, b.forge.x, b.forge.z, b.chest.x, b.chest.z, ...b.bed.foot, ...b.bed.head]),
      game.bases.map((b) => [b.team, b.spawn.x, b.spawn.z, b.forge.x, b.forge.z, b.chest.x, b.chest.z, ...b.bed.foot, ...b.bed.head]), `${label}: bases`);
    assert.deepEqual(guest.diamonds.map((g) => [g.id, g.x, g.z]), game.diamonds.map((g) => [g.id, g.x, g.z]), `${label}: diamonds`);
    assert.deepEqual(guest.emeralds.map((g) => [g.id, g.x, g.z]), game.emeralds.map((g) => [g.id, g.x, g.z]), `${label}: emeralds`);
  }
});
