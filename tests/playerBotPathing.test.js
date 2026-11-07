// How the player bot gets around rough ground: the cases that stranded players in the agent arena (arena/sim.js).
// Each walk is driven by the bot itself through the shared survival fixture, on a flat world (ground y <= 0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { createSurvivalFixture } from './helpers/survivalFixture.js';

const near = (p, x, z, d = 1.2) => Math.hypot(p.x - (x + .5), p.z - (z + .5)) < d;

test('a player at the bottom of a two-block pit digs steps out of it to walk away', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  // A one-block hole two deep in a raised dirt mound: dirt on every side of the player at feet and head height. (The
  // fixture's ground below y 0 cannot be dug out, so the hole is built up rather than down.)
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x || z) for (let y = 1; y <= 2; y++) f.world.setVoxel(x, y, z, BLOCKS.DIRT);
  const result = await f.drive(f.bot.run('go to 6 1 0'));
  assert.equal(result.ok, true, result.message);
  assert.ok(near(f.player.position, 6, 0), `at x 6 (${f.player.position.x.toFixed(1)}, ${f.player.position.z.toFixed(1)})`);
});

test('stepping down a block where a block hangs at head height: the body has to pass it', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 2, 0.5] });
  // A one-block ledge to stand on at x 0, ground one lower beyond it, and a block over the step at head height.
  for (let z = -3; z <= 3; z++) { f.world.setVoxel(0, 1, z, BLOCKS.DIRT); f.world.setVoxel(0, 0, z, BLOCKS.DIRT); f.world.setVoxel(1, 3, z, BLOCKS.STONE); }
  const result = await f.drive(f.bot.run('go to 4 1 0'));
  assert.equal(result.ok, true, result.message);
  assert.ok(near(f.player.position, 4, 0), `arrived (${f.player.position.x.toFixed(1)}, ${f.player.position.y.toFixed(1)}, ${f.player.position.z.toFixed(1)})`);
});

test('a drop of three blocks is a way down (falls of three cost no health)', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 4, 0.5] });
  // A 3-high platform 3 wide; the only way off is to step off its edge.
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 1; y <= 3; y++) f.world.setVoxel(x, y, z, BLOCKS.STONE);
  const before = f.player.health;
  const result = await f.drive(f.bot.run('go to 5 1 0'));
  assert.equal(result.ok, true, result.message);
  assert.ok(near(f.player.position, 5, 0), 'on the ground beyond the platform');
  assert.equal(f.player.health, before, 'no fall damage');
});

test('mining looks only at blocks it could see: buried stone is not a target, open stone is', async () => {
  const f = createSurvivalFixture({ playerPos: [0.5, 1, 0.5] });
  f.inventory.addItem('wooden_pickaxe', false, 1);
  // Stone fills the ground under the player (all buried); one stone block stands open on the surface 6 blocks away.
  for (let x = -24; x <= 24; x++) for (let z = -24; z <= 24; z++) for (let y = -6; y <= -2; y++) f.world.setVoxel(x, y, z, BLOCKS.STONE);
  f.world.setVoxel(6, 1, 0, BLOCKS.STONE);
  const result = await f.drive(f.bot.run('mine 1 stone'));
  assert.equal(result.ok, true, result.message);
  assert.equal(f.world.getVoxel(6, 1, 0), BLOCKS.AIR, 'the open block was the one mined');
});
