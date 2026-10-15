import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlayerModel } from '../src/playerModel.js';
import { Player } from '../src/player.js';
import { Inventory } from '../src/inventory.js';
import { BLOCKS } from '../src/blocks.js';

test('Player 3D Armor Visuals - Initial state has no armor and exactly 2 meshes per limb', () => {
  const model = createPlayerModel();

  assert.equal(model.hasArmor('head'), false);
  assert.equal(model.hasArmor('chest'), false);
  assert.equal(model.hasArmor('legs'), false);
  assert.equal(model.hasArmor('feet'), false);

  assert.equal(model.head.children.length, 2, 'head has only base and overlay meshes initially');
  assert.equal(model.torso.children.length, 2, 'torso has only base and overlay meshes initially');
  assert.equal(model.leftArm.children.length, 2, 'left arm has only base and overlay meshes initially');
  assert.equal(model.rightArm.children.length, 2, 'right arm has only base and overlay meshes initially');
  assert.equal(model.leftLeg.children.length, 2, 'left leg has only base and overlay meshes initially');
  assert.equal(model.rightLeg.children.length, 2, 'right leg has only base and overlay meshes initially');
});

test('Player 3D Armor Visuals - Equipping and unequipping helmet on player model', () => {
  const model = createPlayerModel();

  // Equip Diamond Helmet
  model.updateArmor({ head: { id: 'diamond_helmet', count: 1 } });
  assert.equal(model.hasArmor('head'), true);
  assert.equal(model.head.children.length, 3, 'head now has helmet group added as a child');

  const helmet = model.getArmorPiece('head');
  assert.ok(helmet instanceof THREE.Group, 'helmet is a Three.js Group');
  assert.equal(helmet.name, 'armor_helmet');
  assert.ok(helmet.children.length >= 5, 'helmet contains top cap, back plate, cheeks, brow, and nose guard');

  // Unequip Helmet
  model.updateArmor({ head: null });
  assert.equal(model.hasArmor('head'), false);
  assert.equal(model.head.children.length, 2, 'head returns to 2 children after unequipping');
  assert.equal(model.getArmorPiece('head'), null);
});

test('Player 3D Armor Visuals - Equipping full armor set attaches to all limbs', () => {
  const model = createPlayerModel();

  model.updateArmor({
    head: { id: 'netherite_helmet', count: 1 },
    chest: { id: 'netherite_chestplate', count: 1 },
    legs: { id: 'netherite_leggings', count: 1 },
    feet: { id: 'netherite_boots', count: 1 },
  });

  assert.equal(model.hasArmor('head'), true);
  assert.equal(model.hasArmor('chest'), true);
  assert.equal(model.hasArmor('legs'), true);
  assert.equal(model.hasArmor('feet'), true);

  // Helmet on head
  assert.equal(model.head.children.length, 3);

  // Chestplate on torso and both arms
  assert.ok(model.torso.children.length >= 3, 'torso has chestplate body');
  assert.equal(model.leftArm.children.length, 3, 'left arm has shoulder pauldron');
  assert.equal(model.rightArm.children.length, 3, 'right arm has shoulder pauldron');

  // Leggings belt on torso and guards on both legs
  assert.equal(model.leftLeg.children.length, 4, 'left leg has legging guard and boot');
  assert.equal(model.rightLeg.children.length, 4, 'right leg has legging guard and boot');

  // Unequip all
  model.updateArmor({});
  assert.equal(model.hasArmor('head'), false);
  assert.equal(model.hasArmor('chest'), false);
  assert.equal(model.hasArmor('legs'), false);
  assert.equal(model.hasArmor('feet'), false);

  assert.equal(model.head.children.length, 2);
  assert.equal(model.torso.children.length, 2);
  assert.equal(model.leftArm.children.length, 2);
  assert.equal(model.rightArm.children.length, 2);
  assert.equal(model.leftLeg.children.length, 2);
  assert.equal(model.rightLeg.children.length, 2);
});

test('Player 3D Armor Visuals - Supports turtle helmet and leather armor', () => {
  const model = createPlayerModel();

  // Turtle Helmet
  model.updateArmor({ head: { id: 'turtle_helmet', count: 1 } });
  assert.equal(model.hasArmor('head'), true);
  const turtleHelmet = model.getArmorPiece('head');
  assert.ok(turtleHelmet);

  // Leather armor
  model.updateArmor({
    head: { id: 'leather_helmet', count: 1 },
    chest: { id: 'leather_chestplate', count: 1 },
  });
  assert.equal(model.hasArmor('head'), true);
  assert.equal(model.hasArmor('chest'), true);
});

test('Player 3D Armor Visuals - Supports trimmed armor overlays', () => {
  const model = createPlayerModel();

  model.updateArmor({
    chest: {
      id: 'diamond_chestplate',
      count: 1,
      trim: { pattern: 'rib', material: 'gold_ingot' },
    },
  });

  assert.equal(model.hasArmor('chest'), true);
  const chestPiece = model.getArmorPiece('chest');
  assert.ok(chestPiece.torso);

  // Torso has bodyBox, crest, and trimPlate
  assert.equal(chestPiece.torso.children.length, 3, 'torso has body, crest, and trim mesh');
});

test('Player 3D Armor Visuals - Player updateCameraAndModel syncs armor with inventory', () => {
  const camera = new THREE.PerspectiveCamera();
  const world = { getVoxel: () => BLOCKS.AIR };
  const player = new Player(camera, null, world, {});
  const inventory = new Inventory();
  player.inventory = inventory;

  // Perspective 1: Third person back
  player.perspective = 1;

  // Initially no armor
  player.updateCameraAndModel(0.016);
  assert.equal(player.model.hasArmor('head'), false);

  // Put on diamond helmet
  inventory.armor.head = { id: 'diamond_helmet', count: 1 };
  player.updateCameraAndModel(0.016);

  assert.equal(player.model.hasArmor('head'), true, 'helmet is rendered on 3D player model in 3rd person');
  assert.equal(player.model.head.children.length, 3);

  // Head pitch rotates helmet with head
  player.pitch = 0.45;
  player.updateCameraAndModel(0.016);
  assert.equal(player.model.head.rotation.x, 0.45, 'head pitch rotation applies to head and attached helmet');

  // Unequip helmet in inventory
  inventory.armor.head = null;
  player.updateCameraAndModel(0.016);
  assert.equal(player.model.hasArmor('head'), false, 'helmet is removed from 3D player model when unequipped');
  assert.equal(player.model.head.children.length, 2);
});
