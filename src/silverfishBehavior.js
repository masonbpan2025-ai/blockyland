import * as THREE from 'three';

/**
 * Silverfish rules and model.
 *
 * Reference: https://minecraft.wiki/w/Silverfish
 *
 * A silverfish is a small hostile arthropod defined by three things: it is tiny (0.4 x 0.3),
 * it drops nothing but XP, and being hit calls other silverfish in a wide area to help.
 */

/** Wiki: 8 HP (reduced from 20 in Beta 1.9-pre2). */
export const SILVERFISH_HEALTH = 8;

/** Wiki: 0.4 wide x 0.3 tall, one of the smallest mobs. */
export const SILVERFISH_DIMENSIONS = { width: 0.4, height: 0.3 };

/** Wiki: 5 XP when killed by a player or tamed wolf, and no item drops. */
export const SILVERFISH_XP = 5;

/**
 * Wiki: melee damage is 1 on Easy and Normal, 1.5 on Hard.
 */
export const SILVERFISH_DAMAGE = { peaceful: 0, easy: 1, normal: 1, hard: 1.5 };

/** Wiki: attacking one calls others within a 21x11x21 area. */
export const SILVERFISH_ALERT_RANGE = { x: 21, y: 11, z: 21 };

/** How long an alerted silverfish stays angry, in seconds. */
export const SILVERFISH_ANGER_SECONDS = 20;

/** How close a silverfish must be to bite. */
export const SILVERFISH_ATTACK_REACH = 0.9;

/** Seconds between bites. */
export const SILVERFISH_ATTACK_COOLDOWN = 1.0;

/** True when the mob is a silverfish. */
export function isSilverfish(mob) {
  return mob?.type === 'silverfish';
}

/** Melee damage at the given difficulty. */
export function silverfishDamageFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(SILVERFISH_DAMAGE, key) ? SILVERFISH_DAMAGE[key] : SILVERFISH_DAMAGE.normal;
}

/**
 * Wiki: "Silverfish have no drops other than 5 experience points when killed by a player or
 * tamed wolf."
 *
 * Expressed as an explicit empty table rather than simply being absent, so the "no drops"
 * rule is asserted rather than being indistinguishable from a mob nobody wired up.
 */
export function silverfishDrops() {
  return [];
}

/**
 * Call nearby silverfish to help, as attacking one does.
 *
 * Wiki: "Silverfish attack players and snow golems and call other silverfish in the area upon
 * being hit... they cause other silverfish within a 21x11x21 area to break out of their
 * infested blocks."
 *
 * Returns the silverfish that responded, so the caller can count or assert them.
 */
export function alertSilverfish(manager, mob, attacker = null, seconds = SILVERFISH_ANGER_SECONDS) {
  const alerted = [];
  if (!manager?.mobs || !isSilverfish(mob)) return alerted;
  const origin = mob.mesh.position;
  const { x: rx, y: ry, z: rz } = SILVERFISH_ALERT_RANGE;
  for (const other of manager.mobs) {
    if (other === mob || !isSilverfish(other) || other.health <= 0) continue;
    const p = other.mesh.position;
    // The wiki gives the area as a cube around the hit silverfish.
    if (Math.abs(p.x - origin.x) > rx / 2) continue;
    if (Math.abs(p.y - origin.y) > ry / 2) continue;
    if (Math.abs(p.z - origin.z) > rz / 2) continue;
    other.angerTimer = Math.max(other.angerTimer || 0, seconds);
    other.attacker = attacker || mob.attacker || null;
    alerted.push(other);
  }
  return alerted;
}

/** Tick an anger timer down. */
export function updateSilverfishAnger(mob, dt) {
  if (!isSilverfish(mob)) return;
  if (mob.angerTimer > 0) mob.angerTimer = Math.max(0, mob.angerTimer - dt);
}

/**
 * Anger a silverfish. Silverfish are always hostile, so unlike the spiders this is not a
 * switching state — it only refreshes the retaliation window.
 */
export function angerSilverfish(mob, attacker, seconds = SILVERFISH_ANGER_SECONDS) {
  if (!isSilverfish(mob)) return false;
  mob.angerTimer = Math.max(mob.angerTimer || 0, seconds);
  mob.attacker = attacker || mob.attacker || null;
  return true;
}

/**
 * Chase and bite.
 *
 * Wiki: "Silverfish pathfind toward the player and can see the player through walls", so the
 * chase is not gated on line of sight — only on range. Returns true when it acted.
 */
export function updateSilverfishHunt(manager, mob, dt, player) {
  if (!isSilverfish(mob) || !player?.position || mob.health <= 0) return false;
  mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

  const dir = player.position.clone().sub(mob.mesh.position);
  dir.y = 0;
  const dist = dir.length();
  if (dist < 0.001) return false;
  dir.normalize();

  const targetYaw = Math.atan2(dir.x, dir.z);
  const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
  mob.yaw += turn * Math.min(1, 9 * dt);

  if (dist > SILVERFISH_ATTACK_REACH) {
    const speed = 1.9;
    mob.velocity.x = Math.sin(mob.yaw) * speed;
    mob.velocity.z = Math.cos(mob.yaw) * speed;
  } else {
    mob.velocity.x *= 0.5;
    mob.velocity.z *= 0.5;
    if (mob.hitCooldown <= 0) {
      const damage = silverfishDamageFor(manager?.game?.difficulty);
      if (damage > 0) player.takeDamage?.(damage, mob.mesh.position, mob.type);
      mob.hitCooldown = SILVERFISH_ATTACK_COOLDOWN;
    }
  }
  return true;
}

/**
 * Silverfish model: a small segmented grey bug with visible antennae and a tapering body.
 *
 * Built as three body segments so the crawl animation reads, rather than a single box.
 */
export function createSilverfishModel(bodyMat, eyeMat) {
  const group = new THREE.Group();

  // Head.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.16), bodyMat);
  head.position.set(0, 0.09, 0.19);
  group.add(head);

  // Eyes: two small dark dots.
  const eyeGeo = new THREE.BoxGeometry(0.035, 0.035, 0.03);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.045, 0.02, 0.08);
    head.add(eye);
    return eye;
  });

  // Antennae, which is what makes the silhouette read as a silverfish rather than a beetle.
  const antennaGeo = new THREE.BoxGeometry(0.02, 0.02, 0.22);
  for (const side of [-1, 1]) {
    const antenna = new THREE.Mesh(antennaGeo, bodyMat);
    antenna.position.set(side * 0.05, 0.09, 0.2);
    antenna.rotation.y = side * 0.5;
    antenna.rotation.x = -0.25;
    head.add(antenna);
  }

  // Three tapering body segments.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.26), bodyMat);
  body.position.set(0, 0.08, 0.0);
  group.add(body);

  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.2), bodyMat);
  mid.position.set(0, 0.075, -0.2);
  group.add(mid);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), bodyMat);
  tail.position.set(0, 0.07, -0.37);
  group.add(tail);

  // Six small legs, three per side.
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

  return { group, head, body, mid, tail, legs, eyes };
}

/** Scuttle animation: the legs alternate in two groups, like the spider's tripods. */
export function poseSilverfishLegs(silverfish, phase) {
  const legs = silverfish?.legs;
  if (!legs) return;
  legs.forEach((leg, index) => {
    const group = index % 2;
    const swing = Math.sin(phase + group * Math.PI);
    leg.mesh.position.x = leg.baseX + leg.side * swing * 0.035;
    leg.mesh.position.y = 0.04 + Math.abs(swing) * 0.015;
  });
}
