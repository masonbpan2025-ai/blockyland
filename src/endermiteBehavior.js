import * as THREE from 'three';

/**
 * Endermite rules and model.
 *
 * Reference: https://minecraft.wiki/w/Endermite
 *
 * An endermite is the smallest hostile mob by hitbox. It is defined by three things beyond
 * its stats: it spawns from a thrown ender pearl, it despawns after two minutes regardless of
 * distance, and endermen hunt it.
 */

/** Wiki: 8 HP. */
export const ENDERMITE_HEALTH = 8;

/** Wiki: 0.4 wide x 0.3 tall. It is the smallest hostile mob by hitbox. */
export const ENDERMITE_DIMENSIONS = { width: 0.4, height: 0.3 };

/** Wiki: 3 XP, and no item drops. */
export const ENDERMITE_XP = 3;

/** Wiki: 2 damage on Easy and Normal, 3 on Hard. */
export const ENDERMITE_DAMAGE = { peaceful: 0, easy: 2, normal: 2, hard: 3 };

/** Wiki: endermites attack players within 16 blocks. */
export const ENDERMITE_SIGHT_RANGE = 16;

/** Wiki: a 5% chance to spawn when a player-thrown ender pearl lands. */
export const ENDERMITE_PEARL_SPAWN_CHANCE = 0.05;

/**
 * Wiki: an endermite despawns within 2 minutes unless named with a name tag.
 *
 * The wiki's NBT puts `Lifetime` at around 2400 ticks, which is 120 seconds.
 */
export const ENDERMITE_LIFETIME_SECONDS = 120;

/** Wiki: endermen attack endermites within 64 blocks. */
export const ENDERMAN_ENDERMITE_RANGE = 64;

/** Wiki: endermites also fight back against endermen. */
export const ENDERMITE_ATTACK_REACH = 0.9;
export const ENDERMITE_ATTACK_COOLDOWN = 1.0;

/** True when the mob is an endermite. */
export function isEndermite(mob) {
  return mob?.type === 'endermite';
}

/** Melee damage at the given difficulty. */
export function endermiteDamageFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(ENDERMITE_DAMAGE, key) ? ENDERMITE_DAMAGE[key] : ENDERMITE_DAMAGE.normal;
}

/**
 * Wiki: endermites drop 3 XP and no items.
 *
 * Explicit rather than absent, so "no drops" is asserted instead of being indistinguishable
 * from a mob nobody wired up.
 */
export function endermiteDrops() {
  return [];
}

/**
 * Should a thrown ender pearl produce an endermite?
 *
 * Wiki: 5% chance when a player-thrown ender pearl lands. `random` is injectable so the roll
 * can be asserted instead of sampled.
 */
export function rollEndermiteSpawn(random = Math.random) {
  return random() < ENDERMITE_PEARL_SPAWN_CHANCE;
}

/**
 * Spawn an endermite for a landed ender pearl, if the roll succeeds.
 *
 * Wiki: it spawns at the player's original position when the pearl lands (Java Edition), or at
 * the landing site (Bedrock). The Java behaviour is implemented; `spawnAt` is explicit so the
 * caller decides which convention applies rather than inheriting a silent choice.
 *
 * Returns the endermite, or null when the roll failed.
 */
export function spawnEndermiteForPearl(manager, spawnAt, { random = Math.random, force = false } = {}) {
  if (!manager?.spawnMob || !spawnAt) return null;
  if (!force && !rollEndermiteSpawn(random)) return null;
  const mob = manager.spawnMob('endermite', spawnAt.x, spawnAt.y, spawnAt.z);
  if (mob) mob.fromEnderPearl = true;
  return mob;
}

/**
 * Lifetime countdown: an endermite despawns after two minutes unless it has been named.
 *
 * Wiki: "An endermite despawns within 2 minutes, regardless of the player's distance, unless
 * it has been named with a name tag." Returns true when the mob was removed this tick.
 */
export function updateEndermiteLifetime(manager, mob, dt) {
  if (!isEndermite(mob) || mob.health <= 0) return false;
  // A named endermite is persistent, so its lifetime does not run down at all.
  if (mob.persistent || mob.customName || mob.name !== 'Endermite') {
    mob.lifetime = 0;
    return false;
  }
  mob.lifetime = (mob.lifetime || 0) + dt;
  if (mob.lifetime < ENDERMITE_LIFETIME_SECONDS) return false;

  // Remove it the same way a death would clean up, but without dropping loot or XP.
  manager.removeDebugLabel?.(mob);
  mob.mesh?.removeFromParent?.();
  const index = manager.mobs.indexOf(mob);
  if (index >= 0) manager.mobs.splice(index, 1);
  mob.despawned = true;
  return true;
}

/**
 * Endermen hunt endermites.
 *
 * Wiki: "Endermen attack endermites in line of sight within 64 blocks", and endermites attack
 * endermen back. This is the rule the assessment lists as blocked on endermites existing, so
 * it is implemented here rather than left as a documented gap.
 *
 * Returns the pairs that engaged, so the caller can assert the behaviour.
 */
export function updateEndermanEndermiteAggression(manager) {
  const engaged = [];
  if (!manager?.mobs) return engaged;
  for (const enderman of manager.mobs) {
    if (enderman.type !== 'enderman' || enderman.health <= 0) continue;
    for (const mite of manager.mobs) {
      if (!isEndermite(mite) || mite.health <= 0) continue;
      if (enderman.mesh.position.distanceTo(mite.mesh.position) > ENDERMAN_ENDERMITE_RANGE) continue;
      // The wiki says line of sight, so a wall between them prevents the hunt.
      if (manager.isBlockSolid && !hasLineOfSight(manager, enderman, mite)) continue;
      enderman.endermiteTarget = mite;
      mite.endermanTarget = enderman;
      engaged.push({ enderman, mite });
    }
  }
  return engaged;
}

/**
 * Sample the straight line between two mobs for a solid block.
 *
 * The sample is taken at **body height** rather than at the mobs' feet. A mob's position is
 * its feet, which on flat ground sits inside the floor block below it, so a foot-level ray
 * would report "no line of sight" for every pair standing on the same surface — which is
 * exactly what happened the first time this was written.
 */
function hasLineOfSight(manager, a, b) {
  const from = a.mesh.position.clone();
  const to = b.mesh.position.clone();
  // Aim at the middle of each body rather than at the ground under it.
  from.y += (a.height ?? 0.3) * 0.5;
  to.y += (b.height ?? 0.3) * 0.5;
  const delta = to.clone().sub(from);
  const steps = Math.ceil(delta.length() * 2);
  // The endpoints themselves are the mobs' own tiles, so they must not be sampled.
  for (let i = 1; i < steps; i++) {
    const p = from.clone().addScaledVector(delta, i / steps);
    if (manager.isBlockSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return false;
  }
  return true;
}

/**
 * Chase and bite, preferring an enderman it is fighting and otherwise the player.
 *
 * Returns true when it acted this tick.
 */
export function updateEndermiteHunt(manager, mob, dt, player) {
  if (!isEndermite(mob) || mob.health <= 0) return false;
  mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
  // Attacks run on their own timer: `hitCooldown` is the hurt-immunity window, and sharing it made the mob immune
  // to the player for as long as it kept biting.
  mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);

  // Wiki: endermites attack endermen. Prefer a live enderman target.
  if (mob.endermanTarget && mob.endermanTarget.health > 0) {
    const target = mob.endermanTarget.mesh.position;
    const dist = mob.mesh.position.distanceTo(target);
    if (dist < ENDERMITE_ATTACK_REACH && mob.attackCooldown <= 0) {
      manager.damageMob?.(mob.endermanTarget, endermiteDamageFor(manager?.game?.difficulty), mob.mesh.position, false, mob);
      mob.attackCooldown = ENDERMITE_ATTACK_COOLDOWN;
    } else {
      steerToward(mob, target, 2.2, dt);
    }
    return true;
  }

  if (!player?.position) return false;
  const dist = mob.mesh.position.distanceTo(player.position);
  // Wiki: endermites attack players within 16 blocks.
  if (dist > ENDERMITE_SIGHT_RANGE) {
    mob.velocity.x *= 0.8;
    mob.velocity.z *= 0.8;
    return false;
  }
  if (dist > ENDERMITE_ATTACK_REACH) {
    steerToward(mob, player.position, 2.2, dt);
  } else {
    mob.velocity.x *= 0.5;
    mob.velocity.z *= 0.5;
    if (mob.attackCooldown <= 0) {
      const damage = endermiteDamageFor(manager?.game?.difficulty);
      if (damage > 0) player.takeDamage?.(damage, mob.mesh.position, mob.type);
      mob.attackCooldown = ENDERMITE_ATTACK_COOLDOWN;
    }
  }
  return true;
}

/** Aim at a target and set velocity, turning smoothly rather than snapping. */
function steerToward(mob, target, speed, dt) {
  const dir = target.clone().sub(mob.mesh.position);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const targetYaw = Math.atan2(dir.x, dir.z);
  const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
  mob.yaw += turn * Math.min(1, 9 * dt);
  mob.velocity.x = Math.sin(mob.yaw) * speed;
  mob.velocity.z = Math.cos(mob.yaw) * speed;
}

/**
 * Endermite model: a small purple segmented bug with an emissive eye.
 *
 * The wiki notes the original endermites reused the silverfish model with a purple texture
 * before getting a unique one, and that the eye is emissive. This is a distinct, smaller,
 * rounder body than the silverfish with a single bright eye, so the two read differently at a
 * glance.
 */
export function createEndermiteModel(bodyMat, eyeMat) {
  const group = new THREE.Group();

  // A rounder, segment-free body than the silverfish's three tapering segments.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.3), bodyMat);
  body.position.set(0, 0.09, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.14), bodyMat);
  head.position.set(0, 0.09, 0.2);
  group.add(head);

  // The single emissive eye, which the wiki calls out as glowing.
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), eyeMat);
  eye.position.set(0, 0.095, 0.275);
  head.add(eye);

  // Two short antennae.
  const antennaGeo = new THREE.BoxGeometry(0.02, 0.02, 0.16);
  for (const side of [-1, 1]) {
    const antenna = new THREE.Mesh(antennaGeo, bodyMat);
    antenna.position.set(side * 0.05, 0.1, 0.12);
    antenna.rotation.y = side * 0.55;
    antenna.rotation.x = -0.3;
    head.add(antenna);
  }

  // Six legs, as an arthropod.
  const legGeo = new THREE.BoxGeometry(0.09, 0.03, 0.03);
  const legs = [];
  for (const side of [-1, 1]) {
    for (const z of [0.08, -0.02, -0.12]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(side * 0.12, 0.04, z);
      group.add(leg);
      legs.push({ mesh: leg, side, baseX: side * 0.12 });
    }
  }

  return { group, head, body, legs, eyes: [eye] };
}

/** Scuttle animation, alternating two leg groups like the silverfish. */
export function poseEndermiteLegs(mite, phase) {
  const legs = mite?.legs;
  if (!legs) return;
  legs.forEach((leg, index) => {
    const group = index % 2;
    const swing = Math.sin(phase + group * Math.PI);
    leg.mesh.position.x = leg.baseX + leg.side * swing * 0.035;
    leg.mesh.position.y = 0.04 + Math.abs(swing) * 0.015;
  });
}
