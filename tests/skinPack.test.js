import test from 'node:test';
import assert from 'node:assert/strict';
import { SkinManager, DEFAULT_SKINS } from '../src/skinManager.js';
import { createSimpleZip } from '../src/io/zipReader.js';

test('SkinManager: registers official default skins (Steve, Alex, Ari, etc.)', () => {
  const manager = new SkinManager();
  const allSkins = manager.getAllSkins();

  assert.ok(allSkins.length >= 9, 'Contains at least 9 official default skins');

  const steve = manager.skins.get('steve');
  assert.ok(steve, 'Contains Steve');
  assert.equal(steve.model, 'default', 'Steve has 4px default arm model');

  const alex = manager.skins.get('alex');
  assert.ok(alex, 'Contains Alex');
  assert.equal(alex.model, 'slim', 'Alex has 3px slim arm model');

  const ari = manager.skins.get('ari');
  assert.ok(ari, 'Contains Ari');
  assert.equal(ari.model, 'slim', 'Ari has slim arm model');
});

test('SkinManager: equips skins and creates arm material for first-person view', () => {
  const manager = new SkinManager();

  // Initially Steve
  assert.equal(manager.getEquippedSkin().id, 'steve');
  const steveMat = manager.getArmMaterial();
  assert.ok(steveMat, 'Creates Steve arm material');

  // Equip Alex
  manager.equipSkin('alex');
  assert.equal(manager.getEquippedSkin().id, 'alex');
  assert.equal(manager.getEquippedSkin().model, 'slim');

  const alexMat = manager.getArmMaterial();
  assert.ok(alexMat, 'Creates Alex arm material');
});

test('SkinManager: registers single custom skin and persists', () => {
  const manager = new SkinManager();
  const custom = manager.registerSkin('My Warrior Skin', 'data:image/png;base64,custom_warrior', 'slim');

  assert.ok(custom.id.startsWith('custom_'));
  assert.equal(custom.name, 'My Warrior Skin');
  assert.equal(custom.model, 'slim');
  assert.equal(manager.getEquippedSkin().id, custom.id, 'Equips custom skin upon registration');
});

test('SkinManager: imports Bedrock/Java skin pack from zip archive with skins.json', async () => {
  const manager = new SkinManager();

  const mockSkinsJson = {
    serialize_name: 'Fantasy Warriors Pack',
    skins: [
      {
        localization_name: 'Knight',
        geometry: 'geometry.humanoid.custom',
        texture: 'knight.png',
        type: 'free',
      },
      {
        localization_name: 'Elf Ranger',
        geometry: 'geometry.humanoid.customSlim',
        texture: 'elf.png',
        type: 'free',
      },
    ],
  };

  const packFiles = {
    'skins.json': JSON.stringify(mockSkinsJson),
    'knight.png': new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    'elf.png': new Uint8Array([137, 80, 78, 71, 4, 5, 6]),
  };

  const zipBuffer = createSimpleZip(packFiles);
  const imported = await manager.loadSkinPackFromZip(zipBuffer, 'Fantasy Warriors Pack');

  assert.equal(imported.length, 2, 'Imports 2 skins from pack');
  assert.equal(imported[0].name, 'Knight');
  assert.equal(imported[0].model, 'default');
  assert.equal(imported[1].name, 'Elf Ranger');
  assert.equal(imported[1].model, 'slim');

  // Automatically equipped the first imported skin
  assert.equal(manager.getEquippedSkin().name, 'Knight');

  // Pack is registered in skinPacks
  const packs = manager.getSkinPacks();
  const registeredPack = packs.find(p => p.name === 'Fantasy Warriors Pack');
  assert.ok(registeredPack, 'Skin pack is registered in skinPacks');
  assert.equal(registeredPack.skins.length, 2);
});

test('SkinManager: registers bundled skin packs (Medieval, Cyberpunk, Nether/Void, Cosplay, Vanilla)', () => {
  const manager = new SkinManager();
  const packs = manager.getSkinPacks();

  assert.ok(packs.length >= 5, 'Has at least 5 bundled skin packs');

  const packIds = packs.map(p => p.id);
  assert.ok(packIds.includes('vanilla_default'), 'Includes Vanilla Default pack');
  assert.ok(packIds.includes('pack_fantasy'), 'Includes Medieval & Fantasy Legends pack');
  assert.ok(packIds.includes('pack_cyberpunk'), 'Includes Cyberpunk & Streetwear pack');
  assert.ok(packIds.includes('pack_nether_void'), 'Includes Nether & Void Expedition pack');
  assert.ok(packIds.includes('pack_cosplay'), 'Includes Cozy Onesies & Cosplay pack');

  const fantasyPack = manager.getSkinPack('pack_fantasy');
  assert.equal(fantasyPack.name, 'Medieval & Fantasy Legends');
  assert.ok(fantasyPack.skins.length >= 4, 'Fantasy pack contains at least 4 characters');
  assert.ok(fantasyPack.skins.some(s => s.name === 'Crusader Knight'));
  assert.ok(fantasyPack.skins.some(s => s.name === 'Elven Ranger' && s.model === 'slim'));

  const cyberPack = manager.getSkinPack('pack_cyberpunk');
  assert.ok(cyberPack.skins.some(s => s.name === 'Cyber Hacker' && s.model === 'slim'));
  assert.ok(cyberPack.skins.some(s => s.name === 'Neon Streetwear' && s.model === 'default'));
});

test('SkinManager: activates skin pack and switches equipped skin', () => {
  const manager = new SkinManager();

  // Initially Steve
  assert.equal(manager.getEquippedSkin().id, 'steve');

  // Activate Medieval pack
  const knight = manager.activateSkinPack('pack_fantasy');
  assert.ok(knight);
  assert.equal(manager.getEquippedSkin().id, knight.id);
  assert.equal(manager.getEquippedSkin().name, 'Crusader Knight');

  // Arm materials are available
  const armMat = manager.getArmMaterial();
  const overlayMat = manager.getArmOverlayMaterial();
  assert.ok(armMat);
  assert.ok(overlayMat);

  // Activate Cyberpunk pack
  const cyber = manager.activateSkinPack('pack_cyberpunk');
  assert.ok(cyber);
  assert.equal(manager.getEquippedSkin().name, 'Cyber Hacker');
  assert.equal(manager.getEquippedSkin().model, 'slim');
});

test('SkinManager: toggles model between Classic 4px and Slim 3px', () => {
  const manager = new SkinManager();
  manager.equipSkin('steve');
  assert.equal(manager.getEquippedSkin().model, 'default');

  // Toggle model to slim
  manager.toggleEquippedModel();
  assert.equal(manager.getEquippedSkin().model, 'slim');

  // Toggle back to default
  manager.toggleEquippedModel();
  assert.equal(manager.getEquippedSkin().model, 'default');
});

test('SkinManager / NameMC: detectSkinModelFromAlpha distinguishes Classic (4px) vs Slim (3px) skins', async () => {
  const { detectSkinModelFromAlpha } = await import('../src/skinManager.js');

  // 1. Classic 4px skin: pixel at (55, 20) is solid opaque (alpha = 255)
  const classicModel = detectSkinModelFromAlpha(64, 64, (x, y) => {
    if (x === 55 && y === 20) return 255;
    return 0;
  });
  assert.equal(classicModel, 'default', 'Detects default 4px classic model');

  // 2. Slim 3px skin: columns 54..55 and 46..47 are transparent (alpha = 0)
  const slimModel = detectSkinModelFromAlpha(64, 64, (x, y) => {
    // Other pixels have colors, but columns 54-55 and 46-47 are transparent
    if (x < 54 && y < 32) return 255;
    return 0;
  });
  assert.equal(slimModel, 'slim', 'Detects slim 3px Alex model');

  // 3. Legacy 64x32 skin: always default
  const legacyModel = detectSkinModelFromAlpha(64, 32, () => 255);
  assert.equal(legacyModel, 'default', 'Legacy 64x32 is always default');
});

test('SkinManager: imports NameMC collection zip without skins.json (folder of PNG skins)', async () => {
  const manager = new SkinManager();

  const packFiles = {
    'skins/cyber_ninja.png': new Uint8Array([137, 80, 78, 71, 10, 20, 30]),
    'skins/cosmic_wizard.png': new Uint8Array([137, 80, 78, 71, 40, 50, 60]),
    'skins/pack.png': new Uint8Array([137, 80, 78, 71, 70, 80, 90]), // should be excluded
  };

  const zipBuffer = createSimpleZip(packFiles);
  const imported = await manager.loadSkinPackFromZip(zipBuffer, 'NameMC Trending Collection');

  assert.equal(imported.length, 2, 'Imports 2 character skins excluding pack icon');
  assert.ok(imported.some(s => s.name === 'Cyber Ninja'));
  assert.ok(imported.some(s => s.name === 'Cosmic Wizard'));

  // First skin equipped
  assert.equal(manager.getEquippedSkin().name, 'Cyber Ninja');

  // Pack registered
  const pack = manager.getSkinPacks().find(p => p.name === 'NameMC Trending Collection');
  assert.ok(pack, 'Pack is saved in skinPacks');
  assert.equal(pack.skins.length, 2);
});

