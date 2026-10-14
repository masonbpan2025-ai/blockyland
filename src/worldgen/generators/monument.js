// Ocean monument, from the wiki (https://minecraft.wiki/w/Ocean_Monument and /Structure).
//
// From the pages:
//   * deep oceans; "The base size of the structure is 58x58 blocks", "22 blocks tall (not including the pillars)";
//     "Under the monument are 23 giant pillars that stretch to the ocean floor"; "water generates around the monument
//     as a part of the structure";
//   * three elder guardians: "one at the top and one in each wing"; "One of the wings contains a large room with a
//     small pillar at the center ... The other wing consists of a large open space";
//   * the treasure chamber (the core): "eight blocks of gold encased in dark prismarine";
//   * sponge rooms: "Each of the 36 columns in the room has a 1/3 chance of being empty, a 1/2 chance of having one
//     sponge, and a 1/6 chance of having two sponges";
//   * the room maze, "Structure generation" on /Structure, implemented step by step in `planMonumentRooms`: 46 units
//     (two layers of 5x4 and a layer of 3x2) plus three dummy units (the wings and the penthouse); the core at the
//     back; walls closed at random while every unit can still reach the entry; then the entry room, and for every
//     unit still unused the first room that fits: DXY, DYZ, DZ, DX, DY, a sponge room, or one of the three small rooms.
//
// Every room, the core, the penthouse and both wings are the /Structure page's drawings. A room's drawing comes in
// "no exits" and "exits" forms; each wall of a placed room is taken from the form that matches whether that wall is
// open. Rows run from the monument's front (the entrance) to its back.
//
// Ours (the wiki gives no positions): where the room grid, the wings, the penthouse, the hallway and the 23 pillars
// sit inside the 58x58 square; which unit each dummy touches; where the top 3x2 layer sits. The hallway and the outer
// shell are plain prismarine bricks and prismarine.

import { defineBlueprintStructure, cellsOf, templateFrom } from '../blueprintStructure.js';
import { LegacyRandom } from '../random.js';
import { BLUEPRINTS } from './blueprints/ocean_monument.js';

export const MONUMENT_SIZE = 58;
export const MONUMENT_HEIGHT = 22;
export const MONUMENT_PILLARS = 23;
export const MONUMENT_GOLD = 8;
export const MONUMENT_ELDER_COUNT = 3;

/** Room kinds and their drawings: [no exits, exits]. */
export const ROOM_DRAWINGS = {
  plus: ['plus_no_exits', 'plus_exits'], four_pillars: ['four_pillars_no_exits', 'four_pillars_exits'],
  dark_walls: ['dark_prismarine_walls_no_exits', 'dark_prismarine_walls_exits'], sponge: ['sponges', 'sponges'],
  dx: ['u_shaped_no_exits', 'u_shaped_exits'], dy: ['inset_no_exits', 'inset_all_exits'], dz: ['no_exits', 'exits'],
  dxy: ['hollow_pillar_no_exits', 'hollow_pillar_exits'], dyz: ['dark_pillar_no_exits', 'dark_pillar_all_exits'],
  entry: ['entry_no_exits', 'entry_exits']
};

// ---------------------------------------------------------------------------------------------------------------
// The maze.

const DIRS = { up: [0, 1, 0], down: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], front: [0, 0, -1], back: [0, 0, 1] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left', front: 'back', back: 'front' };
const key = (x, y, z) => `${x},${y},${z}`;

/** The 46 units and the three dummies. Units are (x 0..4, y 0..1, z 0..3) and the top layer (x 1..3, y 2, z 1..2). */
export function monumentUnits() {
  const units = new Map();
  for (let y = 0; y < 2; y++) for (let x = 0; x < 5; x++) for (let z = 0; z < 4; z++) units.set(key(x, y, z), { x, y, z });
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 2; z++) units.set(key(x, 2, z), { x, y: 2, z });
  return units;
}
/** Which unit each dummy touches, and in which direction from that unit. */
export const DUMMIES = { wing_left: [key(0, 0, 0), 'left'], wing_right: [key(4, 0, 0), 'right'], penthouse: [key(2, 2, 1), 'up'] };
export const ENTRY_UNIT = key(2, 0, 0);

export function planMonumentRooms(random) {
  const units = monumentUnits();
  const used = new Set();
  const closed = new Set(); // "a|b" with a < b
  const wall = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const neighbour = (k, dir) => {
    const u = units.get(k); const [dx, dy, dz] = DIRS[dir];
    for (const [name, [at, d]] of Object.entries(DUMMIES)) if (at === k && d === dir) return name;
    const n = key(u.x + dx, u.y + dy, u.z + dz);
    return units.has(n) ? n : null;
  };
  const isOpen = (k, dir) => { const n = neighbour(k, dir); return n !== null && !closed.has(wall(k, n)); };

  // The core: 2x2x2 units at the back.
  const coreX = random.nextIntBound(4);
  const core = [];
  for (let x = coreX; x < coreX + 2; x++) for (let y = 0; y < 2; y++) for (let z = 2; z < 4; z++) { core.push(key(x, y, z)); used.add(key(x, y, z)); }

  // Close walls while every unit can still reach the entry.
  const order = [...units.keys()];
  for (let i = order.length - 1; i > 0; i--) { const j = random.nextIntBound(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const reaches = (from) => {
    if (!units.has(from) || used.has(from) && core.includes(from)) return true;
    const seen = new Set([from]); const queue = [from];
    while (queue.length) {
      const k = queue.shift();
      if (k === ENTRY_UNIT) return true;
      for (const dir of Object.keys(DIRS)) {
        const n = neighbour(k, dir);
        if (!n || !units.has(n) || seen.has(n) || core.includes(n) || closed.has(wall(k, n))) continue;
        seen.add(n); queue.push(n);
      }
    }
    return false;
  };
  for (const k of order) {
    if (core.includes(k)) continue;
    let closures = 0;
    for (let attempt = 0; attempt < 5 && closures < 2; attempt++) {
      const dir = Object.keys(DIRS)[random.nextIntBound(6)];
      const n = neighbour(k, dir);
      if (!n || closed.has(wall(k, n))) continue;
      closed.add(wall(k, n));
      if (!reaches(k) || !reaches(n)) { closed.delete(wall(k, n)); continue; }
      closures++;
    }
  }

  const rooms = [{ kind: 'core', units: core }];
  used.add(ENTRY_UNIT);
  rooms.push({ kind: 'entry', units: [ENTRY_UNIT] });
  const free = (k) => k && units.has(k) && !used.has(k);
  const take = (kind, list) => { for (const k of list) used.add(k); rooms.push({ kind, units: list }); };
  for (const k of order) {
    if (used.has(k)) continue;
    const up = neighbour(k, 'up'); const right = neighbour(k, 'right'); const back = neighbour(k, 'back');
    const upRight = free(up) && free(right) ? neighbour(right, 'up') : null;
    const upBack = free(up) && free(back) ? neighbour(back, 'up') : null;
    if (free(up) && free(right) && free(upRight) && isOpen(k, 'up') && isOpen(k, 'right') && isOpen(right, 'up') && isOpen(up, 'right')) take('dxy', [k, right, up, upRight]);
    else if (free(up) && free(back) && free(upBack) && isOpen(k, 'up') && isOpen(k, 'back') && isOpen(back, 'up') && isOpen(up, 'back')) take('dyz', [k, back, up, upBack]);
    else if (free(back) && isOpen(k, 'back')) take('dz', [k, back]);
    else if (free(right) && isOpen(k, 'right')) take('dx', [k, right]);
    else if (free(up) && isOpen(k, 'up')) take('dy', [k, up]);
    else if (['up', 'left', 'right', 'front', 'back'].every((d) => !isOpen(k, d))) take('sponge', [k]);
    else take(['plus', 'four_pillars', 'dark_walls'][random.nextIntBound(3)], [k]);
  }
  return { units, rooms, closed: [...closed], core, coreX, isOpen };
}

// ---------------------------------------------------------------------------------------------------------------
// Building.

/** Where the room grid sits in the 58x58 square: x 9..48, z 22..53 (front to back), floors 4 apart from y 0. */
const GRID = { x: 9, z: 22 };
const unitOrigin = (u) => [GRID.x + u.x * 8, u.y * 4, GRID.z + u.z * 8];

function drawing(name) { return cellsOf(BLUEPRINTS[name]); }

/** A room's cells, each wall taken from the "exits" drawing when it is open. */
function roomCells(room, plan) {
  const list = room.units.map((k) => plan.units.get(k));
  const min = [Math.min(...list.map((u) => u.x)), Math.min(...list.map((u) => u.y)), Math.min(...list.map((u) => u.z))];
  const [closedName, openName] = ROOM_DRAWINGS[room.kind];
  const shut = drawing(closedName); const open = drawing(openName);
  const zShift = room.kind === 'entry' ? 2 : 0; // the entry's two front rows are its passage to the outside
  const openRegion = (c) => {
    for (const k of room.units) {
      const u = plan.units.get(k);
      const lx = (u.x - min[0]) * 8; const ly = (u.y - min[1]) * 4; const lz = (u.z - min[2]) * 8 + zShift;
      const inX = c.x >= lx && c.x < lx + 8; const inZ = c.z >= lz && c.z < lz + 8; const inY = c.y > ly && c.y < ly + 4;
      for (const dir of Object.keys(DIRS)) {
        const n = plan.isOpen(k, dir) ? true : false;
        const inside = room.units.includes(plan.units.has(k) ? neighbourKey(u, dir) : null);
        if (!n || inside) continue;
        if (dir === 'left' && c.x === lx && inZ && inY) return true;
        if (dir === 'right' && c.x === lx + 7 && inZ && inY) return true;
        if (dir === 'back' && c.z === lz + 7 && inX && inY) return true;
        if (dir === 'front' && c.z === lz && inX && inY) return true;
        if (dir === 'down' && c.y === ly && inX && inZ) return true;
        if (dir === 'up' && c.y === ly + 4 && inX && inZ) return true;
      }
      // The entry's passage is always open to the outside.
      if (room.kind === 'entry' && c.z < 2 + 1) return true;
    }
    return false;
  };
  const byPos = new Map(shut.map((c) => [key(c.x, c.y, c.z), c]));
  for (const c of open) if (openRegion(c)) byPos.set(key(c.x, c.y, c.z), c);
  for (const c of shut) if (openRegion(c) && !open.some((o) => o.x === c.x && o.y === c.y && o.z === c.z)) byPos.delete(key(c.x, c.y, c.z));
  const [ox, oy, oz] = unitOrigin({ x: min[0], y: min[1], z: min[2] });
  return [...byPos.values()].map((c) => ({ ...c, x: c.x + ox, y: c.y + oy, z: c.z + oz - zShift }));
}
const neighbourKey = (u, dir) => { const [dx, dy, dz] = DIRS[dir]; return key(u.x + dx, u.y + dy, u.z + dz); };

/** "Each of the 36 columns ... a 1/3 chance of being empty, a 1/2 chance of having one sponge, and a 1/6 chance of two". */
function spongeColumns(cells, random) {
  const columns = new Map();
  for (const c of cells) if (c.name === 'wet_sponge') (columns.get(`${c.x},${c.z}`) ?? columns.set(`${c.x},${c.z}`, []).get(`${c.x},${c.z}`)).push(c);
  const drop = new Set();
  for (const column of columns.values()) {
    column.sort((a, b) => b.y - a.y); // the ceiling first
    const r = random.nextFloat();
    const keep = r < 1 / 3 ? 0 : r < 5 / 6 ? 1 : 2;
    column.slice(keep).forEach((c) => drop.add(c));
  }
  return cells.filter((c) => !drop.has(c));
}

export function buildMonument({ seed = 0, pillarDepths = null } = {}) {
  const random = new LegacyRandom(BigInt(seed) * 6364136223846793005n + 1442695040888963407n);
  const plan = planMonumentRooms(random);
  const cells = new Map();
  const put = (c, overwrite = true) => { const k = key(c.x, c.y, c.z); if (!overwrite && cells.has(k)) return; cells.set(k, c); };
  const block = (x, y, z, name) => put({ x, y, z, name, props: null }, false);

  // Rooms, the core (its own drawing over 2x2x2 units) and the penthouse over the top layer.
  for (const room of plan.rooms) {
    if (room.kind === 'core') {
      const [ox, oy, oz] = unitOrigin({ x: plan.coreX, y: 0, z: 2 });
      for (const c of drawing('core')) put({ ...c, x: c.x + ox, y: c.y + oy, z: c.z + oz });
      continue;
    }
    let list = roomCells(room, plan);
    if (room.kind === 'sponge') list = spongeColumns(list, random);
    for (const c of list) put(c);
  }
  for (const c of drawing('penthouse')) put({ ...c, x: c.x + 21, y: c.y + 12, z: c.z + 30 });

  // The wings, at the front corners: the open-area wing on one side, the room wing (mirrored) on the other.
  const roomOnLeft = random.nextFloat() < 0.5;
  const open = drawing('wings'); const room = drawing('wings_example');
  const roomWidth = BLUEPRINTS.wings_example.size[0]; const openWidth = BLUEPRINTS.wings.size[0];
  const place = (list, width, atX, mirror) => { for (const c of list) put({ ...c, x: atX + (mirror ? width - 1 - c.x : c.x) }); };
  if (roomOnLeft) { place(room, roomWidth, 0, false); place(open, openWidth, MONUMENT_SIZE - openWidth, true); } else { place(open, openWidth, 0, false); place(room, roomWidth, MONUMENT_SIZE - roomWidth, true); }

  // The hallway round the sides and back of the room grid, joining the wings; the outer wall of the grid; the roof.
  for (let x = 0; x < MONUMENT_SIZE; x++) {
    for (let z = 22; z < MONUMENT_SIZE; z++) {
      const inGrid = x >= GRID.x - 1 && x <= GRID.x + 40 && z <= GRID.z + 32;
      if (inGrid) continue;
      const edge = x === 0 || x === MONUMENT_SIZE - 1 || z === MONUMENT_SIZE - 1 || x === GRID.x - 2 || x === GRID.x + 41 || z === GRID.z + 33;
      block(x, 0, z, 'prismarine');
      block(x, 5, z, 'prismarine_bricks');
      for (let y = 1; y < 5; y++) if (edge && !(x === GRID.x - 2 || x === GRID.x + 41 || z === GRID.z + 33) || (edge && y > 2)) block(x, y, z, (y === 3 && (x + z) % 8 === 0) ? 'sea_lantern' : 'prismarine_bricks');
    }
  }
  for (let x = GRID.x - 1; x <= GRID.x + 40; x++) {
    for (let z = GRID.z - 1; z <= GRID.z + 32; z++) {
      const edge = x === GRID.x - 1 || x === GRID.x + 40 || z === GRID.z + 32 || z === GRID.z - 1;
      for (let y = 0; y <= 12; y++) if (edge) block(x, y, z, 'prismarine_bricks');
      block(x, 12, z, 'prismarine');
    }
  }
  // The entrance through the front wall of the grid.
  for (let x = GRID.x + 19; x <= GRID.x + 20; x++) for (let y = 1; y <= 2; y++) cells.delete(key(x, y, GRID.z - 1));

  // The 23 pillars under the monument: a 5x5 grid less the two under the entrance's front.
  const pillars = [];
  for (const px of [2, 15, 28, 41, 54]) for (const pz of [2, 15, 28, 41, 54]) if (!(pz === 2 && (px === 15 || px === 41))) pillars.push([px, pz]);
  const depths = pillarDepths ?? pillars.map(() => 0);
  const lowest = Math.max(0, ...depths);
  const shifted = new Map();
  for (const c of cells.values()) shifted.set(key(c.x, c.y + lowest, c.z), { ...c, y: c.y + lowest });
  pillars.forEach(([px, pz], i) => {
    for (let dy = 1; dy <= depths[i]; dy++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) shifted.set(key(px + dx, lowest - dy, pz + dz), { x: px + dx, y: lowest - dy, z: pz + dz, name: 'prismarine_bricks', props: null });
  });

  // Water fills every empty block of the monument's own box, so it has no air pockets.
  const top = lowest + MONUMENT_HEIGHT;
  for (let x = 0; x < MONUMENT_SIZE; x++) for (let z = 0; z < MONUMENT_SIZE; z++) for (let y = lowest; y <= top; y++) if (!shifted.has(key(x, y, z))) shifted.set(key(x, y, z), { x, y, z, name: 'water', props: null });

  // Three elder guardians: the penthouse and each wing.
  const elder = (x, y, z) => ({ pos: [x + 0.5, y, z + 0.5], blockPos: [x, y, z], nbt: { type: 'elder_guardian', options: { persistent: true } } });
  const entities = [elder(29, lowest + 14, 38), elder(12, lowest + 4, 10), elder(MONUMENT_SIZE - 13, lowest + 4, 10)];

  return templateFrom([...shifted.values()], [MONUMENT_SIZE, top + 1, MONUMENT_SIZE], {
    entities,
    edit: (c) => (c.name === 'block_of_gold' ? { name: 'gold_block' } : c)
  });
}

export const MONUMENT_PILLAR_SPOTS = (() => {
  const out = [];
  for (const px of [2, 15, 28, 41, 54]) for (const pz of [2, 15, 28, 41, 54]) if (!(pz === 2 && (px === 15 || px === 41))) out.push([px, pz]);
  return out;
})();

const monument = defineBlueprintStructure({
  name: 'minecraft:ocean_monument',
  choose: (random, ctx) => {
    // The roof sits just under the sea's surface (sea level 26 in this world's oceans, unless the context says
    // otherwise); a higher sea floor is cut away by the water fill, and each pillar reaches down to the floor under it.
    const floorAt = (x, z) => (ctx.context.surfaceY ? ctx.context.surfaceY(x, z, 'ocean_floor_wg') : 20);
    const base = Math.max(1, (ctx.context.seaLevel ?? 26) - MONUMENT_HEIGHT - 1);
    const pillarDepths = MONUMENT_PILLAR_SPOTS.map(([px, pz]) => Math.max(0, base - 1 - floorAt(ctx.originX + px, ctx.originZ + pz)));
    return { seed: random.nextInt(), base, pillarDepths };
  },
  build: ({ seed, pillarDepths }) => buildMonument({ seed, pillarDepths }),
  baseY: (ctx) => ctx.params.base - Math.max(0, ...ctx.params.pillarDepths),
  rotate: false,
  offset: 0,
  meta: (start, ctx) => ({ base: ctx.params.base, elders: MONUMENT_ELDER_COUNT })
});

export const generateMonument = monument.generate;
export const realizeMonument = monument.realize;
