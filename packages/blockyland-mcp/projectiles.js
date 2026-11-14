// Projectiles a guest player fires or throws (bow, snowball, egg, ender pearl): their flight, tick by tick, as vanilla
// moves them, against the blocks and the players the guest knows of. The host draws a shot from its `shot` message and
// leaves the hit to the shooter's game (shareProtocol.js, sanitizeShot), so the flight is simulated here; only a
// projectile that really reaches a player's box hits.
//
// Vanilla values (Minecraft Wiki: Arrow, Snowball, Egg, Ender Pearl, Bow):
// - an arrow leaves at 3 blocks a tick at full draw (power 1), falls 0.05 blocks/tick^2 and keeps 99% of its speed a
//   tick in air; its damage is the speed times 2, rounded up (6 at full draw), and a full draw is 1 s (20 ticks): power
//   is (f^2 + 2f) / 3 for f = seconds drawn, capped at 1; a shot under 0.1 s does not leave the bow.
// - a snowball, an egg and an ender pearl leave at 1.5 blocks a tick and fall 0.03; they hurt a player for 0 but knock
//   back; a pearl teleports its thrower where it lands, for 5 damage.

export const PROJECTILE_PHYSICS = Object.freeze({
  arrow: { speed: 3.0, gravity: 0.05, drag: 0.99 },
  snowball: { speed: 1.5, gravity: 0.03, drag: 0.99 },
  egg: { speed: 1.5, gravity: 0.03, drag: 0.99 },
  ender_pearl: { speed: 1.5, gravity: 0.03, drag: 0.99 },
});
export const THROWABLES = Object.freeze(['snowball', 'egg', 'ender_pearl']);
export const PEARL_DAMAGE = 5;
/** A player's box: 0.6 wide and 1.8 tall, grown by a projectile's own half-size (0.25 for an arrow, as vanilla). */
const HALF_WIDTH = 0.3, HEIGHT = 1.8, PAD = 0.25;

/** A bow's power after drawing it for `ms` milliseconds (0 when the arrow does not leave). */
export function bowPower(ms) {
  const f = Math.max(0, ms) / 1000;
  if (f < 0.1) return 0;
  return Math.min(1, (f * f + 2 * f) / 3);
}

/** An arrow's damage at a speed (blocks a tick): vanilla's base 2 times the speed, rounded up. */
export function arrowDamage(speed, powerLevel = 0) {
  const base = 2 + (powerLevel > 0 ? 0.5 * powerLevel + 0.5 : 0);
  return Math.ceil(speed * base);
}

/** The direction a player faces (yaw 0 faces -Z, positive pitch looks up, as guestPeer's lookAt sets them). */
export function facing(yaw, pitch) {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

/** The start of a shot: from the eye, along the facing, at the kind's speed times `power`, with vanilla's spread. */
export function launch(kind, { eye, yaw, pitch, power = 1, random = Math.random }) {
  const phys = PROJECTILE_PHYSICS[kind];
  if (!phys) throw new Error(`not a projectile: ${kind}`);
  const d = facing(yaw, pitch);
  const spread = () => (random() + random() + random() - 1.5) * 0.0075 * 1.15; // about vanilla's gaussian(0.0075)
  const v = phys.speed * power;
  return { pos: { ...eye }, vel: { x: (d.x + spread()) * v, y: (d.y + spread()) * v, z: (d.z + spread()) * v } };
}

/**
 * One tick of flight: the segment from `pos` to `pos + vel`, checked against the players' boxes and the blocks along it
 * (in small steps), then drag and gravity. Returns { hit: target } | { block: {x,y,z}, at } | null, and moves `shot`.
 */
export function stepShot(shot, kind, { isSolid, targets = [] }) {
  const phys = PROJECTILE_PHYSICS[kind];
  const { pos, vel } = shot;
  const len = Math.hypot(vel.x, vel.y, vel.z);
  const steps = Math.max(1, Math.ceil(len / 0.25));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: pos.x + vel.x * t, y: pos.y + vel.y * t, z: pos.z + vel.z * t };
    for (const target of targets) {
      if (Math.abs(p.x - target.x) <= HALF_WIDTH + PAD && Math.abs(p.z - target.z) <= HALF_WIDTH + PAD && p.y >= target.y - PAD && p.y <= target.y + HEIGHT + PAD) {
        Object.assign(pos, p);
        return { hit: target, at: p };
      }
    }
    if (isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
      // Where it stops: the last point in air, for a pearl's landing.
      const back = { x: pos.x + vel.x * ((i - 1) / steps), y: pos.y + vel.y * ((i - 1) / steps), z: pos.z + vel.z * ((i - 1) / steps) };
      Object.assign(pos, back);
      return { block: { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }, at: back };
    }
  }
  pos.x += vel.x; pos.y += vel.y; pos.z += vel.z;
  vel.x *= phys.drag; vel.y = vel.y * phys.drag - phys.gravity; vel.z *= phys.drag;
  return null;
}

/**
 * Fly a shot to its end (a player, a block, or the void below `voidY`), at most `maxTicks` ticks, calling
 * `targetsAt(tick)` for where the players are at each tick (they move while it flies) and `wait()` between ticks (a
 * real tick in a game; nothing in a test). Returns { hit, at, ticks } | { block, at, ticks } | { lost: true, ticks }.
 */
export async function flyShot(kind, start, { isSolid, targetsAt = () => [], wait = async () => {}, maxTicks = 100, voidY = -64 }) {
  const shot = { pos: { ...start.pos }, vel: { ...start.vel } };
  for (let tick = 1; tick <= maxTicks; tick++) {
    const r = stepShot(shot, kind, { isSolid, targets: targetsAt(tick) });
    if (r) return { ...r, ticks: tick, vel: { ...shot.vel } };
    if (shot.pos.y < voidY) return { lost: true, ticks: tick };
    await wait();
  }
  return { lost: true, ticks: maxTicks };
}
