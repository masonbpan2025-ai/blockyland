// Beacons and conduits, which had no manager at all.
//
// Round 10 made their effect functions correct; this is the piece that calls them. Before it, a beacon was
// a decorative block with a window: `calculateBeaconPyramid` ran when the panel opened,
// `calculateConduitFrame` never ran, and a chosen power was reset to null when the panel closed. Nothing
// remembered where a structure was or what it had been given.
//
// The manager follows `FarmingManager`: register on placement, unregister on break, and re-derive the
// structure on a timer rather than caching it, because a pyramid or a frame can be dismantled without the
// beacon or conduit itself being touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { Inventory } from '../src/inventory.js';
import { Player } from '../src/player.js';
import { BeaconManager, BEACON_TICK_SECONDS } from '../src/beaconManager.js';

/** A real world with a real beacon pyramid at (10, 20, 10) and a clear sky above it. */
function worldWithBeacon({ tier = 1 } = {}) {
  const world = new World(101);
  world.reseed(101);
  const bx = 10, by = 20, bz = 10;
  world.setVoxel(bx, by, bz, BLOCKS.BEACON);
  for (let y = by + 1; y < 64; y++) world.setVoxel(bx, y, bz, BLOCKS.AIR);
  // A tier 1 pyramid is the 3x3 layer under the beacon; add the wider layers for higher tiers.
  for (let l = 1; l <= tier; l++) {
    for (let x = bx - l; x <= bx + l; x++) {
      for (let z = bz - l; z <= bz + l; z++) world.setVoxel(x, by - l, z, BLOCKS.IRON_BLOCK);
    }
  }
  return { world, bx, by, bz };
}

function playerAt(x, y, z, { inWater = false } = {}) {
  const camera = new THREE.PerspectiveCamera();
  const sounds = { playHurt: () => {}, playStep: () => {}, playShieldBlock: () => {} };
  const p = new Player(camera, { requestPointerLock: () => {} }, { getVoxel: () => BLOCKS.AIR, setVoxel: () => {}, redstone: { interact: () => null } }, sounds);
  p.inventory = new Inventory(sounds);
  p.position.set(x, y, z);
  p.inWater = inWater;
  return p;
}

/** A manager whose game stands in for the real one, with the world and player it needs. */
function managerFor(world, player, mobs = []) {
  const game = { world, player, mobs: { mobs } };
  return { manager: new BeaconManager(game), game };
}

// --- registration -------------------------------------------------------------

test('placing a beacon or conduit is what registers it', () => {
  const { world } = worldWithBeacon();
  const { manager } = managerFor(world, playerAt(0, 0, 0));
  assert.equal(manager.onBlockPlaced(10, 20, 10, BLOCKS.BEACON), true);
  assert.equal(manager.beacons.size, 1);
  assert.equal(manager.onBlockPlaced(30, 15, 30, BLOCKS.CONDUIT), true);
  assert.equal(manager.conduits.size, 1);
  assert.equal(manager.onBlockPlaced(1, 2, 3, BLOCKS.STONE), false, 'an ordinary block is not tracked');
  assert.equal(manager.beacons.size, 1);
  // A beacon is remembered without a power, because one has to be chosen and paid for.
  const power = manager.powerAt(10, 20, 10);
  assert.equal(power.primary, null);
  assert.equal(manager.isActiveBeacon(10, 20, 10), false);
});

test('breaking a beacon or conduit stops it being tracked', () => {
  const { world } = worldWithBeacon();
  const { manager } = managerFor(world, playerAt(0, 0, 0));
  manager.onBlockPlaced(10, 20, 10, BLOCKS.BEACON);
  manager.onBlockPlaced(30, 15, 30, BLOCKS.CONDUIT);
  assert.equal(manager.onBlockBroken(10, 20, 10), true);
  assert.equal(manager.beacons.size, 0);
  assert.equal(manager.onBlockBroken(30, 15, 30), true);
  assert.equal(manager.conduits.size, 0);
  assert.equal(manager.onBlockBroken(99, 99, 99), false, 'breaking something untracked is not a hit');
});

// --- a beacon ----------------------------------------------------------------

test('a beacon grants nothing until a power is chosen', () => {
  const { world, bx, by, bz } = worldWithBeacon();
  const player = playerAt(bx + 3, by, bz + 3);
  const { manager } = managerFor(world, player);
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.statusEffects.size, 0, 'no power chosen, nothing granted');

  manager.setPower(bx, by, bz, { primary: 'speed' });
  assert.equal(manager.isActiveBeacon(bx, by, bz), true);
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.hasStatusEffect('speed'), true, 'and now it works');
  assert.equal(player.statusEffects.get('speed').level, 1, 'a tier 1 pyramid grants level I');
});

test('the power reaches the player only from within range', () => {
  const { world, bx, by, bz } = worldWithBeacon();
  const far = playerAt(bx + 500, by, bz + 500);
  const { manager } = managerFor(world, far);
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.setPower(bx, by, bz, { primary: 'haste' });
  manager.update(BEACON_TICK_SECONDS, far);
  assert.equal(far.hasStatusEffect('haste'), false, 'a tier 1 range is 20 blocks');
});

test('dismantling the pyramid stops the power, even though the beacon is still there', () => {
  // The reason the structure is re-derived instead of cached: the beacon block is untouched and the power
  // should still stop.
  const { world, bx, by, bz } = worldWithBeacon({ tier: 2 });
  const player = playerAt(bx + 3, by, bz + 3);
  const { manager } = managerFor(world, player);
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.setPower(bx, by, bz, { primary: 'resistance' });
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.hasStatusEffect('resistance'), true);

  // Remove the whole base.
  for (let x = bx - 2; x <= bx + 2; x++) {
    for (let z = bz - 2; z <= bz + 2; z++) {
      for (let l = 1; l <= 2; l++) world.setVoxel(x, by - l, z, BLOCKS.AIR);
    }
  }
  player.clearStatusEffect('resistance');
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.hasStatusEffect('resistance'), false, 'the pyramid is gone, so the power is too');
});

test('a broken beacon stops granting, and a rebuilt one starts again', () => {
  const { world, bx, by, bz } = worldWithBeacon();
  const player = playerAt(bx + 3, by, bz + 3);
  const { manager } = managerFor(world, player);
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.setPower(bx, by, bz, { primary: 'strength' });
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.hasStatusEffect('strength'), true);

  manager.onBlockBroken(bx, by, bz);
  player.clearStatusEffect('strength');
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.hasStatusEffect('strength'), false);

  // Rebuilt: tracked again, but with no power, so it grants nothing until one is chosen.
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.setPower(bx, by, bz, { primary: 'strength' });
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.hasStatusEffect('strength'), true);
});

test('the panel can read back what a beacon was given', () => {
  const { world, bx, by, bz } = worldWithBeacon({ tier: 4 });
  const { manager } = managerFor(world, playerAt(0, 0, 0));
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.setPower(bx, by, bz, { primary: 'speed', secondary: 'regeneration' });
  assert.deepEqual(manager.powerAt(bx, by, bz), { primary: 'speed', secondary: 'regeneration' });
  assert.equal(manager.powerAt(1, 2, 3), null, 'a position that is not a beacon has no power');
  // Setting a power on something never registered is refused rather than inventing a beacon.
  assert.equal(manager.setPower(1, 2, 3, { primary: 'speed' }), null);
});

test('a full four-tier pyramid grants its primary at level II', () => {
  const { world, bx, by, bz } = worldWithBeacon({ tier: 4 });
  const player = playerAt(bx + 3, by, bz + 3);
  const { manager } = managerFor(world, player);
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.setPower(bx, by, bz, { primary: 'speed', secondary: 'regeneration' });
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.statusEffects.get('speed').level, 2);
  assert.equal(player.hasStatusEffect('regeneration'), true, 'and the secondary comes with it');
});

// --- a conduit ---------------------------------------------------------------

test('a conduit grants Conduit Power to an underwater player inside a finished frame', () => {
  const world = new World(202);
  world.reseed(202);
  const cx = 30, cy = 15, cz = 30;
  world.setVoxel(cx, cy, cz, BLOCKS.CONDUIT);
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let y = cy - 2; y <= cy + 2; y++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === 2) world.setVoxel(x, y, cz, BLOCKS.PRISMARINE);
    }
  }
  const swimmer = playerAt(cx + 4, cy, cz + 4, { inWater: true });
  const { manager } = managerFor(world, swimmer);
  manager.onBlockPlaced(cx, cy, cz, BLOCKS.CONDUIT);
  manager.update(BEACON_TICK_SECONDS, swimmer);
  assert.equal(swimmer.hasStatusEffect('conduit_power'), true);
  assert.equal(swimmer.hasStatusEffect('haste'), true, 'and the haste it carries');

  // A player on dry land gets nothing from the same conduit.
  const dry = playerAt(cx + 4, cy, cz + 4, { inWater: false });
  manager.game.player = dry;
  manager.update(BEACON_TICK_SECONDS, dry);
  assert.equal(dry.hasStatusEffect('conduit_power'), false);

  // And breaking the conduit stops it.
  const again = playerAt(cx + 4, cy, cz + 4, { inWater: true });
  manager.onBlockBroken(cx, cy, cz);
  manager.update(BEACON_TICK_SECONDS, again);
  assert.equal(again.hasStatusEffect('conduit_power'), false);
});

// --- cadence -----------------------------------------------------------------

test('the structures are re-checked on a timer, not every frame', () => {
  const { world, bx, by, bz } = worldWithBeacon();
  const player = playerAt(bx + 3, by, bz + 3);
  const { manager } = managerFor(world, player);
  manager.onBlockPlaced(bx, by, bz, BLOCKS.BEACON);
  manager.setPower(bx, by, bz, { primary: 'speed' });
  // A frame's worth of time is not enough for the first check: the effects carry a 16 s buffer, so this
  // runs once a second rather than once a frame.
  manager.update(1 / 60, player);
  assert.equal(player.hasStatusEffect('speed'), false);
  manager.update(BEACON_TICK_SECONDS, player);
  assert.equal(player.hasStatusEffect('speed'), true);
  assert.ok(BEACON_TICK_SECONDS <= 16, 'and comfortably inside the effect buffer');
});
