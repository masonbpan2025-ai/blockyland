/**
 * What generating one chunk did besides writing its own voxels, as an ordered list a second world can replay.
 *
 * Terrain generation is a pure function of the seed, the settings and the chunk's coordinates (no chunk reads
 * or writes another; tests/terrainWorker.test.js holds it to that). So a chunk can be generated in a worker, by
 * a copy of the world, and handed to the game. Its voxels travel as arrays; everything else it did is listed
 * here, in the order it happened:
 *
 *   ['set', key, value]       a direct write to `structureOrientations` (cave vines, dripstone...)
 *   ['delete', key]           a direct removal from it
 *   ['orient', request]       a structure telling the game which way a block faces (door, chest, stair...)
 *   ['spawn', request]        a structure asking the game for a mob (villagers, the hut's witch...)
 *
 * Orientation and spawn requests go to the game through the same hooks the game's own generation uses, so a
 * door is adopted by the door manager and a villager is spawned by the mob manager exactly as before. Map
 * writes that happen INSIDE one of those hooks are not listed: replaying the request makes them again.
 *
 * Two modes:
 *   - capture (the worker): the request is recorded and applied to the worker's own copy of the world, and
 *     the structure engine is told it was delivered. The worker has no mob or door managers.
 *   - observe (the game): the request is recorded and then handed to the game's real hook, whose answer is
 *     returned unchanged. Used to check the worker against the game (see TerrainWorkerClient).
 */
export class GenerationRecorder {
  constructor({ capture = false } = {}) {
    this.capture = capture;
    this.ops = [];
    /** Set when something could not be copied. The record is then unusable, but generation is never interrupted. */
    this.unrecordable = false;
    /** Above zero while a hook runs, whose own map writes the replayed request will repeat. */
    this.muted = 0;
  }

  /** A write to the orientation map (OrientationMap calls this). */
  mapSet(key, value) {
    if (this.muted === 0) this.ops.push(['set', key, this.copy(value)]);
  }

  mapDelete(key) {
    if (this.muted === 0) this.ops.push(['delete', key]);
  }

  /** A structure's orientation request. `apply` is the world's real handler. */
  orient(request, apply) {
    this.ops.push(['orient', this.copy(request)]);
    this.muted++;
    try {
      const delivered = apply(request);
      return this.capture ? true : delivered;
    } finally {
      this.muted--;
    }
  }

  /** A structure's spawn request. `apply` is the world's real handler, which the worker does not have. */
  spawn(request, apply) {
    this.ops.push(['spawn', this.copy(request)]);
    if (this.capture) return true;
    this.muted++;
    try {
      return apply(request);
    } finally {
      this.muted--;
    }
  }

  /** A copy that survives `postMessage` and that a hook can mutate without changing the record. Never throws. */
  copy(value) {
    if (value === undefined) return undefined;
    try {
      return structuredClone(value);
    } catch {
      this.unrecordable = true;
      return null;
    }
  }
}
