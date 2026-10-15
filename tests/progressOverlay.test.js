// World-generation / map-loading progress. Regression guard for the frozen start
// screen: the heavy work must be split into batches AND must actually yield to
// the browser between them, otherwise the bar can never paint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_BATCH_SIZE,
  ProgressOverlay,
  REQUIRED_UI_METHODS,
  clampPercent,
  findMissingMethods,
  loadChunksProgressively,
  runBatches
} from '../src/progressOverlay.js';

/** Minimal DOM stand-in: records writes by element id. */
function fakeDocument(ids = []) {
  const elements = new Map();
  for (const id of ids) {
    const el = {
      id,
      textContent: '',
      style: {},
      classList: {
        classes: new Set(),
        add(name) { this.classes.add(name); },
        remove(name) { this.classes.delete(name); },
        contains(name) { return this.classes.has(name); }
      },
      parentElement: null,
      setAttribute() {}
    };
    elements.set(id, el);
  }
  return {
    elements,
    getElementById: id => elements.get(id) || null
  };
}

function instrumentedGrid(size = 5) {
  const doc = fakeDocument(['world-progress-overlay', 'world-progress-fill', 'world-progress-percent', 'world-progress-stage', 'world-progress-title']);
  return { doc, elements: doc.elements };
}

function fakeWorld() {
  const chunks = new Map();
  const created = [];
  return {
    chunks,
    created,
    chunkKey: (cx, cz) => `${cx},${cz}`,
    getChunk(cx, cz) { return chunks.get(`${cx},${cz}`) || null; },
    getOrCreateChunk(cx, cz) {
      const key = `${cx},${cz}`;
      if (!chunks.has(key)) {
        const chunk = { cx, cz, dirty: true, voxels: new Uint8Array(16 * 64 * 16) };
        chunks.set(key, chunk);
        created.push(key);
      }
      return chunks.get(key);
    }
  };
}

function fakeGame({ renderDistance = 1 } = {}) {
  const world = fakeWorld();
  const meshed = [];
  return {
    world,
    meshed,
    renderDistance,
    player: { position: { x: 0.5, y: 12, z: 0.5 } },
    rebuildChunkMesh(chunk) { meshed.push(`${chunk.cx},${chunk.cz}`); chunk.dirty = false; }
  };
}

/** Records how many times it was awaited, without any real timing. */
function countingYield() {
  const calls = { count: 0 };
  const fn = async () => { calls.count += 1; };
  return { fn, calls };
}

// --- overlay controller -----------------------------------------------------

test('the overlay toggles, updates the bar and clamps out-of-range values', () => {
  const { elements } = instrumentedGrid();
  const overlay = new ProgressOverlay({ getElementById: id => elements.get(id) || null });

  assert.equal(overlay.visible, false);

  overlay.show('Generating World');
  assert.equal(overlay.visible, true);
  assert.equal(elements.get('world-progress-overlay').classList.contains('hidden'), false);
  assert.equal(elements.get('world-progress-title').textContent, 'Generating World');

  overlay.set(42.6, 'Building meshes');
  assert.equal(elements.get('world-progress-fill').style.width, '42.6%');
  assert.equal(elements.get('world-progress-percent').textContent, '43%');
  assert.equal(elements.get('world-progress-stage').textContent, 'Building meshes');

  // Defensive: bad input must never produce a broken width.
  assert.equal(overlay.set(-5, 'x'), 0);
  assert.equal(overlay.set(250, 'x'), 100);
  assert.equal(overlay.set('nonsense', 'x'), 0);
  assert.equal(clampPercent(NaN), 0);

  overlay.hide();
  assert.equal(elements.get('world-progress-overlay').classList.contains('hidden'), true);
  assert.equal(overlay.visible, false);
});

test('the overlay degrades to a no-op without a document', () => {
  const overlay = new ProgressOverlay(null);
  // Must not throw when the markup is unavailable (headless / tests).
  assert.doesNotThrow(() => overlay.show('x'));
  assert.doesNotThrow(() => overlay.set(50, 'half'));
  assert.doesNotThrow(() => overlay.hide());
  assert.equal(overlay.element, null);
});

// --- batching ---------------------------------------------------------------

test('runBatches processes every item and yields between batches, not per item', async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const seen = [];
  const { fn, calls } = countingYield();

  await runBatches(items, item => seen.push(item), { batchSize: 4, yieldFn: fn });

  assert.deepEqual(seen, items, 'every item handled in order');
  // 10 items / 4 per batch => yields after 4 and after 8, never after the last.
  assert.equal(calls.count, 2);
});

test('runBatches tolerates empty input and a nonsensical batch size', async () => {
  const { fn, calls } = countingYield();
  assert.equal(await runBatches([], () => { throw new Error('must not run'); }, { yieldFn: fn }), 0);
  assert.equal(calls.count, 0);

  const seen = [];
  await runBatches([1, 2, 3], n => seen.push(n), { batchSize: 0, yieldFn: fn });
  assert.deepEqual(seen, [1, 2, 3], 'batchSize 0 falls back to 1 rather than looping forever');
});

// --- progressive chunk loading ---------------------------------------------

test('loadChunksProgressively generates then meshes, yielding so the bar can paint', async () => {
  const game = fakeGame({ renderDistance: 1 });
  const { doc, elements } = instrumentedGrid();
  const overlay = new ProgressOverlay({ getElementById: id => elements.get(id) || null });
  const { fn, calls } = countingYield();

  const outcome = await loadChunksProgressively(game, {
    overlay,
    batchSize: 2,
    yieldFn: fn
  });

  // renderDistance 1 => a 3x3 grid of chunk coordinates.
  assert.equal(outcome.chunks, 9);
  assert.equal(game.world.created.length, 9, 'every chunk in range was generated');

  // Yielding is the whole point of this module: without it the browser cannot
  // repaint and the start screen looks frozen.
  assert.ok(calls.count > 0, `expected yields between batches, got ${calls.count}`);

  // The bar must reach 100% and only move forwards.
  assert.equal(elements.get('world-progress-fill').style.width, '100%');
  assert.equal(elements.get('world-progress-percent').textContent, '100%');

  // Meshing happens after generation, so nothing is meshed twice in one pass.
  assert.equal(new Set(game.meshed).size, game.meshed.length, 'no chunk meshed twice');
});

test('progress is reported monotonically and covers the full range', async () => {
  const game = fakeGame({ renderDistance: 2 });
  const reported = [];
  const { fn } = countingYield();

  await loadChunksProgressively(game, {
    overlay: null,
    batchSize: 3,
    yieldFn: fn,
    progress: (percent, stage) => reported.push({ percent, stage: String(stage) })
  });

  assert.ok(reported.length > 0, 'progress callbacks were emitted');
  for (let i = 1; i < reported.length; i++) {
    assert.ok(reported[i].percent >= reported[i - 1].percent,
      `progress went backwards: ${reported[i - 1].percent} -> ${reported[i].percent}`);
  }
  assert.equal(reported.at(-1).percent, 100);
  assert.ok(reported.some(r => /Generating terrain/.test(r.stage)));
  assert.ok(reported.some(r => /meshes/.test(r.stage)));
});

test('a game with no player or world reports completion instead of throwing', async () => {
  const reported = [];
  const outcome = await loadChunksProgressively({}, {
    progress: (percent, stage) => reported.push({ percent, stage })
  });
  assert.deepEqual(outcome, { chunks: 0 });
  assert.equal(reported.at(-1).percent, 100);
});

test('the default batch size is small enough to keep frames responsive', () => {
  assert.ok(DEFAULT_BATCH_SIZE >= 1 && DEFAULT_BATCH_SIZE <= 16, `unexpected batch size ${DEFAULT_BATCH_SIZE}`);
});

// --- wiring -----------------------------------------------------------------

test('the progress overlay is present in the markup and wired into the page', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  for (const id of ['world-progress-overlay', 'world-progress-fill', 'world-progress-percent', 'world-progress-stage', 'world-progress-title']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  // Starts hidden so it cannot cover the start screen before generation begins.
  assert.match(html, /id="world-progress-overlay" class="hidden"/);
  assert.match(html, /src="\/src\/progressOverlay\.js"/, 'overlay module must be loaded');
  assert.match(html, /src="\/src\/main\.js"/, 'the game entry must still be loaded');
});

test('the start button awaits generation before hiding the start screen', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  // Regression guard: the old handler hid the overlay immediately and generated
  // synchronously, which is what produced the freeze.
  assert.match(main, /await this\.generateNewWorld\(\)/);
  assert.match(main, /await this\.loadWorldProgressively\(\)/);
  assert.match(main, /loadMapWithProgress/);
});

test('the stylesheet defines the overlay so it is actually visible', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
  assert.match(css, /#world-progress-overlay/);
  assert.match(css, /\.world-progress-fill/);
});

// --- the stuck-at-100% regression -------------------------------------------

test('findMissingMethods reports the methods a target does not implement', () => {
  const ui = { updateHotbar() {}, updateStats() {} };
  assert.deepEqual(findMissingMethods(ui, ['updateHotbar', 'updateStats']), []);
  // The exact bug that froze the start screen: two methods that never existed.
  assert.deepEqual(
    findMissingMethods(ui, ['updateHotbar', 'updateHealthBar', 'updateHungerBar']),
    ['updateHealthBar', 'updateHungerBar']
  );
  assert.deepEqual(findMissingMethods(null, ['a', 'b']), ['a', 'b'], 'a missing target reports everything');
  assert.deepEqual(findMissingMethods(ui, []), []);
});

test('UIManager really implements every method the world-start path requires', () => {
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');
  for (const name of REQUIRED_UI_METHODS) {
    assert.match(ui, new RegExp(`(^|\\s)${name}\\s*\\(`), `UIManager is missing ${name}()`);
  }
});

test('the world-start path never calls an undefined UIManager method', () => {
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');

  // These two were called in generateNewWorld() but exist nowhere. Each call was a
  // TypeError that aborted the flow after the bar had reached 100%.
  assert.doesNotMatch(ui, /updateHealthBar\s*\(/, 'updateHealthBar must not appear in ui.js');
  assert.doesNotMatch(ui, /updateHungerBar\s*\(/, 'updateHungerBar must not appear in ui.js');
  assert.doesNotMatch(main, /updateHealthBar\s*\(/, 'main.js must not call updateHealthBar()');
  assert.doesNotMatch(main, /updateHungerBar\s*\(/, 'main.js must not call updateHungerBar()');
});

test('a failed world start cannot strand the player on a full progress bar', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
  assert.match(css, /#world-progress-overlay/);

  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  // There must be a catch, not just a finally: a finally alone let an exception
  // escape with the overlay still on screen.
  const handler = main.slice(main.indexOf("btnNewWorld.addEventListener"));
  const body = handler.slice(0, handler.indexOf('if (btnDesignedWorld)'));
  assert.match(body, /catch \(err\)/, 'the start handler needs a catch block');
  assert.match(body, /failWorldStart\(err\)/, 'the catch must roll the start screen back');
  assert.match(body, /finally \{/, 'cleanup must still run');
  assert.match(body, /if \(this\.worldReady\)/, 'the overlay may only hide once the world is actually ready');
  assert.match(main, /failWorldStart\s*\(err\)\s*\{/, 'failWorldStart must be defined');
});

test('pointer lock is not requested after an await, where activation has expired', () => {
  const main = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');
  const handler = main.slice(main.indexOf("btnNewWorld.addEventListener"));
  const body = handler.slice(0, handler.indexOf('if (btnDesignedWorld)'));
  assert.doesNotMatch(body, /requestPointerLock/, 'a post-await lock request is rejected by the browser');
  // It is still requested from a real user gesture on the canvas.
  assert.match(main, /domElement\.addEventListener\('click',[\s\S]{0,400}requestPointerLock\(\)/);
});


// Switching tabs while a world is made: a hidden page gets no animation frames, so waiting for one stopped
// generation (seen as "chunk 28/289" for minutes) until the player came back.
test('yielding in a hidden tab does not wait for an animation frame', async () => {
  const { yieldToBrowser } = await import('../src/progressOverlay.js');
  const saved = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  let frames = 0;
  globalThis.requestAnimationFrame = () => { frames++; }; // never calls back, as in a background tab
  try {
    globalThis.document = { visibilityState: 'hidden' };
    await yieldToBrowser();
    assert.equal(frames, 0, 'it returned without a frame (none is asked for while hidden)');

    // Visible when asked, hidden before the frame came: the frame is not waited on for ever.
    globalThis.document = { visibilityState: 'visible' };
    await yieldToBrowser();
    assert.equal(frames, 1, 'a visible page waits for a frame');
  } finally {
    globalThis.document = saved.document;
    globalThis.requestAnimationFrame = saved.raf;
  }
});

test('the generate-only ring is built during the load but never meshed', async () => {
  const chunks = new Map(); const meshed = [];
  const world = {
    getChunk: (cx, cz) => chunks.get(`${cx},${cz}`),
    getOrCreateChunk: (cx, cz) => { const c = { cx, cz, dirty: true }; chunks.set(`${cx},${cz}`, c); return c; },
  };
  const game = { player: { position: { x: 8, y: 0, z: 8 } }, world, renderDistance: 2, rebuildChunkMesh: (c) => { meshed.push(`${c.cx},${c.cz}`); c.dirty = false; } };
  await loadChunksProgressively(game, { yieldFn: async () => {}, generateRing: 1 });
  assert.equal(chunks.size, 7 * 7, 'the 5x5 square and a ring around it are generated');
  assert.equal(meshed.length, 5 * 5, 'only the square is meshed');
  assert.ok(meshed.every((k) => k.split(',').every((v) => Math.abs(Number(v)) <= 2)));
  const main = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  assert.match(main, /generateRing: Math\.max\(0, \(this\.streamer\?\.generateRadius/, 'the game asks for the streamer\'s ring');
});
