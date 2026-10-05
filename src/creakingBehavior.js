import * as THREE from 'three';

/**
 * Creaking rules: freezing under a player's gaze, the creaking-heart link, and the alerted/unalerted states.
 *
 * Reference: https://minecraft.wiki/w/Creaking
 *
 * The creaking is the strangest mob in the game to implement, because its signature behaviour is an
 * INVERSION of every other hostile: it can only move while you are NOT looking at it. "Moves to attack
 * players with melee headbutts, but cannot move at all while any players in Survival or Adventure mode can
 * see it."
 */

/** Wiki: 1 HP, "immune to damage when spawned using a creaking heart". */
export const CREAKING_HEALTH = 1;

/** Wiki: 0.9 wide x 2.7 tall. */
export const CREAKING_DIMENSIONS = { width: 0.9, height: 2.7 };

/** Wiki: speed 0.3. */
export const CREAKING_SPEED = 0.3;

/** Wiki: Easy 2.5, Normal 3, Hard 4.5. */
export const CREAKING_DAMAGE = { peaceful: 0, easy: 2.5, normal: 3, hard: 4.5 };

/**
 * Wiki: "If a Survival or Adventure mode player's facing direction (both pitch and yaw) is within 60° of the
 * creaking without blocks obstructing, the creaking becomes immobile." So the cone half-angle is 30°.
 */
export const CREAKING_VIEW = { coneDegrees: 30, fullConeDegrees: 60 };

/** Wiki: "When a creaking within approximately 12 blocks enters a player's field of vision, it becomes alerted." */
export const CREAKING_ALERT_RANGE = 12;

/** Wiki: "If all nearby players leave the creaking's detection range ... the creaking returns to its unalerted state." */
export const CREAKING_DETECT_RANGE = 32;

/**
 * Wiki: "Each creaking heart has a 32-block Euclidean radius ... The creaking never intentionally moves beyond
 * this radius from its creaking heart ... If it is pushed out of this radius, such as with pistons or
 * knockback, it dies."
 */
export const CREAKING_HEART_RADIUS = 32;

/** Wiki: "if they remain within the same block as a player for longer than 5 seconds", it despawns. */
export const CREAKING_SOFTLOCK_SECONDS = 5;

/** Wiki: "Naturally-spawned creakings despawn during daytime." */
export const CREAKING_DESPAWN_AT_DAY = true;

/**
 * Wiki: "Pillagers, evokers, vindicators, and illusioners flee from creakings when within 8 blocks. Ravagers
 * do not flee."
 */
export const CREAKING_FLEEING_MOBS = ['pillager', 'evoker', 'vindicator', 'illusioner'];
export const CREAKING_TERROR_RANGE = 8;

/** Wiki: it ignores these while walking: "Creakings now ignore cacti, sweet berry bushes, and powder snow". */
export const CREAKING_IGNORED_BLOCKS = ['cactus', 'sweet_berry_bush', 'powder_snow'];

/** Wiki: it is now fire resistant. */
export const CREAKING_FIRE_RESISTANT = true;

/** Wiki: "Creakings do not drop any items or experience on death." */
export const CREAKING_DROPS = { items: [], xp: 0 };

/** Body colours: a pale, almost bark-like body with glowing orange eyes. */
export const CREAKING_COLORS = { body: 0x6b6b5a, limb: 0x54544a, eye: 0xff8c1a, eyeDim: 0xc2610a };

/** True when the mob is a creaking. */
export function isCreaking(mob) {
  return mob?.type === 'creaking';
}

/** Wiki: hitbox 0.9 x 2.7. */
export function creakingDimensions() {
  return { ...CREAKING_DIMENSIONS };
}

/** Melee damage by difficulty. */
export function creakingDamageFor(difficulty = 'normal') {
  return CREAKING_DAMAGE[difficulty] ?? CREAKING_DAMAGE.normal;
}

/**
 * Whether a player's gaze is on the creaking.
 *
 * Wiki: detection uses "both pitch and yaw ... within 60° of the creaking without blocks obstructing", so a
 * 30° half-angle cone from the look direction to the mob's position. Wearing a carved pumpkin lets an
 * ALERTED creaking move anyway, but does not stop an unalerted one becoming alerted.
 *
 * `hasLineOfSight` is injected because obstruction is a world query; it defaults to visible.
 */
export function creakingInView(mob, player, { hasLineOfSight = () => true } = {}) {
  if (!isCreaking(mob) || !player) return false;
  // Wiki: only Survival and Adventure players freeze it.
  const mode = player.gamemode ?? 'survival';
  if (mode !== 'survival' && mode !== 'adventure') return false;
  if (typeof player.yaw !== 'number') return false;

  const from = player.position;
  const to = mob.mesh?.position ?? mob.position;
  if (!from || !to) return false;

  // The look direction, matching the convention used elsewhere in the codebase.
  const yaw = player.yaw;
  const pitch = player.pitch ?? 0;
  const cosPitch = Math.cos(pitch);
  const look = new THREE.Vector3(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);

  // The nearest point on the mob AABB, not its centre and not its feet.
  //
  // The centre fails for a tall mob: at close range a 2.7-block hitbox puts its centre far above a level
  // gaze, so a 30-degree cone rejected a creaking standing directly in front of the player. The feet fail
  // the other way, letting a player looking at the ground above it count as watching. The bounding box is
  // also what the game itself tests against.
  const half = {
    x: (mob.width ?? CREAKING_DIMENSIONS.width) * 0.5,
    z: (mob.width ?? CREAKING_DIMENSIONS.width) * 0.5,
    y: (mob.height ?? CREAKING_DIMENSIONS.height) * 0.5
  };
  const centre = { x: to.x, y: to.y + half.y, z: to.z };
  const nearest = new THREE.Vector3(
    Math.max(centre.x - half.x, Math.min(from.x, centre.x + half.x)),
    Math.max(centre.y - half.y, Math.min(from.y, centre.y + half.y)),
    Math.max(centre.z - half.z, Math.min(from.z, centre.z + half.z))
  );
  const toMob = nearest.sub(from);
  if (toMob.lengthSq() < 1e-6) return true;
  toMob.normalize();

  const angle = look.angleTo(toMob);
  if (angle > (CREAKING_VIEW.coneDegrees * Math.PI) / 180) return false;
  if (!hasLineOfSight(mob, player)) return false;
  // Wiki: a carved pumpkin lets an ALERTED creaking move, so it suppresses the freeze.
  if (player.wearingCarvedPumpkin && mob.alerted) return false;
  return true;
}

/**
 * Any player in a position to freeze the creaking.
 *
 * Wiki: it is immobile "while ANY players in Survival or Adventure mode can see it".
 */
export function creakingFrozenBy(mob, players, { hasLineOfSight = () => true } = {}) {
  if (!Array.isArray(players)) return null;
  for (const player of players) {
    if (creakingInView(mob, player, { hasLineOfSight })) return player;
  }
  return null;
}

/**
 * Whether the creaking can be hurt at all.
 *
 * Wiki: one "spawned by a creaking heart is linked to it and becomes completely invulnerable to all sources
 * of damage (except for the void)". One from a spawn egg or a command "can take damage normally".
 */
export function creakingIsInvulnerable(mob, { source = 'mob' } = {}) {
  if (!isCreaking(mob)) return false;
  // A heart-linked creaking survives everything except the void.
  if (mob.linkedHeart) return source !== 'void';
  return false;
}

/** The link state. */
export function creakingIsLinked(mob) {
  return isCreaking(mob) && !!mob.linkedHeart;
}

/**
 * Advance the alert state.
 *
 * Wiki: "Newly spawned creakings begin in an unalerted state ... become hostile once they enter the player's
 * field of vision." While alerted it "attempts to move toward and attack the player, moving only when outside
 * of the player's field of vision". If all nearby players leave detection range, it returns to unalerted.
 *
 * Returns 'alerted', 'calmed' or null.
 */
export function updateCreakingAlert(mob, players, { hasLineOfSight = () => true } = {}) {
  if (!isCreaking(mob) || !Array.isArray(players)) return null;

  let nearest = null;
  let nearestDistance = CREAKING_DETECT_RANGE;
  // A Creative or Spectator player "neither alerts nor calms" it, so they are not candidates for the
  // alert, but their PRESENCE also must not be read as everybody having left. Track the two separately.
  let anyPlayerInRange = false;
  for (const player of players) {
    if (!player?.position || !mob.mesh?.position) continue;
    const mode = player.gamemode ?? 'survival';
    const distance = mob.mesh.position.distanceTo(player.position);
    if (distance < CREAKING_DETECT_RANGE) anyPlayerInRange = true;
    // Wiki: Creative and Spectator players neither alert nor calm it.
    if (mode === 'creative' || mode === 'spectator') continue;
    if (distance < nearestDistance) { nearestDistance = distance; nearest = player; }
  }

  if (!nearest) {
    // Wiki: it "returns to its unalerted state" when players LEAVE ITS DETECTION RANGE. A player standing
    // in range in Creative mode has not left, so the state is left alone.
    if (mob.alerted && !anyPlayerInRange) { mob.alerted = false; return 'calmed'; }
    return null;
  }

  if (!mob.alerted) {
    // Wiki: it becomes alerted when it enters the player's field of vision within about 12 blocks.
    const seen = creakingInView(mob, nearest, { hasLineOfSight });
    if (seen && nearestDistance <= CREAKING_ALERT_RANGE) {
      mob.alerted = true;
      mob.target = nearest;
      return 'alerted';
    }
    // Wiki: wearing a carved pumpkin does NOT prevent an unalerted creaking becoming alerted, so the
    // pumpkin suppression inside creakingInView must not hide proximity. Fall back to plain proximity.
    if (nearestDistance <= CREAKING_ALERT_RANGE && nearest.gamemode !== 'creative') {
      const toMob = new THREE.Vector3().subVectors(mob.mesh.position, nearest.position);
      // Match the main check: clamp the vertical offset to the hitbox height, so a tall mob directly ahead
      // still counts instead of reading as far above a level gaze.
      const halfH = (mob.height ?? CREAKING_DIMENSIONS.height) * 0.5;
      toMob.y = Math.max(0, Math.min(toMob.y + halfH, halfH));
      const cosPitch = Math.cos(nearest.pitch ?? 0);
      const look = new THREE.Vector3(
        -Math.sin(nearest.yaw ?? 0) * cosPitch, Math.sin(nearest.pitch ?? 0), -Math.cos(nearest.yaw ?? 0) * cosPitch
      );
      if (toMob.lengthSq() > 1e-6 && look.angleTo(toMob.normalize()) <= (CREAKING_VIEW.coneDegrees * Math.PI) / 180) {
        mob.alerted = true;
        mob.target = nearest;
        return 'alerted';
      }
    }
    return null;
  }

  mob.target = nearest;
  return null;
}

/**
 * Whether the creaking may move this frame.
 *
 * Wiki: it is "completely immobile" while observed, "can no longer attack, nor can it be pushed or knocked
 * back by player attacks". That is the whole mechanic, so it is one predicate.
 */
export function creakingCanMove(mob, players, { hasLineOfSight = () => true } = {}) {
  if (!isCreaking(mob)) return false;
  if (creakingFrozenBy(mob, players, { hasLineOfSight })) return false;
  return true;
}

/**
 * Try to attack.
 *
 * Wiki: an observed creaking "can no longer attack", so this returns null while frozen.
 */
export function creakingAttack(mob, players, { range = 1.6, hasLineOfSight = () => true } = {}) {
  if (!isCreaking(mob) || !mob.alerted) return null;
  const target = mob.target;
  if (!target?.position) return null;
  // Wiki: the gate is whether it is OBSERVED, and the observer that matters is its target. Checking every
  // player instead would let an unrelated onlooker suppress an attack on someone who cannot see it.
  if (creakingInView(mob, target, { hasLineOfSight })) return null;
  if (mob.mesh.position.distanceTo(target.position) > range + (mob.width ?? 0.9) * 0.5) return null;
  return { target, damage: creakingDamageFor(mob.difficulty ?? 'normal') };
}

/**
 * Advance the heart-link rules.
 *
 * Wiki: it "never intentionally moves beyond this radius from its creaking heart ... If it is pushed out of
 * this radius ... it dies", and "if they are outside the 32-block radius around their linked creaking heart"
 * they despawn and the heart respawns them.
 *
 * Returns 'out-of-range' when the creaking should die, or null.
 */
export function updateCreakingHeartLink(mob, { heartPosition = null } = {}) {
  if (!isCreaking(mob) || !mob.linkedHeart) return null;
  const heart = heartPosition ?? mob.linkedHeart.position;
  if (!heart) return null;
  const distance = mob.mesh.position.distanceTo(heart);
  if (distance > CREAKING_HEART_RADIUS) return 'out-of-range';
  return null;
}

/** Clamp a desired step so it never intentionally leaves the heart radius. Returns the clamped target. */
export function creakingClampToHeart(mob, desired, heartPosition = null) {
  if (!isCreaking(mob) || !mob.linkedHeart) return desired?.clone?.() ?? desired;
  const heart = heartPosition ?? mob.linkedHeart.position;
  if (!heart || !desired) return desired;
  const offset = new THREE.Vector3().subVectors(desired, heart);
  if (offset.length() <= CREAKING_HEART_RADIUS) return desired.clone();
  return heart.clone().add(offset.setLength(CREAKING_HEART_RADIUS - 0.5));
}

/**
 * Advance the despawn rules.
 *
 * Wiki: naturally-spawned creakings despawn during daytime, and "despawn if they are outside the 32-block
 * radius around their linked creaking heart, or if they remain within the same block as a player for longer
 * than 5 seconds". An egg- or command-spawned one "do[es] not vanish during the day".
 *
 * Returns 'despawned' or null.
 */
export function updateCreakingDespawn(mob, dt, {
  worldTime = 6000, inSameBlockAsPlayer = false
} = {}) {
  if (!isCreaking(mob)) return null;
  // Wiki: an egg- or command-spawned creaking does not vanish during the day.
  if (!mob.natural) return null;

  // Wiki: the softlock guard, which is specifically about sharing a block.
  if (inSameBlockAsPlayer) {
    mob.softlockTimer = (mob.softlockTimer ?? 0) + dt;
    if (mob.softlockTimer >= CREAKING_SOFTLOCK_SECONDS) return 'despawned';
  } else {
    mob.softlockTimer = 0;
  }

  if (CREAKING_DESPAWN_AT_DAY && !creakingIsNight(worldTime)) return 'despawned';
  return null;
}

/**
 * Whether it is night.
 *
 * Wiki: a naturally-spawned creaking despawns during the day. Day runs 0-12000 and night 13000-23000, with
 * dusk and dawn as the transitions; treating everything outside 0-12000 as "not day" is what matters here,
 * because the creaking is a night mob that the sunrise removes.
 */
export function creakingIsNight(worldTime) {
  const t = ((worldTime ?? 6000) % 24000 + 24000) % 24000;
  return t >= 12000;
}

/**
 * Whether a mob panics at the sight of a creaking.
 *
 * Wiki: pillagers, evokers, vindicators and illusioners flee within 8 blocks; ravagers do not.
 */
export function mobFleesFromCreaking(type, distance) {
  if (!CREAKING_FLEEING_MOBS.includes(type)) return false;
  return distance <= CREAKING_TERROR_RANGE;
}

/**
 * Build a creaking model: a tall, thin, asymmetrical bark-coloured body with glowing eyes.
 *
 * Wiki trivia: "The creaking was made asymmetrical to emphasize its contrast with the rest of the Overworld",
 * and it is "actually rooted to the ground". Both are reflected: the arms differ in length and it moves one
 * leg at a time.
 */
export function createCreakingModel(bodyMat, limbMat, eyeMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.5, 0.4), bodyMat);
  body.position.y = 1.75;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.5), bodyMat);
  head.position.set(0.04, 2.75, 0.06);
  group.add(head);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.05), eyeMat);
    // Deliberately offset: the wiki notes the model is asymmetric, and a mirrored pair reads as generic.
    eye.position.set(side * 0.15 + 0.03, 0.06, 0.26);
    head.add(eye);
    eyes.push(eye);
  }

  // Asymmetric arms: the left is visibly longer than the right.
  const arms = [];
  const armSpecs = [[-1, 1.0], [1, 1.35]];
  for (const [side, length] of armSpecs) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, length, 0.2), limbMat);
    arm.position.set(side * 0.42, 2.4 - length / 2, 0);
    group.add(arm);
    arms.push(arm);
  }

  // Long, thin, root-like legs.
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), limbMat);
    leg.position.set(side * 0.18, 0.5, 0);
    group.add(leg);
    legs.push(leg);
  }

  return { group, body, head, eyes, arms, legs };
}

/**
 * Pose the creaking.
 *
 * Wiki: "it moves only one leg at a time", which is what the rooted look comes from. Its eyes are "dimly lit"
 * when unalerted and "glowing a brighter orange" when alerted, and they flicker when its heart is destroyed.
 */
export function poseCreaking(mob, phase = 0) {
  if (!isCreaking(mob) || !mob.mesh) return;
  // Eyes: dim when unalerted, bright when alerted, flickering while dying.
  const dying = mob.dying === true;
  const brightness = dying
    ? (Math.sin(phase * 40) > 0 ? 1 : 0.15)
    : (mob.alerted ? 1 : 0.45);
  for (const eye of mob.eyes ?? []) {
    if (!eye?.material) continue;
    if (eye.material.color?.setHex) {
      eye.material.color.setHex(mob.alerted ? CREAKING_COLORS.eye : CREAKING_COLORS.eyeDim);
    }
    eye.material.emissiveIntensity = brightness;
  }

  // The one-leg-at-a-time gait, and nothing at all while observed.
  if (mob.frozen) {
    for (const leg of mob.legs ?? []) if (leg?.rotation) leg.rotation.x = 0;
    return;
  }
  (mob.legs ?? []).forEach((leg, index) => {
    if (!leg?.rotation) return;
    // Opposite phases, so only ever one leg is mid-step.
    leg.rotation.x = Math.sin(phase * 2 + index * Math.PI) * 0.3;
  });
  // A slow sway, which the wiki calls out as its own animation.
  if (mob.body) mob.body.rotation.z = Math.sin(phase * 0.8) * 0.04;
  (mob.arms ?? []).forEach((arm, index) => {
    if (arm?.rotation) arm.rotation.x = Math.sin(phase * 1.5 + index) * 0.12;
  });
}
