// The live mob drop table, measured with real mobs.
//
// Section 4.2.1 of docs/survival-parity-rules.md records two invalid attempts at this. This is the third
// and it works, using the fixture tests/mobUpdateSmoke.test.js established: real mobs spawned through the
// ordinary dispatcher, so every per-mob helper runs against real state.
//
// It found a concrete gap. Seven mob types that vanilla gives drops to have neither a row nor a helper in
// `getMobDeathDrops`: cat, pufferfish, ravager, skeleton_horse, snow_golem, tropical_fish, zombie_horse.
// The records are pinned below rather than the fix, because the fix belongs in `mobs.js`, which another
// agent is editing -- and because pinning the count means adding rows has to update this list rather than
// silently changing the figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLiveDrops, LOOT_CACHE_PRESENT, liveItemsFor, makeDropFixture } from '../scripts/mob-drop-live.mjs';

test('every vanilla loot-bearing mob can be measured with a real mob', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const r = compareLiveDrops();
  assert.ok(r, 'the comparison should run');
  assert.equal(r.errors.length, 0,
    'spawning or rolling should not throw: ' + JSON.stringify(r.errors.slice(0, 3)));
  assert.ok(r.compared >= 55, 'expected all 55 loot-bearing entities, measured ' + r.compared);
});

test('the mobs with no drop row at all are the ones recorded here', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const r = compareLiveDrops();
  // A mob that produces NOTHING is the class this test is about: a row that exists but rolls zero, or a
  // row producing a differently named item, is a different problem and is excluded by requiring the live
  // side to be empty.
  const empty = r.missing.filter(m => m.live.length === 0).map(m => m.entity).sort();
  assert.deepEqual(empty,
    ['cat', 'pufferfish', 'ravager', 'skeleton_horse', 'snow_golem', 'tropical_fish', 'zombie_horse'],
    'the set of mobs with no drop row changed. If rows were ADDED, this list should shrink and '
    + 'docs/survival-parity-rules.md section 4.2 updated with it.');
});

test('the three near-misses are name or data differences, not missing rows', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const r = compareLiveDrops();
  // Each of these produces SOMETHING, so it is not in the empty list above. They are recorded here so the
  // distinction is not lost: a report that lumped them in with the seven would overstate the gap.
  const byEntity = new Map(r.missing.map(m => [m.entity, m]));
  for (const name of ['stray', 'turtle', 'elder_guardian']) {
    const m = byEntity.get(name);
    assert.ok(m, name + ' should be reported');
    assert.ok(m.live.length > 0, name + ' does produce items, so it is not a missing row');
  }
  // The stray's difference is a VARIANT NAME: it drops tipped_arrow_slowness where vanilla's data says
  // tipped_arrow, and the surplus list reports exactly that.
  const stray = byEntity.get('stray');
  assert.ok(stray.live.includes('tipped_arrow_slowness'),
    'the stray should drop a named tipped arrow variant, got ' + stray.live.join(', '));
  const surplusStray = r.surplus.find(s => s.entity === 'stray');
  assert.ok(surplusStray && surplusStray.extra.includes('tipped_arrow_slowness'),
    'and that variant should be reported as a surplus rather than hidden');
});

test('the roll can be forced, which is what made the phantom look empty', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  // `phantomDrops` rolls `random() < 0.5`. An earlier harness passed `() => 0.5`, which does NOT pass, and
  // reported the phantom as dropping nothing. The roll is forced to 0 here, so the membrane appears.
  const manager = makeDropFixture().manager;
  const forced = liveItemsFor(manager, 'phantom', () => 0);
  assert.ok(forced.names.has('phantom_membrane'),
    'a forced roll should produce the membrane, got ' + [...forced.names].join(', ') || '(nothing)');
  const failed = liveItemsFor(manager, 'phantom', () => 0.999);
  assert.equal(failed.names.size, 0, 'and a failing roll should produce nothing');
});

test('a mob with no loot at all returns an empty list rather than throwing', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const manager = makeDropFixture().manager;
  const frog = liveItemsFor(manager, 'frog');
  assert.ok(!frog.error, 'a frog should not throw: ' + frog.error);
  assert.equal(frog.names.size, 0, 'a frog drops no items, which its own row says');
});
