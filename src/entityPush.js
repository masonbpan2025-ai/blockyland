// Players push each other apart, as in Minecraft Java (LivingEntity.pushEntities -> Entity.push): two entities whose
// collision boxes overlap are each moved away from the other, harder the closer their centres are. Without it, players
// on a server walked through each other and stood in one spot, and one could pillar up from inside another's head.
//
// Java, per tick, for an overlapping pair: dx, dz = the offset between centres; d = max(|dx|, |dz|); if d >= 0.01,
// then d = sqrt(d), the offset is divided by d and scaled by min(1, 1/d) and by 0.05, and each entity is given that
// push away from the other, added to its motion. Here the push moves the position instead (Blockyland's controls
// rewrite a player's horizontal velocity every tick, which would cancel it), and never into a block.

/** Java's push between two centres: the motion (blocks per tick) given to `b`, and its opposite to `a`; null if none. */
export function pushBetween(a, b) {
  let dx = b.x - a.x, dz = b.z - a.z;
  let d = Math.max(Math.abs(dx), Math.abs(dz));
  if (d < 0.01) return null; // Java pushes nothing when the centres (almost) coincide
  d = Math.sqrt(d);
  dx /= d; dz /= d;
  const f = Math.min(1, 1 / d);
  return { x: dx * f * 0.05, z: dz * f * 0.05 };
}

/** Whether two player-sized boxes overlap (width centred on x, z; height up from y). */
export function boxesOverlap(a, b, { width = 0.6, height = 1.8 } = {}) {
  return Math.abs(a.x - b.x) < width && Math.abs(a.z - b.z) < width && a.y < b.y + height && b.y < a.y + height;
}

/**
 * One tick of pushing among players sharing a world: each overlapping pair is moved apart. A move that would put a
 * player inside a block is not made (each axis separately, so a player against a wall still slides along it).
 * @param {Array<{position, checkCollision?, isDead?, gamemode?}>} players
 * @returns {number} how many pairs were pushed
 */
export function pushPlayersApart(players) {
  const live = players.filter(p => p?.position && !p.isDead && p.gamemode !== 'spectator');
  let pushed = 0;
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (!boxesOverlap(a.position, b.position, a)) continue;
    const push = pushBetween(a.position, b.position);
    if (!push) continue;
    nudge(b, push.x, push.z); nudge(a, -push.x, -push.z);
    pushed++;
  }
  return pushed;
}

function nudge(player, dx, dz) {
  const p = player.position;
  for (const [axis, amount] of [['x', dx], ['z', dz]]) {
    if (!amount) continue;
    const to = p.clone(); to[axis] += amount;
    if (!player.checkCollision?.(to)) p[axis] = to[axis];
  }
}
