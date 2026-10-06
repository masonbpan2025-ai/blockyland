// Tests for the template subsystem: block-state transformation, NBT reading, and template placement.
//
// The NBT reader is checked against a HAND-BUILT byte sequence as well as against its own writer, because
// a reader tested only by round-tripping its writer can be wrong in the same direction as the writer and
// still pass.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseBlockState, formatBlockState, rotateBlockState, normaliseName, bareName
} from '../src/worldgen/blockState.js';
import { readNbt, writeNbt, readNbtAuto, isGzipped, TagType, inferType } from '../src/worldgen/nbt.js';
import { StructureTemplate, StructureTemplateManager } from '../src/worldgen/template.js';
import { Mirror, Rotation } from '../src/worldgen/geometry.js';

// ---------------------------------------------------------------------------------------------
// Block states
// ---------------------------------------------------------------------------------------------

test('state strings parse and format back canonically', () => {
  const state = parseBlockState('minecraft:oak_stairs[waterlogged=false,facing=east,half=bottom]');
  assert.equal(state.name, 'minecraft:oak_stairs');
  // Vanilla writes properties in alphabetical key order; formatting must match so a load/save round-trip
  // produces identical bytes.
  assert.deepEqual(Object.keys(state.properties), ['facing', 'half', 'waterlogged']);
  assert.equal(formatBlockState(state), 'minecraft:oak_stairs[facing=east,half=bottom,waterlogged=false]');
  assert.equal(normaliseName('oak_stairs'), 'minecraft:oak_stairs');
  assert.equal(bareName('minecraft:oak_stairs'), 'oak_stairs');
  assert.deepEqual(parseBlockState('stone'), { name: 'minecraft:stone', properties: {} });
  assert.throws(() => parseBlockState('stone[facing=east'), /unterminated/);
  assert.throws(() => parseBlockState(''), /invalid block state/);
});

test('facing rotates clockwise and mirrors across the right axis', () => {
  const rotate = (value, quarters = 0, mirror = Mirror.NONE) =>
    rotateBlockState(parseBlockState(`oak_stairs[facing=${value}]`), quarters, mirror).state.properties.facing;
  // Compass order north -> east -> south -> west, so a clockwise quarter turn walks that list forwards.
  assert.equal(rotate('north', Rotation.CLOCKWISE_90), 'east');
  assert.equal(rotate('east', Rotation.CLOCKWISE_90), 'south');
  assert.equal(rotate('north', Rotation.CLOCKWISE_180), 'south');
  assert.equal(rotate('north', Rotation.COUNTERCLOCKWISE_90), 'west');
  assert.equal(rotate('east', 0, Mirror.LEFT_RIGHT), 'west');
  assert.equal(rotate('north', 0, Mirror.FRONT_BACK), 'south');
  // Mirror then rotate, which is vanilla's order: mirroring east gives west, then a quarter turn gives
  // north -- not the same as rotating first (east -> south).
  assert.equal(rotate('east', Rotation.CLOCKWISE_90, Mirror.LEFT_RIGHT), 'north');
  assert.equal(rotate('east', Rotation.CLOCKWISE_90), 'south');
  // Vertical facing is unaffected by a yaw.
  assert.equal(rotateBlockState(parseBlockState('oak_stairs[facing=up]'), 1).state.properties.facing, 'up');
});

test('axis, rotation, rail shape and jigsaw orientation transform exactly', () => {
  const axis = (value, quarters) =>
    rotateBlockState(parseBlockState(`oak_log[axis=${value}]`), quarters).state.properties.axis;
  assert.equal(axis('x', Rotation.CLOCKWISE_90), 'z');
  assert.equal(axis('z', Rotation.CLOCKWISE_90), 'x');
  assert.equal(axis('x', Rotation.CLOCKWISE_180), 'x');
  assert.equal(axis('y', Rotation.CLOCKWISE_90), 'y');

  // Signs and banners store 0..15 where 4 units is a quarter turn clockwise.
  const sign = (value, quarters, mirror = Mirror.NONE) =>
    rotateBlockState(parseBlockState(`oak_sign[rotation=${value}]`), quarters, mirror).state.properties.rotation;
  assert.equal(sign('0', Rotation.CLOCKWISE_90), '4');
  assert.equal(sign('12', Rotation.CLOCKWISE_90), '0');
  assert.equal(sign('0', Rotation.CLOCKWISE_180), '8');
  assert.equal(sign('0', 0, Mirror.FRONT_BACK), '8', 'a mirror inverts a yaw');

  const rail = (value, quarters) =>
    rotateBlockState(parseBlockState(`rail[shape=${value}]`), quarters).state.properties.shape;
  assert.equal(rail('north_south', Rotation.CLOCKWISE_90), 'east_west');
  assert.equal(rail('ascending_north', Rotation.CLOCKWISE_90), 'ascending_east');
  assert.equal(rail('ascending_west', Rotation.CLOCKWISE_180), 'ascending_east');

  const orientation = (value, quarters) =>
    rotateBlockState(parseBlockState(`jigsaw[orientation=${value}]`), quarters).state.properties.orientation;
  assert.equal(orientation('up_north', Rotation.CLOCKWISE_90), 'up_east');
  assert.equal(orientation('down_west', Rotation.CLOCKWISE_180), 'down_east');
  // A jigsaw connector that points up or down keeps its vertical component.
  assert.equal(orientation('up_north', 0), 'up_north');
});

test('boolean properties named after a direction move with the rotation', () => {
  // Fences, walls, redstone connections and vines store their connections as north/south/east/west
  // booleans, so the KEY has to move, not the value. Under a clockwise quarter turn north becomes east,
  // east becomes south, and south becomes west.
  const fence = rotateBlockState(parseBlockState('oak_fence[north=true,south=false,east=true,waterlogged=false]'), Rotation.CLOCKWISE_90);
  assert.deepEqual(fence.state.properties,
    { east: 'true', south: 'true', waterlogged: 'false', west: 'false' });
  // A 180 turn swaps opposite pairs.
  const flipped = rotateBlockState(parseBlockState('oak_fence[north=true,west=true]'), Rotation.CLOCKWISE_180);
  assert.deepEqual(flipped.state.properties, { south: 'true', east: 'true' });
});

test('properties that cannot be transformed are reported, not guessed', () => {
  // `hinge` and the stair `shape` table are exactly the cases where a wrong guess produces a plausible
  // but incorrect structure. They must surface instead.
  const result = rotateBlockState(parseBlockState('oak_door[facing=north,hinge=left,open=false,powered=false]'), Rotation.CLOCKWISE_90);
  assert.equal(result.state.properties.facing, 'east');
  assert.ok(result.unhandled.includes('hinge'), `expected hinge to be reported, got ${result.unhandled}`);

  const stair = rotateBlockState(parseBlockState('oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]'), Rotation.CLOCKWISE_90);
  assert.equal(stair.state.properties.facing, 'south', 'east turns to south, which is clockwise');
  assert.ok(stair.unhandled.includes('shape'), 'the stair shape table is not implemented and must be reported');
  // A transform that does nothing reports nothing, so an unrotated template stays silent.
  assert.deepEqual(rotateBlockState(parseBlockState('oak_door[hinge=left]'), 0).unhandled, []);
});

// ---------------------------------------------------------------------------------------------
// NBT
// ---------------------------------------------------------------------------------------------

test('the reader parses a hand-built byte sequence', () => {
  // Built byte by byte rather than with writeNbt, so this checks the reader against the spec instead of
  // against its own writer. Root compound, one int, one string, one list of two ints.
  const bytes = new Uint8Array([
    0x0a, 0x00, 0x00,                    // TAG_Compound, name ""
    0x03, 0x00, 0x01, 0x61, 0x00, 0x00, 0x00, 0x01,  // TAG_Int "a" = 1
    0x08, 0x00, 0x01, 0x62, 0x00, 0x02, 0x68, 0x69,  // TAG_String "b" = "hi"
    0x09, 0x00, 0x01, 0x63, 0x03, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, // TAG_List "c" of Int [1,2]
    0x00                                 // TAG_End
  ]);
  const parsed = readNbt(bytes);
  assert.equal(parsed.type, TagType.COMPOUND);
  assert.deepEqual(parsed.value, { a: 1, b: 'hi', c: [1, 2] });
});

test('longs stay exact and arrays keep their type', () => {
  const value = {
    seedLong: 9007199254740993n, // 2^53 + 1: not representable as a double
    bytes: new Uint8Array([1, 2, 3]),
    ints: new Int32Array([-1, 2, 3]),
    longs: new BigInt64Array([1n, 2n])
  };
  const parsed = readNbt(writeNbt({ name: 'root', value }));
  assert.equal(parsed.value.seedLong, 9007199254740993n, 'a long must not be truncated to a double');
  assert.deepEqual([...parsed.value.bytes], [1, 2, 3]);
  assert.deepEqual([...parsed.value.ints], [-1, 2, 3]);
  assert.deepEqual([...parsed.value.longs], [1n, 2n]);
});

test('a round trip preserves a nested structure-template-shaped compound', () => {
  const template = {
    DataVersion: 4189,
    size: [3, 4, 5],
    palette: [
      { Name: 'minecraft:air' },
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom' } }
    ],
    blocks: [
      { pos: [0, 0, 0], state: 1, nbt: { id: 'minecraft:chest', LootTable: 'minecraft:chests/simple' } },
      { pos: [2, 3, 4], state: 0 }
    ],
    entities: [{ pos: [1.5, 1, 1.5], blockPos: [1, 1, 1], nbt: { id: 'minecraft:armor_stand' } }]
  };
  const parsed = readNbt(writeNbt({ name: '', value: template }));
  assert.deepEqual(parsed.value, template);
});

test('trailing bytes are an error rather than silently ignored', () => {
  const bytes = writeNbt({ name: '', value: { a: 1 } });
  const extended = new Uint8Array([...bytes, 0x00]);
  assert.throws(() => readNbt(extended), /ended at byte/);
});

test('gzipped templates inflate transparently', async () => {
  const payload = writeNbt({ name: '', value: { size: [1, 1, 1] } });
  assert.equal(isGzipped(payload), false);
  const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
  const gzipped = new Uint8Array(await new Response(stream).arrayBuffer());
  assert.equal(isGzipped(gzipped), true, 'the gzip magic must be detected');
  const parsed = await readNbtAuto(gzipped);
  assert.deepEqual(parsed.value, { size: [1, 1, 1] });
  assert.deepEqual(await readNbtAuto(payload), parsed, 'uncompressed input takes the same path');
});

test('tag inference covers the values a template carries', () => {
  assert.equal(inferType('x'), TagType.STRING);
  assert.equal(inferType(1), TagType.INT);
  assert.equal(inferType(1n), TagType.LONG);
  assert.equal(inferType(1.5), TagType.DOUBLE);
  assert.equal(inferType([1, 2]), TagType.LIST);
  assert.equal(inferType(new Uint8Array([1])), TagType.BYTE_ARRAY);
  assert.equal(inferType({ a: 1 }), TagType.COMPOUND);
});

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

/** A three-block clean-room template: a stair facing east, a jigsaw marker, and a data marker. */
function fixtureTemplate() {
  return StructureTemplate.fromJson({
    size: [3, 2, 5],
    palette: [
      { Name: 'minecraft:air' },
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom', shape: 'straight', waterlogged: 'false' } },
      { Name: 'minecraft:jigsaw', Properties: { orientation: 'up_north' } },
      { Name: 'minecraft:structure_block', Properties: { mode: 'data' } }
    ],
    blocks: [
      { pos: [0, 0, 0], state: 1, nbt: { id: 'minecraft:oak_stairs' } },
      { pos: [2, 0, 4], state: 2, nbt: { name: 'minecraft:bottom', target: 'minecraft:empty', pool: 'minecraft:empty', joint: 'rollable', final_state: 'minecraft:air' } },
      { pos: [1, 1, 1], state: 3, nbt: { mode: 'DATA', metadata: 'minecraft:igloo/bottom' } }
    ],
    entities: [{ pos: [0.5, 1, 0.5], blockPos: [0, 1, 0], nbt: { id: 'minecraft:villager' } }],
    DataVersion: 4189
  }, 'fixture');
}

test('a template keeps its size, blocks and palette and describes itself', () => {
  const template = fixtureTemplate();
  assert.deepEqual(template.size, [3, 2, 5]);
  assert.equal(template.blockCount, 3);
  assert.equal(template.paletteState(1), 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]');
  assert.throws(() => template.paletteState(99), /out of range/);
  const description = template.describe();
  assert.equal(description.jigsaws, 1);
  assert.equal(description.dataMarkers, 1);
  assert.equal(description.entities, 1);
  assert.equal(description.dataVersion, 4189);
  assert.deepEqual(description.blockTypes.map((entry) => entry.name).sort(), ['jigsaw', 'oak_stairs', 'structure_block']);
});

test('placement swaps the extents for quarter turns and transforms the states', () => {
  const template = fixtureTemplate();
  const origin = { x: 100, y: 64, z: 200 };

  // Rotation 0: the box is the template's own size.
  assert.deepEqual(template.boundingBox(origin, 0).toArray(), [100, 64, 200, 102, 65, 204]);
  // A quarter turn swaps width and depth.
  assert.deepEqual(template.boundingBox(origin, 1).toArray(), [100, 64, 200, 104, 65, 202]);
  assert.deepEqual(template.transformedSize(1), [5, 2, 3]);
  assert.deepEqual(template.transformedSize(2), [3, 2, 5]);

  const placed = [...template.place(origin, 1)];
  const stair = placed.find((block) => block.blockName === 'minecraft:oak_stairs');
  // facing=east under a clockwise quarter turn becomes south.
  assert.equal(stair.state, 'minecraft:oak_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]');
  // The stair was at local (0,0,0); CW90 of a 3x5 grid puts it at (4, 0).
  assert.deepEqual([stair.x, stair.y, stair.z], [104, 64, 200]);
  // The reported property list is aggregated on the template, so a caller can surface "3 shapes were not
  // rotated" instead of shipping silently wrong stairs.
  assert.ok(template.unhandledProperties.has('shape'));
});

test('corner positions transform consistently, and 180 and mirror are involutions', () => {
  const template = fixtureTemplate(); // size [3, 2, 5]
  // Clockwise: the source top-left goes to the result top-right of a 5x3 grid.
  assert.deepEqual(template.transformPos(0, 0, 0, 1), { x: 4, y: 0, z: 0 });
  // ...and the source bottom-right goes to the result bottom-left.
  assert.deepEqual(template.transformPos(2, 0, 4, 1), { x: 0, y: 0, z: 2 });
  // 180: opposite corner.
  assert.deepEqual(template.transformPos(0, 0, 0, 2), { x: 2, y: 0, z: 4 });
  // Mirroring left-right flips X only.
  assert.deepEqual(template.transformPos(0, 1, 3, 0, Mirror.LEFT_RIGHT), { x: 2, y: 1, z: 3 });
  // Rotation 0 and NONE are the identity on every corner, and 180 applied twice is the identity.
  const twice = (x, y, z) => {
    const once = template.transformPos(x, y, z, 2);
    return template.transformPos(once.x, once.y, once.z, 2);
  };
  for (const [x, y, z] of [[0, 0, 0], [2, 1, 4], [1, 0, 2]]) {
    assert.deepEqual(template.transformPos(x, y, z, 0), { x, y, z });
    assert.deepEqual(twice(x, y, z), { x, y, z }, '180 twice must return the original position');
    assert.deepEqual(
      template.transformPos(...Object.values(template.transformPos(x, y, z, 0)), 0),
      { x, y, z }
    );
  }
});

test('jigsaw blocks are extracted with their connector data and orientation', () => {
  const template = fixtureTemplate();
  const jigsaws = template.jigsaws();
  assert.equal(jigsaws.length, 1);
  assert.equal(jigsaws[0].name, 'minecraft:bottom');
  assert.equal(jigsaws[0].pool, 'minecraft:empty');
  assert.equal(jigsaws[0].joint, 'rollable');
  assert.equal(jigsaws[0].finalState, 'minecraft:air');
  assert.equal(jigsaws[0].orientation, 'up_north');
  // The connector's orientation must follow the rotation, or a connection will point the wrong way.
  const rotated = template.jigsaws(1);
  assert.equal(rotated[0].orientation, 'up_east');
  // Its position moves with the template: local (2,0,4) under CW90 -> (0, 0, 2).
  assert.deepEqual([rotated[0].local.x, rotated[0].local.y, rotated[0].local.z], [0, 0, 2]);
});

test('data markers and entities are extracted, and non-data structure blocks are ignored', () => {
  const template = fixtureTemplate();
  const markers = template.dataMarkers();
  assert.equal(markers.length, 1);
  assert.equal(markers[0].metadata, 'minecraft:igloo/bottom');
  // A structure block in SAVE mode is not a data marker.
  const saveMode = StructureTemplate.fromJson({
    size: [1, 1, 1],
    palette: [{ Name: 'minecraft:structure_block', Properties: { mode: 'save' } }],
    blocks: [{ pos: [0, 0, 0], state: 0, nbt: { mode: 'SAVE' } }]
  });
  assert.deepEqual(saveMode.dataMarkers(), []);

  const entities = template.entitiesTransformed(1);
  assert.equal(entities.length, 1);
  assert.equal(entities[0].nbt.id, 'minecraft:villager');
  assert.deepEqual([entities[0].local.x, entities[0].local.z], [4, 0]);
});

test('the template manager reports what it could not load', () => {
  const manager = new StructureTemplateManager();
  manager.registerJson('fixture', {
    size: [1, 1, 1],
    palette: [{ Name: 'minecraft:stone' }],
    blocks: [{ pos: [0, 0, 0], state: 0 }]
  });
  assert.deepEqual(manager.list(), ['fixture']);
  assert.ok(manager.get('fixture'));
  // Asking for a template that does not exist must be recorded, because "the structure generated empty"
  // and "the template was never loaded" look identical in the world.
  assert.equal(manager.get('minecraft:igloo/top'), null);
  assert.deepEqual(manager.missingTemplates, ['minecraft:igloo/top']);
  assert.equal(manager.has('minecraft:igloo/top'), false);
});

test('the template loader rejects malformed data rather than generating nothing', () => {
  assert.throws(() => StructureTemplate.fromJson({ palette: [], blocks: [] }), /size/);
  assert.throws(() => StructureTemplate.fromJson({ size: [0, 1, 1] }), /positive/);
  assert.equal(StructureTemplate.fromJson({ size: [1, 1, 1] }).blockCount, 0, 'an empty template is legal');
});
