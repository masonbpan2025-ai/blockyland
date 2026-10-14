// Mineshafts, from the wiki (https://minecraft.wiki/w/Mineshaft and /Structure).
//
// From the pages:
//   * "underground in any Overworld biome except for the deep dark"; badlands mineshafts "are composed of dark oak
//     planks and fences" and often reach the surface; "a 0.4% chance to attempt to begin generating in every chunk";
//   * "Starting point: a 10x10 parlor, with an arched ceiling and one to four exits in each direction";
//   * "Corridors: some 3x3 tunnels ... supported by planks and fences ... these supports are placed four blocks away
//     from each other ... torches and cobwebs ... incomplete rail systems on the ground, upon which minecarts with
//     chests generate uncommonly. Cobwebs do not generate if they would not be connected to solid blocks, while
//     corridors generate with log pillars, iron chains, and fences for support if they are in mid-air";
//   * "Crossings: dual-floor, 5x5 intersections supported by wooden columns"; "Staircases: diagonal tunnels, stairs
//     blocks are not used"; "Abandoned passageways: accessory corridors with numerous cobwebs concealing cave spider
//     monster spawners"; "Any chest found in a mineshaft always occurs as a minecart with chest";
//   * when corridors cross caves, "a bridge of planks over empty space, either suspended with iron chains above or
//     supported by log pillars below";
//   * the /Structure drawings: a corridor segment (two supports five apart: fences either side and three planks over,
//     rails down the middle), the spawner segment (cobwebs all through, spawner on the floor), a crossing's corner
//     columns, the staircase (one down per block).
//
// Ours (the wiki gives no numbers): corridor lengths (2-4 segments of 5), what follows a corridor (70% corridor, 10%
// staircase, 20% crossing), depth (at most 8 pieces from the room) and reach (80 blocks), the rail share (70%), cobweb
// share (6% of the cells under the roof), one corridor in 23 abandoned, one in three with a chest minecart, a torch on
// one support in four. This world is 64 tall (P0.4 remap): the room is at y 8 up to 15 under the ground; badlands
// mineshafts at the ground's level less 8.

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { BlockBox } from '../geometry.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';

export const MINESHAFT_CHANCE = 0.004;
export const MINESHAFT_LOOT = 'minecraft:chests/abandoned_mineshaft';
export const MAX_DEPTH = 8;
export const MAX_REACH = 80;
const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const LEFT = { north: 'west', west: 'south', south: 'east', east: 'north' };
const RIGHT = { north: 'east', east: 'south', south: 'west', west: 'north' };

export function buildMineshaft({ seed, x, y, z, mesa = false, solidAt = null }) {
  const random = new LegacyRandom(BigInt(seed));
  const wood = mesa ? 'dark_oak' : 'oak';
  const canvas = new CellCanvas();
  const pieces = [];
  const ground = solidAt ?? (() => true);
  // A piece may not overlap another, and must stay within reach of the room in each direction.
  const overlaps = (box) => pieces.some((p) => p.box.intersects(box))
    || Math.max(Math.abs(box.minX - (x + 5)), Math.abs(box.maxX - (x + 5)), Math.abs(box.minZ - (z + 5)), Math.abs(box.maxZ - (z + 5))) > MAX_REACH;

  // The room: 10 x 10, an arched ceiling, its floor the ground's own (dirt in vanilla).
  const room = new BlockBox(x, y, z, x + 9, y + 6, z + 9);
  pieces.push({ box: room, kind: 'room' });
  for (let dx = 0; dx < 10; dx++) for (let dz = 0; dz < 10; dz++) {
    const arch = Math.round(2 * Math.sin((Math.PI * (dx + 0.5)) / 10)); // higher in the middle
    canvas.set(x + dx, y, z + dz, 'dirt');
    for (let dy = 1; dy <= 3 + arch; dy++) canvas.set(x + dx, y + dy, z + dz, 'air');
  }
  const queue = [];
  // One to four exits on each side.
  for (const dir of ['north', 'south', 'east', 'west']) {
    const n = 1 + random.nextIntBound(4);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      const along = 1 + random.nextIntBound(6);
      if ([...used].some((u) => Math.abs(u - along) < 4)) continue;
      used.add(along);
      const [dx, dz] = DIRS[dir];
      const sx = dir === 'east' ? x + 10 : dir === 'west' ? x - 1 : x + along;
      const sz = dir === 'south' ? z + 10 : dir === 'north' ? z - 1 : z + along;
      queue.push({ kind: 'corridor', x: sx, y: y + 1, z: sz, dir, depth: 1 });
    }
  }
  const centre = [x + 5, z + 5];
  let corridors = 0;

  /** Box of a 3-wide piece running `length` from (x, z) in `dir`, from floor y to y + height - 1. */
  function runBox(p, length, height, down = 0) {
    const [dx, dz] = DIRS[p.dir];
    const ax = p.x + dx * (length - 1); const az = p.z + dz * (length - 1);
    const sideX = dz !== 0 ? 1 : 0; const sideZ = dx !== 0 ? 1 : 0;
    return new BlockBox(Math.min(p.x, ax) - sideX, p.y - 1 - down, Math.min(p.z, az) - sideZ, Math.max(p.x, ax) + sideX, p.y + height - 1, Math.max(p.z, az) + sideZ);
  }
  const at = (p, along, side, up) => {
    const [dx, dz] = DIRS[p.dir];
    // `side` runs across the corridor: along x for a north-south corridor, along z for an east-west one.
    return [p.x + dx * along + (dz !== 0 ? side : 0), p.y + up, p.z + dz * along + (dx !== 0 ? side : 0)];
  };
  const after = (p, length, depth) => {
    const [dx, dz] = DIRS[p.dir];
    const nx = p.x + dx * length; const nz = p.z + dz * length;
    const r = random.nextIntBound(100);
    const kind = r < 70 ? 'corridor' : r < 80 ? 'stairs' : 'crossing';
    queue.push({ kind, x: nx, y: p.y, z: nz, dir: p.dir, depth });
  };

  function corridor(p) {
    const segments = 2 + random.nextIntBound(3);
    const length = segments * 5 + 1;
    const box = runBox(p, length, 3);
    if (overlaps(box)) return;
    pieces.push({ box, kind: 'corridor' });
    corridors++;
    const abandoned = random.nextIntBound(23) === 0;
    const cartAt = random.nextIntBound(3) === 0 ? 1 + random.nextIntBound(length - 2) : -1;
    for (let a = 0; a < length; a++) {
      for (let s = -1; s <= 1; s++) {
        const [cx, cy, cz] = at(p, a, s, 0);
        for (let up = 0; up < 3; up++) canvas.set(cx, cy + up, cz, 'air');
        // A bridge of planks where the corridor crosses empty space, held by a chain above or a log below.
        if (!ground(cx, cy - 1, cz)) {
          canvas.set(cx, cy - 1, cz, `${wood}_planks`);
          if (s === 0 && a % 5 === 0) {
            if (ground(cx, cy + 3, cz)) canvas.set(cx, cy + 3, cz, 'chain', { axis: 'y' });
            else for (let d = 2; d < 8 && !ground(cx, cy - d, cz); d++) canvas.set(cx, cy - d, cz, `${wood}_log`, { axis: 'y' });
          }
        }
      }
      const support = a % 5 === 0;
      if (support) {
        const [lx, , lz] = at(p, a, -1, 0); const [rx, , rz] = at(p, a, 1, 0);
        for (const [fx, fz] of [[lx, lz], [rx, rz]]) for (let up = 0; up < 2; up++) canvas.set(fx, p.y + up, fz, `${wood}_fence`);
        for (let s = -1; s <= 1; s++) { const [bx, , bz] = at(p, a, s, 0); canvas.set(bx, p.y + 2, bz, `${wood}_planks`); }
        if (random.nextIntBound(4) === 0) { const [tx, , tz] = at(p, a + 1, -1, 0); canvas.set(tx, p.y + 1, tz, 'torch'); }
      } else if (abandoned) {
        for (let s = -1; s <= 1; s++) for (let up = 0; up < 3; up++) { const [wx, , wz] = at(p, a, s, 0); canvas.set(wx, p.y + up, wz, 'cobweb'); }
      } else {
        // Cobwebs under the roof, only against the solid ground.
        for (let s = -1; s <= 1; s++) {
          const [wx, , wz] = at(p, a, s, 0);
          if (ground(wx, p.y + 3, wz) && random.nextFloat() < 0.06) canvas.set(wx, p.y + 2, wz, 'cobweb');
        }
      }
      const [mx, , mz] = at(p, a, 0, 0);
      if (!abandoned && !support && random.nextFloat() < 0.7) canvas.set(mx, p.y, mz, 'rail', { shape: p.dir === 'north' || p.dir === 'south' ? 'north_south' : 'east_west' });
      if (a === cartAt && !abandoned) {
        canvas.set(mx, p.y, mz, 'rail', { shape: p.dir === 'north' || p.dir === 'south' ? 'north_south' : 'east_west' });
        canvas.entities.push({ type: 'chest_minecart', x: mx + 0.5, y: p.y, z: mz + 0.5, options: { lootTable: MINESHAFT_LOOT } });
      }
    }
    if (abandoned) {
      const [sx, , sz] = at(p, Math.floor(length / 2), 0, 0);
      canvas.set(sx, p.y, sz, 'spawner', null, { id: 'minecraft:mob_spawner', SpawnData: { entity: { id: 'minecraft:cave_spider' } } });
    }
    after(p, length, p.depth + 1);
  }

  function crossing(p) {
    const dual = random.nextIntBound(4) === 0;
    const height = dual ? 7 : 3;
    const box = runBox({ ...p }, 3, height);
    if (overlaps(box)) return;
    pieces.push({ box, kind: 'crossing' });
    const [dx, dz] = DIRS[p.dir];
    const cx = p.x + dx; const cz = p.z + dz; // the crossing's middle
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      canvas.set(cx + ox, p.y - 1, cz + oz, ground(cx + ox, p.y - 1, cz + oz) ? 'stone' : `${wood}_planks`);
      for (let up = 0; up < height; up++) canvas.set(cx + ox, p.y + up, cz + oz, (Math.abs(ox) === 1 && Math.abs(oz) === 1) ? `${wood}_planks` : 'air');
    }
    if (dual) for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) if (!(ox === 0 && oz === 0)) canvas.set(cx + ox, p.y + 3, cz + oz, `${wood}_planks`);
    for (const dir of [p.dir, LEFT[p.dir], RIGHT[p.dir]]) {
      if (random.nextFloat() < 0.6) {
        const [ex, ez] = DIRS[dir];
        queue.push({ kind: 'corridor', x: cx + ex * 2, y: p.y, z: cz + ez * 2, dir, depth: p.depth + 1 });
      }
    }
  }

  function stairs(p) {
    // Not through the bottom of the world (the bedrock floor is y 0).
    if (p.y - 7 < 1) { corridor(p); return; }
    const box = runBox(p, 8, 3, 6);
    if (overlaps(box)) return;
    pieces.push({ box, kind: 'stairs' });
    for (let a = 0; a < 8; a++) {
      const drop = Math.max(0, Math.min(5, a - 1));
      for (let s = -1; s <= 1; s++) {
        const [cx, , cz] = at(p, a, s, 0);
        canvas.set(cx, p.y - 1 - drop, cz, 'stone');
        for (let up = 0; up < 3 + (a > 0 && a < 7 ? 1 : 0); up++) canvas.set(cx, p.y - drop + up, cz, 'air');
      }
    }
    queue.push({ kind: 'corridor', x: p.x + DIRS[p.dir][0] * 8, y: p.y - 5, z: p.z + DIRS[p.dir][1] * 8, dir: p.dir, depth: p.depth + 1 });
  }

  while (queue.length) {
    const next = queue.shift();
    if (next.depth > MAX_DEPTH || Math.hypot(next.x - centre[0], next.z - centre[1]) > MAX_REACH) continue;
    if (next.kind === 'corridor') corridor(next);
    else if (next.kind === 'crossing') crossing(next);
    else stairs(next);
  }
  return { canvas, pieces, corridors };
}

export function generateMineshaft({ seed, chunkX, chunkZ, structureId, context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const mesa = structureId === 'mineshaft_mesa';
  const x = chunkX * 16 + 2; const z = chunkZ * 16 + 2;
  const surface = context.surfaceY ? context.surfaceY(x + 5, z + 5) : 40;
  const y = mesa ? surface - 8 : Math.max(4, 8 + random.nextIntBound(Math.max(1, surface - 23)));
  const { canvas, pieces, corridors } = buildMineshaft({ seed: random.nextInt(), x, y, z, mesa, solidAt: context.solidAt ?? ((bx, by, bz) => by <= (context.surfaceY ? context.surfaceY(bx, bz) : 40)) });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:mineshaft', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x + 5, z + 5) : null,
    meta: { mesa, y, corridors, pieceKinds: pieces.map((p) => p.kind) }
  });
}

export function realizeMineshaft(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'mineshaft: the wiki\'s pieces, procedural' };
}
