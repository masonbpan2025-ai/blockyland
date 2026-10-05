// Blocks that dropped the wrong thing, found by asking a question nothing had asked.
//
// `block-drop` reported a block that yields nothing where vanilla says something comes off it: 149 false
// alarms, then zero once it asked the game's own rule. The other direction was never checked -- a block that
// yields the *wrong* thing -- and the new `block-drop-parity` check found a hundred disagreements.
//
// Most were not drop bugs. This game registers vanilla's block *states* as blocks of their own (an open door,
// a wall sign, a bed's head) and a farm block's row names the seed an immature stage gives up. Those are
// shapes rather than drops, and the check skips them by name. What was left was real, and the worst of it was
// a redstone ore that gave the ore block back -- a duplication trick rather than a drop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { baseBlockDrop, blockDrops, DROP_ITEM_OVERRIDES, BASE_DROP_COUNTS, bonusKeyFor } from '../src/blockDrops.js';
import { registry } from '../src/resourceRegistry.js';
import { ResourceShowcase, buildVanillaIndex } from '../src/resourceShowcase.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { maxDurabilityFor } from '../src/durability.js';
import { INTERACTION_SOURCES } from '../src/interactionSources.js';
import { codeDropSources } from '../src/codeDropSources.js';

const ALL_ITEMS = { ...ITEMS, ...EXTRA_ITEMS };
const read = (file) => JSON.parse(readFileSync(`.cache/mc-data/${file}.json`, 'utf8'));

function buildRegistry() {
  return registry({
    fresh: true,
    smelting: SMELTING_RECIPES,
    durability: maxDurabilityFor,
    interactions: [...INTERACTION_SOURCES, ...codeDropSources()],
  });
}

/** The audit's failure for a resource, or null. */
function failureFor(reg, resource) {
  const vanilla = buildVanillaIndex({
    items: read('items'), recipes: read('recipes'), foods: read('foods'), blocks: read('blocks'),
  });
  const showcase = new ResourceShowcase({ registry: reg, vanilla, assetExists: () => true });
  const audit = showcase.audit([...reg.entries.values()]);
  return audit.failures.find((row) => row.resource === resource && row.check === 'block-drop-parity') ?? null;
}

test('the drop tables name items and blocks that exist', () => {
  // Both ends of every row: a rename must not leave a rule pointing at nothing, and the keys really are block
  // names as this game spells them, which is what `bonusKeyFor` matches on.
  const keys = new Set(Object.keys(BLOCK_DEFS).map((id) => bonusKeyFor(Number(id))));
  for (const [block, item] of Object.entries(DROP_ITEM_OVERRIDES)) {
    assert.ok(ALL_ITEMS[item], `${block} should drop ${item}, which is not an item`);
    assert.ok(keys.has(block), `no block is keyed '${block}'`);
  }
  for (const [block, [min, max]] of Object.entries(BASE_DROP_COUNTS)) {
    assert.ok(keys.has(block), `no block is keyed '${block}'`);
    assert.ok(min >= 1 && max >= min, `${block} should have an ordered range, has ${min}..${max}`);
  }
});

test('the nine wrong drops give what vanilla gives, at both ends of their range', () => {
  const FIXED = [
    ['MELON', 'melon_slice', 3, 7],
    ['CAMPFIRE', 'charcoal', 2, 2],
    ['IRON_ORE', 'raw_iron', 1, 1],
    ['GOLD_ORE', 'raw_gold', 1, 1],
    ['REDSTONE_ORE', 'redstone', 4, 5],
    ['BOOKSHELF', 'book', 3, 3],
    ['SNOW', 'snowball', 4, 4],
    ['SEA_LANTERN', 'prismarine_crystals', 2, 3],
    ['CLAY', 'clay_ball', 4, 4],
  ];
  for (const [constant, item, min, max] of FIXED) {
    const id = BLOCKS[constant];
    assert.equal(typeof id, 'number', `${constant} should be registered`);
    const low = baseBlockDrop(id, () => 0);
    const high = baseBlockDrop(id, () => 0.999999);
    assert.equal(String(low.id), item, `${constant} should drop ${item}`);
    assert.equal(low.count, min, `${constant} at the bottom of its range`);
    assert.equal(high.count, max, `${constant} at the top of its range`);
    assert.equal(low.isBlock, false, `${item} is an item, not a block`);
    // And through the public path, which is what the break handler calls.
    assert.equal(String(blockDrops(id, () => 0)[0].id), item);
  }
});

test('a block that deliberately drops nothing still drops nothing', () => {
  // An override must not turn a deliberate `drop: null` into a drop.
  for (const constant of ['BEDROCK', 'WATER', 'GLASS', 'FIRE', 'SPAWNER', 'TURTLE_EGG']) {
    const id = BLOCKS[constant];
    if (typeof id !== 'number') continue;
    assert.equal(baseBlockDrop(id, () => 0), null, `${constant} should still give nothing`);
  }
  // And an ordinary block still gives itself, exactly once.
  const log = baseBlockDrop(BLOCKS.OAK_LOG, () => 0);
  assert.equal(log.count, 1);
  assert.equal(log.isBlock, true);
});

test('one block disagrees with vanilla, and it is the one that cannot be fixed yet', () => {
  // The invariant over the whole registry. Exactly one block is reported, and the reason is that this game has
  // no soul soil *item* to give: vanilla's soul campfire drops two of them. Naming it rather than counting it
  // means the test has to be updated when soul soil lands, which is the point.
  const reg = buildRegistry();
  const vanilla = buildVanillaIndex({
    items: read('items'), recipes: read('recipes'), foods: read('foods'), blocks: read('blocks'),
  });
  const showcase = new ResourceShowcase({ registry: reg, vanilla, assetExists: () => true });
  const audit = showcase.audit([...reg.entries.values()]);
  const failures = audit.failures.filter((row) => row.check === 'block-drop-parity');
  assert.deepEqual(failures.map((row) => row.resource), ['soul_campfire']);
  assert.match(String(failures[0].detail), /soul_soil/);
  assert.equal(ALL_ITEMS.soul_soil, undefined, 'and soul soil is indeed not an item here');
});

test('the check skips shapes rather than drops', () => {
  // A door's states and a crop's stage row are shapes: vanilla names one block and one stage, and comparing
  // them would report the game's own model as a defect. The check skips those by name.
  const reg = buildRegistry();
  for (const constant of ['SPRUCE_DOOR_OPEN', 'SPRUCE_DOOR_TOP', 'SPRUCE_TRAPDOOR_OPEN']) {
    const id = BLOCKS[constant];
    if (typeof id !== 'number') continue;
    const entry = [...reg.entries.values()].find((e) => e.blockId === id);
    assert.ok(entry, `${constant} should have an entry`);
    assert.equal(failureFor(reg, entry.key), null, `${constant} should not be reported`);
  }
  const wheat = [...reg.entries.values()].find((e) => e.blockId === BLOCKS.WHEAT);
  assert.ok(wheat, 'the wheat crop should be registered');
  assert.equal(failureFor(reg, wheat.key), null, 'a crop row is about one stage');

  // And the check really would report a wrong drop: the fixed blocks are evidence, but so is this -- a block
  // whose drop this file does not override is compared on its own merits.
  const stone = [...reg.entries.values()].find((e) => e.blockId === BLOCKS.STONE);
  assert.equal(failureFor(reg, stone.key), null, 'stone drops cobblestone, and vanilla says cobblestone');
});
