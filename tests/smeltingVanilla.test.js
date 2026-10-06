// Two things about the furnace table, both about the same mistake.
//
// **A row keyed by a name the game no longer uses.** Kelp became a block item when it was given its block form
// -- the inventory carries it as `{id: 1051, isBlock: true}` -- and the hand-written furnace row was still
// keyed `'kelp'`. Nothing could reach it, so kelp stopped smelting into dried kelp. It went unnoticed because
// kelp is also a mob drop, so the Inspector never reported it as unobtainable; the row was simply dead. Every
// other block input in the table is keyed by its block id, and a guard now requires it.
//
// **Forty-two vanilla recipes the table did not have.** The smelting reference is Mineclonia, because
// minecraft-data publishes none, and its item set has no chorus fruit, no netherite, no horse armour and no
// opinion about recycling gear. `chorus_fruit -> popped_chorus_fruit` was the visible one: fifteen crafting
// recipes need popped chorus fruit and nothing produced it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { SMELTING_RECIPES, FUEL_BURN_TIMES, getSmeltingRecipe } from '../src/furnace.js';
import { SMELTING_STATS } from '../src/extraSmelting.js';
import { registry } from '../src/resourceRegistry.js';
import { INTERACTION_SOURCES } from '../src/interactionSources.js';
import { codeDropSources } from '../src/codeDropSources.js';
import { maxDurabilityFor } from '../src/durability.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };

/** The key this game uses for an item: its block id when it is a block, its name otherwise. */
function gameKeyFor(name) {
  // Already an id -- the expectations below name some outputs as BLOCKS constants.
  if (typeof name === 'number') return name;
  const def = ALL_ITEMS[name];
  if (def) {
    // An item that names a block, or is one, is carried by the block id.
    if (typeof def.blockId === 'number') return def.blockId;
    if (def.isBlock && typeof BLOCKS[name.toUpperCase()] === 'number') return BLOCKS[name.toUpperCase()];
    return name;
  }
  // No item entry at all: a bare block, which the game carries by id. `wheat` is the trap this guards
  // against -- it is a plain item, and there is also a wheat *crop* block, but the item is not that block.
  const blockId = BLOCKS[name.toUpperCase()];
  return typeof blockId === 'number' ? blockId : name;
}

test('every furnace key is the id the game carries that item by', () => {
  // The guard. A block item is held as a numeric block id, so a table keyed by its name is unreachable --
  // which is what happened to kelp. The check is on the *key*, not on the lookup, so a stale row cannot hide
  // behind a fallback that makes both spellings work.
  const misfiled = [];
  for (const table of [SMELTING_RECIPES, FUEL_BURN_TIMES]) {
    for (const key of Object.keys(table)) {
      if (/^[0-9]+$/.test(key)) {
        if (BLOCK_DEFS[Number(key)] === undefined) misfiled.push(`${key} is not a block id`);
        continue;
      }
      const def = ALL_ITEMS[key];
      if (!def) { misfiled.push(`${key} is not an item`); continue; }
      // A name key is only right for an item that is not a block.
      const expected = gameKeyFor(key);
      if (expected !== key) misfiled.push(`${key} should be keyed ${expected}`);
    }
  }
  assert.deepEqual(misfiled, [], 'these furnace rows are keyed by an id nothing looks up');
});

test('kelp smelts into dried kelp again', () => {
  const row = getSmeltingRecipe(BLOCKS.KELP);
  assert.ok(row, 'kelp should have a smelting row');
  assert.equal(row.id, 'dried_kelp');
  assert.equal(row.count, 1);
  // And through the registry, which is where the Inspector reads it from.
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES, durability: maxDurabilityFor, interactions: [...INTERACTION_SOURCES, ...codeDropSources()] });
  assert.equal(reg.entries.get('kelp').smeltedInto.length, 1, 'kelp should smelt into something');
  assert.deepEqual(reg.entries.get('dried_kelp').smeltingFrom.map((row2) => row2.input), [BLOCKS.KELP]);
});

test('the vanilla rows Mineclonia does not cover are smeltable', () => {
  // Each pair is vanilla's, and every one of them was missing from the table.
  const NEW_ROWS = [
    ['chorus_fruit', 'popped_chorus_fruit'],
    ['basalt', 'smooth_basalt'],
    ['quartz_block', 'smooth_quartz'],
    ['raw_iron_block', BLOCKS.IRON_BLOCK],
    ['raw_copper_block', BLOCKS.COPPER_BLOCK],
    ['raw_gold_block', BLOCKS.GOLD_BLOCK],
    ['sea_pickle', 'lime_dye'],
    ['iron_helmet', 'iron_nugget'],
    ['iron_chestplate', 'iron_nugget'],
    ['iron_leggings', 'iron_nugget'],
    ['iron_boots', 'iron_nugget'],
    ['iron_sword', 'iron_nugget'],
    ['iron_pickaxe', 'iron_nugget'],
    ['chainmail_helmet', 'iron_nugget'],
    ['chainmail_chestplate', 'iron_nugget'],
    ['shears', 'iron_nugget'],
    ['bucket', 'iron_nugget'],
    ['cauldron', 'iron_nugget'],
    ['golden_helmet', 'gold_nugget'],
    ['golden_sword', 'gold_nugget'],
    ['golden_carrot', 'gold_nugget'],
    ['golden_horse_armor', 'gold_nugget'],
    ['diamond_horse_armor', 'diamond'],
    ['netherite_sword', 'netherite_scrap'],
    ['netherite_chestplate', 'netherite_scrap'],
    ['netherite_boots', 'netherite_scrap'],
  ];
  for (const [input, output] of NEW_ROWS) {
    const key = gameKeyFor(input);
    const row = getSmeltingRecipe(key);
    assert.ok(row, `${input} (key ${key}) should smelt`);
    // The output is an id too: a block output is the block's numeric id, an item output its name.
    assert.equal(String(row.id), String(gameKeyFor(output)), `${input} should smelt into ${output}`);
    // One item in, one item out: no nugget recipe may become a duplication trick.
    assert.equal(row.count, 1, `${input} should produce a single item`);
  }
  // The generator's own tally agrees that a substantial vanilla table is in the output.
  assert.ok(SMELTING_STATS.vanillaAdded >= 40, `expected the vanilla table to be emitted, got ${SMELTING_STATS.vanillaAdded}`);
});

test('what vanilla does not smelt is still not smeltable', () => {
  // The other half of the guard: the additions table must not have swept in things vanilla refuses. Diamond
  // tools and armour smelt to nothing, and so does a turtle helmet -- which is the one that looks like it
  // might, and did appear in an early draft of the list.
  for (const input of ['diamond_sword', 'diamond_pickaxe', 'diamond_helmet', 'diamond_boots',
    'turtle_helmet', 'leather_helmet', 'iron_horse_armor_placeholder']) {
    if (!ALL_ITEMS[input]) continue;
    assert.equal(getSmeltingRecipe(gameKeyFor(input)), null, `${input} should not smelt`);
  }
  // The iron horse armour row was already there and stays: vanilla's is one iron nugget.
  assert.equal(getSmeltingRecipe('iron_horse_armor').id, 'iron_nugget');
});

test('popped chorus fruit has a source now, which was the chain break', () => {
  // Fifteen crafting recipes need it and nothing produced it, so it was reported as an item with no source
  // while being required by recipes -- the shape of gap that matters most.
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES, durability: maxDurabilityFor, interactions: [...INTERACTION_SOURCES, ...codeDropSources()] });
  const popped = reg.entries.get('popped_chorus_fruit');
  assert.ok(popped, 'popped chorus fruit should be an item');
  assert.equal(popped.smeltingFrom.length, 1, 'and it should come from smelting');
  assert.equal(popped.smeltingFrom[0].input, 'chorus_fruit');
  assert.ok(popped.recipesAsIngredient.length > 10, 'and it is used by many recipes');
});
