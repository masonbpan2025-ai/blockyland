// Ruined portal tests: the multi-variant registry ids, the weighted generic setup, the placement-dependent
// Y, and the two processors this structure is the first to use on real templates.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateRuinedPortal, realizeRuinedPortal, selectSetup, selectPortalY,
  PORTAL_SETUPS, GENERIC_PORTAL_SETUP_WEIGHTS, GIANT_CHANCE
} from '../src/worldgen/generators/ruinedPortal.js';
import { buildRuinedPortal, PORTAL_SHAPES } from '../src/worldgen/templates/ruinedPortal.js';
import { createStructureEngine, GENERATORS, generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';
import { createBlockIdResolver } from '../src/worldgen/blockIds.js';

const PORTAL_IDS = [
  'ruined_portal', 'ruined_portal_desert', 'ruined_portal_jungle', 'ruined_portal_mountain',
  'ruined_portal_ocean', 'ruined_portal_swamp', 'ruined_portal_nether'
];
const flat = (biome = 'plains', surface = 70) => ({ biomeAt: () => biome, surfaceY: () => surface });

test('all seven ruined portal ids have a generator, and the generic one is gated off the deep dark', () => {
  const { implemented } = generatorCoverage();
  for (const id of PORTAL_IDS) assert.ok(implemented.includes(id), `${id} has no generator`);
  assert.ok(GENERATORS.ruinedPortal.realize);
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...flat() });
  // The generic id's biome list is empty because vanilla gates it with a tag; without the explicit
  // exclusion it would have generated in the deep dark.
  assert.deepEqual(engine.registry.ruined_portal.biomeTagExcludes, ['deep_dark']);
  assert.equal(PORTAL_IDS.length, 7, 'vanilla has seven ruined portal ids in one set');
});

test('a pinned id uses its own setup, and the generic id draws one by weight', () => {
  assert.equal(selectSetup('ruined_portal_desert', 1, 0, 0).source, 'pinned');
  assert.equal(selectSetup('ruined_portal_desert', 1, 0, 0).setup.mossiness, 0);
  assert.equal(selectSetup('ruined_portal_jungle', 1, 0, 0).setup.mossiness, 0.8);
  assert.equal(selectSetup('ruined_portal_nether', 1, 0, 0).setup.replaceWithBlackstone, true);

  // The generic id must reach every weighted entry across chunks, deterministically.
  const seen = new Set();
  for (let chunkX = 0; chunkX < 200; chunkX++) {
    const first = selectSetup('ruined_portal', 99, chunkX, 0);
    assert.equal(selectSetup('ruined_portal', 99, chunkX, 0).source, first.source, 'the setup roll must be stable');
    seen.add(first.source);
  }
  assert.equal(seen.size, Object.keys(GENERIC_PORTAL_SETUP_WEIGHTS).length,
    `expected every weighted setup to appear, saw ${[...seen]}`);
  assert.throws(() => selectSetup('igloo', 1, 0, 0), /not a ruined portal id/);
});

test('the placed Y follows the setup placement rule', () => {
  const base = { seed: 5, chunkX: 3, chunkZ: -2, surface: 70, oceanFloor: 58 };
  const yFor = (placement, extra = {}) =>
    selectPortalY({ ...base, setup: { placement, airPocketProbability: 0, ...extra } });
  assert.equal(yFor('on_land_surface'), 70);
  assert.ok(yFor('partly_buried') <= 70 && yFor('partly_buried') >= 67, 'buried by up to three blocks');
  // An ocean-floor portal must sit at the ocean floor, not the world surface.
  assert.equal(yFor('on_ocean_floor'), 58);
  assert.ok(yFor('underground') <= 55 && yFor('underground') >= 49, 'underground portals sit well below');
  assert.ok(yFor('in_mountain') >= 70);
  // Nether rules: an air pocket lands in 32..100, and with probability 1 it must always do so.
  for (let chunkX = 0; chunkX < 50; chunkX++) {
    const y = selectPortalY({ ...base, chunkX, setup: { placement: 'in_nether', airPocketProbability: 1 } });
    assert.ok(y >= 32 && y <= 100, `air-pocket portal at Y ${y} is outside 32..100`);
  }
  assert.throws(() => yFor('not_a_placement'), /unknown ruined portal placement/);
});

test('the templates are well formed for both shapes and every base material', () => {
  for (const shape of Object.keys(PORTAL_SHAPES)) {
    for (const baseBlock of ['minecraft:stone_bricks', 'minecraft:sandstone', 'minecraft:blackstone']) {
      const json = buildRuinedPortal({ shape, baseBlock, integrity: 1, seed: 7 });
      const template = new StructureTemplate(json, `portal/${shape}`);
      assert.deepEqual(template.size, PORTAL_SHAPES[shape].size);
      assert.ok(template.blockCount > 20, `${shape}/${baseBlock} produced only ${template.blockCount} blocks`);
      assert.ok(template.palette.some((entry) => entry.name === baseBlock), 'the setup material must appear');
      for (const block of template.blocks) {
        const [x, y, z] = block.pos;
        const [sx, sy, sz] = template.size;
        assert.ok(x >= 0 && x < sx && y >= 0 && y < sy && z >= 0 && z < sz,
          `${shape}: block at ${block.pos} is outside ${template.size}`);
      }
    }
  }
  // Damage is real: an integrity of 0 leaves no obsidian at all, and full integrity leaves some.
  const broken = new StructureTemplate(buildRuinedPortal({ integrity: 0, seed: 1 }), 'broken');
  assert.equal(broken.blocks.filter((block) => broken.palette[block.state].name === 'minecraft:obsidian').length, 0);
  const whole = new StructureTemplate(buildRuinedPortal({ integrity: 1, seed: 1 }), 'whole');
  assert.ok(whole.blocks.filter((block) => whole.palette[block.state].name === 'minecraft:obsidian').length > 5);
});

test('crying obsidian appears at roughly the documented rate', () => {
  // Measured across many portals, not one: a single template has only ~14 obsidian draws, so it can
  // legitimately contain none at a 15% rate, and asserting otherwise would be a flaky test rather than a
  // check on the rate.
  let obsidian = 0;
  let crying = 0;
  for (let seed = 0; seed < 60; seed++) {
    const template = new StructureTemplate(buildRuinedPortal({ integrity: 1, cryingChance: 0.15, seed }), `rate-${seed}`);
    for (const block of template.blocks) {
      const name = template.palette[block.state].name;
      if (name === 'minecraft:obsidian') obsidian++;
      else if (name === 'minecraft:crying_obsidian') crying++;
    }
  }
  assert.ok(obsidian + crying > 400, `need enough obsidian to measure a rate, got ${obsidian + crying}`);
  const rate = crying / (obsidian + crying);
  assert.ok(rate > 0.08 && rate < 0.22, `expected roughly 15% crying obsidian, measured ${(rate * 100).toFixed(1)}%`);
  // With cryingChance 0 nothing may turn, which is the control that proves the rate is the parameter.
  const none = new StructureTemplate(buildRuinedPortal({ integrity: 1, cryingChance: 0, seed: 3 }), 'none');
  assert.equal(none.blocks.filter((block) => none.palette[block.state].name === 'minecraft:crying_obsidian').length, 0);
});

test('generation is deterministic and the giant roll happens', () => {
  const context = flat('plains', 70);
  const first = generateRuinedPortal({ seed: 1234, chunkX: 8, chunkZ: -8, structureId: 'ruined_portal', context });
  const again = generateRuinedPortal({ seed: 1234, chunkX: 8, chunkZ: -8, structureId: 'ruined_portal', context });
  assert.deepEqual(first.box.toArray(), again.box.toArray());
  assert.equal(first.meta.integrity, again.meta.integrity);
  assert.equal(first.pieces[0].template, again.pieces[0].template);

  let giants = 0;
  for (let chunkX = 0; chunkX < 800; chunkX++) {
    const start = generateRuinedPortal({ seed: 7, chunkX, chunkZ: 0, structureId: 'ruined_portal', context });
    if (start.meta.giant) giants++;
  }
  assert.ok(giants > 800 * (GIANT_CHANCE - 0.03) && giants < 800 * (GIANT_CHANCE + 0.03),
    `expected roughly 5% giants, got ${giants}/800`);
});

test('realization writes the portal, resolves ids, and reports unapplied flags', () => {
  const context = flat('jungle', 70);
  const start = generateRuinedPortal({ seed: 21, chunkX: 2, chunkZ: 5, structureId: 'ruined_portal_jungle', context });
  const written = [];
  const report = realizeRuinedPortal(start, (x, y, z, id, meta) => { written.push({ x, y, z, id, meta }); return true; }, BLOCKS);

  assert.ok(report.written > 20, `expected a portal, wrote ${report.written}`);
  assert.deepEqual(report.missingBlocks, [], `unresolved palette blocks: ${report.missingBlocks}`);
  // The processors this structure is the first to exercise on real data must have run.
  assert.ok(report.processorTypes.includes('block_age'), 'mossiness is the block_age argument');
  assert.ok(report.processorTypes.includes('jigsaw_replacement'));
  // Every written block must be a real numeric id.
  assert.ok(written.every((entry) => typeof entry.id === 'number'));
  // The chest must survive with an identifiable state, or the loot is decorative.
  const chestId = createBlockIdResolver(BLOCKS).resolve('minecraft:chest');
  assert.ok(written.some((entry) => entry.id === chestId), 'a ruined portal contains a chest');
  // The flags carried but not applied are reported rather than hidden.
  assert.deepEqual(start.meta.unappliedFlags, ['overgrown', 'vines']);
  assert.match(report.note, /not applied/);
});

test('the nether variant runs the blackstone processor', () => {
  const context = { biomeAt: () => 'nether_wastes', surfaceY: () => 70 };
  const start = generateRuinedPortal({ seed: 3, chunkX: 1, chunkZ: 1, structureId: 'ruined_portal_nether', context });
  const report = realizeRuinedPortal(start, () => true, BLOCKS);
  assert.ok(report.processorTypes.includes('blackstone_replace'),
    'replace_with_blackstone is the blackstone_replace processor');
  assert.equal(start.meta.setup.baseBlock, 'minecraft:blackstone');
  // A nether portal uses the nether placement rule, so it lands inside the nether's Y band.
  assert.ok(start.meta.y >= 27 && start.meta.y <= 100, `nether portal at Y ${start.meta.y}`);
});

test('the Engine plans a portal through the real placement path', () => {
  const engine = createStructureEngine({ seed: 4242, blockIds: BLOCKS, ...flat('plains', 70) });
  let plan = null;
  for (let chunkX = 0; chunkX < 4000 && !plan; chunkX++) {
    const candidate = engine.planChunk(chunkX, 0);
    if (candidate && candidate.structureId.startsWith('ruined_portal')) plan = candidate;
  }
  assert.ok(plan, 'spacing 40 must yield a portal within 4000 chunks');
  assert.ok(plan.set === 'ruined_portals');
  // The plan must realize through the engine, clipped to its own chunk.
  let written = 0;
  engine.realize(plan.start, () => { written++; return true; }, { chunkX: plan.start.chunkX, chunkZ: plan.start.chunkZ });
  assert.ok(written > 0, 'the engine must be able to realize the portal it planned');
  assert.ok(engine.hashStart(plan.start) !== undefined);
});
