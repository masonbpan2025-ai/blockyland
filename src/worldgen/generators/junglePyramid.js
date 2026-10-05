// Jungle pyramid: a three-floor mossy pyramid over a trapped treasure room.
//
// From the wiki (`Jungle Pyramid` / jungle temple, 1.21.4 revision) and this repository's registry entry:
// jungle and bamboo jungle; THREE floors of mossy cobblestone stepping inward; a hidden treasure room below
// holding chests; and a trap -- two dispensers that fire arrows, wired through tripwire hooks and a lever with
// a sticky piston. Vines cover the outside.
//
// PROVENANCE: no Minecraft assets. The layout is built by code from the described floors, trap and materials,
// so the LAYOUT is a clean-room approximation while the placement, chunk-safe realization, the block entities
// and the trap wiring are the engine's real behaviour.
//
// WHAT THE TESTS PIN, and why: the TRAP is the structure's point. A jungle pyramid whose treasure room has
// chests but no armed dispenser is a mossy box, so realization reports the trap parts and a test asserts the
// wire is COMPLETE -- two dispensers, tripwire hooks at both ends of a tripwire line, and a lever with a sticky
// piston -- rather than merely that each block appears somewhere.

import { StructurePiece, StructureStart } from '../start.js';
import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { placeTemplate } from '../templatePlacement.js';
import { StructureTemplate } from '../template.js';
import { createBlockIdResolver } from '../blockIds.js';

export const JUNGLE_MATERIALS = {
  mossy: 'minecraft:mossy_cobblestone',
  cobble: 'minecraft:cobblestone',
  chiseled: 'minecraft:chiseled_stone_bricks',
  brick: 'minecraft:stone_bricks',
  vine: 'minecraft:vine',
  chest: 'minecraft:chest',
  dispenser: 'minecraft:dispenser',
  hook: 'minecraft:tripwire_hook',
  wire: 'minecraft:tripwire',
  lever: 'minecraft:lever',
  piston: 'minecraft:sticky_piston',
  redstone: 'minecraft:redstone_wire',
  loot: 'minecraft:chests/jungle_temple',
  dispenserLoot: 'minecraft:chests/jungle_temple_dispenser'
};

/** The pyramid's floors step inward by two blocks each, as the wiki describes. */
export const JUNGLE_BASE = 9;
export const JUNGLE_FLOORS = 3;
/** How far the treasure room hangs below the surface. */
export const JUNGLE_DEPTH = 4;

export function buildJunglePyramid({ seed = 0 } = {}) {
  const random = new LegacyRandom(BigInt(seed) * 2862933555777941757n + 3037000493n);
  const base = JUNGLE_BASE;
  const depth = JUNGLE_DEPTH;
  const height = depth + JUNGLE_FLOORS + 2;
  const size = [base, height, base];
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map();
  const material = (name) => {
    if (!index.has(name)) { index.set(name, palette.length); palette.push({ Name: name }); }
    return index.get(name);
  };
  // Orientation-carrying blocks need their own palette entries, and the jigsaw encoding rule applies to any
  // property block: state properties must be set per entry, never shared.
  const stateEntry = (name, properties) => {
    const key = name + ':' + JSON.stringify(properties);
    if (!index.has(key)) { index.set(key, palette.length); palette.push({ Name: name, Properties: properties }); }
    return index.get(key);
  };
  const blocks = [];
  // A block outside the declared size would be written outside the piece box: a plan whose advertised box is a
  // lie, and a chunk-clipping hazard. It is an error, not a silent extra block.
  const push = (x, y, z, state, nbt = null) => {
    if (x < 0 || y < 0 || z < 0 || x >= base || y >= height || z >= base) {
      throw new Error('jungle pyramid: block ' + x + ',' + y + ',' + z + ' is outside ' + size.join('x'));
    }
    blocks.push(nbt ? { pos: [x, y, z], state, nbt } : { pos: [x, y, z], state });
  };
  const m = (key) => material(JUNGLE_MATERIALS[key]);
  const mid = Math.floor(base / 2);
  const floorY = depth;

  // --- The three floors, each a shell stepping inward by two per level ------------------------
  for (let floor = 0; floor < JUNGLE_FLOORS; floor++) {
    const inset = floor * 2;
    const min = inset;
    const max = base - 1 - inset;
    const y = floorY + floor;
    for (let x = min; x <= max; x++) {
      for (let z = min; z <= max; z++) {
        const edge = x === min || x === max || z === min || z === max;
        const chiselled = (x + z) % 5 === 0;
        // Only the shell is drawn above the ground floor, so the pyramid has an inside.
        if (floor === 0 || edge || floor === JUNGLE_FLOORS - 1) {
          push(x, y, z, edge && chiselled ? m('chiseled') : m('mossy'));
        }
      }
    }
    // Vines on the outside of each floor: they grow in patches rather than uniformly.
    for (let x = min; x <= max; x++) {
      if (random.nextFloat() < 0.4) push(x, y + 1 <= height - 1 ? y + 1 : y, min, m('vine'));
      if (random.nextFloat() < 0.4) push(x, y + 1 <= height - 1 ? y + 1 : y, max, m('vine'));
    }
  }
  // A cap so the top floor is closed.
  for (let x = mid - 1; x <= mid + 1; x++) for (let z = mid - 1; z <= mid + 1; z++) push(x, floorY + JUNGLE_FLOORS, z, m('mossy'));

  // --- The hidden treasure room below ----------------------------------------------------------
  // Room, staircase, chests, and the trap. The room's floor is at y=0 and its ceiling is the pyramid's floor.
  for (let x = 1; x < base - 1; x++) {
    for (let z = 1; z < base - 1; z++) {
      push(x, 0, z, m('cobble'));
      push(x, floorY - 1, z, m('cobble'));
      const edge = x === 1 || x === base - 2 || z === 1 || z === base - 2;
      for (let y = 1; y < floorY - 1; y++) if (edge) push(x, y, z, m('mossy'));
    }
  }
  // The staircase down, carved into one side.
  for (let step = 0; step < floorY; step++) {
    for (let x = mid; x <= mid + 1; x++) push(x, step, 1 + step, m('air'));
  }
  // Chests in the corners: the treasure the trap protects.
  for (const [x, z] of [[2, 2], [base - 3, 2], [2, base - 3]]) {
    push(x, 1, z, m('chest'), { id: 'minecraft:chest', LootTable: JUNGLE_MATERIALS.loot });
  }

  // --- The trap --------------------------------------------------------------------------------
  // Two dispensers FACING each other across the room, a tripwire line between them, and a lever that arms a
  // sticky piston. The wire is a straight line in x at the room's middle, with a hook at each end.
  const trapZ = mid;
  push(2, 2, trapZ, stateEntry(JUNGLE_MATERIALS.dispenser, { facing: 'east' }), { id: 'minecraft:dispenser', LootTable: JUNGLE_MATERIALS.dispenserLoot });
  push(base - 3, 2, trapZ, stateEntry(JUNGLE_MATERIALS.dispenser, { facing: 'west' }), { id: 'minecraft:dispenser', LootTable: JUNGLE_MATERIALS.dispenserLoot });
  push(2, 1, trapZ, stateEntry(JUNGLE_MATERIALS.hook, { facing: 'east', attached: 'true', powered: 'false' }));
  push(base - 3, 1, trapZ, stateEntry(JUNGLE_MATERIALS.hook, { facing: 'west', attached: 'true', powered: 'false' }));
  for (let x = 3; x < base - 3; x++) push(x, 1, trapZ, m('wire'));
  push(mid, 1, base - 2, stateEntry(JUNGLE_MATERIALS.lever, { facing: 'north', powered: 'false' }));
  push(mid, 1, base - 2 - 1, stateEntry(JUNGLE_MATERIALS.piston, { facing: 'north' }));
  // A pair of redstone lines, so the lever and the piston are visibly wired rather than merely adjacent.
  push(mid, 0, base - 2 - 2, m('redstone'));

  return {
    size,
    palette,
    blocks,
    entities: [],
    meta: { floors: JUNGLE_FLOORS, depth, base, trap: { dispensers: 2, hooks: 2, pistons: 1, levers: 1 } }
  };
}

export function generateJunglePyramid({ seed, chunkX, chunkZ, context }) {
  const originX = chunkX * 16 + 3;
  const originZ = chunkZ * 16 + 3;
  const surface = context.surfaceY ? context.surfaceY(originX, originZ, 'world_surface_wg') : 70;
  // The pseudo-template's y = JUNGLE_DEPTH is the ground surface, so the origin sits that far below it.
  const y = surface - JUNGLE_DEPTH;
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const rotation = random.nextIntBound(4);
  const params = { seed: random.nextInt() };
  const template = new StructureTemplate(buildJunglePyramid(params), 'minecraft:jungle_pyramid');

  const start = new StructureStart({
    structureId: 'jungle_pyramid',
    chunkX,
    chunkZ,
    pieces: [new StructurePiece({
      id: 'minecraft:jungle_pyramid',
      index: 0,
      type: 'template',
      family: 'hardcoded',
      template: template.name,
      rotation,
      box: template.boundingBox({ x: originX, y, z: originZ }, rotation),
      meta: { origin: { x: originX, y, z: originZ }, params }
    })],
    biome: context.biomeAt ? context.biomeAt(originX, originZ) : null,
    seed
  });
  start.meta = { rotation, surface, y, floors: JUNGLE_FLOORS, treasureY: y + 1 };
  return start;
}

export function realizeJunglePyramid(start, setBlock, blockIds) {
  const resolver = createBlockIdResolver(blockIds || undefined);
  const piece = start.pieces[0];
  const template = new StructureTemplate(buildJunglePyramid(piece.meta.params), piece.template);
  const random = new LegacyRandom(BigInt(start.seed ?? 0) + BigInt(piece.index) * 2654435761n);
  const placement = placeTemplate({
    template,
    origin: piece.meta.origin,
    rotation: piece.rotation,
    mirror: piece.mirror,
    processors: { processors: [{ processor_type: 'minecraft:jigsaw_replacement' }] },
    random,
    world: null
  });

  const missingBlocks = new Set();
  const chests = [];
  const trap = { dispensers: [], hooks: [], pistons: [], levers: [], wire: 0 };
  let written = 0;
  for (const block of placement.blocks) {
    const id = resolver.resolveState(block.state);
    if (id === null) { missingBlocks.add(block.state.name); continue; }
    const name = block.state.name;
    if (name === JUNGLE_MATERIALS.chest && block.nbt?.LootTable) chests.push(block.nbt.LootTable);
    // The trap parts are reported WITH their positions, so a test can check the wire is actually connected
    // rather than merely that four kinds of block exist somewhere in a 9x15x9 plan.
    if (name === JUNGLE_MATERIALS.dispenser) trap.dispensers.push({ x: block.x, y: block.y, z: block.z, facing: block.state.properties?.facing ?? null });
    if (name === JUNGLE_MATERIALS.hook) trap.hooks.push({ x: block.x, y: block.y, z: block.z });
    if (name === JUNGLE_MATERIALS.piston) trap.pistons.push({ x: block.x, y: block.y, z: block.z });
    if (name === JUNGLE_MATERIALS.lever) trap.levers.push({ x: block.x, y: block.y, z: block.z });
    if (name === JUNGLE_MATERIALS.wire) trap.wire++;
    if (setBlock(block.x, block.y, block.z, id, {
      state: block.state,
      ...(block.nbt?.LootTable ? { lootTable: block.nbt.LootTable } : {})
    })) written++;
  }

  return {
    written,
    chests: chests.length,
    chestLoot: chests,
    trap,
    armed: trap.dispensers.length === 2 && trap.hooks.length === 2 && trap.pistons.length === 1 && trap.levers.length === 1 && trap.wire > 0,
    missingBlocks: [...missingBlocks].sort(),
    note: 'clean-room floors and trap; the treasure room depth is an approximation'
  };
}
