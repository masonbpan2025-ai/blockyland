// Baby zombies, chicken jockeys and the two music discs mobs drop, from the wiki (Java Edition). Found by the
// round-4 test sweep: three discs had no source, and the "Lava Chicken" one needs a chicken jockey, which needs a
// baby zombie -- and neither existed (only husks took a baby option).
//
// Chicken Jockey: "each type of zombie has a 5% chance of spawning as a baby"; "Each baby zombie ... that spawns
// naturally has a 5% chance to check for an existing chicken within an approximately 10x6x10 ... box centered on
// the baby's spawn location and spawn riding one of those chickens if there are any. If it fails that 5% chance,
// there is an additional 5% chance of the baby spawning mounted on a new adult chicken"; "Chickens that are mounted
// by zombies ... cannot lay eggs, and drop 10 experience instead of the usual 1-3."
// Music Disc Lava Chicken: "dropped by baby zombies currently riding a chicken ... when killed by a player or a
// tamed wolf ... If the chicken is killed first, the zombie previously riding said chicken does not drop the disc".
// Music Disc Tears: "dropped by ghasts when killed by a player-deflected fireball."

export const BABY_ZOMBIE_CHANCE = 0.05;
export const JOCKEY_EXISTING_CHANCE = 0.05;
export const JOCKEY_NEW_CHANCE = 0.05;
export const JOCKEY_SEARCH_BOX = Object.freeze({ x: 10, y: 6, z: 10 });
export const JOCKEY_CHICKEN_XP = 10;

/** Does a natural zombie spawn as a baby? */
export const rollsBaby = (random = Math.random) => random() < BABY_ZOMBIE_CHANCE;

/** For a natural baby: 'existing' (ride a nearby chicken), 'new' (spawn on a new one) or null. */
export function jockeyRoll(hasChickenNearby, random = Math.random) {
  if (random() < JOCKEY_EXISTING_CHANCE && hasChickenNearby) return 'existing';
  if (random() < JOCKEY_NEW_CHANCE) return 'new';
  return null;
}

/** Is `chicken` inside the search box around `pos`? */
export function inJockeyBox(pos, chicken) {
  const p = chicken?.mesh?.position;
  return Boolean(p) && Math.abs(p.x - pos.x) <= JOCKEY_SEARCH_BOX.x / 2 && Math.abs(p.y - pos.y) <= JOCKEY_SEARCH_BOX.y / 2
    && Math.abs(p.z - pos.z) <= JOCKEY_SEARCH_BOX.z / 2;
}

/** Make a zombie a baby: half size, faster (a baby zombie moves at 0.35 to an adult's 0.23). */
export function makeBabyZombie(mob) {
  mob.isBaby = true;
  if (mob.width) mob.width /= 2;
  if (mob.height) mob.height /= 2;
  if (mob.speed) mob.speed *= 0.35 / 0.23;
  mob.mesh?.scale?.setScalar?.(0.5);
  return mob;
}

/** Seat a baby zombie on a chicken. */
export function mountChicken(zombie, chicken) {
  zombie.vehicle = chicken;
  chicken.rider = zombie;
  chicken.isJockey = true; // no eggs (animalBehaviors checks it), 10 experience
  return zombie;
}

/** The chicken died first: the rider gets off, and will not drop the disc. */
export function dismountIfChickenDead(zombie) {
  if (zombie.vehicle?.type === 'chicken' && zombie.vehicle.health <= 0) {
    zombie.vehicle.rider = null;
    zombie.vehicle = null;
  }
}

/** The Lava Chicken disc, for a baby zombie killed while riding a chicken by a player or a tamed wolf. */
export function lavaChickenDrop(mob) {
  const riding = mob.vehicle?.type === 'chicken' && mob.vehicle.health > 0;
  return riding && mob.isBaby && (mob.playerDamaged || mob.wolfKilled) ? [['music_disc_lava_chicken', false, 1, 1]] : [];
}

/** The Tears disc, for a ghast a deflected fireball killed. */
export function tearsDrop(mob) {
  return mob.type === 'ghast' && mob.killedByDeflectedFireball ? [['music_disc_tears', false, 1, 1]] : [];
}

/**
 * After a natural zombie spawn: maybe a baby, and a baby maybe a jockey. `spawnChicken(x, y, z)` makes a new
 * chicken; `chickens` are the ones already in the world.
 */
export function applyNaturalZombieSpawn(mob, { chickens = [], spawnChicken = null, random = Math.random } = {}) {
  if (!mob || !rollsBaby(random)) return mob;
  makeBabyZombie(mob);
  const pos = mob.mesh?.position;
  if (!pos) return mob;
  const near = chickens.filter((c) => c.type === 'chicken' && c.health > 0 && !c.rider && !c.isBaby && inJockeyBox(pos, c));
  const roll = jockeyRoll(near.length > 0, random);
  if (roll === 'existing') mountChicken(mob, near[Math.floor(random() * near.length)]);
  else if (roll === 'new' && spawnChicken) { const c = spawnChicken(pos.x, pos.y, pos.z); if (c) mountChicken(mob, c); }
  return mob;
}
