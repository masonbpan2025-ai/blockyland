// Sprint-swimming, the eye-in-water test, the swimming pose, sinking and the current push, run on a Player with a
// small voxel world. Reference: https://minecraft.wiki/w/Swimming and https://minecraft.wiki/w/Water.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/player.js';
import { BLOCKS } from '../src/blocks.js';
import { useBucket } from '../src/buckets.js';
import { SWIMMING_HEIGHT, SWIMMING_EYE_HEIGHT, CURRENT_PUSH } from '../src/waterRules.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/** A world of voxels set by `cells`, with every water block a source. */
function voxels(cells = {}) {
  const map = new Map(Object.entries(cells));
  return {
    getVoxel: (x, y, z) => map.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    setVoxel: (x, y, z, id) => map.set(`${x},${y},${z}`, id),
    getWaterLevel: (x, y, z) => (map.get(`${x},${y},${z}`) === BLOCKS.WATER ? 0 : -1),
    getLavaLevel: () => -1,
    getOrCreateChunk: () => ({}),
    map,
  };
}

/** A pool three blocks deep at x,z = 0, with optional solid cells. */
function pool(extra = {}) {
  const cells = {};
  for (let y = 0; y < 3; y++) cells[`0,${y},0`] = BLOCKS.WATER;
  return voxels({ ...cells, ...extra });
}

function swimmer(world, { y = 0.2, hunger = 20, effects = [], gamemode = 'survival' } = {}) {
  const p = Object.create(Player.prototype);
  Object.assign(p, {
    world, width: 0.6, height: 1.8, eyeHeight: 1.62, isSwimming: false, isFlying: false,
    hunger, gamemode, statusEffects: new Map(effects),
    position: { x: 0.5, y, z: 0.5 },
  });
  p.inWater = true;
  p.headInWater = p.isEyeInWater();
  return p;
}

test('the eye is in water when the block at eye level is water below its surface', () => {
  const p = swimmer(pool(), { y: 0.2 });
  assert.equal(p.isEyeInWater(), true, 'eye at 1.82, inside the second water block');
  const surfaced = swimmer(pool(), { y: 2.0 });
  assert.equal(surfaced.isEyeInWater(), false, 'eye at 3.62, above the pool');
});

test('sprinting forward with the head under water starts sprint-swimming and lays the player flat', () => {
  const p = swimmer(pool());
  p.updateSwimming(true, true);
  assert.equal(p.isSwimming, true);
  assert.equal(p.height, SWIMMING_HEIGHT, 'one block tall');
  assert.equal(p.eyeHeight, SWIMMING_EYE_HEIGHT);
});

test('sprint-swimming does not start with the head out of the water, or without sprint and forward', () => {
  const surfaced = swimmer(pool(), { y: 2.0 });
  surfaced.updateSwimming(true, true);
  assert.equal(surfaced.isSwimming, false, 'head above the surface');
  const noSprint = swimmer(pool());
  noSprint.updateSwimming(false, true);
  assert.equal(noSprint.isSwimming, false);
  const noForward = swimmer(pool());
  noForward.updateSwimming(true, false);
  assert.equal(noForward.isSwimming, false);
});

test('sprint-swimming is refused at 6 hunger and under Blindness, and ends when hunger drops to 6', () => {
  const hungry = swimmer(pool(), { hunger: 6 });
  hungry.updateSwimming(true, true);
  assert.equal(hungry.isSwimming, false, '"not possible at 6 hunger ... or below"');
  const blind = swimmer(pool(), { effects: [['blindness', { duration: 10 }]] });
  blind.updateSwimming(true, true);
  assert.equal(blind.isSwimming, false, '"or while Blindness is active"');
  const p = swimmer(pool());
  p.updateSwimming(true, true);
  assert.equal(p.isSwimming, true);
  p.hunger = 6;
  p.updateSwimming(true, true);
  assert.equal(p.isSwimming, false, '"ends ... when hunger drops to 6 or below"');
});

test('a swimmer who reaches the surface keeps swimming while still in the water', () => {
  const p = swimmer(pool());
  p.updateSwimming(true, true);
  p.headInWater = false; // bobbed up
  p.updateSwimming(true, true);
  assert.equal(p.isSwimming, true, 'no flicker at the surface');
  p.inWater = false;
  p.updateSwimming(true, true);
  assert.equal(p.isSwimming, false, 'leaving the water ends it');
});

test('a swimmer stands back up only where there is room', () => {
  // A one-block-high tunnel: stone directly above the swimmer's single block of space.
  const tunnel = pool({ '0,1,0': BLOCKS.STONE });
  const p = swimmer(tunnel, { y: 0.1 });
  p.isSwimming = true; p.applySwimPose();
  p.isSwimming = false; p.applySwimPose();
  assert.equal(p.height, SWIMMING_HEIGHT, 'still one block tall under the ceiling');
  tunnel.map.set('0,1,0', BLOCKS.WATER);
  p.applySwimPose();
  assert.equal(p.height, 1.8, 'full height once the ceiling is gone');
  assert.equal(p.eyeHeight, 1.62);
});

test('the swimming hitbox fits a one-block gap that a standing player does not', () => {
  const gap = pool({ '0,1,0': BLOCKS.STONE });
  const p = swimmer(gap, { y: 0.1 });
  assert.equal(p.checkCollision(p.position), true, 'standing, the head hits the ceiling');
  p.isSwimming = true; p.applySwimPose();
  assert.equal(p.checkCollision(p.position), false, 'flat, the player fits');
});

test('creative flight is neither swimming nor pushed', () => {
  const p = swimmer(pool());
  p.isFlying = true;
  p.updateSwimming(true, true);
  assert.equal(p.isSwimming, false);
  assert.match(read('src/player.js'), /this\.inWater && !this\.isFlying \? waterCurrent\(/, 'the current applies only when not flying');
});

test('the current push is the wiki\'s 1.39 m/s and sneaking sinks faster', () => {
  const src = read('src/player.js');
  assert.match(src, /current\.x \* CURRENT_PUSH/, 'x uses the wiki figure');
  assert.match(src, /current\.z \* CURRENT_PUSH/, 'and z');
  assert.doesNotMatch(src, /current\.x \* 0\.65/, 'the old 0.65 is gone');
  assert.ok(Math.abs(CURRENT_PUSH - 1.39) < 0.005);
  assert.match(src, /"Crouching sinks faster"/, 'sneaking adds a downward push in water');
  assert.match(src, /Math\.sin\(this\.pitch \|\| 0\) \* targetSpeed/, 'a swimmer follows the look direction');
});

// --- mining and buckets -----------------------------------------------------------

test('mining reads the underwater penalty and Aqua Affinity', () => {
  const src = read('src/main.js');
  const at = src.indexOf('const effectMultiplier = miningSpeedMultiplier(');
  const block = src.slice(at - 900, at + 200);
  assert.match(block, /underwaterMiningMultiplier\(\{/);
  assert.match(block, /aquaAffinity: \(this\.player\.armourEnchantmentLevel\?\.\('aqua_affinity'\)/);
  assert.match(block, /\* waterFactor;/, 'and multiplies the mining speed by it');
});

function bucketInventory(id) {
  const hotbar = [{ id, isBlock: false, count: 1 }, null, null, null, null, null, null, null, null];
  return {
    hotbar, storage: [], activeSlot: 0,
    getActiveItem() { return this.hotbar[this.activeSlot]; },
    consumeActiveItem() {}, addItem() { return true; },
  };
}

test('water poured in the Nether evaporates: nothing is placed and the bucket is emptied', () => {
  const world = voxels({ '0,0,0': BLOCKS.STONE });
  world.isNether = true;
  const inventory = bucketInventory('water_bucket');
  const result = useBucket(world, inventory, 'survival', { x: 0, y: 0, z: 0, normal: { x: 0, y: 1, z: 0 } }, () => {}, { dimension: 'nether' });
  assert.ok(result, 'the pour is spent');
  assert.equal(result.evaporated, true);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.AIR, 'no water was placed');
  assert.equal(inventory.hotbar[0].id, 'bucket', 'the bucket is empty');
});

test('water poured in the Overworld or the End is placed as before', () => {
  for (const dimension of ['overworld', 'end']) {
    const world = voxels({ '0,0,0': BLOCKS.STONE });
    const inventory = bucketInventory('water_bucket');
    const result = useBucket(world, inventory, 'survival', { x: 0, y: 0, z: 0, normal: { x: 0, y: 1, z: 0 } }, () => {}, { dimension });
    assert.ok(result && !result.evaporated, dimension);
    assert.equal(world.getVoxel(0, 1, 0), BLOCKS.WATER, `${dimension}: water placed`);
  }
});

test('lava still pours in the Nether', () => {
  const world = voxels({ '0,0,0': BLOCKS.NETHERRACK ?? BLOCKS.STONE });
  world.isNether = true;
  const inventory = bucketInventory('lava_bucket');
  const result = useBucket(world, inventory, 'survival', { x: 0, y: 0, z: 0, normal: { x: 0, y: 1, z: 0 } }, () => {}, { dimension: 'nether' });
  assert.ok(result && !result.evaporated);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.LAVA);
});
