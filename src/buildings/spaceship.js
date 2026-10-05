import { BLOCKS } from '../blocks.js';

export const spaceshipStructure = {
  id: 'spaceship',
  name: 'Spaceship',
  icon: '/assets/blocks/sea_lantern.png',
  description: 'Futuristic flying saucer UFO with glowing energy ring and glass cockpit',
  parameters: [
    { id: 'size', name: 'Saucer Radius', symbol: 'R', default: 7, min: 4, max: 15, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  const R = Math.max(4, Math.round(params.size || 7));
  const ox = origin.x, oy = origin.y + 4, oz = origin.z; // elevated in air
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  // 1. Landing Struts (down to ground)
  const legOffsets = [
    [-Math.floor(R * 0.6), -Math.floor(R * 0.6)],
    [Math.floor(R * 0.6), -Math.floor(R * 0.6)],
    [-Math.floor(R * 0.6), Math.floor(R * 0.6)],
    [Math.floor(R * 0.6), Math.floor(R * 0.6)]
  ];
  for (const [lx, lz] of legOffsets) {
    for (let ly = -4; ly < 0; ly++) {
      set(lx, ly, lz, BLOCKS.OBSIDIAN);
    }
  }

  // 2. Central Saucer Disk
  for (let x = -R; x <= R; x++) {
    for (let z = -R; z <= R; z++) {
      const distSq = x * x + z * z;
      if (distSq <= R * R) {
        // Glowing rim on outer edge
        const isRim = distSq >= (R - 1.5) * (R - 1.5);
        set(x, 0, z, isRim ? BLOCKS.SEA_LANTERN : BLOCKS.STONE_BRICKS);

        // Under-saucer bevel
        if (distSq <= (R - 2) * (R - 2)) {
          set(x, -1, z, BLOCKS.OBSIDIAN);
        }
      }
    }
  }

  // 3. Central glowing warp drive underneath
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      set(x, -2, z, BLOCKS.GLOWSTONE);
    }
  }

  // 4. Upper Cockpit Dome
  const domeR = Math.max(2, Math.floor(R * 0.5));
  for (let x = -domeR; x <= domeR; x++) {
    for (let z = -domeR; z <= domeR; z++) {
      const d2 = x * x + z * z;
      if (d2 <= domeR * domeR) {
        set(x, 1, z, BLOCKS.GLASS);
        if (d2 <= (domeR - 1) * (domeR - 1)) {
          set(x, 2, z, BLOCKS.GLASS);
        }
      }
    }
  }
  // Pilot beacon at the center
  set(0, 1, 0, BLOCKS.SEA_LANTERN);

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    const blocks = [];
    const R = Math.max(4, Math.round(params.size || 7));
    const ox = origin.x, oy = origin.y + 4, oz = origin.z;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

    const legOffsets = [
      [-Math.floor(R * 0.6), -Math.floor(R * 0.6)],
      [Math.floor(R * 0.6), -Math.floor(R * 0.6)],
      [-Math.floor(R * 0.6), Math.floor(R * 0.6)],
      [Math.floor(R * 0.6), Math.floor(R * 0.6)]
    ];
    for (const [lx, lz] of legOffsets) {
      for (let ly = -4; ly < 0; ly++) {
        set(lx, ly, lz, B.OBSIDIAN);
      }
    }

    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const distSq = x * x + z * z;
        if (distSq <= R * R) {
          const isRim = distSq >= (R - 1.5) * (R - 1.5);
          set(x, 0, z, isRim ? B.SEA_LANTERN : B.STONE_BRICKS);

          if (distSq <= (R - 2) * (R - 2)) {
            set(x, -1, z, B.OBSIDIAN);
          }
        }
      }
    }

    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        set(x, -2, z, B.GLOWSTONE);
      }
    }

    const domeR = Math.max(2, Math.floor(R * 0.5));
    for (let x = -domeR; x <= domeR; x++) {
      for (let z = -domeR; z <= domeR; z++) {
        const d2 = x * x + z * z;
        if (d2 <= domeR * domeR) {
          set(x, 1, z, B.GLASS);
          if (d2 <= (domeR - 1) * (domeR - 1)) {
            set(x, 2, z, B.GLASS);
          }
        }
      }
    }
    set(0, 1, 0, B.SEA_LANTERN);

    return blocks;
  }
};

export default spaceshipStructure;
