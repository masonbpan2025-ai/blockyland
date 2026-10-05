// Guard the item gap review against drifting away from the game.
//
// Two claims in `docs/item-parity-gap-review.md` are worth more than the counts around them, and both are
// checked here rather than trusted:
//
//   1. **No item is unobtainable where vanilla's own data gives it a source.** This is the claim that says the
//      item side of the parity work is finished, so it has to be measured, not asserted. It is derived from
//      the pinned vanilla data, not from a list, so it stays true as content is added.
//   2. The headline figures in the document match what the Inspector measures now.
//
// The seven project-owned items are named rather than matched. They are this project's own content -- a golden
// spear, a harness, a golden dandelion and so on -- and vanilla's data has nothing to say about them, so they
// are neither gaps nor parity; they are a third thing, and a named list keeps them from being quietly absorbed
// into "vanilla agrees".
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { missingVanillaItems, registry } from '../src/resourceRegistry.js';
import { buildVanillaIndex } from '../src/resourceShowcase.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { maxDurabilityFor } from '../src/durability.js';
import { INTERACTION_SOURCES } from '../src/interactionSources.js';
import { codeDropSources } from '../src/codeDropSources.js';

const CACHE = '.cache/mc-data';
const CACHE_PRESENT = ['items.json', 'recipes.json', 'entityLoot.json'].every((file) => existsSync(`${CACHE}/${file}`));
const skip = CACHE_PRESENT ? false : 'vanilla data cache not present';

/** Items this project invented, which vanilla's data cannot speak about either way. */
const PROJECT_ITEMS = [
  'golden_spear', 'harness', 'golden_dandelion', 'splash_water_bottle', 'lingering_water_bottle',
  'creeper_wall_head', 'bamboo_sapling',
];

function inspector() {
  return registry({
    smelting: SMELTING_RECIPES,
    durability: maxDurabilityFor,
    interactions: [...INTERACTION_SOURCES, ...codeDropSources()],
  });
}

function sourceTotal(entry) {
  return ['recipesAsResult', 'smeltingFrom', 'brewingFrom', 'lootFrom', 'droppedBy', 'smithingFrom', 'codeFrom']
    .reduce((total, key) => total + (entry[key]?.length ?? 0), 0);
}

/** Every item name vanilla's own recipe, loot and smelting data gives a source. */
function vanillaSourcedNames() {
  const items = JSON.parse(readFileSync(`${CACHE}/items.json`, 'utf8'));
  const recipes = JSON.parse(readFileSync(`${CACHE}/recipes.json`, 'utf8'));
  const loot = JSON.parse(readFileSync(`${CACHE}/entityLoot.json`, 'utf8'));
  const named = new Set();
  for (const rows of Object.values(recipes)) {
    for (const row of rows ?? []) {
      if ((row.result?.count ?? 1) === 0) continue;
      const found = items.find((candidate) => candidate.id === row.result?.id);
      if (found) named.add(found.name);
    }
  }
  for (const entity of loot) {
    for (const row of entity.drops ?? []) {
      if (row.item) named.add(row.item);
      else {
        const found = items.find((candidate) => candidate.id === row.id);
        if (found) named.add(found.name);
      }
    }
  }
  // Vanilla smelting, as the hand-verified table in the generator has it: minecraft-data publishes none.
  const generator = readFileSync('scripts/generate-smelting.mjs', 'utf8');
  for (const match of generator.matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'/g)) named.add(match[2]);
  return { named, known: new Set(items.map((item) => item.name)) };
}

test('no item is unobtainable where vanilla gives it a source', { skip }, () => {
  const { named, known } = vanillaSourcedNames();
  const gaps = [];
  for (const entry of inspector().entries.values()) {
    if (entry.kind !== 'item' || entry.type === 'spawn_egg' || entry.internal) continue;
    if (sourceTotal(entry) > 0) continue;
    const id = String(entry.id);
    if (!known.has(id) && PROJECT_ITEMS.includes(id)) continue; // this project's own content
    if (named.has(id)) gaps.push(id);
  }
  assert.deepEqual(gaps, [],
    'these items have no source here while vanilla\'s own data gives them one, so the document\'s claim that '
    + 'the item side is finished is wrong');
});

test('the project-owned list is still exactly the project-owned items', { skip }, () => {
  // If one of these turns out to be a vanilla name, it belongs in the gap analysis rather than in this list,
  // and the first test would be quietly excusing it.
  const { known } = vanillaSourcedNames();
  for (const own of PROJECT_ITEMS) {
    assert.equal(known.has(own), false, `${own} is a vanilla item name, so it is not this project's own`);
  }
});

test('the document reports the figures the Inspector measures', () => {
  const doc = readFileSync('docs/item-parity-gap-review.md', 'utf8');
  const r = inspector();
  const items = [...r.entries.values()].filter((entry) => entry.kind === 'item').length;
  // The item total and the absent-name count are the two the document leads with. A stale number should fail
  // rather than mislead, which is the whole reason this test exists.
  assert.match(doc, new RegExp(`\\*\\*${items}\\*\\*`), `the document should report ${items} items`);
  // The heading spells the count as a word, so it is matched as a word; the figure assertion below is what
  // pins the number, and this only checks the section is there.
  assert.match(doc, /## The \w+ absent vanilla names, by owner/, 'and the section naming every absent item');
  // The count the document leads with, measured rather than restated. The first version of this guard did not
  // pin it, and the document went stale for a round -- twice, in the end: the aliases that would have taken
  // `splash_potion` and `lingering_potion` off the list were refused by the shadow report, so the list went
  // 18 -> 16 -> 18 while this test was being written.
  //
  // The names come from the pinned data rather than from `buildVanillaIndex()`, which returns an index with no
  // names at all unless it is handed the data: the CLI loads them through its own `loadVanilla`.
  const names = JSON.parse(readFileSync('.cache/mc-data/items.json', 'utf8')).map((item) => item.name);
  const absent = missingVanillaItems(r, { itemNames: names }).length;
  assert.match(doc, new RegExp(`\\*\\*${absent}\\*\\* \\| 1385`), `the document should report ${absent} absent names`);
  assert.match(doc, /node scripts\/inspect-resource\.mjs audit/, 'and how to reproduce the figures');
});
