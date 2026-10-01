// The redstone mini-games must actually run, not merely be placed.
//
// Each test builds the machine, then operates it the way a player would and checks
// the world changed for the right reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS as B } from '../src/blocks.js';
import { RailSystem } from '../src/rails.js';
import {
  buildRedstoneGame,
  buildVaultDoor,
  buildFloorTrap,
  buildLampPuzzle,
  buildRailStation,
  buildTntTrap,
  listRedstoneGames,
  REDSTONE_GAMES
} from '../src/redstoneGames.js';

function setup() {
  const world = new World();
  for (let x = -4; x < 8; x++) for (let z = -4; z < 8; z++) world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
  const game = { player: { position: new THREE.Vector3() } };
  world.redstone.game = game;
  const rails = new RailSystem(world, game);
  return { world, rails, game };
}

const tick = (world, n = 6, actors = []) => { for (let i = 0; i < n; i++) world.redstone.tick(actors); };
const at = (world, p) => world.getVoxel(p[0], p[1], p[2]);

// --- the catalogue ----------------------------------------------------------

test('every advertised game can be built', () => {
  const listed = listRedstoneGames();
  assert.ok(listed.length >= 4, 'there should be several games');
  for (const entry of listed) {
    assert.ok(REDSTONE_GAMES[entry.key], `${entry.key} must have a builder`);
    assert.ok(entry.name && entry.blurb, `${entry.key} needs a name and blurb`);
  }
  const { world } = setup();
  for (const entry of listed) {
    const built = buildRedstoneGame(world, entry.key, [0, 20, 0]);
    assert.ok(built.cells.length > 0, `${entry.key} should place blocks`);
    assert.ok(built.probe, `${entry.key} should explain how to run it`);
  }
});

test('an unknown game name explains what is available', () => {
  const { world } = setup();
  assert.throws(() => buildRedstoneGame(world, 'nonsense', [0, 20, 0]), /Unknown redstone game/);
  assert.throws(() => buildRedstoneGame(world, 'nonsense', [0, 20, 0]), /vault/);
});

// --- game 1: piston vault door ---------------------------------------------

test('the vault door is sealed, then opens when the lever is pulled', () => {
  const { world } = setup();
  const game = buildVaultDoor(world, [4, 20, 4]);
  tick(world);

  // Shut: the plugs sit in the doorway and the pistons are retracted.
  assert.equal(at(world, game.plugs[0]), B.OAK_PLANKS, 'the left plug blocks the door');
  assert.equal(at(world, game.plugs[1]), B.OAK_PLANKS, 'and the right plug too');
  assert.equal(world.redstone.state(game.pistons[0]).extended, false, 'pistons start retracted');

  // The lever powers both pistons.
  world.redstone.interact(game.lever);
  tick(world, 8);
  for (const piston of game.pistons) {
    assert.equal(world.redstone.state(piston).extended, true, 'both pistons extend');
  }
  // Extended pistons push their plugs out of the way, clearing the opening.
  assert.ok(at(world, game.plugs[0]) === B.PISTON_HEAD || at(world, game.plugs[0]) === B.AIR,
    `the left plug should have moved, found ${at(world, game.plugs[0])}`);
  assert.ok(at(world, game.plugs[1]) === B.PISTON_HEAD || at(world, game.plugs[1]) === B.AIR,
    `the right plug should have moved, found ${at(world, game.plugs[1])}`);

  // And closing it again restores the plugs.
  world.redstone.interact(game.lever);
  tick(world, 8);
  assert.equal(at(world, game.plugs[0]), B.OAK_PLANKS, 'the left plug returns');
  assert.equal(at(world, game.plugs[1]), B.OAK_PLANKS, 'and the right one');
});

// --- game 2: floor trapdoor -------------------------------------------------

test('standing on a pressure plate opens the floor trapdoor', () => {
  const { world } = setup();
  const game = buildFloorTrap(world, [4, 20, 4]);
  tick(world);

  assert.equal(at(world, game.trapdoors[0]), B.OAK_TRAPDOOR, 'the floor starts closed');
  assert.equal(at(world, game.trapdoors[1]), B.OAK_TRAPDOOR);

  // A player standing on the near plate.
  const plate = game.plates[0];
  const actor = { position: new THREE.Vector3(plate[0] + 0.5, plate[1] + 0.05, plate[2] + 0.5), height: 1.8, width: 0.6 };
  tick(world, 4, [actor]);

  assert.equal(at(world, game.trapdoors[0]), B.OAK_TRAPDOOR_OPEN, 'the floor opens');
  assert.equal(at(world, game.trapdoors[1]), B.OAK_TRAPDOOR_OPEN, 'both halves of it');

  // Step off and it closes again.
  tick(world, 4, []);
  assert.equal(at(world, game.trapdoors[0]), B.OAK_TRAPDOOR, 'and closes when you step off');
});

test('the far plate opens the trapdoor as well', () => {
  const { world } = setup();
  const game = buildFloorTrap(world, [4, 20, 4]);
  tick(world);
  const plate = game.plates[1];
  const actor = { position: new THREE.Vector3(plate[0] + 0.5, plate[1] + 0.05, plate[2] + 0.5), height: 1.8, width: 0.6 };
  tick(world, 4, [actor]);
  assert.equal(at(world, game.trapdoors[0]), B.OAK_TRAPDOOR_OPEN, 'the second plate works too');
});

// --- game 3: the lamp puzzle -------------------------------------------------

test('the lamp puzzle lights from either lever and stays stable', () => {
  const { world } = setup();
  const game = buildLampPuzzle(world, [4, 20, 4]);
  tick(world);

  const lampOn = () => world.redstone.state(game.lamp).on;
  assert.equal(lampOn(), false, 'dark with no levers thrown');

  world.redstone.interact(game.levers[0]);
  tick(world, 6);
  assert.equal(lampOn(), true, 'the near lever lights it');

  world.redstone.interact(game.levers[1]);
  tick(world, 6);
  assert.equal(lampOn(), true, 'and the far lever too');

  // Signal strength falls off along the wire, so the far end reads less than 15.
  const nearPower = world.redstone.state(game.rail[0]).power;
  const farPower = world.redstone.state(game.rail[2]).power;
  assert.ok(nearPower > 0 && farPower > 0, 'power reaches the whole rail');
  assert.ok(nearPower >= farPower, `power should not increase along the wire (${nearPower} vs ${farPower})`);

  world.redstone.interact(game.levers[0]);
  world.redstone.interact(game.levers[1]);
  tick(world, 6);
  assert.equal(lampOn(), false, 'and it goes dark when both are released');

  // No flicker: the state must be stable once every lever is off.
  const settled = lampOn();
  tick(world, 40);
  assert.equal(lampOn(), settled, 'the circuit must not oscillate');
});

// --- game 4: the rail station -----------------------------------------------

test('the rail station holds a cart still, then launches it to the buffer stop', () => {
  const { world, rails } = setup();
  const game = buildRailStation(world, [4, 20, 4]);
  tick(world);

  // Unpowered: the cart should not move.
  const cart = rails.spawnCart([game.platform[0], game.platform[1], game.platform[2]]);
  assert.ok(cart.rail, 'the cart sits on the track');
  for (let i = 0; i < 40; i++) { tick(world); rails.updateCarts(0.05); }
  assert.equal(Math.round(cart.rail[0]), game.platform[0], 'the cart stays at the station with no power');

  // Throw the lever: the powered rails launch it.
  world.redstone.interact(game.lever);
  tick(world, 4);
  assert.ok(world.redstone.input(game.rails[0]) > 0, 'the rail under the cart is powered');

  for (let i = 0; i < 120; i++) { tick(world); rails.updateCarts(0.05); }

  const travelled = cart.rail[0] - game.platform[0];
  assert.ok(travelled > 3, `the cart should have run down the line, travelled ${travelled}`);
  assert.ok(cart.rail[0] <= game.platform[0] + 12, 'and stopped at the end of the track');
});

// --- game 5: the TNT trap ---------------------------------------------------

test('the TNT trap fires from the dispenser when the plate is stepped on', () => {
  const { world } = setup();
  const game = buildTntTrap(world, [4, 20, 4]);
  tick(world);

  const state = world.redstone.state(game.dispenser);
  assert.equal(state.inventory.length, 1, 'the dispenser is loaded');
  assert.equal(state.inventory[0].count, 3, 'with three TNT');

  // Count what the dispenser spawns.
  let fired = 0;
  world.redstone.game = {
    player: { position: new THREE.Vector3(), gamemode: 'creative' },
    entities: {
      spawnPrimedTNT() { fired++; },
      spawnDroppedItem() { fired++; }
    },
    mobs: { spawnArrow() { fired++; } }
  };

  const plate = game.plate;
  const actor = { position: new THREE.Vector3(plate[0] + 0.5, plate[1] + 0.05, plate[2] + 0.5), width: 0.6, height: 1.8 };
  tick(world, 6, [actor]);

  assert.ok(fired >= 1, `the trap should fire, fired ${fired}`);
  assert.equal(world.redstone.state(game.dispenser).inventory[0].count, 2, 'and use one TNT');
});

test('a trap with nothing on the plate stays quiet', () => {
  const { world } = setup();
  const game = buildTntTrap(world, [4, 20, 4]);
  tick(world);
  let fired = 0;
  world.redstone.game = { player: { position: new THREE.Vector3() }, entities: { spawnPrimedTNT() { fired++; }, spawnDroppedItem() { fired++; } }, mobs: { spawnArrow() { fired++; } } };
  tick(world, 10, []);
  assert.equal(fired, 0, 'an untouched trap does not fire');
  assert.ok(world.redstone.state(game.dispenser), 'and the dispenser is still there');
});
