// Where a world is in its start-up, and what is allowed to run there.
//
// `generateNewWorld()` set `this.worldGenerated = true` on its **first line** and then spent the rest of the
// method awaiting terrain. The animation loop gated on that flag:
//
//     if (!this.worldGenerated) { render; return; }
//
// so the moment the flag flipped, the full simulation ran -- player physics, hazards, mob AI, the natural
// spawner and the day/night clock -- for the entire several seconds of loading. A new Survival player was
// falling, starving and being spawned around before the terrain they were standing on existed. The correct
// flag, `worldReady`, was only set at the very end and almost nothing read it.
//
// This module replaces the boolean with a phase, so "the world exists" and "the world is running" stop being
// the same question.

/** The phases a world moves through. `idle` is before a world is asked for. */
export const PHASES = Object.freeze(['idle', 'loading', 'ready', 'failed']);

/**
 * The largest frame delta the simulation will accept.
 *
 * A hidden tab, a breakpoint or a slow first frame gives a delta of seconds or minutes. Passing that straight
 * into physics and the spawner is how a player returns to a tab and is immediately dead, or finds a hundred
 * mobs around them: the world advances by the whole absence in one step. Vanilla caps the tick, and so does
 * this. The 0.25 s figure is a documented approximation of a tick budget rather than a source value.
 */
export const MAX_FRAME_DELTA = 0.25;

/** A fresh lifecycle, before any world has been requested. */
export function createLifecycle() {
  return { phase: 'idle', startedAt: 0, finishedAt: 0, error: null, attempts: 0 };
}

/**
 * May the simulation run in this phase?
 *
 * Only `ready`. Rendering and the progress UI continue in every phase -- the plan is explicit that loading
 * should stay visible -- but physics, hazards, mob AI, spawning and the clock do not.
 */
export function allowsSimulationForPhase(phase) {
  return phase === 'ready';
}

export function isSimulationActive(lifecycle) {
  return allowsSimulationForPhase(lifecycle?.phase);
}

/**
 * Begin a load.
 *
 * Refuses while a load is already in flight, which is what stops a double-clicked "Create World" from running
 * the whole initialisation twice. It also refuses once `ready`, so a second click cannot re-generate the world
 * out from under the player.
 *
 * @returns {boolean} true when this call started the load
 */
export function beginLoading(lifecycle) {
  if (!lifecycle) return false;
  if (lifecycle.phase === 'loading' || lifecycle.phase === 'ready') return false;
  lifecycle.phase = 'loading';
  lifecycle.startedAt = Date.now();
  lifecycle.finishedAt = 0;
  lifecycle.error = null;
  lifecycle.attempts++;
  return true;
}

/** The world finished loading and the simulation may start. */
export function markReady(lifecycle) {
  if (!lifecycle) return false;
  if (lifecycle.phase !== 'loading') return false;
  lifecycle.phase = 'ready';
  lifecycle.finishedAt = Date.now();
  lifecycle.error = null;
  return true;
}

/**
 * The load failed.
 *
 * Kept as its own phase rather than falling back to `idle`, so the failure is visible and a retry is a
 * deliberate act. `beginLoading` accepts a retry from here.
 */
export function markFailed(lifecycle, error) {
  if (!lifecycle) return false;
  lifecycle.phase = 'failed';
  lifecycle.finishedAt = Date.now();
  lifecycle.error = error instanceof Error ? error.message : String(error ?? 'unknown');
  return true;
}

/** The phase a loaded world returns to when it is torn down, so a new one can be built. */
export function reset(lifecycle) {
  if (!lifecycle) return false;
  lifecycle.phase = 'idle';
  lifecycle.startedAt = 0;
  lifecycle.finishedAt = 0;
  lifecycle.error = null;
  return true;
}

/**
 * Cap a frame delta.
 *
 * Non-finite input yields 0 rather than propagating NaN into every position and health value it touches.
 */
export function clampDelta(dt, max = MAX_FRAME_DELTA) {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, max);
}

/** How long the load has taken, in milliseconds, or how long it has been running so far. */
export function loadDurationMs(lifecycle, now = Date.now()) {
  if (!lifecycle?.startedAt) return 0;
  const end = lifecycle.finishedAt || now;
  return Math.max(0, end - lifecycle.startedAt);
}
