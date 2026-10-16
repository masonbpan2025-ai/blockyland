import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS as B } from '../src/blocks.js';
import { RailSystem } from '../src/rails.js';

function setup() {
  const world = new World();
  for (let x = -2; x < 6; x++) for (let z = -2; z < 6; z++) world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
  const rails = new RailSystem(world, { player: { position: new THREE.Vector3() } });
  return { world, rails };
}

const railDir = (world, p, dir) => world.redstone.configure(p, dir);

test('layTrack lays a straight line of rail with the right direction', () => {
  const { world, rails } = setup();
  const cells = rails.layTrack([0, 2, 0], [5, 2, 0]);

  assert.equal(cells.length, 6, 'it covers both ends');
  for (const cell of cells) assert.equal(world.getVoxel(...cell), B.RAIL, 'each cell is rail');
  // Travelling +X is direction 0.
  assert.equal(world.redstone.state([0, 2, 0]).dir, 0, 'direction follows the line');
  assert.equal(world.redstone.state([5, 2, 0]).dir, 0);
});

test('layTrack running the other way records the opposite direction', () => {
  const { world, rails } = setup();
  rails.layTrack([5, 2, 0], [0, 2, 0]);
  assert.equal(world.redstone.state([5, 2, 0]).dir, 1, 'travelling -X is direction 1');
});

test('layTrack can lay powered rail, and every-N spacing', () => {
  const { world, rails } = setup();
  rails.layTrack([0, 2, 0], [4, 2, 0], { every: 2 });
  assert.equal(world.getVoxel(0, 2, 0), B.POWERED_RAIL, 'the first rail is powered');
  assert.equal(world.getVoxel(1, 2, 0), B.RAIL, 'the next is plain');
  assert.equal(world.getVoxel(2, 2, 0), B.POWERED_RAIL, 'and every second one after that');

  const { rails: rails2, world: world2 } = setup();
  rails2.layTrack([0, 2, 0], [3, 2, 0], { powered: true });
  for (let x = 0; x <= 3; x++) assert.equal(world2.getVoxel(x, 2, 0), B.POWERED_RAIL);
});

test('nextRail follows the line and can look ahead', () => {
  const { world, rails } = setup();
  rails.layTrack([0, 2, 0], [5, 2, 0]);

  assert.deepEqual(rails.nextRail([0, 2, 0], null, [1, 0, 0]), [1, 2, 0], 'moves along the track');
  assert.deepEqual(rails.nextRail([2, 2, 0], [1, 2, 0], [1, 0, 0]), [3, 2, 0], 'and keeps going');
  assert.equal(rails.nextRail([5, 2, 0], [4, 2, 0], [1, 0, 0]), null, 'the end of the line is a dead end');
});

test('a cart with no power coasts to a stop', () => {
  const { rails } = setup();
  rails.layTrack([0, 2, 0], [20, 2, 0]);
  const cart = rails.spawnCart([0, 2, 0]);
  rails.boost(cart, 5);

  const startX = cart.position.x;
  for (let i = 0; i < 100; i++) rails.updateCarts(0.05);

  assert.ok(cart.position.x > startX, 'the cart moved along the rail');
  assert.ok(Math.abs(cart.speed) < 0.1, `friction should stop it, speed was ${cart.speed}`);
  assert.equal(cart.rail[1], 2, 'and it stayed on the rail');
});

test('a powered rail launches a cart to full speed', () => {
  const { world, rails } = setup();
  rails.layTrack([0, 2, 0], [10, 2, 0], { powered: true });
  // Power the rails with a redstone block alongside each one. A redstone tick is
  // what turns placements into signal strengths, exactly as the game loop does.
  for (let x = 0; x <= 10; x++) world.setVoxel(x, 2, 1, B.REDSTONE_BLOCK);
  world.redstone.tick([]);

  assert.ok(rails.railIsPowered([0, 2, 0]), 'the powered rail should see the signal');

  const cart = rails.spawnCart([0, 2, 0]);
  for (let i = 0; i < 20; i++) rails.updateCarts(0.05);

  assert.ok(cart.speed > 1, `a powered rail should accelerate the cart, speed was ${cart.speed}`);
  assert.ok(cart.position.x > 0.5, 'and it should have travelled');
});

test('a cart stops at the end of the track instead of running off it', () => {
  const { rails } = setup();
  rails.layTrack([0, 2, 0], [3, 2, 0]);
  const cart = rails.spawnCart([0, 2, 0]);
  rails.boost(cart, 8);

  for (let i = 0; i < 200; i++) rails.updateCarts(0.05);

  assert.equal(cart.rail[0], 3, 'it came to rest on the last rail');
  assert.equal(cart.speed, 0, 'with no speed left');
  assert.ok(cart.atEnd, 'and is flagged as being at the end');
});

test('a cart carries its rider', () => {
  const { rails } = setup();
  rails.layTrack([0, 2, 0], [10, 2, 0]);
  const rider = { position: new THREE.Vector3(0.5, 2.9, 0.5), yaw: 0 };
  const cart = rails.spawnCart([0, 2, 0], { rider });
  rails.boost(cart, 5);

  for (let i = 0; i < 10; i++) rails.updateCarts(0.05);

  assert.ok(Math.abs(rider.position.x - cart.position.x) < 0.01, 'the rider follows the cart in x');
  assert.ok(rider.position.y > cart.position.y, 'and sits above it');
});

test('a cart curves onto a branch when the line turns', () => {
  const { world, rails } = setup();
  // An L: east along z=0, then south along x=4.
  rails.layTrack([0, 2, 0], [4, 2, 0]);
  rails.layTrack([4, 2, 0], [4, 2, 4]);
  const cart = rails.spawnCart([0, 2, 0]);
  rails.boost(cart, 8);

  for (let i = 0; i < 60; i++) rails.updateCarts(0.05);

  assert.equal(cart.rail[2] > 0, true, `the cart should have turned onto the branch, ended at ${cart.rail}`);
  assert.equal(world.getVoxel(...cart.rail), B.RAIL, 'and still be on a rail');
});

// --- boats ------------------------------------------------------------------

test('a boat settles on the water surface and stays there', () => {
  const { world, rails } = setup();
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
    world.setVoxel(x, 1, z, B.STONE);
    world.setVoxel(x, 2, z, B.WATER);
  }
  const boat = rails.spawnBoat([3, 6, 3]); // dropped from above

  for (let i = 0; i < 120; i++) rails.updateBoats(0.05);

  assert.ok(Math.abs(boat.position.y - (2 + 8/9 - 0.13)) < 0.02,
    `the boat should float at the water surface, y was ${boat.position.y}`);
});

test('a boat drifts and slows down from water drag, and is steered by its rider', () => {
  const { world, rails } = setup();
  for (let x = 0; x < 20; x++) for (let z = 0; z < 6; z++) {
    world.setVoxel(x, 1, z, B.STONE);
    world.setVoxel(x, 2, z, B.WATER);
  }
  const rider = { position: new THREE.Vector3(2.5, 2.5, 2.5), yaw: 0 };
  const boat = rails.spawnBoat([2, 2, 2], { rider });
  boat.velocity.set(3, 0, 0);

  const startX = boat.position.x;
  for (let i = 0; i < 30; i++) rails.updateBoats(0.05);
  assert.ok(boat.position.x > startX, 'the boat drifts forwards');

  // With the rider rowing, it should be able to hold speed against the drag.
  rails.game.input = { forward: true, backward: false };
  const before = boat.velocity.length();
  for (let i = 0; i < 10; i++) rails.updateBoats(0.05);
  assert.ok(boat.velocity.length() > 0, 'and rowing keeps it moving');
  assert.ok(Number.isFinite(before));
});

test('a boat is stopped by a solid wall', () => {
  const { world, rails } = setup();
  for (let x = 0; x < 10; x++) for (let z = 0; z < 4; z++) {
    world.setVoxel(x, 1, z, B.STONE);
    world.setVoxel(x, 2, z, B.WATER);
  }
  world.setVoxel(6, 2, 2, B.STONE); // a wall across the channel
  const boat = rails.spawnBoat([2, 2, 2]);
  boat.velocity.set(4, 0, 0);

  for (let i = 0; i < 60; i++) rails.updateBoats(0.05);

  assert.ok(boat.position.x < 6.5, `the boat should not pass the wall, x was ${boat.position.x}`);
});

test('nearestVehicle finds what you are standing next to', () => {
  const { rails } = setup();
  rails.layTrack([0, 2, 0], [5, 2, 0]);
  const cart = rails.spawnCart([3, 2, 0]);
  assert.equal(rails.nearestVehicle(new THREE.Vector3(3.5, 2.5, 0.5)), cart);
  assert.equal(rails.nearestVehicle(new THREE.Vector3(30, 2, 30)), null);
});

test('remove takes a cart out of the world', () => {
  const { rails } = setup();
  rails.layTrack([0, 2, 0], [5, 2, 0]);
  const cart = rails.spawnCart([0, 2, 0]);
  assert.equal(rails.carts.length, 1);
  rails.remove(cart);
  assert.equal(rails.carts.length, 0);
});

// Tutorial:Minecarts: "Minecarts move at 8 m/s at top speed on a straight track"; "A minecart with a player inside travels
// 309m from full speed, staying at full speed for 176m"; Tutorial:Furnace minecarts: "their 4 m/s velocity".
test('a ridden minecart coasts about 309 m from full speed, 176 m of it at 8 blocks/s', () => {
  const world = new World();
  for (let x = -2; x < 24; x++) for (let z = -1; z < 1; z++) world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
  const rails = new RailSystem(world, { player: { position: new THREE.Vector3() } });
  rails.layTrack([0, 2, 0], [370, 2, 0]);
  const cart = rails.spawnCart([0, 2, 0], { rider: { position: new THREE.Vector3() } });
  cart.speed = 30; cart.heading = [1, 0, 0];
  let fullUntil = null, peak = 0;
  for (let i = 0; i < 20 * 300; i++) {
    rails.updateCarts(1 / 20);
    const x = cart.rail[0] + (cart.progress || 0);
    if (fullUntil === null && Math.abs(cart.speed) < 8) fullUntil = x;
    if (i < 40) peak = Math.max(peak, x / ((i + 1) / 20));
    if (cart.speed === 0) break;
  }
  const total = cart.rail[0];
  assert.ok(Math.abs(fullUntil - 176) < 12, `full speed for ${fullUntil} m`);
  assert.ok(Math.abs(total - 309) < 15, `coasted ${total} m`);
  assert.ok(peak <= 8.01, `never faster than 8 blocks/s (${peak})`);
});

test('an empty minecart slows far sooner; a fuelled furnace minecart runs at 4 blocks/s', () => {
  const world = new World();
  for (let x = -2; x < 8; x++) for (let z = -1; z < 1; z++) world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
  const rails = new RailSystem(world, { player: { position: new THREE.Vector3() } });
  rails.layTrack([0, 2, 0], [100, 2, 0]);
  const empty = rails.spawnCart([0, 2, 0]); empty.speed = 8; empty.heading = [1, 0, 0];
  for (let i = 0; i < 20 * 30 && empty.speed; i++) rails.updateCarts(1 / 20);
  assert.ok(empty.rail[0] < 12, `an empty cart from 8 blocks/s stops within ~10 blocks (${empty.rail[0]})`);
  rails.remove(empty);
  const furnace = rails.spawnCart([0, 2, 0], { subType: 'furnace_minecart' }); furnace.fuelTime = 3600; furnace.heading = [1, 0, 0];
  for (let i = 0; i < 20 * 3; i++) rails.updateCarts(1 / 20);
  const x0 = furnace.rail[0] + furnace.progress;
  for (let i = 0; i < 20 * 5; i++) rails.updateCarts(1 / 20);
  const rate = (furnace.rail[0] + furnace.progress - x0) / 5;
  assert.ok(Math.abs(rate - 4) < 0.3, `furnace minecart ${rate} blocks/s`);
});

test('"A minecart with a player inside goes from stationary to full speed after about 13m of powered rail"', () => {
  const world = new World();
  for (let x = -2; x < 6; x++) for (let z = -1; z < 1; z++) world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
  const rails = new RailSystem(world, { player: { position: new THREE.Vector3() } });
  rails.layTrack([0, 2, 0], [60, 2, 0], { every: 1 });
  rails.railIsPowered = () => true;
  const cart = rails.spawnCart([0, 2, 0], { rider: { position: new THREE.Vector3() } });
  cart.speed = 0.5; cart.heading = [1, 0, 0];
  let at = null;
  for (let i = 0; i < 400 && at === null; i++) { rails.updateCarts(1 / 20); if (cart.speed >= 29.9) at = cart.rail[0] + cart.progress; }
  assert.ok(at !== null && Math.abs(at - 13) < 1.5, `full momentum after ${at} m`);
});
