// Nether fortresses, from the wiki (https://minecraft.wiki/w/Nether_Fortress and /Structure).
//
// From the pages:
//   * all Nether biomes, sharing the `nether_complexes` regions with bastions (fortress 2 : bastion 3, and a fortress
//     wherever a bastion would land in the basalt deltas);
//   * "The fortress generation starts with a plain four-way crossing centered at chunk coordinates 11, ~, 11";
//   * the exterior: straight bridges, up to five plain four-way crossings, up to four arched crossings, up to four
//     small rooms with stairs to the roof, up to two blaze spawner platforms; the lava well room joins the exterior to
//     the interior; the interior: straight corridors, up to five crossings, up to 20 turns ("each with a 1/3 chance of
//     having a loot chest in the corner"), up to three stairways, up to two T balconies, up to two nether wart gardens;
//   * "Nether bricks supported by pillars that tower high above the lava seas"; it can tunnel through netherrack.
//
// Every piece is the /Structure page's drawing; pieces join at the doorways found in the drawings
// (src/worldgen/drawnPieces.js), and the bridges' pillars run down to the ground.
//
// Ours: the weights of each piece, the lava well room's limit (2), how far a fortress may spread (30 pieces deep,
// 112 blocks, 120 pieces), and its height in this 64-tall Nether (the start crossing's walkway at y 40).

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';
import { drawingPiece, placeDrawing } from '../drawnPieces.js';
import { BLUEPRINTS } from './blueprints/nether_fortress.js';

export const FORTRESS_LOOT = 'minecraft:chests/nether_bridge';
export const START_Y = 40;
export const MAX_PIECES = 120;
export const MAX_RADIUS = 112;
export const MAX_DEPTH = 30;

/** Piece kinds: drawing, side of the fortress, weight (ours) and limit (the wiki's). */
export const FORTRESS_PIECES = {
  bridge: { drawing: 'bridge', area: 'exterior', weight: 30, limit: Infinity },
  crossing: { drawing: 'bridge_open_intersection', area: 'exterior', weight: 10, limit: 5 },
  arched_crossing: { drawing: 'bridge_closed_intersection', area: 'exterior', weight: 10, limit: 4 },
  small_room: { drawing: 'bridge_staircases', area: 'exterior', weight: 10, limit: 4 },
  blaze_platform: { drawing: 'blaze', area: 'exterior', weight: 5, limit: 2 },
  lava_well: { drawing: 'cauldron_room', area: 'exterior', weight: 5, limit: 2, leadsTo: 'interior' },
  corridor: { drawing: 'straight_corridor', area: 'interior', weight: 25, limit: Infinity },
  corridor_crossing: { drawing: 'corridor_intersection', area: 'interior', weight: 15, limit: 5 },
  turn: { drawing: 'curved_corridor', area: 'interior', weight: 10, limit: 20 },
  stairway: { drawing: 'corridor_staircase', area: 'interior', weight: 10, limit: 3 },
  balcony: { drawing: 'corridor_balcony', area: 'interior', weight: 7, limit: 2 },
  wart_garden: { drawing: 'nether_wart_farm', area: 'interior', weight: 5, limit: 2 }
};

const prepared = {};
function piece(kind) {
  if (!prepared[kind]) {
    const def = FORTRESS_PIECES[kind];
    prepared[kind] = drawingPiece(BLUEPRINTS[def.drawing], (c) => (c.name === 'spawner'
      ? { ...c, name: 'spawner', nbt: { id: 'minecraft:mob_spawner', SpawnData: { entity: { id: 'minecraft:blaze' } } } }
      : c.name === 'nether_wart' ? { ...c, props: { age: '3' } } : c), { minWidth: 3, maxWidth: 5 });
  }
  return prepared[kind];
}

export function buildFortress({ seed, x, z, y = START_Y, groundAt = () => 20 }) {
  const random = new LegacyRandom(BigInt(seed));
  const canvas = new CellCanvas();
  const pieces = [];
  const counts = {};
  const fits = (box) => box.minY >= 1 && box.maxY <= 62 && !pieces.some((p) => p.box.intersects(box))
    && Math.max(Math.abs(box.minX - x), Math.abs(box.maxX - x), Math.abs(box.minZ - z), Math.abs(box.maxZ - z)) <= MAX_RADIUS;

  const add = (kind, placed, depth) => {
    pieces.push({ box: placed.box, kind });
    counts[kind] = (counts[kind] ?? 0) + 1;
    const def = FORTRESS_PIECES[kind];
    const chest = kind === 'turn' && random.nextIntBound(3) === 0;
    let lowest = Infinity;
    for (const c of placed.cells) lowest = Math.min(lowest, c.y);
    for (const c of placed.cells) {
      if (c.name === 'chest') {
        if (chest) canvas.set(c.x, c.y, c.z, 'chest', c.props, { id: 'minecraft:chest', LootTable: FORTRESS_LOOT });
        continue;
      }
      canvas.set(c.x, c.y, c.z, c.name, c.props, c.nbt);
      // "supported by pillars that tower high above the lava seas": the exterior's lowest bricks go down to the ground.
      if (def.area === 'exterior' && c.y === lowest && c.name === 'nether_bricks') {
        for (let py = c.y - 1; py > groundAt(c.x, c.z) && py > 0; py--) canvas.set(c.x, py, c.z, 'nether_bricks', null, null, { keep: true });
      }
    }
    // Clear the inside of the piece's box where the drawing has nothing (a fortress tunnels through netherrack).
    for (let bx = placed.box.minX; bx <= placed.box.maxX; bx++) for (let bz = placed.box.minZ; bz <= placed.box.maxZ; bz++) {
      for (let by = placed.box.minY + (def.area === 'exterior' ? 5 : 1); by <= placed.box.maxY; by++) canvas.set(bx, by, bz, 'air', null, null, { keep: true });
    }
    for (const exit of placed.exits) queue.push({ exit, depth: depth + 1, area: def.leadsTo ?? def.area });
  };

  const queue = [];
  // The start: a plain four-way crossing, its middle at chunk-local 11, 11.
  const start = piece('crossing');
  const centre = { x, y, z };
  const startPlaced = placeDrawing(start, 0, { x: centre.x, y: centre.y, z: centre.z - 9, dir: 'south' });
  add('crossing', startPlaced, 0);

  while (queue.length && pieces.length < MAX_PIECES) {
    const { exit, depth, area } = queue.shift();
    if (depth > MAX_DEPTH) continue;
    const options = Object.entries(FORTRESS_PIECES).filter(([k, d]) => d.area === area && (counts[k] ?? 0) < d.limit);
    let done = false;
    for (let tries = 0; tries < 5 && !done && options.length; tries++) {
      const total = options.reduce((s, [, d]) => s + d.weight, 0);
      let r = random.nextIntBound(total);
      let kind = options[0][0];
      for (const [k, d] of options) { if ((r -= d.weight) < 0) { kind = k; break; } }
      const p = piece(kind);
      if (!p.openings.length) continue;
      const entrance = random.nextIntBound(p.openings.length);
      const placed = placeDrawing(p, entrance, exit);
      if (!placed || !fits(placed.box)) continue;
      add(kind, placed, depth);
      done = true;
    }
  }
  return { canvas, pieces, counts };
}

export function generateFortress({ seed, chunkX, chunkZ, structureId, context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const x = chunkX * 16 + 11; const z = chunkZ * 16 + 11;
  const groundAt = (gx, gz) => (context.surfaceY ? context.surfaceY(gx, gz) : 20);
  const { canvas, pieces, counts } = buildFortress({ seed: random.nextInt(), x, z, groundAt });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:fortress', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    meta: { counts, centre: [x, START_Y, z], kinds: pieces.map((p) => p.kind) }
  });
}

export function realizeFortress(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'Nether fortress: the wiki\'s drawings, joined at their doorways' };
}
