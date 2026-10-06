// The world clock, and what may run before the world exists.
//
// `generateNewWorld()` set `this.worldGenerated = true` on its **first line** and then spent the rest of the
// method awaiting terrain, while the animation loop gated on exactly that flag:
//
//     if (!this.worldGenerated) { render; return; }
//
// So the full simulation -- player physics, hazards, mob AI, the spawner and the day/night clock -- ran for
// the whole several seconds of loading. A new Survival player was falling, starving and being spawned around
// before the terrain they stood on existed. The flag that was actually correct, `worldReady`, was set at the
// very end and almost nothing read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PHASES, MAX_FRAME_DELTA, createLifecycle, beginLoading, markReady, markFailed, reset,
  allowsSimulationForPhase, isSimulationActive, clampDelta, loadDurationMs,
} from '../src/worldLifecycle.js';
import { DAY_LENGTH_SECONDS, TICKS_PER_DAY, DAWN_TIME, startingTimeOfDay, normaliseSettings }
  from '../src/sessionSettings.js';

// --- the lifecycle -----------------------------------------------------------------------------------

test('a simulation runs only in the ready phase', () => {
  for (const phase of PHASES) {
    assert.equal(allowsSimulationForPhase(phase), phase === 'ready',
      phase + ' should ' + (phase === 'ready' ? '' : 'not ') + 'simulate');
  }
});

test('loading does not simulate, which is the bug this exists for', () => {
  const lc = createLifecycle();
  assert.equal(isSimulationActive(lc), false, 'idle');
  assert.equal(beginLoading(lc), true);
  assert.equal(lc.phase, 'loading');
  assert.equal(isSimulationActive(lc), false, 'the whole point: no physics while the terrain is being built');
  assert.equal(markReady(lc), true);
  assert.equal(isSimulationActive(lc), true, 'and now it runs');
});

test('a double-clicked Create World cannot start the load twice', () => {
  const lc = createLifecycle();
  assert.equal(beginLoading(lc), true, 'the first click');
  assert.equal(beginLoading(lc), false, 'the second click is refused while loading');
  assert.equal(lc.attempts, 1, 'and it did not count as an attempt');
  markReady(lc);
  assert.equal(beginLoading(lc), false, 'nor once the world is ready');
  assert.equal(lc.attempts, 1);
});

test('a reset returns to idle, so a new world can be built', () => {
  // Loading a different save has to be able to start a load again.
  const lc = createLifecycle();
  beginLoading(lc);
  markReady(lc);
  assert.equal(reset(lc), true);
  assert.equal(lc.phase, 'idle');
  assert.equal(beginLoading(lc), true, 'and a fresh load is allowed');
});

test('a failure is its own phase, with the message recorded', () => {
  const lc = createLifecycle();
  beginLoading(lc);
  assert.equal(markFailed(lc, new Error('no chunks')), true);
  assert.equal(lc.phase, 'failed');
  assert.equal(lc.error, 'no chunks');
  assert.equal(isSimulationActive(lc), false, 'and a failed world does not simulate');
  // A retry from failed is deliberate and allowed.
  assert.equal(beginLoading(lc), true);
  assert.equal(lc.error, null, 'and clears the error');
  // A non-Error is still described rather than becoming "[object Object]".
  markFailed(lc, 'plain string');
  assert.equal(lc.error, 'plain string');
  markFailed(lc, undefined);
  assert.equal(lc.error, 'unknown');
});

test('markReady is refused unless a load is actually in flight', () => {
  const lc = createLifecycle();
  assert.equal(markReady(lc), false, 'not from idle');
  beginLoading(lc);
  markReady(lc);
  assert.equal(markReady(lc), false, 'and not twice');
  assert.equal(isSimulationActive(lc), true, 'the first call stands');
});

test('missing or absent lifecycle objects are handled rather than throwing', () => {
  // `main.js` falls back to `worldReady` when the lifecycle is absent, so these must not explode.
  assert.equal(allowsSimulationForPhase(undefined), false);
  assert.equal(isSimulationActive(null), false);
  assert.equal(isSimulationActive({}), false);
  assert.equal(beginLoading(null), false);
  assert.equal(markReady(null), false);
  assert.equal(markFailed(null), false);
  assert.equal(reset(null), false);
});

// --- the frame delta ---------------------------------------------------------------------------------

test('a long frame delta is bounded, so a hidden tab cannot advance the world by minutes', () => {
  // Returning to a backgrounded tab used to hand physics and the spawner a delta of the entire absence.
  assert.equal(clampDelta(1000), MAX_FRAME_DELTA);
  assert.equal(clampDelta(0.5), MAX_FRAME_DELTA);
  assert.equal(clampDelta(0.016), 0.016, 'a normal frame is untouched');
  // Non-finite input yields 0 rather than propagating NaN into every position and health value.
  assert.equal(clampDelta(NaN), 0);
  assert.equal(clampDelta(Infinity), 0);
  assert.equal(clampDelta(-5), 0);
  assert.equal(clampDelta(undefined), 0);
  assert.equal(clampDelta('0.1'), 0);
});

test('the load duration is measurable for the progress report', () => {
  const lc = createLifecycle();
  assert.equal(loadDurationMs(lc), 0, 'nothing has started');
  lc.startedAt = 1000;
  assert.equal(loadDurationMs(lc, 1500), 500, 'and while it runs');
  lc.finishedAt = 1800;
  assert.equal(loadDurationMs(lc, 9999), 800, 'and once it has finished, the final figure');
});

// --- the clock ---------------------------------------------------------------------------------------

test('the clock starts at dawn and a day is a full 1200 seconds', () => {
  assert.equal(startingTimeOfDay(normaliseSettings()), DAWN_TIME);
  assert.equal(DAWN_TIME, 0);
  assert.equal(DAY_LENGTH_SECONDS, 1200);
  assert.equal(TICKS_PER_DAY, 24000);
});

test('the same elapsed time gives the same clock at any frame rate', () => {
  const rate = TICKS_PER_DAY / DAY_LENGTH_SECONDS;
  const simulate = (fps, seconds = 120) => {
    let t = 0;
    const raw = 1 / fps;
    for (let i = 0; i < fps * seconds; i++) t = (t + rate * clampDelta(raw)) % TICKS_PER_DAY;
    return t;
  };
  const a = simulate(30), b = simulate(60), c = simulate(144);
  assert.ok(Math.abs(a - b) < 1e-6 && Math.abs(b - c) < 1e-6,
    `frame rate must not change the clock: ${a} ${b} ${c}`);
  assert.ok(Math.abs(a - 2400) < 1e-6, '120 seconds is 2400 ticks');
});

test('a stalled frame contributes at most MAX_FRAME_DELTA, not the whole stall', () => {
  // The bounded catch-up: a five-second stall advances the clock by a quarter second, not five.
  const rate = TICKS_PER_DAY / DAY_LENGTH_SECONDS;
  const stalled = clampDelta(5.0) * rate;
  assert.equal(stalled, MAX_FRAME_DELTA * rate);
  assert.ok(stalled < 6, 'which is a handful of ticks, not a hundred');
  // And with the clamp, a stall cannot skip the night in one frame.
  assert.ok(stalled < TICKS_PER_DAY / 2, 'it cannot jump half a day');
});

// --- the wiring --------------------------------------------------------------------------------------

test('main.js gates on the lifecycle rather than the early flag', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/worldLifecycle\.js'/, 'it uses the lifecycle');
  assert.match(source, /this\.lifecycle = createLifecycle\(\)/, 'created in the constructor');
  assert.match(source, /if \(!beginLoading\(this\.lifecycle\)\) return;/, 'the load begins through it');
  assert.match(source, /markReady\(this\.lifecycle\)/, 'and only the end of loading marks it ready');
  assert.match(source, /markFailed\(this\.lifecycle, err\)/, 'a failure is a phase');
  assert.match(source, /allowsSimulationForPhase\(this\.lifecycle\?\.phase/, 'the animate gate reads it');
  assert.match(source, /const dt = clampDelta\(this\.clock\.getDelta\(\)\)/, 'and the delta is bounded');

  // The old gate was `!this.worldGenerated`, set on the first line of generateNewWorld.
  assert.equal(/if \(!this\.worldGenerated\) \{\n\s+this\.clock\.getDelta\(\);/.test(source), false,
    'the flag-based gate is gone');
});

test('the flag is still set, because callers and tests read it', () => {
  // Removing it outright would break the progress overlay and several tests; it is now descriptive rather
  // than the thing the simulation gates on.
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /this\.worldGenerated = true;/);
  assert.match(source, /this\.worldReady = false;/);
});
