// Mob update smoke test.
//
// The mob update loop wraps each mob in a try/catch so one broken mob cannot freeze the world.
// The cost of that safety net is that a fault is quiet: the mob simply stops moving, and the only
// evidence is one console line. Six of the mobs added in this pass shipped exactly that way — a
// missing import (`RABBIT_PLAYER_AVOID_RANGE`, `isBeeFlower`), a model that did not satisfy a
// shared animation contract, a helper that was called every frame. Every one of those froze the
// mob at its spawn point while its own unit tests passed.
//
// This suite closes that gap directly: it drives every advertised mob through the real update loop
// under several world states, and fails if the manager reported *any* fault. `mobErrors` is the
// engine's own record of swallowed exceptions, so nothing is inferred.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { DEBUG_MOBS } from '../src/mobDebugSession.js';

/**
 * World states chosen to reach the branches that early-return.
 *
 * Day/clear lets passive mobs idle and sleepers sleep; night puts the light-gated mobs into their
 * hostile path; rain and thunder reach the weather-dependent branches.
 */
const WORLD_STATES = [
  { label: 'day', worldTime: 6000, weatherType: 'clear', light: 15 },
  { label: 'night', worldTime: 18000, weatherType: 'clear', light: 0 },
  { label: 'rain', worldTime: 6000, weatherType: 'rain', light: 8 },
  { label: 'thunder', worldTime: 18000, weatherType: 'thunder', light: 0 }
];

function makeFixture({ worldTime, weatherType, light }) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  // Flat ground, with a low ceiling option so hanging and climbing branches can be reached.
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    getLightLevel: () => light,
    setVoxel() {}
  };
  const entities = new EntityManager(scene, world, sounds);
  // Drops are recorded as data. The real path builds item meshes, and for a non-block item that
  // needs `document`; this avoids both the dependency and any global mutation.
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };

  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, random: () => 0.5,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });

  const player = {
    position: new THREE.Vector3(3, 1, 3), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, isInWater: false,
    statusEffects: {}, yaw: 0, pitch: 0,
    takeDamage() {}, applyStatusEffect(id) { this.statusEffects[id] = true; },
    hasStatusEffect(id) { return !!this.statusEffects[id]; },
    updateCameraAndModel() {}, update() {}
  };
  const inventory = {
    active: null, hotbar: [], storage: [], armor: {},
    getActiveItem() { return this.active; }, consumeActiveItem() {}, addItem() { return true; },
    updateUI() {}, updateHotbar() {}
  };
  player.inventory = inventory;
  manager.game = {
    player, inventory, difficulty: 'normal', worldTime, controls: {},
    weather: { weatherType, isRaining: () => weatherType === 'rain' || weatherType === 'thunder' },
    mechanisms: { isFeatureEnabled: () => false }, ui: null
  };
  return { manager, player, entities };
}

/** Spawn a mob through the ordinary dispatcher, as the Inspector and spawn eggs do. */
function spawnFor(type, manager) {
  return manager.spawnMob(type, 0, 1, 0);
}

test('every advertised mob updates without the manager reporting a fault', () => {
  assert.ok(DEBUG_MOBS.length > 20, `expected a broad mob list, got ${DEBUG_MOBS.length}`);

  const faults = [];
  for (const type of DEBUG_MOBS) {
    for (const state of WORLD_STATES) {
      const { manager, player } = makeFixture(state);
      let mob;
      try {
        mob = spawnFor(type, manager);
      } catch (err) {
        faults.push(`${type} (${state.label}): spawn threw ${err.message}`);
        continue;
      }
      if (!mob) {
        faults.push(`${type} (${state.label}): spawn returned nothing`);
        continue;
      }

      // Drive it. The player stands a few blocks away so the chase, anger, flee and sting paths
      // are all reachable, and the ticks are long enough for timers to expire.
      try {
        for (let i = 0; i < 360; i++) manager.update(1 / 60, player);
      } catch (err) {
        faults.push(`${type} (${state.label}): update threw out of the loop: ${err.message}`);
        continue;
      }

      // The manager records every exception it swallowed, keyed by kind and message.
      for (const [key, info] of manager.mobErrors || []) {
        faults.push(`${type} (${state.label}): ${key} (x${info.count})`);
      }
    }
  }

  assert.deepEqual(faults, [],
    `these mobs reported faults while updating, which means they silently stopped working:\n  ${faults.join('\n  ')}`);
});

test('every advertised mob actually moves rather than freezing at its spawn point', () => {
  // The frozen-mob failure mode is what this file exists for, so it is asserted directly rather
  // than only through the absence of an error.
  //
  // Placement matters in both directions and both were got wrong on the first attempt:
  //  - a player standing *on top of* the mob makes several hostiles correctly stand still, because
  //    the skeleton stops inside 10 blocks to shoot and melee mobs stop in reach
  //  - a player 40 blocks *away* makes them idle, because most chase ranges are 16 to 32 blocks
  // Twelve blocks is inside every chase range measured here and outside every firing standoff, so
  // a mobile mob should close the distance and a frozen one still will not move at all.
  //
  // Known frozen mobs are listed explicitly rather than excluded silently.
  //
  // Nine of them were fixed by `ambientLocomotion.js`, which gives a mob with no branch of its own
  // a declared role: zoglin, ravager, witch, vindicator, evoker, warden, mooshroom, polar_bear and
  // panda now chase or wander. The remainder are listed here with the reason each one is still
  // inert. Listing them keeps the test honest — a *new* frozen mob still fails — and every entry
  // should be deleted as it is fixed.
  const deliberatelyStill = new Set([
    'bat',   // may be hanging from a ceiling
    'fox'    // sleeps through the day
  ]);
  const knownFrozen = new Set([
    'blaze',        // owned by the in-flight Blaze work on another branch
    // The cube mobs all hop now, and the phantom has its own circling-and-swooping flight, so none
    // of them are listed here any more.
    // These two DO steer, but only when built by their dedicated spawners, which set up the
    // path-following state that `spawnMob` does not. This harness deliberately uses the generic
    // dispatcher for every mob, the same way a spawn egg does, so it cannot observe their
    // movement. mobJitter.test.js drives both through `spawnPiglin` and `spawnHoglin` and confirms
    // they travel without shuddering, which is where they are actually covered.
    'piglin', 'hoglin',
    // Declared stationary: the shulker has no reach and no walking role, so there is nothing to
    // drive. `vex` was here too until its flying role was declared; it needed an approach altitude
    // rather than the wanderer, which picks goals that stand on solid ground.
    'shulker',
    // Aquatic; the adapted arena has no water to swim in.
    'drowned', 'squid', 'glow_squid', 'guardian', 'elder_guardian',
    // Training-arena mobs with their own dedicated loop.
    'tournament_host', 'site_manager',
    // Boss-scale, driven by their own event code rather than ambient locomotion.
    'ender_dragon', 'wither'
  ]);

  const frozen = [];
  for (const type of DEBUG_MOBS) {
    const { manager, player } = makeFixture({ worldTime: 18000, weatherType: 'clear', light: 0 });
    player.position.set(12, 1, 0);
    const mob = spawnFor(type, manager);
    if (!mob) continue;
    const start = mob.mesh.position.clone();
    let moved = 0;
    for (let i = 0; i < 600; i++) {
      manager.update(1 / 60, player);
      moved = Math.max(moved, mob.mesh.position.distanceTo(start));
    }
    // A quarter of a block over ten seconds is a low bar, but it is enough to distinguish
    // "working" from "frozen", which is the whole point.
    // Recorded with the distance travelled, so a failure names the mob and how close it came rather
    // than only that something in the list never moved.
    if (moved < 0.25 && !deliberatelyStill.has(type)) frozen.push(`${type} (moved ${moved.toFixed(3)})`);
  }

  // `frozen` holds annotated entries now, so the bare mob name is recovered before any set lookup. The
  // annotation is ' (moved N)'; stripping the TRAILING one leaves two-word names like 'polar bear' intact.
  const stripDistance = (entry) => entry.replace(/ \(moved [\d.]+\)$/, '');
  const frozenNames = new Set(frozen.map(stripDistance));
  const unexpected = frozen.filter(entry => !knownFrozen.has(stripDistance(entry)));
  assert.deepEqual(unexpected, [],
    `these mobs never moved and are not known-frozen, so something regressed:\n  ${unexpected.join('\n  ')}`);

  // The known-frozen list must not drift out of date in the other direction either: if an entry
  // starts moving, it should be removed so the record stays accurate. `blaze` is exempt because it
  // belongs to work in flight on another branch.
  const recovered = [...knownFrozen].filter(type => !frozenNames.has(type) && type !== 'blaze');
  assert.deepEqual(recovered, [],
    `these mobs move now, so remove them from knownFrozen:\n  ${recovered.join('\n  ')}`);
});

test('no mob is left marked broken', () => {
  const faults = [];
  for (const type of DEBUG_MOBS) {
    const { manager, player } = makeFixture({ worldTime: 18000, weatherType: 'clear', light: 0 });
    const mob = spawnFor(type, manager);
    if (!mob) continue;
    for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
    // A mob added to `brokenMobs` is skipped for the rest of its life.
    if (manager.brokenMobs?.has(mob)) faults.push(type);
  }
  assert.deepEqual(faults, [], `these mobs were marked broken: ${faults.join(', ')}`);
});

test('every mob survives a save and reload while updating cleanly', async () => {
  // Persistence is part of the same contract: a mob that reloads with a state the update loop
  // cannot digest would fail here rather than only in a save-specific test.
  const { serializeWorld, deserializeWorld } = await import('../src/mapManager.js');
  const { World } = await import('../src/world.js');
  const faults = [];

  for (const type of DEBUG_MOBS) {
    const { manager, player } = makeFixture({ worldTime: 18000, weatherType: 'clear', light: 0 });
    spawnFor(type, manager);
    const world = new World(7);
    const game = {
      world, mobs: manager, scene: manager.scene, entities: manager.entities,
      player, inventory: player.inventory, worldTime: 0, mechanisms: null,
      loadChunksAroundPlayer() {}, rebuildChunkMesh() {}
    };
    manager.game = { ...manager.game, ...game };
    try {
      const record = JSON.parse(JSON.stringify(serializeWorld(game)));
      deserializeWorld(game, record);
      for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
    } catch (err) {
      faults.push(`${type}: ${err.message}`);
      continue;
    }
    for (const [key, info] of manager.mobErrors || []) {
      faults.push(`${type}: ${key} (x${info.count})`);
    }
  }

  assert.deepEqual(faults, [], `these mobs failed a save/reload cycle:\n  ${faults.join('\n  ')}`);
});
