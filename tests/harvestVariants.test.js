// The harvest table could not answer a question about 144 blocks the game implements.
//
// It is generated per *vanilla block name*, so only the one block id that name resolves to had a row. The game
// models several states as their own ids -- an open door, a bed's head, a coral fan's wall form, eight wheat
// growth stages -- and every one of them reported "no BLOCK_HARVEST row", which the Inspector showed as a
// missing hardness and tool figure. Two blocks named identically (a crop's stages) and the states the game
// names with a suffix were never going to resolve on their own.
//
// Two other filters had been quietly dropping 27 *real* vanilla blocks -- everything not diggable, and
// anything with hardness 0, an empty bounding box and no drops -- which is how bedrock, fire, both portals,
// the command and structure blocks, frogspawn, seagrass and all ten live coral fans came to look like gaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { breakTimeSeconds } from '../src/miningRules.js';
import {
  harvestDataFor, STATE_VARIANT_SUFFIXES, STATE_VARIANT_PREFIXES, sharedHarvestRowFor, knownHarvestBlockIds,
  knownHarvestNames,
} from '../src/blockHarvestData.js';
import { registry } from '../src/resourceRegistry.js';
import { ResourceShowcase, RESOURCE_CHECKS, CHECK_SKIP } from '../src/resourceShowcase.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { maxDurabilityFor } from '../src/durability.js';
import { INTERACTION_SOURCES } from '../src/interactionSources.js';
import { codeDropSources } from '../src/codeDropSources.js';

/** The providers matter: without them the registry reports false gaps and this file would too. */
function buildRegistry() {
  return registry({
    fresh: true,
    smelting: SMELTING_RECIPES,
    durability: maxDurabilityFor,
    interactions: [...INTERACTION_SOURCES, ...codeDropSources()],
  });
}

test('a block that is a state of another takes that block\'s hardness and tool', () => {
  // Suffixed states: an open door is the door, a bed's head is the bed, a wall fan is the fan.
  const cases = [
    ['OAK_DOOR_OPEN', 'oak_door'],
    ['SPRUCE_DOOR_OPEN', 'spruce_door'],
    // Two state words at once, which one pass of stripping does not reach.
    ['SPRUCE_DOOR_TOP_OPEN', 'spruce_door'],
    ['BIRCH_DOOR_TOP_OPEN', 'birch_door'],
    ['BLACK_BED_HEAD', 'black_bed'],
    ['RED_BED_HEAD', 'red_bed'],
  ];
  for (const [constant, base] of cases) {
    const id = BLOCKS[constant];
    assert.equal(typeof id, 'number', `${constant} should be a registered block`);
    const row = harvestDataFor(id);
    assert.ok(row, `${constant} should have harvest data`);
    assert.equal(row.name, base, `${constant} should take ${base}'s row`);
    // The base's own row is a real vanilla row, not a synthesised one.
    assert.equal(typeof row.hardness, 'number');
  }

  // A prefix rather than a suffix, for the two states this game names the other way round.
  assert.equal(harvestDataFor(BLOCKS.LIT_FURNACE).name, 'furnace', 'a lit furnace is a furnace');
  assert.equal(BLOCKS.MOIST_FARMLAND, undefined, 'and moist farmland is named differently here');
});

test('a state sharing its base\'s name resolves without any suffix at all', () => {
  // Seven of wheat's eight stages have no row of their own and the same display name as the one that does.
  const family = Object.entries(BLOCK_DEFS).filter(([, def]) => def?.name === 'Wheat Crops').map(([id]) => Number(id));
  assert.ok(family.length >= 2, `wheat should have several stages, found ${family.length}`);
  for (const id of family) {
    const row = harvestDataFor(id);
    assert.ok(row, `wheat stage ${id} should resolve`);
    assert.equal(row.hardness, 0, 'wheat is instant to break');
  }
  // The table stays one row per *vanilla block*, with the game's extra state ids resolving through the
  // fallback rather than by the generator emitting a row for each. One `wheat` row, no `wheat_crops` row.
  const names = knownHarvestNames();
  assert.equal(names.filter((name) => name === 'wheat').length, 1, 'there should be one wheat row');
  assert.equal(names.includes('wheat_crops'), false, 'the game\'s name for the crop is not a vanilla row');
});

test('the states keep their own drops', () => {
  // Inheriting hardness and tool must not overwrite what a stage actually drops: an immature crop gives
  // seeds, and the mature one gives wheat.
  const stages = Object.entries(BLOCK_DEFS).filter(([, def]) => def?.name === 'Wheat Crops').map(([id]) => Number(id));
  const drops = stages.map((id) => BLOCK_DEFS[id].dropItem ?? BLOCK_DEFS[id].drop ?? null);
  assert.ok(drops.includes('wheat'), 'the mature stage drops wheat');
  assert.ok(drops.includes('wheat_seeds'), 'and an immature stage drops seeds');
  // The row is the mature crop's for every stage, because that is the only row vanilla publishes.
  for (const id of stages) assert.equal(harvestDataFor(id).name, 'wheat');
});

test('the blocks the generator used to skip have rows now', () => {
  // Every one of these is in the pinned data with a hardness and no drops; the generator filtered them out.
  const expected = [
    ['BEDROCK', -1], ['FIRE', 0], ['SOUL_FIRE', 0], ['NETHER_PORTAL', -1], ['END_PORTAL', -1],
    ['END_PORTAL_FRAME', -1], ['COMMAND_BLOCK', -1], ['STRUCTURE_BLOCK', -1], ['FROGSPAWN', 0],
    ['SEAGRASS', 0], ['TALL_SEAGRASS', 0],
    ['TUBE_CORAL_FAN', 0], ['HORN_CORAL_FAN', 0], ['TUBE_CORAL_WALL_FAN', 0], ['HORN_CORAL_WALL_FAN', 0],
  ];
  for (const [constant, hardness] of expected) {
    const id = BLOCKS[constant];
    assert.equal(typeof id, 'number', `${constant} should be a registered block`);
    const row = harvestDataFor(id);
    assert.ok(row, `${constant} should have a row`);
    assert.equal(row.hardness, hardness, `${constant}'s hardness should be vanilla's`);
  }
  // And they are consistent with what vanilla says comes off them: nothing, by hand.
  for (const constant of ['SEAGRASS', 'TUBE_CORAL_FAN', 'BEDROCK']) {
    assert.deepEqual(harvestDataFor(BLOCKS[constant]).drops, [], `${constant} drops nothing by hand`);
  }
});

test('a row marked unbreakable makes a block unbreakable', () => {
  // Vanilla writes -1 for a block that cannot be broken, and the table now carries rows for those blocks
  // where it used to have none -- the mining rule used to fall back to the block definition and got the right
  // answer by accident. `-1` has to mean unbreakable, or bedrock becomes instant to break.
  assert.equal(harvestDataFor(BLOCKS.NETHER_PORTAL).hardness, -1, 'the pinned row says -1');
  assert.equal(breakTimeSeconds(BLOCKS.NETHER_PORTAL, ITEMS.diamond_pickaxe, 'diamond_pickaxe'), Infinity);
  assert.equal(breakTimeSeconds(BLOCKS.BEDROCK, ITEMS.diamond_pickaxe, 'diamond_pickaxe'), Infinity);
  // A normal block is unaffected.
  const stone = breakTimeSeconds(BLOCKS.STONE, ITEMS.diamond_pickaxe, 'diamond_pickaxe');
  assert.ok(Number.isFinite(stone) && stone > 0, `stone should take a finite time, got ${stone}`);
});

test('the technical blocks vanilla marks unbreakable are unbreakable here', () => {
  // Reading the new rows against this game's definitions found six blocks whose defs said hardness 0. The
  // block-registry test caught it as "neither breakable nor marked unbreakable" the moment the rows existed.
  for (const constant of ['COMMAND_BLOCK', 'REPEATING_COMMAND_BLOCK', 'CHAIN_COMMAND_BLOCK', 'STRUCTURE_BLOCK',
    'JIGSAW', 'END_PORTAL_FRAME']) {
    const id = BLOCKS[constant];
    assert.equal(typeof id, 'number', `${constant} should be registered`);
    const def = BLOCK_DEFS[id];
    assert.ok(def.hardness >= 99999 || def.hardness === -1, `${def.name} should carry the unbreakable sentinel, has ${def.hardness}`);
    assert.equal(breakTimeSeconds(id, ITEMS.diamond_pickaxe, 'diamond_pickaxe'), Infinity, `${def.name} should never break`);
    // And the row agrees with the definition rather than contradicting it.
    assert.ok(harvestDataFor(id).hardness < 0, `${def.name}'s row should say unbreakable too`);
  }
});

test('nothing is invented: an unknown id resolves to nothing', () => {
  assert.equal(sharedHarvestRowFor(999999, new Map(), new Map()), null);
  assert.equal(harvestDataFor(999999), null);
  // The suffix and prefix lists are structural, and both directions are spellable.
  for (const suffix of STATE_VARIANT_SUFFIXES) assert.match(suffix, /^_[a-z_]+$/, suffix);
  for (const prefix of STATE_VARIANT_PREFIXES) assert.match(prefix, /^[a-z]+_$/, prefix);
  // Every id the table knows resolves to a row with a hardness.
  for (const id of knownHarvestBlockIds()) {
    const row = harvestDataFor(id);
    assert.ok(row, `id ${id} is in the table but does not resolve`);
    assert.equal(typeof row.hardness, 'number', `id ${id} has no hardness`);
  }
});

test('every block the game implements now answers the hardness question', () => {
  // The check's own statement, over the whole registry: a block either has vanilla data or is one of the three
  // the pinned data has no counterpart for. This is the guard -- it is what would have caught the 144.
  const reg = buildRegistry();
  const showcase = new ResourceShowcase({ registry: reg, vanilla: null, assetExists: () => true });
  const audit = showcase.audit([...reg.entries.values()]);
  const failures = audit.failures.filter((row) => row.check === 'harvest-data');
  assert.deepEqual(failures.map((row) => `${row.resource}: ${row.detail}`), []);

  // And the three named exemptions are still real blocks, so the list cannot rot into cover for a gap.
  const check = RESOURCE_CHECKS.find((c) => c.id === 'harvest-data');
  for (const name of ['pressure_plate', 'sulfur_block', 'dried_ghast', 'firefly_bush']) {
    const constant = name.toUpperCase();
    assert.equal(typeof BLOCKS[constant], 'number', `${name} is exempted but is not a block`);
    const entry = [...reg.entries.values()].find((e) => e.blockAliases?.includes(name));
    assert.ok(entry, `${name} is exempted but has no registry entry`);
    assert.equal(check.run({ entry, registry: reg }), CHECK_SKIP, `${name} should be skipped`);
  }
});
