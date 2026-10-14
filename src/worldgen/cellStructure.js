// Shared plumbing for procedural piece structures (mineshafts, strongholds, Nether fortresses, End cities): the
// generator works out every block in world coordinates when the structure is planned, and realization writes the ones
// in the asked-for chunk. Cells are `{ x, y, z, name, props?, nbt? }`; entities are spawn requests.

import { BlockBox } from './geometry.js';
import { StructurePiece, StructureStart } from './start.js';
import { createBlockIdResolver } from './blockIds.js';

/** A growing set of cells keyed by position; later writes win unless `keep` is set. */
export class CellCanvas {
  constructor() { this.cells = new Map(); this.entities = []; }
  key(x, y, z) { return `${x},${y},${z}`; }
  get(x, y, z) { return this.cells.get(this.key(x, y, z)) ?? null; }
  set(x, y, z, name, props = null, nbt = null, { keep = false } = {}) {
    const k = this.key(x, y, z);
    if (keep && this.cells.has(k)) return false;
    this.cells.set(k, { x, y, z, name, ...(props ? { props } : {}), ...(nbt ? { nbt } : {}) });
    return true;
  }
  fill(x0, y0, z0, x1, y1, z1, name, props = null) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, name, props);
  }
  box() {
    let b = null;
    for (const c of this.cells.values()) {
      if (!b) b = [c.x, c.y, c.z, c.x, c.y, c.z];
      else { b[0] = Math.min(b[0], c.x); b[1] = Math.min(b[1], c.y); b[2] = Math.min(b[2], c.z); b[3] = Math.max(b[3], c.x); b[4] = Math.max(b[4], c.y); b[5] = Math.max(b[5], c.z); }
    }
    return b ? new BlockBox(...b) : null;
  }
}

/** A start whose pieces are the given boxes and whose cells are the canvas's. */
export function cellStart({ structureId, chunkX, chunkZ, seed, biome = null, id, pieces, canvas, meta = {} }) {
  const startPieces = pieces.map((p, index) => new StructurePiece({ id, index, type: p.type ?? 'procedural', family: 'procedural', box: p.box, meta: { kind: p.kind, ...(p.name ? { name: p.name } : {}) } }));
  // Cells can reach past the pieces (a bridge's log pillar down to the ground, a chain up to the roof); an extra
  // 'extent' piece covers them, so every chunk they fall in realizes them.
  const all = canvas.box();
  if (all && !startPieces.some((p) => p.box.minX <= all.minX && p.box.minY <= all.minY && p.box.minZ <= all.minZ && p.box.maxX >= all.maxX && p.box.maxY >= all.maxY && p.box.maxZ >= all.maxZ)) {
    const outside = [...canvas.cells.values()].filter((c) => !startPieces.some((p) => p.box.contains(c.x, c.y, c.z)));
    if (outside.length) {
      // One box per chunk column round the outside cells in it: exact enough for chunk overlap, and few.
      const byChunk = new Map();
      for (const c of outside) {
        const k = `${Math.floor(c.x / 16)},${Math.floor(c.z / 16)}`;
        const b = byChunk.get(k);
        if (!b) byChunk.set(k, [c.x, c.y, c.z, c.x, c.y, c.z]);
        else { b[0] = Math.min(b[0], c.x); b[1] = Math.min(b[1], c.y); b[2] = Math.min(b[2], c.z); b[3] = Math.max(b[3], c.x); b[4] = Math.max(b[4], c.y); b[5] = Math.max(b[5], c.z); }
      }
      for (const b of byChunk.values()) startPieces.push(new StructurePiece({ id, index: startPieces.length, type: 'procedural', family: 'procedural', box: new BlockBox(...b), meta: { kind: 'extent' } }));
    }
  }
  const start = new StructureStart({ structureId, chunkX, chunkZ, pieces: startPieces, biome, seed });
  // The whole box (every cell) as an extra piece-less record, so a structure's real extent is known.
  start.meta = { ...meta, cells: [...canvas.cells.values()], entities: canvas.entities };
  return start;
}

/** Write a cell start's blocks (and hand over its entities) through `setBlock`. */
export function realizeCells(start, setBlock, blockIds, { spawnMob = null, clip = null } = {}) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missing = new Set();
  const chests = [];
  let written = 0;
  for (const c of start.meta.cells) {
    if (clip && !clip.contains(c.x, c.y, c.z)) continue;
    const state = { name: c.name.includes(':') ? c.name : `minecraft:${c.name}`, properties: c.props ?? {} };
    const id = resolver.resolveState(state);
    if (id === null) { missing.add(state.name); continue; }
    const loot = c.nbt?.LootTable ?? null;
    if (loot) chests.push(loot);
    const spawner = c.nbt?.SpawnData?.entity?.id?.replace('minecraft:', '') ?? null;
    if (setBlock(c.x, c.y, c.z, id, { state, ...(loot ? { lootTable: loot } : {}), ...(spawner ? { spawner } : {}), ...(c.nbt?.extra ? { extraItems: c.nbt.extra } : {}), ...(c.nbt?.trialSpawner ? { trialSpawner: c.nbt.trialSpawner } : {}), ...(c.nbt?.vault ? { vault: c.nbt.vault } : {}) })) written++;
  }
  const spawns = [];
  for (const e of start.meta.entities) {
    if (clip && !clip.contains(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z))) continue;
    spawns.push(e);
    if (spawnMob) spawnMob(e.type, e.x, e.y, e.z, { persistent: true, ...(e.options ?? {}) });
  }
  return { written, chests, spawns, missingBlocks: [...missing].sort() };
}
