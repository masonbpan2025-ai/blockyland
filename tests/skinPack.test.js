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
});
