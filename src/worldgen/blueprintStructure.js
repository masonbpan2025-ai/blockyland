// Shared machinery for structures built from the wiki's blueprints (src/worldgen/generators/blueprints/*.js, generated
// by scripts/generate-all-structure-blueprints.mjs).
//
// A blueprint structure supplies: which drawing(s) to place and with what parameters (decided from the chunk's random),
// how to edit the drawing's cells (loot tables, the random blocks a page describes), and where the drawing's bottom
// goes relative to the ground. This module does the rest the same way for all of them: template building and caching,
// random rotation, chunk-clipped realization, loot, orientation and mobs.

import { StructurePiece, StructureStart } from './start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from './random.js';
import { placeTemplate } from './templatePlacement.js';
import { StructureTemplate } from './template.js';
import { createBlockIdResolver } from './blockIds.js';

/** A drawing's cells: `{ x, y, z, name, props }` (name without the namespace). */
export function cellsOf(data) {
  return data.blocks.split(';').filter(Boolean).map((record) => {
    const [x, y, z, p] = record.split(',').map(Number);
    const state = data.palette[p];
    // A drawing's door top is the door's upper half (its props already say `half: upper`).
    const name = state.Name.replace('minecraft:', '').replace(/_door_top$/, '_door');
    return { x, y, z, name, props: state.Properties ?? null };
  });
}

/** The drawing's layer 0 (or its first layer) as a y in the drawing. */
export const groundOf = (data) => Math.max(0, -data.minLayer);

/**
 * Build template data from cells. `edit(cell)` may return the cell unchanged, a replacement
 * `{ name, props?, nbt? }`, or null to leave the cell out. `extraEntities` are added as they are.
 */
export function templateFrom(cells, size, { edit = (c) => c, entities = [] } = {}) {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map([['minecraft:air{}', 0]]);
  const state = (name, props) => {
    const full = name.includes(':') ? name : 'minecraft:' + name;
    const key = full + JSON.stringify(props ?? {});
    if (!index.has(key)) { index.set(key, palette.length); palette.push(props ? { Name: full, Properties: props } : { Name: full }); }
    return index.get(key);
  };
  const blocks = [];
  for (const cell of cells) {
    const out = edit(cell);
    if (!out) continue;
    const block = { pos: [out.x ?? cell.x, out.y ?? cell.y, out.z ?? cell.z], state: state(out.name, out.props ?? null) };
    if (out.nbt) block.nbt = out.nbt;
    blocks.push(block);
  }
  return { size, palette, blocks, entities };
}

/** Pick `n` distinct items with a LegacyRandom. */
export function pickN(random, list, n) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(random.nextIntBound(pool.length), 1)[0]);
  return out;
}

/** A deterministic per-cell chance in [0, 1). */
export function cellChance(seed, x, y, z, salt = 0) {
  let h = (Number(BigInt.asIntN(32, BigInt(seed ?? 0))) ^ (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647) ^ (salt * 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Define a structure from blueprints.
 *
 * @param {object} spec
 * @param {string} spec.name           template namespace, e.g. 'minecraft:desert_well'
 * @param {(random, ctx) => object} spec.choose   per-start parameters (variant, flags, a seed for the cell edits)
 * @param {(params) => object} spec.build         template data for those parameters
 * @param {(ctx) => number} spec.baseY            the y the template's bottom goes to
 * @param {boolean} [spec.rotate]      random rotation (default true)
 * @param {number} [spec.offset]       x/z offset into the chunk
 * @param {(start, ctx) => object} [spec.meta]  extra start metadata
 * @param {(random, ctx) => Array<{params, x, z, rotation}>} [spec.extraPieces]  further pieces of the same start
 * @param {(ctx) => number} [spec.extraY]  the bottom y of a further piece (ctx.surface is its own ground)
 */
export function defineBlueprintStructure(spec) {
  // Templates are cached by their parameters; a structure whose parameters carry a per-start seed would otherwise
  // keep one template per structure ever generated, so the cache keeps only the most recent ones.
  const cache = new Map();
  const CACHE_LIMIT = 96;
  const templateFor = (params) => {
    const key = JSON.stringify(params);
    let template = cache.get(key);
    if (template) { cache.delete(key); cache.set(key, template); return template; }
    template = new StructureTemplate(spec.build(params), spec.name);
    cache.set(key, template);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return template;
  };

  function generate({ seed, chunkX, chunkZ, structureId, context }) {
    const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
    const offset = spec.offset ?? 0;
    const originX = chunkX * 16 + offset;
    const originZ = chunkZ * 16 + offset;
    const surfaceAt = (x, z) => (context.surfaceY ? context.surfaceY(x, z, 'world_surface_wg') : 64);
    const ctx = { seed, chunkX, chunkZ, structureId, context, random, originX, originZ, surfaceAt };
    const params = spec.choose ? spec.choose(random, ctx) : {};
    if (params === null) return null;
    const rotation = spec.rotate === false ? 0 : random.nextIntBound(4);
    const template = templateFor(params);
    const [sx, , sz] = template.size;
    ctx.size = template.size;
    ctx.params = params;
    ctx.centreX = originX + Math.floor(sx / 2);
    ctx.centreZ = originZ + Math.floor(sz / 2);
    ctx.surface = surfaceAt(ctx.centreX, ctx.centreZ);
    const y = spec.baseY(ctx);
    if (y === null || y === undefined) return null;
    const origin = { x: originX, y, z: originZ };
    const pieces = [new StructurePiece({
      id: spec.name, index: 0, type: 'template', family: 'template', template: spec.name, rotation,
      box: template.boundingBox(origin, rotation), meta: { origin, params }
    })];
    // Further pieces (a cluster of ocean ruins round a big one): each `{ params, x, z, rotation }`, set on its own
    // ground through `spec.extraY`.
    for (const extra of spec.extraPieces ? spec.extraPieces(random, ctx) : []) {
      const t = templateFor(extra.params);
      const at = { x: extra.x, y: 0, z: extra.z };
      const ey = spec.extraY ? spec.extraY({ ...ctx, size: t.size, params: extra.params, surface: surfaceAt(extra.x + (t.size[0] >> 1), extra.z + (t.size[2] >> 1)), centreX: extra.x + (t.size[0] >> 1), centreZ: extra.z + (t.size[2] >> 1) }) : y;
      at.y = ey;
      pieces.push(new StructurePiece({ id: spec.name, index: pieces.length, type: 'template', family: 'template', template: spec.name, rotation: extra.rotation ?? 0, box: t.boundingBox(at, extra.rotation ?? 0), meta: { origin: at, params: extra.params } }));
    }
    const start = new StructureStart({
      structureId, chunkX, chunkZ, pieces,
      biome: context.biomeAt ? context.biomeAt(ctx.centreX, ctx.centreZ) : null, seed
    });
    start.meta = { rotation, surface: ctx.surface, y, ...params, ...(spec.meta ? spec.meta(start, ctx) : {}) };
    return start;
  }

  function realize(start, setBlock, blockIds, { spawnMob = null, clip = null } = {}) {
    const resolver = createBlockIdResolver(blockIds || undefined);
    const missingBlocks = new Set();
    const chests = [];
    const spawns = [];
    let written = 0;
    for (const piece of start.pieces) {
      if (clip && !piece.box.intersects(clip)) continue;
      const template = templateFor(piece.meta.params);
      const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(start.chunkX) * 341873128712n + BigInt(start.chunkZ) * 132897987541n);
      const placement = placeTemplate({ template, origin: piece.meta.origin, rotation: piece.rotation, mirror: piece.mirror, processors: { processors: [] }, random, world: null });
      for (const block of placement.blocks) {
        const id = resolver.resolveState(block.state);
        if (id === null) { missingBlocks.add(block.state.name); continue; }
        const loot = block.nbt?.LootTable ?? null;
        if (loot) chests.push(loot);
        const spawner = block.nbt?.SpawnData?.entity?.id?.replace('minecraft:', '') ?? null;
        if (setBlock(block.x, block.y, block.z, id, { state: block.state, ...(block.nbt ? { nbt: block.nbt } : {}), ...(loot ? { lootTable: loot } : {}), ...(spawner ? { spawner } : {}) })) written++;
      }
      for (const entity of template.entitiesTransformed(piece.rotation, piece.mirror)) {
        const type = entity.nbt?.type;
        if (!type) continue;
        const x = piece.meta.origin.x + entity.local.x; const y = piece.meta.origin.y + entity.local.y; const z = piece.meta.origin.z + entity.local.z;
        if (clip && !clip.contains(Math.floor(x), Math.floor(y), Math.floor(z))) continue;
        const options = { persistent: true, ...(entity.nbt.options ?? {}) };
        spawns.push({ type, x, y, z, options });
        if (spawnMob) spawnMob(type, x + 0.5, y, z + 0.5, options);
      }
    }
    return { written, chests, spawns, missingBlocks: [...missingBlocks].sort(), note: `${spec.name}: the wiki's blueprint, block for block` };
  }

  return { generate, realize, templateFor, build: spec.build };
}
