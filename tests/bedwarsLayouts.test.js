// Bed Wars map layouts (src/mods/bedwars/layouts.js): templates after Hypixel's maps, each laid out afresh by the seed.
// Whatever the template and seed: every base is whole, every generator stands on its block, every island must be
// bridged to (none touches another), the rushes stay within Hypixel's range, and two seeds give two different maps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { buildArena, normalizeMap, publishedPlan, LAYOUT_TEMPLATES, LAYOUT_IDS, LAYOUTS, ARENA, cellKey } from '../src/mods/bedwars/arena.js';
import { PROGRESSION } from '../src/mods/bedwars/layouts.js';
import { BedWarsMatch } from '../src/mods/bedwars/rules.js';
import { TEAMS } from '../src/mods/bedwars/teams.js';
import { buildBedWarsArenaLayout } from '../packages/blockyland-mcp/guestPeer.js';

const SEEDS = [1, 2, 3, 41, 2017];
const cases = () => LAYOUTS.flatMap((layout) => LAYOUT_TEMPLATES[layout].teams.map((teams) => ({ layout, teams })));

/** Islands: groups of columns with blocks at island level (the glass waiting room high above aside), joined side by side. */
function islands(arena) {
  const cols = new Map();
  for (const key of arena.blocks.keys()) {
    const [x, y, z] = key.split(',').map(Number);
    if (y < ARENA.lobbyY - 4) cols.set(`${x},${z}`, [x, z]);
  }
  const seen = new Set(), out = [];
  for (const [k, start] of cols) {
    if (seen.has(k)) continue;
    const cells = [], todo = [start];
    seen.add(k);
    while (todo.length) {
      const [x, z] = todo.pop(); cells.push([x, z]);
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) { const nk = `${nx},${nz}`; if (cols.has(nk) && !seen.has(nk)) { seen.add(nk); todo.push([nx, nz]); } }
    }
    out.push(cells);
  }
  return out;
}
/** The void between two islands, in blocks: the shortest distance between their columns, less one. */
function gap(a, b) {
  let best = Infinity;
  for (const [x1, z1] of a) for (const [x2, z2] of b) { const d = Math.hypot(x1 - x2, z1 - z2); if (d < best) best = d; }
  return best - 1;
}
const at = (arena, x, y, z) => arena.blocks.get(cellKey(Math.floor(x), y, Math.floor(z))) ?? BLOCKS.AIR;

test('every layout and seed: whole bases, generators on their blocks, the beds facing the middle', () => {
  for (const { layout, teams } of cases()) for (const seed of SEEDS) {
    const a = buildArena({ teams, layout, seed }), label = `${layout} ${teams} teams seed ${seed}`;
    assert.equal(a.layout, layout, label);
    assert.equal(a.bases.length, teams, label);
    a.bases.forEach((base, i) => {
      assert.equal(base.team, TEAMS[i].id);
      assert.equal(a.blocks.get(cellKey(...base.bed.foot)), TEAMS[i].bedFoot, `${label}: ${base.team} bed`);
      assert.equal(a.blocks.get(cellKey(base.chest.x, base.chest.y, base.chest.z)), BLOCKS.CHEST, `${label}: ${base.team} chest`);
      for (const spot of [base.spawn, base.forge, base.shop, base.upgrades]) {
        assert.notEqual(at(a, spot.x, spot.y - 1, spot.z), BLOCKS.AIR, `${label}: ground under ${base.team}'s spots`);
        assert.equal(at(a, spot.x, spot.y, spot.z), BLOCKS.AIR, `${label}: room to stand`);
      }
      assert.ok(Math.hypot(...[base.bed.head[0], base.bed.head[2]]) < Math.hypot(base.bed.foot[0], base.bed.foot[2]), `${label}: ${base.team}'s bed faces the middle`);
    });
    assert.ok(a.diamonds.length >= 1 && a.emeralds.length >= 1, label);
    for (const g of a.diamonds) assert.equal(at(a, g.x, g.y - 1, g.z), BLOCKS.DIAMOND_BLOCK, `${label}: ${g.id}`);
    for (const g of a.emeralds) assert.equal(at(a, g.x, g.y - 1, g.z), BLOCKS.EMERALD_BLOCK, `${label}: ${g.id}`);
    assert.ok(a.bounds.minY >= 0 && a.bounds.maxY <= 63, label);
  }
});

test('every island must be bridged to, and the rushes stay within the range of Hypixel\'s maps', () => {
  for (const { layout, teams } of cases()) for (const seed of SEEDS.slice(0, 3)) {
    const a = buildArena({ teams, layout, seed }), label = `${layout} ${teams} teams seed ${seed}`;
    const all = islands(a);
    // One island per base, per generator island and per other island, and the middle.
    assert.equal(all.length, teams + a.islands.length + 1, `${label}: ${all.length} islands`);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(gap(all[i], all[j]) >= 3, `${label}: islands ${i} and ${j} are ${gap(all[i], all[j]).toFixed(1)} apart`);
    // From each base, the nearest other island is a real bridge away, and not farther than Hypixel's long rushes.
    for (const base of a.bases) {
      const own = all.find((cells) => cells.some(([x, z]) => x === Math.floor(base.spawn.x) && z === Math.floor(base.spawn.z)));
      const nearest = Math.min(...all.filter((c) => c !== own).map((c) => gap(own, c)));
      assert.ok(nearest >= 3 && nearest <= 40, `${label}: ${base.team}'s nearest island is ${nearest.toFixed(1)} blocks away`);
    }
  }
});

test('a new seed lays the same template out differently: where the bases are, how big and where the islands are', () => {
  for (const { layout, teams } of cases().filter((c) => c.layout !== 'practice')) {
    const shapes = SEEDS.map((seed) => {
      const a = buildArena({ teams, layout, seed });
      return JSON.stringify([a.bases.map((b) => [b.center.x, b.center.z]), a.islands.map((i) => [i.x, i.z, i.y, Math.round(i.r * 10)]), a.middle]);
    });
    assert.ok(new Set(shapes).size >= SEEDS.length - 1, `${layout} ${teams} teams: only ${new Set(shapes).size} different layouts from ${SEEDS.length} seeds`);
    // The same seed is the same map.
    assert.deepEqual([...buildArena({ teams, layout, seed: 9 }).blocks], [...buildArena({ teams, layout, seed: 9 }).blocks]);
  }
});

test('the templates follow the maps they are after', () => {
  // Flanking Diamonds: a diamond island beside every base (Ashore).
  for (const seed of SEEDS) assert.equal(buildArena({ teams: 4, layout: 'flanks', seed }).diamonds.length, 4);
  // High Middle: the middle above the bases, the diamond islands below them (Waterfall, Aquarium).
  for (const seed of SEEDS) {
    const a = buildArena({ teams: 4, layout: 'highmid', seed });
    assert.ok(a.middle.y > ARENA.surfaceY, `middle at ${a.middle.y}`);
    for (const i of a.islands) assert.ok(i.y < ARENA.surfaceY, `diamond island at ${i.y}`);
  }
  // Compact Middle: no diamond islands, the diamond generators on the middle island (Picnic).
  for (const seed of SEEDS) {
    const a = buildArena({ teams: 4, layout: 'compact', seed });
    assert.equal(a.islands.length, 0);
    for (const d of a.diamonds) assert.ok(Math.hypot(d.x, d.z) <= a.middle.r, 'on the middle');
  }
  // Stepping Stones: a small island on each base's way to the middle (Dreamgrove).
  for (const seed of SEEDS) assert.equal(buildArena({ teams: 2, layout: 'stepping', seed }).islands.filter((i) => i.role === 'stone').length, 2);
  // Offset Ring: the bases off the compass lines (Archway).
  for (const seed of SEEDS) assert.ok(buildArena({ teams: 4, layout: 'offset', seed }).bases.every((b) => b.center.x !== 0 && b.center.z !== 0));
});

test('five teams: five whole bases on a ring, each with a bed and its own island', () => {
  for (const layout of PROGRESSION) for (const seed of SEEDS) {
    const a = buildArena({ teams: 5, layout, seed }), label = `${layout} seed ${seed}`;
    assert.equal(a.teams, 5, label);
    assert.equal(a.layout, layout, label);
    assert.deepEqual(a.bases.map((b) => b.team), TEAMS.slice(0, 5).map((t) => t.id), label);
    // Evenly round the middle: the angles between neighbouring bases are all near 72 degrees.
    const angles = a.bases.map((b) => Math.atan2(b.center.z, b.center.x)).sort((x, y) => x - y);
    const steps = angles.map((v, i) => ((angles[(i + 1) % 5] - v + Math.PI * 2) % (Math.PI * 2)) * 180 / Math.PI);
    for (const s of steps) assert.ok(s > 50 && s < 95, `${label}: bases ${s.toFixed(0)} degrees apart`);
  }
});

test('the five-round progression gets more complex: more islands, more heights, longer ways to the middle', () => {
  const measure = (layout) => {
    let islands = 0, heights = 0, reach = 0;
    for (const seed of SEEDS) {
      const a = buildArena({ teams: 5, layout, seed });
      islands += a.islands.length;
      heights += new Set([a.middle.y, ...a.islands.map((i) => i.y)]).size;
      reach += Math.min(...a.bases.map((b) => Math.hypot(b.center.x, b.center.z)));
    }
    return { islands: islands / SEEDS.length, heights: heights / SEEDS.length, reach: reach / SEEDS.length };
  };
  assert.deepEqual(PROGRESSION, ['compact', 'standard', 'flanks', 'highmid', 'archipelago']);
  const m = PROGRESSION.map(measure);
  // Round 1 has no generator islands; round 2 brings them; round 4 brings heights; round 5 the most islands and heights.
  assert.equal(m[0].islands, 0);
  assert.ok(m[1].islands >= 5 && m[2].islands >= 5);
  assert.ok(m[3].heights > m[1].heights);
  assert.ok(m[4].islands > m[3].islands * 2 && m[4].heights >= m[3].heights);
  assert.ok(m[4].reach > m[0].reach + 15, `the bases ${m[0].reach.toFixed(0)} then ${m[4].reach.toFixed(0)} from the middle`);
});

test('a layout must suit the teams, and the lobby offers every layout but the practice map', () => {
  assert.equal(normalizeMap({ teams: 8, layout: 'flanks' }).layout, 'standard');
  assert.equal(normalizeMap({ teams: 4, layout: 'flanks' }).layout, 'flanks');
  assert.equal(normalizeMap({ teams: 4, layout: 'nonsense' }).layout, 'standard');
  assert.equal(normalizeMap({ teams: 5, layout: 'archipelago' }).layout, 'archipelago');
  assert.equal(normalizeMap({ teams: 5 }).teams, 5);
  assert.ok(!LAYOUT_IDS.includes('practice'));
  assert.ok(LAYOUT_IDS.length >= 6);
});

test('the rules run exactly the generators the map has, on every layout', () => {
  for (const { layout, teams } of cases()) {
    const mode = teams === 2 ? 'duel' : teams === 4 ? 'fours' : teams === 5 ? 'fives' : 'solo';
    const match = new BedWarsMatch({ mode, seed: 5 });
    assert.ok(match.setLayout('host', layout) || layout === 'standard');
    match.join('host', 'Host'); match.join('p1', 'P1');
    match.begin();
    const arena = buildArena(match.map);
    const ids = (kind) => match.gens.filter((g) => g.kind === kind).map((g) => g.id).sort();
    assert.deepEqual(ids('diamond'), arena.diamonds.map((d) => d.id).sort(), `${layout} ${teams}: diamond generators`);
    assert.deepEqual(ids('emerald'), arena.emeralds.map((e) => e.id).sort(), `${layout} ${teams}: emerald generators`);
    assert.deepEqual(match.snapshot().plan.bases.length, teams);
  }
});

test("a guest bot builds the host's map from the plan the host publishes, on every layout", () => {
  for (const { layout, teams } of cases()) for (const seed of [3, 77]) {
    const map = normalizeMap({ teams, layout, seed });
    const game = buildArena(map), guest = buildBedWarsArenaLayout(map, publishedPlan(map));
    const label = `${layout} ${teams} teams seed ${seed}`;
    const key = (b) => [b.team, b.spawn.x, b.spawn.z, b.forge.x, b.forge.z, b.chest.x, b.chest.z, ...b.bed.foot, ...b.bed.head];
    assert.deepEqual(guest.bases.map(key), game.bases.map(key), `${label}: bases`);
    assert.deepEqual(guest.diamonds.map((g) => [g.id, g.x, g.y, g.z]), game.diamonds.map((g) => [g.id, g.x, g.y, g.z]), `${label}: diamonds`);
    assert.deepEqual(guest.emeralds.map((g) => [g.id, g.x, g.y, g.z]), game.emeralds.map((g) => [g.id, g.x, g.y, g.z]), `${label}: emeralds`);
  }
});
