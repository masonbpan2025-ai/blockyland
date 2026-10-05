// Phantom parity with https://minecraft.wiki/w/Phantom
//
// The phantom had a spawner but no behaviour and no stats: it had health but no hitbox, no undead
// flag, no sunlight burning, no loot beyond a hardcoded row, and — most importantly — a single
// undivided wing mesh where the shared flight helper writes `mob.wings.left.rotation.z`, so it could
// not fly at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  PHANTOM_HEALTH, PHANTOM_DIMENSIONS, PHANTOM_DAMAGE, PHANTOM_CIRCLE, PHANTOM_TARGET_RANGE,
  PHANTOM_SWOOP, PHANTOM_SWOOP_SPEED, PHANTOM_RETREAT_SPEED, PHANTOM_CAT_AVOID_RANGE,
  PHANTOM_COLORS,
  isPhantom, phantomDamageFor, rollPhantomSwoopDelay, phantomAnchorFor, phantomCirclePosition,
  phantomBurnsInSunlight, findPhantomTarget, isSwooping, startPhantomSwoop, updatePhantomFlight,
  onPhantomHurt, phantomDrops, phantomXp, createPhantomWings, posePhantom
} from '../src/phantomBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal', worldTime = 18000, light = 0 } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => light,
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
    position: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; } };
  player.inventory = inventory;
  manager.game = { player, difficulty, worldTime, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities };
}

test('phantom is a native type with the wiki health and hitbox', () => {
  const { manager } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  assert.equal(phantom.type, 'phantom');
  assert.equal(phantom.maxHealth, PHANTOM_HEALTH);
  assert.equal(phantom.maxHealth, 20, 'wiki: 20 HP, constant regardless of size');
  assert.deepEqual(PHANTOM_DIMENSIONS, { width: 0.9, height: 0.5 });
  assert.deepEqual(manager.getMobDimensions('phantom'), { width: 0.9, height: 0.5 });
  assert.deepEqual([phantom.width, phantom.height], [0.9, 0.5],
    'the spawner used to leave these undefined, so collision fell back to a humanoid box');
});

test('the undead and entity tags match the wiki', () => {
  const { manager } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  // Wiki entity tags: undead, burn_in_daylight, can_breathe_under_water, fall_damage_immune,
  // ignores_poison_and_regen, inverted_healing_and_harm, sensitive_to_smite.
  assert.equal(phantom.isUndead, true);
  assert.equal(phantom.burnsInDaylight, true);
  assert.equal(phantom.canBreatheUnderwater, true);
  assert.equal(phantom.fallDamageImmune, true);
  assert.equal(phantom.poisonImmune, true, 'undead ignore poison');
  assert.equal(phantom.invertedHealing, true, 'undead are healed by Instant Damage');
  assert.equal(phantom.fearsCats, true);
});

test('the damage table matches the wiki Java figures', () => {
  // Wiki Java: 2 on Easy and Normal, 3 on Hard. Bedrock deals 4/6/9, which is a separate table.
  assert.deepEqual(PHANTOM_DAMAGE, { peaceful: 0, easy: 2, normal: 2, hard: 3 });
  assert.equal(phantomDamageFor('easy'), 2);
  assert.equal(phantomDamageFor('normal'), 2);
  assert.equal(phantomDamageFor('hard'), 3);
  assert.equal(phantomDamageFor('peaceful'), 0);
  assert.equal(phantomDamageFor('nonsense'), 2, 'an unknown difficulty falls back to Normal');
});

test('the flight constants match the wiki', () => {
  // Wiki: idle circling within 15-25 blocks horizontally and 24-35 vertically.
  assert.deepEqual(PHANTOM_CIRCLE, { horizontalMin: 15, horizontalMax: 25, verticalMin: 24, verticalMax: 35 });
  assert.equal(PHANTOM_TARGET_RANGE, 64, 'wiki: targeting players from 64 blocks away');
  assert.equal(PHANTOM_SWOOP.minSeconds, 8, 'wiki: a swoop every 8-12 seconds in Java');
  assert.equal(PHANTOM_SWOOP.maxSeconds, 12);
  assert.equal(PHANTOM_SWOOP_SPEED, 20, 'wiki: up to 20 blocks per second when attacking');
  assert.equal(PHANTOM_CAT_AVOID_RANGE, 16, 'wiki: it stays at least 16 blocks from cats');
});

test('the swoop delay is drawn from the 8-12 second window', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const d = rollPhantomSwoopDelay(() => r);
    assert.ok(d >= 8 && d <= 12, `roll ${r} gave ${d}`);
  }
  assert.equal(rollPhantomSwoopDelay(() => 0), 8);
  // A finite random cannot reach exactly 12, so the upper bound is asserted rather than equality.
  assert.ok(rollPhantomSwoopDelay(() => 0.999999) > 11.99);
});

test('the anchor sits inside the wiki circle band above the target', () => {
  const target = new THREE.Vector3(10, 5, 10);
  for (let i = 0; i < 200; i++) {
    const anchor = phantomAnchorFor(target);
    const horizontal = Math.hypot(anchor.x - target.x, anchor.z - target.z);
    const vertical = anchor.y - target.y;
    assert.ok(horizontal >= PHANTOM_CIRCLE.horizontalMin - 1e-9
      && horizontal <= PHANTOM_CIRCLE.horizontalMax + 1e-9, `horizontal ${horizontal}`);
    assert.ok(vertical >= PHANTOM_CIRCLE.verticalMin - 1e-9
      && vertical <= PHANTOM_CIRCLE.verticalMax + 1e-9, `vertical ${vertical}`);
  }
});

test('the circle position orbits its anchor', () => {
  const anchor = new THREE.Vector3(0, 30, 0);
  const radius = PHANTOM_CIRCLE.horizontalMin;
  const p1 = phantomCirclePosition(anchor, 0, radius);
  const p2 = phantomCirclePosition(anchor, Math.PI / 2, radius);
  const p3 = phantomCirclePosition(anchor, Math.PI, radius);
  assert.ok(Math.abs(p1.distanceTo(anchor) - radius) < 1e-9, 'on the circle');
  assert.ok(Math.abs(p2.distanceTo(anchor) - radius) < 1e-9);
  assert.ok(Math.abs(p3.distanceTo(anchor) - radius) < 1e-9);
  assert.notDeepEqual(p1.toArray(), p2.toArray(), 'and it actually moves around it');
  assert.equal(p1.y, anchor.y, 'staying at the anchor altitude');
});

test('the wings satisfy the shared flight contract', () => {
  // `moveFlyingMob` writes `mob.wings.left.rotation.z` and `...right.rotation.z`. The spawner used a
  // single undivided wing mesh, so those writes did nothing and the phantom could never fly. This is
  // the same trap the bat fell into.
  const { manager } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  assert.ok(phantom.wings, 'it has wings');
  assert.ok(phantom.wings.left && phantom.wings.right, 'wings.left and wings.right exist');
  assert.ok(phantom.wings.left.rotation && phantom.wings.right.rotation, 'each has a rotation');
  assert.equal(phantom.wings.length, 2, 'and they can still be counted by index');

  // Standalone too.
  const body = new THREE.Group();
  const wings = createPhantomWings(new THREE.MeshLambertMaterial(), body);
  assert.ok(wings.left.rotation && wings.right.rotation);
  assert.equal(body.children.length, 2, 'both pivots are attached to the body');
});

test('it actually flies and circles through the real update loop', () => {
  const { manager, player } = fixture();
  player.position.set(0, 1, 0);
  const phantom = manager.spawnMob('phantom', 0, 30, 0);
  const start = phantom.mesh.position.clone();
  let moved = 0;
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    moved = Math.max(moved, phantom.mesh.position.distanceTo(start));
  }
  assert.ok(moved > 0.5, `it should fly around, moved ${moved.toFixed(3)}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('a phantom targets players within 64 blocks but not in Creative or on Peaceful', () => {
  const { manager, player } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  player.position.set(0, 1, 0);
  assert.equal(findPhantomTarget(manager, phantom, player), player, 'in range');

  player.position.set(200, 1, 200);
  assert.equal(findPhantomTarget(manager, phantom, player), null, 'out of range');
  player.position.set(0, 1, 0);

  player.gamemode = 'creative';
  assert.equal(findPhantomTarget(manager, phantom, player), null, 'wiki: not Creative players');
  player.gamemode = 'survival';

  assert.equal(findPhantomTarget(manager, phantom, player, { difficulty: 'peaceful' }), null,
    'nothing hostile on Peaceful');
  manager.insomniaDisabled = true;
  assert.equal(findPhantomTarget(manager, phantom, player), null, 'doInsomnia off stops it entirely');
  manager.insomniaDisabled = false;

  assert.equal(findPhantomTarget(manager, { type: 'cow' }, player), null, 'only phantoms');
  assert.equal(findPhantomTarget(manager, phantom, null), null);
});

test('a swoop dives at the target and bites on contact', () => {
  const { manager, player } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 3, 0);
  player.position.set(0, 1, 0);
  phantom.target = player;
  startPhantomSwoop(phantom);
  assert.equal(isSwooping(phantom), true);

  let bit = false;
  for (let i = 0; i < 120 && !bit; i++) {
    if (updatePhantomFlight(manager, phantom, 1 / 60, player, { move: () => {} }) === 'bit') bit = true;
  }
  assert.equal(bit, true, 'the dive connects');
  assert.equal(player.damageTaken, 2, 'wiki: 2 on Normal');
  assert.equal(phantom.swoopState, 'retreating', 'and it pulls up afterwards');
});

test('Hard difficulty bites for 3', () => {
  const { manager, player } = fixture({ difficulty: 'hard' });
  const phantom = manager.spawnMob('phantom', 0, 3, 0);
  player.position.set(0, 1, 0);
  phantom.target = player;
  startPhantomSwoop(phantom);
  for (let i = 0; i < 120 && player.damageTaken === 0; i++) {
    updatePhantomFlight(manager, phantom, 1 / 60, player, { move: () => {} });
  }
  assert.equal(player.damageTaken, 3, 'wiki: 3 on Hard');
});

test('being hurt mid-swoop makes it retreat instead of continuing', () => {
  // Wiki: "If stopped or hurt during this action, the phantom retreats back to its original
  // elevation."
  const { manager, player } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  player.position.set(0, 1, 0);
  phantom.target = player;
  phantom.anchorPos = new THREE.Vector3(0, 40, 0);
  startPhantomSwoop(phantom);
  assert.equal(phantom.swoopState, 'diving');

  assert.equal(onPhantomHurt(phantom), true, 'the hurt is registered');
  assert.equal(phantom.swoopState, 'retreating');
  const outcome = updatePhantomFlight(manager, phantom, 1 / 60, player, { move: () => {} });
  assert.equal(outcome, 'retreating');
  assert.equal(player.damageTaken, 0, 'and it does not bite on the way up');

  // Hurt while not swooping does nothing.
  const idle = manager.spawnMob('phantom', 0, 20, 0);
  assert.equal(onPhantomHurt(idle), false);
});

test('a retreat ends at the anchor and restarts the swoop timer', () => {
  const { manager, player } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 40, 0);
  player.position.set(0, 1, 0);
  phantom.anchorPos = new THREE.Vector3(0, 40, 0);
  phantom.swoopState = 'retreating';
  for (let i = 0; i < 60; i++) updatePhantomFlight(manager, phantom, 1 / 60, player, { move: () => {} });
  assert.equal(phantom.swoopState, null, 'the retreat ends at the anchor');
  assert.ok(phantom.swoopTimer > 0, 'and the next swoop is scheduled');
});

test('it avoids cats within 16 blocks', () => {
  const { manager, player } = fixture();
  player.position.set(0, 1, 0);
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  // Close to the phantom, which flies at y=20: the avoidance radius is measured in three
  // dimensions, so a cat on the ground is 19 blocks away and correctly ignored.
  const cat = manager.spawnMob('cat', 4, 20, 0);
  const outcome = updatePhantomFlight(manager, phantom, 1 / 60, player, { move: () => {} });
  assert.equal(outcome, 'avoiding-cat', 'wiki: it keeps at least 16 blocks from cats');
  assert.equal(phantom.state, 'avoiding cat');
  assert.ok(phantom.velocity.length() > 0, 'and it moves away');

  // Out of range, it goes back to circling.
  cat.mesh.position.set(100, 20, 100);
  phantom.anchorPos = new THREE.Vector3(0, 40, 0);
  const back = updatePhantomFlight(manager, phantom, 1 / 60, player, { move: () => {} });
  assert.notEqual(back, 'avoiding-cat');
});

test('it burns in sunlight, like other undead', () => {
  const { manager } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  assert.equal(phantomBurnsInSunlight(phantom, 15, true), true, 'bright day');
  assert.equal(phantomBurnsInSunlight(phantom, 12, true), true, 'light 12 still burns');
  assert.equal(phantomBurnsInSunlight(phantom, 11, true), false, 'light 11 does not');
  assert.equal(phantomBurnsInSunlight(phantom, 15, false), false, 'never at night');
  assert.equal(phantomBurnsInSunlight({ type: 'cow' }, 15, true), false, 'only phantoms');

  // And through the loop, in daylight.
  const day = fixture({ worldTime: 6000, light: 15 });
  const burning = day.manager.spawnMob('phantom', 0, 20, 0);
  const startHealth = burning.health;
  for (let i = 0; i < 300; i++) day.manager.update(1 / 60, day.player);
  assert.equal(burning.isBurning, true, 'it caught fire');
  assert.ok(burning.health < startHealth, `it is taking fire damage, ${startHealth} -> ${burning.health}`);
});

test('it does not burn at night', () => {
  const { manager, player } = fixture({ worldTime: 18000, light: 0 });
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  const start = phantom.health;
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(phantom.isBurning, false, 'no sun at night');
  assert.equal(phantom.health, start, 'so no fire damage');
});

test('the loot is 0-1 membrane, more with Looting, and a flat 5 XP', () => {
  // Wiki: 0-1 phantom membrane, with Looting adding 0-1, and 5 XP. The base loot table this
  // replaced hardcoded 1-2, which is neither.
  const { manager } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  phantom.playerDamaged = true;

  // A low roll gives one, a high roll gives none.
  assert.deepEqual(manager.getMobDeathDrops(phantom, () => 0.1), [['phantom_membrane', false, 1, 1]]);
  assert.deepEqual(manager.getMobDeathDrops(phantom, () => 0.9), [],
    'wiki: the base chance is 0-1, so it can drop nothing');

  // Looting adds.
  phantom.lootingLevel = 3;
  const looted = manager.getMobDeathDrops(phantom, () => 0.1);
  assert.equal(looted[0][0], 'phantom_membrane');
  assert.ok(looted[0][2] >= 1 && looted[0][2] <= 2, `looting gave ${looted[0][2]}`);

  assert.equal(phantomXp(phantom), 5, 'wiki: a flat 5 XP');
  assert.equal(phantomXp(manager.spawnCow(0, 1, 0)), 0, 'only phantoms');
  assert.ok(ITEMS.phantom_membrane, 'the membrane is a real item');
});

test('no loot and no XP without player credit', () => {
  const { manager } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  assert.deepEqual(manager.getMobDeathDrops(phantom, () => 0.1), [], 'an uncredited kill drops nothing');
  assert.equal(phantomDrops({ type: 'cow' }).length, 0);
  assert.equal(phantomXp({ type: 'cow' }), 0);
});

test('a diving phantom folds its wings, and its eyes stay visible', () => {
  const { manager } = fixture();
  const phantom = manager.spawnMob('phantom', 0, 20, 0);
  phantom.swoopState = 'diving';
  posePhantom(phantom);
  assert.ok(phantom.wings.every(w => Math.abs(w.pivot.rotation.z) > 0.5), 'the wings fold back');
  // Wiki: under Invisibility the body disappears but the eyes remain.
  assert.equal(phantom.eyeMeshes.length, 2);
  assert.doesNotThrow(() => posePhantom(null));
  assert.doesNotThrow(() => posePhantom({}));
});

test('the Inspector can spawn the phantom and reports its swoop state', () => {
  assert.ok(DEBUG_MOBS.includes('phantom'), 'phantom must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const phantom = s.reset('phantom');
  assert.equal(phantom.type, 'phantom', 'the Inspector spawns a real phantom');
  const snap = s.snapshot();
  assert.equal(snap.health, 20, 'Inspector telemetry shows 20 HP');
  assert.equal(snap.maxHealth, 20);
  assert.equal(snap.phantomSwoop, null);
  assert.equal(snap.phantomBurning, false);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 20);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.phantom_spawn_egg, 'the phantom has a spawn egg');
  assert.equal(ITEMS.phantom_spawn_egg.mob, 'phantom');
});

test('the helpers are safe on non-phantoms and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isPhantom(cow), false);
  assert.equal(isSwooping(cow), false);
  assert.equal(startPhantomSwoop(cow), false);
  assert.equal(updatePhantomFlight(manager, cow, 1 / 60, player), null);
  assert.equal(updatePhantomFlight(manager, null, 1 / 60, player), null);
  assert.equal(onPhantomHurt(cow), false);
  assert.deepEqual(phantomDrops(cow), []);
  assert.equal(phantomXp(cow), 0);
  assert.equal(phantomBurnsInSunlight(null, 15, true), false);
  assert.doesNotThrow(() => posePhantom(null));
  assert.doesNotThrow(() => updatePhantomFlight(manager, { type: 'phantom' }, 1 / 60, player));
});
