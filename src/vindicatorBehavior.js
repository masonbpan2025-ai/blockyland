import * as THREE from 'three';
import { BLOCKS, ITEMS } from './blocks.js';
import { wanderMob } from './mobMotion.js';

/**
 * Vindicator rules and combat AI.
 * Reference: https://minecraft.wiki/w/Vindicator
 *
 * Stats:
 * - 24 HP (12 hearts)
 * - 0.6 x 1.95 m hitbox
 * - Speed: 0.25 (walk), 0.38 (sprint when chasing target)
 * - Attack damage with iron axe: Easy 7, Normal 13, Hard 19
 * - Johnny easter egg: If named "Johnny", attacks all mobs except other illagers, ghasts, and ravagers.
 * - Drops: 0-1 emerald, chance of iron axe, 5 XP.
 */

export const VINDICATOR_HEALTH = 24;
export const VINDICATOR_DIMENSIONS = { width: 0.6, height: 1.95 };
export const VINDICATOR_SPEED = { walk: 0.25, sprint: 0.38 };
export const VINDICATOR_DAMAGE = {
  peaceful: 0,
  easy: 7,
  normal: 13,
  hard: 19
};
export const VINDICATOR_ATTACK_REACH = 1.5;
export const VINDICATOR_ATTACK_COOLDOWN = 1.0;
export const VINDICATOR_SHIELD_DISABLE_SECONDS = 5.0;

export const ILLAGER_TYPES = ['vindicator', 'evoker', 'pillager', 'illusioner', 'ravager', 'witch'];

export function isVindicator(mob) {
  if (!mob) return false;
  const t = typeof mob === 'string' ? mob : mob.type;
  return t === 'vindicator';
}

/** True when the vindicator has been named Johnny (case-insensitive or exact). */
export function isJohnnyVindicator(mob) {
  if (!isVindicator(mob)) return false;
  const name = mob.customName || mob.name;
  return name === 'Johnny';
}

/** Check if vindicator considers target as an enemy */
export function vindicatorTargetsMob(vindicator, target, difficulty = 'normal') {
  if (!target || target.health <= 0) return false;
  if (difficulty === 'peaceful' && target.type === 'player') return false;

  // Johnny targets almost all mobs, excluding illagers, ghasts, and ravagers
  if (isJohnnyVindicator(vindicator)) {
    if (ILLAGER_TYPES.includes(target.type) || target.type === 'ghast') return false;
    return true;
  }

  // Standard targets: player, villagers, iron golems, wandering traders, snow golems
  if (target.type === 'player' && target.gamemode !== 'creative' && target.gamemode !== 'spectator') return true;
  if (target.type === 'villager' && !target.isBaby) return true;
  if (target.type === 'iron_golem' || target.type === 'snow_golem') return true;
  if (target.type === 'wandering_trader') return true;

  return false;
}

export function vindicatorDamageFor(difficulty = 'normal') {
  return VINDICATOR_DAMAGE[difficulty] ?? VINDICATOR_DAMAGE.normal;
}

export function vindicatorDrops(mob, { killedByPlayer = true, looting = 0, random = Math.random } = {}) {
  if (!isVindicator(mob)) return [];
  const drops = [];
  
  // 0-1 emerald (increased by looting)
  const emeraldMax = 1 + looting;
  const emeraldCount = Math.floor(random() * (emeraldMax + 1));
  if (emeraldCount > 0) {
    drops.push({ id: 'emerald', isBlock: false, count: emeraldCount });
  }

  // 8.5% chance to drop iron axe (increases with looting by 1% per level)
  const axeChance = 0.085 + looting * 0.01;
  if (killedByPlayer && random() < axeChance) {
    drops.push({ id: 'iron_axe', isBlock: false, count: 1 });
  }

  return drops;
}

export function vindicatorXp(mob, killedByPlayer = true) {
  if (!isVindicator(mob) || !killedByPlayer) return 0;
  return 5;
}

/** Animate vindicator arms: folded when neutral/idle, raised when attacking/chasing */
export function poseVindicator(mob, isAggressive = false) {
  if (!mob || !mob.mesh) return;
  // If model parts are accessible
  const rightArm = mob.rightArm || mob.mesh.getObjectByName?.('rightArm');
  const leftArm = mob.leftArm || mob.mesh.getObjectByName?.('leftArm');
  const foldedArms = mob.foldedArms || mob.mesh.getObjectByName?.('foldedArms');

  if (foldedArms) {
    foldedArms.visible = !isAggressive;
  }
  if (rightArm) {
    rightArm.visible = isAggressive;
    rightArm.rotation.x = isAggressive ? -Math.PI / 1.8 : 0;
  }
  if (leftArm) {
    leftArm.visible = isAggressive;
    leftArm.rotation.x = isAggressive ? -Math.PI / 1.8 : 0;
  }
}

/** Update vindicator AI behavior */
export function updateVindicatorAI(manager, mob, dt, player) {
  if (!isVindicator(mob) || mob.health <= 0) return false;
  const difficulty = manager.game?.difficulty ?? 'normal';
  if (difficulty === 'peaceful' && mob.target?.type === 'player') {
    mob.target = null;
  }

  mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

  // Acquire target if none or current dead
  if (!mob.target || mob.target.health <= 0) {
    mob.target = null;
    let bestDist = 16;
    if (mob.isAlerted) bestDist = 32;

    // Check player
    if (player && vindicatorTargetsMob(mob, player, difficulty)) {
      const d = mob.mesh.position.distanceTo(player.position);
      if (d <= bestDist) {
        mob.target = player;
        bestDist = d;
      }
    }

    // Check other mobs
    for (const other of manager.mobs) {
      if (other !== mob && vindicatorTargetsMob(mob, other, difficulty)) {
        const d = mob.mesh.position.distanceTo(other.mesh.position);
        if (d <= bestDist) {
          mob.target = other;
          bestDist = d;
        }
      }
    }
  }

  const hasTarget = !!mob.target;
  poseVindicator(mob, hasTarget);

  // No target in range: wander. An illager that only ever moves while chasing stands frozen at its spawn
  // point, which is what 'every advertised mob actually moves' catches.
  if (!hasTarget) {
    wanderMob(manager, mob, dt, 1.0);
    return false;
  }

  if (mob.target) {
    const targetPos = mob.target.position || mob.target.mesh?.position;
    if (!targetPos) {
      mob.target = null;
      return false;
    }

    const diff = targetPos.clone().sub(mob.mesh.position);
    diff.y = 0;
    const dist = diff.length();

    // Lose target if too far
    if (dist > 36) {
      mob.target = null;
      return false;
    }

    // Sprint toward target (0.38 m/s * scale)
    const moveSpeed = VINDICATOR_SPEED.sprint * 15;
    if (dist > VINDICATOR_ATTACK_REACH * 0.9) {
      diff.normalize();
      mob.velocity.x = diff.x * moveSpeed;
      mob.velocity.z = diff.z * moveSpeed;
      mob.yaw = Math.atan2(diff.x, diff.z);
      mob.mesh.rotation.y = mob.yaw;
    } else {
      mob.velocity.x *= 0.5;
      mob.velocity.z *= 0.5;
    }

    // Attack when within reach
    if (dist <= VINDICATOR_ATTACK_REACH && mob.hitCooldown <= 0) {
      const dmg = vindicatorDamageFor(difficulty);
      mob.hitCooldown = VINDICATOR_ATTACK_COOLDOWN;

      if (mob.target.type === 'player' || mob.target === player) {
        // If player is blocking with shield, disable shield for 5s!
        if (player.isBlocking) {
          player.shieldDisabledTimer = VINDICATOR_SHIELD_DISABLE_SECONDS;
          player.isBlocking = false;
          if (manager.sounds?.playItemBreak) manager.sounds.playItemBreak();
        }
        player.takeDamage?.(dmg, mob.mesh.position, 'vindicator');
      } else {
        manager.damageMob?.(mob.target, dmg, mob.mesh.position, false, mob);
      }
      if (manager.sounds?.playAttack) manager.sounds.playAttack();
    }
    return true;
  }

  return false;
}
