// Environmental rules shared by every mob: falling, drowning and sunlight.
//
// These were missing from most mobs. A pig, zombie or villager took no fall damage, no mob drowned, and zombies
// and skeletons did not burn in daylight, even though each is stated on the mob's wiki page and on
// https://minecraft.wiki/w/Mob. The numbers come from src/mobWikiData.js (generated from the wiki), not from here.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { exposedToRain } from './weatherRules.js';
import { MOB_FALL_RULES, MOB_BREATHES_UNDERWATER, MOB_KILL_XP, MOB_KNOCKBACK_RESISTANCE, MOB_MELEE_DAMAGE } from './mobWikiData.js';

/** Free blocks before fall damage starts. https://minecraft.wiki/w/Damage#Fall_damage */
export const SAFE_FALL_BLOCKS = 3;
/** Seconds of air a drowning mob has (300 ticks), then 2 damage every second. https://minecraft.wiki/w/Drowning */
export const AIR_SUPPLY_SECONDS = 15;
export const DROWN_DAMAGE = 2;
export const DROWN_INTERVAL = 1;

/** Undead that burn in sunlight (the wiki's prose; the entity-tag list disagrees with it for the wither skeleton). */
export const SUN_BURNING_TYPES = new Set(['zombie', 'zombie_villager', 'skeleton', 'drowned']);

const BREATHES = new Set(MOB_BREATHES_UNDERWATER);

/**
 * Experience dropped when a player (or tamed wolf) kills a mob, from the wiki's Drops section. A mob the wiki gives no
 * value for falls back to the 1-3 every animal drops.
 */
export function rollKillXp(type, random = Math.random) {
  const range = MOB_KILL_XP[type];
  if (!range) return 1 + Math.floor(random() * 3);
  return range[0] + Math.floor(random() * (range[1] - range[0] + 1));
}

/**
 * A mob's melee damage at the current difficulty, from the wiki's Easy / Normal / Hard figures, or `fallback` for a
 * mob (or difficulty) the wiki gives none for.
 */
export function meleeDamage(type, difficulty = 'normal', fallback = 3) {
  const row = MOB_MELEE_DAMAGE[type];
  return row?.[difficulty] ?? row?.normal ?? fallback;
}

/**
 * Whether the player is holding (main hand or off hand) a food this mob is tempted by, from the same breeding-food table
 * the cow and pig use. https://minecraft.wiki/w/Breeding#Food
 */
export function holdsTemptFood(manager, mob, player) {
  const inv = player?.inventory;
  const held = inv?.getActiveItem?.() || inv?.getOffhandItem?.();
  if (!held) return false;
  const id = typeof held.id === 'string' ? held.id.toLowerCase().trim() : held.id;
  return !!manager.animalBehaviors?.isBreedingFood(mob.type, id);
}

/** Share of knockback a mob takes, from its wiki knockback resistance, or undefined when the wiki gives none. */
export function knockbackFactor(type) {
  const resist = MOB_KNOCKBACK_RESISTANCE[type];
  return resist === undefined ? undefined : 1 - resist;
}

/**
 * Some movers (fish, flyers, the drowned) never read `mob.knockback`, so a hit pushed them nowhere. A mover that does
 * read it sets `knockbackConsumed`; when the previous frame's mover did not, the push is applied here instead.
 */
export function applyUnconsumedKnockback(manager, mob, dt) {
  const kb = mob.knockback;
  if (!kb) return;
  const consumed = mob.knockbackConsumed;
  mob.knockbackConsumed = false;
  if (consumed || mob.dying || mob.health <= 0) return;
  if (Math.hypot(kb.x, kb.z) < 0.05) return;
  const pos = mob.mesh.position;
  const candidate = pos.clone().addScaledVector(kb, dt);
  if (!manager.checkMobCollision(mob, candidate)) pos.copy(candidate);
  kb.multiplyScalar(Math.exp(-8 * dt));
}

/** Damage from landing after a fall of `distance` blocks, or 0. Mirrors the wiki's per-mob fall rules. */
export function fallDamageFor(type, distance) {
  const rule = MOB_FALL_RULES[type];
  if (rule?.immune) return 0;
  const safe = rule?.safeBlocks ?? SAFE_FALL_BLOCKS;
  // Mobs come to rest 0.02 below a block's top, so a drop of exactly `safe` blocks measures a hair over it.
  let damage = Math.ceil(distance - safe - 0.05);
  if (damage <= 0) return 0;
  if (rule?.factor) damage = rule.round === 'down' ? Math.floor(damage * rule.factor) : Math.ceil(damage * rule.factor);
  if (rule?.reduction) damage -= rule.reduction;
  return Math.max(0, damage);
}

/**
 * Track a ground mob's fall and apply damage when it lands.
 * `start` is where the step began, `pos` where it ended. Landing in water cancels the fall.
 */
export function trackFall(manager, mob, start, pos) {
  // The strider keeps its own fall rule (it ignores landings in lava), so it is not counted twice.
  if (mob.dying || mob.health <= 0 || mob.type === 'strider') return;
  const feetCell = (dy) => manager.world.getVoxel(Math.floor(pos.x), Math.floor(pos.y + dy), Math.floor(pos.z));
  const inWater = feetCell(0.1) === BLOCKS.WATER || feetCell(0.9) === BLOCKS.WATER;
  // A jump of more than a physics step is a teleport (an enderman, a respawn): the fall starts again from here.
  if (Math.abs(pos.y - start.y) > 3) { mob.fallPeakY = undefined; return; }
  if (inWater) { mob.fallPeakY = undefined; return; }
  if (!mob.onGround) {
    mob.fallPeakY = Math.max(mob.fallPeakY ?? start.y, pos.y);
    return;
  }
  if (mob.fallPeakY === undefined) return;
  const distance = mob.fallPeakY - pos.y;
  mob.fallPeakY = undefined;
  const damage = fallDamageFor(mob.type, distance);
  // Passed as a punch so the hit-cooldown does not swallow it: the ravager and warden reuse that timer for their attacks.
  if (damage > 0) manager.damageMob(mob, damage, null, true, null, true);
}

/**
 * Endermen are hurt by water and rain: 1 damage every tick (`LivingEntity.aiStep` with `isSensitiveToWater`), and
 * they teleport to look for a dry spot. https://minecraft.wiki/w/Enderman#Behavior
 * @returns {boolean} true when the mob took damage this call
 */
export function updateWaterSensitivity(manager, mob, dt) {
  if (mob.type !== 'enderman' || mob.health <= 0 || mob.dying) return false;
  const p = mob.mesh.position;
  const cell = (dy) => manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y + dy), Math.floor(p.z));
  const wet = cell(0.1) === BLOCKS.WATER || cell(1.2) === BLOCKS.WATER || exposedToRain(manager.game?.weather,manager.world,{x:p.x,y:p.y+2.9,z:p.z});
  if (!wet) { mob.waterHurtClock = 0; return false; }
  mob.waterHurtClock = (mob.waterHurtClock || 0) + dt;
  let hit = false;
  while (mob.waterHurtClock >= 0.05 && mob.health > 0) {
    mob.waterHurtClock -= 0.05;
    manager.damageMob(mob, 1, null, true, null, true);
    hit = true;
  }
  // Look for somewhere dry, at most twice a second.
  mob.waterTeleportClock = (mob.waterTeleportClock || 0) + dt;
  if (mob.health > 0 && mob.waterTeleportClock >= 0.5) { mob.waterTeleportClock = 0; manager.teleportEnderman?.(mob); }
  return hit;
}

/**
 * Sheep graze: each tick a sheep standing on grass has a 1 in 1000 chance (1 in 50 for a lamb) of eating the block. The
 * grass turns to dirt and a shorn sheep regrows its wool. https://minecraft.wiki/w/Sheep#Behavior
 * @returns {boolean} true when the sheep ate this call
 */
export function updateSheepGrazing(manager, mob, dt) {
  if (mob.type !== 'sheep' || mob.health <= 0 || mob.dying) return false;
  mob.grazeClock = (mob.grazeClock || 0) + dt;
  let ate = false;
  const random = manager.random || Math.random;
  while (mob.grazeClock >= 0.05 && !ate) {
    mob.grazeClock -= 0.05;
    if (random() >= (mob.isBaby ? 1 / 50 : 1 / 1000)) continue;
    const p = mob.mesh.position;
    const cell = [Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)];
    if (manager.world.getVoxel(...cell) !== BLOCKS.GRASS) continue;
    manager.world.setVoxel(...cell, BLOCKS.DIRT);
    if (mob.isSheared) { mob.isSheared = false; if (mob.woolMesh) mob.woolMesh.visible = true; }
    if (mob.isBaby && mob.babyGrowthTimer > 0 && !mob.ageLocked) mob.babyGrowthTimer = Math.max(0, mob.babyGrowthTimer - mob.babyGrowthTimer * 0.1);
    mob.eatTimer = 2;
    ate = true;
  }
  return ate;
}

export const AXOLOTL_PLAY_DEAD_SECONDS = 10;
export const AXOLOTL_REGEN_INTERVAL = 2.5; // Regeneration I: 1 HP every 2.5 s, so 4 HP over the 10 s
export const IRON_INGOT_REPAIR = 25;

/**
 * An axolotl that takes damage underwater and survives may play dead for 10 s with Regeneration I. It does when a random
 * integer 0-2 is below the damage, or when its health before the hit was under half. https://minecraft.wiki/w/Axolotl
 */
export function onAxolotlHurt(manager, mob, damage, random = manager.random || Math.random) {
  if (mob.type !== 'axolotl' || mob.health <= 0 || !mob.inWater) return false;
  const before = mob.health + damage;
  const roll = Math.floor(random() * 3);
  if (!(roll < damage || before < mob.maxHealth / 2)) return false;
  mob.playingDead = AXOLOTL_PLAY_DEAD_SECONDS;
  mob.playDeadRegen = 0;
  return true;
}

/** Tick a playing-dead axolotl: it lies still and regenerates. Returns true while it is playing dead. */
export function updateAxolotlPlayDead(manager, mob, dt) {
  if (!(mob.playingDead > 0)) return false;
  mob.playingDead = Math.max(0, mob.playingDead - dt);
  mob.velocity.set(0, 0, 0);
  mob.playDeadRegen = (mob.playDeadRegen || 0) + dt;
  while (mob.playDeadRegen >= AXOLOTL_REGEN_INTERVAL) { mob.playDeadRegen -= AXOLOTL_REGEN_INTERVAL; mob.health = Math.min(mob.maxHealth, mob.health + 1); }
  return true;
}

/**
 * Air supply for land mobs. Anything that is not tagged `can_breathe_under_water` and is not already handled as an
 * aquatic mob drowns once its head has been underwater for 15 s.
 * @returns {boolean} true when damage was dealt this call
 */
export function updateDrowning(manager, mob, dt) {
  if (BREATHES.has(mob.type) || mob.isAquatic || mob.health <= 0 || mob.dying) return false;
  const h = (mob.height ?? 1) * 0.9;
  const submerged = manager.world.getVoxel(Math.floor(mob.mesh.position.x), Math.floor(mob.mesh.position.y + h), Math.floor(mob.mesh.position.z)) === BLOCKS.WATER;
  if (!submerged) {
    // Air comes back four times as fast as it drains.
    mob.airSupply = Math.min(AIR_SUPPLY_SECONDS, (mob.airSupply ?? AIR_SUPPLY_SECONDS) + dt * 4);
    mob.drownTimer = 0;
    return false;
  }
  mob.airSupply = Math.max(0, (mob.airSupply ?? AIR_SUPPLY_SECONDS) - dt);
  if (mob.airSupply > 0) return false;
  mob.drownTimer = (mob.drownTimer || 0) + dt;
  if (mob.drownTimer < DROWN_INTERVAL) return false;
  mob.drownTimer -= DROWN_INTERVAL;
  manager.damageMob(mob, DROWN_DAMAGE, null, true, null, true);
  return true;
}

/**
 * Can a mob's melee attack reach the player? Within `vertical` blocks up or down, and with nothing solid between the
 * mob's eyes and the player's body. The spider's bite measured only horizontal distance, so it bit a player through
 * the three blocks of earth over a dug-in shelter (Shelter types play-test); Java's melee needs the target in reach
 * of the attacker's box and in line of sight.
 */
export function meleeCanReach(world, mob, player, { vertical = 1.5, eyeHeight = 0.6 } = {}) {
  const from = mob?.mesh?.position, to = player?.position;
  if (!from || !to) return false;
  if (Math.abs(to.y - from.y) > vertical) return false;
  if (!world?.getVoxel) return true;
  const ax = from.x, ay = from.y + eyeHeight, az = from.z, bx = to.x, by = to.y + 0.9, bz = to.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.2));
  for (let i = 1; i < steps; i++) {
    const f = i / steps, id = world.getVoxel(Math.floor(ax + (bx - ax) * f), Math.floor(ay + (by - ay) * f), Math.floor(az + (bz - az) * f));
    if (id && BLOCK_DEFS[id] && BLOCK_DEFS[id].solid !== false && !BLOCK_DEFS[id].liquid) return false;
  }
  return true;
}
