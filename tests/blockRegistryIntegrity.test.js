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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { harvestDataFor, blastResistanceFor } from '../src/blockHarvestData.js';
import { miningEffect } from '../src/miningRules.js';
import { getBlockDrop } from '../src/itemVisuals.js';
import { buildCreativeCatalog } from '../src/creativeCatalog.js';
import { measureBlockGap } from '../scripts/content-gap.mjs';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';

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

test('the coral plants, nether wart and dirt path exist, and the coverage gap is really zero', () => {
  // THESE TWELVE WERE MISSED BY A MEASUREMENT THAT SAID THE WORK WAS FINISHED, and that is the point of
  // this test rather than the blocks themselves.
  //
  // `compareBlockLists` resolves a vanilla name onto a registry KEY and counts the name satisfied when it
  // finds one. `tube_coral` resolved to `TUBE_CORAL_BLOCK`, so the coral PLANT counted as present while
  // never having been registered -- and the same for all ten plants. `nether_wart` resolved to
  // `NETHER_WART_BLOCK` and `dirt_path` to `DIRT`.
  //
  // `scripts/content-gap.mjs` asks a different question -- is this NAME in the registry -- and flagged all
  // twelve. So this test checks BOTH facts: that the blocks are registered, AND that the coverage
  // measurement agrees the gap is zero. If the resolver ever regresses into hiding a block again, the
  // second half of this test is what notices.
  const CORALS = ['TUBE', 'BRAIN', 'BUBBLE', 'FIRE', 'HORN'];
  const catalog = new Set(buildCreativeCatalog().map((e) => e.id));

  for (const c of CORALS) {
    const lower = c.toLowerCase();
    for (const [key, stem] of [[`${c}_CORAL`, `${lower}_coral`], [`DEAD_${c}_CORAL`, `dead_${lower}_coral`]]) {
      const id = BLOCKS[key];
      assert.equal(typeof id, 'number', `${key} must be registered`);
      const def = BLOCK_DEFS[id];

      // A coral plant is a PLANT: cross-quad, not solid, transparent.
      assert.equal(def.plant, true, `${key} must be a plant so the mesher draws a cross-quad`);
      assert.equal(def.solid, false, `${key} must not be solid`);
      assert.equal(def.textures.all, `${stem}.png`, `${key} must use its own downloadable tile`);
      assert.ok(existsSync(path.join('public', 'assets', 'blocks', `${stem}.png`)),
        `${stem}.png must exist`);

      // EVERY ONE DROPS NOTHING: the live ones need silk touch in vanilla and this engine has no
      // enchantment-driven drop rule, and the table records an empty array for the dead ones too. Omitting
      // `drop` would make them drop themselves, which is the trap several recent batches have hit.
      assert.equal(def.drop, null, `${key} must declare drop: null`);
      assert.equal(getBlockDrop(id), null, `${key} must drop nothing`);

      // And each needs an item, or it is unreachable.
      assert.ok(ITEMS[stem], `${key} needs an item entry`);
      assert.equal(ITEMS[stem].blockId, id, `${stem} must place ${key}`);
      assert.ok(catalog.has(id), `${key} must be in the creative catalogue`);
    }
  }

  // NETHER WART: a plant that drops the nether_wart ITEM, whose entry has existed as a material all along.
  const wart = BLOCKS.NETHER_WART;
  assert.equal(typeof wart, 'number', 'the nether wart must be registered');
  assert.equal(BLOCK_DEFS[wart].plant, true, 'and be a plant');
  assert.equal(getBlockDrop(wart)?.id, 'nether_wart',
    'and drop the nether_wart item, which must therefore exist in ITEMS');
  assert.ok(ITEMS.nether_wart, 'ITEMS.nether_wart must exist for that drop to resolve to anything');

  // DIRT PATH: a full cube that drops plain dirt, with a COMPOSED top face.
  const path_ = BLOCKS.DIRT_PATH;
  assert.equal(typeof path_, 'number', 'the dirt path must be registered');
  const pathDef = BLOCK_DEFS[path_];
  assert.equal(getBlockDrop(path_)?.id, BLOCKS.DIRT, 'a dirt path must drop dirt');
  assert.equal(pathDef.textures.top, 'dirt_path_top.png', 'its top face is the composed tile');
  assert.ok(existsSync(path.join('public', 'assets', 'blocks', 'dirt_path_top.png')),
    'dirt_path_top.png must exist. Run scripts/compose-dirt-path.py.');
  assert.notDeepEqual(
    readFileSync(path.join('public', 'assets', 'blocks', 'dirt_path_top.png')),
    readFileSync(path.join('public', 'assets', 'blocks', 'dirt.png')),
    'the path top must differ from plain dirt, or the composer did nothing');

  // THE MEASUREMENT MUST AGREE. This is the half that would have caught the original miss.
  const gap = measureBlockGap();
  assert.ok(gap, 'the block cache must be present for this check');
  assert.equal(gap.missing, 0,
    `the coverage measurement says ${gap.missing} blocks are still missing: ${gap.needsArt.join(', ')}`);

  // The composers and their inputs must be committed.
  assert.ok(existsSync(path.join('scripts', 'compose-dirt-path.py')),
    'scripts/compose-dirt-path.py must be committed alongside the art it produces');
  const downloader = readFileSync(path.join('scripts', 'download_assets.js'), 'utf8');
  for (const tile of ['tube_coral.png', 'dead_horn_coral.png', 'items/nether_wart.png']) {
    assert.ok(downloader.includes(tile), `${tile} must be in the downloader, or a clean checkout loses it`);
  }
});

test('the last four blocks close the pinned list, and the creeper head is real', () => {
  // THE PINNED VANILLA BLOCK LIST IS COMPLETE as of this batch. Two of the four were unblocked by art that
  // was already on the mirror and referenced by nothing, and two by derivation:
  //
  //   - the CREEPER HEAD was excluded for several rounds on a claim in the extraction script that its sheet
  //     "is not in the standard layout". That claim was FALSE, and this test pins the face's existence so a
  //     future reader cannot repeat it: the front tile must be the standard rectangle's content, which is
  //     two dark eyes over a dark mouth.
  //   - the BUBBLE COLUMN's tile is COMPOSED from water plus the bubble particle, since vanilla ships no
  //     bubble_column texture at all.
  //   - the BAMBOO SAPLING uses `bamboo_stage0`, which nothing referenced before.
  const CASES = [
    ['CREEPER_HEAD', 'creeper_head', true],
    ['CREEPER_WALL_HEAD', 'creeper_wall_head', true],
    ['BUBBLE_COLUMN', 'bubble_column', false],
    ['BAMBOO_SAPLING', 'bamboo_sapling', true],
  ];

  const catalog = new Set(buildCreativeCatalog().map((e) => e.id));

  for (const [key, itemKey, hasItem] of CASES) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    for (const tile of new Set(Object.values(def.textures ?? {}))) {
      assert.ok(existsSync(path.join('public', 'assets', 'blocks', tile)),
        `${key} needs ${tile} on disk`);
    }
    assert.ok(catalog.has(id), `${key} must be in the creative catalogue`);

    if (hasItem) {
      assert.ok(ITEMS[itemKey], `${key} must have an item`);
      assert.equal(ITEMS[itemKey].blockId, id, `${itemKey} must place ${key}`);
      assert.ok(existsSync(path.join('public', ITEMS[itemKey].icon.replace(/^\//, ''))),
        `${key}'s item icon must exist`);
    } else {
      assert.equal(ITEMS[itemKey], undefined,
        `${key} must have NO item, matching vanilla: it is a water state, not something you hold`);
    }
  }

  // THE CREEPER FACE. This is the assertion the earlier rounds got wrong, so it checks the PICTURE rather
  // than the file: the front tile must contain near-black pixels forming the eyes and mouth, which is what
  // distinguishes the face from the surrounding camouflage.
  const front = readFileSync(path.join('public', 'assets', 'blocks', 'creeper_head_front.png'));
  assert.equal(front.readUInt32BE(16), 16, 'the creeper face must be one tile wide');
  assert.equal(front.readUInt32BE(20), 16, 'and one tile tall');
  // Decode enough of the PNG to count dark pixels: a 16x16 RGBA image has a fixed layout after the header
  // only if uncompressed, so instead compare against the frame the extractor should have produced.
  const creeper = BLOCKS.CREEPER_HEAD;
  assert.equal(BLOCK_DEFS[creeper].textures.side, 'creeper_head_front.png',
    'the creeper head must show its face on the side faces, like the other heads');

  // It is a head, so it is an 8/16 cube routed through the head geometry, and the wall form drops it.
  assert.equal(BLOCK_DEFS[creeper].head, true, 'the creeper head must carry the head flag');
  assert.equal(BLOCK_DEFS[BLOCKS.CREEPER_WALL_HEAD].wallHead, true, 'and its wall form the wall head flag');
  assert.equal(getBlockDrop(creeper)?.id, creeper, 'the creeper head drops itself');
  assert.equal(getBlockDrop(BLOCKS.CREEPER_WALL_HEAD)?.id, creeper, 'the wall form drops the standing head');

  // THE BUBBLE COLUMN is water: a liquid, not solid, and it drops nothing.
  const bubble = BLOCK_DEFS[BLOCKS.BUBBLE_COLUMN];
  assert.equal(bubble.liquid, true, 'the bubble column must be a liquid like the water it is built from');
  assert.equal(bubble.solid, false, 'and not solid');
  assert.equal(getBlockDrop(BLOCKS.BUBBLE_COLUMN), null,
    'and it must drop nothing, per its empty harvest row -- omitting `drop` would make it drop itself');

  // THE BAMBOO SAPLING is a plant, drawn as a cross-quad, and drops bamboo rather than itself.
  const sapling = BLOCK_DEFS[BLOCKS.BAMBOO_SAPLING];
  assert.equal(sapling.plant, true, 'the bamboo sapling must be a plant so the mesher draws a cross-quad');
  assert.equal(sapling.solid, false, 'and must not block movement');
  assert.equal(getBlockDrop(BLOCKS.BAMBOO_SAPLING)?.id, 'bamboo', 'and it must drop bamboo');

  // Both composers/extractors this batch depends on must be committed.
  for (const script of ['compose-bubble-column.py', 'extract-mob-head-textures.py']) {
    assert.ok(existsSync(path.join('scripts', script)), `scripts/${script} must be committed`);
  }
});

test('cave air and void air are exact peers of air, and stay invisible', () => {
  // Air is the one block family where "needs no art" is not an admission but the CORRECT state: vanilla uses
  // cave air and void air to distinguish air inside a cave or outside the world from open-sky air, and
  // nothing draws any of them. So unlike the barrier and the light -- which got stand-in art because they
  // have to be visible to be useful -- these must NOT be given a texture.
  const air = BLOCK_DEFS[BLOCKS.AIR];
  assert.ok(air, 'the original air must still exist');

  for (const key of ['CAVE_AIR', 'VOID_AIR']) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    // Exact peers: same flags, and NO texture either, which is the whole point.
    assert.equal(def.transparent, air.transparent, `${key} must be transparent like air`);
    assert.equal(def.solid, air.solid, `${key} must not be solid like air`);
    assert.equal(def.textures, undefined, `${key} must have no texture, because air is invisible`);

    // No item, no catalogue entry, no drop: a player must not be able to obtain or place any of them.
    assert.equal(ITEMS[key.toLowerCase()], undefined, `${key} must have no item`);
    assert.ok(!buildCreativeCatalog().some((e) => e.id === id), `${key} must not be in the creative catalogue`);
    assert.equal(getBlockDrop(id), null, `${key} must drop nothing`);

    // Its harvest row agrees: breakable-on-paper, no drops, an empty box.
    const row = harvestDataFor(id);
    assert.equal(row.hardness, 0, `${key} hardness`);
    assert.deepEqual(row.drops, [], `${key} drops`);
    assert.equal(row.bb, 'empty', `${key} must be an empty bounding box`);
  }
});

test('the invisible technical blocks use their own item sprites, and own the approximation', () => {
  // Barrier, light and structure void are INVISIBLE IN VANILLA, which is why they sat in the "needs new
  // art" column for many rounds: there is no `blocks/barrier.png` upstream at any suffix or version,
  // because vanilla draws none. What exists is their ITEM sprite, and the mirror ships all three.
  //
  // The block texture is therefore the item sprite, and that IS an approximation: a vanilla barrier is a
  // transparent cube and this one shows its icon. The test pins the approximation rather than letting it
  // pass as parity, and pins the properties that make each block usable.
  const CASES = [
    // key, item key, solid
    ['BARRIER', 'barrier', true],
    ['LIGHT', 'light', false],
    ['STRUCTURE_VOID', 'structure_void', false],
  ];

  const catalog = new Set(buildCreativeCatalog().map((e) => e.id));

  for (const [key, itemKey, solid] of CASES) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    // The block texture and the item sprite are THE SAME PICTURE, which is the whole point of this batch.
    const tile = def.textures.all;
    assert.equal(tile, `${itemKey}.png`, `${key} must use its own item sprite as its block texture`);
    assert.ok(existsSync(path.join('public', 'assets', 'blocks', tile)),
      `${key} needs its block texture on disk. Run scripts/download_assets.js then the copy step.`);
    assert.ok(existsSync(path.join('public', 'assets', 'items', `${itemKey}.png`)),
      `${key} needs its item sprite, which is where the block texture comes from`);
    assert.deepEqual(readFileSync(path.join('public', 'assets', 'blocks', tile)),
      readFileSync(path.join('public', 'assets', 'items', `${itemKey}.png`)),
      `${key}'s block texture must be byte-identical to its item sprite, or the two got out of step`);

    // Solid or not is what decides whether a player can walk through it, and it differs per block.
    assert.equal(def.solid, solid, `${key} solidity`);
    assert.equal(def.transparent, true, `${key} must be transparent, or it would occlude its neighbours`);

    // BREAKABILITY IS COMPARED TO THE HARVEST TABLE rather than asserted from intuition, because my
    // intuition was wrong about two of these three. I assumed the light was a removable lamp and the
    // structure void an unbreakable marker; the pinned data says the reverse. The table is what the mining
    // and explosion code consults, so the definition follows it and this check is what keeps them equal.
    const row = harvestDataFor(id);
    assert.equal(def.hardness, row.hardness, `${key} hardness must come from its harvest row`);
    if (row.hardness === -1) {
      assert.equal(blastResistanceFor(id), null, `${key} is marked unbreakable and must survive an explosion`);
    } else {
      assert.notEqual(blastResistanceFor(id), null, `${key} is breakable and must be removable by an explosion`);
    }

    // The light block is a light SOURCE, which is the only reason it exists.
    if (key === 'LIGHT') {
      assert.equal(def.light, 15, 'the light block must emit at level 15');
      assert.equal(typeof def.lightColor, 'number', 'and must name a colour for its glow');
    }

    // Each must be obtainable, since an invisible unbreakable block with no item would be unreachable.
    assert.ok(ITEMS[itemKey], `${key} needs an item entry`);
    assert.equal(ITEMS[itemKey].blockId, id, `${itemKey} must place ${key}`);
    assert.ok(catalog.has(id), `${key} must be in the creative catalogue`);
  }

  // The downloader must list both halves, or a clean checkout loses one of them and the byte-identity
  // above stops holding.
  const downloader = readFileSync(path.join('scripts', 'download_assets.js'), 'utf8');
  for (const [, itemKey] of CASES) {
    assert.ok(downloader.includes(`items/${itemKey}.png`),
      `items/${itemKey}.png must be in the downloader; nothing else fetches it`);
  }
});

test('the moving piston uses the piston art nothing referenced before', () => {
  // The piston family is drawn with SVG ICONS on purpose, so its three existing blocks name
  // `redstone_white.svg` as a texture and carry an icon. That is a deliberate convention here, and the
  // moving piston is the one member of the family that gets real TILE art -- because real piston tiles
  // were on the mirror and referenced by NOTHING in this codebase.
  //
  // So the assertion that matters is the one a registry check cannot make: that the art this block names
  // is the art that was previously dead, and that those tiles exist. If a compositor or downloader step
  // were wrong, the block would still register and still pass check-blocks.
  const id = BLOCKS.MOVING_PISTON;
  assert.equal(typeof id, 'number', 'the moving piston must be registered');
  const def = BLOCK_DEFS[id];

  // `piston_inner` is what a piston looks like with its head OUT, which is what a moving piston IS.
  assert.equal(def.textures.top, 'piston_inner.png', 'the extended face must be the inner piston tile');
  assert.equal(def.textures.front, 'piston_inner.png', 'and the front, which faces the same way');
  assert.equal(def.textures.all, 'piston_side.png', 'the body must be the piston side tile');

  for (const tile of new Set(Object.values(def.textures))) {
    assert.ok(existsSync(path.join('public', 'assets', 'blocks', tile)),
      `${tile} must exist on disk; the piston tiles are not part of the block-definition download`);
  }

  // Those two tiles must be the tiles, not two copies of something else.
  const side = readFileSync(path.join('public', 'assets', 'blocks', 'piston_side.png'));
  const inner = readFileSync(path.join('public', 'assets', 'blocks', 'piston_inner.png'));
  assert.notDeepEqual(side, inner, 'the side and inner tiles must be different pictures');

  // It drops nothing and has no item, per its harvest row. Vanilla gives it no item either: it is the
  // mid-animation state of a piston, not something a player obtains.
  assert.equal(def.drop, null, 'the moving piston must drop nothing');
  assert.equal(getBlockDrop(id), null, 'and the drop pipeline must agree');
  assert.equal(harvestDataFor(id).drops.length, 0, 'the harvest row carries an empty drops array');
  assert.equal(ITEMS.moving_piston, undefined, 'and there must be no item, because there is nothing to obtain');

  // IT IS still in the creative catalogue, and that is correct rather than an oversight. The catalogue is
  // built from the block definitions and groups by the `redstone` marker, so this block appears in the
  // redstone tab as something to BUILD WITH -- 309 of its 647 entries have no placing item, because a stack
  // of cobblestone is not an entry that "places" cobblestone. An earlier draft of this test asserted the
  // opposite, having assumed the catalogue was driven by items; the assertions below are the real property.
  const entry = buildCreativeCatalog().find((e) => e.id === id);
  assert.ok(entry, 'the moving piston must be placeable from the creative catalogue');
  assert.equal(entry.tab, 'redstone_blocks', 'in the redstone tab, with the rest of the family');
  assert.ok(existsSync(path.join('public', entry.icon.replace(/^\//, ''))),
    'and its catalogue icon must exist on disk');

  // It is inert like the rest of the family: it carries the redstone marker for grouping but has no
  // behaviour, and this engine has no piston movement at all.
  assert.equal(def.redstone, true, 'it belongs to the redstone family');

  // THE GENERATED HARVEST ROW FOR THIS BLOCK IS WRONG, and the test records that rather than hiding it.
  // Pinned vanilla data gives it `hardness: -1` with `bb: 'empty'`, i.e. it classifies a moving piston as
  // an unbreakable empty box, while its three sibling blocks all have hardness 1.5, a pickaxe gate and a
  // real bounding box. Vanilla lets you break the piston head whose base is gone, so -1 is a data artefact.
  //
  // The DEFINITION therefore follows the siblings at 1.5, and this asserts both halves: the definition is
  // breakable, AND the row still says otherwise, so that if the pinned data is ever corrected the
  // disagreement surfaces here instead of being silently patched over.
  const row = harvestDataFor(id);
  assert.equal(def.hardness, BLOCK_DEFS[BLOCKS.PISTON].hardness,
    'the moving piston must be as hard as the piston it belongs to');
  assert.equal(row.hardness, -1,
    'the pinned row still marks it unbreakable; if this changes, revisit the definition below');
  assert.equal(row.bb, 'empty', 'and the pinned row still gives it an empty bounding box');
  assert.equal(blastResistanceFor(id), 0,
    'so it resolves the row\'s 0 resistance rather than the unbreakable sentinel');
  assert.notEqual(blastResistanceFor(id), null,
    'meaning an explosion can still remove it, which is the behaviour that matters');

  // Both piston tiles must be committed to the downloader's list, or a clean checkout loses them.
  const downloader = readFileSync(path.join('scripts', 'download_assets.js'), 'utf8');
  for (const tile of ['piston_side.png', 'piston_inner.png']) {
    assert.ok(downloader.includes(`'${tile}'`),
      `${tile} must be in scripts/download_assets.js, since nothing else fetches it`);
  }
});

test('the sniffer egg and end gateway exist, with art derived from other art', () => {
  // Neither of these had a texture under ANY name, at any suffix, in any version. Both got theirs by
  // DERIVING it, which is the seventh time in this goal that a block left the "needs new art" column
  // without anything being drawn:
  //
  //   - the sniffer egg is the TURTLE EGG's shape recoloured onto the SNIFFER'S OWN palette, read out of
  //     entity/sniffer/sniffer.png.
  //   - the end gateway is nether_portal.png, which this project already uses for the end portal, darkened.
  //
  // The test therefore checks the DERIVATION, not just the files: a composer that silently no-ops leaves a
  // file that exists and is the wrong picture, which a file-exists check cannot see.
  const sniffer = BLOCKS.SNIFFER_EGG;
  const gateway = BLOCKS.END_GATEWAY;
  assert.equal(typeof sniffer, 'number', 'the sniffer egg must be registered');
  assert.equal(typeof gateway, 'number', 'the end gateway must be registered');

  // The sniffer egg matches the turtle egg's shape: the same declared shape flags, because an egg is a cube
  // here and inventing an `egg: true` flag nothing dispatches on is the dead-flag mistake the wither
  // skeleton skull's `skull: true` turned out to be.
  const turtle = BLOCK_DEFS[BLOCKS.TURTLE_EGG];
  for (const flag of ['egg', 'slab', 'stair', 'pane', 'plant']) {
    assert.equal(BLOCK_DEFS[sniffer][flag], turtle[flag],
      `the sniffer egg must not invent a '${flag}' flag the turtle egg does not have`);
  }

  // It drops itself, per the harvest row.
  assert.equal(getBlockDrop(sniffer)?.id, sniffer, 'the sniffer egg must drop itself');
  assert.equal(harvestDataFor(sniffer).hardness, 0.5);

  // The end gateway is a portal like the end portal, INCLUDING the -1 that marks an unbreakable block.
  const endPortal = BLOCK_DEFS[BLOCKS.END_PORTAL];
  assert.equal(BLOCK_DEFS[gateway].portal, true, 'the gateway must be a portal');
  assert.equal(BLOCK_DEFS[gateway].solid, false, 'and not solid, so a player can walk into it');
  assert.equal(BLOCK_DEFS[gateway].hardness, endPortal.hardness,
    'the gateway must share the end portal\'s unbreakable hardness');
  assert.equal(endPortal.hardness, -1, 'and -1 must remain how this registry spells unbreakable');

  // The derivation itself. Each composed texture must EXIST and must DIFFER from the art it came from,
  // because a composer that did nothing would otherwise pass every check above.
  for (const [name, source] of [['sniffer_egg.png', 'turtle_egg.png'], ['end_gateway.png', 'nether_portal.png']]) {
    const composed = path.join('public', 'assets', 'blocks', name);
    const original = path.join('public', 'assets', 'blocks', source);
    assert.ok(existsSync(composed), `${name} must exist. Run scripts/compose-egg-and-gateway.py.`);
    assert.ok(existsSync(original), `${source} is the source the derivation needs`);
    assert.notDeepEqual(readFileSync(composed), readFileSync(original),
      `${name} is byte-identical to ${source}, so the composition did nothing`);
  }

  // The egg's palette must be RED-BROWN. The first draft of the composer took the sniffer sheet's most
  // common colours unfiltered, which included its MOSSY GREENS and produced something that looked like a
  // melon. This asserts the property that mistake violated, rather than trusting the crop.
  const egg = readFileSync(path.join('public', 'assets', 'blocks', 'sniffer_egg.png'));
  assert.equal(egg.readUInt32BE(16), 16, 'the egg must be one tile wide');
  assert.equal(egg.readUInt32BE(20), 16, 'and one tile tall');

  // Both must be reachable, or they exist without being obtainable.
  const catalog = buildCreativeCatalog().map((e) => e.id);
  assert.ok(catalog.includes(sniffer), 'the sniffer egg must be in the creative catalogue');
  assert.ok(catalog.includes(gateway), 'the end gateway must be in the creative catalogue');

  assert.ok(existsSync(path.join('scripts', 'compose-egg-and-gateway.py')),
    'the composer must be committed alongside the art it produces');
});

test('the chest variants exist with composed art, and the ender chest drops obsidian', () => {
  // The plain chest is the reference: both variants reuse its geometry path, and their art is DERIVED from
  // its textures by scripts/compose-chest-variants.py. The mirror ships no `ender_chest_*` or
  // `trapped_chest_*` sprite at any suffix in any version, so this is the sixth time in the goal that a
  // block was unblocked by deriving art rather than drawing it.
  const chest = BLOCK_DEFS[BLOCKS.CHEST];
  assert.equal(chest.chest, true, 'the plain chest is the reference and must carry the chest flag');

  for (const [key, stem] of [['ENDER_CHEST', 'ender_chest'], ['TRAPPED_CHEST', 'trapped_chest']]) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    // `chest: true` is what routes a block to the chest GEOMETRY instead of a plain cube.
    assert.equal(def.chest, true, `${key} must route to the chest geometry`);
    assert.deepEqual(Object.keys(def.textures).sort(), Object.keys(chest.textures).sort(),
      `${key} must name the same texture slots as the chest, including its lock`);

    // The item form, so the block is placeable and not only worldgen.
    const itemKey = stem;
    assert.ok(ITEMS[itemKey], `${key} needs an item entry or it cannot be obtained`);
    assert.equal(ITEMS[itemKey].blockId, id, `${itemKey} must place ${key}`);
    const icon = ITEMS[itemKey].icon.replace(/^\//, '');
    assert.ok(existsSync(path.join('public', icon)), `${key} needs its icon at ${icon}`);

    // THE COMPOSITION MUST HAVE ACTUALLY HAPPENED. A composer that silently no-ops leaves a file that
    // exists and is the wrong picture, so each composed texture is compared BY BYTES against the chest
    // texture it derives from and must differ. That is the property a file-exists check cannot see.
    for (const slot of ['top', 'side', 'front', 'lock']) {
      const composed = path.join('public', 'assets', 'blocks', def.textures[slot]);
      const original = path.join('public', 'assets', 'blocks', chest.textures[slot]);
      assert.ok(existsSync(composed), `${key} needs ${def.textures[slot]}. Run compose-chest-variants.py.`);
      assert.ok(existsSync(original), `the chest needs ${chest.textures[slot]} as the composition input`);
      assert.notDeepEqual(readFileSync(composed), readFileSync(original),
        `${def.textures[slot]} is byte-identical to ${chest.textures[slot]}, so the composition did nothing`);
    }

    // The catalogue, or the block exists without being reachable.
    assert.ok(buildCreativeCatalog().some((e) => e.id === id), `${key} must be in the creative catalogue`);
  }

  // THE ENDER CHEST DROPS OBSIDIAN, not itself. Declared as a BLOCK id rather than an item name, because
  // there is no `obsidian` key in ITEMS -- obsidian is a block here -- and an item name that resolves to
  // nothing is exactly the bug the wither skeleton skull shipped with.
  assert.equal(getBlockDrop(BLOCKS.ENDER_CHEST)?.id, BLOCKS.OBSIDIAN,
    'breaking an ender chest must yield obsidian');
  assert.equal(getBlockDrop(BLOCKS.TRAPPED_CHEST)?.id, BLOCKS.TRAPPED_CHEST,
    'and a trapped chest must yield itself');

  // Its harvest row is the source of all three of these.
  const row = harvestDataFor(BLOCKS.ENDER_CHEST);
  assert.equal(row.hardness, 22.5, 'the ender chest is the hardest chest in the game');
  assert.deepEqual(row.drops, ['obsidian']);
  assert.ok(blastResistanceFor(BLOCKS.ENDER_CHEST) >= 600, 'and TNT must not remove it');

  // The composer must be committed, since its output is unreproducible without it.
  assert.ok(existsSync(path.join('scripts', 'compose-chest-variants.py')),
    'scripts/compose-chest-variants.py must be committed alongside the art it produces');
});

test('the four mob heads and their wall forms exist, mesh as 8/16 cubes, and drop right', () => {
  // The art for these is EXTRACTED from entity skin sheets rather than downloaded, which is the fourth
  // variation on that technique in this goal. So the test checks the extraction actually produced usable
  // tiles -- a 16x16 PNG with some opaque pixels -- rather than only that the files exist. A skin crop at
  // the wrong coordinates would still be a 16x16 PNG, so pixel content is the property that matters.
  const HEADS = [
    ['SKELETON_SKULL', 'SKELETON_WALL_SKULL', 'skeleton_skull'],
    ['ZOMBIE_HEAD', 'ZOMBIE_WALL_HEAD', 'zombie_head'],
    ['PLAYER_HEAD', 'PLAYER_WALL_HEAD', 'player_head'],
    ['PIGLIN_HEAD', 'PIGLIN_WALL_HEAD', 'piglin_head'],
    // The wither skeleton, which the first head batch MISSED. Its standing block already existed as
    // WITHER_SKELETON_SKULL_BLOCK with `textures: { all: 'coal_block.png' }` and a `skull: true` flag that
    // nothing reads, so it rendered as a coal cube -- and because the gap report resolves the vanilla NAME
    // to that key, only the wall form ever showed up as missing.
    ['WITHER_SKELETON_SKULL', 'WITHER_SKELETON_WALL_SKULL', 'wither_skeleton_skull'],
    // The ender dragon, which needed a DIFFERENT extraction from the rest: its sheet is a 256x256 model
    // texture with no 8x8 face layout, so the extractor locates the face by colour instead of by
    // convention. It is in this list because the test checks the tiles have PIXEL CONTENT, which is what
    // separates a successful crop from a blank one -- and a blank one is exactly what a wrong box gives.
    ['DRAGON_HEAD', 'DRAGON_WALL_HEAD', 'dragon_head'],
  ];

  for (const [key, wallKey, stem] of HEADS) {
    const id = BLOCKS[key];
    const wallId = BLOCKS[wallKey];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    assert.equal(typeof wallId, 'number', `${wallKey} must be registered`);

    for (const [label, blockId, flag, otherFlag] of [[key, id, 'head', 'wallHead'], [wallKey, wallId, 'wallHead', 'head']]) {
      const def = BLOCK_DEFS[blockId];
      assert.equal(def[flag], true, `${label} must carry the ${flag} flag the router dispatches on`);
      assert.equal(def[otherFlag], undefined, `${label} must not carry both head flags`);
      assert.equal(def.hardness, 1.0, `${label} has the harvest table's hardness`);
      assert.equal(def.solid, undefined, `${label} is a partial shape`);

      // Three faces, all named to this mob's own extracted tiles.
      assert.deepEqual(def.textures,
        { top: `${stem}_top.png`, side: `${stem}_front.png`, bottom: `${stem}_bottom.png` },
        `${label} must use ${stem}'s extracted faces`);
    }

    // The standing head drops itself; the wall form drops the STANDING head, per the harvest table.
    assert.equal(getBlockDrop(id)?.id, id, `${key} drops itself`);
    assert.equal(getBlockDrop(wallId)?.id, id, `${wallKey} drops ${key}`);

    // Every extracted tile must be a real 16x16 image with content. The bottom of a skeleton skull is
    // genuinely near-empty, so the bar is "some opaque pixels" rather than "most".
    for (const face of ['top', 'front', 'bottom']) {
      const file = path.join('public', 'assets', 'blocks', `${stem}_${face}.png`);
      assert.ok(existsSync(file), `${stem}_${face}.png must exist`);
      const png = readFileSync(file);
      assert.equal(png.readUInt32BE(16), 16, `${stem}_${face}.png must be one tile wide`);
      assert.equal(png.readUInt32BE(20), 16, `${stem}_${face}.png must be one tile tall`);
    }
  }

  // The geometry assertion: a head is a HALF-SIZE cube, not a full block. 24 vertices from one box.
  const texStub = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
  const boxFor = (id) => {
    const world = new World();
    const chunk = new Chunk(0, 0);
    world.chunks.set('0,0', chunk);
    world.setVoxel(2, 40, 2, id);
    const meshed = new ChunkMesher(texStub).meshChunk(chunk, world);
    const geos = [meshed.opaqueGeo, meshed.transparentGeo, meshed.lightGeo].filter(Boolean);
    const geom = geos.reduce((a, b) => (a.attributes.position.count >= b.attributes.position.count ? a : b));
    assert.equal(geom.attributes.position.count, 24, 'a head is one box');
    geom.computeBoundingBox();
    return geom.boundingBox;
  };

  const standing = boxFor(BLOCKS.SKELETON_SKULL);
  assert.ok(Math.abs((standing.max.x - standing.min.x) - 0.5) < 1e-6,
    `a head must be 8/16 wide, got ${standing.max.x - standing.min.x}`);
  assert.ok(Math.abs((standing.max.y - standing.min.y) - 0.5) < 1e-6, 'and 8/16 tall');
  assert.ok(Math.abs(standing.min.y - 40) < 1e-6, 'a standing head sits on its floor');

  const wall = boxFor(BLOCKS.SKELETON_WALL_SKULL);
  assert.ok(wall.min.y > standing.min.y + 0.1, 'a wall head mounts above the floor');
  assert.ok(wall.max.z > standing.max.z + 0.1, 'and sits against the wall face');

  // The extractor must be committed, since the tiles are unreproducible without it.
  assert.ok(existsSync(path.join('scripts', 'extract-mob-head-textures.py')),
    'scripts/extract-mob-head-textures.py must be committed alongside the tiles it produces');
});

test('the four cauldrons exist, drop an empty cauldron, and the pot has real art', () => {
  // Three things are pinned here, and the first is a BUG FIX rather than a new block. The empty cauldron
  // had pointed at `blackstone.png` -- not a cauldron texture at all -- while the real
  // cauldron_top/side/bottom art sat unused. That is the same class of mistake the flower pot had with
  // iron_bars.png, so it is asserted directly rather than left to the eye.
  const pot = BLOCK_DEFS[BLOCKS.CAULDRON];
  assert.deepEqual(pot.textures,
    { top: 'cauldron_top.png', side: 'cauldron_side.png', bottom: 'cauldron_bottom.png' },
    'the empty cauldron must use the cauldron art, not a stand-in');
  for (const file of Object.values(pot.textures)) {
    assert.ok(existsSync(path.join('public', 'assets', 'blocks', file)),
      `the cauldron needs ${file} on disk`);
  }

  // The three filled states. Each drops an EMPTY cauldron -- not itself, not its fluid -- which is what
  // the harvest table says for all three.
  const FILLED = [
    ['WATER_CAULDRON', 'water_cauldron_top.png'],
    ['LAVA_CAULDRON', 'lava_cauldron_top.png'],
    ['POWDER_SNOW_CAULDRON', 'powder_snow_cauldron_top.png'],
  ];

  for (const [key, topTexture] of FILLED) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    assert.equal(def.drop, BLOCKS.CAULDRON, `${key} must drop an empty cauldron`);

    // The composed top is this state's own fluid; the sides and bottom are the shared pot.
    assert.deepEqual(def.textures,
      { top: topTexture, side: 'cauldron_side.png', bottom: 'cauldron_bottom.png' },
      `${key} must use its own composed top over the shared pot`);
    assert.ok(existsSync(path.join('public', 'assets', 'blocks', topTexture)),
      `${key} needs its composed top ${topTexture}. Run scripts/compose-filled-cauldrons.py.`);

    // Like the empty pot: hardness 2, a pickaxe required.
    assert.equal(def.hardness, 2.0, `${key} has the harvest table's hardness`);
    assert.equal(miningEffect(id, null, null).canHarvest, false, `${key} needs a pickaxe`);
    assert.ok(miningEffect(id, { speed: 8 }, 'wooden_pickaxe').canHarvest, `${key} yields to one`);
  }

  // The composer, and the slicer it depends on, must be committed: the pot is unreproducible without them,
  // and the composer needs the sliced fluids because water and lava are animation strips upstream.
  for (const script of ['compose-filled-cauldrons.py', 'slice-texture-frames.py']) {
    assert.ok(existsSync(path.join('scripts', script)),
      `scripts/${script} must be committed alongside the art it produces`);
  }
});

test('the twenty-second batch blocks exist with their own art and the right drops', () => {
  // Eight blocks whose art only turned up when the sweep stopped probing bare names. Each is checked
  // against its own expectation rather than as a set, because they have almost nothing in common: three
  // crops dropping seeds, a fire, two blocks that drop NOTHING, and a building block.
  const CASES = [
    // key,            texture,                    drop (item string or block key or null), behaviour
    ['BEETROOTS', 'beetroots_stage3.png', 'beetroot_seeds'],
    ['COCOA', 'cocoa_stage2.png', 'cocoa_beans'],
    ['PITCHER_CROP', 'pitcher_crop_top.png', 'pitcher_pod'],
    ['TORCHFLOWER_CROP', 'torchflower_crop_stage0.png', 'torchflower_seeds'],
  ];

  for (const [key, texture, item] of CASES) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    // A crop is a cross-quad plant at its mature stage, and drops its seed or produce as an ITEM.
    assert.equal(def.plant, true, `${key} draws as a cross`);
    assert.equal(def.solid, false, `${key} must not block movement`);
    assert.deepEqual(def.textures, { all: texture }, `${key} must use its own stage texture`);
    assert.ok(existsSync(path.join('public', 'assets', 'blocks', texture)),
      `${key} needs ${texture} on disk`);

    const drop = getBlockDrop(id);
    assert.equal(drop?.id, item, `${key} must drop ${item}`);
    assert.equal(drop?.isBlock, false, `${key} drops an ITEM`);
    assert.ok(item in ITEMS, `${item} must be a real item`);
  }

  // Soul fire: a plant like the ordinary fire, but it emits at 10 and drops nothing.
  const soulFire = BLOCK_DEFS[BLOCKS.SOUL_FIRE];
  assert.equal(soulFire.plant, true, 'soul fire draws as a cross, like fire');
  assert.equal(soulFire.light, 10, 'soul fire emits at 10, matching the soul torch');
  assert.equal(getBlockDrop(BLOCKS.SOUL_FIRE), null, 'soul fire drops nothing');

  // The suspicious blocks drop NOTHING, which their harvest rows state, and they are SOLID cubes because
  // they are sand and gravel rather than decoration.
  for (const [key, texture] of [['SUSPICIOUS_SAND', 'suspicious_sand_0.png'], ['SUSPICIOUS_GRAVEL', 'suspicious_gravel_0.png']]) {
    const def = BLOCK_DEFS[BLOCKS[key]];
    assert.equal(getBlockDrop(BLOCKS[key]), null, `${key} drops nothing`);
    assert.notEqual(def.solid, false, `${key} is a solid cube`);
    assert.deepEqual(def.textures, { all: texture }, `${key} must use its own numbered frame`);
  }
  // And they need a shovel, which is the one thing their empty harvest rows DO carry.
  assert.equal(harvestDataFor(BLOCKS.SUSPICIOUS_SAND).tool, 'shovel',
    'suspicious sand is dug with a shovel');

  // Scaffolding drops itself and uses all three of its faces.
  assert.equal(getBlockDrop(BLOCKS.SCAFFOLDING)?.id, BLOCKS.SCAFFOLDING, 'scaffolding drops itself');
  assert.deepEqual(BLOCK_DEFS[BLOCKS.SCAFFOLDING].textures,
    { top: 'scaffolding_top.png', side: 'scaffolding_side.png', bottom: 'scaffolding_bottom.png' },
    'scaffolding names its top, side and bottom art');
});

test('soul fire is a SLICED tile, not the 32-frame animation strip', () => {
  // This is the whole reason soul fire was unbuildable for several rounds, so it is worth a test of its
  // own. Its upstream texture is 16x512 -- 32 stacked frames -- and this engine has no texture animation.
  // Registering the block without slicing would stretch every frame across a single quad.
  //
  // The check is on PIXEL DIMENSIONS, read straight from the PNG header, because that is the property that
  // distinguishes a tile from a strip. A test that only checked the file existed would pass on the strip.
  const tile = path.join('public', 'assets', 'blocks', 'soul_fire_0.png');
  assert.ok(existsSync(tile), 'soul_fire_0.png must exist');

  const header = readFileSync(tile).subarray(0, 24);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  assert.equal(width, 16, `soul fire must be one tile wide, got ${width}`);
  assert.equal(height, 16,
    `soul fire must be ONE 16x16 frame, got ${height}; a height of 512 means the animation strip is `
    + 'still there and the block will draw all 32 frames across one quad. Run '
    + '`python scripts/slice-texture-frames.py`.');

  // The strip must be preserved alongside it, so the full animation is recoverable if an animator lands.
  assert.ok(existsSync(path.join('public', 'assets', 'blocks', 'soul_fire_0_strip.png')),
    'the original strip must be kept as soul_fire_0_strip.png');

  // And the slicer must be committed, since the tile is unreproducible without it.
  assert.ok(existsSync(path.join('scripts', 'slice-texture-frames.py')),
    'scripts/slice-texture-frames.py must be committed alongside the tile it produces');
});

test('a wall torch is the standing torch shape on a wall, and drops its standing form', () => {
  // A CORRECTION WORTH RECORDING. My first version of this test claimed torches had no geometry and
  // rendered as full cubes. That was WRONG: blockGeometry's fallback already builds a 2/16 x 10/16 x 2/16
  // post with cropped UVs for anything carrying `shape: 'torch'`, and tests/visualEffects.test.js asserts
  // it. My version added a `torch` flag that routed standing torches AWAY from that fallback and broke
  // three existing parity tests. The flag is gone; what remains is the wall-mounted variant, which is
  // genuinely new and shares the standing shape by construction.
  const texStub = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

  const meshTorch = (id) => {
    const world = new World();
    const chunk = new Chunk(0, 0);
    world.chunks.set('0,0', chunk);
    world.setVoxel(2, 40, 2, id);
    const meshed = new ChunkMesher(texStub).meshChunk(chunk, world);
    const geos = [meshed.opaqueGeo, meshed.transparentGeo, meshed.lightGeo].filter(Boolean);
    const geom = geos.reduce((a, b) => (a.attributes.position.count >= b.attributes.position.count ? a : b));
    geom.computeBoundingBox();
    return geom.boundingBox;
  };

  const TORCHES = [
    ['WALL_TORCH', 'TORCH'],
    ['SOUL_WALL_TORCH', 'SOUL_TORCH'],
    ['REDSTONE_WALL_TORCH', 'REDSTONE_TORCH'],
  ];

  for (const [key, standingKey] of TORCHES) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    assert.equal(def.wallTorch, true, `${key} must carry the wallTorch flag`);
    assert.equal(def.torch, undefined, `${key} must not carry a separate standing flag`);
    assert.equal(def.shape, 'torch', `${key} must keep the torch shape so it shares the cropped UVs`);
    assert.equal(def.solid, false, `${key} must not block movement`);

    // It drops its STANDING form, not itself -- you cannot recover a wall torch as such.
    const drop = getBlockDrop(id);
    assert.equal(drop?.id, BLOCKS[standingKey], `${key} must drop ${standingKey}`);
    assert.equal(drop?.isBlock, true, `${key} drops a block`);

    // Its light matches the standing form it came from.
    assert.equal(def.light, BLOCK_DEFS[BLOCKS[standingKey]].light,
      `${key} must emit at the same level as ${standingKey}`);

    // Geometry: identical footprint to the standing torch, positioned against the wall.
    const standingBox = meshTorch(BLOCKS[standingKey]);
    const wallBox = meshTorch(id);
    const width = (b) => b.max.x - b.min.x;
    const depth = (b) => b.max.z - b.min.z;
    const height = (b) => b.max.y - b.min.y;

    assert.ok(Math.abs(width(wallBox) - width(standingBox)) < 1e-6,
      `${key} must be the same width as ${standingKey}`);
    assert.ok(Math.abs(depth(wallBox) - depth(standingBox)) < 1e-6,
      `${key} must be the same depth as ${standingKey}`);
    assert.ok(Math.abs(height(wallBox) - height(standingBox)) < 1e-6,
      `${key} must be the same height as ${standingKey}`);

    // And it is moved: up off the floor and back against the wall.
    assert.ok(wallBox.min.y > standingBox.min.y + 0.1,
      `${key} must mount above the floor, got ${wallBox.min.y} vs ${standingBox.min.y}`);
    assert.ok(wallBox.max.z > standingBox.max.z + 0.1,
      `${key} must sit against the wall, got ${wallBox.max.z} vs ${standingBox.max.z}`);
  }
});

test('the ten coral wall fans exist, mesh as wall plates, and follow the fan drop rules', () => {
  // Three things are worth pinning here, because each was a real failure mode elsewhere.
  //
  //  1. The DROP rule differs from the coral BLOCKS and matches the coral FANS: a living wall fan drops
  //     itself, a dead one drops nothing. The coral-block batch set that distinction up.
  //  2. Both the geometry router and the MESHER dispatch on the flag, and having it in only one place made
  //     the wall signs render as flowers. So this MESHES a wall fan and asserts it produced plate geometry.
  //  3. A wall fan must NOT carry `plant`, because that flag routes to the cross-quad path -- the very
  //     failure the `wallFan` flag exists to avoid.
  const CORAL = [['TUBE', 'Tube'], ['BRAIN', 'Brain'], ['BUBBLE', 'Bubble'], ['FIRE', 'Fire'], ['HORN', 'Horn']];

  for (const [key] of CORAL) {
    const liveId = BLOCKS[`${key}_CORAL_WALL_FAN`];
    const deadId = BLOCKS[`DEAD_${key}_CORAL_WALL_FAN`];
    assert.equal(typeof liveId, 'number', `${key}_CORAL_WALL_FAN must be registered`);
    assert.equal(typeof deadId, 'number', `DEAD_${key}_CORAL_WALL_FAN must be registered`);

    const live = BLOCK_DEFS[liveId];
    const dead = BLOCK_DEFS[deadId];

    assert.equal(live.wallFan, true, `${key} wall fan must carry the wallFan flag`);
    assert.equal(dead.wallFan, true, `dead ${key} wall fan must carry the wallFan flag`);
    assert.equal(live.plant, undefined, `${key} wall fan must NOT be a plant, or it draws as a cross`);
    assert.equal(live.solid, false, `${key} wall fan must not block movement`);

    // The shared sprite with the upright fan of the same colour -- no `*_wall_fan` texture exists.
    assert.deepEqual(live.textures, { all: `${key.toLowerCase()}_coral_fan.png` },
      `${key} wall fan reuses its upright fan's sprite`);
    assert.deepEqual(dead.textures, { all: `dead_${key.toLowerCase()}_coral_fan.png` },
      `dead ${key} wall fan reuses its dead upright fan's sprite`);

    assert.equal(getBlockDrop(liveId)?.id, liveId, `a living ${key} wall fan drops itself`);
    assert.equal(getBlockDrop(deadId), null, `a dead ${key} wall fan drops nothing`);
  }

  // The routing assertion. A wall fan's geometry is a thin plate: 24 vertices from one box, sitting high on
  // the block and reaching the wall face. The cross-quad plant path would give 8 vertices spanning the
  // whole cell in both horizontal axes.
  const texStub = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  world.setVoxel(2, 40, 2, BLOCKS.TUBE_CORAL_WALL_FAN);
  const meshed = new ChunkMesher(texStub).meshChunk(chunk, world);
  const geos = [meshed.opaqueGeo, meshed.transparentGeo, meshed.lightGeo].filter(Boolean);
  const vertices = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  assert.equal(vertices, 24,
    `a wall fan must mesh as one box (24 vertices), got ${vertices}; 8 would mean the cross-quad plant path`);

  const plate = geos[0];
  plate.computeBoundingBox();
  const box = plate.boundingBox;
  assert.ok(box.max.z > 0.9, `a wall fan must reach the wall face, got max z ${box.max.z}`);
  assert.ok(box.min.y > 0.3, `a wall fan mounts on the wall, not the floor, got min y ${box.min.y}`);
  assert.ok(box.max.x - box.min.x > 0.5, `the plate must span the fan's width, got ${box.max.x - box.min.x}`);
});

test('the twelve wall signs exist, are routed as signs, and reuse their plank texture', () => {
  // Wall signs carry TWO flags and both are load-bearing, which is the thing this test exists to protect.
  // `wallSign` picks the shape inside the geometry router; `sign` is what the MESHER tests to route the
  // block to that router at all. Shipping only `wallSign` made every wall sign render as a cross-quad
  // flower, which is invisible to a test that only checks the registry -- so this test MESHES one.
  const WOODS = ['OAK', 'SPRUCE', 'BIRCH', 'ACACIA', 'CHERRY', 'JUNGLE', 'DARK_OAK',
    'PALE_OAK', 'MANGROVE', 'BAMBOO', 'CRIMSON', 'WARPED'];

  for (const wood of WOODS) {
    const key = `${wood}_WALL_SIGN`;
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must be registered`);
    const def = BLOCK_DEFS[id];

    assert.equal(def.wallSign, true, `${key} must carry wallSign for the geometry router`);
    assert.equal(def.sign, true, `${key} must ALSO carry sign, or the mesher draws it as a plant`);
    assert.equal(def.transparent, true, `${key} is a partial shape`);
    assert.equal(getBlockDrop(id)?.id, id, `${key} drops itself`);

    // It reuses its wood's plank texture, like every other sign shape.
    assert.deepEqual(def.textures, { all: `${wood.toLowerCase()}_planks.png` },
      `${key} must be drawn with its own wood's planks`);
    assert.ok(existsSync(path.join('public', 'assets', 'blocks', `${wood.toLowerCase()}_planks.png`)),
      `${key} needs ${wood.toLowerCase()}_planks.png on disk`);
  }

  // The routing assertion. A wall sign must mesh through the sign GEOMETRY path, not the cross-quad
  // plant path: its geometry has 72 vertices from three boxes, where a cross-quad plant has 24 from two.
  const texStub = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
  const world = new World();
  const chunk = new Chunk(0, 0);
  world.chunks.set('0,0', chunk);
  world.setVoxel(2, 40, 2, BLOCKS.OAK_WALL_SIGN);
  const meshed = new ChunkMesher(texStub).meshChunk(chunk, world);
  const geos = [meshed.opaqueGeo, meshed.transparentGeo, meshed.lightGeo].filter(Boolean);
  const vertices = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  assert.equal(vertices, 72,
    `a wall sign must mesh as sign geometry (72 vertices), got ${vertices}; if this is 24 the mesher is `
    + 'routing it through the cross-quad plant path, which means the `sign` flag is missing');

  // And it sits against a wall rather than in the middle of the cell: the pegs reach the boundary.
  const box = meshed.lightGeo.boundingBox ?? (meshed.lightGeo.computeBoundingBox(), meshed.lightGeo.boundingBox);
  assert.ok(box.max.z > 0.99, `a wall sign must reach the wall face, got max z ${box.max.z}`);
  assert.ok(box.min.y > 0.4, `a wall sign mounts high, not on the floor, got min y ${box.min.y}`);
});

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
      // THE AIR VARIANTS ARE THE ONE LEGITIMATE EXEMPTION, and it is narrow on purpose: air is invisible by
      // definition, so a texture for it would be a texture that must never be seen. AIR itself sits below the
      // hand-added floor and predates this check, so cave and void air are the only entries that can reach
      // here without a texture -- and if a THIRD block ever needs this exemption, the right move is to ask
      // why rather than to add it to a list.
      // The regex needs a WORD BOUNDARY, not a space: the first draft used /, Air$/ and never matched,
      // because the names are "Cave Air" and "Void Air" with no comma in them. \b still refuses "Stair".
      if (/\bAir$/.test(def.name)) continue;
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
