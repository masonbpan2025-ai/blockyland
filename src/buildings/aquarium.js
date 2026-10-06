import { BLOCKS } from '../blocks.js';

export const aquariumBuilding = {
  id: 'aquarium',
  name: 'Aquarium',
  icon: '/assets/blocks/glass.png',
  description: 'Glass ocean aquarium with water, sand, sea lanterns, and plants',
  parameters: [
    { id: 'width', name: 'Width', symbol: 'W', default: 13, min: 5, max: 32, step: 1 },
    { id: 'height', name: 'Height', symbol: 'H', default: 7, min: 4, max: 20, step: 1 },
    { id: 'depth', name: 'Depth', symbol: 'D', default: 9, min: 5, max: 32, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const W = Math.max(5, Math.round(params.width || 13));
  const H = Math.max(4, Math.round(params.height || 7));
  const D = Math.max(5, Math.round(params.depth || 9));
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  // 1. Foundation floor
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const isBorder = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
      if (isBorder) {
        set(x, 0, z, BLOCKS.COBBLESTONE);
      } else {
        const isCornerLantern = (x === 1 || x === W - 2) && (z === 1 || z === D - 2);
        set(x, 0, z, isCornerLantern ? BLOCKS.SEA_LANTERN : ((x + z) % 3 === 0 ? BLOCKS.GRAVEL : BLOCKS.SAND));
      }
    }
  }

  // 2. Glass walls & water volume
  for (let y = 1; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const isOuterWall = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
        if (isOuterWall) {
          const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
          set(x, y, z, isCorner ? BLOCKS.STONE_BRICKS : BLOCKS.GLASS);
        } else {
          set(x, y, z, BLOCKS.WATER);
        }
      }
    }
  }

  // 3. Top rim & cover
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const isBorder = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
      set(x, H - 1, z, isBorder ? BLOCKS.STONE_BRICKS : BLOCKS.GLASS);
    }
  }

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
    const W = Math.max(5, Math.round(params.width || 13));
    const H = Math.max(4, Math.round(params.height || 7));
    const D = Math.max(5, Math.round(params.depth || 9));
    const ox = origin.x || 0, oy = origin.y || 0, oz = origin.z || 0;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, dx: x, dy: y, dz: z, id });

    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const isBorder = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
        if (isBorder) {
          set(x, 0, z, B.COBBLESTONE);
        } else {
          const isCornerLantern = (x === 1 || x === W - 2) && (z === 1 || z === D - 2);
          set(x, 0, z, isCornerLantern ? B.SEA_LANTERN : ((x + z) % 3 === 0 ? B.GRAVEL : B.SAND));
        }
      }
    }

    for (let y = 1; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          const isOuterWall = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
          if (isOuterWall) {
            const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
            set(x, y, z, isCorner ? B.STONE_BRICKS : B.GLASS);
          } else {
            set(x, y, z, B.WATER);
          }
        }
      }
    }

    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const isBorder = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
        set(x, H - 1, z, isBorder ? B.STONE_BRICKS : B.GLASS);
      }
    }

    return blocks;
  }
};

export default aquariumBuilding;
