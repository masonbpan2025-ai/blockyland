import * as THREE from 'three';

/**
 * Breeze rules: leaping movement, wind charges, and projectile deflection.
 *
 * Reference: https://minecraft.wiki/w/Breeze
 *
 * The breeze is a hostile mob defined by three things nothing else here does: it **leaps** long
 * distances instead of walking, it fires **wind charges**, and it **deflects every projectile** that
 * hits it except a wind charge. It is also the only source of breeze rods.
 */

/** Wiki: 30 HP. */
export const BREEZE_HEALTH = 30;

/** Wiki: 0.6 wide x 1.77 tall. */
export const BREEZE_DIMENSIONS = { width: 0.6, height: 1.77 };

/** Wiki: a wind charge deals 1 damage on Easy and Normal, 1.5 on Hard. */
export const WIND_CHARGE_DAMAGE = { peaceful: 0, easy: 1, normal: 1, hard: 1.5 };

/**
 * Wiki: "Before jumping, it compresses itself like a spring and can jump up to 15 blocks horizontally
 * and 5 blocks vertically. If the breeze is in lava, it can jump only one block into the air."
 */
export const BREEZE_JUMP = { horizontal: 15, vertical: 5, lavaVertical: 1, compressSeconds: 0.4 };

/** Wiki: it attempts a wind charge at a target within 16 blocks, on a 1.6 s cooldown. */
export const BREEZE_ATTACK = { range: 16, cooldown: 1.6 };

/** Wiki: it "leaps around between firing wind charges at its target", so jumps and shots interleave. */
export const BREEZE_JUMP_COOLDOWN = { min: 1.2, max: 2.6 };

/** Wiki: a wind charge is a small fast projectile. */
export const WIND_CHARGE_SPEED = 14;

/** Wiki: the burst "deals knockback but does not deal any damage by itself". */
export const WIND_CHARGE_BURST = { radius: 3, knockback: 8, upward: 4, lifetime: 3 };

/**
 * Wiki entity tags: `deflects_arrows`, `deflects_tridents`, `fall_damage_immune`,
 * `can_turn_in_boats`, `no_anger_from_wind_charge`.
 */
export const BREEZE_TRAITS = {
  deflectsArrows: true,
  deflectsTridents: true,
  fallDamageImmune: true,
  canTurnInBoats: true,
  noAngerFromWindCharge: true
};

/**
 * Wiki: "Breezes do not retaliate if attacked by mobs that can spawn from trial spawners" — zombies,
 * husks, skeletons, bogged, strays, spiders, cave spiders and slimes. So being hit by one of these must
 * NOT set the breeze hostile, which is a real behavioural rule rather than an omission.
 */
export const BREEZE_NON_RETALIATION = [
  'zombie', 'husk', 'skeleton', 'bogged', 'stray', 'spider', 'cave_spider', 'slime'
];

/** Wiki: breezes "actively pursue and attack iron golems". */
export const BREEZE_PREFERRED_PREY = ['iron_golem'];

/** Wiki: 1-2 breeze rods, with Looting adding 1-2 more, and a flat 10 XP. */
export const BREEZE_ROD_DROP = { min: 1, max: 2 };

/** Wiki: the eyebrows and surrounding wind stay visible under Invisibility. */
export const BREEZE_ALWAYS_VISIBLE = ['eyebrows', 'wind'];

/** Body colours: a pale blue-white body with darker rods and glowing eyes. */
export const BREEZE_COLORS = { body: 0xcdd9e5, rod: 0x8fa3b8, wind: 0xe8f1fa, eye: 0x2b3a4a };

/** True when the mob is a breeze. */
export function isBreeze(mob) {
  return mob?.type === 'breeze';
}

/** Wind charge damage at a difficulty. */
export function windChargeDamageFor(difficulty) {
  const key = Object.hasOwn(WIND_CHARGE_DAMAGE, difficulty ?? '') ? difficulty : 'normal';
  return WIND_CHARGE_DAMAGE[key];
}

/**
 * Roll the next jump delay.
 */
export function rollBreezeJumpDelay(random = Math.random) {
  const { min, max } = BREEZE_JUMP_COOLDOWN;
  return min + random() * (max - min);
}

/**
 * The velocity for a leap toward a target.
 *
 * Wiki: "can jump up to 15 blocks horizontally and 5 blocks vertically", and only one block up in lava.
 * The horizontal distance is capped, and the vertical component is chosen to clear the arc, so the leap
 * is bounded rather than a straight line to the target.
 */
export function breezeJumpVelocity(mob, targetPos, { inLava = false, gravity = 18 } = {}) {
  const from = mob.mesh.position;
  const flat = new THREE.Vector3(targetPos.x - from.x, 0, targetPos.z - from.z);
  const distance = flat.length();
  const horizontal = Math.min(distance, BREEZE_JUMP.horizontal);
  if (flat.lengthSq() > 1e-9) flat.normalize();
  const maxUp = inLava ? BREEZE_JUMP.lavaVertical : BREEZE_JUMP.vertical;

  // A short leap does not need the full launch; scale the vertical with the distance so a 2-block hop
  // does not overshoot.
  const rise = Math.min(maxUp, Math.max(1, distance * 0.35));
  // v = sqrt(2*g*h) gives the launch speed that just reaches `rise`.
  const vy = Math.sqrt(2 * gravity * rise);
  // Time in the air, which sets the horizontal speed needed to cover `horizontal`.
  const airtime = (2 * vy) / gravity;
  const speed = airtime > 0 ? horizontal / airtime : 0;
  return new THREE.Vector3(flat.x * speed, vy, flat.z * speed);
}

/**
 * Whether a breeze should leap rather than keep attacking.
 *
 * Wiki: it leaps around between firing, and "avoids jumping into dangerous blocks or air" (24w13a).
 * Returns true when the leap is safe.
 */
export function canBreezeLeap(manager, mob, targetPos) {
  if (!isBreeze(mob)) return false;
  // Sample the midpoint of the arc: if the ground below it is lava or there is nothing to land on, the
  // leap would be into danger.
  const from = mob.mesh.position;
  const midX = Math.floor((from.x + targetPos.x) / 2);
  const midZ = Math.floor((from.z + targetPos.z) / 2);
  const groundY = manager?.world?.surfaceHeightAt?.(midX, midZ);
  if (typeof groundY !== 'number') return true;
  const landing = manager?.world?.getVoxel?.(Math.floor(targetPos.x), groundY + 1, Math.floor(targetPos.z));
  const lava = manager?.world?.getVoxel?.(midX, Math.floor(from.y), midZ);
  if (lava === 10 || lava === 11) return false;
  return landing !== undefined;
}

/**
 * Pick a wind charge target.
 *
 * Wiki: it shoots a player or enemy within 16 blocks, and pursues iron golems. Returns the target or null.
 */
export function findBreezeTarget(manager, mob, player, { difficulty = 'normal' } = {}) {
  if (!isBreeze(mob) || difficulty === 'peaceful') return null;
  const from = mob.mesh.position;
  let best = null;
  let bestDist = BREEZE_ATTACK.range;

  if (player?.position && player.gamemode !== 'creative') {
    const d = from.distanceTo(player.position);
    if (d < bestDist) { bestDist = d; best = player; }
  }
  for (const other of manager?.mobs ?? []) {
    if (other === mob || other.health <= 0) continue;
    if (!BREEZE_PREFERRED_PREY.includes(other.type)) continue;
    const d = from.distanceTo(other.mesh.position);
    // Wiki: it actively pursues iron golems, so they win ties.
    if (d <= bestDist) { bestDist = d; best = other; }
  }
  return best;
}

/**
 * Whether a breeze retaliates against an attacker.
 *
 * Wiki: it does not retaliate against the trial-spawner mobs. It is still hostile to players.
 */
export function breezeRetaliates(attacker) {
  if (!attacker) return true;
  const type = attacker.type ?? (attacker === 'player' ? 'player' : null);
  if (type === 'player') return true;
  return !BREEZE_NON_RETALIATION.includes(type);
}

/**
 * Whether a projectile is deflected.
 *
 * Wiki: "Breezes automatically deflect all projectiles that hit them except wind charges. Unlike
 * shields, deflected projectiles maintain the same velocity, and can potentially harm the attacker."
 */
export function shouldDeflect(projectile) {
  if (!projectile) return false;
  if (projectile.isWindCharge) return false;
  return true;
}

/**
 * The deflection for a projectile hitting a breeze.
 *
 * Wiki: "deflected projectiles maintain the same velocity, and can potentially harm the attacker", so the
 * SPEED is preserved and the direction is reversed.
 *
 * The reflection uses the projectile's APPROACH direction — the reverse of its own velocity — rather than
 * the vector from the projectile to the breeze's origin. That distinction matters: a mob's hitbox is
 * tall, so an arrow aimed level at a breeze's chest arrives from *above* the origin, and reflecting about
 * that vector sent the arrow downward and still backward instead of back at the shooter. Reflecting about
 * the approach direction gives `-v` for a head-on hit, which is what the wiki describes.
 *
 * Note the clone: `velocity` is normalised in place below, so the caller's vector must not be the one
 * being mutated.
 */
export function deflectVelocity(projectile, breeze) {
  const velocity = projectile.velocity;
  if (!velocity || velocity.lengthSq() < 1e-12) return null;
  const approach = velocity.clone().normalize().negate();
  const reversed = velocity.clone().sub(approach.multiplyScalar(2 * velocity.dot(approach)));
  // Guard against a degenerate reflection, which would leave the arrow stuck inside the breeze.
  if (reversed.lengthSq() < 1e-12 || reversed.dot(velocity) > 0) return velocity.clone().negate();
  return reversed;
}

/**
 * Advance a breeze's leap cycle.
 *
 * Wiki: it compresses into a spring, leaps up to 15 blocks, then slides on landing, and leaps between
 * firing wind charges at its target.
 *
 * Returns 'compressing', 'leaping', 'landed' or null.
 */
export function updateBreezeLeap(manager, mob, dt, target, { random = Math.random, gravity = 18 } = {}) {
  if (!isBreeze(mob)) return null;

  if (mob.leapState === 'compressing') {
    mob.compressTimer -= dt;
    // NOTE: the squash itself is applied by `poseBreeze`, which is the single owner of `mesh.scale`.
    // Writing it here too meant the pose overwrote it every frame.
    if (mob.compressTimer <= 0) {
      const targetPos = target?.position ?? target?.mesh?.position;
      const inLava = mob.inLava === true;
      mob.velocity.copy(
        targetPos
          ? breezeJumpVelocity(mob, targetPos, { inLava, gravity })
          : new THREE.Vector3(Math.sin(mob.yaw) * 6, Math.sqrt(2 * gravity * 3), Math.cos(mob.yaw) * 6)
      );
      mob.onGround = false;
      mob.leapState = 'leaping';
      return 'leaping';
    }
    return 'compressing';
  }

  if (!mob.onGround) {
    // Airborne: the shared mover applies the velocity; this only tracks the state.
    mob.leapState = 'leaping';
    return null;
  }

  if (mob.leapState === 'leaping') {
    mob.leapState = 'sliding';
    mob.slideTimer = 0.35;
    return 'landed';
  }

  if (mob.leapState === 'sliding') {
    mob.slideTimer -= dt;
    // Wiki: the breeze slides on landing.
    mob.velocity.x *= 0.85;
    mob.velocity.z *= 0.85;
    if (mob.slideTimer <= 0) mob.leapState = 'idle';
    return null;
  }

  // Idle: count down to the next compress.
  mob.jumpCooldown = (mob.jumpCooldown ?? rollBreezeJumpDelay(random)) - dt;
  if (mob.jumpCooldown <= 0) {
    mob.jumpCooldown = rollBreezeJumpDelay(random);
    mob.leapState = 'compressing';
    mob.compressTimer = BREEZE_JUMP.compressSeconds;
    return 'compressing';
  }
  return null;
}

/**
 * Advance the wind-charge cooldown and, when ready, build the projectile.
 *
 * Wiki: it attempts a shot at a target within 16 blocks on a 1.6 s cooldown. Returns the charge to add
 * to the world, or null.
 */
export function fireWindCharge(manager, mob, dt, target) {
  if (!isBreeze(mob)) return null;
  mob.chargeCooldown = (mob.chargeCooldown ?? 0) - dt;
  if (mob.chargeCooldown > 0 || !target) return null;
  const targetPos = target.position ?? target.mesh?.position;
  if (!targetPos) return null;
  if (mob.mesh.position.distanceTo(targetPos) > BREEZE_ATTACK.range) return null;
  mob.chargeCooldown = BREEZE_ATTACK.cooldown;

  const origin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const direction = targetPos.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(origin).normalize();
  return {
    isWindCharge: true,
    position: origin,
    velocity: direction.multiplyScalar(WIND_CHARGE_SPEED),
    age: 0,
    shooter: mob,
    damage: windChargeDamageFor(manager?.game?.difficulty ?? 'normal')
  };
}

/**
 * The wind burst when a charge strikes something.
 *
 * Wiki: "When a breeze's wind charge attack directly hits an entity, the entity takes damage, and a
 * burst of wind appears. If a wind charge hits a block, only a burst of wind appears. This wind burst
 * deals knockback but does not deal any damage by itself."
 */
export function windChargeBurst(manager, charge, { hitBlock = false } = {}) {
  const position = charge.position.clone();
  const targets = [];
  if (!hitBlock && charge.target) targets.push(charge.target);
  // The burst pushes everything nearby, which is what makes it dangerous near a ledge.
  for (const other of manager?.mobs ?? []) {
    if (other === charge.shooter || other.health <= 0) continue;
    if (other.mesh.position.distanceTo(position) > WIND_CHARGE_BURST.radius) continue;
    if (!targets.includes(other)) targets.push(other);
  }
  for (const target of targets) {
    const pos = target.position ?? target.mesh?.position;
    if (!pos) continue;
    const away = pos.clone().sub(position);
    const dist = away.length();
    if (dist < 1e-6) away.set(0, 1, 0);
    else away.normalize();
    if (target.velocity) {
      target.velocity.x += away.x * WIND_CHARGE_BURST.knockback;
      target.velocity.z += away.z * WIND_CHARGE_BURST.knockback;
      target.velocity.y = Math.max(target.velocity.y ?? 0, 0) + WIND_CHARGE_BURST.upward;
    }
  }
  manager?.spawnParticleBurst?.(position, BREEZE_COLORS.wind, 10);
  return targets;
}

/** Wiki: 1-2 breeze rods, with Looting adding 1-2 more. */
export function breezeDrops(mob, random = Math.random) {
  if (!isBreeze(mob)) return [];
  const looting = Math.max(0, Math.floor(mob.lootingLevel ?? 0));
  const min = BREEZE_ROD_DROP.min;
  const max = BREEZE_ROD_DROP.max + (looting > 0 ? 1 + looting : 0);
  return [['breeze_rod', false, min, max]];
}

/** Wiki: a flat 10 XP when killed by a player or a tamed wolf. */
export function breezeXp(mob) {
  if (!isBreeze(mob)) return 0;
  return 10;
}

/**
 * Build a breeze model: a small body on a ring of rods, with wind streaming around it.
 *
 * The rods and the wind overlay are what make the silhouette read as a breeze rather than a small
 * humanoid, and they are the parts the wiki says stay visible under Invisibility.
 */
function applyBreezeBoxUVs(geo, u, v, tw, th, td) {
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
    const u0 = r.x / 32, u1 = (r.x + r.w) / 32;
    const v1 = 1 - r.y / 32, v0 = 1 - (r.y + r.h) / 32;
    const b = f * 4;
    uvs.setXY(b + 0, u0, v1); uvs.setXY(b + 1, u1, v1);
    uvs.setXY(b + 2, u0, v0); uvs.setXY(b + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}

export function createBreezeModel(bodyMat, rodMat, windMat, eyeMat) {
  const group = new THREE.Group();

  const bodyGeo = applyBreezeBoxUVs(new THREE.BoxGeometry(0.5, 0.6, 0.5), 8, 0, 2, 4, 2);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.95;
  group.add(body);

  // The head sits low and forward, mapped with the authentic head UV (0, 0, 8, 8, 8)
  const headGeo = applyBreezeBoxUVs(new THREE.BoxGeometry(0.42, 0.4, 0.42), 0, 0, 8, 8, 8);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 1.35, 0.05);
  group.add(head);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.03), eyeMat);
    eye.position.set(side * 0.11, 0.03, 0.22);
    head.add(eye);
    eyes.push(eye);
  }
  // The brows, which the wiki says remain visible when the breeze is invisible.
  const eyebrows = [];
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.03), eyeMat);
    brow.position.set(side * 0.11, 0.11, 0.22);
    brow.rotation.z = side * 0.25;
    head.add(brow);
    eyebrows.push(brow);
  }

  // Four vertical rods under the body, which is the breeze's signature silhouette.
  // Mapped with the authentic rod UV (0, 19, 2, 6, 2)
  const rods = [];
  for (const [rx, rz] of [[-0.16, 0.16], [0.16, 0.16], [-0.16, -0.16], [0.16, -0.16]]) {
    const rodGeo = applyBreezeBoxUVs(new THREE.BoxGeometry(0.09, 0.62, 0.09), 0, 19, 2, 6, 2);
    const rod = new THREE.Mesh(rodGeo, rodMat);
    rod.position.set(rx, 0.34, rz);
    group.add(rod);
    rods.push(rod);
  }

  // A wind overlay, which swirls and is also always visible.
  const wind = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42 + i * 0.05, 0.02, 4, 12), windMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.7 + i * 0.18;
    wind.add(ring);
  }
  group.add(wind);

  return { group, body, head, eyes, eyebrows, rods, wind };
}

/**
 * Pose the breeze.
 *
 * The wind rings counter-rotate and drift, and the rods splay while leaping, which is what makes the
 * movement read rather than slide.
 */
export function poseBreeze(mob, phase = 0) {
  if (!isBreeze(mob) || !mob.mesh) return;
  if (mob.wind) {
    mob.wind.rotation.y = phase * 1.6;
    for (let i = 0; i < mob.wind.children.length; i++) {
      const ring = mob.wind.children[i];
      ring.rotation.z = phase * (0.8 + i * 0.3) * (i % 2 ? -1 : 1);
      ring.position.y = 0.7 + i * 0.18 + Math.sin(phase * 2 + i) * 0.04;
    }
  }
  if (mob.rods) {
    const airborne = !mob.onGround;
    for (let i = 0; i < mob.rods.length; i++) {
      const rod = mob.rods[i];
      // Splayed in the air, tucked on the ground.
      rod.rotation.z = airborne ? Math.sin(phase * 3 + i) * 0.2 : 0;
      rod.rotation.x = airborne ? Math.cos(phase * 3 + i) * 0.2 : 0;
    }
  }
  if (mob.leapState === 'compressing') {
    // The owner of the squash. `updateBreezeLeap` deliberately does NOT touch `mesh.scale`: both used to
    // set it, so the physics step wrote a squash and this pose overwrote it with the stretch, and the
    // model never visibly compressed. Because the pose runs after the physics in the update loop, this is
    // the only place the scale may be written.
    const progress = 1 - Math.max(0, Math.min(1, (mob.compressTimer ?? 0) / BREEZE_JUMP.compressSeconds));
    const squash = 1 - 0.35 * progress;
    mob.mesh.scale.set(1 + (1 - squash) * 0.4, squash, 1 + (1 - squash) * 0.4);
    return;
  }
  if (mob.mesh.scale.y !== 1 || mob.mesh.scale.x !== 1) mob.mesh.scale.set(1, 1, 1);
}
