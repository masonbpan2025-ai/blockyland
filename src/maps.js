// Maps that draw the world.
//
// Wiki (Map): using an empty map creates a map "centered on the player's position" -- snapped to a grid of 128 x 2^scale
// blocks -- that "automatically draws" the terrain the holder explores; each pixel is the top block's map colour,
// shaded by its height against the pixel to its north; a map can be zoomed out with paper (8 around it in a crafting
// table, up to scale 4, each step doubling the blocks per pixel). Found by the wiki-tutorial play-test (Mapping: "how
// they automatically draw themselves as you move through the world"): a filled map was an inert item with nothing on it.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const MAP_SIZE = 128;
export const MAX_SCALE = 4;
const NAME = new Map(Object.entries(BLOCKS).map(([k, v]) => [v, k]));

// The wiki's base map colours (Map item format, "Base colors"), by block family.
const COLOR_RULES = [
  [/WATER|KELP|SEAGRASS|BUBBLE/, 0x4040ff], [/LAVA/, 0xff0000], [/^ICE|PACKED_ICE|BLUE_ICE/, 0xa0a0ff],
  [/SNOW|POWDER_SNOW|WHITE_/, 0xffffff], [/GRASS_BLOCK|^GRASS$|SLIME/, 0x7fb238], [/LEAVES|SHORT_GRASS|FERN|VINE|FLOWER|SAPLING|BUSH|CACTUS|WHEAT|CARROTS|POTATOES|BEETROOTS|TALL_GRASS/, 0x007c00],
  [/RED_SAND|TERRACOTTA|ACACIA/, 0xd87f33], [/SAND|BIRCH|GLOWSTONE|END_STONE|BONE/, 0xf7e9a3], [/CLAY/, 0xa4a8b8],
  [/DIRT|FARMLAND|PATH|COARSE|ROOTED|GRANITE|JUNGLE|MUD$/, 0x976d4d], [/PODZOL|SPRUCE|MANGROVE/, 0x815631],
  [/NETHERRACK|NETHER_BRICK|CRIMSON|MAGMA/, 0x700200], [/WARPED/, 0x167e86], [/SOUL/, 0x664c33], [/OBSIDIAN|BLACK|COAL_BLOCK|BASALT|BLACKSTONE/, 0x191919],
  [/LOG|PLANKS|WOOD|CRAFTING|CHEST|BOOKSHELF|FENCE|DOOR|NOTE_BLOCK|DARK_OAK/, 0x8f7748], [/IRON_BLOCK|ANVIL/, 0xa7a7a7], [/GOLD_BLOCK/, 0xfaee4d],
  [/DIAMOND_BLOCK|PRISMARINE_BRICKS|BEACON/, 0x5cdbd5], [/EMERALD_BLOCK/, 0x00d93a], [/LAPIS_BLOCK/, 0x4a80ff], [/REDSTONE_BLOCK/, 0xff0000],
  [/QUARTZ|DIORITE|CALCITE/, 0xfffcf5], [/DEEPSLATE/, 0x646464], [/STONE|COBBLE|ANDESITE|GRAVEL|ORE|BEDROCK|FURNACE|BRICK|TUFF/, 0x707070],
];

/** The base colour a block shows on a map (0 = nothing). */
export function mapColorOf(id) {
  if (id === BLOCKS.AIR || id === undefined || id === null) return 0;
  const name = NAME.get(id) ?? '';
  for (const [re, color] of COLOR_RULES) if (re.test(name)) return color;
  return BLOCK_DEFS[id]?.solid === false ? 0x007c00 : 0x707070;
}

/** Where a new map's centre lands: Java snaps it to the scale's 128 x 2^scale grid. */
export function mapCenter(coord, scale = 0) {
  const span = MAP_SIZE * (1 << scale);
  return Math.floor((coord + 64) / span) * span + span / 2 - 64;
}

export function createMapData(x, z, scale = 0, dimension = 'overworld') {
  return { centerX: mapCenter(x, scale), centerZ: mapCenter(z, scale), scale, dimension, colors: new Uint32Array(MAP_SIZE * MAP_SIZE), heights: new Int16Array(MAP_SIZE * MAP_SIZE), version: 0, nextColumn: 0 };
}

function topBlock(world, x, z, fromY) {
  for (let y = fromY; y >= 0; y--) {
    const id = world.getVoxel(x, y, z);
    if (id !== BLOCKS.AIR && mapColorOf(id)) return { id, y };
  }
  return null;
}

/**
 * Draw what the holder can see onto the map: Java explores pixels within 128 / 2^scale pixels of the player, a few
 * columns at a time. `columns` per call keeps the cost per frame small. Returns true if anything changed.
 */
export function exploreMap(data, world, px, pz, { columns = 8, top = 63 } = {}) {
  if (!data || !world?.getVoxel) return false;
  const step = 1 << data.scale, radius = Math.floor(MAP_SIZE / step);
  const ppx = Math.floor((px - data.centerX) / step) + 64, ppz = Math.floor((pz - data.centerZ) / step) + 64;
  let changed = false;
  for (let c = 0; c < columns; c++) {
    const col = data.nextColumn; data.nextColumn = (data.nextColumn + 1) % MAP_SIZE;
    if (Math.abs(col - ppx) > radius) continue;
    for (let row = 0; row < MAP_SIZE; row++) {
      if ((col - ppx) ** 2 + (row - ppz) ** 2 > radius * radius) continue;
      const wx = data.centerX + (col - 64) * step, wz = data.centerZ + (row - 64) * step;
      const hit = topBlock(world, wx, wz, top);
      if (!hit) continue;
      const i = row * MAP_SIZE + col;
      // Height shading against the pixel to the north: higher 255, level 220, lower 180 (of 255).
      const north = row > 0 ? data.heights[i - MAP_SIZE] : hit.y;
      const shade = hit.y > north ? 1 : hit.y === north ? 220 / 255 : 180 / 255;
      const base = mapColorOf(hit.id);
      const color = (Math.round(((base >> 16) & 255) * shade) << 16) | (Math.round(((base >> 8) & 255) * shade) << 8) | Math.round((base & 255) * shade);
      if (data.colors[i] !== (color | 0xff000000) >>> 0) { data.colors[i] = (color | 0xff000000) >>> 0; data.heights[i] = hit.y; changed = true; }
    }
  }
  if (changed) data.version++;
  return changed;
}

/** Zooming out with paper: the map and 8 paper make the same map one scale up (max 4), recentred for that scale. */
export function mapZoomResult(grid) {
  const items = grid.filter((s) => s && s.count > 0);
  const map = items.find((s) => s.id === 'filled_map');
  if (!map || items.length !== 9 || items.filter((s) => s.id === 'paper').length !== 8) return null;
  const old = map.mapData;
  if (!old || old.scale >= MAX_SCALE) return null;
  const mapData = createMapData(old.centerX, old.centerZ, old.scale + 1, old.dimension);
  return { id: 'filled_map', isBlock: false, count: 1, mapData, mapZoom: true };
}
