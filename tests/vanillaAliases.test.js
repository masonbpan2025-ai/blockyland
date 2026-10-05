// The alias table: vanilla names this game holds under another id.
//
// `VANILLA_ID_ALIASES` exists so a name mismatch is not reported as a missing item. It was consulted by the
// per-resource checks -- `block-drop-parity`, `recipe-ingredient-parity` -- but by neither of the two things
// that answer "what is missing": the Inspector's `missingVanillaItems` and `measureItemGap` in
// `scripts/content-gap.mjs`. So `splash_potion` and `lingering_potion` were reported absent while this game's
// splash and lingering water bottles sat in `ITEMS`, and the headline gap figure was two too high.
//
// The two measurements count different things and are not meant to agree on a total. They must agree on every
// individual name, which is what this file checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { VANILLA_ID_ALIASES, missingVanillaItems, registry } from '../src/resourceRegistry.js';
import { buildVanillaIndex } from '../src/resourceShowcase.js';
import { measureItemGap } from '../scripts/content-gap.mjs';

const CACHE_PRESENT = existsSync('.cache/mc-data/items.json');
const skip = CACHE_PRESENT ? false : 'vanilla data cache not present';

test('an aliased name is not reported missing by either measurement', { skip }, () => {
  const vanilla = buildVanillaIndex();
  const reported = new Set(missingVanillaItems(registry(), vanilla).map((name) => name.toLowerCase()));
  const gap = measureItemGap();
  const stillMissing = [];
  for (const [gameId, vanillaId] of Object.entries(VANILLA_ID_ALIASES)) {
    if (ITEMS[gameId] === undefined) continue; // the alias is for an item this game has not got
    if (reported.has(vanillaId)) stillMissing.push(`${vanillaId} (this game's ${gameId})`);
    if (gap?.needsArt.includes(vanillaId)) stillMissing.push(`${vanillaId} (measureItemGap)`);
  }
  assert.deepEqual(stillMissing, [], 'an alias should reconcile the name everywhere it is reported');
});

test('the two potion names are a rename that has not happened, not an alias', { skip }, () => {
  // Vanilla's generic splash and lingering potions *are* the water ones -- a potion with no stored effect is
  // water -- and this game carries them as `splash_water_bottle` and `lingering_water_bottle`. The alias was
  // written and `tests/duplicateIds.test.js` refused it: `shadowedVanillaIds` reads this table to tell a
  // duplicate from a rename, and what that report enforces is that this game registers vanilla's own spelling
  // rather than a synonym for it. So the two names stay on the absent list, and the fix is a rename.
  //
  // This test exists so that decision is recorded rather than looking like an oversight, and so that a future
  // round adding the alias back is told why it will fail.
  for (const [gameId, vanillaId] of [['splash_water_bottle', 'splash_potion'],
    ['lingering_water_bottle', 'lingering_potion']]) {
    assert.ok(ITEMS[gameId], `${gameId} should be the item that vanilla calls ${vanillaId}`);
    assert.equal(ITEMS[gameId].type, 'potion', 'and it should be a potion');
    assert.equal(VANILLA_ID_ALIASES[gameId], undefined,
      `${gameId} must not be aliased to ${vanillaId}: the shadow report requires vanilla's spelling, not a synonym`);
  }
});

test('every alias points at something real, and at a real vanilla name', { skip }, () => {
  // An alias whose game id was renamed away, or whose vanilla name is a typo, would silently excuse a genuine
  // gap -- which is the failure mode this table can have. It had two of the first kind: `slimeball` and
  // `hay_bale` were left behind when those items were renamed to vanilla's own spellings, and this test found
  // them the round the check was written.
  const vanillaNames = new Set(buildVanillaIndex().itemNames.map((name) => name.toLowerCase()));
  const vanillaItems = new Set(JSON.parse(readFileSync('.cache/mc-data/items.json', 'utf8')).map((item) => item.name));
  for (const [gameId, vanillaId] of Object.entries(VANILLA_ID_ALIASES)) {
    // The target can be an item or a block this game registers under another name -- `target_block` and `snow`
    // are blocks. What it must not be is nothing.
    const asBlockName = Object.values(BLOCK_DEFS).some((def) => def?.name
      && String(def.name).toLowerCase().replace(/[^a-z0-9]+/g, '_') === gameId);
    assert.ok(ITEMS[gameId] || BLOCKS[gameId.toUpperCase()] !== undefined || asBlockName,
      `${gameId} is aliased but is not an item or a block this game has`);
    assert.ok(vanillaItems.has(vanillaId) || vanillaNames.has(vanillaId),
      `${vanillaId} is not a vanilla item name, so the alias excuses nothing`);
  }
});
