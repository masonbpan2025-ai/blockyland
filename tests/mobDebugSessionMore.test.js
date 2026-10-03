// The mob debug session is the harness the whole inspector and Studio view-mode build on,
// so its contract is pinned here: what it spawns, what it ticks, what it reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMobDebugSession, createDebugWorld, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { BLOCKS } from '../src/blocks.js';

const session = () => createMobDebugSession(new THREE.Scene(), () => {});

test('the debug world is a flat, self-contained arena needing no chunks or generator', () => {
  const world = createDebugWorld();
  // Below y=0 is stone; the working layers are air so mobs stand on a clean floor.
  assert.equal(world.getVoxel(0, -1, 0), BLOCKS.STONE, 'solid below the floor');
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.AIR, 'air where mobs stand');
  assert.equal(world.getHeightAt(), 0);
  assert.equal(world.getBiome(), 'nether');
  // Editing is local, and reset clears it.
  world.setVoxel(1, 1, 1, BLOCKS.STONE);
  assert.equal(world.getVoxel(1, 1, 1), BLOCKS.STONE);
  world.reset();
  assert.equal(world.getVoxel(1, 1, 1), BLOCKS.AIR, 'reset clears edits');
});

test('the debug world can be flooded to exercise water and lava behaviour', () => {
  const world = createDebugWorld();
  world.fluid = BLOCKS.WATER;
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.WATER, 'the fluid layer follows the setting');
  world.fluid = BLOCKS.LAVA;
  assert.equal(world.getVoxel(0, 2, 0), BLOCKS.LAVA);
});

test('the advertised debug mob list is non-empty and unique', () => {
  assert.ok(DEBUG_MOBS.length > 20, `expected a broad mob list, got ${DEBUG_MOBS.length}`);
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate entries');
  for (const id of DEBUG_MOBS) {
    assert.equal(id, id.trim());
    assert.equal(id, id.toLowerCase(), 'ids are lowercase snake_case like the game uses');
  }
});

test('every advertised mob can be spawned and then ticked without throwing', () => {
  const s = session();
  for (const type of DEBUG_MOBS) {
    let mob;
    assert.doesNotThrow(() => { mob = s.reset(type); }, `spawning ${type} should not throw`);
    assert.ok(mob, `${type} should spawn an instance`);
    assert.ok(mob.mesh, `${type} should have a mesh`);
    assert.doesNotThrow(() => { for (let i = 0; i < 20; i++) s.tick(1 / 30); }, `ticking ${type} should not throw`);
  }
});

test('reset replaces the previous mob rather than accumulating them', () => {
  const s = session();
  s.reset('cow');
  assert.equal(s.manager.mobs.length, 1);
  s.reset('pig');
  assert.equal(s.manager.mobs.length, 1, 'the old mob is cleared, not stacked');
  assert.equal(s.mob.type, 'pig', 'and the new one is the active mob');
});

test('reset clears the state that scenarios depend on', () => {
  const s = session();
  s.reset('cow');
  s.inventory.active = { id: 'wheat', count: 5 };
  s.inventory.storage.push({ id: 'dirt', count: 1 });
  s.player.health = 12;
  s.player.gamemode = 'creative';
  s.world.fluid = BLOCKS.WATER;
  s.tick(1 / 30);

  s.reset('cow');
  assert.equal(s.inventory.active, null, 'held item cleared');
  assert.equal(s.inventory.storage.length, 0, 'inventory cleared');
  assert.equal(s.player.health, 100, 'player healed');
  assert.equal(s.player.gamemode, 'spectator', 'player starts neutral so mobs ignore it');
  assert.equal(s.world.fluid, BLOCKS.AIR, 'fluid reset');
  assert.equal(s.time, 0, 'clock reset');
});

test('tick advances the clock and clamps the step so a long frame cannot warp', () => {
  const s = session();
  s.reset('cow');
  s.tick(0.1);
  assert.ok(Math.abs(s.time - 0.1) < 1e-9);
  s.tick(5); // a huge frame
  assert.ok(Math.abs(s.time - 0.2) < 1e-9, 'the step is clamped to 0.1s');
  s.tick(-3); // a bogus frame
  assert.ok(Math.abs(s.time - 0.2) < 1e-9, 'negative steps are ignored');
});

test('snapshot reports the observable state an inspector shows', () => {
  const s = session();
  s.reset('blaze');
  s.tick(1 / 30);
  const snap = s.snapshot();
  assert.equal(snap.type, 'blaze');
  assert.equal(typeof snap.time, 'number');
  assert.equal(typeof snap.health, 'number');
  assert.equal(typeof snap.maxHealth, 'number');
  assert.ok(Array.isArray(snap.position) && snap.position.length === 3, 'position is a 3-tuple');
  assert.ok(Array.isArray(snap.velocity) && snap.velocity.length === 3, 'velocity is a 3-tuple');
  assert.equal(typeof snap.liveMobs, 'number');
  assert.equal(snap.liveMobs, 1);
  assert.equal(typeof snap.targetHealth, 'number');
});

test('hit damages the active mob through the normal damage path', () => {
  const s = session();
  s.reset('cow');
  const before = s.mob.health;
  s.hit(3);
  assert.equal(s.mob.health, before - 3, 'damage is applied');
  assert.ok(s.mob.hurtTime > 0, 'and the hit registers visually');
});

test('hit is safe when nothing is spawned', () => {
  const s = session();
  assert.doesNotThrow(() => s.hit(5), 'hitting before a spawn must not throw');
});

test('session events are surfaced to the caller for the inspector log', () => {
  const events = [];
  const s = createMobDebugSession(new THREE.Scene(), (msg) => events.push(msg));
  s.reset('cow');
  s.player.takeDamage(4, new THREE.Vector3(), 'arrow');
  assert.ok(events.some(e => /Target hit/.test(e)), `expected a hit event, got ${JSON.stringify(events)}`);
});
