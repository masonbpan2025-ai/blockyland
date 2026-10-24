// Structures in the live world: the bridge between `src/worldgen/` and chunk generation.
//
// WHY THIS MODULE EXISTS, and why it is the most important file in this subsystem. The structure engine is
// complete and tested -- 30 structures, placement sets, jigsaw, terrain adaptation, loot -- and until this file
// it was called by NOTHING except the Structure Inspector page. A generated world therefore contained exactly
// one structure, a hand-written starting village in the spawn chunk, and none of the engine's structures ever
// appeared in game. Every test passed and the feature was still absent from the game, because nothing tested
// the path from "a chunk is generated" to "a structure is in it".
//
// THE DESIGN IS PER-CHUNK CLIPPED REALIZATION, which is what makes this safe in a lazily generated world:
//
//   * For the chunk being generated, find every enabled start whose box OVERLAPS it, and realize each one
//     CLIPPED to that chunk. The engine already supports the clip (`realize(..., { chunkX, chunkZ })`).
//   * Each chunk therefore writes only its own voxels. There are no cross-chunk writes, so generating a chunk
//     can never force a neighbour to generate, and a structure is complete regardless of the ORDER chunks
//     arrive in -- which was one of the engine's stated requirements.
//   * Planning is a pure function of (seed, chunk, registry, biome, surface), and both world queries here are
//     noise-based, so planning never needs a generated chunk either. That is why this cannot recurse.
//
// WHAT IS DELIBERATELY NOT SUPPORTED YET, recorded rather than quietly ignored:
//
//   * The world is 64 blocks tall (`CHUNK_HEIGHT`), while the engine targets a 384-block world. Structures
//     whose Y band falls outside 0..63 are trimmed by the writer and COUNTED in `stats.outOfWorld`, so
//     generators must explicitly map their Y band before being enabled by default. Ancient cities,
//     monster rooms, geodes and mineshafts now have that remap in their own generators.
//   * Loot tables and block entities are collected during realization; the world preserves their state
//     and the live game initializes the corresponding containers and spawners.

import { createStructureEngine, getSetForStructure, generatorCoverage } from './worldgen/index.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { getBiomeDef } from './biomes.js';
import { PACK_STRUCTURES, packSuppressesStructures, winningStructureIds } from './dataPackRuntime.js';

/**
 * The structures enabled in generated worlds.
 *
 * Surface starters, cave features, and Nether/End structures that fit the 64-block world.
 * Dimension and biome gates still apply to every enabled structure.
 */
export const WORLD_STRUCTURE_IDS = ['village_plains', 'igloo', 'desert_pyramid',
  'monster_room', 'amethyst_geode', 'mineshaft', 'mineshaft_mesa', 'ancient_city',
  'fortress', 'bastion_remnant', 'nether_fossil', 'ruined_portal_nether',
  'end_spike', 'end_podium', 'end_platform', 'end_city'];

/**
 * The End's own fixtures: its obsidian pillars, the exit portal and the obsidian platform players arrive on. In
 * Minecraft these are features placed by the End itself (the exit portal by the dragon fight), which no data pack's
 * structure list turns off; a world whose preset left them out had no way back from the End.
 */
export const END_FIXTURE_IDS = Object.freeze(['end_spike', 'end_podium', 'end_platform']);

/** A world's structure list with the End's fixtures always in it. */
export function withEndFixtures(ids) {
  return [...new Set([...ids, ...END_FIXTURE_IDS])];
}

/**
 * Every structure id the engine can actually generate.
 *
 * `generatorCoverage` splits the registry into structures with and without a generator.
 * A pack that names a structure this engine cannot build
 * must not enable it: it would plan nothing while the world reported it as on.
 */
export function generatableStructureIds() {
  return generatorCoverage().implemented;
}

/**
 * The structure ids a generated world should place.
 *
 * A DATA PACK WINS. When a pack carries `worldgen/structure/*.json` files, the set of structures a world
 * places is exactly the pack's structures that this engine can generate -- intersected, because the engine
 * cannot build a structure it has no generator for, and a name that plans nothing while looking enabled is
 * worse than not accepting it at all.
 *
 * With no pack structures, the baked `WORLD_STRUCTURE_IDS` applies, so a world with no packs generates
 * exactly what it did before this existed.
 *
 * The Y-range caveat in `WORLD_STRUCTURE_IDS` still stands and is NOT solved here: this world is 64 blocks
 * tall while the engine targets 384, so a structure the pack enables may land outside the world and write
 * nothing. That is a pre-existing limit of the engine, and enabling a taller structure is the pack author's
 * choice rather than something this function can decide for them.
 *
 * @param {Iterable<string>} [packIds] defaults to the structures the applied packs carry
 * @returns {string[]}
 */
export function enabledStructureIds(packIds = packStructureIds()) {
  const generatable = new Set(generatableStructureIds());
  const fromPack = [];
  for (const id of packIds ?? []) {
    const clean = String(id).includes(':') ? String(id).slice(String(id).indexOf(':') + 1) : String(id);
    // Deduplicated and order-stable: two packs naming the same structure enable it once.
    if (generatable.has(clean) && !fromPack.includes(clean)) fromPack.push(clean);
  }
  if (fromPack.length) return fromPack;
  // An EMPTY result is ambiguous: it means either "the pack said nothing about structures" or "the pack wants
  // none". A pack says the latter by loading a structure set with an empty `structures` list, and that has to
  // win over the fallback -- otherwise a preset advertising a structureless world quietly generated villages.
  if (packSuppressesStructures()) return [];
  return [...WORLD_STRUCTURE_IDS];
}

/**
 * The structure ids the WINNING applied pack carries, namespaced ids stripped.
 *
 * The winning pack, not every pack: structure sets PRECEDE. Taking every key meant that with the bundled
 * vanilla pack and a chosen preset both applied, each preset got vanilla's thirty-odd structures PLUS its own
 * -- so "Dungeon Rush" and "Lush Havens" enabled the same set and the structure half of a preset meant
 * nothing. `winningStructureIds` picks the highest pack stamp, which is the same rule the registries use.
 */
export function packStructureIds() {
  const out = [];
  for (const id of winningStructureIds()) {
    const clean = String(id).includes(':') ? String(id).slice(String(id).indexOf(':') + 1) : String(id);
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * How far away a structure's START may be and still overlap this chunk.
 *
 * Eight chunks is 128 blocks: a stronghold reaches 112 blocks from its start ("within a horizontal radius of 112
 * blocks") and a mineshaft 85; a village about 56 from its meeting point. It is also the only thing that costs work per chunk, so it is a
 * constant rather than a scan of the world.
 */
export const STRUCTURE_SEARCH_RADIUS_CHUNKS = 8;

/**
 * Vegetation the terrain pass plants before structures are written: logs, leaves, flowers, grass, cactus, snow
 * layers. A structure clears these from its pieces; it never clears terrain, which is terrain adaptation's job.
 */
const VEGETATION = /(^|_)(log|leaves|wood|stem|sapling|vine|vines|bamboo|cactus|sugar_cane|flower|poppy|dandelion|tulip|orchid|allium|bluet|daisy|cornflower|lily|rose_bush|peony|lilac|sunflower|petals|wildflowers|short_grass|tall_grass|fern|large_fern|bush|dead_bush|roots|plant|mushroom|mushroom_block|azalea|moss_carpet|leaf_litter|dry_grass)$/;
const vegetationCache = new Map();
export function isVegetation(id) {
  let known = vegetationCache.get(id);
  if (known === undefined) {
    const name = String(BLOCK_DEFS[id]?.name ?? '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
    // The snow LAYER is named plain "Snow" (the full block is "Snow Block"), so it is matched by id.
    known = id === BLOCKS.SNOW_LAYER || (Boolean(name) && VEGETATION.test(name));
    vegetationCache.set(id, known);
  }
  return known;
}

/** A stable identity for one start, used to write it into a chunk at most once. */
/**
 * A set of `${dimension}|${cx},${cz}|${start}` keys, also indexed by their chunk so one chunk's keys can be listed or
 * dropped without scanning the rest.
 */
function createChunkKeySet() {
  const keys = new Set();
  const byChunk = new Map();
  const chunkOf = (key) => key.slice(0, key.indexOf('|', key.indexOf('|') + 1));
  return {
    has: (key) => keys.has(key),
    add(list) {
      for (const key of list) {
        if (keys.has(key)) continue;
        keys.add(key);
        const chunk = chunkOf(key);
        let entries = byChunk.get(chunk);
        if (!entries) byChunk.set(chunk, entries = []);
        entries.push(key);
      }
    },
    keysFor: (chunk) => (byChunk.get(chunk) ?? []).slice(),
    forget(chunk) {
      for (const key of byChunk.get(chunk) ?? []) keys.delete(key);
      byChunk.delete(chunk);
    },
  };
}

/**
 * The counters generating a chunk advances by itself, which a worker reports and the game adds up. `mobs`,
 * `spawned` and `oriented` are left out: replaying the chunk's requests advances those (`replayRequest`). So is
 * `planned`: the game plans for itself whenever it asks about structures, and counting the worker's too would
 * count the same plans twice.
 */
export const GENERATION_COUNTS = Object.freeze(['chunks', 'structures', 'blocks', 'outOfWorld', 'cleared']);

function startKey(start) {
  const box = start.box;
  return `${start.structureId}@${box.minX},${box.minY},${box.minZ}`;
}

/**
 * @param {object} options
 * @param {number} options.seed      the world seed; the same seed must give the same structures
 * @param {object} options.world     the world, for `getBiome` and `surfaceHeightAt`
 * @param {object} options.sizes     `{ x, height, z }` chunk dimensions, INJECTED because importing them from
 *                                   `world.js` would make the two modules circular
 */
export function createWorldStructures({
  seed,
  world,
  sizes,
  enabledIds = WORLD_STRUCTURE_IDS,
  blockIds = BLOCKS,
  radiusChunks = STRUCTURE_SEARCH_RADIUS_CHUNKS,
  foundationBlock = BLOCKS.DIRT,
  adapt = true,
  spacingScale = 1,
  spacingOverrides = null,
  onSpawn = null,
  onOrientation = null
} = {}) {
  if (!world || typeof world.getBiome !== 'function' || typeof world.surfaceHeightAt !== 'function') {
    throw new Error('createWorldStructures needs a world exposing getBiome and surfaceHeightAt');
  }
  if (!sizes || !sizes.x || !sizes.height || !sizes.z) {
    throw new Error('createWorldStructures needs the chunk sizes');
  }

  const enabled = new Set(enabledIds);
  // Which SETS matter, so a chunk with no relevant set is skipped without planning anything.
  //
  // `getSetForStructure` returns the set OBJECT while `candidatesForChunk` returns set NAMES, so the name has
  // to be taken from the object: comparing the object against a name never matches, and the whole integration
  // then plans nothing at all while looking correctly wired.
  const enabledSets = new Set();
  for (const id of enabled) {
    const set = getSetForStructure(id);
    if (set && set.name) enabledSets.add(set.name);
  }

  // One engine per dimension, made when that dimension first generates a chunk: the Nether and the End have their
  // own structure sets (fortresses, bastions, Nether fossils, End cities), and the world says which dimension a
  // chunk belongs to through `world.dimension`.
  const engines = new Map();
  const engineFor = (dimension) => {
    if (!engines.has(dimension)) {
      engines.set(dimension, createStructureEngine({
        seed,
        dimension,
        blockIds,
        biomeAt: (x, z, info) => {
          if(world.getBiomeAt&&(info?.implementation==='ancientCity'||info?.implementation==='mineshaft')){
            const underground=world.getBiomeAt(x,7,z);
            if(info.implementation==='ancientCity'||underground==='deep_dark')return underground;
          }
          return world.getBiome(x,z);
        },
        surfaceY: (x, z) => world.surfaceHeightAt(x, z),
        solidAt: typeof world.solidAtGen === 'function' ? (x, y, z) => world.solidAtGen(x, y, z) : null,
        seaLevel: world.seaLevel ?? null,
        spacingScale,
        spacingOverrides
      }));
    }
    return engines.get(dimension);
  };
  const dimensionNow = () => ({ nether: 'nether', the_end: 'the_end', end: 'the_end' }[world.dimension] ?? 'overworld');

  // One entry per chunk ever considered: a start, or null for "nothing here". Memoised because the scan
  // reaches the same neighbour chunk from many directions and planning is the expensive half.
  const plans = new Map();
  // Two records of which start has been realized into which chunk, kept by chunk so a terrain worker can be told
  // them (appliedKeysFor, realizedKeysFor) and this engine told what a worker did (markApplied, markRealized).
  //
  //   applied   -- written into the chunk the world holds NOW. A chunk can be asked to generate more than once (the
  //                world registers a chunk before generating it, and callers re-enter), so this keeps writes
  //                idempotent. It is forgotten when the chunk is unloaded (forgetChunk): the chunk's blocks are gone,
  //                and when it is generated again its structures must be written again. They were not, which left
  //                holes in villages and every other structure after walking away and back.
  //   realized  -- ever written, for the life of the world. A structure written a second time does not ask for its
  //                mobs again: its villagers, golem and witch were spawned the first time and are still there.
  const applied = createChunkKeySet();
  const realized = createChunkKeySet();
  const markApplied = (keys) => applied.add(keys);
  const markRealized = (keys) => realized.add(keys);
  const appliedKeysFor = (chunkX, chunkZ, dimension = dimensionNow()) => applied.keysFor(`${dimension}|${chunkX},${chunkZ}`);
  const realizedKeysFor = (chunkX, chunkZ, dimension = dimensionNow()) => realized.keysFor(`${dimension}|${chunkX},${chunkZ}`);
  /** The chunk has left the world: what was written into it is gone with it. */
  const forgetChunk = (chunkX, chunkZ, dimension = dimensionNow()) => applied.forget(`${dimension}|${chunkX},${chunkZ}`);
  const loot = [];
  const stats = { chunks: 0, planned: 0, structures: 0, blocks: 0, outOfWorld: 0, mobs: 0, spawned: 0, oriented: 0, cleared: 0 };

  /**
   * Remove vegetation standing inside a structure's pieces, above each piece's floor, wherever the structure itself
   * wrote nothing. Tree planting already keeps clear of planned structures; this catches what it cannot -- flowers
   * and grass from the surface pass, and a canopy from a tree just outside the margin.
   */
  function clearVegetation(chunk, start, own, baseX, baseZ) {
    let cleared = 0;
    const maxX = baseX + sizes.x - 1; const maxZ = baseZ + sizes.z - 1;
    for (const piece of start.pieces) {
      const b = piece.box;
      if (b.maxX < baseX || b.minX > maxX || b.maxZ < baseZ || b.minZ > maxZ) continue;
      const offsets = piece.meta?.columnOffsets ?? null;
      const width = b.maxX - b.minX + 1;
      for (let x = Math.max(b.minX, baseX); x <= Math.min(b.maxX, maxX); x++) {
        for (let z = Math.max(b.minZ, baseZ); z <= Math.min(b.maxZ, maxZ); z++) {
          // A terrain-matching street's floor is its own column's ground, not the box bottom.
          const floor = offsets ? piece.meta.baseY + (offsets[(z - b.minZ) * width + (x - b.minX)] ?? 0) : b.minY;
          const lx = x - baseX; const lz = z - baseZ;
          for (let y = Math.max(0, floor + 1); y <= Math.min(b.maxY, sizes.height - 1); y++) {
            if (own.has((y * sizes.z + lz) * sizes.x + lx)) continue;
            if (!isVegetation(chunk.getVoxel(lx, y, lz))) continue;
            chunk.setVoxel(lx, y, lz, blockIds.AIR);
            cleared++;
          }
        }
      }
    }
    return cleared;
  }
  // Things a structure hands to the GAME rather than to the voxels: mobs (a village's villagers, golem and pen
  // animals) and block orientation (which way a door, bed, chest or stair faces -- the voxel world stores only
  // block ids). Each is requested exactly once, by the chunk that contains it. `onSpawn` / `onOrientation` put
  // one into the game and return true; when the game cannot take it yet (its managers are not up while the
  // first chunks generate) it waits in `pendingSpawns` and `flushSpawns` retries it, a few times at most so an
  // unsupported request cannot be retried forever.
  const spawns = [];
  const orientations = [];
  const pendingSpawns = [];
  function deliver(entry) {
    return entry.kind === 'spawn' ? (onSpawn ? onSpawn(entry.request) === true : false)
      : (onOrientation ? onOrientation(entry.request) === true : false);
  }
  function dispatch(kind, request) {
    const entry = { kind, request, attempts: 1 };
    if (deliver(entry)) { if (kind === 'spawn') stats.spawned++; else stats.oriented++; return; }
    pendingSpawns.push(entry);
  }
  /**
   * Take in what a terrain worker's copy of this engine did for one chunk (terrainWorkerClient.js), as if this
   * engine had generated it: the requests go out through the same `dispatch`, in the same order, and the keys,
   * loot and counts are added to this engine's own.
   */
  function replayRequest(kind, request) {
    if (kind === 'spawn') { spawns.push(request); stats.mobs++; } else orientations.push(request);
    dispatch(kind, request);
  }
  function adoptGenerated({ appliedKeys = [], loot: chunkLoot = [], stats: counts = {} } = {}) {
    markApplied(appliedKeys);
    markRealized(appliedKeys);
    for (const entry of chunkLoot) loot.push(entry);
    for (const name of GENERATION_COUNTS) stats[name] += counts[name] ?? 0;
  }
  function flushSpawns() {
    if (pendingSpawns.length === 0) return 0;
    let done = 0;
    for (let i = pendingSpawns.length - 1; i >= 0; i--) {
      const entry = pendingSpawns[i];
      if (deliver(entry)) {
        if (entry.kind === 'spawn') stats.spawned++; else stats.oriented++;
        done++; pendingSpawns.splice(i, 1);
      } else if (++entry.attempts > 5) pendingSpawns.splice(i, 1);
    }
    return done;
  }

  /** The start whose origin is this chunk, if it is one this world places. */
  function plansAt(chunkX, chunkZ, dimension = dimensionNow()) {
    // Numeric keys in a map per dimension: a chunk asks this of the 289 chunks around it, and building a string key
    // for each was most of the cost of the lookup.
    let byChunk = plans.get(dimension);
    if (!byChunk) plans.set(dimension, byChunk = new Map());
    const key = (chunkX + 1048576) * 2097152 + (chunkZ + 1048576);
    const known = byChunk.get(key);
    if (known !== undefined) return known;
    const engine = engineFor(dimension);
    let starts = [];
    const candidates = engine.candidatesForChunk(chunkX, chunkZ);
    if (candidates.some((set) => enabledSets.has(set))) {
      // Every set plans on its own (a mineshaft and a shipwreck can share a chunk); this world places the enabled ones.
      starts = engine.planChunkAll(chunkX, chunkZ).filter((plan) => plan.start && enabled.has(plan.structureId)).map((plan) => plan.start);
      stats.planned += starts.length;
    }
    byChunk.set(key, starts);
    return starts;
  }

  /** The (first) start whose origin is this chunk, if it is one this world places. */
  function planAt(chunkX, chunkZ, dimension = dimensionNow()) {
    return plansAt(chunkX, chunkZ, dimension)[0] ?? null;
  }

  /**
   * Which structure, if any, has a piece covering this block.
   *
   * This is what makes a structure's spawn override work: the spawner asks "what structure is here?" and a swamp
   * hut answers for its 7 x 7 x 9 box, so witches spawn there. Before this existed the game's `structureAt` hook
   * had nothing behind it, and no structure's spawn override ever applied in a running world.
   *
   * Reads the same memoised plans chunk generation uses, so it never generates a chunk.
   * @returns {string|null} a structure id
   */
  function structureIdAt(x, y, z) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const near = piecesReaching(Math.floor(bx / sizes.x), Math.floor(bz / sizes.z));
    for (let i = 0; i < near.boxes.length; i++) {
      if (near.boxes[i].contains(bx, by, bz)) return near.ids[i];
    }
    return null;
  }

  /**
   * Every planned piece whose box reaches into this chunk, with its structure id, in the order `structureIdAt` used
   * to visit them (so the first match is the same one).
   *
   * The spawner asks `structureIdAt` for every spawn attempt, and each ask walked the plans of the 289 chunks around
   * it and every piece in them. Plans never change once made, so what reaches a chunk is worked out once.
   */
  const reachingByDimension = new Map();
  function piecesReaching(chunkX, chunkZ) {
    const dimension = dimensionNow();
    let byChunk = reachingByDimension.get(dimension);
    if (!byChunk) reachingByDimension.set(dimension, byChunk = new Map());
    const key = (chunkX + 1048576) * 2097152 + (chunkZ + 1048576);
    const known = byChunk.get(key);
    if (known !== undefined) return known;
    const minX = chunkX * sizes.x; const maxX = minX + sizes.x - 1;
    const minZ = chunkZ * sizes.z; const maxZ = minZ + sizes.z - 1;
    const near = { boxes: [], ids: [] };
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        for (const start of plansAt(chunkX + dx, chunkZ + dz, dimension)) {
          for (const piece of start.pieces) {
            const b = piece.box;
            if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
            near.boxes.push(b); near.ids.push(start.structureId);
          }
        }
      }
    }
    if (byChunk.size >= 4096) byChunk.delete(byChunk.keys().next().value);
    byChunk.set(key, near);
    return near;
  }

  /**
   * The piece boxes of every planned structure that reach into this chunk grown by `margin` blocks.
   *
   * Tree planting asks this once per chunk so it can leave room for structures: trees are planted BEFORE
   * structures are written, and a canopy that lands in a village street or an igloo cannot be repaired afterwards
   * without leaving half a tree floating beside it. Pure planning, so it never generates a chunk.
   */
  function pieceBoxesNear(chunkX, chunkZ, margin = 0) {
    const dimension = dimensionNow();
    const minX = chunkX * sizes.x - margin; const maxX = chunkX * sizes.x + sizes.x - 1 + margin;
    const minZ = chunkZ * sizes.z - margin; const maxZ = chunkZ * sizes.z + sizes.z - 1 + margin;
    const boxes = [];
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        for (const start of plansAt(chunkX + dx, chunkZ + dz, dimension)) {
          const box = start.box;
          if (box.maxX < minX || box.minX > maxX || box.maxZ < minZ || box.minZ > maxZ) continue;
          for (const piece of start.pieces) {
            const b = piece.box;
            if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
            boxes.push(b);
          }
        }
      }
    }
    return boxes;
  }

  /**
   * Write every structure that overlaps this chunk, clipped to it.
   *
   * @returns {object} the running stats, for tests and for a caller that wants to report them
   */
  function applyToChunk(chunk) {
    if (!chunk) return stats;
    stats.chunks++;
    const baseX = chunk.cx * sizes.x;
    const baseZ = chunk.cz * sizes.z;
    const maxX = baseX + sizes.x - 1;
    const maxZ = baseZ + sizes.z - 1;

    const dimension = dimensionNow();
    const engine = engineFor(dimension);
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        for (const start of plansAt(chunk.cx + dx, chunk.cz + dz, dimension)) {
        const box = start.box;
        // Overlap in the horizontal plane only: a structure's Y band can lie entirely outside this world's
        // height, and that is a separate case reported through `outOfWorld` rather than by skipping it here.
        if (box.maxX < baseX || box.minX > maxX || box.maxZ < baseZ || box.minZ > maxZ) continue;

        const key = `${dimension}|${chunk.cx},${chunk.cz}|${startKey(start)}`;
        if (applied.has(key)) continue;
        // Written here before, then unloaded: the blocks and orientations go back, the mobs and loot list do not.
        const again = realized.has(key);
        markApplied([key]);
        markRealized([key]);

        const own = new Set();
        const written = engine.realize(start, (x, y, z, id, meta) => {
          const lx = x - baseX;
          const lz = z - baseZ;
          // The engine clips to the chunk column; this re-checks the WORLD's own height, because the engine's
          // target world is 384 tall and this one is 64. A block above the ceiling is dropped and counted,
          // which is what turns a silently empty structure into a reported one.
          if (lx < 0 || lx >= sizes.x || lz < 0 || lz >= sizes.z || y < 0 || y >= sizes.height) {
            stats.outOfWorld++;
            return false;
          }
          if (!meta?.terrainAdaptation) own.add((y * sizes.z + lz) * sizes.x + lx);
          // A village path over water becomes planks (the generator says which, through `ifWater`).
          if (meta && meta.ifWater !== undefined && chunk.getVoxel(lx, y, lz) === blockIds.WATER) id = meta.ifWater;
          chunk.setVoxel(lx, y, lz, id);
          if (meta && meta.lootTable && !again) loot.push({ x, y, z, lootTable: meta.lootTable });
          // A block that has a way of facing (a door, bed, chest or stair): tell the game which way, since the
          // chunk holds only its id.
          const props = meta?.state?.properties;
          // A top slab has no facing but must still be remembered, or it renders as a bottom slab.
          // A vine's faces are booleans (north/east/south/west/up), not a facing.
          const vineFaces = props && ['north', 'south', 'east', 'west', 'up'].some((f) => String(props[f]) === 'true')
            ? Object.fromEntries(['north', 'south', 'east', 'west', 'up'].map((f) => [f, String(props[f]) === 'true'])) : null;
          if ((props && (props.facing || props.type === 'top' || props.age !== undefined)) || vineFaces || meta?.spawner || meta?.trialSpawner || meta?.vault) {
            const request = { x, y, z, id, name: meta.state?.name ?? null, facing: props?.facing ?? null, half: props?.half ?? null,
              ...(vineFaces ? { vineFaces } : {}),
              ...(props?.age!==undefined?{plantAge:Number(props.age)}:{}),
              hinge: props?.hinge ?? null, lootTable: meta.lootTable ?? null, slabType: props?.type === 'top' ? 'top' : null,
              ...(meta?.spawner ? { spawner: meta.spawner } : {}), ...(meta?.extraItems ? { extraItems: meta.extraItems } : {}),
              ...(meta?.trialSpawner ? { trialSpawner: meta.trialSpawner } : {}), ...(meta?.vault ? { vault: meta.vault } : {}) };
            orientations.push(request);
            dispatch('orient', request);
          }
          return true;
        }, {
          spawnMob: (type, x, y, z, options) => {
            // Its mobs were spawned the first time and outlive the chunk (structure mobs are persistent).
            if (again) return true;
            // `y` is the floor block's top; a hair above it so the mob does not start inside the floor.
            const request = { type, x, y: y + 0.01, z, options };
            spawns.push(request);
            stats.mobs++;
            dispatch('spawn', request);
            return true;
          },
          chunkX: chunk.cx,
          chunkZ: chunk.cz,
          surfaceY: (x, z) => world.surfaceHeightAt(x, z),
          foundationBlock,
          airBlock: blockIds.AIR,
          surfaceBlock: (x, z) => getBiomeDef(world.getBiome(x, z))?.surfaceBlock ?? blockIds.GRASS,
          adapt
        });
        stats.cleared += clearVegetation(chunk, start, own, baseX, baseZ);

        stats.structures++;
        stats.blocks += typeof written === 'number' ? written : 0;
        }
      }
    }
    return stats;
  }

  return {
    enabledIds: [...enabled],
    applyToChunk,
    planAt,
    plansAt,
    pieceBoxesNear,
    structureIdAt,
    stats,
    loot,
    spawns,
    orientations,
    pendingSpawns,
    flushSpawns,
    appliedKeysFor,
    realizedKeysFor,
    markApplied,
    markRealized,
    forgetChunk,
    replayRequest,
    adoptGenerated,
    /** The engine for the dimension the world is in now. */
    get engine() { return engineFor(dimensionNow()); },
    engineFor,
    enabledIds: [...enabled],
    enabledSets: [...enabledSets]
  };
}

/**
 * How many structures this world places within `radiusChunks` of a point, by type.
 *
 * Reads the same plans chunk generation uses, so the number is what a player will actually find, not an
 * estimate from the spacing. It walks each enabled set's candidate grid (one candidate per spacing x spacing
 * region) instead of every chunk, which is what keeps `/locate` instant. Chance-driven sets with no grid
 * (spacing 1-2: buried treasure, mineshafts, nether fossils) are left out of the count. `/locate` prints it, so "is the pack working" has a number instead of a feeling.
 *
 * @returns {{total:number, byType:Object<string,number>, radiusChunks:number}}
 */
export function countStructures(world, blockX, blockZ, { radiusChunks = 64 } = {}) {
  const integration = world && world.structures;
  if (!integration) throw new Error('this world does not generate structures');
  const cx = Math.floor(blockX / 16);
  const cz = Math.floor(blockZ / 16);
  const byType = {};
  let total = 0;
  const seen = new Set();
  for (const name of integration.enabledSets) {
    const placement = integration.engine.sets.get(name)?.placement;
    if (!placement || !(placement.spacing > 2) || typeof placement.getPotentialStructureChunks !== 'function') continue;
    const candidates = placement.getPotentialStructureChunks(
      integration.engine.seed, cx - radiusChunks, cz - radiusChunks, cx + radiusChunks, cz + radiusChunks);
    for (const [x, z] of candidates) {
      if (x < cx - radiusChunks || x > cx + radiusChunks || z < cz - radiusChunks || z > cz + radiusChunks) continue;
      const key = x + ',' + z;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = integration.planAt(x, z);
      if (!start) continue;
      byType[start.structureId] = (byType[start.structureId] || 0) + 1;
      total++;
    }
  }
  return { total, byType, radiusChunks };
}

/**
 * `/locate structure <id>`: the nearest instance of a structure this world generates.
 *
 * WHY THIS EXISTS: the structures were being generated and still looked absent, because the placement sets use
 * vanilla spacing (16 to 34 chunks), so the nearest one to spawn in the default world is roughly 340 blocks
 * away and NOTHING lies within 128 blocks of spawn. A player who generates a world and looks around sees none
 * of them -- which is what vanilla is like, and why vanilla has this command. Without it there is no way to
 * tell "the structures are far away" from "the structures are broken".
 *
 * Kept here rather than in the command handler so it can be tested without a browser.
 *
 * @returns {object} `{ structureId, chunk, centre, box, distance, biome }`
 * @throws when the world generates no structures, the id is not enabled, or nothing is within the radius
 */
export function locateNearestStructure(world, structureId, blockX, blockZ, { maxRadiusChunks = 4096 } = {}) {
  const integration = world && world.structures;
  if (!integration) throw new Error('this world does not generate structures');
  const id = String(structureId || integration.enabledIds[0] || '').toLowerCase();
  if (!id) throw new Error('no structures are enabled in this world');
  if (!integration.enabledIds.includes(id)) {
    // Naming what IS enabled turns a dead end into a usable answer.
    throw new Error(`${id} is not generated in this world; try: ${integration.enabledIds.join(', ')}`);
  }
  const found = integration.engine.locate(id, Math.floor(blockX), Math.floor(blockZ), { maxRadiusChunks });
  if (!found) throw new Error(`no ${id} within ${maxRadiusChunks} chunks`);
  const box = found.start.box;
  const centre = {
    x: Math.round((box.minX + box.maxX) / 2),
    y: Math.round((box.minY + box.maxY) / 2),
    z: Math.round((box.minZ + box.maxZ) / 2)
  };
  return {
    structureId: id,
    chunk: found.chunk,
    // The player has to WALK here, so the centre is more useful than the corner: a village spans 50 blocks.
    centre,
    box: [box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ],
    distance: Math.round(found.distance),
    biome: typeof world.getBiome === 'function' ? world.getBiome(centre.x, centre.z) : null
  };
}
