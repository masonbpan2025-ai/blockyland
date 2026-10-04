import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { wanderMob } from './mobMotion.js';
import { findPath, directRouteIsSafe } from './mobPathfinder.js';
import { isLethalStep } from './hazards.js';

/** How often a mob recomputes its route, in seconds. */
const PATH_REPLAN = 0.5;

/**
 * Pick the point a mob should actually aim for this frame.
 *
 * Returns the destination unchanged when the way there is clear. When it is blocked -- by
 * lava, fire, or terrain -- it plans a route and hands back the next waypoint, so the mob
 * follows the detour rather than pressing into the obstacle.
 *
 * @returns {{x:number,y:number,z:number}} the aim point
 */
function routeAimPoint(manager, mob, destination, dt) {
  const pos = mob.mesh.position;
  mob.pathCooldown = Math.max(0, (mob.pathCooldown || 0) - dt);

  // Move to the next waypoint once the current one is reached.
  if (mob.path && mob.path.length) {
    const wp = mob.path[0];
    const dx = (wp.x + 0.5) - pos.x;
    const dz = (wp.z + 0.5) - pos.z;
    if (Math.hypot(dx, dz) < 0.45 && Math.abs(wp.y - pos.y) < 1.6) mob.path.shift();
  }

  // Notice being stuck: a path that cannot be walked has to be recomputed, or the mob
  // presses into the obstacle forever. Progress is measured against where it was, so a mob
  // walking a long detour does not trip this.
  const mark = mob.pathProgressAt || { x: pos.x, z: pos.z };
  if (Math.hypot(pos.x - mark.x, pos.z - mark.z) > 0.5) {
    mob.pathProgressAt = { x: pos.x, z: pos.z };
    mob.stuckTimer = 0;
  } else {
    mob.stuckTimer = (mob.stuckTimer || 0) + dt;
  }
  const stuck = mob.stuckTimer > 0.45;
  if (stuck) mob.pathProgressAt = { x: pos.x, z: pos.z };

  // Re-plan when the goal has moved a long way, on the cadence, or after getting stuck.
  const goalMoved = !mob.pathGoal || Math.hypot(mob.pathGoal.x - destination.x, mob.pathGoal.z - destination.z) > 2.5;
  const needsRoute = () => !directRouteIsSafe(manager, mob, pos, destination);

  if (stuck) {
    // Remember that this spot is not yielding progress, so the next plan routes around it
    // instead of reproducing the same first step. The memo is capped and expires by time,
    // because terrain changes and a cell that was blocked may later be fine.
    mob.avoidCells = mob.avoidCells || new Map();
    const now = performance.now();
    for (const [k, t] of mob.avoidCells) if (now - t > 4000) mob.avoidCells.delete(k);
    const here = Math.floor(pos.x) + ',' + Math.floor(pos.y) + ',' + Math.floor(pos.z);
    mob.avoidCells.set(here, now);
    if (mob.path && mob.path.length > 1) mob.path.shift();
    mob.stuckTimer = 0;
    mob.pathCooldown = 0;
    mob.pathProgressAt = { x: pos.x, z: pos.z };
  }

  // Note the guard is on the path OBJECT, not its length: an empty path means "no route
  // found", and treating that as "nothing to do" stopped a blocked mob ever planning again.
  if (!mob.path || mob.path.length === 0 || goalMoved || stuck) {
    if (mob.pathCooldown <= 0 && needsRoute()) {
      const avoidSet = mob.avoidCells && mob.avoidCells.size ? new Set(mob.avoidCells.keys()) : null;
      const plan = findPath(manager, mob, pos, destination, avoidSet ? { avoid: avoidSet } : undefined);
      mob.path = plan.path;
      mob.pathGoal = { x: destination.x, y: destination.y, z: destination.z };
      mob.pathCooldown = PATH_REPLAN;
      mob.pathReached = plan.reached;
    } else if (goalMoved) {
      // The goal moved but the way is clear: drop the stale route and steer directly.
      mob.path = null;
      mob.pathGoal = { x: destination.x, y: destination.y, z: destination.z };
    }
  }

  const wp = mob.path && mob.path[0];
  if (wp) return { x: wp.x + 0.5, y: wp.y, z: wp.z + 0.5, followingWaypoint: true };
  return destination;
}

export function steerGround(manager, mob, destination, dt, speed = 2.5, stop = 0) {
  // Aim at the next waypoint when a route is needed, otherwise straight at the target.
  const aim = routeAimPoint(manager, mob, destination, dt);
  const direction = new THREE.Vector3(aim.x, mob.mesh.position.y, aim.z).sub(mob.mesh.position).setY(0);
  const distance = direction.length();
  // A waypoint has to be reached, not merely approached. Halting within `stop` of it left the
  // mob just outside the distance at which the route advances, so it stalled with zero
  // velocity. Following a waypoint therefore never short-stops; the route advances on arrival.
  const effectiveStop = aim.followingWaypoint ? 0 : stop;
  if (distance <= effectiveStop) { mob.velocity.x = mob.velocity.z = 0; mob.avoidTime = 0; return; }
  direction.normalize();
  let yaw = Math.atan2(direction.x, direction.z);
  mob.steerTimer = Math.max(0, (mob.steerTimer || 0) - dt);
  /**
   * Can the mob head this way?
   *
   * Asks whether the cell it would STEP INTO is somewhere it may stand, using the same
   * immunity-aware predicate the movement layer uses, plus a check that the ground under that
   * cell is not lava it would burn on. A short collision probe in the old version grazed the
   * neighbouring lava block from a block away, so every heading looked blocked and the mob was
   * frozen at the water's edge.
   */
  const hazardCtx = {
    mob,
    getVoxel: (x, y, z) => manager.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z)),
    isSolid: (x, y, z) => manager.isBlockSolid(Math.floor(x), Math.floor(y), Math.floor(z), mob.type),
  };
  const walkableAhead = (angle, reach = 0.9) => {
    const from = mob.mesh.position;
    const x = Math.floor(from.x + Math.sin(angle) * reach);
    const z = Math.floor(from.z + Math.cos(angle) * reach);
    const y = Math.floor(from.y);
    const probe = new THREE.Vector3(x + 0.5, from.y, z + 0.5);
    // Something solid filling the destination is a wall, not a hazard to route around.
    if (manager.checkMobCollision(mob, probe)) return false;
    if (isLethalStep(hazardCtx, x, y, z)) return false;
    return true;
  };
  const clear = (angle) => walkableAhead(angle, 0.9) || walkableAhead(angle, 0.55);
  if (mob.steerTimer > 0 && clear(mob.steerYaw)) yaw = mob.steerYaw;
  else if (!clear(yaw)) {
    const alternatives = [0.65, -0.65, 1.2, -1.2, Math.PI / 2, -Math.PI / 2, Math.PI];
    const angle = alternatives.map(a => yaw + a).find(clear);
    if (angle === undefined) {
      // No heading probed clear. Keep the heading rather than freezing: moveGroundMob refuses
      // any step that would actually hurt, so the mob stays safe while still making progress
      // around the obstacle. Zeroing velocity here stranded mobs at every lava edge.
      mob.steerYaw = yaw;
      mob.steerTimer = 0.2;
    } else {
      yaw = angle; mob.steerYaw = yaw; mob.steerTimer = 0.8;
    }
  }
  mob.avoidTime = 0;
  mob.yaw = yaw;
  // Scale by the stop that applies to this aim point, not the destination's: using `stop`
  // here collapsed the speed to zero whenever a waypoint sat inside the destination radius.
  const stepSpeed = Math.min(speed, Math.max(0, distance - effectiveStop) / Math.max(dt, 0.001));
  mob.velocity.x = Math.sin(yaw) * stepSpeed;
  mob.velocity.z = Math.cos(yaw) * stepSpeed;
}

export function nearestRepellent(world, mob, ids, radius, dt) {
  mob.repellentTimer = (mob.repellentTimer || 0) - dt;
  if (mob.repellentTimer > 0) return mob.repellent;
  mob.repellentTimer = 0.5; mob.repellent = null;
  const pos = mob.mesh.position;
  for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) for (let y = -2; y <= 2; y++) {
    const bx = Math.floor(pos.x) + x, by = Math.floor(pos.y) + y, bz = Math.floor(pos.z) + z;
    if (!ids.includes(world.getVoxel(bx, by, bz))) continue;
    const p = new THREE.Vector3(bx + 0.5, by, bz + 0.5);
    if (p.distanceTo(pos) <= radius && (!mob.repellent || p.distanceToSquared(pos) < mob.repellent.distanceToSquared(pos))) mob.repellent = p;
  }
  return mob.repellent;
}

export function flee(manager, mob, danger, dt, speed = 2.5) {
  const direction = mob.mesh.position.clone().sub(danger).setY(0);
  if (direction.lengthSq() < 0.01) direction.x = 1;
  steerGround(manager, mob, mob.mesh.position.clone().addScaledVector(direction.normalize(), 6), dt, speed);
}

export function retaliateHoglins(manager, victim, attacker) {
  if (!attacker) return;
  if (victim.isBaby) { victim.fleeFrom = attacker.mesh?.position || attacker.position || attacker; victim.fleeTimer = 5; return; }
  for (const other of manager.mobs) {
    if (other.type === 'hoglin' && !other.isBaby && other.health > 0 && other.mesh.position.distanceTo(victim.mesh.position) <= 16) {
      other.combatTarget = attacker; other.retaliationTimer = 30;
    }
  }
}

export function updateHoglin(behaviors, mob, dt, player) {
  const manager = behaviors.mobManager, world = behaviors.world, pos = mob.mesh.position;
  if (mob.type === 'hoglin' && !mob.immuneToZombification) {
    mob.conversionTime = world.isNether || world.dimension === 'nether' ? 0 : (mob.conversionTime || 0) + dt;
    if (mob.conversionTime >= 15 && world.dimension) {
      mob.type = 'zoglin'; mob.name = 'Zoglin'; mob.fireImmune = true; mob.combatTarget = null;
      mob.mesh.traverse(node => { if (node.material?.color) node.material.color.setHex(0x86a773); });
    }
  }
  mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);
  mob.fleeTimer = Math.max(0, (mob.fleeTimer || 0) - dt);
  mob.retaliationTimer = Math.max(0, (mob.retaliationTimer || 0) - dt);
  if (!mob.retaliationTimer || mob.combatTarget?.health <= 0) mob.combatTarget = null;
  const repellent = mob.type === 'hoglin' ? nearestRepellent(world, mob, [BLOCKS.WARPED_FUNGUS, BLOCKS.NETHER_PORTAL, BLOCKS.RESPAWN_ANCHOR], 7, dt) : null;
  if (repellent || (mob.fleeTimer && mob.fleeFrom)) {
    mob.target = null; flee(manager, mob, repellent || mob.fleeFrom, dt); return;
  }
  if (mob.combatTarget?.type === 'piglin') {
    const nearby = manager.mobs.filter(m => m.health > 0 && !m.isBaby && m.mesh.position.distanceTo(pos) < 16);
    if (nearby.filter(m => m.type === 'piglin').length > nearby.filter(m => m.type === 'hoglin').length) {
      flee(manager, mob, mob.combatTarget.mesh.position, dt); return;
    }
  }
  if (mob.inLove > 0) return; // Breeding movement owns this frame.
  const canAttack = player?.position && !player.isDead && player.health !== 0 && !['creative', 'spectator'].includes(player.gamemode) && !player.isCreative && !player.isSpectator && manager.game?.difficulty !== 'peaceful';
  let target = mob.combatTarget || (canAttack && player.position.distanceTo(pos) < 16 ? player : null);
  if (mob.type === 'zoglin' && !target) target = manager.mobs.find(m => m !== mob && m.health > 0 && !['zoglin', 'creeper'].includes(m.type) && m.mesh.position.distanceTo(pos) < 16);
  mob.target = target;
  if (!target) { wanderMob(manager, mob, dt, 1); return; }
  const targetPos = target.mesh?.position || target.position;
  const distance = targetPos.distanceTo(pos);
  steerGround(manager, mob, targetPos, dt, 2.5, mob.isBaby ? 0.85 : 1.65);
  if (distance > (mob.isBaby ? 1.1 : 1.9) || mob.attackCooldown > 0) return;
  // Do not attack through a solid wall.
  const midpoint = pos.clone().lerp(targetPos, 0.5); midpoint.y += 0.7;
  if (manager.isBlockSolid(midpoint.x, midpoint.y, midpoint.z)) return;
  mob.attackCooldown = mob.isBaby ? 1 : 2;
  mob.tuskAttackTime = 0.3;
  const difficulty = manager.game?.difficulty || 'normal';
  const base = 3 + Math.floor(Math.random() * 6);
  const damage = mob.isBaby ? (difficulty === 'hard' ? 0.75 : 0.5) : difficulty === 'easy' ? base / 2 + 1 : difficulty === 'hard' ? base * 1.5 : base;
  if (target.mesh) manager.damageMob(target, damage, pos, false, mob);
  else target.takeDamage?.(damage, pos, mob.type);
  if (!mob.isBaby && target.velocity) {
    const launch = targetPos.clone().sub(pos).setY(0).normalize().multiplyScalar(2.5);
    target.velocity.add(launch); target.velocity.y = Math.max(target.velocity.y, 4);
  }
}
