// The set for 一层又一层 · Layer by Layer: a sunny meadow with a wide stone building plaza
// (x −24…24, z −14…14) where the math models stand, Mei and Bo's cottage behind it to the north,
// oak trees around, and hills on the horizon. The plaza's top is y = 3.
import * as T from 'three';
import { BLOCKS as B } from '../blocks.js';
import { createStage, meshWorld, addSkyAndHorizon, rand } from './claudeStage.js';

export const PLAZA = { x0: -24, x1: 24, z0: -14, z1: 14 }, FLOOR = 3;

export async function buildMeadow() {
  const stage = await createStage({ seed: 314, chunks: 3 });
  const { put, fill } = stage;
  const height = (x, z) => {
    let h = 2;
    const far = Math.max(0, Math.hypot(x * .8, z) - 40);
    h += Math.floor(far * .22 + (far > 0 ? Math.sin(x * .13) * 1.4 + Math.cos(z * .11) * 1.2 : 0));
    return Math.max(2, Math.min(h, 24));
  };
  const onPlaza = (x, z) => x >= PLAZA.x0 && x <= PLAZA.x1 && z >= PLAZA.z0 && z <= PLAZA.z1;
  for (let x = -48; x < 64; x++) for (let z = -48; z < 64; z++) {
    const h = height(x, z);
    for (let y = 0; y <= h; y++) put(x, y, z, y === h ? B.GRASS : B.DIRT);
    if (onPlaza(x, z)) {
      // smooth stone with a calcite border and a faint 4-block grid, so sizes are easy to read
      const edge = x === PLAZA.x0 || x === PLAZA.x1 || z === PLAZA.z0 || z === PLAZA.z1;
      put(x, 2, z, edge ? B.STONE_BRICKS : (x % 8 === 0 || z % 8 === 0) ? B.CALCITE : B.SMOOTH_STONE);
      continue;
    }
    const r = rand(x, z, 1);
    if (r < .045 && Math.hypot(x, z) > 18) put(x, h + 1, z, r < .02 ? B.POPPY : B.DANDELION);
  }
  // Mei and Bo's cottage, north of the plaza, door facing south
  const [cx0, cx1, cz0, cz1] = [-5, 5, -27, -20];
  fill(cx0, 3, cz0, cx1, 3, cz1, B.OAK_PLANKS);
  for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) for (let y = 3; y <= 6; y++) {
    if (!(x === cx0 || x === cx1 || z === cz0 || z === cz1)) continue;
    let id = (x === cx0 || x === cx1) && (z === cz0 || z === cz1) ? B.OAK_LOG : y === 3 ? B.STONE_BRICKS : B.BIRCH_PLANKS;
    if (x === 0 && z === cz1 && y <= 5) id = B.AIR;
    if (y === 5 && z === cz1 && (x === -3 || x === 3)) id = B.GLASS;
    put(x, y, z, id);
  }
  for (let i = 0; i <= 4; i++) fill(cx0 - 1 + i, 7 + i, cz0 - 1, cx1 + 1 - i, 7 + i, cz1 + 1, i === 4 ? B.DARK_OAK_PLANKS : B.SPRUCE_PLANKS);
  fill(cx0 + 1, 4, cz0 + 1, cx1 - 1, 6, cz1 - 1, B.AIR);
  // oak trees, kept off the plaza and out of the main camera lines (cherry leaves render with holes in authored worlds)
  const tree = (x, z) => {
    const h = height(x, z), top = h + 5 + Math.floor(rand(x, z, 9) * 3), log = B.OAK_LOG, leaves = B.OAK_LEAVES;
    for (let y = h + 1; y <= top; y++) put(x, y, z, log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) * 1.5 <= 3.2 && (dx || dz || dy > 0) && rand(x + dx, z + dz, dy + 5) > .08) put(x + dx, top + dy, z + dz, leaves);
  };
  for (const [x, z] of [[-14, -24], [13, -25], [-22, -21], [22, -20], [-31, -8], [-32, 6], [31, -6], [32, 8], [-28, 20], [-12, 23], [12, 24], [27, 21], [4, 44], [-40, -20], [40, -18], [-38, 30], [38, 31]]) tree(x, z);
  meshWorld(stage);
  const groundAt = (x, z) => onPlaza(Math.floor(x), Math.floor(z)) ? FLOOR : height(Math.floor(x), Math.floor(z)) + 1;
  const sky = addSkyAndHorizon(stage, [[0, -170, 0, 1, 16, 0x8aa0a2, 1], [10, -230, 0, 1, 14, 0xa8b8bc, 2], [180, 0, 1, 0, 14, 0x8fa39a, 3], [-180, 0, 1, 0, 14, 0x8fa39a, 7], [0, 185, 0, -1, 16, 0x9fae98, 5], [-10, 245, 0, -1, 14, 0xb8c2b4, 6]]);
  return { ...stage, ...sky, groundAt };
}
