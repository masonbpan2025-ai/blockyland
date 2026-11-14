// Players pushing players, as Java Edition does it. Shared by browser players (src/player.js) and headless guests
// (guestPeer.js); no scene, network or AI dependencies.
//
// Java (Entity.push(Entity), called from LivingEntity.pushEntities() every tick for each entity whose bounding box
// intersects this one's): with d = other.x - self.x, e = other.z - self.z and f = max(|d|, |e|), nothing happens when
// f < 0.01; otherwise f = sqrt(f), d /= f, e /= f, both are scaled by min(1, 1/f) and by 0.05, and self's velocity
// gets (-d, 0, -e) blocks/tick. On a client only players are pushed this way, and each client pushes only its own
// player (the other's client pushes the other). A player is pushable while alive, not a spectator and not on a
// climbable block. The push is soft: it is a velocity that the usual drag (0.91 in the air, 0.6 * 0.91 on the ground)
// slows every tick, so a walking player can still shove through another, slowly, while both are pushed apart.
import { TICKS_PER_SECOND, dragKnockback } from './knockback.js';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
/** A sneaking player's box is 1.5 tall (Java's crouching pose). */
export const SNEAK_HEIGHT = 1.5;
export const PUSH_PER_TICK = 0.05;
export const PUSH_TICK = 1 / TICKS_PER_SECOND;

/** The box of a player standing at `p` (feet position): { minX, minY, minZ, maxX, maxY, maxZ }. */
export function playerBox(p) {
  const h = p.sneaking ? SNEAK_HEIGHT : PLAYER_HEIGHT, r = PLAYER_WIDTH / 2;
  return { minX: p.x - r, minY: p.y, minZ: p.z - r, maxX: p.x + r, maxY: p.y + h, maxZ: p.z + r };
}

/** Java's AABB.intersects: strict, so boxes that only touch do not. */
export function boxesIntersect(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** What one other player's push adds to `self`'s velocity this tick, in blocks/tick (Entity.push). */
export function pushFrom(self, other) {
  let d = other.x - self.x, e = other.z - self.z;
  let f = Math.max(Math.abs(d), Math.abs(e));
  if (f < 0.01) return { x: 0, z: 0 };
  f = Math.sqrt(f);
  d /= f; e /= f;
  const g = Math.min(1, 1 / f);
  return { x: -d * g * PUSH_PER_TICK, z: -e * g * PUSH_PER_TICK };
}

/**
 * The push on `self` from every other player whose box intersects its own, in blocks/tick. A player that is dead, a
 * spectator or hidden (`pushable: false`) neither pushes nor is pushed.
 * @param {{x, y, z, sneaking?, pushable?}} self
 * @param {Iterable<{x, y, z, sneaking?, pushable?}>} others
 */
export function pushImpulse(self, others) {
  const out = { x: 0, z: 0 };
  if (self.pushable === false) return out;
  const box = playerBox(self);
  for (const o of others) {
    if (!o || o.pushable === false || !Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.z)) continue;
    if (!boxesIntersect(box, playerBox(o))) continue;
    const p = pushFrom(self, o);
    out.x += p.x; out.z += p.z;
  }
  return out;
}

/**
 * One 20 Hz tick of the push's own velocity (blocks/second), kept apart from walking: Java's motion is linear (move,
 * then drag), so the push part of the velocity can be integrated alone and its move added to the walk's.
 * Order as in LivingEntity.aiStep: travel (move, then drag chosen from the ground state before moving), then
 * pushEntities adds this tick's push, which moves the player on the next tick.
 * @returns {{ move: {x, z}, velocity: {x, z} }} the horizontal move this tick (blocks) and the velocity after it
 */
export function stepPushVelocity(velocity, impulse, grounded) {
  const move = { x: velocity.x * PUSH_TICK, z: velocity.z * PUSH_TICK };
  const dragged = dragKnockback({ x: velocity.x, y: 0, z: velocity.z }, grounded);
  const v = { x: dragged.x + impulse.x * TICKS_PER_SECOND, z: dragged.z + impulse.z * TICKS_PER_SECOND };
  // Below a thousandth of a block a second the push is over.
  if (Math.hypot(v.x, v.z) < 1e-3) { v.x = 0; v.z = 0; }
  return { move, velocity: v };
}

/** True when a 0.6 x 1.8 (or 1.5) player box at `p` overlaps a solid block. */
export function boxHitsBlocks(p, isSolid) {
  const b = playerBox(p);
  for (let x = Math.floor(b.minX + 1e-7); x <= Math.floor(b.maxX - 1e-7); x++)
    for (let y = Math.floor(b.minY + 1e-7); y <= Math.floor(b.maxY - 1e-7); y++)
      for (let z = Math.floor(b.minZ + 1e-7); z <= Math.floor(b.maxZ - 1e-7); z++)
        if (isSolid(x, y, z)) return true;
  return false;
}

/**
 * Move a player by a push, axis by axis, stopping on an axis where a block is in the way (and zeroing that part of the
 * push velocity), as Java's move does. A sneaking player on the ground is not pushed off an edge: Java's
 * maybeBackOffFromEdge guards the whole self-move, push included; `hasGround(p)` says whether a spot has ground under it.
 * Returns the new position and velocity.
 */
export function movePushed(position, velocity, move, isSolid, { sneaking = false, grounded = false, hasGround = null } = {}) {
  const p = { ...position }, v = { ...velocity };
  for (const axis of ['x', 'z']) {
    if (!move[axis]) continue;
    const before = p[axis];
    p[axis] += move[axis];
    if (boxHitsBlocks({ ...p, sneaking }, isSolid) || (sneaking && grounded && hasGround && !hasGround(p))) { p[axis] = before; v[axis] = 0; }
  }
  return { position: p, velocity: v };
}
