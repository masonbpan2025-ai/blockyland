// A mini-game's watcher (the SkyWars and Bed Wars Spectate toggle, or a player out of the game) moves as a Creative
// player does: flying to start with, a double tap of Space to stop flying and fall, another to fly again, Space held to
// rise, Shift held to sink, and blocks are solid to it. Plain spectator mode (`/gamemode spectator`) keeps Minecraft's:
// always flying, through blocks. Creative's own double tap is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { Player } from '../src/player.js';

/** A player over a stone floor at y 30 (its top at y 31). */
function playerOverFloor() {
  const world = { getVoxel: (x, y, z) => (y === 30 && Math.abs(x) < 20 && Math.abs(z) < 20 ? BLOCKS.STONE : BLOCKS.AIR), chunks: new Map() };
  const sounds = new Proxy({}, { get: () => () => {} });
  const camera = new THREE.PerspectiveCamera();
  const player = new Player(camera, null, world, sounds);
  player.position.set(0.5, 36, 0.5);
  return player;
}
const run = (player, seconds, keys = {}) => { player.keys = { ...keys }; for (let t = 0; t < seconds; t += 0.05) player.update(0.05); };
const doubleTap = (player, at) => { player.spacePressed(at); return player.spacePressed(at + 150); };

test('Creative: a double tap of Space switches flight; a slow pair, or a single press, does not', () => {
  const p = playerOverFloor();
  p.setGameMode('creative');
  assert.equal(doubleTap(p, 1000), true);
  assert.equal(p.isFlying, true);
  p.spacePressed(5000); assert.equal(p.spacePressed(5400), false, '400 ms apart is two presses, not a double tap');
  assert.equal(p.isFlying, true);
  assert.equal(doubleTap(p, 9000), true);
  assert.equal(p.isFlying, false);
});

test('a plain spectator always flies, through blocks: a double tap changes nothing', () => {
  const p = playerOverFloor();
  p.setGameMode('spectator');
  assert.equal(p.isFlying, true);
  assert.equal(doubleTap(p, 1000), false);
  assert.equal(p.isFlying, true);
  run(p, 1.5, { ShiftLeft: true });
  assert.ok(p.position.y < 31, `sinks through the stone floor (y ${p.position.y.toFixed(2)})`);
});

test('a mini-game watcher moves as Creative: tap twice to fall and land on the floor, twice again to fly, Space to rise, Shift to sink', () => {
  const p = playerOverFloor();
  p.setGameMode('spectator');
  p.creativeFlight = true;
  p.isFlying = true;
  // Flying, it hangs in the air.
  run(p, 1);
  assert.ok(Math.abs(p.position.y - 36) < 0.2, `hovers (y ${p.position.y.toFixed(2)})`);
  // Space held: up. Shift held: down.
  run(p, 1, { Space: true });
  const high = p.position.y;
  assert.ok(high > 37, `rises with Space held (y ${high.toFixed(2)})`);
  run(p, 0.5, { ShiftLeft: true });
  assert.ok(p.position.y < high - 0.5, 'sinks with Shift held');
  // A double tap: no longer flying, it falls -- and the stone floor stops it, as it would a Creative player.
  assert.equal(doubleTap(p, 1000), true);
  assert.equal(p.isFlying, false);
  run(p, 3);
  assert.ok(Math.abs(p.position.y - 31) < 0.05, `lands on the floor (y ${p.position.y.toFixed(2)})`);
  assert.equal(p.onGround, true);
  // And again: flying.
  assert.equal(doubleTap(p, 5000), true);
  assert.equal(p.isFlying, true);
  run(p, 1, { Space: true });
  assert.ok(p.position.y > 32, 'up off the floor');
  // Still a spectator: it cannot break, place or be hurt.
  p.takeDamage(10, null, 'player');
  assert.equal(p.health, 20);
});

test('leaving spectator mode ends the Creative-style movement; entering it plainly does not start it', () => {
  const p = playerOverFloor();
  p.setGameMode('spectator');
  p.creativeFlight = true;
  p.setGameMode('adventure');
  assert.equal(p.creativeFlight, false);
  assert.equal(p.isFlying, false);
  p.setGameMode('spectator');
  assert.equal(p.creativeFlight, false, '/gamemode spectator is the plain one');
});
