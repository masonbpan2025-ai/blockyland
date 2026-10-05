// Emit the potion items this game can brew but never defined.
//
// `brewing.js` has 36 potions in POTION_DATA with names, colours and effects, and `getBrewingResult`
// derives a `splash_` and a `lingering_` form from any of them -- 108 ids in all. Only five were
// registered as items, so a brewing stand produced ids that do not exist: the result went through the
// same path as a mob drop with no definition, which is a placeholder sprite and a phantom stack.
//
// Generated rather than hand-written because POTION_DATA is the source of truth and the ids are
// derived from it; 103 hand-typed entries would drift the first time a potion is added. The module is
// emitted in the same shape as `extraItems.js`, and `blocks.js` merges it with the same collision
// guard.
//
// Run: node scripts/generate-potion-items.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ITEMS } from '../src/blocks.js';
import { POTION_DATA } from '../src/brewing.js';

/**
 * Ids this generator produced last time.
 *
 * Without this the generator is destructive: the merge in `blocks.js` makes every generated id look
 * hand-written on the next run, so every entry would be skipped and a re-run would empty the module.
 * `generate-items.mjs` hit exactly this and documents it; the fix is the same carry-forward.
 */
function previouslyGenerated() {
  if (!existsSync('src/extraPotions.js')) return new Set();
  const text = readFileSync('src/extraPotions.js', 'utf8');
  const block = text.match(/export const POTION_ITEMS = \{([\s\S]*?)\n\};/);
  if (!block) return new Set();
  return new Set([...block[1].matchAll(/^ {2}([a-z0-9_]+):/gm)].map((m) => m[1]));
}

const previous = previouslyGenerated();

/** The core potion ids, in POTION_DATA's declaration order so regeneration is stable. */
const coreIds = Object.keys(POTION_DATA).filter((id) => !id.startsWith('splash_') && !id.startsWith('lingering_'));

const entries = [];
const skippedHandWritten = [];
for (const core of coreIds) {
  const data = POTION_DATA[core];
  // A splash or lingering form shares the core potion's icon: they differ only in how they are
  // delivered, which is not implemented yet, and a per-form shape would be three identical files per
  // potion.
  //
  // The core's HAND-WRITTEN icon is used when there is one, because the two hand-written cores name
  // hand-authored art: `potion_of_fire_resistance` is an SVG, and `water_bottle` shares the generic
  // `potion.png`. Reading `ITEMS[core].icon` unconditionally does not work -- `blocks.js` has already
  // merged the previous output by the time this runs, so a generated core would return its own old
  // path and the generator would be sticky on whatever it wrote the first time. `previous` is the
  // oracle for "I generated this id", so anything it names is derived fresh from the id instead.
  const handWrittenIcon = previous.has(core) ? undefined : ITEMS[core]?.icon;
  const icon = handWrittenIcon ?? `/assets/items/${core}.png`;
  const forms = [
    { id: core, name: data.name },
    { id: `splash_${core}`, name: `Splash ${data.name}` },
    { id: `lingering_${core}`, name: `Lingering ${data.name}` },
  ];
  for (const form of forms) {
    // Hand-written wins. An id that exists in ITEMS but was not emitted here last time was typed by
    // hand (`water_bottle`, `potion_of_fire_resistance`), so this must not replace it.
    if (ITEMS[form.id] !== undefined && !previous.has(form.id)) {
      skippedHandWritten.push(form.id);
      continue;
    }
    entries.push({ ...form, icon });
  }
}

const lines = [];
lines.push('// GENERATED FILE - do not edit by hand.');
lines.push('//');
lines.push('// Every potion `getBrewingResult` can produce, derived from POTION_DATA in brewing.js.');
lines.push('//');
lines.push('// Produced by scripts/generate-potion-items.mjs. Regenerate with:');
lines.push('//   node scripts/generate-potion-items.mjs');
lines.push('//');
lines.push('// A splash or lingering form declares its core potion\'s icon, because the two differ only in');
lines.push('// delivery and the icon set needs no third identical bottle.');
lines.push('');
lines.push('export const POTION_ITEMS = {');
for (const entry of entries) {
  lines.push(`  ${entry.id}: { name: '${entry.name.replace(/'/g, "\\'")}', icon: '${entry.icon}', type: 'potion', stackSize: 1 },`);
}
lines.push('};');
lines.push('');
lines.push(`export const POTION_ITEM_COUNT = ${entries.length};`);
lines.push('');
lines.push('/** The potion id each item is a form of, so a consumer can reach POTION_DATA without parsing prefixes. */');
lines.push('export const POTION_ITEM_BASE = {');
for (const entry of entries) {
  const base = entry.id.replace(/^(splash|lingering)_/, '');
  lines.push(`  ${entry.id}: '${base}',`);
}
lines.push('};');
lines.push('');

const text = lines.join('\n');
writeFileSync('src/extraPotions.js', text, 'utf8');
console.log(`wrote src/extraPotions.js: ${entries.length} potion items`);
console.log(`  core: ${entries.filter((e) => !/^(splash|lingering)_/.test(e.id)).length}`);
console.log(`  splash: ${entries.filter((e) => e.id.startsWith('splash_')).length}`);
console.log(`  lingering: ${entries.filter((e) => e.id.startsWith('lingering_')).length}`);
const handWritten = Object.keys(ITEMS).filter((id) => /potion|bottle/.test(id));
console.log(`  ${skippedHandWritten.length} hand-written id(s) left alone: ${skippedHandWritten.join(', ') || '(none)'}`);
console.log(`  ${handWritten.length} potion-shaped ids now registered in total`);
