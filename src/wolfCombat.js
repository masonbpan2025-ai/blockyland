// Wild wolf aggression, from https://minecraft.wiki/w/Wolf#Behavior.
//
// A wild wolf is neutral. When a player or mob hurts it, and does not kill it in one hit, it turns hostile toward that
// attacker for 20-39 seconds, chases it and bites. Every other wild wolf within 16 blocks joins in, since a pack
// defends its own. Before this module a wild wolf did nothing at all when struck: it wandered off.
import { meleeDamage } from './mobEnvironment.js';

export const WOLF_ANGER_SECONDS = { min: 20, max: 39 };
export const WOLF_PACK_RADIUS = 16;
export const WOLF_BITE_REACH = 1.5;
export const WOLF_BITE_COOLDOWN = 1.0;
export const WOLF_CHASE_SPEED = 5.0;
export const TAMED_WOLF_BITE = 4;

const isWildWolf = (mob) => mob?.type === 'wolf' && !mob.isTamed;
const isMob = (t) => !!t?.mesh;
const targetable = (t) => !!t && (isMob(t) ? t.health > 0 : t.gamemode !== 'creative' && t.gamemode !== 'spectator');

/** Anger a wild wolf (and its pack) at `attacker`. Returns true if it is now angry. */
export function angerWolf(manager, wolf, attacker, random = Math.random) {
  if (!isWildWolf(wolf) || wolf.health <= 0 || !attacker) return false;
  const seconds = WOLF_ANGER_SECONDS.min + random() * (WOLF_ANGER_SECONDS.max - WOLF_ANGER_SECONDS.min + 1);
  wolf.angerTimer = Math.max(wolf.angerTimer || 0, seconds);
  wolf.angerTarget = attacker;
  wolf.isAngry = true;
  for (const other of manager.mobs) {
    if (other === wolf || !isWildWolf(other) || other.health <= 0 || other.angerTimer > 0) continue;
    if (other.mesh.position.distanceTo(wolf.mesh.position) > WOLF_PACK_RADIUS) continue;
    other.angerTimer = seconds;
    other.angerTarget = attacker;
    other.isAngry = true;
  }
  return true;
}

/**
 * One tick of an angry wild wolf. Returns true when it is angry and has taken over the mob's movement this tick, so the
 * caller applies motion and stops there.
 */
export function updateAngryWolf(manager, wolf, dt, player) {
  if (!isWildWolf(wolf) || !(wolf.angerTimer > 0)) { if (wolf.isAngry) wolf.isAngry = false; return false; }
  wolf.angerTimer -= dt;
  const target = wolf.angerTarget ?? player;
  const pos = target?.position ?? target?.mesh?.position;
  if (!pos || !targetable(target) || wolf.angerTimer <= 0) {
    wolf.angerTimer = 0; wolf.isAngry = false; wolf.angerTarget = null;
    return false;
  }
  const dir = pos.clone().sub(wolf.mesh.position);
  dir.y = 0;
  const dist = dir.length();
  wolf.biteCooldown = Math.max(0, (wolf.biteCooldown || 0) - dt);
  if (dist > WOLF_BITE_REACH - 0.2) {
    dir.normalize();
    wolf.yaw = Math.atan2(dir.x, dir.z);
    wolf.velocity.x = dir.x * WOLF_CHASE_SPEED;
    wolf.velocity.z = dir.z * WOLF_CHASE_SPEED;
  } else {
    wolf.velocity.x *= 0.5;
    wolf.velocity.z *= 0.5;
  }
  if (dist <= WOLF_BITE_REACH && wolf.biteCooldown <= 0) {
    wolf.biteCooldown = WOLF_BITE_COOLDOWN;
    const damage = meleeDamage('wolf', manager.game?.difficulty, 4);
    if (isMob(target)) manager.damageMob(target, damage, wolf.mesh.position, false, wolf);
    else target.takeDamage?.(damage, wolf.mesh.position, 'wolf');
  }
  return true;
}
