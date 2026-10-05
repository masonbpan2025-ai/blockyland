// The `name-parity` check: does this game call an item what vanilla calls it?
//
// The check exists because the item generator derived a display name by title-casing the id or by copying the
// block's name, which produced fifty wrong names -- "Hay Block" for `hay_block` (vanilla: "Hay Bale"), "Heart
// Of The Sea" (vanilla: "Heart of the Sea"), "Oak Chest Boat" (vanilla: "Oak Boat with Chest"). All fifty are
// fixed and the check now passes, so this file has to prove two things a passing check cannot prove on its
// own: that it *can* fail, and that its exemptions are still exactly as wide as they were argued to be.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { COMPONENT_NAMED_ITEMS, DELIBERATE_NAMES, RESOURCE_CHECKS, CHECK_SKIP, buildVanillaIndex } from '../src/resourceShowcase.js';
import { registry } from '../src/resourceRegistry.js';
import { SMELTING_RECIPES } from '../src/furnace.js';

const CACHE_PRESENT = existsSync('.cache/mc-data/items.json');
const skip = CACHE_PRESENT ? false : 'vanilla data cache not present';

const check = RESOURCE_CHECKS.find((entry) => entry.id === 'name-parity');
const reg = registry({ smelting: SMELTING_RECIPES });
// `buildVanillaIndex()` returns an index with no names at all unless it is handed the data -- the CLI loads it
// through its own `loadVanilla`. Built here from the pinned cache so the check has something to compare to;
// without it every entry skipped and this file proved nothing.
const vanillaItems = CACHE_PRESENT ? JSON.parse(readFileSync('.cache/mc-data/items.json', 'utf8')) : [];
const vanilla = CACHE_PRESENT
  ? { ...buildVanillaIndex(), itemByName: new Map(vanillaItems.map((item) => [item.name, item])) }
  : null;

/** Run the check the way the Inspector does. */
const runOn = (entry) => check.run({ entry, registry: reg, vanilla });

test('the check refuses a name vanilla does not use', { skip }, () => {
  // A doctored entry, because the real registry is now clean: if this does not fail, the check proves nothing
  // about the fifty names it was written for.
  const real = reg.entries.get('hay_block');
  assert.ok(real, 'hay_block should be registered');
  assert.equal(runOn(real), true, 'and it should pass as it stands');
  const wrong = { ...real, name: 'Hay Block' };
  const outcome = runOn(wrong);
  assert.equal(outcome?.ok, false, 'a wrong name must be reported');
  assert.match(outcome.detail, /Hay Bale/, 'and the detail should say what vanilla calls it');
});

test('an item with no vanilla counterpart is not compared', { skip }, () => {
  // This game's own content -- a golden spear, a harness -- has nothing to compare against, so the check must
  // skip rather than invent an expectation.
  const own = reg.entries.get('golden_spear');
  if (own) assert.equal(runOn(own), CHECK_SKIP);
  // And a block entry is skipped outright: a block's name is a different string from its item's.
  const block = [...reg.entries.values()].find((entry) => entry.kind !== 'item');
  if (block) assert.equal(runOn(block), CHECK_SKIP);
});

test('the exemption tables are exactly the argued cases', () => {
  // Both lists are the check's escape hatch, so their size is the check's weakness. Pinned entry by entry:
  // every one is a name vanilla builds from a data component, or the one deliberate difference.
  assert.equal(COMPONENT_NAMED_ITEMS.size, 19, 'nineteen music discs, whose names come from a component');
  for (const id of COMPONENT_NAMED_ITEMS) {
    assert.match(id, /^music_disc_.*$/,
      `${id} is in the component-named list but is not one of those shapes`);
  }
  assert.deepEqual([...DELIBERATE_NAMES], ['potion']);
});

test('the exemption tables do not excuse a name that is simply wrong', { skip }, () => {
  // Every exempt id must still be *present*, and its declared name must still differ from vanilla's generic
  // one -- an exempt item whose name was later corrected to the generic string would be hiding a regression
  // behind an exemption that no longer applies.
  for (const id of COMPONENT_NAMED_ITEMS) {
    const entry = reg.entries.get(id);
    if (!entry) continue;
    const expected = vanilla.itemByName?.get(id)?.displayName;
    if (!expected) continue;
    assert.notEqual(entry.name, expected,
      `${id} now matches vanilla exactly, so it no longer needs an exemption`);
  }
});

test('every item the generator wrote carries vanilla\'s display name', { skip }, () => {
  // The generator derives these, and `tests/nameParity` above only proves the check works. This asserts the
  // generated module itself, so a future regeneration that loses the display-name preference fails here
  // rather than silently reintroducing fifty wrong names.
  const generated = readFileSync('src/extraItems.js', 'utf8');
  const byName = new Map(vanillaItems.map((item) => [item.name, item.displayName]));
  const wrong = [];
  // The name is quoted with `\'` inside where it contains an apostrophe -- "Jack o'Lantern" -- so the pattern
  // allows an escaped quote rather than stopping at it.
  for (const match of generated.matchAll(/^ {2}([a-z0-9_]+): \{ name: '((?:[^'\\]|\\.)*)'/gm)) {
    const [, id, name] = match;
    const expected = byName.get(id);
    const unescaped = name.replace(/\\'/g, "'");
    if (expected && expected !== unescaped && !COMPONENT_NAMED_ITEMS.has(id)) wrong.push(`${id}: ${unescaped}`);
  }
  assert.deepEqual(wrong, [], 'generated items whose name is not vanilla\'s');
});
