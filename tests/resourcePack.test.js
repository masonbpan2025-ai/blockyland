import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourcePackManager } from '../src/resourcePackManager.js';
import { createSimpleZip } from '../src/io/zipReader.js';

test('ResourcePackManager: registers built-in presets (Stay True, Faithful 64x, Ashen 16x)', () => {
  const manager = new ResourcePackManager();
  const available = manager.getAvailablePacks();
  const ids = available.map(p => p.id);

  assert.ok(ids.includes('vanilla'), 'Has vanilla pack');
  assert.ok(ids.includes('stay_true'), 'Has Stay True preset');
  assert.ok(ids.includes('faithful_64x'), 'Has Faithful 64x preset');
  assert.ok(ids.includes('ashen_16x'), 'Has Ashen 16x preset');

  // Verify Stay True textures
  const stayTrue = manager.availablePacks.get('stay_true');
  assert.ok(stayTrue.blockTextures['grass_block_top.png'], 'Stay True overrides grass_block_top.png');
  assert.ok(stayTrue.blockTextures['stone.png'], 'Stay True overrides stone.png');
  assert.ok(stayTrue.blockTextures['oak_planks.png'], 'Stay True overrides oak_planks.png');
  assert.ok(stayTrue.blockTextures['dandelion.png'], 'Stay True overrides dandelion.png');

  // Verify Faithful 64x textures
  const faithful = manager.availablePacks.get('faithful_64x');
  assert.ok(faithful.blockTextures['stone.png'], 'Faithful 64x overrides stone.png');
  assert.ok(faithful.blockTextures['oak_planks.png'], 'Faithful 64x overrides oak_planks.png');

  // Verify Ashen 16x textures
  const ashen = manager.availablePacks.get('ashen_16x');
  assert.ok(ashen.blockTextures['stone.png'], 'Ashen overrides stone.png');
  assert.ok(ashen.blockTextures['cobblestone.png'], 'Ashen overrides cobblestone.png');
});

test('ResourcePackManager: defaults to Faithful 64x resource pack with 64x resolution', () => {
  const manager = new ResourcePackManager();
  assert.deepEqual(manager.activePackIds, ['faithful_64x'], 'Faithful 64x is active by default');
  assert.equal(manager.getActiveTileSize(), 64, 'Active tile size is 64 by default');
  const stoneUrl = manager.resolveBlockTexture('stone.png');
  assert.ok(stoneUrl, 'Faithful 64x resolves stone texture by default');
  assert.match(stoneUrl, /\/assets\/packs\/faithful_64x\/stone\.png/);
});

test('ResourcePackManager: activates packs and resolves textures by priority', () => {
  const manager = new ResourcePackManager();

  // Initially only vanilla or empty active
  manager.reorderPacks([]);
  assert.equal(manager.resolveBlockTexture('stone.png'), null, 'Fallback to null when no pack active');

  // Activate Stay True
  manager.activatePack('stay_true');
  const stayTrueStone = manager.resolveBlockTexture('stone.png');
  assert.ok(stayTrueStone, 'Stay True resolves stone.png');

  // Activate Ashen 16x with higher priority
  manager.activatePack('ashen_16x', 0); // index 0 = highest priority
  const ashenStone = manager.resolveBlockTexture('stone.png');
  assert.ok(ashenStone, 'Ashen resolves stone.png');
  assert.notEqual(ashenStone, stayTrueStone, 'Higher priority Ashen overrides Stay True');

  // Deactivate Ashen -> falls back to Stay True
  manager.deactivatePack('ashen_16x');
  assert.equal(manager.resolveBlockTexture('stone.png'), stayTrueStone, 'Falls back to Stay True when Ashen deactivated');
});

test('ResourcePackManager: loads custom Java Edition resource pack .zip', async () => {
  const manager = new ResourcePackManager();

  const customFiles = {
    'pack.mcmeta': JSON.stringify({
      pack: {
        pack_format: 46,
        description: 'My Custom HD Pack',
      },
    }),
    'pack.png': new Uint8Array([137, 80, 78, 71]),
    'assets/minecraft/textures/block/diamond_block.png': new Uint8Array([1, 2, 3, 4]),
    'assets/minecraft/textures/item/netherite_sword.png': new Uint8Array([5, 6, 7, 8]),
  };

  const zipBytes = createSimpleZip(customFiles);
  const pack = await manager.loadPackFromZip(zipBytes, 'My Custom HD Pack');

  assert.ok(pack, 'Pack loaded');
  assert.equal(pack.name, 'My Custom HD Pack');
  assert.equal(pack.packFormat, 46);
  assert.equal(pack.description, 'My Custom HD Pack');
  assert.ok(pack.blockTextures['diamond_block.png'], 'Block texture extracted');
  assert.ok(pack.itemTextures['netherite_sword.png'], 'Item texture extracted');

  // Verify custom pack resolution
  assert.ok(manager.resolveBlockTexture('diamond_block.png'), 'Resolves diamond_block.png from custom pack');
  assert.ok(manager.resolveItemTexture('netherite_sword'), 'Resolves netherite_sword from custom pack');
  assert.equal(manager.resolveItemTexture('unknown_item'), null, 'Returns null for unknown item');
});

test('ResourcePackManager: Faithful 64x activates 64x tile resolution and resolves HD textures', () => {
  const manager = new ResourcePackManager();

  // Reset active packs to ensure clean state
  manager.reorderPacks([]);
  assert.equal(manager.getActiveTileSize(), 16, 'Default tile size is 16');

  // Activate Faithful 64x
  manager.activatePack('faithful_64x');
  assert.equal(manager.getActiveTileSize(), 64, 'Active tile size is 64 when Faithful 64x is active');

  // Verify comprehensive block textures are mapped
  const testBlocks = [
    'birch_log.png',
    'birch_log_top.png',
    'grass_block_top.png',
    'grass_block_side.png',
    'oak_planks.png',
    'oak_leaves.png',
    'cobblestone.png',
    'dirt.png',
    'stone.png',
    'diamond_ore.png',
    'glass.png',
  ];

  for (const block of testBlocks) {
    const url = manager.resolveBlockTexture(block);
    assert.ok(url, `Faithful 64x provides texture for ${block}`);
    assert.match(url, new RegExp(`/assets/packs/faithful_64x/${block}`), `${block} points to faithful_64x HD asset`);
  }

  // Deactivate Faithful 64x (pack turned off)
  manager.deactivatePack('faithful_64x');
  assert.equal(manager.getActiveTileSize(), 16, 'Tile size drops back to 16 when Faithful 64x is deactivated');

  // All textures fall back to null so default 16x assets are loaded with zero overhead
  for (const block of testBlocks) {
    assert.equal(manager.resolveBlockTexture(block), null, `${block} falls back to default 16x when pack is turned off`);
  }
});

test('ResourcePackManager: custom HD pack automatically detects resolution from PNG header', async () => {
  const manager = new ResourcePackManager();
  manager.reorderPacks([]); // Start with clean vanilla state

  // Construct a minimal valid PNG with 64x64 header
  // Byte 0..7: PNG signature
  // Byte 8..11: IHDR length (13)
  // Byte 12..15: 'IHDR'
  // Byte 16..19: width (64 = 0x00000040)
  // Byte 20..23: height (64 = 0x00000040)
  const pngHeader = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d,                         // IHDR length = 13
    0x49, 0x48, 0x44, 0x52,                         // 'IHDR'
    0x00, 0x00, 0x00, 0x40,                         // width = 64
    0x00, 0x00, 0x00, 0x40,                         // height = 64
    0x08, 0x06, 0x00, 0x00, 0x00                   // bit depth, color type, compression, filter, interlace
  ]);

  const customFiles = {
    'pack.mcmeta': JSON.stringify({ pack: { pack_format: 46, description: 'Test 64x Custom' } }),
    'assets/minecraft/textures/block/amethyst_block.png': pngHeader,
  };

  const zipBytes = createSimpleZip(customFiles);
  const pack = await manager.loadPackFromZip(zipBytes, 'Test 64x Custom');

  assert.equal(pack.tileSize, 64, 'Detected 64x resolution from PNG header');
  assert.equal(manager.getActiveTileSize(), 64, 'Active tile size reflects custom HD pack');

  // Deactivating custom pack restores 16x
  manager.deactivatePack(pack.id);
  assert.equal(manager.getActiveTileSize(), 16, 'Deactivating custom HD pack restores 16x tile size');
});

