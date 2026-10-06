import * as THREE from 'three';

/**
 * Apply vanilla's box UV layout to a BoxGeometry's six faces, in ATLAS PIXELS from the top-left.
 */
function applyBoxUVs(geo, u, v, texW, texH, tw, th, td) {
  const faces = [
    { x: u + td + tw, y: v + td, w: td, h: th },
    { x: u, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw + td, y: v + td, w: tw, h: th }
  ];
  const uvs = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = faces[f];
    const u0 = r.x / texW, u1 = (r.x + r.w) / texW;
    const v1 = 1 - r.y / texH, v0 = 1 - (r.y + r.h) / texH;
    const b = f * 4;
    uvs.setXY(b + 0, u0, v1); uvs.setXY(b + 1, u1, v1);
    uvs.setXY(b + 2, u0, v0); uvs.setXY(b + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}

/**
 * Giant rules.
 *
 * Reference: https://minecraft.wiki/w/Giant
 *
 * The giant is the strangest mob to implement here, because its defining property is an ABSENCE: "Giants
 * currently have no AI. The consequence of this is that they always face south when summoned, and they always
 * stay that way, never wandering. They cannot turn their head, chase the player, or respond to damage."
 *
 * So the correct implementation is mostly things it must NOT do, and the tests are mostly negative.
 */

/** Wiki: 100 HP. */
export const GIANT_HEALTH = 100;

/** Wiki: 3.6 wide x 12 tall -- a six-times-enlarged zombie. */
export const GIANT_DIMENSIONS = { width: 3.6, height: 12 };

/** The zombie's box, for the six-times relationship. */
export const ZOMBIE_DIMENSIONS = { width: 0.6, height: 1.95 };
export const GIANT_SCALE = 6;

/** Wiki: Easy 26, Normal 50, Hard 75. */
export const GIANT_DAMAGE = { peaceful: 0, easy: 26, normal: 50, hard: 75 };

/**
 * Wiki: "Giants are not undead mobs." That single sentence drives six separate differences from the zombie it
 * is modelled on, so it is a table rather than one flag.
 */
export const GIANT_UNDEAD_PROPERTIES = {
  undead: false,
  burnsInDaylight: false,
  harmedByHealing: false,
  healedByHarming: false,
  harmedBySmite: false,
  attackedByWither: true,
  affectedByRegeneration: true,
  affectedByPoison: true,
  scaresArmadillos: false,
  convertsToDrowned: false
};

/**
 * Wiki: "Giants do not convert into drowned when submerged in water; instead, they slowly suffocate and die."
 * Most undead convert; the giant drowns like an ordinary mob.
 */
export const GIANT_DROWNING = { converts: false, suffocates: true };

/**
 * Wiki: it "always face[s] south when summoned, and they always stay that way". In this codebase the model
 * faces +z at yaw 0 and a positive yaw turns toward -x. South is +z, which is yaw 0.
 */
export const GIANT_FACING_YAW = 0;

/** Wiki: "Giants currently have no AI." */
export const GIANT_HAS_AI = false;

/**
 * Body colours: the zombie palette, since the wiki describes it as a six-times-enlarged zombie model.
 */
export const GIANT_COLORS = { skin: 0x4f7a3f, shirt: 0x3a5a8c, trousers: 0x2c3e6b, eye: 0x101010 };

/** True when the mob is a giant. */
export function isGiant(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'giant';
}

/** Wiki: 3.6 x 12. */
export function giantDimensions() {
  return { ...GIANT_DIMENSIONS };
}

/** Melee damage by difficulty. */
export function giantDamageFor(difficulty = 'normal') {
  return GIANT_DAMAGE[difficulty] ?? GIANT_DAMAGE.normal;
}

/**
 * Whether the giant burns in daylight.
 *
 * Wiki: "Because giants are not actually undead, they do not burn in sunlight." The zombie it is modelled on
 * does, which is why this is its own function rather than inherited.
 */
export function giantBurnsInDaylight() {
  return GIANT_UNDEAD_PROPERTIES.burnsInDaylight;
}

/**
 * Whether it should turn to face a target.
 *
 * Wiki: "They cannot turn their head, chase the player, or respond to damage." So this always reports the
 * fixed southward facing -- it is a deliberate constant, not a missing feature.
 */
export function giantFacing() {
  return GIANT_FACING_YAW;
}

/**
 * Whether the giant moves.
 *
 * Wiki: "they always stay that way, never wandering". Returns whether a wanted position is actually reached,
 * which is never.
 */
export function giantMoves() {
  return false;
}

/**
 * The giant's response to being damaged.
 *
 * Wiki: "or respond to damage". So it does not flee, does not retaliate, and does not change state -- but the
 * damage still applies, which is the difference between "no reaction" and "invulnerable".
 */
export function giantReactionToDamage() {
  return null;
}

/**
 * Whether a status effect applies.
 *
 * Wiki: it is "affected by Regeneration and Poison" but "immune to Smite" and neither harmed by Healing nor
 * healed by Harming. Those are the four the wiki names, so the answer is a lookup rather than a default.
 */
export function giantAcceptsEffect(effect) {
  const name = String(effect ?? '').toLowerCase();
  if (name === 'regeneration' || name === 'poison') return true;
  // Smite is an enchantment rather than an effect, but the wiki groups it with these, so it is accepted here
  // as a query and answered false.
  if (name === 'smite') return false;
  return true;
}

/** Whether a potion of this kind helps or hurts. */
export function giantPotionOutcome(kind) {
  const name = String(kind ?? '').toLowerCase();
  if (name === 'healing' || name === 'harming') {
    // Wiki: "damaged by potions of Harming and healed by potions of Healing" -- the OPPOSITE of undead.
    return name === 'healing' ? 'heal' : 'damage';
  }
  return 'none';
}

/**
 * Whether the giant scares an armadillo.
 *
 * Wiki: giants "do not scare armadillos", because they are not undead. The armadillo's own list is explicit and
 * simply omits `giant`; this reports the same answer so the pair can be asserted together.
 */
export function giantScaresArmadillos() {
  return GIANT_UNDEAD_PROPERTIES.scaresArmadillos;
}

/** Wiki: it suffocates rather than converting to a drowned when submerged. */
export function giantUnderwaterOutcome() {
  return GIANT_DROWNING.converts ? 'converts' : 'suffocates';
}

/**
 * Death drops.
 *
 * Wiki: the giant's page gives no drop table, and it is an unused mob with no loot defined.
 */
export function giantDrops() {
  return [];
}

/** Wiki: no experience is given on the page, so it is zero rather than a guess. */
export function giantXp() {
  return 0;
}

/**
 * The attack, which in practice never happens.
 *
 * Wiki: it has no AI, so it cannot attack. The damage ladder exists in its infobox and is implemented here so
 * the VALUES are right and testable, but the returned hit requires a caller that has decided to apply it --
 * a ridden giant, which the wiki says is the only way one moves at all.
 */
export function giantAttack(mob, target, { ridden = false, difficulty = 'normal' } = {}) {
  if (!isGiant(mob) || !target) return null;
  // Wiki: "Giants can move if ridden by another mob using NBT tags." A ridden giant is the one case where the
  // damage is reachable, so the gate is explicit rather than assumed.
  if (!ridden) return null;
  const position = target.position ?? target.mesh?.position;
  if (!position) return null;
  // Reach scales with the six-times model, so it is the giant's own half-width plus a zombie's arm's length.
  const reach = GIANT_DIMENSIONS.width * 0.5 + 1.5;
  if (mob.mesh.position.distanceTo(position) > reach) return null;
  return { target, damage: giantDamageFor(difficulty) };
}

/**
 * Build a giant model: the zombie silhouette at six times the scale.
 *
 * Wiki: "they use a six-times-enlarged zombie model". So this is deliberately the zombie's parts, not a new
 * design -- if the zombie model changes shape, this should follow.
 */
// GIANT_PLAN
export function createGiantModel(skinMat, shirtMat, trousersMat, eyeMat) {
  const group = new THREE.Group();

  // Body: the player rectangle 8x12x4 at (16, 16).
  const bodyGeo = new THREE.BoxGeometry(0.5, 0.75, 0.25);
  applyBoxUVs(bodyGeo, 16, 16, 64, 64, 8, 12, 4);
  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.position.y = 1.19;
  group.add(body);

  // Head: the player rectangle 8x8x8 at (0, 0). Applied UNCONDITIONALLY, because a rectangle describes the
  // geometry; the sheet arrives later and the UVs must already be in place for it.
  const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  applyBoxUVs(headGeo, 0, 0, 64, 64, 8, 8, 8);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.81;
  group.add(head);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), eyeMat);
    eye.position.set(side * 0.12, 0.06, 0.26);
    head.add(eye);
    eyes.push(eye);
  }

  // The zombie's outstretched arms, which are what make the silhouette read as a zombie at any scale.
  const arms = [];
  for (const side of [-1, 1]) {
    // Arms: the player rectangle 4x12x4 at (40, 16).
  const armGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
  applyBoxUVs(armGeo, 40, 16, 64, 64, 4, 12, 4);
  const arm = new THREE.Mesh(armGeo, shirtMat);
    arm.position.set(side * 0.38, 1.19, 0.22);
    arm.rotation.x = -Math.PI / 2;
    group.add(arm);
    arms.push(arm);
  }

  const legs = [];
  for (const side of [-1, 1]) {
    // Legs: the player rectangle 4x12x4 at (0, 16).
  const legGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
  applyBoxUVs(legGeo, 0, 16, 64, 64, 4, 12, 4);
  const leg = new THREE.Mesh(legGeo, trousersMat);
    leg.position.set(side * 0.13, 0.44, 0);
    group.add(leg);
    legs.push(leg);
  }

  // The whole model is scaled six times, which is what produces the 3.6 x 12 hitbox from the zombie's 0.6 x
  // 1.95. Scaling here rather than at spawn keeps the proportions exact.
  group.scale.setScalar(GIANT_SCALE);

  return { group, body, head, eyes, arms, legs };
}

/**
 * Pose the giant.
 *
 * Wiki: it "never wander[s]" and "cannot turn their head", so there is no gait and no head tracking -- only the
 * fixed arms and the ambient nothing. Kept as a function so a caller's per-frame pose call is harmless.
 */
export function poseGiant(mob, phase = 0) {
  if (!isGiant(mob) || !mob.mesh) return;
  // No animation state changes: it stands still, facing south, arms out. The arms are set once at build time.
  for (const leg of mob.legs ?? []) {
    if (leg?.rotation) leg.rotation.x = 0;
  }
}
