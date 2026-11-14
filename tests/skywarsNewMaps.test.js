// The SkyWars maps that break the one-middle-at-one-height habit (src/mods/skywars/templates.js: twin_peaks, tiers,
// sub_mids, rush). The fairness every map keeps -- spawns equally far out, three chests each, void between islands --
// is tested for all of them in skywarsMaps.test.js; this is what makes each of these different.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArena, cellKey, ARENA } from '../src/mods/skywars/arena.js';
import { packsFor } from '../src/mods/skywars/packs.js';
import { describeSkyWars } from '../src/mods/skywars/generalState.js';

const SEEDS = [1, 7, 2015, 123456789];
const arenas = (template) => SEEDS.flatMap((seed) => packsFor(template).map((p) => ({ a: buildArena({ template, pack: p.id, seed }), label: `${template}/${p.id}/${seed}` })));
const solid = (a, x, y, z) => a.blocks.has(cellKey(x, y, z));
const roles = (a, role) => a.islands.filter((i) => i.role === role);

/**
 * Where a player can walk from `start` (standing cells: ground below, two blocks of air), stepping up at most one block
 * and down at most three, never off into the void: the set of reachable standing cells.
 */
function walkable(a, start) {
  const stand = (x, y, z) => solid(a, x, y - 1, z) && !solid(a, x, y, z) && !solid(a, x, y + 1, z);
  const seen = new Set([cellKey(...start)]), queue = [start];
  while (queue.length) {
    const [x, y, z] = queue.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let dy = 1; dy >= -3; dy--) {
      const n = [x + dx, y + dy, z + dz], k = cellKey(...n);
      if (seen.has(k) || !stand(...n)) continue;
      // Up a step needs headroom over where I stand.
      if (dy === 1 && solid(a, x, y + 2, z)) continue;
      seen.add(k); queue.push(n);
      break;
    }
  }
  return seen;
}

test('Twin Peaks: no middle island -- two peaks east and west, one high and one low, each with middle loot', () => {
  for (const { a, label } of arenas('twin_peaks')) {
    const peaks = roles(a, 'center');
    assert.equal(peaks.length, 2, label);
    const [high, low] = [...peaks].sort((p, q) => q.y - p.y);
    assert.ok(high.y - low.y >= 8, `${label}: ${high.y} and ${low.y}`);
    assert.ok(high.y > ARENA.surfaceY && low.y < ARENA.surfaceY, `${label}: one above the spawns, one below`);
    assert.ok(!a.islands.some((i) => i.cells.some(([x, z]) => Math.hypot(x, z) < 4)), `${label}: nothing at the very middle`);
    for (const p of peaks) assert.ok(a.chests.filter((c) => c.kind === 'center' && Math.hypot(c.x - p.x, c.z - p.z) <= p.extent).length >= 3, `${label}: middle chests on each`);
    // Spawns 0 and 1 (a 1 v 1) are equally far from each peak.
    for (const p of peaks) {
      const d = [0, 1].map((s) => Math.hypot(a.spawns[s].x - p.x, a.spawns[s].z - p.z));
      assert.ok(Math.abs(d[0] - d[1]) <= 1.01, `${label}: ${d.map((n) => n.toFixed(1))}`);
    }
  }
});

test('Twin Peaks in the general state: both middles, with their heights, and the stepping islands', () => {
  const a = buildArena({ template: 'twin_peaks', pack: 'meadow', seed: 7 });
  const g = describeSkyWars({ phase: 'playing', players: [] }, a);
  const middles = g.places.filter((p) => p.kind === 'middle');
  assert.equal(middles.length, 2);
  assert.notEqual(middles[0].at[1], middles[1].at[1]);
  assert.equal(g.places.filter((p) => p.kind === 'island').length, roles(a, 'mid').length);
});

test('Sky Tiers: the best chests are on a platform six up, reached by walking the staircase from the ground', () => {
  for (const { a, label } of arenas('tiers')) {
    const center = roles(a, 'center')[0];
    const up = a.chests.filter((c) => c.kind === 'center' && c.y === center.y + 7);
    assert.equal(up.length, 2, `${label}: two chests on the platform`);
    const reach = walkable(a, [center.x + 4, center.y + 1, center.z + 6]);
    for (const c of up) {
      const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => reach.has(cellKey(c.x + dx, c.y, c.z + dz)));
      assert.ok(beside, `${label}: the platform chest at ${c.x},${c.y},${c.z} can be walked to`);
    }
    // The stepping islands are high and low by turns.
    const heights = new Set(roles(a, 'mid').map((i) => i.y));
    assert.deepEqual([...heights].sort(), [ARENA.surfaceY - 3, ARENA.surfaceY + 3], label);
  }
});

test('Sub-Mid Cross: four sub-middle islands lower than the spawns, with two chests each, between the spawns and a small middle', () => {
  for (const { a, label } of arenas('sub_mids')) {
    const subs = roles(a, 'mid');
    assert.equal(subs.length, 4, label);
    for (const s of subs) {
      assert.ok(s.y < ARENA.surfaceY, `${label}: lower`);
      assert.equal(a.chests.filter((c) => c.kind === 'mid' && Math.hypot(c.x - s.x, c.z - s.z) <= s.extent).length, 2, label);
    }
    assert.ok(roles(a, 'center')[0].radius < 8, `${label}: a small middle`);
  }
});

test('Rush: every spawn island is joined to the middle by a ready-made bridge one can walk', () => {
  for (const { a, label } of arenas('rush')) {
    const center = roles(a, 'center')[0];
    const reach = walkable(a, [center.x, center.y + 1, center.z]);
    for (const s of a.spawns) {
      const sx = Math.floor(s.x), sz = Math.floor(s.z);
      // Out of the cage: any standing cell on the spawn island within two blocks of its middle.
      const onIsland = [...reach].some((k) => { const [x, , z] = k.split(',').map(Number); return Math.hypot(x - sx, z - sz) <= 2.5; });
      assert.ok(onIsland, `${label}: spawn at ${sx},${sz} walkable from the middle`);
    }
  }
});
