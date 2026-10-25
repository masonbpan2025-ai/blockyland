// The SkyWars map: floating islands in the void. Pure and deterministic, so the host and every guest can build or
// restore exactly the same arena from the seed, and tests can check it without a browser.
//
// minecraft.wiki Tutorial:SkyWars: "each player starts off on a separate island that is floating in the void";
// "Often there is a central, larger island that has better loot, an enchanting table, and sometimes several anvils."
// Hypixel SkyWars (hypixel.fandom.com/wiki/SkyWars): "Players spawn above small islands containing three chests".
import { BLOCKS } from '../../blocks.js';

export const ARENA = Object.freeze({
  /** The grass of every island is at this height; players stand one above it. The world is 64 blocks tall. */
  surfaceY: 30,
  /** Spawn islands sit this far from the middle; 13 open blocks lie between a spawn island and the centre island. */
  ringRadius: 24,
  spawnRadius: 4,
  centerRadius: 8,
  /** Falling below this is falling into the void: out of the game. */
  voidY: -4,
  /** One island per player. */
  maxPlayers: 8,
  chestsPerIsland: 3,
  centerChests: 4,
});

/**
 * Island directions, in slot order. Slots 0 and 1 face each other north and south, so two players start opposite,
 * then east and west, then the diagonals.
 */
export const SLOT_DIRECTIONS = Object.freeze([
  [0, -1], [0, 1], [1, 0], [-1, 0], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
]);

/** A small seeded random source (mulberry32). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cellKey = (x, y, z) => `${x},${y},${z}`;

/** The centre of slot `slot`'s island, in whole blocks. */
export function islandCenter(slot) {
  const [dx, dz] = SLOT_DIRECTIONS[slot];
  return { x: Math.round(dx * ARENA.ringRadius), z: Math.round(dz * ARENA.ringRadius) };
}

/**
 * Where slot `slot`'s player stands in the cage, facing the middle (this game's yaw: forward is (-sin, -cos)).
 */
export function spawnPoint(slot) {
  const { x, z } = islandCenter(slot);
  return { x: x + 0.5, y: ARENA.surfaceY + 1, z: z + 0.5, yaw: Math.atan2(x, z) };
}

/** The glass cells of one cage: a ring three high around the spawn and a roof, on the island's grass. */
export function cageCells(slot) {
  const { x, z } = islandCenter(slot), y = ARENA.surfaceY;
  const cells = [];
  for (let h = 1; h <= 3; h++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) cells.push([x + dx, y + h, z + dz]);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cells.push([x + dx, y + 4, z + dz]);
  return cells;
}

/** An island: grass on dirt on a stone cone hanging under it, with a few ores in the stone. */
function addIsland(blocks, cx, cz, radius, random) {
  const top = ARENA.surfaceY;
  for (let dx = -radius - 1; dx <= radius + 1; dx++) {
    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      const r = Math.hypot(dx, dz);
      if (r > radius + 0.5) continue;
      const depth = Math.max(1, Math.floor((radius + 0.5 - r) * 1.6) + 1);
      for (let d = 0; d <= depth + 1; d++) {
        const y = top - d;
        let block = d === 0 ? BLOCKS.GRASS : d <= 2 ? BLOCKS.DIRT : BLOCKS.STONE;
        if (block === BLOCKS.STONE) {
          const roll = random();
          if (roll < 0.04) block = BLOCKS.COAL_ORE;
          else if (roll < 0.065) block = BLOCKS.IRON_ORE;
        }
        blocks.set(cellKey(cx + dx, y, cz + dz), block);
      }
    }
  }
}

/**
 * The whole arena. Every non-air cell, the chests (with the island they belong to and the way they face), the
 * spawn of each slot, and the box that holds it all -- outside the box is the void.
 * @returns {{blocks: Map<string, number>, chests: {x:number,y:number,z:number,facing:number,kind:'island'|'center',slot:number|null}[],
 *   spawns: object[], bounds: {minX:number,maxX:number,minY:number,maxY:number,minZ:number,maxZ:number}, enchantingTable: number[], anvil: number[]}}
 */
export function buildArena(seed = 2015) {
  const random = seededRandom(seed);
  const blocks = new Map();
  const chests = [];
  const y = ARENA.surfaceY + 1;
  // Chest facing (chest.js CHEST_ROTATIONS): 0 south (+z), 1 west (-x), 2 north (-z), 3 east (+x).
  const facingToward = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 3 : 1) : (dz > 0 ? 0 : 2));

  for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
    const { x, z } = islandCenter(slot);
    addIsland(blocks, x, z, ARENA.spawnRadius, random);
    // Three chests around the cage: to the left and right of the way to the middle, and one behind.
    const [dx, dz] = SLOT_DIRECTIONS[slot];
    const inward = [Math.round(-dx), Math.round(-dz)];
    const side = [-inward[1], inward[0]];
    for (const [ox, oz] of [[side[0] * 3, side[1] * 3], [-side[0] * 3, -side[1] * 3], [-inward[0] * 3, -inward[1] * 3]]) {
      const cx = x + ox, cz = z + oz;
      chests.push({ x: cx, y, z: cz, facing: facingToward(x - cx, z - cz), kind: 'island', slot });
      blocks.set(cellKey(cx, y, cz), BLOCKS.CHEST);
    }
    for (const [cx, cy, cz] of cageCells(slot)) blocks.set(cellKey(cx, cy, cz), BLOCKS.GLASS);
  }

  addIsland(blocks, 0, 0, ARENA.centerRadius, random);
  // The middle: four chests, an enchanting table and an anvil, and four glowstone posts.
  for (const [cx, cz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    chests.push({ x: cx, y, z: cz, facing: facingToward(-cx, -cz), kind: 'center', slot: null });
    blocks.set(cellKey(cx, y, cz), BLOCKS.CHEST);
  }
  const enchantingTable = [0, y, -1], anvil = [0, y, 1];
  blocks.set(cellKey(...enchantingTable), BLOCKS.ENCHANTING_TABLE);
  blocks.set(cellKey(...anvil), BLOCKS.ANVIL);
  for (const [cx, cz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) {
    blocks.set(cellKey(cx, y, cz), BLOCKS.OAK_LOG);
    blocks.set(cellKey(cx, y + 1, cz), BLOCKS.GLOWSTONE);
  }

  const reach = ARENA.ringRadius + ARENA.spawnRadius + 2;
  return {
    blocks, chests,
    spawns: Array.from({ length: ARENA.maxPlayers }, (_, slot) => spawnPoint(slot)),
    bounds: { minX: -reach, maxX: reach, minY: 0, maxY: 63, minZ: -reach, maxZ: reach },
    enchantingTable, anvil,
  };
}

/**
 * The cells that differ from the arena -- a bridge someone built, a block someone broke, an opened cage -- as
 * `[x, y, z, wanted]`. Restoring a round writes exactly these. `getVoxel` reads the world.
 */
export function arenaDifferences(arena, getVoxel) {
  const out = [];
  const { minX, maxX, minY, maxY, minZ, maxZ } = arena.bounds;
  for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) for (let y = minY; y <= maxY; y++) {
    const wanted = arena.blocks.get(cellKey(x, y, z)) ?? BLOCKS.AIR;
    if (getVoxel(x, y, z) !== wanted) out.push([x, y, z, wanted]);
  }
  return out;
}
