/**
 * Mooshroom variant rules, shared by the model, the interaction handlers and the weather
 * lightning hook.
 *
 * Mooshrooms are a cow variant with two colours, a shearing conversion into a plain cow
 * and a lightning-driven colour swap. Putting the rules here keeps the model, the
 * interaction code and the weather hook reading from one definition.
 *
 * Reference: https://minecraft.wiki/w/Mooshroom
 */
import { babyGrowthSecondsFor } from './babyGrowth.js';

/** The two variants. Only red spawns naturally; brown comes from lightning. */
export const MOOSHROOM_VARIANTS = ['red', 'brown'];

/** Body colour per variant. */
export const MOOSHROOM_COLORS = {
  red: 0xdc2626,
  brown: 0x8b5a2b
};

/**
 * The mushroom block a variant is covered in, which is also what shearing drops.
 *
 * Wiki: shearing "drops 5 corresponding mushrooms" — brown mooshrooms are covered in
 * brown mushrooms, red in red ones.
 */
export const MOOSHROOM_MUSHROOM_BLOCK = {
  red: 'RED_MUSHROOM',
  brown: 'BROWN_MUSHROOM'
};

/** Wiki: shearing yields exactly five mushrooms and does not grow back. */
export const MOOSHROOM_SHEAR_DROPS = 5;

/**
 * Small flowers a brown mooshroom can be fed, and the suspicious stew effect each
 * produces. Reference: https://minecraft.wiki/w/Suspicious_Stew
 *
 * The wiki lists these durations in seconds at the default difficulty; they are stored as
 * data so the effect can be applied by whatever status-effect system is in use rather
 * than baking potion numbers into the interaction handler.
 */
export const STEW_EFFECTS = {
  allium: { effect: 'fire_resistance', seconds: 4 },
  azure_bluet: { effect: 'blindness', seconds: 8 },
  blue_orchid: { effect: 'saturation', seconds: 0.35 },
  cornflower: { effect: 'jump_boost', seconds: 6 },
  dandelion: { effect: 'saturation', seconds: 0.35 },
  lily_of_the_valley: { effect: 'poison', seconds: 12 },
  oxeye_daisy: { effect: 'regeneration', seconds: 8 },
  poppy: { effect: 'night_vision', seconds: 5 },
  tulip: { effect: 'weakness', seconds: 9 },
  // The coloured tulips share the weakness effect of the plain tulip.
  orange_tulip: { effect: 'weakness', seconds: 9 },
  pink_tulip: { effect: 'weakness', seconds: 9 },
  red_tulip: { effect: 'weakness', seconds: 9 },
  white_tulip: { effect: 'weakness', seconds: 9 }
};

/** True when the item is one of the small flowers a brown mooshroom accepts. */
export function isSmallFlower(itemId) {
  return !!itemId && Object.hasOwn(STEW_EFFECTS, itemId);
}

/** The other variant, i.e. the result of a lightning strike. */
export function otherMooshroomVariant(variant) {
  return variant === 'brown' ? 'red' : 'brown';
}

/** True when the mob is a mooshroom of the brown variant. */
export function isBrownMooshroom(mob) {
  return mob?.type === 'mooshroom' && mob.variant === 'brown';
}

/** True when the mob is any mooshroom. */
export function isMooshroom(mob) {
  return mob?.type === 'mooshroom';
}

/**
 * Apply a variant's appearance to a mooshroom's meshes.
 *
 * Wiki: "Baby mooshrooms do not have mushrooms on their backs; they appear once the baby
 * grows to an adult." The shared baby-growth path clears `isBaby`, so this is re-applied
 * from the growth handler as well as at spawn.
 */
export function applyMooshroomVariant(mob) {
  if (!isMooshroom(mob)) return;
  const body = MOOSHROOM_COLORS[mob.variant] ?? MOOSHROOM_COLORS.red;
  for (const mesh of mob.variantMeshes || []) {
    mesh?.material?.color?.setHex(body);
  }
  const showMushrooms = !mob.isBaby;
  for (const mesh of mob.mushroomMeshes || []) {
    if (mesh) mesh.visible = showMushrooms;
  }
}

/**
 * Convert a mooshroom into the other variant, as a lightning strike does.
 *
 * Wiki: "A lightning strike within 4 blocks of a mooshroom switches its color, from red
 * to brown and vice versa. Mooshrooms do not take damage from lightning during this
 * transformation", so this deliberately touches nothing but the variant.
 */
export function convertMooshroomVariant(mob, manager = null) {
  if (!isMooshroom(mob)) return null;
  mob.variant = otherMooshroomVariant(mob.variant);
  mob.mushroomType = mob.variant;
  applyMooshroomVariant(mob);
  if (manager?.spawnParticleBurst) {
    manager.spawnParticleBurst(mob.mesh.position.clone(), MOOSHROOM_COLORS[mob.variant], 10);
  }
  return mob.variant;
}

/**
 * Lightning conversion for every mooshroom near a strike.
 *
 * Mirrors `convertLightningPigs`: a strike affects mobs within 4 blocks horizontally and
 * a small vertical band, matching the wiki's "within 4 blocks".
 */
export function convertLightningMooshrooms(manager, strike) {
  const converted = [];
  if (!manager?.mobs || !strike) return converted;
  for (const mob of [...manager.mobs]) {
    if (!isMooshroom(mob) || mob.health <= 0) continue;
    const p = mob.mesh.position;
    if (Math.abs(p.x - strike.x) > 4 || Math.abs(p.z - strike.z) > 4) continue;
    if (p.y < strike.y - 8 || p.y > strike.y + 4) continue;
    const variant = convertMooshroomVariant(mob, manager);
    if (variant) converted.push({ mob, variant });
  }
  return converted;
}

/**
 * Replace a mooshroom with a plain cow in place, as shearing does.
 *
 * Wiki: "Shearing a mooshroom drops 5 corresponding mushrooms and turns the mooshroom
 * into a temperate cow, emitting a smaller version of the explosion particle. The
 * mushrooms do not grow back."
 *
 * The replacement is a real cow via `spawnCow`, so it inherits cow dimensions, cow loot
 * and cow breeding, rather than a mooshroom with a hidden model. Identity that a player
 * can observe is carried across: custom name, persistence, position, facing, health and
 * baby state.
 */
export function convertMooshroomToCow(manager, mob) {
  if (!manager || !isMooshroom(mob)) return null;
  const p = mob.mesh.position;
  const cow = manager.spawnCow(p.x, p.y, p.z);
  if (!cow) return null;

  cow.name = mob.name;
  cow.persistent = mob.persistent;
  cow.yaw = mob.yaw;
  cow.mesh.rotation.copy(mob.mesh.rotation);
  cow.health = Math.min(mob.health, cow.maxHealth);
  cow.velocity.copy(mob.velocity);
  if (mob.isBaby) {
    cow.isBaby = true;
    // Preserve the remaining growth time, falling back to the wiki's 20 minutes rather than
    // the 120 seconds ordinary animals used to get.
    cow.babyGrowthTimer = mob.babyGrowthTimer ?? babyGrowthSecondsFor('cow');
    cow.mesh.scale.copy(mob.mesh.scale);
    if (cow.head) cow.head.scale.copy(mob.head?.scale ?? cow.head.scale);
  }
  // The mushrooms are gone for good, so the cow replaces the mooshroom outright.
  manager.removeDebugLabel?.(mob);
  mob.mesh.removeFromParent();
  const index = manager.mobs.indexOf(mob);
  if (index >= 0) manager.mobs.splice(index, 1);
  return cow;
}
