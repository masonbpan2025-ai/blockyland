// Dolphin parity with https://minecraft.wiki/w/Dolphin
//
// The audit recorded dolphins at 20 HP against a reference of 10, and a drop table giving
// salmon where the wiki gives raw cod. Both are pinned here, along with the two-minute
// out-of-water suffocation timer and the split grant/keep radii of Dolphin's Grace.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  DOLPHIN_HEALTH, DOLPHIN_DIMENSIONS, DOLPHIN_BABY_SCALE, DOLPHIN_MOISTNESS_TICKS,
  DOLPHIN_DRY_SECONDS, DOLPHIN_GRACE_GRANT_RANGE, DOLPHIN_GRACE_KEEP_RANGE,
  DOLPHIN_GRACE_SECONDS, DOLPHIN_SUFFOCATION_INTERVAL,
  isDolphin, dolphinIsSuffocating, updateDolphinMoistness, applyDolphinsGrace
} from '../src/dolphinBehavior.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture(water = true) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : (water && y < 6 ? BLOCKS.WATER : BLOCKS.AIR)),
    getHeightAt: () => 0
  };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { dolphin: new THREE.Texture() },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(0, 2, 0), gamemode: 'survival', health: 100, keys: {},
    isInWater: true, statusEffects: {},
    takeDamage() {},
    applyStatusEffect(id) { this.statusEffects[id] = true; },
    hasStatusEffect(id) { return !!this.statusEffects[id]; }
  };
  manager.game = { player, difficulty: 'normal', weather: { weatherType: 'clear', isRaining: () => false }, controls: {} };
  return { manager, entities, player, scene, world };
}

test('dolphins have the reference 10 HP, not the previously implemented 20', () => {
  const { manager } = fixture();
  const dolphin = manager.spawnDolphin(0, 2, 0);
  assert.equal(dolphin.maxHealth, DOLPHIN_HEALTH);
  assert.equal(dolphin.maxHealth, 10, 'wiki: 10 HP');
  assert.equal(dolphin.health, 10);
});

test('the dimension table matches the wiki adult hitbox', () => {
  assert.deepEqual(DOLPHIN_DIMENSIONS.adult, { width: 0.9, height: 0.6 });
  assert.deepEqual(DOLPHIN_DIMENSIONS.baby, { width: 0.585, height: 0.39 });
  const { manager } = fixture();
  assert.deepEqual(manager.getMobDimensions('dolphin'), { width: 0.9, height: 0.6 });
  // The baby scale is the ratio of the two hitboxes.
  assert.ok(Math.abs(DOLPHIN_DIMENSIONS.baby.width / DOLPHIN_DIMENSIONS.adult.width - DOLPHIN_BABY_SCALE) < 1e-6);
});

test('a baby dolphin is smaller and carries its own hitbox', () => {
  const { manager } = fixture();
  const baby = manager.spawnDolphin(0, 2, 0, { isBaby: true });
  assert.equal(baby.isBaby, true);
  assert.equal(baby.mesh.scale.x, DOLPHIN_BABY_SCALE, 'the model is scaled to 0.65');
  assert.deepEqual([baby.width, baby.height], [0.585, 0.39], 'and the baby hitbox is used');

  const adult = manager.spawnDolphin(0, 2, 0);
  assert.equal(adult.mesh.scale.x, 1);
  assert.deepEqual([adult.width, adult.height], [0.9, 0.6]);
});

test('dolphins drop raw cod, not salmon, and cooked cod when burning', () => {
  const { manager } = fixture();
  const dolphin = manager.spawnDolphin(0, 2, 0);
  const rows = manager.getMobDeathDrops(dolphin, () => 0.99);
  assert.deepEqual(rows, [['cod', false, 0, 1]], `wiki: 0-1 raw cod, got ${JSON.stringify(rows)}`);
  assert.ok(!rows.some(r => r[0] === 'salmon'), 'dolphins must not drop salmon');

  const burning = manager.spawnDolphin(0, 2, 0);
  burning.fireTicks = 20;
  assert.deepEqual(manager.getMobDeathDrops(burning, () => 0.99), [['cooked_cod', false, 0, 1]]);
});

test('the moistness constants match the wiki two-minute timer', () => {
  assert.equal(DOLPHIN_MOISTNESS_TICKS, 2400, 'wiki NBT: Moistness is set to 2400 in water');
  assert.equal(DOLPHIN_DRY_SECONDS, 120, '2400 ticks at 20 ticks/s is two minutes');
});

test('a dolphin in water keeps its moistness topped up', () => {
  const { manager } = fixture();
  const dolphin = manager.spawnDolphin(0, 2, 0);
  dolphin.inWater = true;
  dolphin.moistness = 10;
  for (let i = 0; i < 100; i++) updateDolphinMoistness(manager, dolphin, 0.05, false);
  assert.equal(dolphin.moistness, DOLPHIN_MOISTNESS_TICKS, 'water refills moistness');
  assert.equal(dolphinIsSuffocating(dolphin), false);
});

test('rain refills moistness, so a dolphin on land takes no damage in a storm', () => {
  const { manager } = fixture();
  const dolphin = manager.spawnDolphin(0, 2, 0);
  dolphin.inWater = false;
  dolphin.moistness = 0;
  for (let i = 0; i < 60; i++) {
    const damaged = updateDolphinMoistness(manager, dolphin, 1 / 60, true);
    assert.equal(damaged, false, 'wiki: it takes no damage out of water during rain');
  }
  assert.ok(dolphin.moistness > 0, 'rain refilled it');
});

test('a dry dolphin runs its timer down, then suffocates on a steady interval', () => {
  const { manager } = fixture();
  let damageCalls = 0;
  manager.damageMob = () => { damageCalls++; };
  const dolphin = manager.spawnDolphin(0, 2, 0);
  dolphin.inWater = false;
  dolphin.moistness = DOLPHIN_MOISTNESS_TICKS;

  // Half a minute of dry weather must not damage it.
  for (let i = 0; i < 30 * 20; i++) updateDolphinMoistness(manager, dolphin, 1 / 20, false);
  assert.equal(damageCalls, 0, 'no damage before the two minutes elapse');
  assert.ok(dolphin.moistness > 0, 'and the timer has not yet run out');

  // Run out the remainder plus a few seconds.
  for (let i = 0; i < (DOLPHIN_DRY_SECONDS - 30 + 3) * 20; i++) {
    updateDolphinMoistness(manager, dolphin, 1 / 20, false);
  }
  assert.equal(dolphin.moistness, 0, 'the timer bottoms out at zero, never negative');
  assert.ok(damageCalls > 0, 'suffocation damage begins');
  // Damage lands about once per interval, not once per frame.
  const expected = Math.floor(3 / DOLPHIN_SUFFOCATION_INTERVAL);
  assert.ok(damageCalls >= expected - 1 && damageCalls <= expected + 1,
    `expected about ${expected} damage ticks, got ${damageCalls}`);
});

test('suffocation damage stops once the dolphin is back in water', () => {
  const { manager } = fixture();
  let damageCalls = 0;
  manager.damageMob = () => { damageCalls++; };
  const dolphin = manager.spawnDolphin(0, 2, 0);
  dolphin.inWater = false;
  dolphin.moistness = 0;
  updateDolphinMoistness(manager, dolphin, 2, false);
  const afterDry = damageCalls;
  assert.ok(afterDry > 0, 'it was suffocating');

  dolphin.inWater = true;
  for (let i = 0; i < 200; i++) updateDolphinMoistness(manager, dolphin, 0.05, false);
  assert.equal(damageCalls, afterDry, 'no further damage in water');
  assert.equal(dolphin.moistness, DOLPHIN_MOISTNESS_TICKS);
});

test('the moistness helper ignores non-dolphins', () => {
  const { manager } = fixture();
  assert.equal(updateDolphinMoistness(manager, { type: 'cod' }, 1, false), false);
  assert.equal(updateDolphinMoistness(manager, null, 1, false), false);
  assert.equal(isDolphin({ type: 'cod' }), false);
  assert.equal(isDolphin(manager.spawnDolphin(0, 2, 0)), true);
});

test('Dolphin\u2019s Grace is granted inside 9 blocks and kept inside 15', () => {
  assert.equal(DOLPHIN_GRACE_GRANT_RANGE, 9, 'wiki: within a 9 block spherical radius');
  assert.equal(DOLPHIN_GRACE_KEEP_RANGE, 15, 'wiki: replenished within 15 blocks');
  assert.equal(DOLPHIN_GRACE_SECONDS, 5, 'wiki: for 5 seconds');

  const { manager, player } = fixture();
  const dolphin = manager.spawnDolphin(0, 2, 0);

  // Inside the grant radius: the effect is applied.
  player.position.set(5, 2, 0);
  assert.equal(applyDolphinsGrace(dolphin, player), true);
  assert.equal(player.hasStatusEffect('dolphins_grace'), true);

  // Between grant and keep: an already-boosted player keeps it, a fresh one does not.
  player.position.set(12, 2, 0);
  assert.equal(applyDolphinsGrace(dolphin, player), true, 'the boost is maintained in the keep band');
  const fresh = { position: new THREE.Vector3(12, 2, 0), isInWater: true, statusEffects: {}, applyStatusEffect(id) { this.statusEffects[id] = true; }, hasStatusEffect(id) { return !!this.statusEffects[id]; } };
  assert.equal(applyDolphinsGrace(dolphin, fresh), false, 'outside 9 blocks a new boost is not granted');
  assert.equal(fresh.hasStatusEffect('dolphins_grace'), false, 'and the fresh player has no effect');

  // Beyond the keep radius: nobody gets or keeps anything.
  player.position.set(20, 2, 0);
  assert.equal(applyDolphinsGrace(dolphin, player), false, 'beyond 15 blocks the effect is not refreshed');
});

test('Dolphin\u2019s Grace requires the player to be in water', () => {
  const { manager, player } = fixture();
  const dolphin = manager.spawnDolphin(0, 2, 0);
  player.position.set(2, 2, 0);
  player.isInWater = false;
  assert.equal(applyDolphinsGrace(dolphin, player), false, 'no boost for a dry player');
  player.isInWater = true;
  assert.equal(applyDolphinsGrace(dolphin, player), true);
  assert.equal(applyDolphinsGrace({ type: 'cod' }, player), false, 'only dolphins grant it');
});

test('the Inspector can spawn the dolphin and reports the reference health', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const dolphin = s.reset('dolphin');
  assert.equal(dolphin.type, 'dolphin');
  assert.equal(s.snapshot().health, 10, 'Inspector telemetry shows 10 HP');
  assert.equal(s.snapshot().maxHealth, 10);
  assert.equal(dolphin.moistness, DOLPHIN_MOISTNESS_TICKS, 'and starts fully moist');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 10, 'a dolphin in the Inspector water does not dry out');
});

test('a dolphin still swims and stays inside its water volume', () => {
  const { manager, player } = fixture();
  const dolphin = manager.spawnDolphin(2, 3, 2);
  let travelled = 0;
  for (let i = 0; i < 300; i++) {
    const before = dolphin.mesh.position.clone();
    manager.update(1 / 60, player);
    travelled += dolphin.mesh.position.distanceTo(before);
    assert.equal(manager.checkMobCollision(dolphin, dolphin.mesh.position), false, 'must not clip terrain');
  }
  assert.ok(travelled > 1, 'the dolphin should swim rather than sit still');
  assert.equal(dolphin.inWater, true, 'and stay in the water volume');
});
