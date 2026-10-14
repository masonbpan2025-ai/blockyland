// Structure audit: check a generated structure against the facts the wiki states, layer by layer.
//
// This is the engine behind the Inspector's Audit panel and `scripts/structure-audit-report.mjs`. The plan is in
// docs/STRUCTURE_AUDIT_PLAN.md. In short: a structure can be wrong at six layers (placement, layout, content,
// game integration, visuals, saves), and engine-level tests only ever covered the first three -- which is how a
// village whose tests were green still showed no villagers and a farm made of logs.
//
// HOW IT WORKS
//
//   observe(id, { seed, mode })   generates the structure and records what it did: every block it writes (with
//                                 block-state properties and loot table), every mob it asks for, its boxes, the
//                                 ground under it, and -- in REAL WORLD mode -- what the game did with it.
//   auditStructure(id, options)   runs the UNIVERSAL facts (true of every structure) plus the structure's own
//                                 spec card (`structureAuditCards.js`) against that observation.
//
// Two modes, because they answer different questions:
//   'flat'   a flat surface and no game: fast, headless, deterministic. Layout and content facts.
//   'world'  a real `World` with the game's terrain, 64-block height, chunk-by-chunk writing, mob requests, block
//            orientation and a save round trip. This is the mode that sees the bugs the flat mode cannot.
//
// A fact is `pass`, `fail`, `waived` (with the reason on the card) or `unchecked` (it needs the real world, or
// the observation could not be made). Nothing is `pass` by default.

import { createStructureEngine, GENERATORS, STRUCTURES } from './worldgen/index.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { STRUCTURE_AUDIT_CARDS } from './structureAuditCards.js';

/** The game's world height: structures are clipped to Y 0..WORLD_HEIGHT-1. */
export const WORLD_HEIGHT = 64;

/** Block id -> a lower-case registry name (`SPRUCE_PLANKS` -> `spruce_planks`). */
const NAME_OF_ID = (() => {
  const out = new Map();
  for (const [key, value] of Object.entries(BLOCKS)) {
    if (typeof value === 'number' && !out.has(value)) out.set(value, key.toLowerCase());
  }
  return out;
})();
export const blockName = (id) => NAME_OF_ID.get(id) ?? `#${id}`;

/**
 * Generate a structure and record everything about it.
 *
 * @param {string} structureId
 * @param {object} [options]
 * @param {number|string} [options.seed]
 * @param {'flat'|'world'} [options.mode]
 * @param {string} [options.biome]       defaults to the structure's first biome gate
 * @param {number} [options.surface]     flat mode ground height (the game's ground is around 28)
 * @param {string} [options.difficulty]  world mode: the difficulty the game reports while generating
 * @param {number} [options.maxRadiusChunks]
 * @returns {Promise<object>} the observation (see the fields below); `found` is false if none was located
 */
export async function observe(structureId, {
  seed = 20250401, mode = 'flat', biome = null, surface = 28, difficulty = 'normal', maxRadiusChunks = 2048
} = {}) {
  const info = STRUCTURES[structureId];
  if (!info) throw new Error(`unknown structure "${structureId}"`);
  const dimension = info.dimension;
  const biomeId = biome || (info.biomes && info.biomes[0]) || ({ nether: 'nether_wastes', the_end: 'the_end' }[dimension]) || 'plains';
  const generator = info.implementation && GENERATORS[info.implementation];
  const obs = {
    structureId, mode, seed: String(seed), biome: biomeId, info, dimension, surface,
    hasGenerator: Boolean(generator), found: false, difficulty,
    writes: [], spawns: [], stats: null, integration: null
  };
  if (!generator) return obs;

  // The terrain the structure is generated against. Flat: a constant. World: the game's own terrain functions, so
  // a hut over a slope sees a slope and a village sees real ground.
  let world = null;
  let recorder = null;
  let engine;
  if (mode === 'world') {
    ({ world, recorder } = await createAuditWorld({ seed, biome: biomeId, structureId, difficulty }));
    engine = world.structures.engine;
    obs.groundAt = (x, z) => world.surfaceHeightAt(x, z);
  } else {
    engine = createStructureEngine({
      seed, dimension, blockIds: BLOCKS, biomeAt: () => biomeId, surfaceY: () => surface
    });
    obs.groundAt = () => surface;
  }

  const found = engine.locate(structureId, 0, 0, { maxRadiusChunks });
  if (!found) return obs;
  obs.found = true;
  obs.start = found.start;
  obs.chunk = found.chunk;
  obs.distance = Math.round(found.distance);
  obs.box = found.start.box;
  obs.pieces = found.start.pieces;
  obs.registry = engine.registry[structureId];

  // Realize through the generator itself, so unresolved blocks and mob requests are reported by it.
  const writes = new Map();
  const writer = (x, y, z, id, meta) => {
    const props = meta?.state?.properties ?? null;
    writes.set(`${x},${y},${z}`, {
      x, y, z, id, name: blockName(id), props, lootTable: meta?.lootTable ?? null, state: meta?.state?.name ?? null
    });
    return true;
  };
  const spawns = [];
  const report = generator.realize(found.start, writer, BLOCKS, {
    spawnMob: (type, x, y, z, options) => { spawns.push({ type, x, y, z, options: options ?? {} }); return true; }
  }) ?? {};
  obs.writes = [...writes.values()].filter((write) => write.id !== BLOCKS.AIR);
  obs.airWrites = writes.size - obs.writes.length;
  obs.spawns = spawns;
  obs.report = typeof report === 'number' ? { written: report } : report;
  obs.missingBlocks = obs.report.missingBlocks ?? [];
  obs.idAt = (x, y, z) => writes.get(`${x},${y},${z}`)?.id ?? BLOCKS.AIR;

  // How much of the structure fits in the game's world height.
  const inside = obs.writes.filter((write) => write.y >= 0 && write.y < WORLD_HEIGHT).length;
  obs.stats = {
    blocks: obs.writes.length,
    inWorld: inside,
    clipped: obs.writes.length - inside,
    fitPercent: obs.writes.length ? Math.round((100 * inside) / obs.writes.length) : 100,
    minY: obs.writes.length ? Math.min(...obs.writes.map((write) => write.y)) : null,
    maxY: obs.writes.length ? Math.max(...obs.writes.map((write) => write.y)) : null
  };

  obs.count = (name) => obs.writes.filter((write) => write.name === name).length;
  obs.countMatching = (pattern) => obs.writes.filter((write) => pattern.test(write.name)).length;
  obs.spawnsOf = (type) => obs.spawns.filter((spawn) => spawn.type === type);

  if (mode === 'world') {
    // Let the game generate the chunks the structure covers, then compare what is in the world with what the
    // generator wrote, and read what the game's managers were told.
    const box = found.start.box;
    for (let cx = Math.floor(box.minX / 16) - 1; cx <= Math.floor(box.maxX / 16) + 1; cx++) {
      for (let cz = Math.floor(box.minZ / 16) - 1; cz <= Math.floor(box.maxZ / 16) + 1; cz++) world.getOrCreateChunk(cx, cz);
    }
    // Blocks a neighbouring start of the same world also writes (mineshafts "can generate near each other") are not
    // this structure's to answer for, so they are left out of the comparison.
    const others = new Set();
    const radius = 6;
    for (let cx = Math.floor(box.minX / 16) - radius; cx <= Math.floor(box.maxX / 16) + radius; cx++) {
      for (let cz = Math.floor(box.minZ / 16) - radius; cz <= Math.floor(box.maxZ / 16) + radius; cz++) {
        const other = world.structures.planAt(cx, cz);
        if (!other || other === found.start || (other.chunkX === found.start.chunkX && other.chunkZ === found.start.chunkZ)) continue;
        if (!other.box.intersects(box)) continue;
        const impl = GENERATORS[STRUCTURES[other.structureId]?.implementation];
        impl?.realize(other, (x, y, z) => { others.add(`${x},${y},${z}`); return true; }, BLOCKS);
      }
    }
    let compared = 0;
    let matched = 0;
    for (const write of obs.writes) {
      if (write.y < 0 || write.y >= WORLD_HEIGHT) continue;
      if (others.has(`${write.x},${write.y},${write.z}`)) continue;
      compared++;
      if (world.getVoxel(write.x, write.y, write.z) === write.id) matched++;
    }
    obs.integration = {
      world,
      recorder,
      compared,
      matched,
      stats: { ...world.structures.stats },
      pendingSpawns: world.structures.pendingSpawns.length,
      worldIdAt: (x, y, z) => world.getVoxel(x, y, z),
      structureIdAt: (x, y, z) => world.structures.structureIdAt(x, y, z)
    };
  }
  return obs;
}

/** A real `World` with a recording stand-in for the game's managers, so integration can be observed headlessly. */
export async function createAuditWorld({ seed, biome, structureId, difficulty }) {
  const { World } = await import('./world.js');
  const recorder = { mobs: [], doors: [], beds: [], chests: [], carts: [] };
  // The managers also KEEP what they were given and answer `getDoor` / `getBed` / `getChest` as the real ones do,
  // because the game's mesher asks them how to draw a door, a bed and a chest. Without that, a textured view of
  // the world would draw every door as a default door and every chest facing the wrong way.
  const doorStates = new Map();
  const bedStates = new Map();
  const chestStates = new Map();
  const at = (x, y, z) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  const world = new World(Number(seed) || 0, biome);
  world.game = {
    difficulty,
    railSystem: {
      spawnCart: (position, options) => {
        const cart = { position: [...position], subType: options?.subType ?? 'minecart', items: null };
        recorder.carts.push(cart);
        return cart;
      }
    },
    mobs: {
      spawnMob: (type, x, y, z, options) => {
        const mob = { type };
        recorder.mobs.push({ type, x, y, z, options: options ?? {}, mob });
        return mob;
      }
    },
    doorManager: {
      getDoor: (x, y, z) => doorStates.get(at(x, y, z)) ?? null,
      toggleDoor: (x, y, z) => {
        const door = doorStates.get(at(x, y, z));
        if (door) door.open = !door.open;
        return door ?? null;
      },
      adoptDoor: (pos, facing, hinge) => {
        const [x, y, z] = pos.map(Math.floor);
        const door = { bottomPos: [x, y, z], topPos: [x, y + 1, z], facing, open: false, manualOpen: false, isIron: false, hinge };
        doorStates.set(at(x, y, z), door);
        doorStates.set(at(x, y + 1, z), door);
        recorder.doors.push({ pos: [...pos], facing, hinge });
        return door;
      }
    },
    bedManager: {
      getBed: (x, y, z) => bedStates.get(at(x, y, z)) ?? null,
      registerBed: (foot, head, dir) => {
        const bed = { footPos: foot.map(Math.floor), headPos: head.map(Math.floor), dir: dir || 0 };
        bedStates.set(at(...foot), bed);
        bedStates.set(at(...head), bed);
        recorder.beds.push({ foot: [...foot], head: [...head], dir });
        return bed;
      }
    },
    chestManager: {
      getChest: (x, y, z) => chestStates.get(at(x, y, z)) ?? null,
      adoptChest: (pos, facing, items) => {
        const [x, y, z] = pos.map(Math.floor);
        const chest = { x, y, z, facing, items: new Array(27).fill(null), isDouble: false, partnerPos: null, isLeft: false };
        (items ?? []).slice(0, 27).forEach((item, slot) => { chest.items[slot] = item ? { ...item } : null; });
        chestStates.set(at(x, y, z), chest);
        recorder.chests.push({ pos: [...pos], facing, items });
        return chest;
      }
    }
  };
  world.rebuildStructures({ enabledIds: [structureId] });
  return { world, recorder };
}

// ---------------------------------------------------------------------------------------------------------------
// Facts that are true of EVERY structure.

const NEEDS_WORLD = 'needs the real-world mode';

/** @returns {Array<{id:string, layer:string, text:string, check:(obs:object)=>object}>} */
export function universalFacts() {
  return [
    {
      id: 'U1', layer: 'L1', text: 'The structure can be located (the engine places it somewhere).',
      check: (o) => ({ ok: o.found, detail: o.found ? `nearest at chunk ${o.chunk}, ${o.distance} blocks away` : 'none within the search radius' })
    },
    {
      id: 'U2', layer: 'L2', text: 'Generation is deterministic: the same seed gives the same plan.',
      check: async (o) => {
        const again = await observe(o.structureId, { seed: o.seed, mode: o.mode, biome: o.biome, surface: o.surface, difficulty: o.difficulty });
        const same = again.found && o.found && String(again.start.box.toArray()) === String(o.start.box.toArray())
          && again.writes.length === o.writes.length;
        return { ok: same, detail: same ? 'identical box and block count on a second run' : 'the second run differed' };
      }
    },
    {
      id: 'U3', layer: 'L2', text: 'Every block the structure writes resolves to a block this game has.',
      check: (o) => ({ ok: o.missingBlocks.length === 0, detail: o.missingBlocks.length ? `unresolved: ${o.missingBlocks.join(', ')}` : `${o.stats.blocks} blocks, none unresolved` })
    },
    {
      id: 'U4', layer: 'L4', text: `It fits in the game's ${WORLD_HEIGHT}-block-tall world (no block is clipped).`,
      check: (o) => ({ ok: o.stats.clipped === 0, detail: `${o.stats.fitPercent}% fits (Y ${o.stats.minY}..${o.stats.maxY}); ${o.stats.clipped} of ${o.stats.blocks} blocks fall outside 0..${WORLD_HEIGHT - 1}` })
    },
    {
      id: 'U5', layer: 'L3', text: 'Each mob the structure places is requested once (no duplicate positions).',
      check: (o) => {
        const keys = o.spawns.map((spawn) => `${spawn.type}@${spawn.x},${spawn.y},${spawn.z}`);
        return { ok: new Set(keys).size === keys.length, detail: `${keys.length} mob request(s)` };
      }
    },
    {
      id: 'U6', layer: 'L4', text: 'Doors, beds, chests and stairs carry the facing they were built with.',
      check: (o) => {
        const needs = o.writes.filter((write) => /_door$|_bed_foot$|_bed_head$|^chest$|_stairs$/.test(write.name));
        const missing = needs.filter((write) => !write.props || !write.props.facing);
        return { ok: missing.length === 0, detail: needs.length ? `${needs.length - missing.length}/${needs.length} oriented${missing.length ? ` (e.g. ${missing[0].name})` : ''}` : 'no oriented blocks' };
      }
    },
    {
      id: 'U7', layer: 'L4', text: 'The game world contains the blocks the structure wrote (chunk-by-chunk generation).',
      check: (o) => {
        if (!o.integration) return { unchecked: NEEDS_WORLD };
        const { compared, matched } = o.integration;
        const ratio = compared ? matched / compared : 1;
        return { ok: ratio >= 0.97, detail: `${matched}/${compared} blocks present (${(ratio * 100).toFixed(1)}%)` };
      }
    },
    {
      id: 'U8', layer: 'L4', text: 'Every mob the structure requested reached the game (nothing left waiting).',
      check: (o) => {
        if (!o.integration) return { unchecked: NEEDS_WORLD };
        const delivered = o.integration.recorder.mobs.length;
        const dropped = o.integration.stats.mobs - delivered - o.integration.pendingSpawns;
        return { ok: o.integration.pendingSpawns === 0, detail: `${delivered} delivered, ${o.integration.pendingSpawns} waiting${dropped > 0 ? `, ${dropped} intentionally dropped` : ''}` };
      }
    },
    {
      id: 'U9', layer: 'L6', text: 'Orientation survives a save and load.',
      check: (o) => {
        if (!o.integration) return { unchecked: NEEDS_WORLD };
        const { world } = o.integration;
        const saved = JSON.parse(JSON.stringify(world.serializeOrientations()));
        const expected = o.writes.filter((write) => write.props?.facing && /_door$|_bed_foot$|^chest$|_stairs$/.test(write.name) && write.y >= 0 && write.y < WORLD_HEIGHT && !(write.props.half === 'upper')).length;
        return { ok: saved.length >= expected, detail: `${saved.length} orientation(s) saved for ${expected} oriented block(s)` };
      }
    }
  ];
}

/**
 * Run the audit.
 *
 * @returns {Promise<{structureId:string, mode:string, rows:object[], summary:object, observation:object, card:object|null}>}
 */
/**
 * The wiki infobox's "Blocks" list, as a fact. A card that lists `infoboxBlocks` gets W1: the structure uses every one
 * of those blocks and no block outside them. This is the check that would have caught the first swamp hut, which
 * left out the oak fences the infobox lists.
 */
function infoboxFacts(card) {
  if (!card.infoboxBlocks) return [];
  const listed = new Set(card.infoboxBlocks);
  return [{
    id: 'W1', layer: 'L3', source: `${card.title} wiki infobox, "Blocks"`,
    text: 'It uses every block the wiki infobox lists, and no block the infobox does not list.',
    check: (o) => {
      const normalise = card.normaliseBlock ?? ((name) => name);
      const used = new Set(o.writes.map((write) => normalise(write.name)));
      const missing = [...listed].filter((name) => !used.has(name));
      const extra = [...used].filter((name) => !listed.has(name));
      // A village never has every building ("no village consists of all building types at once"), so for a card
      // marked `infoboxSubset` only the blocks OUTSIDE the list are a failure; the missing ones are reported.
      return { ok: extra.length === 0 && (card.infoboxSubset || missing.length === 0), detail: `missing: ${missing.join(', ') || 'none'}; not in the infobox: ${extra.join(', ') || 'none'}` };
    }
  }];
}

export async function auditStructure(structureId, options = {}) {
  const obs = await observe(structureId, options);
  const card = STRUCTURE_AUDIT_CARDS[structureId] ?? null;
  const facts = [...universalFacts(), ...(card ? [...card.facts, ...infoboxFacts(card)] : [])];
  const rows = [];
  for (const fact of facts) {
    const row = { id: fact.id, layer: fact.layer, text: fact.text, status: 'unchecked', detail: '', source: fact.source ?? (fact.id.startsWith('U') ? 'universal' : 'wiki') };
    if (fact.waived) {
      row.status = 'waived';
      row.detail = fact.waived;
    } else if (!obs.hasGenerator) {
      row.status = 'unchecked';
      row.detail = 'no generator for this structure yet';
    } else if (!obs.found && fact.id !== 'U1') {
      row.status = 'unchecked';
      row.detail = 'the structure was not located';
    } else {
      try {
        const result = await fact.check(obs, { WORLD_HEIGHT, blockName, BLOCKS, BLOCK_DEFS });
        if (result.unchecked) { row.status = 'unchecked'; row.detail = result.unchecked; }
        else { row.status = result.ok ? 'pass' : 'fail'; row.detail = result.detail ?? ''; }
      } catch (error) {
        row.status = 'fail';
        row.detail = `the check threw: ${error.message}`;
      }
    }
    rows.push(row);
  }
  const summary = { pass: 0, fail: 0, waived: 0, unchecked: 0 };
  for (const row of rows) summary[row.status]++;
  return { structureId, mode: obs.mode, rows, summary, observation: obs, card };
}

/** The universal audit over every structure that has a generator: one summary row each. */
export async function auditAllStructures(options = {}) {
  const out = [];
  for (const [id, info] of Object.entries(STRUCTURES)) {
    if (!info) continue;
    if (!info.implementation) { out.push({ structureId: id, implemented: false, summary: null, rows: [] }); continue; }
    const result = await auditStructure(id, options);
    out.push({ structureId: id, implemented: true, summary: result.summary, rows: result.rows, cardFacts: result.card ? result.card.facts.length : 0 });
  }
  return out;
}
