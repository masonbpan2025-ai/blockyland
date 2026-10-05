import { BLOCKS } from '../blocks.js';

export const watchtowerStructure = {
  id: 'watchtower',
  name: 'Watchtower',
  icon: '/assets/blocks/mossy_cobblestone.png',
  description: 'Tall stone lookout watchtower with ladder shaft, platform, and beacon torch',
  parameters: [
    { id: 'height', name: 'Height', symbol: 'H', default: 14, min: 6, max: 30, step: 1 },
    { id: 'radius', name: 'Radius', symbol: 'R', default: 3, min: 2, max: 6, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const H = Math.max(6, Math.round(params.height || 14));
  const R = Math.max(2, Math.round(params.radius || 3));
  const size = R * 2 + 1;
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  // 1. Tower Body
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const isOuter = (x === 0 || x === size - 1 || z === 0 || z === size - 1);
        if (y === 0) {
          set(x, 0, z, BLOCKS.COBBLESTONE);
        } else if (isOuter) {
          // Entrance door at bottom
          if (y <= 2 && z === 0 && x === R) {
            set(x, y, z, BLOCKS.AIR);
          }
          // Window slits every 4 blocks
          else if (y % 4 === 0 && (x === R || z === R)) {
            set(x, y, z, BLOCKS.GLASS);
          } else {
            set(x, y, z, y % 3 === 0 ? BLOCKS.MOSSY_COBBLESTONE : BLOCKS.STONE_BRICKS);
          }
        } else if (x === R && z === R - 1) {
          // Internal central ladder shaft
          set(x, y, z, BLOCKS.LADDER);
        }
      }
    }
  }

  // 2. Top Observation Deck (expanded by 1 block in all directions)
  const deckY = H;
  const deckSize = size + 2;
  for (let x = 0; x < deckSize; x++) {
    for (let z = 0; z < deckSize; z++) {
      const rx = x - 1;
      const rz = z - 1;
      const isDeckBorder = (x === 0 || x === deckSize - 1 || z === 0 || z === deckSize - 1);

      // Floor of the deck
      set(rx, deckY, rz, BLOCKS.OAK_PLANKS);

      // Railing & battlements
      if (isDeckBorder) {
        if ((x + z) % 2 === 0) {
          set(rx, deckY + 1, rz, BLOCKS.COBBLESTONE);
        }
      }
    }
  }

  // 3. Central Roof Canopy & Beacon
  const canopyY = deckY + 3;
  set(R, canopyY, R, BLOCKS.GLOWSTONE);
  set(R, canopyY + 1, R, BLOCKS.SEA_LANTERN);

  // Four corner torches on battlements
  set(-1, deckY + 2, -1, BLOCKS.TORCH);
  set(size, deckY + 2, -1, BLOCKS.TORCH);
  set(-1, deckY + 2, size, BLOCKS.TORCH);
  set(size, deckY + 2, size, BLOCKS.TORCH);

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    const blocks = [];
    const H = Math.max(6, Math.round(params.height || 14));
    const R = Math.max(2, Math.round(params.radius || 3));
    const size = R * 2 + 1;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          const isOuter = (x === 0 || x === size - 1 || z === 0 || z === size - 1);
          if (y === 0) {
            set(x, 0, z, B.COBBLESTONE);
          } else if (isOuter) {
            if (y <= 2 && z === 0 && x === R) {
              set(x, y, z, B.AIR);
            } else if (y % 4 === 0 && (x === R || z === R)) {
              set(x, y, z, B.GLASS);
            } else {
              set(x, y, z, y % 3 === 0 ? B.MOSSY_COBBLESTONE : B.STONE_BRICKS);
            }
          } else if (x === R && z === R - 1) {
            set(x, y, z, B.LADDER);
          }
        }
      }
    }

    const deckY = H;
    const deckSize = size + 2;
    for (let x = 0; x < deckSize; x++) {
      for (let z = 0; z < deckSize; z++) {
        const rx = x - 1;
        const rz = z - 1;
        const isDeckBorder = (x === 0 || x === deckSize - 1 || z === 0 || z === deckSize - 1);

        set(rx, deckY, rz, B.OAK_PLANKS);

        if (isDeckBorder) {
          if ((x + z) % 2 === 0) {
            set(rx, deckY + 1, rz, B.COBBLESTONE);
          }
        }
      }
    }

    const canopyY = deckY + 3;
    set(R, canopyY, R, B.GLOWSTONE);
    set(R, canopyY + 1, R, B.SEA_LANTERN);

    set(-1, deckY + 2, -1, B.TORCH);
    set(size, deckY + 2, -1, B.TORCH);
    set(-1, deckY + 2, size, B.TORCH);
    set(size, deckY + 2, size, B.TORCH);

    return blocks;
  }
};

export default watchtowerStructure;
