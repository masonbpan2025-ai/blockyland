import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, BLOCK_DEFS, BLOCKS } from '../src/blocks.js';
import { ALL_CREATIVE_ITEMS } from '../src/creativeCatalog.js';

function checkAssetExists(assetPath) {
  assert.ok(assetPath, 'Asset path must be defined');
  const cleanPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
  const fullPath = path.join(process.cwd(), 'public', cleanPath);
  assert.ok(fs.existsSync(fullPath), `Asset file must exist at ${fullPath}`);
  const stats = fs.statSync(fullPath);
  assert.ok(stats.size > 0, `Asset file at ${fullPath} must not be empty`);
  return fullPath;
}

function verifyPNGHeader(fullPath, expectedWidth = 16, expectedHeight = 16) {
  const buf = fs.readFileSync(fullPath);
  assert.ok(buf.length >= 24, 'PNG buffer must have at least 24 bytes');
  // PNG signature: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
  assert.equal(buf[2], 0x4e);
  assert.equal(buf[3], 0x47);

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, expectedWidth, `Expected width ${expectedWidth}, got ${width}`);
  assert.equal(height, expectedHeight, `Expected height ${expectedHeight}, got ${height}`);
}

test('Seed Items - All seed items have valid icons and existing 16x16 PNG assets', () => {
  const seedsToCheck = [
    { id: 'wheat_seeds', name: 'Wheat Seeds', expectedPath: '/assets/items/wheat_seeds.png' },
    { id: 'pumpkin_seeds', name: 'Pumpkin Seeds', expectedPath: '/assets/items/pumpkin_seeds.png' },
    { id: 'melon_seeds', name: 'Melon Seeds', expectedPath: '/assets/items/melon_seeds.png' },
    { id: 'beetroot_seeds', name: 'Beetroot Seeds', expectedPath: '/assets/items/beetroot_seeds.png' },
    { id: 'torchflower_seeds', name: 'Torchflower Seeds', expectedPath: '/assets/items/torchflower_seeds.png' },
    { id: 'pitcher_pod', name: 'Pitcher Pod', expectedPath: '/assets/items/pitcher_pod.png' }
  ];

  for (const { id, name, expectedPath } of seedsToCheck) {
    const itemDef = ITEMS[id];
    assert.ok(itemDef, `Item definition for ${id} must exist in ITEMS`);
    assert.equal(itemDef.icon, expectedPath, `Icon path for ${id} should be ${expectedPath}`);
    assert.equal(itemDef.type, 'seed', `Type for ${id} should be "seed"`);

    const fullPath = checkAssetExists(itemDef.icon);
    verifyPNGHeader(fullPath, 16, 16);
  }
});

test('Vehicle Items - Chest Boat and Minecart variants have existing 16x16 PNG icons', () => {
  const vehiclesToCheck = [
    { id: 'chest_boat', expectedPath: '/assets/items/chest_boat.png' },
    { id: 'furnace_minecart', expectedPath: '/assets/items/furnace_minecart.png' },
    { id: 'hopper_minecart', expectedPath: '/assets/items/hopper_minecart.png' },
    { id: 'tnt_minecart', expectedPath: '/assets/items/tnt_minecart.png' }
  ];

  for (const { id, expectedPath } of vehiclesToCheck) {
    const itemDef = ITEMS[id];
    assert.ok(itemDef, `Item definition for ${id} must exist in ITEMS`);
    assert.equal(itemDef.icon, expectedPath, `Icon path for ${id} should be ${expectedPath}`);

    const fullPath = checkAssetExists(itemDef.icon);
    verifyPNGHeader(fullPath, 16, 16);
  }
});

test('Rail and Redstone Block Icons - SVG block icons exist and are valid XML', () => {
  const blocksToCheck = [
    { blockId: BLOCKS.RAIL, expectedPath: '/assets/blocks/rail.svg' },
    { blockId: BLOCKS.POWERED_RAIL, expectedPath: '/assets/blocks/powered_rail.svg' },
    { blockId: BLOCKS.TRIPWIRE_HOOK, expectedPath: '/assets/blocks/tripwire_hook.svg' },
    { blockId: BLOCKS.TRIPWIRE, expectedPath: '/assets/blocks/tripwire.svg' }
  ];

  for (const { blockId, expectedPath } of blocksToCheck) {
    const def = BLOCK_DEFS[blockId];
    assert.ok(def, `Block definition for ${blockId} must exist`);
    assert.equal(def.icon, expectedPath, `Icon path for block ${blockId} should be ${expectedPath}`);

    const fullPath = checkAssetExists(def.icon);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.ok(content.includes('<svg'), `File at ${fullPath} must contain SVG markup`);
    assert.ok(content.includes('</svg>'), `File at ${fullPath} must properly close SVG markup`);
  }
});

test('Catalog Integrity - 100% of ITEMS entries have existing icon assets', () => {
  for (const [id, def] of Object.entries(ITEMS)) {
    assert.ok(def.icon, `Item ${id} must have an icon defined`);
    const cleanPath = def.icon.startsWith('/') ? def.icon.slice(1) : def.icon;
    const fullPath = path.join(process.cwd(), 'public', cleanPath);
    assert.ok(fs.existsSync(fullPath), `Icon for item ${id} not found: ${fullPath}`);
  }
});

test('Catalog Integrity - 100% of ALL_CREATIVE_ITEMS entries have existing icon assets', () => {
  for (const item of ALL_CREATIVE_ITEMS) {
    assert.ok(item.icon, `Creative item ${item.name} (${item.id}) must have an icon`);
    const cleanPath = item.icon.startsWith('/') ? item.icon.slice(1) : item.icon;
    const fullPath = path.join(process.cwd(), 'public', cleanPath);
    assert.ok(fs.existsSync(fullPath), `Creative item icon not found: ${fullPath} for ${item.name}`);
  }
});

test('Raw Metal & Material Icons - Raw iron, gold, copper and nuggets match authentic pixel art', () => {
  const authenticItems = [
    { id: 'raw_iron', expectedPath: '/assets/items/raw_iron.png', minSize: 200 },
    { id: 'raw_gold', expectedPath: '/assets/items/raw_gold.png', minSize: 200 },
    { id: 'raw_copper', expectedPath: '/assets/items/raw_copper.png', minSize: 200 },
    { id: 'iron_nugget', expectedPath: '/assets/items/iron_nugget.png', minSize: 150 },
    { id: 'gold_nugget', expectedPath: '/assets/items/gold_nugget.png', minSize: 130 },
    { id: 'spectral_arrow', expectedPath: '/assets/items/spectral_arrow.png', minSize: 120 }
  ];

  for (const { id, expectedPath, minSize } of authenticItems) {
    const def = ITEMS[id];
    assert.ok(def, `Item definition for ${id} must exist`);
    assert.equal(def.icon, expectedPath, `Icon for ${id} should be ${expectedPath}`);
    const fullPath = checkAssetExists(def.icon);
    verifyPNGHeader(fullPath, 16, 16);
    const size = fs.statSync(fullPath).size;
    assert.ok(size >= minSize, `Icon for ${id} should have authentic detail (size ${size} >= ${minSize})`);
  }
});

