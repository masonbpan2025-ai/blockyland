import { World } from './world.js';
import { createPackStore, addPack } from './dataPackStore.js';
import { applyStore, revertAll } from './dataPackApply.js';

/**
 * The terrain worker's side of the conversation, kept apart from the Worker plumbing so a test (or a browser
 * without module workers) can run it in the page itself.
 *
 * Messages in:
 *   { type: 'init', epoch, config }   build a copy of the game's world: same seed, biome choice, data packs and
 *                                      structure list (TerrainWorkerClient.configFor)
 *   { type: 'generate', epoch, id, cx, cz, appliedKeys, realizedKeys }
 *
 * Messages out:
 *   { type: 'ready', epoch }
 *   { type: 'chunk', epoch, id, result }   result from World.generateDetached, plus `ms`
 *   { type: 'error', epoch, id?, message }
 *
 * @param {object} [options]
 * @param {boolean} [options.sharedRealm] true when running in the game's own page: the data packs are already in
 *   the shared registries, and applying them again would apply them twice
 */
export function createTerrainService({ sharedRealm = false } = {}) {
  let world = null;
  let epoch = -1;
  let packRecords = null;

  function init(message) {
    const config = message.config ?? {};
    if (!sharedRealm) {
      if (packRecords) revertAll(packRecords);
      packRecords = null;
      if (config.packs?.length) {
        const store = createPackStore();
        for (const pack of config.packs) addPack(store, { ...pack, enabled: true });
        packRecords = applyStore(store);
      }
    }
    world = new World(config.seed, config.selectedBiome);
    // The game builds its structure engine after applying its packs; this copy has applied the same packs, and is
    // given the game's own list of enabled structures rather than working it out again.
    if (config.enabledIds) world.rebuildStructures({ enabledIds: config.enabledIds });
    if (Number.isFinite(config.seaLevel)) world.seaLevel = config.seaLevel;
    epoch = message.epoch;
    return { reply: { type: 'ready', epoch } };
  }

  function generate(message) {
    if (!world || message.epoch !== epoch) {
      return { reply: { type: 'error', epoch: message.epoch, id: message.id, message: 'stale or uninitialised terrain service' } };
    }
    const started = now();
    const result = world.generateDetached(message.cx, message.cz, message.appliedKeys ?? [], message.realizedKeys ?? []);
    if (result.unrecordable) {
      return { reply: { type: 'error', epoch, id: message.id, message: `chunk ${message.cx},${message.cz} did something that cannot be sent to the game` } };
    }
    result.ms = now() - started;
    return {
      reply: { type: 'chunk', epoch, id: message.id, result },
      transfer: [result.voxels.buffer, result.waterLevels.buffer],
    };
  }

  return {
    /** @returns {{reply: object, transfer?: ArrayBuffer[]}} */
    handle(message) {
      try {
        if (message?.type === 'init') return init(message);
        if (message?.type === 'generate') return generate(message);
        return { reply: { type: 'error', epoch: message?.epoch, message: `unknown message ${message?.type}` } };
      } catch (err) {
        return { reply: { type: 'error', epoch: message?.epoch, id: message?.id, message: String(err?.stack || err) } };
      }
    },
  };
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
