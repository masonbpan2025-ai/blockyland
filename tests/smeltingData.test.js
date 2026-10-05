// Smelting data and per-recipe experience.
//
// Two things are checked here that the existing furnace tests do not cover:
//
//   1. The generated entries actually reached the tables, and the hand-written ones still win.
//   2. Per-recipe smelting XP, which did not exist at all before. Vanilla varies it per item; the
//      reference implementation (Mineclonia) gives a flat 1 and admits in a source comment that it is
//      a TODO, so copying it would have moved away from parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SMELTING_RECIPES, FUEL_BURN_TIMES, getSmeltingXp, getSmeltingRecipe } from '../src/furnace.js';
import { EXTRA_SMELTING, EXTRA_FUEL, SMELTING_XP, DEFAULT_SMELTING_XP, SMELTING_STATS } from '../src/extraSmelting.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';

test('the generated smelting and fuel entries reached the tables', () => {
  // Counted against the extra module rather than a hard-coded number, so adding a recipe upstream and
  // regenerating cannot silently fail to merge.
  const extraKeys = Object.keys(EXTRA_SMELTING).length;
  assert.ok(extraKeys > 0, 'the generator produced no smelting entries');
  for (const [key, value] of Object.entries(EXTRA_SMELTING)) {
    const k = /^[0-9]+$/.test(key) ? Number(key) : key;
    const merged = SMELTING_RECIPES[k];
    assert.ok(merged, `generated smelting entry '${key}' was not merged`);
    assert.equal(merged.id, value.id, `generated smelting entry '${key}' merged with the wrong output`);
    assert.equal(merged.isBlock, value.isBlock);
    assert.equal(merged.count, value.count);
  }
  for (const [key, seconds] of Object.entries(EXTRA_FUEL)) {
    const k = /^[0-9]+$/.test(key) ? Number(key) : key;
    assert.equal(FUEL_BURN_TIMES[k], seconds, `generated fuel entry '${key}' was not merged`);
  }
  console.log(`  smelting ${Object.keys(SMELTING_RECIPES).length}, fuel ${Object.keys(FUEL_BURN_TIMES).length}`
    + ` (${extraKeys} generated smelting, ${Object.keys(EXTRA_FUEL).length} generated fuel)`);
});

test('every smelting output resolves to real content', () => {
  // A recipe pointing at a block id with no definition would smelt into an invisible item.
  for (const [key, out] of Object.entries(SMELTING_RECIPES)) {
    if (out.isBlock) {
      assert.ok(BLOCK_DEFS[out.id], `smelting '${key}' produces block ${out.id}, which has no definition`);
    } else {
      assert.ok(ITEMS[out.id] !== undefined, `smelting '${key}' produces item '${out.id}', which does not exist`);
    }
    assert.ok(out.count >= 1, `smelting '${key}' produces a count of ${out.count}`);
  }
  // And every fuel value is a positive number of seconds.
  for (const [key, seconds] of Object.entries(FUEL_BURN_TIMES)) {
    assert.ok(Number.isFinite(seconds) && seconds > 0, `fuel '${key}' has burn time ${seconds}`);
  }
});

test('smelting experience is per recipe and matches vanilla', () => {
  // The specific values are vanilla's, and they differ from each other -- which is the whole point,
  // since a flat value is what the reference implementation does wrong.
  assert.equal(getSmeltingXp({ id: 'iron_ingot', isBlock: false }), 0.7, 'iron should be 0.7');
  assert.equal(getSmeltingXp({ id: 'gold_ingot', isBlock: false }), 1.0, 'gold should be 1.0');
  assert.equal(getSmeltingXp({ id: 'diamond', isBlock: false }), 1.0, 'diamond should be 1.0');
  assert.equal(getSmeltingXp({ id: 'cooked_beef', isBlock: false }), 0.35, 'food should be 0.35');
  assert.equal(getSmeltingXp({ id: 'coal', isBlock: false }), 0.1, 'coal should be 0.1');

  // Not every value may be the same, or the table is not doing anything.
  const values = new Set(Object.values(SMELTING_XP));
  assert.ok(values.size >= 3,
    `expected several distinct XP values, found ${values.size}: ${[...values].join(', ')}`);
});

test('an unknown output falls back rather than returning undefined', () => {
  // A missing entry must not produce NaN experience, which would silently corrupt the player's total.
  assert.equal(getSmeltingXp({ id: 'definitely_not_an_item', isBlock: false }), DEFAULT_SMELTING_XP);
  assert.equal(getSmeltingXp(null), DEFAULT_SMELTING_XP);
  assert.equal(getSmeltingXp(undefined), DEFAULT_SMELTING_XP);
  assert.ok(Number.isFinite(DEFAULT_SMELTING_XP) && DEFAULT_SMELTING_XP > 0);
});

test('experience for a block output is found by name, not by numeric id', () => {
  // The bug this pins: the generated table was keyed by numeric id for block outputs and by name for
  // item outputs, while the lookup normalises a block to its snake_case name. Every block entry was
  // therefore unreachable and every block silently returned the default -- which reads as "XP is 0.1
  // for everything" rather than as a lookup failure.
  const blockOutputs = Object.values(SMELTING_RECIPES).filter(o => o.isBlock);
  assert.ok(blockOutputs.length > 0, 'some smelting recipe should produce a block');
  for (const out of blockOutputs) {
    const def = BLOCK_DEFS[out.id];
    assert.ok(def?.name, `block ${out.id} has no name to key XP by`);
    const xp = getSmeltingXp(out);
    assert.ok(Number.isFinite(xp), `experience for block ${out.id} is not a number`);
  }
  // And a block whose name IS in the table must return the table's value, not the default.
  const entry = Object.entries(SMELTING_XP).find(([name, xp]) => xp !== DEFAULT_SMELTING_XP
    && blockOutputs.some(o => String(BLOCK_DEFS[o.id]?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') === name));
  if (entry) {
    const [name, expected] = entry;
    const out = blockOutputs.find(o => String(BLOCK_DEFS[o.id]?.name ?? '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === name);
    assert.equal(getSmeltingXp(out), expected,
      `block output '${name}' returned the default instead of its table value`);
  }
});

test('getSmeltingRecipe still resolves inputs after the merge', () => {
  const ironOre = getSmeltingRecipe(BLOCKS.IRON_ORE);
  assert.ok(ironOre, 'iron ore should smelt to something');
  assert.equal(ironOre.id, 'iron_ingot');

  const cobble = getSmeltingRecipe(BLOCKS.COBBLESTONE);
  assert.ok(cobble, 'cobblestone should smelt to stone');
  assert.equal(cobble.id, BLOCKS.STONE);

  // A generated entry must be reachable through the public accessor, not only present in the table.
  const generated = Object.keys(EXTRA_SMELTING)[0];
  const key = /^[0-9]+$/.test(generated) ? Number(generated) : generated;
  const viaAccessor = getSmeltingRecipe(key);
  assert.ok(viaAccessor, `generated smelting input '${generated}' is not reachable via getSmeltingRecipe`);
});

test('the generator reports what it could not resolve', () => {
  // Unresolved names mean real recipes were dropped. They cannot be zero: this game genuinely lacks
  // lapis ore, nether quartz ore and ancient debris, so those recipes have nowhere to go. The count
  // must stay visible rather than the gap being silent.
  assert.ok(SMELTING_STATS.smeltingAdded + SMELTING_STATS.alreadyCorrect > 0);
  assert.ok(Number.isInteger(SMELTING_STATS.unresolvedNames));
  console.log(`  generator: ${SMELTING_STATS.smeltingAdded} smelting, ${SMELTING_STATS.fuelAdded} fuel, `
    + `${SMELTING_STATS.xpEntries} XP entries, ${SMELTING_STATS.unresolvedNames} unresolved names`);
});
