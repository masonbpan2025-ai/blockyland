import * as THREE from 'three';

/**
 * Polar bear rules.
 *
 * Reference: https://minecraft.wiki/w/Polar_Bear
 *
 * The polar bear is unusual among neutral mobs: its stance depends on who is nearby. A baby is
 * passive, an adult is neutral, and an adult turns **hostile to protect any cub near it** — including
 * a cub that is not its own. It is also one of the few mobs that cannot be bred at all.
 */

/** Wiki: 30 HP. */
export const POLAR_BEAR_HEALTH = 30;

/** Wiki: adult 1.4 x 1.4; baby 0.7 x 0.7. */
export const POLAR_BEAR_DIMENSIONS = { width: 1.4, height: 1.4 };
export const POLAR_BEAR_BABY_DIMENSIONS = { width: 0.7, height: 0.7 };
export const POLAR_BEAR_BABY_SCALE = 0.5;

/** Wiki: 4 on Easy, 6 on Normal, 9 on Hard. */
export const POLAR_BEAR_DAMAGE = { peaceful: 0, easy: 4, normal: 6, hard: 9 };

/** Wiki: 60% knockback resistance. */
export const POLAR_BEAR_KNOCKBACK_RESISTANCE = 0.6;

/** Wiki: 0.25 movement speed, and its swim speed equals the player's. */
export const POLAR_BEAR_SPEED = { land: 1.4, water: 4.3 };

/**
 * Wiki: "If a baby polar bear is attacked, unless killed in one hit, all adults within a 41x21x41
 * area become hostile toward the player or mob, regardless of difficulty."
 */
export const POLAR_BEAR_CUB_DEFENCE = { halfX: 20, halfY: 10, halfZ: 20 };

/**
 * Wiki: "attacking an adult who is within a 16x8x16 area of a cub also provokes other adults within
 * a 21x21x21 area of the attacked adult."
 */
export const POLAR_BEAR_ADULT_PROVOKE = {
  cubHalfX: 8, cubHalfY: 4, cubHalfZ: 8,
  halfX: 10, halfY: 10, halfZ: 10
};

/** Wiki: adults "attack foxes" as well as players. */
export const POLAR_BEAR_PREY = ['fox'];

/** Wiki: immune to freezing damage from powder snow. */
export const POLAR_BEAR_FREEZE_IMMUNE = true;

/** Wiki: a baby matures after 24000 ticks (20 minutes), and its growth cannot be sped up. */
export const POLAR_BEAR_GROWTH_SECONDS = 1200;

/** Body colours. */
export const POLAR_BEAR_COLORS = { body: 0xf8fafc, dark: 0x0f172a };

/** True when the mob is a polar bear. */
export function isPolarBear(mob) {
  return mob?.type === 'polar_bear';
}

/** Melee damage at the given difficulty. */
export function polarBearDamageFor(difficulty) {
  const key = Object.hasOwn(POLAR_BEAR_DAMAGE, difficulty ?? '') ? difficulty : 'normal';
  return POLAR_BEAR_DAMAGE[key];
}

/** The hitbox for a polar bear, which halves for a cub. */
export function polarBearDimensions(mob) {
  return mob?.isBaby ? { ...POLAR_BEAR_BABY_DIMENSIONS } : { ...POLAR_BEAR_DIMENSIONS };
}

/**
 * A polar bear's stance.
 *
 * Wiki: "Baby polar bears are passive, and adults are neutral; becoming hostile when a player either
 * directly attacks it or when the player comes close to or attacks any baby polar bears near it."
 *
 * Returns 'passive', 'neutral' or 'hostile'.
 */
export function polarBearStance(mob, { difficulty = 'normal', provoked = false, cubThreatened = false } = {}) {
  if (!isPolarBear(mob)) return null;
  if (mob.isBaby) return 'passive';
  if (difficulty === 'peaceful') return 'passive';
  if (provoked || cubThreatened || mob.isHostile) return 'hostile';
  return 'neutral';
}

/** True when two positions are within a box of the given half-extents. */
function withinBox(a, b, halfX, halfY, halfZ) {
  return Math.abs(a.x - b.x) <= halfX
    && Math.abs(a.y - b.y) <= halfY
    && Math.abs(a.z - b.z) <= halfZ;
}

/**
 * The cubs near a polar bear.
 *
 * Used for both defence rules, and deliberately not limited to the bear's own cub: the wiki says
 * "any baby polar bears near it", and cubs are not tracked by parentage.
 */
export function cubsNear(manager, bear, { halfX = 16, halfY = 8, halfZ = 16 } = {}) {
  if (!isPolarBear(bear) || !manager?.mobs) return [];
  const found = [];
  for (const other of manager.mobs) {
    if (other === bear || !isPolarBear(other) || !other.isBaby || other.health <= 0) continue;
    if (withinBox(bear.mesh.position, other.mesh.position, halfX, halfY, halfZ)) found.push(other);
  }
  return found;
}

/**
 * Make the adults near a threatened cub hostile.
 *
 * Wiki: all adults within a 41x21x41 area become hostile when a cub is attacked, "unless killed in one
 * hit" — which is the `lethal` flag.
 *
 * Returns the bears that responded.
 */
export function defendCub(manager, cub, attacker = null, { lethal = false, difficulty = 'normal' } = {}) {
  const angered = [];
  if (!isPolarBear(cub) || !cub.isBaby || !manager?.mobs) return angered;
  // Wiki: a one-hit kill on the cub does not call for help.
  if (lethal) return angered;
  const { halfX, halfY, halfZ } = POLAR_BEAR_CUB_DEFENCE;
  for (const other of manager.mobs) {
    if (!isPolarBear(other) || other.isBaby || other.health <= 0) continue;
    if (!withinBox(cub.mesh.position, other.mesh.position, halfX, halfY, halfZ)) continue;
    other.isHostile = true;
    other.angryAt = attacker ?? null;
    // Wiki: even on Peaceful the adults turn, though their attacks then do nothing.
    other.stance = polarBearStance(other, { difficulty, cubThreatened: true });
    angered.push(other);
  }
  return angered;
}

/**
 * Make the adults near an attacked adult hostile.
 *
 * Wiki: "attacking an adult who is within a 16x8x16 area of a cub also provokes other adults within a
 * 21x21x21 area of the attacked adult."
 */
export function provokeNearbyAdults(manager, bear, attacker = null, { lethal = false } = {}) {
  const angered = [];
  if (!isPolarBear(bear) || bear.isBaby || !manager?.mobs || lethal) return angered;
  // Only when the attacked adult is itself near a cub.
  if (!cubsNear(manager, bear, {
    halfX: POLAR_BEAR_ADULT_PROVOKE.cubHalfX,
    halfY: POLAR_BEAR_ADULT_PROVOKE.cubHalfY,
    halfZ: POLAR_BEAR_ADULT_PROVOKE.cubHalfZ
  }).length) return angered;

  const { halfX, halfY, halfZ } = POLAR_BEAR_ADULT_PROVOKE;
  for (const other of manager.mobs) {
    if (other === bear || !isPolarBear(other) || other.isBaby || other.health <= 0) continue;
    if (!withinBox(bear.mesh.position, other.mesh.position, halfX, halfY, halfZ)) continue;
    other.isHostile = true;
    other.angryAt = attacker ?? null;
    angered.push(other);
  }
  return angered;
}

/**
 * Handle a polar bear being hurt.
 *
 * Dispatches to the two provocation rules: a cub that survives calls every adult nearby, and an adult
 * near a cub calls the adults around it. Returns a summary.
 */
export function onPolarBearHurt(manager, bear, attacker = null, { lethal = false, difficulty = 'normal' } = {}) {
  if (!isPolarBear(bear)) return { self: false, others: [] };
  const result = { self: false, others: [] };
  // A cub is passive and stays passive: the wiki is explicit that "baby polar bears are passive", so
  // being hit makes the adults around it hostile, not the cub itself. Setting `isHostile` on a cub
  // would have made it charge whoever hit it, which the wiki never describes.
  if (!lethal && !bear.isBaby) {
    bear.isHostile = true;
    bear.angryAt = attacker ?? null;
    result.self = true;
  }
  if (bear.isBaby) {
    // The cub still records who hurt it, which is what the death message and loot credit use.
    bear.angryAt = attacker ?? null;
    result.others = defendCub(manager, bear, attacker, { lethal, difficulty });
  } else {
    result.others = provokeNearbyAdults(manager, bear, attacker, { lethal });
  }
  return result;
}

/**
 * Whether a polar bear should chase and maul a target.
 *
 * Wiki: it attacks by rearing on its back legs and mauling down, and adults also attack foxes.
 * Returns the target, or null.
 */
export function findPolarBearTarget(manager, bear, player, { difficulty = 'normal' } = {}) {
  if (!isPolarBear(bear)) return null;
  const stance = polarBearStance(bear, { difficulty, provoked: bear.isHostile });
  if (stance !== 'hostile') return null;

  let best = null;
  let bestDist = 16;
  if (player?.position) {
    const d = bear.mesh.position.distanceTo(player.position);
    if (d < bestDist) { bestDist = d; best = player; }
  }
  for (const other of manager?.mobs ?? []) {
    if (other === bear || other.health <= 0) continue;
    if (!POLAR_BEAR_PREY.includes(other.type)) continue;
    const d = bear.mesh.position.distanceTo(other.mesh.position);
    if (d < bestDist) { bestDist = d; best = other; }
  }
  return best;
}

/**
 * Advance a polar bear's growth.
 *
 * Wiki: a baby matures after 24000 ticks (20 minutes) and "their growth cannot be sped up", so there
 * is deliberately no feeding acceleration here — only the golden dandelion stop.
 *
 * Returns true on the step it matures.
 */
export function updatePolarBearGrowth(mob, dt) {
  if (!isPolarBear(mob) || !mob.isBaby) return false;
  if (mob.ageLocked) return false;
  mob.growthTimer = (mob.growthTimer ?? POLAR_BEAR_GROWTH_SECONDS) - dt;
  if (mob.growthTimer > 0) return false;
  mob.isBaby = false;
  mob.growthTimer = 0;
  const dims = polarBearDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  mob.mesh?.scale?.set?.(1, 1, 1);
  return true;
}

/**
 * The number of fish a bear drops.
 *
 * The wiki's table gives a quantity of 0-2 with a `multiplychance` of 3/4 for cod and 1/4 for
 * salmon. That chance applies **per item**, so a capacity of two is rolled twice at 3/4 (or 1/4) to
 * decide how many actually drop. Reading it as a flat uniform 0-2 would be wrong: it would make one
 * and two equally likely instead of making two the most likely outcome.
 */
export function rollPolarBearFishCount(chance, random = Math.random) {
  let count = 0;
  for (let i = 0; i < 2; i++) {
    if (random() < chance) count++;
  }
  return count;
}

/**
 * The death loot.
 *
 * Wiki: Java picks *one* of cod or salmon, 3/4 and 1/4 respectively, 0-2 of it, and it is cooked if
 * the bear was on fire when it died. Looting adds 0-1 more of the same fish. A baby drops nothing.
 */
export function polarBearDrops(mob, random = Math.random) {
  if (!isPolarBear(mob) || mob.isBaby) return [];
  // Wiki: one of the two is selected, not both.
  const isCod = random() < 0.75;
  const fish = isCod ? 'cod' : 'salmon';
  const id = mob.onFire ? `cooked_${fish}` : fish;
  let total = rollPolarBearFishCount(isCod ? 0.75 : 0.25, random);
  // Looting adds 0-1 per drop, so it is another pass over the same capacity.
  const looting = Math.max(0, Math.floor(mob.lootingLevel ?? 0));
  for (let i = 0; i < looting; i++) {
    if (random() < (isCod ? 0.75 : 0.25)) total++;
  }
  if (total <= 0) return [];
  return [[id, false, total, total]];
}

/** Wiki: 1-3 XP with credit, and none for a baby. */
export function polarBearXp(mob) {
  if (!isPolarBear(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/**
 * Polar bears cannot be bred.
 *
 * Wiki: "Unlike most animal mobs, polar bears cannot breed", and cubs only appear from natural
 * spawning. Exported so the exclusion is explicit and testable rather than an omission.
 */
export function canBreedPolarBear() {
  return false;
}

/** Wiki: a polar bear rears on its back legs to maul. */
export function posePolarBear(bear, phase = 0) {
  if (!bear) return;
  const rearing = !!bear.isMauling;
  if (bear.mesh) bear.mesh.rotation.x = rearing ? -0.45 : 0;
  if (bear.legs) {
    bear.legs.forEach((leg, index) => {
      if (!leg?.rotation) return;
      leg.rotation.x = rearing ? -0.7 : Math.sin(phase + index * 0.4) * 0.35;
    });
  }
}

/** The rearing maul, which is what the wiki describes and what makes the attack readable. */
export function startPolarBearMaul(bear) {
  if (!isPolarBear(bear)) return false;
  bear.isMauling = true;
  bear.maulTimer = 0.5;
  return true;
}

/** Advance the maul animation, and land the blow when it comes down. */
export function updatePolarBearMaul(manager, bear, target, dt) {
  if (!isPolarBear(bear) || !bear.isMauling) return null;
  bear.maulTimer -= dt;
  if (bear.maulTimer > 0) return 'rearing';
  bear.isMauling = false;
  bear.maulTimer = 0;
  if (target) {
    const damage = polarBearDamageFor(manager?.game?.difficulty ?? 'normal');
    if (damage > 0) target.takeDamage?.(damage, bear.mesh.position, 'polar_bear');
  }
  return 'mauled';
}

/** Re-export the colour palette for the spawner. */
export function polarBearColors() {
  return POLAR_BEAR_COLORS;
}

/** A small helper so the spawner can build the same 4-leg list the animation expects. */
export function legRotations(legs) {
  return legs.map(leg => leg?.rotation ?? new THREE.Euler());
}
