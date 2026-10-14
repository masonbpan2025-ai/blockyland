// The Mob Inspector's "Run showcase" button, for every mob, checked end to end.
//
// Two things are guaranteed here:
//
//   1. Every mob has a real checklist. The showcase used to give most mobs three or four scenarios (move, take damage,
//      die). Each now has at least MIN_SCENARIOS, built from its wiki page and from the rules every mob shares
//      (src/mobBehaviorScenarios.js, src/mobSpecificScenarios.js, src/mobAnimalScenarios.js).
//
//   2. The showcase tells the truth, and the list of what it says is wrong is written down. KNOWN_GAPS names every
//      scenario that currently fails against the wiki. The test fails if a scenario outside the list starts failing (a
//      regression) and also if a listed one starts passing (so the entry gets deleted and the gap stays closed).
//
// To close a gap: fix the behaviour, then remove its line below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEBUG_MOBS } from '../src/mobDebugSession.js';
import { mobScenarios } from '../src/mobShowcase.js';
import { runShowcase } from './helpers/showcaseRunner.js';

const MIN_SCENARIOS = 8;

/** Scenarios that fail today because the game does not yet do what the wiki says. mob -> scenario ids. */
const KNOWN_GAPS = {
  // Empty: every scenario currently matches the wiki. Add a line here (mob: ['scenario_id']) rather than deleting a
  // failing scenario, so the gap stays visible.
};

/** Scenarios whose outcome depends on chance in the game itself; they may pass or fail without it being news. */
const FLAKY = {};

const gapsOf = (mob) => new Set(KNOWN_GAPS[mob] || []);

test('every mob has at least ' + MIN_SCENARIOS + ' scenarios in its showcase', () => {
  const thin = DEBUG_MOBS.map(id => [id, mobScenarios(id).length]).filter(([, n]) => n < MIN_SCENARIOS);
  assert.deepEqual(thin, [], 'these mobs have too few scenarios');
});

test('scenario ids are unique within a mob and every scenario can be run', () => {
  for (const id of DEBUG_MOBS) {
    const cases = mobScenarios(id);
    const ids = cases.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, `${id} has duplicate scenario ids`);
    for (const c of cases) {
      assert.equal(typeof c.setup, 'function', `${id}/${c.id} has no setup`);
      assert.equal(typeof c.check, 'function', `${id}/${c.id} has no check`);
      assert.ok(c.duration > 0, `${id}/${c.id} needs a positive duration`);
      assert.ok(c.label && c.label.length > 6, `${id}/${c.id} needs a readable label`);
    }
    assert.ok(ids.includes('death') || ids.some(i => i.endsWith('_death')), `${id} should test death`);
  }
});

for (const id of DEBUG_MOBS) {
  test(`${id}: the showcase runs clean and matches the known gaps`, () => {
    const results = runShowcase(id);
    const errors = results.filter(r => r.status === 'error');
    assert.deepEqual(errors, [], `${id} had scenarios that threw`);

    const flaky = new Set(FLAKY[id] || []);
    const failing = new Set(results.filter(r => r.status === 'not observed' && !flaky.has(r.id)).map(r => r.id));
    const known = gapsOf(id);
    const detail = (ids) => ids.map(i => `${i} {${results.find(r => r.id === i)?.detail || ''}}`);

    const regressions = [...failing].filter(i => !known.has(i));
    assert.deepEqual(detail(regressions), [], `${id}: scenarios that should pass but do not`);
    const fixed = [...known].filter(i => !failing.has(i) && !flaky.has(i));
    assert.deepEqual(fixed, [], `${id}: these gaps now pass; remove them from KNOWN_GAPS`);
  });
}
