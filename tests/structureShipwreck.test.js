// Shipwrecks: the 20 templates (12 drawn by the wiki, 8 cut from the drawn whole ships), the eight wood pairs, and
// the chest loot by place. Cards S1-S4 + W1 for both ids run in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateShipwreck, realizeShipwreck, buildShipwreck, shipwreckDesign, chestKind,
  SHIPWRECK_TEMPLATES, SHIPWRECK_MATERIALS, SHIPWRECK_LOOT, WOOD_PAIRS, BEACHED_TEMPLATES
} from '../src/worldgen/generators/shipwreck.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { BLOCKS } from '../src/blocks.js';

const ocean = { biomeAt: () => 'ocean', surfaceY: () => 30 };
const roleCounts = (template) => {
  const n = {};
  for (const c of shipwreckDesign(template).cells) {
    const k = c.name.replace(/^P_/, 'oak_').replace(/^S_/, 'spruce_');
    n[k] = (n[k] ?? 0) + (/_door$/.test(k) ? 0.5 : 1);
  }
  return n;
};

// The drawn templates differ from the page's materials table by a few blocks (as the igloo's and the jungle
// pyramid's do); the largest gap is the mast's logs. Pinned here so a change is noticed.
const DRAWN_DRIFT = 12;

test('both ids are implemented; 20 templates, 8 wood pairs', () => {
  assert.ok(generatorCoverage().implemented.includes('shipwreck'));
  assert.ok(generatorCoverage().implemented.includes('shipwreck_beached'));
  assert.equal(Object.keys(SHIPWRECK_TEMPLATES).length, 20);
  assert.equal(Object.values(SHIPWRECK_TEMPLATES).filter(Boolean).length, 12, 'the wiki draws 12');
  assert.equal(WOOD_PAIRS.length, 8);
  assert.ok(BEACHED_TEMPLATES.every((t) => /^(rightsideup|with_mast)/.test(t)));
});

test('every template is close to its materials table; the derived ones never exceed it', () => {
  for (const template of Object.keys(SHIPWRECK_TEMPLATES)) {
    const n = roleCounts(template);
    const want = SHIPWRECK_MATERIALS[template];
    for (const k of new Set([...Object.keys(n), ...Object.keys(want)])) {
      const got = n[k] ?? 0; const exp = want[k] ?? 0;
      if (SHIPWRECK_TEMPLATES[template]) assert.ok(Math.abs(got - exp) <= DRAWN_DRIFT, `${template} ${k} ${got}/${exp}`);
      else assert.ok(got <= exp && exp - got <= 26, `${template} ${k} ${got}/${exp}`);
    }
    assert.equal(n.chest ?? 0, want.chest, `${template} chests`);
  }
});

test('chests by place: treasure in the upper stern, map in the lower, supply in the bow (map in an upside-down bow)', () => {
  const kinds = (t) => { const d = shipwreckDesign(t); return d.cells.filter((c) => c.name === 'chest').map((c) => chestKind(t, c, d.axis)).sort(); };
  assert.deepEqual(kinds('rightsideup_full'), ['map', 'supply', 'treasure']);
  assert.deepEqual(kinds('rightsideup_fronthalf'), ['supply']);
  assert.deepEqual(kinds('rightsideup_backhalf'), ['map', 'treasure']);
  assert.deepEqual(kinds('upsidedown_fronthalf'), ['map', 'map']);
  for (const t of Object.keys(SHIPWRECK_TEMPLATES)) {
    const k = kinds(t);
    if (k.length >= 2) assert.ok(k.includes('map'), `${t}: two or more chests always include the map chest`);
  }
});

test('a ship is built in its pair of woods, logs in the primary', () => {
  for (const wood of [0, 3, 7]) {
    const t = new StructureTemplate(buildShipwreck({ template: 'with_mast', wood }), 'w');
    const names = new Set(t.palette.map((p) => p.name.replace('minecraft:', '')));
    const [primary, secondary] = WOOD_PAIRS[wood];
    for (const n of names) if (n !== 'air' && n !== 'chest') assert.ok(n.startsWith(`${primary}_`) || n.startsWith(`${secondary}_`), n);
    assert.ok(names.has(`${primary}_log`));
    const chests = t.blocks.filter((b) => t.palette[b.state].name === 'minecraft:chest');
    assert.deepEqual(chests.map((b) => b.nbt.LootTable).sort(), Object.values(SHIPWRECK_LOOT).sort());
  }
});

test('placement: ocean wrecks sink into the floor, beached ones sit on the beach; all templates and pairs occur', () => {
  const seen = new Set(); const woods = new Set();
  for (let i = 0; i < 600; i++) {
    const s = generateShipwreck({ seed: 3, chunkX: i, chunkZ: 2 * i, structureId: 'shipwreck', context: ocean });
    seen.add(s.meta.template); woods.add(s.meta.wood.join());
    assert.equal(s.meta.y, 29);
  }
  assert.equal(seen.size, 20);
  assert.equal(woods.size, 8);
  const beached = generateShipwreck({ seed: 3, chunkX: 1, chunkZ: 1, structureId: 'shipwreck_beached', context: { biomeAt: () => 'beach', surfaceY: () => 24 } });
  assert.ok(BEACHED_TEMPLATES.includes(beached.meta.template));
  assert.equal(beached.meta.y, 24);
});

test('realization resolves every block and is deterministic', () => {
  for (let i = 0; i < 20; i++) {
    const s = generateShipwreck({ seed: 9, chunkX: i, chunkZ: i, structureId: 'shipwreck', context: ocean });
    const out = []; const r = realizeShipwreck(s, (x, y, z, id) => { out.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    assert.deepEqual(r.missingBlocks, [], s.meta.template);
    const again = []; realizeShipwreck(s, (x, y, z, id) => { again.push(`${x},${y},${z},${id}`); return true; }, BLOCKS);
    assert.deepEqual(out, again);
  }
});

test('the card notices a ship of three woods', () => {
  const s3 = STRUCTURE_AUDIT_CARDS.shipwreck.facts.find((f) => f.id === 'S3');
  const o = { start: { meta: { wood: ['oak', 'spruce'] } }, writes: [{ name: 'oak_log' }, { name: 'spruce_planks' }, { name: 'birch_planks' }] };
  assert.equal(s3.check(o).ok, false);
});
