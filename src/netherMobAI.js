import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { wanderMob } from './mobMotion.js';

export function steerGround(manager, mob, destination, dt, speed = 2.5, stop = 0) {
  const direction = destination.clone().sub(mob.mesh.position).setY(0);
  const distance = direction.length();
  if (distance <= stop) { mob.velocity.x = mob.velocity.z = 0; mob.avoidTime = 0; return; }
  direction.normalize();
  let yaw = Math.atan2(direction.x, direction.z);
  mob.steerTimer = Math.max(0, (mob.steerTimer || 0) - dt);
  const clear = angle => {
    const p = mob.mesh.position.clone().add(new THREE.Vector3(Math.sin(angle) * 0.65, 0, Math.cos(angle) * 0.65));
    if (!manager.checkMobCollision(mob, p)) {
      const id = manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      return id !== BLOCKS.LAVA && id !== BLOCKS.FIRE && id !== BLOCKS.WATER;
    }
    p.y = Math.floor(p.y + 0.05) + 1;
    const clearance = mob.mesh.position.clone(); clearance.y = p.y;
    return !manager.checkMobCollision(mob, p) && !manager.checkMobCollision(mob, clearance);
  };
  if (mob.steerTimer > 0 && clear(mob.steerYaw)) yaw = mob.steerYaw;
  else if (!clear(yaw)) {
    const alternatives = [0.65, -0.65, 1.2, -1.2, Math.PI / 2, -Math.PI / 2, Math.PI];
    const angle = alternatives.map(a => yaw + a).find(clear);
    if (angle === undefined) { mob.velocity.x = mob.velocity.z = 0; return; }
    yaw = angle; mob.steerYaw = yaw; mob.steerTimer = 0.8;
  }
  mob.avoidTime = 0;
  mob.yaw = yaw;
  const stepSpeed = Math.min(speed, Math.max(0, distance - stop) / Math.max(dt, 0.001));
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
