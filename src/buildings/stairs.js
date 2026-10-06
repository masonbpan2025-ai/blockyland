import { BLOCKS } from '../blocks.js';

export const stairsStructure = {
  id: 'stairs',
  name: 'Stairs',
  icon: '/assets/blocks/stone_bricks.png',
  description: 'Ascending staircase with stone steps and side railings',
  parameters: [
    { id: 'height', name: 'Height', symbol: 'H', default: 8, min: 2, max: 32, step: 1 },
    { id: 'width', name: 'Width', symbol: 'W', default: 3, min: 1, max: 10, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const H = Math.max(1, Math.round(params.height || 8));
  const W = Math.max(1, Math.round(params.width || 3));
  const ox = origin.x, oy = origin.y, oz = origin.z;

  for (let step = 0; step < H; step++) {
    const z = oz + step;
    const yMax = oy + step;
    // Solid foundation under each step
    for (let y = oy; y <= yMax; y++) {
      for (let x = 0; x < W; x++) {
        blocks.push({
          x: ox + x,
          y,
          z,
          id: y === yMax ? BLOCKS.STONE_BRICKS : BLOCKS.COBBLESTONE
        });
      }
    }
    // Side railings on borders
    blocks.push({ x: ox - 1, y: yMax + 1, z, id: BLOCKS.COBBLESTONE });
    blocks.push({ x: ox + W, y: yMax + 1, z, id: BLOCKS.COBBLESTONE });
  }

  // Torches at bottom and top of railings
  blocks.push({ x: ox - 1, y: oy + 2, z: oz, id: BLOCKS.TORCH });
  blocks.push({ x: ox + W, y: oy + 2, z: oz, id: BLOCKS.TORCH });
  blocks.push({ x: ox - 1, y: oy + H + 1, z: oz + H - 1, id: BLOCKS.TORCH });
  blocks.push({ x: ox + W, y: oy + H + 1, z: oz + H - 1, id: BLOCKS.TORCH });

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    if (!params && origin && typeof origin === 'object' && !('x' in origin)) {
      params = origin;
      origin = { x: 0, y: 0, z: 0 };
    }
    origin = origin || { x: 0, y: 0, z: 0 };
    params = params || {};

    const blocks = [];
    const H = Math.max(1, Math.round(params.height || 8));
    const W = Math.max(1, Math.round(params.width || 3));
    const ox = origin.x || 0, oy = origin.y || 0, oz = origin.z || 0;

    for (let step = 0; step < H; step++) {
      const z = oz + step;
      const yMax = oy + step;
      for (let y = oy; y <= yMax; y++) {
        for (let x = 0; x < W; x++) {
          blocks.push({
            x: ox + x,
            y,
            z,
            dx: x,
            dy: y - oy,
            dz: step,
            id: y === yMax ? B.STONE_BRICKS : B.COBBLESTONE
          });
        }
      }
      blocks.push({ x: ox - 1, y: yMax + 1, z, dx: -1, dy: (yMax + 1) - oy, dz: step, id: B.COBBLESTONE });
      blocks.push({ x: ox + W, y: yMax + 1, z, dx: W, dy: (yMax + 1) - oy, dz: step, id: B.COBBLESTONE });
    }

    blocks.push({ x: ox - 1, y: oy + 2, z: oz, dx: -1, dy: 2, dz: 0, id: B.TORCH });
    blocks.push({ x: ox + W, y: oy + 2, z: oz, dx: W, dy: 2, dz: 0, id: B.TORCH });
    blocks.push({ x: ox - 1, y: oy + H + 1, z: oz + H - 1, dx: -1, dy: H + 1, dz: H - 1, id: B.TORCH });
    blocks.push({ x: ox + W, y: oy + H + 1, z: oz + H - 1, dx: W, dy: H + 1, dz: H - 1, id: B.TORCH });

    return blocks;
  }
};

export default stairsStructure;
