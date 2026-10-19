// What a schematic's block entities and entities do in the game: chests hold their items, signs carry their text
// and face the right way, a chest the player changes exports as it is now, and mobs/armor stands are kept.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCKS, ITEMS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { CanonicalStructure, CanonicalRegion, CanonicalBlockState } from '../src/io/canonical.js';
import { readSpongeSchematic, readJavaStructure, writeJavaStructure } from '../src/io/codecs.js';
import { readNbt, writeNbt, gzip, gunzip, TagType } from '../src/io/nbt.js';
import { gameStackFromItem, chestSlotsFromItems, itemsFromChestSlots, signTextFromNbt, worldRequestFor } from '../src/io/blockEntityGame.js';
import { encodeNbtJson } from '../src/io/nbtJson.js';
import { BuildingStudioManager } from '../src/buildingStudio.js';
import { BuildingLibrary } from '../src/buildingLibrary.js';

const S = (text) => CanonicalBlockState.parse(text);

describe('Minecraft items -> chest contents', () => {
  it('reads 1.21 items: count, enchantments and damage', () => {
    const diamonds = gameStackFromItem({ id: 'minecraft:diamond', count: 3 });
    assert.equal(diamonds.isBlock, false);
    assert.equal(diamonds.count, 3);
    assert.ok(ITEMS[diamonds.id], 'a real game item');
    const sword = gameStackFromItem({ id: 'minecraft:iron_sword', count: 1, components: { 'minecraft:enchantments': { levels: { 'minecraft:sharpness': 3 } }, 'minecraft:damage': 10 } });
    assert.equal(sword.enchantments[0].id, 'sharpness');
    assert.equal(sword.enchantments[0].level, 3);
    assert.ok(sword.durability > 0, 'damage becomes remaining durability');
    const planks = gameStackFromItem({ id: 'minecraft:oak_planks', count: 64 });
    assert.equal(planks.isBlock, true);
    assert.equal(planks.id, BLOCKS.OAK_PLANKS);
  });

  it('reads the pre-1.20.5 form (Count, tag) and skips items the game does not have', () => {
    const book = gameStackFromItem({ id: 'minecraft:enchanted_book', Count: 1, tag: { StoredEnchantments: [{ id: 'minecraft:mending', lvl: 1 }] } });
    assert.equal(book.enchantments[0].id, 'mending');
    assert.equal(gameStackFromItem({ id: 'minecraft:not_a_real_item', count: 1 }), null);
  });

  it('places items in their slots, and writes slots back as Minecraft items', () => {
    const slots = chestSlotsFromItems([{ Slot: 4, id: 'minecraft:diamond', count: 2 }, { Slot: 26, id: 'minecraft:oak_planks', count: 10 }]);
    assert.equal(slots.length, 27);
    assert.equal(slots[4].count, 2);
    assert.equal(slots[26].id, BLOCKS.OAK_PLANKS);
    assert.deepEqual(itemsFromChestSlots(slots), [
      { Slot: 4, id: 'minecraft:diamond', count: 2 },
      { Slot: 26, id: 'minecraft:oak_planks', count: 10 }
    ]);
  });
});

describe('sign text', () => {
  it('reads 1.20+ front and back text, plain-string components (1.21.5) and the old Text1..4', () => {
    const modern = signTextFromNbt({ front_text: { messages: ['"Welcome"', '{"text":"to the ","extra":[{"text":"castle"}]}', '""', '""'], color: 'red', has_glowing_text: 1 }, back_text: { messages: ['""', '""', '""', '""'] } });
    assert.deepEqual(modern.front, { lines: ['Welcome', 'to the castle', '', ''], color: 'red', glowing: true });
    assert.equal(modern.back, null, 'a blank side has nothing to draw');
    assert.deepEqual(signTextFromNbt({ front_text: { messages: ['Plain', { text: 'Compound' }, '', ''] } }).front.lines.slice(0, 2), ['Plain', 'Compound']);
    assert.deepEqual(signTextFromNbt({ Text1: '{"text":"Old"}', Text2: '""', Text3: '""', Text4: '""', Color: 'blue' }).front, { lines: ['Old', '', '', ''], color: 'blue', glowing: false });
    assert.equal(signTextFromNbt({ front_text: { messages: ['""', '""', '""', '""'] } }), null);
  });
});

describe('placing a block entity in the real world', () => {
  function worldWithChests() {
    const world = new World();
    const chests = new Map();
    world.chestManager = {
      getChest: (x, y, z) => chests.get(`${x},${y},${z}`) ?? null,
      adoptChest: ([x, y, z], facing, items) => { const chest = { x, y, z, facing, items: items.slice(0, 27).map((i) => i ?? null) }; while (chest.items.length < 27) chest.items.push(null); chests.set(`${x},${y},${z}`, chest); return chest; }
    };
    return world;
  }

  it('a chest gets its items, and loading new contents replaces the old', () => {
    const world = worldWithChests();
    const chestEntity = (count) => ({ id: 'minecraft:chest', data: encodeNbtJson({ Items: [{ Slot: 0, id: 'minecraft:diamond', count }] }) });
    world.setVoxel(0, 5, 0, BLOCKS.CHEST);
    world.applyStructureOrientation(worldRequestFor({ x: 0, y: 5, z: 0, id: BLOCKS.CHEST, state: 'minecraft:chest[facing=east,type=single,waterlogged=false]', blockEntity: chestEntity(5) }));
    assert.equal(world.chestManager.getChest(0, 5, 0).items[0].count, 5);
    world.applyStructureOrientation(worldRequestFor({ x: 0, y: 5, z: 0, id: BLOCKS.CHEST, blockEntity: chestEntity(9) }));
    assert.equal(world.chestManager.getChest(0, 5, 0).items[0].count, 9, 'a chest without a facing in its state still gets its items');
  });

  it('a sign remembers which way it faces and its text, and forgets both when broken', () => {
    const world = new World();
    world.setVoxel(2, 5, 0, BLOCKS.OAK_WALL_SIGN);
    world.applyStructureOrientation(worldRequestFor({ x: 2, y: 5, z: 0, id: BLOCKS.OAK_WALL_SIGN, state: 'minecraft:oak_wall_sign[facing=east,waterlogged=false]', blockEntity: { id: 'minecraft:sign', data: encodeNbtJson({ front_text: { messages: ['"Hi"', '""', '""', '""'] } }) } }));
    const stored = world.structureOrientations.get('2,5,0');
    assert.equal(stored.dir, 0, 'east');
    assert.deepEqual(stored.signText.front.lines, ['Hi', '', '', '']);
    assert.ok(world.serializeOrientations().some((o) => o.signText?.front?.lines[0] === 'Hi'), 'saved with the world');
    world.setVoxel(2, 5, 0, BLOCKS.AIR);
    assert.equal(world.structureOrientations.get('2,5,0'), undefined);
  });
});

describe('Building Studio: chests the player changes, and entities', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  function fakeGame() {
    const voxels = new Map();
    const orientations = new Map();
    const chests = new Map();
    const chestManager = {
      getChest: (x, y, z) => chests.get(`${x},${y},${z}`) ?? null,
      adoptChest: ([x, y, z], facing, items) => { const c = { x, y, z, facing, items: Array.from({ length: 27 }, (_, i) => items[i] ?? null) }; chests.set(`${x},${y},${z}`, c); return c; }
    };
    const world = {
      structureOrientations: orientations, chestManager,
      setVoxel(x, y, z, id) { const k = `${x},${y},${z}`; orientations.delete(k); if (id === BLOCKS.AIR) voxels.delete(k); else voxels.set(k, id); },
      getVoxel(x, y, z) { return voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR; },
      applyStructureOrientation(r) {
        orientations.set(`${r.x},${r.y},${r.z}`, r);
        if (Array.isArray(r.items)) { const c = chestManager.getChest(r.x, r.y, r.z); if (c) c.items = r.items.slice(); else chestManager.adoptChest([r.x, r.y, r.z], 0, r.items); }
        return true;
      }
    };
    return { world, chestManager, voxels };
  }

  async function chestAndStandSchem() {
    const root = { Schematic: {
      Version: 3, DataVersion: 4189, Width: 2, Height: 1, Length: 1, Offset: Int32Array.from([0, 0, 0]),
      Blocks: {
        Palette: { 'minecraft:air': 0, 'minecraft:chest[facing=south,type=single,waterlogged=false]': 1 },
        Data: Uint8Array.from([1, 0]),
        BlockEntities: [{ Pos: Int32Array.from([0, 0, 0]), Id: 'minecraft:chest', Data: { Items: [{ Slot: 0, id: 'minecraft:diamond', count: 2 }, { Slot: 1, id: 'minecraft:mystery_mod_item', count: 1 }], CustomName: '"Treasure"' } }]
      },
      Entities: [{ Pos: [1.5, 0, 0.5], Id: 'minecraft:armor_stand', Data: { Invisible: 1, Rotation: [90, 0] } }]
    } };
    return gzip(writeNbt(root, { types: {
      Version: TagType.INT, DataVersion: TagType.INT, Width: TagType.SHORT, Height: TagType.SHORT, Length: TagType.SHORT,
      'Schematic.Blocks.BlockEntities[].Data.Items[].Slot': TagType.BYTE,
      'Schematic.Entities[].Pos[]': TagType.DOUBLE, 'Schematic.Entities[].Data.Invisible': TagType.BYTE, 'Schematic.Entities[].Data.Rotation[]': TagType.FLOAT
    } }));
  }

  async function exported(studio) {
    const bytes = (await studio.exportCurrentToSchematic({ version: 3 })).bytes;
    const typeMap = {};
    readNbt(await gunzip(bytes), { typeMap });
    return { structure: (await readSpongeSchematic(bytes)).structure, typeMap };
  }

  it('an unchanged chest exports its stored data exactly, items the game lacks included', async () => {
    const { world } = fakeGame();
    const studio = new BuildingStudioManager({ world, chestManager: world.chestManager });
    const [building] = await studio.importSchematicFiles([{ bytes: await chestAndStandSchem(), name: 'chest_stand.schem' }]);
    studio.loadBuilding(building);
    const chest = world.chestManager.getChest(...[...studio.placedBlockEntities.keys()][0].split(',').map(Number));
    assert.equal(chest.items[0].count, 2, 'the game chest shows the diamonds');
    const { structure } = await exported(studio);
    const items = structure.main.blockEntities[0].nbt.Items;
    assert.equal(items.length, 2, 'the item this game has no version of is still in the file');
    assert.equal(structure.main.blockEntities[0].nbt.CustomName, '"Treasure"');
    BuildingLibrary.deleteBuilding(building.id);
  });

  it('a chest the player changed exports what it holds now, keeping its name and the byte slot type', async () => {
    const { world } = fakeGame();
    const studio = new BuildingStudioManager({ world, chestManager: world.chestManager });
    const [building] = await studio.importSchematicFiles([{ bytes: await chestAndStandSchem(), name: 'chest_changed.schem' }]);
    studio.loadBuilding(building);
    const chest = world.chestManager.getChest(...[...studio.placedBlockEntities.keys()][0].split(',').map(Number));
    chest.items[0] = { ...chest.items[0], count: 7 };
    chest.items[5] = { id: BLOCKS.OAK_PLANKS, isBlock: true, count: 12 };
    const { structure, typeMap } = await exported(studio);
    const be = structure.main.blockEntities[0];
    assert.deepEqual(be.nbt.Items, [{ Slot: 0, id: 'minecraft:diamond', count: 7 }, { Slot: 5, id: 'minecraft:oak_planks', count: 12 }]);
    assert.equal(be.nbt.CustomName, '"Treasure"');
    assert.equal(typeMap['Schematic.Blocks.BlockEntities[].Data.Items[].Slot'], TagType.BYTE);
    BuildingLibrary.deleteBuilding(building.id);
  });

  it('an armor stand comes back out with its position and its byte and float data', async () => {
    const { world } = fakeGame();
    const studio = new BuildingStudioManager({ world });
    const [building] = await studio.importSchematicFiles([{ bytes: await chestAndStandSchem(), name: 'stand.schem' }]);
    studio.loadBuilding(building);
    const { structure, typeMap } = await exported(studio);
    assert.equal(structure.main.entities.length, 1);
    const stand = structure.main.entities[0];
    assert.equal(stand.nbt.id, 'minecraft:armor_stand');
    assert.deepEqual(stand.pos, { x: 1.5, y: 0, z: 0.5 }, 'beside the chest, as in the file');
    assert.equal(typeMap['Schematic.Entities[].Data.Invisible'], TagType.BYTE);
    assert.equal(typeMap['Schematic.Entities[].Data.Rotation[]'], TagType.FLOAT);
    BuildingLibrary.deleteBuilding(building.id);
  });
});

describe('vanilla .nbt structures', () => {
  it('keep block-entity and entity tag types, and write a whole-number entity position as doubles', async () => {
    const raw = { size: [1, 1, 1], palette: [{ Name: 'minecraft:chest' }], DataVersion: 4189,
      blocks: [{ pos: [0, 0, 0], state: 0, nbt: { id: 'minecraft:chest', Items: [{ Slot: 3, id: 'minecraft:diamond', count: 1 }] } }],
      entities: [{ pos: [0.5, 0, 0.5], blockPos: [0, 0, 0], nbt: { id: 'minecraft:armor_stand', Invisible: 1 } }] };
    const bytes = await gzip(writeNbt(raw, { types: { DataVersion: TagType.INT, 'blocks[].nbt.Items[].Slot': TagType.BYTE, 'entities[].pos[]': TagType.DOUBLE, 'entities[].nbt.Invisible': TagType.BYTE } }));
    const { structure } = await readJavaStructure(bytes);
    structure.main.entities[0].pos = { x: 4, y: 0, z: 2 };
    const typeMap = {};
    readNbt(await gunzip(await writeJavaStructure(structure)), { typeMap });
    assert.equal(typeMap['blocks[].nbt.Items[].Slot'], TagType.BYTE);
    assert.equal(typeMap['entities[].nbt.Invisible'], TagType.BYTE);
    assert.equal(typeMap['entities[].pos[]'], TagType.DOUBLE, 'x = 4 is still a double');
  });
});
