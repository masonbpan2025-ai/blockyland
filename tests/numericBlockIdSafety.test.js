import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, Chunk } from '../src/world.js';
import { BLOCKS as B } from '../src/blocks.js';
import { getItemEnchantCategory } from '../src/enchanting.js';
import { isHoe } from '../src/farming.js';
import { syncPiglinEquipment } from '../src/piglin.js';
import { syncWitherEquipment } from '../src/witherSkeleton.js';
import { syncZombifiedEquipment } from '../src/zombifiedPiglin.js';

/**
 * The inventory names an item with a STRING and a block with a NUMBER (`BLOCKS.WHITE_WOOL`,
 * `isBlock: true`), so every rule written against item names has to tolerate the numeric form.
 *
 * The placement bug this file follows on from was one of these: `itemId.endsWith('_dye')` in
 * AnimalBehaviors.canInteract threw `itemId.endsWith is not a function`, and because
 * `Game.handleRightClick` asks about every mob before it reaches block placement, a single sheep,
 * wolf or horse anywhere in the world made right-clicking with any block do nothing at all.
 *
 * The sites below are the rest of that class: each was reachable with a block in hand, and each now
 * reads a name-form local instead of calling a string method on whatever the id happened to be.
 */
const BLOCK_ITEM = { id: B.WHITE_WOOL, isBlock: true, count: 1 };

function testWorld() {
  const world = new World();
  for (let x = -2; x < 5; x++) {
    for (let z = -2; z < 5; z++) world.chunks.set(world.chunkKey(x, z), new Chunk(x, z));
  }
  return world;
}
const put = (world, p, id, dir = 0) => { world.setVoxel(...p, id); world.redstone.configure(p, dir); return world.redstone.state(p); };
const ticks = (world, n = 1) => { for (let i = 0; i < n; i++) world.redstone.tick([]); };

test('a dispenser firing a plain block drops it instead of throwing', () => {
  const world = testWorld();
  const dropped = [];
  world.redstone.game = {
    player: { position: new THREE.Vector3(8, 2, 0) },
    inventory: { armor: { head: null, chest: null, legs: null, feet: null } },
    mobs: { spawnArrow() {} },
    entities: { spawnDroppedItem(pos, id, isBlock) { dropped.push({ id, isBlock }); } },
  };

  const dispenser = put(world, [0, 2, 0], B.DISPENSER, 0); // faces +X, into air
  dispenser.inventory = [{ ...BLOCK_ITEM }];
  const lever = put(world, [0, 3, 0], B.LEVER);
  lever.on = true;

  assert.doesNotThrow(() => ticks(world, 2), 'dispensing a block threw');
  assert.equal(dropped.length, 1, 'the block was dispensed');
  assert.deepEqual(dropped[0], { id: B.WHITE_WOOL, isBlock: true });
});

test('mob equipment visuals tolerate a block in an equipment slot', () => {
  // A mob can carry a picked-up BLOCK: the pickup hands over the dropped item's numeric id, and it
  // then flows into the equipment visuals and the weapon model.
  const fakeMob = (weaponId) => ({
    equipment: { head: { ...BLOCK_ITEM }, weapon: { id: weaponId, isBlock: typeof weaponId === 'number', count: 1 } },
    equipmentVisuals: {},
    witherEquipmentVisuals: {},
    head: new THREE.Object3D(),
    mesh: new THREE.Object3D(),
    leftArm: new THREE.Object3D(),
    rightArm: new THREE.Object3D(),
    leftLeg: new THREE.Object3D(),
    rightLeg: new THREE.Object3D(),
    bladeMat: new THREE.MeshLambertMaterial(),
    isBaby: false,
    weapon: weaponId,
    leftHanded: false,
  });

  for (const [name, sync] of [
    ['piglin', syncPiglinEquipment],
    ['wither skeleton', syncWitherEquipment],
    ['zombified piglin', syncZombifiedEquipment],
  ]) {
    assert.doesNotThrow(() => sync(fakeMob(B.WHITE_WOOL)), `${name}: a block in an equipment slot threw`);
    assert.doesNotThrow(() => sync(fakeMob('diamond_sword')), `${name}: a named weapon threw`);
  }
});

test('the helpers that already refuse a numeric id still do, and still accept names', () => {
  // These two were guarded before the placement bug was found; the assertions pin that the guard
  // survives, since losing it would reintroduce the crash in a different feature area.
  assert.equal(getItemEnchantCategory(B.WHITE_WOOL), null, 'a block is not an enchantable item');
  assert.equal(isHoe(B.WHITE_WOOL), false, 'a block is not a hoe');
  assert.equal(getItemEnchantCategory('diamond_sword'), 'weapon', 'and names still work');
  assert.equal(getItemEnchantCategory('diamond_pickaxe'), 'tool');
  assert.equal(isHoe('iron_hoe'), true);
});
