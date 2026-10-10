import * as THREE from 'three';
import { isPanda } from './pandaBehavior.js';
import { isSheep } from './sheepBehavior.js';
import { wanderMob } from './mobMotion.js';

/**
 * Evoker rules, spells and combat AI.
 * Reference: https://minecraft.wiki/w/Evoker
 *
 * Stats:
 * - 24 HP (12 hearts)
 * - 0.6 x 1.95 m hitbox
 * - Speed: 0.25 (walk), 0.5 (fleeing from close enemies)
 * - Spellcaster:
 *   1. Evoker Fangs: line or ring of ground fangs dealing 6 damage (bypassing armor).
 *   2. Summon Vexes: summons 3 vexes with puff of white particles.
 *   3. Wololo easter egg: converts blue sheep within 16 blocks to red sheep!
 * - Drops: ALWAYS 1 Totem of Undying, 0-1 emerald, 10 XP.
 */

export const EVOKER_HEALTH = 24;
export const EVOKER_DIMENSIONS = { width: 0.6, height: 1.95 };
export const EVOKER_SPEED = { walk: 0.25, flee: 0.5 };
export const EVOKER_FANG_DAMAGE = 6;
export const EVOKER_FANG_COOLDOWN = 5.0;
export const EVOKER_VEX_COOLDOWN = 17.0;
export const EVOKER_WOLOLO_COOLDOWN = 7.0;

export function isEvoker(mob) {
  if (!mob) return false;
  const t = typeof mob === 'string' ? mob : mob.type;
  return t === 'evoker';
}

export function evokerTargetsMob(evoker, target, difficulty = 'normal') {
  if (!target || target.health <= 0) return false;
  if (difficulty === 'peaceful' && target.type === 'player') return false;

  if (target.type === 'player' && target.gamemode !== 'creative' && target.gamemode !== 'spectator') return true;
  if (target.type === 'villager' && !target.isBaby) return true;
  if (target.type === 'iron_golem' || target.type === 'snow_golem') return true;
  if (target.type === 'wandering_trader') return true;

  return false;
}

export function evokerDrops(mob, { killedByPlayer = true, looting = 0, random = Math.random } = {}) {
  if (!isEvoker(mob)) return [];
  const drops = [];

  // Wiki: "Evokers always drop one totem of undying upon death, unaffected by Looting."
  drops.push({ id: 'totem_of_undying', isBlock: false, count: 1 });

  // 0-1 emerald (increased by looting)
  const emeraldMax = 1 + looting;
  const emeraldCount = Math.floor(random() * (emeraldMax + 1));
  if (emeraldCount > 0) {
    drops.push({ id: 'emerald', isBlock: false, count: emeraldCount });
  }

  return drops;
}

export function evokerXp(mob, killedByPlayer = true) {
  if (!isEvoker(mob) || !killedByPlayer) return 0;
  return 10;
}

/**
 * Summon evoker fangs in a line towards target or in a ring around evoker.
 */
export function castEvokerFangs(manager, evoker, targetPos, isRing = false) {
  if (!manager) return [];
  const fangs = [];
  const origin = evoker.mesh.position.clone();

  if (isRing) {
    // Ring of 8 fangs around evoker at radius 2.5
    const count = 8;
    const radius = 2.5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = origin.x + Math.sin(angle) * radius;
      const z = origin.z + Math.cos(angle) * radius;
      fangs.push({
        position: new THREE.Vector3(x, origin.y, z),
        delay: 0.6,
        snapTimer: 0.4,
        damage: EVOKER_FANG_DAMAGE,
        owner: evoker
      });
    }
  } else {
    // Line of fangs toward target (up to 16 fangs)
    const diff = targetPos.clone().sub(origin);
    diff.y = 0;
    const dist = Math.min(16, diff.length());
    diff.normalize();
    const count = Math.max(3, Math.floor(dist));
    for (let i = 1; i <= count; i++) {
      const p = origin.clone().addScaledVector(diff, i);
      fangs.push({
        position: p,
        delay: 0.3 + i * 0.05,
        snapTimer: 0.4,
        damage: EVOKER_FANG_DAMAGE,
        owner: evoker
      });
    }
  }

  if (!manager.activeFangs) manager.activeFangs = [];
  manager.activeFangs.push(...fangs);

  // Sound and particle effect
  if (manager.sounds?.playEvokerFangs) manager.sounds.playEvokerFangs();
  if (manager.spawnParticleBurst) {
    manager.spawnParticleBurst(origin.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x581c87, 10);
  }

  return fangs;
}

/**
 * Summon 3 vexes around evoker
 */
export function castSummonVexes(manager, evoker) {
  if (!manager || !manager.spawnMob) return [];
  const vexes = [];
  const pos = evoker.mesh.position;

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const vx = pos.x + Math.sin(angle) * 1.5;
    const vy = pos.y + 0.5 + Math.random() * 0.5;
    const vz = pos.z + Math.cos(angle) * 1.5;
    const vex = manager.spawnMob('vex', vx, vy, vz);
    if (vex) {
      vex.owner = evoker;
      vexes.push(vex);
    }
  }

  if (manager.sounds?.playEvokerSummon) manager.sounds.playEvokerSummon();
  if (manager.spawnParticleBurst) {
    manager.spawnParticleBurst(pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xe2e8f0, 12);
  }

  return vexes;
}

/**
 * Wololo Easter Egg:
 * If a blue sheep is within 16 blocks, evoker casts spell and changes its wool to red!
 */
export function castWololo(manager, evoker, blueSheep) {
  if (!blueSheep || blueSheep.type !== 'sheep' || blueSheep.woolColor !== 'blue') return false;
  blueSheep.woolColor = 'red';
  if (blueSheep.woolMesh?.material?.color) {
    blueSheep.woolMesh.material.color.setHex(0xdc2626);
  }
  if (manager.sounds?.playWololo) manager.sounds.playWololo();
  if (manager.spawnParticleBurst) {
    manager.spawnParticleBurst(evoker.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xf97316, 12);
    manager.spawnParticleBurst(blueSheep.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xdc2626, 10);
  }
  return true;
}

/**
 * Update evoker AI and spells
 */
export function updateEvokerAI(manager, mob, dt, player) {
  if (!isEvoker(mob) || mob.health <= 0) return false;
  const difficulty = manager.game?.difficulty ?? 'normal';
  if (difficulty === 'peaceful') return false;

  mob.fangCooldown = Math.max(0, (mob.fangCooldown || 0) - dt);
  mob.vexCooldown = Math.max(0, (mob.vexCooldown || 0) - dt);
  mob.wololoCooldown = Math.max(0, (mob.wololoCooldown || 0) - dt);
  mob.spellCastTimer = Math.max(0, (mob.spellCastTimer || 0) - dt);

  // If in middle of casting a spell, stay stationary and raise arms
  if (mob.spellCastTimer > 0) {
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    if (mob.rightArm) mob.rightArm.rotation.x = -Math.PI / 1.5;
    if (mob.leftArm) mob.leftArm.rotation.x = -Math.PI / 1.5;
    return true;
  }

  // 1. Check Wololo Easter Egg when not in combat
  if (!mob.target && mob.wololoCooldown <= 0) {
    for (const other of manager.mobs) {
      if (other !== mob && other.type === 'sheep' && other.woolColor === 'blue') {
        const d = mob.mesh.position.distanceTo(other.mesh.position);
        if (d <= 16) {
          mob.spellCastTimer = 2.0;
          mob.wololoCooldown = EVOKER_WOLOLO_COOLDOWN;
          castWololo(manager, mob, other);
          return true;
        }
      }
    }
  }

  // 2. Acquire combat target
  if (!mob.target || mob.target.health <= 0) {
    mob.target = null;
    let bestDist = 16;
    if (player && evokerTargetsMob(mob, player, difficulty)) {
      const d = mob.mesh.position.distanceTo(player.position);
      if (d <= bestDist) {
        mob.target = player;
        bestDist = d;
      }
    }
    for (const other of manager.mobs) {
      if (other !== mob && evokerTargetsMob(mob, other, difficulty)) {
        const d = mob.mesh.position.distanceTo(other.mesh.position);
        if (d <= bestDist) {
          mob.target = other;
          bestDist = d;
        }
      }
    }
  }

  // No target in range: wander. Like the vindicator, an evoker that only moves while chasing stands frozen
  // at its spawn point, which is what 'every advertised mob actually moves' catches.
  if (!mob.target) {
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

    if (dist > 24) {
      mob.target = null;
      return false;
    }

    mob.yaw = Math.atan2(diff.x, diff.z);
    mob.mesh.rotation.y = mob.yaw;

    // Flee if target gets within 3 blocks
    if (dist < 3.5) {
      diff.normalize();
      mob.velocity.x = -diff.x * EVOKER_SPEED.flee * 10;
      mob.velocity.z = -diff.z * EVOKER_SPEED.flee * 10;
    } else if (dist > 12) {
      // Advance to spell range
      diff.normalize();
      mob.velocity.x = diff.x * EVOKER_SPEED.walk * 10;
      mob.velocity.z = diff.z * EVOKER_SPEED.walk * 10;
    } else {
      // In comfortable spellcasting band
      mob.velocity.x *= 0.5;
      mob.velocity.z *= 0.5;
    }

    // Spell 1: Summon Vexes (if ready and < 8 vexes)
    if (mob.vexCooldown <= 0) {
      const activeVexes = manager.mobs.filter(m => m.type === 'vex' && m.health > 0).length;
      if (activeVexes < 8) {
        mob.spellCastTimer = 1.5;
        mob.vexCooldown = EVOKER_VEX_COOLDOWN;
        castSummonVexes(manager, mob);
        return true;
      }
    }

    // Spell 2: Fang Attack
    if (mob.fangCooldown <= 0) {
      mob.spellCastTimer = 1.0;
      mob.fangCooldown = EVOKER_FANG_COOLDOWN;
      const isRing = dist < 4.0;
      castEvokerFangs(manager, mob, targetPos, isRing);
      return true;
    }

    return true;
  }

  return false;
}
