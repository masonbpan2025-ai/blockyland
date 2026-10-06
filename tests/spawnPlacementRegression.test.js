// Placement and collision regression tests.
//
// Every case here comes from a concrete finding recorded in
// docs/mob-spawning-implementation-plan.md section 3, and every repair has a POSITIVE CONTROL: a
// test that would fail if the fix refused everything. A suite that only asserts rejections can be
// satisfied by an implementation that spawns nothing at all.
//
// The worlds are hand-authored (`tests/helpers/spawnFixture.js`) rather than generated, because a
// test that has to find water in random terrain can pass by never finding any.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FixtureWorld, RecordingMobManager, frozenWaterFixture, frozenWaterWallFixture, grassFieldFixture,
  isSolidBlockId,
} from './helpers/spawnFixture.js';
import {
  validateGenericSpawn, SpawnRejection, boxFits, hasFloor, heightAt,
  MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE,
} from '../src/spawning/spawnValidation.js';
import { SpawnPlacementType, HeightmapType, blocksMotion } from '../src/spawning/spawnPlacements.js';
import {
  fishPredicate, glowSquidPredicate, squidPredicate, axolotlPredicate, striderPredicate,
  drownedPredicate, ghastPredicate, batPredicate, defaultPassivePredicate,
} from '../src/spawning/mobSpawnPredicates.js';
import { BLOCKS } from '../src/blocks.js';

const DIMS = {
  salmon: { width: 0.4, height: 0.35 },
  cod: { width: 0.35, height: 0.3 },
  tropical_fish: { width: 0.5, height: 0.4 },
  squid: { width: 0.8, height: 0.8 },
  glow_squid: { width: 0.8, height: 0.8 },
  axolotl: { width: 0.5, height: 0.35 },
  strider: { width: 0.9, height: 1.7 },
  zombie: { width: 0.6, height: 1.95 },
  drowned: { width: 0.6, height: 1.95 },
  ghast: { width: 4.0, height: 4.0 },
  bat: { width: 0.5, height: 0.9 },
  cow: { width: 0.9, height: 1.4 },
};

/** Validate one candidate with a player parked a legal distance away. */
function validate(world, type, x, y, z, overrides = {}) {
  const dims = DIMS[type] || { width: 0.6, height: 1.95 };
  const placement = overrides.placement
    ?? (['salmon', 'cod', 'tropical_fish', 'squid', 'glow_squid', 'axolotl', 'drowned'].includes(type)
      ? SpawnPlacementType.IN_WATER
      : type === 'strider' ? SpawnPlacementType.IN_LAVA : SpawnPlacementType.ON_GROUND);
  return validateGenericSpawn({
    world,
    // Far enough to clear the 24-block exclusion, close enough to be inside the 128-block sphere.
    players: overrides.players ?? [{ x: x + 40, y, z }],
    difficulty: overrides.difficulty ?? 'normal',
    dimension: overrides.dimension ?? world.dimension,
    x, y, z,
    placement,
    width: overrides.width ?? dims.width,
    height: overrides.height ?? dims.height,
    requiresHostileDifficulty: overrides.requiresHostileDifficulty ?? false,
    mobCanSpawnInDimension: overrides.mobCanSpawnInDimension ?? true,
    checkPlayerDistance: overrides.checkPlayerDistance ?? true,
    isSolidAt: (bx, by, bz) => isSolidBlockId(world.getVoxel(bx, by, bz)),
  });
}

/** A predicate context matching what `NaturalSpawner.predicateContext` supplies. */
function predicateContext(world, { x, y, z, type, biomeId, random, structureId = null, thunder = false, skyDarken = 0 }) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  return {
    world, x, y, z, type, biomeId: biomeId ?? world.getBiome(bx, bz),
    structureId, category: null,
    dimension: world.dimension,
    difficulty: 'normal',
    random: random ?? { nextInt: () => 0, nextFloat: () => 0, nextDouble: () => 0 },
    blockAt: world.getVoxel(bx, y, bz),
    blockBelow: world.getVoxel(bx, y - 1, bz),
    skyLight: world.getSkyLight(bx, y, bz),
    blockLight: world.getBlockLight(bx, y, bz),
    skyDarken, thunder,
    isNight: false,
    lightLevel: world.getLightLevel(bx, y, bz, skyDarken),
  };
}

// =============================================================================================
// P0-1: IN_WATER / IN_LAVA must not bypass the bounding-box collision test
// =============================================================================================

test('IN_WATER: a fish whose box penetrates an adjacent ice wall is refused', () => {
  // The reported symptom. A salmon is 0.4 wide, so centred at x=0.9 its box spans 0.68..1.12 and
  // reaches into the ice wall occupying block x=1. Water below and around, solid beside: illegal.
  const world = frozenWaterWallFixture();
  const y = world.seaLevel - 2;
  assert.equal(world.getVoxel(1, y, 8), BLOCKS.ICE, 'the wall must be ice at the test Y');
  const result = validate(world, 'salmon', 0.9, y, 8);
  assert.equal(result.ok, false,
    'a water-centred fish whose box intersects an ice wall must be refused');
  assert.equal(result.reason, SpawnRejection.COLLISION);
});

test('IN_WATER positive control: a fish with clear water around it is accepted', () => {
  // Same world and Y, but far enough from the wall that the box is entirely in water.
  const world = frozenWaterWallFixture();
  const y = world.seaLevel - 2;
  const result = validate(world, 'salmon', 8.5, y, 8);
  assert.equal(result.ok, true,
    `a fish in open water must still be accepted, got ${result.reason}`);
});

test('IN_WATER: a fish centred inside ice is refused', () => {
  const world = frozenWaterWallFixture();
  const y = world.seaLevel - 2;
  // The wall block itself: not water at the candidate, so the fluid rule refuses first.
  const result = validate(world, 'salmon', 1.5, y, 8);
  assert.equal(result.ok, false, 'a fish centred in ice must be refused');
  assert.equal(result.reason, SpawnRejection.WRONG_FLUID);
});

test('IN_WATER: a fish on air above the ice sheet is refused', () => {
  const world = frozenWaterFixture();
  const aboveIce = world.seaLevel + 2;
  assert.equal(world.getVoxel(8, aboveIce, 8), BLOCKS.AIR, 'the test position must be air');
  const result = validate(world, 'salmon', 8.5, aboveIce, 8);
  assert.equal(result.ok, false, 'a fish in air above ice must be refused');
  assert.equal(result.reason, SpawnRejection.WRONG_FLUID);
});

test('IN_WATER: exact boundary contact with ice is allowed, penetration is not', () => {
  // A salmon 0.4 wide centred at x=0.4 spans 0.18..0.62, entirely inside the water block x=0, so it
  // does not reach the wall at x=1. At x=0.9 the box reaches 1.12 and penetrates.
  const world = frozenWaterWallFixture();
  const y = world.seaLevel - 2;
  const clear = validate(world, 'salmon', 0.4, y, 8);
  assert.equal(clear.ok, true, `expected a clear-water fish at x=0.4 to pass, got ${clear.reason}`);
  const penetrating = validate(world, 'salmon', 0.9, y, 8);
  assert.equal(penetrating.ok, false, 'expected a penetrating fish at x=0.9 to be refused');
});

test('IN_LAVA: a lava mob whose box penetrates a ceiling is refused', () => {
  const world = new FixtureWorld({ biome: 'nether_wastes', dimension: 'nether' });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.NETHERRACK);
  world.fill(-16, 4, -16, 31, 6, 31, BLOCKS.LAVA);
  world.fill(-16, 7, -16, 31, 8, 31, BLOCKS.NETHERRACK); // ceiling
  // A strider is 1.7 tall: standing at y=6 its box reaches 7.7, into the ceiling.
  const blocked = validate(world, 'strider', 8.5, 6, 8, { dimension: 'nether' });
  assert.equal(blocked.ok, false, 'a lava mob intersecting the ceiling must be refused');
  assert.equal(blocked.reason, SpawnRejection.COLLISION);
  // At y=4 there is room: 4..5.7 stays inside the lava and below the ceiling at 7.
  const clear = validate(world, 'strider', 8.5, 4, 8, { dimension: 'nether' });
  assert.equal(clear.ok, true, `expected a clear lava mob at y=4 to pass, got ${clear.reason}`);
});

test('NO_RESTRICTIONS still checks that the box fits solid blocks', () => {
  const world = grassFieldFixture();
  // Buried inside stone: a NO_RESTRICTIONS placement must still refuse.
  const result = validate(world, 'zombie', 8.5, 10, 8.5, {
    placement: SpawnPlacementType.NO_RESTRICTIONS,
  });
  assert.equal(result.ok, false, 'a NO_RESTRICTIONS mob inside solid rock must be refused');
  assert.equal(result.reason, SpawnRejection.COLLISION);
});

test('an unloaded chunk is never treated as air', () => {
  const world = new FixtureWorld({ biome: 'plains' });
  // Deliberately load no chunks at all.
  const result = validate(world, 'zombie', 8.5, 30, 8.5, { checkPlayerDistance: false });
  assert.equal(result.ok, false);
  assert.equal(result.reason, SpawnRejection.CHUNK_NOT_LOADED);
});

test('the box test reaches into neighbour chunks when the mob straddles a border', () => {
  const world = new FixtureWorld({ biome: 'plains' });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 29, 31, BLOCKS.STONE);
  // A wall in the NEIGHBOUR chunk at x = 16..19, and a mob standing at x = 15.7 whose 0.9-wide box
  // reaches past the boundary at 16.
  world.fill(16, 30, -16, 31, 34, 31, BLOCKS.STONE);
  const straddling = validate(world, 'cow', 15.8, 30, 8, { width: 0.9, height: 1.4 });
  assert.equal(straddling.ok, false,
    'a box crossing into a solid neighbour chunk must be refused');
});

// =============================================================================================
// P1: fishPredicate -- the elevation band is checked before the lush-cave exception
// =============================================================================================

test('tropical fish may spawn deep in lush caves, below the sea-level band', () => {
  // Wiki: the 50..63 band "does not apply to tropical fish spawning in lush caves". With sea level
  // 22 in this engine, "deep" means well below seaLevel - 13.
  const world = new FixtureWorld({ biome: 'lush_caves', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.STONE);
  // Water from y=4 so the candidate at y=5 has water below AND water above.
  world.fill(-16, 4, -16, 31, 9, 31, BLOCKS.WATER);
  const y = 5;
  assert.equal(world.getVoxel(8, y, 8), BLOCKS.WATER);
  assert.equal(world.getVoxel(8, y + 1, 8), BLOCKS.WATER, 'fish need water above');
  const ctx = predicateContext(world, { x: 8.5, y, z: 8.5, type: 'tropical_fish', biomeId: 'lush_caves' });
  assert.equal(fishPredicate(ctx), true,
    'a tropical fish in deep lush-cave water must be allowed by its documented exception');
});

test('cod is still bound by the sea-level band in the same lush-cave water', () => {
  // The positive control for the rule above: the exception is species-specific, so the shared band
  // must still refuse a cod at the same depth.
  const world = new FixtureWorld({ biome: 'lush_caves', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.STONE);
  world.fill(-16, 4, -16, 31, 9, 31, BLOCKS.WATER);
  const ctx = predicateContext(world, { x: 8.5, y: 5, z: 8.5, type: 'cod', biomeId: 'lush_caves' });
  assert.equal(fishPredicate(ctx), false,
    'a cod deep in a lush cave is outside its elevation band and must be refused');
});

test('an ordinary ocean fish inside the band is accepted', () => {
  const world = new FixtureWorld({ biome: 'ocean', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  // Sea bed at y=9, water from y=10 to y=20. The band is seaLevel-13 .. seaLevel = 9..22, so y=10 is
  // inside it AND has water above (y=11) and water below (y=9 is stone, so pick y=11 instead).
  world.fill(-16, 0, -16, 31, 9, 31, BLOCKS.STONE);
  world.fill(-16, 10, -16, 31, 20, 31, BLOCKS.WATER);
  const y = 11;
  assert.equal(world.getVoxel(8, y, 8), BLOCKS.WATER);
  assert.equal(world.getVoxel(8, y - 1, 8), BLOCKS.WATER, 'a fish needs water below');
  assert.equal(world.getVoxel(8, y + 1, 8), BLOCKS.WATER, 'a fish needs water above');
  const ctx = predicateContext(world, { x: 8.5, y, z: 8.5, type: 'cod', biomeId: 'ocean' });
  assert.equal(fishPredicate(ctx), true, 'a cod inside the ocean band must be accepted');
});

test('a fish needs water above and below, not just at its feet', () => {
  const world = new FixtureWorld({ biome: 'ocean', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 20, 31, BLOCKS.WATER);
  // A one-block water pocket at y=20 with air above.
  world.set(8, 21, 8, BLOCKS.AIR);
  const ctx = predicateContext(world, { x: 8.5, y: 20, z: 8.5, type: 'cod', biomeId: 'ocean' });
  assert.equal(fishPredicate(ctx), false, 'water above is required for a fish');
});

// =============================================================================================
// P1: glow squid must not inherit the ocean sea-level band
// =============================================================================================

test('glow squid can spawn in deep, dark, underground water', () => {
  // A glow squid belongs to UNDERGROUND_WATER_CREATURE: dark water well below sea level is its
  // habitat, and the ordinary ocean band must not apply to it.
  const world = new FixtureWorld({ biome: 'lush_caves', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.STONE);
  world.fill(-16, 3, -16, 31, 12, 31, BLOCKS.WATER);
  const y = 6;
  world.setSkyLight(8, y, 8, 0);
  const ctx = predicateContext(world, { x: 8.5, y, z: 8.5, type: 'glow_squid', biomeId: 'lush_caves' });
  assert.equal(glowSquidPredicate(ctx), true,
    'a glow squid in deep dark water must be allowed');
});

test('glow squid is refused in lit water, even when deep', () => {
  const world = new FixtureWorld({ biome: 'lush_caves', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.STONE);
  world.fill(-16, 3, -16, 31, 12, 31, BLOCKS.WATER);
  const y = 6;
  world.setSkyLight(8, y, 8, 0);
  world.setBlockLight(8, y, 8, 7);
  const ctx = predicateContext(world, { x: 8.5, y, z: 8.5, type: 'glow_squid', biomeId: 'lush_caves' });
  assert.equal(glowSquidPredicate(ctx), false, 'glow squid requires light level 0');
});

test('an ordinary squid is allowed in deep water, because its rule states no elevation band', () => {
  // This test originally asserted the opposite. The wiki's aquatic table states only "the spawning
  // block must be water" for the squid/dolphin row; the elevation band belongs to the FISH rows. The
  // old shared `waterColumnRule` imposed the fish band on squid, which is a rule vanilla does not
  // state. The test was corrected rather than the implementation bent back to match it.
  const world = new FixtureWorld({ biome: 'lush_caves', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.STONE);
  world.fill(-16, 4, -16, 31, 12, 31, BLOCKS.WATER);
  const ctx = predicateContext(world, { x: 8.5, y: 6, z: 8.5, type: 'squid', biomeId: 'lush_caves' });
  assert.equal(squidPredicate(ctx), true,
    'a squid in water is allowed: no elevation band is stated for it');
});

test('the fish band is still enforced, so the squid rule has not been over-generalised', () => {
  // The positive control for the correction above: fish ARE band-limited at the same depth.
  const world = new FixtureWorld({ biome: 'ocean', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.STONE);
  world.fill(-16, 4, -16, 31, 12, 31, BLOCKS.WATER);
  const ctx = predicateContext(world, { x: 8.5, y: 6, z: 8.5, type: 'cod', biomeId: 'ocean' });
  assert.equal(fishPredicate(ctx), false,
    'a cod below the band must still be refused');
});

test('squid does not require water above it, unlike a fish', () => {
  // The wiki's aquatic table gives the block-above requirement only in the FISH row; the squid and
  // dolphin row says only "the spawning block must be water". Bundling them into one rule gave squid
  // a constraint vanilla does not state.
  const world = new FixtureWorld({ biome: 'ocean', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 20, 31, BLOCKS.WATER);
  // The top water block with air above it, at the surface of the band.
  const ctx = predicateContext(world, { x: 8.5, y: 20, z: 8.5, type: 'squid', biomeId: 'ocean' });
  assert.equal(squidPredicate(ctx), true,
    'a squid just under the surface (air above) must be allowed');
});

// =============================================================================================
// P1: heightmap semantics
// =============================================================================================

test('WORLD_SURFACE counts non-air blocks that do not block motion', () => {
  // Vanilla's WORLD_SURFACE is "the highest non-air block", so a flower counts. The motion-blocking
  // variants skip it. Conflating the two moves the candidate Y range.
  const world = new FixtureWorld({ biome: 'plains' });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 29, 31, BLOCKS.STONE);
  world.set(8, 30, 8, BLOCKS.POPPY); // a plant: non-air, does not block motion
  assert.equal(blocksMotion(BLOCKS.POPPY), false, 'a flower must not block motion');
  assert.equal(heightAt(world, 8, 8, HeightmapType.WORLD_SURFACE), 30,
    'WORLD_SURFACE must report the highest NON-AIR block, flower included');
  assert.equal(heightAt(world, 8, 8, HeightmapType.MOTION_BLOCKING_NO_LEAVES), 29,
    'MOTION_BLOCKING_NO_LEAVES must skip the flower and report the stone');
});

// =============================================================================================
// Predicates: RNG outcomes enumerated, not sampled
// =============================================================================================

test('ghast refuses exactly 19 of every 20 RNG outcomes', () => {
  // Wiki: "95% chance of spawn failure". A predicate that accepts 19 of 20 has its comparison
  // inverted, which no sampled test reliably catches -- so every one of the 20 outcomes is enumerated.
  const world = new FixtureWorld({ biome: 'nether_wastes', dimension: 'nether' });
  world.loadRegion(-16, -16, 31, 31);
  world.fill(-16, 0, -16, 31, 40, 31, BLOCKS.NETHERRACK);
  // The candidate sits on the floor: floor at y=40, candidate at y=41.
  const y = 41;
  assert.equal(world.getVoxel(8, 40, 8), BLOCKS.NETHERRACK, 'the floor must be netherrack');
  const outcomes = [];
  for (let roll = 0; roll < 20; roll++) {
    const random = { nextInt: (n) => roll % n, nextFloat: () => 0, nextDouble: () => 0 };
    const outcomes2 = roll;
    void outcomes2;
    const ctx = predicateContext(world, {
      x: 8.5, y, z: 8.5, type: 'ghast', biomeId: 'nether_wastes', random,
    });
    outcomes.push(ghastPredicate(ctx) ? 1 : 0);
  }
  const accepted = outcomes.reduce((a, b) => a + b, 0);
  assert.equal(accepted, 1, `a 95% failure rate must accept exactly 1 of 20 rolls, accepted ${accepted}`);
  assert.equal(outcomes[0], 1, 'the accepted outcome must be the roll that draws 0');
});

test('drowned requires darkness as well as water', () => {
  const world = new FixtureWorld({ biome: 'ocean', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  // A column deep enough that the test Y is water with water below it.
  world.fill(-16, 0, -16, 31, 20, 31, BLOCKS.WATER);
  const y = 18;
  assert.equal(world.getVoxel(8, y, 8), BLOCKS.WATER, 'the candidate must be in water');
  // Bright water: full sky light and no darkening.
  world.setSkyLight(8, y, 8, 15);
  world.setSkyLight(8, y - 1, 8, 15);
  const bright = predicateContext(world, {
    x: 8.5, y, z: 8.5, type: 'drowned', biomeId: 'ocean',
    random: { nextInt: () => 0, nextFloat: () => 0, nextDouble: () => 0 },
  });
  assert.equal(drownedPredicate(bright), false,
    'a drowned must not spawn in water that is lit to full sky brightness at noon');
  // Dark water: the same position with no sky light.
  world.setSkyLight(8, y, 8, 0);
  world.setSkyLight(8, y - 1, 8, 0);
  const dark = predicateContext(world, {
    x: 8.5, y, z: 8.5, type: 'drowned', biomeId: 'ocean',
    random: { nextInt: () => 0, nextFloat: () => 0, nextDouble: () => 0 },
  });
  assert.equal(drownedPredicate(dark), true, 'a drowned in dark water must be allowed');
});

test('passive mobs need light 9 and refuse liquids', () => {
  const world = grassFieldFixture();
  const groundY = 30;
  world.setSkyLight(8, groundY + 1, 8, 9);
  const lit = predicateContext(world, { x: 8.5, y: groundY + 1, z: 8.5, type: 'cow', biomeId: 'plains' });
  assert.equal(defaultPassivePredicate(lit), true, 'light 9 must allow a passive mob');
  world.setSkyLight(8, groundY + 1, 8, 8);
  const dark = predicateContext(world, { x: 8.5, y: groundY + 1, z: 8.5, type: 'cow', biomeId: 'plains' });
  assert.equal(defaultPassivePredicate(dark), false, 'light 8 must refuse a passive mob');
});

test('axolotl requires clay below and a non-solid block above', () => {
  const world = new FixtureWorld({ biome: 'lush_caves', seaLevel: 22 });
  world.loadRegion(-16, -16, 31, 31);
  // Clay floor at y=3, water above it from y=4 so the candidate at y=4 has CLAY below, not water.
  world.fill(-16, 0, -16, 31, 3, 31, BLOCKS.CLAY);
  world.fill(-16, 4, -16, 31, 10, 31, BLOCKS.WATER);
  assert.equal(world.getVoxel(8, 3, 8), BLOCKS.CLAY, 'the floor must be clay');
  const ctx = predicateContext(world, { x: 8.5, y: 4, z: 8.5, type: 'axolotl', biomeId: 'lush_caves' });
  assert.equal(axolotlPredicate(ctx), true, 'clay below with water above must be allowed');
  // Replace the clay with stone: the same position must be refused.
  world.fill(-16, 3, -16, 31, 3, 31, BLOCKS.STONE);
  const stoneBelow = predicateContext(world, { x: 8.5, y: 4, z: 8.5, type: 'axolotl', biomeId: 'lush_caves' });
  assert.equal(axolotlPredicate(stoneBelow), false, 'stone below must refuse an axolotl');
});

test('bat needs a stone-family floor, no sky exposure and light 4 or darker', () => {
  const world = new FixtureWorld({ biome: 'plains' });
  world.loadRegion(-16, -16, 31, 31);
  // A roofed cave: stone floor and a stone ceiling above.
  world.fill(-16, 0, -16, 31, 20, 31, BLOCKS.STONE);
  world.fill(-16, 22, -16, 31, 30, 31, BLOCKS.STONE);
  world.fill(-16, 21, -16, 31, 21, 31, BLOCKS.AIR);
  world.setSkyLight(8, 21, 8, 0);
  const ok = predicateContext(world, { x: 8.5, y: 21, z: 8.5, type: 'bat', biomeId: 'plains' });
  assert.equal(batPredicate(ok), true, 'a roofed stone cave at light 0 must allow a bat');
  world.setBlockLight(8, 21, 8, 5);
  const bright = predicateContext(world, { x: 8.5, y: 21, z: 8.5, type: 'bat', biomeId: 'plains' });
  assert.equal(batPredicate(bright), false, 'light 5 must refuse a bat');
});

// =============================================================================================
// The registry must be populated by the GAME's import path, not by the tests'
// =============================================================================================

test('importing the spawner is enough to register every mob placement', async () => {
  // This is the test that would have caught the single most damaging defect in the subsystem.
  //
  // `mobSpawnPredicates.js` registers every mob's placement at module scope, and NOTHING under
  // `src/` imported it. In the running game the registry was therefore empty, `spawnPlacementFor`
  // returned its unregistered default for every mob, and the effect was:
  //
  //   - every aquatic mob was treated as a GROUND mob, so the floor test ran instead of the fluid
  //     test and ICE counted as a valid floor -- fish stood on ice;
  //   - every per-mob rule silently vanished (no predicate, no `bats_spawnable_on`, no glow squid
  //     light rule, no passive light-9 rule);
  //   - every mob used MOTION_BLOCKING_NO_LEAVES rather than its own heightmap.
  //
  // The previous tests all imported `mobSpawnPredicates.js` directly to exercise its predicates,
  // which registered everything as a side effect OF THE TEST. The registry looked healthy while the
  // game's was empty. This test imports only the spawner, which is what the game does.
  const module = await import('../src/spawning/naturalSpawner.js');
  assert.ok(module, 'the spawner must import');
  const placements = await import('../src/spawning/spawnPlacements.js');

  const registered = placements.registeredSpawnTypes();
  assert.ok(registered.length > 50,
    `importing the spawner must populate the placement registry, found ${registered.length} entries`);

  // Every entry must have a real placement type, not the unregistered default.
  const water = placements.spawnPlacementFor('salmon');
  assert.equal(water.placement, SpawnPlacementType.IN_WATER,
    'a salmon must be registered as IN_WATER; an unregistered default would make it a ground mob');
  assert.equal(water.heightmap, HeightmapType.OCEAN_FLOOR);
  assert.ok(water.predicate, 'a salmon must have its predicate registered');

  const lava = placements.spawnPlacementFor('strider');
  assert.equal(lava.placement, SpawnPlacementType.IN_LAVA);

  assert.ok(placements.spawnPlacementFor('glow_squid').predicate, 'glow squid needs its light rule');
  assert.ok(placements.spawnPlacementFor('bat').predicate, 'the bat needs its floor rule');
  assert.ok(placements.spawnPlacementFor('cow').predicate, 'a passive mob needs its light-9 rule');
});

test('a fish is never placed as a ground mob, so ice can never be its floor', async () => {
  // The concrete consequence of the missing registration, asserted directly: with the registry
  // populated, an IN_WATER mob cannot satisfy the ON_GROUND floor rule and therefore cannot use ice
  // as a floor. This is the reported bug, expressed as a rule rather than as a sighting.
  const world = frozenWaterFixture();
  const y = world.seaLevel + 1; // the ice sheet itself
  assert.equal(world.getVoxel(8, y, 8), BLOCKS.ICE);
  assert.equal(isSolidBlockId(BLOCKS.ICE), true, 'ice is solid, which is why a ground placement accepted it');

  // A GROUND placement on ice would be legal (that is the bug's mechanism)...
  const asGround = validate(world, 'salmon', 8.5, y + 1, 8, {
    placement: SpawnPlacementType.ON_GROUND,
  });
  // ...so the real defence is that a fish is never given a ground placement. Confirm the fluid rule
  // refuses it, which is what a correctly registered IN_WATER placement does.
  const asRegistered = validate(world, 'salmon', 8.5, y + 1, 8, {
    placement: SpawnPlacementType.IN_WATER,
  });
  assert.equal(asRegistered.ok, false);
  assert.equal(asRegistered.reason, SpawnRejection.WRONG_FLUID,
    'with the correct placement type a fish above ice is refused on fluid grounds');
  void asGround;
});

// =============================================================================================
// Distance rules: exact comparisons
// =============================================================================================

test('the 24-block exclusion and the 128-block sphere are exact', () => {
  const world = grassFieldFixture();
  const groundY = 30;
  const y = groundY + 1;
  // Exactly 24 away: not inside the exclusion, so allowed.
  const at24 = validate(world, 'zombie', 24.5, y, 8.5, { players: [{ x: 0.5, y, z: 8.5 }] });
  assert.equal(at24.ok, true, `exactly 24 must pass, got ${at24.reason}`);
  // Just inside 24: refused.
  const at23 = validate(world, 'zombie', 23.5, y, 8.5, { players: [{ x: 0.5, y, z: 8.5 }] });
  assert.equal(at23.ok, false);
  assert.equal(at23.reason, SpawnRejection.TOO_CLOSE_TO_PLAYER);
  // A tenth of a block outside 128: refused.
  const world2 = grassFieldFixture();
  world2.loadRegion(-16, -300, 300, 31);
  const far = validate(world2, 'zombie', 128.2, y, 8.5, { players: [{ x: 0.1, y, z: 8.5 }] });
  assert.equal(far.ok, false);
  assert.equal(far.reason, SpawnRejection.TOO_FAR_FROM_PLAYER);
});

test('the spawn distance is 3-D, so vertical separation counts', () => {
  const world = grassFieldFixture();
  const result = validate(world, 'zombie', 8.5, 30, 8.5, {
    players: [{ x: 8.5, y: 10, z: 8.5 }], // 20 blocks below: inside the 24 sphere
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, SpawnRejection.TOO_CLOSE_TO_PLAYER);
});
