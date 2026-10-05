// Pufferfish and Tropical Fish parity.
//
// References: https://minecraft.wiki/w/Pufferfish · https://minecraft.wiki/w/Tropical_Fish
//
// They share a module because both are 3 HP aquatic fish at speed 0.7. The pufferfish is the interesting one:
// it is NEUTRAL, never seeks a fight, and instead inflates through two stages as something approaches,
// dealing contact damage TOGETHER WITH Poison that scales with how puffed it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  PUFFERFISH_HEALTH, TROPICAL_FISH_HEALTH, PUFFERFISH_DIMENSIONS, TROPICAL_FISH_DIMENSIONS, FISH_SPEED,
  PUFFERFISH_CONTACT, PUFFERFISH_POISON, PUFFERFISH_TRIGGER, AQUATIC_TYPES, TROPICAL_FISH_VARIANTS,
  TROPICAL_FISH_SHAPES, TROPICAL_FISH_COLORS, TROPICAL_FISH_PATTERNS, FISH_COLORS,
  isPufferfish, isTropicalFish, isSmallFish, pufferfishDimensions, pufferfishStage, pufferfishDamageFor,
  pufferfishPoisonFor, pufferfishReactsTo, findPufferfishThreat, updatePufferfishPuff, pufferfishContact,
  rollTropicalFishVariant, tropicalFishVariantName, fishDrops, fishXp, createPufferfishModel, posePufferfish,
  createTropicalFishModel, poseTropicalFish
} from '../src/fishBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.WATER),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [], snowballs: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(20, 1, 0), velocity: new THREE.Vector3(), type: 'player',
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {}, effects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect(effect, seconds) { this.effects[effect] = seconds; },
    hasStatusEffect: (e) => Object.hasOwn(this.effects, e)
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities, effects: player.effects };
}

test('both are native types, not the Villager fallback', () => {
  const { manager } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  const tropical = manager.spawnMob('tropical_fish', 5, 1, 0);
  assert.equal(puffer.type, 'pufferfish');
  assert.equal(puffer.name, 'Pufferfish');
  assert.equal(tropical.type, 'tropical_fish');
  assert.equal(tropical.name, 'Tropical Fish');
  assert.notEqual(puffer.type, 'villager');
  assert.notEqual(tropical.type, 'villager');
  assert.equal(isPufferfish(puffer), true);
  assert.equal(isTropicalFish(tropical), true);
  assert.equal(isSmallFish(puffer) && isSmallFish(tropical), true);
  assert.equal(isPufferfish(tropical), false);
});

test('the health, speed and hitboxes match the wiki', () => {
  const { manager } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  const tropical = manager.spawnMob('tropical_fish', 5, 1, 0);
  assert.equal(PUFFERFISH_HEALTH, 3);
  assert.equal(TROPICAL_FISH_HEALTH, 3);
  assert.equal(puffer.maxHealth, 3);
  assert.equal(tropical.maxHealth, 3);
  assert.equal(FISH_SPEED, 0.7);
  assert.equal(puffer.speed, 0.7);
  assert.equal(tropical.speed, 0.7);
  // Wiki: a pufferfish has THREE hitboxes; a tropical fish is a flat 0.5 x 0.4.
  assert.deepEqual(PUFFERFISH_DIMENSIONS.unpuffed, { width: 0.35, height: 0.35 });
  assert.deepEqual(PUFFERFISH_DIMENSIONS.semi, { width: 0.49, height: 0.49 });
  assert.deepEqual(PUFFERFISH_DIMENSIONS.puffed, { width: 0.7, height: 0.7 });
  assert.deepEqual(TROPICAL_FISH_DIMENSIONS, { width: 0.5, height: 0.4 });
  assert.deepEqual([tropical.width, tropical.height], [0.5, 0.4]);
  assert.deepEqual(manager.getMobDimensions('tropical_fish'), { width: 0.5, height: 0.4 });
  assert.deepEqual(manager.getMobDimensions('pufferfish'), { width: 0.35, height: 0.35 },
    'the unpuffed box is the reported one; the mob tracks the live stage');
  // Wiki: the pufferfish is neutral, the tropical fish passive. Neither is hostile.
  assert.equal(puffer.isNeutral, true);
  assert.equal(puffer.isHostile, false);
  assert.equal(tropical.isHostile, false);
});

test('the pufferfish damage and Poison scale with the puff stage', () => {
  // Wiki: 0 unpuffed; semi-puffed 2/2/3; fully puffed 2.5/3/4.5 on Easy/Normal/Hard.
  assert.deepEqual(PUFFERFISH_CONTACT.semi, { peaceful: 0, easy: 2, normal: 2, hard: 3 });
  assert.deepEqual(PUFFERFISH_CONTACT.puffed, { peaceful: 0, easy: 2.5, normal: 3, hard: 4.5 });
  assert.equal(pufferfishDamageFor('unpuffed', 'normal'), 0, 'an unpuffed pufferfish is harmless');
  assert.equal(pufferfishDamageFor('semi', 'easy'), 2);
  assert.equal(pufferfishDamageFor('semi', 'normal'), 2);
  assert.equal(pufferfishDamageFor('semi', 'hard'), 3);
  assert.equal(pufferfishDamageFor('puffed', 'easy'), 2.5);
  assert.equal(pufferfishDamageFor('puffed', 'normal'), 3);
  assert.equal(pufferfishDamageFor('puffed', 'hard'), 4.5);
  assert.equal(pufferfishDamageFor('puffed', 'unknown'), 3, 'an unknown difficulty falls back to Normal');
  // Wiki: Poison for 3 s semi-puffed and 6 s fully puffed.
  assert.deepEqual(PUFFERFISH_POISON, { semi: 3, puffed: 6 });
  assert.equal(pufferfishPoisonFor('unpuffed'), 0);
  assert.equal(pufferfishPoisonFor('semi'), 3);
  assert.equal(pufferfishPoisonFor('puffed'), 6);
});

test('it reacts to players, axolotls and non-aquatic mobs, but not to other fish', () => {
  // Wiki: it inflates "when approached too closely by players, axolotls, or non-aquatic mobs".
  assert.equal(pufferfishReactsTo({ type: 'player' }), true);
  assert.equal(pufferfishReactsTo({ type: 'axolotl' }), true);
  assert.equal(pufferfishReactsTo({ type: 'zombie' }), true, 'a non-aquatic mob');
  assert.equal(pufferfishReactsTo({ type: 'cow' }), true);
  for (const type of AQUATIC_TYPES) {
    // The axolotl is IN the aquatic list and is still a trigger, which the wiki calls out explicitly. So it is
    // skipped here: asserting that it is ignored would be asserting the opposite of the rule.
    if (type === 'axolotl') continue;
    assert.equal(pufferfishReactsTo({ type }), false, `it ignores a ${type}`);
  }
  // And the axolotl is asserted the other way, which is the point of the exception.
  assert.equal(pufferfishReactsTo({ type: 'axolotl' }), true, 'wiki: an axolotl IS a trigger');
  assert.equal(pufferfishReactsTo(null), false);
  assert.ok(AQUATIC_TYPES.includes('cod'));
  assert.ok(AQUATIC_TYPES.includes('axolotl'), 'the axolotl is listed, and the wiki singles it out as a trigger');
});

test('it inflates in two stages by distance, and the hitbox grows with it', () => {
  // Wiki: unpuffed 0.35, semi-puffed 0.49, fully puffed 0.7. The hitbox growth is a real gameplay effect,
  // because the contact reach is measured from it.
  assert.deepEqual(PUFFERFISH_TRIGGER, { semiRange: 3.5, puffedRange: 1.8 });
  const { manager, player } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  assert.equal(pufferfishStage(puffer), 'unpuffed', 'it starts deflated');

  player.position.set(1, 1, 0);
  assert.equal(updatePufferfishPuff(manager, puffer, player), 'puffed');
  assert.equal(pufferfishStage(puffer), 'puffed');
  assert.deepEqual([puffer.width, puffer.height], [0.7, 0.7], 'the hitbox grew');
  assert.equal(puffer.puffed, true);

  player.position.set(3, 1, 0);
  assert.equal(updatePufferfishPuff(manager, puffer, player), 'semi');
  assert.deepEqual([puffer.width, puffer.height], [0.49, 0.49]);

  player.position.set(20, 1, 0);
  assert.equal(updatePufferfishPuff(manager, puffer, player), 'deflating');
  assert.deepEqual([puffer.width, puffer.height], [0.35, 0.35], 'and it shrinks back');
  assert.equal(pufferfishStage(puffer), 'unpuffed');
  // The stage only reports a change, so a steady state is null.
  assert.equal(updatePufferfishPuff(manager, puffer, player), null);
});

test('an aquatic mob nearby does NOT make it puff', () => {
  const { manager } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  manager.spawnMob('cod', 1, 1, 0);
  assert.equal(findPufferfishThreat(manager, puffer), null, 'a cod is ignored');
  updatePufferfishPuff(manager, puffer, null);
  assert.equal(pufferfishStage(puffer), 'unpuffed', 'so it stays deflated');
  // A zombie right next to it does.
  manager.spawnMob('zombie', 1, 1, 0);
  assert.ok(findPufferfishThreat(manager, puffer), 'a zombie is a threat');
});

test('contact only hurts while puffed, and inflicts Poison', () => {
  const { manager, player } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  player.position.set(0.4, 1, 0);
  // Unpuffed: harmless.
  assert.equal(pufferfishContact(puffer, player, 'normal'), null);
  // Puffed: damage AND poison.
  updatePufferfishPuff(manager, puffer, player);
  const hit = pufferfishContact(puffer, player, 'normal');
  assert.ok(hit, 'contact landed');
  assert.equal(hit.damage, 3, 'Normal damage when fully puffed');
  assert.equal(hit.poison, 6, 'and Poison for 6 seconds');
  assert.equal(hit.stage, 'puffed');
  // Out of reach there is no hit.
  player.position.set(20, 1, 0);
  assert.equal(pufferfishContact(puffer, player, 'normal'), null);
  assert.equal(pufferfishContact(manager.spawnCow(0, 1, 0), player), null);
});

test('the puff damages and poisons the player through the real loop', () => {
  const { manager, player, effects } = fixture();
  // The player stands right ON the pufferfish, which is the contact case. It must NOT be a puff trigger at
  // that moment or the fish stays frozen: the puff check itself keeps it in place, so a player parked next to
  // it is the wrong setup and measures nothing.
  player.position.set(20, 1, 0);
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  // Drive the branch with the threat already inside reach, which is the situation the wiki describes.
  puffer.threat = player;
  puffer.puffStage = 'puffed';
  puffer.puffProgress = 1;
  const dims = pufferfishDimensions('puffed');
  puffer.width = dims.width;
  puffer.height = dims.height;
  player.position.set(0.4, 1, 0);
  for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  assert.ok(player.damageTaken > 0, `it hurt the player, got ${player.damageTaken}`);
  assert.equal(effects.poison, 6, 'and poisoned them for 6 seconds');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');

  // A player far away is never touched, and the fish is not frozen by their presence.
  const far = fixture();
  far.player.position.set(40, 1, 0);
  const lone = far.manager.spawnMob('pufferfish', 0, 1, 0);
  const start = lone.mesh.position.clone();
  for (let i = 0; i < 120; i++) far.manager.update(1 / 60, far.player);
  assert.equal(far.player.damageTaken, 0, 'an unpuffed pufferfish is harmless');
  assert.deepEqual(far.effects, {});
  assert.ok(lone.mesh.position.distanceTo(start) > 0.05, 'and it swims freely');
});

test('both fish swim through the real update loop', () => {
  // REGRESSION. This is the assertion that caught two real bugs. The fish spawned but never moved, because the
  // shared `updateAquaticMob` needs swim state the spawner did not provide: `isAquatic`, `swimCycle`,
  // `targetPos`, `pitch`, and -- the one that mattered -- `flopTimer`. `flopTimer -= dt` on `undefined` is NaN,
  // and `NaN <= 0` is ALWAYS false, so the out-of-water flop impulse never fired and the velocity stayed at
  // exactly zero. The failure was silent: no throw, no error, just a mob that did nothing.
  const { manager, player } = fixture();
  for (const type of ['pufferfish', 'tropical_fish']) {
    const fish = manager.spawnMob(type, 0, 1, 0);
    const start = fish.mesh.position.clone();
    for (let i = 0; i < 360; i++) manager.update(1 / 60, player);
    const moved = fish.mesh.position.distanceTo(start);
    assert.ok(moved > 0.25, `${type} should move, travelled ${moved.toFixed(3)}`);
    // The state the shared handler reads must be numeric, not undefined.
    assert.equal(typeof fish.flopTimer, 'number', `${type} needs a numeric flopTimer`);
    assert.equal(Number.isNaN(fish.flopTimer), false, `${type} flopTimer must not be NaN`);
    assert.equal(typeof fish.swimCycle, 'number');
    assert.equal(fish.isAquatic, true);
  }
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('the tropical fish has 3,072 variants across two shapes', () => {
  // Wiki: "3,072 in Java", from two body shapes, a pattern, and three colours from a palette of 16.
  assert.equal(TROPICAL_FISH_VARIANTS, 3072);
  assert.deepEqual(TROPICAL_FISH_SHAPES, ['small', 'large']);
  assert.equal(TROPICAL_FISH_COLORS.length, 16);
  assert.equal(TROPICAL_FISH_PATTERNS.small.length, 6);
  assert.equal(TROPICAL_FISH_PATTERNS.large.length, 6);
  // The roll produces a well-formed variant at both ends of the random range.
  for (const r of [0, 0.5, 0.999]) {
    const variant = rollTropicalFishVariant(() => r);
    assert.ok(TROPICAL_FISH_SHAPES.includes(variant.shape), `shape ${variant.shape}`);
    assert.ok(TROPICAL_FISH_PATTERNS[variant.shape].includes(variant.pattern), `pattern ${variant.pattern}`);
    assert.ok(TROPICAL_FISH_COLORS.includes(variant.baseColor));
    assert.ok(TROPICAL_FISH_COLORS.includes(variant.patternColor));
    assert.ok(TROPICAL_FISH_COLORS.includes(variant.finColor));
    assert.ok(tropicalFishVariantName(variant).includes(variant.pattern));
  }
  // Two different rolls usually differ, since there are thousands.
  const a = tropicalFishVariantName(rollTropicalFishVariant(() => 0.1));
  const b = tropicalFishVariantName(rollTropicalFishVariant(() => 0.9));
  assert.notEqual(a, b);
  assert.equal(tropicalFishVariantName(null), 'Tropical Fish');
});

test('a spawned tropical fish carries its variant, and a forced one is honoured', () => {
  const { manager } = fixture();
  const fish = manager.spawnMob('tropical_fish', 0, 1, 0);
  assert.ok(fish.variant, 'it has a variant');
  assert.ok(typeof fish.variantName === 'string' && fish.variantName.length > 5);
  // A forced variant is used verbatim, which is what the Inspector and a scenario need.
  const forced = { shape: 'large', pattern: 'glitter', baseColor: 'red', patternColor: 'blue', finColor: 'lime' };
  const pinned = manager.spawnMob('tropical_fish', 2, 1, 0, { variant: forced });
  assert.deepEqual(pinned.variant, forced);
  assert.equal(pinned.variantName, tropicalFishVariantName(forced));
});

test('each fish drops its own item and gives 1-3 XP with credit', () => {
  const { manager } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  const tropical = manager.spawnMob('tropical_fish', 5, 1, 0);
  assert.deepEqual(fishDrops(puffer), [['pufferfish', false, 1, 1]]);
  assert.deepEqual(fishDrops(tropical), [['tropical_fish', false, 1, 1]]);
  assert.deepEqual(fishDrops(manager.spawnCow(0, 1, 0)), []);
  // Through the manager's own path.
  puffer.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(puffer, () => 0.5), [['pufferfish', false, 1, 1]]);
  tropical.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(tropical, () => 0.5), [['tropical_fish', false, 1, 1]]);
  // XP is 1-3, and varies.
  const values = new Set();
  for (let i = 0; i < 30; i++) values.add(fishXp(puffer));
  assert.equal([...values].every(v => v >= 1 && v <= 3), true, `1-3 XP, got ${[...values].join(',')}`);
  assert.ok(values.size > 1, 'the roll varies');
  assert.equal(fishXp(manager.spawnCow(0, 1, 0)), 0);
});

test('the models have the parts the wiki describes', () => {
  const { manager } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  const tropical = manager.spawnMob('tropical_fish', 5, 1, 0);
  // The pufferfish's spines are the point of the mob.
  assert.ok(puffer.body && puffer.belly && puffer.tail, 'a round body with a tail');
  assert.equal(puffer.spines.length, 5, 'and spines');
  assert.equal(puffer.eyes.length, 2);
  assert.ok(FISH_COLORS.pufferfish.body > 0);
  assert.ok(tropical.body && tropical.tail && tropical.dorsal, 'a disc with a tail and a dorsal fin');
  assert.equal(tropical.fins.length, 3, 'two pectorals and a dorsal');
  assert.equal(tropical.eyes.length, 2);
  const pm = createPufferfishModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial());
  assert.ok(pm.group && pm.spines.length === 5);
  const tm = createTropicalFishModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial());
  assert.ok(tm.group && tm.dorsal);
});

test('the puff pose inflates by stage, and the spines stand out', () => {
  const { manager, player } = fixture();
  const puffer = manager.spawnMob('pufferfish', 0, 1, 0);
  posePufferfish(puffer, 0);
  const flat = puffer.body.scale.x;
  const flatSpine = puffer.spines[0].scale.x;
  player.position.set(1, 1, 0);
  updatePufferfishPuff(manager, puffer, player);
  posePufferfish(puffer, 0);
  assert.ok(puffer.body.scale.x > flat, 'the body inflates');
  assert.ok(puffer.spines[0].scale.x > flatSpine, 'and the spines stand out');
  // The pose follows the hitbox, so the two never disagree.
  assert.equal(puffer.body.scale.x > 1, true);
  assert.doesNotThrow(() => posePufferfish(null));
  assert.doesNotThrow(() => posePufferfish({}));
  assert.doesNotThrow(() => poseTropicalFish(null));
  assert.doesNotThrow(() => poseTropicalFish({}));
});

test('the Inspector can spawn both fish', () => {
  for (const type of ['pufferfish', 'tropical_fish']) {
    assert.ok(DEBUG_MOBS.includes(type), `${type} must be selectable`);
  }
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  assert.equal(s.reset('pufferfish').type, 'pufferfish');
  assert.equal(s.snapshot().maxHealth, 3);
  assert.equal(s.reset('tropical_fish').type, 'tropical_fish');
  assert.equal(s.snapshot().maxHealth, 3);
});

test('both spawn eggs are registered', () => {
  for (const type of ['pufferfish', 'tropical_fish']) {
    const egg = ITEMS[`${type}_spawn_egg`];
    assert.ok(egg, `${type} has a spawn egg`);
    assert.equal(egg.mob, type);
    assert.equal(egg.type, 'spawn_egg');
  }
  assert.ok(ITEMS.pufferfish, 'and the item each drops exists');
  assert.ok(ITEMS.tropical_fish, 'the wiki notes the mob is the source of its own item, which is a separate drop');
});

test('the helpers are safe on non-fish and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isPufferfish(cow), false);
  assert.equal(isTropicalFish(cow), false);
  assert.equal(isSmallFish(cow), false);
  assert.equal(pufferfishStage(cow), null);
  assert.equal(findPufferfishThreat(manager, cow), null);
  assert.equal(updatePufferfishPuff(manager, cow, player), null);
  assert.equal(pufferfishContact(cow, player), null);
  assert.deepEqual(fishDrops(cow), []);
  assert.equal(fishXp(cow), 0);
  assert.deepEqual(pufferfishDimensions('nonsense'), PUFFERFISH_DIMENSIONS.unpuffed, 'a fallback, not a crash');
  assert.equal(pufferfishDamageFor('nonsense', 'normal'), 0);
  assert.equal(pufferfishPoisonFor('nonsense'), 0);
  assert.equal(isPufferfish('pufferfish'), true, 'a string works, since the predicates accept either');
  assert.equal(isPufferfish(null), false);
  assert.equal(pufferfishReactsTo(undefined), false);
  assert.doesNotThrow(() => posePufferfish(null));
  assert.equal(manager.spawnMob('pufferfish', 9, 1, 9).type, 'pufferfish');
  assert.equal(manager.spawnMob('tropical_fish', 9, 1, 9).type, 'tropical_fish');
});
