// A wild Enderman is neutral, sleeps with its eyes open, and does not care that you exist.
//
// The update block in `mobs.js` said otherwise, in its own words:
//
//     // Periodic arena teleportation
//     if (mob.teleportCooldown <= 0) { ... this.teleportEnderman(mob); }
//     // Aggressively pursue player
//
// That is the **tournament arena** rule -- `spawnEnderman` is also the tournament challenger boss -- applied
// to every wild enderman in every world. A wild one spawned with `state: 'combat'`, teleported toward the
// player every four to seven seconds, chased them across the meadow and hit for 5 damage. Combined with the
// showcase population, that is the Enderman that appeared near a new player's spawn.
//
// This module owns the wild behaviour instead: neutral until provoked, provoked by damage or by a qualified
// gaze, and teleporting only to destinations that can hold it. The arena keeps the old behaviour through its
// own explicit flag.

/** How far away a gaze can anger an Enderman. */
export const GAZE_RANGE = 64;

/**
 * How closely the player's view must line up with the Enderman's head.
 *
 * Vanilla is a ray/hitbox test against the head and upper body rather than a single angle, so a generous cone
 * plus a line-of-sight check is a documented approximation of it.
 */
export const GAZE_CONE_DEGREES = 8;

/** How long anger lasts without being refreshed. Vanilla's anger is effectively permanent; this is finite so */
/** an angered Enderman in a world nobody is visiting cannot stay hostile forever. */
export const ANGER_SECONDS = 20;

/** A destination must hold the Enderman's own box. It is 0.6 wide and 2.9 tall. */
export const TELEPORT_CLEARANCE_HEIGHT = 2.9;

/** Teleport search radius, and how many destinations to try before giving up. */
export const TELEPORT_RANGE = 32;
export const TELEPORT_ATTEMPTS = 16;

/** Vanilla's melee damage, and the reach it needs. */
export const ENDERMAN_ATTACK_DAMAGE = 5;
export const ENDERMAN_ATTACK_REACH = 1.8;
export const ENDERMAN_ATTACK_COOLDOWN = 0.9;
export const ENDERMAN_CHASE_SPEED = 3.4;

/** The state a freshly spawned wild Enderman is in. */
export function createWildEndermanState() {
  return {
    state: 'idle',      // 'idle' | 'provoked'
    anger: 0,           // seconds of anger remaining
    angeredBy: null,    // 'damage' | 'gaze', for telemetry and tests
    // Deliberately NOT set: the old code gave it `teleportCooldown: 4.5` at spawn, which meant the first
    // teleport was always 4.5 seconds after world load, before the player had done anything at all.
    teleportCooldown: 0,
  };
}

/** Is this Enderman currently hostile? */
export function isProvoked(mob) {
  return (mob?.anger ?? 0) > 0 && mob?.state === 'provoked';
}

/**
 * Anger an Enderman.
 *
 * @param {object} mob
 * @param {'damage'|'gaze'} reason
 * @param {number} [seconds]
 * @returns {boolean} true when this call was the one that angered it
 */
export function provoke(mob, reason, seconds = ANGER_SECONDS) {
  if (!mob) return false;
  const wasProvoked = isProvoked(mob);
  mob.state = 'provoked';
  mob.anger = Math.max(mob.anger ?? 0, seconds);
  mob.angeredBy = reason;
  return !wasProvoked;
}

/** Count anger down. An Enderman that has not been provoked again goes back to ignoring the player. */
export function tickAnger(mob, dt) {
  if (!mob || !(mob.anger > 0)) return false;
  mob.anger = Math.max(0, mob.anger - dt);
  if (mob.anger === 0) {
    mob.state = 'idle';
    mob.angeredBy = null;
    return true;
  }
  return false;
}

/**
 * Does the player's gaze anger this Enderman?
 *
 * Vanilla's conditions, and the exceptions that matter:
 *  - the player must be looking at its head or upper body, within 64 blocks, with line of sight
 *  - a **carved pumpkin** on the player's head makes the gaze harmless, which is the whole joke of the item
 *  - Creative and Spectator players do not anger it by looking
 *  - being closer is not enough on its own. Standing next to an Enderman has never angered one.
 *
 * @param {{viewDir:{x:number,y:number,z:number}, playerPos:{x:number,y:number,z:number},
 *          mobPos:{x:number,y:number,z:number}, hasLineOfSight?:boolean, wearingPumpkin?:boolean,
 *          playerGameMode?:string}} input
 * @returns {boolean}
 */
export function gazeProvokes(input = {}) {
  const { viewDir, playerPos, mobPos } = input;
  if (!viewDir || !playerPos || !mobPos) return false;
  if (input.wearingPumpkin) return false;
  const mode = input.playerGameMode ?? 'survival';
  if (mode === 'creative' || mode === 'spectator') return false;
  if (input.hasLineOfSight === false) return false;

  // Vanilla measures to the eyes, which sit near the top of its 2.9-block body.
  const eyeY = (mobPos.y ?? 0) + 2.45;
  const dx = (mobPos.x ?? 0) - (playerPos.x ?? 0);
  const dy = eyeY - ((playerPos.y ?? 0) + 1.62);
  const dz = (mobPos.z ?? 0) - (playerPos.z ?? 0);
  const distance = Math.hypot(dx, dy, dz);
  if (distance > GAZE_RANGE) return false;
  if (distance < 1e-6) return true;

  const vLen = Math.hypot(viewDir.x ?? 0, viewDir.y ?? 0, viewDir.z ?? 0);
  if (vLen < 1e-6) return false;
  const dot = ((viewDir.x ?? 0) * dx + (viewDir.y ?? 0) * dy + (viewDir.z ?? 0) * dz) / (vLen * distance);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
  return angle <= GAZE_CONE_DEGREES;
}

/**
 * Can the Enderman stand at this position?
 *
 * Vanilla checks the destination can hold the mob: `TELEPORT_CLEARANCE_HEIGHT` of clear space over its own
 * footprint, and no fluid. Teleporting is not spawning -- natural-spawn distance rules do not apply -- but the
 * destination still has to be somewhere it can exist.
 *
 * @param {{getVoxel:(x:number,y:number,z:number)=>number}} world
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {{isSolid?:(id:number)=>boolean, isFluid?:(id:number)=>boolean, width?:number}} [options]
 */
export function isValidTeleportDestination(world, x, y, z, options = {}) {
  if (!world?.getVoxel) return false;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  const isSolid = options.isSolid ?? ((id) => id !== 0);
  const isFluid = options.isFluid ?? (() => false);
  const width = options.width ?? 0.6;
  const r = Math.floor(width / 2);
  const height = Math.ceil(TELEPORT_CLEARANCE_HEIGHT);
  const bx = Math.floor(x);
  const by = Math.floor(y);
  const bz = Math.floor(z);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dy = 0; dy < height; dy++) {
        const id = world.getVoxel(bx + dx, by + dy, bz + dz);
        // `undefined` means the chunk is not loaded; a teleport into unloaded terrain would drop the mob.
        if (id === undefined) return false;
        if (isSolid(id)) return false;
        // No fluid anywhere in the space it would occupy, feet included. The block it stands ON may be fluid
        // -- it can stand in water -- and that is checked separately below. The first version of this guarded
        // on `dy > 0`, which skipped the feet, so an enderman would happily teleport into water.
        if (isFluid(id)) return false;
      }
    }
  }
  // Somewhere to stand: the block below must be solid, or it arrives mid-air and falls.
  const below = world.getVoxel(bx, by - 1, bz);
  if (below === undefined) return false;
  return isSolid(below) || isFluid(below);
}

/**
 * Choose a teleport destination.
 *
 * @param {object} context
 * @param {{x:number,y:number,z:number}} context.origin
 * @param {() => number} [context.random]
 * @param {(x:number,y:number,z:number) => boolean} context.isValid
 * @param {number} [context.range]
 * @param {number} [context.attempts]
 * @returns {{x:number,y:number,z:number}|null} null when nowhere valid was found, which is a legitimate
 *   outcome rather than a reason to move the mob somewhere it cannot stand.
 */
export function pickTeleportDestination(context = {}) {
  const { origin, random = Math.random, isValid } = context;
  if (!origin || typeof isValid !== 'function') return null;
  const range = context.range ?? TELEPORT_RANGE;
  const attempts = context.attempts ?? TELEPORT_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    const x = origin.x + (random() * 2 - 1) * range;
    const z = origin.z + (random() * 2 - 1) * range;
    // Vanilla keeps the vertical move modest, and never straight up into the sky.
    const y = origin.y + (random() * 2 - 1) * 8;
    if (isValid(x, y, z)) return { x, y, z };
  }
  return null;
}

/** How a neutral Enderman spends its time: it wanders, and it does not care where the player is. */
export const NEUTRAL_MOB_STATE = 'idle';
