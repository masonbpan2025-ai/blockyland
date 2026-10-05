import * as THREE from 'three';

/**
 * Phantom rules and model helpers.
 *
 * Reference: https://minecraft.wiki/w/Phantom
 *
 * The phantom is a hostile undead flyer defined by four things: it circles above its target, it
 * swoops periodically to bite, it burns in sunlight like other undead, and it drops a phantom
 * membrane. It is also **fall-damage immune** and can breathe under water.
 */

/** Wiki: 20 HP, and the entity data notes phantoms always have a constant 20 regardless of size. */
export const PHANTOM_HEALTH = 20;

/** Wiki: 0.9 wide x 0.5 tall. */
export const PHANTOM_DIMENSIONS = { width: 0.9, height: 0.5 };

/**
 * Wiki: 2 damage on Easy and Normal, 3 on Hard. Bedrock deals 4/6/9, but this project targets Java.
 */
export const PHANTOM_DAMAGE = { peaceful: 0, easy: 2, normal: 2, hard: 3 };

/**
 * Wiki: "When idle, phantoms fly around in a roughly circular pattern within 15 to 25 blocks of a
 * player horizontally and within 24 to 35 blocks of a player vertically."
 */
export const PHANTOM_CIRCLE = { horizontalMin: 15, horizontalMax: 25, verticalMin: 24, verticalMax: 35 };

/** Wiki: "targeting and following players from 64 blocks away". */
export const PHANTOM_TARGET_RANGE = 64;

/**
 * Wiki: "Once every ... 8-12 seconds (JE), they swoop in to attack."
 */
export const PHANTOM_SWOOP = { minSeconds: 8, maxSeconds: 12, attackRange: 1.6, descentSpeed: 14 };

/** Wiki: "Their movement speed when attacking is one of the fastest of any mob, up to 20 blocks per second." */
export const PHANTOM_SWOOP_SPEED = 20;

/** Wiki: a phantom "retreats back to its original elevation" when stopped or hurt mid-swoop. */
export const PHANTOM_RETREAT_SPEED = 6;

/**
 * Wiki: a phantom "tries to stay at least 16 blocks away" from cats that hiss at it.
 */
export const PHANTOM_CAT_AVOID_RANGE = 16;

/** Body colours: a dark blue-grey body with glowing green eyes. */
export const PHANTOM_COLORS = { body: 0x1e1b4b, eye: 0x84cc16 };

/** True when the mob is a phantom. */
export function isPhantom(mob) {
  return mob?.type === 'phantom';
}

/** Melee damage at the given difficulty. */
export function phantomDamageFor(difficulty) {
  const key = Object.hasOwn(PHANTOM_DAMAGE, difficulty ?? '') ? difficulty : 'normal';
  return PHANTOM_DAMAGE[key];
}

/**
 * Roll the wait before the next swoop.
 *
 * Wiki: every 8 to 12 seconds in Java.
 */
export function rollPhantomSwoopDelay(random = Math.random) {
  const { minSeconds, maxSeconds } = PHANTOM_SWOOP;
  return minSeconds + random() * (maxSeconds - minSeconds);
}

/**
 * The anchor point a phantom circles around.
 *
 * Wiki: the entity data has an `anchor_pos` that "appears to reset to a point above the target player
 * every time the phantom flies up after a swoop". So the anchor is set from the target's position with
 * a randomised offset inside the circle radii.
 */
export function phantomAnchorFor(targetPos, random = Math.random) {
  const angle = random() * Math.PI * 2;
  const horizontal = PHANTOM_CIRCLE.horizontalMin
    + random() * (PHANTOM_CIRCLE.horizontalMax - PHANTOM_CIRCLE.horizontalMin);
  const vertical = PHANTOM_CIRCLE.verticalMin
    + random() * (PHANTOM_CIRCLE.verticalMax - PHANTOM_CIRCLE.verticalMin);
  return new THREE.Vector3(
    targetPos.x + Math.sin(angle) * horizontal,
    targetPos.y + vertical,
    targetPos.z + Math.cos(angle) * horizontal
  );
}

/**
 * Position on the circular patrol, given the anchor and a phase.
 *
 * Wiki: "a roughly circular pattern". Returns a world position to aim at.
 */
export function phantomCirclePosition(anchor, phase, radius = PHANTOM_CIRCLE.horizontalMin) {
  return new THREE.Vector3(
    anchor.x + Math.sin(phase) * radius,
    anchor.y,
    anchor.z + Math.cos(phase) * radius
  );
}

/** Wiki: a phantom burns in sunlight, like other undead. */
export function phantomBurnsInSunlight(mob, skyLight, isDaytime) {
  if (!isPhantom(mob)) return false;
  // Undead burn when the sky is bright and it is day; a helmet would prevent it, but phantoms
  // cannot wear one.
  return !!isDaytime && skyLight > 11;
}

/**
 * Find the nearest valid target.
 *
 * Wiki: it targets and follows players from 64 blocks away, and "do not attack players in Creative
 * mode".
 */
export function findPhantomTarget(manager, phantom, player, { difficulty = 'normal' } = {}) {
  if (!isPhantom(phantom) || difficulty === 'peaceful') return null;
  if (!player?.position) return null;
  if (player.gamemode === 'creative') return null;
  if (manager?.insomniaDisabled) return null;
  const dist = phantom.mesh.position.distanceTo(player.position);
  if (dist > PHANTOM_TARGET_RANGE) return null;
  return player;
}

/**
 * Whether a phantom is mid-swoop.
 */
export function isSwooping(mob) {
  return isPhantom(mob) && mob.swoopState === 'diving';
}

/**
 * Begin a swoop.
 *
 * Wiki: it dives at the player from the sky to bite them, at up to 20 blocks per second.
 */
export function startPhantomSwoop(mob) {
  if (!isPhantom(mob)) return false;
  mob.swoopState = 'diving';
  mob.swoopTimer = 0;
  return true;
}

/**
 * Advance a phantom's flight: circle, then swoop, then retreat.
 *
 * Wiki behaviour implemented:
 *  - idle circling inside the 15-25 horizontal and 24-35 vertical band around its anchor
 *  - a swoop every 8-12 seconds, diving at the target
 *  - a bite on contact, and a retreat to the anchor afterwards
 *  - a retreat instead of a continued attack when hurt or blocked mid-swoop
 *  - avoidance of cats within 16 blocks
 *
 * Returns what it did this step, or null.
 */
export function updatePhantomFlight(manager, mob, dt, player, { move = null, random = Math.random } = {}) {
  if (!isPhantom(mob) || !mob.velocity) return null;

  // Wiki: it keeps at least 16 blocks from a cat that is hissing at it.
  if (manager?.mobs) {
    for (const other of manager.mobs) {
      if (other.type !== 'cat' || other.health <= 0) continue;
      const d = mob.mesh.position.distanceTo(other.mesh.position);
      if (d < PHANTOM_CAT_AVOID_RANGE) {
        const away = mob.mesh.position.clone().sub(other.mesh.position);
        away.y = 1;
        if (away.lengthSq() > 1e-6) away.normalize();
        mob.yaw = Math.atan2(away.x, away.z);
        mob.velocity.copy(away.multiplyScalar(PHANTOM_RETREAT_SPEED));
        move?.(manager, mob, dt);
        mob.state = 'avoiding cat';
        return 'avoiding-cat';
      }
    }
  }

  const target = mob.target ?? null;

  // Wiki: when hurt or stopped mid-swoop it retreats to its original elevation rather than pressing
  // the attack.
  if (mob.swoopState === 'retreating') {
    const anchor = mob.anchorPos ?? mob.mesh.position.clone().add(new THREE.Vector3(0, 20, 0));
    const dir = anchor.clone().sub(mob.mesh.position);
    if (dir.length() < 1.5) {
      mob.swoopState = null;
      mob.swoopTimer = rollPhantomSwoopDelay(random);
    } else {
      mob.yaw = Math.atan2(dir.x, dir.z);
      mob.velocity.copy(dir.normalize().multiplyScalar(PHANTOM_RETREAT_SPEED));
      move?.(manager, mob, dt);
      mob.state = 'retreating';
      return 'retreating';
    }
  }

  // Diving at the target.
  if (mob.swoopState === 'diving' && target?.position) {
    const dir = target.position.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(mob.mesh.position);
    const dist = dir.length();
    if (dist > 1e-6) dir.normalize();
    mob.yaw = Math.atan2(dir.x, dir.z);
    mob.pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y)));
    mob.velocity.copy(dir.multiplyScalar(PHANTOM_SWOOP_SPEED));
    move?.(manager, mob, dt);
    mob.state = 'swooping';
    // Wiki: it attacks by diving at the player to bite them.
    if (dist < PHANTOM_SWOOP.attackRange) {
      const damage = phantomDamageFor(manager?.game?.difficulty ?? 'normal');
      if (damage > 0) target.takeDamage?.(damage, mob.mesh.position, 'phantom');
      mob.swoopState = 'retreating';
      mob.swoopTimer = 0;
      return 'bit';
    }
    return 'diving';
  }

  // Idle circling around the anchor.
  if (!mob.anchorPos) {
    mob.anchorPos = target?.position
      ? phantomAnchorFor(target.position, random)
      : mob.mesh.position.clone();
  }
  mob.circlePhase = (mob.circlePhase ?? random() * Math.PI * 2) + dt * 0.7;
  const aim = phantomCirclePosition(mob.anchorPos, mob.circlePhase, PHANTOM_CIRCLE.horizontalMin);
  const dir = aim.sub(mob.mesh.position);
  const dist = dir.length();
  if (dist > 1e-6) {
    dir.normalize();
    mob.yaw = Math.atan2(dir.x, dir.z);
    mob.pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y)));
  }
  mob.velocity.copy(dir.multiplyScalar(3.5));
  move?.(manager, mob, dt);
  mob.state = 'circling';

  // Count down to the next swoop.
  mob.swoopTimer = (mob.swoopTimer ?? rollPhantomSwoopDelay(random)) - dt;
  if (mob.swoopTimer <= 0 && target) {
    startPhantomSwoop(mob);
    return 'swooping';
  }
  return 'circling';
}

/**
 * A phantom is hurt mid-swoop.
 *
 * Wiki: "If stopped or hurt during this action, the phantom retreats back to its original elevation."
 */
export function onPhantomHurt(mob) {
  if (!isPhantom(mob)) return false;
  if (mob.swoopState === 'diving') {
    mob.swoopState = 'retreating';
    return true;
  }
  return false;
}

/**
 * The phantom's death loot.
 *
 * Wiki: 0-1 phantom membrane, with Looting adding 0-1 more, and 5 XP. Baby phantoms do not exist.
 */
export function phantomDrops(mob, random = Math.random) {
  if (!isPhantom(mob)) return [];
  const rows = [];
  const base = random() < 0.5 ? 1 : 0;
  const looting = Math.max(0, Math.floor(mob.lootingLevel ?? 0));
  const bonus = looting > 0 && random() < 0.5 * looting ? 1 : 0;
  const total = base + bonus;
  if (total > 0) rows.push(['phantom_membrane', false, total, total]);
  return rows;
}

/** Wiki: a flat 5 XP when killed by a player or a tamed wolf. */
export function phantomXp(mob) {
  if (!isPhantom(mob)) return 0;
  return 5;
}

/**
 * Build a phantom's wings so the shared flight helper can flap them.
 *
 * `moveFlyingMob` writes `mob.wings.left.rotation.z` and `...right.rotation.z`, so a single
 * undivided wing mesh freezes the mob. This returns the shape that contract needs, which is the trap
 * the bat fell into.
 */
export function createPhantomWings(material, body) {
  const wingGeo = new THREE.BoxGeometry(0.9, 0.06, 0.5);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, 0, 0);
    const wing = new THREE.Mesh(wingGeo, material);
    wing.position.set(side * 0.45, 0, 0);
    pivot.add(wing);
    body.add(pivot);
    wings.push({ pivot, wing, side, rotation: pivot.rotation });
  }
  wings.left = wings[0];
  wings.right = wings[1];
  return wings;
}

/** The emissive eyes stay visible under Invisibility, as the wiki notes. */
export function posePhantom(phantom) {
  if (!phantom) return;
  if (phantom.eyeMeshes) {
    for (const eye of phantom.eyeMeshes) {
      if (eye.material) eye.material.visible = true;
    }
  }
  // A diving phantom folds its wings back.
  if (phantom.wings && phantom.swoopState === 'diving') {
    for (const w of phantom.wings) {
      if (!w?.pivot) continue;
      w.pivot.rotation.z = w.side * -1.2;
    }
  }
}
