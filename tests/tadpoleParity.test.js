// Tadpole parity with https://minecraft.wiki/w/Tadpole
//
// The tadpole is unusual: the wiki is explicit that "the tadpole is treated by the game as a
// completely different mob from the frog", not a baby variant. It hatches from frogspawn, flops on
// land and drowns out of water, is hunted by axolotls, and matures into whichever frog variant its
// *current biome* dictates — the game's only case of the environment, not the parents, deciding a
// baby's adult form.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  TADPOLE_HEALTH, TADPOLE_DIMENSIONS, TADPOLE_DRY_SECONDS, TADPOLE_SPEED,
  TADPOLE_GROWTH_SECONDS, TADPOLE_HATCH_GROUP, TADPOLE_FEED_ACCELERATION, TADPOLE_FOLLOW_RANGE,
  TADPOLE_TEMPERATE_BIOMES, TADPOLE_COLD_BIOMES, TADPOLE_WARM_BIOMES, TADPOLE_COLORS,
  isTadpole, tadpoleVariantForBiome, rollTadpoleHatchCount, updateTadpoleDryness,
  updateTadpoleGrowth, accelerateTadpoleGrowth, createTadpoleModel, poseTadpole,
  tadpoleDrops, tadpoleXp
} from '../src/tadpoleBehavior.js';
import { FROG_VARIANTS } from '../src/frogBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ water = false, biome = 'plains' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    // `water` fills y = 0..2, a real body of water rather than a single layer.
    getVoxel: (x, y, z) => {
      if (water && y >= 0 && y < 3) return BLOCKS.WATER;
      return y < 1 ? BLOCKS.STONE : BLOCKS.AIR;
    },
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getBiome: () => biome,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    blockNameAt: (x, y, z) => (world.getVoxel(x, y, z) === BLOCKS.WATER ? 'water' : world.getVoxel(x, y, z) === BLOCKS.STONE ? 'stone' : 'air')
  });
  const player = {
    position: new THREE.Vector3(40, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0, takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; } };
  player.inventory = inventory;
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, inventory, entities };
}

test('tadpole is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  assert.equal(tadpole.type, 'tadpole');
  assert.equal(tadpole.name, 'Tadpole');
  assert.notEqual(tadpole.type, 'villager');
});

test('the health and hitbox match the wiki', () => {
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  assert.equal(tadpole.maxHealth, TADPOLE_HEALTH);
  assert.equal(tadpole.maxHealth, 6, 'wiki: 6 HP');
  assert.deepEqual(TADPOLE_DIMENSIONS, { width: 0.4, height: 0.3 },
    'wiki: 0.4 x 0.3, reduced from 0.5 x 0.4 in 22w19a');
  assert.deepEqual(manager.getMobDimensions('tadpole'), { width: 0.4, height: 0.3 });
});

test('a tadpole is its own mob, not a baby frog', () => {
  // Wiki: "Unlike all other mobs with baby variants, the tadpole is treated by the game as a
  // completely different mob from the frog."
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  assert.equal(tadpole.isBaby, false,
    'the shared isBaby flag is deliberately not set; growth is tracked separately');
  assert.equal(typeof tadpole.growthTimer, 'number');
  assert.notEqual(tadpole.type, 'frog');
});

test('it is aquatic, breathes under water and is axolotl prey', () => {
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  // Wiki entity tags: aquatic, axolotl_hunt_targets, can_breathe_under_water.
  assert.equal(tadpole.isAquatic, true);
  assert.equal(tadpole.canBreatheUnderwater, true);
  assert.equal(tadpole.isAxolotlPrey, true, 'wiki: tadpoles are hunted by axolotls');
  assert.equal(tadpole.isBucketable, true, 'wiki: bucketable with a water bucket');
});

test('a tadpole dies after under 20 seconds out of water', () => {
  assert.equal(TADPOLE_DRY_SECONDS, 19, 'wiki: less than 20 seconds, so the grace is just under');
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  // Half way: still alive.
  assert.ok(updateTadpoleDryness(tadpole, 9, false) > 0, 'still has grace left at 9s');
  assert.equal(tadpole.drySeconds, 9);
  // Past the limit: none left.
  assert.equal(updateTadpoleDryness(tadpole, 10.5, false), 0, 'no grace left at 19.5s');
  // And back in water it resets.
  assert.equal(updateTadpoleDryness(tadpole, 1, true), TADPOLE_DRY_SECONDS);
  assert.equal(tadpole.drySeconds, 0, 'the clock resets in water');
});

test('a tadpole really dies of dryness through the real update loop', () => {
  const { manager, player } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  // Run past the grace period, on dry land the whole time.
  for (let i = 0; i < 60 * 21 && manager.mobs.includes(tadpole); i++) {
    manager.update(1 / 60, player);
  }
  assert.equal(manager.mobs.includes(tadpole), false, 'it died of exposure');
  assert.equal(tadpole.diedOfDryness, true, 'and it is recorded as dying of dryness, not a kill');
});

test('growth is one Minecraft day, sped up 10% per feeding', () => {
  assert.equal(TADPOLE_GROWTH_SECONDS, 1200, 'wiki: one Minecraft day, 20 minutes');
  assert.equal(TADPOLE_FEED_ACCELERATION, 0.1, 'wiki: each use reduces the remainder by 10%');
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  assert.equal(tadpole.growthTimer, TADPOLE_GROWTH_SECONDS);
  // A feeding removes exactly a tenth of what is left.
  const removed = accelerateTadpoleGrowth(tadpole);
  assert.ok(Math.abs(removed - 120) < 1e-9, `expected 120s removed, got ${removed}`);
  assert.ok(Math.abs(tadpole.growthTimer - 1080) < 1e-9);
  // Not ready yet.
  assert.equal(updateTadpoleGrowth(tadpole, 100), false, 'still growing');
  // Past the timer it matures.
  assert.equal(updateTadpoleGrowth(tadpole, 2000), true, 'it is ready');
  assert.equal(tadpole.readyToMature, true);
});

test('a golden dandelion stops a tadpole aging', () => {
  // Wiki: a golden dandelion prevents it aging, and another resumes it.
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  tadpole.ageLocked = true;
  assert.equal(updateTadpoleGrowth(tadpole, 100000), false, 'an age-locked tadpole never matures');
  assert.equal(tadpole.readyToMature, false);
  assert.equal(accelerateTadpoleGrowth(tadpole), 0, 'and feeding does nothing');
});

test('the frogspawn hatch count is 2-5', () => {
  assert.deepEqual(TADPOLE_HATCH_GROUP, { min: 2, max: 5 }, 'wiki: groups of 2-5');
  assert.equal(rollTadpoleHatchCount(() => 0), 2);
  assert.equal(rollTadpoleHatchCount(() => 0.999), 5);
  for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
    const n = rollTadpoleHatchCount(() => r);
    assert.ok(n >= 2 && n <= 5, `roll ${r} gave ${n}`);
  }
});

test('the biome tables are non-overlapping and cover the wiki lists', () => {
  // An overlap would make the variant depend on check order rather than the wiki's table.
  const pairs = [
    ['temperate', TADPOLE_TEMPERATE_BIOMES],
    ['cold', TADPOLE_COLD_BIOMES],
    ['warm', TADPOLE_WARM_BIOMES]
  ];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const overlap = pairs[i][1].filter(b => pairs[j][1].includes(b));
      assert.deepEqual(overlap, [], `${pairs[i][0]} and ${pairs[j][0]} share: ${overlap.join(', ')}`);
    }
  }
  // A sample from each column of the wiki's tadpole table.
  for (const biome of ['river', 'beach', 'taiga', 'birch_forest', 'plains', 'swamp', 'meadow']) {
    assert.equal(tadpoleVariantForBiome(biome), 'temperate', `${biome} is temperate`);
  }
  for (const biome of ['frozen_river', 'snowy_beach', 'grove', 'snowy_taiga', 'the_end']) {
    assert.equal(tadpoleVariantForBiome(biome), 'cold', `${biome} is cold`);
  }
  for (const biome of ['jungle', 'badlands', 'desert', 'savanna', 'warm_ocean', 'mangrove_swamp']) {
    assert.equal(tadpoleVariantForBiome(biome), 'warm', `${biome} is warm`);
  }
  assert.equal(tadpoleVariantForBiome('nonsense'), 'temperate', 'an unknown biome falls back');
  assert.equal(tadpoleVariantForBiome(null), 'temperate');
  assert.equal(tadpoleVariantForBiome(undefined), 'temperate');
});

test('a tadpole matures into the frog its current biome dictates', () => {
  // Wiki: this is the game's only case of the *environment* deciding a baby's adult form.
  for (const [biome, expected] of [
    ['jungle', 'warm'], ['snowy_taiga', 'cold'], ['plains', 'temperate'], ['swamp', 'temperate']
  ]) {
    const { manager } = fixture({ biome });
    const tadpole = manager.spawnMob('tadpole', 3, 1, 4);
    const frog = manager.matureTadpole(tadpole);
    assert.ok(frog, `${biome}: a frog was produced`);
    assert.equal(frog.type, 'frog', `${biome}: it is a frog`);
    assert.equal(frog.variant, expected, `${biome}: it is a ${expected} frog`);
    assert.equal(manager.mobs.includes(tadpole), false, 'the tadpole is gone');
    assert.equal(tadpole.maturedInto, 'frog', 'and recorded as having matured, not died');
    assert.equal(frog.mesh.position.x, 3, 'the frog appears where the tadpole was');
  }
});

test('maturing does not run the death path and keeps a name', () => {
  const { manager, entities } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  tadpole.name = 'Bob';
  tadpole.health = 4;
  const frog = manager.matureTadpole(tadpole);
  assert.equal(frog.name, 'Bob', 'a name survives the change');
  assert.equal(entities.droppedItems.length, 0, 'nothing drops: it grew up, it did not die');
  assert.equal(tadpole.health, 4, 'its health was never reduced');
});

test('a tadpole matures through the real update loop', () => {
  const { manager, player } = fixture({ biome: 'jungle' });
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  tadpole.growthTimer = 0.01;
  manager.update(0.05, player);
  const frog = manager.mobs.find(m => m.type === 'frog');
  assert.ok(frog, 'a frog appeared');
  assert.equal(frog.variant, 'warm', 'of the biome-appropriate variant');
  assert.equal(manager.mobs.includes(tadpole), false, 'and the tadpole is gone');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('a tadpole drops nothing and awards no experience', () => {
  // Wiki: "As with other baby animals, tadpoles do not drop any items or experience on death."
  assert.deepEqual(tadpoleDrops(), []);
  assert.equal(tadpoleXp(), 0);
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  tadpole.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(tadpole, () => 0.99), [],
    'no items even with credit');
});

test('a tadpole swims in water and flops on land', () => {
  // Wiki: "Tadpoles swim aimlessly in water. On land, they flop around like fish and seek out the
  // nearest water."
  const wet = fixture({ water: true });
  const swimmer = wet.manager.spawnMob('tadpole', 0, 1, 0);
  const start = swimmer.mesh.position.clone();
  for (let i = 0; i < 120; i++) wet.manager.update(1 / 60, wet.player);
  assert.equal(swimmer.inWater, true, 'it is in the water');
  assert.ok(swimmer.mesh.position.distanceTo(start) > 0.1, 'and swims around');

  const dry = fixture();
  const flopper = dry.manager.spawnMob('tadpole', 0, 1, 0);
  const dryStart = flopper.mesh.position.clone();
  let maxHeight = 0;
  for (let i = 0; i < 180; i++) {
    dry.manager.update(1 / 60, dry.player);
    maxHeight = Math.max(maxHeight, flopper.mesh.position.y - dryStart.y);
  }
  assert.equal(flopper.inWater, false, 'it is on land');
  assert.ok(maxHeight > 0.05, `it flops off the ground, rose ${maxHeight.toFixed(3)}`);
  assert.ok(flopper.mesh.position.distanceTo(dryStart) > 0.25, 'and flops along');
});

test('the model is a head and body with a waving tail', () => {
  const { manager } = fixture();
  const tadpole = manager.spawnMob('tadpole', 0, 1, 0);
  assert.ok(tadpole.body && tadpole.belly, 'a body and belly');
  assert.ok(tadpole.head, 'a head');
  assert.equal(tadpole.eyes.length, 2);
  assert.ok(tadpole.tail, 'and a tail, which is the whole motion of the mob');
});

test('the tail waves in water and the body rolls on land', () => {
  const model = createTadpoleModel(
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial()
  );
  const mesh = new THREE.Group();
  const tadpole = { ...model, tail: model.tail, mesh, inWater: true };
  poseTadpole(tadpole, Math.PI / 2);
  const swimAngle = model.tail.rotation.y;
  assert.ok(Math.abs(swimAngle) > 0.1, 'the tail waves while swimming');

  tadpole.inWater = false;
  for (let i = 0; i < 20; i++) poseTadpole(tadpole, i);
  assert.ok(mesh.rotation.z > 0, `it rolls onto its side on land, z=${mesh.rotation.z.toFixed(2)}`);
  assert.doesNotThrow(() => poseTadpole({}, 1));
  assert.doesNotThrow(() => poseTadpole(null, 1));
});

test('the tadpole is in the biome table for every biome the frog lists', () => {
  // The two tables are separate, and this pins that every variant the frog can take is reachable
  // from some tadpole biome.
  const reachable = new Set(FROG_VARIANTS.map(v => tadpoleVariantForBiome(
    v === 'cold' ? 'snowy_taiga' : v === 'warm' ? 'jungle' : 'plains'
  )));
  assert.deepEqual([...reachable].sort(), [...FROG_VARIANTS].sort(),
    'every frog variant is reachable from a tadpole');
});

test('the Inspector can spawn the tadpole and reports its growth and water state', () => {
  assert.ok(DEBUG_MOBS.includes('tadpole'), 'tadpole must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const tadpole = s.reset('tadpole');
  assert.equal(tadpole.type, 'tadpole', 'the Inspector spawns a real tadpole');
  const snap = s.snapshot();
  assert.equal(snap.health, 6, 'Inspector telemetry shows 6 HP');
  assert.equal(snap.maxHealth, 6);
  assert.equal(snap.tadpoleInWater, false);
  assert.ok(snap.tadpoleGrowth > 0, `growth timer ${snap.tadpoleGrowth}`);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 6);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.tadpole_spawn_egg, 'the tadpole has a spawn egg');
  assert.equal(ITEMS.tadpole_spawn_egg.mob, 'tadpole');
  assert.equal(ITEMS.tadpole_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-tadpoles and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isTadpole(cow), false);
  assert.equal(updateTadpoleDryness(cow, 1, false), null);
  assert.equal(updateTadpoleGrowth(cow, 1), false);
  assert.equal(accelerateTadpoleGrowth(cow), 0);
  assert.equal(manager.matureTadpole(cow), null, 'only a tadpole matures');
  assert.equal(manager.matureTadpole(null), null);
  assert.doesNotThrow(() => poseTadpole(null, 1));
  assert.equal(tadpoleVariantForBiome(''), 'temperate');
});

test('the speed constants put water ahead of land', () => {
  assert.ok(TADPOLE_SPEED.water > TADPOLE_SPEED.land,
    'a tadpole swims much better than it flops');
  assert.equal(TADPOLE_FOLLOW_RANGE, 6, 'wiki: it follows a slimeball-holding player');
  assert.deepEqual(Object.keys(TADPOLE_COLORS).sort(), ['belly', 'body', 'eye']);
});
