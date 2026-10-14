// Armour stands: placing, breaking, and putting armour on and taking it off.
//
// From the wiki (`Armor Stand`): an armour stand is an entity placed from its item onto the top of a block, facing the
// player. It holds armour in four slots (head, chest, legs, feet). Using a piece of armour on it puts the armour on
// (swapping with what was there); using it with an empty hand takes a piece back. Hitting it breaks it, and it drops
// itself and everything it wore -- except in Creative, where it is simply removed. Taiga villages generate two, one in
// an iron helmet and one in an iron chestplate.
//
// Not modelled: held items in the arms (the wiki's armour stands show none by default), poses, the arms/base variants,
// dyed leather colours, and the vanilla rule that a Survival break needs two quick hits (one hit breaks it here).
import * as THREE from 'three';

export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];

/** Which slot an item goes in, or null when it is not wearable. */
export function armorSlotOf(itemId) {
  if (!itemId) return null;
  if (/_helmet$/.test(itemId) || itemId === 'carved_pumpkin') return 'head';
  if (/_chestplate$/.test(itemId) || itemId === 'elytra') return 'chest';
  if (/_leggings$/.test(itemId)) return 'legs';
  if (/_boots$/.test(itemId)) return 'feet';
  return null;
}

/** A list of item ids (as a structure gives them) as equipment slots. */
export function equipmentFrom(list = []) {
  const slots = { head: null, chest: null, legs: null, feet: null };
  for (const id of list) { const slot = armorSlotOf(id); if (slot && !slots[slot]) slots[slot] = id; }
  return slots;
}

const MATERIAL_COLOUR = { leather: 0x8b5a2b, chainmail: 0x6e6e6e, iron: 0xd8d8d8, golden: 0xf0c94a, diamond: 0x5be0d8, netherite: 0x3b3537, turtle: 0x4fa34a };
const SLOT_SHAPE = {
  head: { size: [0.55, 0.5, 0.55], y: 1.75 },
  chest: { size: [0.55, 0.75, 0.32], y: 1.15 },
  legs: { size: [0.5, 0.6, 0.3], y: 0.55 },
  feet: { size: [0.5, 0.25, 0.32], y: 0.18 }
};

/** The wooden stand: a stone base plate, a pole, shoulders, hips and a neck. */
export function buildArmorStandMesh() {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x9c7a4d });
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
  const part = (w, h, d, y, material, name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.y = y;
    mesh.name = name;
    group.add(mesh);
  };
  part(0.75, 0.0625, 0.75, 0.03, stone, 'base');
  part(0.125, 1.375, 0.125, 0.75, wood, 'pole');
  part(0.75, 0.1875, 0.1875, 1.4, wood, 'shoulders');
  part(0.5, 0.125, 0.125, 0.75, wood, 'hips');
  part(0.125, 0.4375, 0.125, 1.65, wood, 'neck');
  return group;
}

/** Draw what the stand is wearing: one piece per filled slot, coloured by its material. */
export function dressArmorStand(stand) {
  for (const slot of ARMOR_SLOTS) {
    const old = stand.mesh.getObjectByName('armor_' + slot);
    if (old) { stand.mesh.remove(old); old.geometry.dispose(); old.material.dispose(); }
    const id = stand.slots[slot];
    if (!id) continue;
    const material = Object.keys(MATERIAL_COLOUR).find((m) => id.startsWith(m));
    const shape = SLOT_SHAPE[slot];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...shape.size), new THREE.MeshLambertMaterial({ color: MATERIAL_COLOUR[material] ?? 0xcccccc }));
    mesh.position.y = shape.y;
    mesh.name = 'armor_' + slot;
    mesh.userData.item = id;
    stand.mesh.add(mesh);
  }
  stand.equipment = ARMOR_SLOTS.map((slot) => stand.slots[slot]).filter(Boolean);
}

/** A new armour-stand entity record (the mob manager adds it to its list and the scene). */
export function createArmorStand(x, y, z, { equipment = [], yaw = 0 } = {}) {
  const mesh = buildArmorStandMesh();
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  const stand = {
    type: 'armor_stand', name: 'Armor Stand', mesh, health: 1, maxHealth: 1, velocity: new THREE.Vector3(),
    yaw, state: 'idle', timer: 0, hitCooldown: 0, width: 0.5, height: 1.975,
    // An armour stand never moves: the update loop treats a frozen entity as posed.
    frozen: true, persistenceRequired: true,
    slots: equipmentFrom(equipment), equipment: []
  };
  dressArmorStand(stand);
  return stand;
}

/**
 * Use an item on a stand (right click). Armour goes on, swapping with what was in its slot; an empty hand takes the
 * first piece it wears (head first). Returns what happened, or null when the click does nothing.
 *
 * @param {object} inventory  { getActiveItem(), hotbar, activeSlot, addItem(id, isBlock, count) }
 * @param {boolean} creative  in Creative the held piece is not used up
 */
export function useOnArmorStand(stand, inventory, creative = false) {
  const held = inventory.getActiveItem();
  const slot = held && !held.isBlock ? armorSlotOf(held.id) : held?.id === 'carved_pumpkin' ? 'head' : null;
  if (slot) {
    const previous = stand.slots[slot];
    stand.slots[slot] = held.id;
    if (!creative) {
      if (held.count > 1) { held.count--; if (previous) inventory.addItem(previous, false, 1); }
      else inventory.hotbar[inventory.activeSlot] = previous ? { id: previous, isBlock: false, count: 1 } : null;
    }
    dressArmorStand(stand);
    return { action: previous ? 'swapped' : 'equipped', slot, item: held.id, returned: previous };
  }
  if (!held) {
    const taken = ARMOR_SLOTS.find((s) => stand.slots[s]);
    if (!taken) return null;
    const item = stand.slots[taken];
    stand.slots[taken] = null;
    inventory.hotbar[inventory.activeSlot] = { id: item, isBlock: false, count: 1 };
    dressArmorStand(stand);
    return { action: 'taken', slot: taken, item };
  }
  return null;
}

/** What breaking a stand drops: the stand itself and everything it wore (nothing in Creative). */
export function armorStandDrops(stand, creative = false) {
  if (creative) return [];
  return ['armor_stand', ...ARMOR_SLOTS.map((s) => stand.slots[s]).filter(Boolean)];
}

/**
 * Where a stand placed from its item goes: on top of the clicked block's upward face, in the middle of the block,
 * turned to face the player (rounded to 45 degrees). Null when the face is not a top face.
 */
export function armorStandPlacement(target, playerPosition) {
  if (!target || !target.normal || target.normal.y !== 1) return null;
  const x = target.x + 0.5;
  const z = target.z + 0.5;
  const yaw = Math.round(Math.atan2(playerPosition.x - x, playerPosition.z - z) / (Math.PI / 4)) * (Math.PI / 4);
  return { x, y: target.y + 1, z, yaw };
}
