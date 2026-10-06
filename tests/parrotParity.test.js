// Parrot parity with https://minecraft.wiki/w/Parrot
//
// Parrot was another of the 38 missing types. Its defining traits are five colour variants, taming by
// seed at a 1-in-10 chance, perching on the player's shoulder (left first), imitating nearby hostile
// mobs within 20 blocks, dancing by a jukebox that is playing a disc, and being killed by a cookie.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  PARROT_HEALTH, PARROT_DIMENSIONS, PARROT_VARIANTS, PARROT_VARIANT_NAMES, PARROT_COLORS,
  PARROT_SKIN_PATHS,
  PARROT_TAMING_FOODS, PARROT_TAME_CHANCE, PARROT_COOKIE_KILLS, PARROT_FOLLOW_RANGE,
  PARROT_IMITATE_RANGE, PARROT_DANCE_RANGE, PARROT_IMITATED_MOBS, PARROT_FLIGHT,
  PARROT_FLY_HEIGHT, PARROT_FEATHER_DROP,
  isParrot, parrotVariantName, rollParrotVariant, parrotColors, isParrotTamingFood,
  isParrotLethalFood, rollParrotTaming, isPerched, perchOnShoulder, dismountShoulder,
  shouldDismountForPlayerState, findImitateTarget, canDance, parrotDrops, parrotXp,
  updateParrotFlight, createParrotModel, applyParrotVariant, poseParrot
} from '../src/parrotBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
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
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(6, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    yaw: 0, pitch: 0, damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = {
    active: null, consumed: 0,
    getActiveItem() { return this.active; },
    consumeActiveItem(n = 1) { this.consumed += n; }
  };
  player.inventory = inventory;
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  // The shared interact path is where taming, sitting and the cookie live.
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  return { manager, player, inventory, entities };
}

test('parrot is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  assert.equal(parrot.type, 'parrot');
  assert.equal(parrot.name, 'Parrot');
  assert.notEqual(parrot.type, 'villager');
});

test('the health and hitbox match the wiki', () => {
  const { manager } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  assert.equal(parrot.maxHealth, PARROT_HEALTH);
  assert.equal(parrot.maxHealth, 6, 'wiki: 6 HP');
  assert.deepEqual(PARROT_DIMENSIONS, { width: 0.5, height: 0.9 }, 'wiki: Java is 0.5 x 0.9');
  assert.deepEqual(manager.getMobDimensions('parrot'), { width: 0.5, height: 0.9 });
});

test('parrots are flying and immune to fall damage', () => {
  const { manager } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  // Wiki entity tag: fall_damage_immune, because it flaps to slow its falls.
  assert.equal(parrot.isFlying, true);
  assert.equal(parrot.fallDamageImmune, true);
});

test('the five variants and their ids match the wiki', () => {
  assert.deepEqual(PARROT_VARIANTS, { red_blue: 0, blue: 1, green: 2, yellow_blue: 3, gray: 4 },
    'wiki: red_blue 0, blue 1, green 2, yellow_blue 3, gray 4');
  assert.deepEqual(PARROT_VARIANT_NAMES, ['red', 'blue', 'green', 'cyan', 'gray']);
  assert.equal(parrotVariantName(0), 'red');
  assert.equal(parrotVariantName(3), 'cyan', 'yellow_blue is displayed as cyan');
  assert.equal(parrotVariantName(4), 'gray');
  assert.equal(parrotVariantName(99), 'red', 'an unknown index falls back to the default');
  assert.equal(parrotVariantName(undefined), 'red');
});

test('a spawned parrot gets a real variant and its colours', () => {
  const { manager } = fixture();
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const parrot = manager.spawnParrot(0, 1, 0);
    assert.ok(parrot.variant >= 0 && parrot.variant <= 4, `variant ${parrot.variant}`);
    assert.ok(PARROT_VARIANT_NAMES.includes(parrot.variantName));
    // A parrot variant IS its texture: there are five vanilla sheets and the mob wears one. The assertion is which
    // sheet, not which flat colour -- writing a colour onto a textured material would fight the map and whichever
    // ran last would win.
    assert.equal(parrot.bodyMat.map?.assetPath, PARROT_SKIN_PATHS[parrot.variant],
      `variant ${parrot.variant} wears its own sheet`);
    seen.add(parrot.variant);
  }
  assert.equal(seen.size, 5, `every variant should come up, saw ${[...seen].sort().join(',')}`);
  // An explicit variant wins.
  assert.equal(manager.spawnParrot(0, 1, 0, { variant: 2 }).variantName, 'green');
});

test('rollParrotVariant stays in range', () => {
  for (const r of [0, 0.1, 0.5, 0.9, 0.999999]) {
    const v = rollParrotVariant(() => r);
    assert.ok(v >= 0 && v <= 4, `roll ${r} gave ${v}`);
  }
  assert.equal(rollParrotVariant(() => 0), 0);
  assert.equal(rollParrotVariant(() => 0.999), 4, 'a roll near 1 gives the last variant');
});

test('the taming food list matches the wiki', () => {
  for (const food of ['wheat_seeds', 'melon_seeds', 'pumpkin_seeds', 'beetroot_seeds',
    'torchflower_seeds', 'pitcher_pod']) {
    assert.equal(isParrotTamingFood(food), true, `${food} should tame a parrot`);
  }
  assert.equal(isParrotTamingFood('WHEAT_SEEDS'), true, 'the check is case-insensitive');
  for (const notFood of ['cookie', 'wheat', 'apple', 'diamond', '']) {
    assert.equal(isParrotTamingFood(notFood), false, `${notFood} should not`);
  }
  assert.equal(isParrotTamingFood(null), false);
  // Every listed food is a real item.
  for (const food of PARROT_TAMING_FOODS) {
    if (food.endsWith('_seeds') || food === 'pitcher_pod') {
      assert.ok(ITEMS[food], `${food} must exist`);
    }
  }
});

test('taming is a 1-in-10 chance per feeding', () => {
  assert.equal(PARROT_TAME_CHANCE, 0.1, 'wiki: each item fed has a 1/10 chance');
  assert.equal(rollParrotTaming(() => 0.05), true);
  assert.equal(rollParrotTaming(() => 0.5), false);
  // Sample it: about a tenth should succeed.
  let seed = 11;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let tamed = 0;
  const runs = 100000;
  for (let i = 0; i < runs; i++) if (rollParrotTaming(random)) tamed++;
  const share = tamed / runs;
  assert.ok(Math.abs(share - 0.1) < 0.005, `expected about 0.1, got ${share.toFixed(4)}`);
});

test('feeding a seed tames through the real interact path', () => {
  const { manager, player, inventory } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  inventory.active = { id: 'wheat_seeds', count: 3 };
  // Force the roll to succeed by feeding repeatedly until it takes.
  let attempts = 0;
  while (!parrot.isTamed && attempts < 500) {
    inventory.active = { id: 'wheat_seeds', count: 3 };
    manager.animalBehaviors.interact(parrot, player, inventory);
    attempts++;
  }
  assert.equal(parrot.isTamed, true, `tamed after ${attempts} feedings`);
  assert.equal(parrot.owner, player, 'and it remembers the player');
  assert.ok(inventory.consumed > 0, 'each attempt consumed a seed');
});

test('a cookie kills a parrot, and the feeder gets the credit', () => {
  // Wiki: "feeding a cookie to a parrot kills it", and the kill counts as the feeder's so it affects
  // the death message and loot.
  assert.equal(PARROT_COOKIE_KILLS, true);
  assert.equal(isParrotLethalFood('cookie'), true);
  assert.equal(isParrotLethalFood('COOKIE'), true);
  assert.equal(isParrotLethalFood('cocoa_beans'), true, 'the cocoa is the toxic part');
  assert.equal(isParrotLethalFood('wheat_seeds'), false);
  assert.equal(isParrotLethalFood(null), false);

  const { manager, player, inventory } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  inventory.active = { id: 'cookie', count: 1 };
  assert.equal(manager.animalBehaviors.interact(parrot, player, inventory), true);
  assert.equal(parrot.health, 0, 'it dies immediately');
  assert.equal(parrot.playerDamaged, true, 'with credit to the feeder');
  assert.equal(inventory.consumed, 1, 'and the cookie is consumed');
});

test('an empty hand toggles sitting on a tamed parrot only', () => {
  const { manager, player, inventory } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  inventory.active = null;
  assert.equal(manager.animalBehaviors.interact(parrot, player, inventory), false,
    'a wild parrot does nothing with an empty hand');
  parrot.isTamed = true;
  assert.equal(manager.animalBehaviors.interact(parrot, player, inventory), true);
  assert.equal(parrot.isSitting, true, 'the first use sits it');
  manager.animalBehaviors.interact(parrot, player, inventory);
  assert.equal(parrot.isSitting, false, 'the second stands it up');
});

test('perching prefers the left shoulder, then the right, then fails', () => {
  // Wiki: "A player can have one parrot on each shoulder. Parrots always prefer a player's left
  // shoulder first, if it is empty."
  const { manager, player } = fixture();
  const a = manager.spawnMob('parrot', 0, 1, 0);
  const b = manager.spawnMob('parrot', 2, 1, 0);
  const c = manager.spawnMob('parrot', 4, 1, 0);

  assert.equal(perchOnShoulder(a, player), 'left');
  assert.equal(a.perchedOn, 'left');
  assert.equal(isPerched(a), true);
  assert.equal(perchOnShoulder(b, player), 'right');
  assert.equal(b.perchedOn, 'right');
  assert.equal(perchOnShoulder(c, player), null, 'both shoulders are full');
  assert.equal(c.perchedOn, null);

  // Dismounting frees the slot for the next parrot.
  assert.equal(dismountShoulder(a, player), 'left');
  assert.equal(a.perchedOn, null);
  assert.equal(player.shoulderLeftParrot, null);
  assert.equal(perchOnShoulder(c, player), 'left', 'the left shoulder is preferred again');
});

test('a sitting parrot will not perch', () => {
  const { manager, player } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  parrot.isTamed = true;
  parrot.isSitting = true;
  assert.equal(perchOnShoulder(parrot, player), null, 'wiki: unless told to sit');
});

test('the wiki dismount triggers are implemented', () => {
  const base = { position: { y: 1 }, gamemode: 'survival' };
  assert.equal(shouldDismountForPlayerState({ ...base }, { y: 1 }), false, 'standing still is fine');
  // Wiki: landing on a surface half a block up or higher.
  assert.equal(shouldDismountForPlayerState({ ...base, position: { y: 1.6 } }, { y: 1 }), true, 'a rise of 0.6');
  assert.equal(shouldDismountForPlayerState({ ...base, position: { y: 1.4 } }, { y: 1 }), false, 'a rise of 0.4 is not enough');
  // Wiki: dropping off a ledge of more than three quarters of a block.
  assert.equal(shouldDismountForPlayerState({ ...base, position: { y: 0.2 } }, { y: 1 }), true, 'a drop of 0.8');
  assert.equal(shouldDismountForPlayerState({ ...base, position: { y: 0.4 } }, { y: 1 }), false, 'a drop of 0.6 is not enough');
  // The other listed states.
  assert.equal(shouldDismountForPlayerState({ ...base, isSleeping: true }, { y: 1 }), true, 'sleeping');
  assert.equal(shouldDismountForPlayerState({ ...base, gamemode: 'creative', isFlying: true }, { y: 1 }), true, 'creative flight');
  assert.equal(shouldDismountForPlayerState({ ...base, isGliding: true }, { y: 1 }), true, 'elytra gliding');
  assert.equal(shouldDismountForPlayerState({ ...base, inWater: true }, { y: 1 }), true, 'touching water');
  assert.equal(shouldDismountForPlayerState({ ...base, inPowderSnow: true }, { y: 1 }), true, 'powder snow');
  assert.equal(shouldDismountForPlayerState({ ...base, inLava: true }, { y: 1 }), true, 'lava');
  assert.equal(shouldDismountForPlayerState(null, { y: 1 }), false);
});

test('taking damage dismounts a perched parrot', () => {
  const { manager, player } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  perchOnShoulder(parrot, player);
  assert.equal(parrot.perchedOn, 'left');
  manager.damageMob(parrot, 1, null, false, player);
  assert.equal(parrot.perchedOn, null, 'wiki: taking damage is a dismount trigger');
  assert.equal(player.shoulderLeftParrot, null, 'and the slot is freed');
});

test('a perched parrot is drawn on the shoulder and looks where the player looks', () => {
  // Wiki: "Parrots on a shoulder always look in the same direction the player's head is looking."
  const { manager, player } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  perchOnShoulder(parrot, player);
  player.yaw = 1.2;
  const outcome = updateParrotFlight(manager, parrot, 1 / 60, player);
  assert.equal(outcome, 'perched');
  assert.ok(Math.abs(parrot.mesh.position.y - (player.position.y + 1.5)) < 1e-9, 'above the head');
  assert.ok(Math.abs(parrot.yaw - 1.2) < 1e-9, 'facing the same way as the player');
});

test('a tamed parrot teleports at 12 blocks and follows inside that', () => {
  // Wiki: a tamed parrot follows its player and teleports at a distance of 12 blocks.
  assert.equal(PARROT_FOLLOW_RANGE, 12);
  const { manager, player } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  parrot.isTamed = true;

  // Far away: teleport.
  player.position.set(60, 1, 60);
  assert.equal(updateParrotFlight(manager, parrot, 1 / 60, player), 'teleported');
  assert.ok(parrot.mesh.position.distanceTo(player.position) < 3, 'it is next to the player now');

  // Inside the range: fly toward.
  player.position.set(parrot.mesh.position.x + 6, parrot.mesh.position.y, parrot.mesh.position.z);
  assert.equal(updateParrotFlight(manager, parrot, 1 / 60, player), 'following');
});

test('an untamed parrot flies idly and rests', () => {
  const { manager, player } = fixture();
  player.position.set(100, 1, 100);
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  const outcomes = new Set();
  for (let i = 0; i < 900; i++) {
    const r = updateParrotFlight(manager, parrot, 1 / 60, player);
    if (r) outcomes.add(r);
  }
  assert.ok(outcomes.has('flying'), 'it flies');
  assert.ok(outcomes.has('resting'), 'wiki: parrots land frequently to rest');
  assert.ok(PARROT_FLIGHT.speed > 0);
  assert.ok(PARROT_FLY_HEIGHT.max > PARROT_FLY_HEIGHT.min);
});

test('imitation targets are hostile mobs within 20 blocks, and never on Peaceful', () => {
  assert.equal(PARROT_IMITATE_RANGE, 20, 'wiki: a detection range of 20 blocks');
  const { manager, player } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  assert.equal(findImitateTarget(manager, parrot), null, 'nothing nearby to imitate');

  const zombie = manager.spawnMob('zombie', 5, 1, 0);
  const found = findImitateTarget(manager, parrot, { random: () => 0 });
  assert.equal(found, zombie, 'it imitates the nearby zombie');
  assert.equal(found.type, 'zombie');

  // A passive mob is not imitated.
  const cow = manager.spawnMob('cow', 3, 1, 0);
  manager.mobs.splice(manager.mobs.indexOf(zombie), 1);
  assert.equal(findImitateTarget(manager, parrot, { random: () => 0 }), null,
    'a cow is not on the imitation list');
  assert.equal(PARROT_IMITATED_MOBS.includes('cow'), false);
  assert.equal(PARROT_IMITATED_MOBS.includes('zombie'), true);

  // Out of range.
  const far = manager.spawnMob('creeper', 60, 1, 0);
  assert.equal(findImitateTarget(manager, parrot, { random: () => 0 }), null, 'too far away');

  // Peaceful suppresses it entirely.
  const close = manager.spawnMob('skeleton', 2, 1, 0);
  assert.equal(findImitateTarget(manager, parrot, { difficulty: 'peaceful' }), null,
    'wiki: parrots do not imitate hostile mobs on Peaceful');
  assert.equal(findImitateTarget(manager, parrot, { difficulty: 'normal' }), close);
});

test('the imitation list matches the wiki Java list', () => {
  for (const type of ['blaze', 'creeper', 'ghast', 'zombie', 'skeleton', 'warden', 'wither',
    'ender_dragon', 'magma_cube', 'slime', 'witch', 'ravager']) {
    assert.ok(PARROT_IMITATED_MOBS.includes(type), `${type} should be imitated`);
  }
  // Wiki: parrots do not imitate skeleton horses, and the neutrals were removed in Java.
  assert.equal(PARROT_IMITATED_MOBS.includes('skeleton_horse'), false, 'wiki: not skeleton horses');
  assert.equal(PARROT_IMITATED_MOBS.includes('wolf'), false, 'wiki: wolves were removed in Java');
  assert.equal(PARROT_IMITATED_MOBS.includes('panda'), false, 'and pandas too');
  assert.equal(new Set(PARROT_IMITATED_MOBS).size, PARROT_IMITATED_MOBS.length, 'no duplicates');
});

test('dancing needs a playing jukebox within 3 blocks', () => {
  assert.equal(PARROT_DANCE_RANGE, 3, 'wiki: the dancing radius is 3 blocks from the jukebox');
  const { manager } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  assert.equal(canDance(manager, parrot), false, 'no jukebox, no dancing');

  manager.jukeboxPlaying = { position: { x: 2, y: 1, z: 0 } };
  assert.equal(canDance(manager, parrot), true, 'in range');
  manager.jukeboxPlaying = { position: { x: 10, y: 1, z: 0 } };
  assert.equal(canDance(manager, parrot), false, 'out of range');
  manager.jukeboxPlaying = null;
  assert.equal(canDance(manager, parrot), false, 'the track ended');
});

test('a dancing parrot bobs and swings its head, which is the party parrot', () => {
  const model = createParrotModel(
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial()
  );
  const parrot = { ...model, body: model.body, head: model.head, tail: model.tail, isDancing: false };
  poseParrot(parrot, 0);
  const restingHead = parrot.head.rotation.z;
  parrot.isDancing = true;
  poseParrot(parrot, 0.4);
  assert.notEqual(parrot.head.rotation.z, restingHead, 'the head swings while dancing');

  // A perched parrot does not bob: it is drawn against the player's head.
  parrot.perchedOn = 'left';
  const before = parrot.body.position.y;
  poseParrot(parrot, 0.4);
  assert.equal(parrot.body.position.y, before, 'a perched parrot holds still');
  assert.doesNotThrow(() => poseParrot({}, 1));
  assert.doesNotThrow(() => poseParrot(null, 1));
});

test('drops and XP match the wiki', () => {
  const { manager } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  parrot.playerDamaged = true;
  const rows = manager.getMobDeathDrops(parrot, () => 0.99);
  assert.deepEqual(rows, [['feather', false, 1, 2]], 'wiki: 1-2 feathers');
  assert.deepEqual(parrotDrops(parrot), [['feather', false, 1, 2]]);
  assert.deepEqual(PARROT_FEATHER_DROP, { min: 1, max: 2 });

  let sawValue = false;
  for (let i = 0; i < 40; i++) {
    const xp = parrotXp(parrot);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(parrotXp(manager.spawnCow(0, 1, 0)), 0, 'only parrots');
});

test('the model has a hooked beak, a long tail and wings the shared helper can flap', () => {
  const { manager } = fixture();
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  assert.ok(parrot.body && parrot.head, 'a body and head');
  assert.ok(parrot.beakUpper && parrot.beakLower, 'a two-part hooked beak');
  assert.equal(parrot.eyes.length, 2);
  assert.ok(parrot.tail, 'a long tail');
  // moveFlyingMob writes `mob.wings.left.rotation.z`, so the shape has to match.
  assert.ok(parrot.wings.left && parrot.wings.right, 'wings.left and wings.right exist');
  assert.ok(parrot.wings.left.rotation && parrot.wings.right.rotation, 'each has a rotation');
  assert.equal(parrot.wings.length, 2);
});

test('the variant colour is applied to the model', () => {
  const { manager } = fixture();
  const parrot = manager.spawnParrot(0, 1, 0, { variant: 0 });
  // A variant IS its sheet: five vanilla textures, one per variant.
  assert.equal(parrot.bodyMat.map?.assetPath, PARROT_SKIN_PATHS[0]);
  parrot.variant = 1;
  applyParrotVariant(parrot);
  assert.equal(parrot.bodyMat.map?.assetPath, PARROT_SKIN_PATHS[1], 'the sheet changes');
  assert.doesNotThrow(() => applyParrotVariant(null));
  assert.doesNotThrow(() => applyParrotVariant({ type: 'cow' }));
});

test('a parrot flies through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const parrot = manager.spawnMob('parrot', 0, 1, 0);
  const start = parrot.mesh.position.clone();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 900; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(parrot), 'still alive');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'and no fault was reported');
  assert.ok(parrot.mesh.position.distanceTo(start) > 0.25, 'it moved around');
});

test('the Inspector can spawn the parrot and reports its variant and state', () => {
  assert.ok(DEBUG_MOBS.includes('parrot'), 'parrot must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const parrot = s.reset('parrot');
  assert.equal(parrot.type, 'parrot', 'the Inspector spawns a real parrot');
  const snap = s.snapshot();
  assert.equal(snap.health, 6, 'Inspector telemetry shows 6 HP');
  assert.equal(snap.maxHealth, 6);
  assert.ok(PARROT_VARIANT_NAMES.includes(snap.parrotVariant), `variant ${snap.parrotVariant}`);
  assert.equal(snap.parrotTamed, false);
  assert.equal(snap.parrotSitting, false);
  assert.equal(snap.parrotShoulder, null);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 6);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.parrot_spawn_egg, 'the parrot has a spawn egg');
  assert.equal(ITEMS.parrot_spawn_egg.mob, 'parrot');
  assert.equal(ITEMS.parrot_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-parrots and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isParrot(cow), false);
  assert.equal(isPerched(cow), false);
  assert.equal(perchOnShoulder(cow, player), null);
  assert.equal(dismountShoulder(cow, player), null);
  assert.deepEqual(parrotDrops(cow), []);
  assert.equal(parrotXp(cow), 0);
  assert.equal(updateParrotFlight(manager, cow, 1 / 60, player), null);
  assert.equal(updateParrotFlight(manager, null, 1 / 60, player), null);
  assert.equal(findImitateTarget(manager, cow), null);
  assert.equal(canDance(manager, cow), false);
  assert.equal(canDance(null, null), false);
  assert.doesNotThrow(() => poseParrot(null, 1));
  assert.equal(parrotColors(99).body, PARROT_COLORS.red.body, 'an unknown variant falls back');
});
