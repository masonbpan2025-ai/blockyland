// Strongholds, from the wiki (https://minecraft.wiki/w/Stronghold and /Structure).
//
// From the pages:
//   * 128 strongholds in eight rings (the `strongholds` concentric-rings set); "biased toward biomes in the
//     #stronghold_biased_to biome tag by searching horizontally" -- the start moves to the nearest land biome within
//     112 blocks;
//   * "starts with a spiral staircase room that leads down to a five-way intersection. From there, additional rooms are
//     randomly generated. The layout can extend up to 50 rooms away from the original room and within a horizontal
//     radius of 112 blocks. If no portal room is generated during this process, the stronghold generation restarts";
//   * the walls: stone bricks 45%, mossy 30%, cracked 20%, infested 5%;
//   * the pieces and their limits: straight corridor (5 long, each side exit 50%, up to 4 torches at 10%), left and
//     right turns (equal chance), spiral staircase (0-5), straight staircase (0-5, an empty alcove under the stairs),
//     five-way crossing (0-4, plus the one at the start: front and lower exits always, the upper +x/+z exit 2/3, the
//     other three 1/2 each), prison hall (0-5: two cells with iron doors), chest corridor (0-4: a chest on an altar),
//     room crossing (0-6: four exits; empty, fountain, pillar or store -- the store has two floors, a ladder and a
//     chest), library (0-2, never within four rooms of the start: large with two chests, small with one when the
//     large does not fit; 7% of the air within 4 blocks of the floor is cobweb), and the portal room (exactly one,
//     never within five rooms of the start: 12 frames, each with a 10% chance of an eye, a silverfish spawner, its
//     door always grates);
//   * doors at room entrances: an opening (twice as likely), grates, a wooden door or an iron door; the start always
//     an opening;
//   * filler corridors: plain stone bricks, where a room failed but another part is within 4 blocks.
//
// The portal room is the /Structure page's drawing (frames, lava, spawner, stairs, iron bar windows), with the floor
// under its frames filled in. The other pieces are built to the descriptions on the frame the drawings share: 5 wide,
// 5 tall corridors with a stone-brick shell.
//
// Ours: which piece follows which (weights), the cap of 120 pieces, the exact interiors of the rooms other than the portal room, and the
// stronghold's depth in this 64-tall world (P0.4: it starts 6 below the ground).

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { BlockBox } from '../geometry.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';
import { cellsOf } from '../blueprintStructure.js';
import { BLUEPRINTS } from './blueprints/stronghold.js';

export const STRONGHOLD_LOOT = { corridor: 'minecraft:chests/stronghold_corridor', crossing: 'minecraft:chests/stronghold_crossing', library: 'minecraft:chests/stronghold_library' };
/** The wiki's per-stronghold limits; unlimited pieces have Infinity. */
export const PIECE_LIMITS = { corridor: Infinity, turn: Infinity, spiral: 5, straight_stairs: 5, five_way: 4, prison: 5, chest_corridor: 4, room: 6, library: 2, portal: 1 };
/** Which piece comes next: weights (ours). */
const WEIGHTS = [['corridor', 40], ['turn', 20], ['spiral', 5], ['straight_stairs', 5], ['five_way', 5], ['prison', 5], ['chest_corridor', 5], ['room', 10], ['library', 5], ['portal', 20]];
export const MAX_ROOMS = 50;
export const MAX_RADIUS = 112;
/** At most this many pieces (ours: the wiki's depth and radius limits alone let corridors fill the whole radius). */
export const MAX_PIECES = 120;
export const EYE_CHANCE = 0.1;
export const WALL_MIX = [['stone_bricks', 0.45], ['mossy_stone_bricks', 0.3], ['cracked_stone_bricks', 0.2], ['infested_stone_bricks', 0.05]];

const F = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const CW = { north: 'east', east: 'south', south: 'west', west: 'north' };
const CCW = { north: 'west', west: 'south', south: 'east', east: 'north' };
const BACK = { north: 'south', south: 'north', east: 'west', west: 'east' };

/** Piece sizes [width, height, depth], entrance x, entrance floor y. */
const SIZES = {
  start: [5, 11, 5, 2, 6], spiral: [5, 11, 5, 2, 6], corridor: [5, 5, 7, 2, 0], turn: [5, 5, 5, 2, 0],
  straight_stairs: [5, 11, 8, 2, 6], five_way: [10, 9, 11, 2, 3], prison: [9, 5, 11, 4, 0], chest_corridor: [5, 5, 7, 2, 0],
  room: [11, 7, 11, 5, 0], library: [14, 11, 15, 5, 0], library_small: [14, 6, 15, 5, 0], portal: [11, 8, 16, 5, 0], filler: [5, 5, 1, 2, 0]
};

export function buildStronghold({ seed, x, y, z }) {
  const random = new LegacyRandom(BigInt(seed));
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = tryBuild(random, x, y, z);
    if (result.portal) return result;
  }
  return tryBuild(random, x, y, z);
}

function tryBuild(random, sx, sy, sz) {
  const canvas = new CellCanvas();
  const pieces = [];
  const counts = {};
  let portal = false;

  const wall = () => {
    let r = random.nextFloat();
    for (const [name, share] of WALL_MIX) { if (r < share) return name; r -= share; }
    return 'stone_bricks';
  };
  /** A piece's frame: local (x across, y up, z forward) to world, from the entrance point and direction. */
  const frame = (kind, at, dir) => {
    const [w, h, d, ex, ey] = SIZES[kind];
    const [fx, fz] = F[dir]; const [rx, rz] = F[CW[dir]];
    const toWorld = (lx, ly, lz) => [at.x + rx * (lx - ex) + fx * lz, at.y - ey + ly, at.z + rz * (lx - ex) + fz * lz];
    const a = toWorld(0, 0, 0); const b = toWorld(w - 1, h - 1, d - 1);
    const box = new BlockBox(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]));
    return { kind, w, h, d, ex, ey, dir, at, toWorld, box };
  };
  const fits = (p) => p.box.minY >= 1 && Math.hypot(p.box.minX - sx, p.box.minZ - sz) <= MAX_RADIUS && Math.hypot(p.box.maxX - sx, p.box.maxZ - sz) <= MAX_RADIUS && !pieces.some((q) => q.box.intersects(p.box));
  const set = (p, lx, ly, lz, name, props = null, nbt = null) => { const [wx, wy, wz] = p.toWorld(lx, ly, lz); canvas.set(wx, wy, wz, name, props, nbt); };
  /** A world facing for a local one ('front' is the piece's own forward). */
  const face = (p, local) => ({ front: p.dir, back: BACK[p.dir], left: CCW[p.dir], right: CW[p.dir] }[local]);

  /** The shell: walls of mixed bricks, hollow inside. `plain` for filler corridors. */
  const shell = (p, plain = false) => {
    for (let lx = 0; lx < p.w; lx++) for (let ly = 0; ly < p.h; ly++) for (let lz = 0; lz < p.d; lz++) {
      const edge = lx === 0 || lx === p.w - 1 || ly === 0 || ly === p.h - 1 || lz === 0 || lz === p.d - 1;
      set(p, lx, ly, lz, edge ? (plain ? 'stone_bricks' : wall()) : 'air');
    }
  };
  /** A 3x3 opening in a wall, at local x (centre) and floor y, on the given side ('front' is z = 0). */
  const opening = (p, side, centre, floor = 0) => {
    for (let a = -1; a <= 1; a++) for (let up = 1; up <= 3; up++) {
      if (side === 'entrance') set(p, centre + a, floor + up, 0, 'air');
      else if (side === 'front') set(p, centre + a, floor + up, p.d - 1, 'air');
      else if (side === 'left') set(p, 0, floor + up, centre + a, 'air');
      else set(p, p.w - 1, floor + up, centre + a, 'air');
    }
  };
  /** The connection point just outside an exit. */
  const exitPoint = (p, side, centre, floor = 0) => {
    if (side === 'front') { const [wx, wy, wz] = p.toWorld(centre, floor, p.d); return { x: wx, y: wy, z: wz, dir: p.dir }; }
    if (side === 'left') { const [wx, wy, wz] = p.toWorld(-1, floor, centre); return { x: wx, y: wy, z: wz, dir: CCW[p.dir] }; }
    const [wx, wy, wz] = p.toWorld(p.w, floor, centre); return { x: wx, y: wy, z: wz, dir: CW[p.dir] };
  };
  /** A door in the entrance: an opening (twice as likely), grates, a wooden door or an iron door. */
  const door = (p, forced = null) => {
    const r = random.nextIntBound(5);
    const kind = forced ?? (r < 2 ? 'opening' : r === 2 ? 'grates' : r === 3 ? 'wood' : 'iron');
    const c = p.ex;
    if (kind === 'grates') { for (let a = -1; a <= 1; a++) for (let up = 1; up <= 3; up++) set(p, c + a, up + p.ey, 0, a === 0 && up < 3 ? 'air' : 'iron_bars'); }
    else if (kind === 'wood' || kind === 'iron') {
      for (let a = -1; a <= 1; a++) for (let up = 1; up <= 3; up++) if (a !== 0 || up === 3) set(p, c + a, up + p.ey, 0, 'stone_bricks');
      const name = kind === 'wood' ? 'oak_door' : 'iron_door';
      set(p, c, 1 + p.ey, 0, name, { facing: p.dir, half: 'lower', hinge: 'left', open: 'false' });
      set(p, c, 2 + p.ey, 0, name, { facing: p.dir, half: 'upper', hinge: 'left', open: 'false' });
      if (kind === 'iron') set(p, c + 1, 2 + p.ey, 1, 'stone_button', { face: 'wall', facing: p.dir });
    }
    return kind;
  };

  const queue = [];
  const place = (kind, at, depth, fromStart) => {
    if ((counts[kind] ?? 0) >= (PIECE_LIMITS[kind] ?? Infinity)) return false;
    if (kind === 'library' && fromStart <= 4) return false;
    if (kind === 'portal' && fromStart <= 5) return false;
    let p = frame(kind, at, at.dir);
    if (kind === 'library' && !fits(p)) p = frame('library_small', at, at.dir);
    if (!fits(p)) return false;
    pieces.push({ box: p.box, kind });
    counts[kind] = (counts[kind] ?? 0) + 1;
    BUILD[p.kind === 'library_small' ? 'library' : p.kind](p, depth, fromStart);
    return true;
  };
  const next = (pt, depth, fromStart) => {
    if (depth > MAX_ROOMS) return;
    queue.push({ pt, depth, fromStart });
  };
  const pick = () => {
    const open = WEIGHTS.filter(([k]) => (counts[k] ?? 0) < PIECE_LIMITS[k]);
    const total = open.reduce((s, [, w]) => s + w, 0);
    let r = random.nextIntBound(total);
    for (const [k, w] of open) { if ((r -= w) < 0) return k; }
    return 'corridor';
  };

  const BUILD = {
    start(p) { shell(p); spiralInside(p); door(p, 'opening'); },
    spiral(p, depth, fromStart) { shell(p); spiralInside(p); door(p); opening(p, 'front', 2); next(exitPoint(p, 'front', 2), depth + 1, fromStart + 1); },
    corridor(p, depth, fromStart) {
      shell(p); door(p); opening(p, 'front', 2);
      for (const side of ['left', 'right']) if (random.nextFloat() < 0.5) { opening(p, side, 3); next(exitPoint(p, side, 3), depth + 1, fromStart + 1); }
      for (const [lx, lz, f] of [[1, 2, 'right'], [3, 2, 'left'], [1, 4, 'right'], [3, 4, 'left']]) if (random.nextFloat() < 0.1) set(p, lx, 2, lz, 'wall_torch', { facing: face(p, f) });
      next(exitPoint(p, 'front', 2), depth + 1, fromStart + 1);
    },
    turn(p, depth, fromStart) {
      shell(p); door(p);
      const side = random.nextFloat() < 0.5 ? 'left' : 'right';
      opening(p, side, 2);
      next(exitPoint(p, side, 2), depth + 1, fromStart + 1);
    },
    straight_stairs(p, depth, fromStart) {
      shell(p); door(p);
      // One step down per block forward, the solid steps leaving an empty alcove under them.
      for (let lz = 1; lz < p.d - 1; lz++) {
        const top = Math.max(0, 6 - (lz - 1));
        for (let lx = 1; lx <= 3; lx++) { for (let ly = 1; ly < top; ly++) set(p, lx, ly, lz, ly < top - 1 && lz < 3 ? 'air' : wall()); set(p, lx, top, lz, 'smooth_stone_slab', { type: 'bottom' }); }
      }
      opening(p, 'front', 2);
      next(exitPoint(p, 'front', 2), depth + 1, fromStart + 1);
    },
    five_way(p, depth, fromStart) {
      shell(p); door(p);
      // A raised walkway along one side, with a stair down from the entrance level.
      for (let lz = 1; lz < p.d - 1; lz++) for (let lx = 1; lx <= 3; lx++) set(p, lx, 3, lz, wall());
      // Exits: the front (lower) always; the upper +x side 2/3; the other three 1/2 each.
      opening(p, 'front', 5); next(exitPoint(p, 'front', 5), depth + 1, fromStart + 1);
      if (random.nextFloat() < 2 / 3) { opening(p, 'right', 3, 3); next(exitPoint(p, 'right', 3, 3), depth + 1, fromStart + 1); }
      if (random.nextFloat() < 0.5) { opening(p, 'right', 7); next(exitPoint(p, 'right', 7), depth + 1, fromStart + 1); }
      if (random.nextFloat() < 0.5) { opening(p, 'left', 3, 3); next(exitPoint(p, 'left', 3, 3), depth + 1, fromStart + 1); }
      if (random.nextFloat() < 0.5) { opening(p, 'left', 7); next(exitPoint(p, 'left', 7), depth + 1, fromStart + 1); }
    },
    prison(p, depth, fromStart) {
      shell(p); door(p);
      // A hall along the right; two cells on the left behind iron bars, each with an iron door.
      for (const [z0, z1] of [[2, 4], [6, 8]]) {
        for (let lz = z0 - 1; lz <= z1 + 1; lz++) for (let ly = 1; ly <= 3; ly++) set(p, 4, ly, lz, lz === z0 - 1 || lz === z1 + 1 ? wall() : 'iron_bars');
        set(p, 4, 1, z0 + 1, 'iron_door', { facing: face(p, 'left'), half: 'lower', hinge: 'left', open: 'false' });
        set(p, 4, 2, z0 + 1, 'iron_door', { facing: face(p, 'left'), half: 'upper', hinge: 'left', open: 'false' });
      }
      opening(p, 'front', 4);
      next(exitPoint(p, 'front', 4), depth + 1, fromStart + 1);
    },
    chest_corridor(p, depth, fromStart) {
      shell(p); door(p); opening(p, 'front', 2);
      for (let lz = 2; lz <= 4; lz++) set(p, 3, 1, lz, 'stone_brick_slab', { type: 'bottom' });
      set(p, 3, 2, 3, 'chest', { facing: face(p, 'left') }, { id: 'minecraft:chest', LootTable: STRONGHOLD_LOOT.corridor });
      next(exitPoint(p, 'front', 2), depth + 1, fromStart + 1);
    },
    room(p, depth, fromStart) {
      shell(p); door(p);
      opening(p, 'front', 5); opening(p, 'left', 5); opening(p, 'right', 5);
      for (const side of ['front', 'left', 'right']) next(exitPoint(p, side, 5), depth + 1, fromStart + 1);
      const variant = random.nextIntBound(4);
      if (variant === 1) { // fountain
        for (let lx = 4; lx <= 6; lx++) for (let lz = 4; lz <= 6; lz++) set(p, lx, 1, lz, lx === 5 && lz === 5 ? 'water' : 'stone_bricks');
        set(p, 5, 2, 5, 'stone_bricks'); set(p, 5, 3, 5, 'water');
      } else if (variant === 2) { // pillar with torches
        for (let ly = 1; ly < p.h - 1; ly++) set(p, 5, ly, 5, 'stone_bricks');
        for (const [lx, lz, f] of [[4, 5, 'left'], [6, 5, 'right'], [5, 4, 'back'], [5, 6, 'front']]) set(p, lx, 3, lz, 'wall_torch', { facing: face(p, f) });
      } else if (variant === 3) { // store: two floors, a ladder, a chest
        for (let lx = 1; lx < p.w - 1; lx++) for (let lz = 1; lz < p.d - 1; lz++) set(p, lx, 3, lz, 'oak_planks');
        for (let ly = 1; ly <= 3; ly++) set(p, 5, ly, 5, 'cobblestone');
        set(p, 5, 2, 4, 'wall_torch', { facing: face(p, 'back') });
        for (let ly = 1; ly <= 4; ly++) set(p, 1, ly, 9, 'ladder', { facing: face(p, 'right') });
        set(p, 1, 3, 9, 'ladder', { facing: face(p, 'right') });
        set(p, 9, 4, 9, 'chest', { facing: face(p, 'back') }, { id: 'minecraft:chest', LootTable: STRONGHOLD_LOOT.crossing });
      }
      p.variant = ['empty', 'fountain', 'pillar', 'store'][variant];
      pieces[pieces.length - 1].variant = p.variant;
    },
    library(p) {
      shell(p); door(p);
      const large = p.h === 11;
      const floors = large ? [0, 6] : [0];
      for (const f of floors) {
        for (let lz = 2; lz < p.d - 2; lz += 3) for (let lx = 2; lx < p.w - 2; lx++) if (lx !== 6 && lx !== 7) for (let ly = 1; ly <= 3; ly++) set(p, lx, f + ly, lz, 'bookshelf');
        if (f > 0) for (let lx = 1; lx < p.w - 1; lx++) for (let lz = 1; lz < p.d - 1; lz++) if (lx < 3 || lx > p.w - 4 || lz < 3 || lz > p.d - 4) set(p, lx, f, lz, 'oak_planks');
      }
      if (large) for (let ly = 1; ly <= 6; ly++) set(p, 1, ly, 1, 'ladder', { facing: face(p, 'right') });
      set(p, 6, 1, p.d - 2, 'chest', { facing: face(p, 'back') }, { id: 'minecraft:chest', LootTable: STRONGHOLD_LOOT.library });
      if (large) set(p, 7, 7, p.d - 2, 'chest', { facing: face(p, 'back') }, { id: 'minecraft:chest', LootTable: STRONGHOLD_LOOT.library });
      // "Each air block within 4 blocks above the ground (inclusive) has a 7% chance of being replaced by a cobweb".
      for (let lx = 1; lx < p.w - 1; lx++) for (let lz = 1; lz < p.d - 1; lz++) for (let ly = 1; ly <= 4; ly++) {
        const [wx, wy, wz] = p.toWorld(lx, ly, lz);
        if (canvas.get(wx, wy, wz)?.name === 'air' && random.nextFloat() < 0.07) canvas.set(wx, wy, wz, 'cobweb');
      }
      pieces[pieces.length - 1].kind = large ? 'library' : 'library';
      pieces[pieces.length - 1].large = large;
    },
    portal(p) {
      portal = true;
      // The /Structure drawing, its entrance (the grates) at its far row; floor under it and under the frame ring.
      const data = BLUEPRINTS.end_portal_room;
      const cells = cellsOf(data);
      const L = (c) => [c.x, c.y + 1, data.size[2] - 1 - c.z];
      for (let lx = 0; lx < p.w; lx++) for (let lz = 0; lz < p.d; lz++) set(p, lx, 0, lz, 'stone_bricks');
      const frames = cells.filter((c) => c.name === 'end_portal_frame');
      const fx = frames.reduce((s, c) => s + c.x, 0) / frames.length; const fz = frames.reduce((s, c) => s + c.z, 0) / frames.length;
      for (const c of cells) {
        const [lx, ly, lz] = L(c);
        if (c.name === 'end_portal_frame') {
          // Each frame faces the middle of the ring; 10% hold an eye.
          const dx = fx - c.x; const dz = fz - c.z;
          const localFacing = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'back' : 'front');
          set(p, lx, ly, lz, random.nextFloat() < EYE_CHANCE ? 'end_portal_frame_filled' : 'end_portal_frame', { facing: face(p, localFacing) });
          set(p, lx, ly - 1, lz, 'stone_bricks');
        } else if (c.name === 'spawner') set(p, lx, ly, lz, 'spawner', null, { id: 'minecraft:mob_spawner', SpawnData: { entity: { id: 'minecraft:silverfish' } } });
        else if (c.name === 'stone_brick_stairs') set(p, lx, ly, lz, 'stone_brick_stairs', { facing: face(p, 'front'), half: 'bottom' });
        else set(p, lx, ly, lz, c.name === 'stone_bricks' ? wall() : c.name);
      }
      // Air elsewhere inside, so the room is complete ("always generates with a complete outer wall").
      for (let lx = 1; lx < p.w - 1; lx++) for (let lz = 1; lz < p.d - 1; lz++) for (let ly = 1; ly < p.h - 1; ly++) { const [wx, wy, wz] = p.toWorld(lx, ly, lz); if (!canvas.get(wx, wy, wz)) canvas.set(wx, wy, wz, 'air'); }
      door(p, 'grates');
    },
    filler(p) { for (let lx = 0; lx < p.w; lx++) for (let ly = 0; ly < p.h; ly++) set(p, lx, ly, 0, lx === 0 || lx === p.w - 1 || ly === 0 || ly === p.h - 1 ? 'stone_bricks' : 'air'); }
  };

  /** The spiral staircase: a stair of slabs and bricks winding down the 5x5 shaft. */
  function spiralInside(p) {
    const ring = [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]];
    for (let i = 0; i < 7; i++) {
      const [lx, lz] = ring[i % ring.length];
      const ly = 6 - i;
      set(p, lx, ly, lz, i % 2 ? 'smooth_stone_slab' : 'stone_bricks', i % 2 ? { type: 'bottom' } : null);
    }
    set(p, 2, 2, 2, 'stone_bricks'); for (let ly = 1; ly < 10; ly++) set(p, 2, ly, 2, 'stone_bricks');
    opening(p, 'front', 2);
  }

  // The start: a spiral staircase (its centre at chunk-local 4, 4), then a five-way crossing.
  const start = frame('start', { x: sx, y: sy, z: sz, dir: 'south' }, 'south');
  pieces.push({ box: start.box, kind: 'start' });
  BUILD.start(start);
  place('five_way', exitPoint(start, 'front', 2), 1, 1) || null;
  counts.five_way = (counts.five_way ?? 1) - 1; // the start's crossing does not count against the four

  while (queue.length && pieces.length < MAX_PIECES) {
    const { pt, depth, fromStart } = queue.shift();
    let placed = false;
    for (let tries = 0; tries < 5 && !placed; tries++) placed = place(pick(), pt, depth, fromStart);
    // A failed exit near another part becomes a filler corridor (plain bricks, up to 3).
    if (!placed) {
      for (let n = 0; n < 3; n++) {
        const at = { x: pt.x + F[pt.dir][0] * n, y: pt.y, z: pt.z + F[pt.dir][1] * n, dir: pt.dir };
        const f = frame('filler', at, pt.dir);
        if (!fits(f)) break;
        const nearby = pieces.some((q) => q.box.intersects(new BlockBox(f.box.minX - 4, f.box.minY, f.box.minZ - 4, f.box.maxX + 4, f.box.maxY, f.box.maxZ + 4)) && q.box.minY <= pt.y && q.box.maxY >= pt.y);
        if (!nearby) break;
        pieces.push({ box: f.box, kind: 'filler' });
        BUILD.filler(f);
      }
    }
  }
  return { canvas, pieces, counts, portal };
}

/** "searching horizontally for biomes in that tag ... moving the start" -- the nearest land biome within 112 blocks. */
const WATERY = /ocean|river|beach/;
export function biasedStart(x, z, biomeAt) {
  if (!biomeAt || !WATERY.test(biomeAt(x, z) ?? '')) return [x, z];
  for (let r = 16; r <= MAX_RADIUS; r += 16) for (let a = 0; a < 8; a++) {
    const nx = Math.round(x + Math.cos((a * Math.PI) / 4) * r); const nz = Math.round(z + Math.sin((a * Math.PI) / 4) * r);
    if (!WATERY.test(biomeAt(nx, nz) ?? '')) return [nx, nz];
  }
  return [x, z];
}

export function generateStronghold({ seed, chunkX, chunkZ, structureId, context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const [bx, bz] = biasedStart(chunkX * 16 + 4, chunkZ * 16 + 4, context.biomeAt);
  // The spiral staircase's centre at chunk-local 4, 4 of the (moved) start chunk.
  const x = Math.floor(bx / 16) * 16 + 4; const z = Math.floor(bz / 16) * 16 + 4;
  const ground = context.surfaceY ? context.surfaceY(x, z) : 40;
  const y = Math.max(20, ground - 6);
  const { canvas, pieces, counts, portal } = buildStronghold({ seed: random.nextInt(), x, y, z });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:stronghold', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    meta: { counts, portal, start: [x, y, z], kinds: pieces.map((p) => p.kind), variants: pieces.filter((p) => p.variant).map((p) => p.variant) }
  });
}

export function realizeStronghold(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'stronghold: the wiki\'s pieces and rules' };
}
