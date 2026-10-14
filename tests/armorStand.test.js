// Armour stands: placing, breaking (drops), putting armour on, swapping it and taking it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { armorSlotOf, equipmentFrom, createArmorStand, useOnArmorStand, armorStandDrops, armorStandPlacement } from '../src/armorStand.js';

function inventoryHolding(item) {
  return {
    hotbar: [item, null], activeSlot: 0, added: [],
    getActiveItem() { return this.hotbar[this.activeSlot]; },
    addItem(id, isBlock, count) { this.added.push({ id, count }); return true; }
  };
}

test('armour goes in its slot: helmets on the head, chestplates and elytra on the chest, leggings, boots', () => {
  assert.equal(armorSlotOf('iron_helmet'), 'head');
  assert.equal(armorSlotOf('turtle_helmet'), 'head');
  assert.equal(armorSlotOf('carved_pumpkin'), 'head');
  assert.equal(armorSlotOf('diamond_chestplate'), 'chest');
  assert.equal(armorSlotOf('elytra'), 'chest');
  assert.equal(armorSlotOf('netherite_leggings'), 'legs');
  assert.equal(armorSlotOf('leather_boots'), 'feet');
  assert.equal(armorSlotOf('stick'), null);
  assert.deepEqual(equipmentFrom(['iron_helmet', 'iron_chestplate']), { head: 'iron_helmet', chest: 'iron_chestplate', legs: null, feet: null });
});

test('using armour on a stand puts it on, a second piece swaps, and an empty hand takes it back', () => {
  const stand = createArmorStand(0, 1, 0);
  const inv = inventoryHolding({ id: 'iron_helmet', isBlock: false, count: 1 });
  assert.equal(useOnArmorStand(stand, inv).action, 'equipped');
  assert.equal(stand.slots.head, 'iron_helmet');
  assert.equal(inv.hotbar[0], null, 'the helmet left the hand');
  assert.ok(stand.mesh.getObjectByName('armor_head'), 'and is drawn on the stand');

  inv.hotbar[0] = { id: 'diamond_helmet', isBlock: false, count: 1 };
  const swap = useOnArmorStand(stand, inv);
  assert.equal(swap.action, 'swapped');
  assert.equal(stand.slots.head, 'diamond_helmet');
  assert.deepEqual(inv.hotbar[0], { id: 'iron_helmet', isBlock: false, count: 1 }, 'the old helmet comes back to the hand');

  inv.hotbar[0] = null;
  const take = useOnArmorStand(stand, inv);
  assert.equal(take.action, 'taken');
  assert.equal(stand.slots.head, null);
  assert.equal(inv.hotbar[0].id, 'diamond_helmet');
  assert.equal(stand.mesh.getObjectByName('armor_head'), undefined);
  inv.hotbar[0] = null;
  assert.equal(useOnArmorStand(stand, inv), null, 'a bare stand gives nothing more');
});

test('in Creative the held armour is not used up; something that is not armour does nothing', () => {
  const stand = createArmorStand(0, 1, 0);
  const inv = inventoryHolding({ id: 'golden_boots', isBlock: false, count: 1 });
  useOnArmorStand(stand, inv, true);
  assert.equal(stand.slots.feet, 'golden_boots');
  assert.equal(inv.hotbar[0].id, 'golden_boots');
  inv.hotbar[0] = { id: 'stick', isBlock: false, count: 1 };
  assert.equal(useOnArmorStand(stand, inv), null);
});

test('breaking a stand drops it and its armour in Survival, and nothing in Creative', () => {
  const stand = createArmorStand(0, 1, 0, { equipment: ['iron_helmet', 'iron_chestplate'] });
  assert.deepEqual(armorStandDrops(stand).sort(), ['armor_stand', 'iron_chestplate', 'iron_helmet']);
  assert.deepEqual(armorStandDrops(stand, true), []);
});

test('the mob manager: a hit breaks the stand, removes it and drops its items; it never moves', () => {
  const scene = new THREE.Scene();
  const manager = new MobManager(scene, { getVoxel: () => 0 }, {});
  const drops = [];
  manager.entities = { spawnDroppedItem: (pos, id) => drops.push(id) };
  const stand = manager.spawnMob('armor_stand', 2, 1, 3, { equipment: ['iron_chestplate'] });
  manager.update(0.05, { position: new THREE.Vector3(10, 1, 10), gamemode: 'survival' });
  assert.deepEqual(stand.mesh.position.toArray(), [2, 1, 3], 'frozen in place');
  manager.damageMob(stand, 1, new THREE.Vector3(), true, { gamemode: 'survival' });
  assert.equal(manager.mobs.includes(stand), false);
  assert.deepEqual(drops.sort(), ['armor_stand', 'iron_chestplate']);
});

test('an armour stand is placed on top of a block, facing the player, and not on a wall', () => {
  const at = armorStandPlacement({ x: 4, y: 10, z: 6, normal: { x: 0, y: 1, z: 0 } }, { x: 4.5, y: 11, z: 12 });
  assert.deepEqual([at.x, at.y, at.z], [4.5, 11, 6.5]);
  assert.ok(Math.abs(at.yaw) < 1e-9, 'facing the player to the south');
  assert.equal(armorStandPlacement({ x: 4, y: 10, z: 6, normal: { x: 1, y: 0, z: 0 } }, { x: 0, y: 0, z: 0 }), null);
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /standItem\.id === 'armor_stand'/);
  assert.match(main, /useOnArmorStand\(interactMob, this\.inventory/);
});
