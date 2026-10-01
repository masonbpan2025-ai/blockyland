// The agent must be able to answer questions about what the player can see.
//
// Regression guard: the prompt described the terrain around the player but not
// what the view was aimed at, so "what's in front of me?" had nothing to answer
// from — and the model's spoken answer was then discarded as malformed input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

/**
 * World with a solid wall at a given distance along -Z, and ground below.
 * yaw 0 looks towards -Z, which is the default facing.
 */
function wallWorld({ wallAtZ = -6, wallId = BLOCKS.STONE } = {}) {
  return {
    getVoxel(x, y, z) {
      if (y <= 10) return BLOCKS.STONE;          // ground
      if (z <= wallAtZ) return wallId;            // wall ahead
      return BLOCKS.AIR;
    },
    setVoxel() {},
    getOrCreateChunk: () => ({ dirty: false }),
    chunks: new Map()
  };
}

function agentWith(world, { yaw = 0, pitch = 0 } = {}) {
  const game = {
    world,
    player: { position: { x: 0, y: 12, z: 0 }, yaw, pitch, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: {},
    rebuildChunkMesh() {}
  };
  return new WorldAgent(game);
}

// --- the raycast ------------------------------------------------------------

test('a wall directly ahead is reported with its distance and coordinates', () => {
  const agent = agentWith(wallWorld({ wallAtZ: -6 }));
  const ahead = agent.describeForwardView();

  assert.ok(ahead, 'a forward view is produced');
  assert.equal(ahead.openAir, false, 'the sight line is blocked');
  assert.equal(ahead.firstHit.name, BLOCK_DEFS[BLOCKS.STONE].name, 'it names the block');
  assert.ok(ahead.firstHit.distance > 4 && ahead.firstHit.distance < 8,
    `expected the wall around 6 blocks away, got ${ahead.firstHit.distance}`);
  assert.match(ahead.facing, /north/, 'yaw 0 faces north/-Z');
});

test('an unobstructed sight line is reported as open air, not as nothing', () => {
  const openWorld = {
    getVoxel: (x, y, z) => (y <= 10 ? BLOCKS.STONE : BLOCKS.AIR),
    setVoxel() {}, getOrCreateChunk: () => ({ dirty: false }), chunks: new Map()
  };
  const ahead = agentWith(openWorld).describeForwardView();
  assert.equal(ahead.openAir, true);
  assert.equal(ahead.firstHit, null);
});

test('water along the sight line is called out', () => {
  const world = {
    getVoxel: (x, y, z) => (y <= 10 ? BLOCKS.STONE : (z <= -4 ? BLOCKS.WATER : BLOCKS.AIR)),
    setVoxel() {}, getOrCreateChunk: () => ({ dirty: false }), chunks: new Map()
  };
  const ahead = agentWith(world).describeForwardView();
  assert.ok(ahead.water > 2, `expected water samples, got ${ahead.water}`);
  assert.equal(ahead.firstHit.name, BLOCK_DEFS[BLOCKS.WATER].name);
});

test('turning around changes what is reported ahead', () => {
  const forward = agentWith(wallWorld({ wallAtZ: -6 }), { yaw: 0 }).describeForwardView();
  const behind = agentWith(wallWorld({ wallAtZ: -6 }), { yaw: Math.PI }).describeForwardView();

  assert.equal(forward.openAir, false, 'the wall is ahead when facing it');
  assert.equal(behind.openAir, true, 'and behind when facing away');
  assert.match(behind.facing, /south/, 'yaw PI faces south/+Z');
});

test('pitches upward finds only sky', () => {
  const ahead = agentWith(wallWorld({ wallAtZ: -6 }), { pitch: -1.4 }).describeForwardView();
  assert.equal(ahead.openAir, true, 'looking up at the sky hits nothing');
});

test('describeForwardView declines cleanly without a world or player', () => {
  assert.equal(new WorldAgent({}).describeForwardView(), null);
  assert.equal(new WorldAgent({ world: { getVoxel: () => 0 } }).describeForwardView(), null);
});

// --- it reaches the prompt --------------------------------------------------

test('the prompt tells the model what is directly ahead', () => {
  const prompt = agentWith(wallWorld({ wallAtZ: -6 })).buildSystemPrompt();
  assert.match(prompt, /DIRECTLY AHEAD/, 'the section is present');
  assert.match(prompt, /first thing the sight line hits is Stone/, 'naming the block');
  assert.match(prompt, /player faces north/, 'and the facing');
});

test('an open view is described as open rather than left blank', () => {
  const openWorld = {
    getVoxel: (x, y, z) => (y <= 10 ? BLOCKS.STONE : BLOCKS.AIR),
    setVoxel() {}, getOrCreateChunk: () => ({ dirty: false }), chunks: new Map()
  };
  const prompt = agentWith(openWorld).buildSystemPrompt();
  assert.match(prompt, /DIRECTLY AHEAD/);
  assert.match(prompt, /sight line is clear/, 'open air is stated explicitly');
});

test('the prompt insists that questions are answered as JSON, using the world state', () => {
  const prompt = agentWith(wallWorld()).buildSystemPrompt();
  assert.match(prompt, /EVERY reply must be that JSON object/, 'JSON is the envelope for every reply');
  assert.match(prompt, /"action" field is mandatory/, 'the action field is required, not optional');
  assert.match(prompt, /what's in front of me\?/, 'a question is given as an example');
  assert.match(prompt, /tell me about this world/, 'including the one that previously failed');
  assert.match(prompt, /put the full answer in "explanation"/, 'and told where the answer goes');
  assert.match(prompt, /never say you cannot see the world/i, 'the model is told the world state is its eyes');
  assert.match(prompt, /Never ask the player to describe their own surroundings/i, 'and not to deflect');
});

test('the prompt keeps the player position, facing and terrain map', () => {
  const prompt = agentWith(wallWorld()).buildSystemPrompt();
  assert.match(prompt, /player is at XYZ: \(0\.0, 12\.0, 0\.0\)/);
  assert.match(prompt, /LOCAL TERRAIN/);
  assert.match(prompt, /facing north/);
});
