// Creeper behaviour, from https://minecraft.wiki/w/Creeper and https://minecraft.wiki/w/Explosion.
//
// Before this module a creeper "exploded" the instant it was within 2 blocks of the player, for a flat 10 damage, with no
// warning. The wiki's creeper does this instead:
//
//   - It chases a player within 16 blocks.
//   - Inside 3 blocks it starts to swell: a 1.5 second (30 tick) fuse, during which it stands still and flashes.
//   - If the player gets more than 7 blocks away the fuse winds back down, a tick per tick, instead of detonating.
//   - When the fuse runs out it explodes with power 3 (6 when charged), damaging everything near it and breaking blocks.
//   - A creeper that explodes drops nothing.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { isDestroyedByExplosion } from './blockHarvestData.js';

export const CREEPER_FUSE_SECONDS = 1.5;
export const CREEPER_IGNITE_RANGE = 3;
export const CREEPER_CANCEL_RANGE = 7;
export const CREEPER_FOLLOW_RANGE = 16;
export const CREEPER_POWER = 3;
export const CHARGED_CREEPER_POWER = 6;
export const CREEPER_SPEED = 2.5;

/**
 * Damage an explosion deals to an entity `distance` blocks from its centre (wiki: Explosion#Damage).
 *   impact = (1 - distance / (2 * power)) * exposure
 *   damage = floor((impact^2 + impact) / 2 * 7 * power + 1)
 * then scaled by difficulty: Easy min(d / 2 + 1, d), Normal d, Hard 3d / 2. Peaceful deals none.
 */
export function explosionDamage(power, distance, difficulty = 'normal', exposure = 1) {
  if (difficulty === 'peaceful') return 0;
  const impact = (1 - distance / (2 * power)) * exposure;
  if (impact <= 0) return 0;
  const raw = Math.floor(((impact * impact + impact) / 2) * 7 * power + 1);
  if (difficulty === 'easy') return Math.min(Math.floor(raw / 2) + 1, raw);
  if (difficulty === 'hard') return Math.floor(raw * 1.5);
  return raw;
}

export const creeperPower = (mob) => (mob.charged ? CHARGED_CREEPER_POWER : CREEPER_POWER);
export const isCreeper = (mob) => mob?.type === 'creeper';

/** Fraction of the fuse that has burned, 0 to 1. */
export function fuseProgress(mob) {
  return Math.min(1, Math.max(0, (mob.fuseTime || 0) / CREEPER_FUSE_SECONDS));
}

function targetable(player) {
  return !!player?.position && player.gamemode !== 'creative' && player.gamemode !== 'spectator';
}

/** Blow the creeper up now. Damages the player and nearby mobs, and breaks blocks. */
export function detonateCreeper(manager, mob, player) {
  const power = creeperPower(mob);
  const difficulty = manager.game?.difficulty ?? 'normal';
  const center = mob.mesh.position.clone().add(new THREE.Vector3(0, (mob.height ?? 1.7) / 2, 0));

  manager.sounds?.playExplosion?.();
  manager.entities?.spawnExplosion?.(center);

  if (targetable(player)) {
    const d = center.distanceTo(player.position.clone().add(new THREE.Vector3(0, 0.9, 0)));
    const dmg = explosionDamage(power, d, difficulty);
    if (dmg > 0) player.takeDamage?.(dmg, mob.mesh.position, 'creeper');
  }
  for (const other of manager.mobs.slice()) {
    if (other === mob || other.health <= 0 || other.dying) continue;
    const d = center.distanceTo(other.mesh.position.clone().add(new THREE.Vector3(0, (other.height ?? 1) / 2, 0)));
    const dmg = explosionDamage(power, d, difficulty);
    if (dmg > 0) manager.damageMob(other, dmg, center, false, null, true);
  }

  // Blocks: everything within reach of the blast whose resistance it can beat.
  const world = manager.world;
  if (world?.setVoxel && difficulty !== 'peaceful') {
    const reach = Math.ceil(power * 1.3);
    const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
    for (let x = cx - reach; x <= cx + reach; x++) {
      for (let y = cy - reach; y <= cy + reach; y++) {
        for (let z = cz - reach; z <= cz + reach; z++) {
          if (Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z) > power * 1.1) continue;
          const voxel = world.getVoxel(x, y, z);
          if (voxel !== BLOCKS.AIR && isDestroyedByExplosion(voxel, power)) world.setVoxel(x, y, z, BLOCKS.AIR);
        }
      }
    }
  }

  mob.exploded = true;
  mob.health = 0;
  mob.noLoot = true; // a creeper that explodes drops nothing
}

/**
 * One tick of creeper AI. Returns true when the creeper has just exploded, so the caller can stop processing it.
 */
export function updateCreeper(manager, mob, dt, player, distToPlayer) {
  const seen = targetable(player) && distToPlayer < CREEPER_FOLLOW_RANGE;
  mob.fuseTime = mob.fuseTime || 0;

  if (!seen) {
    // Nothing to chase: the fuse winds back down and the creeper wanders (the caller's wander handles movement).
    mob.fuseTime = Math.max(0, mob.fuseTime - dt);
    mob.swelling = false;
    mob.isFlashing = false;
    return false;
  }

  // Start inside 3 blocks, keep swelling out to 7, wind down beyond that.
  if (distToPlayer < CREEPER_IGNITE_RANGE) mob.swelling = true;
  else if (distToPlayer > CREEPER_CANCEL_RANGE) mob.swelling = false;

  if (mob.swelling) {
    mob.fuseTime = Math.min(CREEPER_FUSE_SECONDS, mob.fuseTime + dt);
    mob.velocity.x = 0;
    mob.velocity.z = 0;
  } else {
    mob.fuseTime = Math.max(0, mob.fuseTime - dt);
    const dir = player.position.clone().sub(mob.mesh.position);
    dir.y = 0;
    if (dir.lengthSq() > 1.44) {
      dir.normalize();
      const targetYaw = Math.atan2(dir.x, dir.z);
      const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
      mob.yaw += turn * Math.min(1.0, 9 * dt);
      if (!mob.avoidTime || mob.avoidTime <= 0) {
        mob.velocity.x = Math.sin(mob.yaw) * CREEPER_SPEED;
        mob.velocity.z = Math.cos(mob.yaw) * CREEPER_SPEED;
      }
    }
  }

  // The swell: the body grows and flashes white as the fuse burns.
  const p = fuseProgress(mob);
  mob.isFlashing = p > 0 && Math.floor(p * 20) % 2 === 0;
  const grow = 1 + 0.25 * p;
  mob.mesh.scale.set(grow, 1 + 0.1 * p, grow);

  if (mob.fuseTime >= CREEPER_FUSE_SECONDS) {
    detonateCreeper(manager, mob, player);
    return true;
  }
  return false;
}
