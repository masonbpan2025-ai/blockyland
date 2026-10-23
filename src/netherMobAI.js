import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { wanderMob } from './mobMotion.js';
import { findPath, directRouteIsSafe, PATH_DEFAULTS } from './mobPathfinder.js';
import { isLethalStep } from './hazards.js';

/** How often a mob recomputes its route, in seconds. */
const PATH_REPLAN = 0.5;

/**
 * A search that finds no way to the goal costs the most -- it spends its whole node limit -- and used to be made again
 * every half second for as long as the goal stayed out of reach. A villager city's zombies, each chasing a villager
 * behind a wall, spent most of the frame there. After a failed search the mob waits twice as long as the last time,
 * up to PATH_BACKOFF_MAX seconds, walking the partial route toward the closest point it found meanwhile; a route
 * found, or a goal that moves FAILED_GOAL_MOVE blocks from the one it could not reach, starts it over.
 */
const PATH_BACKOFF_MAX = 8;
const FAILED_GOAL_MOVE = 8;
/**
 * A search made again after one failed looks only this far (expanded nodes, against PATH_DEFAULTS.maxNodes for the
 * first): it is asking whether the goal has come within reach, and a full search that fails is a 15-25 ms frame.
 */
const RETRY_NODES = 1000;

/**
 * Route searches every mob may make in one frame, in expanded nodes: one full search (PATH_DEFAULTS.maxNodes). A search
 * starts only while some is left, so a crowd that all wants routes at once spreads them over the next frames.
 * MobManager.update refills it (`pathNodesLeft`); a manager without one is not limited.
 */
export const PATH_FRAME_NODES = PATH_DEFAULTS.maxNodes;

/**
 * Minimum time a locally-chosen avoidance heading is held before it may be reconsidered.
 *
 * Without this the alternative-angle search re-decided every frame and flipped sides at a
 * corner, which is the jitter. A decision that is made once and held cannot oscillate.
 */
const STEER_DWELL = 0.6;

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
  // A goal far from the one no route reached may well be reachable: search again at once.
  if (mob.pathFailures && mob.failedGoal && Math.hypot(mob.failedGoal.x - destination.x, mob.failedGoal.z - destination.z) > FAILED_GOAL_MOVE) {
    mob.pathFailures = 0;
    mob.pathCooldown = 0;
  }
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
    // Stuck on the way to a goal no route reaches is expected: it waits out its backoff like any other failure.
    if (!mob.pathFailures) mob.pathCooldown = 0;
    mob.pathProgressAt = { x: pos.x, z: pos.z };
  }

  // Note the guard is on the path OBJECT, not its length: an empty path means "no route
  // found", and treating that as "nothing to do" stopped a blocked mob ever planning again.
  // This frame's searches spent (PATH_FRAME_NODES): a mob due for one keeps what it has and asks again next frame.
  const waitingForBudget = mob.pathCooldown <= 0 && manager.pathNodesLeft !== undefined && manager.pathNodesLeft <= 0;
  if ((!mob.path || mob.path.length === 0 || goalMoved || stuck) && !waitingForBudget) {
    if (mob.pathCooldown <= 0 && needsRoute()) {
      const avoidSet = mob.avoidCells && mob.avoidCells.size ? new Set(mob.avoidCells.keys()) : null;
      const limits = mob.pathFailures ? { maxNodes: RETRY_NODES } : {};
      const plan = findPath(manager, mob, pos, destination, avoidSet ? { ...limits, avoid: avoidSet } : limits);
      if (manager.pathNodesLeft !== undefined) manager.pathNodesLeft -= plan.nodes;
      mob.path = plan.path;
      mob.pathGoal = { x: destination.x, y: destination.y, z: destination.z };
      mob.pathReached = plan.reached;
      if (plan.reached) {
        mob.pathFailures = 0;
        mob.failedGoal = null;
        mob.pathCooldown = PATH_REPLAN;
      } else {
        mob.pathFailures = (mob.pathFailures || 0) + 1;
        mob.failedGoal = mob.pathGoal;
        mob.pathCooldown = Math.min(PATH_BACKOFF_MAX, PATH_REPLAN * 2 ** mob.pathFailures);
      }
      // A new route may legitimately want the other way around an obstacle.
      mob.steerSide = 0;
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
  const committed = mob.steerTimer > 0 && mob.steerYaw !== undefined;
  if (committed) {
    // Ride out the dwell. Re-deciding the moment the heading grazes something restarted the
    // search every frame, which is what kept the heading churning.
    yaw = mob.steerYaw;
  } else if (!clear(yaw)) {
    // The direct heading is blocked and we are free to re-decide. Try one rotational direction
    // first, every time, so the mob commits to a side instead of alternating between them.
    const side = mob.steerSide === -1 ? -1 : 1;
    const offsets = [];
    for (const magnitude of [0.65, 1.2, Math.PI / 2, 2.2, Math.PI]) offsets.push(magnitude * side);
    // Only if the committed side is genuinely exhausted do we try the other one.
    for (const magnitude of [0.65, 1.2, Math.PI / 2, 2.2, Math.PI]) offsets.push(-magnitude * side);

    const angle = offsets.map(o => yaw + o).find(clear);
    if (angle === undefined) {
      // Nothing probes clear. Hold the heading rather than freezing: moveGroundMob refuses any
      // step that would actually hurt, so the mob stays safe and keeps trying. Zeroing velocity
      // here stranded mobs at every lava edge.
      mob.steerYaw = yaw;
      mob.steerTimer = STEER_DWELL;
    } else {
      // Remember which way we turned, so the next decision continues that way.
      const delta = Math.atan2(Math.sin(angle - yaw), Math.cos(angle - yaw));
      if (Math.abs(delta) > 0.01) mob.steerSide = Math.sign(delta);
      yaw = angle;
      mob.steerYaw = yaw;
      mob.steerTimer = STEER_DWELL;
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
  /**
   * How close to stand before attacking.
   *
   * This has to be at least the distance at which separatePlayerFromMobs stops pushing the two
   * bodies apart, which is (playerWidth + mobWidth) / 2 -- about 1.7 for a hoglin. The old 1.65
   * was narrower than that, so the hoglin walked in, was pushed back out, recomputed its heading
   * and walked in again, reversing along the same diagonal roughly twice a second. That was the
   * visible shake. A margin on top stops it oscillating against the contact face.
   */
  const contactDistance = mob.isBaby
    ? 0.85
    : Math.max(1.9, ((manager.getMobDimensions?.(mob.type)?.width || 0.9) + 0.6) / 2 + 0.35);

  /**
   * Stand and fight once the mob has closed as far as it can and stopped making progress.
   *
   * The separation code pushes the two bodies apart, so a mob that keeps walking at a target it is
   * already touching overshoots, gets pushed back through and out the other side, and reverses --
   * along the same diagonal, about twice a second. That was the visible shake: a hoglin held a
   * radius that swung between 1.16 and 2.42 blocks while its heading flipped between two
   * antiparallel values.
   *
   * Progress is tracked on a timer rather than per frame, because a single frame of no movement
   * means nothing (collision resolution, a push, a frame at a boundary). Only when the mob has
   * failed to get closer for a sustained interval, and is within reach, is standing correct.
   */
  const bestKey = 'approachBest';
  const stuckKey = 'approachStuck';
  if (mob[bestKey] === undefined || distance < mob[bestKey] - 0.02) {
    mob[bestKey] = distance;
    mob[stuckKey] = 0;
  } else {
    mob[stuckKey] = (mob[stuckKey] || 0) + dt;
  }
  const inReach = distance <= contactDistance + 0.6;
  const settled = inReach && mob[stuckKey] > 0.35;
  if (settled) {
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    mob.steerTimer = 0;
    mob.steerYaw = undefined;
  } else {
    steerGround(manager, mob, targetPos, dt, 2.5, contactDistance);
  }
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
