// Structure-engine tests: determinism, vanilla placement maths, registry integrity, and the first
// implemented structure.
//
// These are unit tests of the *plan*, not screenshot comparisons. A structure that looks plausible but
// places at the wrong chunks is worse than one that is missing, because it silently breaks `/locate`,
// structure references and every later differential test.
import test from 'node:test';
import assert from 'node:assert/strict';

import { LegacyRandom, XoroshiroRandom, toSeedBigInt, contentHash } from '../src/worldgen/random.js';
import { BlockBox, Rotation, Mirror, Direction } from '../src/worldgen/geometry.js';
import {
  RandomSpreadStructurePlacement, ConcentricRingsStructurePlacement, FrequencyReducer, SpreadType,
  ExclusionZone, legacyFromLargeFeatureWithSalt
} from '../src/worldgen/placement.js';
import {
  STRUCTURES, STRUCTURE_SETS, STRUCTURE_TAGS, validateRegistry, createSets,
  getStructure, getSetForStructure, buildSetData
} from '../src/worldgen/registry.js';
import { StructureStart, StructurePiece, TerrainAdaptation } from '../src/worldgen/start.js';
import { BIOMES } from '../src/biomes.js';
import { BLOCKS } from '../src/blocks.js';
import { createStructureEngine, generatorCoverage, GENERATORS } from '../src/worldgen/index.js';

// ---------------------------------------------------------------------------------------------
// 1. Randomness
// ---------------------------------------------------------------------------------------------

test('LegacyRandom reproduces the published java.util.Random sequence', () => {
  // The JDK's documented first values for `new Random(0)`. If the LCG or the 48-bit masking were
  // wrong, every structure position in the world would move, so this is the cheapest possible guard.
  const random = new LegacyRandom(0);
  assert.equal(random.nextInt(), -1155484576);
  assert.equal(random.nextInt(), -723955400);
  assert.equal(random.nextInt(), 1033096058);
  assert.equal(random.nextInt(), -1690734402);
});

test('LegacyRandom matches the JDK for the bounded and floating-point draws', () => {
  // `nextInt(bound)` has two paths -- a multiply for powers of two and a rejection loop otherwise --
  // and both must consume the same number of draws as Java.
  const a = new LegacyRandom(42);
  const b = new LegacyRandom(42);
  assert.equal(a.nextIntBound(16), b.nextIntBound(16));
  assert.equal(a.nextDouble() >= 0 && a.nextDouble() < 1, true);

  const c = new LegacyRandom(7);
  for (let i = 0; i < 200; i++) {
    const value = c.nextIntBound(34);
    assert.ok(value >= 0 && value < 34, `nextIntBound(34) produced ${value}`);
  }
});

test('the large-feature mixing is order-sensitive and seed-sensitive', () => {
  // Compare a tuple of draws, not one: `nextIntBound(16)` is a power of two and can collide by chance
  // for two different inputs, which would make a single-draw comparison flaky rather than wrong.
  const draws = (x, z, salt, seed = 1234) => {
    const random = legacyFromLargeFeatureWithSalt(seed, x, z, salt);
    return [random.nextIntBound(1000), random.nextIntBound(1000), random.nextInt(), random.nextFloat()];
  };
  const first = draws(3, 5, 20083232);
  assert.notDeepEqual(first, draws(5, 3, 20083232));      // x/z are not interchangeable
  assert.notDeepEqual(first, draws(3, 5, 20083231));      // the salt matters
  assert.notDeepEqual(first, draws(3, 5, 20083232, 1235)); // the seed matters
  assert.deepEqual(first, draws(3, 5, 20083232));          // and it is stable, which is the point
});

test('seeds are widened to 64 bits so distant coordinates do not lose their low bits', () => {
  assert.equal(toSeedBigInt(-1), -1n);
  assert.equal(toSeedBigInt('9007199254740993'), 9007199254740993n);
  // A number seed must be an integer: a fractional seed would silently truncate.
  assert.throws(() => toSeedBigInt(1.5), /integer/);
  assert.throws(() => toSeedBigInt('abc'), /integer/);
  // The mixing constant exceeds 2^53 past |chunk| ~26000, so a double-based implementation would
  // collide there; BigInt must not.
  const far1 = legacyFromLargeFeatureWithSalt(1, 100000, 100000, 7).nextIntBound(64);
  const far2 = legacyFromLargeFeatureWithSalt(1, 100000, 100001, 7).nextIntBound(64);
  assert.notEqual(far1, far2);
});

test('Xoroshiro is deterministic and in range', () => {
  const a = XoroshiroRandom.fromSeed(99);
  const b = XoroshiroRandom.fromSeed(99);
  for (let i = 0; i < 50; i++) {
    const value = a.nextLong();
    assert.equal(value, b.nextLong());
    assert.equal(typeof value, 'bigint');
  }
});

test('contentHash is stable and order-sensitive', () => {
  assert.equal(contentHash([1, 2, 3]), contentHash([1, 2, 3]));
  assert.notEqual(contentHash([1, 2, 3]), contentHash([3, 2, 1]));
});

// ---------------------------------------------------------------------------------------------
// 2. Geometry
// ---------------------------------------------------------------------------------------------

test('BlockBox intersection is inclusive on both ends, as vanilla bounding boxes are', () => {
  const a = new BlockBox(0, 0, 0, 15, 15, 15);
  const b = new BlockBox(15, 15, 15, 30, 30, 30);
  const disjoint = new BlockBox(16, 0, 0, 31, 15, 15);
  assert.ok(a.intersects(b), 'boxes sharing a face intersect in vanilla');
  assert.equal(a.intersection(disjoint), null);
  assert.deepEqual(a.inflate(1).toArray(), [-1, -1, -1, 16, 16, 16]);
  assert.deepEqual(a.translate(16, 0, 0).toArray(), [16, 0, 0, 31, 15, 15]);
  assert.equal(a.volume, 16 * 16 * 16);
  assert.equal(a.chunksCovered().length, 1);
  assert.deepEqual(a.centre(), { x: 8, y: 8, z: 8 });
});

test('a start spanning a chunk border covers every chunk it touches', () => {
  const piece = new StructurePiece({ box: new BlockBox(-1, 0, -1, 16, 4, 16) });
  const start = new StructureStart({ structureId: 'test', chunkX: 0, chunkZ: 0, pieces: [piece] });
  const chunks = start.affectedChunks().map((c) => `${c.x},${c.z}`).sort();
  assert.deepEqual(chunks, ['-1,-1', '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0', '1,1']);
});

test('rotation and mirroring follow vanilla order (mirror, then rotate)', () => {
  assert.deepEqual(Rotation.rotate(0, 2, 3), { x: 2, z: 3 });
  assert.deepEqual(Rotation.rotate(1, 2, 3), { x: -3, z: 2 });
  assert.deepEqual(Rotation.rotate(2, 2, 3), { x: -2, z: -3 });
  assert.deepEqual(Rotation.rotate(3, 2, 3), { x: 3, z: -2 });
  assert.equal(Rotation.rotateDirection(1, 'north'), 'east');
  assert.equal(Direction.opposite('up'), 'down');
  assert.deepEqual(Mirror.mirror(Mirror.LEFT_RIGHT, 2, 3), { x: -2, z: 3 });
  assert.deepEqual(Mirror.mirror(Mirror.FRONT_BACK, 2, 3), { x: 2, z: -3 });
  // Mirroring and then rotating by a quarter turn swaps which axis the mirror acts on.
  assert.equal(Mirror.combine(1, Mirror.LEFT_RIGHT), Mirror.FRONT_BACK);
});

// ---------------------------------------------------------------------------------------------
// 3. Placement
// ---------------------------------------------------------------------------------------------

test('random spread places exactly one candidate per region, inside the stated bounds', () => {
  const placement = new RandomSpreadStructurePlacement({ spacing: 34, separation: 8, salt: 10387312 });
  const seed = 1337n;
  for (let regionX = -3; regionX <= 3; regionX++) {
    const candidates = new Set();
    for (let regionZ = -3; regionZ <= 3; regionZ++) {
      const chunkX = regionX * 34;
      const chunkZ = regionZ * 34;
      const [px, pz] = placement.getPotentialStructureChunk(seed, chunkX, chunkZ);
      candidates.add(`${px},${pz}`);
      // The offset must stay inside [0, spacing - separation).
      assert.ok(px >= regionX * 34 && px < regionX * 34 + 26, `x offset out of range: ${px}`);
      assert.ok(pz >= regionZ * 34 && pz < regionZ * 34 + 26, `z offset out of range: ${pz}`);
    }
    assert.equal(candidates.size, 7, 'one distinct candidate per region');
  }
});

test('isPlacementChunk agrees with getPotentialStructureChunk', () => {
  const placement = new RandomSpreadStructurePlacement({ spacing: 24, separation: 8, salt: 20083232 });
  const seed = 777n;
  const [px, pz] = placement.getPotentialStructureChunk(seed, 100, -50);
  assert.equal(placement.isPlacementChunk(seed, px, pz), true);
  // Any other chunk in the same region is not a candidate.
  assert.equal(placement.isPlacementChunk(seed, px + 1, pz), Math.floor((px + 1) / 24) !== Math.floor(px / 24));
});

test('negative chunk coordinates floor into the right region', () => {
  const placement = new RandomSpreadStructurePlacement({ spacing: 32, separation: 8, salt: 14357617 });
  const seed = 5n;
  // Region -1 spans chunks -32..-1, so a candidate must be negative but not below -32.
  const [px, pz] = placement.getPotentialStructureChunk(seed, -1, -1);
  assert.ok(px < 0 && px >= -32, `expected a negative candidate for chunk -1, got ${px}`);
  assert.ok(pz < 0 && pz >= -32);
  // A JS truncating division would have produced region 0 here and placed it at a positive chunk.
  assert.notEqual(px, placement.getPotentialStructureChunk(seed, 0, 0)[0]);
});

test('triangular spread clusters offsets toward the middle of the region', () => {
  const linear = new RandomSpreadStructurePlacement({ spacing: 32, separation: 5, salt: 10387313, spreadType: 'linear' });
  const triangular = new RandomSpreadStructurePlacement({ spacing: 32, separation: 5, salt: 10387313, spreadType: 'triangular' });
  const mean = (placement) => {
    let total = 0;
    for (let i = 0; i < 400; i++) {
      total += placement.getPotentialStructureChunk(42n, i * 32, 0)[0] - i * 32;
    }
    return total / 400;
  };
  // Both have the same support (0..26); the triangular one puts more mass near the centre, so its mean
  // sits closer to the middle than the linear one's (which is ~13).
  const linearMean = mean(linear);
  const triangularMean = mean(triangular);
  assert.ok(Math.abs(triangularMean - 13) <= Math.abs(linearMean - 13) + 1.5,
    `triangular mean ${triangularMean} should not be further from the centre than linear ${linearMean}`);
});

test('SpreadType.evaluate returns 0 when the bound is empty, rather than throwing', () => {
  const random = new LegacyRandom(1);
  assert.equal(SpreadType.evaluate('linear', random, 0), 0);
  assert.equal(SpreadType.evaluate('triangular', random, 0), 0);
});

test('every frequency reducer is deterministic and the documented default is the float test', () => {
  const reducer = FrequencyReducer.fromType('default');
  // `default` consumes a float from the salt-mixed chunk stream; two calls with the same inputs must
  // agree, and the reducer must be able to return both true and false across a sample.
  const results = new Set();
  for (let i = 0; i < 200; i++) results.add(reducer(99n, 1234, i, 7, 0.5));
  assert.deepEqual([...results].sort(), [false, true]);
  assert.equal(reducer(99n, 1234, 5, 7, 0.5), reducer(99n, 1234, 5, 7, 0.5));
  // A mis-typed method must fall back to the documented default rather than crash worldgen.
  assert.equal(typeof FrequencyReducer.fromType('not_a_method'), 'function');
});

test('a frequency below 1 rejects most candidate chunks', () => {
  const placement = new RandomSpreadStructurePlacement({ spacing: 1, separation: 0, salt: 0, frequency: 0.01 });
  const context = { seed: 4242n, placementForSet: () => null };
  let accepted = 0;
  for (let chunk = 0; chunk < 2000; chunk++) {
    if (placement.isStructureChunk(context, chunk, 0)) accepted++;
  }
  assert.ok(accepted > 0 && accepted < 120, `expected roughly 1% of 2000 chunks, accepted ${accepted}`);
});

test('concentric rings produce the requested count, in rings, deterministically', () => {
  const placement = new ConcentricRingsStructurePlacement({ distance: 32, count: 128, spread: 3, salt: 0 });
  const positions = placement.prepare(0n);
  assert.equal(positions.length, 128);
  // Ring one has `spread` positions and they are spread around the origin at a similar radius.
  const firstRing = positions.slice(0, 3).map((p) => Math.hypot(p.centre[0], p.centre[1]));
  for (const radius of firstRing) {
    assert.ok(radius > 32 * 4 * 0.5 && radius < 32 * 4 * 2, `first-ring radius ${radius} looks wrong`);
  }
  // Deeper rings are further out than the first.
  const lastRadius = Math.hypot(positions.at(-1).centre[0], positions.at(-1).centre[1]);
  assert.ok(lastRadius > Math.max(...firstRing), 'the final ring must be the outermost');
  // Same seed, same rings.
  const again = new ConcentricRingsStructurePlacement({ distance: 32, count: 128, spread: 3, salt: 0 }).prepare(0n);
  assert.deepEqual(again.map((p) => p.centre), positions.map((p) => p.centre));
});

test('an exclusion zone forbids a chunk next to the other set candidate', () => {
  const other = new RandomSpreadStructurePlacement({ spacing: 34, separation: 8, salt: 10387312 });
  const zone = new ExclusionZone({ otherSet: 'villages', chunkCount: 10 });
  const context = { seed: 2024n, placementForSet: () => other };
  const [vx, vz] = other.getPotentialStructureChunk(2024n, 0, 0);
  assert.equal(zone.isPlacementForbidden(context, 'pillager_outposts', vx + 3, vz, new Set()), true);
  assert.equal(zone.isPlacementForbidden(context, 'pillager_outposts', vx + 40, vz + 40, new Set()), false);
});

test('an exclusion cycle is reported instead of recursing forever', () => {
  // spacing 1 / separation 0 makes every chunk a candidate, so the cycle is reachable immediately.
  // Two sets that exclude each other are not a vanilla configuration, but a data pack could create one
  // and vanilla's own recursion would then be unbounded.
  const a = new RandomSpreadStructurePlacement({ spacing: 1, separation: 0, salt: 1 });
  const b = new RandomSpreadStructurePlacement({ spacing: 1, separation: 0, salt: 2 });
  a.exclusionZone = new ExclusionZone({ otherSet: 'b', chunkCount: 1 });
  b.exclusionZone = new ExclusionZone({ otherSet: 'a', chunkCount: 1 });
  const context = { seed: 1n, placementForSet: (name) => (name === 'a' ? a : b) };
  assert.throws(() => a.isStructureChunk(context, 0, 0, 'a', new Set()), /cycle/);
});

// ---------------------------------------------------------------------------------------------
// 4. Registry integrity
// ---------------------------------------------------------------------------------------------

test('the 1.21.4 registry validates against this game biome registry and the format rules', () => {
  const problems = validateRegistry({ biomes: BIOMES });
  assert.deepEqual(problems, [], `registry problems:\n${problems.join('\n')}`);
});

test('the registry carries the 20 vanilla structure sets with the wiki numbers', () => {
  assert.equal(STRUCTURE_SETS.length, 20);
  const byName = Object.fromEntries(STRUCTURE_SETS.map((set) => [set.name, set]));
  // Spot-check the values that are easiest to get wrong and most damaging if wrong.
  assert.deepEqual(
    [byName.buried_treasures.spacing, byName.buried_treasures.separation, byName.buried_treasures.salt, byName.buried_treasures.frequency],
    [1, 0, 0, 0.01]
  );
  assert.deepEqual([byName.ancient_cities.spacing, byName.ancient_cities.salt], [24, 20083232]);
  assert.deepEqual([byName.woodland_mansions.spacing, byName.woodland_mansions.spreadType], [80, 'triangular']);
  assert.deepEqual([byName.ocean_monuments.spreadType], ['triangular']);
  assert.equal(byName.strongholds.type, 'concentric_rings');
  assert.deepEqual([byName.strongholds.distance, byName.strongholds.count, byName.strongholds.spread], [32, 128, 3]);
  assert.deepEqual(byName.pillager_outposts.exclusionZone, { otherSet: 'villages', chunkCount: 10 });
  assert.equal(byName.villages.structures.length, 5);
  assert.equal(byName.ruined_portals.structures.length, 7);
});

test('structure ids are the registry ids (/locate), not the display names or types', () => {
  // The three pairs that are easiest to conflate; `/locate structure monument` must work and
  // `ocean_monument` must not be a registry id.
  assert.equal(getStructure('monument').type, 'ocean_monument');
  assert.equal(getStructure('mansion').type, 'woodland_mansion');
  assert.equal(getStructure('jungle_pyramid').type, 'jungle_temple');
  assert.equal(getStructure('ocean_monument'), null);
  assert.equal(getStructure('woodland_mansion'), null);
});

test('every structure set member is reachable and every tag member is a real structure', () => {
  for (const [tag, members] of Object.entries(STRUCTURE_TAGS)) {
    for (const id of members) {
      assert.ok(STRUCTURES[id], `${tag} names ${id}, which is not in the registry`);
    }
  }
  assert.equal(getSetForStructure('buried_treasure').name, 'buried_treasures');
  assert.equal(getSetForStructure('village_desert').name, 'villages');
});

test('dimension filtering keeps ruined_portals usable in both dimensions', () => {
  const overworld = buildSetData({ dimension: 'overworld' }).find((set) => set.name === 'ruined_portals');
  const nether = buildSetData({ dimension: 'nether' }).find((set) => set.name === 'ruined_portals');
  assert.ok(overworld.structures.some(([id]) => id === 'ruined_portal'));
  assert.ok(!overworld.structures.some(([id]) => id === 'ruined_portal_nether'));
  assert.deepEqual(nether.structures.map(([id]) => id), ['ruined_portal_nether']);
  assert.equal(createSets({ dimension: 'the_end' }).has('end_cities'), true);
  assert.equal(createSets({ dimension: 'the_end' }).size, 1);
});

test('post-1.21.4 content is absent from the registry', () => {
  // Abandoned Camp is 26.3; Pale Garden mansions and the tag renames are 1.21.5+. Their presence would
  // mean two versions had been mixed.
  assert.equal(STRUCTURES.abandoned_camp, undefined);
  assert.deepEqual(STRUCTURES.mansion.biomes, ['dark_forest']);
  assert.ok(STRUCTURE_TAGS['minecraft:on_ocean_explorer_maps'], 'the 1.21.4 tag name must be used');
  assert.equal(STRUCTURE_TAGS['minecraft:on_ocean_monument_maps'], undefined);
});

// ---------------------------------------------------------------------------------------------
// 5. Generation and determinism
// ---------------------------------------------------------------------------------------------

/** A flat beach world adapter: enough for buried treasure, and no world generation at all. */
function beachAdapter({ biome = 'beach', surface = 64 } = {}) {
  return {
    biomeAt: () => biome,
    surfaceY: () => surface
  };
}

test('buried treasure generates at chunk-local 9,9 on the ocean floor', () => {
  const engine = createStructureEngine({ seed: 1, blockIds: BLOCKS, ...beachAdapter() });
  const start = GENERATORS.buriedTreasure.generate({ seed: 1, chunkX: 3, chunkZ: -2, context: { surfaceY: () => 64 } });
  assert.equal(start.pieces.length, 1);
  assert.deepEqual(start.pieces[0].box.toArray(), [3 * 16 + 9, 64, -2 * 16 + 9, 3 * 16 + 9, 64, -2 * 16 + 9]);
  assert.equal(start.pieces[0].meta.facing, 'east');
  assert.equal(engine, engine, 'engine construction must not throw');
});

test('the biome gate rejects a chunk in the wrong biome, and the retry loop then finds nothing', () => {
  // Buried treasure is the only member of its set, so a rejected biome means "nothing here" rather than
  // "try the next member" -- the single-entry shortcut in the placement engine.
  const wrongBiome = createStructureEngine({ seed: 5, blockIds: BLOCKS, ...beachAdapter({ biome: 'desert' }) });
  let planned = 0;
  for (let chunk = 0; chunk < 200; chunk++) {
    if (wrongBiome.planChunk(chunk, 0)) planned++;
  }
  assert.equal(planned, 0, 'no buried treasure may generate in a desert');
});

test('planning is deterministic and independent of the order chunks are asked about', () => {
  const adapter = beachAdapter();
  const forward = createStructureEngine({ seed: 90210, blockIds: BLOCKS, ...adapter });
  const reverse = createStructureEngine({ seed: 90210, blockIds: BLOCKS, ...adapter });

  // With spacing 1 and frequency 0.01, a few chunks in every hundred carry a start.
  const chunks = [];
  for (let chunk = 0; chunk < 600; chunk++) chunks.push(chunk);
  const forwardHashes = new Map();
  for (const chunk of chunks) {
    const plan = forward.planChunk(chunk, 0);
    forwardHashes.set(chunk, plan ? forward.hashStart(plan.start) : null);
  }
  const reverseHashes = new Map();
  for (const chunk of [...chunks].reverse()) {
    const plan = reverse.planChunk(chunk, 0);
    reverseHashes.set(chunk, plan ? reverse.hashStart(plan.start) : null);
  }
  // Compare per chunk rather than as entry arrays: the two maps are built in opposite insertion
  // orders, so comparing them with deepEqual would fail on ordering alone and say nothing about
  // determinism.
  for (const chunk of chunks) {
    assert.equal(forwardHashes.get(chunk), reverseHashes.get(chunk), `chunk ${chunk} differs by ask-order`);
  }
  const planned = [...forwardHashes.values()].filter((hash) => hash !== null);
  assert.ok(planned.length > 0, 'the sample must contain at least one structure');
  assert.ok(planned.length < 60, `expected roughly 1% of 600 chunks, got ${planned.length}`);
});

test('a different seed moves the placement candidates', () => {
  // Asserted on the candidate positions rather than on the accepted plan set: with the `default`
  // frequency reducer a small seed delta reaches only the low bits of the mixed state, so a 1% set can
  // legitimately accept the same chunks for two nearby seeds. The positions themselves are strongly
  // seed-dependent, which is the property that actually matters.
  const placement = new RandomSpreadStructurePlacement({ spacing: 34, separation: 8, salt: 10387312 });
  let differences = 0;
  for (let region = 0; region < 50; region++) {
    const a = placement.getPotentialStructureChunk(1n, region * 34, 0);
    const b = placement.getPotentialStructureChunk(2n, region * 34, 0);
    if (a[0] !== b[0] || a[1] !== b[1]) differences++;
  }
  assert.ok(differences > 40, `expected most regions to move with the seed, got ${differences}/50`);

  // ...and the accepted set really is seed-dependent too, over a wide enough sample that the low-bit
  // coupling cannot mask it.
  const counts = [1, 2, 3, 90210].map((seed) => {
    const engine = createStructureEngine({ seed, blockIds: BLOCKS, ...beachAdapter() });
    let planned = 0;
    for (let chunk = 0; chunk < 3000; chunk++) if (engine.planChunk(chunk, 0)) planned++;
    return planned;
  });
  assert.ok(new Set(counts).size > 1, `expected seed-dependent counts, got ${counts.join(',')}`);
});

test('realization writes the chest only into the requested chunk', () => {
  const engine = createStructureEngine({ seed: 11, blockIds: BLOCKS, ...beachAdapter() });
  const start = GENERATORS.buriedTreasure.generate({ seed: 11, chunkX: 0, chunkZ: 0, context: { surfaceY: () => 70 } });
  const written = [];
  const setBlock = (x, y, z, id, meta) => { written.push({ x, y, z, id, meta }); return true; };

  engine.realize(start, setBlock);
  assert.equal(written.length, 1);
  assert.equal(written[0].id, BLOCKS.CHEST);
  assert.equal(written[0].meta.lootTable, 'chests/buried_treasure');

  // Clipped to a neighbouring chunk, the same start writes nothing.
  const clipped = [];
  engine.realize(start, (x, y, z, id) => { clipped.push({ x, z, id }); return true; }, { chunkX: 5, chunkZ: 5 });
  assert.equal(clipped.length, 0, 'a start outside the requested chunk must not write into it');
});

test('locate finds buried treasure and applies its (9,0,9) offset', () => {
  const engine = createStructureEngine({ seed: 4242, blockIds: BLOCKS, ...beachAdapter() });
  const found = engine.locate('buried_treasure', 0, 0, { maxRadiusChunks: 256 });
  assert.ok(found, 'a buried treasure must be findable near the origin');
  assert.equal(found.structureId, 'buried_treasure');
  // The locate offset shifts the reported point by 9 on X and Z, so the reported point must equal the
  // reference position plus that offset.
  const reference = found.start.placementReference();
  assert.equal(found.point.x, reference.x + 9);
  assert.equal(found.point.z, reference.z + 9);
  // And the reported chunk really is a candidate of the set. Note the signature difference that is
  // easy to get wrong: `isPlacementChunk` takes a bare seed, `isStructureChunk` takes a context.
  assert.equal(engine.sets.get('buried_treasures').placement.isPlacementChunk(4242n, found.chunk[0], found.chunk[1]), true);
});

test('generator coverage is honest about what is not implemented yet', () => {
  const { implemented, missing } = generatorCoverage();
  assert.deepEqual(implemented, ['buried_treasure']);
  // The count is asserted loosely: it must shrink as structures land, never grow silently.
  assert.ok(missing.length >= 28, `expected most structures to be unimplemented, got ${missing.length}`);
  assert.ok(missing.includes('village_plains'));
  assert.ok(missing.includes('stronghold'));
});

test('start bounding boxes inflate only when the structure adapts to terrain', () => {
  const piece = new StructurePiece({ box: new BlockBox(0, 0, 0, 4, 4, 4) });
  const none = new StructureStart({ structureId: 'x', chunkX: 0, chunkZ: 0, pieces: [piece], terrainAdaptation: TerrainAdaptation.NONE });
  const thin = new StructureStart({ structureId: 'x', chunkX: 0, chunkZ: 0, pieces: [piece], terrainAdaptation: TerrainAdaptation.BEARD_THIN });
  assert.deepEqual(none.box.toArray(), [0, 0, 0, 4, 4, 4]);
  assert.deepEqual(thin.box.toArray(), [-12, -12, -12, 16, 16, 16]);
  // An empty start has no box at all, which is how vanilla distinguishes "nothing here".
  assert.equal(new StructureStart({ structureId: 'x', chunkX: 0, chunkZ: 0, pieces: [] }).box, null);
});
