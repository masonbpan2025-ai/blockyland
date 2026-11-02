// An edit must resolve to the structure open in Building Studio.
//
// Regression guard: the studio edits a library structure directly and never
// records it in builtStructures, so the model had no valid edit target. Asked to
// "create a bridge next to the entrance of the castle" it invented an id
// (custom_castle_with_bridge_muo14677) and the plan died with
// "Structure not found", even though the castle was open on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldAgent } from '../src/worldAgent.js';
import { runGameTool, describeWorld } from '../src/agentControl/gameTools.js';
import { BuildingStudioManager } from '../src/buildingStudio.js';
import { BuildingLibrary } from '../src/buildingLibrary.js';
import { BLOCKS } from '../src/blocks.js';

function fixture({ studioOpen = true } = {}) {
  const world = {
    getVoxel: () => BLOCKS.AIR,
    setVoxel() {},
    getOrCreateChunk: () => ({ dirty: false }),
    chunks: new Map()
  };
  const studio = new BuildingStudioManager({});
  studio.game = {};
  if (studioOpen) {
    studio.loadBuilding(BuildingLibrary.getBuilding('castle'), {});
    studio.isActive = true;
  }
  const game = {
    world,
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {},
    buildingStudio: studio
  };
  studio.game = game;
  const agent = new WorldAgent(game);
  return { agent, studio, game, world };
}

// --- resolution -------------------------------------------------------------

test('the open studio structure resolves by id, name and type', () => {
  const { agent } = fixture();
  assert.equal(agent.resolveStructure('studio_castle')?.isStudioStructure, true);
  assert.equal(agent.resolveStructure('Castle')?.isStudioStructure, true);
  assert.equal(agent.resolveStructure('castle')?.isStudioStructure, true);
  assert.equal(agent.resolveStructure({ id: 'studio_castle', isStudioStructure: true }) !== null, true);
});

test('pronouns resolve to the open studio structure', () => {
  const { agent } = fixture();
  for (const reference of ['it', 'that', 'this', 'the structure', 'the open structure']) {
    assert.equal(agent.resolveStructure(reference)?.isStudioStructure, true, `"${reference}" should resolve`);
  }
});

test('nothing resolves to the studio when it is closed', () => {
  const { agent } = fixture({ studioOpen: false });
  assert.equal(agent.resolveStructure('studio_castle'), null);
  assert.equal(agent.resolveStructure('it'), null);
});

// --- the reported failure ---------------------------------------------------

test('an invented structure id is redirected to the open studio structure', async () => {
  const { agent, game } = fixture();
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });

  // Exactly the failing case: the AI names a structure that does not exist.
  const { result } = await runGameTool('run_plan', { plan: {
    action: 'edit',
    targetBuilding: 'custom_castle_with_bridge_muo14677',
    name: 'Castle Bridge',
    dimensions: { width: 4, height: 2, depth: 4 },
    operations: [{ type: 'fill_box', min: [0, 0, 0], max: [3, 1, 3], block: 'OAK_PLANKS' }],
    explanation: 'Adding a bridge beside the gate'
  } }, { game, agent });

  assert.equal(result.ok, true);
  assert.ok(logs.some(entry => /is not a known structure; applying this to "Castle"/.test(entry.message)),
    'the redirect is explained to the player');
});

test('a wrong id still fails when no studio structure is open', async () => {
  const { agent, game } = fixture({ studioOpen: false });
  await assert.rejects(
    runGameTool('run_plan', { plan: {
      action: 'edit',
      targetBuilding: 'custom_castle_with_bridge_muo14677',
      operations: [{ type: 'fill_box', min: [0, 0, 0], max: [1, 1, 1], block: 'STONE' }]
    } }, { game, agent }),
    err => err.kind === 'failed' && /Structure not found/.test(err.message),
    'a genuinely unknown target is still an error',
  );
});

test('a destroy with a wrong id is redirected too, since it is likewise unambiguous', async () => {
  const { agent, game } = fixture();
  agent.onLog = () => {};
  const { result } = await runGameTool('run_plan', {
    plan: { action: 'destroy', targetBuilding: 'made_up_id_123', explanation: 'Removing it' }, confirm: true,
  }, { game, agent });
  assert.equal(result.ok, true);
});

test('the world description gives the AI the exact id to use and forbids inventing one', () => {
  const { agent } = fixture();
  const world = describeWorld(agent);
  assert.match(world, /id: studio_castle/, 'the usable id is stated');
  assert.match(world, /NEVER invent a structure id/, 'and inventing one is forbidden');
  assert.match(world, /does not exist and the request will fail/, 'with the consequence spelled out');
});
