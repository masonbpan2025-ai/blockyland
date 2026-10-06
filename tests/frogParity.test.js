// Frog parity with https://minecraft.wiki/w/Frog
//
// Frog was another of the 38 missing types. Its defining traits are that it makes long jumps and
// takes reduced fall damage, it swims fast and cannot drown, it has three biome-determined variants,
// and it eats small slimes and magma cubes with its tongue, leaving a froglight whose colour its
// variant decides.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  FROG_HEALTH, FROG_DIMENSIONS, FROG_JUMP, FROG_SPEED, FROG_FOLLOW_RANGE, FROG_TONGUE,
  FROG_PREY, FROG_PREY_MAX_SIZE, FROG_FROGLIGHT_BY_VARIANT, FROG_XP, FROG_BREEDING_FOOD,
  FROG_VARIANTS, FROG_COLD_BIOMES, FROG_WARM_BIOMES, FROG_COLORS,
  isFrog, frogVariantForBiome, froglightForVariant, frogCanEat, frogEatingDrops, frogDrops,
  frogXp, startFrogTongue, updateFrogTongue, eatFrogPrey, createFrogModel, applyFrogVariant,
  poseFrog, startFrogJump
} from '../src/frogBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';

function fixture({ water = false } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    // `water` fills y = 0..2, so it is a real body of water rather than a single layer a frog would
    // climb straight out of within a fraction of a second.
    getVoxel: (x, y, z) => {
      if (water && y >= 0 && y < 3) return BLOCKS.WATER;
      return y < 1 ? BLOCKS.STONE : BLOCKS.AIR;
    },
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
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
    position: new THREE.Vector3(20, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0, takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; } };
  player.inventory = inventory;
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  // The shared breeding table carries the frog's slimeball food.
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  return { manager, player, inventory, entities };
}

/** A size-1 cube, which is the only size a frog eats. */
function smallCube(manager, type, x = 1) {
  const cube = manager.spawnMob(type, x, 1, 0);
  cube.slimeSize = FROG_PREY_MAX_SIZE;
  cube.health = cube.maxHealth = 1;
  return cube;
}

test('frog is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  assert.equal(frog.type, 'frog');
  assert.equal(frog.name, 'Frog');
  assert.notEqual(frog.type, 'villager');
});

test('the health and hitbox match the wiki', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  assert.equal(frog.maxHealth, FROG_HEALTH);
  assert.equal(frog.maxHealth, 10, 'wiki: 10 HP');
  assert.deepEqual(FROG_DIMENSIONS, { width: 0.5, height: 0.5 });
  assert.deepEqual(manager.getMobDimensions('frog'), { width: 0.5, height: 0.5 });
});

test('the jump and fall-damage rules match the wiki', () => {
  assert.equal(FROG_JUMP.maxHeight, 8, 'wiki: it can jump up to 8 blocks high');
  assert.equal(FROG_JUMP.fallDamageReduction, 5, 'wiki: 5 less fall damage than most mobs');
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  assert.equal(frog.fallDamageReduction, 5);
  assert.equal(frog.canBreatheUnderwater, true, 'wiki: frogs do not take drowning damage');
});

test('frogs swim faster than they walk', () => {
  assert.ok(FROG_SPEED.water > FROG_SPEED.land, 'wiki: in water they move much faster');
  assert.equal(FROG_SPEED.land, 1.0);
  assert.equal(FROG_SPEED.water, 2.4);
});

test('the three variants are assigned by biome', () => {
  assert.deepEqual(FROG_VARIANTS, ['temperate', 'warm', 'cold']);
  // Wiki: swamp is temperate, mangrove swamp is warm, and the cold biomes are cold.
  assert.equal(frogVariantForBiome('swamp'), 'temperate');
  assert.equal(frogVariantForBiome('mangrove_swamp'), 'warm');
  for (const biome of ['frozen_ocean', 'snowy_plains', 'snowy_taiga', 'ice_spikes', 'grove', 'the_end']) {
    assert.equal(frogVariantForBiome(biome), 'cold', `${biome} is a cold biome`);
  }
  for (const biome of ['jungle', 'desert', 'savanna', 'badlands', 'warm_ocean']) {
    assert.equal(frogVariantForBiome(biome), 'warm', `${biome} is a warm biome`);
  }
  // Wiki: everything else is temperate.
  assert.equal(frogVariantForBiome('plains'), 'temperate');
  assert.equal(frogVariantForBiome('forest'), 'temperate');
  assert.equal(frogVariantForBiome(null), 'temperate');
});

test('a spawned frog takes its variant from the biome', () => {
  const { manager } = fixture();
  const cold = manager.spawnFrog(0, 1, 0, { biome: 'snowy_taiga' });
  assert.equal(cold.variant, 'cold');
  assert.equal(cold.bodyMat.color.getHex(), FROG_COLORS.cold.base);
  const warm = manager.spawnFrog(0, 1, 0, { biome: 'mangrove_swamp' });
  assert.equal(warm.variant, 'warm');
  assert.equal(warm.bodyMat.color.getHex(), FROG_COLORS.warm.base);
  // And an explicit variant wins.
  assert.equal(manager.spawnFrog(0, 1, 0, { variant: 'warm', biome: 'swamp' }).variant, 'warm');
});

test('each variant makes its own froglight', () => {
  // Wiki: temperate gives ochre, warm pearlescent, cold verdant.
  assert.deepEqual(FROG_FROGLIGHT_BY_VARIANT, {
    temperate: 'ochre_froglight', warm: 'pearlescent_froglight', cold: 'verdant_froglight'
  });
  assert.equal(froglightForVariant('temperate'), 'ochre_froglight');
  assert.equal(froglightForVariant('warm'), 'pearlescent_froglight');
  assert.equal(froglightForVariant('cold'), 'verdant_froglight');
  assert.equal(froglightForVariant('nonsense'), 'ochre_froglight', 'an unknown variant falls back');
  // All three are real registry entries.
  for (const id of Object.values(FROG_FROGLIGHT_BY_VARIANT)) {
    assert.ok(ITEMS[id], `${id} must exist`);
  }
});

test('a frog only eats size-1 slimes and magma cubes', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);

  const smallSlime = smallCube(manager, 'slime');
  assert.equal(frogCanEat(frog, smallSlime), true, 'a size-1 slime is food');
  const smallMagma = smallCube(manager, 'magma_cube');
  assert.equal(frogCanEat(frog, smallMagma), true, 'so is a size-1 magma cube');

  // Wiki: "they never attack any cube mobs with a size other than 1".
  for (const size of [2, 4]) {
    const big = manager.spawnMob('slime', 2, 1, 0);
    big.slimeSize = size;
    assert.equal(frogCanEat(frog, big), false, `a size-${size} slime is not food`);
  }
  // And nothing else is.
  for (const type of ['cow', 'pig', 'chicken', 'zombie', 'player', 'goat']) {
    const other = manager.spawnMob(type === 'player' ? 'villager' : type, 3, 1, 0);
    other.type = type;
    assert.equal(frogCanEat(frog, other), false, `a ${type} is not food`);
  }
  assert.equal(frogCanEat(frog, frog), false, 'nor is another frog');
  assert.equal(frogCanEat(frog, null), false);
  assert.equal(frogCanEat({ type: 'cow' }, smallSlime), false, 'only frogs eat');
  const dead = smallCube(manager, 'slime', 4);
  dead.health = 0;
  assert.equal(frogCanEat(frog, dead), false, 'nor the dead');
});

test('the prey list is exactly slimes and magma cubes', () => {
  assert.deepEqual([...FROG_PREY].sort(), ['magma_cube', 'slime']);
  assert.equal(FROG_PREY_MAX_SIZE, 1);
});

test('eating a slime yields one slimeball, and a magma cube a froglight', () => {
  // Wiki: a small slime killed by any frog drops exactly one slimeball; a magma cube drops the
  // froglight for that frog's variant.
  const { manager } = fixture();
  const slime = smallCube(manager, 'slime');
  const magma = smallCube(manager, 'magma_cube');
  for (const variant of FROG_VARIANTS) {
    const frog = manager.spawnFrog(0, 1, 0, { variant });
    assert.deepEqual(frogEatingDrops(frog, slime), [['slime_ball', false, 1, 1]],
      `${variant}: a slime always gives exactly one slimeball`);
    assert.deepEqual(frogEatingDrops(frog, magma), [[froglightForVariant(variant), true, 1, 1]],
      `${variant}: a magma cube gives that frog's froglight`);
  }
  // A non-cube gives nothing.
  const cow = manager.spawnCow(0, 1, 0);
  assert.deepEqual(frogEatingDrops(manager.spawnFrog(0, 1, 0), cow), []);
});

test('eating a mob despawns it without a death animation', () => {
  // Wiki: "If the mob dies from this attack, it instantly despawns without a death animation."
  const { manager, entities } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const slime = smallCube(manager, 'slime', 1);
  assert.equal(manager.mobs.includes(slime), true);

  assert.equal(eatFrogPrey(manager, frog, slime), 'eaten');
  assert.equal(manager.mobs.includes(slime), false, 'it is gone from the world');
  assert.equal(slime.mesh.parent, null, 'and out of the scene');
  assert.equal(slime.eatenByFrog, true, 'marked as eaten');
  assert.equal(slime.health, 1, 'its health was never reduced, so no death path ran');
  const drops = entities.droppedItems.filter(d => d.itemType === 'slime_ball');
  assert.equal(drops.length, 1, 'and the frog-specific loot dropped');
  assert.equal(frog.tongueCooldown, FROG_TONGUE.cooldown, 'with a cooldown before the next flick');
});

test('a frog cannot eat something it should not, even mid-flick', () => {
  const { manager, entities } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const cow = manager.spawnCow(1, 1, 0);
  startFrogTongue(frog, cow);
  const outcome = updateFrogTongue(manager, frog, FROG_TONGUE.seconds + 0.1);
  assert.equal(outcome, null, 'nothing edible');
  assert.equal(manager.mobs.includes(cow), true, 'the cow survives');
  assert.equal(entities.droppedItems.length, 0, 'and nothing drops');
});

test('the tongue pulls the prey in before eating it', () => {
  // Wiki: the tongue "pull[s] certain mobs into their mouth and eat[s] them".
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const slime = smallCube(manager, 'slime', 4);
  const startDist = frog.mesh.position.distanceTo(slime.mesh.position);
  startFrogTongue(frog, slime);

  let sawFlick = false;
  for (let i = 0; i < 60 && !slime.eatenByFrog; i++) {
    const r = updateFrogTongue(manager, frog, 1 / 60);
    if (r === 'flicking') sawFlick = true;
  }
  assert.equal(sawFlick, true, 'the flick is visible before the eat');
  assert.equal(slime.eatenByFrog, true, 'and it is eaten');
  assert.ok(frog.tongueTimer === 0, 'the flick ends');
});

test('a tongue flick is refused while one is already running', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const a = smallCube(manager, 'slime', 1);
  const b = smallCube(manager, 'slime', 2);
  assert.equal(startFrogTongue(frog, a), true);
  assert.equal(startFrogTongue(frog, b), false, 'one prey at a time');
  assert.equal(frog.tongueTarget, a);
});

test('a lost tongue target does not throw', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const slime = smallCube(manager, 'slime', 2);
  startFrogTongue(frog, slime);
  manager.mobs.splice(manager.mobs.indexOf(slime), 1);
  assert.doesNotThrow(() => updateFrogTongue(manager, frog, 1 / 60));
  assert.equal(frog.tongueTarget, null, 'the flick is abandoned');
});

test('a long jump launches up and forward, and respects the 8-block cap', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  frog.onGround = true;
  frog.yaw = 0;
  assert.equal(startFrogJump(frog, { height: 3, forward: 2 }), true);
  assert.ok(frog.velocity.y > 0, 'it launches upward');
  assert.ok(Math.abs(frog.velocity.z - 2) < 1e-9, 'and forward by the requested amount');
  assert.equal(frog.isFrogJumping, true);

  // Clamped at the wiki maximum.
  const high = manager.spawnMob('frog', 0, 1, 0);
  high.onGround = true;
  startFrogJump(high, { height: 99 });
  assert.ok(high.frogJumpHeight <= FROG_JUMP.maxHeight, `clamped to ${FROG_JUMP.maxHeight}`);
  assert.ok(high.velocity.y <= Math.sqrt(2 * 22 * FROG_JUMP.maxHeight) + 1e-9);

  // Refused mid-air.
  const airborne = manager.spawnMob('frog', 0, 1, 0);
  airborne.onGround = false;
  assert.equal(startFrogJump(airborne), false);
});

test('drops and XP match the wiki', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  frog.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(frog, () => 0.99), [], 'wiki: frogs drop no items');
  assert.deepEqual(frogDrops(frog), []);

  let sawValue = false;
  for (let i = 0; i < 40; i++) {
    const xp = frogXp(frog);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(frogXp(manager.spawnCow(0, 1, 0)), 0, 'only frogs');
});

test('slimeballs are the breeding food and the follow trigger', () => {
  const { manager } = fixture();
  assert.equal(FROG_BREEDING_FOOD, 'slime_ball');
  assert.ok(ITEMS.slime_ball, 'the slimeball exists, since frogs eat and breed with it');
  assert.equal(manager.animalBehaviors?.isBreedingFood?.('frog', 'slime_ball'), true);
  assert.equal(FROG_FOLLOW_RANGE, 6, 'wiki: within 6 blocks');
});

test('the model is a squat body with bulging eyes, a tongue and four legs', () => {
  const { manager } = fixture();
  const frog = manager.spawnMob('frog', 0, 1, 0);
  assert.ok(frog.body && frog.belly, 'a body and belly');
  assert.ok(frog.head, 'a head');
  assert.equal(frog.eyes.length, 2, 'two bulging eyes');
  assert.ok(frog.tongue, 'a tongue mesh');
  assert.equal(frog.tongue.visible, false, 'hidden until a flick');
  assert.equal(frog.legs.length, 4, 'four legs');
  // Two long hind legs and two small forelegs, which the jump pose distinguishes.
  assert.equal(frog.legs.filter(l => !l.front).length, 2);
  assert.equal(frog.legs.filter(l => l.front).length, 2);
});

test('the tongue shows during a flick and the sac inflates while croaking', () => {
  const model = createFrogModel(
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial()
  );
  const frog = { ...model, tongueTimer: 0, croakTimer: 0, legs: model.legs, body: model.body, tongue: model.tongue };
  poseFrog(frog, 1);
  assert.equal(model.tongue.visible, false, 'no tongue at rest');
  frog.tongueTimer = 0.2;
  poseFrog(frog, 1);
  assert.equal(model.tongue.visible, true, 'the tongue appears for the flick');
  // The vocal sac inflates while croaking.
  frog.tongueTimer = 0;
  frog.croakTimer = 0.5;
  poseFrog(frog, 0.05);
  assert.notEqual(model.body.scale.x, 1, 'the body inflates while croaking');
  assert.doesNotThrow(() => poseFrog({}, 1));
  assert.doesNotThrow(() => poseFrog(null, 1));
});

test('the variant colour is applied to the model', () => {
  const { manager } = fixture();
  const frog = manager.spawnFrog(0, 1, 0, { variant: 'temperate' });
  assert.equal(frog.bodyMat.color.getHex(), FROG_COLORS.temperate.base);
  frog.variant = 'cold';
  applyFrogVariant(frog);
  assert.equal(frog.bodyMat.color.getHex(), FROG_COLORS.cold.base, 'the colour changes');
  assert.doesNotThrow(() => applyFrogVariant(null));
  assert.doesNotThrow(() => applyFrogVariant({ type: 'cow' }));
});

test('a frog walks and hops through the real update loop', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const start = frog.mesh.position.clone();
  let maxHeight = 0;
  for (let i = 0; i < 900; i++) {
    manager.update(1 / 60, player);
    maxHeight = Math.max(maxHeight, frog.mesh.position.y - start.y);
  }
  assert.ok(frog.mesh.position.distanceTo(start) > 0.25, 'it moves around');
  assert.ok(maxHeight > 0.2, `it hops off the ground, rose ${maxHeight.toFixed(2)}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('a frog really eats a size-1 slime through the real update loop', () => {
  const { manager, player, entities } = fixture();
  player.position.set(40, 1, 40);
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const slime = smallCube(manager, 'slime', 2);
  let eaten = false;
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    if (slime.eatenByFrog) { eaten = true; break; }
  }
  assert.equal(eaten, true, 'the slime is eaten');
  assert.ok(entities.droppedItems.some(d => d.itemType === 'slime_ball'), 'leaving a slimeball');
});

test('a frog ignores a size-4 slime', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const frog = manager.spawnMob('frog', 0, 1, 0);
  const big = manager.spawnMob('slime', 2, 1, 0);
  big.slimeSize = 4;
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(big.eatenByFrog, undefined, 'a big slime is not food');
  assert.equal(manager.mobs.includes(big), true, 'and survives');
});

test('a frog in water swims instead of hopping', () => {
  const { manager, player } = fixture({ water: true });
  const frog = manager.spawnMob('frog', 0, 0, 0);
  for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  assert.equal(frog.inWater, true, 'it is in the water');
  assert.equal(frog.isFrogJumping, false, 'so it does not hop');
  assert.ok((frog.swimCycle || 0) > 0, 'and it swims');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('the Inspector can spawn the frog and reports its variant', () => {
  assert.ok(DEBUG_MOBS.includes('frog'), 'frog must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const frog = s.reset('frog');
  assert.equal(frog.type, 'frog', 'the Inspector spawns a real frog');
  const snap = s.snapshot();
  assert.equal(snap.health, 10, 'Inspector telemetry shows 10 HP');
  assert.equal(snap.maxHealth, 10);
  assert.ok(FROG_VARIANTS.includes(snap.frogVariant), `variant ${snap.frogVariant}`);
  assert.equal(snap.frogTongue, false);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 10);
});

test('the spawn egg and slimeball are registered', () => {
  assert.ok(ITEMS.frog_spawn_egg, 'the frog has a spawn egg');
  assert.equal(ITEMS.frog_spawn_egg.mob, 'frog');
  assert.equal(ITEMS.frog_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.slime_ball, 'and the slimeball it eats and breeds with');
});

test('the helpers are safe on non-frogs and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isFrog(cow), false);
  assert.equal(frogCanEat(cow, cow), false);
  assert.deepEqual(frogEatingDrops(cow, cow), []);
  assert.deepEqual(frogDrops(cow), []);
  assert.equal(frogXp(cow), 0);
  assert.equal(startFrogTongue(cow, cow), false);
  assert.equal(updateFrogTongue(manager, cow, 1 / 60), null);
  assert.equal(startFrogJump(cow), false);
  assert.equal(eatFrogPrey(manager, cow, cow), null);
  assert.doesNotThrow(() => poseFrog(null, 1));
  assert.equal(frogVariantForBiome(undefined), 'temperate');
});

test('the cold and warm biome lists are non-overlapping', () => {
  // A biome in both lists would make the variant depend on the order of the checks rather than the
  // wiki's table, which is the kind of silent ambiguity worth pinning.
  const overlap = FROG_COLD_BIOMES.filter(b => FROG_WARM_BIOMES.includes(b));
  assert.deepEqual(overlap, [], `these biomes are in both lists: ${overlap.join(', ')}`);
  assert.ok(FROG_COLD_BIOMES.length > 10);
  assert.ok(FROG_WARM_BIOMES.length > 10);
});
