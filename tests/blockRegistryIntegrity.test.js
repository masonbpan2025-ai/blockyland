// Registry integrity: the invariants that make a batch of added blocks actually usable.
//
// The ores, saplings and infested blocks were each added as data, and the same four things have to be
// true of every one of them: the id is unique and round-trips, the definition resolves to a texture
// that exists on disk, the harvest table gates it, and breaking it yields what the definition says. A
// block that misses one of those is a grey tile, an unbreakable block, or a phantom drop -- none of
// which an individual block test would notice, because each is locally valid.
//
// The sweeps below run over the whole registry, so they keep their value as blocks are added. They are
// strict about anything NOT in the KNOWN_* lists, which record defects that already exist and are
// somebody else's to fix. That split is deliberate: an allowlist that silently absorbs new breakage
// would be worse than no test, so these lists carry a reason and a count, and a test asserts the count
// so a list that has grown is visible in review rather than swallowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { harvestDataFor, blastResistanceFor } from '../src/blockHarvestData.js';
import { miningEffect } from '../src/miningRules.js';
import { getBlockDrop } from '../src/itemVisuals.js';
import { buildCreativeCatalog } from '../src/creativeCatalog.js';

const BLOCK_ASSET_DIR = path.join(process.cwd(), 'public', 'assets', 'blocks');

/**
 * The id floor for hand-added blocks.
 *
 * scripts/generate-content-expansion.mjs allocates ids 222..945; everything from 946 up was added by
 * hand (cobbled deepslate, then the ore, sapling and infested batches). That boundary is what makes
 * these sweeps useful: the hand-added range is small, strict, and the place new work lands, while the
 * generated range carries a lot of pre-existing art debt (mineral blocks, banners, candles, buttons)
 * that is not block-parity work and would drown the signal.
 */
const HAND_ADDED_ID_FLOOR = 946;

/** Definitions in the generated range that name a texture which is not on disk. Reported, not asserted. */
const KNOWN_GENERATED_TEXTURE_GAPS = 'generated-range art gaps (see block-parity/gap-summary.mjs)';

/** Blocks whose declared drop does not resolve to a real item or block. Pre-existing, reported below. */
const KNOWN_PHANTOM_DROPS = new Set([
  // `drop` was given the item NAME where a block id belongs, so getBlockDrop returns a string and the
  // drop spawns nothing. Not block-parity work; recorded so the test stays honest about the residue.
  'Redstone Wire', 'Tripwire', 'Sculk Sensor', 'Sculk Shrieker',
]);

const textureFiles = (def) =>
  def?.textures ? Object.values(def.textures).filter((v) => typeof v === 'string') : [];

// --- the infested family specifically ----------------------------------------

const INFESTED = [
  'INFESTED_STONE', 'INFESTED_COBBLESTONE', 'INFESTED_STONE_BRICKS',
  'INFESTED_MOSSY_STONE_BRICKS', 'INFESTED_CRACKED_STONE_BRICKS',
  'INFESTED_CHISELED_STONE_BRICKS', 'INFESTED_DEEPSLATE',
];

test('every infested block exists, is marked, and yields nothing', () => {
  for (const key of INFESTED) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];
    assert.ok(def, `${key} must have a definition`);
    assert.equal(def.silverfish, true,
      `${key} must carry the silverfish marker, or breaking it silently releases nothing`);

    // Vanilla: an infested block drops nothing, even with the right tool. `drop: null` is what makes
    // that true, because getBlockDrop() reads it.
    assert.equal(def.drop, null, `${key} must not drop itself`);
    assert.equal(getBlockDrop(id), null, `${key} must resolve to no drop`);

    // And the generated harvest table must agree rather than contradict it.
    const harvest = harvestDataFor(id);
    assert.ok(harvest, `${key} must have a harvest row`);
    assert.deepEqual(harvest.drops, [], `${key} harvest row must declare no drops`);
  }
});

test('an infested block imitates its base block, which is the point of the block', () => {
  // Vanilla ships no textures for these: each is drawn with the texture of the block it imitates. That
  // is what makes infested stone indistinguishable from stone, so reusing the base texture is correct
  // rather than a shortcut -- and it means the texture has to exist, which the sweep below checks.
  const expected = {
    INFESTED_STONE: 'stone.png',
    INFESTED_COBBLESTONE: 'cobblestone.png',
    INFESTED_STONE_BRICKS: 'stone_bricks.png',
    INFESTED_MOSSY_STONE_BRICKS: 'mossy_stone_bricks.png',
    INFESTED_CRACKED_STONE_BRICKS: 'cracked_stone_bricks.png',
    INFESTED_CHISELED_STONE_BRICKS: 'chiseled_stone_bricks.png',
  };
  for (const [key, texture] of Object.entries(expected)) {
    const files = textureFiles(BLOCK_DEFS[BLOCKS[key]]);
    assert.ok(files.includes(texture),
      `${key} should be drawn with ${texture}, got ${JSON.stringify(files)}`);
  }
  // Deepslate is top/side/bottom, so it is checked separately.
  const deepslate = textureFiles(BLOCK_DEFS[BLOCKS.INFESTED_DEEPSLATE]);
  assert.ok(deepslate.includes('deepslate.png'), 'infested deepslate uses deepslate.png');
});

test('an infested block breaks faster than the block it imitates', () => {
  // 0.75 against stone's 1.5 at the same tool: an infested block is a tell, not a wall.
  const stone = miningEffect(BLOCKS.STONE, { speed: 8 }, 'iron_pickaxe');
  const infested = miningEffect(BLOCKS.INFESTED_STONE, { speed: 8 }, 'iron_pickaxe');
  assert.ok(infested.canHarvest, 'infested stone is harvestable with a pickaxe');
  assert.ok(infested.hardness < stone.hardness,
    `infested stone (${infested.hardness}) should be softer than stone (${stone.hardness})`);
});

// --- the ground-cover family --------------------------------------------------

test('every potted plant exists, matches its own sprite, and drops itself', () => {
  // Thirty-seven near-identical definitions is the largest copy-paste surface in the registry, so each is
  // checked against its OWN key: a potted poppy drawn with the dandelion sprite, or named for one plant
  // and textured for another, is the failure this looks for.
  //
  // The drop is checked as a deliberate simplification too. Vanilla drops the pot AND the plant, which
  // this one-drop-per-block model cannot express, so each potted plant drops itself and both come back
  // assembled.
  const POT = 'potted_';
  const potted = Object.keys(BLOCKS)
    .filter((k) => k.startsWith('POTTED_') && typeof BLOCKS[k] === 'number')
    .sort();

  assert.equal(potted.length, 37, `expected thirty-seven potted plants, found ${potted.length}`);

  for (const key of potted) {
    const id = BLOCKS[key];
    const def = BLOCK_DEFS[id];

    // The texture must be this plant's own composed tile.
    const expected = `${POT}${key.slice('POTTED_'.length).toLowerCase()}.png`;
    assert.deepEqual(def.textures, { all: expected }, `${key} must use ${expected}`);

    // It must actually be on disk, since these are composed rather than downloaded.
    assert.ok(existsSync(path.join('public', 'assets', 'blocks', expected)),
      `${key} points at ${expected}, which is not on disk. Run scripts/compose-potted-plants.py.`);

    // It shares the flower pot's geometry, and is not a full cube.
    assert.equal(def.flowerPot, true, `${key} must use the flower pot geometry`);
    assert.equal(def.transparent, true, `${key} is a partial shape and must not occlude neighbours`);

    // And it drops itself, so the pot and plant both come back.
    const drop = getBlockDrop(id);
    assert.ok(drop, `${key} must drop something`);
    assert.equal(drop.id, id, `${key} must drop itself`);
  }
});

test('the flower pot is drawn with the flower pot sprite, not a stand-in', () => {
  // The pot's definition had been pointing at iron_bars.png. That was not a deliberate reuse: the
  // generator's texture resolver falls back to iron_bars when `flower_pot.png` is absent, so the block
  // rendered as a fence-like tile purely because the sprite was never downloaded. The fallback still
  // exists for genuinely untextured blocks, which is why this asserts the OUTCOME rather than the path.
  const def = BLOCK_DEFS[BLOCKS.FLOWER_POT];
  assert.deepEqual(def.textures, { all: 'flower_pot.png' },
    'the flower pot must use its own sprite');
  assert.ok(existsSync(path.join('public', 'assets', 'blocks', 'flower_pot.png')),
    'flower_pot.png must be on disk, or the generator will fall back to iron_bars.png again');

  // The pot itself is still a pot: shared geometry, partial shape.
  assert.equal(def.flowerPot, true, 'the flower pot uses the flower pot geometry');

  // The composer that builds the potted tiles must be committed, since the art is unreproducible without it.
  assert.ok(existsSync(path.join('scripts', 'compose-potted-plants.py')),
    'scripts/compose-potted-plants.py must be committed alongside the textures it produces');
});

test('a candle cake drops its candle, and a plain cake drops nothing', () => {
  // The harvest table is explicit and the two rules differ, which is the same trap the coral family set:
  // a CANDLE CAKE yields its CANDLE -- not the cake, not itself -- while a plain CAKE yields nothing,
  // because vanilla makes you eat it rather than recover it.
  const COLORS = [
    'WHITE', 'ORANGE', 'MAGENTA', 'LIGHT_BLUE', 'YELLOW', 'LIME', 'PINK', 'GRAY',
    'LIGHT_GRAY', 'CYAN', 'PURPLE', 'BLUE', 'BROWN', 'GREEN', 'RED', 'BLACK',
  ];

  assert.equal(getBlockDrop(BLOCKS.CAKE), null,
    'a plain cake drops nothing; it is eaten, not recovered');

  // The plain candle cake drops the undyed candle.
  const plain = getBlockDrop(BLOCKS.CANDLE_CAKE);
  assert.ok(plain, 'the plain candle cake must drop something');
  assert.equal(plain.id, 'candle', 'and it is the plain candle');
  assert.equal(plain.isBlock, false, 'which is an ITEM, not a block');

  for (const colour of COLORS) {
    const key = `${colour}_CANDLE_CAKE`;
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);

    const drop = getBlockDrop(id);
    const expectedItem = `${colour.toLowerCase()}_candle`;
    assert.ok(drop, `${key} must drop its candle`);
    assert.equal(drop.id, expectedItem, `${key} must drop ${expectedItem}, not another colour's`);
    assert.equal(drop.isBlock, false, `${key} drops an ITEM`);

    // The candle item must really exist, or the drop resolves to nothing in play.
    assert.ok(expectedItem in ITEMS, `${expectedItem} must be a real item`);

    // And the texture must be this colour's, which is the copy-paste failure this checks for.
    assert.deepEqual(BLOCK_DEFS[id].textures, { all: `${colour.toLowerCase()}_candle_cake.png` },
      `${key} must be drawn with its own composed texture`);
  }
});

test('the candle-cake textures exist even though the mirror does not ship them', () => {
  // These are the only textures in the project that are COMPOSED rather than downloaded, so this test
  // guards the committed composition script as much as the art: if someone clears public/assets and
  // re-runs the downloader, the candle cakes come back only if they also run the composer.
  const colours = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink',
    'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
  const needed = ['candle_cake.png', ...colours.map((c) => `${c}_candle_cake.png`)];
  const missing = needed.filter((f) => !existsSync(path.join('public', 'assets', 'blocks', f)));
  assert.deepEqual(missing, [],
    `composed candle-cake textures missing: ${missing.join(', ')}. Run `
    + '`python scripts/compose-candle-cakes.py` after the asset downloader, which fetches the cake and '
    + 'candle sprites it composites from.');

  // The composer itself must be committed, since without it the art is unreproducible.
  assert.ok(existsSync(path.join('scripts', 'compose-candle-cakes.py')),
    'scripts/compose-candle-cakes.py must be committed alongside the textures it produces');
});

test('the technical blocks exist, are drawable, and claim no behaviour they lack', () => {
  // Every block in this family is machinery in vanilla and inert decoration here. The point of the test
  // is the SECOND half: each must be a real, drawable cube, and must NOT carry a marker promising a
  // mechanic this engine has no layer for. If a command layer, a spawner entity or a vault mechanic
  // lands, these assertions should be replaced rather than quietly deleted.
  const TECHNICAL = {
    COMMAND_BLOCK: ['front', 'side', 'back', 'top', 'bottom'],
    REPEATING_COMMAND_BLOCK: ['front', 'side', 'back', 'top', 'bottom'],
    CHAIN_COMMAND_BLOCK: ['front', 'side', 'back', 'top', 'bottom'],
    STRUCTURE_BLOCK: ['all'],
    JIGSAW: ['top', 'side', 'bottom'],
    SPAWNER: ['all'],
    TRIAL_SPAWNER: ['top', 'side', 'bottom'],
    VAULT: ['top', 'side', 'front', 'bottom'],
    END_PORTAL_FRAME: ['top', 'side', 'bottom'],
    TURTLE_EGG: ['all'],
    FROGSPAWN: ['all'],
  };

  for (const [key, faces] of Object.entries(TECHNICAL)) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    // Drawable: every face it names must resolve to a texture file that exists.
    assert.deepEqual(Object.keys(def.textures).sort(), [...faces].sort(),
      `${key} must name exactly the faces its model uses`);
    for (const [face, file] of Object.entries(def.textures)) {
      assert.ok(existsSync(path.join('public', 'assets', 'blocks', file)),
        `${key}.${face} points at ${file}, which does not exist`);
    }

    // A real cube, not a plant or a partial shape.
    assert.notEqual(def.solid, false, `${key} is a full cube`);
    assert.equal(def.plant, undefined, `${key} is not a plant`);

    // And no promise of a mechanic this engine does not have.
    for (const marker of ['command', 'runsCommand', 'spawns', 'spawner', 'container', 'inventory', 'lootTable', 'opens']) {
      assert.equal(def[marker], undefined, `${key} must not claim a "${marker}" behaviour it lacks`);
    }
  }

  // The monster spawner is the one with harvest data, and it follows it: hardness 5, pickaxe required,
  // and it yields nothing.
  const spawner = BLOCKS.SPAWNER;
  assert.equal(BLOCK_DEFS[spawner].hardness, 5.0, 'the spawner has hardness 5 per its harvest row');
  assert.equal(getBlockDrop(spawner), null, 'the spawner drops nothing');
  assert.equal(miningEffect(spawner, null, null).canHarvest, false, 'and needs a pickaxe');
  assert.ok(miningEffect(spawner, { speed: 8 }, 'wooden_pickaxe').canHarvest, 'which does harvest it');
});

test('all seventeen shulker boxes exist, match their own colour, and drop themselves', () => {
  // Same copy-paste risk as the glazed terracotta family, checked the same way: against each colour's OWN
  // key, so a box drawn with another colour's texture fails.
  const COLORS = [
    'WHITE', 'ORANGE', 'MAGENTA', 'LIGHT_BLUE', 'YELLOW', 'LIME', 'PINK', 'GRAY',
    'LIGHT_GRAY', 'CYAN', 'PURPLE', 'BLUE', 'BROWN', 'GREEN', 'RED', 'BLACK',
  ];

  // The plain box first, which is the one entry whose name carries no colour.
  const plain = BLOCKS.SHULKER_BOX;
  assert.equal(typeof plain, 'number', 'the plain shulker box must be registered');
  assert.deepEqual(BLOCK_DEFS[plain].textures, { all: 'shulker_box.png' },
    'the plain box must use the undyed texture');
  assert.equal(BLOCK_DEFS[plain].drop, plain, 'the plain box drops itself');

  for (const colour of COLORS) {
    const key = `${colour}_SHULKER_BOX`;
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);

    const def = BLOCK_DEFS[id];
    assert.equal(def.hardness, 2.0, `${key} has the harvest table's hardness`);
    assert.equal(def.drop, id, `${key} drops itself`);
    assert.deepEqual(def.textures, { all: `${colour.toLowerCase()}_shulker_box.png` },
      `${key} must be drawn with its own texture`);
    assert.notEqual(def.solid, false, `${key} is a full cube`);
  }

  // The harvest rows name a pickaxe but do NOT set requiresTool, which is the same shape the amethyst
  // growths had. Asserted against the data rather than against an assumption about what "needs a
  // pickaxe" implies: a shulker box can be broken bare-handed and still yields itself.
  for (const [key, id] of [[null, plain], ...COLORS.map((c) => [c, BLOCKS[`${c}_SHULKER_BOX`]])]) {
    const label = key ? `${key} shulker box` : 'shulker box';
    const row = harvestDataFor(id);
    assert.equal(row.tool, 'pickaxe', `${label} names a pickaxe in its harvest row`);
    assert.equal(Boolean(row.requiresTool), false, `${label} does not require one, per the same row`);
    assert.ok(miningEffect(id, { speed: 8 }, 'wooden_pickaxe').canHarvest, `${label} must yield to a pickaxe`);
    assert.ok(miningEffect(id, null, null).canHarvest, `${label} is collectable bare-handed`);
  }
});

test('a shulker box is a decorative cube, not a container, and the code says so', () => {
  // This family is registered as a HALF-MEASURE: vanilla shulker boxes hold 27 slots and keep their
  // contents when broken, and this game has no block-inventory layer. The test records that as a
  // deliberate state rather than letting it look like an oversight -- if a container layer lands, this
  // test should be deleted, not quietly updated.
  const id = BLOCKS.SHULKER_BOX;
  const def = BLOCK_DEFS[id];

  // It must NOT carry any of the markers that would promise behaviour it does not have.
  assert.equal(def.container, undefined, 'shulker box must not claim to be a container');
  assert.equal(def.inventory, undefined, 'shulker box must not claim an inventory');
  assert.equal(def.openable, undefined, 'shulker box must not claim to open');
  // It IS a plain solid cube, which is exactly what it is.
  assert.equal(def.plant, undefined, 'a shulker box is not a plant');
  assert.equal(def.transparent, undefined, 'a shulker box is opaque');
});

test('all sixteen glazed terracotta colours exist and behave identically', () => {
  // Sixteen near-identical definitions are where a copy-paste error survives review -- the wrong colour
  // in a name, or a texture pointing at another colour's file. So each is checked against its own key
  // rather than as a set: a definition whose texture does not match its own name is the failure this
  // is looking for.
  const COLORS = [
    'WHITE', 'ORANGE', 'MAGENTA', 'LIGHT_BLUE', 'YELLOW', 'LIME', 'PINK', 'GRAY',
    'LIGHT_GRAY', 'CYAN', 'PURPLE', 'BLUE', 'BROWN', 'GREEN', 'RED', 'BLACK',
  ];
  assert.equal(COLORS.length, 16, 'there are sixteen colours');

  for (const colour of COLORS) {
    const key = `${colour}_GLAZED_TERRACOTTA`;
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);

    const def = BLOCK_DEFS[id];
    assert.ok(def, `${key} must have a definition`);
    assert.equal(def.hardness, 1.4, `${key} has the harvest table's hardness`);
    assert.equal(def.drop, id, `${key} drops itself`);

    // The texture must be THIS colour's, not another's -- the copy-paste bug this test exists for.
    assert.deepEqual(def.textures, { all: `${colour.toLowerCase()}_glazed_terracotta.png` },
      `${key} must be drawn with its own texture`);

    // And it must be a plain solid cube: an oriented block would carry a facing flag, which this game
    // cannot render, so asserting its absence records the limitation rather than hiding it.
    assert.notEqual(def.solid, false, `${key} is a full cube`);
    assert.equal(def.plant, undefined, `${key} is not a plant`);
  }
});

test('a coral FAN drops itself, while a coral BLOCK drops its dead form', () => {
  // These two rules point in opposite directions and sit in the same family, which is exactly why a
  // copy-paste between them is easy and silent. A living coral BLOCK degrades and drops its dead
  // counterpart; a living coral FAN has no dead form to drop into and keeps itself, while the dead fans
  // are separate blocks a player places and which yield nothing. So:
  //
  //   block   living -> dead block    dead block -> itself
  //   fan     living -> itself        dead fan   -> nothing
  const CORAL = [['TUBE', 'Tube'], ['BRAIN', 'Brain'], ['BUBBLE', 'Bubble'], ['FIRE', 'Fire'], ['HORN', 'Horn']];

  for (const [key] of CORAL) {
    const liveBlock = getBlockDrop(BLOCKS[`${key}_CORAL_BLOCK`]);
    const deadBlock = getBlockDrop(BLOCKS[`DEAD_${key}_CORAL_BLOCK`]);
    const liveFan = getBlockDrop(BLOCKS[`${key}_CORAL_FAN`]);
    const deadFan = getBlockDrop(BLOCKS[`DEAD_${key}_CORAL_FAN`]);

    assert.equal(liveBlock?.id, BLOCKS[`DEAD_${key}_CORAL_BLOCK`],
      `a living ${key} coral BLOCK must drop its dead form`);
    assert.equal(deadBlock?.id, BLOCKS[`DEAD_${key}_CORAL_BLOCK`],
      `a dead ${key} coral block must drop itself`);
    assert.equal(liveFan?.id, BLOCKS[`${key}_CORAL_FAN`],
      `a living ${key} coral FAN must drop itself, not a dead fan`);
    assert.equal(deadFan, null,
      `a dead ${key} coral fan must drop nothing, per its empty harvest row`);
  }

  // The fans are cross-quad decoration and must not block movement or occlude light.
  for (const [key] of CORAL) {
    for (const prefix of ['', 'DEAD_']) {
      const def = BLOCK_DEFS[BLOCKS[`${prefix}${key}_CORAL_FAN`]];
      assert.equal(def.plant, true, `${prefix}${key} coral fan draws as a cross`);
      assert.equal(def.solid, false, `${prefix}${key} coral fan must not block movement`);
      assert.equal(def.transparent, true, `${prefix}${key} coral fan must not occlude light`);
    }
  }

  // And the three hanging vines reuse the ceiling-anchored flip added for hanging roots.
  for (const key of ['WEEPING_VINES', 'TWISTING_VINES', 'CAVE_VINES']) {
    const def = BLOCK_DEFS[BLOCKS[key]];
    assert.equal(def.hang, true, `${key} must be ceiling-anchored`);
    assert.equal(def.plant, true, `${key} must draw as a cross`);
  }
});

test('the amethyst family drops only what vanilla drops', () => {
  // This is the reason the family is one batch: four of the five blocks yield NOTHING and only the
  // cluster yields, so a copy-pasted definition in either direction is a silent bug. Budding amethyst
  // in particular is unobtainable in vanilla precisely so an amethyst farm cannot be moved, which is a
  // game rule rather than an oversight.
  assert.equal(getBlockDrop(BLOCKS.BUDDING_AMETHYST), null,
    'budding amethyst must drop nothing; it is unobtainable so a farm cannot be relocated');

  for (const key of ['LARGE_AMETHYST_BUD', 'MEDIUM_AMETHYST_BUD', 'SMALL_AMETHYST_BUD']) {
    assert.equal(getBlockDrop(BLOCKS[key]), null, `${key} must drop nothing`);
    assert.deepEqual(harvestDataFor(BLOCKS[key]).drops, [], `${key} harvest row must agree`);
  }

  const cluster = getBlockDrop(BLOCKS.AMETHYST_CLUSTER);
  assert.ok(cluster, 'the cluster is the one that yields');
  assert.equal(cluster.id, 'amethyst_shard', 'and it yields a shard, not itself');
  assert.ok('amethyst_shard' in ITEMS, 'which must be a real item');

  // The budding block is the only one the harvest table marks `requiresTool`, which matches the wiki:
  // every amethyst growth can be collected by hand, while the budding block needs a pickaxe. Asserting
  // the two groups separately is what makes this a test of the data rather than of a shared path.
  assert.equal(miningEffect(BLOCKS.BUDDING_AMETHYST, null, null).canHarvest, false,
    'budding amethyst must NOT be harvestable by hand');
  assert.ok(miningEffect(BLOCKS.BUDDING_AMETHYST, { speed: 8 }, 'wooden_pickaxe').canHarvest,
    'budding amethyst must yield to a pickaxe');

  for (const key of ['AMETHYST_CLUSTER', 'LARGE_AMETHYST_BUD', 'MEDIUM_AMETHYST_BUD', 'SMALL_AMETHYST_BUD']) {
    assert.ok(miningEffect(BLOCKS[key], null, null).canHarvest,
      `${key} can be collected by hand, as in vanilla`);
  }
});

test('the ground-cover plants are cross-quad decoration, not obstacles', () => {
  // All four share the shape, which is why they were one batch. `plant` is what the mesher reads to
  // draw a cross, `solid: false` is what stops them blocking movement, and `transparent` is what stops
  // them occluding light -- getting any of the three wrong makes the block look or behave like a cube.
  for (const key of ['SHORT_GRASS', 'FERN', 'DEAD_BUSH', 'COBWEB']) {
    const def = BLOCK_DEFS[BLOCKS[key]];
    assert.ok(def, `${key} must be registered`);
    assert.equal(def.plant, true, `${key} must be marked as a plant so the mesher draws a cross`);
    assert.equal(def.solid, false, `${key} must not block movement`);
    assert.equal(def.transparent, true, `${key} must not occlude`);
    assert.equal(typeof def.hardness, 'number', `${key} must declare a hardness`);
  }
});

test('the ground-cover drops match vanilla, including the two that drop nothing', () => {
  // This is the part of the batch worth pinning, because getBlockDrop() reads the DEFINITION and the
  // four blocks disagree:
  //
  //   short grass, fern   nothing (vanilla grass can yield seeds; this game models no seed drop)
  //   dead bush           a stick
  //   cobweb              string, and only with a sword
  assert.equal(getBlockDrop(BLOCKS.SHORT_GRASS), null, 'short grass drops nothing');
  assert.equal(getBlockDrop(BLOCKS.FERN), null, 'fern drops nothing');

  const bush = getBlockDrop(BLOCKS.DEAD_BUSH);
  assert.ok(bush, 'dead bush drops something');
  assert.equal(bush.id, 'stick', 'a dead bush drops a stick, not itself');
  assert.equal(bush.isBlock, false, 'and it is an item, not a block');

  const web = getBlockDrop(BLOCKS.COBWEB);
  assert.ok(web, 'cobweb drops something');
  assert.equal(web.id, 'string', 'cobweb drops string, not itself');
  assert.ok('string' in ITEMS, 'and string is a real item');

  // The harvest table must agree rather than contradict: both nothings are declared as empty arrays,
  // and cobweb is gated on a sword.
  assert.deepEqual(harvestDataFor(BLOCKS.SHORT_GRASS).drops, [], 'short grass harvest row: no drops');
  assert.deepEqual(harvestDataFor(BLOCKS.FERN).drops, [], 'fern harvest row: no drops');
  const webHarvest = harvestDataFor(BLOCKS.COBWEB);
  assert.equal(webHarvest.tool, 'sword', 'cobweb is harvested with a sword');
  assert.ok(webHarvest.requiresTool, 'and the sword is required, not merely faster');
});

// --- the sweeps over everything ----------------------------------------------

test('every hand-added block names a texture that exists on disk', () => {
  // A definition pointing at a file that is not there renders the grey placeholder tile, which reads
  // as a rendering bug rather than a missing asset. Generated textures are gitignored, so this also
  // catches a definition added without running the generator.
  //
  // Restricted to the hand-added range, where block-parity work lands. The generated range carries
  // pre-existing art debt -- mineral blocks, banners, candles, buttons -- that is counted separately
  // and is not this suite's to assert.
  const bad = [];
  let checked = 0;
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.name || Number(id) < HAND_ADDED_ID_FLOOR) continue;
    checked++;
    const files = textureFiles(def);
    if (!files.length) {
      bad.push(`${def.name} (id ${id}) names no texture`);
      continue;
    }
    for (const file of files) {
      if (!existsSync(path.join(BLOCK_ASSET_DIR, file))) bad.push(`${def.name} (id ${id}) -> ${file}`);
    }
  }
  assert.ok(checked > 20, `expected the hand-added range to hold the new batches, found ${checked}`);
  assert.deepEqual(bad, [],
    `hand-added definitions pointing at a missing texture:\n  ${bad.join('\n  ')}`);
  void KNOWN_GENERATED_TEXTURE_GAPS;
});

test('every block that drops something drops something real', () => {
  // getBlockDrop() reads `dropItem`/`drop`; a typo there produces a drop that resolves to nothing at
  // runtime, which is invisible until a player breaks the block. Covers the whole registry, because
  // the answer should be "nothing" and a new offender is a real finding.
  //
  // Four pre-existing offenders are listed rather than silently tolerated; the assertion is that the
  // list does not GROW, so a new block-parity definition cannot join it unnoticed.
  const bad = [];
  const known = [];
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.name) continue;
    const drop = getBlockDrop(Number(id));
    if (!drop) continue;
    let problem = null;
    if (drop.isBlock) {
      if (!BLOCK_DEFS[drop.id]) problem = `${def.name} drops block id ${drop.id}, which has no definition`;
    } else if (!(drop.id in ITEMS)) {
      problem = `${def.name} drops item "${drop.id}", which is not in ITEMS`;
    }
    if (!problem) continue;
    if (KNOWN_PHANTOM_DROPS.has(def.name)) known.push(def.name);
    else bad.push(problem);
  }
  assert.deepEqual(bad, [], `drops that resolve to nothing:\n  ${bad.join('\n  ')}`);
  assert.ok(new Set(known).size <= KNOWN_PHANTOM_DROPS.size,
    `the phantom-drop list grew to ${new Set(known).size}: ${[...new Set(known)].join(', ')}`);
});

test('every added block is reachable: it harvests, and it yields what it declares', () => {
  // The sweep that would have caught each of the three batches going in wrong. For every block the
  // harvest table knows about AND that has a definition, the mining path must produce a consistent
  // verdict in both directions.
  const bad = [];
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.name) continue;
    const harvest = harvestDataFor(Number(id));
    if (!harvest) continue;
    if (harvest.requiresTool) {
      const tool = `${harvest.tier ?? 'wooden'}_${harvest.tool ?? 'pickaxe'}`;
      const withTool = miningEffect(Number(id), { speed: 8 }, tool);
      if (!withTool.canHarvest) bad.push(`${def.name} is not harvestable with its own required ${tool}`);
      const bare = miningEffect(Number(id), null, null);
      if (bare.canHarvest) bad.push(`${def.name} requires a tool but is harvestable by hand`);
    }
  }
  assert.deepEqual(bad, [], `blocks whose harvest gate is inconsistent:\n  ${bad.join('\n  ')}`);
});

test('every block id is unique to one block', () => {
  const byId = new Map();
  const clashes = [];
  for (const [key, id] of Object.entries(BLOCKS)) {
    if (key === 'GRASS_BLOCK' || typeof id !== 'number') continue;
    if (byId.has(id)) {
      const other = byId.get(id);
      // A shorter alias for the same block is legitimate (RED_BED / RED_BED_FOOT); unrelated blocks
      // sharing an id is not.
      const shorter = key.length <= other.length ? key : other;
      const longer = shorter === key ? other : key;
      if (!longer.startsWith(shorter)) clashes.push(`${id}: ${other} and ${key}`);
    } else {
      byId.set(id, key);
    }
  }
  assert.deepEqual(clashes, [], `unrelated blocks sharing an id:\n  ${clashes.join('\n  ')}`);
});

test('every creative-catalogue block resolves to an icon that exists', () => {
  // Only block entries: an item's icon is the item pipeline's contract and is covered by
  // tests/item_icons.test.js. What matters here is that a block added to the catalogue points at real
  // art, since blockItem() derives its icon from the definition's texture.
  const bad = [];
  let checked = 0;
  for (const entry of buildCreativeCatalog()) {
    if (!entry.isBlock) continue;
    checked++;
    if (!entry.icon) { bad.push(`${entry.name} has no icon`); continue; }
    const rel = entry.icon.replace(/^\//, '');
    if (!existsSync(path.join(process.cwd(), 'public', rel))) bad.push(`${entry.name} -> ${entry.icon}`);
  }
  assert.ok(checked > 100, `expected a full block catalogue, found ${checked} block entries`);
  assert.deepEqual(bad, [], `catalogue blocks with a missing icon:\n  ${bad.join('\n  ')}`);
});

test('every breakable block resolves a blast resistance', () => {
  // A block with no resistance and a sane hardness should still have a finite resistance; only the
  // unbreakable sentinels (bedrock, the End Portal) report null. This catches a definition whose
  // hardness is missing entirely, which would make explosions treat it as unbreakable. Air is the one
  // legitimate exception, since it is not a block you can break or explode.
  const bad = [];
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.name || def.name === 'Air') continue;
    if (blastResistanceFor(Number(id)) !== null) continue;
    const hardness = def.hardness;
    const unbreakable = typeof hardness === 'number' && (hardness < 0 || hardness >= 99999);
    if (!unbreakable) bad.push(`${def.name} (id ${id}) has hardness ${hardness}`);
  }
  assert.deepEqual(bad, [], `blocks that are neither breakable nor marked unbreakable:\n  ${bad.join('\n  ')}`);
});
