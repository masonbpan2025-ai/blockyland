import { BLOCKS } from '../blocks.js';

export const pyramidBuilding = {
  id: 'pyramid',
  name: 'Pyramid',
  icon: '/assets/blocks/sandstone.png',
  description: 'Stepped sandstone pyramid with golden capstone and torches',
  parameters: [
    { id: 'baseSize', name: 'Base Size', symbol: 'B', default: 15, min: 5, max: 35, step: 2 },
    { id: 'height', name: 'Height', symbol: 'H', default: 8, min: 3, max: 20, step: 1 }
  ],
  code: `function generate(origin, params, BLOCKS) {
  const blocks = [];
  let B = Math.max(5, Math.round(params.baseSize || 15));
  if (B % 2 === 0) B += 1; // force odd for centered apex
  const H = Math.min(Math.floor((B + 1) / 2), Math.max(3, Math.round(params.height || 8)));
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

  for (let layer = 0; layer < H; layer++) {
    const minCoord = layer;
    const maxCoord = B - 1 - layer;
    if (minCoord > maxCoord) break;

    const isApex = (layer === H - 1 || minCoord === maxCoord);
    const blockId = isApex ? BLOCKS.GLOWSTONE : BLOCKS.SANDSTONE;

    for (let x = minCoord; x <= maxCoord; x++) {
      for (let z = minCoord; z <= maxCoord; z++) {
        // Hollow interior for layers >= 1
        const isOuter = (x === minCoord || x === maxCoord || z === minCoord || z === maxCoord);
        if (layer === 0 || isOuter || isApex) {
          set(x, layer, z, blockId);
        }
      }
    }

    // Corner torches on step corners
    if (!isApex && layer > 0 && layer % 2 === 0) {
      set(minCoord, layer + 1, minCoord, BLOCKS.TORCH);
      set(maxCoord, layer + 1, minCoord, BLOCKS.TORCH);
      set(minCoord, layer + 1, maxCoord, BLOCKS.TORCH);
      set(maxCoord, layer + 1, maxCoord, BLOCKS.TORCH);
    }
  }

  return blocks;
}`,
  generate(origin, params, B = BLOCKS) {
    const blocks = [];
    let base = Math.max(5, Math.round(params.baseSize || 15));
    if (base % 2 === 0) base += 1;
    const H = Math.min(Math.floor((base + 1) / 2), Math.max(3, Math.round(params.height || 8)));
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const set = (x, y, z, id) => blocks.push({ x: ox + x, y: oy + y, z: oz + z, id });

    for (let layer = 0; layer < H; layer++) {
      const minCoord = layer;
      const maxCoord = base - 1 - layer;
      if (minCoord > maxCoord) break;

      const isApex = (layer === H - 1 || minCoord === maxCoord);
      const blockId = isApex ? B.GLOWSTONE : B.SANDSTONE;

      for (let x = minCoord; x <= maxCoord; x++) {
        for (let z = minCoord; z <= maxCoord; z++) {
          const isOuter = (x === minCoord || x === maxCoord || z === minCoord || z === maxCoord);
          if (layer === 0 || isOuter || isApex) {
            set(x, layer, z, blockId);
          }
        }
      }

      if (!isApex && layer > 0 && layer % 2 === 0) {
        set(minCoord, layer + 1, minCoord, B.TORCH);
        set(maxCoord, layer + 1, minCoord, B.TORCH);
        set(minCoord, layer + 1, maxCoord, B.TORCH);
        set(maxCoord, layer + 1, maxCoord, B.TORCH);
      }
    }

    return blocks;
  }
};

export default pyramidBuilding;
