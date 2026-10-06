// Dying, respawning, and what a bed is actually for.
//
// Four separate wrongs lived here:
//
//  1. `die()` dropped **nothing**. Death had no consequence beyond an overlay reading "You lost, please try
//     again", so a Survival player kept every item through every death.
//  2. `respawn()` restored health and hunger but **not saturation or exhaustion**, and the bed branch
//     `return`ed early -- so `statusEffects.clear()` at the end of the method, and every reset after it, were
//     skipped for anyone who had bound a bed. Poison survived death if you slept.
//  3. `bed.interact()` copied the bed position over `player.spawnPosition`, which is the **world spawn**. So
//     sleeping in a bed permanently moved the world's spawn point.
//  4. `bed.wakeUp()` set health to maximum and hunger to 20. Sleeping was a free full heal and a free meal,
//     which it has never been in Minecraft.
import { DAWN_TIME } from './sessionSettings.js';

/** What a respawn resets to. Java's figures. */
export const RESPAWN_HEALTH = 20;
export const RESPAWN_HUNGER = 20;
export const RESPAWN_SATURATION = 5;
export const RESPAWN_EXHAUSTION = 0;

/**
 * Respawn protection.
 *
 * Java grants a short window of invulnerability on respawn so a player cannot be killed again the instant
 * they appear. The value here is the documented approximation the plan asks for; it is not read from a
 * source.
 */
export const RESPAWN_INVULNERABLE_SECONDS = 3.0;

/** Vanilla's respawn-anchor search radius, and the bed-obstruction report. */
export const RESPAWN_SEARCH_RADIUS = 10;

/**
 * Everything a death should drop.
 *
 * Carried items only: the hotbar, storage, armour and the offhand. **Crafting-grid contents and result
 * previews are not owned items** -- the grid is a workspace, and a preview is a calculation, so neither is
 * dropped. (Java does drop the grid on death; this is a documented deviation, recorded in the parity doc.)
 *
 * The cursor stack IS owned, and is included so a player carrying something on the cursor does not lose it
 * into nothing.
 *
 * @param {object} inventory
 * @returns {Array<{id:*, count:number, isBlock:boolean, item:object}>} one entry per stack, in slot order
 */
export function collectDeathDrops(inventory) {
  if (!inventory) return [];
  const out = [];
  const push = (item) => {
    if (!item) return;
    const count = item.count ?? 1;
    if (count <= 0) return;
    out.push({ id: item.id, count, isBlock: item.isBlock === true, item });
  };
  for (const slot of inventory.hotbar ?? []) push(slot);
  for (const slot of inventory.storage ?? []) push(slot);
  for (const slot of Object.values(inventory.armor ?? {})) push(slot);
  push(inventory.offhand);
  push(inventory.cursorItem);
  return out;
}

/**
 * How much experience a death costs.
 *
 * Java drops the level and gives back `min(level * 7, 100)` points, so a player who dies at level 30 is
 * dropped to level 0 but is not left with nothing to pick up. Returns the levels lost and the points to
 * scatter as orbs.
 */
export function xpLossFor(level) {
  const lvl = Number.isFinite(level) && level > 0 ? Math.floor(level) : 0;
  return { levels: lvl, points: Math.min(lvl * 7, 100) };
}

/**
 * Where a player respawns.
 *
 * Priority, as Java: a charged respawn anchor in a matching dimension, then a bed, then the world spawn. A
 * bed is only usable if it is still there and still has somewhere to stand -- a safe spot before death can be
 * blocked afterwards -- and the check is repeated at respawn rather than trusting what was stored.
 *
 * @param {{validAnchor?:boolean, anchorPosition?:object, bedPosition?:object|null,
 *          isBedStillThere?:(bed:object)=>boolean, isSpaceSafe?:(pos:object)=>boolean,
 *          worldSpawn:object, worldSpawnIsSafe?:boolean}} context
 * @returns {{position:object, source:'anchor'|'bed'|'world_spawn', lostBed?:boolean, blocked?:boolean}}
 */
export function resolveRespawn(context = {}) {
  const { worldSpawn } = context;
  const source = { position: worldSpawn, source: 'world_spawn' };
  if (context.isSpaceSafe && worldSpawn && !context.isSpaceSafe(worldSpawn)) {
    source.blocked = true;
  }

  if (context.validAnchor && context.anchorPosition) {
    const safe = !context.isSpaceSafe || context.isSpaceSafe(context.anchorPosition);
    if (safe) return { position: context.anchorPosition, source: 'anchor' };
  }

  if (context.bedPosition) {
    const there = !context.isBedStillThere || context.isBedStillThere(context.bedPosition);
    const safe = !context.isSpaceSafe || context.isSpaceSafe(context.bedPosition);
    if (there && safe) return { position: context.bedPosition, source: 'bed' };
    // The bed existed and is now gone or blocked. Reported so the player can be told, rather than silently
    // teleporting them somewhere they did not choose.
    return { ...source, lostBed: true };
  }

  return source;
}

/**
 * The complete Survival reset, applied on **both** respawn paths.
 *
 * This is a plain function of the player so it can be tested directly, and so the bed branch cannot skip it
 * by returning early -- which is exactly what it used to do. It deliberately does not touch the inventory:
 * that is the death transaction's business, and a mode change or a load must not be affected by it.
 */
export function resetSurvivalState(player) {
  if (!player) return null;
  player.isDead = false;
  player.health = player.maxHealth || RESPAWN_HEALTH;
  player.hunger = RESPAWN_HUNGER;
  player.saturation = RESPAWN_SATURATION;
  player.exhaustion = RESPAWN_EXHAUSTION;
  // The shield is granted by a status effect, so clearing the effects must clear it too, or a golden apple
  // eaten before death keeps absorbing after it.
  player.absorption = 0;
  if (player.statusEffects?.clear) player.statusEffects.clear();
  else if (player.statusEffects) player.statusEffects = new Map();

  // Transient state that must not survive death.
  player.fallDistance = 0;
  player.fireTicks = 0;
  player.isBurning = false;
  player.burning = false;
  player.air = player.maxAir ?? player.air;
  player.isFlying = false;
  player.elytraActive = false;
  player.elytraFlight = false;
  player.isGliding = false;
  player.isSprinting = false;
  player.isSneaking = false;
  if (player.velocity?.set) player.velocity.set(0, 0, 0);
  player.invulnerableTimer = RESPAWN_INVULNERABLE_SECONDS;
  return player;
}

/**
 * May sleeping heal, and may it feed?
 *
 * No, and no. Vanilla sleep skips the night; natural regeneration may happen during the skipped time if its
 * own conditions allow, but waking up is not a heal. `wakeUp` set health to maximum and hunger to 20, which
 * made a bed a free full restore.
 */
export function sleepRestoresHealth() {
  return false;
}

export function sleepRestoresHunger() {
  return false;
}

/**
 * The time of day after a full night's sleep.
 *
 * Java advances to the next morning, which is dawn of the following day -- not `1000`, which is mid-morning
 * and skipped the sunrise.
 */
export function timeAfterSleep() {
  return DAWN_TIME;
}

/**
 * May a bed be slept in, in this dimension?
 *
 * Vanilla by capability, not by name: the Overworld allows it, the Nether and the End do not and a bed
 * **explodes**. The old test was `game.isNether || selectedBiome.includes('nether')`, which never covered the
 * End at all and would have detonated a bed in a biome whose name merely contained the word.
 */
export const SLEEPABLE_DIMENSIONS = Object.freeze(['overworld']);

export function sleepingAllowedIn(dimension) {
  const d = typeof dimension === 'string' && dimension ? dimension : 'overworld';
  return SLEEPABLE_DIMENSIONS.includes(d);
}
