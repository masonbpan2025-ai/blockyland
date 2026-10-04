// Mob Studio's Test Action / Animate feature is built on this module: it lists every mob
// that can be inspected, describes one mob's properties, and builds the behavioural
// scenario suite that the Showcase button runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobShowcase, mobScenarios, mobProperties, studioCatalog, SCENARIO_SKIP } from '../src/mobShowcase.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { MobLibrary } from '../src/mobLibrary.js';

const session = () => createMobDebugSession(new THREE.Scene(), () => {});

/**
 * Build a showcase whose reports are captured from construction.
 *
 * The reporter has to be wired at construction: `start()` issues its first progress report
 * immediately, so swapping `showcase.report` afterwards would miss it.
 *
 * @returns {{showcase: MobShowcase, reports: object[], finish: Function}}
 */
function instrumented(s, selection) {
  const reports = [];
  let final = null;
  const showcase = new MobShowcase(s, (r) => { reports.push(r); if (r.done) final = r; });
  showcase.start(selection);
  const finish = (maxTicks = 200000) => {
    let ticks = 0;
    while (showcase.running && ticks < maxTicks) { showcase.tick(1 / 30); ticks++; }
    return final;
  };
  return { showcase, reports, finish };
}

/** Run a mob's showcase to completion and return the final report. */
function runToCompletion(s, selection, maxTicks = 200000) {
  return instrumented(s, selection).finish(maxTicks);
}

// --- the browsable catalogue ------------------------------------------------

test('the studio catalogue offers every native mob, so all existing mobs can be viewed', () => {
  const catalog = studioCatalog(MobLibrary);
  const ids = catalog.map(m => m.id);
  for (const native of DEBUG_MOBS) {
    assert.ok(ids.includes(native), `${native} should be browsable`);
  }
  assert.ok(catalog.every(m => m.isBuiltin), 'natives are flagged builtin so Studio opens them read-only');
});

test('the catalogue also lists saved custom mobs, without duplicating a native id', () => {
  const catalog = studioCatalog(MobLibrary);
  const ids = catalog.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids offered');
  for (const mob of MobLibrary.getAllMobs()) {
    // A custom mob whose id collides with a native must not shadow it.
    if (DEBUG_MOBS.includes(mob.id)) continue;
    assert.ok(ids.includes(mob.id), `saved mob ${mob.id} should appear`);
  }
});

test('every catalogue entry carries the fields the list renders', () => {
  for (const entry of studioCatalog(MobLibrary)) {
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.name, 'string');
    assert.ok(entry.name.length > 0, `${entry.id} needs a display name`);
    assert.ok('description' in entry);
    assert.ok('look' in entry && 'behavior' in entry && 'skills' in entry && 'eggColors' in entry);
  }
});

// --- properties for the read-only card --------------------------------------

test('mob properties expose gameplay data an inspector can display', () => {
  const s = session();
  const mob = s.reset('cow');
  const props = mobProperties(mob, s.manager, null);
  assert.equal(typeof props.dimensions.width, 'number');
  assert.equal(typeof props.dimensions.height, 'number');
  assert.equal(typeof props.runtime.health, 'number');
  assert.equal(props.runtime.type, 'cow');
  assert.ok(Array.isArray(props.breedingFoods), 'breeding foods are listed');
});

test('mob properties never leak Three.js objects or owners', () => {
  const s = session();
  const mob = s.reset('cow');
  mob.owner = { secret: true };
  const props = mobProperties(mob, s.manager, null);
  const asText = JSON.stringify(props);
  for (const banned of ['"isObject3D"', '"isMaterial"', '"isTexture"', '"owner"', '"parent"']) {
    assert.ok(!asText.includes(banned), `properties must not expose ${banned}`);
  }
  // Scalars and simple structures survive.
  assert.equal(props.runtime.type, 'cow');
});

test('mob properties tolerate a definition being supplied', () => {
  const s = session();
  const mob = s.reset('cow');
  const def = { id: 'custom_cow', name: 'My Cow' };
  const props = mobProperties(mob, s.manager, def);
  assert.equal(props.definition.id, 'custom_cow');
  assert.equal(props.definition.name, 'My Cow');
});

// --- scenarios --------------------------------------------------------------

test('every native mob gets a behavioural scenario suite', () => {
  for (const type of DEBUG_MOBS) {
    const cases = mobScenarios(type);
    assert.ok(cases.length >= 3, `${type} should have scenarios, got ${cases.length}`);
    for (const c of cases) {
      assert.equal(typeof c.id, 'string', 'each case has an id');
      assert.equal(typeof c.label, 'string', 'and a human label');
      assert.equal(typeof c.duration, 'number');
      assert.ok(c.duration > 0, `${type}/${c.id} needs a positive duration`);
      assert.equal(typeof c.setup, 'function', `${type}/${c.id} needs a setup step`);
      assert.equal(typeof c.check, 'function', `${type}/${c.id} needs a check`);
    }
  }
});

test('scenario ids are unique within a mob', () => {
  for (const type of DEBUG_MOBS) {
    const ids = mobScenarios(type).map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, `${type} has a duplicate scenario id`);
  }
});

test('every mob is tested for movement, damage feedback and death', () => {
  for (const type of DEBUG_MOBS) {
    const ids = mobScenarios(type).map(c => c.id);
    for (const required of ['movement', 'damage', 'death']) {
      assert.ok(ids.includes(required), `${type} should exercise ${required}`);
    }
  }
});

test('mob-specific scenarios appear only for the mobs they belong to', () => {
  const ids = (type, def) => mobScenarios(type, def).map(c => c.id);
  assert.ok(ids('sheep').includes('shear'), 'sheep can be sheared');
  assert.ok(!ids('cow').includes('shear'), 'cows cannot');
  assert.ok(ids('cow').includes('milk'), 'cows can be milked');
  assert.ok(ids('villager').includes('trade'), 'villagers trade');
  assert.ok(ids('wolf').includes('tame'), 'wolves tame');
  assert.ok(ids('piglin').includes('barter'), 'piglins barter');
  assert.ok(ids('chicken').includes('egg'), 'chickens lay');
});

test('custom mob skills become their own scenarios', () => {
  const def = { id: 'custom_x', name: 'X', behavior: { type: 'hostile' }, skills: ['fireball', 'teleport'] };
  const ids = mobScenarios('custom', def).map(c => c.id);
  assert.ok(ids.includes('skill_fireball'), 'a declared skill is exercised');
  assert.ok(ids.includes('skill_teleport'));
  assert.ok(ids.includes('attack'), 'a hostile custom mob is tested for attacking');
});

// --- the showcase runner ----------------------------------------------------

test('the showcase runs a mob to completion and reports every scenario', () => {
  const { showcase, finish } = instrumented(session(), 'cow');
  assert.equal(showcase.running, true, 'it starts running');
  const final = finish();
  assert.ok(final, 'a completion report is delivered');
  assert.equal(final.results.length, showcase.cases.length, 'every scenario reports a result');
  for (const r of final.results) {
    assert.ok(['observed', 'not observed', 'error', 'unsupported'].includes(r.status),
      `unexpected status ${r.status}`);
    assert.equal(typeof r.label, 'string');
  }
});

test('no scenario crashes on any native mob', () => {
  // A scenario throwing would surface as an 'error' result; the whole point of the
  // showcase is that it can be run against anything in the catalogue.
  const failures = [];
  for (const type of DEBUG_MOBS) {
    const final = runToCompletion(session(), type);
    for (const r of final?.results || []) {
      if (r.status === 'error') failures.push(`${type}/${r.id}: ${r.detail}`);
    }
  }
  assert.deepEqual(failures, [], `scenarios must not error:\n${failures.join('\n')}`);
});

test('the showcase reports progress as it advances, so the UI can show a step', () => {
  const { showcase, reports, finish } = instrumented(session(), 'cow');
  finish();
  const steps = reports.filter(r => r.id && typeof r.index === 'number');
  assert.ok(steps.length >= 2, `expected at least two step reports, got ${steps.length}`);
  assert.equal(steps[0].index, 0, 'the first step is index 0');
  assert.ok(steps.every(s => s.total === showcase.cases.length), 'every step knows the total');
});

test('stopping mid-run cancels and reports what happened', () => {
  const { showcase, reports } = instrumented(session(), 'cow');
  showcase.tick(1 / 30);
  const partial = showcase.results.length;
  showcase.stop();
  assert.equal(showcase.running, false);
  const cancel = reports.find(r => r.cancelled);
  assert.ok(cancel, 'a cancellation report is delivered');
  assert.equal(cancel.results.length, partial, 'it reports the scenarios completed so far');
});

test('a scenario whose check never passes is reported as not observed, not as an error', () => {
  const { showcase, finish } = instrumented(session(), 'cow');
  // Force every check to fail, after the first scenario has already been set up.
  for (const c of showcase.cases) c.check = () => false;
  const final = finish();
  assert.ok(final.results.every(r => r.status === 'not observed'));
  assert.ok(!final.results.some(r => r.status === 'error'), 'a failed expectation is not an error');
});

test('a scenario that throws is contained and reported as an error, not crashing the run', () => {
  const s = session();
  const { showcase, finish } = instrumented(s, 'cow');
  // Break the setup for the scenario that is about to run (the runner has consumed the
  // first one already, so target the next).
  const upcoming = showcase.cases[showcase.index + 1];
  upcoming.setup = () => { throw new Error('boom'); };
  const final = finish();
  const broken = final.results.find(r => r.id === upcoming.id);
  assert.equal(broken.status, 'error');
  assert.match(broken.detail, /boom/);
  assert.equal(final.results.length, showcase.cases.length, 'the remaining scenarios still ran');
});

// --- honest reporting of behaviour the game does not implement yet ----------

test('a scenario can report that its behaviour is unimplemented instead of failing', () => {
  const { showcase, finish } = instrumented(session(), 'cow');
  // The runner treats the SKIP sentinel as "cannot be evaluated", not as a mob failure.
  for (const c of showcase.cases) c.check = () => SCENARIO_SKIP;
  const final = finish();
  assert.ok(final.results.every(r => r.status === 'unsupported'),
    `expected all unsupported, got ${JSON.stringify([...new Set(final.results.map(r => r.status))])}`);
  assert.ok(!final.results.some(r => r.status === 'error'), 'a missing feature is not an error');
});

test('an unimplemented scenario is distinguishable from one that simply did not happen', () => {
  // The two are deliberately different statuses: one means "no AI for this yet", the other
  // means "the AI exists but did not fire". Collapsing them hides real gaps.
  const a = instrumented(session(), 'cow');
  for (const c of a.showcase.cases) c.check = () => SCENARIO_SKIP;
  const skipped = a.finish();

  const b = instrumented(session(), 'cow');
  for (const c of b.showcase.cases) c.check = () => false;
  const missed = b.finish();

  assert.ok(skipped.results.every(r => r.status === 'unsupported'));
  assert.ok(missed.results.every(r => r.status === 'not observed'));
});

test('the attack scenario is honest about which mobs have attack AI', () => {
  // Mobs with attack AI must be scored; mobs without it must be reported as unimplemented
  // rather than counted against them.
  const withAi = ['zombie', 'skeleton', 'creeper', 'ghast'];
  const withoutAi = ['vindicator', 'evoker', 'shulker', 'warden'];
  for (const type of [...withAi, ...withoutAi]) {
    const c = mobScenarios(type).find(x => x.id === 'attack');
    assert.ok(c, `${type} should have an attack scenario`);
    const result = runToCompletion(session(), type);
    const attack = result.results.find(r => r.id === 'attack');
    if (withAi.includes(type)) {
      assert.notEqual(attack.status, 'unsupported',
        `${type} has attack AI, so it must be scored (got ${attack.status})`);
    } else {
      assert.equal(attack.status, 'unsupported',
        `${type} has no attack AI, so it should be reported as unimplemented (got ${attack.status})`);
    }
  }
});

test('a stationary hostile mob is not failed for standing still', () => {
  // A hostile mob with no target correctly stands still. The movement check must accept
  // that, or it reports working behaviour as a failure -- which is what it used to do for
  // 22 mobs.
  for (const type of ['skeleton', 'wither_skeleton', 'pillager', 'warden']) {
    const final = runToCompletion(session(), type);
    const movement = final.results.find(r => r.id === 'movement');
    assert.equal(movement.status, 'observed',
      `${type} stands still by design and should still pass movement (got ${movement.status})`);
  }
});

test('each scenario starts from a clean mob, so one cannot affect the next', () => {
  const s = session();
  const { showcase, finish } = instrumented(s, 'cow');
  const before = s.mob;
  s.player.health = 1;
  s.mob.health = 1;
  // Advance past the first scenario so the runner resets for the second.
  const first = showcase.cases[0];
  while (showcase.running && showcase.elapsed < first.duration + 0.5) showcase.tick(1 / 30);
  assert.notEqual(s.mob, before, 'a new mob instance is spawned for the next scenario');
  assert.equal(s.player.health, 100, 'player state is reset between scenarios');
  showcase.stop();
});

// --- the freeze contract Studio depends on ---------------------------------

test('a frozen mob stays put, and unfreezing restores movement', () => {
  // Mob Studio freezes the mob it opens so it stands still while you inspect it, and
  // unfreezes it for the showcase. Both halves of that contract matter.
  const s = session();
  const mob = s.reset('cow');
  mob.frozen = true;
  const start = mob.mesh.position.clone();
  for (let i = 0; i < 150; i++) s.tick(1 / 30);
  assert.ok(mob.mesh.position.distanceTo(start) < 1e-6, 'a frozen mob does not move');

  mob.frozen = false;
  const resumed = mob.mesh.position.clone();
  // An idle cow may randomly choose to stand still for this entire window.
  // Give it a definite destination so this tests unfreezing, not random wandering.
  mob.wanderGoal = resumed.clone().add(new THREE.Vector3(3, 0, 0));
  mob.wanderTimer = 10;
  for (let i = 0; i < 150; i++) s.tick(1 / 30);
  assert.ok(mob.mesh.position.distanceTo(resumed) > 0.05, 'an unfrozen mob moves again');
});

test('the showcase unfreezes the mob so scenarios can actually observe behaviour', () => {
  // Studio freezes the mob it opens so it poses on the pedestal. The runner must clear that
  // for every scenario, because each one resets the session and spawns a fresh mob — a
  // frozen mob would make every movement and attack check fail.
  const s = session();
  const showcase = new MobShowcase(s, () => {});
  showcase.start('cow');
  assert.equal(s.mob.frozen ?? false, false, 'the first scenario runs live');

  // Simulate Studio having frozen the mob, then let the runner advance to the next scenario.
  s.mob.frozen = true;
  showcase.tick(showcase.cases[0].duration + 0.5);
  assert.equal(s.mob.frozen, false, 'the next scenario is un-frozen too');

  const start = s.mob.mesh.position.clone();
  for (let i = 0; i < 90 && showcase.running; i++) showcase.tick(1 / 30);
  assert.ok(s.mob.mesh.position.distanceTo(start) > 0.05,
    'a live mob must move while scenarios run');
});
