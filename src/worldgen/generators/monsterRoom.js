// Monster rooms (dungeons), from the wiki (https://minecraft.wiki/w/Monster_Room and /Structure).
//
// From the page:
//   * a feature in any Overworld biome; "Each chunk has fourteen attempts to generate monster rooms underground within
//     y-coordinates 0 to 320 or -58 to -1 ... up to 10 ... [in] 0 to 320, ... up to 4 ... in ... -58 to -1";
//   * "a location (the position for monster spawner) and size (an open area with a width and length of 7 or 9 and a
//     height of 6) is chosen. The attempt succeeds if": the floor area and the ceiling area (including under and over
//     the walls) are solid, and "The walls ... must have 1-5 openings (2-high air blocks) at floor level";
//   * "air and cobblestone are placed, then 3 attempts are made to generate each of two chests. To generate a chest,
//     the chosen block must be empty and must have a solid block on exactly one of its four sides. The monster spawner
//     is placed at the center";
//   * spawner: zombie 50%, skeleton 25%, spider 25%; "Cobblestone has a 75% chance to be mossy when it is on the floor";
//   * loot: the monster room (simple dungeon) table.
//
// The /Structure page's drawing is the 9 x 7 room: floor and four layers of wall, cobblestone where the ground was
// solid (the openings stay open), no ceiling of its own (the ground above is the ceiling).
//
// This world is 64 blocks tall with its ground near y 20-45, so the two height bands are mapped onto it (the P0.4
// remap): the ten upper attempts pick y in 1..60, the four deep ones y in 1..15.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { templateFrom } from '../blueprintStructure.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';

export const MONSTER_ROOM_ATTEMPTS = 14;
export const UPPER_ATTEMPTS = 10;
export const MONSTER_ROOM_LOOT = 'minecraft:chests/simple_dungeon';
export const SPAWNER_MOBS = [['zombie', 2], ['skeleton', 1], ['spider', 1]];

/** Plan one attempt: null if the ground does not allow it, else the room's parameters. */
export function tryMonsterRoom(random, solidAt, cx, y, cz) {
  const rx = 2 + random.nextIntBound(2); const rz = 2 + random.nextIntBound(2);
  // Outer box: x from cx-rx-1 to cx+rx+1 (7 or 9 wide), y from y-1 (floor) to y+4 (ceiling).
  const x0 = cx - rx - 1; const x1 = cx + rx + 1; const z0 = cz - rz - 1; const z1 = cz + rz + 1;
  if (!solidAt(cx, y + 4, cz) || !solidAt(cx, y - 1, cz)) return null;
  let openings = 0;
  const wall = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) wall.push([x, z]);
  for (const [x, z] of wall) if (!solidAt(x, y, z) && !solidAt(x, y + 1, z)) openings++;
  if (openings < 1 || openings > 5) return null;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!solidAt(x, y - 1, z) || !solidAt(x, y + 4, z)) return null;
  // Which wall blocks are solid (and become cobblestone), layer by layer.
  const solidWall = [];
  for (let dy = 0; dy < 4; dy++) for (const [x, z] of wall) if (solidAt(x, y + dy, z)) solidWall.push([x - x0, dy + 1, z - z0]);
  // Chests: two, three tries each, on an empty floor block with exactly one solid side.
  const isWall = (lx, ly, lz) => solidWall.some(([a, b, c]) => a === lx && b === ly && c === lz);
  const chests = [];
  for (let n = 0; n < 2; n++) {
    for (let tries = 0; tries < 3; tries++) {
      const lx = 1 + random.nextIntBound(2 * rx + 1); const lz = 1 + random.nextIntBound(2 * rz + 1);
      if (lx === rx + 1 && lz === rz + 1) continue; // the spawner's spot
      if (chests.some(([a, , c]) => a === lx && c === lz)) continue;
      const sides = [[1, 0, 'west'], [-1, 0, 'east'], [0, 1, 'north'], [0, -1, 'south']].filter(([dx, dz]) => isWall(lx + dx, 1, lz + dz));
      if (sides.length !== 1) continue;
      chests.push([lx, 1, lz, sides[0][2]]);
      break;
    }
  }
  let roll = random.nextIntBound(4);
  const mob = roll < 2 ? 'zombie' : roll === 2 ? 'skeleton' : 'spider';
  return { rx, rz, solidWall, chests, mob, seed: random.nextInt(), x: x0, y: y - 1, z: z0 };
}

export function buildMonsterRoom({ rx, rz, solidWall, chests, mob, seed }) {
  const sx = 2 * rx + 3; const sz = 2 * rz + 3;
  const random = new LegacyRandom(BigInt(seed));
  const cells = [];
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) cells.push({ x, y: 0, z, name: random.nextFloat() < 0.75 ? 'mossy_cobblestone' : 'cobblestone' });
  for (const [x, y, z] of solidWall) cells.push({ x, y, z, name: 'cobblestone' });
  for (let x = 1; x < sx - 1; x++) for (let z = 1; z < sz - 1; z++) for (let y = 1; y <= 4; y++) {
    const chest = chests.find(([a, b, c]) => a === x && b === y && c === z);
    if (chest) cells.push({ x, y, z, name: 'chest', props: { facing: chest[3] }, nbt: { id: 'minecraft:chest', LootTable: MONSTER_ROOM_LOOT } });
    else if (x === rx + 1 && z === rz + 1 && y === 1) cells.push({ x, y, z, name: 'spawner', nbt: { id: 'minecraft:mob_spawner', SpawnData: { entity: { id: `minecraft:${mob}` } } } });
    else cells.push({ x, y, z, name: 'air' });
  }
  return templateFrom(cells, [sx, 5, sz], { edit: (c) => c });
}

const cache = new Map();
function templateFor(params) {
  const key = JSON.stringify(params);
  if (!cache.has(key)) { cache.set(key, new StructureTemplate(buildMonsterRoom(params), 'minecraft:monster_room')); if (cache.size > 64) cache.delete(cache.keys().next().value); }
  return cache.get(key);
}

export function generateMonsterRoom({ seed, chunkX, chunkZ, structureId, context }) {
  // Without real terrain (the flat preview), the ground is solid up to the surface with one two-high tunnel along
  // each chunk's middle, eight blocks down (at most at y 30).
  const flatTop = (x, z) => (context.surfaceY ? context.surfaceY(x, z) : 28);
  const solidAt = context.solidAt ?? ((x, y, z) => {
    const top = flatTop(x, z);
    if (y > top) return false;
    const tunnel = Math.min(top - 8, 30);
    return !((y === tunnel || y === tunnel + 1) && (((z % 16) + 16) % 16 === 8 || ((z % 16) + 16) % 16 === 9));
  });
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const rooms = [];
  for (let attempt = 0; attempt < MONSTER_ROOM_ATTEMPTS; attempt++) {
    const x = chunkX * 16 + random.nextIntBound(16);
    const z = chunkZ * 16 + random.nextIntBound(16);
    const y = attempt < UPPER_ATTEMPTS ? 1 + random.nextIntBound(60) : 1 + random.nextIntBound(15);
    const room = tryMonsterRoom(random, solidAt, x, y, z);
    if (room && !rooms.some((r) => Math.abs(r.x - room.x) < 10 && Math.abs(r.z - room.z) < 10 && Math.abs(r.y - room.y) < 6)) rooms.push(room);
  }
  if (!rooms.length) return null;
  const pieces = rooms.map((params, index) => {
    const t = templateFor(params);
    const origin = { x: params.x, y: params.y, z: params.z };
    return new StructurePiece({ id: 'minecraft:monster_room', index, type: 'template', family: 'feature', template: 'minecraft:monster_room', box: t.boundingBox(origin, 0), meta: { origin, params } });
  });
  const start = new StructureStart({ structureId, chunkX, chunkZ, pieces, biome: context.biomeAt ? context.biomeAt(chunkX * 16 + 8, chunkZ * 16 + 8) : null, seed });
  start.meta = { rooms: rooms.length, mobs: rooms.map((r) => r.mob) };
  return start;
}

export function realizeMonsterRoom(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missing = new Set();
  const chests = [];
  let written = 0;
  for (const piece of start.pieces) {
    const t = templateFor(piece.meta.params);
    const placement = placeTemplate({ template: t, origin: piece.meta.origin, rotation: 0, processors: { processors: [] }, random: new LegacyRandom(0n), world: null });
    for (const block of placement.blocks) {
      const id = resolver.resolveState(block.state);
      if (id === null) { missing.add(block.state.name); continue; }
      const loot = block.nbt?.LootTable ?? null;
      if (loot) chests.push(loot);
      const spawner = block.nbt?.SpawnData?.entity?.id?.replace('minecraft:', '') ?? null;
      if (setBlock(block.x, block.y, block.z, id, { state: block.state, ...(loot ? { lootTable: loot } : {}), ...(spawner ? { spawner } : {}) })) written++;
    }
  }
  return { written, chests, missingBlocks: [...missing].sort(), note: 'monster rooms: the wiki\'s generation rules' };
}
