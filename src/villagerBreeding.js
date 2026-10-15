// Villager breeding.
//
// Wiki (Villager, "Breeding"): villagers pick up bread, carrots, potatoes and beetroots; a villager with enough food --
// 12 food points: "3 bread, 12 carrots, 12 potatoes or 12 beetroots" -- is willing; two willing adults next to each
// other breed if there is a bed nearby that no villager has claimed; each parent uses up its food and cannot breed again
// for 5 minutes, and the baby grows up in 20 minutes. Found by the wiki-tutorial play-test (Creating a village: "Repeat
// this process every 5 minutes for efficient breeding"): villagers had no breeding at all.
import * as THREE from 'three';

export const VILLAGER_FOOD = { bread: 4, carrot: 1, potato: 1, beetroot: 1 };
export const WILLING_FOOD = 12;
export const BREED_COOLDOWN = 300;
export const BABY_GROWTH = 1200;
const BED_RANGE = 48;

const isBedFoot = (bed) => !!bed?.footPos;

/** Beds within range of a point, and villagers within the same range (each claims one bed). */
export function freeBedsNear(manager, pos) {
  const beds = [...(manager.game?.bedManager?.beds?.values?.() ?? [])].filter(isBedFoot);
  const unique = new Set();
  for (const b of beds) {
    const [x, y, z] = b.footPos;
    if (Math.hypot(x + 0.5 - pos.x, y - pos.y, z + 0.5 - pos.z) <= BED_RANGE) unique.add(`${x},${y},${z}`);
  }
  const villagers = (manager.mobs ?? []).filter((m) => m.type === 'villager' && m.health > 0 && m.mesh.position.distanceTo(pos) <= BED_RANGE).length;
  return unique.size - villagers;
}

/** One villager's breeding step: pick up food, become willing, find a partner. */
export function updateVillagerBreeding(manager, mob, dt) {
  if (mob.type !== 'villager' || mob.health <= 0) return;
  mob.breedCooldown = Math.max(0, (mob.breedCooldown ?? 0) - dt);
  if (mob.isBaby) {
    mob.growUpTimer = (mob.growUpTimer ?? BABY_GROWTH) - dt;
    if (mob.growUpTimer <= 0) { mob.isBaby = false; mob.mesh?.scale?.setScalar?.(1); }
    return;
  }
  // Pick up food lying within reach.
  const drops = manager.entities?.droppedItems ?? [];
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    const value = VILLAGER_FOOD[d.itemType];
    if (!value || d.age < (d.pickupDelay ?? 1) || d.group.position.distanceTo(mob.mesh.position) > 1.6) continue;
    if ((mob.foodPoints ?? 0) >= 64) break;
    mob.foodPoints = (mob.foodPoints ?? 0) + value * d.count;
    manager.entities.itemVisuals?.release?.(d.group) ?? d.group.removeFromParent?.();
    drops.splice(i, 1);
  }
  mob.willing = mob.breedCooldown <= 0 && (mob.foodPoints ?? 0) >= WILLING_FOOD;
  if (!mob.willing) return;
  const partner = (manager.mobs ?? []).find((m) => m !== mob && m.type === 'villager' && m.willing && !m.isBaby && m.health > 0 && m.mesh.position.distanceTo(mob.mesh.position) < 8);
  if (!partner) return;
  if (freeBedsNear(manager, mob.mesh.position) <= 0) return;
  const at = mob.mesh.position.clone().lerp(partner.mesh.position, 0.5);
  const baby = manager.spawnVillager?.(at.x, at.y, at.z);
  if (baby) {
    baby.isBaby = true; baby.growUpTimer = BABY_GROWTH; baby.mesh?.scale?.setScalar?.(0.5);
  }
  for (const parent of [mob, partner]) { parent.foodPoints -= WILLING_FOOD; parent.willing = false; parent.breedCooldown = BREED_COOLDOWN; }
  manager.spawnHeartParticles?.(at.clone().add(new THREE.Vector3(0, 1.5, 0)));
}
