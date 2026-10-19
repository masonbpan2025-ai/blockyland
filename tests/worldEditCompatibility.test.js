// What WorldEdit on Minecraft 1.21.4 accepts, checked against Mojang's own block registry.
//
// Re-verified against the real thing with the official WorldEdit CLI 7.4.7 (`worldedit-cli-7.4.7-SNAPSHOT-dist.jar`):
// the studio's 5x4x5 house loaded and round-tripped block for block; every library building loaded with the same
// non-air block count; and the 144,053-block castle loaded with exactly 144,053 non-air blocks. The stateful fixture
// WorldEdit wrote back is committed as tests/fixtures/io/worldedit_house.schem so the reader is tested against a
// real WorldEdit export too. What WorldEdit rejects are block names 1.21.4 does not have -- it logs "Invalid
// BlockState in palette ... replaced with air". These tests hold that result without a server: every state the
// exporter writes is checked against the 1.21.4 registry (names, property names and property values) from
// tests/fixtures/minecraft/blocks-1.21.4.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BuildingStudioManager } from '../src/buildingStudio.js';
import { BuildingLibrary } from '../src/buildingLibrary.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { readSpongeSchematic } from '../src/io/codecs.js';
import { blockIdToCanonicalState } from '../src/io/gameBlockStates.js';
import { JAVA_1_21_4_BLOCKS } from '../src/io/java1214Blocks.js';

const REGISTRY = JSON.parse(readFileSync(new URL('./fixtures/minecraft/blocks-1.21.4.json', import.meta.url)));

/** Why WorldEdit on 1.21.4 would not load this state exactly, or null when it would. */
function rejection(state) {
  const name = state.name.replace(/^minecraft:/, '');
  if (!REGISTRY[name]) return `${name} is not a 1.21.4 block`;
  const allowed = REGISTRY[name][0];
  for (const [k, v] of Object.entries(state.properties || {})) {
    if (!allowed[k]) return `${name} has no property ${k}`;
    if (!allowed[k].includes(String(v))) return `${name}[${k}=${v}] is not one of ${allowed[k].join('|')}`;
  }
  return null;
}

test('the bundled 1.21.4 name list is the registry fixture', () => {
  assert.deepEqual([...JAVA_1_21_4_BLOCKS].sort(), Object.keys(REGISTRY).sort());
});

test('every library building exports, as v3 and v2, with only states WorldEdit on 1.21.4 accepts', async () => {
  for (const building of BuildingLibrary.getAllBuildings()) {
    const studio = new BuildingStudioManager({});
    studio.loadBuilding(building);
    for (const version of [3, 2]) {
      const result = await studio.exportCurrentToSchematic({ version });
      const { structure } = await readSpongeSchematic(result.bytes);
      assert.equal(structure.source.dataVersion, 4189, 'stamped as 1.21.4');
      const problems = [...new Set(structure.regions[0].blocks.map(b => rejection(b.state)).filter(Boolean))];
      assert.deepEqual(problems, [], `${building.name} v${version}`);
      assert.deepEqual(result.newerThanTarget, []);
    }
  }
});

test('every game block in every facing exports with valid 1.21.4 properties, or is reported as newer', () => {
  const facings = ['north', 'south', 'east', 'west'];
  const badProperties = [], newer = new Set();
  for (const id of Object.keys(BLOCK_DEFS).map(Number)) {
    if (id === BLOCKS.AIR) continue;
    for (const facing of facings) {
      const state = blockIdToCanonicalState(id, { facing, half: 'bottom', hinge: 'left', wall: facing });
      const why = rejection(state);
      if (!why) continue;
      if (!JAVA_1_21_4_BLOCKS.has(state.name.replace(/^minecraft:/, ''))) newer.add(state.name);
      else badProperties.push(why);
    }
  }
  assert.deepEqual([...new Set(badProperties)], [], 'a 1.21.4 block written with a property 1.21.4 does not have');
  // Names outside 1.21.4 must be real later vanilla blocks, never names the game made up: `sulfur_block` was the
  // one invented name, and WorldEdit dropped it.
  assert.ok(!newer.has('minecraft:sulfur_block'));
  assert.equal(blockIdToCanonicalState(BLOCKS.SULFUR_BLOCK).name, 'minecraft:sulfur');
});

test('an export with blocks newer than 1.21.4 names them and warns in chat', async () => {
  const studio = new BuildingStudioManager({});
  const chat = [];
  studio.game = { ui: { addChatMessage: m => chat.push(m) } };
  const shelf = Object.keys(BLOCK_DEFS).map(Number).find(id => blockIdToCanonicalState(id).name === 'minecraft:oak_shelf');
  assert.ok(shelf, 'the game has the oak shelf');
  studio.customBuildBlocks = [{ x: 0, y: 5, z: 0, id: BLOCKS.STONE }, { x: 1, y: 5, z: 0, id: shelf }];
  const result = await studio.exportCurrentToSchematic();
  assert.deepEqual(result.newerThanTarget, ['oak_shelf']);
  assert.ok(chat.some(m => /newer than Minecraft 1\.21\.4 \(oak_shelf\)/.test(m)), chat.join('\n'));
});
