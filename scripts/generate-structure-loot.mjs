// node scripts/generate-structure-loot.mjs
//
// Converts the wiki's chest loot data (Module:LootChest/chests and Module:LootChest/items, saved under
// docs/structure-audit/wiki/_modules/ by scripts/fetch-loot-modules.mjs) into src/structureLootData.js: every chest the
// wiki documents, keyed by its vanilla loot table id (`minecraft:chests/<file>`, from the module's `-- <file>.json`
// comment), with its Java pools as `{ rolls: [min, max], entries: [[wikiItem, min, max, weight], ...] }`.
//
// The item names stay the wiki's (`level-enchanted-iron-leggings`, `enchanted-book-rnd`, `empty`); src/structureLoot.js
// turns them into this game's items when a chest is rolled.
import { readFileSync, writeFileSync } from 'node:fs';

/** A small reader for the subset of Lua the module uses: tables, strings, numbers, booleans, comments. */
export function parseLuaTable(text) {
  let i = 0;
  const skip = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith('--', i)) {
        if (text.startsWith('--[[', i)) { const end = text.indexOf(']]', i); i = end < 0 ? text.length : end + 2; } else { while (i < text.length && text[i] !== '\n') i++; }
        continue;
      }
      break;
    }
  };
  const string = () => {
    const q = text[i++];
    let out = '';
    while (text[i] !== q) { if (text[i] === '\\') { i++; out += text[i++]; } else out += text[i++]; }
    i++;
    return out;
  };
  const value = () => {
    skip();
    const c = text[i];
    if (c === '{') return table();
    if (c === '"' || c === "'") return string();
    const m = /^(-?\d+(?:\.\d+)?|true|false|nil|[A-Za-z_][\w.]*(?:\([^)]*\))?)/.exec(text.slice(i));
    if (!m) throw new Error(`lua: unexpected ${JSON.stringify(text.slice(i, i + 30))}`);
    i += m[0].length;
    if (m[0] === 'true') return true;
    if (m[0] === 'false') return false;
    if (m[0] === 'nil') return null;
    return /^-?\d/.test(m[0]) ? Number(m[0]) : { ref: m[0] };
  };
  const table = () => {
    i++; // {
    const arr = []; const obj = {}; let isObj = false;
    for (;;) {
      skip();
      if (text[i] === '}') { i++; break; }
      let key = null;
      if (text[i] === '[') { i++; skip(); key = text[i] === '"' || text[i] === "'" ? string() : value(); skip(); i++; skip(); i++; } // [k] =
      else {
        const m = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(text.slice(i));
        if (m) { key = m[1]; i += m[0].length; }
      }
      const v = value();
      if (key !== null) { obj[key] = v; isObj = true; } else arr.push(v);
      skip();
      if (text[i] === ',' || text[i] === ';') i++;
    }
    if (!isObj) return arr;
    arr.forEach((v, n) => { obj[n + 1] = v; });
    return obj;
  };
  const start = text.indexOf('return');
  i = start + 'return'.length;
  return value();
}

const isMain = process.argv[1]?.endsWith('generate-structure-loot.mjs');
if (isMain) {
  const source = readFileSync('docs/structure-audit/wiki/_modules/chests.lua', 'utf8');
  const chests = parseLuaTable(source);
  // The `-- file.json` comment after each chest's key names its vanilla loot table.
  const files = {};
  for (const m of source.matchAll(/\["([^"]+)"\]\s*=\s*\{\s*--\s*([\w/]+)\.json/g)) files[m[1]] = m[2];
  // The chests the module does not comment: villages and the archaeology tables, named as vanilla names them.
  for (const key of Object.keys(chests)) {
    if (files[key]) continue;
    const village = /^village-(.+)$/.exec(key);
    if (village) files[key] = `chests/village/village_${village[1].replace(/-/g, '_')}`;
  }
  Object.assign(files, {
    'brushable-cold-ocean-ruins': 'archaeology/ocean_ruin_cold', 'brushable-warm-ocean-ruins': 'archaeology/ocean_ruin_warm',
    'brushable-desert-temple': 'archaeology/desert_pyramid', 'brushable-desert-well': 'archaeology/desert_well',
    'brushable-trail-ruins': 'archaeology/trail_ruins_common', 'brushable-trail-ruins-rare': 'archaeology/trail_ruins_rare',
    'trial-chambers-trial-spawner': 'spawners/trial_chamber/consumables', 'trial-chambers-trial-spawner-ominous': 'spawners/ominous/trial_chamber/consumables'
  });
  // April Fools' chests (the moon, the potato) are not part of the game.
  for (const [key, file] of Object.entries(files)) if (/moon|potato|portatol/.test(file)) delete files[key];
  const out = {};
  const missing = [];
  for (const [key, chest] of Object.entries(chests)) {
    const file = files[key];
    if (!file) { if (!/moon|potato|portatol/.test(key)) missing.push(key); continue; }
    const pools = (chest.poolsJava ?? []).map((pool) => ({
      rolls: Array.isArray(pool.rolls) ? pool.rolls : [pool.rolls, pool.rolls],
      entries: Object.entries(pool.items ?? {}).map(([item, [min, max, weight]]) => [item, min, max, weight])
    }));
    const id = `minecraft:${/^(chests|pots|dispensers|archaeology|spawners)\//.test(file) ? file : `chests/${file}`}`;
    out[id] = { wiki: key, title: String(chest.display ?? key), pools };
  }
  writeFileSync('src/structureLootData.js', `// GENERATED by scripts/generate-structure-loot.mjs from the Minecraft Wiki's Module:LootChest/chests
// (CC BY-NC-SA 3.0) -- do not edit. Java pools; item names are the wiki's.
export const STRUCTURE_LOOT = ${JSON.stringify(out, null, 0).replace(/\],"/g, '],\n"').replace(/\},"minecraft/g, '},\n"minecraft')};
`);
  console.log(Object.keys(out).length, 'chests;', missing.length ? `no file comment: ${missing.join(', ')}` : '');
  console.log(Object.keys(out).join('\n'));
}
