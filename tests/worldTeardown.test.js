// Back to Main, and the way back into a new world.
//
// The bug: Back to Main cleared the chunks and left the lifecycle at `ready`. The next "Generate New World" was then
// refused, the start screen was hidden, and the player walked into the cleared, still-simulating old world. The chunk
// streamer also kept the old chunk coordinates, so the new world's chunks were never built.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { teardownWorld } from '../src/worldTeardown.js';
import { createLifecycle, beginLoading, markReady, allowsSimulationForPhase } from '../src/worldLifecycle.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/** A running game, built the way `Game` holds its world, with every subsystem the teardown touches. */
function runningGame() {
  const lifecycle = createLifecycle();
  beginLoading(lifecycle);
  markReady(lifecycle);
  const removed = [];
  const disposed = [];
  const released = [];
  const chunkA = { opaqueMesh: { geometry: { dispose: () => disposed.push('a-opaque') } }, transparentMesh: null, waterMesh: null, lightMesh: null };
  const chunkB = { opaqueMesh: null, transparentMesh: { geometry: { dispose: () => disposed.push('b-transparent') } }, waterMesh: null, lightMesh: null };
  const calls = [];
  const game = {
    lifecycle, worldReady: true, worldGenerated: true, _worldStartInFlight: true,
    scene: { remove: (mesh) => removed.push(mesh) },
    streamer: { reset: () => calls.push('streamer') },
    world: {
      isFlatWorld: true, generationMode: 'flat',
      chunks: new Map([['0,0', chunkA], ['1,0', chunkB]]),
      water: { reset: () => calls.push('water') },
      lava: { reset: () => calls.push('lava') },
      light: { clear: () => calls.push('light') },
    },
    blockLighting: { chunks: new Map([['0,0', []]]), dirty: false, lights: [{ visible: true }, { visible: true }] },
    mobs: { clearMobs: () => calls.push('mobs') },
    entities: {
      droppedItems: [{ group: 'g1' }, { group: 'g2' }],
      itemVisuals: { release: (group) => released.push(group) },
      fireworkRockets: [{ mesh: { removeFromParent: () => calls.push('rocket'), geometry: { dispose: () => calls.push('rocket-geo') } } }],
    },
    worldSync: { leave: () => calls.push('sharing') },
    modLoader: { closeWorld: () => calls.push('mod') },
    buildingStudio: { exitStudio: () => calls.push('studio') },
    mechanisms: { setMechanism: (name) => calls.push(`mechanism:${name}`) },
    targetBoxMesh: { visible: true }, breakOverlayMesh: { visible: true },
    targetBlock: { x: 1 }, targetMob: { id: 2 }, isMouseDown: true, miningTime: 3,
    player: {
      position: { set(x, y, z) { this.at = [x, y, z]; } },
      velocity: { set() {} },
      keys: { KeyW: true }, botControls: { KeyW: true }, isSleeping: true, isSwimming: true,
    },
  };
  return { game, lifecycle, removed, disposed, released, calls, chunkA, chunkB };
}

test('Back to Main returns the lifecycle to idle, and the simulation stops', () => {
  const { game, lifecycle } = runningGame();
  assert.equal(allowsSimulationForPhase(lifecycle.phase), true, 'running before the teardown');
  teardownWorld(game);
  assert.equal(lifecycle.phase, 'idle');
  assert.equal(allowsSimulationForPhase(lifecycle.phase), false, 'nothing ticks on the start screen');
  assert.equal(game.worldReady, false);
  assert.equal(game.worldGenerated, false);
  assert.equal(game._worldStartInFlight, false);
});

test('after Back to Main, a new world is accepted: "Generate New World" is not refused', () => {
  // The regression itself. Before the fix `beginLoading` returned false here, so the second world never started.
  const { game } = runningGame();
  teardownWorld(game);
  assert.equal(beginLoading(game.lifecycle), true, 'the next load begins');
  assert.equal(game.lifecycle.phase, 'loading');
});

test('Back to Main takes down the "Generating World" cover, which otherwise blocks the title screen', () => {
  // A load finishes a little after its world is ready and hides the cover only if the world is still up, so leaving
  // in between left the cover over the title screen and Generate New World could not be clicked.
  const { game } = runningGame();
  let hidden = 0;
  game.overlay = { hide: () => { hidden++; } };
  teardownWorld(game);
  assert.equal(hidden, 1);
});

test('the chunk streamer forgets the old world, so the new chunks are built and not skipped', () => {
  // The bug's other half: the streamer kept the old coordinates as loaded.
  const { game, calls } = runningGame();
  teardownWorld(game);
  assert.ok(calls.includes('streamer'), 'the streamer is reset');
});

test('chunk meshes leave the scene and free their GPU buffers, and the chunk map is emptied', () => {
  const { game, removed, disposed, chunkA, chunkB } = runningGame();
  const mesh = chunkA.opaqueMesh, other = chunkB.transparentMesh;
  teardownWorld(game);
  assert.deepEqual(removed.sort(), [mesh, other].sort(), 'both meshes come out of the scene');
  assert.deepEqual(disposed.sort(), ['a-opaque', 'b-transparent'], 'and their buffers are freed');
  assert.equal(game.world.chunks.size, 0);
  assert.equal(chunkA.opaqueMesh, null, 'the chunk no longer points at a mesh');
});

test('dropped items release their visuals and the list is emptied', () => {
  const { game, released } = runningGame();
  teardownWorld(game);
  assert.deepEqual(released, ['g1', 'g2']);
  assert.deepEqual(game.entities.droppedItems, []);
  assert.deepEqual(game.entities.fireworkRockets, []);
});

test('the water, lava and lighting of the old world are discarded, and the block lights go dark', () => {
  const { game, calls } = runningGame();
  teardownWorld(game);
  for (const name of ['water', 'lava', 'light', 'mobs', 'studio', 'mod', 'mechanism:default', 'sharing']) {
    assert.ok(calls.includes(name), `${name} is released`);
  }
  assert.equal(game.blockLighting.chunks.size, 0);
  assert.equal(game.blockLighting.dirty, true);
  assert.ok(game.blockLighting.lights.every((light) => light.visible === false));
});

test('the player is put back on the start-screen spawn with no held input or swimming left over', () => {
  const { game } = runningGame();
  teardownWorld(game);
  assert.deepEqual(game.player.position.at, [0, 26, 0]);
  assert.deepEqual(game.player.keys, {});
  assert.equal(game.player.botControls, null);
  assert.equal(game.player.isSleeping, false);
  assert.equal(game.player.isSwimming, false);
  assert.equal(game.targetBlock, null);
  assert.equal(game.isMouseDown, false);
  assert.equal(game.miningTime, 0);
});

test('a step that throws does not stop the rest of the teardown', () => {
  const { game, lifecycle, calls } = runningGame();
  game.world.water.reset = () => { throw new Error('water is broken'); };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { released } = teardownWorld(game);
    assert.ok(!released.includes('water'), 'the failed step is not reported as released');
  } finally {
    console.warn = warn;
  }
  assert.equal(lifecycle.phase, 'idle', 'the lifecycle still goes back to idle');
  assert.equal(game.world.chunks.size, 0, 'and the chunks are still cleared');
  assert.ok(calls.includes('lava'), 'and the steps after it still run');
});

test('a missing game is harmless', () => {
  assert.deepEqual(teardownWorld(null).released, []);
});

test('a partly built world can be torn down', () => {
  // Back to Main is reachable during loading, when most of the game does not exist yet.
  const game = { lifecycle: createLifecycle(), world: {}, player: {} };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.doesNotThrow(() => teardownWorld(game));
  } finally {
    console.warn = warn;
  }
});

test('the Back to Main button calls the teardown, instead of its own partial copy', () => {
  const ui = read('src/ui.js');
  const at = ui.indexOf('const btnTitle = document.getElementById(\'btn-title-screen\');');
  const handler = ui.slice(at, ui.indexOf('if (this.startOverlay) this.startOverlay.style.display', at));
  assert.match(handler, /teardownWorld\(this\.game\)/, 'the handler tears the world down');
  assert.doesNotMatch(handler, /this\.game\.world\.chunks\.clear\(\)/, 'and no longer clears the chunks inline');
});

test('a new world waits for the old one to be released, and places the player before the chunks are built', () => {
  const src = read('src/main.js');
  const at = src.indexOf('  async generateNewWorld() {');
  const body = src.slice(at, src.indexOf('\n  async startBuildingStudio()', at));
  // The End arrives on its obsidian platform instead; every other dimension asks for the surface.
  const place = body.search(/spawn\s*=\s*placePlayerOnSurface\(this\);/);
  const load = body.indexOf('await this.loadWorldProgressively();');
  assert.ok(place > 0 && load > 0, 'both steps are in generateNewWorld');
  assert.ok(place < load, 'the spawn is chosen before the chunks are built, so its chunks are meshed too');
  assert.match(body, /this\.overlay\.show\('Generating World'\);\s*await yieldToBrowser\(\);/, 'the overlay is on screen while the spawn is found');
});

test('the camera is placed at the spawn before the world goes live, so the first frame is not taken from the origin', () => {
  // The first frames of a new world were taken from wherever the camera last was: the origin, inside the ground. The
  // camera follows the player only in the player's own update, which had not run yet.
  const src = read('src/main.js');
  const at = src.indexOf('  async generateNewWorld() {');
  const body = src.slice(at, src.indexOf('\n  async startBuildingStudio()', at));
  const sync = body.indexOf('this.player.updateCameraAndModel?.(0);');
  const ready = body.indexOf('markReady(this.lifecycle);');
  assert.ok(sync > 0, 'the camera is moved to the player');
  assert.ok(sync < ready, 'before the simulation starts');
});

test('Back to Main leaves a shared world first, so a host stops hosting and a guest stops being a guest', () => {
  const { game, calls } = runningGame();
  teardownWorld(game);
  assert.equal(calls[0], 'sharing', 'before anything else is torn down, so friends are told while the world still exists');
});

test('Create World hides the title screen after the load only if the world is still up', () => {
  // The load finishes a little after its world is ready. Leaving in between (Back to Main) put the title screen back,
  // and then this hid it again under a blank screen. e2e/worldStart.pw.js leaves straight after each load.
  const ui = readFileSync(join(process.cwd(), 'src/ui.js'), 'utf8');
  const at = ui.indexOf('await this.game.generateNewWorld();');
  assert.ok(at > 0);
  const after = ui.slice(at, at + 400);
  assert.match(after, /if \(this\.startOverlay && this\.game\.worldReady\) this\.startOverlay\.style\.display = 'none';/);
  assert.doesNotMatch(after, /if \(this\.startOverlay\) this\.startOverlay\.style\.display = 'none';/);
});
