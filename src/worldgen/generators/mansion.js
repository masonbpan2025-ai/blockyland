// Woodland mansions, from the wiki (https://minecraft.wiki/w/Woodland_Mansion, /Structure and /Structure/Blueprints).
//
// From the pages:
//   * "generate rarely in dark forests" (and pale gardens, which are newer than this game);
//   * "all woodland mansions have ... three floors with a variety of rooms, and generate a cobblestone foundation
//     underneath the entire structure if there are any gaps between the bottom of the mansion and the ground. The top
//     floor is about half the size of the lower floors ... Each mansion includes a large foyer that leads to the
//     corridors connecting the rooms. A giant staircase ... leads up to the second floor";
//   * mobs: "The first floor of the mansion may only generate rooms that contain vindicators; from the second floor
//     upward, some large rooms may contain both evokers and vindicators. Rarely, a vindicator can spawn in the
//     corridors ... Allays are found imprisoned in cells inside 'jail' rooms, often guarded by a vindicator"; they do
//     not respawn (persistent);
//   * secret rooms on any floor with "no entrances at all" (obsidian, lava, spider, fake end portal, birch pillar,
//     chest, attic rooms);
//   * the woodland mansion chest loot.
//
// Every room, hallway, wall and the entrance are the Blueprints page's drawings: rooms come in one-cell (7 x 7),
// one-by-two (7 x 15) and two-by-two (15 x 15) footprints on a grid of 8-block cells. The floor plan is ours (the
// wiki does not describe vanilla's layout algorithm): a corridor spine from the foyer to the back with a cross
// corridor, rooms tiling the rest, the top floor on the middle half, one secret room a floor, outer walls with windows
// above the ground floor, a flat roof. Floors are 8 high (the top one 11), so the mansion fits this 64-tall world.

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { BlockBox } from '../geometry.js';
import { cellsOf } from '../blueprintStructure.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';
import { rotateCell, rotateFacing } from '../drawnPieces.js';
import { BLUEPRINTS } from './blueprints/woodland_mansion.js';

export const MANSION_LOOT = 'minecraft:chests/woodland_mansion';
export const GRID = 8;
export const CELLS = 8;
const FLOOR_HEIGHTS = [8, 8, 11];
const NOT_ROOMS = new Set(['entrance_decoration', 'windowless_outside_wall_segment', 'outside_wall_segment', 'solid_wall', '2nd_3rd_floor_solid_wall', 'entrance_to_a_room', 'straight_hallway', 'curved_hallway', 'dead_end', 't_intersection']);
export const SECRET_ROOMS = ['obsidian_room', 'lava_room', 'spider_room', 'explosive_end_portal_room', 'birch_pillar_room', 'cobblestone_treasure_room', 'roof_chest_room'];
export const JAILS = ['large_jail', 'medium_jail', 'small_jail'];
const footprintOf = (name) => { const [sx, , sz] = BLUEPRINTS[name].size; return sx >= 14 && sz >= 14 ? '2x2' : sz >= 14 ? '1x2' : sx >= 14 ? '2x1' : '1x1'; };
export const ROOMS = Object.keys(BLUEPRINTS).filter((k) => !NOT_ROOMS.has(k));

export function buildMansion({ seed, x, y, z, groundAt = () => y - 1 }) {
  const random = new LegacyRandom(BigInt(seed));
  const pick = (list) => list[random.nextIntBound(list.length)];
  const canvas = new CellCanvas();
  const pieces = [];
  const mobs = canvas.entities;
  const spawn = (type, bx, by, bz) => mobs.push({ type, x: bx + 0.5, y: by, z: bz + 0.5 });

  const place = (name, ox, oy, oz, rotation = 0, kind = 'room') => {
    const data = BLUEPRINTS[name];
    const [sx, sy, sz] = data.size;
    for (const c of cellsOf(data)) {
      const [lx, lz] = rotateCell(c.x, c.z, data.size, rotation);
      if (oy + c.y > 62) continue;
      let props = c.props;
      if (props?.facing) props = { ...props, facing: rotateFacing(props.facing, rotation) };
      const nbt = c.name === 'chest' ? { id: 'minecraft:chest', LootTable: MANSION_LOOT }
        : c.name === 'spawner' ? { id: 'minecraft:mob_spawner', SpawnData: { entity: { id: 'minecraft:spider' } } } : null;
      canvas.set(ox + lx, oy + c.y, oz + lz, c.name, props, nbt);
    }
    const [rx, rz] = rotation % 2 ? [sz, sx] : [sx, sz];
    const box = new BlockBox(ox, oy, oz, ox + rx - 1, Math.min(62, oy + sy - 1), oz + rz - 1);
    pieces.push({ box, kind, name });
    return box;
  };

  let floorY = y;
  for (let floor = 0; floor < 3; floor++) {
    const height = FLOOR_HEIGHTS[floor];
    const top = floor === 2;
    // The cells this floor covers: the whole square, or the middle half on the top floor.
    const inFloor = (cx, cz) => (top ? cx >= 2 && cx < CELLS - 2 && cz >= 1 && cz < CELLS - 2 : true);
    // The floor itself, dark oak planks under every cell.
    for (let bx = 0; bx < CELLS * GRID; bx++) for (let bz = 0; bz < CELLS * GRID; bz++) if (inFloor(Math.floor(bx / GRID), Math.floor(bz / GRID))) canvas.set(x + bx, floorY - 1, z + bz, 'dark_oak_planks');
    // Corridors: the spine (middle column, front to back) and a cross corridor.
    const used = new Set();
    const spine = CELLS / 2;
    const cross = top ? 3 : 4;
    for (let cz = 0; cz < CELLS; cz++) if (inFloor(spine, cz)) used.add(`${spine},${cz}`);
    for (let cx = 0; cx < CELLS; cx++) if (inFloor(cx, cross)) used.add(`${cx},${cross}`);
    for (const k of used) {
      const [cx, cz] = k.split(',').map(Number);
      const junction = cx === spine && cz === cross;
      place(junction ? 't_intersection' : 'straight_hallway', x + cx * GRID, floorY, z + cz * GRID, cx === spine ? 0 : 1, 'corridor');
      if (random.nextFloat() < 0.05) spawn('vindicator', x + cx * GRID + 3, floorY, z + cz * GRID + 3);
    }
    // The foyer's staircase on the ground floor, beside the entrance.
    if (floor === 0) { place(pick(['woodland_mansion_1x2_c_stairs', 'woodland_mansion_1x2_d_stairs']), x + (spine - 2) * GRID, floorY, z, 0, 'staircase'); for (const c of [0, 1]) used.add(`${spine - 2 + c},0`); }
    // Rooms: 2x2, then 1x2, then 1x1, over the free cells; one secret room per floor without a door.
    let secretPlaced = false;
    const free = (cx, cz) => cx >= 0 && cz >= 0 && cx < CELLS && cz < CELLS && inFloor(cx, cz) && !used.has(`${cx},${cz}`);
    const fit = (list) => list.filter((n) => BLUEPRINTS[n].size[1] <= height);
    for (let cz = 0; cz < CELLS; cz++) for (let cx = 0; cx < CELLS; cx++) {
      if (!free(cx, cz)) continue;
      let shape = '1x1';
      if (free(cx + 1, cz) && free(cx, cz + 1) && free(cx + 1, cz + 1) && random.nextFloat() < 0.4) shape = '2x2';
      else if (free(cx, cz + 1) && random.nextFloat() < 0.6) shape = '1x2';
      const secret = !secretPlaced && floor > 0 && random.nextFloat() < 0.15;
      let options = fit(ROOMS.filter((n) => footprintOf(n) === shape && (secret ? SECRET_ROOMS.includes(n) : !SECRET_ROOMS.includes(n))));
      if (!options.length) { shape = '1x1'; options = fit(ROOMS.filter((n) => footprintOf(n) === '1x1' && !SECRET_ROOMS.includes(n))); }
      if (!options.length) continue;
      const name = pick(options);
      const cellsUsed = shape === '2x2' ? [[0, 0], [1, 0], [0, 1], [1, 1]] : shape === '1x2' ? [[0, 0], [0, 1]] : [[0, 0]];
      for (const [dx, dz] of cellsUsed) used.add(`${cx + dx},${cz + dz}`);
      const box = place(name, x + cx * GRID, floorY, z + cz * GRID, 0, SECRET_ROOMS.includes(name) ? 'secret_room' : 'room');
      if (SECRET_ROOMS.includes(name)) secretPlaced = true;
      // Mobs: vindicators below; evokers with vindicators in large rooms above; allays in jails, guarded.
      const mid = [Math.floor((box.minX + box.maxX) / 2), floorY, Math.floor((box.minZ + box.maxZ) / 2)];
      if (JAILS.includes(name)) { spawn('allay', mid[0] - 1, mid[1], mid[2] - 1); spawn('allay', mid[0] + 1, mid[1], mid[2] + 1); spawn('vindicator', mid[0], mid[1], mid[2] + 2); }
      else if (floor > 0 && shape === '2x2' && random.nextFloat() < 0.5) { spawn('evoker', ...mid); spawn('vindicator', mid[0] + 2, mid[1], mid[2]); spawn('vindicator', mid[0] - 2, mid[1], mid[2]); }
      else if (!SECRET_ROOMS.includes(name) && random.nextFloat() < 0.4) spawn('vindicator', ...mid);
    }
    // Outer walls along the edge of this floor's cells: windows above the ground floor.
    for (let cx = 0; cx < CELLS; cx++) for (let cz = 0; cz < CELLS; cz++) {
      if (!inFloor(cx, cz)) continue;
      const wall = floor === 0 ? 'windowless_outside_wall_segment' : 'outside_wall_segment';
      if (!inFloor(cx, cz - 1) || cz === 0) place(wall, x + cx * GRID, floorY, z + cz * GRID - 2, 0, 'wall');
      if (!inFloor(cx, cz + 1) || cz === CELLS - 1) place(wall, x + cx * GRID, floorY, z + (cz + 1) * GRID, 2, 'wall');
      if (!inFloor(cx - 1, cz) || cx === 0) place(wall, x + cx * GRID - 2, floorY, z + cz * GRID, 3, 'wall');
      if (!inFloor(cx + 1, cz) || cx === CELLS - 1) place(wall, x + (cx + 1) * GRID, floorY, z + cz * GRID, 1, 'wall');
    }
    floorY += height;
  }
  // A flat roof of dark oak with a cobblestone rim over the top floor and over the parts of the second it leaves open.
  const roofY = Math.min(62, floorY);
  for (let bx = -2; bx < CELLS * GRID + 2; bx++) for (let bz = -2; bz < CELLS * GRID + 2; bz++) {
    const rim = bx < 0 || bz < 0 || bx >= CELLS * GRID || bz >= CELLS * GRID;
    const cx = Math.floor(bx / GRID); const cz = Math.floor(bz / GRID);
    const onTop = cx >= 2 && cx < CELLS - 2 && cz >= 1 && cz < CELLS - 2;
    const yy = onTop ? roofY : y + FLOOR_HEIGHTS[0] + FLOOR_HEIGHTS[1];
    canvas.set(x + bx, Math.min(62, yy), z + bz, rim ? 'cobblestone' : 'dark_oak_planks', null, null, { keep: true });
  }
  // The entrance at the front middle, and the cobblestone foundation down to the ground.
  place('entrance_decoration', x + (CELLS / 2) * GRID - 8, y - 1, z - BLUEPRINTS.entrance_decoration.size[2] + 4, 0, 'entrance');
  for (let bx = 0; bx < CELLS * GRID; bx++) for (let bz = 0; bz < CELLS * GRID; bz++) {
    for (let by = y - 2; by > groundAt(x + bx, z + bz) && by > 0; by--) canvas.set(x + bx, by, z + bz, 'cobblestone', null, null, { keep: true });
  }
  pieces.push({ box: new BlockBox(x, y - 1, z, x + CELLS * GRID - 1, y, z + CELLS * GRID - 1), kind: 'foundation' });
  return { canvas, pieces };
}

export function generateMansion({ seed, chunkX, chunkZ, structureId = 'mansion', context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const x = chunkX * 16 - 24; const z = chunkZ * 16 - 24;
  const groundAt = (gx, gz) => (context.surfaceY ? context.surfaceY(gx, gz) : 30);
  // Its ground floor on the highest ground of its four corners (a foundation fills under the rest).
  const y = Math.max(...[[0, 0], [63, 0], [0, 63], [63, 63], [32, 32]].map(([dx, dz]) => groundAt(x + dx, z + dz))) + 1;
  const { canvas, pieces } = buildMansion({ seed: random.nextInt(), x, y, z, groundAt });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:mansion', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x + 32, z + 32) : null,
    meta: { floorY: y, kinds: pieces.map((p) => p.kind), rooms: pieces.filter((p) => p.kind === 'room' || p.kind === 'secret_room').map((p) => p.name) }
  });
}

export function realizeMansion(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'woodland mansion: the Blueprints page\'s rooms on our floor plan' };
}
