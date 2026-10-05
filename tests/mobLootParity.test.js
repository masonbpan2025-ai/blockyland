// Mob drop parity against vanilla's entity loot tables.
//
// This is the first measurement of the mob-drop strand of the objective. It compares 104 drop entries
// across 55 entities on three axes -- drop chance, stack count and the player-kill condition -- because
// a single "drops match" figure would hide which axis regressed.
//
// A note on the field order, because it cost a round. MOB_LOOT entries are `[item, chance, count, flags]`.
// A first version of this comparison read field 2 as a MINIMUM stack size and reported 36 mismatches,
// every one of which was the chance field compared against itself. The tell was that a stack-range
// comparison and a probability comparison returned identically-sized lists with identically-matching
// numbers: two independent measures agreeing to the digit is a reading error, not a finding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareMobLoot, LOOT_CACHE_PRESENT, vanillaEntries, mineEntry } from '../scripts/mob-loot-parity.mjs';
import { MOB_LOOT, lootFor, rollLoot } from '../src/mobLootData.js';

test('every drop entry this game publishes matches vanilla', (t) => {
  if (!LOOT_CACHE_PRESENT) {
    t.skip('vanilla loot cache absent');
    return;
  }
  const r = compareMobLoot();
  assert.ok(r.compared >= 100, 'expected the full drop set, compared ' + r.compared);
  assert.deepEqual(r.chanceDiff, [], 'drop chances differ from vanilla');
  assert.deepEqual(r.countDiff, [], 'stack counts differ from vanilla');
  assert.deepEqual(r.flagDiff, [], 'the player-kill condition differs from vanilla');
  console.log('  ' + r.compared + ' entries across ' + r.entities + ' entities, all matching');
});

test('the documented field order is item, chance, count, flags', () => {
  // Pins the reading rather than only the outcome, since misreading it produced a false gap report.
  const mine = mineEntry('zombie', 'iron_ingot');
  assert.ok(mine, 'a zombie should drop an iron ingot sometimes');
  assert.ok(Math.abs(mine.chance - 0.008333) < 1e-5,
    'field 2 is the CHANCE, expected about 0.008333, got ' + mine.chance);
  assert.equal(mine.min, 1, 'and the count is 1');
  assert.equal(mine.max, 1);
  assert.equal(mine.playerKill, true, 'and field 4 is the player-kill flag');
});

test('a guaranteed drop always appears and a conditional one does not', () => {
  // Behaviour rather than data shape: the table can match and the roll still be wrong.
  //
  // The random always passes the chance roll, so the playerKill gate is the only thing deciding the
  // outcome. A fixed 0.5 would skip every rare drop in both cases and prove nothing -- which is what the
  // first version of this check did.
  const without = rollLoot('zombie', () => 0, { playerKill: false }).map(d => d.item);
  const with_ = rollLoot('zombie', () => 0, { playerKill: true }).map(d => d.item);
  assert.deepEqual(without, ['rotten_flesh'], 'a zombie killed without a player drops only flesh');
  assert.ok(with_.includes('iron_ingot'), 'a player kill can drop the rare items');
  assert.ok(with_.includes('rotten_flesh'), 'and still drops the guaranteed one');
  assert.ok(with_.length > without.length, 'the player kill yields strictly more');
});

test('a chance roll that fails yields nothing for that entry', () => {
  // The other direction: a random of 1 fails every sub-1 chance, so only guaranteed drops remain.
  const items = rollLoot('zombie', () => 1, { playerKill: true }).map(d => d.item);
  assert.deepEqual(items, ['rotten_flesh'], 'only the chance-1 drop survives a failing roll');
});

test('a mob with no loot table drops nothing rather than throwing', () => {
  assert.deepEqual(lootFor('definitely_not_a_mob'), []);
  assert.deepEqual(rollLoot('definitely_not_a_mob'), []);
  assert.deepEqual(MOB_LOOT.definitely_not_a_mob, undefined);
});

test('a ranged count produces every value in its range', () => {
  // Counts may be a number or a "lo-hi" string. The string form is the one that can silently be ignored
  // and leave every drop as a single item.
  const ranged = Object.entries(MOB_LOOT).flatMap(([mob, drops]) =>
    drops.filter(d => typeof d[2] === 'string' && d[2].includes('-')).map(d => ({ mob, item: d[0], range: d[2] })));
  if (ranged.length === 0) {
    console.log('  no ranged drops in the table; the string form is unused');
    return;
  }
  for (const { mob, item, range } of ranged.slice(0, 5)) {
    const [lo, hi] = range.split('-').map(Number);
    const counts = new Set();
    for (let i = 0; i < 200; i++) {
      for (const d of rollLoot(mob, () => 0, { playerKill: true })) {
        if (d.item === item) counts.add(d.count);
      }
    }
    assert.ok(counts.size > 1 || lo === hi,
      mob + ' ' + item + ' always rolls ' + [...counts][0] + ' despite a range of ' + range);
    for (const c of counts) {
      assert.ok(c >= lo && c <= hi, mob + ' ' + item + ' rolled ' + c + ' outside ' + range);
    }
  }
});

test('the verified table is the unused one, and the used one is unmeasured', () => {
  // This test asserts the repository's actual situation rather than a virtue, deliberately.
  //
  // The parity results above show MOB_LOOT matches vanilla exactly. They say nothing about gameplay,
  // because nothing imports mobLootData.js: the table that produces drops is MobManager.getMobDeathDrops
  // in mobs.js, which has never been compared against vanilla. An earlier version of this file implied
  // full mob-drop parity without saying which table it meant.
  //
  // The assertion is written to FAIL when MOB_LOOT is wired, so that change forces this test and the
  // section 4.2 table to be updated together instead of leaving a stale claim behind.
  const mobLootSource = readFileSync(new URL('../src/mobLootData.js', import.meta.url), 'utf8');
  assert.ok(/export const MOB_LOOT/.test(mobLootSource), 'the table should still exist');

  const mobs = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  assert.equal(/from '\.\/mobLootData\.js'/.test(mobs), false,
    'mobs.js now imports the verified table. Update docs/survival-parity-rules.md section 4.2 and this '
    + 'test together, and measure getMobDeathDrops against vanilla while you are there.');

  // And the live path is a different, substantial table rather than a stub.
  const start = mobs.indexOf('  getMobDeathDrops(mob');
  assert.ok(start > 0, 'the live drop table should exist');
  const end = mobs.indexOf('\n  /**', start);
  const body = mobs.slice(start, end);
  assert.ok(body.length > 4000, 'the live table should be substantial, got ' + body.length + ' chars');
  assert.ok((body.match(/Drops\(mob/g) || []).length >= 15,
    'the live table should delegate to per-mob helpers');
});

test('vanilla entries are readable for a known mob', (t) => {
  if (!LOOT_CACHE_PRESENT) { t.skip('cache absent'); return; }
  const cow = vanillaEntries({ drops: [{ item: 'leather', dropChance: 1, stackSizeRange: [1, 1] }] });
  assert.equal(cow.length, 1);
  assert.equal(cow[0].item, 'leather');
  assert.equal(cow[0].chance, 1);
});
