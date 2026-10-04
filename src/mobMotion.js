import * as THREE from 'three';
import { applyHeat } from './heat.js';
import { BLOCKS } from './blocks.js';
import { isLethalStep, hazardKind } from './hazards.js';

export function wanderMob(manager, mob, dt, speed) {
  mob.wanderTimer = (mob.wanderTimer || 0) - dt;
  if (mob.wanderTimer <= 0 || (mob.wanderGoal && mob.mesh.position.distanceTo(mob.wanderGoal) < 0.65)) {
    mob.wanderGoal = null;
    mob.wanderTimer = 1 + Math.random() * 2;
    if (Math.random() > 0.2) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = attempt < 6 ? 3 + Math.random() * 5 : 1 + Math.random() * 2;
        const goal = mob.mesh.position.clone().add(new THREE.Vector3(Math.sin(angle) * distance, 0, Math.cos(angle) * distance));
        const baseY = Math.floor(goal.y);
        for (let y = baseY + 1; y >= baseY - 2; y--) {
          goal.y = y;
          if (manager.isBlockSolid(goal.x, y - 0.05, goal.z) && !manager.checkMobCollision(mob, goal)
            && manager.world.getVoxel(Math.floor(goal.x), y, Math.floor(goal.z)) !== BLOCKS.WATER) {
            mob.wanderGoal = goal.clone();
            mob.wanderTimer = distance / speed + 2;
            break;
          }
        }
        if (mob.wanderGoal) break;
      }
    }
  }
  if (mob.wanderGoal) {
    const direction = mob.wanderGoal.clone().sub(mob.mesh.position); direction.y = 0; direction.normalize();
    mob.yaw = Math.atan2(direction.x, direction.z);
    mob.velocity.x = direction.x * speed; mob.velocity.z = direction.z * speed;
  } else {
    mob.velocity.x = 0; mob.velocity.z = 0;
  }
}

/**
 * The hazard view moveGroundMob needs: voxel lookup, solidity, and the mob itself so its
 * immunities apply (a blaze may cross lava, a cow may not).
 */
function hazardCtx(manager, mob) {
  return {
    mob,
    getVoxel: (x, y, z) => manager.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z)),
    isSolid: (x, y, z) => manager.isBlockSolid(Math.floor(x), Math.floor(y), Math.floor(z), mob?.type ?? null),
  };
}

/**
 * Should this step be refused?
 *
 * Knockback overrides everything: a mob being thrown must not be able to refuse, or the
 * player could never shove one into anything. A dying mob and a magma cube are likewise
 * exempt, matching the behaviour they already had.
 *
 * @returns {boolean} true when the move must not be taken
 */
function stepIsRefused(hazards, manager, mob, cell, grounded, knockback, waterId) {
  if (mob.type === "magma_cube" || mob.dying) return false;
  if (knockback.lengthSq() >= 0.1) return false;
  if (!grounded) return false;
  // Anything that would hurt the mob where it would end up.
  if (isLethalStep(hazards, cell.x, cell.y, cell.z)) return true;
  // Water stays an obstacle for land mobs, as before.
  const inWater = hazards.getVoxel(cell.x, cell.y, cell.z) === waterId;
  if (inWater) return true;
  // Deep drops were already avoided; keep that.
  return !hazards.isSolid(cell.x, cell.y - 1.05, cell.z);
}

/**
 * Find a heading close to `yaw` that is not immediately harmful.
 *
 * Tries progressively wider angles on both sides. This is what makes a mob walk around a
 * lava edge rather than pressing into it.
 *
 * @returns {number|null} a safe yaw, or null when every direction is blocked
 */
function deflectAroundHazard(hazards, mob, yaw, distance = 1.1) {
  const offsets = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI / 2, -Math.PI / 2, 2.0, -2.0, Math.PI];
  const pos = mob.mesh.position;
  for (const off of offsets) {
    const angle = yaw + off;
    const x = Math.floor(pos.x + Math.sin(angle) * distance);
    const z = Math.floor(pos.z + Math.cos(angle) * distance);
    // Probe at the mob feet and one block up, and require a floor.
    const y = Math.floor(pos.y);
    if (hazards.isSolid(x, y, z)) continue;
    if (isLethalStep(hazards, x, y, z)) continue;
    if (!hazards.isSolid(x, y - 1, z) && hazards.getVoxel(x, y - 1, z) !== 0) continue;
    return angle;
  }
  return null;
}

export function moveGroundMob(manager, mob, dt) {
  if(mob.health>0)applyHeat(manager.world,mob,mob.mesh.position,dt,n=>manager.damageMob(mob,n));
  const start = mob.mesh.position.clone(), pos = mob.mesh.position;
  const collision = p => manager.checkMobCollision(mob, p);
  if (collision(pos)) {
    for (let lift = 0.25; lift <= 4; lift += 0.25) {
      const candidate = pos.clone(); candidate.y += lift;
      if (!collision(candidate)) { pos.copy(candidate); break; }
    }
  }
  const hazards = hazardCtx(manager, mob);
  const knockback = mob.knockback || new THREE.Vector3();

  // Standing in something harmful: get out before anything else, whichever way is safe.
  {
    const hereX = Math.floor(pos.x), hereY = Math.floor(pos.y), hereZ = Math.floor(pos.z);
    if (isLethalStep(hazards, hereX, hereY, hereZ)) {
      const escape = deflectAroundHazard(hazards, mob, (mob.yaw || 0) + Math.PI, 1.4);
      if (escape !== null) {
        const run = Math.max(2.4, Math.hypot(mob.velocity.x, mob.velocity.z));
        mob.velocity.x = Math.sin(escape) * run;
        mob.velocity.z = Math.cos(escape) * run;
        mob.yaw = escape;
        mob.fleeingHazard = true;
      }
    } else {
      // Not in danger: if the way ahead is harmful, angle around it rather than pressing on.
      const headingX = Math.floor(pos.x + Math.sin(mob.yaw || 0) * 1.1);
      const headingZ = Math.floor(pos.z + Math.cos(mob.yaw || 0) * 1.1);
      const headingY = Math.floor(pos.y);
      if (isLethalStep(hazards, headingX, headingY, headingZ)
        || hazardKind(hazards.getVoxel(headingX, headingY - 1, headingZ), mob)) {
        const dodge = deflectAroundHazard(hazards, mob, mob.yaw || 0);
        if (dodge !== null) {
          const speedNow = Math.hypot(mob.velocity.x, mob.velocity.z) || 2.2;
          mob.velocity.x = Math.sin(dodge) * speedNow;
          mob.velocity.z = Math.cos(dodge) * speedNow;
          mob.yaw = dodge;
        }
      }
    }
  }
  mob.avoidTime = Math.max(0, (mob.avoidTime || 0) - dt);
  if (mob.type !== 'magma_cube' && mob.avoidTime > 0 && !mob.dying) {
    const speed = Math.hypot(mob.velocity.x, mob.velocity.z) || 2.2;
    mob.velocity.x = Math.sin(mob.avoidYaw) * speed;
    mob.velocity.z = Math.cos(mob.avoidYaw) * speed;
    mob.yaw = mob.avoidYaw;
  }
  const vx = mob.velocity.x + knockback.x, vz = mob.velocity.z + knockback.z;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vz), Math.abs(mob.velocity.y)) * dt / 0.18));
  const step = dt / steps;
  let blocked = false;
  for (let i = 0; i < steps; i++) {
    const support = pos.clone(); support.y -= 0.04;
    const grounded = collision(support);
    for (const [axis, speed] of [['x', vx], ['z', vz]]) {
      if (Math.abs(speed) < 0.001) continue;
      const candidate = pos.clone(); candidate[axis] += speed * step;
      const cell = { x: Math.floor(candidate.x), y: Math.floor(candidate.y), z: Math.floor(candidate.z) };
      // Veto harm before anything else. This has to come first: lava, fire and powder snow
      // are authored with solid:false, so collision() is false for them and a check placed
      // after the collision split would never run.
      if (stepIsRefused(hazards, manager, mob, cell, grounded, knockback, BLOCKS.WATER)) {
        blocked = true;
      } else if (collision(candidate)) {
        const raised = candidate.clone(); raised.y = Math.floor(pos.y + 0.05) + 1;
        const clearance = pos.clone(); clearance.y = raised.y;
        const floor = raised.clone(); floor.y -= 0.04;
        const raisedCell = { x: Math.floor(raised.x), y: Math.floor(raised.y), z: Math.floor(raised.z) };
        if (mob.type !== 'magma_cube' && !mob.dying && grounded && raised.y - pos.y <= 1.04
          && !collision(clearance) && !collision(raised) && collision(floor)
          && !isLethalStep(hazards, raisedCell.x, raisedCell.y, raisedCell.z)) pos.copy(raised);
        else blocked = true;
      } else {
        pos.copy(candidate);
      }
    }
    const maxFall = mob.maxFallSpeed !== undefined ? mob.maxFallSpeed : (mob.type === 'chicken' ? -1.5 : -40);
    const gravity = mob.gravity !== undefined ? mob.gravity : (mob.type === 'chicken' ? 8 : 24);
    mob.velocity.y = Math.max(maxFall, mob.velocity.y - gravity * step);
    const candidate = pos.clone(); candidate.y += mob.velocity.y * step;
    mob.onGround = false;
    if (collision(candidate)) {
      // Find the contact plane instead of ceil() and repeated upward nudges.
      let free = pos.y, solid = candidate.y;
      for (let n = 0; n < 12; n++) {
        const middle = (free + solid) / 2;
        const probe = pos.clone(); probe.y = middle;
        if (collision(probe)) solid = middle; else free = middle;
      }
      pos.y = free;
      mob.onGround = mob.velocity.y < 0;
      mob.velocity.y = 0;
    } else pos.y = candidate.y;
  }
  if (mob.knockback) mob.knockback.multiplyScalar(Math.exp(-8 * dt));
  mob.stuckTime = blocked ? (mob.stuckTime || 0) + dt : 0;
  if (mob.type !== 'magma_cube' && mob.stuckTime > 0.5) {
    mob.wanderTimer = 0; mob.wanderGoal = null; mob.stuckTime = 0;
    mob.avoidYaw = mob.yaw + (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2;
    mob.avoidTime = 1.2;
  }
  const turn = Math.atan2(Math.sin(mob.yaw - mob.mesh.rotation.y), Math.cos(mob.yaw - mob.mesh.rotation.y));
  mob.mesh.rotation.y += turn * (1 - Math.exp(-7 * dt));
  return Math.hypot(pos.x - start.x, pos.z - start.z) / Math.max(dt, 0.0001);
}

export function moveFlyingMob(manager, mob, dt) {
  if (mob.health > 0) applyHeat(manager.world, mob, mob.mesh.position, dt, n => manager.damageMob(mob, n));
  const pos = mob.mesh.position;
  const collision = p => manager.checkMobCollision(mob, p);

  // If inside solid blocks, unstuck upward
  if (collision(pos)) {
    for (let lift = 0.5; lift <= 6; lift += 0.5) {
      const candidate = pos.clone(); candidate.y += lift;
      if (!collision(candidate)) { pos.copy(candidate); break; }
    }
  }

  const knockback = mob.knockback || new THREE.Vector3();
  const vx = mob.velocity.x + knockback.x;
  const vy = mob.velocity.y + knockback.y;
  const vz = mob.velocity.z + knockback.z;

  const candidate = pos.clone().add(new THREE.Vector3(vx * dt, vy * dt, vz * dt));
  if (!collision(candidate)) {
    pos.copy(candidate);
  } else {
    // Axis glide on collision
    const tryX = pos.clone(); tryX.x = candidate.x;
    if (!collision(tryX)) pos.x = candidate.x; else mob.velocity.x *= -0.3;

    const tryY = pos.clone(); tryY.y = candidate.y;
    if (!collision(tryY)) pos.y = candidate.y;
    else {
      if (mob.type === 'blaze') mob.velocity.y = 0;
      else if (mob.velocity.y < 0) mob.velocity.y = Math.abs(mob.velocity.y) * 0.6 + 2.0; // deflect upward away from ground
      else mob.velocity.y *= -0.3;
    }

    const tryZ = pos.clone(); tryZ.z = candidate.z;
    if (!collision(tryZ)) pos.z = candidate.z; else mob.velocity.z *= -0.3;
  }

  if (mob.knockback) mob.knockback.multiplyScalar(Math.exp(-6 * dt));

  if (mob.type === 'blaze') { mob.mesh.rotation.set(0, mob.yaw, 0); return; }

  // Banking, pitch and rotation for realistic 3D flight
  const horizSpeed = Math.hypot(mob.velocity.x, mob.velocity.z);
  if (horizSpeed > 0.1 && (!mob.hasPlayerTarget || mob.type !== 'ghast')) {
    const targetYaw = Math.atan2(mob.velocity.x, mob.velocity.z);
    const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
    mob.yaw += turn * (1 - Math.exp(-6 * dt));
    mob.mesh.rotation.y = mob.yaw;

    // Bank into turns
    const targetRoll = -Math.max(-0.4, Math.min(0.4, turn * 1.6));
    mob.mesh.rotation.z += (targetRoll - mob.mesh.rotation.z) * (1 - Math.exp(-5 * dt));

    // Pitch for diving or climbing
    const targetPitch = Math.atan2(-mob.velocity.y, Math.max(0.1, horizSpeed));
    mob.mesh.rotation.x += (targetPitch - mob.mesh.rotation.x) * (1 - Math.exp(-6 * dt));
  }

  // Wing flapping speed tied to velocity
  const flightSpeed = Math.hypot(mob.velocity.x, mob.velocity.y, mob.velocity.z);
  mob.walkCycle = (mob.walkCycle || 0) + Math.max(1.2, flightSpeed) * dt * 3.5;
  if (mob.wings) {
    const flap = Math.sin((mob.walkCycle || 0) * 2.2 + Date.now() * 0.008) * 0.55;
    mob.wings.left.rotation.z = flap;
    mob.wings.right.rotation.z = -flap;
  }

  return flightSpeed;
}
