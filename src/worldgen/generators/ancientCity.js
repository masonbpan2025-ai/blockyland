// Ancient cities, from the wiki (https://minecraft.wiki/w/Ancient_City, /Structure and /Structure/Blueprints).
//
// From the pages:
//   * deep dark only; "a massive palace with a footprint of around 220 blocks on each horizontal axis ... The floor of
//     the city always generates at Y=-51 and is about 20 blocks high. The palace is made up of long corridors with
//     2-block-deep floors of gray wool ... Off to the sides of the main corridors are smaller ruin structures, which
//     often contain one or two loot chests. The city's center features a frame resembling a portal" of reinforced
//     deepslate;
//   * loot: the ancient city chests, and the ice box's own table;
//   * the warden comes from sculk shriekers, not from the structure (no mob is placed).
//
// The pieces are the Blueprints page's drawings: the city centre (drawn as one half; mirrored here to make the whole),
// the entrance connector and paths, the walls, and the buildings (barracks, camps, chambers, ice box, pillars,
// ruins, sauna, statue, tall ruins). The Blueprints page does not draw how they join, so the plan is ours: the centre
// in the middle, the entrance path out of its front, buildings on a ring of plots round it joined by gray-wool
// corridors, and the walls along the edge, in a city about 150 across (this world is 64 tall and the city must fit
// the chunks round it). Its floor is at y 13 here (-51 is 13 above vanilla's floor).

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { BlockBox } from '../geometry.js';
import { cellsOf } from '../blueprintStructure.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';
import { rotateCell, rotateFacing } from '../drawnPieces.js';
import { BLUEPRINTS } from './blueprints/ancient_city.js';

export const CITY_FLOOR_Y = 13;
export const CITY_LOOT = { chest: 'minecraft:chests/ancient_city', ice_box: 'minecraft:chests/ancient_city_ice_box' };
export const CITY_HALF = 75;

const bySource = (file) => Object.values(BLUEPRINTS).find((b) => b.source.endsWith(`/${file}.txt`));
export const BUILDINGS = ['Barracks', 'Camp_1', 'Camp_2', 'Camp_3', 'Chamber_1', 'Chamber_2', 'Chamber_3', 'Ice_Box_1', 'Large_Pillar_1', 'Large_Ruin_1', 'Medium_Pillar_1', 'Medium_Ruin_1', 'Medium_Ruin_2', 'Sauna_1', 'Small_Ruin_1', 'Small_Ruin_2', 'Small_Statue', 'Tall_Ruin_1', 'Tall_Ruin_2', 'Tall_Ruin_3', 'Tall_Ruin_4'];
const WALLS = ['Left_Wall', 'Right_Wall', 'Top_Wall', 'Bottom_1_Wall'];
const PATHS = ['Entrance_Path_1', 'Entrance_Path_2', 'Entrance_Path_3', 'Entrance_Path_4', 'Entrance_Path_5'];

export function buildAncientCity({ seed, x, z }) {
  const random = new LegacyRandom(BigInt(seed));
  const canvas = new CellCanvas();
  const pieces = [];
  const y0 = CITY_FLOOR_Y;

  /** Place a drawing with its north-west corner at (ox, oz), turned and optionally mirrored. */
  const place = (file, ox, oy, oz, rotation = 0, kind = file, { mirror = false, loot = CITY_LOOT.chest } = {}) => {
    const data = bySource(file);
    if (!data) return null;
    const size = data.size;
    const [rx, rz] = rotation % 2 ? [size[2], size[0]] : [size[0], size[2]];
    const box = new BlockBox(ox, oy, oz, ox + rx - 1, oy + size[1] - 1, oz + rz - 1);
    if (box.maxY > 62 || pieces.some((p) => p.kind !== 'corridor' && p.box.intersects(box))) return null;
    for (const c of cellsOf(data)) {
      const cx = mirror ? size[0] - 1 - c.x : c.x;
      const [lx, lz] = rotateCell(cx, c.z, size, rotation);
      let props = c.props;
      if (props?.facing) {
        const f = mirror && (props.facing === 'east' || props.facing === 'west') ? (props.facing === 'east' ? 'west' : 'east') : props.facing;
        props = { ...props, facing: rotateFacing(f, rotation) };
      }
      const nbt = c.name === 'chest' ? { id: 'minecraft:chest', LootTable: loot } : null;
      canvas.set(ox + lx, oy + c.y, oz + lz, c.name, props, nbt);
    }
    pieces.push({ box, kind });
    return box;
  };

  // The city centre: the drawn half and its mirror, side by side, in the middle.
  const center = random.nextFloat() < 0.5 ? 'City_Center_1' : 'City_Center_2';
  const cw = bySource(center).size[0]; const cd = bySource(center).size[2];
  place(center, x - cw, y0, z - Math.floor(cd / 2), 0, 'city_center');
  place(center, x, y0, z - Math.floor(cd / 2), 0, 'city_center', { mirror: true });
  // The reinforced deepslate frame "resembling a portal" in the centre's middle.
  for (let dx = -4; dx <= 4; dx++) for (let dy = 0; dy <= 8; dy++) if (Math.abs(dx) === 4 || dy === 8 || dy === 0) canvas.set(x + dx, y0 + 8 + dy, z, 'reinforced_deepslate');

  // The entrance: the connector and a path out of the centre's front (south).
  const conn = bySource('Entrance_Connector');
  const front = z + Math.ceil(cd / 2);
  place('Entrance_Connector', x - Math.floor(conn.size[0] / 2), y0, front + 2, 0, 'entrance');
  const path = PATHS[random.nextIntBound(PATHS.length)];
  place(path, x - Math.floor(bySource(path).size[0] / 2), y0, front + 2 + conn.size[2] + 2, 0, 'entrance');

  // Gray-wool corridors (two deep) on a grid, lined with deepslate tiles, then buildings on the plots between them.
  const corridor = (ax, az, bx, bz) => {
    for (let cx = Math.min(ax, bx); cx <= Math.max(ax, bx); cx++) for (let cz = Math.min(az, bz); cz <= Math.max(az, bz); cz++) {
      canvas.set(cx, y0 - 1, cz, 'gray_wool', null, null, { keep: true });
      canvas.set(cx, y0, cz, 'gray_wool', null, null, { keep: true });
      for (let up = 1; up <= 5; up++) canvas.set(cx, y0 + up, cz, 'air', null, null, { keep: true });
    }
    pieces.push({ box: new BlockBox(Math.min(ax, bx), y0 - 1, Math.min(az, bz), Math.max(ax, bx), y0 + 5, Math.max(az, bz)), kind: 'corridor' });
  };
  const step = 30;
  for (let g = -2; g <= 2; g++) {
    corridor(x + g * step - 1, z - CITY_HALF + 6, x + g * step + 1, z + CITY_HALF - 6);
    corridor(x - CITY_HALF + 6, z + g * step - 1, x + CITY_HALF - 6, z + g * step + 1);
  }
  for (let gx = -2; gx < 2; gx++) for (let gz = -2; gz < 2; gz++) {
    const ox = x + gx * step + 3; const oz = z + gz * step + 3;
    for (let tries = 0; tries < 3; tries++) {
      const file = BUILDINGS[random.nextIntBound(BUILDINGS.length)];
      const loot = file === 'Ice_Box_1' ? CITY_LOOT.ice_box : CITY_LOOT.chest;
      if (place(file, ox, y0, oz, random.nextIntBound(4), 'building', { loot })) break;
    }
  }
  // The walls along the edge (north, west, east), the entrance side left open.
  for (const [file, ox, oz, rotation] of [['Top_Wall', x - 20, z - CITY_HALF, 0], ['Left_Wall', x - CITY_HALF, z - 20, 0], ['Right_Wall', x + CITY_HALF - 14, z - 20, 0], ['Bottom_1_Wall', x - 20, z + CITY_HALF - 14, 0]]) {
    place(file, ox, y0, oz, rotation, 'wall');
  }
  return { canvas, pieces, center };
}

export function generateAncientCity({ seed, chunkX, chunkZ, structureId = 'ancient_city', context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const x = chunkX * 16 + 8; const z = chunkZ * 16 + 8;
  const { canvas, pieces, center } = buildAncientCity({ seed: random.nextInt(), x, z });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:ancient_city', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    meta: { floorY: CITY_FLOOR_Y, center, kinds: pieces.map((p) => p.kind) }
  });
}

export function realizeAncientCity(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'ancient city: the Blueprints page\'s drawings on our plan' };
}
