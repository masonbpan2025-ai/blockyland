// The item and block wiki parity audit (src/resourceWikiAudit.js), the fixes it found, and its Inspector showcase.
//
// Three kinds of test:
//   * the sweep -- every block and every item answers every wiki case, and none fails;
//   * sensitivity -- break a fact the game has right and the matching case must FAIL, so a green sweep means
//     something;
//   * the fixes -- each defect the audit found, pinned through the production function that had it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from '../src/blocks.js';
import { BLOCK_HARVEST, blastResistanceFor, harvestDataFor } from '../src/blockHarvestData.js';
import { harvestDrops, SILK_TOUCH_COLLECTS, SHEARS_COLLECT, NO_SELF_DROP, bonusKeyFor } from '../src/blockDrops.js';
import { breakTimeSeconds, harvestsNothing } from '../src/miningRules.js';
import { maxDurabilityFor } from '../src/durability.js';
import { enchantabilityOf } from '../src/enchanting.js';
import { isFireproof } from '../src/smithing.js';
import { FOODS } from '../src/foodData.js';
import { HORSE_ARMOR, HORSE_ARMOR_TOUGHNESS } from '../src/horseBehavior.js';
import { registry as buildRegistry } from '../src/resourceRegistry.js';
import {
  auditEverythingAgainstWiki, blockCases, itemCases, wikiCasesForEntry, vanillaItemsMissing, dropDemonstrations,
  KNOWN_DIFFERENCES, WIKI_CORRECTIONS, WIKI_CASE_LABELS, wikiBlockFacts,
} from '../src/resourceWikiAudit.js';
import { WIKI_BLOCKS, WIKI_ITEMS, WIKI_MODULE_REVISIONS } from '../src/resourceWikiData.js';
import { ResourceInspectionWorld, ResourceBehaviorShowcase, wikiSteps, dropSteps, WIKI_STEP_STATUS } from '../src/resourceBehaviorShowcase.js';

const idOf = (name) => {
  const id = Object.keys(BLOCK_DEFS).find((k) => BLOCK_DEFS[k]?.name === name);
  assert.ok(id !== undefined, `no block named ${name}`);
  return Number(id);
};
const caseOf = (cases, id) => cases.find((c) => c.id === id);
/** Run `fn` with `obj[key]` set to `value`, restoring it afterwards even when the assertion fails. */
function withValue(obj, key, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(obj, key);
  const old = obj[key];
  obj[key] = value;
  try { fn(); } finally { if (had) obj[key] = old; else delete obj[key]; }
}

// --- the source -------------------------------------------------------------------------------------------

test('the wiki data is pinned and covers the game', () => {
  for (const title of ['Module:Hardness values', 'Module:Blast resistance values', 'Module:Default data component/items']) {
    assert.ok(WIKI_MODULE_REVISIONS[title]?.revid > 0, `${title} revision pinned`);
  }
  // Every block name the game uses has a wiki row, and nearly all of them a hardness.
  const names = new Set(Object.values(BLOCK_DEFS).map((d) => d?.name).filter(Boolean));
  const rows = [...names].map((n) => wikiBlockFacts(idOf(n)));
  assert.ok(rows.every(Boolean), 'every block name resolves to a wiki row');
  assert.ok(rows.filter((r) => typeof r.hardness === 'number').length / rows.length > 0.99, 'and a hardness');
  assert.ok(Object.keys(WIKI_ITEMS).length > 1500, 'every vanilla item component row');
});

// --- the sweep ------------------------------------------------------------------------------------------

test('SWEEP: every block and item matches the wiki on every case', () => {
  const audit = auditEverythingAgainstWiki();
  assert.deepEqual(audit.failures.map((f) => `${f.id} ${f.subject}: wiki ${f.expected}, game ${f.actual}`), []);
  // The sweep is not vacuous: each case ran and passed on hundreds of resources.
  for (const [id, min] of Object.entries({
    'B-HARDNESS': 1100, 'B-BLAST': 1100, 'B-LIGHT': 1000, 'B-TOOL': 900, 'B-BREAK-TIME': 1000, 'B-SELF-DROP': 1000,
    'B-SILK': 900, 'I-ITEM': 1200, 'I-STACK': 1400, 'I-DURABILITY': 1200, 'I-FOOD': 35, 'I-ATTACK': 30,
    'I-ARMOR': 25, 'I-ENCHANTABILITY': 60, 'I-FIREPROOF': 10,
  })) {
    assert.ok(audit.byCase[id]?.PASS >= min, `${id} passed on ${audit.byCase[id]?.PASS}, expected at least ${min}`);
    assert.ok(WIKI_CASE_LABELS[id], `${id} has an Inspector label`);
  }
  assert.ok(audit.rows.length > 13000);
});

test('every known difference is still a real, current one, and says why', () => {
  const audit = auditEverythingAgainstWiki();
  const known = new Set(audit.rows.filter((r) => r.status === 'KNOWN').map((r) => `${r.id}:${r.subject}`));
  for (const [key, reason] of Object.entries(KNOWN_DIFFERENCES)) {
    assert.ok(known.has(key), `${key} is listed as known but no longer differs -- remove it`);
    assert.ok(reason.length > 30, `${key} needs a reason`);
  }
  for (const [name, correction] of Object.entries(WIKI_CORRECTIONS)) {
    assert.ok(Object.values(BLOCK_DEFS).some((d) => d?.name === name), `${name} is corrected but is not a block`);
    assert.match(correction.quote, /"/, `${name}'s correction quotes its page`);
  }
});

test('the vanilla items this game lacks are all newer than its 1.21.4 target', () => {
  const missing = vanillaItemsMissing();
  // Copper tools and armour (1.21.9), spears and nautilus armour (1.21.11), the spring-drop plants and eggs
  // (1.21.5), harnesses (1.21.6), shelves, and the 26.x poplar, sulfur and cinnabar families.
  for (const id of missing) {
    assert.match(id, /copper|spear|nautilus|harness|shelf|poplar|sulfur|cinnabar|wool_(slab|stairs)|bush|cactus_flower|leaf_litter|wildflowers|dry_grass|_egg$|music_disc_(bounce|lava_chicken|tears)|lightning_rod|test_(instance_)?block|red_shrub|potent_sulfur|shelf_mushroom|netherite_horse_armor/,
      `${id} is missing and is not a known post-1.21.4 item`);
  }
  for (const old of ['diamond_sword', 'oak_planks', 'glass', 'potion', 'elytra', 'mace', 'wolf_armor']) {
    assert.ok(!missing.includes(old), `${old} is answered`);
  }
});

// --- sensitivity: a broken fact must fail its case --------------------------------------------------------

test('SENSITIVITY: each block case fails when the fact it checks is wrong', () => {
  const stone = BLOCKS.STONE;
  const row = harvestDataFor(stone); // the row object the mining path and the audit both read
  assert.equal(caseOf(blockCases(stone), 'B-HARDNESS').status, 'PASS');
  withValue(row, 'hardness', 3, () => {
    assert.equal(caseOf(blockCases(stone), 'B-HARDNESS').status, 'FAIL', 'hardness');
    assert.equal(caseOf(blockCases(stone), 'B-BREAK-TIME').status, 'FAIL', 'and the break time with it');
  });
  withValue(row, 'resistance', 2, () => assert.equal(caseOf(blockCases(stone), 'B-BLAST').status, 'FAIL', 'blast'));
  withValue(BLOCK_DEFS[BLOCKS.GLOWSTONE], 'light', 9, () => assert.equal(caseOf(blockCases(BLOCKS.GLOWSTONE), 'B-LIGHT').status, 'FAIL', 'light'));
  withValue(row, 'tier', 'iron', () => assert.equal(caseOf(blockCases(stone), 'B-TOOL').status, 'FAIL', 'tier'));
  // The mining-speed bug this audit found: a proper tool that the block does not *require* gave no speed.
  withValue(harvestDataFor(BLOCKS.OAK_PLANKS), 'tool', undefined, () => {
    assert.equal(caseOf(blockCases(BLOCKS.OAK_PLANKS), 'B-BREAK-TIME').status, 'FAIL', 'an axe that does not speed up planks');
  });
  // The drop bug: a leaf that gives itself to a hoe.
  const leaf = BLOCKS.OAK_LEAVES;
  withValue(NO_SELF_DROP, 'has', (k) => k !== 'oak_leaves' && Set.prototype.has.call(NO_SELF_DROP, k), () => {
    assert.equal(caseOf(blockCases(leaf), 'B-SELF-DROP').status, 'FAIL', 'a leaf dropping itself without shears');
  });
  withValue(SILK_TOUCH_COLLECTS, 'has', (k) => k !== 'glass' && Set.prototype.has.call(SILK_TOUCH_COLLECTS, k), () => {
    assert.equal(caseOf(blockCases(BLOCKS.GLASS), 'B-SILK').status, 'FAIL', 'Silk Touch that does not collect glass');
  });
});

test('SENSITIVITY: each item case fails when the fact it checks is wrong', () => {
  const check = (id, caseId, key, value) => {
    assert.equal(caseOf(itemCases(id), caseId).status, 'PASS', `${caseId} ${id} passes as is`);
    withValue(ITEMS[id], key, value, () => assert.equal(caseOf(itemCases(id), caseId).status, 'FAIL', `${caseId} ${id} with ${key}=${value}`));
  };
  check('ender_pearl', 'I-STACK', 'stackSize', 64);
  check('diamond_sword', 'I-ATTACK', 'attack', 5);
  check('diamond_chestplate', 'I-ARMOR', 'toughness', 0);
  check('netherite_helmet', 'I-ARMOR', 'knockbackResistance', 1);
  withValue(FOODS, 'bread', { hunger: 4, saturation: 6 }, () => assert.equal(caseOf(itemCases('bread'), 'I-FOOD').status, 'FAIL', 'food'));
});

// --- the fixes ----------------------------------------------------------------------------------------------

test('FIX drops: shears and Silk Touch decide what a block gives, as each block page says', () => {
  const self = (name, drops) => drops.some((d) => (d.isBlock ? d.id === idOf(name) : ITEMS[d.id]?.name === name));
  // Leaves: "can be obtained only with shears or tools enchanted with Silk Touch".
  const leaf = idOf('Oak Leaves');
  assert.equal(self('Oak Leaves', harvestDrops(leaf, {}, () => 0.999)), false, 'not by hand');
  assert.equal(self('Oak Leaves', harvestDrops(leaf, { toolId: 'wooden_hoe' }, () => 0.999)), false, 'not with its hoe');
  assert.ok(harvestDrops(leaf, {}, () => 0).some((d) => d.id === 'apple'), 'but the bonus apple still rolls');
  assert.equal(self('Oak Leaves', harvestDrops(leaf, { toolId: 'shears' })), true, 'shears collect it');
  assert.equal(self('Oak Leaves', harvestDrops(leaf, { toolId: 'iron_hoe', silkTouch: true })), true, 'and Silk Touch');
  // Glass: "drops itself only if it is broken with a tool enchanted with Silk Touch".
  for (const name of ['Glass', 'Glass Pane', 'Red Stained Glass', 'Red Stained Glass Pane', 'Ice', 'Packed Ice', 'Blue Ice', 'Sculk']) {
    assert.deepEqual(harvestDrops(idOf(name), {}, () => 0.999), [], `${name} gives nothing without Silk Touch`);
    assert.equal(self(name, harvestDrops(idOf(name), { silkTouch: true })), true, `${name} with Silk Touch`);
  }
  // Stone gives cobblestone, and itself to Silk Touch; ores their item, and themselves to Silk Touch.
  assert.equal(harvestDrops(BLOCKS.STONE, {}, () => 0.5)[0].id, BLOCKS.COBBLESTONE);
  assert.equal(harvestDrops(BLOCKS.STONE, { silkTouch: true })[0].id, BLOCKS.STONE);
  assert.equal(harvestDrops(BLOCKS.DIAMOND_ORE, {}, () => 0.5)[0].id, 'diamond');
  assert.equal(harvestDrops(BLOCKS.DIAMOND_ORE, { silkTouch: true })[0].id, BLOCKS.DIAMOND_ORE);
  // Vines: "does not allow for collection, even with Silk Touch" -- shears only.
  assert.deepEqual(harvestDrops(idOf('Vine'), { silkTouch: true }, () => 0.999), []);
  assert.equal(self('Vine', harvestDrops(idOf('Vine'), { toolId: 'shears' })), true);
  // Tall grass to shears: "2 units of the respective small plant".
  assert.deepEqual(harvestDrops(idOf('Tall Grass'), { toolId: 'shears' }).map((d) => d.count), [2]);
  // Infested: "the equivalent non-infested block is dropped".
  assert.equal(harvestDrops(idOf('Infested Stone'), { silkTouch: true })[0].id, BLOCKS.STONE);
  // Twisting vines: "a 33% chance to drop a single twisting vine".
  assert.equal(harvestDrops(idOf('Twisting Vines'), {}, () => 0.2).length, 1);
  assert.equal(harvestDrops(idOf('Twisting Vines'), {}, () => 0.5).length, 0);
  // Every set names real blocks.
  const keys = new Set(Object.keys(BLOCK_DEFS).map((id) => bonusKeyFor(Number(id))));
  for (const set of [SILK_TOUCH_COLLECTS, SHEARS_COLLECT, NO_SELF_DROP]) for (const k of set) assert.ok(keys.has(k), `${k} is a block`);
});

test('FIX drops: counts and items from the blocks\' pages', () => {
  const one = (name, roll) => harvestDrops(idOf(name), {}, () => roll);
  assert.deepEqual(one('Ender Chest', 0.5).map((d) => [d.id, d.count]), [[BLOCKS.OBSIDIAN, 8]], 'Ender chest: 8 obsidian');
  assert.deepEqual(one('Copper Ore', 0).map((d) => d.count), [2]);
  assert.deepEqual(one('Copper Ore', 0.999).map((d) => d.count), [5], 'copper ore: 2-5 raw copper');
  assert.deepEqual(one('Lapis Lazuli Ore', 0.999).map((d) => d.count), [9], 'lapis: 4-9');
  assert.deepEqual(one('Glowstone', 0).map((d) => d.count), [2], 'glowstone: 2-4 dust');
  assert.deepEqual(one('Red Mushroom Block', 0), [], 'a mushroom block mostly drops nothing');
  assert.deepEqual(one('Red Mushroom Block', 0.999).map((d) => [d.id, d.count]), [[idOf('Red Mushroom'), 2]], '0-2 red mushrooms');
  assert.equal(one('Soul Campfire', 0.5)[0].id, idOf('Soul Soil'), 'a soul campfire drops soul soil');
  assert.equal(one('Creaking Heart', 0.999)[0].count, 3, 'a creaking heart 1-3 resin clumps');
  assert.equal(one('Pumpkin Stem', 0.5)[0].id, 'pumpkin_seeds', 'a pumpkin stem its seeds, like a melon stem');
});

test('FIX mining: a proper tool speeds a block up whether or not it needs one, in whole ticks', () => {
  const t = (block, tool) => breakTimeSeconds(block, tool ? ITEMS[tool] : null, tool);
  // The wiki's Breaking tables.
  assert.equal(t(BLOCKS.OAK_PLANKS, null), 3);
  assert.equal(t(BLOCKS.OAK_PLANKS, 'diamond_axe'), 0.4);
  assert.equal(t(BLOCKS.DIRT, 'iron_shovel'), 0.15);
  assert.equal(t(BLOCKS.STONE, 'wooden_pickaxe'), 1.15);
  assert.equal(t(BLOCKS.OBSIDIAN, 'diamond_pickaxe'), 9.4);
  // Shears and swords (their pages' tables): cobweb 20 s -> 0.4 s, wool 0.25 s, leaves at once, bamboo at once.
  assert.equal(t(BLOCKS.COBWEB, null), 20);
  assert.equal(t(BLOCKS.COBWEB, 'shears'), 0.4);
  assert.equal(t(BLOCKS.COBWEB, 'iron_sword'), 0.4);
  assert.equal(t(BLOCKS.WHITE_WOOL, 'shears'), 0.25);
  assert.equal(t(BLOCKS.OAK_LEAVES, 'shears'), 0);
  assert.equal(t(BLOCKS.BAMBOO, 'iron_sword'), 0);
  // And shears collect a cobweb, which asks for a sword.
  assert.equal(harvestsNothing(BLOCKS.COBWEB, ITEMS.shears, 'shears'), false);
  assert.equal(harvestsNothing(BLOCKS.COBWEB, null, null), true);
});

test('FIX blocks: light, blast resistance, tool and hardness corrections', () => {
  assert.equal(BLOCK_DEFS[BLOCKS.ENDER_CHEST].light, 7);
  assert.equal(BLOCK_DEFS[BLOCKS.CONDUIT].light, 15);
  assert.equal(BLOCK_DEFS[BLOCKS.SCULK_SENSOR].light, 1);
  assert.equal(BLOCK_DEFS[BLOCKS.DRAGON_EGG].light, 1);
  // An open copper door is a copper door: blast resistance 6, as closed.
  assert.equal(blastResistanceFor(idOf('Copper Door Open')), 6);
  assert.equal(blastResistanceFor(idOf('Waxed Oxidized Copper Trapdoor Open')), 6);
  assert.equal(blastResistanceFor(idOf('Bubble Column')), 100);
  assert.equal(BLOCK_HARVEST.crafter.tool, 'pickaxe');
  assert.equal(BLOCK_DEFS[BLOCKS.PRESSURE_PLATE].hardness, 0.5);
});

test('FIX items: stack sizes, durability, attack, armour, enchantability, fire resistance, the ominous bottle', () => {
  for (const id of ['potion_of_fire_resistance', 'splash_potion_of_fire_resistance', 'water_bottle', 'splash_potion_of_weakness']) {
    assert.equal(stackLimitFor(id), 1, `${id} does not stack`);
  }
  assert.equal(maxDurabilityFor('mace'), 500);
  assert.equal(maxDurabilityFor('wolf_armor'), 64);
  assert.equal(maxDurabilityFor('golden_spear'), 32);
  assert.equal(ITEMS.diamond_pickaxe.attack, 5);
  assert.equal(ITEMS.netherite_shovel.attack, 6.5);
  assert.equal(ITEMS.mace.attack, 6);
  assert.equal(ITEMS.bow.attack, undefined, 'a bow hits like a fist');
  assert.equal(ITEMS.netherite_chestplate.knockbackResistance, 0.1);
  assert.equal(HORSE_ARMOR_TOUGHNESS.diamond_horse_armor, 2);
  assert.equal(HORSE_ARMOR.diamond_horse_armor, 11);
  assert.equal(enchantabilityOf('mace'), 15);
  assert.equal(isFireproof(idOf('Ancient Debris')), true);
  assert.equal(isFireproof(idOf('Block of Netherite')), true);
  assert.equal(isFireproof(BLOCKS.STONE), false);
  assert.equal(ITEMS.ominous_bottle.food, undefined);
  assert.equal(FOODS.ominous_bottle, undefined);
});

// --- the Inspector ------------------------------------------------------------------------------------------

test('INSPECTOR: every resource the Inspector lists shows its wiki cases', () => {
  const reg = buildRegistry();
  let withCases = 0;
  for (const entry of reg.entries.values()) {
    const cases = wikiCasesForEntry(entry);
    if (cases.length) withCases++;
    for (const c of cases) assert.ok(['PASS', 'KNOWN', 'NA', 'NO_DATA'].includes(c.status), `${entry.key} ${c.id} is ${c.status}`);
  }
  assert.ok(withCases / reg.entries.size > 0.97, `${withCases} of ${reg.entries.size} resources show wiki cases`);
});

test('INSPECTOR: the showcase steps through the wiki cases and breaks the block four ways', () => {
  const reg = buildRegistry();
  const entry = [...reg.entries.values()].find((e) => e.blockId === BLOCKS.OAK_LEAVES);
  const session = new ResourceInspectionWorld(entry.blockId);
  const run = new ResourceBehaviorShowcase({ entry, session });
  for (let i = 0; run.running && i < 100000; i++) run.update(0.1);
  const wiki = run.results.filter((r) => r.id.startsWith('wiki-'));
  const cases = wikiSteps(entry);
  assert.ok(cases.length >= 8, 'the leaf has its block and item cases');
  for (const step of cases) {
    const result = wiki.find((r) => r.id === step.id);
    assert.ok(result, `${step.id} ran`);
    assert.equal(result.status, WIKI_STEP_STATUS[step.wiki.status]);
  }
  // The drop demonstration, with the game's real drops in the inspection world.
  const drops = wiki.filter((r) => r.id.startsWith('wiki-drops-'));
  assert.deepEqual(drops.map((r) => r.id), ['wiki-drops-hand', 'wiki-drops-tool', 'wiki-drops-shears', 'wiki-drops-silk']);
  assert.equal(drops.find((r) => r.id === 'wiki-drops-tool').status, 'observed', 'the hoe gives no leaf, as the wiki says');
  assert.equal(drops.find((r) => r.id === 'wiki-drops-silk').status, 'observed', 'Silk Touch gives the leaf');
  assert.ok(!run.results.some((r) => r.status === 'not observed' && r.id.startsWith('wiki-')), 'no wiki step fails');
  // A step's drops really land in the session the preview draws.
  const step = dropSteps(entry, session).find((s) => s.id === 'wiki-drops-shears');
  step.enter();
  assert.equal(session.drops.length, 1);
  assert.equal(session.drops[0].id, BLOCKS.OAK_LEAVES);
  assert.equal(session.world.getVoxel(8, 2, 8), BLOCKS.AIR, 'the block is gone');
});

test('INSPECTOR: the drop demonstration agrees with the wiki for every block it can show', () => {
  let shown = 0;
  for (const id of Object.keys(BLOCK_DEFS).map(Number)) {
    for (const demo of dropDemonstrations(id, () => 0.999)) {
      shown++;
      // A single high roll can miss a chance drop (twisting vines), so only certain drops are held to the wiki.
      if (demo.ok === false && demo.expectedSelf === true && demo.drops.length === 0 && !demo.silkTouch) continue;
      assert.notEqual(demo.ok, false, `${BLOCK_DEFS[id].name} ${demo.label}: wiki ${demo.expectedSelf}, game ${demo.actualSelf}`);
    }
  }
  assert.ok(shown > 3000);
});

test('INSPECTOR: both Inspector pages carry the wiki parity panel', async () => {
  const { readFileSync } = await import('node:fs');
  for (const page of ['block-debug.html', 'item-debug.html']) {
    const html = readFileSync(page, 'utf8');
    for (const id of ['wiki-panel', 'wiki-cases', 'wiki-run-all', 'wiki-export', 'wiki-summary', 'wiki-flagged', 'wiki-badge']) {
      assert.match(html, new RegExp(`id="${id}"`), `${page} has #${id}`);
    }
  }
  const script = readFileSync('src/resourceDebug.js', 'utf8');
  assert.match(script, /showWikiCases\(entry\)/, 'the panel fills on every selection');
  assert.match(script, /\$\('wiki-run-all'\)\.onclick = runWikiAudit/);
});

test('the wiki tables the audit reads are the generated ones, not hand edits', () => {
  // Spot values straight from the modules, so a regeneration that broke the parser is caught.
  assert.equal(WIKI_BLOCKS.Stone.hardness, 1.5);
  assert.equal(WIKI_BLOCKS.Stone.blast, 6);
  assert.equal(WIKI_BLOCKS.Obsidian.hardness, 50);
  assert.equal(WIKI_BLOCKS.Torch.light, 14);
  assert.deepEqual(WIKI_BLOCKS.Stone.breaking, { tool: 'pickaxe', tier: 'wooden', selfDrop: false, silk: true });
  assert.deepEqual(WIKI_ITEMS.diamond_sword, { stack: 1, durability: 1561, attack: 7, attackSpeed: 1.6, enchantability: 10 });
  assert.deepEqual(WIKI_ITEMS.bread.food, [5, 6]);
  assert.equal(WIKI_ITEMS.ender_pearl.stack, 16);
});

test('FIX wolf armour: worn by an adult tamed wolf, absorbs damage until its 64 durability runs out', async () => {
  const { canEquipWolfArmor, equipWolfArmor, absorbWithWolfArmor, repairWolfArmor, removeWolfArmor, WOLF_ARMOR_DURABILITY } = await import('../src/wolfBehavior.js');
  const owner = {};
  const wolf = { type: 'wolf', isTamed: true, owner, isBaby: false };
  assert.equal(canEquipWolfArmor({ ...wolf, isBaby: true }, owner), false, '"Only adult tamed wolves can wear armor."');
  assert.equal(canEquipWolfArmor({ ...wolf, isTamed: false }, owner), false);
  assert.equal(canEquipWolfArmor(wolf, {}), false, 'only its owner');
  assert.equal(canEquipWolfArmor(wolf, owner), true);
  equipWolfArmor(wolf);
  assert.equal(WOLF_ARMOR_DURABILITY, WIKI_ITEMS.wolf_armor.durability);
  // "absorbs all damage ... one point of durability for each point of damage absorbed"
  assert.deepEqual(absorbWithWolfArmor(wolf, 10), { damage: 0, absorbed: 10, broke: false });
  assert.equal(wolf.wolfArmorDurability, 54);
  // ...except drowning, freezing, magic, the wither effect and the like.
  assert.equal(absorbWithWolfArmor(wolf, 3, 'drowning').damage, 3);
  assert.equal(wolf.wolfArmorDurability, 54);
  // "an armadillo scute ... heals 8 points"
  assert.equal(repairWolfArmor(wolf), true);
  assert.equal(wolf.wolfArmorDurability, 62);
  // "If the damage of an attack exceeds the remaining durability, all damage is absorbed anyway", and it breaks.
  assert.deepEqual(absorbWithWolfArmor(wolf, 100), { damage: 0, absorbed: 100, broke: true });
  assert.equal(wolf.wolfArmor, null, 'the broken armour is gone');
  assert.equal(absorbWithWolfArmor(wolf, 4).damage, 4, 'and the next hit lands');
  equipWolfArmor(wolf, 30);
  assert.deepEqual(removeWolfArmor(wolf), { id: 'wolf_armor', durability: 30 }, 'shears take it off with its wear');
  // The game's damage path routes through it.
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync('src/mobs.js', 'utf8'), /absorbWithWolfArmor\(mob, amount/);
  assert.match(readFileSync('src/animalBehaviors.js', 'utf8'), /itemId === 'wolf_armor' && canEquipWolfArmor\(mob, player\)/);
});
