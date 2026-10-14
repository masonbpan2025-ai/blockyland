// Paintings, against https://minecraft.wiki/w/Painting (Java Edition).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import {
  PAINTING_VARIANTS, PAINTING_BY_ID, PAINTING_BREAK_DELAY_SECONDS, PaintingManager,
  chooseVariant, facingFromNormal, fitsAt, paintingCells
} from '../src/paintings.js';

/** A stone wall in the plane z = 0 (x -10..10, y 1..12) with air in front of it (z < 0). */
function wallWorld(extra = {}) {
  const cells = new Map(Object.entries(extra));
  return {
    cells,
    getVoxel: (x, y, z) => cells.get(`${x},${y},${z}`) ?? (z === 0 && x >= -10 && x <= 10 && y >= 1 && y <= 12 ? BLOCKS.STONE : BLOCKS.AIR),
    setVoxel: (x, y, z, id) => cells.set(`${x},${y},${z}`, id)
  };
}

function gameWith(world, mode = 'survival') {
  const drops = [];
  return {
    drops,
    world,
    player: { gamemode: mode },
    entities: { spawnDroppedItem: (at, id, isBlock, count) => drops.push({ id, isBlock, count }) },
    sounds: {}
  };
}

test('the canvas list matches the wiki: 47 placeable paintings, plus the four unused elementals', () => {
  assert.equal(PAINTING_VARIANTS.filter(v => v.placeable).length, 47);
  assert.deepEqual(PAINTING_VARIANTS.filter(v => !v.placeable).map(v => v.id).sort(), ['earth', 'fire', 'water', 'wind']);
  const size = id => `${PAINTING_BY_ID[id].width}x${PAINTING_BY_ID[id].height}`;
  assert.equal(size('kebab'), '1x1');
  assert.equal(size('wanderer'), '1x2');
  assert.equal(size('pool'), '2x1');
  assert.equal(size('skull_and_roses'), '2x2');
  assert.equal(size('bouquet'), '3x3');
  assert.equal(size('backyard'), '3x4');
  assert.equal(size('fighters'), '4x2');
  assert.equal(size('skeleton'), '4x3');
  assert.equal(size('pointer'), '4x4');
  assert.equal(new Set(PAINTING_VARIANTS.map(v => v.id)).size, PAINTING_VARIANTS.length);
});

test('a painting hangs only on the side of a block, never on a floor or ceiling', () => {
  assert.equal(facingFromNormal({ x: 0, y: 0, z: -1 }), 'north');
  assert.equal(facingFromNormal({ x: 1, y: 0, z: 0 }), 'east');
  assert.equal(facingFromNormal({ x: 0, y: 1, z: 0 }), null);
  assert.equal(facingFromNormal({ x: 0, y: -1, z: 0 }), null);
});

test('even sizes grow toward the counter-clockwise side and upward, as vanilla does', () => {
  // Facing north, counter-clockwise is west (-X).
  const cells = paintingCells({ x: 0, y: 5, z: -1 }, 'north', 2, 2).map(c => `${c.x},${c.y}`).sort();
  assert.deepEqual(cells, ['-1,5', '-1,6', '0,5', '0,6']);
  const three = paintingCells({ x: 0, y: 5, z: -1 }, 'north', 3, 3).map(c => c.x);
  assert.deepEqual([Math.min(...three), Math.max(...three)], [-1, 1], 'odd sizes are centred');
});

test('it chooses a random canvas of the largest size that fits (the wiki placement rule)', () => {
  const world = wallWorld();
  const open = chooseVariant(world, { x: 0, y: 5, z: -1 }, 'north', { random: () => 0 });
  assert.equal(open.width * open.height, 16, 'an open wall takes a 4x4');

  // Fence off a 2-wide, 1-high slot with blocks in front of the wall.
  const slot = wallWorld();
  for (let x = -10; x <= 10; x++) for (let y = 1; y <= 12; y++) if (!(y === 5 && (x === 0 || x === -1))) slot.cells.set(`${x},${y},-1`, BLOCKS.STONE);
  const fitted = chooseVariant(slot, { x: 0, y: 5, z: -1 }, 'north', { random: () => 0.99 });
  assert.equal(`${fitted.width}x${fitted.height}`, '2x1');
  const choices = new Set();
  for (let i = 0; i < 20; i++) choices.add(chooseVariant(slot, { x: 0, y: 5, z: -1 }, 'north', { random: () => i / 20 }).id);
  assert.deepEqual([...choices].sort(), ['courbet', 'creebet', 'pool', 'sea', 'sunset'], 'any 2x1 canvas, at random');
});

test('it needs a solid block behind every cell and free space in front', () => {
  const world = wallWorld({ '0,5,0': BLOCKS.AIR });
  assert.equal(fitsAt(world, { x: 0, y: 5, z: -1 }, 'north', 1, 1), false, 'cannot cover a gap in the wall');
  assert.equal(fitsAt(world, { x: 3, y: 5, z: -1 }, 'north', 1, 1), true);
  const blocked = wallWorld({ '3,5,-1': BLOCKS.STONE });
  assert.equal(fitsAt(blocked, { x: 3, y: 5, z: -1 }, 'north', 1, 1), false, 'no room in front');
  assert.equal(fitsAt(wallWorld(), { x: 3, y: 5, z: -1 }, 'north', 1, 1, () => false), true);
});

test('paintings do not overlap', () => {
  const manager = new PaintingManager(gameWith(wallWorld()), { random: () => 0 });
  const first = manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' });
  assert.ok(first);
  assert.equal(manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' }), null);
  const second = manager.place({ x: 0, y: 7, z: -1 }, 'north', { maxWidth: 1, maxHeight: 1 });
  assert.ok(second);
});

test('a painting whose wall is broken drops after 20 ticks, not before, and survives a quick repair', () => {
  const world = wallWorld();
  const game = gameWith(world);
  const manager = new PaintingManager(game);
  manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' });
  world.cells.set('0,5,0', BLOCKS.AIR);
  manager.update(0.5);
  assert.equal(manager.paintings.length, 1, 'still there after half a second');
  world.cells.delete('0,5,0');
  manager.update(0.5);
  manager.update(1);
  assert.equal(manager.paintings.length, 1, 'the wall came back in time');

  world.cells.set('0,5,0', BLOCKS.AIR);
  for (let t = 0; t < PAINTING_BREAK_DELAY_SECONDS; t += 0.25) manager.update(0.25);
  assert.equal(manager.paintings.length, 0);
  assert.deepEqual(game.drops, [{ id: 'painting', isBlock: false, count: 1 }]);
});

test('a block placed in front of a painting breaks it', () => {
  const world = wallWorld();
  const manager = new PaintingManager(gameWith(world));
  manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' });
  world.cells.set('0,5,-1', BLOCKS.STONE);
  manager.update(1.1);
  assert.equal(manager.paintings.length, 0);
});

test('hitting a painting breaks it; it drops unless the player is in creative', () => {
  const survival = gameWith(wallWorld(), 'survival');
  const a = new PaintingManager(survival);
  a.breakByPlayer(a.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' }), survival.player);
  assert.equal(survival.drops.length, 1);

  const creative = gameWith(wallWorld(), 'creative');
  const b = new PaintingManager(creative);
  b.breakByPlayer(b.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' }), creative.player);
  assert.equal(creative.drops.length, 0);
});

test('a look ray finds the painting from the front and not from behind', () => {
  const manager = new PaintingManager(gameWith(wallWorld()));
  const painting = manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' });
  const hit = manager.raycast({ x: 0.5, y: 5.5, z: -4 }, { x: 0, y: 0, z: 1 }, 5);
  assert.equal(hit?.painting, painting);
  assert.ok(Math.abs(hit.distance - (4 - 1 / 16)) < 1e-9);
  assert.equal(manager.raycast({ x: 0.5, y: 5.5, z: -4 }, { x: 0, y: 0, z: -1 }, 5), null, 'looking away');
  assert.equal(manager.raycast({ x: 3.5, y: 5.5, z: -4 }, { x: 0, y: 0, z: 1 }, 5), null, 'beside it');
});

test('paintings save and load with their canvas', () => {
  const game = gameWith(wallWorld());
  const manager = new PaintingManager(game);
  manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'pointer' });
  manager.place({ x: 6, y: 5, z: -1 }, 'north', { variant: 'kebab' });
  const saved = JSON.parse(JSON.stringify(manager.serialize()));
  const restored = new PaintingManager(gameWith(wallWorld()));
  restored.restore(saved);
  assert.deepEqual(restored.paintings.map(p => p.variantId).sort(), ['kebab', 'pointer']);
  restored.restore([{ variant: 'nonsense', facing: 'north', x: 0, y: 5, z: -1 }]);
  assert.equal(restored.paintings.length, 0, 'an unknown canvas is skipped');
});

test('paintings belong to the dimension they were hung in', () => {
  const game = gameWith(wallWorld());
  game.currentDimension = 'overworld';
  const manager = new PaintingManager(game);
  manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' });
  game.currentDimension = 'nether';
  assert.equal(manager.active().length, 0);
  assert.ok(manager.place({ x: 0, y: 5, z: -1 }, 'north', { variant: 'kebab' }), 'the same spot is free in another dimension');
  assert.equal(manager.serialize().length, 1, 'a save holds the current dimension only');
});
