// Fetch Mineclonia's cooking and fuel declarations.
//
// minecraft-data publishes no smelting data, so Mineclonia is the reference for it: its
// `_mcl_cooking_output` and `_mcl_burntime` fields are declared to be vanilla-identical, and the
// research report confirmed the sampled values match.
//
// This fetches the mod files that declare them and extracts the pairs, so the numbers come from a real
// source rather than being recalled. Output is a raw JSON cache under .cache/, which is gitignored;
// scripts/generate-smelting.mjs turns it into a game module.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';

const BASE = 'https://codeberg.org/mineclonia/mineclonia/raw/branch/main';
const CACHE = '.cache/mineclonia';
mkdirSync(CACHE, { recursive: true });

// The mods that declare cooking outputs or fuel values. Chosen by grepping the research report's file
// list; the generator reports how many declarations each contributed so a miss is visible.
const FILES = [
  'mods/ITEMS/mcl_core/craftitems.lua',
  'mods/ITEMS/mcl_core/nodes_base.lua',
  'mods/ITEMS/mcl_core/nodes_liquid.lua',
  'mods/ITEMS/mcl_tools/register.lua',
  'mods/ITEMS/mcl_armor/register.lua',
  'mods/ITEMS/mcl_furnaces/init.lua',
  'mods/ITEMS/mcl_blast_furnace/init.lua',
  'mods/ITEMS/mcl_smoker/init.lua',
  'mods/ITEMS/mcl_campfires/api.lua',
  'mods/ITEMS/mcl_trees/api.lua',
  'mods/ITEMS/mcl_nether/init.lua',
  'mods/ITEMS/mcl_mobitems/init.lua',
  'mods/ITEMS/mcl_farming/init.lua',
  'mods/ITEMS/mcl_farming/potatoes.lua',
  'mods/ITEMS/mcl_ocean/init.lua',
  'mods/ITEMS/mcl_core/crafting.lua',
  'mods/ENVIRONMENT/mcl_biomes/init.lua',
  'mods/ITEMS/mcl_deepslate/init.lua',
  'mods/ITEMS/mcl_copper/init.lua',
  'mods/ITEMS/mcl_blackstone/init.lua',
  'mods/ITEMS/mcl_buckets/register.lua',
  'mods/ITEMS/mcl_mobitems/crafting.lua',
];

const results = {};
let fetched = 0;
let failed = 0;

for (const file of FILES) {
  const cached = `${CACHE}/${file.replace(/\//g, '__')}`;
  let text;
  if (existsSync(cached)) {
    text = readFileSync(cached, 'utf8');
  } else {
    try {
      const res = await fetch(`${BASE}/${file}`);
      if (!res.ok) { failed++; console.log('  ' + file + ' -> HTTP ' + res.status); continue; }
      text = await res.text();
      writeFileSync(cached, text, 'utf8');
      fetched++;
    } catch (e) {
      failed++;
      console.log('  ' + file + ' -> ' + e.message);
      continue;
    }
  }
  results[file] = text;
}

console.log('fetched ' + fetched + ', failed ' + failed + ', total available ' + Object.keys(results).length);

// Extract every declaration by scanning for the `core.register_[node|craftitem|tool]("name", {` block
// and pulling the fields out of it. A block-form scan rather than a regex per field, because the
// fields can appear in any order and a name can be hundreds of lines from its `_mcl_cooking_output`.
const declared = [];
for (const [file, text] of Object.entries(results)) {
  const re = /core\.register_(node|craftitem|tool)\(\s*"([^"]+)"\s*,\s*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, kind, name] = m;
    // Walk forward to the matching close brace of this table, tracking depth, so the block's fields
    // are read from the right place.
    let i = re.lastIndex - 1;
    let depth = 0;
    let end = i;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      // Stop if a new registration begins, which means the table was never closed.
      if (depth === 0 && i > re.lastIndex && text.startsWith('core.register_', i)) break;
    }
    const body = text.slice(re.lastIndex, end);
    const cook = body.match(/_mcl_cooking_output\s*=\s*"([^"]+)"/);
    const cookTime = body.match(/_mcl_cooktime\s*=\s*([0-9.]+)/);
    const burn = body.match(/_mcl_burntime\s*=\s*(-?[0-9.]+)/);
    if (cook || burn) {
      declared.push({
        file, kind, name,
        cookingOutput: cook ? cook[1] : null,
        cookTime: cookTime ? Number(cookTime[1]) : null,
        burntime: burn ? Number(burn[1]) : null,
      });
    }
  }
}

writeFileSync(`${CACHE}/declarations.json`, JSON.stringify(declared, null, 2), 'utf8');

const withCook = declared.filter(d => d.cookingOutput).length;
const withBurn = declared.filter(d => d.burntime !== null).length;
const burnNonZero = declared.filter(d => d.burntime > 0).length;
console.log('declarations found: ' + declared.length);
console.log('  with a cooking output : ' + withCook);
console.log('  with a burntime       : ' + withBurn + ' (' + burnNonZero + ' non-zero)');
console.log('  with a cooktime       : ' + declared.filter(d => d.cookTime !== null).length);
console.log('\ncooking samples:');
for (const d of declared.filter(x => x.cookingOutput).slice(0, 12)) {
  console.log('  ' + d.name.padEnd(34) + ' -> ' + d.cookingOutput.padEnd(30) + ' cooktime=' + d.cookTime);
}
console.log('\nfuel samples:');
for (const d of declared.filter(x => x.burntime > 0).slice(0, 12)) {
  console.log('  ' + d.name.padEnd(34) + ' = ' + d.burntime + 's');
}
