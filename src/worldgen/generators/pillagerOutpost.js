// Pillager outpost, built from the wiki's blueprints on the jigsaw engine.
//
// Sources (saved under docs/structure-audit/wiki/): https://minecraft.wiki/w/Pillager_Outpost and its /Structure page,
// whose blueprints of the watchtower and of the five features (cage, logs, target, two tents) are converted by
// scripts/generate-structure-blueprints.mjs.
//
// From the pages:
//   * "The outpost tower always generates, while up to 4 other smaller structures may spawn around the periphery";
//     "there are 15 jigsaw blocks that can generate the structures around the tower. Each structure has a 1 in 13
//     chance of being generated, including allay and iron golem cages" -- so a feature pool of six structures at
//     weight 1 and an empty element at 7, drawn at 15 spots, keeping the first four;
//   * "iron golem cages spawn one golem, and allay cages spawn two allays" (the allay cage is the variant whose roof is
//     fenced in);
//   * "A total of eight pillagers, including the pillager captain, spawns in a pillager outpost";
//   * the watchtower's blueprint notes: layer-6 cobblestone stairs face inside and are upside down, and the dark oak
//     slabs on layers 6 and 9 are top slabs; the tower's chest uses the pillager outpost loot table.
//
// Not modelled, and why: the ominous banner's pattern (a plain white wall banner stands in for it -- the game has no
// banner patterns); the 15 jigsaw spots' exact positions (the blueprints omit jigsaws, so the spots are spaced evenly
// round the tower); MC-139711's eight trench holes (a bug); the pillager captain's banner (no captain variant exists
// in the mob code yet, the spawn request carries `patrolLeader`).

import { StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces } from '../jigsaw.js';
import { StructureTemplate } from '../template.js';
import { placeTemplate } from '../templatePlacement.js';
import { createBlockIdResolver } from '../blockIds.js';
import { STRUCTURE_BLUEPRINTS } from './structureBlueprintData.js';

export const OUTPOST_POOLS = { tower: 'pillager_outpost/watchtower', features: 'pillager_outpost/features' };
const FEATURE_SLOT = 'pillager_outpost/feature';
/** The wiki: 15 jigsaw spots, each structure 1 in 13, at most 4 smaller structures. */
export const FEATURE_SPOTS = 15;
export const FEATURE_ODDS = 13;
export const MAX_FEATURES = 4;
export const OUTPOST_PILLAGERS = 8;
export const OUTPOST_CHEST_LOOT = 'minecraft:chests/pillager_outpost';
/** Empty ground kept round the tower so the features stand on the periphery, not against its walls. */
const MARGIN = 6;

export const FEATURES = {
  feature_cage: { mobs: [['iron_golem', 1]] },
  feature_cage_allay: { mobs: [['allay', 2]] },
  feature_logs: {},
  feature_targets: {},
  feature_tent1: {},
  feature_tent2: {}
};
/** Kept for callers that list the parts. */
export const BASE_PLATE_CONNECTORS = FEATURE_SPOTS;

function canvas() {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map([['minecraft:air{}', 0]]);
  const state = (name, props = null) => {
    const key = name + JSON.stringify(props ?? {});
    if (!index.has(key)) { index.set(key, palette.length); palette.push(props ? { Name: name, Properties: props } : { Name: name }); }
    return index.get(key);
  };
  return { palette, state, blocks: [], entities: [] };
}
const jigsaw = (c, x, y, z, front, pool) => c.blocks.push({
  pos: [x, y, z], state: c.state('minecraft:jigsaw', { orientation: front + '_up' }),
  nbt: { name: FEATURE_SLOT, pool, orientation: front + '_up', joint: 'rigid', target: 'minecraft:empty', final_state: 'minecraft:structure_void' }
});
const cellsOf = (bp) => bp.blocks.split(';').map((r) => r.split(',').map(Number)).map(([x, y, z, p]) => ({ x, y, z, entry: bp.palette[p] }));

/** The watchtower inside its margin, with the 15 feature connectors on the margin's edge facing outward. */
function buildWatchtower() {
  const bp = STRUCTURE_BLUEPRINTS['pillager_outpost/watchtower'];
  const [w, h, d] = bp.size;
  const c = canvas();
  const size = [w + 2 * MARGIN, h, d + 2 * MARGIN];
  const cx = (w - 1) / 2; const cz = (d - 1) / 2;
  for (const cell of cellsOf(bp)) {
    let name = cell.entry.Name;
    let props = cell.entry.Properties ?? null;
    const layer = cell.y + bp.minLayer;
    if (name === 'minecraft:ominous_wall_banner') name = 'minecraft:white_wall_banner';
    if (name === 'minecraft:cobblestone_stairs' && layer === 6) {
      // "Layer 6 - Cobblestone stair face inside and upside down."
      const dx = cx - cell.x; const dz = cz - cell.z;
      const facing = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'south' : 'north');
      props = { facing, half: 'top' };
    }
    if (/_slab$/.test(name) && (layer === 6 || layer === 9)) props = { type: 'top' }; // "Slabs = top"
    const pos = [cell.x + MARGIN, cell.y, cell.z + MARGIN];
    if (name === 'minecraft:chest') c.blocks.push({ pos, state: c.state(name, props), nbt: { id: 'minecraft:chest', LootTable: OUTPOST_CHEST_LOOT } });
    else c.blocks.push({ pos, state: c.state(name, props) });
  }
  // Eight pillagers, one of them the captain, on the tower's floors: top platform first, then down.
  const occupied = new Set(c.blocks.map((b) => b.pos.join(',')));
  const solid = (x, y, z) => occupied.has(`${x},${y},${z}`);
  const spots = [];
  for (let y = h - 1; y >= 1 && spots.length < OUTPOST_PILLAGERS * 3; y--) {
    for (let z = MARGIN; z < MARGIN + d; z++) for (let x = MARGIN; x < MARGIN + w; x++) {
      if (solid(x, y - 1, z) && !solid(x, y, z) && !solid(x, y + 1, z)) spots.push([x, y, z]);
    }
  }
  const step = Math.max(1, Math.floor(spots.length / OUTPOST_PILLAGERS));
  for (let i = 0; i < OUTPOST_PILLAGERS && i * step < spots.length; i++) {
    c.entities.push({ pos: spots[i * step], nbt: { type: 'pillager', ...(i === 0 ? { patrolLeader: true } : {}) } });
  }
  // 15 feature spots on the margin's edge: four on three sides, three on the fourth.
  const perSide = [4, 4, 4, 3];
  const sides = [
    (t) => [Math.round(t * (size[0] - 1)), 0, 'north'],
    (t) => [size[0] - 1, Math.round(t * (size[2] - 1)), 'east'],
    (t) => [Math.round((1 - t) * (size[0] - 1)), size[2] - 1, 'south'],
    (t) => [0, Math.round((1 - t) * (size[2] - 1)), 'west']
  ];
  sides.forEach((side, s) => {
    for (let i = 0; i < perSide[s]; i++) {
      const [x, z, front] = side((i + 1) / (perSide[s] + 1));
      const [jx, jz] = front === 'north' ? [x, 0] : front === 'south' ? [x, size[2] - 1] : front === 'west' ? [0, z] : [size[0] - 1, z];
      jigsaw(c, jx, 0, jz, front, OUTPOST_POOLS.features);
    }
  });
  return { size, palette: c.palette, blocks: c.blocks, entities: c.entities };
}

/** A feature, one row longer in front for its connector (facing north, back toward the tower). */
function buildFeature(key) {
  const bp = STRUCTURE_BLUEPRINTS[`pillager_outpost/${key}`];
  const [w, h, d] = bp.size;
  const c = canvas();
  for (const cell of cellsOf(bp)) c.blocks.push({ pos: [cell.x, cell.y, cell.z + 1], state: c.state(cell.entry.Name, cell.entry.Properties ?? null) });
  for (const [type, n] of FEATURES[key].mobs ?? []) {
    for (let i = 0; i < n; i++) c.entities.push({ pos: [Math.floor(w / 2) - (i % 2), 0, 1 + Math.floor(d / 2)], nbt: { type } });
  }
  jigsaw(c, Math.floor(w / 2), 0, 0, 'north', null);
  return { size: [w, h, d + 1], palette: c.palette, blocks: c.blocks, entities: c.entities };
}

const TEMPLATES = new Map();
function templateFor(name) {
  if (!TEMPLATES.has(name)) TEMPLATES.set(name, new StructureTemplate(name === 'watchtower' ? buildWatchtower() : buildFeature(name), `minecraft:pillager_outpost/${name}`));
  return TEMPLATES.get(name);
}

/** The template data of a part (for tests and the Inspector). */
export function buildOutpostPart(part) {
  if (part === 'watchtower') return buildWatchtower();
  if (FEATURES[part]) return buildFeature(part);
  throw new Error(`unknown pillager outpost part "${part}"`);
}

export function createOutpostPools() {
  const pools = new TemplatePoolRegistry();
  const element = (name, weight) => new PoolElement({
    name, weight,
    build: () => ({
      connectors: templateFor(name).blocks.filter((b) => b.nbt && Object.prototype.hasOwnProperty.call(b.nbt, 'pool')).map((b) => ({
        name: b.nbt.name, pool: b.nbt.pool, orientation: b.nbt.orientation, joint: b.nbt.joint, finalState: b.nbt.final_state,
        local: { x: b.pos[0], y: b.pos[1], z: b.pos[2] }
      }))
    })
  });
  pools.register(new TemplatePool({ id: OUTPOST_POOLS.tower, elements: [element('watchtower', 1)] }));
  const features = Object.keys(FEATURES).map((name) => element(name, 1));
  pools.register(new TemplatePool({
    id: OUTPOST_POOLS.features,
    elements: [...features, new PoolElement({ type: 'minecraft:empty_pool_element', name: 'empty', weight: FEATURE_ODDS - features.length })]
  }));
  return pools;
}

function buildJigsawPiece(element, rotation, mirror, at) {
  const template = templateFor(element.name);
  const box = template.boundingBox(at, rotation, mirror);
  const connectors = template.jigsaws(rotation, mirror).map((j) => ({
    name: j.name, pool: j.pool, orientation: j.orientation, joint: j.joint, finalState: j.finalState,
    position: { x: at.x + j.local.x, y: at.y + j.local.y, z: at.z + j.local.z }
  }));
  return { box, connectors };
}

export function generatePillagerOutpost({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16;
  const originZ = chunkZ * 16;
  const tower = STRUCTURE_BLUEPRINTS['pillager_outpost/watchtower'];
  const centreX = originX + MARGIN + Math.floor(tower.size[0] / 2);
  const centreZ = originZ + MARGIN + Math.floor(tower.size[2] / 2);
  const surface = context.surfaceY ? context.surfaceY(centreX, centreZ, 'world_surface_wg') : 70;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const pools = createOutpostPools();
  const result = addPieces({
    random, startPool: pools.resolve(OUTPOST_POOLS.tower), pools, buildPiece: buildJigsawPiece,
    maxDepth: 1, origin: { x: originX, y: surface, z: originZ }, maxDistanceFromCentre: 80
  });
  // "up to 4 other smaller structures": the first four drawn stand, the rest are dropped.
  const pieces = result.pieces.filter((piece, i) => i === 0 || result.pieces.slice(1, i).length < MAX_FEATURES);
  const start = new StructureStart({
    structureId: 'pillager_outpost', chunkX, chunkZ, pieces,
    biome: context.biomeAt ? context.biomeAt(centreX, centreZ) : null, seed
  });
  start.meta = {
    pieces: pieces.length, diagnostics: result.diagnostics, connected: true, surface,
    partMix: pieces.map((piece) => piece.meta.element), features: pieces.length - 1
  };
  return start;
}

export function realizePillagerOutpost(start, setBlock, blockIds, { spawnMob = null, clip = null } = {}) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const missingBlocks = new Set();
  const spawned = [];
  let written = 0;
  for (const piece of start.pieces) {
    const part = piece.meta.element;
    if (clip && !piece.box.intersects(clip)) continue;
    const template = templateFor(part);
    const origin = { x: piece.box.minX, y: piece.box.minY, z: piece.box.minZ };
    const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(piece.index) * 2654435761n);
    const placement = placeTemplate({
      template, origin, rotation: piece.rotation, mirror: piece.mirror,
      processors: { processors: [{ processor_type: 'minecraft:jigsaw_replacement' }] }, random, world: null
    });
    for (const block of placement.blocks) {
      const id = resolver.resolveState(block.state);
      if (id === null) { missingBlocks.add(block.state.name); continue; }
      if (setBlock(block.x, block.y, block.z, id, { state: block.state, ...(block.nbt?.LootTable ? { lootTable: block.nbt.LootTable } : {}) })) written++;
    }
    for (const entity of template.entitiesTransformed(piece.rotation, piece.mirror)) {
      const type = entity.nbt?.type;
      if (!type) continue;
      const x = origin.x + entity.local.x; const y = origin.y + entity.local.y; const z = origin.z + entity.local.z;
      if (clip && !clip.contains(x, y, z)) continue;
      const options = { persistent: true, ...(entity.nbt.patrolLeader ? { patrolLeader: true } : {}) };
      spawned.push({ type, x, y, z, options });
      if (spawnMob) spawnMob(type, x + 0.5, y, z + 0.5, options);
    }
  }
  return {
    written, pieces: start.pieces.length, spawned, spawns: spawned, missingBlocks: [...missingBlocks].sort(),
    note: "the wiki's blueprints of the watchtower and its five features, joined on the jigsaw engine"
  };
}
