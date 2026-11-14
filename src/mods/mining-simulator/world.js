// Mining Simulator's map: a walled meadow with three mines side by side in the middle -- the Wood Mine, the Stone
// Mine and the Iron Mine, one for each pickaxe tier -- the trader's plaza north of them, and eight plots in two rows,
// each with a house whose size follows its owner's house level.
//
// Everything here is a pure function of coordinates: every browser builds the map from it, and the rules (what may be
// broken, what a mined cell grows back as, where a player respawns) ask it the same questions. No Three.js, no DOM.
import { BLOCKS } from '../../blocks.js';
import { MAX_PLOTS } from './economy.js';

export const WORLD = Object.freeze({
  /** The top of the grass. Players walk at GROUND + 1. (The world is 64 blocks tall: y 0 to 63.) */
  ground: 40,
  /** The boundary wall stands at +-EXTENT on x and z. */
  extent: 48,
  wallHeight: 3,
  /** Each mine is 32 blocks deep, from the grass down, with a floor of bedrock under it. */
  mineDepth: 32,
  /** Mines are squares of side 2 * mineHalf + 1. */
  mineHalf: 6,
  /** Plots are squares of side 2 * plotHalf + 1 round their centres. */
  plotHalf: 7,
  /** How high above the ground a plot is cleared when its house is rebuilt. */
  plotClear: 14,
});
/** The mines' top (flush with the grass) and lowest diggable layer; the bedrock is one below `bottom`. */
export const MINE_TOP = WORLD.ground;
export const MINE_BOTTOM = WORLD.ground - WORLD.mineDepth + 1;

/**
 * One mine for each pickaxe tier: digging in it needs that pickaxe or better, and it holds what that pickaxe can
 * harvest. Ores are rarer near the top and richer near the bedrock.
 */
export const MINES = Object.freeze([
  { id: 'wood', name: 'Wood Mine', tier: 1, needs: 'Wooden Pickaxe', x: -18, z: 0, base: 'stone', ores: [['coal', 0.12]] },
  { id: 'stone', name: 'Stone Mine', tier: 2, needs: 'Stone Pickaxe', x: 0, z: 0, base: 'stone', ores: [['coal', 0.04], ['copper', 0.06], ['iron', 0.05], ['lapis', 0.03]] },
  { id: 'iron', name: 'Iron Mine', tier: 3, needs: 'Iron Pickaxe', x: 18, z: 0, base: 'deepslate', ores: [['iron', 0.03], ['gold', 0.04], ['redstone', 0.04], ['diamond', 0.02], ['emerald', 0.01]] },
].map(Object.freeze));

const ORE_BLOCKS = {
  stone: { coal: BLOCKS.COAL_ORE, copper: BLOCKS.COPPER_ORE, iron: BLOCKS.IRON_ORE, lapis: BLOCKS.LAPIS_ORE, gold: BLOCKS.GOLD_ORE, redstone: BLOCKS.REDSTONE_ORE, diamond: BLOCKS.DIAMOND_ORE, emerald: BLOCKS.EMERALD_ORE },
  deepslate: { coal: BLOCKS.DEEPSLATE_COAL_ORE, copper: BLOCKS.DEEPSLATE_COPPER_ORE, iron: BLOCKS.DEEPSLATE_IRON_ORE, lapis: BLOCKS.DEEPSLATE_LAPIS_ORE, gold: BLOCKS.DEEPSLATE_GOLD_ORE, redstone: BLOCKS.DEEPSLATE_REDSTONE_ORE, diamond: BLOCKS.DEEPSLATE_DIAMOND_ORE, emerald: BLOCKS.DEEPSLATE_EMERALD_ORE },
};
const BASE_BLOCKS = { stone: BLOCKS.STONE, deepslate: BLOCKS.DEEPSLATE };

/** Every ore block a mine can hold: the only blocks that drop anything in this world. */
export const MINE_ORE_BLOCKS = new Set(Object.values(ORE_BLOCKS).flatMap((m) => Object.values(m)));

/** The trader stands on the plaza north of the mines, looking at them. */
export const TRADER = Object.freeze({ x: 0.5, y: WORLD.ground + 1, z: -11.5, yaw: Math.PI });
const PLAZA = Object.freeze({ minX: -5, maxX: 5, minZ: -14, maxZ: -9 });

/**
 * The plots: two rows of four, north and south of the mines, every front door facing them.
 * Plot i belongs to whoever the ledger gives plot i.
 */
export const PLOTS = Object.freeze([
  { x: -12, z: 33, door: [0, -1] },
  { x: 12, z: 33, door: [0, -1] },
  { x: -12, z: -33, door: [0, 1] },
  { x: 12, z: -33, door: [0, 1] },
  { x: -36, z: 33, door: [0, -1] },
  { x: 36, z: 33, door: [0, -1] },
  { x: -36, z: -33, door: [0, 1] },
  { x: 36, z: -33, door: [0, 1] },
].map(Object.freeze));
if (PLOTS.length !== MAX_PLOTS) throw new Error('Mining Simulator: one plot per player');

/** A small integer hash of a cell, the same in every browser: the mines are built from it, and grow back to it. */
export function cellHash(x, y, z, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The mine a column belongs to, or null. */
export function mineColumn(x, z) {
  const h = WORLD.mineHalf;
  return MINES.find((m) => Math.abs(Math.floor(x) - m.x) <= h && Math.abs(Math.floor(z) - m.z) <= h) ?? null;
}

/** The mine a cell is a diggable part of, or null (the bedrock floor is not). */
export function mineAt(x, y, z) {
  if (y < MINE_BOTTOM || y > MINE_TOP) return null;
  return mineColumn(x, z);
}

export function inMine(x, y, z) {
  return mineAt(x, y, z) !== null;
}

/** What a mine cell is when the mine is full: its rock, or one of its ores. */
export function mineBlockAt(x, y, z) {
  const mine = mineAt(x, y, z);
  if (!mine) return null;
  // From 0.6 times the listed chance at the top to 1.4 times at the bottom.
  const depth = (MINE_TOP - y) / (WORLD.mineDepth - 1);
  const richness = 0.6 + 0.8 * depth;
  let roll = cellHash(x, y, z, 7);
  for (const [ore, chance] of mine.ores) {
    if (roll < chance * richness) return ORE_BLOCKS[mine.base][ore];
    roll -= chance * richness;
  }
  return BASE_BLOCKS[mine.base];
}

/** Which plot a column stands in, or null. */
export function plotAt(x, z) {
  const h = WORLD.plotHalf;
  for (let i = 0; i < PLOTS.length; i++) {
    const p = PLOTS[i];
    if (Math.abs(Math.floor(x) - p.x) <= h && Math.abs(Math.floor(z) - p.z) <= h) return i;
  }
  return null;
}

/** Where each mine's name hangs: over its north rim. */
export function mineLabel(mine) {
  return { x: mine.x + 0.5, y: WORLD.ground + 4, z: mine.z - WORLD.mineHalf - 1 + 0.5 };
}

/**
 * The map without the houses: the ground, the boundary wall, the plaza, the mines' walls and the full mines.
 * @returns {Array<[number, number, number, number]>} [x, y, z, block]
 */
export function terrainCells() {
  const cells = [];
  const { ground, extent, wallHeight } = WORLD;
  const h = WORLD.plotHalf;
  const bedrock = MINE_BOTTOM - 1;
  for (let x = -extent; x <= extent; x++) {
    for (let z = -extent; z <= extent; z++) {
      const edge = Math.abs(x) === extent || Math.abs(z) === extent;
      if (mineColumn(x, z)) {
        cells.push([x, bedrock, z, BLOCKS.BEDROCK]);
        for (let y = MINE_BOTTOM; y <= MINE_TOP; y++) cells.push([x, y, z, mineBlockAt(x, y, z)]);
        for (let y = MINE_TOP + 1; y <= ground + 4; y++) cells.push([x, y, z, BLOCKS.AIR]);
        continue;
      }
      const mineWall = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dz) => mineColumn(x + dx, z + dz)));
      if (mineWall) {
        // The mines' own walls, so their sides look like rock rather than a cut through the meadow.
        for (let y = bedrock; y < ground - 3; y++) cells.push([x, y, z, BLOCKS.STONE]);
      }
      cells.push([x, ground - 3, z, BLOCKS.BEDROCK]);
      cells.push([x, ground - 2, z, BLOCKS.DIRT]);
      cells.push([x, ground - 1, z, BLOCKS.DIRT]);
      const plaza = x >= PLAZA.minX && x <= PLAZA.maxX && z >= PLAZA.minZ && z <= PLAZA.maxZ;
      const plot = plotAt(x, z);
      const plotEdge = plot !== null && (Math.abs(x - PLOTS[plot].x) === h || Math.abs(z - PLOTS[plot].z) === h);
      const top = edge ? BLOCKS.STONE_BRICKS : plaza ? BLOCKS.SMOOTH_STONE : plotEdge ? BLOCKS.COBBLESTONE : mineWall ? BLOCKS.STONE_BRICKS : BLOCKS.GRASS;
      cells.push([x, ground, z, top]);
      for (let y = ground + 1; y <= ground + 4; y++) {
        const wall = edge && y <= ground + wallHeight;
        cells.push([x, y, z, wall ? BLOCKS.STONE_BRICKS : BLOCKS.AIR]);
      }
    }
  }
  // Lamp posts at the plaza's corners.
  for (const [x, z] of [[PLAZA.minX, PLAZA.minZ], [PLAZA.maxX, PLAZA.minZ], [PLAZA.minX, PLAZA.maxZ], [PLAZA.maxX, PLAZA.maxZ]]) {
    cells.push([x, ground + 1, z, BLOCKS.OAK_LOG], [x, ground + 2, z, BLOCKS.OAK_LOG], [x, ground + 3, z, BLOCKS.GLOWSTONE]);
  }
  return cells;
}

/** The houses, smallest first. */
export const HOUSE_STYLES = Object.freeze([
  null,
  { half: 2, height: 3, storeys: 1, wall: BLOCKS.OAK_PLANKS, corner: BLOCKS.OAK_LOG, floor: BLOCKS.OAK_PLANKS, roof: BLOCKS.OAK_PLANKS, windows: false, chests: 1 },
  { half: 3, height: 3, storeys: 1, wall: BLOCKS.COBBLESTONE, corner: BLOCKS.OAK_LOG, floor: BLOCKS.OAK_PLANKS, roof: BLOCKS.SPRUCE_PLANKS, windows: true, chests: 2 },
  { half: 4, height: 4, storeys: 1, wall: BLOCKS.BRICKS, corner: BLOCKS.STONE_BRICKS, floor: BLOCKS.SPRUCE_PLANKS, roof: BLOCKS.DARK_OAK_PLANKS, windows: true, chests: 3 },
  { half: 4, height: 8, storeys: 2, wall: BLOCKS.STONE_BRICKS, corner: BLOCKS.SPRUCE_LOG, floor: BLOCKS.SPRUCE_PLANKS, roof: BLOCKS.DARK_OAK_PLANKS, windows: true, chests: 4 },
  { half: 5, height: 8, storeys: 2, wall: BLOCKS.CALCITE, corner: BLOCKS.COBBLED_DEEPSLATE, floor: BLOCKS.DARK_OAK_PLANKS, roof: BLOCKS.DARK_OAK_PLANKS, windows: true, chests: 6 },
]);

/** A plot-local cell (right of the door, back from the front wall, up from the ground) in the world. */
function placer(plot) {
  const [fx, fz] = plot.door;
  // Right of someone walking out of the door.
  const rx = -fz, rz = fx;
  return (lx, ly, lz) => [plot.x + rx * lx - fx * lz, WORLD.ground + ly, plot.z + rz * lx - fz * lz];
}

/** The chest's facing in the chest module's terms (0..3): towards the front door. */
function chestFacing([fx, fz]) {
  if (fz === -1) return 0;
  if (fx === 1) return 1;
  if (fz === 1) return 2;
  return 3;
}

/**
 * A plot as it stands at a house level: every cell of the plot's volume (air included, so an upgrade clears the old
 * house), the chests, where its owner spawns, and where its name hangs.
 * @returns {{cells: Array<[number,number,number,number]>, chests: Array<{x,y,z,facing}>, spawn: {x,y,z,yaw}, label: {x,y,z}}}
 */
export function plotLayout(plotIndex, level) {
  const plot = PLOTS[plotIndex];
  if (!plot) throw new Error(`No plot ${plotIndex}`);
  const style = HOUSE_STYLES[Math.min(5, Math.max(1, level | 0))];
  const at = placer(plot);
  const H = WORLD.plotHalf;
  const w = style.half;
  const grid = new Map();
  const put = (lx, ly, lz, id) => grid.set(`${lx},${ly},${lz}`, id);
  // The plot's ground and the air above it.
  for (let lx = -H + 1; lx <= H - 1; lx++) {
    for (let lz = -H + 1; lz <= H - 1; lz++) {
      put(lx, 0, lz, BLOCKS.GRASS);
      for (let ly = 1; ly <= WORLD.plotClear; ly++) put(lx, ly, lz, BLOCKS.AIR);
    }
  }
  const midFloor = style.storeys === 2 ? Math.floor(style.height / 2) : null;
  for (let lx = -w; lx <= w; lx++) {
    for (let lz = -w; lz <= w; lz++) {
      const wallX = Math.abs(lx) === w, wallZ = Math.abs(lz) === w;
      put(lx, 0, lz, style.floor);
      put(lx, style.height + 1, lz, style.roof);
      if (midFloor && !wallX && !wallZ) put(lx, midFloor, lz, style.floor);
      if (!wallX && !wallZ) continue;
      for (let ly = 1; ly <= style.height; ly++) {
        let id = wallX && wallZ ? style.corner : style.wall;
        // Windows: in the middle of each wall, at eye height on every storey.
        const along = wallX ? lz : lx;
        const eye = ly === 2 || (midFloor && ly === midFloor + 2);
        if (style.windows && !(wallX && wallZ) && eye && Math.abs(along) === Math.ceil(w / 2)) id = BLOCKS.GLASS;
        put(lx, ly, lz, id);
      }
    }
  }
  // The doorway, in the middle of the front wall.
  put(0, 1, -w, BLOCKS.AIR);
  put(0, 2, -w, BLOCKS.AIR);
  // Light: a glowstone in each ceiling.
  put(0, style.height + 1, 0, BLOCKS.GLOWSTONE);
  if (midFloor) put(0, midFloor, 0, BLOCKS.GLOWSTONE);
  // Upstairs: steps in the front-left corner, with the floor open above them.
  if (midFloor) {
    const sx = -w + 1;
    for (let step = 0; step < midFloor - 1; step++) {
      const lz = -w + 2 + step;
      for (let ly = 1; ly <= step + 1; ly++) put(sx, ly, lz, style.wall);
      put(sx, midFloor, lz, BLOCKS.AIR);
    }
    put(sx, midFloor, -w + 1, BLOCKS.AIR);
  }
  // Chests along the back wall, two apart so no two join into a double chest; upstairs too in a two-storey house.
  const chestSpots = [];
  const rows = midFloor ? [1, midFloor + 1] : [1];
  const perRow = Math.ceil(style.chests / rows.length);
  for (const ly of rows) {
    for (let i = 0; i < perRow && chestSpots.length < style.chests; i++) {
      const lx = -w + 1 + i * 2 + (ly > 1 ? 2 : 0);
      if (lx > w - 1) break;
      chestSpots.push([lx, ly, w - 1]);
    }
  }
  const facing = chestFacing(plot.door);
  const chests = chestSpots.map(([lx, ly, lz]) => {
    put(lx, ly, lz, BLOCKS.CHEST);
    const [x, y, z] = at(lx, ly, lz);
    return { x, y, z, facing };
  });
  const cells = [];
  for (const [key, id] of grid) {
    const [lx, ly, lz] = key.split(',').map(Number);
    const [x, y, z] = at(lx, ly, lz);
    cells.push([x, y, z, id]);
  }
  const [sx, , sz] = at(0, 1, -w - 1);
  const [fx, fz] = plot.door;
  const [lx, ly, lz] = at(0, style.height + 3, 0);
  return {
    cells,
    chests,
    spawn: { x: sx + 0.5, y: WORLD.ground + 1, z: sz + 0.5, yaw: Math.atan2(-fx, -fz) },
    label: { x: lx + 0.5, y: ly, z: lz + 0.5 },
  };
}
