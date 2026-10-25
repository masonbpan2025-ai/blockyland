// Player-versus-player melee, as Java Edition does it. Pure rules: no scene, no network, so each number can be tested.
//
// Sources: minecraft.wiki Tutorial:PvP (Java Edition), Damage (Attack cooldown, Critical hit), Knockback (mechanic),
// Sweep attack, Particles (crit, enchanted_hit, damage_indicator, sweep_attack), Player (entity_interaction_range).
//
//   - Reach: "the 3 block attack reach" (Tutorial:PvP); 5 blocks in Creative.
//   - A *strong* attack is one at 84.8% of full damage or more, a cooldown charge of 0.9 (attackCooldown.js). Only a
//     strong attack can be a critical hit, a sprint-knockback attack or a sweep.
//   - Critical: "dealt when the attacker is falling" -- not on the ground, not climbing, not in water, not blind, not
//     riding, and "Ordinarily it is impossible to critical hit while in a sprint". x1.5 damage.
//   - Sprint-knockback: "dealt when the attacker is sprinting, and doing one cancels the sprint". One extra level of
//     knockback, pushed along the attacker's facing; the attacker's own horizontal speed drops to 60%.
//   - Sweep: a strong sword hit on the ground that is neither critical nor a sprint hit, while barely moving.
//   - Knockback: every hit pushes the target 0.4 blocks/tick away from the attacker, halving its old horizontal speed,
//     and lifts it to 0.4 blocks/tick when it stood on the ground.
//   - After a hit the target ignores weaker hits for 10 ticks (0.5 s); a stronger one deals only the difference and
//     does not knock back (LivingEntity.hurt).
import { STRONG_ATTACK_CHARGE } from './attackCooldown.js';

export const TICKS_PER_SECOND = 20;
/** Blocks a player can reach another with: "the 3 block attack reach" in Survival, 5 in Creative. */
export const PVP_REACH = Object.freeze({ survival: 3, adventure: 3, creative: 5, spectator: 0 });
export const reachFor = (gamemode) => PVP_REACH[gamemode] ?? PVP_REACH.survival;
/** The hurt window: a hit is followed by 10 ticks in which only a harder hit counts. */
export const HURT_INVULNERABLE_SECONDS = 10 / TICKS_PER_SECOND;
/** The red overlay on a hurt entity lasts its hurt time, 10 ticks. */
export const HURT_OVERLAY_SECONDS = 10 / TICKS_PER_SECOND;
/** Knockback of a hit, in blocks per tick; and the strength each level of Knockback (and a sprint) adds. */
export const BASE_KNOCKBACK = 0.4;
export const KNOCKBACK_PER_LEVEL = 0.5;
/** A sprint-knockback attack leaves the attacker this share of its horizontal speed. */
export const SPRINT_HIT_SLOWDOWN = 0.6;
/** Damage a sweep deals to each other entity it catches, before Sweeping Edge, and how far around the target it reaches. */
export const SWEEP_DAMAGE = 1;
export const SWEEP_REACH = 1;

const isSword = (itemId) => typeof itemId === 'string' && /(^|_)sword$/.test(itemId);
const isAxe = (itemId) => typeof itemId === 'string' && /(^|_)axe$/.test(itemId) && !/pickaxe$/.test(itemId);

/**
 * What kind of hit a click makes.
 * @param {object} a
 * @param {number} a.charge cooldown charge, 0-1 (attackCooldown.js attackCharge)
 * @returns {{strong: boolean, critical: boolean, sprintKnockback: boolean, sweep: boolean, sound: string}}
 */
export function classifyAttack({ charge, sprinting = false, onGround = true, fallDistance = 0, inWater = false,
  climbing = false, blind = false, slowFalling = false, riding = false, flying = false, itemId = null, horizontalSpeed = 0,
  walkSpeed = 4.317 }) {
  const strong = charge >= STRONG_ATTACK_CHARGE;
  const sprintKnockback = strong && sprinting;
  const critical = strong && fallDistance > 0 && !onGround && !climbing && !inWater && !blind && !slowFalling
    && !riding && !flying && !sprinting;
  // "the player must be ... moving slower than their walking speed" (Sweep attack).
  const sweep = strong && !critical && !sprintKnockback && onGround && isSword(itemId) && horizontalSpeed < walkSpeed;
  // The attack sound: entity.player.attack.knockback / crit / sweep / strong / weak.
  const sound = sprintKnockback ? 'knockback' : critical ? 'crit' : sweep ? 'sweep' : strong ? 'strong' : 'weak';
  return { strong, critical, sprintKnockback, sweep, sound };
}

/** The Knockback level a hit adds: the enchantment, plus one for a sprint-knockback attack. */
export const extraKnockbackLevel = (enchantLevel = 0, sprintKnockback = false) => Math.max(0, enchantLevel) + (sprintKnockback ? 1 : 0);

/**
 * LivingEntity.knockback: the new velocity of an entity pushed with `strength` (blocks/tick) in the horizontal
 * direction (dx, dz). Velocities are in blocks per second, as the game's are.
 */
export function applyKnockback(velocity, { strength, dx, dz, onGround, resistance = 0 }) {
  const s = strength * (1 - Math.min(1, Math.max(0, resistance)));
  const length = Math.hypot(dx, dz);
  if (s <= 0 || length < 1e-9) return { x: velocity.x, y: velocity.y, z: velocity.z };
  const push = (s * TICKS_PER_SECOND) / length;
  return {
    x: velocity.x / 2 + dx * push,
    y: onGround ? Math.min(BASE_KNOCKBACK * TICKS_PER_SECOND, velocity.y / 2 + s * TICKS_PER_SECOND) : velocity.y,
    z: velocity.z / 2 + dz * push,
  };
}

/**
 * The velocity of a player hit from `from`: the base push away from the attacker, then for a sprint hit or the
 * Knockback enchantment a further push along the attacker's facing (`fromYaw`, this game's yaw: forward is
 * (-sin, -cos)).
 */
export function hitKnockback(velocity, { position, from, fromYaw = null, onGround, extraLevel = 0, resistance = 0 }) {
  let v = applyKnockback(velocity, { strength: BASE_KNOCKBACK, dx: position.x - from.x, dz: position.z - from.z, onGround, resistance });
  if (extraLevel > 0) {
    const yaw = Number.isFinite(fromYaw) ? fromYaw : Math.atan2(-(position.x - from.x), -(position.z - from.z));
    v = applyKnockback(v, { strength: extraLevel * KNOCKBACK_PER_LEVEL, dx: -Math.sin(yaw), dz: -Math.cos(yaw), onGround, resistance });
  }
  return v;
}

/**
 * The hurt window. `state` is `{ timer, lastAmount }` of the target. Returns what this hit deals and whether it
 * knocks back: a hit in the window counts only for what it adds over the last one (LivingEntity.hurt).
 */
export function hurtWindow(state, amount) {
  if (!(state.timer > 0)) return { amount, knockback: true, fresh: true };
  if (amount <= (state.lastAmount ?? 0)) return { amount: 0, knockback: false, fresh: false };
  return { amount: amount - (state.lastAmount ?? 0), knockback: false, fresh: false };
}

/**
 * The particles a landed hit shows, by name and count (Particles):
 *  - crit: a critical hit, a 3-tick emitter of 16 a tick around the target;
 *  - enchanted_hit: the same for a hit with enchantment damage;
 *  - damage_indicator: (int)(damage x 0.5) dark hearts, for a hit of more than 2 damage;
 *  - sweep_attack: one, in front of the attacker.
 * Nothing else: a hit does not throw block fragments.
 */
export function hitParticles({ critical = false, enchanted = false, damage = 0, sweep = false }) {
  const out = [];
  if (critical) out.push({ kind: 'crit', count: 48 });
  if (enchanted) out.push({ kind: 'enchanted_hit', count: 48 });
  if (damage > 2) out.push({ kind: 'damage_indicator', count: Math.floor(damage * 0.5) });
  if (sweep) out.push({ kind: 'sweep_attack', count: 1 });
  return out;
}

/** Whether a hit with this item disables a raised shield (an axe does, for 5 seconds). */
export const disablesShield = (itemId) => isAxe(itemId);
export const SHIELD_DISABLE_SECONDS = 5;

/**
 * Other players a sweep catches: within SWEEP_REACH of the target (box to box, horizontally and 0.25 vertically), and
 * within reach of the attacker. `players` is `[{id, x, y, z}]`.
 */
export function sweepVictims({ attacker, target, players, reach = PVP_REACH.survival }) {
  return players.filter((p) => p.id !== target.id && p.id !== attacker.id
    && Math.abs(p.x - target.x) <= SWEEP_REACH + 0.6 && Math.abs(p.z - target.z) <= SWEEP_REACH + 0.6
    && Math.abs(p.y - target.y) <= 0.25 + 1.8
    && Math.hypot(p.x - attacker.x, p.y - attacker.y, p.z - attacker.z) <= reach + 0.6);
}
