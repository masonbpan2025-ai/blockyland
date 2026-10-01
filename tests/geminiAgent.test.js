import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';
import { validatePlan } from '../src/agentPlans.js';

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
  // This file covers the Google Gemini wire format specifically.
  agent.setVendor('gemini');
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

test('arbitrary Gemini prompts receive live context and support build, in-place edit, and pronoun deletion', async t => {
  const { agent, game } = fixture();
  agent.apiKey = 'test-only';
  agent.parseIntentLocally = () => { throw new Error('Must not use keyword parser'); };
  const requests = [];
  const responses = [customBuild];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(responses.shift()) }] } }] }) };
  });
  const prompt = 'Could the harbor have a guiding light for ships?';
  await agent.executePrompt(prompt);
  assert.equal(agent.lastError, null);
  const s = agent.lastBuiltStructure;
  game.world.setVoxel(s.startX, s.baseY + 2, s.startZ, BLOCKS.GLASS);
  responses.push({ action: 'edit', targetStructure: s.id, operations: [{ type: 'replace_blocks', from: 'SNOW', block: 'BRICKS' }] });
  await agent.executePrompt('Give that beacon brickwork, keeping my window.');
  assert.equal(agent.builtStructures.length, 1);
  assert.equal(game.world.getVoxel(s.startX, s.baseY + 2, s.startZ), BLOCKS.GLASS);
  assert.equal(game.world.getVoxel(s.startX + 1, s.baseY + 1, s.startZ), BLOCKS.BRICKS);
  assert.ok(requests[1].body.systemInstruction.parts[0].text.includes(s.id));
  assert.ok(requests[1].body.systemInstruction.parts[0].text.includes('GLASS'));
  assert.equal(requests[0].body.contents.flatMap(c => c.parts).filter(p => p.text?.includes(prompt)).length, 1);
  assert.ok(requests[1].body.contents.some(c => c.role === 'model'));
  assert.ok(!requests[0].url.includes('test-only'));
  responses.push({ action: 'destroy', targetStructure: s.id });
  await agent.executePrompt('Actually, take it down.');
  assert.equal(agent.lastError, null);
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

test('API failures remain errors, release the terminal, and never execute a local substitute', async t => {
  const { agent, cells } = fixture();
  agent.apiKey = 'test-only';
  let completed = false;
  agent.onComplete = () => { completed = true; };
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
  await agent.executePrompt('build a lighthouse');
  assert.match(agent.lastError.message, /HTTP 403/);
  assert.equal(agent.isExecuting, false);
  assert.equal(completed, true);
  assert.equal(cells.size, 0);
  // The failure is recorded as a failure, with the technical reason retained. The
  // message also carries advice, so it is not the bare "Failed: ..." it once was.
  assert.match(agent.conversationHistory.at(-1).text, /Could not do that:/);
  assert.match(agent.conversationHistory.at(-1).text, /HTTP 403/);
});

test('invalid model plans are rejected before any step mutates the world', async t => {
  const { agent, cells } = fixture();
  agent.apiKey = 'test-only';
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'multi', steps: [customBuild, { action: 'execute_javascript' }] }) }] } }] }) }));
  await agent.executePrompt('a complex request');
  assert.match(agent.lastError.message, /Unsupported action/);
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

test('offline unsupported prompts explain the API requirement without an unwanted generic build', async () => {
  const { agent, cells, logs } = fixture();
  await agent.executePrompt('build a flying dragon');
  assert.equal(cells.size, 0);
  assert.ok(logs.some(l => /API key/.test(l.message)));
});
