// Ocean monument: the /Structure page's room-maze algorithm, its drawings, the sponge rule, the core's gold, the
// three elder guardians, the 23 pillars and the water fill. Card M1-M6 + W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateMonument, realizeMonument, buildMonument, planMonumentRooms, monumentUnits, ENTRY_UNIT, ROOM_DRAWINGS,
  MONUMENT_SIZE, MONUMENT_HEIGHT, MONUMENT_PILLAR_SPOTS
} from '../src/worldgen/generators/monument.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { LegacyRandom } from '../src/worldgen/random.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLUEPRINTS } from '../src/worldgen/generators/blueprints/ocean_monument.js';
import { BLOCKS } from '../src/blocks.js';

const deep = { biomeAt: () => 'deep_ocean', surfaceY: () => 8 };

test('registered in the deep oceans; every room kind has its drawings', () => {
  assert.ok(generatorCoverage().implemented.includes('monument'));
  for (const [kind, names] of Object.entries(ROOM_DRAWINGS)) for (const n of names) assert.ok(BLUEPRINTS[n], `${kind}: ${n}`);
  for (const n of ['core', 'penthouse', 'wings', 'wings_example']) assert.ok(BLUEPRINTS[n], n);
  assert.equal(monumentUnits().size, 46, 'two layers of 20 and a layer of 6');
});

test('the maze: all 46 units used once, the core at the back, the entry at the front, every unit reaching the entry', () => {
  const kinds = {};
  for (let s = 1; s <= 60; s++) {
    const plan = planMonumentRooms(new LegacyRandom(BigInt(s) * 104729n));
    const all = plan.rooms.flatMap((r) => r.units);
    assert.equal(all.length, 46); assert.equal(new Set(all).size, 46);
    const core = plan.rooms.find((r) => r.kind === 'core');
    assert.equal(core.units.length, 8);
    for (const k of core.units) assert.ok(Number(k.split(',')[2]) >= 2, 'the core is at the back');
    assert.deepEqual(plan.rooms.find((r) => r.kind === 'entry').units, [ENTRY_UNIT]);
    // Every non-core unit reaches the entry through open walls.
    const units = plan.units;
    const open = (a, b) => !plan.closed.includes(a < b ? `${a}|${b}` : `${b}|${a}`);
    const coreSet = new Set(core.units);
    const seen = new Set([ENTRY_UNIT]); const queue = [ENTRY_UNIT];
    while (queue.length) {
      const k = queue.shift(); const [x, y, z] = k.split(',').map(Number);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const n = `${x + dx},${y + dy},${z + dz}`;
        if (units.has(n) && !coreSet.has(n) && !seen.has(n) && open(k, n)) { seen.add(n); queue.push(n); }
      }
    }
    assert.equal(seen.size, 46 - 8, `seed ${s}: every unit reaches the entry`);
    // A sponge room only where every wall but the floor is shut.
    for (const r of plan.rooms.filter((room) => room.kind === 'sponge')) for (const d of ['up', 'left', 'right', 'front', 'back']) assert.equal(plan.isOpen(r.units[0], d), false);
    for (const r of plan.rooms) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  }
  for (const k of ['dz', 'dx', 'dy', 'plus', 'four_pillars', 'dark_walls', 'sponge']) assert.ok(kinds[k] > 0, `${k} occurs`);
});

test('the built monument: 58 x 58, 22 tall, 8 gold, sponges by column, 3 elder guardians, water in every gap', () => {
  const t = new StructureTemplate(buildMonument({ seed: 3 }), 'm');
  assert.deepEqual(t.size, [MONUMENT_SIZE, MONUMENT_HEIGHT + 1, MONUMENT_SIZE]);
  assert.equal(t.blocks.length, MONUMENT_SIZE * MONUMENT_SIZE * (MONUMENT_HEIGHT + 1), 'every block of the box is placed');
  const of = (name) => t.blocks.filter((b) => t.palette[b.state].name === `minecraft:${name}`);
  assert.equal(of('gold_block').length, 8);
  const columns = new Map();
  for (const b of of('wet_sponge')) columns.set(`${b.pos[0]},${b.pos[2]}`, (columns.get(`${b.pos[0]},${b.pos[2]}`) ?? 0) + 1);
  for (const n of columns.values()) assert.ok(n <= 2);
  assert.equal(t.entities.filter((e) => e.nbt.type === 'elder_guardian').length, 3);
  assert.ok(of('water').length > 30000);
});

test('the sponge rule: about a third of columns empty, half with one, a sixth with two', () => {
  const counts = [0, 0, 0];
  for (let s = 1; s <= 120; s++) {
    const t = new StructureTemplate(buildMonument({ seed: s }), 'm');
    const columns = new Map();
    for (const b of t.blocks) if (t.palette[b.state].name === 'minecraft:wet_sponge') columns.set(`${b.pos[0]},${b.pos[2]}`, (columns.get(`${b.pos[0]},${b.pos[2]}`) ?? 0) + 1);
    const rooms = planMonumentRooms(new LegacyRandom(BigInt(s) * 6364136223846793005n + 1442695040888963407n)).rooms.filter((r) => r.kind === 'sponge').length;
    const total = rooms * 36;
    counts[1] += [...columns.values()].filter((n) => n === 1).length;
    counts[2] += [...columns.values()].filter((n) => n === 2).length;
    counts[0] += total - columns.size;
  }
  const all = counts[0] + counts[1] + counts[2];
  assert.ok(all > 300, `${all} sponge columns sampled`);
  assert.ok(Math.abs(counts[0] / all - 1 / 3) < 0.06 && Math.abs(counts[1] / all - 1 / 2) < 0.06 && Math.abs(counts[2] / all - 1 / 6) < 0.05, counts.join('/'));
});

test('pillars reach the floor; realization resolves every block and is deterministic', () => {
  assert.equal(MONUMENT_PILLAR_SPOTS.length, 23);
  const shallow = { biomeAt: () => 'deep_ocean', surfaceY: () => 0, seaLevel: 40 };
  const start = generateMonument({ seed: 4, chunkX: 2, chunkZ: 2, structureId: 'monument', context: shallow });
  const depths = start.pieces[0].meta.params.pillarDepths;
  assert.ok(depths.every((d) => d === depths[0] && d > 0), `pillars ${depths}`);
  const s = generateMonument({ seed: 4, chunkX: 2, chunkZ: 2, structureId: 'monument', context: deep });
  const a = []; const r = realizeMonument(s, (x, y, z, id) => { a.push(id); return true; }, BLOCKS);
  assert.deepEqual(r.missingBlocks, []);
  const b = []; realizeMonument(s, (x, y, z, id) => { b.push(id); return true; }, BLOCKS);
  assert.deepEqual(a, b);
});
