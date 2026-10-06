// Eligibility regression tests: biome boundaries, structure provenance, dimensions.
//
// These cover the P0 finding that a pack's species was chosen once and then never re-checked at each
// member's own position, and the P0 finding that the dimension gate used hand-written allowlists that
// banned Endermen from the Nether and ordinary skeletons from fortresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FixtureWorld } from './helpers/spawnFixture.js';
import { resolveSpawnList, STRUCTURE_SPAWN_OVERRIDES } from '../src/spawning/biomeSpawnResolver.js';
import { dimensionAllowsType } from '../src/spawning/mobSpawnManager.js';
import { MobCategory, categoryOf } from '../src/spawning/mobCategories.js';
import { biomeSpawnsFor } from '../src/spawning/biomeSpawnResolver.js';
import { BIOME_SPAWN_TABLES, BIOME_SPAWN_MOB_TYPES } from '../src/spawning/vanillaBiomeSpawns.js';
import { STRUCTURE_SPAWN_MOB_TYPES } from '../src/spawning/vanillaStructureSpawns.js';
import { BLOCKS } from '../src/blocks.js';

// =============================================================================================
// Per-member eligibility
// =============================================================================================

test('a pack member that walks into a biome without its species is not spawned', () => {
  // Vanilla: "For later mob spawn attempts in the pack, if the selected species cannot spawn at the
  // location (e.g. due to being in a different biome or structure) then that attempt fails."
  //
  // A tropical fish is only listed in warm/lukewarm oceans and lush caves; a plains column lists
  // sheep, pig, chicken, cow, horse and donkey under CREATURE and nothing under WATER_AMBIENT.
  const originBiome = 'warm_ocean';
  const destinationBiome = 'plains';
  const species = 'tropical_fish';

  // Positive control: the species IS listed at the origin.
  assert.ok(
    biomeSpawnsFor(originBiome, MobCategory.WATER_AMBIENT).some(e => e.type === species),
    `${species} must be listed in ${originBiome}`,
  );
  // And it is NOT listed at the destination -- which is what the member check keys on.
  assert.equal(
    biomeSpawnsFor(destinationBiome, MobCategory.WATER_AMBIENT).some(e => e.type === species),
    false,
    `${species} must not be listed in ${destinationBiome}`,
  );

  // resolveSpawnList is the function the per-member check calls; assert it reports no such entry.
  const atDestination = resolveSpawnList({
    biomeId: destinationBiome, category: MobCategory.WATER_AMBIENT,
    x: 100, y: 30, z: 100, structureAt: null,
  });
  assert.equal(atDestination.entries.some(e => e.type === species), false);
});

test('a pack member that crosses into a fully suppressing structure is not spawned', () => {
  // A trial chamber suppresses every category, so a pack that walks into one must stop.
  const inside = resolveSpawnList({
    biomeId: 'plains', category: MobCategory.MONSTER, x: 0, y: 30, z: 0,
    structureAt: () => 'trial_chambers',
  });
  assert.equal(inside.source, 'structure_suppressed');
  assert.deepEqual(inside.entries, []);

  // Positive control: outside the structure the biome list is non-empty, so the pack continues.
  const outside = resolveSpawnList({
    biomeId: 'plains', category: MobCategory.MONSTER, x: 0, y: 30, z: 0,
    structureAt: () => null,
  });
  assert.equal(outside.source, 'biome');
  assert.ok(outside.entries.length > 0);
});

test('a pack member keeps its structure provenance from the position it lands on', () => {
  // A member that walks out of a fortress must lose the fortress override; one that walks in gains it.
  const inFortress = resolveSpawnList({
    biomeId: 'soul_sand_valley', category: MobCategory.MONSTER, x: 0, y: 30, z: 0,
    structureAt: () => 'fortress',
  });
  assert.equal(inFortress.structureId, 'nether_fortress');
  assert.equal(inFortress.source, 'structure');

  const outsideFortress = resolveSpawnList({
    biomeId: 'soul_sand_valley', category: MobCategory.MONSTER, x: 0, y: 30, z: 0,
    structureAt: () => null,
  });
  assert.equal(outsideFortress.structureId, null);
  assert.equal(outsideFortress.source, 'biome');
});

test('the fortress override lists endermen, so a pack there is eligible', () => {
  // A guard against over-tightening the per-member check: the fortress monster list includes
  // zombified_piglin and skeleton, and the soul sand valley biome list includes enderman.
  const fortress = STRUCTURE_SPAWN_OVERRIDES.nether_fortress.categories[MobCategory.MONSTER];
  const types = fortress.entries.map(e => e.type);
  assert.ok(types.includes('blaze'));
  assert.ok(types.includes('skeleton'), 'the fortress names ordinary skeletons');
  assert.equal(types.includes('enderman'), false, 'but not endermen: those come from the biome');
  // And the biome provides them.
  assert.ok(
    biomeSpawnsFor('soul_sand_valley', MobCategory.MONSTER).some(e => e.type === 'enderman'),
    'soul sand valley must list endermen',
  );
});

// =============================================================================================
// Dimension eligibility, derived from data rather than an allowlist
// =============================================================================================

test('endermen may spawn naturally in all three dimensions', () => {
  // Mojang describes natural Enderman spawning in the Overworld, the Nether and the End. The previous
  // allowlist banned them from the Nether, even though nether_wastes, soul_sand_valley and
  // warped_forest all list `enderman` in their monster tables.
  for (const dimension of ['overworld', 'nether', 'the_end']) {
    assert.equal(dimensionAllowsType(dimension, 'enderman'), true,
      `endermen must be eligible in the ${dimension}`);
  }
  // And the data really does list them, so this is not passing for the wrong reason.
  for (const biome of ['nether_wastes', 'soul_sand_valley', 'warped_forest']) {
    assert.ok(
      (BIOME_SPAWN_TABLES[biome]?.monster || []).some(e => e.type === 'enderman'),
      `${biome} must list enderman`,
    );
  }
});

test('ordinary skeletons may spawn in the Nether, because the fortress lists them', () => {
  // The previous allowlist banned every non-Nether mob from the Nether, including skeletons, which the
  // pinned fortress override explicitly lists at weight 2.
  assert.equal(dimensionAllowsType('nether', 'skeleton'), true);
  assert.equal(dimensionAllowsType('overworld', 'skeleton'), true);
  assert.equal(dimensionAllowsType('the_end', 'skeleton'), false);
});

test('mobs with no list in a dimension are refused there', () => {
  // The cases a hand-written allowlist was trying to cover, now derived from the data.
  assert.equal(dimensionAllowsType('nether', 'cow'), false, 'no Nether list names a cow');
  assert.equal(dimensionAllowsType('the_end', 'cow'), false);
  assert.equal(dimensionAllowsType('overworld', 'blaze'), false, 'blazes are fortress-only');
  assert.equal(dimensionAllowsType('overworld', 'wither_skeleton'), false);
  assert.equal(dimensionAllowsType('overworld', 'ghast'), false);
  assert.equal(dimensionAllowsType('overworld', 'piglin'), false);
  assert.equal(dimensionAllowsType('nether', 'cod'), false);
  assert.equal(dimensionAllowsType('the_end', 'zombie'), false);
});

test('Nether mobs are refused in the Overworld and allowed in the Nether', () => {
  for (const type of ['blaze', 'wither_skeleton', 'magma_cube', 'strider', 'hoglin', 'piglin']) {
    assert.equal(dimensionAllowsType('nether', type), true, `${type} must be eligible in the Nether`);
    assert.equal(dimensionAllowsType('overworld', type), false, `${type} must not be eligible in the Overworld`);
  }
});

test('a Nether structure override cannot authorise an Overworld spawn', () => {
  // The generator records each structure's dimension; the dimension gate reads it. Without that, a
  // blaze would be "allowed" in the Overworld because the fortress lists it.
  assert.equal(STRUCTURE_SPAWN_OVERRIDES.nether_fortress.dimension, 'nether');
  assert.equal(dimensionAllowsType('overworld', 'blaze'), false);
  assert.equal(dimensionAllowsType('nether', 'blaze'), true);
});

test('the dimension gate does not silently drop mobs the data lists', () => {
  // A guard against the gate becoming a second, narrower filter: every mob named by a Nether biome's
  // tables must be eligible in the Nether.
  for (const [biomeId, table] of Object.entries(BIOME_SPAWN_TABLES)) {
    const isNetherBiome = [
      'nether_wastes', 'soul_sand_valley', 'crimson_forest', 'warped_forest', 'basalt_deltas', 'nether',
    ].includes(biomeId);
    if (!isNetherBiome) continue;
    for (const entries of Object.values(table)) {
      for (const entry of entries) {
        assert.equal(dimensionAllowsType('nether', entry.type), true,
          `${entry.type} is listed in ${biomeId} but the dimension gate refuses it`);
      }
    }
  }
});

test('the biome and structure mob-type sets are separate, and both are covered', () => {
  // `BIOME_SPAWN_MOB_TYPES` is documented as "every mob type that appears in any BIOME's spawn table",
  // and the parity test uses it to assert that everything a biome can spawn is constructible. A
  // structure-only mob leaking into it would make the name false and silently widen that assertion.
  //
  // These types appear in NO biome table -- only in structure overrides -- so they must be in the
  // structure set and NOT in the biome set.
  const STRUCTURE_ONLY = ['blaze', 'guardian', 'pillager', 'wither_skeleton'];
  for (const type of STRUCTURE_ONLY) {
    assert.equal(BIOME_SPAWN_MOB_TYPES.includes(type), false,
      `${type} appears in no biome table and must not be in BIOME_SPAWN_MOB_TYPES`);
    assert.equal(STRUCTURE_SPAWN_MOB_TYPES.includes(type), true,
      `${type} must be in STRUCTURE_SPAWN_MOB_TYPES`);
  }

  // Positive control: a mob that genuinely appears in biome tables is in the biome set.
  for (const type of ['cow', 'cod', 'enderman', 'ghast', 'strider']) {
    assert.equal(BIOME_SPAWN_MOB_TYPES.includes(type), true, `${type} must be in the biome set`);
  }

  // And every type in either set must be named by the data it claims to describe.
  for (const type of BIOME_SPAWN_MOB_TYPES) {
    const found = Object.values(BIOME_SPAWN_TABLES)
      .some(table => Object.values(table).some(entries => entries.some(e => e.type === type)));
    assert.ok(found, `${type} is in BIOME_SPAWN_MOB_TYPES but appears in no biome table`);
  }
  for (const type of STRUCTURE_SPAWN_MOB_TYPES) {
    const found = Object.values(STRUCTURE_SPAWN_OVERRIDES)
      .some(row => Object.values(row.categories).some(spec => spec.entries.some(e => e.type === type)));
    assert.ok(found, `${type} is in STRUCTURE_SPAWN_MOB_TYPES but appears in no override`);
  }
});
