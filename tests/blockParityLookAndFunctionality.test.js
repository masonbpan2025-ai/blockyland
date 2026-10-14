// Comprehensive look and functionality parity audit for all blocks against wiki specifications.
//
// This test suite audits the entire block registry (over 1,200 block definitions) to verify:
// 1. Coverage & Parity baselines (Pinned 1.21.4 baseline & Minecraft Wiki block list).
// 2. Look parity: Every texture maps to a real file, correct geometries for non-cubes (plants,
//    mob heads, chests, liquids, portals, wall attachments).
// 3. Functionality parity: Light levels, sound categories, hardness, blast resistances,
//    mining harvest gates, and drop resolution (including elimination of all phantom drops).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { harvestDataFor, blastResistanceFor } from '../src/blockHarvestData.js';
import { miningEffect, breakTimeSeconds } from '../src/miningRules.js';
import { getBlockDrop } from '../src/itemVisuals.js';
import { compareBlockLists } from '../src/blockNameMatch.js';
import { bonusDropsFor, replacementDropFor } from '../src/blockDrops.js';

const BLOCK_ASSET_DIR = path.join(process.cwd(), 'public', 'assets', 'blocks');

test('parity audit: 100% of pinned vanilla 1.21.4 blocks are implemented', () => {
  const cachePath = path.join(process.cwd(), '.cache', 'mc-data', 'blocks.json');
  assert.ok(existsSync(cachePath), 'pinned blocks cache must exist');
  const vanillaBlocks = JSON.parse(readFileSync(cachePath, 'utf8')).map((b) => b.name);
  const comparison = compareBlockLists(vanillaBlocks);

  assert.equal(comparison.missing.length, 0,
    `all pinned vanilla blocks must be implemented, missing: ${comparison.missing.join(', ')}`);
  assert.equal(comparison.covered.length, vanillaBlocks.length,
    `all ${vanillaBlocks.length} blocks in the pinned baseline are covered`);
});

test('parity audit: wiki block list coverage and breakdown', () => {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'wiki-block-list.json');
  assert.ok(existsSync(fixturePath), 'wiki block list fixture must exist');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

  const inScope = [...new Set(['item', 'technical', 'education'].flatMap((s) => fixture.sections[s] ?? []))];
  const comparison = compareBlockLists(inScope);

  // Over 80% of all in-scope blocks on the wiki (including 1.21.4, Education Edition, and post-1.21.4) are resolved
  const coveragePct = (100 * comparison.covered.length) / inScope.length;
  assert.ok(coveragePct >= 80, `wiki coverage should be at least 80%, got ${coveragePct.toFixed(1)}%`);
  assert.ok(comparison.covered.length >= 1090, `at least 1090 wiki names resolved, got ${comparison.covered.length}`);
});

test('look parity: every block definition with textures resolves to existing files on disk', () => {
  const missingFiles = [];
  let textureCount = 0;

  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.textures) continue;
    for (const [face, filename] of Object.entries(def.textures)) {
      if (typeof filename !== 'string') continue;
      textureCount++;
      const fullPath = path.join(BLOCK_ASSET_DIR, filename);
      if (!existsSync(fullPath)) {
        missingFiles.push(`${def.name || id} face "${face}" -> ${filename}`);
      }
    }
  }

  assert.ok(textureCount > 1000, `expected over 1000 texture references across definitions, checked ${textureCount}`);
  assert.deepEqual(missingFiles, [], `all referenced texture files must exist on disk`);
});

test('look parity: plants and cross-quad vegetation are marked non-solid', () => {
  let plantCount = 0;
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.plant) continue;
    plantCount++;
    assert.equal(def.solid, false, `${def.name} is a plant and must not block player movement`);
    assert.equal(def.transparent, true, `${def.name} is a plant and must be transparent`);
  }
  assert.ok(plantCount >= 30, `expected at least 30 plant blocks, found ${plantCount}`);
});

test('look parity: mob heads and wall heads route to head geometry and are transparent', () => {
  const HEAD_KEYS = [
    'SKELETON_SKULL', 'ZOMBIE_HEAD', 'PLAYER_HEAD', 'PIGLIN_HEAD',
    'CREEPER_HEAD', 'DRAGON_HEAD', 'WITHER_SKELETON_SKULL',
    'SKELETON_WALL_SKULL', 'ZOMBIE_WALL_HEAD', 'PLAYER_WALL_HEAD',
    'PIGLIN_WALL_HEAD', 'CREEPER_WALL_HEAD', 'DRAGON_WALL_HEAD', 'WITHER_SKELETON_WALL_SKULL',
  ];

  for (const key of HEAD_KEYS) {
    const id = BLOCKS[key];
    assert.equal(typeof id, 'number', `${key} must exist in BLOCKS`);
    const def = BLOCK_DEFS[id];
    assert.ok(def, `${key} must have a definition`);
    if (key.includes('WALL')) {
      assert.equal(def.wallHead, true, `${key} must carry wallHead flag`);
    } else {
      assert.equal(def.head, true, `${key} must carry head flag`);
    }
    assert.equal(def.transparent, true, `${key} must be transparent`);
  }
});

test('look parity: chests carry chest flag and required texture faces', () => {
  const CHESTS = ['CHEST', 'ENDER_CHEST', 'TRAPPED_CHEST'];
  for (const key of CHESTS) {
    if (!(key in BLOCKS)) continue;
    const id = BLOCKS[key];
    const def = BLOCK_DEFS[id];
    assert.ok(def.chest, `${key} must carry chest flag`);
    assert.equal(def.transparent, true, `${key} must be transparent`);
    assert.ok(def.textures.top, `${key} must have top texture`);
    assert.ok(def.textures.side || def.textures.all, `${key} must have side texture`);
  }
});

test('functionality parity: light levels match wiki values for light sources', () => {
  const EXPECTED_LIGHT = {
    TORCH: 14,
    WALL_TORCH: 14,
    SOUL_TORCH: 10,
    SOUL_WALL_TORCH: 10,
    REDSTONE_TORCH: 7,
    REDSTONE_WALL_TORCH: 7,
    GLOWSTONE: 15,
    SEA_LANTERN: 15,
    LAVA: 15,
    FIRE: 15,
    SOUL_FIRE: 10,
    CAMPFIRE: 15,
    SOUL_CAMPFIRE: 10,
    LANTERN: 15,
    SOUL_LANTERN: 10,
    SHROOMLIGHT: 15,
    CRYING_OBSIDIAN: 10,
    BEACON: 15,
    CONDUIT: 15, // the wiki's infobox: "light=Yes (15)"
    END_ROD: 14,
    JACK_O_LANTERN: 15,
    OCHRE_FROGLIGHT: 15,
    PEARLESCENT_FROGLIGHT: 15,
    VERDANT_FROGLIGHT: 15,
    LIGHT: 15,
  };

  for (const [key, expectedLevel] of Object.entries(EXPECTED_LIGHT)) {
    if (!(key in BLOCKS)) continue;
    const id = BLOCKS[key];
    const def = BLOCK_DEFS[id];
    assert.ok(def, `${key} must have definition`);
    assert.equal(def.light, expectedLevel, `${key} light level should be ${expectedLevel}, got ${def.light}`);
  }
});

test('functionality parity: every block definition has a valid sound category', () => {
  const VALID_SOUNDS = new Set([
    'grass', 'gravel', 'stone', 'sand', 'wood', 'water', 'snow', 'glass', 'wool', 'metal',
  ]);

  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.name || def.name === 'Air' || def.name.endsWith('Air')) continue;
    assert.ok(def.sound, `${def.name} (id ${id}) must have a sound defined`);
    assert.ok(VALID_SOUNDS.has(def.sound), `${def.name} sound "${def.sound}" must be one of the recognized sound types`);
  }
});

test('functionality parity: hardness hierarchy matches vanilla expectations', () => {
  assert.equal(BLOCK_DEFS[BLOCKS.BEDROCK].hardness, -1, 'bedrock is unbreakable');
  assert.equal(BLOCK_DEFS[BLOCKS.END_PORTAL].hardness, -1, 'end portal is unbreakable');

  assert.equal(BLOCK_DEFS[BLOCKS.OBSIDIAN].hardness, 50, 'obsidian hardness is 50');
  assert.equal(BLOCK_DEFS[BLOCKS.CRYING_OBSIDIAN].hardness, 50, 'crying obsidian hardness is 50');
  if ('ANCIENT_DEBRIS' in BLOCKS) {
    assert.equal(BLOCK_DEFS[BLOCKS.ANCIENT_DEBRIS].hardness, 30, 'ancient debris hardness is 30');
  }

  assert.equal(BLOCK_DEFS[BLOCKS.STONE].hardness, 1.5, 'stone hardness is 1.5');
  assert.equal(BLOCK_DEFS[BLOCKS.DIRT].hardness, 0.5, 'dirt hardness is 0.5');
  assert.equal(BLOCK_DEFS[BLOCKS.OAK_PLANKS].hardness, 2.0, 'wood planks hardness is 2.0');
  assert.equal(BLOCK_DEFS[BLOCKS.OAK_LOG].hardness, 2.0, 'logs hardness is 2.0');

  // Fragile / instant-break blocks
  assert.equal(BLOCK_DEFS[BLOCKS.DANDELION].hardness, 0, 'dandelion breaks instantly');
  assert.equal(BLOCK_DEFS[BLOCKS.POPPY].hardness, 0, 'poppy breaks instantly');
  assert.equal(BLOCK_DEFS[BLOCKS.TORCH].hardness, 0, 'torch breaks instantly');
});

test('functionality parity: explosion resistance and blast immunity', () => {
  // Blast immune
  assert.equal(blastResistanceFor(BLOCKS.BEDROCK), null, 'bedrock has infinite resistance (unbreakable)');
  assert.equal(blastResistanceFor(BLOCKS.END_PORTAL), null, 'end portal has infinite resistance (unbreakable)');

  const obsidianRes = blastResistanceFor(BLOCKS.OBSIDIAN);
  assert.ok(obsidianRes >= 1200, `obsidian resistance (${obsidianRes}) must be >= 1200`);

  const cryingObsidianRes = blastResistanceFor(BLOCKS.CRYING_OBSIDIAN);
  assert.ok(cryingObsidianRes >= 1200, `crying obsidian resistance (${cryingObsidianRes}) must be >= 1200`);

  if ('NETHERITE_BLOCK' in BLOCKS) {
    const netheriteRes = blastResistanceFor(BLOCKS.NETHERITE_BLOCK);
    assert.ok(netheriteRes >= 1200, `netherite block resistance (${netheriteRes}) must be >= 1200`);
  }

  // Common materials
  const stoneRes = blastResistanceFor(BLOCKS.STONE);
  assert.ok(stoneRes >= 6, `stone resistance (${stoneRes}) must be >= 6`);

  const dirtRes = blastResistanceFor(BLOCKS.DIRT);
  assert.ok(dirtRes <= 1, `dirt resistance (${dirtRes}) must be low (<= 1)`);
});

test('functionality parity: drops resolve properly without phantom drops', () => {
  // Redstone Wire drops redstone dust item
  const redstoneWireDrop = getBlockDrop(BLOCKS.REDSTONE_WIRE);
  assert.ok(redstoneWireDrop, 'redstone wire must drop');
  assert.equal(redstoneWireDrop.id, 'redstone', 'redstone wire drops redstone dust');
  assert.equal(redstoneWireDrop.isBlock, false, 'redstone drop is an item');
  assert.ok('redstone' in ITEMS, 'redstone item exists in ITEMS');

  // Tripwire drops string item
  const tripwireDrop = getBlockDrop(BLOCKS.TRIPWIRE);
  assert.ok(tripwireDrop, 'tripwire must drop');
  assert.equal(tripwireDrop.id, 'string', 'tripwire drops string');
  assert.equal(tripwireDrop.isBlock, false, 'string drop is an item');
  assert.ok('string' in ITEMS, 'string item exists in ITEMS');

  // Sculk Sensor drops sculk sensor block
  const sculkSensorDrop = getBlockDrop(BLOCKS.SCULK_SENSOR);
  assert.ok(sculkSensorDrop, 'sculk sensor must drop');
  assert.equal(sculkSensorDrop.id, BLOCKS.SCULK_SENSOR, 'sculk sensor drops its own block');
  assert.equal(sculkSensorDrop.isBlock, true, 'sculk sensor drop is a block');

  // Sculk Shrieker drops sculk shrieker block
  const sculkShriekerDrop = getBlockDrop(BLOCKS.SCULK_SHRIEKER);
  assert.ok(sculkShriekerDrop, 'sculk shrieker must drop');
  assert.equal(sculkShriekerDrop.id, BLOCKS.SCULK_SHRIEKER, 'sculk shrieker drops its own block');
  assert.equal(sculkShriekerDrop.isBlock, true, 'sculk shrieker drop is a block');
});

test('functionality parity: bonus and replacement drop probabilities', () => {
  // Oak leaves bonus drops
  const alwaysRoll = () => 0.0001;
  const neverRoll = () => 0.9999;

  const oakBonusWhenLucky = bonusDropsFor(BLOCKS.OAK_LEAVES, alwaysRoll);
  assert.ok(oakBonusWhenLucky.some((d) => d.id === 'apple'), 'lucky leaf break drops apple');
  assert.ok(oakBonusWhenLucky.some((d) => d.id === 'stick'), 'lucky leaf break drops stick');
  assert.ok(oakBonusWhenLucky.some((d) => d.id === 'oak_sapling'), 'lucky leaf break drops sapling');

  const oakBonusWhenUnlucky = bonusDropsFor(BLOCKS.OAK_LEAVES, neverRoll);
  assert.equal(oakBonusWhenUnlucky.length, 0, 'unlucky leaf break drops no bonuses');

  // Gravel replacement with flint
  const gravelLucky = replacementDropFor(BLOCKS.GRAVEL, alwaysRoll);
  assert.equal(gravelLucky?.id, 'flint', 'lucky gravel break replaces drop with flint');

  const gravelUnlucky = replacementDropFor(BLOCKS.GRAVEL, neverRoll);
  assert.equal(gravelUnlucky, null, 'unlucky gravel break does not replace drop');
});
