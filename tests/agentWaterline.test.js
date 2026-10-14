// The waterline context the agent is given, and the guard that keeps plants out of water.
//
// Reported from play: "create an island in the middle of the lake" produced a jungle log, four flowers and a
// campfire, every one of them at or below the water surface, and no island. The agent already HAD the bulk
// operations (fill_box, set_voxels, dome, cylinder) and a terrain map that draws water as its own character --
// what it was never told is where the surface actually is, that a terrain request needs those bulk ops, and
// that plants placed into water are replaced by the simulation (see `waterReplaceable` in waterSimulation.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';
import { waterReplaceable } from '../src/waterSimulation.js';

/** An agent stub whose world answers from a sparse column map, so `getVoxel` is the only real dependency. */
function agentWithColumn(column) {
  const agent = Object.create(WorldAgent.prototype);
  agent.game = {
    player: { position: { x: 8.5, y: 10, z: 8.5 } },
    world: { getVoxel: (x, y, z) => (column[y] === undefined ? BLOCKS.AIR : column[y]) },
  };
  return agent;
}

test('the waterline is stated, with the bulk-op guidance and the plant trap', () => {
  const column = { 3: BLOCKS.STONE };
  for (let y = 4; y <= 9; y++) column[y] = BLOCKS.WATER; // water up to y=9, so the surface is y=10
  const text = agentWithColumn(column).describeWaterline();
  assert.match(text, /y=10/, 'the surface height is named');
  assert.match(text, /fill_box/);
  assert.match(text, /set_voxels/);
  assert.match(text, /build UP from the bed/, 'and the direction to build');
  assert.match(text, /Never place plants/, 'the waterlogged-plant trap is spelled out');
});

test('dry ground says so instead of inventing a surface', () => {
  const text = agentWithColumn({ 9: BLOCKS.GRASS_BLOCK }).describeWaterline();
  assert.match(text, /no water/i);
});

test('a missing world or player is not a crash', () => {
  const agent = Object.create(WorldAgent.prototype);
  assert.doesNotThrow(() => agent.describeWaterline());
  assert.match(agent.describeWaterline(), /unavailable/i);
});

test('the plant guard asks the simulation which blocks water overwrites', () => {
  // Behaviour: these are the blocks flowing water replaces, so a placement into water is deleted again after
  // the log line has already reported success.
  assert.equal(waterReplaceable(BLOCKS.DANDELION), true, 'a flower in water is replaceable');
  assert.equal(waterReplaceable(BLOCKS.STONE), false, 'stone is not, so an island base survives');
  // Wiring: the guard asks the simulation rather than guessing with a local flag (`def.plant` was the first
  // attempt and it let flowers through), so the guard and the simulation cannot drift apart.
  const source = readFileSync(new URL('../src/worldAgent.js', import.meta.url), 'utf8');
  assert.match(source, /waterReplaceable\(b\.id\)/,
    'applyVoxelChanges skips water-replaceable blocks aimed at water cells');
});
