import * as THREE from 'three';

/**
 * Bat rules and model.
 *
 * Reference: https://minecraft.wiki/w/Bat
 *
 * The bat is the game's only ambient mob. It is defined by three things beyond its stats: it
 * hangs upside down from the underside of a solid block when idle, it flees when a player comes
 * near even while hanging, and it despawns past 32 blocks.
 */

/** Wiki: 6 HP. */
export const BAT_HEALTH = 6;

/** Wiki: 0.5 wide x 0.9 tall. */
export const BAT_DIMENSIONS = { width: 0.5, height: 0.9 };

/**
 * Wiki: bats drop no items and no experience.
 *
 * Expressed explicitly, and asserted, because "drops nothing" is otherwise indistinguishable
 * from a mob nobody wired up — the same trap as the silverfish and endermite.
 */
export const BAT_DROPS = [];

/** Wiki: a bat disturbs and flies away when a player comes near it, even while hanging. */
export const BAT_FLEE_RANGE = 4;

/** Wiki: bats despawn when over 32 blocks away from the player. */
export const BAT_DESPAWN_RANGE = 32;

/** How long a bat hangs before deciding to fly again, in seconds. */
export const BAT_HANG_SECONDS = { min: 4, max: 12 };

/** How long a bat flies before finding somewhere to hang, in seconds. */
export const BAT_FLY_SECONDS = { min: 3, max: 9 };

/** True when the mob is a bat. */
export function isBat(mob) {
  return mob?.type === 'bat';
}

/** Wiki: bats drop nothing at all. */
export function batDrops() {
  return [];
}

/**
 * The block a hanging bat would attach to.
 *
 * A hanging bat's back is against the underside of a block, so the probe is taken just above the
 * top of the bat's own hitbox rather than a fixed distance above its feet.
 */
function hangProbe(manager, mob) {
  const above = mob.mesh.position.clone();
  above.y += Math.max(0.25, (mob.height ?? BAT_DIMENSIONS.height)) + 0.05;
  return { x: Math.floor(above.x), y: Math.floor(above.y), z: Math.floor(above.z), above };
}

/**
 * Whether a bat can hang from the block above it.
 *
 * Wiki: bats hang "on the underside of a solid block when idle, though they cannot hang on
 * transparent or non-solid blocks". `isBlockSolid` is the same predicate the rest of the engine
 * uses, so a glass pane or a slab correctly refuses.
 */
export function canHang(manager, mob) {
  if (!isBat(mob) || !mob.mesh) return false;
  const { x, y, z } = hangProbe(manager, mob);
  return !!manager.isBlockSolid?.(x, y, z);
}

/**
 * Disturb a hanging bat, which makes it take off.
 *
 * Wiki: "if a player approaches a bat hanging upside down, even if the player is invisible, it
 * flies away". Invisibility is deliberately not consulted, because the wiki says it does not
 * matter.
 */
export function disturbBat(mob) {
  if (!isBat(mob)) return false;
  mob.isHanging = false;
  mob.hangTimer = 0;
  mob.flyTimer = flySeconds();
  return true;
}

/**
 * Attach a bat to the underside of the block above it.
 *
 * The bat is moved flush against the block, which is what makes the hanging pose read.
 */
export function startHanging(manager, mob) {
  if (!isBat(mob) || !mob.mesh) return false;
  const { above } = hangProbe(manager, mob);
  // Snap the bat's top against the underside of the block: the block's floor is at `y`.
  const blockBottom = Math.floor(above.y);
  mob.mesh.position.y = blockBottom - (mob.height ?? BAT_DIMENSIONS.height);
  mob.velocity.set(0, 0, 0);
  mob.pitch = 0;
  mob.isHanging = true;
  mob.flyTimer = 0;
  mob.hangTimer = BAT_HANG_SECONDS.min + Math.random() * (BAT_HANG_SECONDS.max - BAT_HANG_SECONDS.min);
  return true;
}

/** A randomised flight duration. */
export function flySeconds(random = Math.random) {
  return BAT_FLY_SECONDS.min + random() * (BAT_FLY_SECONDS.max - BAT_FLY_SECONDS.min);
}

/**
 * Fly around aimlessly and pick somewhere to hang.
 *
 * Wiki: bats "often fly around aimlessly, squeaking randomly", and land to hang when they can.
 * Returns true when the bat acted this tick.
 */
export function updateBatFlight(manager, mob, dt, player) {
  if (!isBat(mob) || mob.health <= 0 || !mob.mesh) return false;

  // Wiki: a nearby player disturbs a bat whether it is flying or hanging.
  if (player?.position && mob.mesh.position.distanceTo(player.position) < BAT_FLEE_RANGE) {
    if (mob.isHanging) disturbBat(mob);
    // Fly away from the player rather than merely stopping the hang.
    const away = mob.mesh.position.clone().sub(player.position);
    away.y = 0;
    if (away.lengthSq() > 1e-6) {
      away.normalize();
      mob.yaw = Math.atan2(away.x, away.z);
      mob.velocity.x = away.x * 2.2;
      mob.velocity.z = away.z * 2.2;
      mob.velocity.y = 1.6;
    }
    mob.isFleeing = true;
    return true;
  }
  mob.isFleeing = false;

  if (mob.isHanging) {
    mob.hangTimer = (mob.hangTimer || 0) - dt;
    mob.velocity.set(0, 0, 0);
    // A hanging bat stays attached; if the block above is gone it drops off.
    if (!canHang(manager, mob) || mob.hangTimer <= 0) disturbBat(mob);
    return true;
  }

  mob.flyTimer = (mob.flyTimer || flySeconds()) - dt;
  if (mob.flyTimer <= 0) {
    // Try to settle under a solid block; otherwise keep flying and look again shortly.
    if (canHang(manager, mob)) {
      startHanging(manager, mob);
      return true;
    }
    mob.flyTimer = 0.5 + Math.random();
  }

  // Aimless flight: wander the heading, with the random vertical bobbing that makes the flight
  // path resemble the wiki's gif rather than a straight line.
  mob.wanderTimer = (mob.wanderTimer || 0) - dt;
  if (mob.wanderTimer <= 0) {
    mob.wanderTimer = 1 + Math.random() * 2;
    mob.yaw += (Math.random() - 0.5) * 2.4;
    mob.targetPitch = (Math.random() - 0.5) * 0.6;
  }
  mob.pitch = (mob.pitch || 0) + ((mob.targetPitch ?? 0) - (mob.pitch || 0)) * Math.min(1, dt * 3);

  const speed = 1.6;
  mob.velocity.x = Math.sin(mob.yaw) * Math.cos(mob.pitch) * speed;
  mob.velocity.z = Math.cos(mob.yaw) * Math.cos(mob.pitch) * speed;
  mob.velocity.y = -Math.sin(mob.pitch) * speed;

  // Keep it off the floor by refusing to descend into a solid block.
  const below = mob.mesh.position.clone();
  below.y -= 1;
  if (manager.isBlockSolid?.(Math.floor(below.x), Math.floor(below.y), Math.floor(below.z)) && mob.velocity.y < 0) {
    mob.velocity.y = Math.abs(mob.velocity.y);
    mob.targetPitch = 0.3;
  }
  return true;
}

/**
 * Remove a bat that has drifted past the despawn range.
 *
 * Wiki: "Bats despawn when over 32 blocks away from the player." Like the endermite's lifetime
 * despawn this removes the mob without loot or XP, because it did not die.
 *
 * Returns true when the bat was removed.
 */
export function updateBatDespawn(manager, mob, player) {
  if (!isBat(mob) || mob.health <= 0 || !player?.position) return false;
  // A named bat is persistent, matching how naming a mob normally works.
  if (mob.persistent || mob.name !== 'Bat') return false;
  if (mob.mesh.position.distanceTo(player.position) <= BAT_DESPAWN_RANGE) return false;

  manager.removeDebugLabel?.(mob);
  mob.mesh?.removeFromParent?.();
  const index = manager.mobs.indexOf(mob);
  if (index >= 0) manager.mobs.splice(index, 1);
  mob.despawned = true;
  return true;
}

/**
 * Bat model: a small furry body with large leathery wings and pointed ears.
 *
 * The wings are separate meshes so they can flap, and the whole model is authored to the wiki's
 * 0.5 x 0.9 hitbox.
 */
export function createBatModel(bodyMat, wingMat, earMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.3), bodyMat);
  body.position.set(0, 0.4, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.14), bodyMat);
  head.position.set(0, 0.44, 0.2);
  group.add(head);

  // Two pointed ears.
  const earGeo = new THREE.BoxGeometry(0.05, 0.12, 0.03);
  const ears = [-1, 1].map((side) => {
    const ear = new THREE.Mesh(earGeo, earMat);
    ear.position.set(side * 0.06, 0.13, -0.02);
    ear.rotation.z = side * 0.25;
    head.add(ear);
    return ear;
  });

  // Small dark eyes.
  const eyeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.02);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, earMat);
    eye.position.set(side * 0.05, 0.01, 0.08);
    head.add(eye);
    return eye;
  });

  // Two wings, each hinged at the shoulder so the flap rotates about the body.
  //
  // The shape is an array that also carries `left`/`right` aliases, because the shared
  // `moveFlyingMob` helper owns wing flapping and addresses the wings as `mob.wings.left` and
  // `mob.wings.right`. Matching that contract means the bat inherits the shared flight animation
  // instead of duplicating it, and it is also why this is not a plain pair of objects.
  const wingGeo = new THREE.BoxGeometry(0.5, 0.03, 0.34);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.11, 0.46, 0);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(side * 0.25, 0, -0.05);
    pivot.add(wing);
    group.add(pivot);
    // `moveFlyingMob` writes `mob.wings.left.rotation.z`, so the wrapper's `rotation` is the
    // pivot's rotation rather than the mesh's: rotating the pivot swings the whole wing about
    // the shoulder, which is the motion the shared helper is trying to produce.
    return { pivot, wing, side, rotation: pivot.rotation };
  });
  wings.left = wings[0];
  wings.right = wings[1];

  return { group, body, head, ears, eyes, wings };
}

/**
 * The hanging pose.
 *
 * Wing flapping while airborne is owned by the shared `moveFlyingMob` helper; this function adds
 * only what is bat-specific: folding the wings against the body and turning the body upside down
 * while hanging.
 */
export function poseBatWings(bat, phase = 0) {
  const wings = bat?.wings;
  if (!wings) return;
  const hanging = !!bat.isHanging;
  if (!hanging) {
    // Upright while flying; the flap itself is applied by moveFlyingMob.
    if (bat.mesh) bat.mesh.rotation.x = 0;
    return;
  }
  for (const wing of wings) {
    // Folded back along the body.
    wing.pivot.rotation.z = wing.side * -1.35;
    wing.pivot.rotation.x = 0;
  }
  // Nose-down, which is what makes a hanging bat read as upside down.
  if (bat.mesh) bat.mesh.rotation.x = Math.PI;
}
