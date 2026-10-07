// The one call a game makes: take a store, put every enabled pack into the world, and be able to undo it.
//
// Everything else is a piece. `dataPack.js` reads files, `dataPackAdapters.js` translates them,
// `dataPackRuntime.js` writes them into the registries, `dataPackStore.js` remembers them and
// `dataPackBundle.js` fetches the shipped default. This joins them up so `main.js` needs one call and not
// five, and so the ORDER is in one place -- a pack cannot be applied before the one it overrides.
import { createDataPack, mergePacks, readPackMeta } from './dataPack.js';
import { applyDataPack, revertDataPack, describeApplied } from './dataPackRuntime.js';
import { enabledPacks, allPacks, PACK_SOURCES } from './dataPackStore.js';

/**
 * Apply every enabled pack in a store.
 *
 * @param {object} store from `createPackStore` / `restorePacks`
 * @returns {{applied:Array, records:Array, summary:string[], failed:Array}}
 *   `records` is what `revertAll` needs; `applied` is the per-pack detail.
 */
export function applyStore(store) {
  const records = [];
  const applied = [];
  const failed = [];

  for (const pack of enabledPacks(store)) {
    if (!pack.files) {
      // A bundled pack whose files never arrived. Named rather than silently skipped, because the store says
      // it is enabled and applying nothing would look like it had worked.
      failed.push({ name: pack.name, reason: 'no files: still waiting for the bundle' });
      continue;
    }
    const meta = readPackMeta(pack.files);
    const built = createDataPack({
      name: pack.name,
      format: meta?.format ?? pack.format ?? undefined,
      description: meta?.description ?? '',
      files: pack.files,
    });
    if (built.entries.length === 0) {
      failed.push({
        name: pack.name,
        reason: built.skipped.length
          ? `nothing loadable (${built.skipped.length} file(s) skipped: ${built.skipped[0].reason})`
          : 'nothing loadable',
      });
      continue;
    }
    const record = applyDataPack(mergePacks([built]), { name: pack.name });
    records.push(record);
    applied.push({ pack, built, record });
  }

  return {
    applied,
    records,
    failed,
    summary: [...applied.map(a => describeApplied(a.record)), ...failed.map(f => `${f.name}: ${f.reason}`)],
  };
}

/**
 * Undo everything `applyStore` did.
 *
 * Reversed, so the pack that was applied last comes off first. The order matters for exactly the reason it
 * matters on the way in: reverting a lower pack while a higher one still overrides it would restore the
 * lower pack's value underneath the override, and then the higher one's revert would leave that value
 * behind.
 */
export function revertAll(result) {
  if (!result?.records) return 0;
  let n = 0;
  for (const record of [...result.records].reverse()) {
    if (revertDataPack(record)) n++;
  }
  return n;
}

/**
 * A report of what a store holds, for a UI or a test.
 *
 * Names every pack with its source, whether it is on, and whether it can survive a save -- so a player can
 * see that a pack is too large to keep BEFORE they save and lose it.
 */
export function describeStore(store) {
  return allPacks(store).map(pack => ({
    name: pack.name,
    source: pack.source,
    enabled: pack.enabled,
    bytes: pack.bytes,
    persisted: pack.persisted,
    awaitingBundle: pack.awaitingBundle === true,
    bundled: pack.source === PACK_SOURCES.BUNDLED,
  }));
}
