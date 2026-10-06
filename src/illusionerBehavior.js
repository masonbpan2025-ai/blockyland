import * as THREE from 'three';

/** The real 64x64 illusioner sheet. */
const ILLUSIONER_SKIN_PATH = '/assets/entity/illager/illusioner.png';

/**
 * Apply vanilla's box UV layout to a BoxGeometry's six faces, in ATLAS PIXELS from the top-left.
 *
 * A local copy of the helper in `src/mobs.js`, which is not exported; importing the mob manager from a model module
 * would create a cycle.
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
 * Illusioner rules: the two spells, the four mirror duplicates, and the strafing archer.
 *
 * Reference: https://minecraft.wiki/w/Illusioner
 *
 * The illusioner is Java-exclusive and does not spawn naturally -- "By commands" is its only spawn source,
 * and the wiki calls it an *unused* illager. That is a reason for it not to spawn, not a reason for it to be
 * missing, and it is the last genuinely complex hostile in the game: an archer that fires three times faster
 * than a skeleton, can see its target **through walls**, and fights by turning invisible behind four
 * duplicates while blinding whoever it is fighting.
 */

/** Wiki: 32 HP. */
export const ILLUSIONER_HEALTH = 32;

/** Wiki: height 1.95, width 0.6 -- the standard illager box. */
export const ILLUSIONER_DIMENSIONS = { width: 0.6, height: 1.95 };

/** Wiki: speed 0.5, which is fast for an illager. */
export const ILLUSIONER_SPEED = 0.5;

/** Wiki: bow damage 2-5 on Easy and Normal, 3-5 on Hard. */
export const ILLUSIONER_DAMAGE = {
  easy: { min: 2, max: 5 },
  normal: { min: 2, max: 5 },
  hard: { min: 3, max: 5 }
};

/**
 * Wiki: it fires "an arrow every second, three times faster than a skeleton". A skeleton's cooldown here is
 * 2.5 s, so the illusioner's is 1 s and the ratio is asserted rather than asserted-by-comment.
 */
export const ILLUSIONER_SHOOT_SECONDS = 1;
export const SKELETON_SHOOT_SECONDS = 2.5;

/**
 * Wiki: it attacks players, adult villagers, iron golems and wandering traders "within a 16x4x16 cubic area".
 * A box rather than a sphere, so the shape is modelled rather than approximated by a radius.
 */
export const ILLUSIONER_TARGET_BOX = { horizontal: 16, vertical: 4 };

/**
 * Wiki: "it is the only illager that can see its target through walls", which is a real targeting advantage --
 * most archers here refuse to shoot without a clear line.
 */
export const ILLUSIONER_SEES_THROUGH_WALLS = true;

/**
 * Wiki: the Blindness spell lasts "20 seconds upon first engaging a new player opponent", and it is cast "only
 * if the regional difficulty is greater than 2".
 */
export const ILLUSIONER_BLINDNESS = { seconds: 20, minRegionalDifficulty: 2, cooldownSeconds: 9 };

/**
 * Wiki: it casts Invisibility on itself "that lasts 60 seconds and refreshes the effect whenever the
 * Invisibility's time runs out", with a 17-second cooldown between casts.
 */
export const ILLUSIONER_INVISIBILITY = { seconds: 60, cooldownSeconds: 17 };

/**
 * Wiki: "it creates four false duplicates of itself", which "hover and waver at short distances from the
 * actually invisible illusioner" and "do not space themselves out until the first time the illusioner is
 * attacked".
 */
export const ILLUSIONER_DUPLICATES = { count: 4, hoverRadius: 2.2, waverSpeed: 1.4 };

/** Wiki: a spell resets the cast cooldown to 1 second. */
export const ILLUSIONER_SPELL_SETTLE_SECONDS = 1;

/**
 * Wiki: it "moves quickly on a semi-circular fashion and always tries to maintain a consistent distance
 * between itself and the player, strafing from left to right and vice versa, retreating if the player gets too
 * close or advancing if the player retreats."
 */
export const ILLUSIONER_STRAFE = { preferredDistance: 8, tooClose: 4, tooFar: 12, speed: 0.5 };

/** Body colours: the illager grey-green with a dark blue robe, matching the other illagers' palette. */
export const ILLUSIONER_COLORS = {
  robe: 0x2f4f6f, trim: 0x9aa8b4, skin: 0x9c9c8f, eye: 0x0f172a, bow: 0x6b4f35
};

/** True when the mob is an illusioner. */
export function isIllusioner(mob) {
  return mob?.type === 'illusioner';
}

/** Wiki: 0.6 x 1.95, the illager box. */
export function illusionerDimensions() {
  return { ...ILLUSIONER_DIMENSIONS };
}

/**
 * The damage range for the difficulty.
 *
 * Wiki: 2-5 on Easy and Normal, 3-5 on Hard. The roll happens per arrow, so this reports the range and
 * `rollIllusionerDamage` samples it.
 */
export function illusionerDamageRange(difficulty) {
  return ILLUSIONER_DAMAGE[difficulty] ?? ILLUSIONER_DAMAGE.normal;
}

/** A single arrow's damage, drawn from the difficulty's range. */
export function rollIllusionerDamage(difficulty, random = Math.random) {
  const range = illusionerDamageRange(difficulty);
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}

/**
 * Whether a mob type is a valid target.
 *
 * Wiki: it attacks "players, adult villagers, iron golems, and wandering traders". Adult matters, because a
 * baby villager is not on the list.
 */
export function isIllusionerTarget(mob) {
  if (!mob) return false;
  if (mob.type === 'player') return true;
  if (mob.type === 'iron_golem' || mob.type === 'wandering_trader') return true;
  if (mob.type === 'villager') return !mob.isBaby;
  return false;
}

/**
 * Find a target inside the 16x4x16 box.
 *
 * Wiki: the box is cubic in the horizontal axes and only 4 tall, so a target far above or below is out of
 * range even when close in plan view.
 */
export function findIllusionerTarget(manager, mob, player = null) {
  if (!isIllusioner(mob) || !mob.mesh) return null;
  const candidates = [];
  if (player?.position && player.gamemode !== 'creative' && player.gamemode !== 'spectator') {
    candidates.push(player);
  }
  for (const other of manager?.mobs ?? []) {
    if (other === mob || other.health <= 0) continue;
    candidates.push(other);
  }
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!isIllusionerTarget(candidate)) continue;
    const position = candidate.position ?? candidate.mesh?.position;
    if (!position) continue;
    const dx = Math.abs(position.x - mob.mesh.position.x);
    const dz = Math.abs(position.z - mob.mesh.position.z);
    const dy = Math.abs(position.y - mob.mesh.position.y);
    if (dx > ILLUSIONER_TARGET_BOX.horizontal || dz > ILLUSIONER_TARGET_BOX.horizontal) continue;
    if (dy > ILLUSIONER_TARGET_BOX.vertical) continue;
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}

/** Whether the illusioner is invisible, by its own spell or any other source. */
export function illusionerIsInvisible(mob) {
  return isIllusioner(mob) && (mob.invisibleTimer ?? 0) > 0;
}

/**
 * Cast the Invisibility spell.
 *
 * Wiki: "As long as an illusioner is engaged in combat, it casts an Invisibility status effect on itself that
 * lasts 60 seconds and refreshes the effect whenever the Invisibility's time runs out", and "When an
 * illusioner becomes invisible through this or another method, it creates four false duplicates of itself."
 *
 * Returns the duplicates, or null.
 */
export function castIllusionerInvisibility(manager, mob) {
  if (!isIllusioner(mob)) return null;
  if ((mob.invisibilityCooldown ?? 0) > 0) return null;
  mob.invisibleTimer = ILLUSIONER_INVISIBILITY.seconds;
  mob.invisibilityCooldown = ILLUSIONER_INVISIBILITY.cooldownSeconds;
  mob.spellCooldown = ILLUSIONER_SPELL_SETTLE_SECONDS;
  // Wiki: only the real illusioner can shoot and be damaged; the clones are purely visual.
  mob.mesh.visible = false;
  mob.duplicates = spawnIllusionerDuplicates(manager, mob);
  return mob.duplicates;
}

/**
 * Create the mirror duplicates.
 *
 * Wiki: four of them, and they "hover and waver at short distances", "face in exactly the same direction as
 * the illusioner and move somewhat in step with the original", "appearing to phase through blocks like a vex".
 * They are described as false, so they carry no health and deal no damage.
 */
export function spawnIllusionerDuplicates(manager, mob) {
  if (!isIllusioner(mob)) return [];
  const existing = mob.duplicates ?? [];
  for (const clone of existing) {
    if (clone.mesh?.parent) clone.mesh.parent.remove(clone.mesh);
  }
  const clones = [];
  for (let i = 0; i < ILLUSIONER_DUPLICATES.count; i++) {
    const angle = (i / ILLUSIONER_DUPLICATES.count) * Math.PI * 2;
    const offset = new THREE.Vector3(
      Math.cos(angle) * ILLUSIONER_DUPLICATES.hoverRadius,
      0,
      Math.sin(angle) * ILLUSIONER_DUPLICATES.hoverRadius
    );
    clones.push({
      // False: an illusion, not a mob. No health, no targeting, no collision.
      isIllusion: true,
      offset,
      angle,
      mesh: null
    });
  }
  return clones;
}

/**
 * Advance the duplicates.
 *
 * Wiki: they "do not space themselves out until the first time the illusioner is attacked", and "The clones
 * move to new positions if they were not triggered and are still bunched together". Once spaced, they hover
 * and waver around their offsets and face the same way as the original.
 *
 * `triggered` is set when the real illusioner is damaged.
 */
export function updateIllusionerDuplicates(mob, dt, {
  triggered = false, ownerPosition = null, ownerYaw = 0, random = Math.random
} = {}) {
  if (!isIllusioner(mob)) return;
  if (!illusionerIsInvisible(mob)) {
    // Wiki: "The duplicates disappear once the illusioner's Invisibility effect ends."
    mob.duplicates = [];
    return;
  }
  if (triggered) mob.duplicatesTriggered = true;
  const origin = ownerPosition ?? mob.mesh.position;
  for (const clone of mob.duplicates ?? []) {
    if (!clone.isIllusion) continue;
    // Wiki: while bunched they stay bunched, and the illusioner "can also do this once in a while to
    // refresh the clones' positions".
    const radius = mob.duplicatesTriggered
      ? ILLUSIONER_DUPLICATES.hoverRadius
      : ILLUSIONER_DUPLICATES.hoverRadius * 0.15;
    clone.angle += dt * ILLUSIONER_DUPLICATES.waverSpeed * (mob.duplicatesTriggered ? 1 : 0.2);
    clone.position = new THREE.Vector3(
      origin.x + Math.cos(clone.angle) * radius,
      origin.y + Math.sin((clone.angle + clone.offset.z) * 2) * 0.25,
      origin.z + Math.sin(clone.angle) * radius
    );
    clone.yaw = ownerYaw;
  }
}

/** Wiki: "When the real illusioner is damaged, its duplicates all snap back to where the real illusioner is". */
export function onIllusionerHurt(mob) {
  if (!isIllusioner(mob)) return false;
  mob.duplicatesTriggered = false;
  for (const clone of mob.duplicates ?? []) {
    if (clone.isIllusion) clone.angle = (clone.offset.x + clone.offset.z) * 0.5;
  }
  return true;
}

/**
 * Cast the Blindness spell.
 *
 * Wiki: "The illusioner casts its Blindness spell only if the regional difficulty is greater than 2", it lasts
 * "20 seconds upon first engaging a new player opponent", and "The illusioner does not cast this spell more
 * than once on the same player opponent, unless it has first shifted its attention to another opponent and then
 * back to that original opponent." Other entities "do not trigger this magic".
 *
 * Returns true when the spell was cast.
 */
export function castIllusionerBlindness(mob, target, { regionalDifficulty = 3, dt = 0 } = {}) {
  if (!isIllusioner(mob) || !target) return false;
  // Wiki: only a player opponent triggers it.
  if (target.type !== 'player') return false;
  if (regionalDifficulty <= ILLUSIONER_BLINDNESS.minRegionalDifficulty) return false;
  if ((mob.blindnessCooldown ?? 0) > 0) return false;
  if ((mob.spellCooldown ?? 0) > 0) return false;
  // Wiki: not more than once on the same opponent unless it looked away and back.
  if (mob.blindedTarget === target) return false;

  mob.blindedTarget = target;
  mob.blindnessCooldown = ILLUSIONER_BLINDNESS.cooldownSeconds;
  mob.spellCooldown = ILLUSIONER_SPELL_SETTLE_SECONDS;
  mob.casting = 'blindness';
  mob.castTimer = 0.5;
  target.applyStatusEffect?.('blindness', ILLUSIONER_BLINDNESS.seconds);
  return true;
}

/**
 * Forget the blinded opponent.
 *
 * Wiki: the spell can be cast again once the illusioner "has first shifted its attention to another opponent
 * and then back to that original opponent", so switching target clears the record.
 */
export function switchIllusionerTarget(mob, newTarget) {
  if (!isIllusioner(mob)) return false;
  if (mob.blindedTarget && mob.blindedTarget !== newTarget) mob.blindedTarget = null;
  mob.target = newTarget ?? null;
  return true;
}

/** Advance every cooldown, refreshing Invisibility when it lapses. */
export function updateIllusionerCooldowns(manager, mob, dt) {
  if (!isIllusioner(mob)) return;
  mob.shootCooldown = Math.max(0, (mob.shootCooldown ?? 0) - dt);
  mob.spellCooldown = Math.max(0, (mob.spellCooldown ?? 0) - dt);
  mob.blindnessCooldown = Math.max(0, (mob.blindnessCooldown ?? 0) - dt);
  mob.invisibilityCooldown = Math.max(0, (mob.invisibilityCooldown ?? 0) - dt);
  if (mob.castTimer > 0) {
    mob.castTimer -= dt;
    if (mob.castTimer <= 0) mob.casting = null;
  }
  if ((mob.invisibleTimer ?? 0) > 0) {
    mob.invisibleTimer -= dt;
    if (mob.invisibleTimer <= 0) {
      // Wiki: the duplicates disappear when the effect ends.
      mob.invisibleTimer = 0;
      mob.mesh.visible = true;
    }
  }
}

/**
 * The movement decision.
 *
 * Wiki: it keeps a consistent distance, "strafing from left to right and vice versa, retreating if the player
 * gets too close or advancing if the player retreats", moving "on a semi-circular fashion".
 *
 * Returns 'holding', 'retreating', 'advancing' or 'strafing'.
 */
export function illusionerMovement(mob, target, dt = 1 / 60) {
  if (!isIllusioner(mob) || !target) return null;
  const position = target.position ?? target.mesh?.position;
  if (!position) return null;
  const toTarget = new THREE.Vector3(position.x - mob.mesh.position.x, 0, position.z - mob.mesh.position.z);
  const distance = toTarget.length();
  if (distance < 1e-4) return 'holding';
  toTarget.normalize();

  // The strafe direction flips periodically, which is what makes the approach semi-circular.
  mob.strafeTimer = (mob.strafeTimer ?? 1.5) - dt;
  if (mob.strafeTimer <= 0) {
    mob.strafeTimer = 1.5 + Math.random() * 1.5;
    mob.strafeSign = -(mob.strafeSign ?? 1);
  }
  const strafe = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(mob.strafeSign ?? 1);

  const speed = ILLUSIONER_SPEED * 2;
  if (distance < ILLUSIONER_STRAFE.tooClose) {
    mob.velocity.x = -toTarget.x * speed + strafe.x * speed * 0.5;
    mob.velocity.z = -toTarget.z * speed + strafe.z * speed * 0.5;
    return 'retreating';
  }
  if (distance > ILLUSIONER_STRAFE.tooFar) {
    mob.velocity.x = toTarget.x * speed + strafe.x * speed * 0.5;
    mob.velocity.z = toTarget.z * speed + strafe.z * speed * 0.5;
    return 'advancing';
  }
  // In the band: circle, which is the wiki's "semi-circular" movement.
  mob.velocity.x = strafe.x * speed;
  mob.velocity.z = strafe.z * speed;
  return 'strafing';
}

/** Whether it may fire: one arrow a second. */
export function illusionerCanShoot(mob) {
  return isIllusioner(mob) && (mob.shootCooldown ?? 0) <= 0;
}

/**
 * Fire an arrow.
 *
 * Wiki: it fires one a second, three times faster than a skeleton, and it "can see its target through walls",
 * so line of sight is deliberately NOT required here -- that is its distinguishing trait.
 */
export function illusionerShoot(mob, target, difficulty = 'normal', random = Math.random) {
  if (!isIllusioner(mob) || !target) return null;
  if (!illusionerCanShoot(mob)) return null;
  const position = target.position ?? target.mesh?.position;
  if (!position) return null;
  mob.shootCooldown = ILLUSIONER_SHOOT_SECONDS;
  const direction = position.clone().sub(mob.mesh.position).normalize();
  return { direction, damage: rollIllusionerDamage(difficulty, random), throughWalls: true };
}

/** Wiki: it drops its bow, and nothing else of note; illagers give 5 XP with credit. */
export function illusionerDrops(mob, random = Math.random) {
  if (!isIllusioner(mob)) return [];
  const rows = [];
  // Wiki: a naturally spawned bow has an 8.5% chance of dropping.
  if (random() < 0.085) rows.push(['bow', false, 1, 1]);
  return rows;
}

/** Wiki: an illager is worth 5 XP with player credit. */
export function illusionerXp(mob) {
  if (!isIllusioner(mob)) return 0;
  return 5;
}

/**
 * Build an illusioner model: the illager silhouette in the illusioner's blue robe, with a bow.
 */
export function createIllusionerModel(robeMat, trimMat, skinMat, eyeMat, bowMat, options = {}) {
  const group = new THREE.Group();

  // The REAL 64x64 illusioner sheet. Every part takes it when a loader provides one; the flat colours stand otherwise, so
  // a build with no assets still renders an illusioner. // ILLUSIONER_REAL_SHEET
  const illusionerSheet = options.loadTexture ? options.loadTexture(ILLUSIONER_SKIN_PATH) : null;
  if (illusionerSheet) {
    illusionerSheet.magFilter = THREE.NearestFilter;
    illusionerSheet.minFilter = THREE.NearestFilter;
    illusionerSheet.needsUpdate = true;
  }
  /** The sheet material, or the flat one when there is no sheet. */
  const sheetMat = (fallback) => (illusionerSheet
    ? new THREE.MeshLambertMaterial({ map: illusionerSheet, transparent: true, alphaTest: 0.5 })
    : fallback);
  /** A box carrying vanilla's illager rectangle for its shape. */
  const textured = (size, uu, vv, tw, th, td, fallback) => {
    const geo = new THREE.BoxGeometry(...size);
    if (illusionerSheet) applyBoxUVs(geo, uu, vv, 64, 64, tw, th, td);
    return new THREE.Mesh(geo, sheetMat(fallback));
  };

  // Vanilla's illager rectangles, the same ones this project already uses for the vindicator:
  // body 8x12x6 at (16,20), head 8x10x8 at (0,0).
  const body = textured([0.5, 0.75, 0.3], 16, 20, 8, 12, 6, robeMat);
  body.position.y = 1.07;
  group.add(body);

  const sash = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.34), trimMat);
  sash.position.y = 0.8;
  group.add(sash);

  const head = textured([0.5, 0.5, 0.5], 0, 0, 8, 10, 8, skinMat);
  head.position.y = 1.7;
  group.add(head);

  // The illager's big nose, which is what separates the silhouette from a villager's.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.12), skinMat);
  nose.position.set(0, -0.02, 0.3);
  head.add(nose);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.03), eyeMat);
    eye.position.set(side * 0.12, 0.06, 0.26);
    head.add(eye);
    eyes.push(eye);
  }

  const legGeo = new THREE.BoxGeometry(0.16, 0.7, 0.16);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, robeMat);
    leg.position.set(side * 0.13, 0.35, 0);
    group.add(leg);
    legs.push(leg);
  }

  const armGeo = new THREE.BoxGeometry(0.14, 0.66, 0.14);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, robeMat);
    arm.position.set(side * 0.32, 1.1, 0);
    group.add(arm);
    arms.push(arm);
  }

  // The bow, held in the right hand.
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), bowMat);
  bow.position.set(0, -0.2, 0.12);
  arms[1].add(bow);

  return { group, body, sash, head, nose, eyes, legs, arms, bow };
}

/**
 * Pose the illusioner.
 *
 * Wiki: it "signals this attack by raising its arms during a short-timed animation" for both spells, so the
 * casting pose is shared and only the particle colour differs.
 */
export function poseIllusioner(mob, phase = 0) {
  if (!isIllusioner(mob) || !mob.mesh) return;
  const casting = !!mob.casting;
  (mob.arms ?? []).forEach((arm, index) => {
    if (!arm?.rotation) return;
    // Both arms up for a spell, otherwise a light bow-drawing sway.
    arm.rotation.x = casting ? -2.4 : Math.sin(phase * 2 + index) * 0.12;
  });
  // The duplicates carry the model's facing, so they stay in step with the original.
  for (const clone of mob.duplicates ?? []) {
    if (clone.mesh?.rotation) clone.mesh.rotation.y = mob.mesh.rotation.y;
  }
}
