// A zombie left underwater becomes a drowned, and only some drowned carry a trident.
//
// Wiki (https://minecraft.wiki/w/Drowned):
// - Conversion: "If a zombie's head (not the legs) is submerged in water continuously for 30 seconds, it
//   begins the process of converting into a drowned", and "15 seconds later the zombie becomes a drowned".
//   In Java, "zombies converted to drowned are never equipped with new items".
// - Equipment: a naturally spawned drowned "has a 6.25% chance to spawn with a trident".
// - Attacks: "if it spawns with a trident, the trident is used as a ranged weapon" (5 / 8 / 12 by
//   difficulty), and in Bedrock "a drowned with a trident also uses a melee attack if their target is within
//   a 3 blocks distance" (6.5 / 11 / 16.5).
// - Drops: "A drowned holding a trident ... has an 8.5% chance to drop it", so an unarmed one never does.
//
// The game used to build every drowned holding a trident, throw one every 4 s from all of them, and roll
// the 8.5% trident drop for all of them, so tridents were far easier to come by than the wiki's.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { MobManager } from '../src/mobs.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import { ZOMBIE_DROWNING } from '../src/undeadVariants.js';
import { serializeMobState, restoreMobState, mobAppearanceRestorers } from '../src/mobState.js';

/** A real manager over a world that is water from y = 1 up, with a stone floor, at night. */
function fixture({ water = true, difficulty = 'normal', random = Math.random } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : water ? BLOCKS.WATER : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 0,
    setVoxel() {},
  };
  const dropped = [];
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, id, isBlock, count) { dropped.push({ id, isBlock, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {},
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    random,
  });
  const player = {
    position: new THREE.Vector3(200, 1, 200), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, effects: {},
    hits: [],
    takeDamage(amount, source) { this.hits.push({ amount, source }); },
    applyStatusEffect() {}, hasStatusEffect: () => false,
  };
  manager.game = { player, difficulty, worldTime: 18000, controls: {}, weather: { weatherType: 'clear' } };
  return { manager, player, dropped, world, sounds, entities };
}

/** Advance the manager by `seconds`, in steps of `dt` (`update` caps a step at 0.1 s, so stay under it). */
function run(manager, player, seconds, dt = 0.05) {
  for (let t = 0; t < seconds; t += dt) manager.update(dt, player);
}

/** A returning sequence of rolls, then 0.99 for anything after it. */
const rolls = (...values) => { let i = 0; return () => (i < values.length ? values[i++] : 0.99); };

// --- conversion ----------------------------------------------------------------

test('a zombie with its head underwater becomes a drowned after 30 s plus 15 s, through the real update', () => {
  assert.deepEqual(ZOMBIE_DROWNING, { submergedSeconds: 30, convertSeconds: 15 });
  const { manager, player } = fixture();
  const zombie = manager.spawnMob('zombie', 0, 1, 0);

  run(manager, player, 29);
  assert.ok(manager.mobs.includes(zombie), 'still a zombie just before 30 s underwater');
  assert.ok(!manager.mobs.some((m) => m.type === 'drowned'), 'and no drowned yet');

  run(manager, player, 2);
  assert.ok(manager.mobs.includes(zombie), 'past 30 s it begins converting, but is still the zombie');
  assert.ok(zombie.convertTimer > 0, 'with the 15 s conversion running');

  run(manager, player, 15);
  assert.equal(manager.mobs.includes(zombie), false, 'the zombie is gone');
  const drowned = manager.mobs.find((m) => m.type === 'drowned');
  assert.ok(drowned, 'and a drowned took its place');
  assert.equal(drowned.health, drowned.maxHealth, 'at full health');
});

test('a zombie on dry land never converts', () => {
  const { manager, player } = fixture({ water: false });
  const zombie = manager.spawnMob('zombie', 0, 1, 0);
  run(manager, player, 60);
  assert.ok(manager.mobs.includes(zombie));
  assert.ok(!manager.mobs.some((m) => m.type === 'drowned'));
});

test('a drowned converted from a zombie gets no trident, whatever the roll', () => {
  // Rolls of 0 would give a natural spawn its trident; a conversion must not roll at all.
  const { manager, player } = fixture({ random: () => 0 });
  manager.spawnMob('zombie', 0, 1, 0);
  run(manager, player, 46);
  const drowned = manager.mobs.find((m) => m.type === 'drowned');
  assert.ok(drowned, 'it converted');
  assert.equal(drowned.hasTrident, false);
  assert.equal(drowned.trident.visible, false, 'and its hand is empty');
});

// --- spawning with a trident ---------------------------------------------------

test('a natural drowned has a 6.25% chance of a trident, rolled after the 5% gurgle roll', () => {
  const spawn = (random) => {
    const { manager } = fixture({ random });
    return manager.spawnMob('drowned', 0, 1, 0, { natural: true });
  };
  // Gurgle roll first (0.99: adult), then the trident roll.
  assert.equal(spawn(rolls(0.99, 0.0624)).hasTrident, true, 'just inside 6.25%');
  assert.equal(spawn(rolls(0.99, 0.0626)).hasTrident, false, 'just outside');

  let armed = 0;
  const TRIES = 8000;
  const { manager } = fixture();
  for (let i = 0; i < TRIES; i++) {
    if (manager.spawnMob('drowned', 0, 1, 0, { natural: true }).hasTrident) armed++;
    manager.mobs.pop();
  }
  const rate = armed / TRIES;
  assert.ok(rate > 0.05 && rate < 0.075, `expected about 6.25% armed, got ${(rate * 100).toFixed(2)}%`);
});

test('a summoned drowned is unarmed unless asked for a trident, and only an armed one shows it', () => {
  const { manager } = fixture({ random: () => 0 });
  const plain = manager.spawnMob('drowned', 0, 1, 0);
  assert.equal(plain.hasTrident, false, 'no roll for a command or spawn-egg drowned');
  assert.equal(plain.trident.visible, false, 'and no trident drawn in its hand');

  const armed = manager.spawnMob('drowned', 0, 1, 0, { trident: true });
  assert.equal(armed.hasTrident, true);
  assert.equal(armed.trident.visible, true, 'the trident model is in its hand');
  let inMesh = false;
  armed.mesh.traverse((o) => { if (o === armed.trident) inMesh = true; });
  assert.ok(inMesh, 'and attached to the drowned');
});

test('a saved armed drowned comes back armed, and an unarmed one unarmed', () => {
  // Loading respawns the mob with no options and then copies the saved fields onto it.
  const { manager } = fixture();
  for (const armed of [true, false]) {
    const saved = serializeMobState(manager.spawnMob('drowned', 0, 1, 0, { trident: armed }));
    const restored = restoreMobState(manager.spawnMob('drowned', 0, 1, 0), saved, {
      applyAppearance: mobAppearanceRestorers({}),
    });
    assert.equal(restored.hasTrident, armed);
    assert.equal(restored.trident.visible, armed, 'with the model to match');
  }
});

// --- attacking with it ---------------------------------------------------------

/** Run the hostile behaviours (where the throw lives) with a drowned 10 blocks from the player. */
function throwsWithin(seconds, over) {
  const { manager, player, world, sounds, entities } = fixture({ water: false });
  const behaviors = new HostileMobBehaviors(manager, world, sounds, entities);
  const drowned = manager.spawnMob('drowned', 0, 1, 0, over);
  player.position.set(10, 1, 0);
  for (let t = 0; t < seconds; t += 0.1) behaviors.update(0.1, player);
  return { manager, drowned, player };
}

test('only a drowned holding a trident throws one', () => {
  const armed = throwsWithin(6, { trident: true });
  assert.ok(armed.manager.customProjectiles.some((p) => p.isTrident) || armed.player.hits.some((h) => h.source === 'trident'),
    'an armed drowned throws its trident at the player');

  const unarmed = throwsWithin(6, {});
  assert.equal(unarmed.manager.customProjectiles.some((p) => p.isTrident), false, 'an unarmed one throws nothing');
  assert.equal(unarmed.player.hits.length, 0);
});

test("a thrown trident deals the wiki's ranged damage for the difficulty", () => {
  for (const [difficulty, expected] of [['easy', 5], ['normal', 8], ['hard', 12]]) {
    const { manager, player, world, sounds, entities } = fixture({ water: false, difficulty });
    const behaviors = new HostileMobBehaviors(manager, world, sounds, entities);
    manager.spawnMob('drowned', 0, 1, 0, { trident: true });
    player.position.set(6, 1, 0);
    for (let t = 0; t < 6 && !player.hits.length; t += 0.05) behaviors.update(0.05, player);
    const hit = player.hits.find((h) => h.source === 'trident');
    assert.ok(hit, `${difficulty}: the trident reached the player`);
    assert.equal(hit.amount, expected, `${difficulty}: ${expected} damage`);
  }
});

/** One melee tick with the player at `distance` blocks. */
function meleeAt(distance, { trident = false, difficulty = 'normal' } = {}) {
  const { manager, player } = fixture({ water: false, difficulty });
  const drowned = manager.spawnMob('drowned', 0, 1, 0, { trident });
  player.position.set(distance, 1, 0);
  manager.update(0.05, player);
  return { hits: player.hits, drowned };
}

test('a drowned with a trident stabs with it from up to 3 blocks, harder than a bare hand', () => {
  // 2.5 blocks: past the unarmed 2-block reach, inside the trident's 3.
  assert.equal(meleeAt(2.5).hits.length, 0, 'an unarmed drowned cannot reach 2.5 blocks');
  const stab = meleeAt(2.5, { trident: true }).hits;
  assert.equal(stab.length, 1, 'an armed one stabs at 2.5 blocks');
  assert.equal(stab[0].amount, 11, 'wiki: 11 on Normal');

  for (const [difficulty, expected] of [['easy', 6.5], ['hard', 16.5]]) {
    assert.equal(meleeAt(1.5, { trident: true, difficulty }).hits[0]?.amount, expected, `${difficulty} trident melee`);
  }
  // The bare-handed hit is unchanged: 3 on Normal.
  assert.equal(meleeAt(1.5).hits[0]?.amount, 3, 'unarmed melee is the zombie\'s 3');
  assert.equal(meleeAt(3.5, { trident: true }).hits.length, 0, 'out of melee reach at 3.5 blocks');
});

// --- dropping it ---------------------------------------------------------------

/** Kill a drowned (as the player) with every roll returning `roll`, and list what fell. */
function dropsOf(roll, over = {}) {
  const { manager, player, dropped } = fixture({ water: false, random: () => roll });
  const drowned = manager.spawnMob('drowned', 0, 1, 0, over);
  manager.damageMob(drowned, 1000, null, false, player);
  for (let i = 0; i < 20 && !drowned.lootDropped; i++) manager.update(0.1, player);
  return dropped.map((d) => d.id);
}

test('an armed drowned drops its trident 8.5% of the time', () => {
  assert.equal(dropsOf(0.0849, { trident: true }).includes('trident'), true, 'just inside 8.5%');
  assert.equal(dropsOf(0.0851, { trident: true }).includes('trident'), false, 'just outside');
});

test('a drowned without a trident never drops one', () => {
  assert.equal(dropsOf(0).includes('trident'), false, 'even with a roll of 0');
  assert.ok(dropsOf(0).includes('nautilus_shell'), 'while its other loot still drops');
});
