// The village's tall cobblestone tower (plains_temple_4, the cleric's temple), with its brewing stand, and the mossy
// cobblestone vanilla mixes into plains and taiga buildings: each piece's template pool names a
// `mossify_10/20/70_percent` processor (data/minecraft/worldgen/template_pool/village/*). The Structure Inspector can
// now find the nearest village that has a given building.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS } from '../src/blocks.js';
import { VILLAGE_MOSSIFY, villagePieceProcessors } from '../src/worldgen/generators/village.js';
import { createStructureInspectorSession, villageBuildings } from '../src/structureInspectorSession.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('each piece mossifies as its vanilla pool says', () => {
  assert.equal(VILLAGE_MOSSIFY.plains_temple_4, 0.1, 'the temple tower: mossify_10_percent');
  assert.equal(VILLAGE_MOSSIFY.plains_temple_3, 0.1);
  assert.equal(VILLAGE_MOSSIFY.plains_meeting_point_1, 0.2);
  assert.equal(VILLAGE_MOSSIFY.plains_meeting_point_3, 0.7);
  assert.equal(VILLAGE_MOSSIFY.taiga_temple_1, 0.1);
  assert.equal(VILLAGE_MOSSIFY.desert_temple_1, undefined, 'sandstone villages have none');
  assert.equal(VILLAGE_MOSSIFY.plains_shepherds_house_1, undefined, 'nor does the shepherd\'s house');
  const [, rule] = villagePieceProcessors('plains_temple_4').processors;
  assert.deepEqual(rule.rules[0].input_predicate, { predicate_type: 'minecraft:random_block_match', block: 'minecraft:cobblestone', probability: 0.1 });
  assert.equal(rule.rules[0].output_state, 'minecraft:mossy_cobblestone');
  assert.equal(villagePieceProcessors('desert_temple_1').processors.length, 1, 'only the jigsaw replacement');
  assert.match(read('src/worldgen/generators/village.js'), /processors: villagePieceProcessors\(name\),/);
});

test('the Structure Inspector finds a village with the temple tower: cobblestone and mossy cobblestone, a brewing stand inside', () => {
  assert.ok(villageBuildings('village_plains').includes('plains_temple_4'));
  assert.deepEqual(villageBuildings('igloo'), [], 'only villages have buildings to choose');
  const session = createStructureInspectorSession({ structureId: 'village_plains', seed: 4242 });
  session.setPiece('plains_temple_4');
  const found = session.planNearest({ maxRadiusChunks: 512 });
  assert.ok(found, 'a village with the tower');
  assert.ok(found.start.pieces.some((p) => p.meta?.element === 'plains_temple_4'));
  session.realize();
  const tower = found.start.pieces.find((p) => p.meta?.element === 'plains_temple_4').box;
  let cobble = 0, mossy = 0, brewing = 0, top = -Infinity;
  for (const [key, id] of session.world.blocks) {
    const [x, y, z] = key.split(',').map(Number);
    if (x < tower.minX || x > tower.maxX || z < tower.minZ || z > tower.maxZ || y < tower.minY || y > tower.maxY) continue;
    if (id === BLOCKS.COBBLESTONE) cobble++;
    if (id === BLOCKS.MOSSY_COBBLESTONE) mossy++;
    if (id === BLOCKS.BREWING_STAND) brewing++;
    if (id !== BLOCKS.AIR) top = Math.max(top, y);
  }
  assert.equal(brewing, 1, 'one brewing stand');
  assert.ok(mossy > 0 && cobble > 100, `${cobble} cobblestone and ${mossy} mossy`);
  const share = mossy / (mossy + cobble);
  assert.ok(share > 0.04 && share < 0.2, `about a tenth mossy (${(share * 100).toFixed(1)}%)`);
  assert.ok(top - tower.minY >= 11, `tall: ${top - tower.minY + 1} blocks`);
  session.setPiece(null);
  assert.ok(session.planNearest({ maxRadiusChunks: 64 }), 'any village again');
});

test('the inspector page offers the buildings of a village, and a link can name one', () => {
  const html = read('structure-inspector.html');
  assert.match(html, /<select id="village-building"/);
  const page = read('src/structureInspector.js');
  assert.match(page, /\$\('village-building'\)\.onchange = async/);
  assert.match(page, /if \(bootParams\.get\('building'\)\) session\.setPiece\(bootParams\.get\('building'\)\);/);
  assert.match(read('src/worldgen/placement.js'), /if \(accept && !accept\(plan\.start\)\) continue;/);
});

test('the textured view and walk-through build the village that has the chosen building, and start at it', async () => {
  const { buildStructureWorld } = await import('../src/structureInspectorWorld.js');
  const built = await buildStructureWorld({ structureId: 'village_plains', seed: 4242, piece: 'plains_temple_4' });
  assert.equal(built.focus.piece, 'plains_temple_4');
  assert.deepEqual(built.focus.workstations.map((w) => w.name), ['Brewing Stand'], 'its brewing stand, found');
  const [minX, , minZ, maxX, , maxZ] = built.focus.box;
  const { x, z } = built.arrival;
  const gap = Math.max(minX - x, x - maxX - 1, minZ - z, z - maxZ - 1);
  assert.ok(gap > 0 && gap < 6, `the walk-through starts just outside the tower (${gap.toFixed(1)} blocks)`);
  const page = read('src/structureInspector.js');
  assert.match(page, /const built = await worldView\.show\(\{ structureId, seed: session\.state\.seed, piece \}\);/);
  assert.match(page, /\$\{built\.focus\.piece\} at /, 'the status says where it is and where its job site is');
});
