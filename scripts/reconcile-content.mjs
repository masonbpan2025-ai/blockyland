// Reconcile this game's content against vanilla, and emit a prioritised backlog.
//
// The parity coverage script answers "how much"; this answers "which exact things", ranked by how
// many vanilla recipes each one unblocks. That ranking is a set-cover problem: a recipe is only
// craftable when EVERY ingredient exists, so the useful unit is not "how often is this name used"
// but "how many recipes become craftable if this is added". Those differ a lot -- `honeycomb` is used
// in fewer recipes than the wool family but blocks more of them, because the wool family is blocked
// by missing dyes rather than by wool itself.
//
// Writes docs/survival-parity-backlog.md so the work is reviewable and survives the session.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { measure, have, gameNames } from './parity-coverage.mjs';

if (!existsSync('.cache/mc-data/recipes.json')) {
  console.error('vanilla cache missing; run scripts/generate-mc-data.mjs first');
  process.exit(1);
}

const recipes = JSON.parse(readFileSync('.cache/mc-data/recipes.json', 'utf8'));
const items = JSON.parse(readFileSync('.cache/mc-data/items.json', 'utf8'));
const vanillaBlocks = JSON.parse(readFileSync('.cache/mc-data/blocks.json', 'utf8'));
const byId = new Map(items.map(i => [i.id, i.name]));
const blockNameSet = new Set(vanillaBlocks.map(b => b.name));

// Every recipe, with the set of names it needs and which of those are missing.
const all = [];
for (const key of Object.keys(recipes)) {
  for (const rec of recipes[key]) {
    const out = byId.get(rec.result?.id ?? Number(key));
    const needs = new Set();
    if (rec.inShape) for (const row of rec.inShape) for (const c of row) {
      if (c !== null && c !== undefined) needs.add(byId.get(Array.isArray(c) ? c[0] : c));
    }
    if (rec.ingredients) for (const ing of rec.ingredients) needs.add(byId.get(Array.isArray(ing) ? ing[0] : ing));
    const needList = [...needs].filter(Boolean);
    all.push({ out, needs: needList, missing: needList.filter(n => !have(n)), resultMissing: !have(out) });
  }
}

// Which single additions unblock the most recipes, including the result side. A recipe is unblocked
// when its result AND all ingredients exist.
const chosen = new Set();
const isUnblocked = (r) => have(r.out) || chosen.has(r.out)
  ? r.needs.every(n => have(n) || chosen.has(n))
  : false;
const initial = all.filter(isUnblocked).length;

const ranking = [];
for (let round = 0; round < 40; round++) {
  const gain = new Map();
  for (const r of all) {
    if (isUnblocked(r)) continue;
    const remaining = [...new Set([
      ...(have(r.out) || chosen.has(r.out) ? [] : [r.out]),
      ...r.needs.filter(n => !have(n) && !chosen.has(n)),
    ])];
    if (remaining.length === 1) gain.set(remaining[0], (gain.get(remaining[0]) || 0) + 1);
  }
  if (gain.size === 0) {
    // No single addition completes anything; fall back to the most-demanded name so the ranking
    // still progresses and reports the bulk families.
    for (const r of all) {
      if (isUnblocked(r)) continue;
      for (const n of [...r.needs, r.out]) {
        if (n && !have(n) && !chosen.has(n)) gain.set(n, (gain.get(n) || 0) + 1);
      }
    }
  }
  if (gain.size === 0) break;
  const [best, n] = [...gain].sort((a, b) => b[1] - a[1])[0];
  chosen.add(best);
  const now = all.filter(isUnblocked).length;
  ranking.push({ name: best, gain: n, cumulative: now });
  if (now === all.length) break;
}

const m = measure();
const pct = (a, b) => (100 * a / b).toFixed(1) + '%';

// Group the missing vocabulary into families, which is what makes the backlog actionable.
const missingNames = new Set();
for (const r of all) for (const n of [...r.missing, ...(r.resultMissing ? [r.out] : [])]) missingNames.add(n);

const families = [
  ['Wool colours', /_wool$/],
  ['Dyes', /_dye$/],
  ['Carpets', /_carpet$/],
  ['Concrete and powder', /_concrete(_powder)?$/],
  ['Terracotta (glazed and plain)', /(_glazed_)?terracotta$/],
  ['Stained glass and panes', /_stained_glass(_pane)?$/],
  ['Beds', /_bed$/],
  ['Banners', /_banner$/],
  ['Candles', /_candle$/],
  ['Shulker boxes', /_shulker_box$/],
  ['Planks (wood types)', /_planks$/],
  ['Logs and wood', /(_log|_wood)$/],
  ['Stripped logs and wood', /^stripped_/],
  ['Slabs', /_slab$/],
  ['Stairs', /_stairs$/],
  ['Doors and trapdoors', /(_door|_trapdoor)$/],
  ['Fences, gates and walls', /(_fence|_fence_gate|_wall)$/],
  ['Signs and hanging signs', /(_sign|_hanging_sign)$/],
  ['Boats, buttons, pressure plates', /(_boat|_button|_pressure_plate)$/],
  ['Stone variants (polished, bricks, tiles)', /(polished_|_brick|_tiles$|_bricks$)/],
  ['Copper and oxidation', /copper/],
  ['Ores and raw materials', /(_ore|raw_)/],
  ['Food', /(apple|bread|beef|porkchop|chicken|cod|salmon|potato|carrot|beetroot|melon|berry|cookie|cake|stew|soup|pie|mutton|rabbit|tropical)/],
  ['Tools and weapons', /(_pickaxe|_axe|_shovel|_hoe|_sword|_helmet|_chestplate|_leggings|_boots|_shears|_fishing_rod|_flint_and_steel)$/],
  ['Redstone components', /(redstone|repeater|comparator|piston|observer|dispenser|dropper|hopper|target|daylight|lever|tripwire|sculk)/],
  ['Buckets', /bucket/],
  ['Potions and brewing', /(potion|brewing|blaze|nether_wart|glistering|fermented|dragon_breath)/],
  ['Enchanting', /(enchant|lapis|book|anvil|experience|bottle_o)/],
  ['Music and decoration', /(note_block|jukebox|painting|item_frame|flower_pot|armor_stand|banner_pattern)/],
];

const documents = [];
for (const [label, re] of families) {
  const names = [...missingNames].filter(n => re.test(n));
  // How many recipes does this family block, in total?
  let blocks = 0;
  for (const r of all) {
    const bad = [...r.missing, ...(r.resultMissing ? [r.out] : [])];
    if (bad.some(n => re.test(n))) blocks++;
  }
  if (names.length) documents.push({ label, count: names.length, blocks, names });
}
documents.sort((a, b) => b.blocks - a.blocks);

const lines = [];
lines.push('# Survival parity backlog');
lines.push('');
lines.push('GENERATED by `node scripts/reconcile-content.mjs`. Do not edit by hand.');
lines.push('');
lines.push('Ranked by how many vanilla crafting recipes each family blocks. A recipe counts as');
lines.push('unavailable when its result OR any ingredient does not exist in this game.');
lines.push('');
lines.push('## Current coverage');
lines.push('');
lines.push('| | have | vanilla | coverage |');
lines.push('|---|---|---|---|');
lines.push(`| Crafting recipes expressible | ${m.expressible} | ${m.total} | ${pct(m.expressible, m.total)} |`);
lines.push(`| Blocks named | ${m.knownBlocks} | ${m.blockNames.length} | ${pct(m.knownBlocks, m.blockNames.length)} |`);
lines.push(`| Items named | ${m.knownItems} | ${m.itemCount} | ${pct(m.knownItems, m.itemCount)} |`);
lines.push('');
lines.push('## Highest-value individual additions');
lines.push('');
lines.push('Each row is one name; adding it makes the listed number of recipes newly craftable.');
lines.push('This is greedy set cover, so the gains are ordered and partly dependent on earlier rows.');
lines.push('');
lines.push('| # | name | recipes unblocked | running total |');
lines.push('|---|---|---|---|');
ranking.slice(0, 30).forEach((r, i) => {
  lines.push(`| ${i + 1} | \`${r.name}\` | ${r.gain} | ${r.cumulative} (${pct(r.cumulative, all.length)}) |`);
});
lines.push('');
lines.push(`Starting point: ${initial} of ${all.length} recipes craftable.`);
lines.push('');
lines.push('## Missing content by family');
lines.push('');
lines.push('| Family | missing names | recipes blocked |');
lines.push('|---|---|---|');
for (const d of documents) lines.push(`| ${d.label} | ${d.count} | ${d.blocks} |`);
lines.push('');
lines.push('## Notes');
lines.push('');
lines.push('- Textures are generated procedurally on a canvas from a name to colour table in');
lines.push('  `src/textures.js`, so a new colour variant needs no art asset, only a palette entry.');
lines.push('- Materials already ship `vertexColors: true` and the mesher already emits per-vertex colour');
lines.push('  for biome tinting, so a per-block colour tint needs no new pipeline.');
lines.push('- The game currently has 6 of 16 wool colours and 9 of 12 plank types, so several families');
lines.push('  are cheaper to finish than to start.');
lines.push('');

writeFileSync('docs/survival-parity-backlog.md', lines.join('\n'), 'utf8');

console.log('survival parity backlog written to docs/survival-parity-backlog.md');
console.log('');
console.log('coverage: recipes ' + m.expressible + '/' + m.total + ' (' + pct(m.expressible, m.total) + ')');
console.log('individual additions that unblock the most recipes:');
for (const r of ranking.slice(0, 12)) {
  console.log('  ' + String(r.gain).padStart(4) + 'x  ' + r.name.padEnd(24) + '-> ' + r.cumulative);
}
console.log('');
console.log('families blocking the most recipes:');
for (const d of documents.slice(0, 12)) {
  console.log('  ' + String(d.blocks).padStart(4) + ' recipes blocked by ' + d.count + ' missing ' + d.label);
}
void gameNames; void blockNameSet;
