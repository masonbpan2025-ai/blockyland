import { BLOCKS } from '../blocks.js';

export const cozyHouseBuilding = {
  id: 'cozy_house',
  name: 'Cozy House',
  icon: '/assets/blocks/oak_planks.png',
  description: 'Rustic wooden cottage with timber frame, glass windows, and pitched roof',
  parameters: [
    { id: 'width', name: 'Width', symbol: 'W', default: 9, min: 6, max: 18, step: 1 },
    { id: 'depth', name: 'Depth', symbol: 'D', default: 7, min: 6, max: 18, step: 1 },
    { id: 'height', name: 'Wall Height', symbol: 'H', default: 4, min: 3, max: 8, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const W = Math.max(6, Math.round(params.width || 9));
  const D = Math.max(6, Math.round(params.depth || 7));
  const H = Math.max(3, Math.round(params.height || 4));
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  // 1. Cobblestone Foundation floor
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      set(x, 0, z, (x === 0 || x === W - 1 || z === 0 || z === D - 1) ? BLOCKS.COBBLESTONE : BLOCKS.OAK_PLANKS);
    }
  }

  // 2. Walls with Oak Log corner pillars
  for (let y = 1; y <= H; y++) {
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const isOuter = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
        if (!isOuter) continue;
        const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
        if (isCorner) {
          set(x, y, z, BLOCKS.OAK_LOG);
        } else {
          // Front door
          if (z === 0 && (x === Math.floor(W / 2)) && y <= 2) {
            set(x, y, z, BLOCKS.AIR);
          }
          // Windows
          else if (y === 2 && ((x === 2 || x === W - 3) || (z === 2 || z === D - 3))) {
            set(x, y, z, BLOCKS.GLASS);
          } else {
            set(x, y, z, BLOCKS.OAK_PLANKS);
          }
        }
      }
    }
  }

  // 3. Furniture inside
  set(1, 1, 1, BLOCKS.CRAFTING_TABLE);
  set(1, 1, 2, BLOCKS.FURNACE);
  set(W - 2, 1, D - 2, BLOCKS.BOOKSHELF);
  set(Math.floor(W / 2), 1, D - 2, BLOCKS.TORCH);

  // 4. Pitched Gabled Roof
  const roofSteps = Math.ceil(D / 2);
  for (let r = 0; r <= roofSteps; r++) {
    const y = H + 1 + r;
    const z1 = r;
    const z2 = D - 1 - r;
    if (z1 > z2) break;
    for (let x = -1; x <= W; x++) {
      set(x, y, z1, BLOCKS.BRICKS);
      if (z1 !== z2) set(x, y, z2, BLOCKS.BRICKS);
    }
  }

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    const blocks = [];
    const W = Math.max(6, Math.round(params.width || 9));
    const D = Math.max(6, Math.round(params.depth || 7));
    const H = Math.max(3, Math.round(params.height || 4));
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        set(x, 0, z, (x === 0 || x === W - 1 || z === 0 || z === D - 1) ? B.COBBLESTONE : B.OAK_PLANKS);
      }
    }

    for (let y = 1; y <= H; y++) {
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          const isOuter = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
          if (!isOuter) continue;
          const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
          if (isCorner) {
            set(x, y, z, B.OAK_LOG);
          } else {
            if (z === 0 && (x === Math.floor(W / 2)) && y <= 2) {
              set(x, y, z, B.AIR);
            } else if (y === 2 && ((x === 2 || x === W - 3) || (z === 2 || z === D - 3))) {
              set(x, y, z, B.GLASS);
            } else {
              set(x, y, z, B.OAK_PLANKS);
            }
          }
        }
      }
    }

    set(1, 1, 1, B.CRAFTING_TABLE);
    set(1, 1, 2, B.FURNACE);
    set(W - 2, 1, D - 2, B.BOOKSHELF);
    set(Math.floor(W / 2), 1, D - 2, B.TORCH);

    const roofSteps = Math.ceil(D / 2);
    for (let r = 0; r <= roofSteps; r++) {
      const y = H + 1 + r;
      const z1 = r;
      const z2 = D - 1 - r;
      if (z1 > z2) break;
      for (let x = -1; x <= W; x++) {
        set(x, y, z1, B.BRICKS);
        if (z1 !== z2) set(x, y, z2, B.BRICKS);
      }
    }

    return blocks;
  }
};

export default cozyHouseBuilding;
