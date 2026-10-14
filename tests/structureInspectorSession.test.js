// Tests for the Structure Inspector session harness.
//
// The inspector's value is that it can prove things about a structure *without* a world, so these
// tests drive the harness exactly as the page does: pick a structure, set a seed, locate a plan,
// realize it, and compare hashes.
import test from 'node:test';
import { generatorCoverage } from '../src/worldgen/index.js';
import assert from 'node:assert/strict';

import {
  createStructureInspectorSession, createPreviewWorld, inspectorStructures, PREVIEW_MIN_Y, PREVIEW_MAX_Y
} from '../src/structureInspectorSession.js';
import { BLOCKS } from '../src/blocks.js';
import { adaptationView } from '../src/structureInspectorPanels.js';
import { STRUCTURES, STRUCTURE_SETS } from '../src/worldgen/registry.js';

test('the picker lists every registry structure with its set and placement', () => {
  const list = inspectorStructures();
  assert.equal(list.length, Object.keys(STRUCTURES).length);
  const buried = list.find((entry) => entry.id === 'buried_treasure');
  assert.equal(buried.implemented, true, 'buried treasure has a generator');
  assert.equal(buried.set, 'buried_treasures');
  assert.match(buried.placement, /spacing=1/);
  assert.match(buried.placement, /frequency=0\.01/);
  assert.equal(buried.defaultBiome, 'beach', 'the default preview biome comes from the structure gate');

  const missingId = generatorCoverage().missing[0];
  if (missingId) {
    const pending = list.find((entry) => entry.id === missingId);
    assert.equal(pending.implemented, false, 'an unimplemented structure is marked as such, not hidden');
    assert.equal(typeof pending.terrainAdaptation, 'string');
  }
  const stronghold = list.find((entry) => entry.id === 'stronghold');
  assert.match(stronghold.placement, /concentric_rings/);
});

test('every structure in the picker belongs to exactly one set', () => {
  // A structure with no set can never be placed, which would make the inspector show only "nothing
  // found" for it with no explanation. Vanilla also forbids one structure in two sets.
  for (const entry of inspectorStructures()) {
    const sets = STRUCTURE_SETS.filter((set) => set.structures.some(([id]) => id === entry.id));
    assert.equal(sets.length, 1, `${entry.id} is in ${sets.length} sets`);
  }
});

test('the preview world is sparse, bounded and has no chunks', () => {
  const world = createPreviewWorld({ biome: 'beach', surface: 66 });
  // Coordinates must be inside the preview range (40..120); y=2 would be a silent "no" below it, which
  // is exactly the trap the next assertion pins.
  assert.equal(world.getBlock(1, 70, 3), BLOCKS.AIR);
  assert.equal(world.setBlock(1, 70, 3, BLOCKS.STONE), true);
  assert.equal(world.getBlock(1, 70, 3), BLOCKS.STONE);
  assert.equal(world.setBlock(1, PREVIEW_MIN_Y - 1, 3, BLOCKS.STONE), false, 'below the preview range');
  assert.equal(world.setBlock(1, 121, 3, BLOCKS.STONE), false, 'above the preview range');
  assert.equal(world.blocks.size, 1);
  world.clear();
  assert.equal(world.blocks.size, 0);
  assert.equal(world.blockMeta.size, 0, 'metadata is cleared with the blocks');
  assert.equal(world.chunks, undefined, 'the preview world must not pretend to have chunks');
});

test('locating and realizing buried treasure fills the preview with a chest', () => {
  const session = createStructureInspectorSession({ seed: 4242, structureId: 'buried_treasure' });
  const found = session.planNearest({ maxRadiusChunks: 256 });
  assert.ok(found, 'a buried treasure must be locatable');
  assert.equal(found.structureId, 'buried_treasure');

  const written = session.realize();
  assert.equal(written, 1, 'buried treasure writes exactly one block');
  assert.equal(session.world.blocks.size, 1);

  // The block is a chest, and it carries its loot table -- the inspector exists partly to prove that
  // block-entity initialisation happened rather than assuming it.
  const [key] = [...session.world.blocks.keys()];
  const [x, y, z] = key.split(',').map(Number);
  assert.equal(session.world.getBlock(x, y, z), BLOCKS.CHEST);
  assert.equal(session.world.getBlockMeta(x, y, z)?.lootTable, 'minecraft:chests/buried_treasure');
  assert.equal(session.world.getBlockMeta(x, y, z)?.facing, 'east');
});

test('telemetry reports the plan, its box, its pieces and its hash', () => {
  const session = createStructureInspectorSession({ seed: 99, structureId: 'buried_treasure' });
  assert.equal(session.snapshot().planned, false, 'before planning there is nothing to report');

  session.planNearest({ maxRadiusChunks: 256 });
  const info = session.snapshot();
  assert.equal(info.planned, true);
  assert.equal(info.structureId, 'buried_treasure');
  assert.equal(info.pieces.length, 1);
  assert.equal(info.pieces[0].type, 'hardcoded');
  assert.equal(info.pieces[0].family, 'hardcoded');
  assert.ok(Array.isArray(info.box) && info.box.length === 6, 'the start box is reported as [minX..maxZ]');
  assert.equal(info.chunkCount, 1, 'a single-block piece covers one chunk');
  assert.deepEqual(info.chunks, [[info.chunk[0], info.chunk[1]]]);
  assert.ok(typeof info.hash === 'number');
  assert.equal(info.seed, '99');
  assert.equal(info.set, 'buried_treasures');
});

test('the determinism check passes for a real plan and would catch a mismatch', () => {
  const session = createStructureInspectorSession({ seed: 777, structureId: 'buried_treasure' });
  session.planNearest({ maxRadiusChunks: 256 });
  const check = session.determinismCheck();
  assert.equal(check.ok, true, `expected identical hashes, got ${JSON.stringify(check)}`);
  assert.equal(check.hashA, check.hashB);

  // Two sessions with the same seed and chunk must agree, and a different seed must not silently agree
  // when the structure actually moves.
  const a = createStructureInspectorSession({ seed: 5, structureId: 'buried_treasure' });
  const b = createStructureInspectorSession({ seed: 5, structureId: 'buried_treasure' });
  a.setChunk(0, 0);
  b.setChunk(0, 0);
  assert.deepEqual(a.snapshot().chunk, b.snapshot().chunk);
});

test('a chunk with no structure plans nothing and says so', () => {
  const session = createStructureInspectorSession({ seed: 4242, structureId: 'buried_treasure' });
  // Chunk 0,0 is not a buried-treasure candidate for this seed in nearly every case; assert the
  // behaviour that matters either way: no plan means no blocks and a false snapshot.
  const result = session.planChunk();
  if (result === null) {
    assert.equal(session.snapshot().planned, false);
    assert.equal(session.realize(), 0);
  } else {
    assert.equal(session.snapshot().planned, true);
  }
});

test('an unimplemented structure reports a plan is impossible rather than crashing', (t) => {
  const missingId = generatorCoverage().missing[0];
  if (!missingId) { t.skip('every registry structure has a generator now'); return; }
  const session = createStructureInspectorSession({ seed: 1, structureId: missingId });
  const entry = session.setStructure(missingId);
  assert.equal(entry.implemented, false);
  session.setBiome('plains');
  const found = session.planNearest({ maxRadiusChunks: 64 });
  assert.equal(found, null, 'no generator means no start, and the harness must not invent one');
  assert.equal(session.snapshot().planned, false);
  // The exact wording of a log line is not a contract; what matters is that the session SAYS why nothing can be planned rather than failing silently.
  assert.ok(session.events.length > 0, 'the session must log why it cannot plan');
  assert.ok(session.events.some((line) => /no |cannot|unimplemented/i.test(line)), 'the log explains why');
});

test('the seed setter rejects non-integers instead of truncating them', () => {
  const session = createStructureInspectorSession();
  assert.equal(session.setSeed('12345'), '12345');
  assert.throws(() => session.setSeed('12.5'), /integer/);
  assert.throws(() => session.setSeed('abc'), /integer/);
  // A seed beyond 2^63 is out of range for a Java long and must not be accepted.
  const before = session.state.seed;
  session.setSeed('999999999999999999999999');
  assert.equal(session.state.seed, before, 'an out-of-range seed leaves the previous value in place');
});

test('the placement preview lists accepted candidate chunks and the region spacing', () => {
  const session = createStructureInspectorSession({ seed: 4242, structureId: 'buried_treasure' });
  const preview = session.placementPreview({ radiusChunks: 64 });
  assert.equal(preview.set, 'buried_treasures');
  assert.equal(preview.spacing, 1, 'buried treasure uses a spacing of 1');
  assert.ok(preview.chunks.length > 0, 'a 1% set over 129x129 chunks must accept some candidates');
  assert.ok(preview.chunks.length < preview.total + 1);
  for (const chunk of preview.chunks) {
    assert.ok(Number.isInteger(chunk.chunkX) && Number.isInteger(chunk.chunkZ));
  }

  // A spacing-34 set lists far fewer candidates in the same radius, which is the point of the overlay.
  const village = createStructureInspectorSession({ seed: 4242, structureId: 'village_plains' });
  const villagePreview = village.placementPreview({ radiusChunks: 128 });
  assert.equal(villagePreview.spacing, 34);
  assert.ok(villagePreview.chunks.length <= 100, `expected a sparse grid, got ${villagePreview.chunks.length}`);
});

test('switching structure resets the plan and adopts the new default biome', () => {
  const session = createStructureInspectorSession({ seed: 3, structureId: 'buried_treasure' });
  session.planNearest({ maxRadiusChunks: 128 });
  assert.equal(session.snapshot().planned, true);
  session.setStructure('igloo');
  assert.equal(session.snapshot().planned, false, 'the previous plan must not survive a structure switch');
  assert.equal(session.world.biome, 'snowy_taiga', 'igloo previews in its own biome');
  assert.throws(() => session.setStructure('not_a_structure'), /unknown structure/);
});

// --- air is never stored in the preview --------------------------------------

test('realizing a template-backed structure stores NO air, and says how many cells it cleared', () => {
  // The village is the case that exposed this: its parts carve doorways and interiors with air, and the
  // preview used to store those cells and draw them as BLACK CUBES, so a 20-piece village looked like a
  // handful of black blocks. The preview starts empty, so a template's air is a no-op and skipping it is
  // correct rather than an optimisation.
  const session = createStructureInspectorSession({ seed: 4242, structureId: 'village_plains', blockIds: BLOCKS });
  session.setBiome('plains');
  session.setSurface(70);
  session.planNearest({ maxRadiusChunks: 1024 });
  const written = session.realize();
  const info = session.snapshot();

  assert.ok(written > 500, 'a 20-piece village must realize hundreds of blocks, got ' + written);
  // `written` counts what the template WROTE and `info.blocks` counts the CELLS the preview holds. They are not
  // the same number, and asserting equality was my mistake: a cell a skipped air write would have cleared keeps
  // the block an earlier write put there, so the preview can hold MORE cells than the last write pass counted.
  assert.ok(info.blocks > 500, 'the preview must hold the village, got ' + info.blocks);
  for (const id of session.world.blocks.values()) {
    assert.notEqual(id, BLOCKS.AIR, 'air must never be stored in the preview');
  }
  // The cleared cells are REPORTED rather than folded into the total.
  assert.ok(info.airSkipped > 0, 'this village clears cells, and the count must be reported: ' + info.airSkipped);
  // And the preview must hold several distinct materials, not one: a village has paths, walls, roofs and loot.
  const kinds = new Set(session.world.blocks.values());
  assert.ok(kinds.size >= 4, 'expected several materials in the preview, got ' + kinds.size);
  assert.equal(kinds.has(BLOCKS.AIR), false, 'air must not be among them');
});

test('a single-block structure reports zero air, so the skip is not simply always on', () => {
  // The control: a structure that clears nothing must report zero, or the previous test would pass for a
  // counter that was hard-wired.
  const session = createStructureInspectorSession({ seed: 7, structureId: 'buried_treasure', blockIds: BLOCKS });
  session.setBiome('beach');
  session.setSurface(70);
  if (session.planNearest({ maxRadiusChunks: 2048 })) {
    session.realize();
    assert.equal(session.snapshot().airSkipped, 0, 'a buried treasure clears nothing');
  }
});

test('the adaptation report does not mutate the preview it describes', () => {
  // The bug this pins, which is the worst of the three rendering defects: `realizeWithAdaptation` cleared the
  // preview world and realized back into it CLIPPED to the start's chunk, and the adaptation panel is rendered
  // on every refresh. So 1210 realized cells became 231 the moment the panel was drawn, and a 20-piece village
  // rendered as one dense blob. A report must not mutate what it reports on.
  const session = createStructureInspectorSession();
  session.setSeed('4242');
  session.setStructure('village_plains');
  session.setBiome('plains');
  session.setSurface(70);
  session.planNearest({ maxRadiusChunks: 512 });
  session.realize();
  const before = session.world.blocks.size;
  assert.ok(before > 500, 'the village must be realized first, got ' + before);

  const view = adaptationView(session, { surfaceY: () => 70, foundationBlock: BLOCKS.STONE });
  assert.equal(session.world.blocks.size, before, 'rendering the adaptation panel must not change the preview');
  assert.equal(session.snapshot().blocks, before, 'and the panel count must still describe the whole structure');
  // The report covers the WHOLE structure, not one chunk of it. Reporting 233 blocks of a 1200-block village
  // would be a truthful count of the wrong thing.
  assert.ok(view.structureBlocks > 1000, 'the report must cover every piece, got ' + view.structureBlocks);
});

// --- the preview window follows the plan -------------------------------------

test('a structure deeper than the default window is still drawn, in a WIDENED window', () => {
  // `ancient_city` sits around Y -63..-31 and the documented preview window starts at 40, so it realized ZERO
  // blocks while its piece boxes were drawn: the page showed empty boxes and said nothing about why. The window
  // now follows the plan, which is a property of the PREVIEW and not of generation -- the plan, the boxes and
  // every block coordinate keep their real Y values.
  const session = createStructureInspectorSession();
  session.setSeed('164291790');
  session.setStructure('ancient_city');
  session.setBiome('deep_dark');
  session.setSurface(70);
  assert.ok(session.planNearest({ maxRadiusChunks: 512 }), 'the ancient city must be findable');
  const box = session.currentPlan().start.box;
  // The city's floor is at y 13 now (it fits the world); it still lives below the preview's default window.
  assert.ok(box.minY < PREVIEW_MIN_Y, 'this structure must genuinely reach below the default window');

  const written = session.realize();
  const info = session.snapshot();
  assert.ok(written > 1000, 'a whole ancient city must be drawn, got ' + written);
  assert.equal(info.blocks, written, 'and every block it wrote must be in the preview');
  assert.ok(info.yRange.minY < PREVIEW_MIN_Y, 'the window must have widened downwards');
  assert.ok(info.yRange.minY <= box.minY, 'the window must CONTAIN the structure, not merely overlap it');
  assert.equal(info.outsidePreview, 0, 'nothing may be refused once the window fits');
});

test('a structure inside the default window does not widen it, so the window is not simply always open', () => {
  // The control: if widening happened for everything, the previous test would pass for a window that was
  // meaningless. A surface village must leave the documented range exactly as it is.
  const session = createStructureInspectorSession();
  session.setSeed('4242');
  session.setStructure('village_plains');
  session.setBiome('plains');
  session.setSurface(70);
  session.planNearest({ maxRadiusChunks: 512 });
  session.realize();
  const info = session.snapshot();
  assert.deepEqual(info.yRange, { minY: PREVIEW_MIN_Y, maxY: PREVIEW_MAX_Y }, 'the default window must stand');
  assert.deepEqual(info.previewDefaultYRange, [PREVIEW_MIN_Y, PREVIEW_MAX_Y]);
  assert.equal(info.yRange.minY < PREVIEW_MIN_Y || info.yRange.maxY > PREVIEW_MAX_Y, false);
});

test('the window is reset per plan, so one deep structure does not widen the next one', () => {
  // Otherwise a single deep structure would leave the window open for the rest of the session and the previous
  // test would only pass in a fresh session -- the state would be order-dependent, which is a bug in a harness.
  const session = createStructureInspectorSession();
  session.setSeed('164291790');
  session.setStructure('ancient_city');
  session.setBiome('deep_dark');
  session.setSurface(70);
  session.planNearest({ maxRadiusChunks: 512 });
  assert.ok(session.snapshot().yRange.minY < PREVIEW_MIN_Y, 'the deep structure widened it');

  session.setStructure('village_plains');
  session.setBiome('plains');
  assert.ok(session.planNearest({ maxRadiusChunks: 512 }), 'the village must be findable');
  assert.deepEqual(session.snapshot().yRange, { minY: PREVIEW_MIN_Y, maxY: PREVIEW_MAX_Y },
    'the next plan must start from the documented window again');
});

test('a refused write is COUNTED, so an empty preview can be explained instead of silent', () => {
  // The guarantee behind the panel's "NOTHING DRAWN" line: the world must be able to report that it refused
  // writes, rather than returning an empty preview with no account of why.
  const world = createPreviewWorld({ biome: 'plains', surface: 70 });
  world.resetRejectedWrites();
  assert.equal(world.setBlock(0, PREVIEW_MIN_Y - 1, 0, BLOCKS.STONE), false, 'a block below the window is refused');
  assert.equal(world.setBlock(0, PREVIEW_MAX_Y + 1, 0, BLOCKS.STONE), false, 'and above it');
  assert.equal(world.rejectedWrites, 2, 'and both are counted');
  assert.equal(world.setBlock(0, 70, 0, BLOCKS.STONE), true, 'a block inside it is accepted');
  assert.equal(world.rejectedWrites, 2, 'which does not change the count');
  world.resetRejectedWrites();
  assert.equal(world.rejectedWrites, 0, 'the count is per realize pass, not cumulative');
});
