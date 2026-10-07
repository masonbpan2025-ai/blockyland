// Build the bundled vanilla data pack.
//
// The game ships with a vanilla pack as its default content source. Downloading 3085 files one at a time
// would take minutes, so this runs them concurrently with a retry, and the result is written in the SAME
// shape `filesFromText` already accepts for pasted input -- a map of pack path to JSON. One format, one
// loader, whether the pack came from disk or from the clipboard.
//
// Curated rather than complete: only the types that have an adapter and a consumer. The full data pack is
// 5922 files and includes thousands of things this game has no concept of.
//
// Run: node scripts/build-vanilla-pack.mjs
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Pinned, not "latest". The layout and the schema both changed in 1.21.5, and the adapters target this. */
export const VANILLA_PACK_REF = '1.21.4-data';
export const VANILLA_PACK_FILE = 'public/datapacks/vanilla-1.21.4.json';
export const VANILLA_PACK_META = 'public/datapacks/vanilla-1.21.4.meta.json';

/**
 * What a vanilla data pack declares about itself, copied verbatim from the vanilla `pack.mcmeta`.
 *
 * Fetched from the pinned tag rather than invented, so the bundled default carries the SAME settings a
 * typical Minecraft data pack does -- the same description string and the same `pack_format`. A pack without
 * a `pack.mcmeta` is not what Minecraft ships, and a reader that trusts the declared format would have
 * nothing to read.
 *
 * If the fetch fails this falls back to the values read off that file on 2025-01-01, so a build is not
 * blocked by GitHub being briefly unavailable.
 */
export const VANILLA_PACK_MCMETA_FALLBACK = Object.freeze({
  pack: Object.freeze({ description: 'The default data for Minecraft', pack_format: 61 }),
});

/** The vanilla data pack's own `pack.mcmeta`, or the fallback when it cannot be read. */
async function fetchVanillaPackMeta() {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/misode/mcmeta/${VANILLA_PACK_REF}/pack.mcmeta`);
    if (!res.ok) return { meta: VANILLA_PACK_MCMETA_FALLBACK, fetched: false };
    const json = JSON.parse(await res.text());
    if (!json?.pack || typeof json.pack !== 'object') return { meta: VANILLA_PACK_MCMETA_FALLBACK, fetched: false };
    return { meta: json, fetched: true };
  } catch {
    return { meta: VANILLA_PACK_MCMETA_FALLBACK, fetched: false };
  }
}

/** The types this loader has adapters for and the game can consume. */
export const VANILLA_PACK_PREFIXES = [
  'worldgen/biome/',
  'dimension_type/',
  'tags/item/',
  'tags/block/',
  'recipe/',
  'loot_table/blocks/',
  'worldgen/placed_feature/',
  'worldgen/structure/',
];

const PREFIX = 'data/minecraft/';
const CONCURRENCY = 24;

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(await res.text());
    } catch (err) {
      lastError = err;
      // A little backoff, so a transient failure is not the end of a two-minute build.
      await new Promise(r => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw new Error(`${url}: ${lastError?.message}`);
}

/** Run `worker` over `items` with a bounded number in flight. */
async function pool(items, worker, limit = CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const force = process.argv.includes('--force');
  if (!force && existsSync(VANILLA_PACK_FILE) && existsSync(VANILLA_PACK_META)) {
    // The bundle is checked in, so a rebuild is deliberate rather than something every install does.
    const meta = JSON.parse(readFileSync(VANILLA_PACK_META, 'utf8'));
    console.log(`  already built: ${meta.files} files, ${(meta.bytes / 1024).toFixed(0)} KB, ref ${meta.ref}`);
    console.log('  pass --force to refetch');
    return;
  }

  console.log(`  listing ${VANILLA_PACK_REF}...`);
  const treeRes = await fetch(`https://api.github.com/repos/misode/mcmeta/git/trees/${VANILLA_PACK_REF}?recursive=1`);
  if (!treeRes.ok) throw new Error(`tree: HTTP ${treeRes.status}`);
  const tree = await treeRes.json();
  if (tree.truncated) throw new Error('the tree listing was truncated; refusing to build a partial pack');

  const wanted = tree.tree
    .filter(e => e.type === 'blob' && e.path.startsWith(PREFIX) && e.path.endsWith('.json'))
    .filter(e => VANILLA_PACK_PREFIXES.some(p => e.path.slice(PREFIX.length).startsWith(p)))
    .map(e => e.path)
    .sort();
  console.log(`  ${wanted.length} files to fetch`);

  let done = 0;
  const files = {};
  const failed = [];
  await pool(wanted, async (path) => {
    const url = `https://raw.githubusercontent.com/misode/mcmeta/${VANILLA_PACK_REF}/${path}`;
    try {
      const json = await fetchJson(url);
      if (json !== null) files[path] = json;
      else failed.push(path);
    } catch (err) {
      failed.push(`${path}: ${err.message}`);
    }
    done++;
    if (done % 500 === 0) console.log(`    ${done}/${wanted.length}`);
  });

  if (failed.length) {
    // A partial pack is worse than none: it would silently load less content than it claims.
    console.error(`  ${failed.length} files failed; refusing to write a partial pack`);
    for (const f of failed.slice(0, 10)) console.error('    ' + f);
    process.exit(1);
  }

  // The pack's own `pack.mcmeta`, copied from vanilla. A data pack without one is not what Minecraft ships,
  // and a reader that trusts the declared format would have nothing to read.
  const { meta: vanillaMeta, fetched: metaFetched } = await fetchVanillaPackMeta();
  files['pack.mcmeta'] = vanillaMeta;
  console.log(`  pack.mcmeta: ${metaFetched ? 'read from the tag' : 'FALLBACK (could not fetch)'}`
    + ` -- format ${vanillaMeta.pack.pack_format}`);

  // Sorted keys, so the file is stable and a rebuild produces the same bytes when the data has not changed.
  const ordered = {};
  for (const key of Object.keys(files).sort()) ordered[key] = files[key];
  const text = JSON.stringify(ordered);
  const bytes = Buffer.byteLength(text, 'utf8');
  const sha256 = createHash('sha256').update(text).digest('hex');

  mkdirSync('public/datapacks', { recursive: true });
  writeFileSync(VANILLA_PACK_FILE, text, 'utf8');
  const meta = {
    // The same settings a typical Minecraft data pack declares, so the bundled default can be compared
    // against one rather than taken on trust.
    name: 'Vanilla 1.21.4',
    pack: vanillaMeta.pack,
    format: vanillaMeta.pack.pack_format,
    packMetaFromTag: metaFetched,
    ref: VANILLA_PACK_REF,
    source: 'https://github.com/misode/mcmeta',
    generator: 'https://misode.github.io/',
    files: Object.keys(ordered).length,
    bytes,
    sha256,
    types: VANILLA_PACK_PREFIXES,
    builtBy: 'scripts/build-vanilla-pack.mjs',
  };
  writeFileSync(VANILLA_PACK_META, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  console.log(`  wrote ${VANILLA_PACK_FILE}`);
  console.log(`    ${meta.files} files, ${(bytes / 1024).toFixed(0)} KB, sha256 ${sha256.slice(0, 16)}...`);
}

// Only run when invoked directly, so the prefixes can be imported for a test.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  await main();
}
