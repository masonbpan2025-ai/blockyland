// End cities and End ships, from the wiki (https://minecraft.wiki/w/End_City and /Structure).
//
// From the pages:
//   * the outer islands' midlands and highlands (set `end_cities`);
//   * "Base floors ... at the base of every city"; towers: "Small towers that are hollow, consisting of a single purpur
//     slab spiral staircase" topped by a banner room ("banners hanging on the outside, and a shulker attached to the
//     ceiling"), and "Skyscrapers that consist of a treacherous double spiral staircase" (the large tower) with large
//     rooms and loot rooms ("two chests ... some rooms may have one normal chest next to an ender chest");
//   * "Each direction of every tower of the End city has a 50% chance of generating a bridge, and the bridge itself has
//     a 12.5% chance to generate an End ship. At most one ship can generate in a given End city"; a bridge that ends
//     without a tower ends in a dock; "the stern of the ship always faces toward the city";
//   * shulkers per piece (the Structure details table): base/empty room 2, large tower floor 4, large room 1, loot room
//     2, banner room 1, ship 3; the ship: a dragon head at the bow, a brewing stand with two potions of Healing, two
//     loot chests and elytra in an item frame in the obsidian-floored treasure room;
//   * the blocks: purpur, End stone bricks, end rods, magenta glass and banners, ladders.
//
// Every piece is a /Structure drawing (the base, the empty room, the small tower base and extension, the banner room,
// the large tower floor, the two- and three-storey large rooms, the loot room, the bridge pieces and dock, the
// ship); green and red wool in the base and loot room drawings mark stairs to flip ("If the block is green wool, the
// stair next to it is flipped upside-down"), and are not placed.
//
// Ours: how pieces stack (centred on the one below), how many tower extensions and bridge segments (2-3 each), which
// kind of tower a bridge leads to (even odds), the depth (3 towers from the base), and that the elytra lie in the
// ship's first chest (this game has no item frame entity). The city is cut to this 64-tall End's ceiling.

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { BlockBox } from '../geometry.js';
import { cellsOf } from '../blueprintStructure.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';
import { rotateCell, rotateFacing } from '../drawnPieces.js';
import { BLUEPRINTS } from './blueprints/end_city.js';

export const BRIDGE_CHANCE = 0.5;
export const SHIP_CHANCE = 0.125;
export const MAX_SHIPS = 1;
export const END_CITY_LOOT = 'minecraft:chests/end_city_treasure';
export const SHULKERS = { empty_room: 2, base_room: 2, large_room: 4, two_storey: 1, three_storey: 1, loot_room: 2, small_room: 1, end_ship: 3 };
const CEILING = 62;
const STEP = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

/** A drawing's cells with the wool stair markers applied and removed. */
function drawing(name) {
  const cells = cellsOf(BLUEPRINTS[name]);
  const at = new Map(cells.map((c) => [`${c.x},${c.y},${c.z}`, c]));
  for (const c of cells) {
    if (c.name !== 'green_wool') continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = at.get(`${c.x + dx},${c.y},${c.z + dz}`);
      if (s && /_stairs$/.test(s.name)) s.props = { ...(s.props ?? {}), half: 'top' };
    }
  }
  return { cells: cells.filter((c) => !/_wool$/.test(c.name)), size: BLUEPRINTS[name].size };
}

export function buildEndCity({ seed, x, y, z }) {
  const random = new LegacyRandom(BigInt(seed));
  const canvas = new CellCanvas();
  const pieces = [];
  let ships = 0;
  const shulker = (bx, by, bz) => canvas.entities.push({ type: 'shulker', x: bx + 0.5, y: by, z: bz + 0.5 });

  /** Place a drawing with its footprint centred on (cx, cz), bottom at y, turned `rotation` quarter turns. */
  const place = (name, cx, by, cz, rotation = 0, kind = name) => {
    const d = drawing(name);
    const [sx, sy, sz] = d.size;
    const [rx, rz] = rotation % 2 ? [sz, sx] : [sx, sz];
    const ox = cx - Math.floor(rx / 2); const oz = cz - Math.floor(rz / 2);
    const box = new BlockBox(ox, by, oz, ox + rx - 1, by + sy - 1, oz + rz - 1);
    if (box.maxY > CEILING || pieces.some((p) => p.box.intersects(box))) return null;
    for (const c of d.cells) {
      const [lx, lz] = rotateCell(c.x, c.z, d.size, rotation);
      let props = c.props;
      if (props?.facing) props = { ...props, facing: rotateFacing(props.facing, rotation) };
      const nbt = c.name === 'chest' ? { id: 'minecraft:chest', LootTable: END_CITY_LOOT } : null;
      canvas.set(ox + lx, by + c.y, oz + lz, c.name, props, nbt);
    }
    pieces.push({ box, kind });
    // The piece's shulkers, on its floor near the middle.
    for (let i = 0; i < (SHULKERS[name] ?? 0); i++) shulker(cx - 1 + (i % 3), by + 1 + Math.floor(i / 3) * 4, cz - 1 + (i % 2) * 2);
    return box;
  };

  /** A tower on top of `under`; then bridges from its top. */
  const tower = (cx, by, cz, depth) => {
    let top;
    if (random.nextFloat() < 0.5) {
      // A small tower: the base, 1-3 extensions, the banner room.
      let box = place('small_tower_base', cx, by, cz);
      if (!box) return;
      const extensions = 1 + random.nextIntBound(3);
      for (let i = 0; i < extensions && box; i++) box = place('small_tower_extention', cx, box.maxY + 1, cz) ?? box;
      top = place('small_room', cx, box.maxY + 1, cz) ?? box;
    } else {
      // A large tower: skyscraper floors, a large room, and a loot room on top.
      let box = place('large_room', cx, by, cz);
      if (!box) return;
      box = place(random.nextFloat() < 0.5 ? 'two_storey' : 'three_storey', cx, box.maxY + 1, cz) ?? box;
      top = place('loot_room', cx, box.maxY + 1, cz) ?? box;
    }
    if (depth >= 3) return;
    for (const dir of ['north', 'south', 'east', 'west']) {
      if (random.nextFloat() >= BRIDGE_CHANCE) continue;
      bridge(top, dir, depth);
    }
  };

  /** A bridge out of a tower's top: 2-3 segments, then a tower, a dock, or (12.5%, once) the ship. */
  const bridge = (from, dir, depth) => {
    const [dx, dz] = STEP[dir];
    const rotation = { north: 0, east: 1, south: 2, west: 3 }[dir];
    const midX = Math.floor((from.minX + from.maxX) / 2); const midZ = Math.floor((from.minZ + from.maxZ) / 2);
    const halfX = Math.ceil((from.maxX - from.minX + 1) / 2); const halfZ = Math.ceil((from.maxZ - from.minZ + 1) / 2);
    let px = midX + dx * (halfX + 2); let pz = midZ + dz * (halfZ + 2);
    const by = from.minY;
    const segments = 2 + random.nextIntBound(2);
    for (let i = 0; i < segments; i++) {
      if (!place(i === segments - 1 && random.nextFloat() < 0.5 ? 'gentle_stairs' : 'bridge', px, by, pz, rotation, 'bridge')) return;
      px += dx * 5; pz += dz * 5;
    }
    if (ships < MAX_SHIPS && random.nextFloat() < SHIP_CHANCE) {
      // The stern toward the city: the dragon head (the bow) is put at the far end.
      const ship = drawing('end_ship');
      const head = ship.cells.find((c) => c.name === 'dragon_head');
      const bowAtStart = head && head.z < ship.size[2] / 2;
      const r = (rotation + (bowAtStart ? 0 : 2)) % 4;
      const len = ship.size[2];
      const shipY = Math.max(1, Math.min(by - 6, CEILING - ship.size[1] + 1));
      const box = place('end_ship', px + dx * Math.floor(len / 2), shipY, pz + dz * Math.floor(len / 2), r, 'ship');
      if (box) {
        ships++;
        // Two potions of Healing in the brewing stand; elytra with the treasure (no item frames here).
        const chest = [...canvas.cells.values()].find((c) => c.name === 'chest' && box.contains(c.x, c.y, c.z));
        if (chest) chest.nbt = { ...chest.nbt, extra: [{ id: 'elytra', count: 1 }] };
        const stand = [...canvas.cells.values()].find((c) => c.name === 'brewing_stand' && box.contains(c.x, c.y, c.z));
        if (stand) stand.nbt = { ...stand.nbt, extra: [{ id: 'potion_of_healing_2', count: 1 }, { id: 'potion_of_healing_2', count: 1 }] };
      }
      return;
    }
    if (depth < 3 && random.nextFloat() < 0.7) {
      const entry = place('empty_room', px + dx * 6, Math.max(by - 5, 1), pz + dz * 6);
      if (entry) tower(px + dx * 6, entry.maxY + 1, pz + dz * 6, depth + 1);
    } else place('dock', px, by, pz, rotation, 'dock');
  };

  const base = place('base_room', x, y, z);
  if (base) tower(x, base.maxY + 1, z, 1);
  return { canvas, pieces, ships };
}

export function generateEndCity({ seed, chunkX, chunkZ, structureId = 'end_city', context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const x = chunkX * 16 + 8; const z = chunkZ * 16 + 8;
  const ground = context.surfaceY ? context.surfaceY(x, z) : 30;
  if (ground <= 0) return null; // Never put a city in the void between islands.
  // On the island, but low enough for its base and a tower under the 64-tall End's ceiling.
  const { canvas, pieces, ships } = buildEndCity({ seed: random.nextInt(), x, y: Math.min(ground + 1, 34), z });
  if (!pieces.length) return null;
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:end_city', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    meta: { ships, kinds: pieces.map((p) => p.kind), hasShip: ships > 0 }
  });
}

export function realizeEndCity(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'End city: the wiki\'s drawings, stacked' };
}
