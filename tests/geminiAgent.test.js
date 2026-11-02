import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';
import { validatePlan } from '../src/agentPlans.js';
import { runGameTool, describeWorld } from '../src/agentControl/gameTools.js';

function fixture() {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const natural = y => y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR;
  const game = {
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0 }, worldTime: 6000,
    world: { getVoxel: (x, y, z) => cells.get(key(x, y, z)) ?? natural(y),
      setVoxel: (x, y, z, id) => { assert.ok([x, y, z].every(Number.isInteger)); cells.set(key(x, y, z), id); },
      getOrCreateChunk: () => null, chunks: new Map() },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {} },
    rebuildChunkMesh() {}, weather: { setWeather() {} },
  };
  const agent = new GeminiAgent(game);
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  return { agent, game, cells, natural, logs };
}

const customBuild = { action: 'build', structureType: 'lighthouse', name: 'Harbor Light',
  dimensions: { width: 3, height: 4, depth: 3 },
  operations: [{ type: 'fill_box', min: [0, 0, 0], max: [2, 3, 2], block: 'SNOW' }] };

test('offline lighthouse deletion restores terrain and attached stairs, preserving another building and manual edits', async () => {
  const { agent, game, natural } = fixture();
  await agent.executePrompt('build a lighthouse');
  assert.equal(agent.lastError, null);
  const lighthouse = agent.lastBuiltStructure;
  await agent.executePrompt('add stairs to the lighthouse');
  const footprint = [...lighthouse.voxels.values()];
  assert.ok(footprint.some(v => v.x < lighthouse.startX || v.z < lighthouse.startZ || v.x > lighthouse.endX || v.z > lighthouse.endZ));
  await agent.executePrompt('build a house');
  const house = agent.lastBuiltStructure;
  const manual = footprint.find(v => v.id !== BLOCKS.DIAMOND_ORE);
  game.world.setVoxel(manual.x, manual.y, manual.z, BLOCKS.DIAMOND_ORE);
  await agent.executePrompt('destroy the lighthouse');
  assert.equal(agent.lastError, null);
  assert.deepEqual(agent.builtStructures, [house]);
  for (const v of footprint) assert.equal(game.world.getVoxel(v.x, v.y, v.z), v === manual ? BLOCKS.DIAMOND_ORE : natural(v.y));
  for (const v of house.voxels.values()) assert.equal(game.world.getVoxel(v.x, v.y, v.z), v.id);
});

test('plans build, edit in place and destroy, keeping the player\'s own edits, and the AI sees its build', async () => {
  const { agent, game } = fixture();
  await agent.runPlan(customBuild, 'Could the harbor have a guiding light for ships?');
  const s = agent.lastBuiltStructure;
  game.world.setVoxel(s.startX, s.baseY + 2, s.startZ, BLOCKS.GLASS);
  // What an AI app reads before its next plan names the building, by id.
  assert.ok(describeWorld(agent).includes(s.id));
  await agent.runPlan({ action: 'edit', targetStructure: s.id, operations: [{ type: 'replace_blocks', from: 'SNOW', block: 'BRICKS' }] }, 'Give that beacon brickwork, keeping my window.');
  assert.equal(agent.builtStructures.length, 1);
  assert.equal(game.world.getVoxel(s.startX, s.baseY + 2, s.startZ), BLOCKS.GLASS);
  assert.equal(game.world.getVoxel(s.startX + 1, s.baseY + 1, s.startZ), BLOCKS.BRICKS);
  await agent.runPlan({ action: 'destroy', targetStructure: s.id }, 'Actually, take it down.');
  assert.equal(agent.builtStructures.length, 0);
  assert.equal(game.world.getVoxel(s.startX, s.baseY + 2, s.startZ), BLOCKS.GLASS);
});
test('edits can extend outside original bounds and remove blocks with AIR', async () => {
  const { agent, game, natural } = fixture();
  await agent.runPlan(customBuild, 'build');
  const s = agent.lastBuiltStructure;
  const plan = { action: 'edit', targetStructure: s.id, offset: [-2, 0, 0], dimensions: { width: 3, height: 2, depth: 1 }, operations: [
    { type: 'fill_box', block: 'STONE' }, { type: 'set_voxels', voxels: [{ x: 2, y: 1, z: 0, block: 'AIR' }] }
  ] };
  validatePlan(plan);
  await agent.runPlan(plan, 'extend it and cut a doorway');
  assert.equal(game.world.getVoxel(s.startX - 2, s.baseY, s.startZ), BLOCKS.STONE);
  assert.equal(game.world.getVoxel(s.startX, s.baseY + 1, s.startZ), BLOCKS.AIR);
  await agent.runPlan({ action: 'destroy', targetStructure: s.id });
  assert.equal(game.world.getVoxel(s.startX - 2, s.baseY, s.startZ), natural(s.baseY));
});

test('multi-step references use last built structure and API stair names resolve to objects', async () => {
  const { agent } = fixture();
  const plan = { action: 'multi', steps: [customBuild, { action: 'build_stairs', targetStructure: 'last' }] };
  validatePlan(plan);
  await agent.runPlan(plan, 'Build a beacon with stairs');
  assert.equal(agent.builtStructures.length, 1);
  assert.equal(agent.lastBuiltStructure.type, 'lighthouse');
  assert.equal(agent.lastBuiltStructure.attachments.length, 1);
  await agent.runPlan({ action: 'destroy', targetStructure: 'Harbor Light' });
  assert.equal(agent.builtStructures.length, 0);
});

test('missing named targets and partial offline removals never destroy an unrelated structure', async () => {
  const { agent } = fixture();
  await agent.runPlan(customBuild, 'build');
  await agent.executePrompt('destroy the castle');
  await agent.executePrompt('remove the roof of the lighthouse');
  assert.equal(agent.builtStructures.length, 1);
  assert.equal(agent.findReferencedStructure('house'), null);
  await assert.rejects(agent.runPlan({ action: 'destroy', targetStructure: 'missing-id' }), /not found/);
  await agent.executePrompt('destroy it');
  assert.equal(agent.builtStructures.length, 0);
});

test('invalid plans are rejected before any step mutates the world', async () => {
  const { agent, game, cells } = fixture();
  await assert.rejects(
    runGameTool('run_plan', { plan: { action: 'multi', steps: [customBuild, { action: 'execute_javascript' }] } }, { game, agent }),
    err => err.kind === 'usage' && /Unsupported action/.test(err.message),
  );
  assert.equal(cells.size, 0);
  assert.equal(agent.builtStructures.length, 0);
  for (const operation of [
    { type: 'fill_box', min: [0.5, 0, 0] },
    { type: 'cylinder', radius: 1e9 },
    { type: 'replace_blocks', block: 'STONE' },
    { type: 'fill_box', block: 'IMAGINARY_BLOCK' }
  ]) assert.throws(() => validatePlan({ ...customBuild, operations: [operation] }));
  assert.throws(() => validatePlan({ action: 'build', structureType: 'dragon' }), /voxel operations/);
});
test('offline unsupported prompts point to the AI app without an unwanted generic build', async () => {
  const { agent, cells, logs } = fixture();
  await agent.executePrompt('build a flying dragon');
  assert.equal(cells.size, 0);
  assert.ok(logs.some(l => /Connect AI/.test(l.message)), 'the player is told how to get a free-form build');
});
