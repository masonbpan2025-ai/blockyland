// Final pose pass shared by native and generated quadrupeds. AI still owns movement and
// special actions; this pass only articulates the distance actually travelled this tick.
export const WALKING_QUADRUPEDS = Object.freeze('pig cow sheep mooshroom wolf cat ocelot fox polar_bear panda goat llama trader_llama horse donkey mule skeleton_horse zombie_horse camel camel_husk hoglin zoglin ravager armadillo'.split(' '));
export const CRAWLING_QUADRUPEDS = Object.freeze(['turtle', 'axolotl']);
export const HOPPING_QUADRUPEDS = Object.freeze(['rabbit', 'killer_bunny', 'frog']);
export const QUADRUPED_MOBS = Object.freeze([...WALKING_QUADRUPEDS, ...CRAWLING_QUADRUPEDS, ...HOPPING_QUADRUPEDS]);
const walking = new Set(WALKING_QUADRUPEDS), crawling = new Set(CRAWLING_QUADRUPEDS), hopping = new Set(HOPPING_QUADRUPEDS);
const states = new WeakMap();

export function quadrupedMode(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  if (walking.has(type)) return 'walk';
  if (crawling.has(type)) return 'crawl';
  if (hopping.has(type)) return 'hop';
  if (mob?.isCustomMob && quadrupedLegs(mob).length === 4) return 'walk';
  return null;
}

/** Normalize raw pivots, wrapped meshes and named hoglin limbs into anatomical pairs. */
export function quadrupedLegs(mob) {
  const source = mob?.legs ?? mob?.flippers ?? mob?.feet ?? (mob?.legFL ? [mob.legFL, mob.legFR, mob.legBL, mob.legBR] : []);
  if (!Array.isArray(source) || source.length !== 4) return [];
  const parts = source.map(part => ({ part, mesh: part?.mesh ?? part }));
  if (parts.some(p => !p.mesh?.rotation || !p.mesh?.position)) return [];
  // Lists differ between models: fox/goat/llama start with the hind legs. Resolve
  // their geometry/metadata rather than silently assuming front/front/back/back.
  const ordered = [...parts].sort((a, b) => b.mesh.position.z - a.mesh.position.z);
  const front = new Set(ordered.slice(0, 2));
  return parts.map(p => ({ mesh: p.mesh, front: p.part.front ?? front.has(p), side: p.part.side ?? (p.mesh.position.x < 0 ? -1 : 1) }));
}

export function quadrupedSpecialPose(mob) {
  return !!(mob?.isSitting || mob?.isSleeping || mob?.isLyingDown || mob?.isRolling
    || (mob?.isWorried && mob?.isThundering) || mob?.sneezeTimer > 0
    || mob?.isMauling || mob?.pouncePhase || mob?.ramState || mob?.spitCharge > 0
    || mob?.pendingSpitTarget || mob?.tuskAttackTime > 0 || mob?.grazeTime > 0
    || mob?.rearTime > 0 || mob?.isPlayingDead || mob?.playDeadTime > 0 || mob?.playingDead > 0
    || mob?.tongueTarget || mob?.isLayingEggs || mob?.isDigging || mob?.state === 'digging'
    || (mob?.type === 'armadillo' && mob.rollState && mob.rollState !== 'idle'));
}

/** `distance` is measured around the AI/physics call, excluding velocity into a wall. */
export function updateQuadrupedMotion(mob, dt, { distance = 0, player = null, inWater = false } = {}) {
  const mode = quadrupedMode(mob);
  if (!mode || !mob?.mesh || mob.frozen || mob.health <= 0 || mob.dying || !(dt > 0)) return false;
  const legs = quadrupedLegs(mob);
  let s = states.get(mob);
  // Initial facing decorrelates a herd's glances without adding frame-random jitter.
  if (!s) { s = { time: (mob.yaw ?? 0) * 1.7, phase: 0, amount: 0, yaw: 0, pitch: 0 }; states.set(mob, s); }
  s.time += dt;
  if (quadrupedSpecialPose(mob)) { s.amount = 0; s.yaw = s.pitch = 0; return false; }
  // Aquatic paddling and the hop/airborne pose belong to their species' existing animator.
  const airborne = mob.onGround === false && !inWater;
  if (!inWater && !airborne && mode !== 'hop' && legs.length === 4) {
    const speed = Math.min(8, Math.max(0, distance) / dt);
    const target = speed < 0.03 ? 0 : Math.min(1, speed / (mode === 'crawl' ? 0.5 : 1.2));
    s.amount += (target - s.amount) * (1 - Math.exp(-20 * dt));
    s.phase += Math.min(distance, 8 * dt) * (mode === 'crawl' ? 8 : 5);
    const amplitude = mode === 'crawl' ? 0.24 : ['armadillo', 'ravager'].includes(mob.type) ? 0.38 : 0.6;
    const swing = Math.sin(s.phase) * amplitude * s.amount;
    for (const leg of legs) leg.mesh.rotation.x = swing * leg.side * (leg.front ? 1 : -1);
  } else { s.amount = 0; }
  if (!mob.head?.rotation || mob.rider || inWater || airborne) return true;
  const aggressive = !!(mob.isHostile || mob.aggroToPlayer || mob.combatTarget || mob.attackTarget);
  if (aggressive) { s.yaw = s.pitch = 0; return true; }
  const undead = ['skeleton_horse', 'zombie_horse', 'camel_husk', 'zoglin'].includes(mob.type);
  const limit = undead ? 0.25 : mode === 'crawl' ? 0.28 : 0.55;
  let yaw = Math.sin(s.time * 0.7) * limit * 0.8 + Math.sin(s.time * 1.6) * limit * 0.2;
  const pos = mob.mesh.position, interest = player?.position;
  if (interest && Math.hypot(interest.x - pos.x, interest.z - pos.z) < 8) {
    const relative = Math.atan2(interest.x - pos.x, interest.z - pos.z) - (mob.yaw ?? mob.mesh.rotation.y);
    yaw = Math.atan2(Math.sin(relative), Math.cos(relative)) * 0.8 + yaw * 0.2;
  }
  yaw = Math.max(-limit, Math.min(limit, yaw)) * (1 - s.amount * 0.65);
  const pitch = Math.sin(s.time * 0.9) * (undead ? 0.025 : 0.07);
  const blend = 1 - Math.exp(-6 * dt);
  s.yaw += (yaw - s.yaw) * blend; s.pitch += (pitch - s.pitch) * blend;
  // Preserve model-specific pitch (e.g. the camel husk's droop), without accumulating
  // last frame's overlay if its animator does not author that channel each tick.
  const baseX = s.lastX === mob.head.rotation.x ? mob.head.rotation.x - (s.appliedPitch ?? 0) : mob.head.rotation.x;
  mob.head.rotation.x = baseX + s.pitch; mob.head.rotation.y = s.yaw;
  s.appliedPitch = s.pitch; s.lastX = mob.head.rotation.x;
  return true;
}
