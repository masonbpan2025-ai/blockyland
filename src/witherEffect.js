// Wither I deals five lethal-capable 1 HP ticks over ten seconds.
export function tickWither(effect, dt, damage) {
  const elapsed = Math.min(Math.max(0, effect.duration), Math.max(0, dt));
  effect.duration = Math.max(0, effect.duration - elapsed);
  effect.tickTimer = (effect.tickTimer || 0) + elapsed;
  const interval = 2 / 2 ** Math.max(0, (effect.level || 1) - 1);
  while (effect.tickTimer + 1e-9 >= interval) {
    effect.tickTimer = Math.max(0, effect.tickTimer - interval); damage(1);
  }
}

export function applyMobWither(mob, duration = 10) {
  if (mob.type === 'wither_skeleton' || mob.type === 'wither' || mob.health <= 0) return false;
  mob.witherEffect = { duration: Math.max(duration, mob.witherEffect?.duration || 0), level: 1, tickTimer: mob.witherEffect?.tickTimer || 0 };
  return true;
}

export function updateMobWither(manager, dt) {
  for (const mob of manager.mobs) {
    if (!mob.witherEffect || mob.health <= 0) continue;
    if (mob.type === 'wither_skeleton' || mob.type === 'wither') { delete mob.witherEffect; continue; }
    tickWither(mob.witherEffect, dt, amount => {
      // Effect damage bypasses armor and the separate melee invulnerability timer.
      const cooldown = mob.hitCooldown; mob.hitCooldown = 0;
      manager.damageMob(mob, amount, null, false, null, true); mob.hitCooldown = cooldown;
    });
    if (mob.witherEffect.duration <= 0) delete mob.witherEffect;
  }
}
