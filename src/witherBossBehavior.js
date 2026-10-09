import * as THREE from 'three';
import { BLOCKS, ITEMS } from './blocks.js';

/**
 * Wither boss rules, phases and combat AI.
 * Reference: https://minecraft.wiki/w/Wither
 *
 * Stats & Characteristics:
 * - 300 HP (150 hearts)
 * - Hitbox: 0.9 m wide x 3.5 m high
 * - Undead: hurt by healing, healed by harming, immune to poison/wither, smite bonus damage
 * - Boss bar: Purple / Cyan ("The Wither")
 * - Birth Phase:
 *   - 11s (220 ticks) invulnerable charging up to full 300 HP
 *   - Flashes and expands from 0.4 scale to 1.0 scale
 *   - Power-7 birth explosion at end of charge
 * - 3 Heads AI:
 *   - Center head tracks primary target (player)
 *   - Left and right heads independently target nearby mobs within 16 blocks
 *   - Fires Wither Skulls (black and rare blue skulls) inflicting Wither II effect
 * - Wither Armor Phase:
 *   - When at or below 50% HP (<= 150 HP):
 *   - 100% IMMUNE to arrows and all projectiles! Projectiles bounce off.
 *   - Descends closer to ground for melee combat
 * - Drops:
 *   - 100% 1 Nether Star (unaffected by Looting)
 *   - 50 XP
 */

export const WITHER_HEALTH = 300;
export const WITHER_DIMENSIONS = { width: 0.9, height: 3.5 };
export const WITHER_BIRTH_CHARGE_SECONDS = 11.0;
export const WITHER_ARMOR_THRESHOLD = 150;
export const WITHER_SKULL_SPEED = 22.0;
export const WITHER_SKULL_DAMAGE = {
  peaceful: 0,
  easy: 5,
  normal: 8,
  hard: 12
};
export const WITHER_XP = 50;

export const WITHER_UNDEAD_TRAITS = {
  undead: true,
  poisonImmune: true,
  witherImmune: true,
  invertedHealing: true,
  canBreatheUnderwater: true,
  sensitiveToSmite: true,
  burnsInDaylight: false // Wither does NOT burn in daylight
};

export function isWither(mob) {
  if (!mob) return false;
  const t = typeof mob === 'string' ? mob : mob.type;
  return t === 'wither';
}

export function witherDimensions() {
  return WITHER_DIMENSIONS;
}

export function isWitherArmored(mob) {
  if (!isWither(mob)) return false;
  return mob.health <= WITHER_ARMOR_THRESHOLD;
}

export function witherSkullDamageFor(difficulty = 'normal', isBlue = false) {
  const base = WITHER_SKULL_DAMAGE[difficulty] ?? WITHER_SKULL_DAMAGE.normal;
  return isBlue ? base * 1.5 : base;
}

export function witherDrops(mob, { killedByPlayer = true } = {}) {
  if (!isWither(mob)) return [];
  // Wiki: "The wither always drops one nether star upon death. Looting does not affect the drop."
  return [
    { id: 'nether_star', isBlock: false, count: 1 }
  ];
}

export function witherXp(mob, killedByPlayer = true) {
  if (!isWither(mob) || !killedByPlayer) return 0;
  // Wiki: "50 experience points when killed by a player or tamed wolf"
  return WITHER_XP;
}

/**
 * Fires a wither skull projectile from origin toward target
 */
export function fireWitherSkull(manager, fromPos, targetPos, isBlue = false) {
  if (!manager) return null;
  const dir = targetPos.clone().sub(fromPos).normalize();
  const skullMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 6, 6),
    new THREE.MeshBasicMaterial({ color: isBlue ? 0x0284c7 : 0x18181b })
  );
  skullMesh.position.copy(fromPos).add(new THREE.Vector3(0, 1.2, 0));
  manager.scene?.add(skullMesh);

  if (!manager.witherSkulls) manager.witherSkulls = [];
  const skull = {
    mesh: skullMesh,
    position: skullMesh.position.clone(),
    velocity: dir.multiplyScalar(WITHER_SKULL_SPEED),
    isBlue,
    age: 0
  };
  manager.witherSkulls.push(skull);
  return skull;
}

/**
 * Update Wither AI per frame
 */
export function updateWitherAI(manager, wither, dt, player) {
  if (!isWither(wither) || wither.health <= 0) return false;
  const difficulty = manager.game?.difficulty ?? 'normal';
  if (difficulty === 'peaceful') return false;

  if (!wither.velocity) wither.velocity = new THREE.Vector3();

  // 1. Birth charge phase (11s)
  if (wither.summonChargeTimer > 0) {
    wither.isInvulnerable = true;
    wither.summonChargeTimer -= dt;
    const progress = 1.0 - (wither.summonChargeTimer / WITHER_BIRTH_CHARGE_SECONDS);
    const s = 0.4 + progress * 0.6;
    if (wither.mesh) {
      wither.mesh.scale.set(s, s, s);
      wither.mesh.position.y += dt * 0.2;
    }
    // Slowly gain health up to 300
    wither.health = Math.min(WITHER_HEALTH, Math.floor(progress * WITHER_HEALTH));

    manager.ui?.setBossBar?.('wither', 'The Wither (Charging)', progress, '#06b6d4');

    if (wither.summonChargeTimer <= 0) {
      // Birth Explosion!
      wither.isInvulnerable = false;
      wither.health = WITHER_HEALTH;
      if (manager.sounds?.playExplosion) manager.sounds.playExplosion();
      if (manager.spawnParticleBurst) {
        manager.spawnParticleBurst(wither.mesh.position, 0x38bdf8, 40);
      }
      player?.takeDamage?.(12, wither.mesh.position, 'wither_birth');
    }
    return true;
  }

  // 2. Wither Armor & Combat Phase
  const isArmored = isWitherArmored(wither);
  wither.isImmuneToProjectiles = isArmored;
  wither.hasWitherArmor = isArmored;

  const hpPercent = wither.health / wither.maxHealth;
  const barTitle = isArmored ? 'The Wither (Wither Armor)' : 'The Wither';
  manager.ui?.setBossBar?.('wither', barTitle, hpPercent, isArmored ? '#38bdf8' : '#581c87');

  const pPos = player?.position || new THREE.Vector3(0, 0, 0);

  // Movement: hover high above player, descend closer when armored
  const targetY = isArmored ? pPos.y + 2.5 : pPos.y + 7.0;
  const dirToPlayer = pPos.clone().sub(wither.mesh.position);
  dirToPlayer.y = 0;
  dirToPlayer.normalize();

  const moveSpeed = isArmored ? 5.5 : 3.5;
  wither.velocity.x = dirToPlayer.x * moveSpeed;
  wither.velocity.z = dirToPlayer.z * moveSpeed;
  wither.velocity.y = (targetY - wither.mesh.position.y) * 0.8;
  wither.yaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);
  if (wither.mesh) wither.mesh.rotation.y = wither.yaw;

  // 3. Firing 3 heads
  wither.shootCooldown = (wither.shootCooldown || 1.8) - dt;
  if (wither.shootCooldown <= 0) {
    wither.shootCooldown = isArmored ? 1.2 : 1.8;

    // Center head: fires directly at primary target (player)
    fireWitherSkull(manager, wither.mesh.position, pPos, false);

    // Side heads: look for other nearby mobs or offset targets
    let sideTarget1 = null;
    let sideTarget2 = null;
    if (manager.mobs) {
      for (const other of manager.mobs) {
        if (other !== wither && other.health > 0 && !other.undead && other.type !== 'wither') {
          const d = wither.mesh.position.distanceTo(other.mesh.position);
          if (d <= 16.0) {
            if (!sideTarget1) sideTarget1 = other.mesh.position;
            else if (!sideTarget2) { sideTarget2 = other.mesh.position; break; }
          }
        }
      }
    }
    if (!sideTarget1) sideTarget1 = pPos.clone().add(new THREE.Vector3(3, 0, 3));
    if (!sideTarget2) sideTarget2 = pPos.clone().add(new THREE.Vector3(-3, 0, -3));

    // 20% chance for a side head to shoot a blue skull
    fireWitherSkull(manager, wither.mesh.position, sideTarget1, Math.random() < 0.2);
    fireWitherSkull(manager, wither.mesh.position, sideTarget2, false);

    if (manager.sounds?.playWitherShoot) manager.sounds.playWitherShoot();
  }

  // Wither Armor visual pulse
  if (isArmored && manager.spawnParticleBurst && Math.random() < 0.2) {
    manager.spawnParticleBurst(wither.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x38bdf8, 3);
  }

  return true;
}
