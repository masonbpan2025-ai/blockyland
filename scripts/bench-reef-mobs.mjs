// Same-process CPU comparison against methods frozen before optimization.
// Run: node scripts/bench-reef-mobs.mjs [--real] [--output path.json]
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { findPufferfishThreat } from '../src/fishBehavior.js';
import { originalMobCollisions, originalPufferfishThreat, originalAquaticMob } from '../tests/helpers/reefMobBaseline.js';
import { originalCheckMobCollision } from '../tests/helpers/reefMobCollisionBaseline.js';
import { reefFixture, realReefFixture, snapshot, withRandom } from '../tests/helpers/reefMobFixture.js';

const realOnly = process.argv.includes('--real');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error('--output requires a JSON path');

function originalManager(manager) {
  manager.applyMobCollisions = originalMobCollisions;
  manager.updateAquaticMob = originalAquaticMob;
  manager.checkMobCollision = originalCheckMobCollision;
  return manager;
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)] };
}

function compare(label, create, originalStep, optimizedStep, { repeats = 3, seed = 4242, cleanup = () => {} } = {}) {
  // Warm both paths separately, then alternate sample order to reduce JIT/thermal/order bias.
  for (const [which, step] of [originalStep, optimizedStep].entries()) {
    const fixture = which ? create() : originalManager(create());
    withRandom(seed, () => { for (let i = 0; i < 8; i++) step(fixture); });
    cleanup(fixture);
  }
  const times = [[], []];
  for (let sample = 0; sample < 9; sample++) {
    const fixtures = [originalManager(create()), create()];
    const randomCalls = [];
    for (const which of sample % 2 ? [1, 0] : [0, 1]) {
      const step = which ? optimizedStep : originalStep;
      const result = withRandom(seed, () => {
        const started = performance.now();
        for (let i = 0; i < repeats; i++) step(fixtures[which]);
        return (performance.now() - started) / repeats;
      });
      times[which].push(result.value); randomCalls[which] = result.calls;
    }
    assert.equal(randomCalls[1], randomCalls[0], `${label}: RNG consumption`);
    assert.deepEqual(snapshot(fixtures[1].mobs), snapshot(fixtures[0].mobs), `${label}: state parity`);
    for (const fixture of fixtures) cleanup(fixture);
  }
  const original = summary(times[0]), optimized = summary(times[1]);
  return { label, original, optimized, medianSpeedup: original.medianMs / optimized.medianMs, exactParity: true };
}

const results = [];
if (!realOnly) for (const count of [500, 1926]) for (const dense of [false, true]) {
  results.push(compare(`collision/${count}/${dense ? 'crowded' : 'spread'}`,
    () => reefFixture(count, { dense }), m => originalMobCollisions.call(m, 1 / 60),
    m => m.applyMobCollisions(1 / 60)));
}

const player = { type: 'player', position: new THREE.Vector3(8, 20, 8) };
const threatStep = method => manager => {
  for (const mob of manager.mobs) if (mob.type === 'pufferfish') mob.benchmarkThreat = method(manager, mob, player);
};
if (!realOnly) results.push(compare('threats/600', () => reefFixture(600), threatStep(originalPufferfishThreat), threatStep(findPufferfishThreat), { repeats: 10 }));
// Assert target identity/order separately; meshes are independent between fixtures.
const threatFixture = reefFixture(600);
for (const mob of threatFixture.mobs) if (mob.type === 'pufferfish')
  assert.equal(findPufferfishThreat(threatFixture, mob, player), originalPufferfishThreat(threatFixture, mob, player));

if (!realOnly) for (const refresh of [false, true]) {
  const create = () => {
    const manager = reefFixture(500, { aquaticOnly: true });
    for (const mob of manager.mobs) { mob.timer = 1000; mob.targetPos = mob.mesh.position.clone().add(new THREE.Vector3(4, 0, 4)); }
    return manager;
  };
  const step = method => manager => {
    for (const mob of manager.mobs) {
      if (refresh) { mob.timer = 0; mob.targetPos = null; }
      method.call(manager, mob, 1 / 60, null);
    }
  };
  results.push(compare(`aquatic/500/${refresh ? 'target-refresh' : 'steady'}`, create,
    step(originalAquaticMob), step(MobManager.prototype.updateAquaticMob)));
}

for (const refresh of [false, true]) {
  const step = manager => {
    if (refresh) for (const mob of manager.mobs) { mob.timer = 0; mob.targetPos = null; }
    manager.update(1 / 60, manager.game.player);
    assert.equal(manager.mobErrors.size, 0, 'full update must not isolate any failed mob');
  };
  results.push(compare(`full-update/530/${refresh ? 'target-refresh' : 'ordinary'}`,
    () => realReefFixture(530), step, step, { repeats: 5, cleanup: m => m.clearMobs() }));
}

// Coarse inclusive method timings only: do not put performance.now() in voxel/dimension loops.
function profile(original) {
  const manager = realReefFixture(530);
  if (original) originalManager(manager);
  const methods = {};
  let dimensionCalls = 0;
  const dimensions = manager.getMobDimensions;
  manager.getMobDimensions = function (...args) { dimensionCalls++; return dimensions.apply(this, args); };
  for (const name of ['applyMobCollisions', 'updateAquaticMob']) {
    const method = manager[name];
    methods[name] = { calls: 0, totalMs: 0 };
    manager[name] = function (...args) {
      const start = performance.now();
      const value = method.apply(this, args);
      methods[name].calls++; methods[name].totalMs += performance.now() - start;
      return value;
    };
  }
  const frames = 60;
  const totalMs = withRandom(999, () => {
    const start = performance.now();
    for (let i = 0; i < frames; i++) manager.update(1 / 60, manager.game.player);
    return performance.now() - start;
  }).value;
  assert.equal(manager.mobErrors.size, 0);
  manager.clearMobs();
  return { frames, totalMs, averageUpdateMs: totalMs / frames, dimensionCalls, inclusiveMethods: methods };
}

const counts = [originalMobCollisions, MobManager.prototype.applyMobCollisions].map(method => {
  const manager = reefFixture(500, { countDimensions: true });
  method.call(manager, 1 / 60);
  return manager.dimensionCalls;
});
const report = { node: process.version,
  scope: 'CPU only; full updates use real reef models and deterministic synthetic voxels, not browser/world/render costs',
  baseline: 'Captured collision, aquatic and box-check methods; full-update paths both use current pufferfish dispatcher (conservative comparison)',
  dimensionsAt500: { original: counts[0], optimized: counts[1] }, results,
  profile530: { original: profile(true), optimized: profile(false) } };
const json = JSON.stringify(report, null, 2);
if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], json + '\n');
console.log(json);
