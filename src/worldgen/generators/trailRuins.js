// Trail ruins, from the wiki (https://minecraft.wiki/w/Trail_Ruins).
//
// From the page:
//   * taiga, snowy taiga, old growth spruce and pine taiga, old growth birch forest and jungle;
//   * "generate mostly underground with only the top of the tower above the ground ... a main road made of cobblestone,
//     stone, and stone bricks that connect multiple small buildings and a central tower made of stained terracotta and
//     glazed terracotta ... Adjacent to the tower generates two rooms and sometimes other small buildings and a decor
//     made out of mud bricks and terracotta. Most of the structure is buried in gravel, dirt, and coarse dirt, as well
//     as suspicious gravel"; "Trail ruins are completely solid; they don't have interior rooms";
//   * the pieces (tower, tower top, tower halls, buildings in groups, roads, decor) and their materials tables;
//   * archaeology: "All of the tower_top structure pieces and everything in the roads folder replace two gravel with
//     two common suspicious gravel. The rest replace nine gravel with six common suspicious gravel and three rare
//     suspicious gravel. Additionally, all of the processor lists (except for the one used for the tower_top) first
//     replace 20% of the gravel with dirt, then 10% of the remaining gravel with coarse dirt";
//   * no chests: the loot is in the suspicious gravel (common and rare trail ruins tables).
//
// The wiki publishes the pieces' materials but no drawings, so the shapes are ours: a tower of terracotta rings round a
// gravel core whose top course rises above the ground, two to four roads out from it, buildings and decor beside
// the roads, all solid and filled with gravel. This world is 64 tall: the tower top stands 2 above the ground.

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { BlockBox } from '../geometry.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';

export const TRAIL_LOOT = { common: 'minecraft:archaeology/trail_ruins_common', rare: 'minecraft:archaeology/trail_ruins_rare' };
export const DIRT_SHARE = 0.2;
export const COARSE_SHARE = 0.1;
const TERRACOTTA = ['blue_terracotta', 'red_terracotta', 'yellow_terracotta', 'white_terracotta', 'cyan_terracotta', 'light_gray_terracotta', 'orange_terracotta', 'brown_terracotta', 'gray_terracotta'];
const GLAZED = ['yellow_glazed_terracotta', 'light_gray_glazed_terracotta', 'cyan_glazed_terracotta', 'orange_glazed_terracotta', 'light_blue_glazed_terracotta', 'black_glazed_terracotta'];
const ROAD = ['cobblestone', 'stone', 'stone_bricks', 'cracked_stone_bricks', 'gravel'];
const FURNISHING = ['crafting_table', 'furnace', 'blast_furnace', 'loom', 'cartography_table', 'smithing_table', 'grindstone', 'composter', 'cauldron', 'campfire', 'damaged_anvil'];

export function buildTrailRuins({ seed, x, z, ground, groundAt = () => ground }) {
  const random = new LegacyRandom(BigInt(seed));
  const pick = (list) => list[random.nextIntBound(list.length)];
  const canvas = new CellCanvas();
  const pieces = [];
  const piece = (box, kind, archaeology) => { pieces.push({ box, kind, archaeology }); return pieces[pieces.length - 1]; };

  // The tower: rings of stained and glazed terracotta round a gravel core; only its top course clears the ground.
  const towerTop = ground + 2;
  const towerBottom = Math.max(2, towerTop - 14);
  const colours = [pick(TERRACOTTA), pick(TERRACOTTA)];
  const glaze = pick(GLAZED);
  for (let y = towerBottom; y <= towerTop; y++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
    if (Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
    const name = edge ? ((y - towerBottom) % 4 === 3 ? glaze : colours[(y >> 1) % 2]) : 'gravel';
    canvas.set(x + dx, y, z + dz, name, name === glaze ? { facing: ['north', 'east', 'south', 'west'][(dx + dz + 8) % 4] } : null);
  }
  piece(new BlockBox(x - 3, towerBottom, z - 3, x + 3, towerTop - 3, z + 3), 'tower', 'full');
  piece(new BlockBox(x - 3, towerTop - 2, z - 3, x + 3, towerTop, z + 3), 'tower_top', 'top');

  // The two rooms beside the tower: mud brick halls with terracotta, filled with gravel.
  const room = (x0, y0, z0, w, h, d, kind) => {
    const colour = pick(TERRACOTTA);
    for (let bx = x0; bx < x0 + w; bx++) for (let by = y0; by < y0 + h; by++) for (let bz = z0; bz < z0 + d; bz++) {
      const edge = bx === x0 || bx === x0 + w - 1 || bz === z0 || bz === z0 + d - 1 || by === y0;
      canvas.set(bx, by, bz, edge ? (random.nextFloat() < 0.25 ? colour : 'mud_bricks') : 'gravel', null, null, { keep: true });
    }
    canvas.set(x0 + 1, y0 + 1, z0 + 1, pick(FURNISHING), null, null);
    canvas.set(x0 + w - 2, y0 + h - 1, z0 + 1, 'mud_brick_slab', { type: 'bottom' });
    canvas.set(x0 + 1, y0 + 2, z0 + d - 2, 'mud_brick_stairs', { facing: 'north', half: 'bottom' });
    return piece(new BlockBox(x0, y0, z0, x0 + w - 1, y0 + h - 1, z0 + d - 1), kind, 'full');
  };
  room(x + 4, towerBottom + 4, z - 3, 7, 5, 7, 'tower_hall');
  room(x - 10, towerBottom + 4, z - 3, 7, 5, 7, 'tower_hall');

  // Roads out from the tower, with buildings and decor beside them.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const roads = 2 + random.nextIntBound(3);
  for (let r = 0; r < roads; r++) {
    const [dx, dz] = dirs[r];
    const length = 10 + random.nextIntBound(14);
    const start = dx ? 11 : 4;
    // Buried under the lowest ground along it (and under its building at the end).
    let low = ground;
    for (let a = start - 2; a < start + length + 8; a++) for (let w = -3; w <= 3; w++) low = Math.min(low, groundAt(x + dx * a + (dz ? w : 0), z + dz * a + (dx ? w : 0)));
    const y = low - 5 - random.nextIntBound(2);
    for (let a = start; a < start + length; a++) for (let w = -1; w <= 1; w++) {
      const bx = x + dx * a + (dz ? w : 0); const bz = z + dz * a + (dx ? w : 0);
      canvas.set(bx, y, bz, pick(ROAD), null, null, { keep: true });
      canvas.set(bx, y + 1, bz, 'gravel', null, null, { keep: true });
    }
    const [ax, az] = [x + dx * start, z + dz * start]; const [bx, bz] = [x + dx * (start + length - 1), z + dz * (start + length - 1)];
    piece(new BlockBox(Math.min(ax, bx) - (dz ? 1 : 0), y, Math.min(az, bz) - (dx ? 1 : 0), Math.max(ax, bx) + (dz ? 1 : 0), y + 1, Math.max(az, bz) + (dx ? 1 : 0)), 'road', 'top');
    // A building group at the road's end, and decor along it.
    const ex = x + dx * (start + length + 1) - 2; const ez = z + dz * (start + length + 1) - 2;
    if (random.nextFloat() < 0.7 && !pieces.some((p) => p.box.intersects(new BlockBox(ex, y, ez, ex + 4, y + 3, ez + 4)))) room(ex, y, ez, 5, 4, 5, 'building');
    if (random.nextFloat() < 0.5) {
      const mx = x + dx * (start + 4) + (dz ? 3 : 0); const mz = z + dz * (start + 4) + (dx ? 3 : 0);
      for (let k = 0; k < 4; k++) canvas.set(mx + (k % 2), y + 1 + (k >> 1), mz, k === 3 ? pick(TERRACOTTA) : 'mud_bricks', null, null, { keep: true });
      piece(new BlockBox(mx, y + 1, mz, mx + 1, y + 2, mz), 'decor', 'full');
    }
  }

  // The processors, piece by piece: dirt, coarse dirt, then the suspicious gravel.
  for (const p of pieces) {
    const gravel = [...canvas.cells.values()].filter((c) => c.name === 'gravel' && p.box.contains(c.x, c.y, c.z) && !c.processed);
    for (const c of gravel) c.processed = true;
    let rest = gravel;
    if (p.kind !== 'tower_top') {
      for (const c of rest) if (random.nextFloat() < DIRT_SHARE) c.name = 'dirt';
      rest = rest.filter((c) => c.name === 'gravel');
      for (const c of rest) if (random.nextFloat() < COARSE_SHARE) c.name = 'coarse_dirt';
      rest = rest.filter((c) => c.name === 'gravel');
    }
    const [common, rare] = p.archaeology === 'top' ? [2, 0] : [6, 3];
    for (let i = 0; i < common + rare && rest.length; i++) {
      const c = rest.splice(random.nextIntBound(rest.length), 1)[0];
      c.name = 'suspicious_gravel';
      c.nbt = { id: 'minecraft:brushable_block', LootTable: i < common ? TRAIL_LOOT.common : TRAIL_LOOT.rare };
    }
  }
  for (const c of canvas.cells.values()) delete c.processed;
  return { canvas, pieces };
}

export function generateTrailRuins({ seed, chunkX, chunkZ, structureId = 'trail_ruins', context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const x = chunkX * 16 + 8; const z = chunkZ * 16 + 8;
  const ground = context.surfaceY ? context.surfaceY(x, z) : 40;
  const groundAt = (gx, gz) => (context.surfaceY ? context.surfaceY(gx, gz) : ground);
  const { canvas, pieces } = buildTrailRuins({ seed: random.nextInt(), x, z, ground, groundAt });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:trail_ruins', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    meta: { ground, towerTop: ground + 2, kinds: pieces.map((p) => p.kind) }
  });
}

export function realizeTrailRuins(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'trail ruins: buried, built to the wiki\'s pieces and processors' };
}
