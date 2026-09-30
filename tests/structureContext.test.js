// The agent must know the geometry of the structure open in Structure Studio.
//
// Regression guard: the system prompt described only structures the agent had
// built itself. In Structure Studio the open structure lives in the studio's own
// state, so asked to "add a bridge to the entrance of the castle" the model had no
// idea where the castle was or which way its gate faced, and attached the bridge
// to the wrong side.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { StructureStudioManager } from '../src/structureStudio.js';
import { StructureLibrary } from '../src/structureLibrary.js';
import { WorldAgent } from '../src/worldAgent.js';
import { describeDirection, describeOpenStructure, formatStructureContext } from '../src/structureContext.js';
import { BLOCKS } from '../src/blocks.js';

function studioWith(id, params = {}) {
  const studio = new StructureStudioManager({});
  studio.game = {};
  const structure = StructureLibrary.getStructure(id);
  assert.ok(structure, `structure ${id} should exist`);
  studio.loadStructure(structure, params);
  return studio;
}

// --- the reported bug -------------------------------------------------------

test('the castle entrance is found on the south side, matching its generator', () => {
  const studio = studioWith('castle');
  const info = describeOpenStructure(studio);

  assert.ok(info, 'the castle must be measurable');
  assert.equal(info.id, 'castle');
  assert.ok(info.entrances.length >= 1, 'the castle gate must be detected');

  // The gate is the lowest opening; corner towers also have gaps higher up.
  const gate = info.entrances[0];
  // src/structures/castle.js builds the arch at (mid, dy 1..3, L - 1), south wall.
  assert.match(gate.faces, /south/, `gate should face south, got "${gate.faces}"`);
  assert.equal(gate.local.z, info.bounds.maxZ, 'the gate sits on the maximum-Z wall');
  assert.ok(gate.width >= 2, `the gate is two blocks wide, got ${gate.width}`);
  assert.ok(gate.local.x > 0 && gate.local.x < info.bounds.maxX, 'and is centred on the wall, not in a corner');
  assert.equal(gate.local.y, info.bounds.minY + 1, 'it sits at ground level');
});

test('a hollow house reports one door, not its whole interior', () => {
  const studio = studioWith('cozy_house');
  const info = describeOpenStructure(studio);
  assert.ok(info.entrances.length >= 1);
  // The first attempt at this reported two 7-block-wide "entrances" — the inside
  // of the house. A doorway is small.
  for (const entrance of info.entrances) {
    assert.ok(entrance.width <= 3, `opening should be door-sized, got ${entrance.width}`);
  }
});

test('the structure description reaches the model prompt', () => {
  const studio = studioWith('castle');
  const game = {
    world: {
      getVoxel: (x, y) => (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR),
      setVoxel() {}, getOrCreateChunk: () => ({ dirty: false }), chunks: new Map()
    },
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, gamemode: 'creative' },
    worldTime: 6000,
    weather: { weatherType: 'clear' },
    sounds: {},
    rebuildChunkMesh() {},
    structureStudio: studio
  };
  studio.game = game;
  studio.isActive = true;

  const agent = new WorldAgent(game);
  const prompt = agent.buildSystemPrompt();

  assert.match(prompt, /STRUCTURE STUDIO/, 'the prompt must carry a studio section');
  assert.match(prompt, /"Castle" \(id: castle\)/, 'it names the open structure');
  assert.match(prompt, /Local coordinate frame: local \(0,0,0\) is world/, 'it gives the coordinate frame');
  assert.match(prompt, /entrance/i, 'it lists the entrance');
  assert.match(prompt, /faces south/, 'and the direction the entrance faces');
});

test('outside Structure Studio no studio section is added', () => {
  const game = {
    world: {
      getVoxel: () => BLOCKS.AIR, setVoxel() {},
      getOrCreateChunk: () => ({ dirty: false }), chunks: new Map()
    },
    player: { position: { x: 0, y: 12, z: 0 }, yaw: 0, gamemode: 'creative' },
    worldTime: 6000, weather: {}, sounds: {}, rebuildChunkMesh() {}
    // no structureStudio at all
  };
  const agent = new WorldAgent(game);
  assert.doesNotMatch(agent.buildSystemPrompt(), /STRUCTURE STUDIO/);
});

// --- direction naming -------------------------------------------------------

test('compass directions are described from the structure centre', () => {
  assert.equal(describeDirection(0, 0), 'the centre');
  assert.match(describeDirection(0, 5), /south/);
  assert.match(describeDirection(0, -5), /north/);
  assert.match(describeDirection(5, 0), /east/);
  assert.match(describeDirection(-5, 0), /west/);
  assert.match(describeDirection(6, 6), /corner/);
});

// --- robustness -------------------------------------------------------------

test('describeOpenStructure declines cleanly when nothing is open', () => {
  assert.equal(describeOpenStructure(null), null);
  assert.equal(describeOpenStructure({}), null);
  assert.equal(describeOpenStructure({ currentStructure: null }), null);
  // No usable origin.
  assert.equal(describeOpenStructure({ currentStructure: { generate: () => [] }, buildOrigin: null }), null);
  // A generator that throws must not propagate.
  const broken = {
    currentStructure: { id: 'x', name: 'X', generate() { throw new Error('boom'); } },
    buildOrigin: { x: 0, y: 5, z: 8 },
    currentParameters: {}
  };
  assert.equal(describeOpenStructure(broken), null);
  // A generator that produces nothing is also unusable.
  assert.equal(describeOpenStructure({
    currentStructure: { id: 'x', name: 'X', generate: () => [] },
    buildOrigin: { x: 0, y: 5, z: 8 },
    currentParameters: {}
  }), null);
});

test('a fully sealed structure is reported as enclosed, not given a fake entrance', () => {
  const sealed = {
    currentStructure: {
      id: 'sealed', name: 'Sealed Box', description: 'solid',
      generate: (origin, params, B) => {
        const blocks = [];
        for (let x = 0; x < 5; x++) {
          for (let z = 0; z < 5; z++) {
            for (let y = 0; y < 4; y++) blocks.push({ x: origin.x + x, y: origin.y + y, z: origin.z + z, id: B.STONE });
          }
        }
        return blocks;
      }
    },
    buildOrigin: { x: 0, y: 5, z: 8 },
    currentParameters: {}
  };
  const info = describeOpenStructure(sealed);
  assert.ok(info);
  assert.equal(info.entrances.length, 0);
  assert.match(formatStructureContext(info), /no opening was detected/);
});

test('the prompt section includes size, bounds and live parameters', () => {
  const studio = studioWith('castle', { wallLength: 20, towerHeight: 6 });
  const text = formatStructureContext(describeOpenStructure(studio));
  assert.match(text, /wallLength=20/, 'current parameter values are included');
  assert.match(text, /towerHeight=6/);
  assert.match(text, /Local bounds:/);
  assert.match(text, /Do NOT guess a side/);
});

test('structureContext is imported by the agent', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/worldAgent.js'), 'utf8');
  assert.match(source, /from '\.\/structureContext\.js'/, 'the agent must import the structure context');
  assert.match(source, /studioSection/, 'and splice it into the prompt');
});
