// The structure audit engine (src/structureAudit.js) and its Inspector view (src/structureInspectorAudit.js).
//
// Two things are tested. First that the audit REPORTS correctly: the swamp hut passes every fact in both modes on
// several seeds. Second, and more important, that the audit CAN FAIL: a checker that returns "pass" for anything
// would have passed the first version of the swamp hut too. So the sensitivity tests feed doctored observations
// and structures the wiki says are wrong, and require the right fact to fail.
import test from 'node:test';
import assert from 'node:assert/strict';

import { observe, auditStructure, auditAllStructures, universalFacts, WORLD_HEIGHT } from '../src/structureAudit.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { auditView, entitiesView, heightView, auditAllView } from '../src/structureInspectorAudit.js';
import { createStructureInspectorSession } from '../src/structureInspectorSession.js';
import { STRUCTURES } from '../src/worldgen/index.js';

const failing = (result) => result.rows.filter((row) => row.status === 'fail').map((row) => `${row.id}: ${row.detail}`);

test('the swamp hut passes its whole card in flat mode, with the real-world facts left unchecked', async () => {
  const result = await auditStructure('swamp_hut', { mode: 'flat' });
  assert.deepEqual(failing(result), []);
  assert.equal(result.summary.fail, 0);
  assert.ok(result.summary.pass >= 20, `passed ${result.summary.pass}`);
  assert.equal(result.summary.waived, 1, 'only the vines are waived, with a reason');
  const unchecked = result.rows.filter((row) => row.status === 'unchecked');
  assert.ok(unchecked.length > 0 && unchecked.every((row) => /real-world/.test(row.detail)), 'flat mode says what it cannot check');
});

for (const seed of [1, 2024, 31337, 987654]) {
  test(`the swamp hut passes every fact in the real world, seed ${seed}`, async () => {
    const result = await auditStructure('swamp_hut', { mode: 'world', seed });
    assert.deepEqual(failing(result), []);
    assert.equal(result.summary.unchecked, 0, 'nothing is left unchecked in the real world');
    assert.ok(result.summary.pass >= 27);
  });
}

test('every card fact says which layer it is, where the wiki said it, and has a unique id', () => {
  for (const [id, card] of Object.entries(STRUCTURE_AUDIT_CARDS)) {
    assert.ok(STRUCTURES[id], `${id} is a registry structure`);
    assert.ok(card.wiki.startsWith('https://minecraft.wiki/'));
    const ids = new Set();
    for (const fact of card.facts) {
      assert.ok(/^L[1-6]$/.test(fact.layer), `${id}/${fact.id} layer`);
      assert.ok(fact.source && fact.text, `${id}/${fact.id} needs wiki text and a statement`);
      assert.ok(!ids.has(fact.id), `${id}: duplicate fact id ${fact.id}`);
      ids.add(fact.id);
      // A fact is checkable or explicitly waived WITH a reason: never neither.
      assert.ok(typeof fact.check === 'function' || (typeof fact.waived === 'string' && fact.waived.length > 20), `${id}/${fact.id}`);
    }
  }
});

// ---- the audit can fail ------------------------------------------------------------------------------------

async function hutObservation() {
  return observe('swamp_hut', { mode: 'flat' });
}
const hutFact = (id) => STRUCTURE_AUDIT_CARDS.swamp_hut.facts.find((fact) => fact.id === id);

test('SENSITIVITY: spruce-log pillars, the first hut\'s bug, fail H5', async () => {
  const obs = await hutObservation();
  assert.equal((await hutFact('H5').check(obs)).ok, true);
  for (const write of obs.writes) if (write.name === 'oak_log') write.name = 'spruce_log';
  assert.equal((await hutFact('H5').check(obs)).ok, false);
});

test('SENSITIVITY: a missing furnishing, a chest, or a filled cauldron each fail their fact', async () => {
  let obs = await hutObservation();
  obs.writes = obs.writes.filter((write) => write.name !== 'crafting_table');
  assert.equal((await hutFact('H11').check(obs)).ok, false);

  obs = await hutObservation();
  obs.writes.push({ x: 0, y: 0, z: 0, name: 'chest', lootTable: null });
  assert.equal((await hutFact('H14').check(obs)).ok, false, 'a chest is not in the hut');

  obs = await hutObservation();
  for (const write of obs.writes) if (write.name === 'cauldron') write.name = 'water_cauldron';
  assert.equal((await hutFact('H12').check(obs)).ok, false, 'Java cauldrons are empty');
});

test('SENSITIVITY: floating pillars, a door, a missing witch and a non-persistent cat fail', async () => {
  let obs = await hutObservation();
  obs.groundAt = () => obs.surface - 30; // the ground is far below where the pillars stop
  assert.equal((await hutFact('H10').check(obs)).ok, false, 'pillars that stop short of the ground');

  obs = await hutObservation();
  obs.writes.push({ x: 0, y: 0, z: 0, name: 'oak_door', lootTable: null });
  assert.equal((await hutFact('H8').check(obs)).ok, false, 'the hut has no door');

  obs = await hutObservation();
  obs.spawns = obs.spawns.filter((spawn) => spawn.type !== 'witch');
  assert.equal((await hutFact('H15').check(obs)).ok, false);

  obs = await hutObservation();
  obs.spawns.find((spawn) => spawn.type === 'cat').options.persistent = false;
  assert.equal((await hutFact('H15').check(obs)).ok, false, 'a cat that despawns');

  obs = await hutObservation();
  obs.spawns.find((spawn) => spawn.type === 'cat').options.variant = 'tabby';
  assert.equal((await hutFact('H15').check(obs)).ok, false, 'a black cat, not a tabby');
});

test('SENSITIVITY: a taller or wider box, and a mangrove gate, fail', async () => {
  const obs = await hutObservation();
  const box = obs.pieces[0].box;
  const original = box.maxY;
  box.maxY += 3;
  assert.equal((await hutFact('H3').check(obs)).ok, false, 'not 7 tall any more');
  box.maxY = original;
  obs.registry = { ...obs.registry, biomes: ['swamp', 'mangrove_swamp'] };
  assert.equal((await hutFact('H1').check(obs)).ok, false);
  obs.registry = { ...obs.registry, biomes: ['swamp'], terrainAdaptation: 'beard_thin' };
  assert.equal((await hutFact('H2').check(obs)).ok, false, 'a beard would bury the stilts');
});

test('SENSITIVITY (universal): structures that do not fit the 64-block world fail U4, and finding them is the point', async () => {
  const u4 = universalFacts().find((fact) => fact.id === 'U4');
  for (const id of ['ancient_city', 'trial_chambers']) {
    const obs = await observe(id, { mode: 'flat' });
    const result = u4.check(obs);
    assert.equal(result.ok, false, `${id} must fail: ${result.detail}`);
    assert.ok(obs.stats.fitPercent < 5, `${id} fits ${obs.stats.fitPercent}%`);
  }
  const fits = await observe('swamp_hut', { mode: 'flat' });
  assert.equal(u4.check(fits).ok, true);
  assert.equal(WORLD_HEIGHT, 64);
});

test('SENSITIVITY (universal): a block without a facing fails U6 (the chest/stair/door/bed orientation bug class)', async () => {
  const u6 = universalFacts().find((fact) => fact.id === 'U6');
  const obs = await observe('village_plains', { mode: 'flat' });
  assert.equal(u6.check(obs).ok, true, 'villages carry facing on doors, beds, chests and stairs');
  const door = obs.writes.find((write) => /_door$/.test(write.name));
  door.props = null;
  assert.equal(u6.check(obs).ok, false);
});

test('the audit knows a structure with no generator and one it cannot locate, instead of passing them', async () => {
  const result = await auditStructure('mineshaft', { mode: 'flat' });
  assert.equal(result.summary.pass, 0);
  assert.ok(result.rows.every((row) => row.status === 'unchecked' && /no generator/.test(row.detail)));
  const all = await auditAllStructures({ mode: 'flat' });
  const mineshaft = all.find((entry) => entry.structureId === 'mineshaft');
  assert.equal(mineshaft.implemented, false);
});

test('every village type passes its whole card, wiki infobox included, in flat and real-world mode on several seeds', async () => {
  for (const id of ['village_plains', 'village_desert', 'village_savanna', 'village_snowy', 'village_taiga']) {
    for (const [mode, seed] of [['flat', 20250401], ['world', 2024], ['world', 7]]) {
      const result = await auditStructure(id, { mode, seed });
      assert.deepEqual(failing(result), [], `${id} ${mode} seed ${seed}`);
      for (const fact of ['V1', 'V2', 'V3', 'V4', 'V8', 'V9', 'V11', 'V12', 'V14', 'W1']) {
        assert.equal(result.rows.find((row) => row.id === fact)?.status, 'pass', `${id} ${mode} seed ${seed}: ${fact}`);
      }
    }
  }
});

test('SENSITIVITY: a village fact fails when the village is wrong', async () => {
  const { STRUCTURE_AUDIT_CARDS } = await import('../src/structureAuditCards.js');
  const card = STRUCTURE_AUDIT_CARDS.village_desert;
  const obs = await observe('village_desert', { mode: 'flat', seed: 20250401 });
  const fact = (id) => card.facts.find((f) => f.id === id);
  // Oak planks in a desert village are outside its infobox list (W1 is built from that list).
  assert.equal(card.infoboxBlocks.includes('oak_planks'), false);
  // A red bed is not a desert colour (V9); no camel in a desert village fails V10.
  const withRedBed = { ...obs, writes: [...obs.writes, { ...obs.writes[0], name: 'red_bed' }] };
  assert.equal(fact('V9').check(withRedBed).ok, false);
  const noCamel = { ...obs, spawnsOf: (type) => (type === 'camel' ? [] : obs.spawnsOf(type)) };
  assert.equal(fact('V10').check(noCamel).ok, false);
  // A carrot field is not a desert crop (V4).
  const carrots = { ...obs, writes: [...obs.writes, { ...obs.writes[0], name: 'carrots_stage_3' }] };
  assert.equal(fact('V4').check(carrots).ok, false);
});

// ---- the Inspector's view of it ----------------------------------------------------------------------------

test('auditView puts failures first and headlines the counts', async () => {
  const real = await auditStructure('village_taiga', { mode: 'flat' });
  // Every card passes now, so one row is marked failed here to check the ordering and the verdict.
  const rows = real.rows.map((row, i) => (i === real.rows.length - 1 ? { ...row, status: 'fail' } : row));
  const summary = { ...real.summary, fail: real.summary.fail + 1, pass: real.summary.pass - 1 };
  const result = { ...real, rows, summary };
  const view = auditView(result);
  assert.equal(view.verdict, 'fail');
  assert.equal(view.rows[0].status, 'fail');
  const statuses = view.rows.map((row) => row.status);
  assert.deepEqual([...statuses].sort((a, b) => ['fail', 'unchecked', 'waived', 'pass'].indexOf(a) - ['fail', 'unchecked', 'waived', 'pass'].indexOf(b)), statuses, 'sorted failures, unchecked, waived, passes');
  assert.match(view.headline, /\d+ pass, \d+ fail, \d+ waived, \d+ unchecked/);
  assert.equal(view.hasCard, true);
});

test('entitiesView groups mobs and reports delivery in the real world', async () => {
  const flat = entitiesView(await observe('swamp_hut', { mode: 'flat' }));
  assert.equal(flat.total, 2);
  assert.equal(flat.delivered, null, 'flat mode has no game to deliver to');
  assert.deepEqual(flat.groups.map((group) => group.type).sort(), ['cat', 'witch']);
  const cat = flat.groups.find((group) => group.type === 'cat');
  assert.deepEqual(cat.variants, ['all_black']);
  assert.equal(cat.persistent, 1);

  const world = entitiesView(await observe('swamp_hut', { mode: 'world' }));
  assert.equal(world.delivered, 2);
  assert.equal(entitiesView(null).available, false);
});

test('heightView shows how much of a structure is clipped', async () => {
  const hut = heightView(await observe('swamp_hut', { mode: 'flat' }));
  assert.equal(hut.clipped, 0);
  assert.ok(hut.world.from < hut.world.to);
  assert.ok(hut.structure.from >= hut.world.from && hut.structure.to <= hut.world.to, 'the hut sits inside the world band');
  const city = heightView(await observe('ancient_city', { mode: 'flat' }));
  assert.ok(city.fitPercent < 5 && city.clipped > 1000);
  assert.ok(city.structure.to < city.world.from, 'the whole city is below the world band');
  assert.match(city.label, /clipped/);
});

test('auditAllView gives one row per structure with a verdict', async () => {
  const rows = auditAllView(await auditAllStructures({ mode: 'flat' }));
  assert.equal(rows.length, Object.values(STRUCTURES).filter(Boolean).length);
  const by = Object.fromEntries(rows.map((row) => [row.structureId, row]));
  assert.equal(by.swamp_hut.verdict, 'incomplete', 'flat mode cannot finish the real-world facts');
  assert.equal(by.stronghold.verdict, 'no generator');
  assert.equal(by.ancient_city.verdict, 'fail');
  assert.ok(by.ancient_city.failing.includes('U4'));
});

test('the Inspector session and page are wired to the audit', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../structure-inspector.html', import.meta.url), 'utf8');
  for (const id of ['btn-audit', 'btn-audit-all', 'audit-mode', 'audit-summary', 'audit-table', 'entities-info', 'height-gauge', 'audit-all']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  const page = readFileSync(new URL('../src/structureInspector.js', import.meta.url), 'utf8');
  assert.match(page, /runAuditAndRender\(session/);
  assert.match(page, /runAuditAllAndRender\(session/);
  const session = createStructureInspectorSession({ structureId: 'swamp_hut', seed: 20250401 });
  const result = await auditStructure(session.state.structureId, { seed: session.state.seed, mode: 'flat', biome: session.world.biome });
  assert.equal(result.summary.fail, 0);
});

test('the wiki infobox block list is a fact (W1) and the hut satisfies it', async () => {
  const result = await auditStructure('swamp_hut', { mode: 'flat', seed: 20250401 });
  const w1 = result.rows.find((row) => row.id === 'W1');
  assert.ok(w1, 'the swamp hut card lists the infobox blocks');
  assert.equal(w1.status, 'pass', w1.detail);
  // The fact is sensitive: a block outside the list, or a listed block that is missing, would fail it.
  const { STRUCTURE_AUDIT_CARDS } = await import('../src/structureAuditCards.js');
  const card = STRUCTURE_AUDIT_CARDS.swamp_hut;
  const saved = card.infoboxBlocks;
  try {
    card.infoboxBlocks = saved.filter((name) => name !== 'oak_fence').concat('chest');
    const broken = await auditStructure('swamp_hut', { mode: 'flat', seed: 20250401 });
    const row = broken.rows.find((r) => r.id === 'W1');
    assert.equal(row.status, 'fail');
    assert.match(row.detail, /missing: chest/);
    assert.match(row.detail, /not in the infobox: oak_fence/);
  } finally { card.infoboxBlocks = saved; }
});
