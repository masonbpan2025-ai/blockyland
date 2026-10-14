import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deserializeWorld,
  deserializeWorldAsync,
  serializeWorld,
  loadMapFromDefault
} from '../src/mapManager.js';
import { Chunk } from '../src/world.js';
import { ProgressOverlay } from '../src/progressOverlay.js';

function createMockGame() {
  const chunks = new Map();
  const scene = {
    add() {},
    remove() {}
  };
  const world = {
    seed: 12345,
    chunks,
    chunkKey(cx, cz) { return `${cx},${cz}`; },
    reseed(s) { this.seed = s; },
    water: {
      reset() {},
      initChunk() {}
    },
    redstone: {
      restore() {}
    }
  };
  const player = {
    position: { x: 0, y: 64, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    velocity: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    yaw: 0,
    pitch: 0,
    gamemode: 'survival',
    health: 20,
    hunger: 20,
    exp: 0,
    level: 0,
    controlsDisabled: true,
    isSleeping: true,
    keys: { KeyW: true },
    update() {}
  };
  const inventory = {
    slots: [],
    armor: [],
    offhand: null,
    selectedSlot: 0
  };
  const mobs = {
    mobs: [],
    clearMobs() {},
    spawnMob() { return null; }
  };
  const camera = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, order: 'YXZ', set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
  };

  const meshedChunks = [];
  return {
    world,
    scene,
    player,
    inventory,
    mobs,
    camera,
    worldGenerated: false,
    worldReady: false,
    lifecycle: { phase: 'idle' },
    meshedChunks,
    loadChunksAroundPlayer() {},
    rebuildChunkMesh(chunk) {
      meshedChunks.push(chunk);
    }
  };
}

function createDummyMapData(numChunks = 12) {
  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    chunks.push({
      cx: i,
      cz: 0,
      voxels: [1, 16384], // RLE encoded
      waterLevels: [0, 16384]
    });
  }
  return {
    name: 'Progress Test World',
    seed: 98765,
    worldType: 'generated',
    chunks,
    player: {
      position: { x: 10, y: 70, z: 10 },
      yaw: 1.5,
      pitch: -0.2
    },
    inventory: { hotbar: [], main: [] },
    mobs: []
  };
}

test('deserializeWorldAsync emits progressive, monotonically increasing progress and yields to browser', async () => {
  const game = createMockGame();
  const mapData = createDummyMapData(16);

  const reported = [];
  let yieldCount = 0;

  const yieldFn = async () => {
    yieldCount++;
    assert.equal(game.worldReady, false, 'Simulation must remain paused at every loading yield');
    assert.equal(game.lifecycle.phase, 'loading');
  };

  const progress = (percent, stage) => {
    reported.push({ percent, stage });
  };

  await deserializeWorldAsync(game, mapData, {
    progress,
    yieldFn,
    batchSize: 4,
    meshBatchSize: 4
  });

  assert.ok(reported.length >= 8, `Expected multiple progress reports, got ${reported.length}`);
  assert.ok(yieldCount >= 6, `Expected multiple browser yields, got ${yieldCount}`);

  // Monotonic increase
  for (let i = 1; i < reported.length; i++) {
    assert.ok(
      reported[i].percent >= reported[i - 1].percent,
      `Progress decreased from ${reported[i - 1].percent} to ${reported[i].percent}`
    );
  }

  // Covers decompression, fluids, meshing, and finalizing
  assert.ok(reported.some(r => /Decoding chunks/i.test(r.stage)), 'Missing Decoding chunks stage');
  assert.ok(reported.some(r => /Building chunk meshes/i.test(r.stage)), 'Missing Building chunk meshes stage');
  assert.ok(reported.some(r => /Finalising/i.test(r.stage)), 'Missing Finalising stage');

  // Verify game state is restored
  assert.equal(game.worldReady, true);
  assert.equal(game.lifecycle.phase, 'ready');
  assert.equal(game.meshedChunks.length, 16);
});

test('map replacement pauses an already running world before awaiting its mod', async () => {
  const game = createMockGame();
  game.worldReady = true;
  game.lifecycle.phase = 'ready';
  let reset = false;
  game.streamer = { reset() { reset = true; } };
  game.openDesignedWorld = async () => {
    assert.equal(game.worldReady, false);
    assert.equal(game.lifecycle.phase, 'loading');
    assert.ok(reset);
    return { modId: 'test', mechanismId: 'test' };
  };
  await deserializeWorldAsync(game, { ...createDummyMapData(1), worldType: 'designed' }, { yieldFn: async () => {} });
  assert.equal(game.world.generationMode, 'authored');
  assert.equal(game.worldReady, true);
  await deserializeWorldAsync(game, createDummyMapData(1), { yieldFn: async () => {} });
  assert.equal(game.world.generationMode, 'procedural');
});

test('failed map loading never resumes a partially restored world', async () => {
  const game = createMockGame();
  await assert.rejects(deserializeWorldAsync(game, createDummyMapData(1), {
    yieldFn: async () => { throw new Error('load interrupted'); },
  }), /load interrupted/);
  assert.equal(game.worldReady, false);
  assert.equal(game.lifecycle.phase, 'failed');
});

test('deserializeWorld still runs synchronously when options.async is not passed', () => {
  const game = createMockGame();
  const mapData = createDummyMapData(4);

  const reported = [];
  const res = deserializeWorld(game, mapData, {
    progress: (p, s) => reported.push({ p, s })
  });

  assert.equal(res, true);
  assert.equal(game.worldReady, true);
  assert.equal(game.meshedChunks.length, 4);
});

test('ProgressOverlay accurately reflects reported stages and percentages in DOM', () => {
  const elements = {};
  const mockDoc = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          id,
          style: {},
          classList: {
            classes: new Set(['hidden']),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
          },
          textContent: '',
          parentElement: {
            setAttribute(k, v) { this[k] = v; }
          }
        };
      }
      return elements[id];
    }
  };

  const overlay = new ProgressOverlay(mockDoc);
  overlay.show('Loading Saved World');

  assert.equal(elements['world-progress-title'].textContent, 'Loading Saved World');
  assert.equal(elements['world-progress-stage'].textContent, 'Preparing…');
  assert.equal(elements['world-progress-percent'].textContent, '0%');
  assert.equal(elements['world-progress-overlay'].classList.contains('hidden'), false);

  overlay.set(45, 'Decoding chunks — 36/81');
  assert.equal(elements['world-progress-fill'].style.width, '45%');
  assert.equal(elements['world-progress-percent'].textContent, '45%');
  assert.equal(elements['world-progress-stage'].textContent, 'Decoding chunks — 36/81');

  overlay.set(88, 'Building chunk meshes — 70/81');
  assert.equal(elements['world-progress-fill'].style.width, '88%');
  assert.equal(elements['world-progress-percent'].textContent, '88%');

  overlay.set(100, 'Map loaded');
  assert.equal(elements['world-progress-percent'].textContent, '100%');

  overlay.hide();
  assert.equal(elements['world-progress-overlay'].classList.contains('hidden'), true);
});


test('map restoration preserves an authoritative game control policy', async () => {
  for (const asyncLoad of [false, true]) {
    const game=createMockGame();game.modRuntime={exclusiveSimulation:true};
    const map=createDummyMapData(1);
    if(asyncLoad)await deserializeWorldAsync(game,map,{yieldFn:async()=>{}});else deserializeWorld(game,map);
    assert.equal(game.player.controlsDisabled,true);
  }
});
