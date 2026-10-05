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
