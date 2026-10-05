/**
 * Camel husk rules.
 *
 * Reference: https://minecraft.wiki/w/Camel_Husk
 *
 * The camel husk is the camel's UNDEAD variant. It shares the camel's whole body -- the same 1.7 x 2.375 box,
 * the same sit cycle, the same 1.5-block step -- and differs in four ways that matter: it is undead, it is
 * seven times slower, it does not burn in sunlight, and it arrives RIDDEN by a husk with a parched passenger.
 */

/** Wiki: 32 HP, the same as a living camel. */
export const CAMEL_HUSK_HEALTH = 32;

/** Wiki: standing 1.7 x 2.375, sitting 1.7 x 0.945 -- identical to the camel. */
export const CAMEL_HUSK_DIMENSIONS = { width: 1.7, height: 2.375 };
export const CAMEL_HUSK_SITTING_DIMENSIONS = { width: 1.7, height: 0.945 };

/** Wiki: it stands 2.375 tall and sits at 0.945, so it needs the same headroom to rise. */
export const CAMEL_HUSK_STAND_CLEARANCE = CAMEL_HUSK_DIMENSIONS.height - CAMEL_HUSK_SITTING_DIMENSIONS.height;

/**
 * Wiki: speed 0.09. The camel's own page gives a WALK of 3.885 blocks/s, and this shorter figure is the
 * movement-speed ATTRIBUTE, so the two are not directly comparable -- but the husk is unambiguously the slow
 * one, and this is the number the wiki states for it.
 */
export const CAMEL_HUSK_SPEED = 0.09;
export const CAMEL_HUSK_CAMEL_SPEED = 3.885;

/**
 * Wiki: it is undead, so it shares the undead traits -- and, like the husk, it "does not burn in sunlight".
 */
export const CAMEL_HUSK_UNDEAD_TRAITS = {
  undead: true,
  poisonImmune: true,
  invertedHealing: true,
  canBreatheUnderwater: true,
  sensitiveToSmite: true,
  burnsInDaylight: false
};

/**
 * Wiki: it is passive alone, but "hostile as a jockey, as the two riders control its pathfinding". So the
 * hostility comes from being RIDDEN, and it is passive the moment it is separated.
 */
export const CAMEL_HUSK_JOCKEY = {
  /** Wiki: an iron-spear-wielding husk drives it. */
  driver: 'husk',
  /** Wiki: with a parched as the second passenger. */
  passenger: 'parched',
  seats: 2,
  driverWeapon: 'iron_spear'
};

/** Wiki: it spawns "at night or during thunderstorms in deserts". */
export const CAMEL_HUSK_SPAWN = { biomes: ['desert'], night: true, thunder: true };

/** Wiki: a saddle can be equipped and removed with shears; a lead works only when dismounted. */
export const CAMEL_HUSK_EQUIPMENT = { saddle: 'saddle', remover: 'shears', leashableWhenDismounted: true };

/** Wiki: "These are the drops for the camel husk. Any passengers need to die separately." */
export const CAMEL_HUSK_DROPS = { items: [['rotten_flesh', 2, 3]], xp: [1, 3] };

/** Wiki: it uses the camel's model, so the colours are the camel's with the husk's dry, rotted cast. */
export const CAMEL_HUSK_COLORS = { coat: 0xb9a066, hump: 0x96804f, belly: 0xd8c9a8, hoof: 0x4f4030, eye: 0x2b2118 };

/** True when the mob is a camel husk. */
export function isCamelHusk(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'camel_husk';
}

/** The hitbox for its current pose. */
export function camelHuskDimensions(mob) {
  if (mob?.isSitting) return { ...CAMEL_HUSK_SITTING_DIMENSIONS };
  return { ...CAMEL_HUSK_DIMENSIONS };
}

/** Wiki: it does NOT burn in sunlight, like the husk it is ridden by. */
export function camelHuskBurnsInDaylight() {
  return CAMEL_HUSK_UNDEAD_TRAITS.burnsInDaylight;
}

/**
 * Whether it may stand up.
 *
 * Wiki: the camel refuses to stand when there are solid blocks overhead, because standing would suffocate it.
 * The camel husk shares the body and the two hitboxes, so it shares the rule.
 */
export function camelHuskCanStand(mob, clearance = Infinity) {
  if (!isCamelHusk(mob)) return false;
  if (!mob.isSitting) return false;
  return clearance >= CAMEL_HUSK_STAND_CLEARANCE;
}

/** Sit down. A ridden camel husk cannot sit, and neither can a sitting one. */
export function camelHuskSit(mob) {
  if (!isCamelHusk(mob) || mob.isSitting) return false;
  if ((mob.riderCount ?? 0) > 0) return false;
  mob.isSitting = true;
  const dims = camelHuskDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  return true;
}

/** Stand up, honouring the headroom guard. Returns 'stood', 'blocked' or null. */
export function camelHuskStand(mob, clearance = Infinity) {
  if (!isCamelHusk(mob) || !mob.isSitting) return null;
  if (!camelHuskCanStand(mob, clearance)) return 'blocked';
  mob.isSitting = false;
  const dims = camelHuskDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  return 'stood';
}

/** Advance the sit cycle, sharing the camel's 2-7 second window. */
export function updateCamelHuskSitting(mob, dt, {
  clearance = Infinity, random = Math.random, fleeing = false
} = {}) {
  if (!isCamelHusk(mob)) return null;
  // Wiki: it flees when harmed like any mob, so harm stands it up.
  if (fleeing && mob.isSitting) {
    const result = camelHuskStand(mob, clearance);
    return result === 'stood' ? 'stood' : 'blocked';
  }
  if (mob.isSitting) {
    mob.sitTimer = (mob.sitTimer ?? 0) - dt;
    if (mob.sitTimer > 0) return null;
    const result = camelHuskStand(mob, clearance);
    if (result === 'stood') return 'stood';
    mob.sitTimer = 1;
    return 'blocked';
  }
  mob.standTimer = (mob.standTimer ?? 4 + random() * 6) - dt;
  if (mob.standTimer <= 0) {
    if (camelHuskSit(mob)) {
      mob.sitTimer = 2 + random() * 5;
      return 'sat';
    }
  }
  return null;
}

/**
 * Whether it is hostile.
 *
 * Wiki: "Passive by itself, but hostile as a jockey, as the two riders control its pathfinding." So this is
 * decided by whether it is being ridden, and separation makes it passive again.
 */
export function camelHuskIsHostile(mob) {
  if (!isCamelHusk(mob)) return false;
  return (mob.riderCount ?? 0) > 0;
}

/** Wiki: it is passive once separated from its riders, and can then be saddled and ridden by a player. */
export function separateCamelHuskRiders(mob) {
  if (!isCamelHusk(mob)) return [];
  const removed = [...(mob.riders ?? [])];
  mob.riders = [];
  mob.riderCount = 0;
  mob.tame = true;
  return removed;
}

/**
 * Mount the jockey pair.
 *
 * Wiki: "being ridden and controlled by an iron spear-wielding husk with a parched passenger, known as a camel
 * husk jockey". Two seats, and the wiki says the passengers "need to die separately, and drop items
 * separately", so they are real mobs rather than decoration.
 */
export function mountCamelHuskJockey(manager, mob) {
  if (!isCamelHusk(mob)) return [];
  const spawn = manager?.spawnMob;
  if (typeof spawn !== 'function') return [];
  const riders = [];
  const pos = mob.mesh.position;
  const driver = spawn.call(manager, CAMEL_HUSK_JOCKEY.driver, pos.x, pos.y, pos.z);
  if (driver) {
    driver.rider = mob;
    driver.mount = mob;
    driver.weapon = CAMEL_HUSK_JOCKEY.driverWeapon;
    riders.push(driver);
  }
  const passenger = spawn.call(manager, CAMEL_HUSK_JOCKEY.passenger, pos.x, pos.y, pos.z);
  if (passenger) {
    passenger.rider = mob;
    passenger.mount = mob;
    riders.push(passenger);
  }
  mob.riders = riders;
  mob.riderCount = riders.length;
  mob.isJockey = riders.length > 0;
  return riders;
}

/**
 * Death drops.
 *
 * Wiki: 2-3 rotten flesh, and 1-3 XP with player credit. It "does not" drop its saddle on death -- the saddle
 * is a shear drop -- and the passengers drop their own items separately.
 */
export function camelHuskDrops(mob, random = Math.random) {
  if (!isCamelHusk(mob)) return [];
  // The base table carries the row; this MIRRORS it so a test can cross-check the two.
  return [['rotten_flesh', false, 2, 3]];
}

/** Wiki: 1-3 XP with player credit. */
export function camelHuskXp(mob, random = Math.random) {
  if (!isCamelHusk(mob)) return 0;
  return 1 + Math.floor(random() * 3);
}

/** Whether the saddle can be equipped, and whether shears remove it. */
export function equipCamelHuskSaddle(mob, itemId) {
  if (!isCamelHusk(mob)) return false;
  if (String(itemId ?? '') !== CAMEL_HUSK_EQUIPMENT.saddle) return false;
  if (mob.hasSaddle) return false;
  mob.hasSaddle = true;
  return true;
}

export function shearCamelHuskSaddle(mob, itemId) {
  if (!isCamelHusk(mob)) return false;
  if (String(itemId ?? '') !== CAMEL_HUSK_EQUIPMENT.remover) return false;
  if (!mob.hasSaddle) return false;
  mob.hasSaddle = false;
  return true;
}

/**
 * Build a camel husk model: the camel's shape in the husk's dry, rotted palette.
 *
 * The geometry is deliberately the camel's, because the wiki gives the same hitbox and calls it a variant.
 * Only `createCamelModel`'s materials differ, so the caller supplies husk colours.
 */
export function createCamelHuskModel(coatMat, humpMat, bellyMat, hoofMat, eyeMat, createCamelModel) {
  // Delegated rather than duplicated: one camel body, two palettes.
  return createCamelModel(coatMat, humpMat, bellyMat, hoofMat, eyeMat);
}

/** Pose the camel husk: the camel's pose, with the undead head droop. */
export function poseCamelHusk(mob, phase = 0, poseCamel = null) {
  if (!isCamelHusk(mob) || !mob.mesh) return;
  if (typeof poseCamel === 'function') poseCamel(mob, phase);
  // The husk's head hangs lower, which is the only silhouette difference the wiki's renders show.
  if (mob.head) mob.head.rotation.x = (mob.head.rotation.x ?? 0) + 0.12;
}
