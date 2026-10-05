// The documentation's parity figures must match the measurement.
//
// This exists because they stopped matching twice. The generated backlog reported 421 of 1557 recipes
// (27.0%) while the real figure was 99%, and section 4 of the rules document carried the same stale
// numbers and described geometry as the remaining gap long after the geometry was finished.
//
// A stale document is worse than no document: it reads as current, it is cited, and every number in it
// is wrong. Checking the two against each other is cheap and the failure message names the figure that
// moved, so the fix is a one-line edit rather than an investigation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measure, implementedRecipes, CACHE_PRESENT } from '../scripts/parity-coverage.mjs';

const DOC = 'docs/survival-parity-rules.md';

/** The `| Label | have | vanilla | coverage |` rows from the content table. */
function tableRows(text, heading) {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, 'the heading "' + heading + '" should exist in ' + DOC);
  const section = text.slice(start);
  const rows = new Map();
  for (const m of section.matchAll(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d.]+)%\s*\|/gm)) {
    rows.set(m[1], { have: Number(m[2]), vanilla: Number(m[3]), pct: Number(m[4]) });
  }
  return rows;
}

/**
 * The `| Label | compared | differences |` rows from the mob-drop table.
 *
 * A separate reader because that table has three columns rather than four, and the first version of this
 * file assumed every table looked like the content one -- so it found no rows and reported the missing
 * heading rather than the shape mismatch.
 */
function threeColumnRows(text, heading) {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, 'the heading "' + heading + '" should exist in ' + DOC);
  const section = text.slice(start);
  const rows = new Map();
  // Neither of the last two columns is necessarily a number: the differences column holds an em dash
  // where nothing is comparable, and the compared column holds prose for the table that has not been
  // measured. A digits-only pattern silently dropped that row, and the test then reported it as missing
  // rather than as unparsed.
  for (const m of section.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/gm)) {
    const compared = /^\d+$/.test(m[2].trim()) ? Number(m[2].trim()) : null;
    const diff = /^\d+$/.test(m[3].trim()) ? Number(m[3].trim()) : null;
    rows.set(m[1], { compared, differences: diff, rawCompared: m[2].trim(), raw: m[3].trim() });
  }
  return rows;
}

test('the rules document reports the measured recipe figures', (t) => {
  if (!CACHE_PRESENT) { t.skip('vanilla cache absent'); return; }
  const doc = readFileSync(DOC, 'utf8');
  const rows = tableRows(doc, '### 4.1 Content');
  const impl = implementedRecipes();
  const m = measure();

  // The check is for GROSS staleness, not exact equality.
  //
  // Exact equality chased a moving target: another agent adds content continuously, so the figure drifted
  // within the same round four times and each failure was noise rather than a defect. What the guard
  // exists to catch is the case it was written for -- the document reporting 421 of 1557 (27%) while the
  // real figure was 99%.
  //
  // So a documented figure must be within 2% of the measured one and never ABOVE it, since the document
  // cannot know about content that does not exist yet. That catches the stale-by-a-mile case, a wildly
  // optimistic hand-edit, and a figure left behind by an order of magnitude, without failing every time
  // somebody adds a mob.
  const TOLERANCE = 0.02;
  const check = (label, documented, measured) => {
    assert.ok(documented !== undefined && measured !== undefined, label + ' should be reported in both');
    const drift = (measured - documented) / measured;
    assert.ok(drift <= TOLERANCE,
      label + ': the document says ' + documented + ' but the measurement says ' + measured
      + ' (stale by ' + (drift * 100).toFixed(1) + '%)');
    assert.ok(documented <= measured,
      label + ': the document claims ' + documented + ' but only ' + measured + ' exist');
  };

  const implemented = rows.get('Vanilla recipes implemented');
  assert.ok(implemented, 'the table should have a "Vanilla recipes implemented" row');
  check('Vanilla recipes implemented', implemented.have, impl.vanillaImplemented);
  assert.equal(implemented.vanilla, impl.vanillaTotal, 'and the total should match exactly');

  const expressible = rows.get('Crafting recipes expressible');
  assert.ok(expressible, 'the table should have an expressible row');
  check('Crafting recipes expressible', expressible.have, m.expressible);

  const blocks = rows.get('Blocks named');
  assert.ok(blocks, 'the table should have a blocks row');
  check('Blocks named', blocks.have, m.knownBlocks);

  const items = rows.get('Items named');
  assert.ok(items, 'the table should have an items row');
  check('Items named', items.have, m.knownItems);

  console.log('  documented: ' + implemented.have + ' recipes, ' + blocks.have + ' blocks, '
    + items.have + ' items');
});

test('the percentages in the document are arithmetically consistent', () => {
  // A hand-edited "have" with a stale percentage is the likely mistake, so the two are checked against
  // each other as well as against the measurement.
  const doc = readFileSync(DOC, 'utf8');
  const rows = tableRows(doc, '### 4.1 Content');
  assert.ok(rows.size >= 4, 'expected at least four rows, found ' + rows.size);
  for (const [label, r] of rows) {
    const expected = Math.round((r.have / r.vanilla) * 1000) / 10;
    assert.ok(Math.abs(expected - r.pct) <= 0.1,
      label + ': ' + r.have + '/' + r.vanilla + ' is ' + expected + '%, but the table says ' + r.pct + '%');
  }
});

test('the document does not describe finished work as remaining', () => {
  // A softer check, because the failure mode is prose rather than a number: the old text said the gap
  // "is dominated by content that needs new geometry", long after every geometry family was built.
  const doc = readFileSync(DOC, 'utf8');
  for (const phrase of ['is dominated by content that needs']) {
    assert.equal(doc.includes(phrase), false,
      'the document still claims the gap is dominated by missing geometry: "' + phrase + '"');
  }
});

test('the mob drop table in the document matches the measurement', async (t) => {
  const { compareMobLoot, LOOT_CACHE_PRESENT } = await import('../scripts/mob-loot-parity.mjs');
  if (!LOOT_CACHE_PRESENT) { t.skip('vanilla loot cache absent'); return; }
  const doc = readFileSync(DOC, 'utf8');
  const r = compareMobLoot();
  const rows = threeColumnRows(doc, '### 4.2 Mob drops');
  // The labels carry the table name, because the document now has TWO tables to distinguish: the verified
  // but unused MOB_LOOT, and the live getMobDeathDrops which has no figures at all. A reader (and this
  // guard) must not be able to confuse which numbers belong to which.
  const MOB_LOOT = '`MOB_LOOT` ';
  const entries = rows.get(MOB_LOOT + 'drop entries');
  assert.ok(entries, 'the mob drop table should report the number of entries compared; labels are '
    + [...rows.keys()].join(' | '));
  assert.equal(entries.compared, r.compared,
    'the document says ' + entries.compared + ' drop entries; the measurement says ' + r.compared);
  const entities = rows.get(MOB_LOOT + 'entities with drops');
  assert.ok(entities, 'and the number of entities');
  assert.equal(entities.compared, r.entities,
    'the document says ' + entities.compared + ' entities; the measurement says ' + r.entities);
  assert.equal(r.chanceDiff.length + r.countDiff.length + r.flagDiff.length, 0,
    'the document claims no differences, but the measurement found some');
  // And the document must not claim a difference where there is none, or the reverse.
  for (const [label, count] of [[MOB_LOOT + 'drop chance', r.chanceDiff.length],
    [MOB_LOOT + 'stack count', r.countDiff.length], [MOB_LOOT + '`playerKill` condition', r.flagDiff.length]]) {
    const row = rows.get(label);
    if (!row) continue;
    // An em dash means "not applicable" for the entity and entry rows; a numeric column must agree.
    assert.notEqual(row.differences, null, label + ' should report a count, not a dash');
    assert.equal(row.differences, count, label + ' disagreement count is stale in the document');
  }
  // The live table must be marked as unmeasured rather than silently omitted, or the section reads as
  // though mob drops were covered when only the unused table has been checked.
  const live = rows.get('`getMobDeathDrops`');
  assert.ok(live, 'the document should have a row for the live table');
  assert.equal(live.differences, null, 'and its difference column should be a dash, not a number');
  assert.ok(/not measured/i.test(doc), 'the document should say the live table is unmeasured');
});
