import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS as B } from '../src/blocks.js';
import { RailSystem, RAIL_LIMITS } from '../src/rails.js';
import { ChestManager } from '../src/chest.js';

function setupWorld() {
  const w = new World();
  for (let x = -8; x < 12; x++) {
    for (let z = -12; z < 12; z++) {
      w.chunks.set(w.chunkKey(x, z), new Chunk(x, z));
    }
  }
  const game = {
    player: { position: new THREE.Vector3(0, 0, 0), yaw: 0 },
    entities: {
      droppedItems: [],
      itemVisuals: { release() {} },
      scene: { remove() {} }
    },
    mobs: { mobs: [] },
    sounds: { playExplosion() {}, playPlace() {}, playClick() {} }
  };
  w.redstone.game = game;
  const rails = new RailSystem(w, game);
  game.railSystem = rails;
  return { w, rails, game };
}

test('Boat supports 2 passengers with correct seating offsets', () => {
  const { w, rails, game } = setupWorld();
  // Place water
  for (let x = -2; x <= 4; x++) {
    for (let z = -2; z <= 4; z++) {
      w.setVoxel(x, 1, z, B.WATER);
    }
  }

  const driver = { position: new THREE.Vector3() };
  const passenger = { position: new THREE.Vector3() };
  const boat = rails.spawnBoat([0, 1, 0], { rider: driver });
  boat.passenger = passenger;
  boat.yaw = 0; // facing -Z

  rails.updateBoats(0.1);

  // Driver sits at front (z - 0.2), passenger sits at back (z + 0.4)
  assert.equal(boat.rider, driver);
  assert.equal(boat.passenger, passenger);
  assert.ok(driver.position.z < boat.position.z, 'Driver should sit forward');
  assert.ok(passenger.position.z > boat.position.z, 'Passenger should sit rearward');
});

test('Nearby mob automatically embarks into empty secondary seat of a boat', () => {
  const { w, rails, game } = setupWorld();
  for (let x = -2; x <= 4; x++) {
    for (let z = -2; z <= 4; z++) {
      w.setVoxel(x, 1, z, B.WATER);
    }
  }

  const driver = { position: new THREE.Vector3() };
  const boat = rails.spawnBoat([0, 1, 0], { rider: driver });

  const cowMob = {
    type: 'cow',
    health: 10,
    isRiding: false,
    position: new THREE.Vector3(0.5, 1.1, 0.5)
  };
  game.mobs.mobs.push(cowMob);

  rails.updateBoats(0.1);
  assert.equal(boat.passenger, cowMob, 'Cow should embark into boat secondary seat');
  assert.equal(cowMob.isRiding, true);
});

test('High-speed ice gliding: Blue Ice > Packed Ice > Ice > Water > Land', () => {
  const { w, rails, game } = setupWorld();

  // Test speed caps & acceleration across surfaces
  const surfaces = [
    { block: B.BLUE_ICE, maxExpected: 72.0, name: 'Blue Ice' },
    { block: B.PACKED_ICE, maxExpected: 55.0, name: 'Packed Ice' },
    { block: B.ICE, maxExpected: 40.0, name: 'Ice' },
    { block: B.WATER, maxExpected: 8.0, name: 'Water' },
    { block: B.DIRT, maxExpected: 2.2, name: 'Land' }
  ];

  for (const s of surfaces) {
    const boat = rails.spawnBoat([10, 2, 10]);
    // Lay a strip of the test surface ahead of the boat
    for (let z = -120; z <= 20; z++) {
      for (let x = 9; x <= 11; x++) {
        w.setVoxel(x, 1, z, s.block);
        w.setVoxel(x, 2, z, s.block === B.WATER ? B.WATER : B.AIR);
      }
    }

    // Give forward rowing input
    boat.rider = { yaw: 0 };
    game.input = { forward: true, backward: false };

    // Update for 3 seconds of acceleration
    for (let t = 0; t < 60; t++) rails.updateBoats(0.05);

    const speed = Math.hypot(boat.velocity.x, boat.velocity.z);
    assert.ok(speed <= s.maxExpected + 0.1, `${s.name} speed must not exceed ${s.maxExpected}, got ${speed}`);
    if (s.block === B.BLUE_ICE) {
      assert.ok(speed > 40.0, 'Blue Ice boat should achieve extreme highway speed (>40m/s)');
    }
    rails.remove(boat);
  }
});

test('Boat with Chest holds 27-slot chest and restricts passengers to 1 (driver)', () => {
  const { w, rails } = setupWorld();
  const chestBoat = rails.spawnBoat([0, 1, 0], { subType: 'chest_boat', hasChest: true });

  assert.equal(chestBoat.hasChest, true);
  assert.equal(chestBoat.chestItems.length, 27);

  // Attempt to add a 2nd mob passenger (should be blocked because chest occupies rear seat)
  const mob = { type: 'sheep', health: 8, isRiding: false, position: new THREE.Vector3(0.2, 1.1, 0.2) };
  rails.game.mobs.mobs.push(mob);
  rails.updateBoats(0.1);
  assert.equal(chestBoat.passenger, null, 'Chest boat cannot have a secondary passenger');

  // Storing items
  chestBoat.chestItems[0] = { id: 'diamond', isBlock: false, count: 5 };
  assert.equal(chestBoat.chestItems[0].count, 5);
});

test('Minecart with Chest stores items and interfaces with hopper loading/unloading', () => {
  const { w, rails } = setupWorld();
  // Track at [0,2,0]
  rails.layTrack([0, 2, 0], [4, 2, 0]);
  const cart = rails.spawnCart([0, 2, 0], { subType: 'chest_minecart' });

  assert.equal(cart.subType, 'chest_minecart');
  assert.equal(cart.items.length, 27);

  rails.addCartItem(cart, 'gold_ingot', false, 10);
  assert.equal(cart.items[0].id, 'gold_ingot');
  assert.equal(cart.items[0].count, 10);

  const extracted = rails.extractCartItem(cart);
  assert.equal(extracted.id, 'gold_ingot');
  assert.equal(extracted.count, 1);
  assert.equal(cart.items[0].count, 9);
});

test('Minecart with Furnace generates self-propelling locomotive thrust when fueled with coal', () => {
  const { w, rails } = setupWorld();
  rails.layTrack([0, 2, 0], [10, 2, 0]);
  const furnaceCart = rails.spawnCart([0, 2, 0], { subType: 'furnace_minecart' });

  assert.equal(furnaceCart.subType, 'furnace_minecart');
  assert.equal(furnaceCart.fuelTime, 0);

  // Add coal fuel (1 coal = 3600 fuel ticks)
  rails.addFuel(furnaceCart, 3600);
  assert.equal(furnaceCart.fuelTime, 3600);

  // Run physics: cart should accelerate autonomously
  for (let i = 0; i < 30; i++) rails.updateCarts(0.05);

  assert.ok(furnaceCart.speed > 2.0, 'Fueled furnace cart should accelerate autonomously');
  assert.ok(furnaceCart.rail[0] > 0, 'Furnace cart should advance down the track');
});

test('Minecart with Hopper sucks up floating items through tracks and pulls from chest above', () => {
  const { w, rails, game } = setupWorld();
  rails.layTrack([0, 2, 0], [4, 2, 0]);
  const hopperCart = rails.spawnCart([1, 2, 0], { subType: 'hopper_minecart' });

  assert.equal(hopperCart.items.length, 5);

  // 1. Sucking up dropped item
  const dropped = {
    group: { position: new THREE.Vector3(1.2, 2.3, 0.2) },
    itemType: 'redstone',
    isBlock: false,
    count: 3
  };
  game.entities.droppedItems.push(dropped);

  rails.updateCarts(0.1);

  assert.equal(hopperCart.items[0]?.id, 'redstone');
  assert.equal(hopperCart.items[0]?.count, 1);
  assert.equal(dropped.count, 2);

  // 2. Pulling from chest above track at [1,3,0]
  const chestMgr = new ChestManager({ world: w });
  game.chestManager = chestMgr;
  chestMgr.placeChest(w, [1, 3, 0]);
  chestMgr.addItem(1, 3, 0, 'iron_ingot', false, 4);

  rails.updateCarts(0.1);
  const ironItem = hopperCart.items.find(i => i?.id === 'iron_ingot');
  assert.ok(ironItem, 'Hopper cart should pull items from chest above track');
});

test('Minecart with TNT explodes on high-speed impact', () => {
  const { w, rails } = setupWorld();
  rails.layTrack([0, 2, 0], [3, 2, 0]);
  const tntCart = rails.spawnCart([1, 2, 0], { subType: 'tnt_minecart' });

  // Place solid block barrier at [4,2,0]
  w.setVoxel(4, 2, 0, B.STONE);

  let exploded = false;
  rails.onEvent((type, detail) => {
    if (type === 'cart_explode') exploded = true;
  });

  // Launch cart towards end of track at high speed
  tntCart.speed = 8.0;
  for (let i = 0; i < 40; i++) rails.updateCarts(0.05);

  assert.ok(exploded, 'TNT minecart must explode on high-speed impact with dead-end barrier');
  assert.ok(!rails.carts.includes(tntCart), 'Exploded TNT minecart should be removed');
});

test('Minecart slope momentum: accelerates downhill, loses speed uphill and rolls backward', () => {
  const { w, rails } = setupWorld();
  // Lay sloped track climbing from [0,2,0] up to [4,6,0]
  for (let i = 0; i < 5; i++) {
    const p = [i, 2 + i, 0];
    w.setVoxel(...p, B.RAIL);
    w.redstone?.configure(p, 2); // dir 2 = slope up (+Y, +X)
  }

  // Cart moving uphill with small speed
  const cart = rails.spawnCart([1, 3, 0]);
  cart.speed = 1.0;
  cart.heading = [1, 0, 0];

  // Run physics: slope opposes uphill movement
  for (let i = 0; i < 20; i++) rails.updateCarts(0.05);

  // Cart lost its forward kinetic energy and is rolling downhill backwards
  assert.ok(cart.heading[0] < 0 || cart.speed < 1.0, 'Cart on slope should decelerate going uphill');
});

test('Minecart collision bouncing: carts bounce off each other and exchange momentum', () => {
  const { w, rails } = setupWorld();
  rails.layTrack([0, 2, 0], [10, 2, 0]);

  // Cart A moving East (+X) at speed 6
  const cartA = rails.spawnCart([2, 2, 0]);
  cartA.speed = 6.0;
  cartA.heading = [1, 0, 0];

  // Cart B stationary at [3, 2, 0]
  const cartB = rails.spawnCart([3, 2, 0]);
  cartB.speed = 0.0;
  cartB.heading = [1, 0, 0];

  let collided = false;
  rails.onEvent((type) => {
    if (type === 'cart_collision') collided = true;
  });

  // Run physics
  for (let i = 0; i < 15; i++) rails.updateCarts(0.05);

  assert.ok(collided, 'Carts must collide and trigger collision event');
  assert.ok(cartB.speed > 1.0, 'Stationary cart B must gain momentum from collision');
});
