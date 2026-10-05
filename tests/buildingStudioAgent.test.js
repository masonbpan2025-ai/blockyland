// Structure Studio must not swallow prompts that belong to the language model,
// and must hand AI-built structures to its parameter panel.
//
// Regression guard: the prompt parser used to fall back to `stairs` for anything
// it did not recognise, so every prompt — including Chinese and other free-form
// ones — was answered with a staircase and the agent never reached the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { StructureStudioManager } from '../src/structureStudio.js';
import { StructureLibrary } from '../src/structureLibrary.js';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS } from '../src/blocks.js';

function studio() {
  return new StructureStudioManager({});
}

/** Records whether the studio claims a prompt or yields it to the model. */
function verdict(manager, prompt) {
  const parsed = manager.parsePromptParameters(prompt);
  return { claimed: !!parsed, parsed };
}

// --- the reported bug -------------------------------------------------------

test('a free-form Chinese prompt is yielded to the model, not answered with stairs', () => {
  const { claimed, parsed } = verdict(studio(), '造一个黄鹤楼。楼顶上要有一个牌匾写着"楚天极目"');
  assert.equal(claimed, false, 'the studio must not claim a prompt it cannot parse');
  assert.equal(parsed, null);
});

test('an unrecognised English structure is yielded, not defaulted to stairs', () => {
  const manager = studio();
  for (const prompt of [
    'build a yellow crane tower',
    'make me a flying dragon',
    'build a beautiful lighthouse overlooking the water',
    'build a spiral staircase that goes to the top',
    'destroy the castle',
    'what can you do?'
  ]) {
    assert.equal(verdict(manager, prompt).claimed, false, `should yield: ${prompt}`);
  }
});

test('the old behaviour is gone: no catch-all default structure', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/structureStudio.js'), 'utf8');
  assert.doesNotMatch(source, /else\s+matchedStructure\s*=\s*StructureLibrary\.getStructure\('stairs'\)\s*;\s*\/\/\s*default/,
    'the unconditional stairs fallback must not come back');
});

// --- the studio still handles parametric requests ---------------------------

test('explicit and implied parameter prompts are still claimed by the studio', () => {
  const manager = studio();

  const explicit = verdict(manager, 'build a stair with a height parameter');
  assert.equal(explicit.claimed, true);
  assert.equal(explicit.parsed.structure.id, 'stairs');
  assert.equal(explicit.parsed.extractedParams.height, 8);

  const implied = verdict(manager, 'build a stair with a height H');
  assert.equal(implied.claimed, true);
  assert.equal(implied.parsed.structure.id, 'stairs');

  const numeric = verdict(manager, 'build an aquarium with width 14 and height 8');
  assert.equal(numeric.claimed, true);
  assert.equal(numeric.parsed.structure.id, 'aquarium');
  assert.equal(numeric.parsed.extractedParams.width, 14);
  assert.equal(numeric.parsed.extractedParams.height, 8);
});

test('a named structure without any parameter cue is yielded to the model', () => {
  // Naming a structure is not the same as asking to configure its parameters.
  const { claimed } = verdict(studio(), 'build a castle');
  assert.equal(claimed, false);
});

test('blank or non-string input is handled without claiming', () => {
  const manager = studio();
  assert.equal(manager.parsePromptParameters(''), null);
  assert.equal(manager.parsePromptParameters('   '), null);
  assert.equal(manager.parsePromptParameters(null), null);
  assert.equal(manager.parsePromptParameters(undefined), null);
});

// --- AI result reaches the parameter panel ----------------------------------

test('adoptFromPlan loads a matching library structure with the model dimensions', () => {
  const manager = studio();
  manager.game = {};

  const adopted = manager.adoptFromPlan({
    action: 'build',
    structureType: 'aquarium',
    dimensions: { width: 14, height: 8, depth: 9 }
  });

  assert.equal(adopted, true);
  assert.equal(manager.currentStructure.id, 'aquarium');
  assert.equal(manager.currentParameters.width, 14);
  assert.equal(manager.currentParameters.height, 8);
  // Every declared parameter must be present so the panel renders fully.
  for (const param of manager.currentStructure.parameters) {
    assert.ok(param.id in manager.currentParameters, `missing ${param.id}`);
  }
});

test('adoptFromPlan tolerates aliases, unknown structures and junk input', () => {
  const manager = studio();
  manager.game = {};

  // Name rather than id, and a parameter clamped to its declared maximum.
  assert.equal(manager.adoptFromPlan({ structureType: 'Watchtower', dimensions: { height: 9999 } }), true);
  assert.equal(manager.currentStructure.id, 'watchtower');
  const heightParam = manager.currentStructure.parameters.find(p => p.id === 'height');
  assert.equal(manager.currentParameters.height, heightParam.max, 'values are clamped to the parameter range');

  // A structure that is not in the library must be declined, not guessed.
  assert.equal(manager.adoptFromPlan({ structureType: 'yellow_crane_tower' }), false);
  assert.equal(manager.adoptFromPlan({ action: 'message' }), false);
  assert.equal(manager.adoptFromPlan(null), false);
  assert.equal(manager.adoptFromPlan('nonsense'), false);
});

test('adoptFromPlan prefers the structure the model actually named', () => {
  const manager = studio();
  manager.game = {};
  assert.equal(manager.adoptFromPlan({ structureType: 'pyramid' }), true);
  assert.equal(manager.currentStructure.id, 'pyramid');
  assert.equal(manager.adoptFromPlan({ structureType: 'greenhouse' }), true);
  assert.equal(manager.currentStructure.id, 'greenhouse');
});

// --- the agent reaches the model while the studio is open -------------------

function agentFixture() {
  const world = {
    getVoxel: (x, y) => (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
    setVoxel() {},
    getOrCreateChunk: () => ({ dirty: false }),
    chunks: new Map()
  };
  const manager = new StructureStudioManager({});
  manager.isActive = true;
  manager.game = {};

  const game = {
    world,
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {},
    structureStudio: manager
  };
  manager.game = game;
  const agent = new WorldAgent(game);
  agent.setVendor('deepseek');
  agent.setApiKey('test-key');
  return { agent, manager, game };
}

test('with the studio open, a free-form prompt is sent to the model', async t => {
  const { agent, manager } = agentFixture();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: '{"action":"message","explanation":"hi"}' }, finish_reason: 'stop' }] })
    };
  });

  await agent.executePrompt('造一个黄鹤楼');
  assert.equal(agent.lastError, null);
  assert.equal(calls.length, 1, 'the model must be consulted');
  assert.match(calls[0].url, /deepseek/);
});

test('with the studio open, an AI-built library structure populates the panel', async t => {
  const { agent, manager } = agentFixture();
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            action: 'build',
            structureType: 'aquarium',
            name: 'Reef Tank',
            dimensions: { width: 12, height: 7, depth: 8 }
          })
        },
        finish_reason: 'stop'
      }]
    })
  }));

  await agent.executePrompt('build me a big fish tank');
  assert.equal(agent.lastError, null);
  assert.equal(manager.currentStructure?.id, 'aquarium', 'the panel should hold the built structure');
  assert.equal(manager.currentParameters.width, 12);
  assert.equal(manager.currentParameters.height, 7);
});

test('a parametric studio prompt still short-circuits without calling the model', async t => {
  const { agent } = agentFixture();
  let called = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    called++;
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }) };
  });

  await agent.executePrompt('build a stair with a height parameter');
  assert.equal(called, 0, 'the studio handles this instantly');
  assert.equal(agent.lastError, null);
});

// --- quick prompts removal --------------------------------------------------

test('the quick prompt chips are gone from the agent terminal', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Quick Prompts/i, 'the Quick Prompts section should be removed');
  assert.doesNotMatch(html, /class="gemini-chip"/, 'no quick prompt chips should remain');
  assert.doesNotMatch(html, /gemini-chips-container/);

  // The terminal itself must still be intact.
  assert.match(html, /id="gemini-form"/);
  assert.match(html, /id="gemini-prompt-input"/);

  const ui = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');
  assert.doesNotMatch(ui, /querySelectorAll\('\.gemini-chip'\)/, 'the dead chip handler should be removed');
});

test('every library structure is offered in the creative Structures tab', () => {
  const all = StructureLibrary.getAllStructures();
  assert.ok(all.length >= 9);
  for (const st of all) {
    assert.ok(st.name, `${st.id} needs a name for the hover tooltip`);
    assert.ok(st.icon && st.icon.startsWith('/assets/'), `${st.id} needs an icon`);
  }
});

test('custom on-the-fly builds with operations are not hijacked by built-in structures and save custom voxels', () => {
  const manager = studio();
  const worldBlocks = new Map();
  manager.game = {
    world: {
      getVoxel: (x, y, z) => worldBlocks.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => worldBlocks.set(`${x},${y},${z}`, id)
    }
  };

  // 1. plan with operations should NOT be adopted by adoptFromPlan as a built-in template
  const plan = {
    action: 'build',
    structureType: 'castle_with_bridge',
    name: 'Bodiam Moat Castle with Bridge',
    operations: [
      { type: 'fill_box', min: [0, 0, 0], max: [10, 5, 10], block: 'stone' }
    ]
  };

  const adopted = manager.adoptFromPlan(plan);
  assert.equal(adopted, false, 'plan with operations must not be adopted as a built-in template');

  // 2. Instead, adoptCustomBuild adopts it as a custom voxel build
  const customBlocks = [
    { x: 0, y: 5, z: 8, id: BLOCKS.COBBLESTONE },
    { x: 1, y: 5, z: 8, id: BLOCKS.OAK_PLANKS },
    { x: 2, y: 6, z: 8, id: BLOCKS.BRICKS }
  ];
  for (const b of customBlocks) {
    manager.game.world.setVoxel(b.x, b.y, b.z, b.id);
  }
  manager.adoptCustomBuild({
    name: 'castle_with_bridge',
    blocks: customBlocks,
    plan
  });

  assert.equal(manager.isCustomVoxelBuild, true);
  assert.equal(manager.currentStructure.name, 'castle_with_bridge');
  assert.notEqual(manager.currentStructure.id, 'castle');

  // 3. Confirm save generates custom voxel code rather than built-in castle code
  manager.saveInput = { value: 'castle_with_bridge' };
  manager.confirmSave();

  const saved = StructureLibrary.getStructure('castle_with_bridge');
  assert.ok(saved, 'castle_with_bridge should be saved in StructureLibrary');
  assert.equal(saved.name, 'castle_with_bridge');
  assert.ok(saved.code.includes('const V ='), 'saved code should serialize the custom voxels');
  assert.ok(!saved.code.includes('createCastle'), 'saved code must NOT be the built-in castle code');

  // 4. Test generating the saved structure
  const genBlocks = saved.generate({ x: 10, y: 10, z: 10 }, {}, BLOCKS);
  assert.equal(genBlocks.length, customBlocks.length);
  assert.equal(genBlocks[0].x, 10);
  assert.equal(genBlocks[0].id, BLOCKS.COBBLESTONE);
  assert.equal(genBlocks[1].id, BLOCKS.OAK_PLANKS);
  assert.equal(genBlocks[2].id, BLOCKS.BRICKS);

  // Clean up
  StructureLibrary.deleteStructure(saved.id);
});

