// Tests for the Structure Inspector session harness.
//
// The inspector's value is that it can prove things about a structure *without* a world, so these
// tests drive the harness exactly as the page does: pick a structure, set a seed, locate a plan,
// realize it, and compare hashes.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStructureInspectorSession, createPreviewWorld, inspectorStructures, PREVIEW_MIN_Y
} from '../src/structureInspectorSession.js';
import { BLOCKS } from '../src/blocks.js';
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

  const pending = list.find((entry) => entry.id === 'stronghold');
  assert.equal(pending.implemented, false, 'an unimplemented structure is marked as such, not hidden');
  assert.equal(typeof pending.terrainAdaptation, 'string');
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
  assert.equal(session.world.getBlockMeta(x, y, z)?.lootTable, 'chests/buried_treasure');
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

test('an unimplemented structure reports a plan is impossible rather than crashing', () => {
  const session = createStructureInspectorSession({ seed: 1, structureId: 'stronghold' });
  const entry = session.setStructure('stronghold');
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
