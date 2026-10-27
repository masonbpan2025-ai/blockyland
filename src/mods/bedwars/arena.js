// The Bed Wars map: floating islands in the void, laid out as Hypixel's maps are (Bed Wars, Hypixel wiki: "Each team
// island features two important components: A bed and a resource generator"; diamonds "typically found on islands
// positioned between team bases"; emeralds "typically found in the middle of the map").
//
// Each team's island has, from the back: its forge (the iron and gold generator) with the spawn in front of it, the
// item shop and the team upgrades on either side, the team chest, and the bed toward the front, facing the middle.
// Diamond islands sit between the bases; the middle island carries the emerald generators. Before the game everyone
// waits in a glass room above the middle.
//
// Pure and seeded, as SkyWars' arena is (../skywars/arena.js): the host and every guest build the same map from
// { teams, theme, seed }, and tests can check it without a browser.
import { BLOCKS } from '../../blocks.js';
import { seededRandom, cellKey } from '../skywars/generator.js';
import { TEAMS } from './teams.js';

export { cellKey };

export const ARENA = Object.freeze({
  /** The top of every island; players stand one above it. The world is 64 blocks tall. */
  surfaceY: 30,
  /** Below this a player has fallen into the void (Hypixel kills at once, as SkyWars does here). */
  voidY: -4,
  /** The waiting room's floor, above the middle. */
  lobbyY: 52,
  /** How far from a base's centre counts as "in the base": its traps and its Heal Pool reach this far. */
  baseRadius: 14,
  /** Nothing can be placed this close to a generator or a spawn (Hypixel keeps them clear). */
  keepClear: 2,
  minY: 4,
  maxY: 60,
});

/**
 * The map themes: what the islands are made of. Hypixel's maps differ in look, not in layout, and so do these.
 */
export const THEMES = Object.freeze({
  meadow: {
    name: 'Meadow', description: 'Grass islands with oak trees and stone-brick plazas.',
    top: 'GRASS', under: 'DIRT', deep: 'STONE', plaza: 'STONE_BRICKS', trim: 'CHISELED_STONE_BRICKS',
    log: 'OAK_LOG', leaves: 'OAK_LEAVES', flowers: ['POPPY', 'DANDELION', 'SHORT_GRASS'],
  },
  desert: {
    name: 'Desert', description: 'Sand islands with sandstone plazas and cacti.',
    top: 'SAND', under: 'SANDSTONE', deep: 'SANDSTONE', plaza: 'CUT_SANDSTONE', trim: 'SMOOTH_SANDSTONE',
    log: null, leaves: null, cactus: true, flowers: ['DEAD_BUSH'],
  },
  frost: {
    name: 'Frost', description: 'Snowy islands with spruce trees and packed-ice paths.',
    top: 'SNOW', under: 'DIRT', deep: 'STONE', plaza: 'PACKED_ICE', trim: 'POLISHED_ANDESITE',
    log: 'SPRUCE_LOG', leaves: 'SPRUCE_LEAVES', flowers: [],
  },
});
export const THEME_IDS = Object.freeze(Object.keys(THEMES));

export const DEFAULT_MAP = Object.freeze({ teams: 4, theme: 'meadow', seed: 2017 });

/** A map this build can make: two, four or eight teams, a known theme, a whole seed. */
export function normalizeMap(map = {}) {
  const teams = [2, 4, 8].includes(map.teams) ? map.teams : DEFAULT_MAP.teams;
  const theme = THEMES[map.theme] ? map.theme : DEFAULT_MAP.theme;
  const seed = Number.isFinite(map.seed) ? map.seed >>> 0 : DEFAULT_MAP.seed;
  return { teams, theme, seed };
}
export const mapKey = (map) => `${map?.teams}/${map?.theme}/${map?.seed >>> 0}`;

/**
 * Where each base stands and which way it faces (toward the middle, along a compass direction so its blocks stay square):
 * two on opposite sides; four, one on each side; eight, two on each side.
 */
export function baseLayout(teams) {
  const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // north, east, south, west: where the base is
  const out = [];
  if (teams === 2) {
    for (const [sx, sz] of [sides[0], sides[2]]) out.push({ x: sx * 44, z: sz * 44, fx: -sx, fz: -sz });
  } else if (teams === 4) {
    for (const [sx, sz] of sides) out.push({ x: sx * 44, z: sz * 44, fx: -sx, fz: -sz });
  } else {
    // Two to a side, either side of its middle, in order round the map.
    for (const [sx, sz] of sides) {
      const rx = -sz, rz = sx; // along the side
      for (const along of [-1, 1]) out.push({ x: sx * 52 + rx * along * 19, z: sz * 52 + rz * along * 19, fx: -sx, fz: -sz });
    }
  }
  return out;
}

/** Where the diamond islands are: between the bases. */
export function diamondLayout(teams) {
  if (teams === 2) return [{ x: 26, z: 0 }, { x: -26, z: 0 }];
  const d = teams === 8 ? 38 : 30;
  return [{ x: d, z: -d }, { x: d, z: d }, { x: -d, z: d }, { x: -d, z: -d }];
}

/** Where the emerald generators are on the middle island: four with eight teams, two otherwise (Hypixel). */
export function emeraldLayout(teams) {
  return teams === 8 ? [{ x: 4, z: 4 }, { x: -4, z: -4 }, { x: 4, z: -4 }, { x: -4, z: 4 }] : [{ x: 4, z: 0 }, { x: -4, z: 0 }];
}

class Builder {
  constructor(seed, theme) {
    this.random = seededRandom(seed);
    this.blocks = new Map();
    this.theme = theme;
    this.block = (name) => (typeof name === 'number' ? name : BLOCKS[name] ?? BLOCKS.STONE);
  }

  set(x, y, z, id) { if (y >= ARENA.minY && y <= ARENA.maxY) this.blocks.set(cellKey(x, y, z), typeof id === 'number' ? id : this.block(id)); }
  get(x, y, z) { return this.blocks.get(cellKey(x, y, z)) ?? BLOCKS.AIR; }

  /**
   * An island's top at ARENA.surfaceY over the cells `inside(x, z)` says, with the earth hanging below it deepest at the
   * middle -- a floating island, as SkyWars' are. `edge(x, z)` marks the rim, which `rim` paints.
   */
  island(cells, { rim = null } = {}) {
    const set = new Set(cells.map(([x, z]) => `${x},${z}`));
    const has = (x, z) => set.has(`${x},${z}`);
    const y = ARENA.surfaceY;
    for (const [x, z] of cells) {
      // Depth: how far in from the edge, plus a little roughness.
      let inward = 0;
      while (inward < 6 && has(x + inward + 1, z) && has(x - inward - 1, z) && has(x, z + inward + 1) && has(x, z - inward - 1)) inward++;
      const depth = 1 + inward * 2 + Math.floor(this.random() * 2);
      const onRim = !has(x + 1, z) || !has(x - 1, z) || !has(x, z + 1) || !has(x, z - 1);
      this.set(x, y, z, onRim && rim ? rim : this.theme.top);
      for (let d = 1; d <= depth; d++) this.set(x, y - d, z, d <= 2 ? this.theme.under : this.theme.deep);
    }
  }

  tree(x, z) {
    if (!this.theme.log) {
      if (this.theme.cactus) for (let h = 1; h <= 3; h++) this.set(x, ARENA.surfaceY + h, z, 'CACTUS');
      return;
    }
    const y = ARENA.surfaceY;
    const height = 4 + Math.floor(this.random() * 2);
    for (let h = 1; h <= height; h++) this.set(x, y + h, z, this.theme.log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = height - 1; dy <= height + 1; dy++) {
      const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - height) * 2;
      if (r <= 3 && this.get(x + dx, y + dy, z + dz) === BLOCKS.AIR) this.set(x + dx, y + dy, z + dz, this.theme.leaves);
    }
  }

  flower(x, z) {
    const list = this.theme.flowers;
    if (!list?.length || this.get(x, ARENA.surfaceY + 1, z) !== BLOCKS.AIR) return;
    this.set(x, ARENA.surfaceY + 1, z, list[Math.floor(this.random() * list.length)]);
  }
}

const disc = (cx, cz, r) => {
  const out = [];
  for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + r * 0.6) out.push([cx + x, cz + z]);
  return out;
};

/** BED_DIRECTIONS (bed.js) index of a facing: 0 east, 1 west, 2 south, 3 north. */
const bedDir = (fx, fz) => (fx > 0 ? 0 : fx < 0 ? 1 : fz > 0 ? 2 : 3);
/** chest.js facing: 0 south, 1 west, 2 north, 3 east. */
const chestFacing = (fx, fz) => (fz > 0 ? 0 : fx < 0 ? 1 : fz < 0 ? 2 : 3);
/** A player's yaw looking along (fx, fz): the game's yaw 0 looks toward -z. */
const yawToward = (fx, fz) => Math.atan2(-fx, -fz);
/** A mob's yaw facing along (fx, fz): a mob model faces +z at yaw 0 (mob.yaw = atan2(dx, dz) throughout mobs.js). */
const mobYawToward = (fx, fz) => Math.atan2(fx, fz);

/**
 * The whole map: every block, each base (its spawn, bed, forge, shops, chest and the reach of its traps), the diamond and
 * emerald generators, the waiting room, and the box it all fits in.
 */
export function buildArena(map = DEFAULT_MAP) {
  const { teams, theme: themeId, seed } = normalizeMap(map);
  const theme = THEMES[themeId];
  const b = new Builder(seed, theme);
  const y = ARENA.surfaceY;
  const bases = [];

  baseLayout(teams).forEach((at, index) => {
    const team = TEAMS[index];
    const fx = at.fx, fz = at.fz, rx = -fz, rz = fx; // forward toward the middle, right across
    const W = (u, v) => [at.x + u * rx + v * fx, at.z + u * rz + v * fz];
    // The island: 17 across and 17 deep, its back corners rounded off; a rim of the team's wool.
    const cells = [];
    for (let u = -8; u <= 8; u++) for (let v = -9; v <= 7; v++) {
      if (Math.abs(u) === 8 && (v === -9 || v === 7)) continue;
      cells.push(W(u, v));
    }
    b.island(cells, { rim: team.wool });
    // The plaza round the spawn and the forge.
    for (let u = -4; u <= 4; u++) for (let v = -8; v <= -2; v++) { const [x, z] = W(u, v); b.set(x, y, z, Math.abs(u) === 4 || v === -8 || v === -2 ? theme.trim : theme.plaza); }
    // The forge: a pad of iron with gold at its heart, in the floor.
    for (let u = -1; u <= 1; u++) for (let v = -8; v <= -6; v++) { const [x, z] = W(u, v); b.set(x, y, z, u === 0 && v === -7 ? 'GOLD_BLOCK' : 'IRON_BLOCK'); }
    const [gx, gz] = W(0, -7);
    const [sx, sz] = W(0, -4);
    const [shopX, shopZ] = W(-5, -5);
    const [upX, upZ] = W(5, -5);
    const [chX, chZ] = W(3, -8);
    // The bed, toward the front, its head toward the middle, on a little platform of the team's clay.
    const [footX, footZ] = W(0, 3);
    const [headX, headZ] = W(0, 4);
    for (let u = -1; u <= 1; u++) for (let v = 2; v <= 5; v++) { const [x, z] = W(u, v); b.set(x, y, z, team.clay); }
    b.set(footX, y + 1, footZ, team.bedFoot);
    b.set(headX, y + 1, headZ, team.bedHead);
    b.set(chX, y + 1, chZ, 'CHEST');
    // Two trees (or cacti) in the back corners, and flowers about.
    for (const u of [-6, 6]) { const [tx, tz] = W(u, -8); if (b.random() < 0.8) b.tree(tx, tz); }
    for (let i = 0; i < 6; i++) {
      const u = Math.floor(b.random() * 13) - 6, v = Math.floor(b.random() * 6);
      if (Math.abs(u) <= 1 && v >= 2) continue; // not on the bed's platform
      const [x, z] = W(u, v);
      b.flower(x, z);
    }
    bases.push({
      team: team.id, index,
      center: { x: at.x, z: at.z },
      facing: { x: fx, z: fz },
      spawn: { x: sx + 0.5, y: y + 1, z: sz + 0.5, yaw: yawToward(fx, fz) },
      forge: { x: gx + 0.5, y: y + 1, z: gz + 0.5 },
      // The shopkeepers face the spawn, between them.
      shop: { x: shopX + 0.5, y: y + 1, z: shopZ + 0.5, yaw: mobYawToward(rx, rz) },
      upgrades: { x: upX + 0.5, y: y + 1, z: upZ + 0.5, yaw: mobYawToward(-rx, -rz) },
      chest: { x: chX, y: y + 1, z: chZ, facing: chestFacing(fx, fz) },
      bed: { foot: [footX, y + 1, footZ], head: [headX, y + 1, headZ], dir: bedDir(fx, fz), colour: team.id === 'green' ? 'lime' : team.id === 'aqua' ? 'cyan' : team.id },
      radius: ARENA.baseRadius,
    });
  });

  // Diamond islands: a small island each, the generator a diamond block in the middle.
  const diamonds = diamondLayout(teams).map((at, i) => {
    b.island(disc(at.x, at.z, 4));
    b.set(at.x, y, at.z, 'DIAMOND_BLOCK');
    b.flower(at.x + 2, at.z - 1);
    return { id: `d${i}`, kind: 'diamond', x: at.x + 0.5, y: y + 1, z: at.z + 0.5 };
  });

  // The middle island, bigger with eight teams, its plaza holding the emerald generators.
  const r = teams === 8 ? 12 : 10;
  b.island(disc(0, 0, r));
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (Math.abs(x) + Math.abs(z) <= 8) b.set(x, y, z, Math.abs(x) + Math.abs(z) === 8 ? theme.trim : theme.plaza);
  const emeralds = emeraldLayout(teams).map((at, i) => {
    b.set(at.x, y, at.z, 'EMERALD_BLOCK');
    return { id: `e${i}`, kind: 'emerald', x: at.x + 0.5, y: y + 1, z: at.z + 0.5 };
  });
  for (const [tx, tz] of [[r - 3, 0], [-(r - 3), 0], [0, r - 3], [0, -(r - 3)]]) if (b.random() < 0.75) b.tree(tx, tz);
  for (let i = 0; i < 10; i++) {
    const a = b.random() * Math.PI * 2, d = 8 + b.random() * (r - 8);
    b.flower(Math.round(Math.cos(a) * d), Math.round(Math.sin(a) * d));
  }

  // The waiting room: a glass box above the middle, where everyone stands until the game starts.
  const L = ARENA.lobbyY;
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
    const wall = Math.abs(x) === 6 || Math.abs(z) === 6;
    b.set(x, L, z, wall ? 'WHITE_STAINED_GLASS' : 'GLASS');
    if (wall) for (let h = 1; h <= 3; h++) b.set(x, L + h, z, 'GLASS');
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of b.blocks.keys()) {
    const [x, yy, z] = key.split(',').map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    minY = Math.min(minY, yy); maxY = Math.max(maxY, yy);
  }
  return {
    teams, theme: themeId, seed, name: `${theme.name} (${teams} teams)`,
    blocks: b.blocks,
    bases,
    diamonds,
    emeralds,
    lobby: { x: 0.5, y: L + 1, z: 0.5 },
    spectator: { x: 0.5, y: y + 18, z: 0.5 },
    bounds: { minX: minX - 1, maxX: maxX + 1, minZ: minZ - 1, maxZ: maxZ + 1, minY: Math.max(0, minY - 1), maxY: Math.min(63, maxY + 1) },
  };
}

/** Whether a cell is part of the map as built: such blocks cannot be broken (only what players place, and beds). */
export const isMapBlock = (arena, x, y, z) => arena.blocks.has(cellKey(x, y, z));

/** The cells that differ from the arena, as `[x, y, z, wanted]` -- what restoring a round writes (SkyWars' rule). */
export function arenaDifferences(arena, getVoxel, also = null) {
  const out = [];
  const a = arena.bounds;
  const box = also ? {
    minX: Math.min(a.minX, also.minX), maxX: Math.max(a.maxX, also.maxX), minZ: Math.min(a.minZ, also.minZ),
    maxZ: Math.max(a.maxZ, also.maxZ), minY: Math.min(a.minY, also.minY), maxY: Math.max(a.maxY, also.maxY),
  } : a;
  for (let x = box.minX; x <= box.maxX; x++) for (let z = box.minZ; z <= box.maxZ; z++) for (let y = box.minY; y <= box.maxY; y++) {
    const wanted = arena.blocks.get(cellKey(x, y, z)) ?? BLOCKS.AIR;
    if (getVoxel(x, y, z) !== wanted) out.push([x, y, z, wanted]);
  }
  return out;
}
