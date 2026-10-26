// Status effects on mobs.
//
// The player has always held effects (player.js applyStatusEffect); mobs did not -- only the wither skeleton and the
// zombified piglin had an applyStatusEffect of their own -- so every splash and lingering potion, tipped arrow, bee
// sting and illusioner spell that called `target.applyStatusEffect?.(...)` on any other mob did nothing. A splash of
// Weakness could not even start a zombie villager's cure. This gives every mob one, with the same rules the player's
// effects follow (statusEffects.js): a stronger effect replaces a weaker, a longer one a shorter of the same level;
// the mobs vanilla makes immune are; Healing and Harming are instant and reversed on the undead.
//
// What an effect does on a mob:
//   Poison, Wither, Regeneration   tick on their own intervals (Poison never below 1 HP; Wither through witherEffect.js)
//   Speed, Slowness                scale the mob's movement (scaleMobMotion, run after each mob's update)
//   Strength, Weakness             add to or take from its melee hit (mobMeleeDamage)
//   Resistance                     takes from the damage it takes (damageMob)
//   Fire Resistance                no burning or fire damage (heat.js and the burn ticks read hasStatusEffect)
//   Slow Falling, Jump Boost       no fall damage / less of it (mobEnvironment.js trackFall), and a slow descent
//   Invisibility                   the mob is not drawn
//   Infested                       10% when hurt: 1-2 silverfish                                   (wiki: Infested)
//   Oozing                         on death, two medium slimes, up to 24 slimes in a 5x5x5 cube    (wiki: Oozing)
//   Weaving                        on death, 2-3 cobwebs on solid tops in a 3x3x3 cube             (wiki: Weaving)
//   Wind Charged                   on death, a wind charge's burst                                 (wiki: Wind Charged)
// Other effects are held (hasStatusEffect answers for them) without a rule of their own on a mob.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { effectsFor, immuneToEffect, instantOutcomeOnMob, tickEffect, speedMultiplier, damageTakenMultiplier, attackDamageBonus, FALL_DAMAGE } from './statusEffects.js';
import { applyMobWither } from './witherEffect.js';
import { windChargeBurst, WIND_CHARGE_BURST } from './breezeBehavior.js';

export const INFESTED_CHANCE = 0.1;
export const OOZING_SLIMES = 2, OOZING_SLIME_SIZE = 2, OOZING_CRAMMING = 24;
export const WEAVING_COBWEBS = [2, 3];

/** Give a mob effects, unless it already has its own (the wither skeleton, the zombified piglin). */
export function installMobEffects(manager, mob) {
  if (!mob || typeof mob !== 'object' || mob.effectsInstalled) return mob;
  mob.effectsInstalled = true;
  mob.effects ??= new Map();
  if (!mob.applyStatusEffect) {
    mob.applyStatusEffect = (name, seconds = 30, level = 1) => applyMobEffect(manager, mob, name, seconds, level);
    mob.hasStatusEffect = (name) => mob.effects.has(name) || (name === 'wither' && Boolean(mob.witherEffect));
    mob.clearStatusEffect = (name) => endMobEffect(mob, name);
  }
  // Effects a save brought back (mobState.js), applied as they were when it was written.
  for (const [name, seconds, level] of mob.savedEffects ?? []) mob.applyStatusEffect(name, seconds, level);
  delete mob.savedEffects;
  return mob;
}

/** Put an effect on a mob. @returns {boolean} whether it took */
export function applyMobEffect(manager, mob, name, seconds = 30, level = 1) {
  if (!mob || mob.health <= 0 || !name) return false;
  if (immuneToEffect(name, mob.type)) return false;
  const outcome = instantOutcomeOnMob(name, level, mob.type);
  if (outcome) {
    if (outcome.damage) manager?.damageMob?.(mob, outcome.damage, null, false, null, true);
    else mob.health = Math.min(mob.maxHealth ?? mob.health, mob.health + outcome.heal);
    return true;
  }
  // A compound effect (the Turtle Master) is its parts.
  const parts = effectsFor(name, level);
  if (parts.length > 1 || parts[0]?.[0] !== name) return parts.map(([part, l]) => applyMobEffect(manager, mob, part, seconds, l)).some(Boolean);
  if (name === 'wither' && !applyMobWither(mob, seconds)) return false;
  const effects = (mob.effects ??= new Map()), current = effects.get(name);
  if (current && (current.level > level || (current.level === level && current.duration >= seconds))) return true;
  effects.set(name, { duration: seconds, level, tickTimer: current?.tickTimer ?? 0 });
  // The shape older code reads: `statusEffects[name]` in seconds (the zombie villager's cure looks for weakness there).
  (mob.statusEffects ??= {})[name] = seconds;
  if (name === 'weakness') mob.hasWeakness = true;
  if (name === 'fire_resistance') { mob.fireResistanceTime = seconds; mob.isBurning = false; }
  if (name === 'invisibility' && mob.mesh) mob.mesh.visible = false;
  return true;
}

function endMobEffect(mob, name) {
  mob.effects?.delete(name);
  if (mob.statusEffects) delete mob.statusEffects[name];
  if (name === 'weakness') mob.hasWeakness = false;
  if (name === 'fire_resistance') mob.fireResistanceTime = 0;
  if (name === 'invisibility' && mob.mesh) mob.mesh.visible = true;
}

/** Hurt a mob by an effect: through the armour and the hit cooldown, as the wither does. */
function effectDamage(manager, mob, amount) {
  const cooldown = mob.hitCooldown; mob.hitCooldown = 0;
  manager.damageMob(mob, amount, null, false, null, true);
  mob.hitCooldown = cooldown;
}

/** Every mob's effects, one frame: ticking, counting down, ending. Mobs spawned without them get them here. */
export function updateMobEffects(manager, dt) {
  for (const mob of manager.mobs ?? []) {
    installMobEffects(manager, mob);
    if (!mob.effects?.size || mob.health <= 0) continue;
    for (const [name, data] of [...mob.effects]) {
      const tick = name === 'wither' ? null : tickEffect(name, data, dt);
      if (tick?.damage) {
        const amount = tick.cannotKill ? Math.min(tick.damage, Math.max(0, mob.health - 1)) : tick.damage;
        if (amount > 0) effectDamage(manager, mob, amount);
      } else if (tick?.heal) mob.health = Math.min(mob.maxHealth ?? mob.health, mob.health + tick.heal);
      data.duration -= dt;
      if (mob.statusEffects) mob.statusEffects[name] = Math.max(0, data.duration);
      if (name === 'fire_resistance') mob.fireResistanceTime = Math.max(0, data.duration);
      if (data.duration <= 0) endMobEffect(mob, name);
    }
    // Something else may show a mob again (a model swap, a culling pass): invisible is invisible.
    if (mob.effects.has('invisibility') && mob.mesh) mob.mesh.visible = false;
  }
}

/** A mob's melee hit with its Strength and Weakness: +3 a level and -4 a level, never below nothing. */
export function mobMeleeDamage(mob, base) {
  if (!mob?.effects?.size) return base;
  return Math.max(0, base + attackDamageBonus(mob.effects));
}

/** The share of a hit a mob takes after its Resistance (20% less a level). */
export function mobDamageTaken(mob) {
  return mob?.effects?.size ? damageTakenMultiplier(mob.effects) : 1;
}

/**
 * Speed and Slowness on how far a mob moved this frame, and Slow Falling on how far it fell. Slower is always safe;
 * the extra of a faster step is taken only into open space, so Speed cannot carry a mob into a wall.
 */
export function scaleMobMotion(world, mob, startX, startY, startZ, dt) {
  if (!mob?.effects?.size || !mob.mesh) return;
  const p = mob.mesh.position, factor = speedMultiplier(mob.effects);
  if (factor !== 1) {
    const dx = p.x - startX, dz = p.z - startZ;
    if (factor < 1) { p.x = startX + dx * factor; p.z = startZ + dz * factor; }
    else {
      const x = p.x + dx * (factor - 1), z = p.z + dz * (factor - 1);
      // A block's definition leaves `solid` out unless it is false.
      const open = (y) => BLOCK_DEFS[world?.getVoxel?.(Math.floor(x), Math.floor(y), Math.floor(z)) ?? 0]?.solid === false;
      if (open(p.y + 0.1) && open(p.y + Math.max(1, (mob.height ?? 1.8) - 0.1))) { p.x = x; p.z = z; }
    }
  }
  if (mob.effects.has('slow_falling') && Number.isFinite(startY) && p.y < startY && dt > 0) {
    const limit = FALL_DAMAGE.slowFallingSpeed;
    p.y = Math.max(p.y, startY - limit * dt);
    if (mob.velocity && mob.velocity.y < -limit) mob.velocity.y = -limit;
  }
}

/** Infested: a 10% chance, each time the mob is hurt, of 1-2 silverfish. */
export function onMobHurt(manager, mob, random = Math.random) {
  if (!mob?.effects?.has('infested') || mob.type === 'silverfish' || !mob.mesh) return [];
  if (random() >= INFESTED_CHANCE) return [];
  const p = mob.mesh.position, spawned = [];
  for (let n = 1 + (random() < 0.5 ? 0 : 1); n > 0; n--) {
    const s = manager.spawnMob?.('silverfish', p.x + (random() - 0.5), p.y, p.z + (random() - 0.5));
    if (s) spawned.push(s);
  }
  return spawned;
}

/**
 * What a mob's effects leave when it dies: Oozing's slimes, Weaving's cobwebs, Wind Charged's burst. Once per death.
 * @returns {{slimes:number, cobwebs:Array<[number,number,number]>, burst:boolean}}
 */
export function onMobDeath(manager, mob, random = Math.random) {
  const result = { slimes: 0, cobwebs: [], burst: false };
  if (!mob?.effects?.size || mob.deathEffectsDone || !mob.mesh) return result;
  mob.deathEffectsDone = true;
  const p = mob.mesh.position, effects = mob.effects;
  if (effects.has('oozing')) {
    const nearby = (manager.mobs ?? []).filter((m) => m.type === 'slime' && m.health > 0 && m.mesh
      && Math.abs(m.mesh.position.x - p.x) <= 2.5 && Math.abs(m.mesh.position.y - p.y) <= 2.5 && Math.abs(m.mesh.position.z - p.z) <= 2.5).length;
    for (let i = 0; i < Math.min(OOZING_SLIMES, OOZING_CRAMMING - nearby); i++) {
      const slime = manager.spawnSlime?.(p.x + (random() - 0.5), p.y, p.z + (random() - 0.5), OOZING_SLIME_SIZE);
      if (slime) result.slimes++;
    }
  }
  if (effects.has('weaving') && manager.world) {
    const world = manager.world, spots = [];
    const bx = Math.floor(p.x), by = Math.floor(p.y + 0.5), bz = Math.floor(p.z);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const x = bx + dx, y = by + dy, z = bz + dz, here = world.getVoxel(x, y, z), below = BLOCK_DEFS[world.getVoxel(x, y - 1, z)];
      // On top of a block with a full top face, in open air, never on a cobweb.
      if (here === BLOCKS.AIR && below && below.solid !== false && !below.slab && !below.stair && !below.plant) spots.push([x, y, z]);
    }
    const want = WEAVING_COBWEBS[0] + Math.floor(random() * (WEAVING_COBWEBS[1] - WEAVING_COBWEBS[0] + 1));
    while (spots.length && result.cobwebs.length < want) {
      const [x, y, z] = spots.splice(Math.floor(random() * spots.length), 1)[0];
      world.setVoxel(x, y, z, BLOCKS.COBWEB);
      result.cobwebs.push([x, y, z]);
    }
    for (const chunk of new Set(result.cobwebs.map(([x, , z]) => world.getChunk?.(Math.floor(x / 16), Math.floor(z / 16))))) if (chunk) manager.game?.rebuildChunkMesh?.(chunk);
  }
  if (effects.has('wind_charged')) {
    const position = p.clone ? p.clone() : { ...p };
    if (position.y !== undefined) position.y += (mob.height ?? 1) / 2;
    const player = manager.game?.player;
    const near = player?.position && Math.hypot(player.position.x - position.x, player.position.y - position.y, player.position.z - position.z) <= WIND_CHARGE_BURST.radius;
    windChargeBurst(manager, { position, shooter: mob, target: near ? player : null });
    result.burst = true;
  }
  return result;
}
