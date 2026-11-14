// Shared by browser players and headless guests. Velocities are blocks/second; vanilla is 20 ticks/second.
// References: Minestom LivingEntity.takeKnockback / Entity.takeKnockback (0.4 base, old velocity / 2),
// https://minecraft.wiki/w/Knockback_(mechanic), and vanilla travel's 0.91 / (0.6 * 0.91) drag,
// 0.08 blocks/tick gravity and 0.98 vertical drag. No scene, network or AI dependencies.
export const TICKS_PER_SECOND = 20;
export const BASE_KNOCKBACK = 0.4;
export const KNOCKBACK_PER_LEVEL = 0.5;
export const KNOCKBACK_TICK = 1 / TICKS_PER_SECOND;

export function knockbackDirection(raw) {
  if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) return null;
  const length = Math.hypot(raw.x, raw.z);
  return length > 1e-9 && Number.isFinite(length) ? { x: raw.x / length, z: raw.z / length } : null;
}

export function applyKnockback(velocity, { strength, dx, dz, onGround, resistance = 0 }) {
  const s = strength * (1 - Math.min(1, Math.max(0, resistance)));
  const length = Math.hypot(dx, dz);
  if (s <= 0 || length < 1e-9) return { x: velocity.x, y: velocity.y, z: velocity.z };
  const push = s * TICKS_PER_SECOND / length;
  return { x: velocity.x / 2 + dx * push,
    y: onGround ? Math.min(BASE_KNOCKBACK * TICKS_PER_SECOND, velocity.y / 2 + s * TICKS_PER_SECOND) : velocity.y,
    z: velocity.z / 2 + dz * push };
}

export function hitKnockback(velocity, { position, from, fromYaw = null, onGround, extraLevel = 0, resistance = 0 }) {
  let v = applyKnockback(velocity, { strength: BASE_KNOCKBACK, dx: position.x - from.x, dz: position.z - from.z, onGround, resistance });
  if (extraLevel > 0) {
    const yaw = Number.isFinite(fromYaw) ? fromYaw : Math.atan2(-(position.x - from.x), -(position.z - from.z));
    v = applyKnockback(v, { strength: extraLevel * KNOCKBACK_PER_LEVEL, dx: -Math.sin(yaw), dz: -Math.cos(yaw), onGround, resistance });
  }
  return v;
}

export function hurtWindow(state, amount) {
  if (!(state.timer > 0)) return { amount, knockback: true, fresh: true };
  if (amount <= (state.lastAmount ?? 0)) return { amount: 0, knockback: false, fresh: false };
  return { amount: amount - (state.lastAmount ?? 0), knockback: false, fresh: false };
}

/** End of one travel tick; friction is chosen from the ground state BEFORE moving. */
export function dragKnockback(velocity, grounded) {
  const drag = grounded ? 0.6 * 0.91 : 0.91;
  return { x: velocity.x * drag, y: (velocity.y - 0.08 * TICKS_PER_SECOND) * 0.98, z: velocity.z * drag };
}

/** Whether a player's 0.6 x 1.8 box at `position` (its feet) is clear of solid blocks. */
export function bodyClear(position, isSolid) {
  for (let x = Math.floor(position.x - 0.3 + 1e-7); x <= Math.floor(position.x + 0.3 - 1e-7); x++)
    for (let y = Math.floor(position.y + 1e-7); y <= Math.floor(position.y + 1.8 - 1e-7); y++)
      for (let z = Math.floor(position.z - 0.3 + 1e-7); z <= Math.floor(position.z + 0.3 - 1e-7); z++)
        if (isSolid(x, y, z)) return false;
  return true;
}

/**
 * The nearest place a player's box fits, for one that is inside blocks (an ender pearl that struck a wall from the side
 * or below; anything else that puts a player in a block). Java pushes such a player out to the closest open space
 * (LocalPlayer.moveTowardsClosestSpace), never through the blocks: here the nearest free spot within 2 blocks sideways,
 * or up to 3 blocks up, or 1 down (a climb costs a little more than a step). Null when there is none.
 */
export function nearestFreeSpot(position, isSolid) {
  if (bodyClear(position, isSolid)) return { ...position };
  let best = null, bestCost = Infinity;
  const levels = [0, 1, 2, 3, -1].map((k) => (k ? Math.floor(position.y) + k - position.y : 0));
  for (const dy of levels) for (let dx = -2; dx <= 2 + 1e-9; dx += 0.1) for (let dz = -2; dz <= 2 + 1e-9; dz += 0.1) {
    const cost = Math.hypot(dx, dz) + Math.abs(dy) * 1.2;
    if (cost >= bestCost) continue;
    const spot = { x: position.x + dx, y: position.y + dy, z: position.z + dz };
    if (bodyClear(spot, isSolid)) { best = spot; bestCost = cost; }
  }
  return best;
}

/** One headless travel tick with a swept 0.6 x 1.8 player box. No sneak/AI edge guard applies to forced motion. */
export function stepKnockback(state, isSolid) {
  const position = { ...state.position }, velocity = { ...state.velocity };
  const collides = () => {
    for (let x = Math.floor(position.x - 0.3 + 1e-7); x <= Math.floor(position.x + 0.3 - 1e-7); x++)
      for (let y = Math.floor(position.y + 1e-7); y <= Math.floor(position.y + 1.8 - 1e-7); y++)
        for (let z = Math.floor(position.z - 0.3 + 1e-7); z <= Math.floor(position.z + 0.3 - 1e-7); z++)
          if (isSolid(x, y, z)) return true;
    return false;
  };
  let onGround = false;
  const parts = Math.max(1, Math.ceil(Math.max(Math.abs(velocity.x), Math.abs(velocity.y), Math.abs(velocity.z)) * KNOCKBACK_TICK / 0.2));
  for (let i = 0; i < parts; i++) for (const axis of ['y', 'x', 'z']) {
    const before = position[axis], delta = velocity[axis] * KNOCKBACK_TICK / parts;
    position[axis] += delta;
    if (collides()) {
      if (axis === 'y' && delta < 0) {
        position.y = Math.ceil(position.y - 1e-7);
        onGround = true;
      } else position[axis] = before;
      velocity[axis] = 0;
    }
  }
  return { position, velocity: dragKnockback(velocity, state.onGround), onGround };
}
