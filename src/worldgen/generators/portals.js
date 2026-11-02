// The two portals as Structure Inspector entries, so their look and their behaviour can be tried without playing to
// them: a lit Nether portal, and an active End portal in a small portal room.
//
// Neither is a structure Minecraft generates on its own -- a Nether portal is built and lit by a player (or is the
// arrival portal a trip builds), and an End portal is the middle of a stronghold's portal room -- so the registry
// marks them `inspectorOnly` and no world's structure list contains them. Each stands at the origin on the surface.
//   * Nether portal: "When creating a portal, the game always makes a 4x5 frame of obsidian, including corner
//     blocks", 2 x 3 of portal inside (https://minecraft.wiki/w/Nether_portal), on the 2 x 3 obsidian platform a
//     trip makes when it finds no site.
//   * End portal: twelve End portal frames, each with its Eye of Ender, round a 3 x 3 of End portal
//     (https://minecraft.wiki/w/End_portal), on a stone brick floor with the room's stairs up to it.
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';

export const PORTAL_STRUCTURES = ['nether_portal', 'end_portal'];

function atOrigin({ structureId, chunkX, chunkZ, seed, context, build, meta }) {
  if (chunkX !== 0 || chunkZ !== 0) return null;
  const ground = context.surfaceY ? context.surfaceY(0, 0) : 64;
  const canvas = new CellCanvas();
  build(canvas, ground);
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: `minecraft:${structureId}`,
    pieces: [{ box: canvas.box(), kind: structureId }], canvas, biome: context.biomeAt?.(0, 0) ?? null,
    meta: { ...meta, ground }
  });
}

/** The lit Nether portal: frame columns at x = -1 and 2, portal at x 0..1, y ground+1 .. ground+3, along x. */
export function buildNetherPortal(canvas, ground) {
  for (let h = 0; h <= 1; h++) for (let d = -1; d <= 1; d++) {
    canvas.set(h, ground, d, 'obsidian');
    for (let up = 1; up <= 3; up++) if (d !== 0) canvas.set(h, ground + up, d, 'air');
  }
  for (let h = -1; h <= 2; h++) for (let up = 0; up <= 4; up++) {
    const border = h === -1 || h === 2 || up === 0 || up === 4;
    canvas.set(h, ground + up, 0, border ? 'obsidian' : 'nether_portal', border ? null : { axis: 'x' });
  }
}

/** Twelve filled frames facing in, round a 3x3 of End portal, on a 7x7 stone brick floor with a step up on the south. */
export function buildEndPortal(canvas, ground) {
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    canvas.set(x, ground, z, 'stone_bricks');
    for (let up = 1; up <= 3; up++) canvas.set(x, ground + up, z, 'air');
  }
  const y = ground + 1;
  for (let i = -1; i <= 1; i++) {
    canvas.set(i, y, -2, 'end_portal_frame_filled', { facing: 'south' });
    canvas.set(i, y, 2, 'end_portal_frame_filled', { facing: 'north' });
    canvas.set(-2, y, i, 'end_portal_frame_filled', { facing: 'east' });
    canvas.set(2, y, i, 'end_portal_frame_filled', { facing: 'west' });
  }
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { canvas.set(x, y, z, 'end_portal'); canvas.set(x, ground, z, 'stone_bricks'); }
  // The room's stairs: a step up to the frame on the south side.
  for (let x = -1; x <= 1; x++) canvas.set(x, y, 3, 'stone_brick_stairs', { facing: 'north' });
}

export function generateNetherPortal({ seed, chunkX, chunkZ, structureId, context }) {
  return atOrigin({ structureId, chunkX, chunkZ, seed, context, build: buildNetherPortal, meta: { portal: 'nether', axis: 'x', inside: [[0, 1, 0], [1, 1, 0], [0, 2, 0], [1, 2, 0], [0, 3, 0], [1, 3, 0]] } });
}

export function generateEndPortal({ seed, chunkX, chunkZ, structureId, context }) {
  return atOrigin({ structureId, chunkX, chunkZ, seed, context, build: buildEndPortal, meta: { portal: 'end' } });
}

export const realizePortal = (start, setBlock, blockIds, options = {}) => realizeCells(start, setBlock, blockIds, options);
