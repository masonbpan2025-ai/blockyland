// The live mob drop table, measured with real mobs.
//
// Section 4.2.1 of docs/survival-parity-rules.md records two invalid attempts at this. This is the third
// and it works, but its own first version was wrong a fourth way, recorded below, and the correction is
// the most useful thing in this file.
//
// Round 34 reported "seven mobs with no drop row at all" from this harness. That was wrong. `spawnMob`
// falls back to a VILLAGER for any type it does not know -- its `default:` branch ends in
// `return this.spawnVillager(...)` -- so spawning by name and reading the mob measures a villager for any
// mob that does not exist. Five of the seven were unported mobs, not missing drops. Only cat and ravager
// were real gaps, and they are now fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLiveDrops, LOOT_CACHE_PRESENT, liveItemsFor, makeDropFixture }
  from '../scripts/mob-drop-live.mjs';

test('every spawnable vanilla loot-bearing mob can be measured', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const r = compareLiveDrops();
  assert.ok(r, 'the comparison should run');
  assert.equal(r.errors.length, 0,
    'spawning or rolling should not throw: ' + JSON.stringify(r.errors.slice(0, 3)));
  assert.ok(r.compared >= 50, 'expected at least 50 spawnable entities, measured ' + r.compared);
});

test('spawnMob returns nothing for a type it does not know, and says so', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  // This USED to assert the opposite. `spawnMob` fell back to a villager for any unknown type, which made
  // every typo and every unported mob look like a villager -- it hid five mobs from this very harness,
  // because spawning 'pufferfish' produced a villager whose drops were then measured against vanilla's
  // pufferfish entry. The fallback now returns null and logs.
  //
  // The assertion is inverted deliberately: if the substitution ever comes back, this fails.
  //
  // `snow_golem` was in this list and is not any more. It was added as a real mob, and this test failed
  // with a message saying exactly that -- which is the property that makes pinning a list of gaps worth
  // doing rather than merely recording it.
  const manager = makeDropFixture().manager;
  for (const type of ['pufferfish', 'skeleton_horse', 'tropical_fish', 'zombie_horse',
    'definitely_not_a_mob']) {
    const mob = manager.spawnMob(type, 0, 1, 0);
    assert.equal(mob, null,
      type + ' is unknown, so nothing should spawn. It returned ' + (mob && mob.type));
  }
  // And real mobs are unaffected.
  assert.equal(manager.spawnMob('cow', 0, 1, 0).type, 'cow');
  assert.equal(manager.spawnMob('villager', 0, 1, 0).type, 'villager',
    'a villager is a real type and must still work');
});

test('the five unported mobs are reported as unported, not as drop gaps', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const r = compareLiveDrops();
  assert.deepEqual(r.notSpawnable.map(n => n.entity).sort(),
    ['pufferfish', 'skeleton_horse', 'tropical_fish', 'zombie_horse'],
    'the set of mobs this game does not have changed. If they were ADDED, this list should shrink and '
    + 'docs/survival-parity-rules.md section 4.2.2 updated with it. snow_golem was on this list until it '
    + 'was added, and removing it here is what that failure asked for.');
  // None of them may appear in the drop-gap list, because a row for a mob that cannot spawn fixes nothing.
  for (const n of r.notSpawnable) {
    assert.equal(r.missing.some(m => m.entity === n.entity), false,
      n.entity + ' cannot spawn, so it must not be reported as a drop gap');
  }
});

test('the two real drop gaps are fixed', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const manager = makeDropFixture().manager;
  // cat: vanilla drops 0-2 string. ravager: vanilla drops a saddle. Both had no row at all.
  const cat = liveItemsFor(manager, 'cat');
  assert.ok(cat.names.has('string'),
    'a cat should now drop string, got ' + [...cat.names].join(', '));
  const ravager = liveItemsFor(manager, 'ravager');
  assert.ok(ravager.names.has('saddle'),
    'a ravager should now drop a saddle, got ' + [...ravager.names].join(', '));
});

test('the three remaining differences are names or vanilla data, not missing drops', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const r = compareLiveDrops();
  // Each produces SOMETHING for the mob, so none is a mob with no drop row. Recorded so a future report
  // does not lump them in and overstate the gap, which is what round 34 did.
  for (const name of ['stray', 'turtle', 'elder_guardian']) {
    const m = r.missing.find(x => x.entity === name);
    assert.ok(m, name + ' should still be reported as a difference');
    assert.ok(m.live.length > 0, name + ' does produce items, so it has a drop row');
  }
  // The stray's is a VARIANT NAME: it drops tipped_arrow_slowness where vanilla's data says tipped_arrow.
  const stray = r.missing.find(x => x.entity === 'stray');
  assert.ok(stray.live.includes('tipped_arrow_slowness'));
  assert.ok(r.surplus.find(s => s.entity === 'stray')?.extra.includes('tipped_arrow_slowness'),
    'and the variant should be reported as a surplus rather than hidden');
});

test('the roll can be forced, which is what made the phantom look empty', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  // `phantomDrops` rolls `random() < 0.5`. An earlier harness passed `() => 0.5`, which does NOT pass, and
  // reported the phantom as dropping nothing. The roll is forced to 0 here, so the membrane appears.
  const manager = makeDropFixture().manager;
  assert.ok(liveItemsFor(manager, 'phantom', () => 0).names.has('phantom_membrane'),
    'a forced roll should produce the membrane');
  assert.equal(liveItemsFor(manager, 'phantom', () => 0.999).names.size, 0,
    'and a failing roll should produce nothing');
});
