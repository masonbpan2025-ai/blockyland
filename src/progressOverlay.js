// World-generation / map-loading progress UI.
//
// Why this exists: building the initial chunks and meshing them is synchronous
// and CPU bound. Because it ran inside a single task, the browser could not paint
// anything until the whole job finished, so the start screen simply froze for a
// few seconds. The fix has two halves:
//
//   1. the work is split into chunks, and the main thread yields between them so
//      the browser can repaint the progress bar; and
//   2. progress is reported through a single overlay element.
//
// Everything here is DOM-optional and every value is defensive, so the same code
// runs unchanged in the browser and under `node --test` (where there is no
// `document`).

export const OVERLAY_ID = 'world-progress-overlay';
export const FILL_ID = 'world-progress-fill';
export const PERCENT_ID = 'world-progress-percent';
export const STAGE_ID = 'world-progress-stage';
export const TITLE_ID = 'world-progress-title';

/** Default number of items handled per animation frame while yielding. */
export const DEFAULT_BATCH_SIZE = 4;

/** Give the browser a chance to paint. Must be a macrotask, not a microtask. */
export function yieldToBrowser() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

/**
 * Which of `names` are absent as methods on `target`.
 *
 * Exists because a call to a UI method that does not exist throws inside the
 * world-start path, which previously left the progress overlay pinned at 100%
 * with no error shown anywhere. Callers use this to detect that class of bug
 * rather than discovering it as a frozen start screen.
 */
export function findMissingMethods(target, names) {
  const list = Array.isArray(names) ? names : [];
  if (!target) return list.slice();
  return list.filter(name => typeof target[name] !== 'function');
}

/** UI surface the world-start path touches. Keep in sync with Game#generateNewWorld. */
export const REQUIRED_UI_METHODS = ['updateHotbar', 'updateStats'];

/**
 * Drive the loading overlay.
 *
 * The element lookups happen per call rather than in the constructor so the
 * overlay exists regardless of whether this module loads before or after the
 * markup is parsed.
 */
export class ProgressOverlay {
  constructor(doc = typeof document !== 'undefined' ? document : null) {
    this.doc = doc;
    this.visible = false;
  }

  get element() {
    return this.doc ? this.doc.getElementById(OVERLAY_ID) : null;
  }

  show(title = 'Loading') {
    if (this.element) {
      const titleEl = this.doc.getElementById(TITLE_ID);
      if (titleEl) titleEl.textContent = title;
      this.element.classList.remove('hidden');
    }
    this.visible = true;
    this.set(0, 'Preparing…');
    return this;
  }

  /** Update the bar. Never throws, even if the markup is missing. */
  set(percent, stage) {
    const clamped = clampPercent(percent);
    if (this.doc) {
      const fill = this.doc.getElementById(FILL_ID);
      if (fill) fill.style.width = `${clamped}%`;
      const label = this.doc.getElementById(PERCENT_ID);
      if (label) label.textContent = `${Math.round(clamped)}%`;
      const stageEl = this.doc.getElementById(STAGE_ID);
      if (stageEl && stage !== undefined && stage !== null) stageEl.textContent = String(stage);
      const track = fill && fill.parentElement;
      if (track && track.setAttribute) track.setAttribute('aria-valuenow', String(Math.round(clamped)));
    }
    return clamped;
  }

  hide() {
    if (this.element) this.element.classList.add('hidden');
    this.visible = false;
    return this;
  }
}

/**
 * Async twin of Game#loadChunksAroundPlayer.
 *
 * Keeps the same two-pass order (generate neighbours before meshing, so boundary
 * water depth and face culling see real terrain rather than empty air) but
 * reports progress and yields between batches.
 */
export async function loadChunksProgressively(game, options = {}) {
  const {
    overlay = null,
    progress = null,
    yieldFn = yieldToBrowser,
    batchSize = DEFAULT_BATCH_SIZE,
    label = 'Generating terrain'
  } = options;

  const report = (percent, stage) => {
    if (overlay) overlay.set(percent, stage);
    if (typeof progress === 'function') progress(percent, stage);
  };

  const player = game && game.player;
  const world = game && game.world;
  if (!player || !player.position || !world) {
    report(100, 'Nothing to load');
    return { chunks: 0 };
  }

  // Imported lazily by the caller; fall back to the chunk size used everywhere
  // else in the project when it is not supplied.
  const sizeX = options.chunkSizeX || 16;
  const sizeZ = options.chunkSizeZ || 16;
  const renderDistance = Number.isFinite(game.renderDistance) ? game.renderDistance : 4;

  const pcx = Math.floor(player.position.x / sizeX);
  const pcz = Math.floor(player.position.z / sizeZ);

  const coordinates = [];
  for (let cx = pcx - renderDistance; cx <= pcx + renderDistance; cx++) {
    for (let cz = pcz - renderDistance; cz <= pcz + renderDistance; cz++) {
      coordinates.push([cx, cz]);
    }
  }

  const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

  // Pass 1 — generate terrain (0 → 55%).
  await runBatches(coordinates, ([cx, cz]) => {
    if (world.getChunk(cx, cz)) return;
    world.getOrCreateChunk(cx, cz);
    for (const [dx, dz] of neighbours) {
      const neighbour = world.getChunk(cx + dx, cz + dz);
      if (neighbour) neighbour.dirty = true;
    }
  }, {
    batchSize,
    yieldFn,
    onBatch: (finished, total) => {
      report((55 * finished) / total, `${label} — chunk ${finished}/${total}`);
    }
  });

  // Pass 2 — mesh the dirty chunks (55 → 100%). No chunk creation here: pass 1
  // already materialised every one of these coordinates.
  const dirty = coordinates.filter(([cx, cz]) => {
    const chunk = world.getChunk(cx, cz);
    return chunk && chunk.dirty;
  });

  await runBatches(dirty, ([cx, cz]) => {
    const chunk = world.getChunk(cx, cz);
    if (chunk && chunk.dirty && typeof game.rebuildChunkMesh === 'function') {
      game.rebuildChunkMesh(chunk);
    }
  }, {
    batchSize,
    yieldFn,
    onBatch: (finished, total) => {
      report(55 + (45 * finished) / total, `Building meshes — ${finished}/${total}`);
    }
  });

  report(100, 'World ready');
  return { chunks: coordinates.length, meshed: dirty.length };
}

/** Shared batching loop: yields between batches and reports batch counts. */
export async function runBatches(items, handler, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const { batchSize = DEFAULT_BATCH_SIZE, yieldFn = yieldToBrowser, onBatch = null } = options;
  const total = list.length;
  const size = Math.max(1, Math.floor(batchSize) || 1);

  for (let index = 0; index < total; index++) {
    handler(list[index], index);
    const finished = index + 1;
    if (finished < total && finished % size === 0) {
      if (onBatch) onBatch(finished, total);
      await yieldFn();
    }
  }
  if (onBatch) onBatch(total, total);
  return list.length;
}

/** Create the overlay, or return null when there is no document (tests, SSR). */
export function createProgressOverlay() {
  if (typeof document === 'undefined') return null;
  return new ProgressOverlay(document);
}

// Browser convenience hook. main.js owns the real flow; this only guarantees the
// overlay is hidden when the page first paints.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const ready = () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.add('hidden');
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
  // Exposed so other scripts (or a future refactor) can drive the same overlay.
  window.WorldProgress = window.WorldProgress || { ProgressOverlay, loadChunksProgressively, yieldToBrowser };
}
