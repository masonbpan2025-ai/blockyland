// The End portal: the frame ring, the eyes, activation, and the trip both ways.
//
// The route to the End did not exist. `END_PORTAL_FRAME` was not a block at all, `ender_eye` had **zero**
// references anywhere in `src/` outside the registry, and the `endPortal: true` flag on the portal block was
// read by nothing -- so a player could brew the eye, hold it, and do nothing with it. The dragon arena, the
// End dimension and the exit portal all existed already; only the way in was missing.
//
// Vanilla's layout is a 5x5 footprint whose border carries 12 frames and whose four corners are empty, with
// a 3x3 interior that becomes the portal:
//
//     . F F F .
//     F . . . F
//     F . . . F
//     F . . . F
//     . F F F .
//
// The border is 16 cells and the four corners are omitted, which is where the twelve comes from.
import { PLATFORM } from './worldgen/generators/endFeatures.js';
import { BLOCKS } from './blocks.js';

/** Frames in a complete ring. Vanilla's figure, and the one the layout above produces. */
export const END_PORTAL_FRAMES = 12;

/** The interior is 3x3. */
export const END_PORTAL_INTERIOR = 3;

/** How far above the frame level the portal's own blocks sit. Vanilla fills the frame's layer. */
export const END_PORTAL_Y_OFFSET = 0;

/**
 * The twelve frame positions, as offsets from the centre of the 5x5 footprint.
 *
 * Derived from the rule rather than typed out, so a change to the shape cannot leave a stale list behind.
 *
 * @returns {Array<{dx:number,dz:number}>}
 */
export function frameRingOffsets() {
  const out = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const onBorder = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      const isCorner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      if (onBorder && !isCorner) out.push({ dx, dz });
    }
  }
  return out;
}

/** The nine interior positions, as offsets from the centre. */
export function interiorOffsets() {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) out.push({ dx, dz });
  }
  return out;
}

/**
 * Is this block a frame, in either state?
 *
 * `END_PORTAL_FRAME_FILLED` may not exist if the content was generated before this feature landed, so both
 * ids are resolved defensively rather than assumed.
 */
export function isFrame(blockId) {
  return blockId === BLOCKS.END_PORTAL_FRAME || blockId === BLOCKS.END_PORTAL_FRAME_FILLED;
}

/** Is this frame already holding an eye? */
export function isFilledFrame(blockId) {
  return blockId === BLOCKS.END_PORTAL_FRAME_FILLED;
}

/** Is this the portal block itself? */
export function isEndPortal(blockId) {
  return blockId === BLOCKS.END_PORTAL;
}

/**
 * Put an eye into a frame.
 *
 * @returns {boolean} true when an eye was placed, false when there was nothing to fill
 */
export function insertEye(world, x, y, z) {
  if (!world?.getVoxel || !world?.setVoxel) return false;
  if (world.getVoxel(x, y, z) !== BLOCKS.END_PORTAL_FRAME) return false;
  world.setVoxel(x, y, z, BLOCKS.END_PORTAL_FRAME_FILLED);
  return true;
}

/**
 * Is the frame ring complete and every frame filled?
 *
 * A missing frame or an empty one both count as incomplete, which is what makes the portal need all twelve
 * eyes rather than any twelve blocks.
 *
 * @param {object} world
 * @param {number} cx centre of the 5x5 footprint
 * @param {number} cy the frame's own layer
 * @param {number} cz
 */
export function isRingComplete(world, cx, cy, cz) {
  if (!world?.getVoxel) return false;
  return frameRingOffsets().every(({ dx, dz }) =>
    isFilledFrame(world.getVoxel(cx + dx, cy + END_PORTAL_Y_OFFSET, cz + dz)));
}

/** How many of the twelve frames are filled, for a progress reading. */
export function eyesInRing(world, cx, cy, cz) {
  if (!world?.getVoxel) return 0;
  return frameRingOffsets().filter(({ dx, dz }) =>
    isFilledFrame(world.getVoxel(cx + dx, cy + END_PORTAL_Y_OFFSET, cz + dz))).length;
}

/**
 * Fill the interior with portal blocks, if the ring is complete.
 *
 * @returns {boolean} true when the portal was created
 */
export function activateEndPortal(world, cx, cy, cz) {
  if (!world?.setVoxel) return false;
  if (!isRingComplete(world, cx, cy, cz)) return false;
  for (const { dx, dz } of interiorOffsets()) {
    world.setVoxel(cx + dx, cy + END_PORTAL_Y_OFFSET, cz + dz, BLOCKS.END_PORTAL);
  }
  return true;
}

/**
 * Is the player standing in an End portal block?
 *
 * Mirrors the Nether portal's check: the feet, the eye level, and a small radius, so brushing a corner of the
 * portal counts and walking past it does not.
 */
export function isStandingInEndPortal(world, player) {
  if (!world?.getVoxel || !player?.position) return false;
  const feet = Math.floor(player.position.y);
  const eye = Math.floor(player.position.y + (player.eyeHeight ?? 1.62));
  const x = Math.floor(player.position.x);
  const z = Math.floor(player.position.z);
  if (isEndPortal(world.getVoxel(x, feet, z))) return true;
  if (isEndPortal(world.getVoxel(x, eye, z))) return true;
  for (const dx of [-0.25, 0.25]) {
    for (const dz of [-0.25, 0.25]) {
      const bx = Math.floor(player.position.x + dx);
      const bz = Math.floor(player.position.z + dz);
      if (isEndPortal(world.getVoxel(bx, feet, bz))) return true;
      if (isEndPortal(world.getVoxel(bx, eye, bz))) return true;
    }
  }
  return false;
}

/**
 * Lay an end stone island for the player to arrive on.
 *
 * `initEndArena` builds crystals, pillars and a dragon but **no ground**, and the End dimension's chunks are
 * generated from whatever biome was selected, so arriving could drop the player into terrain or into nothing.
 * A disc of end stone at the arrival height is the same central island vanilla gives you.
 *
 * Only air is replaced, so it cannot carve into something already there.
 *
 * @returns {number} blocks placed
 */
export function buildEndPlatform(world, cx, cy, cz, radius = 12) {
  if (!world?.getVoxel || !world?.setVoxel) return 0;
  let placed = 0;
  const r2 = radius * radius;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > r2) continue;
      for (let dy = 0; dy >= -2; dy--) {
        const y = cy + dy;
        if (world.getVoxel(cx + dx, y, cz + dz) === BLOCKS.AIR) {
          world.setVoxel(cx + dx, y, cz + dz, BLOCKS.END_STONE);
          placed++;
        }
      }
    }
  }
  return placed;
}

/**
 * Build a chamber holding a portal ring, and a shaft up to the surface.
 *
 * Vanilla puts this in a stronghold. This project has no stronghold generation, so without a room the twelve
 * frames simply do not exist anywhere and the route stops at the first step -- the player can brew an eye and
 * have nowhere to put it.
 *
 * Deliberately plain: stone brick walls and floor, the ring in the middle, and a shaft of air to the
 * surface so the chamber can be found by digging above it. The shaft is what makes the room discoverable
 * without a locator; the Eye of Ender throw does the rest.
 *
 * @param {object} world
 * @param {number} cx
 * @param {number} floorY the layer the frames stand on
 * @param {number} cz
 * @param {{filledEyes?:number, radius?:number, surfaceY?:number|null}} [options]
 * @returns {{placed:number, filled:number, surfaceY:number|null}}
 */
export function buildEndPortalRoom(world, cx, floorY, cz, options = {}) {
  const { filledEyes = 2, radius = 7, surfaceY = null } = options;
  if (!world?.getVoxel || !world?.setVoxel) return { placed: 0, filled: 0, surfaceY: null };

  // `floorY` must leave headroom under the world ceiling and the ring needs two blocks of clear space.
  const y = Math.max(3, Math.min(floorY, 56));
  let placed = 0;
  const put = (x, yy, z, id) => { world.setVoxel(x, yy, z, id); placed++; };

  const r = Math.max(4, radius);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const onWall = Math.abs(dx) === r || Math.abs(dz) === r;
      // Floor, and a roof so the chamber reads as a room rather than a pit.
      put(cx + dx, y - 1, cz + dz, BLOCKS.STONE_BRICKS);
      put(cx + dx, y + 4, cz + dz, BLOCKS.STONE_BRICKS);
      if (!onWall) continue;
      for (let dy = 0; dy <= 3; dy++) put(cx + dx, y + dy, cz + dz, BLOCKS.STONE_BRICKS);
    }
  }
  // Clear the interior so the ring is not buried in whatever the terrain had there.
  for (let dx = -r + 1; dx <= r - 1; dx++) {
    for (let dz = -r + 1; dz <= r - 1; dz++) {
      for (let dy = 0; dy <= 3; dy++) world.setVoxel(cx + dx, y + dy, cz + dz, BLOCKS.AIR);
    }
  }
  // Two torches so the room is not pitch black.
  world.setVoxel(cx - r + 1, y + 3, cz - r + 1, BLOCKS.TORCH);
  world.setVoxel(cx + r - 1, y + 3, cz + r - 1, BLOCKS.TORCH);

  const filled = Math.max(0, Math.min(END_PORTAL_FRAMES - 1, filledEyes));
  const ringPlaced = buildFrameRing(world, cx, y, cz, filled);
  placed += ringPlaced;

  // A shaft of air up to the surface, so the chamber can be reached by digging straight down above it.
  let reached = null;
  if (Number.isFinite(surfaceY) && surfaceY > y) {
    for (let sy = y + 5; sy <= surfaceY + 1; sy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) world.setVoxel(cx + dx, sy, cz + dz, BLOCKS.AIR);
      }
    }
    reached = surfaceY;
  }

  return { placed, filled, surfaceY: reached };
}

/** How hard an Eye of Ender is thrown: up first, then along the bearing to the portal. */
export const ENDER_EYE_RISE = 7.0;
export const ENDER_EYE_SPEED = 9.0;
export const ENDER_EYE_LIFE = 3.2;

/**
 * The velocity an Eye of Ender leaves the player with.
 *
 * Vanilla's throw rises and then travels toward the stronghold, which is how the eye is used to find one. The
 * horizontal component points at the portal and the vertical one is fixed, so the eye arcs whatever the
 * distance -- the player reads the *bearing* from it, not the range.
 *
 * @param {{x:number,z:number}} from
 * @param {{x:number,z:number}} target
 * @returns {{x:number,y:number,z:number}}
 */
export function enderEyeThrowVelocity(from, target) {
  const dx = (target?.x ?? 0) - (from?.x ?? 0);
  const dz = (target?.z ?? 0) - (from?.z ?? 0);
  const len = Math.hypot(dx, dz);
  // Directly overhead, or a nonsense target: straight up rather than a division by zero.
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, y: ENDER_EYE_RISE, z: 0 };
  return { x: (dx / len) * ENDER_EYE_SPEED, y: ENDER_EYE_RISE, z: (dz / len) * ENDER_EYE_SPEED };
}

/** The bearing from the player to the portal, in degrees clockwise from -Z, for a compass-style reading. */
export function bearingToPortal(from, target) {
  const dx = (target?.x ?? 0) - (from?.x ?? 0);
  const dz = (target?.z ?? 0) - (from?.z ?? 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx === 0 && dz === 0)) return null;
  // -Z is north, +X is east, matching the rest of the project's yaw convention.
  const deg = Math.atan2(dx, -dz) * 180 / Math.PI;
  return (deg + 360) % 360;
}

/** A cardinal name for a bearing, so a message can say "north-east" rather than "47 degrees". */
export function bearingName(degrees) {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return null;
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
}

/**
 * Try to light the portal around a frame that was just filled.
 *
 * The caller knows which frame the player clicked, not where the ring's centre is -- and the centre is the
 * ring's property rather than the frame's. Rather than have the interaction code do layout arithmetic, every
 * candidate centre within reach of the clicked frame is tried and the ring itself decides. A frame is at most
 * two blocks from its centre, so a 5x5 sweep is exhaustive.
 *
 * @returns {{cx:number, cy:number, cz:number}|null} the centre, when a portal was lit
 */
export function tryActivateAround(world, x, y, z) {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const cx = x + dx;
      const cz = z + dz;
      if (!isRingComplete(world, cx, y, cz)) continue;
      if (activateEndPortal(world, cx, y, cz)) return { cx, cy: y, cz };
    }
  }
  return null;
}

/**
 * Where a portal leads.
 *
 * The overworld and the End are the only two this understands; anything else is left alone rather than
 * guessed at.
 */
export function portalDestination(dimension) {
  if (dimension === 'overworld') return 'the_end';
  if (dimension === 'the_end') return 'overworld';
  return null;
}

/** The arrival point, in the destination dimension's own coordinates. */
export function portalArrival(dimension) {
  // "Players who enter the End spawn at coordinates (100, 49, 0), facing west toward the main island" -- on the
  // obsidian platform (src/worldgen/generators/endFeatures.js; its height mapped onto this 64-tall End).
  if (dimension === 'the_end') return { x: PLATFORM.x + 0.5, y: PLATFORM.y + 1, z: PLATFORM.z + 0.5, yaw: Math.PI / 2 };
  return { x: 0.5, y: 33, z: 0.5 };
}

/**
 * Build a frame ring, optionally with some eyes already in it.
 *
 * Used by world generation and by the tests. `filled` may be a count or a predicate; a count fills the first
 * n frames in ring order, which is what vanilla's partially-filled stronghold portals look like from above.
 *
 * @returns {number} how many frames were placed
 */
export function buildFrameRing(world, cx, cy, cz, filled = 0) {
  if (!world?.setVoxel) return 0;
  const offsets = frameRingOffsets();
  const fill = typeof filled === 'function' ? filled : (i => i < filled);
  let placed = 0;
  offsets.forEach(({ dx, dz }, i) => {
    world.setVoxel(cx + dx, cy, cz + dz,
      fill(i) ? BLOCKS.END_PORTAL_FRAME_FILLED : BLOCKS.END_PORTAL_FRAME);
    placed++;
  });
  return placed;
}
