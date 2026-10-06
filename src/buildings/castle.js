import { BLOCKS } from '../blocks.js';

export const castleStructure = {
  id: 'castle',
  name: 'Castle',
  icon: '/assets/blocks/cobblestone.png',
  description: 'Medieval stone fortress with 4 corner towers, battlements, and entrance arch',
  parameters: [
    { id: 'wallLength', name: 'Wall Length', symbol: 'L', default: 16, min: 10, max: 30, step: 2 },
    { id: 'towerHeight', name: 'Tower Height', symbol: 'H', default: 10, min: 6, max: 20, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const L = Math.max(10, Math.round(params.wallLength || 16));
  const towerH = Math.max(6, Math.round(params.towerHeight || 10));
  const wallH = Math.max(4, Math.floor(towerH * 0.6));
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  // 1. Courtyard floor
  for (let x = 0; x < L; x++) {
    for (let z = 0; z < L; z++) {
      set(x, 0, z, (x + z) % 4 === 0 ? BLOCKS.MOSSY_COBBLESTONE : BLOCKS.COBBLESTONE);
    }
  }

  // 2. Four Perimeter Walls
  for (let y = 1; y <= wallH; y++) {
    for (let i = 0; i < L; i++) {
      // North & South walls
      set(i, y, 0, BLOCKS.STONE_BRICKS);
      set(i, y, L - 1, BLOCKS.STONE_BRICKS);
      // West & East walls
      set(0, y, i, BLOCKS.STONE_BRICKS);
      set(L - 1, y, i, BLOCKS.STONE_BRICKS);
    }
  }

  // Entrance gate arch on South wall (z = L - 1)
  const mid = Math.floor(L / 2);
  for (let dy = 1; dy <= 3; dy++) {
    set(mid, dy, L - 1, BLOCKS.AIR);
    set(mid - 1, dy, L - 1, BLOCKS.AIR);
  }

  // Wall crenellations (battlements)
  for (let i = 0; i < L; i++) {
    if (i % 2 === 0) {
      set(i, wallH + 1, 0, BLOCKS.STONE_BRICKS);
      set(i, wallH + 1, L - 1, BLOCKS.STONE_BRICKS);
      set(0, wallH + 1, i, BLOCKS.STONE_BRICKS);
      set(L - 1, wallH + 1, i, BLOCKS.STONE_BRICKS);
    }
  }

  // 3. Four Corner Towers (3x3 footprint)
  const corners = [
    [0, 0],
    [L - 3, 0],
    [0, L - 3],
    [L - 3, L - 3]
  ];

  for (const [cx, cz] of corners) {
    for (let y = 1; y <= towerH; y++) {
      for (let dx = 0; dx < 3; dx++) {
        for (let dz = 0; dz < 3; dz++) {
          const isOuter = (dx === 0 || dx === 2 || dz === 0 || dz === 2);
          if (isOuter || y === 1 || y === towerH) {
            set(cx + dx, y, cz + dz, BLOCKS.STONE_BRICKS);
          }
        }
      }
    }
    // Tower battlements & torch
    set(cx, towerH + 1, cz, BLOCKS.COBBLESTONE);
    set(cx + 2, towerH + 1, cz, BLOCKS.COBBLESTONE);
    set(cx, towerH + 1, cz + 2, BLOCKS.COBBLESTONE);
    set(cx + 2, towerH + 1, cz + 2, BLOCKS.COBBLESTONE);
    set(cx + 1, towerH + 1, cz + 1, BLOCKS.TORCH);
  }

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    const blocks = [];
    const L = Math.max(10, Math.round(params.wallLength || 16));
    const towerH = Math.max(6, Math.round(params.towerHeight || 10));
    const wallH = Math.max(4, Math.floor(towerH * 0.6));
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

    for (let x = 0; x < L; x++) {
      for (let z = 0; z < L; z++) {
        set(x, 0, z, (x + z) % 4 === 0 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE);
      }
    }

    for (let y = 1; y <= wallH; y++) {
      for (let i = 0; i < L; i++) {
        set(i, y, 0, B.STONE_BRICKS);
        set(i, y, L - 1, B.STONE_BRICKS);
        set(0, y, i, B.STONE_BRICKS);
        set(L - 1, y, i, B.STONE_BRICKS);
      }
    }

    const mid = Math.floor(L / 2);
    for (let dy = 1; dy <= 3; dy++) {
      set(mid, dy, L - 1, B.AIR);
      set(mid - 1, dy, L - 1, B.AIR);
    }

    for (let i = 0; i < L; i++) {
      if (i % 2 === 0) {
        set(i, wallH + 1, 0, B.STONE_BRICKS);
        set(i, wallH + 1, L - 1, B.STONE_BRICKS);
        set(0, wallH + 1, i, B.STONE_BRICKS);
        set(L - 1, wallH + 1, i, B.STONE_BRICKS);
      }
    }

    const corners = [
      [0, 0],
      [L - 3, 0],
      [0, L - 3],
      [L - 3, L - 3]
    ];

    for (const [cx, cz] of corners) {
      for (let y = 1; y <= towerH; y++) {
        for (let dx = 0; dx < 3; dx++) {
          for (let dz = 0; dz < 3; dz++) {
            const isOuter = (dx === 0 || dx === 2 || dz === 0 || dz === 2);
            if (isOuter || y === 1 || y === towerH) {
              set(cx + dx, y, cz + dz, B.STONE_BRICKS);
            }
          }
        }
      }
      set(cx, towerH + 1, cz, B.COBBLESTONE);
      set(cx + 2, towerH + 1, cz, B.COBBLESTONE);
      set(cx, towerH + 1, cz + 2, B.COBBLESTONE);
      set(cx + 2, towerH + 1, cz + 2, B.COBBLESTONE);
      set(cx + 1, towerH + 1, cz + 1, B.TORCH);
    }

    return blocks;
  }
};

export default castleStructure;
