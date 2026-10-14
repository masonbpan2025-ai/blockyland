// The End's fixed features, from the wiki: End spikes (https://minecraft.wiki/w/End_Spike), the exit portal
// (https://minecraft.wiki/w/Exit_Portal, the End podium), End gateways (https://minecraft.wiki/w/End_Gateway) and
// the End platform (https://minecraft.wiki/w/End_Platform).
//
//   * Spikes: ten obsidian cylinders "in a 43-block radius circle around the exit portal in a random order", at fixed
//     centres; radii 3,3,3,4,4,4,5,5,5,6 ending at Y 76..103 in steps of 3; "a single bedrock block, a fire block, and
//     an End crystal on top of each pillar"; "The second and third shortest pillars include a cage comprised of 73
//     iron bars"; "The bottom of all pillars are at Y level 0". The wiki's obsidian totals (1596 for the first: 21 a
//     layer) give each radius's cross-section: every column with dx^2 + dz^2 <= (r - 1)^2 + 1.
//   * Podium: at 0, 0, "placing the End portal blocks at the y-level of the highest block found at 0,0"; "a 7-block
//     wide bowl-shaped frame of bedrock, and a central pillar of bedrock with a torch on each side"; "16 End stone
//     blocks, one under each outer bedrock block"; inactive while the dragon lives; the dragon egg goes on top.
//   * Gateways: the twenty fixed spots at Y 75, 96 blocks out, one opened each time the dragon is defeated, in an
//     order fixed per world; each 12 bedrock round one gateway block (the /Structure drawing).
//   * Platform: 5 x 5 obsidian "at (100, 48, 0)"; "Whenever a new entity enters the End, the platform is regenerated,
//     and all blocks within 3 blocks above the platform are destroyed"; players arrive at (100, 49, 0) facing west.
//
// This End is 64 blocks tall with its island top near y 32, not 64 (P0.4): heights are mapped by
// y' = 32 + (y - 64) * 0.75 (spikes then end at y 41-61, gateways at y 40, the platform at y 20).

import { LegacyRandom } from '../random.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';
import { BlockBox } from '../geometry.js';

export const remapY = (y) => Math.round(32 + (y - 64) * 0.75);
export const SPIKE_CENTRES = [[-42, -1], [-34, -25], [-34, 24], [-13, -40], [-13, 39], [12, -40], [12, 39], [33, -25], [33, 24], [42, 0]];
export const SPIKE_SIZES = [[3, 76], [3, 79], [3, 82], [4, 85], [4, 88], [4, 91], [5, 94], [5, 97], [5, 100], [6, 103]];
export const GATEWAY_SPOTS = [[96, 0], [91, 29], [77, 56], [56, 77], [29, 91], [-1, 96], [-30, 91], [-57, 77], [-78, 56], [-92, 29], [-96, -1], [-92, -30], [-78, -57], [-57, -78], [-30, -92], [0, -96], [29, -92], [56, -78], [77, -57], [91, -30]];
export const GATEWAY_Y = remapY(75);
export const PLATFORM = { x: 100, y: remapY(48), z: 0 };

/** The ten spikes for a world: the heights shuffled over the fixed centres. */
export function endSpikes(seed) {
  const random = new LegacyRandom(BigInt(seed ?? 0) ^ 0x3E5F1Dn);
  const order = SPIKE_SIZES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = random.nextIntBound(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return SPIKE_CENTRES.map(([x, z], i) => {
    const size = order[i];
    const [radius, vanillaTop] = SPIKE_SIZES[size];
    return { x, z, radius, vanillaTop, top: Math.min(60, remapY(vanillaTop)), caged: size === 1 || size === 2 };
  });
}

/** The columns of a spike of radius r: every dx, dz with dx^2 + dz^2 <= (r - 1)^2 + 1. */
export const spikeColumns = (r) => {
  const out = [];
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= (r - 1) * (r - 1) + 1) out.push([dx, dz]);
  return out;
};

export function buildSpike(canvas, spike) {
  for (const [dx, dz] of spikeColumns(spike.radius)) for (let y = 0; y < spike.top; y++) canvas.set(spike.x + dx, y, spike.z + dz, 'obsidian');
  canvas.set(spike.x, spike.top, spike.z, 'bedrock');
  canvas.set(spike.x, spike.top + 1, spike.z, 'fire');
  if (spike.caged) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) for (let up = 1; up <= 3; up++) canvas.set(spike.x + dx, spike.top + up, spike.z + dz, 'iron_bars');
      canvas.set(spike.x + dx, spike.top + 4, spike.z + dz, 'iron_bars');
    }
  }
  canvas.entities.push({ type: 'end_crystal', x: spike.x + 0.5, y: spike.top + 1, z: spike.z + 0.5, options: { persistent: true } });
}

/** The podium's top view (the wiki's grid): b bedrock, x portal. */
const PODIUM = ['  bbb  ', ' bxxxb ', 'bxxxxxb', 'bxxbxxb', 'bxxxxxb', ' bxxxb ', '  bbb  '];
export function buildPodium(canvas, y, { active = false, egg = false } = {}) {
  PODIUM.forEach((row, dz) => [...row].forEach((ch, dx) => {
    const x = dx - 3; const z = dz - 3;
    if (ch === ' ') return;
    const centre = x === 0 && z === 0;
    if (ch === 'b' && !centre) { canvas.set(x, y, z, 'bedrock'); canvas.set(x, y - 1, z, 'end_stone'); }
    if (ch === 'x') { canvas.set(x, y, z, active ? 'end_portal' : 'air'); canvas.set(x, y - 1, z, 'bedrock'); }
  }));
  for (let up = -1; up <= 3; up++) canvas.set(0, y + up, 0, 'bedrock');
  for (const [dx, dz, facing] of [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north']]) canvas.set(dx, y + 2, dz, 'wall_torch', { facing });
  if (egg) canvas.set(0, y + 4, 0, 'dragon_egg');
}

/** The /Structure drawing: 12 bedrock round one gateway block. */
export function buildGateway(canvas, x, y, z) {
  canvas.set(x, y - 2, z, 'bedrock'); canvas.set(x, y + 2, z, 'bedrock');
  for (const dy of [-1, 1]) { canvas.set(x, y + dy, z, 'bedrock'); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) canvas.set(x + dx, y + dy, z + dz, 'bedrock'); }
  canvas.set(x, y, z, 'end_gateway');
}

/** The order the twenty gateways open in, fixed per world. */
export function gatewayOrder(seed) {
  const random = new LegacyRandom(BigInt(seed ?? 0) ^ 0x6A7E5An);
  const order = GATEWAY_SPOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = random.nextIntBound(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order.map((i) => ({ x: GATEWAY_SPOTS[i][0], y: GATEWAY_Y, z: GATEWAY_SPOTS[i][1] }));
}

export function buildPlatform(canvas) {
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    canvas.set(PLATFORM.x + dx, PLATFORM.y, PLATFORM.z + dz, 'obsidian');
    for (let up = 1; up <= 3; up++) canvas.set(PLATFORM.x + dx, PLATFORM.y + up, PLATFORM.z + dz, 'air');
  }
}

/** Regenerate the platform in a live world (an entity entering the End). */
export function regenerateEndPlatform(world, blocks) {
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    world.setVoxel(PLATFORM.x + dx, PLATFORM.y, PLATFORM.z + dz, blocks.OBSIDIAN);
    for (let up = 1; up <= 3; up++) world.setVoxel(PLATFORM.x + dx, PLATFORM.y + up, PLATFORM.z + dz, blocks.AIR);
  }
  return { x: PLATFORM.x + 0.5, y: PLATFORM.y + 1, z: PLATFORM.z + 0.5, yaw: Math.PI / 2 };
}

// --- Generators: each lives in one chunk and is planned there --------------------------------------------------

function single({ structureId, chunkX, chunkZ, seed, context, at, build, meta }) {
  if (chunkX !== Math.floor(at[0] / 16) || chunkZ !== Math.floor(at[1] / 16)) return null;
  const canvas = new CellCanvas();
  const pieces = build(canvas);
  return cellStart({ structureId, chunkX, chunkZ, seed, id: `minecraft:${structureId}`, pieces, canvas, biome: context.biomeAt?.(at[0], at[1]) ?? null, meta: meta ?? {} });
}

export function generateEndSpikes({ seed, chunkX, chunkZ, structureId, context }) {
  return single({
    structureId, chunkX, chunkZ, seed, context, at: [0, 0],
    build: (canvas) => endSpikes(seed).map((s) => { buildSpike(canvas, s); return { box: boxOf(canvas, s), kind: s.caged ? 'caged_spike' : 'spike' }; }),
    meta: { spikes: endSpikes(seed) }
  });
}
export function generatePodium({ seed, chunkX, chunkZ, structureId, context }) {
  const ground = context.surfaceY ? context.surfaceY(0, 0) : 32;
  return single({
    structureId, chunkX, chunkZ, seed, context, at: [0, 0],
    build: (canvas) => { buildPodium(canvas, ground + 1); return [{ box: canvas.box(), kind: 'podium' }]; },
    meta: { portalY: ground + 1, active: false }
  });
}
export function generatePlatform({ seed, chunkX, chunkZ, structureId, context }) {
  return single({ structureId, chunkX, chunkZ, seed, context, at: [PLATFORM.x, PLATFORM.z], build: (canvas) => { buildPlatform(canvas); return [{ box: canvas.box(), kind: 'platform' }]; }, meta: { platform: PLATFORM } });
}
function boxOf(canvas, s) {
  const r = s.radius;
  return new BlockBox(s.x - r, 0, s.z - r, s.x + r, s.caged ? s.top + 4 : s.top + 1, s.z + r);
}

export const realizeEndFeature = (start, setBlock, blockIds, options = {}) => realizeCells(start, setBlock, blockIds, options);
