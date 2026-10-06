import { BLOCKS } from '../blocks.js';

export const skyscraperStructure = {
  id: 'skyscraper',
  name: 'Skyscraper',
  icon: '/assets/blocks/stone_bricks.png',
  description: 'Multi-story glass and steel tower with roof spire',
  parameters: [
    { id: 'floors', name: 'Floors', symbol: 'F', default: 5, min: 2, max: 15, step: 1 },
    { id: 'width', name: 'Width', symbol: 'W', default: 10, min: 6, max: 20, step: 1 },
    { id: 'depth', name: 'Depth', symbol: 'D', default: 10, min: 6, max: 20, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const floors = Math.max(2, Math.round(params.floors || 5));
  const W = Math.max(6, Math.round(params.width || 10));
  const D = Math.max(6, Math.round(params.depth || 10));
  const floorHeight = 4;
  const totalH = floors * floorHeight;
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  // Foundation slab
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      set(x, 0, z, BLOCKS.OBSIDIAN);
    }
  }

  // Floors
  for (let f = 0; f < floors; f++) {
    const baseY = f * floorHeight + 1;
    // Floor slab
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        set(x, baseY, z, (x === 0 || x === W - 1 || z === 0 || z === D - 1) ? BLOCKS.STONE_BRICKS : BLOCKS.OAK_PLANKS);
      }
    }
    // Floor illumination
    set(Math.floor(W / 2), baseY, Math.floor(D / 2), BLOCKS.SEA_LANTERN);

    // Walls
    for (let dy = 1; dy < floorHeight; dy++) {
      const y = baseY + dy;
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          const isOuter = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
          if (!isOuter) continue;
          const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
          if (isCorner) {
            set(x, y, z, BLOCKS.STONE_BRICKS);
          } else {
            // Door on ground floor
            if (f === 0 && dy < 3 && z === 0 && (x === Math.floor(W / 2) || x === Math.floor(W / 2) - 1)) {
              // Open doorway
            } else {
              set(x, y, z, BLOCKS.GLASS);
            }
          }
        }
      }
    }
  }

  // Roof parapet
  const roofY = totalH + 1;
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      set(x, roofY, z, BLOCKS.STONE_BRICKS);
      if (x === 0 || x === W - 1 || z === 0 || z === D - 1) {
        set(x, roofY + 1, z, BLOCKS.COBBLESTONE);
      }
    }
  }

  // Spire antenna on roof
  const cx = Math.floor(W / 2);
  const cz = Math.floor(D / 2);
  for (let sy = 1; sy <= 6; sy++) {
    set(cx, roofY + sy, cz, sy === 6 ? BLOCKS.GLOWSTONE : BLOCKS.OBSIDIAN);
  }

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    const blocks = [];
    const floors = Math.max(2, Math.round(params.floors || 5));
    const W = Math.max(6, Math.round(params.width || 10));
    const D = Math.max(6, Math.round(params.depth || 10));
    const floorHeight = 4;
    const totalH = floors * floorHeight;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        set(x, 0, z, B.OBSIDIAN);
      }
    }

    for (let f = 0; f < floors; f++) {
      const baseY = f * floorHeight + 1;
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          set(x, baseY, z, (x === 0 || x === W - 1 || z === 0 || z === D - 1) ? B.STONE_BRICKS : B.OAK_PLANKS);
        }
      }
      set(Math.floor(W / 2), baseY, Math.floor(D / 2), B.SEA_LANTERN);

      for (let dy = 1; dy < floorHeight; dy++) {
        const y = baseY + dy;
        for (let x = 0; x < W; x++) {
          for (let z = 0; z < D; z++) {
            const isOuter = (x === 0 || x === W - 1 || z === 0 || z === D - 1);
            if (!isOuter) continue;
            const isCorner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
            if (isCorner) {
              set(x, y, z, B.STONE_BRICKS);
            } else {
              if (f === 0 && dy < 3 && z === 0 && (x === Math.floor(W / 2) || x === Math.floor(W / 2) - 1)) {
                // Open doorway
              } else {
                set(x, y, z, B.GLASS);
              }
            }
          }
        }
      }
    }

    const roofY = totalH + 1;
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        set(x, roofY, z, B.STONE_BRICKS);
        if (x === 0 || x === W - 1 || z === 0 || z === D - 1) {
          set(x, roofY + 1, z, B.COBBLESTONE);
        }
      }
    }

    const cx = Math.floor(W / 2);
    const cz = Math.floor(D / 2);
    for (let sy = 1; sy <= 6; sy++) {
      set(cx, roofY + sy, cz, sy === 6 ? B.GLOWSTONE : B.OBSIDIAN);
    }

    return blocks;
  }
};

export default skyscraperStructure;
