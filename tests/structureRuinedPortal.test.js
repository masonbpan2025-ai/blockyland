// Ruined portals: the 13 designs (four of them the wiki's blueprints, nine built to its materials tables), the
// Generation table's setups, the vertical rules and the replacement table. Cards R1-R5 + W1 for every variant run in
// tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateRuinedPortal, realizeRuinedPortal, buildRuinedPortal, designCells, processPortalBlock, portalBaseY, selectSetup,
  PORTAL_SETUPS, NORMAL_DESIGNS, GIANT_DESIGNS, GIANT_CHANCE, PORTAL_LOOT, COLD_BIOMES
} from '../src/worldgen/generators/ruinedPortal.js';
import { PORTAL_MATERIALS } from '../src/worldgen/generators/ruinedPortalDesigns.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { LegacyRandom } from '../src/worldgen/random.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { BLOCKS } from '../src/blocks.js';

const PORTAL_IDS = Object.keys(PORTAL_SETUPS);
const flat = (biome = 'plains', surface = 40) => ({ biomeAt: () => biome, surfaceY: () => surface });
const countOf = (cells) => { const n = {}; for (const c of cells) { const k = c.name === 'block_of_gold' ? 'gold_block' : c.name; n[k] = (n[k] ?? 0) + 1; } return n; };

test('all seven ruined portal ids have a generator', () => {
  const { implemented } = generatorCoverage();
  for (const id of PORTAL_IDS) assert.ok(implemented.includes(id), id);
  assert.equal(PORTAL_IDS.length, 7);
});

test('every one of the 13 designs has its materials table, inside its own box', () => {
  assert.deepEqual([NORMAL_DESIGNS.length, GIANT_DESIGNS.length, GIANT_CHANCE], [10, 3, 0.05]);
  for (const design of [...NORMAL_DESIGNS, ...GIANT_DESIGNS]) {
    const { cells, size } = designCells(design);
    const n = countOf(cells);
    // portal_3's drawing has one netherrack and two slabs more than its table (pinned, as with the igloo).
    if (design === 'portal_3') { n.netherrack -= 1; n.stone_brick_slab -= 2; }
    assert.deepEqual(n, PORTAL_MATERIALS[design], design);
    for (const c of cells) assert.ok(c.x >= 0 && c.y >= 0 && c.z >= 0 && c.x < size[0] && c.y < size[1] && c.z < size[2], `${design} ${c.x},${c.y},${c.z}`);
    assert.equal(new Set(cells.map((c) => `${c.x},${c.y},${c.z}`)).size, cells.length, `${design}: two blocks in one place`);
  }
});

test('design odds: 5% giant, the rest split evenly', () => {
  const n = {};
  for (let i = 0; i < 4000; i++) {
    const start = generateRuinedPortal({ seed: 11, chunkX: i, chunkZ: -i, structureId: 'ruined_portal', context: flat() });
    n[start.meta.design] = (n[start.meta.design] ?? 0) + 1;
  }
  const giant = GIANT_DESIGNS.reduce((sum, d) => sum + (n[d] ?? 0), 0) / 4000;
  assert.ok(giant > 0.035 && giant < 0.065, `giant share ${giant}`);
  for (const d of NORMAL_DESIGNS) assert.ok(n[d] > 300 && n[d] < 470, `${d}: ${n[d]}`);
});

test('the replacement table', () => {
  const warm = { mossiness: 0, cold: false, ocean: false, blackstone: false };
  assert.equal(processPortalBlock('block_of_gold', null, warm, 0.29, 0), null, 'gold 30% air');
  assert.equal(processPortalBlock('block_of_gold', null, warm, 0.31, 0).name, 'gold_block');
  assert.equal(processPortalBlock('lava', null, warm, 0.19, 0).name, 'magma_block', 'lava 20% magma');
  assert.equal(processPortalBlock('lava', null, warm, 0.21, 0).name, 'lava');
  assert.equal(processPortalBlock('lava', null, { ...warm, ocean: true }, 0.9, 0).name, 'magma_block', 'on the ocean floor, always magma');
  assert.equal(processPortalBlock('lava', null, { ...warm, cold: true }, 0.1, 0).name, 'netherrack', 'cold: netherrack');
  assert.equal(processPortalBlock('netherrack', null, warm, 0.06, 0).name, 'magma_block', 'netherrack 7% magma');
  assert.equal(processPortalBlock('netherrack', null, { ...warm, cold: true }, 0.06, 0).name, 'netherrack');
  assert.equal(processPortalBlock('obsidian', null, warm, 0.14, 0).name, 'crying_obsidian', 'obsidian 15% crying');
  assert.equal(processPortalBlock('obsidian', null, warm, 0.16, 0).name, 'obsidian');
  // Block age: 50% x (1 - mossiness) cracked, 50% x mossiness mossy.
  const moss = { ...warm, mossiness: 0.8 };
  assert.equal(processPortalBlock('stone_bricks', null, moss, 0.05, 0.1).name, 'cracked_stone_bricks');
  assert.equal(processPortalBlock('stone_bricks', null, moss, 0.3, 0.1).name, 'mossy_stone_bricks');
  assert.equal(processPortalBlock('stone_bricks', null, moss, 0.6, 0.1).name, 'stone_bricks');
  assert.equal(processPortalBlock('stone_brick_slab', null, moss, 0.7, 0).name, 'mossy_stone_brick_slab');
  assert.equal(processPortalBlock('stone_brick_wall', null, moss, 0.7, 0).name, 'mossy_stone_brick_wall');
  for (let r = 0; r < 1; r += 0.05) assert.doesNotMatch(processPortalBlock('stone_bricks', null, warm, r, 0.1).name, /mossy/, 'a desert portal never goes mossy');
  // The Nether: blackstone equivalents, chains for bars.
  const nether = { ...warm, blackstone: true };
  assert.equal(processPortalBlock('stone_bricks', null, nether, 0.9, 0).name, 'polished_blackstone_bricks');
  assert.equal(processPortalBlock('iron_bars', null, nether, 0.9, 0).name, 'chain');
  assert.equal(processPortalBlock('smooth_stone_slab', null, nether, 0.9, 0).name, 'polished_blackstone_slab');
  assert.ok(COLD_BIOMES.has('snowy_plains') && !COLD_BIOMES.has('plains'));
});

test('the vertical rules', () => {
  const random = () => new LegacyRandom(5n);
  const at = (placement, extra = {}) => portalBaseY({ placement, ...extra }, { surface: 60, oceanFloor: 40, height: 8, random: random() });
  assert.equal(at('on_land_surface'), 59, 'the ground layer replaces the surface block');
  assert.equal(at('on_ocean_floor'), 39);
  for (let i = 0; i < 50; i++) {
    const r = new LegacyRandom(BigInt(i));
    const buried = portalBaseY({ placement: 'partly_buried' }, { surface: 60, height: 8, random: r });
    assert.ok(buried >= 54 && buried <= 60, '"n-n2, plus a random integer from 2 to 8"');
    const under = portalBaseY({ placement: 'underground' }, { surface: 60, height: 8, random: new LegacyRandom(BigInt(i)) });
    assert.ok(under >= 15 && under <= 52, '"from 15 to n-n2"');
    const pocket = portalBaseY({ placement: 'in_nether', airPocket: true }, { surface: 60, height: 8, random: new LegacyRandom(BigInt(i)) });
    assert.ok(pocket >= 32 && pocket <= 100);
  }
});

test('a pinned id always uses its own setup; the standard id draws both of its setups', () => {
  assert.equal(selectSetup('ruined_portal_desert', new LegacyRandom(1n)).placement, 'partly_buried');
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(selectSetup('ruined_portal', new LegacyRandom(BigInt(i) * 0x9E3779B97F4A7C15n)).placement);
  assert.deepEqual([...seen].sort(), ['on_land_surface', 'underground']);
  assert.throws(() => selectSetup('igloo', new LegacyRandom(1n)), /not a ruined portal id/);
});

test('mossy, overgrown and vine portals look it; the chest has the loot', () => {
  const jungle = buildRuinedPortal({ design: 'giant_portal_1', seed: 3, mossiness: 0.8, overgrown: true, vines: true });
  const names = jungle.palette.map((p) => p.Name);
  for (const n of ['minecraft:jungle_leaves', 'minecraft:vine', 'minecraft:mossy_stone_bricks']) assert.ok(names.includes(n), n);
  const chest = jungle.blocks.filter((b) => jungle.palette[b.state].Name === 'minecraft:chest');
  assert.equal(chest.length, 1);
  assert.equal(chest[0].nbt.LootTable, PORTAL_LOOT);
  const desert = buildRuinedPortal({ design: 'giant_portal_1', seed: 3, mossiness: 0 });
  assert.ok(!desert.palette.some((p) => /mossy|jungle_leaves|vine/.test(p.Name)));
});

test('realization: resolves every block, spreads netherrack round the portal, deterministic', () => {
  const start = generateRuinedPortal({ seed: 9, chunkX: 4, chunkZ: 2, structureId: 'ruined_portal_jungle', context: flat('jungle') });
  const collect = () => { const out = []; const r = realizeRuinedPortal(start, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS); return [out, r]; };
  const [a, report] = collect();
  assert.deepEqual(a, collect()[0]);
  assert.deepEqual(report.missingBlocks, []);
  assert.ok(report.spreadWritten > 10, `${report.spreadWritten} netherrack spread`);
});

test('the card notices the wrong setup', () => {
  const r1 = STRUCTURE_AUDIT_CARDS.ruined_portal_jungle.facts.find((f) => f.id === 'R1');
  assert.equal(r1.check().ok, true);
  const saved = PORTAL_SETUPS.ruined_portal_jungle[0][1].mossiness;
  PORTAL_SETUPS.ruined_portal_jungle[0][1].mossiness = 0.2;
  try { assert.equal(r1.check().ok, false); } finally { PORTAL_SETUPS.ruined_portal_jungle[0][1].mossiness = saved; }
});
