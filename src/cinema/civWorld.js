// 1500 Players · the world: three islands in one ocean, built with the game's own blocks and mesher.
//   Hot Island (west):       red sand, striped terracotta mesas, acacia savanna, a dry riverbed, Vegeta's mesa.
//   Cold Island (east):      snow, ice spikes, Frieza's blue-ice palace, MerCat's glowing grotto under the hill.
//   Temperate Island (north): rolling grass, oak woods, flowers, a river, Buu's bakery, the cat café, Pocoyo Park
//                             and the Central Plateau where the last stand happens.
// The world is built once per page and shared by every shot (built lazily on first use).
import * as T from 'three';
import { BLOCKS as B, BLOCK_DEFS } from '../blocks.js';
import { ChunkMesher } from '../mesher.js';
import { rand, createStage, meshWorld } from './claudeStage.js';

export const SEA = 12;
export const ISLANDS = {
  hot: { c: [-95, 50], r: 62 },
  cold: { c: [95, 50], r: 60 },
  temperate: { c: [0, -88], r: 66 },
};
export const SITES = {
  vegetaMesa: [-114, 34], outpost: [-82, 74], meetingHall: [-124, 74],
  palace: [95, 46], grotto: [116, 74], goku: [72, 80],
  bakery: [-28, -66], cafe: [24, -70], park: [-6, -46], plateau: [0, -100],
};
const MESAS = [[-114, 34, 13, 26], [-72, 26, 9, 15], [-124, 74, 9, 11], [-96, 18, 7, 9], [-60, 60, 6, 8]];
const RIVER = [[-95, 40], [-88, 58], [-82, 74], [-74, 92], [-66, 108]];
const TEMP_RIVER = [[8, -96], [18, -80], [30, -62], [44, -44], [56, -30]];
const PLATEAU = { c: SITES.plateau, r: 15, h: 13 };
// Plazas: flat ground, banked into the terrain and kept free of trees, under every set where the cast stands or walks
// (marks on 1-block steps make walkers pop and bury feet). Level h, or the land's own height at the centre.
//   outpost: dug into the riverbed around the dome and the cast's marks, about 14 blocks south of the dome
const PLAZAS = [
  { name: 'outpost', c: [-80, 84], r: 19, edge: 7, h: SEA + 1, surface: B.SAND },
  { name: 'bakery', c: [-23, -60], r: 14, edge: 6, surface: B.GRASS },
  { name: 'cafe', c: [24, -67], r: 13, edge: 6, surface: B.GRASS },
  { name: 'park', c: [-6, -45], r: 9, edge: 5, surface: B.GRASS },
  { name: 'camp', c: [74, 84], r: 11, edge: 5, surface: B.SNOW },
];
/** The trade line: the rail bridge from the Hot Island, then the land line to the bakery (civFilm.js runs the train on it). */
export const RAIL = [[-58, 10], [-36, -40], [-30, -58]];

const smooth = (x, z, s, seed) => { // cheap value noise
  const xi = Math.floor(x / s), zi = Math.floor(z / s), fx = x / s - xi, fz = z / s - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = rand(xi, zi, seed), b = rand(xi + 1, zi, seed), c = rand(xi, zi + 1, seed), d = rand(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const segDist = (x, z, pts) => { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k)); } return best; };

/** Which island a column belongs to, and its normalised distance from that island's centre (coast at 1). */
export function islandAt(x, z) {
  let best = null;
  for (const [name, I] of Object.entries(ISLANDS)) {
    const dx = x - I.c[0], dz = z - I.c[1], a = Math.atan2(dz, dx);
    const coast = I.r * (1 + .12 * Math.sin(a * 3 + name.length) + .08 * Math.sin(a * 7 + 1.3 * name.length) + (smooth(x, z, 14, 3) - .5) * .18);
    const d = Math.hypot(dx, dz) / coast; if (!best || d < best.d) best = { name, d };
  }
  return best;
}
const TERRA = [B.ORANGE_TERRACOTTA, B.TERRACOTTA, B.YELLOW_TERRACOTTA, B.TERRACOTTA, B.RED_TERRACOTTA, B.WHITE_TERRACOTTA, B.ORANGE_TERRACOTTA, B.BROWN_TERRACOTTA, B.TERRACOTTA, B.RED_TERRACOTTA];

let cached;
export function buildWorld() { return cached ??= build(); }

async function build() {
  // The shared film stage: its renderer supersamples exports to 1080p, and meshWorld gives the world a mipmapped atlas.
  const stage = await createStage({ seed: 1500, chunks: 11 }), { world, textures } = stage;
  let put = stage.put; // after the terrain, put also keeps the ground map (top) up to date
  const X0 = -176, X1 = 176, Z0 = -176, Z1 = 128;
  const get = (x, y, z) => world.getChunk(Math.floor(x / 16), Math.floor(z / 16))?.getVoxel((x % 16 + 16) % 16, y, (z % 16 + 16) % 16) ?? 0;
  const fill = (x0, y0, z0, x1, y1, z1, id) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, id); };
  const top = new Map(); const key = (x, z) => x * 4096 + z;

  // ------------------------------------------------------------------ terrain
  /** The land's own height and surface at a column (d < 1), before plazas. */
  const natural = (x, z, name, d) => {
    const inland = Math.pow(1 - d, .6), n = smooth(x, z, 11, 7), n2 = smooth(x, z, 5, 9);
    let h, surface, under = B.DIRT;
    if (name === 'hot') {
      h = SEA + 1 + Math.round(inland * 5 + n * 3); surface = B.RED_SAND; under = B.TERRACOTTA;
      for (const [mx, mz, mr, mh] of MESAS) { const md = Math.hypot(x - mx, z - mz) / (mr * (1 + (smooth(x, z, 4, mx) - .5) * .5)); if (md < 1) { h = Math.max(h, SEA + 2 + (md < .82 ? mh : Math.round(mh * (1 - md) / .18))); } }
      const rd = segDist(x, z, RIVER); if (rd < 4.5) { h = Math.min(h, SEA + 1 + Math.floor(rd / 2)); surface = rd < 2.6 ? B.COARSE_DIRT : B.SAND; }
    } else if (name === 'cold') {
      h = SEA + 1 + Math.round(inland * 9 + n * 5 + n2 * 2); surface = B.SNOW; under = B.STONE;
    } else {
      h = SEA + 1 + Math.round(inland * 7 + n * 4 + n2 * 1.5); surface = d > .9 ? B.SAND : B.GRASS;
      const pd = Math.hypot(x - PLATEAU.c[0], z - PLATEAU.c[1]) / (PLATEAU.r * (1 + (smooth(x, z, 5, 2) - .5) * .25));
      if (pd < 1) { h = Math.max(h, SEA + (pd < .78 ? PLATEAU.h : Math.round(PLATEAU.h * (1 - pd) / .22 + h * (pd - .78) / .22 * .1))); }
      const rd = segDist(x, z, TEMP_RIVER); if (rd < 3.2 && pd > 1) { h = Math.min(h, SEA - (rd < 2 ? 1 : 0)); surface = B.SAND; }
    }
    return { h, surface, under };
  };
  for (const P of PLAZAS) { const I = islandAt(...P.c); P.level = P.h ?? Math.max(SEA + 2, natural(...P.c, I.name, I.d).h); }
  for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
    const { name, d } = islandAt(x, z);
    if (d >= 1) { // ocean: a sandy shelf near the coast, deeper further out
      const floor = Math.max(2, Math.round(SEA - 3 - Math.min(6, (d - 1) * 14) + smooth(x, z, 9, 5) * 2));
      fill(x, 1, z, x, floor, z, d < 1.25 ? B.SAND : B.GRAVEL); fill(x, floor + 1, z, x, SEA, z, B.WATER); put(x, 0, z, B.BEDROCK); continue;
    }
    let { h, surface, under } = natural(x, z, name, d);
    for (const P of PLAZAS) { // level the plazas, banking smoothly back into the land
      const pd = Math.hypot(x - P.c[0], z - P.c[1]); if (pd >= P.r + P.edge) continue;
      if (pd < P.r) { h = P.level; surface = P.surface; } else h = Math.round(P.level + (h - P.level) * (pd - P.r) / P.edge);
    }
    put(x, 0, z, B.BEDROCK); fill(x, 1, z, x, h - 4, z, B.STONE); fill(x, Math.max(1, h - 3), z, x, h - 1, z, under);
    if (name === 'hot' && h > SEA + 6) for (let y = SEA + 3; y <= h; y++) put(x, y, z, TERRA[(y + Math.floor(smooth(x, z, 30, 1) * 2)) % TERRA.length]);
    put(x, h, z, name === 'hot' && h > SEA + 6 ? TERRA[(h + 1) % TERRA.length] === B.WHITE_TERRACOTTA ? B.WHITE_TERRACOTTA : B.RED_SAND : surface);
    if (h < SEA) fill(x, h + 1, z, x, SEA, z, B.WATER);
    top.set(key(x, z), h);
  }
  const groundY = (x, z) => top.get(key(Math.floor(x), Math.floor(z))) ?? SEA;
  // From here on, structures change the ground: a solid block laid on a column's top raises it (a floor, a terrace,
  // a sandpit), and clearing the top block lowers it to the next solid block below (a dug-out courtyard). groundAt
  // then always returns where a foot really lands.
  const solid = id => { const b = BLOCK_DEFS[id]; return !!id && !!b && b.solid !== false && !b.plant && !b.liquid; };
  const putBlock = put; put = (x, y, z, id) => {
    putBlock(x, y, z, id); const k = key(x, z), t = top.get(k); if (t === undefined) return;
    if (solid(id) && y === t + 1) top.set(k, y);
    else if (!solid(id) && y === t) { let yy = y - 1; while (yy > 0 && !solid(get(x, yy, z))) yy--; top.set(k, yy); }
  };

  // ------------------------------------------------------------------ vegetation
  const tree = (x, z, kind) => {
    const h = groundY(x, z); if (h <= SEA) return;
    if (kind === 'acacia') {
      const t = h + 4 + Math.floor(rand(x, z, 3) * 2), lean = rand(x, z, 4) < .5 ? 1 : -1;
      for (let y = h + 1; y <= t; y++) put(x + (y > h + 2 ? lean : 0), y, z, B.ACACIA_LOG);
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) + Math.abs(dz) <= 4 && rand(x + dx, z + dz, 6) > .1) put(x + lean + dx, t + 1, z + dz, B.OAK_LEAVES);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(x + lean + dx, t + 2, z + dz, B.OAK_LEAVES);
    } else {
      const t = h + 4 + Math.floor(rand(x, z, 9) * 3);
      for (let y = h + 1; y <= t; y++) put(x, y, z, B.OAK_LOG);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) * 1.5 <= 3.2 && (dx || dz || dy > 0) && rand(x + dx, z + dz, dy + 5) > .08) put(x + dx, t + dy, z + dz, B.OAK_LEAVES);
    }
  };
  const near = (x, z, [sx, sz], r) => Math.hypot(x - sx, z - sz) < r;
  for (let x = X0; x < X1; x += 1) for (let z = Z0; z < Z1; z += 1) {
    const { name, d } = islandAt(x, z); if (d > .9) continue; const r = rand(x, z, 11), h = groundY(x, z);
    if (PLAZAS.some(P => near(x, z, P.c, P.r + P.edge + 4)) || segDist(x, z, RAIL.slice(1)) < 6) continue; // sets and the train's land line stay clear
    if (name === 'hot') {
      if (h > SEA + 7 || segDist(x, z, RIVER) < 6 || near(x, z, SITES.meetingHall, 10)) continue;
      if (r < .006) tree(x, z, 'acacia'); else if (r < .03) put(x, h + 1, z, B.DEAD_BUSH);
    } else if (name === 'temperate') {
      if (near(x, z, SITES.plateau, 20) || near(x, z, SITES.bakery, 11) || near(x, z, SITES.cafe, 11) || near(x, z, SITES.park, 13) || segDist(x, z, TEMP_RIVER) < 4) { continue; }
      const woods = smooth(x, z, 18, 21) > .55;
      if (r < (woods ? .03 : .004)) tree(x, z, 'oak'); else if (r < .05) put(x, h + 1, z, rand(x, z, 12) < .5 ? B.POPPY : B.DANDELION);
    } else if (name === 'cold') {
      if (near(x, z, SITES.palace, 22) || near(x, z, SITES.grotto, 9)) continue;
      if (r < .004) { const s = 6 + Math.floor(rand(x, z, 13) * 12); for (let y = 1; y <= s; y++) { const w = y < s * .3 ? 1 : 0; fill(x - w, h + y, z - w, x + w, h + y, z + w, B.PACKED_ICE); } put(x, h + s + 1, z, B.PACKED_ICE); }
    }
  }

  // ------------------------------------------------------------------ Hot Island: the outpost in the riverbed, Vegeta's mesa camp
  {
    const [ox, oz] = SITES.outpost, g = groundY(ox, oz);
    for (let dx = -7; dx <= 7; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = 0; dy <= 6; dy++) { // white dome with a blue band (Capsule Corp style)
      const r = Math.hypot(dx / 7, dy / 6, dz / 6); if (r <= 1 && r > .8) put(ox + dx, g + 1 + dy, oz + dz, dy === 2 ? B.LIGHT_BLUE_CONCRETE : B.WHITE_CONCRETE);
    }
    fill(ox - 1, g + 1, oz - 6, ox + 1, g + 3, oz - 6, B.AIR); fill(ox - 7, g, oz - 6, ox + 7, g, oz + 6, B.SMOOTH_STONE);
    for (let i = 0; i < 6; i++) { const px = ox - 14 + i * 5, pz = oz - 12, pg = groundY(px, pz); fill(px, pg + 1, pz, px, pg + 2, pz, B.IRON_BLOCK); fill(px - 1, pg + 3, pz - 1, px + 1, pg + 3, pz + 1, B.DAYLIGHT_DETECTOR); } // solar condensers, behind the dome
    for (let i = 0; i < 3; i++) { const px = ox + 10, pz = oz - 4 + i * 4; fill(px, g + 1, pz, px + 1, g + 4, pz + 1, B.LIGHT_BLUE_STAINED_GLASS); put(px, g + 5, pz, B.IRON_BLOCK); } // water tanks
    const [vx, vz] = SITES.vegetaMesa, vg = groundY(vx, vz); // war tent on the mesa
    fill(vx - 5, vg + 1, vz - 4, vx + 5, vg + 1, vz + 4, B.DARK_OAK_PLANKS); for (let i = 0; i < 4; i++) fill(vx - 5 + i, vg + 2 + i, vz - 4, vx + 5 - i, vg + 2 + i, vz + 4, i === 3 ? B.BLUE_WOOL : B.WHITE_WOOL);
    fill(vx - 4, vg + 2, vz - 3, vx + 4, vg + 4, vz + 3, B.AIR); fill(vx - 4, vg + 2, vz - 4, vx + 4, vg + 4, vz - 4, B.AIR);
    // flag poles are full log blocks: the film mesher does not draw shaped blocks such as fences
    for (const s of [-6, 6]) { fill(vx + s, vg + 1, vz - 5, vx + s, vg + 6, vz - 5, B.SPRUCE_LOG); put(vx + s, vg + 7, vz - 5, B.BLUE_WOOL); }
    const [mx, mz] = SITES.meetingHall, mg = groundY(mx, mz); // Frieza's "secret" meeting tent
    fill(mx - 5, mg, mz - 4, mx + 5, mg, mz + 4, B.PURPLE_TERRACOTTA);
    for (let i = 0; i < 4; i++) fill(mx - 5 + i, mg + 3 + i, mz - 4, mx + 5 - i, mg + 3 + i, mz + 4, B.PURPLE_WOOL);
    for (const [px, pz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) fill(mx + px, mg + 1, mz + pz, mx + px, mg + 3, mz + pz, B.DARK_OAK_LOG ?? B.OAK_LOG);
  }

  // ------------------------------------------------------------------ Cold Island: Frieza's ice palace and the grotto
  {
    const [px, pz] = SITES.palace, g = groundY(px, pz) + 1, X = [px - 14, px + 14], Z = [pz - 11, pz + 11];
    fill(X[0] - 2, g - 2, Z[0] - 2, X[1] + 2, g, Z[1] + 2, B.PACKED_ICE);
    for (let x = X[0]; x <= X[1]; x++) for (let z = Z[0]; z <= Z[1]; z++) for (let y = g; y <= g + 30; y++) put(x, y, z, B.AIR);
    for (let x = X[0]; x <= X[1]; x++) for (let z = Z[0]; z <= Z[1]; z++) {
      const edge = x === X[0] || x === X[1] || z === Z[0] || z === Z[1]; if (!edge) continue;
      for (let y = g + 1; y <= g + 14; y++) put(x, y, z, (y - g) % 5 === 0 ? B.PACKED_ICE : B.BLUE_ICE);
      if ((x + z) % 2 === 0) put(x, g + 15, z, B.BLUE_ICE);
      if ((x - X[0]) % 4 === 2 && (z === Z[0] || z === Z[1])) for (let y = g + 6; y <= g + 9; y++) put(x, y, z, B.LIGHT_BLUE_STAINED_GLASS);
    }
    fill(px - 2, g + 1, Z[1], px + 2, g + 6, Z[1], B.AIR); // the south gate
    for (let x = X[0] + 1; x < X[1]; x++) for (let z = Z[0] + 1; z < Z[1]; z++) put(x, g, z, B.ICE);
    for (const [tx, tz] of [[X[0], Z[0]], [X[1], Z[0]], [X[0], Z[1]], [X[1], Z[1]]]) { // towers with ice spires
      for (let y = g; y <= g + 22; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2 || y === g + 22) put(tx + dx, y, tz + dz, B.BLUE_ICE);
      for (let i = 0; i < 9; i++) { const w = i < 3 ? 1 : 0; fill(tx - w, g + 23 + i, tz - w, tx + w, g + 23 + i, tz + w, B.PACKED_ICE); }
    }
    // the keep (throne hall): open-topped so daylight reaches the floor; spires stand on its corners
    const K = { x0: px - 7, x1: px + 7, z0: pz - 9, z1: pz + 3 }; SITES.keep = K;
    for (let y = g; y <= g + 24; y++) for (let x = K.x0; x <= K.x1; x++) for (let z = K.z0; z <= K.z1; z++) if (x === K.x0 || x === K.x1 || z === K.z0 || z === K.z1) put(x, y, z, (y - g) % 6 === 0 ? B.PACKED_ICE : B.BLUE_ICE);
    for (const [tx, tz] of [[K.x0, K.z0], [K.x1, K.z0], [K.x0, K.z1], [K.x1, K.z1]]) for (let i = 0; i < 10; i++) { const w = i < 4 ? 1 : 0; fill(tx - w, g + 25 + i, tz - w, tx + w, g + 25 + i, tz + w, B.PACKED_ICE); }
    fill(px - 1, g + 1, K.z1, px + 1, g + 4, K.z1, B.AIR); // door into the courtyard
    // the hole Goku makes on Day 8: through the keep's north wall and the palace's north wall
    for (const wz of [K.z0, Z[0]]) for (let x = px - 4; x <= px + 3; x++) for (let y = g + 1; y <= g + 8; y++) if (Math.hypot((x - px + .5) / 4.2, (y - g - 4) / 4.4) + (rand(x, y, wz) - .5) * .35 < 1) put(x, y, wz, B.AIR);
    const [gx, gz] = SITES.grotto, gg = groundY(gx, gz); // grotto: a hollow under the hill, opening west
    const F0 = SEA + 2; // the grotto floor
    for (let x = gx - 8; x <= gx + 8; x++) for (let z = gz - 6; z <= gz + 6; z++) for (let y = F0; y <= F0 + 7; y++) {
      const r = Math.hypot((x - gx) / 8, (y - F0 - 2) / 5, (z - gz) / 6); if (r < 1) put(x, y, z, B.AIR); else if (r < 1.25 && get(x, y, z) === B.AIR) put(x, y, z, B.STONE);
    }
    fill(gx - 8, F0 - 1, gz - 6, gx + 8, F0 - 1, gz + 6, B.STONE); fill(gx - 8, F0 - 2, gz - 6, gx + 8, F0 - 2, gz + 6, B.STONE);
    for (const [dx, dz, w] of [[-3, 1, 2], [3, -2, 2], [1, 3, 1]]) { fill(gx + dx - w, F0 - 1, gz + dz - w, gx + dx + w, F0 - 1, gz + dz + w, B.WATER); put(gx + dx, F0 - 2, gz + dz, B.SEA_LANTERN); }
    for (const [dx, dz] of [[-6, -3], [6, 3], [-5, 4], [5, -4], [0, -5]]) put(gx + dx, F0, gz + dz, B.AMETHYST_CLUSTER ?? B.GLOWSTONE);
    for (let x = gx - 14; x <= gx - 7; x++) fill(x, F0, gz - 2, x, F0 + 3, gz + 2, B.AIR); // the entrance
    SITES.grottoFloor = F0;
  }

  // ------------------------------------------------------------------ Temperate Island: bakery, café, park, plateau
  {
    const bld = ([cx, cz], w, d, hgt, wall, roof, trim) => {
      const g = groundY(cx, cz); fill(cx - w, g - 2, cz - d, cx + w, g, cz + d, B.STONE_BRICKS);
      for (let x = cx - w; x <= cx + w; x++) for (let z = cz - d; z <= cz + d; z++) for (let y = g + 1; y <= g + 30; y++) put(x, y, z, B.AIR);
      for (let x = cx - w; x <= cx + w; x++) for (let z = cz - d; z <= cz + d; z++) for (let y = g + 1; y <= g + hgt; y++) {
        if (!(x === cx - w || x === cx + w || z === cz - d || z === cz + d)) continue;
        const corner = (x === cx - w || x === cx + w) && (z === cz - d || z === cz + d);
        put(x, y, z, corner ? trim : (y === g + 3 && (x - cx) % 3 === 0) ? B.GLASS : wall);
      }
      for (let i = 0; i <= w; i++) fill(cx - w - 1 + i, g + hgt + 1 + i, cz - d - 1, cx + w + 1 - i, g + hgt + 1 + i, cz + d + 1, roof);
      fill(cx - 1, g + 1, cz + d, cx + 1, g + 3, cz + d, B.AIR); return g;
    };
    const bg = bld(SITES.bakery, 7, 5, 6, B.QUARTZ_BLOCK, B.PINK_CONCRETE, B.PINK_TERRACOTTA);
    const [bx, bz] = SITES.bakery; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx * dx + dy * dy <= 5) put(bx + dx, bg + 15 + dy, bz + 6, (dx + dy) % 3 === 0 ? B.BROWN_CONCRETE : B.ORANGE_TERRACOTTA); // the giant cookie sign
    const cg = bld(SITES.cafe, 6, 5, 5, B.BIRCH_PLANKS, B.ORANGE_TERRACOTTA, B.STRIPPED_OAK_LOG ?? B.OAK_LOG);
    const [cx, cz] = SITES.cafe; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) fill(cx + s * 4 - (s < 0 ? 0 : 1) * i * 0, cg + 13 + i, cz, cx + s * 4 + (s < 0 ? i : -i) * 0, cg + 13 + i, cz, B.ORANGE_TERRACOTTA); // cat ears on the roof
    fill(cx - 6, cg, cz + 6, cx + 6, cg, cz + 9, B.OAK_PLANKS); // terrace
    const [kx, kz] = SITES.park, kg = groundY(kx, kz); // Pocoyo Park: sandpit, slide and a minecart run down the hill
    fill(kx - 6, kg, kz - 5, kx + 6, kg, kz + 5, B.SAND);
    for (let i = 0; i < 5; i++) put(kx - 4, kg + 1 + i, kz - 3, B.LIGHT_BLUE_CONCRETE); for (let i = 0; i < 6; i++) put(kx - 4 + i, kg + 5 - i, kz - 2, B.YELLOW_CONCRETE);
    fill(kx + 3, kg + 1, kz + 2, kx + 3, kg + 4, kz + 2, B.RED_CONCRETE); fill(kx + 6, kg + 1, kz + 2, kx + 6, kg + 4, kz + 2, B.RED_CONCRETE); fill(kx + 3, kg + 5, kz + 2, kx + 6, kg + 5, kz + 2, B.RED_CONCRETE);
    for (let i = 0; i < 26; i++) for (const lane of [0, 1]) { const x = kx + 8 + i, z = kz - 10 + Math.round(i * .3) + lane, y = groundY(x, z); put(x, y + 1, z, B.RAIL); } // two lanes: one per racing cart
  }

  // ------------------------------------------------------------------ mesh
  // light the whole world first (it is far bigger than meshWorld's light budget), then mesh it with the mipmapped atlas
  world.light.skyDarken = 0; world.light.update(4000000);
  const group = new T.Group(), mesher = new ChunkMesher(textures);
  meshWorld({ world, textures, scene: group });
  // The aerials see whole islands from 200–560 m, where a block is 1–3 px: nearest-texel sampling within a mip level
  // makes every texture crawl as the camera zooms. Minify trilinearly (blending levels and texels); magnification stays
  // nearest, so blocks near the lens keep their crisp pixels.
  group.traverse(o => { if (o.material?.map?.mipmaps?.length > 1) o.material.map.minFilter = T.LinearMipmapLinearFilter; });
  // water: one ocean surface at sea level (land always rises above it, so it also fills the rivers); the grotto's
  // pools sit above sea level inside the hill and keep the mesher's own water geometry
  const water = new T.MeshPhongMaterial({ color: 0x1d5e9e, specular: 0x6f8fa8, shininess: 60, transparent: true, opacity: .88, depthWrite: false });
  const ocean = new T.Mesh(new T.PlaneGeometry(4000, 4000), water); ocean.rotation.x = -Math.PI / 2; ocean.position.y = SEA + .88; ocean.renderOrder = 2; ocean.receiveShadow = true; group.add(ocean);
  const deep = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshLambertMaterial({ color: 0x173f66 })); deep.rotation.x = -Math.PI / 2; deep.position.y = .5; group.add(deep);
  const pools = new T.MeshPhongMaterial({ color: 0x3fc6d8, emissive: 0x0e5e70, specular: 0xffffff, shininess: 80, transparent: true, opacity: .85 });
  const [gx, gz] = SITES.grotto;
  for (const c of world.chunks.values()) { if (Math.abs(c.x * 16 + 8 - gx) > 24 || Math.abs(c.z * 16 + 8 - gz) > 24) continue; const g = mesher.meshChunk(c, world); if (g.waterGeo) { const m = new T.Mesh(g.waterGeo, pools); m.renderOrder = 3; group.add(m); } }
  const groundAt = (x, z) => groundY(x, z) + 1;
  return { stage, world, group, groundAt, get, textures };
}
