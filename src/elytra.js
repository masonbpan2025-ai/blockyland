// Elytra gliding.
//
// `player.isGliding` and `player.elytraActive` were read in exactly one place, `parrotBehavior.js`, and set
// nowhere -- the `elytra` item existed and its 432 durability was in `durability.js`, with no glide physics
// behind any of it. This is that physics.
//
// The constants are TUNED APPROXIMATIONS, not vanilla's figures. Vanilla's glide is defined per tick with
// values that are not in `.cache/mc-data` and that this project has no other source for, so rather than
// invent them with false precision the model is built to satisfy the properties that actually define
// gliding, and those are what the tests assert:
//
//   * you always sink -- looking up slows the descent and can never reverse it
//   * diving accelerates, climbing decelerates
//   * horizontal speed is bounded at both ends
//   * a firework boost adds speed and lift, which is what a rocket is FOR
//
// The branch this drives only runs while `isGliding`, so none of it can affect ordinary movement.
import * as THREE from 'three';
import { spendDurability, maxDurabilityFor } from './durability.js';

/** Gentle sink while gliding, against the 28.0 the player falls under normally. */
export const ELYTRA_GRAVITY = 7.0;
/** Fastest sink, so a glide is never a fall. */
export const ELYTRA_MAX_SINK = 3.2;
/** Launch speed when a glide begins from a fall. */
export const ELYTRA_MIN_SPEED = 9.0;
export const ELYTRA_MAX_SPEED = 34.0;
/** How quickly a dive builds speed, and how quickly a climb sheds it. */
export const ELYTRA_DIVE_ACCEL = 16.0;
export const ELYTRA_CLIMB_DRAG = 22.0;
/** A firework rocket's contribution. */
export const ELYTRA_BOOST_SPEED = 30.0;
export const ELYTRA_BOOST_SECONDS = 2.0;

/** One point of elytra durability per second of flight, which is vanilla's rate. */
export const ELYTRA_SECONDS_PER_DURABILITY = 1;

/**
 * Accumulate glide time and spend elytra durability in whole points.
 *
 * The 432 figure has been in `durability.js` since that file was written and nothing ever spent any of it,
 * so an elytra was permanent -- the same gap tools, armour and the shield each had. Split out of the
 * movement loop so it can be tested without driving `Player.update`.
 *
 * @param {object} player mutated: `elytraFlight` accrues, the chest slot empties on a break
 * @param {number} dt seconds
 * @param {() => number} [random] for unbreaking, and injectable so tests are deterministic
 * @returns {{spent:number, broke:boolean}}
 */
export function tickElytraWear(player, dt, random = Math.random) {
  const none = { spent: 0, broke: false };
  if (!player || player.gamemode !== 'survival') return none;
  // A NaN or negative delta would poison the accumulator and silence the wear for the rest of the flight.
  // `NaN || 0` is 0, so a poisoned accumulator recovers, but the guard keeps it from getting there.
  if (!Number.isFinite(dt) || dt <= 0) return none;
  // Seconds accumulate in binary floating point, where 0.9 + 0.1 is 0.9999999999999999 -- and `floor` of
  // that is 0, so the point is delayed a frame. Rounding to microseconds fixes it at the source. A bare
  // tolerance on the comparison is NOT enough: it lets the value past the guard and `floor` still returns 0,
  // which is how the first attempt at this failed.
  player.elytraFlight = Math.round(((player.elytraFlight || 0) + dt) * 1e6) / 1e6;
  if (player.elytraFlight < ELYTRA_SECONDS_PER_DURABILITY) return none;
  const whole = Math.floor(player.elytraFlight / ELYTRA_SECONDS_PER_DURABILITY);
  // The remainder is kept, so a long frame is not rounded away into a free point.
  player.elytraFlight = Math.max(0, player.elytraFlight - whole * ELYTRA_SECONDS_PER_DURABILITY);
  const elytra = player.inventory?.armor?.chest;
  if (elytra?.id !== 'elytra') return none;
  // Durability: "Flying for one second counts as 1 use. The durability cannot go below 1" -- at 1 the elytra is
  // broken, "unusable until repaired", and stays in the chest slot. It used to wear to 0 and vanish.
  const max = elytra.maxDurability ?? maxDurabilityFor('elytra');
  const left = typeof elytra.durability === 'number' ? elytra.durability : max;
  const wear = spendDurability(elytra, Math.min(whole, Math.max(0, left - 1)), random);
  return { spent: wear.spent, broke: isElytraBroken(elytra) };
}

/** A broken elytra: worn to its last point, kept, but no use for flying until repaired. */
export function isElytraBroken(elytra) {
  return typeof elytra?.durability === 'number' && elytra.durability <= 1;
}

/** True when the chest slot holds an elytra that can fly (one worn to 1 cannot). */
export function hasElytraEquipped(player) {
  const chest = player?.inventory?.armor?.chest;
  return chest?.id === 'elytra' && !isElytraBroken(chest);
}

/**
 * Whether a glide should begin.
 *
 * Vanilla requires a jump press while falling with an elytra on. Every one of these conditions is load
 * bearing: without the falling check the elytra would work as a jump; without the ground and water checks it
 * would start while standing or swimming.
 */
export function wantsToStartGliding(player, keys) {
  if (!player) return false;
  if (player.isGliding || player.isFlying) return false;
  if (!hasElytraEquipped(player)) return false;
  if (player.onGround || player.inWater) return false;
  if (!(player.velocity?.y < 0)) return false;
  return !!keys?.['Space'];
}

/** Whether a glide should end. Landing, swimming, flying and losing the elytra all stop it. */
export function shouldStopGliding(player) {
  if (!player?.isGliding) return false;
  if (player.onGround || player.inWater || player.isFlying) return true;
  return !hasElytraEquipped(player);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * One step of glide physics, mutating and returning the velocity.
 *
 * @param {{velocity:THREE.Vector3, yaw:number, pitch:number, dt:number, boost?:number}} step
 *   `pitch` is positive looking up, in radians. `boost` is seconds of firework thrust remaining.
 */
export function applyGlide({ velocity, yaw, pitch, dt, boost = 0 }) {
  const boosting = boost > 0;
  let horizontal = Math.hypot(velocity.x, velocity.z);

  // Diving builds speed, climbing sheds it. The pitch is clamped so an extreme look angle cannot invert the
  // effect, and the result is bounded at both ends so a glide is never stationary nor arbitrarily fast.
  const dive = clamp(-pitch, -1, 1);
  const rate = dive >= 0 ? ELYTRA_DIVE_ACCEL : ELYTRA_CLIMB_DRAG;
  horizontal = clamp(horizontal + dive * rate * dt, ELYTRA_MIN_SPEED, ELYTRA_MAX_SPEED);
  if (boosting) horizontal = Math.min(ELYTRA_MAX_SPEED, Math.max(horizontal, ELYTRA_BOOST_SPEED));

  // Steer along the existing heading, or along the facing when there is none yet.
  const dir = horizontal > 1e-3 && Math.hypot(velocity.x, velocity.z) > 1e-3
    ? new THREE.Vector3(velocity.x, 0, velocity.z).normalize()
    : new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  velocity.x = dir.x * horizontal;
  velocity.z = dir.z * horizontal;

  // Sink, reduced by looking up but never turned into a climb. Only a boost can raise the player.
  const liftFactor = 1 - 0.75 * Math.max(0, clamp(pitch, 0, Math.PI / 2)) / (Math.PI / 2);
  const sink = boosting ? 0 : ELYTRA_MAX_SINK * liftFactor;
  velocity.y = Math.max(velocity.y - ELYTRA_GRAVITY * dt, -Math.max(0, sink));
  if (boosting) velocity.y = Math.min(velocity.y + ELYTRA_GRAVITY * 1.6 * dt, 2.4);
  return velocity;
}
