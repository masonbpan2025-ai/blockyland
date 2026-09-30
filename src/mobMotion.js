import * as THREE from 'three';
import { applyHeat } from './heat.js';
import { BLOCKS } from './blocks.js';

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
  const knockback = mob.knockback || new THREE.Vector3();
  mob.avoidTime = Math.max(0, (mob.avoidTime || 0) - dt);
  if (mob.avoidTime > 0 && !mob.dying) {
    const speed = Math.hypot(mob.velocity.x, mob.velocity.z);
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
      if (collision(candidate)) {
        const raised = candidate.clone(); raised.y = Math.floor(pos.y + 0.05) + 1;
        const clearance = pos.clone(); clearance.y = raised.y;
        const floor = raised.clone(); floor.y -= 0.04;
        if (!mob.dying && grounded && raised.y - pos.y <= 1.04 && !collision(clearance) && !collision(raised) && collision(floor)) pos.copy(raised);
        else blocked = true;
      } else {
        // Walking AI avoids deep drops and entering water; knockback can still push it off.
        const floor = candidate.clone(); floor.y -= 1.05;
        const water = manager.world.getVoxel(Math.floor(candidate.x), Math.floor(candidate.y), Math.floor(candidate.z)) === BLOCKS.WATER;
        if (!mob.dying && grounded && knockback.lengthSq() < 0.1 && (!collision(floor) || water)) blocked = true;
        else pos.copy(candidate);
      }
    }
    mob.velocity.y = Math.max(-40, mob.velocity.y - 24 * step);
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
  if (mob.stuckTime > 0.5) {
    mob.wanderTimer = 0; mob.wanderGoal = null; mob.stuckTime = 0;
    mob.avoidYaw = mob.yaw + (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2;
    mob.avoidTime = 1.2;
  }
  const turn = Math.atan2(Math.sin(mob.yaw - mob.mesh.rotation.y), Math.cos(mob.yaw - mob.mesh.rotation.y));
  mob.mesh.rotation.y += turn * (1 - Math.exp(-7 * dt));
  return Math.hypot(pos.x - start.x, pos.z - start.z) / Math.max(dt, 0.0001);
}
