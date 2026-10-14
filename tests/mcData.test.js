// The generated vanilla data tables and the mining rules built on them.
//
// The point of these is that mining is now decided by data rather than a flat hardness divide:
// a wooden shovel must not produce obsidian, and stone must drop cobblestone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import {
  miningEffect, breakTimeSeconds, describeTool, tierMeets, harvestsNothing,
  harvestRequirementText, TOOL_TIER_ORDER,
} from '../src/miningRules.js';
import { BLOCK_HARVEST, harvestDataFor, knownHarvestBlockIds } from '../src/blockHarvestData.js';
import { MOB_LOOT, lootFor, rollLoot } from '../src/mobLootData.js';
import { FOODS, foodFor } from '../src/foodData.js';

const tool = (id) => ({ def: ITEMS[id], id });
const withTool = (blockId, id) => miningEffect(blockId, ITEMS[id], id);

// --- the generated table -----------------------------------------------------

test('the harvest table is generated and maps into real block ids', () => {
  const entries = Object.keys(BLOCK_HARVEST).length;
  assert.ok(entries > 500, `expected a broad table, got ${entries}`);
  const mapped = knownHarvestBlockIds();
  assert.ok(mapped.length > 100, `expected many ids to resolve, got ${mapped.length}`);
  // Everything mapped must be a real block id the game can place.
  for (const id of mapped) {
    assert.equal(typeof id, 'number');
    assert.ok(BLOCK_DEFS[id], `block id ${id} has no definition`);
  }
});

test('the table records the tool class and tier the real game requires', () => {
  const stone = BLOCK_HARVEST.stone;
  assert.equal(stone.hardness, 1.5);
  assert.equal(stone.tool, 'pickaxe');
  assert.equal(stone.tier, 'wooden');
  assert.equal(stone.requiresTool, true);
  assert.deepEqual(stone.drops, ['cobblestone'], 'stone drops cobblestone, not itself');

  const obsidian = BLOCK_HARVEST.obsidian;
  assert.equal(obsidian.tool, 'pickaxe');
  assert.equal(obsidian.tier, 'diamond', 'obsidian needs a diamond pickaxe');
  assert.deepEqual(obsidian.drops, ['obsidian']);

  const dirt = BLOCK_HARVEST.dirt;
  assert.equal(dirt.tool, 'shovel');
  // The generator omits the flag when it is false, so this is undefined rather than false.
  assert.ok(!dirt.requiresTool, 'dirt needs no particular tool');
});

test('tool tiers are ordered weakest to strongest', () => {
  assert.deepEqual(TOOL_TIER_ORDER, ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite']);
});

// --- reading a tool ----------------------------------------------------------

test('a tool id is read into its class and tier', () => {
  assert.deepEqual(describeTool('diamond_pickaxe'), { tool: 'pickaxe', tier: 'diamond' });
  assert.deepEqual(describeTool('netherite_axe'), { tool: 'axe', tier: 'netherite' });
  assert.deepEqual(describeTool('wooden_shovel'), { tool: 'shovel', tier: 'wooden' });
  assert.deepEqual(describeTool('shears'), { tool: 'shears', tier: null });
  assert.equal(describeTool('wheat'), null, 'an item that is not a tool');
  assert.equal(describeTool(null), null);
  assert.equal(describeTool(''), null);
});

test('tier comparison follows the ladder, not the alphabet', () => {
  assert.equal(tierMeets('diamond', 'wooden'), true);
  assert.equal(tierMeets('wooden', 'diamond'), false);
  assert.equal(tierMeets('iron', 'iron'), true);
  assert.equal(tierMeets(null, 'wooden'), false, 'a bare hand is below every tier');
  assert.equal(tierMeets('wooden', null), true, 'no requirement is always met');
});

// --- the rule that matters: wrong tool harvests nothing ----------------------

test('the wrong tool class cannot harvest a block that requires one', () => {
  const effect = withTool(BLOCKS.STONE, 'wooden_shovel');
  assert.equal(effect.canHarvest, false, 'a shovel must not harvest stone');
  assert.equal(effect.drops, null, 'and yields nothing');
  assert.equal(harvestsNothing(BLOCKS.STONE, ITEMS.wooden_shovel, 'wooden_shovel'), true);
});

test('a bare hand cannot harvest a block that requires a tool', () => {
  const effect = miningEffect(BLOCKS.STONE, null, null);
  assert.equal(effect.canHarvest, false);
  assert.equal(effect.drops, null);
  assert.equal(harvestsNothing(BLOCKS.STONE, null, null), true);
});

test('a wooden shovel cannot harvest obsidian', () => {
  // The specific regression: this used to succeed.
  assert.equal(harvestsNothing(BLOCKS.OBSIDIAN, ITEMS.wooden_shovel, 'wooden_shovel'), true);
});

test('a stone pickaxe cannot harvest obsidian, but a diamond one can', () => {
  assert.equal(harvestsNothing(BLOCKS.OBSIDIAN, ITEMS.stone_pickaxe, 'stone_pickaxe'), true,
    'obsidian is above the stone tier');
  assert.equal(harvestsNothing(BLOCKS.OBSIDIAN, ITEMS.diamond_pickaxe, 'diamond_pickaxe'), false,
    'diamond is sufficient');
  const d = withTool(BLOCKS.OBSIDIAN, 'diamond_pickaxe');
  assert.deepEqual(d.drops, ['obsidian']);
});

test('a sufficient tool harvests and reports the right drops', () => {
  const wood = withTool(BLOCKS.STONE, 'wooden_pickaxe');
  assert.equal(wood.canHarvest, true);
  assert.deepEqual(wood.drops, ['cobblestone']);
  const diamond = withTool(BLOCKS.STONE, 'diamond_pickaxe');
  assert.equal(diamond.canHarvest, true);
  assert.equal(diamond.speedMultiplier, 8, 'the tool speed is applied');
});

test('blocks that need no tool are harvested by anything, including a hand', () => {
  for (const blockId of [BLOCKS.DIRT, BLOCKS.SAND, BLOCKS.GRAVEL]) {
    assert.equal(harvestsNothing(blockId, null, null), false, `a hand should gather ${blockId}`);
  }
});

test('unknown blocks fall back to the old permissive behaviour', () => {
  // A block the data table does not cover must not become unbreakable.
  const effect = miningEffect(999999, null, null);
  assert.equal(effect.known, false);
  assert.equal(effect.canHarvest, true);
  assert.equal(effect.drops, null);
});

test('the requirement is described in words for the player', () => {
  assert.match(harvestRequirementText(BLOCKS.OBSIDIAN), /diamond pickaxe/);
  assert.match(harvestRequirementText(BLOCKS.STONE), /wooden pickaxe/);
  assert.equal(harvestRequirementText(BLOCKS.DIRT), null, 'dirt needs nothing');
});

// --- break times -------------------------------------------------------------

test('break time matches the real formula for stone', () => {
  // hardness 1.5, correct tool => 30x divisor: ceil(1.5 * 30 / speed) ticks. The wiki's table gives 1.15 s for a
  // wooden pickaxe (23 ticks) and 0.3 s for a diamond one (6 ticks); breaking is counted in whole ticks.
  assert.ok(Math.abs(breakTimeSeconds(BLOCKS.STONE, ITEMS.wooden_pickaxe, 'wooden_pickaxe') - 1.15) < 1e-9);
  assert.ok(Math.abs(breakTimeSeconds(BLOCKS.STONE, ITEMS.diamond_pickaxe, 'diamond_pickaxe') - 0.3) < 1e-9);
  // Wrong/no tool => 100x divisor, so markedly slower.
  const hand = breakTimeSeconds(BLOCKS.STONE, null, null);
  assert.ok(hand > 7 && hand < 8, `bare hand on stone should be ~7.5s, got ${hand}`);
});

test('a better tool is always at least as fast', () => {
  const tiers = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe'];
  let previous = Infinity;
  for (const id of tiers) {
    const t = breakTimeSeconds(BLOCKS.STONE, ITEMS[id], id);
    assert.ok(t <= previous + 1e-9, `${id} (${t}) should not be slower than the previous tier (${previous})`);
    previous = t;
  }
});

test('efficiency speeds up a correct tool', () => {
  const plain = breakTimeSeconds(BLOCKS.STONE, ITEMS.diamond_pickaxe, 'diamond_pickaxe', 0);
  const eff3 = breakTimeSeconds(BLOCKS.STONE, ITEMS.diamond_pickaxe, 'diamond_pickaxe', 3);
  assert.ok(eff3 < plain, 'Efficiency III should be faster');
});

test('unbreakable blocks report an infinite break time', () => {
  assert.equal(breakTimeSeconds(BLOCKS.BEDROCK, ITEMS.diamond_pickaxe, 'diamond_pickaxe'), Infinity);
});

test('instant-break blocks take no time', () => {
  const grass = harvestDataFor(BLOCKS.GRASS);
  if (grass && grass.hardness === 0) {
    assert.equal(breakTimeSeconds(BLOCKS.GRASS, null, null), 0);
  }
});

// --- mob loot ----------------------------------------------------------------

test('mob loot is generated for the mobs the game has', () => {
  assert.ok(Object.keys(MOB_LOOT).length > 30, 'expected a broad loot table');
  assert.deepEqual(lootFor('cow'), [['leather'], ['beef']]);
  assert.deepEqual(lootFor('nonexistent_mob'), []);
});

test('a guaranteed drop always drops', () => {
  const drops = rollLoot('cow', () => 0.5);
  assert.deepEqual(drops, [{ item: 'leather', count: 1 }, { item: 'beef', count: 1 }]);
});

test('a rare drop is skipped or granted by its chance', () => {
  // Zombie iron ingots are ~0.83%, and only on a player kill.
  assert.deepEqual(rollLoot('zombie', () => 0.99), [{ item: 'rotten_flesh', count: 1 }],
    'a high roll misses the rare drop');
  const lucky = rollLoot('zombie', () => 0, { playerKill: true });
  const items = lucky.map(d => d.item);
  assert.ok(items.includes('iron_ingot'), `expected the rare drop, got ${items.join(', ')}`);
  assert.ok(items.includes('rotten_flesh'));
});

test('player-kill-only drops are withheld without a player kill', () => {
  const mobDrops = rollLoot('zombie', () => 0, { playerKill: false });
  assert.ok(!mobDrops.some(d => d.item === 'iron_ingot'), 'no iron ingot from an environmental kill');
});

test('count ranges are rolled, not fixed', () => {
  // Find a mob with a ranged count and check both ends are reachable.
  const ranged = Object.entries(MOB_LOOT).find(([, drops]) =>
    drops.some(d => typeof d[2] === 'string' && d[2].includes('-') && d[1] === undefined));
  if (!ranged) return; // table has none; nothing to assert
  const [mob, drops] = ranged;
  const entry = drops.find(d => typeof d[2] === 'string' && d[2].includes('-') && d[1] === undefined);
  const [lo, hi] = entry[2].split('-').map(Number);
  const atLow = rollLoot(mob, () => 0).find(d => d.item === entry[0]);
  const atHigh = rollLoot(mob, () => 0.999).find(d => d.item === entry[0]);
  assert.ok(atLow.count >= lo && atLow.count <= hi, 'low roll inside the range');
  assert.ok(atHigh.count >= lo && atHigh.count <= hi, 'high roll inside the range');
});

// --- foods -------------------------------------------------------------------

test('food values match the real game', () => {
  // The wiki's [Food] page, "Food saturation values": cooked porkchop and steak 12.8, bread 6. These read 6.4
  // and 3 for a long time, because the generator halved minecraft-data's figure on the theory that it was in
  // doubled internal units. It is not -- it is the wiki's own column -- and `hunger.js` spending 1.5 saturation
  // per health point healed is the wiki's own figure too, which a doubled system would put at 3.
  assert.deepEqual(foodFor('cooked_beef'), { hunger: 8, saturation: 12.8 });
  assert.deepEqual(foodFor('bread'), { hunger: 5, saturation: 6 });
  assert.equal(foodFor('stone'), null, 'stone is not edible');
  assert.ok(Object.keys(FOODS).length > 30);
});

test('every food has a positive hunger value', () => {
  for (const [name, f] of Object.entries(FOODS)) {
    assert.ok(f.hunger > 0, `${name} should restore hunger`);
    assert.ok(f.saturation >= 0, `${name} saturation should not be negative`);
  }
});

test('saturation is in the units the wiki reports', () => {
  // This asserted that no food's saturation exceeded twice its hunger, on the theory that the table held
  // vanilla's saturation *modifier* -- since saturation points are `hunger * modifier * 2`, a modifier would
  // always be at most 2. A golden carrot disproves it: 6 hunger and 14.4 saturation, more than twice. The
  // full table is checked against the wiki in tests/foodSaturation.test.js; this keeps the units from quietly
  // drifting back.
  assert.equal(FOODS.cooked_porkchop.saturation, 12.8);
  assert.equal(FOODS.golden_carrot.saturation, 14.4);
  assert.ok(FOODS.golden_carrot.saturation > FOODS.golden_carrot.hunger * 2,
    'the golden carrot is the case that disproves the modifier theory');
});
