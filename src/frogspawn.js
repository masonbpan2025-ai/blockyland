// Frog breeding, from https://minecraft.wiki/w/Frog#Breeding and https://minecraft.wiki/w/Frogspawn.
//
// Feeding two frogs a slimeball breeds them, but no baby frog appears. One of the pair becomes pregnant, looks for water
// (a water block with air above it) and lays frogspawn on its surface. After 3 to 10 minutes the frogspawn hatches into
// 2 to 5 tadpoles, which grow into frogs after 20 minutes. Before this module a breeding pair produced a baby frog.
import { BLOCKS } from './blocks.js';
import { rollTadpoleHatchCount } from './tadpoleBehavior.js';

export const FROGSPAWN_HATCH_SECONDS = { min: 180, max: 600 };
export const FROG_LAY_RADIUS = 10;
export const FROG_LAY_REACH = 1.6;

/** Make one frog of a breeding pair pregnant. */
export function makeFrogPregnant(frog) {
  frog.isPregnant = true;
  frog.layTarget = null;
}

/** The nearest water block with air above it within `radius`, as the cell the frogspawn would occupy, or null. */
export function findFrogspawnSpot(manager, frog, radius = FROG_LAY_RADIUS) {
  const world = manager.world;
  const px = Math.floor(frog.mesh.position.x), py = Math.floor(frog.mesh.position.y), pz = Math.floor(frog.mesh.position.z);
  let best = null, bestDist = Infinity;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dy = -3; dy <= 3; dy++) {
        const x = px + dx, y = py + dy, z = pz + dz;
        if (world.getVoxel(x, y, z) !== BLOCKS.WATER || world.getVoxel(x, y + 1, z) !== BLOCKS.AIR) continue;
        const d = Math.hypot(dx, dz);
        if (d < bestDist) { bestDist = d; best = { x, y: y + 1, z }; }
      }
    }
  }
  return best;
}

/** Place frogspawn and start its hatching timer. */
export function layFrogspawn(manager, spot, random = Math.random) {
  manager.world.setVoxel(spot.x, spot.y, spot.z, BLOCKS.FROGSPAWN);
  const seconds = FROGSPAWN_HATCH_SECONDS.min + random() * (FROGSPAWN_HATCH_SECONDS.max - FROGSPAWN_HATCH_SECONDS.min);
  (manager.frogspawn ||= []).push({ ...spot, timer: seconds });
}

/**
 * Steer a pregnant frog toward water and lay when it arrives.
 * @returns {{x:number,z:number}|null} the point the frog should head for, or null if it is not pregnant or found none
 */
export function updatePregnantFrog(manager, frog, dt, random = Math.random) {
  if (!frog.isPregnant) return null;
  frog.layTarget ||= findFrogspawnSpot(manager, frog);
  const spot = frog.layTarget;
  if (!spot) return null;
  const dx = spot.x + 0.5 - frog.mesh.position.x, dz = spot.z + 0.5 - frog.mesh.position.z;
  if (Math.hypot(dx, dz) <= FROG_LAY_REACH) {
    // The spot may have been taken since it was chosen.
    if (manager.world.getVoxel(spot.x, spot.y, spot.z) === BLOCKS.AIR) {
      layFrogspawn(manager, spot, random);
      frog.isPregnant = false;
      frog.layTarget = null;
      return null;
    }
    frog.layTarget = null;
    return null;
  }
  return { x: dx, z: dz };
}

/** Tick every frogspawn block: broken ones are forgotten, ripe ones hatch into tadpoles. */
export function updateFrogspawn(manager, dt, random = Math.random) {
  const list = manager.frogspawn;
  if (!list?.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const egg = list[i];
    if (manager.world.getVoxel(egg.x, egg.y, egg.z) !== BLOCKS.FROGSPAWN) { list.splice(i, 1); continue; }
    egg.timer -= dt;
    if (egg.timer > 0) continue;
    manager.world.setVoxel(egg.x, egg.y, egg.z, BLOCKS.AIR);
    list.splice(i, 1);
    const count = rollTadpoleHatchCount(random);
    for (let n = 0; n < count; n++) {
      const tadpole = manager.spawnMob('tadpole', egg.x + 0.5, egg.y - 0.5, egg.z + 0.5);
      if (tadpole) tadpole.growthTimer = undefined; // starts the full 20 minutes
    }
  }
}
