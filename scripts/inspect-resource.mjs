// Resource Inspector CLI: inspect and check blocks and items without launching the game.
//
//   node scripts/inspect-resource.mjs list [--kind item|block] [--search text]
//   node scripts/inspect-resource.mjs show <id|name>
//   node scripts/inspect-resource.mjs check <id|name> [--json]
//   node scripts/inspect-resource.mjs check --all [--json] [--group behaviour]
//   node scripts/inspect-resource.mjs dangling [--json]
//   node scripts/inspect-resource.mjs duplicates [--json]        keys a literal defines twice
//   node scripts/inspect-resource.mjs faults [--json]            dangling + duplicates, as a gate
//   node scripts/inspect-resource.mjs missing [--limit 40]        vanilla items this game lacks
//   node scripts/inspect-resource.mjs orphans [--limit 40]        harvest rows with no block, split into
//                                                                 a to-do list and a defect
//   node scripts/inspect-resource.mjs shadows [--json]            ids that shadow a vanilla id under
//                                                                 another spelling, six of them duplicates
//   node scripts/inspect-resource.mjs audit [--json]              per-check counts over everything
//
// This is the item-and-block counterpart to the Mob Inspector, and it is the loop the parity work
// runs on: a change is measured here before it is measured in the browser, and the same checks run
// in `tests/resourceInspector.test.js` so a regression fails a test rather than a play session.
//
// Vanilla comparison data comes from the gitignored `.cache/mc-data`, the same pinned `pc/1.21.4`
// snapshot `scripts/parity-coverage.mjs` uses. When it is absent the vanilla-dependent checks report
// `unsupported` instead of pretending either way, and everything else still runs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  danglingReferences,
  duplicateDefinitions,
  missingVanillaItems,
  registry as buildDefaultRegistry,
  resourceReport,
  searchResources,
  undefinedBlockConstants,
  unresolvedImports,
  shadowedVanillaIds,
  harvestOrphans,
} from '../src/resourceRegistry.js';
import { ResourceShowcase, buildVanillaIndex } from '../src/resourceShowcase.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const CACHE = path.join(root, '.cache', 'mc-data');

const readCache = (name) => {
  const p = path.join(CACHE, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

/**
 * The hand-written furnace table lives in `furnace.js`, which imports Three.js. The registry takes it
 * as a source rather than importing it, so it is loaded here, where Three.js is available and a
 * failure to load it only costs the 39 hand-written smelting rows.
 */
async function loadHandWrittenSmelting() {
  try {
    const furnace = await import('../src/furnace.js');
    return furnace.SMELTING_RECIPES;
  } catch {
    return null;
  }
}

/** The durability table is branch-dependent; `src/durability.js` does not exist everywhere. */
async function loadDurability() {
  try {
    const mod = await import('../src/durability.js');
    return mod.maxDurabilityFor ?? null;
  } catch {
    return null;
  }
}

const argv = process.argv.slice(2);
const command = argv.find((a) => !a.startsWith('-')) ?? 'help';
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const json = has('json');
const out = (value) => console.log(json ? JSON.stringify(value, null, 2) : value);

function loadVanilla() {
  const items = readCache('items.json');
  if (!items) return null;
  return buildVanillaIndex({
    items,
    recipes: readCache('recipes.json') ?? {},
    foods: readCache('foods.json') ?? [],
    blocks: readCache('blocks.json') ?? [],
  });
}

function makeInspector({ vanilla, durabilityHas, smelting }) {
  const registry = buildDefaultRegistry({ durability: durabilityHas, smelting });
  const showcase = new ResourceShowcase({
    registry,
    vanilla,
    assetExists: (icon) => {
      if (!icon) return false;
      const p = path.join(root, 'public', icon.replace(/^\//, ''));
      return fs.existsSync(p) && fs.statSync(p).size > 0;
    },
    durabilityHas,
  });
  return { registry, showcase };
}

/** Vanilla item names that no resource in this game answers to. */
function printMissing(registry, vanilla) {
  const limit = Number(flag('limit', '40'));
  const missing = missingVanillaItems(registry, vanilla);
  if (json) { out(missing); return; }
  for (const name of missing.slice(0, limit)) {
    const recipes = vanilla.recipesByResultName.get(name)?.length ?? 0;
    const uses = vanilla.recipesByIngredientName.get(name)?.length ?? 0;
    console.log(`${name.padEnd(34)} result-of ${String(recipes).padStart(3)}  ingredient-in ${String(uses).padStart(3)}`);
  }
  console.log(`\n${missing.length} vanilla item name(s) absent (showing ${Math.min(limit, missing.length)})`);
}

function printCheck(selection, showcase) {
  const results = showcase.run(selection);
  const summary = showcase.summary();
  if (json) {
    out({ selection: summary.selection, summary, results });
    return summary.failed + summary.errors === 0;
  }
  console.log(`${summary.selection}  ${summary.passed}/${summary.scored} checks passed`
    + (summary.skipped ? `  (${summary.skipped} unsupported)` : '')
    + (summary.errors ? `  ${summary.errors} errored` : ''));
  for (const r of results) {
    if (r.status === 'observed') continue;
    const icon = r.status === 'unsupported' ? '[--]' : r.status === 'error' ? '[!!]' : '[ x]';
    console.log(`  ${icon} ${r.id.padEnd(22)} ${r.detail ?? ''}`);
  }
  return summary.failed + summary.errors === 0;
}

function printReport(report) {
  if (json) { out(report); return; }
  console.log(`${report.name}  (${report.key})`);
  console.log(`  kind        ${report.kind}${report.blockId !== null ? `  places block ${report.blockId} (${report.blockName})` : ''}`);
  console.log(`  type        ${report.type ?? '(none)'}`);
  console.log(`  stack       declared ${report.stackSizeDeclared ?? '-'}  applied ${report.stackSizeApplied}`);
  console.log(`  icon        ${report.icon ?? '(none)'}${report.iconAssetExists === false ? '  [missing file]' : ''}`);
  if (report.durabilityMax !== null) console.log(`  durability  ${report.durabilityMax}`);
  if (report.tool) console.log(`  tool        ${report.tool.tool} / ${report.tool.tier ?? 'no tier'}`);
  if (report.enchantCategory) console.log(`  enchants    ${report.enchantCategory}`);
  if (report.food) console.log(`  food        hunger ${report.food.hunger} saturation ${report.food.saturation}`);
  if (report.harvest) {
    console.log(`  harvest     hardness ${report.harvest.hardness} tool ${report.harvest.tool ?? '-'}`
      + ` tier ${report.harvest.tier ?? '-'}${report.harvest.requiresTool ? ' (requires tool)' : ''}`);
    console.log(`  drops       ${(report.harvest.drops ?? []).join(', ') || '(none)'}`);
  }
  const { sources, usedAs } = report;
  console.log(`  from        crafting ${sources.crafting.length}, smelting ${sources.smelting.length},`
    + ` brewing ${sources.brewing.length}, mob loot ${sources.mobLoot.length}, block drops ${sources.blockDrops.length}`);
  console.log(`  used as     ingredient ${usedAs.craftingIngredient}, smelted ${usedAs.smeltedInto}, brewed ${usedAs.brewingIngredient}`);
}

/**
 * Run the CLI. Exported and guarded so importing this file from a test does not execute it: no test
 * in this project spawns a child process, because sandboxes commonly block a child's piped stdio.
 */
export async function main() {
  const handWritten = await loadHandWrittenSmelting();
  const durabilityHas = await loadDurability();
  const vanilla = loadVanilla();
  const active = makeInspector({ vanilla, durabilityHas, smelting: handWritten });

  switch (command) {
    case 'list': {
      const kind = flag('kind');
      const search = flag('search', '');
      const rows = searchResources(search, { kind, reg: active.registry });
      if (json) { out(rows.map((e) => ({ key: e.key, name: e.name, kind: e.kind, type: e.type }))); break; }
      for (const e of rows) {
        console.log(`${e.key.padEnd(28)} ${e.kind.padEnd(6)} ${String(e.type ?? '').padEnd(12)} ${e.name}`);
      }
      console.log(`\n${rows.length} resource(s)`);
      break;
    }
    case 'show': {
      const ref = argv[argv.indexOf('show') + 1];
      const report = resourceReport(ref, active.registry);
      if (!report) { console.error(`no resource matches ${JSON.stringify(ref)}`); process.exitCode = 1; break; }
      if (report.icon) report.iconAssetExists = active.showcase.options.assetExists(report.icon);
      printReport(report);
      break;
    }
    case 'check': {
      const all = has('all');
      const group = flag('group');
      const filter = (results) => (group ? results.filter((r) => r.group === group) : results);
      if (!all) {
        const ref = flag('id') ?? argv[argv.indexOf('check') + 1];
        if (!ref) { console.error('check needs an id, or --all'); process.exitCode = 2; break; }
        active.showcase.run(ref);
        active.showcase.results = filter(active.showcase.results);
        const ok = printCheck(ref, active.showcase);
        if (!ok) process.exitCode = 1;
        break;
      }
      const audit = active.showcase.audit(filter([...active.registry.entries.values()]));
      if (json) { out(audit); break; }
      let failed = 0;
      for (const row of audit.checks) {
        failed += row.failed;
        console.log(`${row.id.padEnd(22)} ok ${String(row.observed).padStart(4)}  failed ${String(row.failed).padStart(4)}`
          + `  unsupported ${String(row.skipped).padStart(4)}${row.error ? `  errors ${row.error}` : ''}`);
      }
      console.log(`\n${failed} failing check(s) across ${active.registry.entries.size} resources`);
      if (has('failures')) {
        const byCheck = new Map();
        for (const f of audit.failures) {
          if (!byCheck.has(f.check)) byCheck.set(f.check, []);
          byCheck.get(f.check).push(f);
        }
        for (const [check, list] of byCheck) {
          console.log(`\n## ${check} (${list.length})`);
          for (const f of list.slice(0, 60)) console.log(`   ${f.resource.padEnd(26)} ${f.detail}`);
          if (list.length > 60) console.log(`   ... ${list.length - 60} more`);
        }
      }
      if (failed) process.exitCode = 1;
      break;
    }
    case 'dangling': {
      const problems = danglingReferences(active.registry);
      if (json) { out(problems); break; }
      const byKind = new Map();
      for (const p of problems) {
        if (!byKind.has(p.kind)) byKind.set(p.kind, []);
        byKind.get(p.kind).push(p);
      }
      for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
        console.log(`## ${kind} (${list.length})`);
        const byId = new Map();
        for (const p of list) {
          const k = String(p.id);
          if (!byId.has(k)) byId.set(k, []);
          byId.get(k).push(p.from);
        }
        for (const [id, froms] of byId) {
          const refs = froms.length > 4 ? `${froms.slice(0, 4).join(', ')} +${froms.length - 4}` : froms.join(', ');
          console.log(`   ${id.padEnd(30)} ${list.find((p) => String(p.id) === id).detail}`);
          console.log(`   ${''.padEnd(30)} referenced by ${refs}`);
        }
      }
      console.log(`\n${problems.length} dangling reference(s)`);
      if (problems.length) process.exitCode = 1;
      break;
    }
    case 'missing': {
      if (!vanilla) { console.error('vanilla cache missing; run scripts/generate-mc-data.mjs'); process.exitCode = 1; break; }
      printMissing(active.registry, vanilla);
      break;
    }
    case 'orphans': {
      const limit = Number(flag('limit', '40'));
      const { missingBlock, deadByKey } = harvestOrphans(active.registry);
      const holding = missingBlock.filter((r) => r.drops.length);
      if (json) { out({ deadByKey, missingBlock }); break; }
      console.log(`harvest rows with no block: ${missingBlock.length} (${holding.length} of them declare a drop)`);
      for (const r of holding.slice(0, limit)) {
        console.log(`   ${r.name.padEnd(26)} would drop ${r.drops.join(', ')}`);
      }
      if (holding.length > limit) console.log(`   ... ${holding.length - limit} more (--limit to see them)`);
      // The defect, as opposed to the to-do list: a block that exists and a row that cannot be reached.
      console.log(`harvest rows unreachable although the block exists: ${deadByKey.length}`);
      for (const r of deadByKey) console.log(`   ${r.name} -> block ${r.blockId}`);
      if (deadByKey.length) process.exitCode = 1;
      break;
    }
    case 'shadows': {
      if (!vanilla) { console.error('vanilla cache missing; run scripts/generate-mc-data.mjs'); process.exitCode = 1; break; }
      const names = new Set([
        ...(vanilla.itemNames ?? []),
        ...(vanilla.blockNames ?? []),
      ]);
      const found = shadowedVanillaIds(active.registry, names);
      if (json) { out(found); break; }
      const duplicates = found.filter((s) => s.bothRegistered);
      console.log(`ids shadowing a vanilla spelling: ${found.length}`
        + `  (${duplicates.length} are duplicates: both ids are registered)`);
      for (const s of found) {
        console.log(`   ${s.id.padEnd(22)} shadows ${s.vanilla.padEnd(20)}`
          + (s.bothRegistered ? 'DUPLICATE - two items for one vanilla item' : 'renamed, not a duplicate'));
      }
      break;
    }
    case 'duplicates': {
      // A repeated key in a registry literal silently discards the earlier definition, which is how a
      // golden carrot lost its food value. The scan needs the file text, so it is read here rather
      // than in the registry, which stays free of the filesystem.
      const registrySource = fs.readFileSync(path.join(root, 'src', 'blocks.js'), 'utf8');
      const found = ['ITEMS', 'BLOCKS', 'BLOCK_DEFS']
        .flatMap((literal) => duplicateDefinitions(registrySource, literal).map((d) => ({ literal, ...d })));
      if (json) { out(found); break; }
      if (!found.length) { console.log('no duplicate definitions in src/blocks.js'); break; }
      for (const d of found) {
        console.log(`${d.literal}.${d.key}  defined at lines ${d.lines.join(', ')}`
          + '  (only the last one is used)');
      }
      console.log(`\n${found.length} silently overridden definition(s)`);
      process.exitCode = 1;
      break;
    }
    case 'faults': {
      const problems = danglingReferences(active.registry);
      // Source scans need the file text, so they are read here; the registry itself stays free of the
      // filesystem so it can run in the browser too.
      const scanFiles = ['blocks.js', 'furnace.js', 'extraItems.js', 'extraContent.js'];
      const duplicates = [];
      const undefinedKeys = [];
      for (const file of scanFiles) {
        const text = fs.readFileSync(path.join(root, 'src', file), 'utf8');
        for (const literal of ['ITEMS', 'BLOCKS', 'BLOCK_DEFS']) {
          for (const d of duplicateDefinitions(text, literal)) duplicates.push({ file, literal, ...d });
        }
        for (const u of undefinedBlockConstants(text)) undefinedKeys.push({ file, ...u });
      }
      const report = {
        dangling: problems.length,
        danglingByKind: problems.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {}),
        duplicates,
        undefinedBlockConstants: undefinedKeys,
      };
      if (json) { out(report); break; }
      console.log(`dangling references: ${problems.length}`);
      for (const [kind, n] of Object.entries(report.danglingByKind)) console.log(`   ${kind.padEnd(18)} ${n}`);
      console.log(`duplicate definitions: ${duplicates.length}`);
      for (const d of duplicates) console.log(`   ${d.file} ${d.literal}.${d.key} at lines ${d.lines.join(', ')}`);
      console.log(`undefined BLOCKS constants used as keys: ${undefinedKeys.length}`);
      for (const u of undefinedKeys) console.log(`   src/${u.file}:${u.line}  BLOCKS.${u.constant}`);

      // Every module in src/ and tests/, so a rename that moves a file or changes an export is caught here
      // rather than by a browser that will not load. The building/structure rename left five stale paths in
      // src/ and six in tests/ -- the studio area reported five failed files for a day, and the cause was
      // three deleted module paths rather than anything the tests were testing.
      const sources = {};
      const collect = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { if (entry.name !== 'node_modules') collect(full); }
          else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
            sources[path.relative(root, full).replace(/\\/g, '/')] = fs.readFileSync(full, 'utf8');
          }
        }
      };
      collect(path.join(root, 'src'));
      collect(path.join(root, 'tests'));
      collect(path.join(root, 'scripts'));
      const moduleFaults = unresolvedImports(sources);
      const inTests = moduleFaults.filter((m) => m.file.startsWith('tests/')).length;
      console.log(`unresolved imports and missing exports: ${moduleFaults.length}`
        + ` (src ${moduleFaults.length - inTests}, tests ${inTests})`);
      for (const m of moduleFaults) {
        console.log(`   ${m.file}:${m.line}  ${m.kind}  ${m.specifier}${m.name ? ` -> ${m.name}` : ''}`);
      }
      report.moduleFaults = moduleFaults;
      if (problems.length || duplicates.length || moduleFaults.length) process.exitCode = 1;
      break;
    }
    case 'audit': {
      const audit = active.showcase.audit([...active.registry.entries.values()]);
      if (json) { out({ stats: active.registry.stats, checks: audit.checks }); break; }
      console.log('registry ' + JSON.stringify(active.registry.stats));
      for (const row of audit.checks) {
        console.log(`${row.id.padEnd(22)} ok ${String(row.observed).padStart(4)}  failed ${String(row.failed).padStart(4)}`
          + `  unsupported ${String(row.skipped).padStart(4)}`);
      }
      break;
    }
    default:
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 16).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      break;
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
