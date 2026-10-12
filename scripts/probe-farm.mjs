// Fast farming diagnostic: the production `FarmingManager`, crop table and hydration rule.
//
// Model layer only. It does NOT drive the bot's `till` and `use` actions -- `e2e/farmCommand.pw.js` is the
// evidence for that route. Statuses are PASS / FAIL / GAP / SPEC_UNVERIFIED.
//
// Reference: https://minecraft.wiki/w/Farming, /w/Bone_Meal (the growth table) and /w/Farmland.
import { writeFile, mkdir } from 'node:fs/promises';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import {
  FarmingManager, isHoe, getSeedCrop, getCropInfo, isWaterNearby, TILLABLE_BLOCKS, BONE_MEAL_PLANTS, cropStageBlock,
} from '../src/farming.js';

const rows = [];
const row = (id, status, expected, actual, note) => rows.push({ id, status, expected, actual, note });

/** A flat dirt world with a manager wired to it, the way the game builds one. */
function makeFarm({ ground = BLOCKS.DIRT, y = 10 } = {}) {
  const cells = new Map();
  const key = (x, gy, z) => `${x},${gy},${z}`;
  const placed = [];
  const drops = [];
  const world = {
    getVoxel: (x, gy, z) => cells.get(key(x, gy, z)) ?? BLOCKS.AIR,
    setVoxel: (x, gy, z, id) => { cells.set(key(x, gy, z), id); placed.push({ x, y: gy, z, id }); },
    getChunk: () => null,
  };
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) cells.set(key(x, y, z), ground);
  const game = {
    world,
    entities: { spawnDroppedItem: (pos, id, isBlock, count) => drops.push({ id, count }), spawnBoneMealParticles: () => {} },
    sounds: {},
    rebuildChunkMesh: () => {},
    inventory: { consumeActiveItem: () => {}, updateHotbar: () => {} },
    ui: {},
  };
  const manager = new FarmingManager(game);
  game.farmingManager = manager;
  return { world, game, manager, drops, placed, y };
}
const player = (gamemode = 'creative') => ({ gamemode, position: new THREE.Vector3(0, 11, 0), velocity: new THREE.Vector3(0, 0, 0) });

// --- F01: the tillable list ---
// Wiki: a hoe tills grass, dirt and the dirt-likes; coarse dirt and rooted dirt are NOT tillable.
const expectTillable = ['GRASS', 'DIRT', 'DIRT_PATH'];
// Wiki (Hoe): "do not work on mycelium or podzol".
const expectNotTillable = ['PODZOL', 'MYCELIUM', 'MOSS_BLOCK', 'COARSE_DIRT', 'ROOTED_DIRT', 'SAND', 'GRAVEL', 'STONE', 'FARMLAND', 'FARMLAND_MOIST', 'CLAY'];
const tillFails = [];
for (const name of expectTillable) {
  if (BLOCKS[name] === undefined) { tillFails.push(`${name} is not in the block registry`); continue; }
  if (!TILLABLE_BLOCKS.has(BLOCKS[name])) tillFails.push(`${name} should be tillable`);
}
for (const name of expectNotTillable) {
  if (BLOCKS[name] === undefined) continue;
  if (TILLABLE_BLOCKS.has(BLOCKS[name])) tillFails.push(`${name} should NOT be tillable`);
}
row('F01', tillFails.length ? 'FAIL' : 'PASS',
  `tillable: ${expectTillable.join(', ')}; not tillable: ${expectNotTillable.join(', ')}`,
  tillFails.length ? tillFails.join('; ') : `${TILLABLE_BLOCKS.size} tillable blocks, all correct`);

// --- F02: a hoe is a hoe ---
const hoeFails = [];
for (const name of ['wooden_hoe', 'stone_hoe', 'iron_hoe', 'golden_hoe', 'diamond_hoe', 'netherite_hoe']) {
  if (!isHoe(name)) hoeFails.push(`${name} should be a hoe`);
}
for (const name of ['wooden_shovel', 'diamond_pickaxe', 'diamond_axe', 'shears', 'wheat_seeds', 'bone_meal', null, undefined, 42]) {
  if (isHoe(name)) hoeFails.push(`${JSON.stringify(name)} should not be a hoe`);
}
row('F02', hoeFails.length ? 'FAIL' : 'PASS',
  'the six hoes till; a shovel, pickaxe, axe, shears, seed and bone meal do not',
  hoeFails.length ? hoeFails.join('; ') : 'all correct');

// --- F03: tilling produces farmland, and the right kind ---
const f3 = makeFarm();
const dry = f3.manager.till(0, f3.y, 0, player());
const dryId = f3.world.getVoxel(0, f3.y, 0);
// Now with water four blocks away: hydrated.
const f3b = makeFarm();
f3b.world.setVoxel(4, f3b.y, 0, BLOCKS.WATER);
const wet = f3b.manager.till(0, f3b.y, 0, player());
const wetId = f3b.world.getVoxel(0, f3b.y, 0);
row('F03', dry && wet && dryId === BLOCKS.FARMLAND && wetId === BLOCKS.FARMLAND_MOIST ? 'PASS' : 'FAIL',
  'hoeing dirt with no water gives dry farmland, and with water within four blocks gives hydrated farmland',
  `dry -> ${dryId} (${dryId === BLOCKS.FARMLAND ? 'FARMLAND' : dryId}), with water at dx=4 -> ${wetId} (${wetId === BLOCKS.FARMLAND_MOIST ? 'FARMLAND_MOIST' : wetId})`);

// --- F04: the hydration rule ---
// Wiki (Farmland): farmland is hydrated by water within four blocks horizontally and one vertically.
const hydration = [];
{
  const at = (dx, dz, dy) => {
    const f = makeFarm();
    f.world.setVoxel(dx, f.y + dy, dz, BLOCKS.WATER);
    return f.manager.till(0, f.y, 0, player()) && f.world.getVoxel(0, f.y, 0) === BLOCKS.FARMLAND_MOIST;
  };
  hydration.push(['dx=4 same level', at(4, 0, 0), true]);
  hydration.push(['dx=-4 same level', at(-4, 0, 0), true]);
  hydration.push(['dz=4 same level', at(0, 4, 0), true]);
  hydration.push(['corner dx=4,dz=4', at(4, 4, 0), true]);
  hydration.push(['dx=5 (out of range)', at(5, 0, 0), false]);
  hydration.push(['corner dx=5,dz=5 (out)', at(5, 5, 0), false]);
  hydration.push(['one block above, dx=4', at(4, 0, 1), true]);
  hydration.push(['two blocks above, dx=4', at(4, 0, 2), false]);
}
const hydrationFails = hydration.filter(([, got, want]) => got !== want);
row('F04', hydrationFails.length ? 'FAIL' : 'PASS',
  'water hydrates within 4 blocks horizontally (Chebyshev, so corners count) and 1 block vertically',
  hydrationFails.length ? hydrationFails.map(([l, got, want]) => `${l}: ${got}, wanted ${want}`).join('; ') : hydration.map(([l, got]) => `${l}=${got}`).join(', '));

// --- F05: the crop table ---
// Wiki (Bone Meal): wheat, carrots and potatoes are the three this build models. Each has its own stage
// count, and maturity is the last stage.
const cropSpec = [
  ['wheat', BLOCKS.WHEAT_STAGE_0, 7],
  ['carrots', BLOCKS.CARROTS_STAGE_0, 3],
  ['potatoes', BLOCKS.POTATOES_STAGE_0, 3],
  // Wiki (Beetroot): four growth stages, like the other three. Its ids are NOT a contiguous run -- the
  // earlier stages were appended above the id maximum so no existing block id had to move.
  ['beetroots', BLOCKS.BEETROOTS_STAGE_0, 3],
];
// Every stage id any crop owns, so "one past the last stage" can be checked as "not any crop" rather than
// "not THIS crop" -- the three families are laid out in adjacent id ranges, so stage max+1 of one is stage 0
// of the next and legitimately IS a crop.
const ALL_CROP_IDS = new Set();
for (const [type, , maxStage] of cropSpec) for (let s = 0; s <= maxStage; s++) ALL_CROP_IDS.add(cropStageBlock(type, s));
const cropFails = [];
for (const [type, base, maxStage] of cropSpec) {
  if (base === undefined) { cropFails.push(`${type} has no stage block`); continue; }
  for (let stage = 0; stage <= maxStage; stage++) {
    // Through the stage TABLE: the beetroot's ids are not a contiguous run, so `base + stage` would walk
    // off the end of its own family and into whatever block happens to sit at the next id.
    const info = getCropInfo(cropStageBlock(type, stage));
    if (!info) { cropFails.push(`${type} stage ${stage} is not a crop`); continue; }
    if (info.type !== type) cropFails.push(`${type} stage ${stage} reports type ${info.type}`);
    if (info.stage !== stage) cropFails.push(`${type} stage ${stage} reports stage ${info.stage}`);
    if (info.maxStage !== maxStage) cropFails.push(`${type} maxStage ${info.maxStage}, wanted ${maxStage}`);
    if (info.isMature !== (stage === maxStage)) cropFails.push(`${type} stage ${stage} isMature ${info.isMature}`);
  }
  // The block one past this family's last stage, if it belongs to no crop family, is not a crop.
  const past = base + maxStage + 1;
  if (!ALL_CROP_IDS.has(past) && getCropInfo(past)) cropFails.push(`${type}: block ${past} should not be a crop`);
  // And a block below the family with no crop range is not a crop either.
  if (getCropInfo(base - 1) && !ALL_CROP_IDS.has(base - 1)) cropFails.push(`${type}: block ${base - 1} should not be a crop`);
}
row('F05', cropFails.length ? 'FAIL' : 'PASS',
  'wheat has 8 stages and carrots and potatoes 4, with maturity only at the last',
  cropFails.length ? cropFails.slice(0, 5).join('; ') : 'all three crops and every stage correct');

// --- F06: what is plantable ---
const seedSpec = [['wheat_seeds', 'wheat', BLOCKS.WHEAT_STAGE_0], ['carrot', 'carrots', BLOCKS.CARROTS_STAGE_0], ['potato', 'potatoes', BLOCKS.POTATOES_STAGE_0]];
const seedFails = [];
for (const [item, crop, block0] of seedSpec) {
  const info = getSeedCrop(item);
  if (!info) { seedFails.push(`${item} is not plantable`); continue; }
  if (info.crop !== crop) seedFails.push(`${item} plants ${info.crop}, wanted ${crop}`);
  if (info.block0 !== block0) seedFails.push(`${item} plants block ${info.block0}, wanted ${block0}`);
}
for (const item of ['bone_meal', 'wheat', 'melon_seeds', 'pumpkin_seeds', 'nether_wart', 'sugar_cane', 'bamboo', null]) {
  if (getSeedCrop(item)) seedFails.push(`${JSON.stringify(item)} should not be plantable`);
}
row('F06', seedFails.length ? 'FAIL' : 'PASS',
  'wheat seeds, carrots and potatoes plant; the other seeds and items do not',
  seedFails.length ? seedFails.join('; ') : 'all correct');

// --- F07: bone meal advances 2-5 stages on the three modelled crops ---
// Wiki (Bone Meal): "The plant matures 2-5 growth stages" for Wheat, Carrots and Potatoes -- the same rule
// for all three. The table's own `advance` sets the cap, so a crop near maturity clamps rather than skipping.
const boneFails = [];
// Beetroots are excluded here: the wiki gives them their OWN rule, measured in F16.
for (const [type, base, maxStage] of cropSpec.filter(([t]) => t !== 'beetroots')) {
  // Measure the ADVANCE per application from stage 0, which is the quantity the wiki states. Reading the
  // resulting stage instead conflates the advance with the crop's own stage count: a 4-stage crop cannot
  // land past stage 3 however far the advance went.
  const advances = new Map();
  let matured = 0;
  for (let i = 0; i < 4000; i++) {
    const f = makeFarm();
    f.world.setVoxel(0, f.y, 0, BLOCKS.FARMLAND);
    f.world.setVoxel(0, f.y + 1, 0, base);
    const ok = f.manager.applyBoneMeal(0, f.y, 0, player());
    const info = getCropInfo(f.world.getVoxel(0, f.y + 1, 0));
    if (!ok || !info) { boneFails.push(`${type}: applyBoneMeal returned ${ok}, block ${f.world.getVoxel(0, f.y + 1, 0)}`); break; }
    advances.set(info.stage, (advances.get(info.stage) ?? 0) + 1);
    if (info.isMature) matured++;
  }
  if (!advances.size) continue;
  const reached = [...advances.keys()].sort((a, b) => a - b);
  const minReached = reached[0];
  const maxReached = reached[reached.length - 1];
  // From stage 0, 2-5 stages means landing on stages 2..5 -- clamped to the crop's own maximum.
  if (minReached < 2) boneFails.push(`${type}: a bone meal advanced only to stage ${minReached}, the wiki says 2-5 stages`);
  if (maxReached > Math.min(5, maxStage)) boneFails.push(`${type}: reached stage ${maxReached}, past the 5-stage advance`);
  if (advances.size < 2) boneFails.push(`${type}: bone meal is deterministic (always stage ${minReached})`);
  // A crop within reach of maturity must be able to mature in one use; a 4-stage crop can, an 8-stage one cannot.
  const canMatureInOne = minReached >= maxStage;
  if (canMatureInOne && matured === 0) boneFails.push(`${type}: never matured in 4000 tries though the advance reaches the cap`);
}
row('F07', boneFails.length ? 'FAIL' : 'PASS',
  'one bone meal advances wheat, carrots or potatoes by 2-5 stages, clamped at maturity, and is not deterministic',
  boneFails.length ? boneFails.join('; ') : 'all three 2-5 crops advance to stages 2-5 from stage 0 and clamp at their cap',
  'wiki (Bone Meal): "The plant matures 2-5 growth stages" for wheat, carrots and potatoes');

// --- F08: bone meal on a mature crop does nothing ---
const f8 = makeFarm();
f8.world.setVoxel(0, f8.y, 0, BLOCKS.FARMLAND);
f8.world.setVoxel(0, f8.y + 1, 0, BLOCKS.WHEAT_STAGE_7);
const matureResult = f8.manager.applyBoneMeal(0, f8.y, 0, player());
row('F08', matureResult === false && f8.world.getVoxel(0, f8.y + 1, 0) === BLOCKS.WHEAT_STAGE_7 ? 'PASS' : 'FAIL',
  'bone meal on a fully grown crop is refused and changes nothing',
  `applyBoneMeal -> ${matureResult}, block ${f8.world.getVoxel(0, f8.y + 1, 0)}`);

// --- F09: planting on farmland ---
const f9 = makeFarm();
f9.world.setVoxel(0, f9.y, 0, BLOCKS.FARMLAND);
const planted = f9.manager.plant(0, f9.y, 0, 'wheat_seeds', player('survival'));
const plantedBlock = f9.world.getVoxel(0, f9.y + 1, 0);
// And on soil that is not farmland it must refuse.
const f9b = makeFarm();
const refused = f9b.manager.plant(0, f9b.y, 0, 'wheat_seeds', player('survival'));
const refusedBlock = f9b.world.getVoxel(0, f9b.y + 1, 0);
row('F09', planted && plantedBlock === BLOCKS.WHEAT_STAGE_0 && refused === false && refusedBlock === BLOCKS.AIR ? 'PASS' : 'FAIL',
  'a seed plants stage-0 on farmland and is refused on plain dirt',
  `on farmland -> ${planted}/${plantedBlock}, on dirt -> ${refused}/${refusedBlock}`);

// --- F10: harvest drops and replant ---
// Wiki (Wheat): a mature crop drops 1 wheat and 1-3 seeds; immature wheat drops 1 seed. The crop sits at
// y+1, above the farmland, so that is the position to harvest.
const dropsFor = (setup, harvest) => {
  const f = makeFarm();
  f.world.setVoxel(0, f.y, 0, BLOCKS.FARMLAND);
  f.world.setVoxel(0, f.y + 1, 0, setup);
  const before = f.drops.length;
  const ok = harvest(f);
  return { ok, drops: f.drops.slice(before), block: f.world.getVoxel(0, f.y + 1, 0) };
};
const wheatMature = dropsFor(BLOCKS.WHEAT_STAGE_7, (f) => f.manager.harvest(0, f.y + 1, 0, player('survival')));
const wheatImmature = dropsFor(BLOCKS.WHEAT_STAGE_3, (f) => f.manager.handleCropBreak(0, f.y + 1, 0, BLOCKS.WHEAT_STAGE_3, 'survival') || true);
const sum = (drops, id) => drops.filter((d) => d.id === id).reduce((n, d) => n + d.count, 0);
const matureWheat = sum(wheatMature.drops, 'wheat');
const matureSeeds = sum(wheatMature.drops, 'wheat_seeds');
const immatureSeeds = sum(wheatImmature.drops, 'wheat_seeds');
// The seed count varies run to run, so sample it: the wiki's range is 0-2 dropped after the replant (1-3
// rolled, one of them consumed by the replant).
const seedCounts = new Set();
for (let i = 0; i < 400; i++) {
  seedCounts.add(sum(dropsFor(BLOCKS.WHEAT_STAGE_7, (f) => f.manager.harvest(0, f.y + 1, 0, player('survival'))).drops, 'wheat_seeds'));
}
const seedRange = [...seedCounts].sort((a, b) => a - b);
// Wiki (Wheat): "1 wheat and 1-4 wheat seeds" when mature (mean 2 5/7), so 0-3 once the replant takes one.
row('F10', wheatMature.ok && matureWheat === 1 && seedRange.every((n) => n >= 0 && n <= 3) && seedRange.includes(3)
  && wheatMature.block === BLOCKS.WHEAT_STAGE_0 && immatureSeeds === 1 ? 'PASS' : 'FAIL',
  'a mature wheat harvest gives 1 wheat plus 0-3 seeds (1-4 rolled, one replanted) and replants to stage 0; an immature plant gives 1 seed',
  `mature: ${matureWheat} wheat + ${matureSeeds} seeds (observed seed counts over 400 harvests: ${seedRange.join('/')}), replanted to ${wheatMature.block}; immature: ${immatureSeeds} seed(s)`);

// --- F11: hydrated farmland grows faster ---
// The wiki: hydrated farmland grows crops faster. Both rates are measured over the same number of growth
// ticks; only the ordering and a clear margin are asserted, because the page fetched gives no figure.
const growth = (moist) => {
  let advanced = 0;
  for (let i = 0; i < 3000; i++) {
    const f = makeFarm();
    // A water source at dx=1 makes the hydrated case hydrate itself, so the test does not have to assume the
    // manager keeps the moist block it was handed.
    if (moist) f.world.setVoxel(1, f.y, 0, BLOCKS.WATER);
    f.world.setVoxel(0, f.y, 0, moist ? BLOCKS.FARMLAND_MOIST : BLOCKS.FARMLAND);
    f.world.setVoxel(0, f.y + 1, 0, BLOCKS.WHEAT_STAGE_0);
    f.manager.registerFarmland(0, f.y, 0);
    f.manager.registerCrop(0, f.y + 1, 0);
    f.manager.update(1.1, player());
    if (f.world.getVoxel(0, f.y + 1, 0) !== BLOCKS.WHEAT_STAGE_0) advanced++;
  }
  return advanced / 3000;
};
const moistRate = growth(true);
const dryRate = growth(false);
row('F11', moistRate > dryRate * 1.5 ? 'PASS' : 'FAIL',
  'crops on hydrated farmland grow substantially faster than on dry farmland',
  `one growth tick advanced ${(moistRate * 100).toFixed(1)}% of hydrated crops and ${(dryRate * 100).toFixed(1)}% of dry ones`,
  'the exact rates are not on the page fetched, so the ordering and a 1.5x margin are asserted, not the figures -- SPEC_UNVERIFIED for the numbers');

// --- F12: a crop on soil that is gone pops off ---
const f12 = makeFarm();
f12.world.setVoxel(0, f12.y + 1, 0, BLOCKS.WHEAT_STAGE_4);
f12.manager.registerCrop(0, f12.y + 1, 0);
f12.manager.update(1.1, player());
const poppedBlock = f12.world.getVoxel(0, f12.y + 1, 0);
row('F12', poppedBlock === BLOCKS.AIR ? 'PASS' : 'FAIL',
  'a crop whose farmland is gone is removed',
  `block above bare air is now ${poppedBlock}`,
  'the soil beneath it was never farmland');

// --- F13: trampling ---
const f13 = makeFarm();
f13.world.setVoxel(0, f13.y, 0, BLOCKS.FARMLAND);
f13.world.setVoxel(0, f13.y + 1, 0, BLOCKS.WHEAT_STAGE_5);
// The wiki's chance is (fall distance - 0.5), so pin the dice for the case that must trample (1.0 -> 50%).
f13.manager.random = () => 0.1;
const fell = f13.manager.checkTrample(player('survival'), 0, f13.y, 0, 1.0);
const afterTrample = { soil: f13.world.getVoxel(0, f13.y, 0), crop: f13.world.getVoxel(0, f13.y + 1, 0) };
// A gentle landing must not trample.
const f13b = makeFarm();
f13b.world.setVoxel(0, f13b.y, 0, BLOCKS.FARMLAND);
const gentle = (f13b.manager.random = () => 0, f13b.manager.checkTrample({ gamemode: 'survival', velocity: { y: -0.1 }, keys: { Space: true } }, 0, f13b.y, 0, 0.5));
row('F13', fell && afterTrample.soil === BLOCKS.DIRT && afterTrample.crop === BLOCKS.AIR && gentle === false ? 'PASS' : 'FAIL',
  'a landing turns farmland to dirt with chance (fall - 0.5) and pops the crop; a 0.5 fall or held jump never does',
  `hard landing -> ${fell}, soil ${afterTrample.soil}, crop ${afterTrample.crop}; gentle -> ${gentle}`);

// --- F14: the crops the wiki lists but this build still does not model ---
// Beetroots ARE modelled now, with their own four stages and their own bone meal rule (F16). The two STEMS
// and bamboo are not: the registry carries each as a single block, and a stem's growth is a stage on a block
// whose only art is the grown stem, so there is nothing to advance through.
const unmodelled = [
  ['melon_stem', BLOCKS.MELON_STEM],
  ['pumpkin_stem', BLOCKS.PUMPKIN_STEM],
  ['bamboo', BLOCKS.BAMBOO],
];
const modelledFails = [];
for (const [name, id] of unmodelled) {
  if (id === undefined) { modelledFails.push(`${name} has no block id`); continue; }
  if (getCropInfo(id)) modelledFails.push(`${name} is unexpectedly a crop`);
}
// Nether wart and sugar cane are the two the wiki says bone meal does NOT affect in Java Edition, so their
// absence is deliberate rather than a gap.
const correctlyInert = ['nether_wart', 'sugar_cane'];
for (const [name, id] of [['nether_wart', BLOCKS.NETHER_WART], ['sugar_cane', BLOCKS.SUGAR_CANE]]) {
  if (getCropInfo(id)) modelledFails.push(`${name} must NOT be bone-mealable, but is a crop`);
  if (BONE_MEAL_PLANTS[id]) modelledFails.push(`${name} must NOT be bone-mealable, but is in the plant table`);
}
row('F14', modelledFails.length ? 'FAIL' : 'GAP',
  `beetroots are modelled; the two stems and bamboo are single blocks with no growth stages`,
  modelledFails.length ? modelledFails.join('; ')
    : `${unmodelled.map(([n]) => n).join(', ')} are single blocks, so no growth applies; ${correctlyInert.join(' and ')} are correctly absent, as the wiki says bone meal does not affect them in Java Edition`,
  'the stems reuse one texture in vanilla too, so a stage there would need a model, not just art');

// --- F15: the other bone-mealable plants ---
// Wiki (Bone Meal), "Fertilizer": "Short Grass / Fern / Seagrass -- a one-block-high ... grows into a
// two-block-high tall grass, large fern, or tall seagrass", and "Sunflower / Lilac / Rose Bush / Peony --
// The corresponding item form drops, without destroying the original plant".
const plantCases = [
  ['short grass becomes tall grass', BLOCKS.SHORT_GRASS, 'to', BLOCKS.TALL_GRASS],
  ['fern becomes large fern', BLOCKS.FERN, 'to', BLOCKS.LARGE_FERN],
  ['seagrass becomes tall seagrass', BLOCKS.SEAGRASS, 'to', BLOCKS.TALL_SEAGRASS],
];
const plantFails = [];
for (const [label, from, kind, to] of plantCases) {
  const f = makeFarm();
  f.world.setVoxel(0, f.y, 0, from);
  const before = f.drops.length;
  const ok = f.manager.applyBoneMeal(0, f.y, 0, player());
  const after = f.world.getVoxel(0, f.y, 0);
  if (!ok || after !== to) plantFails.push(`${label}: ${ok ? 'ok' : 'refused'}, block ${after}, wanted ${to}`);
  if (f.drops.length !== before) plantFails.push(`${label}: should not drop anything`);
}
// The flowers drop their item form and are NOT destroyed.
for (const [name, id] of [['lilac', BLOCKS.LILAC], ['peony', BLOCKS.PEONY], ['rose bush', BLOCKS.ROSE_BUSH]]) {
  const f = makeFarm();
  f.world.setVoxel(0, f.y, 0, id);
  const before = f.drops.length;
  const ok = f.manager.applyBoneMeal(0, f.y, 0, player());
  const after = f.world.getVoxel(0, f.y, 0);
  const dropped = f.drops.slice(before);
  if (!ok) plantFails.push(`${name}: refused`);
  if (after !== id) plantFails.push(`${name}: the original must survive, block is now ${after}`);
  if (dropped.length !== 1 || dropped[0].id !== id) plantFails.push(`${name}: expected its own item form to drop, got ${JSON.stringify(dropped)}`);
}
row('F15', plantFails.length ? 'FAIL' : 'PASS',
  'the plant rows of the wiki fertilizer table work: three grow to their tall form, three flowers drop an item and survive',
  plantFails.length ? plantFails.slice(0, 5).join('; ') : `all ${plantCases.length} growth swaps and all 3 flower drops correct`);

// --- F16: the beetroot's own bone meal rule ---
// Wiki (Bone Meal): "Beetroots -- The plant has a 75% chance of growing to the next growth stage." One
// stage, and only three times in four -- neither the 2-5 rule the other crops use nor a guarantee.
const beetStages = new Map();
let beetRefused = 0, beetAdvanced = 0;
const BEET_TRIES = 4000;
for (let i = 0; i < BEET_TRIES; i++) {
  const f = makeFarm();
  f.world.setVoxel(0, f.y, 0, BLOCKS.FARMLAND);
  f.world.setVoxel(0, f.y + 1, 0, BLOCKS.BEETROOTS_STAGE_0);
  // A MISS still reports success -- the bone meal was spent on a plant that did not grow, which is the
  // wiki's "wasting bone meal". So the 75% is the ADVANCE rate, not the return-value rate, and an earlier
  // version of this row read it the wrong way round.
  const ok = f.manager.applyBoneMeal(0, f.y, 0, player());
  if (!ok) { beetRefused++; continue; }
  const info = getCropInfo(f.world.getVoxel(0, f.y + 1, 0));
  beetStages.set(info.stage, (beetStages.get(info.stage) ?? 0) + 1);
  if (info.stage > 0) beetAdvanced++;
}
const beetReached = [...beetStages.keys()].sort((a, b) => a - b);
const advanceRate = beetAdvanced / BEET_TRIES;
// From stage 0 the ONLY stage a single bone meal can reach is 1 -- one stage, never two or more.
const overshot = beetReached.filter((s) => s > 1);
row('F16', beetRefused === 0 && overshot.length === 0 && advanceRate > 0.68 && advanceRate < 0.82 ? 'PASS' : 'FAIL',
  'one bone meal on beetroots advances exactly ONE stage, 75% of the time',
  `stages seen: ${beetReached.join('/')} (never past 1); advance rate ${(advanceRate * 100).toFixed(1)}% over ${BEET_TRIES} tries; refusals ${beetRefused}`,
  'a two-or-more-stage advance would mean it inherited the 2-5 rule from wheat instead of having its own');

// --- F17: the grass spread is a 15x15x15 area ---
// Wiki (Bone Meal), "Creating new plants": "Grass blocks within a 15x15x15 area of the target block
// randomly choose which type of foliage to grow".
const f17 = makeFarm();
let grassPlaced = 0;
for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) f17.world.setVoxel(dx, f17.y, dz, BLOCKS.GRASS);
f17.manager.applyBoneMeal(0, f17.y, 0, player());
let farSprouted = 0, tooFarSprouted = 0;
for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) {
  const v = f17.world.getVoxel(dx, f17.y + 1, dz);
  if (v === BLOCKS.DANDELION || v === BLOCKS.POPPY || v === BLOCKS.SHORT_GRASS) grassPlaced++;
}
for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
  if (Math.abs(dx) <= 8 && Math.abs(dz) <= 8) continue;
  const v = f17.world.getVoxel(dx, f17.y + 1, dz);
  if (v === BLOCKS.DANDELION || v === BLOCKS.POPPY || v === BLOCKS.SHORT_GRASS) tooFarSprouted++;
}
row('F17', grassPlaced > 20 && tooFarSprouted === 0 ? 'PASS' : 'FAIL',
  'bone meal on grass sprouts foliage across a 15x15 area and nothing outside it',
  `${grassPlaced} blocks sprouted inside the 15x15 patch (225 grass blocks available), ${tooFarSprouted} outside`,
  'the biome rule that chooses the foliage TYPE is not modelled -- SPEC_UNVERIFIED');

const report = {
  referenceProfile: 'Java Edition 1.21.4 farming; https://minecraft.wiki/w/Farming, /w/Bone_Meal and /w/Farmland.',
  layer: 'production FarmingManager, crop table and hydration rule only; the bot till/use actions are tested in e2e/farmCommand.pw.js',
  summary: {
    total: rows.length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    fail: rows.filter((r) => r.status === 'FAIL').length,
    gap: rows.filter((r) => r.status === 'GAP').length,
    specUnverified: rows.filter((r) => r.status === 'SPEC_UNVERIFIED').length,
  },
  rows,
};

if (process.argv.includes('--write')) {
  await mkdir('docs/artifacts', { recursive: true });
  await writeFile('docs/artifacts/farm-probe.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(process.argv.includes('--write') ? { artifact: 'docs/artifacts/farm-probe.json', summary: report.summary, rows: rows.map((r) => `${r.id} ${r.status} :: ${r.actual}`) } : report, null, 2));




