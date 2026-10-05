// Emit the missing vanilla ITEMS that block crafting recipes.
//
// Items are the cheapest parity available: no geometry, no texture-atlas work, just an ITEMS entry.
// They are also the largest single category of "blocked by a missing result" after blocks -- 75 items
// block 123 recipes -- and unlike slabs or beds they need nothing from the mesher.
//
// The set is chosen by necessity rather than by hand: an item is emitted only when a real vanilla
// recipe is currently blocked because its RESULT does not exist here, so every addition unblocks at
// least one recipe. That keeps the output targeted instead of dumping the whole 1,385-item registry
// into the game.
//
// Run: node scripts/generate-items.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { BLOCKS, ITEMS, BLOCK_DEFS } from '../src/blocks.js';
import { FOODS } from '../src/foodData.js';

const CACHE = '.cache/mc-data';
if (!existsSync(`${CACHE}/recipes.json`)) {
  console.error('vanilla cache missing; run scripts/generate-mc-data.mjs first');
  process.exit(1);
}

const recipes = JSON.parse(readFileSync(`${CACHE}/recipes.json`, 'utf8'));
const vanillaItems = JSON.parse(readFileSync(`${CACHE}/items.json`, 'utf8'));
const vanillaBlocks = JSON.parse(readFileSync(`${CACHE}/blocks.json`, 'utf8'));
const byId = new Map(vanillaItems.map(i => [i.id, i.name]));
const itemByName = new Map(vanillaItems.map(i => [i.name, i]));
const vanillaBlockNames = new Set(vanillaBlocks.map(b => b.name));

// What the game already has, by name.
const present = new Set();
for (const [k, v] of Object.entries(BLOCKS)) if (typeof v === 'number') present.add(k.toLowerCase());
for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (!def?.name) continue;
  present.add(String(def.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
}
for (const k of Object.keys(ITEMS)) present.add(k);

// Names the game spells differently, so the emitter does not duplicate content it already has.
const EQUIVALENT = new Set(['charcoal', 'cobbled_deepslate', 'nether_bricks']);

// Items that would need engine work to be meaningful, so adding them as inert registry entries would
// be misleading rather than useful. Each is excluded explicitly, with the reason, rather than by a
// broad pattern that could silently swallow real content.
const NEEDS_ENGINE = new Map([
  ['bundle', 'needs a container that holds other items'],
  ['map', 'needs map rendering and a world-to-map projection'],
  ['recovery_compass', 'needs a death-location tracker'],
  ['spyglass', 'needs a zoom/FOV mode'],
  ['brush', 'needs archaeology brushing'],
  ['goat_horn', 'needs a sound/instrument system'],
  ['firework_rocket', 'needs flight mechanics'],
  ['firework_star', 'needs the flight mechanics it is only used for'],
]);

// Which missing item results actually block a recipe?
const blockers = new Map();
for (const key of Object.keys(recipes)) {
  for (const rec of recipes[key]) {
    const out = byId.get(rec.result?.id ?? Number(key));
    if (!out || present.has(out) || EQUIVALENT.has(out)) continue;
    if (vanillaBlockNames.has(out)) continue;   // a block: BLOCKS entry, not an ITEMS entry
    if (NEEDS_ENGINE.has(out)) continue;
    blockers.set(out, (blockers.get(out) || 0) + 1);
  }
}

const chosen = [...blockers].sort((a, b) => b[1] - a[1]);

// Which raw materials are needed but absent? A recipe whose result is only craftable once its own
// ingredients exist is not unblocked by adding the result alone, but the item still has to exist for
// the recipe to be expressible, and raw materials are almost all plain items too.
const materialNeeds = new Map();
for (const key of Object.keys(recipes)) {
  for (const rec of recipes[key]) {
    const cells = rec.inShape ? rec.inShape.flat() : (rec.ingredients || []);
    for (const cell of cells) {
      if (cell === null || cell === undefined) continue;
      const n = byId.get(Array.isArray(cell) ? cell[0] : cell);
      if (!n || present.has(n) || EQUIVALENT.has(n)) continue;
      if (vanillaBlockNames.has(n)) continue;
      if (NEEDS_ENGINE.has(n)) continue;
      if (blockers.has(n)) continue;    // already chosen as a result
      materialNeeds.set(n, (materialNeeds.get(n) || 0) + 1);
    }
  }
}

// Only take materials that are genuinely simple items: an item with no vanilla block form that is not
// itself a tool, armour or spawn egg. Tools and armour need stats this generator does not derive, and
// emitting them with none would produce items that cannot be used.
const NEEDS_STATS = /(_pickaxe|_axe|_shovel|_hoe|_sword|_helmet|_chestplate|_leggings|_boots|_horse_armor|_spawn_egg|_bucket|_rod|_bow$|_crossbow$|_shield|_trident|_elytra|_totem|_potion|_arrow$|_tipped_arrow|_firework|_disc|_template$|_smithing_template|_banner_pattern|_armor_trim)/;
const simpleMaterials = [...materialNeeds]
  .filter(([n]) => !NEEDS_STATS.test(n))
  .sort((a, b) => b[1] - a[1]);

const all = [
  ...chosen.map(([name, count]) => ({ name, count, role: 'result' })),
  ...simpleMaterials.map(([name, count]) => ({ name, count, role: 'material' })),
];

// --- emit -------------------------------------------------------------------
const titleCase = (n) => n.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

const lines = [];
lines.push('// GENERATED FILE - do not edit by hand.');
lines.push('//');
lines.push('// Vanilla items added to reach survival parity.');
lines.push('//');
lines.push('// Produced by scripts/generate-items.mjs. Regenerate with:');
lines.push('//   node scripts/generate-items.mjs');
lines.push('//');
lines.push('// Included only when a real vanilla recipe is blocked because the item does not exist here, so');
lines.push('// every entry unblocks at least one recipe. Items needing engine work (a bundle container, map');
lines.push('// rendering, a spyglass zoom) are excluded deliberately; see the generator for the list.');
lines.push('//');
lines.push('// Icons point at the conventional asset path. Most do not exist as files yet, so the UI falls');
lines.push('// back to a generated placeholder tile showing the item\'s initial.');
lines.push('');
lines.push('export const EXTRA_ITEMS = {');
for (const a of all) {
  const icon = `/assets/items/${a.name}.png`;
  const food = FOODS[a.name];
  const parts = [`name: '${titleCase(a.name).replace(/'/g, "\\'")}'`, `icon: '${icon}'`];
  if (food) {
    // foodData already carries canonical hunger/saturation, so a food item is created edible rather
    // than inert.
    parts.push(`food: ${food.hunger}`);
    parts.push(`saturation: ${food.saturation}`);
    parts.push("type: 'food'");
  } else {
    // Everything here is stackable material or a simple placeable/usable item.
    const vi = itemByName.get(a.name);
    if (vi && vi.stackSize && vi.stackSize < 64) parts.push(`stackSize: ${vi.stackSize}`);
    parts.push("type: 'material'");
  }
  lines.push(`  ${a.name}: { ${parts.join(', ')} },`);
}
lines.push('};');
lines.push('');
lines.push(`export const EXTRA_ITEM_COUNT = ${all.length};`);
lines.push('');
lines.push('/** Names added, with how many recipes each helps unblock, for reporting and tests. */');
lines.push('export const EXTRA_ITEM_REASONS = {');
for (const a of all) lines.push(`  ${a.name}: { role: '${a.role}', helps: ${a.count} },`);
lines.push('};');
lines.push('');

writeFileSync('src/extraItems.js', lines.join('\n'), 'utf8');

console.log('wrote src/extraItems.js');
console.log('  items to unblock a recipe result : ' + chosen.length);
console.log('  simple materials also needed     : ' + simpleMaterials.length);
console.log('  total                            : ' + all.length);
const foodCount = all.filter(a => FOODS[a.name]).length;
console.log('  of which edible (from foodData)  : ' + foodCount);
console.log('  excluded as needing engine work  : ' + NEEDS_ENGINE.size);
console.log('\ntop 18 by recipes helped:');
for (const a of all.slice(0, 18)) {
  console.log('    ' + String(a.count).padStart(3) + 'x  ' + a.name.padEnd(30) + a.role);
}
void BLOCKS;
