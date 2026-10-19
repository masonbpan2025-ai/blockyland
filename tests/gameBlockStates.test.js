import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import * as harvest from '../src/blockHarvestData.js';
import { CanonicalBlockState, CanonicalStructure, CanonicalRegion } from '../src/io/canonical.js';
import { readSpongeSchematic, writeSpongeSchematic } from '../src/io/codecs.js';
import { gameBlockFromState, blockIdToCanonicalState } from '../src/io/gameBlockStates.js';
import { BuildingStudioManager } from '../src/buildingStudio.js';
import { BuildingLibrary } from '../src/buildingLibrary.js';

const S = (text) => CanonicalBlockState.parse(text);
const keyOf = new Map();
for (const [key, id] of Object.entries(BLOCKS)) if (!keyOf.has(id)) keyOf.set(id, key);

describe('Minecraft state -> game block', () => {
  it('folds state into the id where the game has a variant for it', () => {
    assert.equal(gameBlockFromState(S('minecraft:oak_door[facing=east,half=upper,hinge=left,open=false,powered=false]')).id, BLOCKS.OAK_DOOR_TOP);
    assert.equal(gameBlockFromState(S('minecraft:oak_door[facing=east,half=lower,hinge=left,open=true,powered=false]')).id, BLOCKS.OAK_DOOR_OPEN);
    assert.equal(gameBlockFromState(S('minecraft:oak_door[half=upper,open=true]')).id, BLOCKS.OAK_DOOR_TOP_OPEN);
    assert.equal(gameBlockFromState(S('minecraft:oak_trapdoor[open=true]')).id, BLOCKS.OAK_TRAPDOOR_OPEN);
    assert.equal(gameBlockFromState(S('minecraft:wheat[age=3]')).id, BLOCKS.WHEAT_STAGE_3);
    assert.equal(gameBlockFromState(S('minecraft:carrots[age=5]')).id, BLOCKS.CARROTS_STAGE_2, "carrots' 8 ages fall into the game's 4 stages");
    assert.equal(gameBlockFromState(S('minecraft:red_bed[facing=north,part=head]')).id, BLOCKS.RED_BED_HEAD);
    assert.equal(gameBlockFromState(S('minecraft:farmland[moisture=7]')).id, BLOCKS.FARMLAND_MOIST);
    assert.equal(gameBlockFromState(S('minecraft:furnace[facing=north,lit=true]')).id, BLOCKS.LIT_FURNACE);
    assert.equal(gameBlockFromState(S('minecraft:end_portal_frame[eye=true,facing=north]')).id, BLOCKS.END_PORTAL_FRAME_FILLED);
    assert.equal(gameBlockFromState(S('minecraft:snow[layers=1]')).id, BLOCKS.SNOW_LAYER, "Minecraft's snow is the layer; snow_block is the block");
    assert.equal(gameBlockFromState(S('minecraft:snow_block')).id, BLOCKS.SNOW);
  });

  it('turns facing-like properties into the orientation request the world stores', () => {
    assert.deepEqual(gameBlockFromState(S('minecraft:oak_stairs[facing=east,half=top,shape=straight]')).orientation, { facing: 'east', half: 'top' });
    assert.deepEqual(gameBlockFromState(S('minecraft:stone_brick_slab[type=top]')).orientation, { slabType: 'top' });
    assert.equal(gameBlockFromState(S('minecraft:stone_brick_slab[type=bottom]')).orientation, null);
    assert.deepEqual(gameBlockFromState(S('minecraft:chest[facing=west,type=single]')).orientation, { facing: 'west' });
    assert.deepEqual(gameBlockFromState(S('minecraft:ladder[facing=south]')).orientation, { facing: 'south' });
    assert.deepEqual(gameBlockFromState(S('minecraft:vine[east=false,north=true,south=false,up=false,west=true]')).orientation, { vineFaces: { north: true, west: true } });
    assert.deepEqual(gameBlockFromState(S('minecraft:oak_door[facing=east,half=lower,hinge=right,open=false]')).orientation, { facing: 'east', half: 'lower', hinge: 'right' });
    assert.equal(gameBlockFromState(S('minecraft:stone')).orientation, null);
  });
});

describe('game block -> Minecraft state', () => {
  it('writes variant ids back as the state they stand for', () => {
    assert.equal(blockIdToCanonicalState(BLOCKS.OAK_DOOR_TOP_OPEN).toString(), 'minecraft:oak_door[half=upper,open=true]');
    assert.equal(blockIdToCanonicalState(BLOCKS.WHEAT_STAGE_3).toString(), 'minecraft:wheat[age=3]');
    assert.equal(blockIdToCanonicalState(BLOCKS.CARROTS_STAGE_3).toString(), 'minecraft:carrots[age=7]');
    assert.equal(blockIdToCanonicalState(BLOCKS.FARMLAND_MOIST).toString(), 'minecraft:farmland[moisture=7]');
    assert.equal(blockIdToCanonicalState(BLOCKS.RED_BED_HEAD).toString(), 'minecraft:red_bed[part=head]');
    assert.equal(blockIdToCanonicalState(BLOCKS.GOLD_BLOCK).name, 'minecraft:gold_block', 'not the display name "Block of Gold"');
  });

  it('adds the orientation the world stores for the block', () => {
    assert.equal(blockIdToCanonicalState(BLOCKS.OAK_STAIRS, { facing: 'east', isTop: true }).toString(), 'minecraft:oak_stairs[facing=east,half=top]');
    assert.equal(blockIdToCanonicalState(BLOCKS.STONE_BRICK_SLAB, { slabType: 'top' }).toString(), 'minecraft:stone_brick_slab[type=top]');
    assert.equal(blockIdToCanonicalState(BLOCKS.LADDER, { wall: 'north' }).toString(), 'minecraft:ladder[facing=south]', 'a ladder on the north wall faces south');
    assert.equal(blockIdToCanonicalState(BLOCKS.VINE, { walls: ['north', 'up'] }).toString(), 'minecraft:vine[east=false,north=true,south=false,up=true,west=false]');
  });

  it('every game block comes back as itself, except the twins that export as their vanilla block', () => {
    // The two redstone twins, and the older sulfur block, which exports as vanilla sulfur (WorldEdit dropped
    // `sulfur_block` as air: it is no Minecraft name).
    const twins = new Set([BLOCKS.PRESSURE_PLATE, BLOCKS.TARGET_BLOCK, BLOCKS.SULFUR_BLOCK]);
    const failures = [];
    for (const [id, key] of keyOf) {
      if (id === BLOCKS.AIR || twins.has(id)) continue;
      const back = gameBlockFromState(blockIdToCanonicalState(id)).id;
      if (back !== id) failures.push(`${key} -> ${blockIdToCanonicalState(id)} -> ${keyOf.get(back)}`);
    }
    assert.deepEqual(failures, []);
  });

  it('exports Minecraft 1.21.4 block names, apart from blocks newer than it or not in Minecraft', () => {
    const pack = JSON.parse(readFileSync(join(process.cwd(), 'public', 'datapacks', 'vanilla-1.21.4.json'), 'utf8'));
    const known = new Set(Object.keys(pack).map((k) => k.match(/loot_table\/blocks\/(.+)\.json$/)?.[1]).filter(Boolean));
    for (const table of Object.values(harvest)) if (table && typeof table === 'object') for (const k of Object.keys(table)) known.add(k);
    const allowed = new Set(['firefly_bush', 'dried_ghast', 'sulfur']); // 1.21.5+ and later
    const unknown = [];
    for (const [id, key] of keyOf) {
      if (id === BLOCKS.AIR || (BLOCK_DEFS[id]?.internal && !/_OPEN|_TOP/.test(key))) continue;
      const name = blockIdToCanonicalState(id).name.replace('minecraft:', '');
      if (!known.has(name) && !allowed.has(name)) unknown.push(`${key} -> ${name}`);
    }
    assert.deepEqual(unknown, []);
  });
});

describe('Building Studio keeps block states through import and export', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  const STATES = [
    'minecraft:oak_stairs[facing=east,half=top,shape=straight,waterlogged=false]',
    'minecraft:oak_log[axis=x]',
    'minecraft:stone_brick_wall[east=low,north=none,south=none,up=true,waterlogged=false,west=low]',
    'minecraft:oak_door[facing=south,half=lower,hinge=left,open=false,powered=false]',
    'minecraft:oak_door[facing=south,half=upper,hinge=left,open=false,powered=false]',
    'minecraft:ladder[facing=north,waterlogged=false]',
    'minecraft:stone'
  ];

  async function sample() {
    const blocks = STATES.map((text, i) => ({ pos: { x: i, y: text.includes('upper') ? 1 : 0, z: 0 }, state: S(text) }));
    blocks[4].pos = { x: 3, y: 1, z: 0 }; // the door's upper half sits on its lower half
    const region = new CanonicalRegion({ name: 'main', size: { x: 7, y: 2, z: 1 }, blocks });
    return writeSpongeSchematic(new CanonicalStructure({ name: 'states', regions: [region], source: { format: 'test', edition: 'java', dataVersion: 4189 } }));
  }

  function fakeWorld() {
    const voxels = new Map();
    const orientations = new Map();
    return {
      voxels, orientations, structureOrientations: orientations,
      setVoxel(x, y, z, id) { const k = `${x},${y},${z}`; if (id === BLOCKS.AIR) { voxels.delete(k); orientations.delete(k); } else voxels.set(k, id); },
      getVoxel(x, y, z) { return voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR; },
      applyStructureOrientation(request) { orientations.set(`${request.x},${request.y},${request.z}`, request); return true; }
    };
  }

  it('an imported file exports back with every state exactly as it was', async () => {
    const world = fakeWorld();
    const studio = new BuildingStudioManager({ world });
    const [building] = await studio.importSchematicFiles([{ bytes: await sample(), name: 'states.schem' }]);
    studio.loadBuilding(building);
    const { structure } = await readSpongeSchematic((await studio.exportCurrentToSchematic({ version: 3 })).bytes);
    const exported = structure.main.blocks.map((b) => b.state.toString()).sort();
    assert.deepEqual(exported, [...STATES].sort());
    BuildingLibrary.deleteBuilding(building.id);
  });

  it('drawing an imported building tells the world which way each block faces', async () => {
    const world = fakeWorld();
    const studio = new BuildingStudioManager({ world });
    const [building] = await studio.importSchematicFiles([{ bytes: await sample(), name: 'states2.schem' }]);
    studio.loadBuilding(building);
    const stored = [...world.orientations.values()];
    const stair = stored.find((o) => o.id === BLOCKS.OAK_STAIRS);
    assert.equal(stair.facing, 'east');
    assert.equal(stair.half, 'top');
    assert.ok(stored.some((o) => o.id === BLOCKS.LADDER && o.facing === 'north'));
    assert.ok(stored.some((o) => o.id === BLOCKS.OAK_DOOR && o.facing === 'south'));
    assert.ok([...world.voxels.values()].includes(BLOCKS.OAK_DOOR_TOP), "the door's upper half is the game's top-half block");
    BuildingLibrary.deleteBuilding(building.id);
  });

  it('a block built in the game exports with the facing the world stores, and both door halves agree', async () => {
    const world = fakeWorld();
    const studio = new BuildingStudioManager({ world });
    world.setVoxel(0, 5, 0, BLOCKS.OAK_STAIRS);
    world.applyStructureOrientation({ x: 0, y: 5, z: 0, id: BLOCKS.OAK_STAIRS, facing: 'west', isTop: false });
    world.setVoxel(2, 5, 0, BLOCKS.OAK_DOOR);
    world.setVoxel(2, 6, 0, BLOCKS.OAK_DOOR_TOP);
    world.applyStructureOrientation({ x: 2, y: 5, z: 0, id: BLOCKS.OAK_DOOR, facing: 'north', hinge: 'right' });
    studio.adoptCustomBuild({ name: 'hand built', blocks: [{ x: 0, y: 5, z: 0, id: BLOCKS.OAK_STAIRS }, { x: 2, y: 5, z: 0, id: BLOCKS.OAK_DOOR }, { x: 2, y: 6, z: 0, id: BLOCKS.OAK_DOOR_TOP }] });
    const { structure } = await readSpongeSchematic((await studio.exportCurrentToSchematic({ version: 3 })).bytes);
    const states = structure.main.blocks.map((b) => b.state.toString()).sort();
    assert.deepEqual(states, [
      'minecraft:oak_door[facing=north,half=lower,hinge=right,open=false]',
      'minecraft:oak_door[facing=north,half=upper,hinge=right,open=false]',
      'minecraft:oak_stairs[facing=west,half=bottom]'
    ]);
  });
});
