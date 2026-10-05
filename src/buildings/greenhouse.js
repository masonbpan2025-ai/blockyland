import { BLOCKS } from '../blocks.js';

export const greenhouseBuilding = {
  id: 'greenhouse',
  name: 'Greenhouse',
  icon: '/assets/blocks/glass.png',
  description: 'Botanical greenhouse with arched glass vault, flowerbeds, and water channel',
  parameters: [
    { id: 'length', name: 'Length', symbol: 'L', default: 12, min: 6, max: 24, step: 1 },
    { id: 'width', name: 'Width', symbol: 'W', default: 8, min: 5, max: 16, step: 1 },
    { id: 'height', name: 'Height', symbol: 'H', default: 6, min: 4, max: 12, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const L = Math.max(6, Math.round(params.length || 12));
  const W = Math.max(5, Math.round(params.width || 8));
  const H = Math.max(4, Math.round(params.height || 6));
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  // 1. Foundation & Interior Dirt Beds
  for (let z = 0; z < L; z++) {
    for (let x = 0; x < W; x++) {
      const isWall = (x === 0 || x === W - 1 || z === 0 || z === L - 1);
      const isCenterPath = (x === Math.floor(W / 2));
      if (isWall) {
        set(x, 0, z, BLOCKS.STONE_BRICKS);
      } else if (isCenterPath) {
        set(x, 0, z, BLOCKS.COBBLESTONE);
      } else {
        // Soil planting bed with flowers
        set(x, 0, z, BLOCKS.DIRT);
        set(x, 1, z, (x + z) % 2 === 0 ? BLOCKS.POPPY : BLOCKS.DANDELION);
      }
    }
  }

  // 2. Glass walls & Arched Glass Roof
  for (let y = 1; y < H; y++) {
    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        const isWall = (x === 0 || x === W - 1 || z === 0 || z === L - 1);
        if (isWall) {
          // Entrance doorway
          if (z === 0 && x === Math.floor(W / 2) && y <= 2) {
            set(x, y, z, BLOCKS.AIR);
          } else {
            const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === L - 1);
            set(x, y, z, isCorner ? BLOCKS.STONE_BRICKS : BLOCKS.GLASS);
          }
        }
      }
    }
  }

  // Roof glass vault
  for (let z = 0; z < L; z++) {
    for (let x = 0; x < W; x++) {
      set(x, H, z, (z % 3 === 0 || x === 0 || x === W - 1) ? BLOCKS.STONE_BRICKS : BLOCKS.GLASS);
    }
    // Overhead lanterns along the center spine
    if (z % 3 === 0) {
      set(Math.floor(W / 2), H - 1, z, BLOCKS.SEA_LANTERN);
    }
  }

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    const blocks = [];
    const L = Math.max(6, Math.round(params.length || 12));
    const W = Math.max(5, Math.round(params.width || 8));
    const H = Math.max(4, Math.round(params.height || 6));
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        const isWall = (x === 0 || x === W - 1 || z === 0 || z === L - 1);
        const isCenterPath = (x === Math.floor(W / 2));
        if (isWall) {
          set(x, 0, z, B.STONE_BRICKS);
        } else if (isCenterPath) {
          set(x, 0, z, B.COBBLESTONE);
        } else {
          set(x, 0, z, B.DIRT);
          set(x, 1, z, (x + z) % 2 === 0 ? B.POPPY : B.DANDELION);
        }
      }
    }

    for (let y = 1; y < H; y++) {
      for (let z = 0; z < L; z++) {
        for (let x = 0; x < W; x++) {
          const isWall = (x === 0 || x === W - 1 || z === 0 || z === L - 1);
          if (isWall) {
            if (z === 0 && x === Math.floor(W / 2) && y <= 2) {
              set(x, y, z, B.AIR);
            } else {
              const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === L - 1);
              set(x, y, z, isCorner ? B.STONE_BRICKS : B.GLASS);
            }
          }
        }
      }
    }

    for (let z = 0; z < L; z++) {
      for (let x = 0; x < W; x++) {
        set(x, H, z, (z % 3 === 0 || x === 0 || x === W - 1) ? B.STONE_BRICKS : B.GLASS);
      }
      if (z % 3 === 0) {
        set(Math.floor(W / 2), H - 1, z, B.SEA_LANTERN);
      }
    }

    return blocks;
  }
};

export default greenhouseBuilding;
