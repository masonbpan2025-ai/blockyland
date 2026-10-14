// The four items left open after the recipe/visual round: the arrow of Splashing (and the plain tipped arrow),
// ladders and vines that hang on the wall they were placed on, chorus plants that reach for their neighbours, and
// food drawn lying on a campfire. Java Edition behaviour, from the blocks' and items' wiki pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';
import { cellForName } from '../src/wikiNames.js';
import { isTippedArrow, tippedArrowEffect } from '../src/tippedArrows.js';
import { isWallAttached, attachStateForClick, attachStateForStructure, rememberAttachment, onSupportRemoved, canHold } from '../src/wallAttached.js';
import { modelBoxes } from '../src/blockModels.js';
import { BLOCK_DEFS } from '../src/blocks.js';
import { Chunk, World } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { CampfireCooking, CAMPFIRE_SLOT_POSES } from '../src/campfireCooking.js';

const UNIT = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }), getUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
function miniWorld() {
  const chunk = new Chunk(0, 0); const structureOrientations = new Map();
  return {
    chunk, structureOrientations,
    getVoxel: (x, y, z) => chunk.getVoxel(x, y, z),
    setVoxel: (x, y, z, id) => { chunk.setVoxel(x, y, z, id); structureOrientations.delete(`${x},${y},${z}`); },
    getChunk: () => chunk,
  };
}
const arrowsAround = (centre) => { const g = Array(9).fill({ id: 'arrow', isBlock: false, count: 1 }); g[4] = { ...centre, count: 1 }; return g; };

test('Arrow of Splashing: a lingering water bottle in eight arrows; it flies as a plain arrow', () => {
  const made = findMatchingRecipe(arrowsAround(cellForName('Lingering Water Bottle')), 3, 3, RECIPES_3X3);
  assert.deepEqual([made?.id, made?.count], ['tipped_arrow_splashing', 8]);
  assert.equal(tippedArrowEffect('tipped_arrow_splashing'), null, '"behave like regular arrows"');
  assert.equal(isTippedArrow('tipped_arrow_splashing'), true);
  // An awkward, thick or mundane lingering potion makes a plain "Tipped Arrow", which the bow also takes.
  for (const base of ['Awkward Lingering Potion', 'Thick Lingering Potion', 'Mundane Lingering Potion']) {
    assert.deepEqual(findMatchingRecipe(arrowsAround(cellForName(base)), 3, 3, RECIPES_3X3)?.id, 'tipped_arrow', base);
  }
  assert.equal(isTippedArrow('tipped_arrow'), true);
});

test('Ladders hang on the clicked wall; a vine on walls and under blocks; neither on a floor', () => {
  assert.equal(isWallAttached(BLOCKS.LADDER), true);
  assert.equal(isWallAttached(BLOCKS.VINE), true);
  assert.deepEqual(attachStateForClick(BLOCKS.LADDER, { x: 1, y: 0, z: 0 }, BLOCKS.STONE), { wall: 'west' });
  assert.deepEqual(attachStateForClick(BLOCKS.LADDER, { x: 0, y: 0, z: -1 }, BLOCKS.STONE), { wall: 'south' });
  assert.equal(attachStateForClick(BLOCKS.LADDER, { x: 0, y: 1, z: 0 }, BLOCKS.STONE), null, 'not on top of a block');
  assert.deepEqual(attachStateForClick(BLOCKS.VINE, { x: 0, y: -1, z: 0 }, BLOCKS.STONE), { walls: ['up'] }, 'a vine under a block');
  assert.equal(attachStateForClick(BLOCKS.LADDER, { x: 1, y: 0, z: 0 }, BLOCKS.CACTUS), null, 'needs a full block');
  assert.equal(canHold(BLOCKS.GLASS), true, 'glass is a full block');
  // From a structure: a ladder's `facing` points away from its wall; a vine lists its faces.
  assert.deepEqual(attachStateForStructure(BLOCKS.LADDER, { facing: 'east' }), { wall: 'west' });
  assert.deepEqual(attachStateForStructure(BLOCKS.VINE, { vineFaces: { north: true, up: true } }), { walls: ['north', 'up'] });
  // The model turns to the wall.
  assert.deepEqual(modelBoxes(BLOCK_DEFS[BLOCKS.LADDER].model, { wall: 'west' }), [[0, 0, 0, 1, 16, 16]]);
  assert.deepEqual(modelBoxes(BLOCK_DEFS[BLOCKS.LADDER].model, { wall: 'north' }), [[0, 0, 0, 16, 16, 1]]);
});

test('A ladder drops when its wall goes; a vine loses that face, and breaks with none left', () => {
  const world = miniWorld();
  world.setVoxel(5, 4, 5, BLOCKS.STONE);
  world.setVoxel(6, 4, 5, BLOCKS.LADDER); rememberAttachment(world, 6, 4, 5, BLOCKS.LADDER, { wall: 'west' });
  world.setVoxel(5, 4, 6, BLOCKS.VINE); rememberAttachment(world, 5, 4, 6, BLOCKS.VINE, { walls: ['north', 'east'] });
  world.setVoxel(5, 4, 5, BLOCKS.AIR);
  const broken = [];
  onSupportRemoved(world, 5, 4, 5, (x, y, z, drop) => broken.push([x, y, z, drop]));
  assert.deepEqual(broken, [[6, 4, 5, true]], 'the ladder drops itself; the vine keeps its other face');
  assert.deepEqual(world.structureOrientations.get('5,4,6').walls, ['east']);
  // A ladder on another wall is untouched.
  world.setVoxel(9, 4, 9, BLOCKS.LADDER); rememberAttachment(world, 9, 4, 9, BLOCKS.LADDER, { wall: 'north' });
  assert.equal(onSupportRemoved(world, 10, 4, 9, () => assert.fail('not its wall')), 0);
});

test('The mesher draws a placed ladder against its wall, and a world remembers a structure\'s ladder', () => {
  const world = miniWorld();
  world.setVoxel(5, 4, 5, BLOCKS.STONE);
  world.setVoxel(6, 4, 5, BLOCKS.LADDER); rememberAttachment(world, 6, 4, 5, BLOCKS.LADDER, { wall: 'west' });
  const geo = new ChunkMesher(UNIT).meshChunk(world.chunk, world).lightGeo;
  geo.computeBoundingBox();
  assert.ok(geo.boundingBox.min.x >= 6 && geo.boundingBox.max.x <= 6.07, 'a sixteenth of a block, against x = 6');
  const real = new World(0);
  real.applyStructureOrientation({ x: 1, y: 2, z: 3, id: BLOCKS.LADDER, facing: 'south' });
  assert.equal(real.structureOrientations.get('1,2,3').wall, 'north');
});

test('A chorus plant reaches for chorus above and below, and for end stone beneath', () => {
  const world = miniWorld();
  world.setVoxel(5, 5, 5, BLOCKS.END_STONE);
  world.setVoxel(5, 6, 5, BLOCKS.CHORUS_PLANT);
  const alone = new ChunkMesher(UNIT).meshChunk(world.chunk, world).lightGeo.attributes.position.count;
  world.setVoxel(6, 6, 5, BLOCKS.CHORUS_PLANT);
  const both = new ChunkMesher(UNIT).meshChunk(world.chunk, world).lightGeo.attributes.position.count;
  // Alone: the core and its arm down to the end stone (2 boxes). With a neighbour: both plants grow an arm to each other.
  assert.equal(alone, 2 * 36);
  // The new plant: its core and its arm west (no end stone under it); the first plant: an arm east. Three boxes.
  assert.equal(both, alone + 3 * 36, 'the new plant (core + arm) and the first plant\'s new arm');
});

test('Food on a campfire is reported to the game slot by slot, and cleared when it cooks', () => {
  const seen = [];
  const fire = new CampfireCooking({ changed: (x, y, z, slots) => seen.push(slots.map((s) => s.id)) });
  fire.add(0, 0, 0, { id: 'beef' });
  fire.add(0, 0, 0, { id: 'cod' });
  fire.update(31);
  assert.deepEqual(seen, [['beef'], ['beef', 'cod'], []]);
  assert.equal(CAMPFIRE_SLOT_POSES.length, 4, 'one pose per slot');
});

test('A held item is its flat icon, not a block (the null check that made every held item a missing-texture cube)', async () => {
  const { formProbes } = await import('../src/resourceVisualAudit.js');
  const { heldShape, droppedShape } = formProbes();
  for (const id of ['porkchop', 'diamond_sword', 'potion_of_healing', 'tipped_arrow_healing', 'bread']) {
    assert.equal(heldShape(id, false), 'flat sprite', `${id} in the hand`);
    assert.equal(droppedShape(id, false), 'flat sprite', `${id} on the ground`);
  }
  assert.equal(heldShape(BLOCKS.STONE, true), 'cube', 'a block is still a block');
});
