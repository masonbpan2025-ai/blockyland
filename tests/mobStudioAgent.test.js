// Mob Studio must be able to build a recognisable custom mob from a name, and it
// must say why there is no reasoning trace when it answers locally.
//
// Regression guard: "make a Pikachu" was claimed by the built-in keyword parser,
// which only understands a model type, one body colour and three boolean flags.
// It produced a purple humanoid that looked nothing like Pikachu, and because no
// model was consulted there was no chain of thought in the terminal either.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MobStudioManager } from '../src/mobStudio.js';
import { WorldAgent } from '../src/worldAgent.js';
import { validatePlan } from '../src/agentPlans.js';
import { BLOCKS } from '../src/blocks.js';

function mobStudio() {
  return new MobStudioManager({});
}

function agentFixture() {
  const studio = mobStudio();
  studio.isActive = true;
  const game = {
    world: {
      getVoxel: (x, y) => (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
      setVoxel() {}, getOrCreateChunk: () => ({ dirty: false }), chunks: new Map()
    },
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {},
    mobStudio: studio
  };
  studio.game = game;
  const agent = new WorldAgent(game);
  agent.setVendor('deepseek');
  agent.setApiKey('k');
  const thoughts = [];
  agent.onThought = event => thoughts.push(event);
  return { agent, studio, thoughts };
}

/** Streaming stub returning one assistant message. */
function sse(content) {
  const encoder = new TextEncoder();
  const body = encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`);
  let sent = false;
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: { get: n => (n.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: { getReader: () => ({ read: async () => (sent ? { done: true, value: undefined } : (sent = true, { done: false, value: body })) }) }
  };
}

const PIKACHU_PLAN = {
  action: 'create_mob',
  mob: {
    name: 'Pikachu',
    description: 'Small yellow electric mouse',
    look: { modelType: 'quadruped', mainColor: '#f7d02c', accentColor: '#8b4513', eyeColor: '#1a1a1a', scale: 0.8, hasWings: false, hasHorns: false, hasGlowingEyes: false },
    behavior: { type: 'pet', health: 35, attack: 4, speed: 3.4, followPlayer: true, range: 16 },
    skills: ['lightning'],
    eggColors: { primary: '#f7d02c', secondary: '#8b4513' }
  }
};

// --- the reported bug -------------------------------------------------------

test('a named character is handed to the model instead of the keyword parser', () => {
  const studio = mobStudio();
  assert.equal(studio.handleAgentPrompt('make a Pikachu'), false,
    'the local parser must decline a specific character it cannot render');
  assert.equal(studio.handleAgentPrompt('make me a Pikachu that shoots lightning'), false);
  assert.equal(studio.handleAgentPrompt('create a Charizard'), false);
});

test('a plain stat description is still handled locally and instantly', () => {
  const studio = mobStudio();
  assert.equal(studio.handleAgentPrompt('make a fast red fire dragon with 100 hp that shoots fireballs'), true,
    'the parser understands every part of this one');
});

test('the parser reports no reasoning trace when it answers locally', async t => {
  const { agent, thoughts } = agentFixture();
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  // Must not reach the network.
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call the model'); });

  await agent.executePrompt('make a fast red fire dragon with 100 hp that shoots fireballs');

  assert.equal(agent.lastError, null);
  const thought = logs.find(entry => entry.type === 'thought');
  assert.ok(thought, 'a thought entry explains the missing trace');
  assert.match(thought.message, /No model call was made/);
  assert.match(thought.message, /no reasoning trace/);
});

// --- the model can now design a mob ----------------------------------------

test('the create_mob plan is accepted by the validator', () => {
  assert.doesNotThrow(() => validatePlan(PIKACHU_PLAN));
});

test('the validator rejects an unusable mob definition', () => {
  const bad = (mob, pattern) => assert.throws(() => validatePlan({ action: 'create_mob', mob }), pattern);
  bad(undefined, /mob object/);
  bad({ name: '' }, /name/);
  bad({ name: 'X'.repeat(41) }, /name/);
  bad({ name: 'Blob', look: { modelType: 'dragon' } }, /model type/);
  bad({ name: 'Blob', look: { mainColor: 'purple' } }, /#rrggbb/);
  bad({ name: 'Blob', look: { scale: 99 } }, /scale/);
  bad({ name: 'Blob', behavior: { type: 'friendlyish' } }, /behaviour/);
  bad({ name: 'Blob', behavior: { health: 9999 } }, /health/);
  bad({ name: 'Blob', skills: ['explode'] }, /skills/);
});

test('"make a Pikachu" now reaches the model and produces a Pikachu-shaped mob', async t => {
  const { agent, studio } = agentFixture();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return sse(JSON.stringify(PIKACHU_PLAN));
  });

  await agent.executePrompt('make a Pikachu');

  assert.equal(agent.lastError, null, `unexpected error: ${agent.lastError?.message}`);
  assert.equal(calls.length, 1, 'the model was consulted exactly once');

  // The prompt must teach the model the create_mob shape and the live draft.
  const system = calls[0].body.messages[0].content;
  assert.match(system, /MOB STUDIO/, 'mob studio context is present');
  assert.match(system, /create_mob/, 'the action is documented');
  assert.match(system, /Current draft:/, 'the live mob state is included');

  // And the definition must land on the mob being edited.
  assert.equal(studio.currentMob.name, 'Pikachu');
  assert.equal(studio.currentMob.look.modelType, 'quadruped', 'a mouse is not a humanoid');
  assert.equal(studio.currentMob.look.mainColor, '#f7d02c', 'yellow body');
  assert.equal(studio.currentMob.look.accentColor, '#8b4513', 'brown markings');
  assert.equal(studio.currentMob.look.scale, 0.8);
  assert.equal(studio.currentMob.behavior.type, 'pet');
  assert.deepEqual(studio.currentMob.skills, ['lightning']);
  // The spawn egg should follow the body colours.
  assert.equal(studio.currentMob.eggColors.primary, '#f7d02c');
});

test('applyMobDefinition clamps and tolerates junk instead of corrupting state', () => {
  const studio = mobStudio();
  const before = JSON.parse(JSON.stringify(studio.currentMob));

  assert.equal(studio.applyMobDefinition(null), false);
  assert.equal(studio.applyMobDefinition({}), false);
  assert.equal(studio.applyMobDefinition({ mob: { name: '   ' } }), false);
  assert.deepEqual(studio.currentMob, before, 'a rejected definition changes nothing');

  // Out-of-range and malformed values are clamped or ignored.
  assert.equal(studio.applyMobDefinition({
    mob: {
      name: 'Clamped',
      look: { modelType: 'not-a-type', mainColor: 'nonsense', scale: 99 },
      behavior: { type: 'nope', health: 100000, attack: -5 },
      skills: ['lightning', 'explode', 'freeze'],
      eggColors: {}
    }
  }), true);

  assert.equal(studio.currentMob.look.modelType, before.look.modelType, 'unknown model type ignored');
  assert.equal(studio.currentMob.look.mainColor, before.look.mainColor, 'invalid colour ignored');
  assert.equal(studio.currentMob.look.scale, 3, 'scale clamped to its maximum');
  assert.equal(studio.currentMob.behavior.type, before.behavior.type, 'unknown behaviour ignored');
  assert.equal(studio.currentMob.behavior.health, 500, 'health clamped');
  assert.equal(studio.currentMob.behavior.attack, 0, 'attack clamped');
  assert.deepEqual(studio.currentMob.skills, ['lightning', 'freeze'], 'unknown skills dropped');
});

test('a mob designed outside Mob Studio is saved to the library', async t => {
  const { agent } = agentFixture();
  agent.game.mobStudio.isActive = false;

  const saved = [];
  agent.game.mobLibrary = {
    saveCustomMob(data) { saved.push(data); return { success: true, name: data.name }; }
  };
  t.mock.method(globalThis, 'fetch', async () => sse(JSON.stringify(PIKACHU_PLAN)));

  await agent.executePrompt('make a Pikachu');
  assert.equal(agent.lastError, null);
  assert.equal(saved.length, 1, 'the mob was saved to the library');
  assert.equal(saved[0].name, 'Pikachu');
  assert.equal(saved[0].look.mainColor, '#f7d02c');
});

test('a library conflict is reported instead of throwing', async t => {
  const { agent } = agentFixture();
  agent.game.mobStudio.isActive = false;
  agent.game.mobLibrary = {
    saveCustomMob() { return { success: false, message: 'A mob named "Pikachu" already exists.' }; }
  };
  const logs = [];
  agent.onLog = (message, type) => logs.push({ message, type });
  t.mock.method(globalThis, 'fetch', async () => sse(JSON.stringify(PIKACHU_PLAN)));

  await agent.executePrompt('make a Pikachu');
  assert.equal(agent.lastError, null, 'a name clash is a report, not an exception');
  assert.ok(logs.some(entry => /already exists/.test(entry.message)));
});

test('the agent no longer advertises only block actions to the model', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/worldAgent.js'), 'utf8');
  assert.match(source, /"action":.*"create_mob"/, 'the JSON schema lists create_mob');
  assert.match(source, /case 'create_mob'/, 'and runPlan handles it');
  assert.match(source, /async executeCreateMob/, 'with a dedicated executor');
});
