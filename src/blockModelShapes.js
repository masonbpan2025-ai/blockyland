// Box models for blocks that are not full cubes, in pixels (0-16), as [x0, y0, z0, x1, y1, z1]. Pure data: blocks.js
// attaches each to its block definition as `def.model`, blockGeometry.js builds it, and blockOcclusion.js treats a
// modelled block as partial (it no longer hides its neighbours' faces).
//
// Found by the visual parity audit (src/resourceVisualAudit.js, V-SHAPE): every block here was drawn as a full cube,
// so a cactus, a cauldron or a cake filled its whole block and culled the faces next to it, leaving holes into the
// world where the real shape leaves a gap. The shapes follow the blocks' wiki descriptions and renders -- the cactus
// one pixel in from each side, the enchanting table three quarters tall ("12 pixels high"), the dirt path one
// pixel short of a full block, the cauldron's hollow with its floor and four legs, the anvil's stepped base, waist
// and face. Faces sample only the part of the texture their box covers, as a block model does.
//
// `content` names a box drawn with the block's `inner` texture (a cauldron's water, lava or powder snow).

export const BLOCK_MODEL_SHAPES = {
  Cactus: { boxes: [[1, 0, 1, 15, 16, 15]] },
  'Enchanting Table': { boxes: [[0, 0, 0, 16, 12, 16]] },
  'Dirt Path': { boxes: [[0, 0, 0, 16, 15, 16]] },
  Cake: { boxes: [[1, 0, 1, 15, 8, 15]] },
  Cauldron: { boxes: cauldron() },
  'Water Cauldron': { boxes: cauldron(), content: [2, 4, 2, 14, 15, 14] },
  'Lava Cauldron': { boxes: cauldron(), content: [2, 4, 2, 14, 15, 14] },
  'Powder Snow Cauldron': { boxes: cauldron(), content: [2, 4, 2, 14, 15, 14] },
  Composter: { boxes: [[0, 0, 0, 16, 16, 2], [0, 0, 14, 16, 16, 16], [0, 0, 2, 2, 16, 14], [14, 0, 2, 16, 16, 14], [2, 0, 2, 14, 2, 14]] },
  Anvil: { boxes: anvil() },
  'Chipped Anvil': { boxes: anvil() },
  'Damaged Anvil': { boxes: anvil() },
  Grindstone: { boxes: [[4, 4, 2, 12, 16, 14], [2, 0, 6, 4, 13, 10], [12, 0, 6, 14, 13, 10]] },
  Bell: { boxes: [[5, 6, 5, 11, 13, 11], [4, 4, 4, 12, 6, 12], [2, 13, 7, 14, 15, 9], [0, 0, 6, 2, 16, 10], [14, 0, 6, 16, 16, 10]] },
  'Dragon Egg': {
    boxes: [[6, 15, 6, 10, 16, 10], [5, 14, 5, 11, 15, 11], [4, 13, 4, 12, 14, 12], [3, 11, 3, 13, 13, 13],
      [2, 8, 2, 14, 11, 14], [1, 3, 1, 15, 8, 15], [2, 1, 2, 14, 3, 14], [3, 0, 3, 13, 1, 13]],
  },
  // The core, plus an arm towards each neighbouring chorus plant or flower, and down to end stone (blockModels.js).
  'Chorus Plant': { boxes: [[4, 4, 4, 12, 12, 12]], connections: true },
  'Chorus Flower': { boxes: [[1, 1, 1, 15, 15, 15]] },
  Azalea: { boxes: [[0, 8, 0, 16, 16, 16], [7, 0, 7, 9, 8, 9]] },
  'Flowering Azalea': { boxes: [[0, 8, 0, 16, 16, 16], [7, 0, 7, 9, 8, 9]] },
  'Turtle Egg': { boxes: [[5, 0, 4, 9, 7, 8]] },
  Frogspawn: { boxes: [[0, 0, 0, 16, 1, 16]] },
  'Heavy Core': { boxes: [[4, 0, 4, 12, 8, 12]] },
  'Dried Ghast': { boxes: [[3, 0, 3, 13, 10, 13]] },
  'Calibrated Sculk Sensor': { boxes: [[0, 0, 0, 16, 8, 16]] },
  'Sculk Sensor': { boxes: [[0, 0, 0, 16, 8, 16]] },
  'Sculk Shrieker': { boxes: [[0, 0, 0, 16, 8, 16]] },
  // Flat against a wall (drawn facing north, as the wall signs are: no placement state carries their facing yet).
  // Written on the south wall; the block's stored `wall` turns them (blockModels.js). A vine may cover several walls
  // and the underside of a block above ('up').
  Ladder: { boxes: [[0, 0, 15, 16, 16, 16]], wallAttached: true },
  Vine: { boxes: [[0, 0, 15, 16, 16, 16]], wallAttached: true, multiWall: true },
  // Flat on the floor.
  'Moss Carpet': { boxes: [[0, 0, 0, 16, 1, 16]] },
  'Pink Petals': { boxes: [[0, 0, 0, 16, 1, 16]] },
  Tripwire: { boxes: [[0, 1, 7, 16, 2, 9]] },
  'Tripwire Hook': { boxes: [[6, 0, 14, 10, 10, 16], [7, 4, 11, 9, 6, 14]] },
  // Small or partial blocks.
  'Pointed Dripstone': { boxes: [[5, 0, 5, 11, 16, 11]] },
  'Brewing Stand': { boxes: [[7, 0, 7, 9, 14, 9], [9, 0, 5, 15, 2, 11], [1, 0, 1, 7, 2, 7], [1, 0, 9, 7, 2, 15]] },
  Conduit: { boxes: [[5, 5, 5, 11, 11, 11]] },
  Lantern: { boxes: [[5, 0, 5, 11, 7, 11], [6, 7, 6, 10, 9, 10]] },
  'Soul Lantern': { boxes: [[5, 0, 5, 11, 7, 11], [6, 7, 6, 10, 9, 10]] },
  Campfire: { boxes: campfire() },
  'Soul Campfire': { boxes: campfire() },
  'Decorated Pot': { boxes: [[1, 0, 1, 15, 16, 15]] },
  'End Portal Frame': { boxes: [[0, 0, 0, 16, 13, 16]] },
  'End Portal': { boxes: [[0, 12, 0, 16, 12.01, 16]] },
};

/**
 * Plants this game generated as solid stone-sounding cubes ("cube: true"), which the wiki's pages describe as
 * plants: drawn as crossed sprites, walked through, and broken with a plant's sound.
 */
export const CROSSED_PLANTS = ['Lilac', 'Peony', 'Rose Bush', 'Pitcher Plant', 'Sugar Cane', 'Torchflower'];

function campfire() {
  return [[1, 0, 0, 5, 4, 16], [11, 0, 0, 15, 4, 16], [0, 3, 1, 16, 7, 5], [0, 3, 11, 16, 7, 15], [5, 0, 0, 11, 1, 16]];
}

function cauldron() {
  return [
    [0, 3, 0, 16, 16, 2], [0, 3, 14, 16, 16, 16], [0, 3, 2, 2, 16, 14], [14, 3, 2, 16, 16, 14], // walls
    [2, 3, 2, 14, 4, 14], // floor
    [0, 0, 0, 4, 3, 4], [12, 0, 0, 16, 3, 4], [0, 0, 12, 4, 3, 16], [12, 0, 12, 16, 3, 16], // legs
  ];
}

function anvil() {
  return [[2, 0, 2, 14, 4, 14], [4, 4, 3, 12, 5, 13], [6, 5, 4, 10, 10, 12], [3, 10, 0, 13, 16, 16]];
}
