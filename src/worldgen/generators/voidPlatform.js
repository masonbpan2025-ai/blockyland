// The void start platform, from the wiki (https://minecraft.wiki/w/Void_Start_Platform).
//
// "The void start platform spawns from block positions (-8, -61, -8) to (24, -61, 24)"; "33x33 platforms, consisting
// largely of stone, with a lone cobblestone block in the center". It sits at y 30 here, the level this game's "The
// Void" world has always used for its spawn (the world is 64 tall; -61 is three above vanilla's floor).

import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';

export const VOID_PLATFORM = { min: -8, max: 24, y: 30 };

export function generateVoidPlatform({ seed, chunkX, chunkZ, structureId, context }) {
  if (chunkX !== 0 || chunkZ !== 0) return null;
  const canvas = new CellCanvas();
  for (let x = VOID_PLATFORM.min; x <= VOID_PLATFORM.max; x++) for (let z = VOID_PLATFORM.min; z <= VOID_PLATFORM.max; z++) {
    canvas.set(x, VOID_PLATFORM.y, z, x === 8 && z === 8 ? 'cobblestone' : 'stone');
  }
  return cellStart({ structureId, chunkX, chunkZ, seed, id: 'minecraft:void_start_platform', pieces: [{ box: canvas.box(), kind: 'platform' }], canvas, biome: context.biomeAt?.(8, 8) ?? null });
}

export const realizeVoidPlatform = (start, setBlock, blockIds, options = {}) => realizeCells(start, setBlock, blockIds, options);
