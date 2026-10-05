// Items the game produces through interaction code, which no data table can express.
//
// The Resource Inspector reads recipes, smelting, brewing, mob loot, block drops and the smithing table.
// Three items are made by none of those and yet are perfectly obtainable, because making them is something
// the player *does*: filling a bucket at a water or lava source, and milking a cow. The report listed all
// three as "no crafting, smelting, brewing, mob-loot, smithing or block-drop source", which is true of
// those six tables and false about the game -- and a report that cries wolf about three items is a report
// whose other 178 lines are harder to trust.
//
// This is deliberately a hand-written list rather than a scan. A scan for `addItem('...')` finds almost
// nothing, because this code assigns the id to a variable first (`replacement='water_bucket'`), and a
// looser scan would start claiming sources for items that have none. Each entry names the code that does
// it, and `tests/interactionSources.test.js` **calls that code** and checks the item comes out -- so the
// claim is proved rather than asserted, and it cannot rot into a comfortable lie.

/**
 * @typedef {{item: string, how: string, source: string}} InteractionSource
 * `source` is `<file> <symbol>`, and the file has to exist; a test asserts every one does.
 */

/** @type {InteractionSource[]} */
export const INTERACTION_SOURCES = [
  {
    item: 'water_bucket',
    how: 'Fill an empty bucket from a water source block.',
    source: 'buckets.js useBucket',
  },
  {
    item: 'lava_bucket',
    how: 'Fill an empty bucket from a lava source block.',
    source: 'buckets.js useBucket',
  },
  {
    item: 'milk_bucket',
    how: 'Use a bucket on a cow or a mooshroom.',
    source: 'animalBehaviors.js AnimalBehaviors.interact',
  },
];

/** The item ids this table claims, for the registry to mark and for tests to check. */
export const INTERACTION_ITEMS = INTERACTION_SOURCES.map((entry) => entry.item);
