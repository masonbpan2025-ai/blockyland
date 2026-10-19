// Block entities and exact crop ages through Building Studio: what a .schem carries comes back out unchanged.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCKS } from '../src/blocks.js';
import { CanonicalBlockState, CanonicalStructure, CanonicalRegion } from '../src/io/canonical.js';
import { readSpongeSchematic, writeSpongeSchematic } from '../src/io/codecs.js';
import { readNbt, writeNbt, gzip, gunzip, TagType } from '../src/io/nbt.js';
import { encodeNbtJson, decodeNbtJson } from '../src/io/nbtJson.js';
import { gameBlockFromState, blockIdToCanonicalState } from '../src/io/gameBlockStates.js';
import { BuildingStudioManager } from '../src/buildingStudio.js';
import { BuildingLibrary } from '../src/buildingLibrary.js';

const S = (text) => CanonicalBlockState.parse(text);

function fakeWorld() {
  const voxels = new Map();
  const orientations = new Map();
  return {
    voxels, structureOrientations: orientations,
    setVoxel(x, y, z, id) { const k = `${x},${y},${z}`; orientations.delete(k); if (id === BLOCKS.AIR) voxels.delete(k); else voxels.set(k, id); },
    getVoxel(x, y, z) { return voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR; },
    applyStructureOrientation(request) { orientations.set(`${request.x},${request.y},${request.z}`, request); return true; }
  };
}

/** The tag type of every number in a written file, by path, as readNbt reports it. */
async function typesOf(bytes) {
  const typeMap = {};
  readNbt(await gunzip(bytes), { typeMap });
  return typeMap;
}

/**
 * A v3 file shaped like WorldEdit's, with 1.21.4 block entities whose numbers are not ints: a chest (Slot is a
 * byte), a sign (has_glowing_text is a byte) and a banner (pattern list), on a 3 x 1 x 1 row.
 */
async function blockEntitySchem() {
  const root = { Schematic: {
    Version: 3, DataVersion: 4189, Width: 3, Height: 1, Length: 1, Offset: Int32Array.from([0, 0, 0]),
    Blocks: {
      Palette: { 'minecraft:chest[facing=north,type=single,waterlogged=false]': 0, 'minecraft:oak_sign[rotation=0,waterlogged=false]': 1, 'minecraft:red_banner[rotation=8]': 2 },
      Data: Uint8Array.from([0, 1, 2]),
      BlockEntities: [
        { Pos: Int32Array.from([0, 0, 0]), Id: 'minecraft:chest', Data: { Items: [{ Slot: 2, id: 'minecraft:diamond', count: 3 }], LootTableSeed: 123456789012345n } },
        { Pos: Int32Array.from([1, 0, 0]), Id: 'minecraft:sign', Data: { is_waxed: 0, front_text: { has_glowing_text: 1, color: 'black', messages: ['"Welcome"', '""', '""', '""'] } } },
        { Pos: Int32Array.from([2, 0, 0]), Id: 'minecraft:banner', Data: { patterns: [{ color: 'yellow', pattern: 'minecraft:border' }] } }
      ]
    }
  } };
  const B = 'Schematic.Blocks.BlockEntities[].Data.';
  return gzip(writeNbt(root, { types: {
    Version: TagType.INT, DataVersion: TagType.INT, Width: TagType.SHORT, Height: TagType.SHORT, Length: TagType.SHORT,
    [`${B}Items[].Slot`]: TagType.BYTE, [`${B}is_waxed`]: TagType.BYTE, [`${B}front_text.has_glowing_text`]: TagType.BYTE
  } }));
}

describe('NBT tag types survive a read and a write', () => {
  it('readNbt reports every number\'s tag type by path, with list indices as []', async () => {
    const types = await typesOf(await blockEntitySchem());
    assert.equal(types['Schematic.Blocks.BlockEntities[].Data.Items[].Slot'], TagType.BYTE);
    assert.equal(types['Schematic.Blocks.BlockEntities[].Data.Items[].count'], TagType.INT);
    assert.equal(types['Schematic.Blocks.BlockEntities[].Data.LootTableSeed'], TagType.LONG);
    assert.equal(types['Schematic.Width'], TagType.SHORT);
  });

  it('a Sponge round trip keeps a block entity\'s bytes as bytes', async () => {
    const { structure } = await readSpongeSchematic(await blockEntitySchem());
    for (const version of [3, 2]) {
      const types = await typesOf(await writeSpongeSchematic(structure, { version }));
      const base = version === 3 ? 'Schematic.Blocks.BlockEntities[].Data.' : 'BlockEntities[].';
      assert.equal(types[`${base}Items[].Slot`], TagType.BYTE, `v${version}`);
      assert.equal(types[`${base}front_text.has_glowing_text`], TagType.BYTE, `v${version}`);
      assert.equal(types[`${base}Items[].count`], TagType.INT, `v${version}`);
    }
  });

  it('nbtJson stores longs and typed arrays in JSON and gives back exactly what the reader produced', () => {
    const value = { seed: 123456789012345n, pos: Int32Array.from([1, -2, 3]), raw: Uint8Array.from([1, 2]), longs: BigInt64Array.from([5n]), text: 'hi', list: [{ n: 1 }] };
    const back = decodeNbtJson(JSON.parse(JSON.stringify(encodeNbtJson(value))));
    assert.equal(back.seed, 123456789012345n);
    assert.ok(back.pos instanceof Int32Array && back.pos[1] === -2);
    assert.ok(back.raw instanceof Uint8Array);
    assert.ok(back.longs instanceof BigInt64Array && back.longs[0] === 5n);
    assert.deepEqual(back.list, [{ n: 1 }]);
  });
});

describe('Building Studio keeps block entities', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('a chest\'s items, a sign\'s text and a banner\'s pattern export as they were imported', async () => {
    const studio = new BuildingStudioManager({ world: fakeWorld() });
    const [building] = await studio.importSchematicFiles([{ bytes: await blockEntitySchem(), name: 'block_entities.schem' }]);
    studio.loadBuilding(building);
    const bytes = (await studio.exportCurrentToSchematic({ version: 3 })).bytes;
    const { structure } = await readSpongeSchematic(bytes);
    const byId = Object.fromEntries(structure.main.blockEntities.map((be) => [be.id, be.nbt]));
    assert.deepEqual(byId['minecraft:chest'].Items, [{ Slot: 2, id: 'minecraft:diamond', count: 3 }]);
    assert.equal(byId['minecraft:chest'].LootTableSeed, 123456789012345n);
    assert.equal(byId['minecraft:sign'].front_text.messages[0], '"Welcome"');
    assert.deepEqual(byId['minecraft:banner'].patterns, [{ color: 'yellow', pattern: 'minecraft:border' }]);
    const types = await typesOf(bytes);
    assert.equal(types['Schematic.Blocks.BlockEntities[].Data.Items[].Slot'], TagType.BYTE, 'the item slot is still a byte');
    assert.equal(types['Schematic.Blocks.BlockEntities[].Data.front_text.has_glowing_text'], TagType.BYTE);
    BuildingLibrary.deleteBuilding(building.id);
  });

  it('a block that was replaced in the world drops its old block entity', async () => {
    const world = fakeWorld();
    const studio = new BuildingStudioManager({ world });
    const [building] = await studio.importSchematicFiles([{ bytes: await blockEntitySchem(), name: 'replaced.schem' }]);
    studio.loadBuilding(building);
    const chestAt = [...world.voxels.entries()].find(([, id]) => id === BLOCKS.CHEST)[0].split(',').map(Number);
    world.setVoxel(...chestAt, BLOCKS.STONE);
    const { structure } = await readSpongeSchematic((await studio.exportCurrentToSchematic({ version: 3 })).bytes);
    assert.ok(!structure.main.blockEntities.some((be) => be.id === 'minecraft:chest'), 'stone does not inherit the chest\'s items');
    assert.ok(structure.main.blockEntities.some((be) => be.id === 'minecraft:sign'), 'untouched blocks keep theirs');
    BuildingLibrary.deleteBuilding(building.id);
  });
});

describe('carrots and potatoes keep their exact age', () => {
  it('the world remembers the age the game\'s 4 stages cannot show, and only while the stage matches', () => {
    const { id, orientation } = gameBlockFromState(S('minecraft:carrots[age=5]'));
    assert.equal(id, BLOCKS.CARROTS_STAGE_2);
    assert.equal(orientation.plantAge, 5);
    assert.equal(blockIdToCanonicalState(id, { plantAge: 5 }).toString(), 'minecraft:carrots[age=5]');
    assert.equal(blockIdToCanonicalState(id).toString(), 'minecraft:carrots[age=4]', 'without a remembered age, the stage\'s age');
    assert.equal(blockIdToCanonicalState(id, { plantAge: 7 }).toString(), 'minecraft:carrots[age=4]', 'a remembered age from another stage is ignored');
  });

  it('a building placed in a world and captured again exports every age exactly', async () => {
    const blocks = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((age) => [
      { pos: { x: age, y: 0, z: 0 }, state: S(`minecraft:carrots[age=${age}]`) },
      { pos: { x: age, y: 0, z: 1 }, state: S(`minecraft:potatoes[age=${age}]`) }
    ]);
    const bytes = await writeSpongeSchematic(new CanonicalStructure({ name: 'crops', regions: [new CanonicalRegion({ name: 'main', size: { x: 8, y: 1, z: 2 }, blocks })], source: { format: 'test', edition: 'java', dataVersion: 4189 } }));
    const importer = new BuildingStudioManager({ world: fakeWorld() });
    const [building] = await importer.importSchematicFiles([{ bytes, name: 'crops.schem' }]);

    const world = fakeWorld();
    const placed = BuildingLibrary.executeBuildingBuild(building, { x: 0, y: 5, z: 0 }, {}, world);
    const studio = new BuildingStudioManager({ world });
    studio.adoptCustomBuild({ name: 'captured', blocks: placed.map(({ x, y, z, id }) => ({ x, y, z, id })) });
    const { structure } = await readSpongeSchematic((await studio.exportCurrentToSchematic({ version: 3 })).bytes);
    assert.deepEqual(structure.main.blocks.map((b) => b.state.toString()).sort(), blocks.map((b) => b.state.toString()).sort());
    BuildingLibrary.deleteBuilding(building.id);
  });
});
