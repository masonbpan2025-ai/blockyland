// Bedrock Edition's "simple bridging" (minecraft.wiki Tutorial:Bridging, Bedrock only): "Looking at the position where
// you want to place a block while standing on a block that's next to that position will allow you to place the block
// next to the one you're standing on (so long as you can't place a block normally where you're looking). To use this,
// just walk in a straight line and place a new block in front of you when possible."
//
// So a player can bridge facing the void, looking down ahead of their feet, without sneaking backwards to click the
// side of the edge block as Java requires. Pure: the caller supplies the world lookups.
//
// The wiki's rule taken alone fails at walking pace: with the view held at one angle, once the player is within a fifth
// of a block of the edge the look ray reaches that level past the next place, and they walk off. Bedrock players walk
// and click; so, failing the exact place, a player looking down at least BRIDGE_MIN_LOOK_DOWN gets the place in front of
// the block they stand on, in the direction they face.

/** How far down (radians below level) the view must be for the place in front to be offered: about 30 degrees. */
export const BRIDGE_MIN_LOOK_DOWN = 0.5;

/** The cells under the player's 0.6-wide box: the blocks they stand on. */
function supportCells(position, width, isSolid) {
  const y = Math.floor(position.y - 0.2);
  const hw = width / 2 - 1e-3;
  const cells = new Map();
  for (const dx of [-hw, hw]) for (const dz of [-hw, hw]) {
    const x = Math.floor(position.x + dx), z = Math.floor(position.z + dz);
    if (isSolid(x, y, z)) cells.set(`${x},${z}`, { x, y, z });
  }
  return { y, cells: [...cells.values()] };
}

/**
 * Where a Bedrock bridging click would put a block, or null. Call it only when the look ray hits no block.
 * @param {{origin:{x,y,z}, direction:{x,y,z}, reach:number, position:{x,y,z}, width?:number, onGround?:boolean, yaw?:number,
 *   isSolid:(x,y,z)=>boolean, isReplaceable:(x,y,z)=>boolean}} a
 * @returns {{x:number,y:number,z:number, support:{x,y,z}, normal:{x:number,y:number,z:number}}|null}
 */
export function bridgeTarget({ origin, direction, reach, position, width = 0.6, onGround = true, yaw = null, isSolid, isReplaceable }) {
  if (!onGround) return null;
  const { y, cells } = supportCells(position, width, isSolid);
  if (!cells.length) return null;
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const step = 0.05;
  for (let t = 0; t <= reach; t += step) {
    const px = origin.x + (direction.x / length) * t;
    const py = origin.y + (direction.y / length) * t;
    const pz = origin.z + (direction.z / length) * t;
    if (Math.floor(py) < y) break; // below the level of the blocks underfoot: past the place to bridge to
    if (Math.floor(py) !== y) continue;
    const x = Math.floor(px), z = Math.floor(pz);
    if (!isReplaceable(x, y, z)) continue;
    // "next to the one you're standing on": sharing a side, on the same level.
    const support = cells.find((c) => Math.abs(c.x - x) + Math.abs(c.z - z) === 1);
    if (support) return { x, y, z, support, normal: { x: x - support.x, y: 0, z: z - support.z } };
  }
  // The place in front, for a player looking down: along the axis they face most nearly (this game's forward is
  // (-sin yaw, -cos yaw)), beside the foremost block underfoot.
  if (!Number.isFinite(yaw) || -direction.y / length < Math.sin(BRIDGE_MIN_LOOK_DOWN)) return null;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const normal = Math.abs(fx) >= Math.abs(fz) ? { x: Math.sign(fx), y: 0, z: 0 } : { x: 0, y: 0, z: Math.sign(fz) };
  const support = cells.reduce((best, c) => ((c.x - best.x) * normal.x + (c.z - best.z) * normal.z > 0 ? c : best));
  const x = support.x + normal.x, z = support.z + normal.z;
  return isReplaceable(x, y, z) ? { x, y, z, support, normal } : null;
}
