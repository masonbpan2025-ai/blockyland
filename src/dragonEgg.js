// The dragon egg's teleport.
//
// `BLOCK_DEFS[BLOCKS.DRAGON_EGG]` declares `dragonEgg: true` and nothing anywhere in `src/` reads that flag,
// so the egg sat where the dragon died and could be mined like any other block. Vanilla's egg is the one
// block in the game that teleports when you hit it, which is what makes it awkward to collect rather than
// merely rare.
//
// Vanilla's algorithm: up to 1000 attempts, each drawing an offset as the difference of two random draws --
// `nextInt(16) - nextInt(16)` -- which biases the result toward the centre rather than spreading it evenly
// across the range. The first position that is a valid empty spot with something solid under it wins, and the
// egg plays a teleport sound. If every attempt fails the egg stays put.

/** Vanilla tries this many positions before giving up and leaving the egg where it is. */
export const DRAGON_EGG_ATTEMPTS = 1000;

/**
 * Choose where a struck dragon egg teleports to.
 *
 * `isValid` is injected so the choice can be tested without a world, and so the caller decides what "valid"
 * means -- this module only knows vanilla's shape for the search.
 *
 * @param {{origin:{x:number,y:number,z:number}, random?:() => number, isValid:(x:number,y:number,z:number)=>boolean,
 *   attempts?:number}} options
 * @returns {{x:number,y:number,z:number}|null} null when no position was found, so the egg stays
 */
export function dragonEggDestination({ origin, random = Math.random, isValid, attempts = DRAGON_EGG_ATTEMPTS }) {
  if (!origin || typeof isValid !== 'function') return null;
  const draw = (span) => Math.floor(random() * span) - Math.floor(random() * span);
  for (let i = 0; i < Math.max(0, Math.floor(attempts)); i++) {
    // The difference of two draws, not a single draw over the range: vanilla's shape, and it is what makes
    // the egg usually land close by rather than at the edge of the search box.
    const x = Math.floor(origin.x) + draw(16);
    const y = Math.floor(origin.y) + draw(8);
    const z = Math.floor(origin.z) + draw(16);
    if (isValid(x, y, z)) return { x, y, z };
  }
  return null;
}

/**
 * Is this a spot the egg can move to?
 *
 * Exposed because the caller has the world and this is the only world-shaped question involved. A spot is
 * valid when it is empty and the block beneath it is solid, which is what stops the egg landing mid-air.
 *
 * @param {(x:number,y:number,z:number)=>number} getVoxel
 * @param {number} air the block id of air
 * @param {boolean} isSolid
 */
export function makeEggPlacementCheck(getVoxel, air, isSolid) {
  return (x, y, z) => {
    if (typeof getVoxel !== 'function') return false;
    if (getVoxel(x, y, z) !== air) return false;
    return !!isSolid(getVoxel(x, y - 1, z));
  };
}
