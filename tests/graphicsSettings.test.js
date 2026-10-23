// Performance Mode and the render distance button (src/graphicsSettings.js): the two settings that trade looks for
// frame rate on a slow graphics chip. Each must do what it says, be remembered, and default to the game as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  GraphicsSettings, savedRenderDistance, nextRenderDistance, PERFORMANCE_STORAGE_KEY, RENDER_DISTANCE_STORAGE_KEY,
  DEFAULT_RENDER_DISTANCE,
} from '../src/graphicsSettings.js';
import { overworldFogRange } from '../src/atmosphere.js';
import { World } from '../src/world.js';
import { ChunkStreamer } from '../src/chunkStreamer.js';

console.warn = () => {};

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

function button() {
  const listeners = [];
  return {
    textContent: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, fn) { listeners.push(fn); },
    click() { for (const fn of listeners) fn(); },
  };
}

function fakeGame() {
  return {
    renderDistance: 8,
    renderer: { ratio: null, setPixelRatio(r) { this.ratio = r; } },
    shader: { edgeAntialiasing: true },
    setRenderDistance(n) { this.renderDistance = n; },
  };
}

test('a player who has not chosen gets the fast settings: Performance Mode on and 4 chunks', () => {
  const storage = memoryStorage();
  assert.equal(savedRenderDistance(storage), DEFAULT_RENDER_DISTANCE);
  assert.equal(DEFAULT_RENDER_DISTANCE, 4);
  const game = fakeGame();
  const settings = new GraphicsSettings(game, { storage });
  settings.apply();
  assert.equal(settings.performanceMode, true);
  assert.equal(game.shader.edgeAntialiasing, false);
  assert.equal(game.renderer.ratio, 1);
});

test('Performance Mode draws at 1x with no edge smoothing, and is remembered', () => {
  const storage = memoryStorage({ [PERFORMANCE_STORAGE_KEY]: 'off' });
  const game = fakeGame();
  const settings = new GraphicsSettings(game, { storage });
  const perf = button(), distance = button();
  settings.apply();
  settings.bindButtons(perf, distance);
  assert.equal(perf.textContent, 'Performance Mode: OFF');
  perf.click();
  assert.equal(game.renderer.ratio, 1);
  assert.equal(game.shader.edgeAntialiasing, false);
  assert.equal(perf.textContent, 'Performance Mode: ON');
  assert.equal(perf.attributes['aria-pressed'], 'true');
  assert.equal(storage.getItem(PERFORMANCE_STORAGE_KEY), 'on');

  // A new session starts in the saved mode.
  const again = fakeGame();
  new GraphicsSettings(again, { storage }).apply();
  assert.equal(again.renderer.ratio, 1);
  assert.equal(again.shader.edgeAntialiasing, false);

  perf.click();
  assert.equal(game.shader.edgeAntialiasing, true);
  assert.equal(game.renderer.ratio, Math.min(globalThis.devicePixelRatio || 1, 1.25), 'off, the resolution main.js always used');
  assert.equal(storage.getItem(PERFORMANCE_STORAGE_KEY), 'off');
  // Turned off is remembered too, though on is the default.
  const off = fakeGame();
  new GraphicsSettings(off, { storage }).apply();
  assert.equal(off.shader.edgeAntialiasing, true);
});

test('the render distance button steps through 4, 6, 8 and 10 chunks, says which, and is remembered', () => {
  assert.deepEqual([4, 6, 8, 10].map(nextRenderDistance), [6, 8, 10, 4]);
  const storage = memoryStorage();
  const game = fakeGame();
  const settings = new GraphicsSettings(game, { storage });
  const distance = button();
  settings.bindButtons(null, distance);
  assert.equal(distance.textContent, 'Render Distance: 8 Chunks', 'the label tells the truth (it used to say 4 and do nothing)');
  distance.click();
  assert.equal(game.renderDistance, 10);
  distance.click();
  assert.equal(game.renderDistance, 4);
  assert.equal(distance.textContent, 'Render Distance: 4 Chunks');
  assert.equal(storage.getItem(RENDER_DISTANCE_STORAGE_KEY), '4');
  assert.equal(savedRenderDistance(storage), 4);
  assert.equal(savedRenderDistance(memoryStorage({ [RENDER_DISTANCE_STORAGE_KEY]: '7' })), 4, 'an unknown value falls back');
});

test('storage that throws (a private window) does not break either setting', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const game = fakeGame();
  const settings = new GraphicsSettings(game, { storage });
  assert.equal(savedRenderDistance(storage), 4);
  settings.setPerformanceMode(true);
  settings.setRenderDistance(6);
  assert.equal(game.renderer.ratio, 1);
  assert.equal(game.renderDistance, 6);
});

test('the fog follows the render distance, so a shorter one still fades out', () => {
  assert.ok(overworldFogRange(6).far < overworldFogRange(8).far);
  assert.ok(overworldFogRange(6).far <= 6 * 16);
});

test('a shorter render distance stops drawing the far chunks at once; a longer one streams them back', () => {
  const world = new World(1234, 'all');
  const scene = new THREE.Scene();
  const game = {
    world, scene, player: { position: new THREE.Vector3(8, 40, 8) }, blockLighting: { setChunk() {} },
    rebuildChunkMesh(chunk) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3), 3));
      chunk.opaqueMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      scene.add(chunk.opaqueMesh);
      chunk.dirty = false;
    },
  };
  const streamer = new ChunkStreamer(game, { meshRadius: 3 });
  streamer.loadAllSynchronously(8, 8);
  const meshedBeyond = (r) => [...world.chunks.values()].filter((c) => c.opaqueMesh && Math.max(Math.abs(c.cx), Math.abs(c.cz)) > r).length;
  assert.ok(meshedBeyond(1) > 0);
  streamer.setRenderDistance(1);
  assert.equal(meshedBeyond(1), 0, 'nothing beyond the new distance is drawn');
  assert.equal(scene.children.length, 9, 'only the 3 x 3 around the player');
  assert.ok(world.getChunk(3, 3), 'the chunks themselves stay loaded');
  streamer.setRenderDistance(3);
  for (let i = 0; i < 200; i++) streamer.update(8, 8);
  assert.equal(meshedBeyond(3), 0);
  assert.equal(scene.children.length, 49, 'the 7 x 7 is drawn again');
});
