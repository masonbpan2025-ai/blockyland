/**
 * Armadillo rules: rolling up, damage reduction, spider repulsion and scute shedding.
 *
 * Reference: https://minecraft.wiki/w/Armadillo
 *
 * The armadillo is a passive mob whose whole identity is one state: it **rolls into a ball** when hurt
 * or when it detects a threat, and while rolled it takes reduced damage. It is also the only source of
 * armadillo scutes, which it sheds on a timer and when brushed.
 */

/** Wiki: 12 HP. */
export const ARMADILLO_HEALTH = 12;

/** Wiki: adult 0.7 wide x 0.65 tall; baby 0.42 x 0.39. */
export const ARMADILLO_DIMENSIONS = { width: 0.7, height: 0.65 };
export const ARMADILLO_BABY_DIMENSIONS = { width: 0.42, height: 0.39 };
export const ARMADILLO_BABY_SCALE = 0.6;

/** Wiki: 0.14 movement speed. */
export const ARMADILLO_SPEED = 0.14;

/**
 * Wiki: "The distance an armadillo checks for threats is the size of its hitbox inflated by 7 blocks
 * horizontally and 2 blocks vertically."
 */
export const ARMADILLO_THREAT_INFLATION = { horizontal: 7, vertical: 2 };

/** Wiki: "It unrolls if it detects no threats for 3 seconds (60 ticks)." */
export const ARMADILLO_UNROLL_SECONDS = 3;

/** Wiki: a rolled armadillo "occasionally peeks out from its shell to see if a threat is still near". */
export const ARMADILLO_PEEK_SECONDS = { min: 0.6, max: 1.4, hold: 0.4 };

/** Wiki: it sheds 1 scute every 5-10 minutes, "similar to the rate at which chickens lay eggs". */
export const ARMADILLO_SCUTE_SECONDS = { min: 300, max: 600 };

/** Wiki: brushing drops 1 scute and uses 16 durability of the brush. */
export const ARMADILLO_BRUSH_DURABILITY = 16;

/**
 * Wiki: "damage belonging to the type self_destruct is not affected". The armadillo is the only mob here
 * that can be hurt by anything self-destructing, so the exemption is named rather than inferred.
 */
export const ARMADILLO_REDUCTION_EXEMPT = ['self_destruct', 'explosion_self'];

/** Wiki: spiders and cave spiders flee from armadillos within 6 blocks, only while it is NOT rolled up. */
export const ARMADILLO_SPIDER_FEAR_RANGE = 6;
export const ARMADILLO_SPIDER_TYPES = ['spider', 'cave_spider'];

/**
 * The undead mobs an armadillo hides from.
 *
 * This codebase has no shared `isUndead` flag — only the phantom carries one, because it was added for
 * its sunlight burning — so the list is explicit rather than a property lookup. Right-clicking an
 * armadillo should not make it cower, so `zombie_horse` and `skeleton_horse` are included only when
 * ridden, which the caller handles.
 */
export const ARMADILLO_UNDEAD = [
  'zombie', 'husk', 'drowned', 'zombie_villager', 'zombified_piglin', 'zombie_pigman',
  'skeleton', 'stray', 'bogged', 'wither_skeleton', 'wither', 'phantom', 'zoglin',
  'skeleton_horse', 'zombie_horse'
];

/** Wiki: "Baby armadillos take 24000 ticks (20 minutes) to grow up", accelerated 10% per spider eye. */
export const ARMADILLO_GROWTH_SECONDS = 1200;
export const ARMADILLO_FEED_ACCELERATION = 0.1;

/** Wiki: armadillos follow players holding spider eyes within 10 blocks. */
export const ARMADILLO_FOLLOW_RANGE = 10;

/** Wiki: the breeding food is a spider eye. */
export const ARMADILLO_BREEDING_FOOD = 'spider_eye';

/** Body colours: a brown-grey plated body with a lighter banded shell. */
export const ARMADILLO_COLORS = {
  body: 0x8b6f47,
  shell: 0xa1887f,
  band: 0x6d4c41,
  dark: 0x3e2723
};

/** True when the mob is an armadillo. */
export function isArmadillo(mob) {
  return mob?.type === 'armadillo';
}

/**
 * The reduced damage from an attack on a rolled armadillo.
 *
 * Wiki: "it takes a reduced amount of damage given by `(original damage - 1) / 2`". Self-destruct damage
 * is exempt. So 6 becomes (6-1)/2 = 2.5, and 1 becomes 0.
 */
export function armadilloDamageReduction(amount, { rolled = false, damageType = null } = {}) {
  if (!rolled) return amount;
  if (damageType && ARMADILLO_REDUCTION_EXEMPT.includes(damageType)) return amount;
  // Wiki: the formula is applied to the original damage, and floors at 0 rather than healing.
  return Math.max(0, (amount - 1) / 2);
}

/**
 * Whether an armadillo is allowed to roll up at all.
 *
 * Wiki: "An armadillo does not roll up while fleeing, in water, on fire (they still roll up on campfires),
 * in the air, or being led." Also 26.3: "Armadillos no longer try to roll up when submerged in liquids."
 */
export function canRollUp(mob, { inWater = false, inLava = false, onFire = false, inAir = false, onLead = false, fleeing = false } = {}) {
  if (!isArmadillo(mob)) return false;
  if (inWater || inLava) return false;
  if (onFire) return false;
  if (inAir) return false;
  if (onLead) return false;
  if (fleeing) return false;
  return true;
}

/** True when a mob type is something an armadillo fears. */
export function isArmadilloThreat(mob, candidate) {
  if (!isArmadillo(mob) || !candidate || candidate === mob) return false;
  if (candidate.health !== undefined && candidate.health <= 0) return false;
  // Wiki: undead mobs, and players who are sprinting or mounted. The list is explicit because this
  // codebase has no shared `isUndead` flag: only the phantom carries one, added for its sunlight burning.
  if (candidate.isUndead || ARMADILLO_UNDEAD.includes(candidate.type)) return true;
  if (candidate === mob.owner) return false;
  // A player is a threat only when sprinting or mounted. This MUST come after the two checks above and
  // must not return early for every player: doing so made a sprinting player safe, which is the opposite
  // of the wiki. It is ordered this way so a mounted or sprinting player is caught before the fallthrough.
  if (candidate.sprinting || candidate.isSprinting) return true;
  if (candidate.riding || candidate.vehicle) return true;
  return false;
}

/**
 * Find the nearest threat within the inflated hitbox.
 *
 * Wiki: undead mobs, and "players who are sprinting or riding anything". The armadillo also remembers the
 * player who last hit it.
 *
 * Returns the threat, or null.
 */
export function findArmadilloThreat(manager, mob, player = null) {
  if (!isArmadillo(mob)) return null;
  const dims = armadilloDimensions(mob);
  const halfX = dims.width * 0.5 + ARMADILLO_THREAT_INFLATION.horizontal;
  const halfY = dims.height * 0.5 + ARMADILLO_THREAT_INFLATION.vertical;
  const halfZ = halfX;
  const within = (pos) => Math.abs(pos.x - mob.mesh.position.x) <= halfX
    && Math.abs(pos.y - mob.mesh.position.y) <= halfY
    && Math.abs(pos.z - mob.mesh.position.z) <= halfZ;

  // The remembered attacker counts as a threat while its timer runs.
  if (mob.lastAttacker && (mob.threatTimer ?? 0) > 0) {
    const pos = mob.lastAttacker.position ?? mob.lastAttacker.mesh?.position;
    if (pos && within(pos)) return mob.lastAttacker;
  }

  if (player?.position && within(player.position) && isArmadilloThreat(mob, player)) return player;

  for (const other of manager?.mobs ?? []) {
    if (other === mob) continue;
    if (other.health !== undefined && other.health <= 0) continue;
    const pos = other.mesh?.position ?? other.position;
    if (!pos || !within(pos)) continue;
    // Wiki: undead specifically, plus anything the armadillo has been hurt by recently.
    if (other.isUndead || ARMADILLO_UNDEAD.includes(other.type)) return other;
  }
  return null;
}

/**
 * Advance an armadillo's rolling state machine.
 *
 * Wiki: it rolls up when hurt or confronted by a threat, peeks out occasionally while rolled, and unrolls
 * after 3 seconds with no threat. Rolling is suppressed in water, fire, air and while led.
 *
 * Returns 'rolled', 'unrolled', 'peeking' or null.
 */
export function updateArmadilloRoll(manager, mob, dt, player, {
  inWater = false, onFire = false, inAir = false, onLead = false, fleeing = false, random = Math.random
} = {}) {
  if (!isArmadillo(mob)) return null;

  if ((mob.threatTimer ?? 0) > 0) mob.threatTimer = Math.max(0, mob.threatTimer - dt);
  const threat = findArmadilloThreat(manager, mob, player);
  const allowed = canRollUp(mob, { inWater, onFire, inAir, onLead, fleeing });

  if (threat && allowed) {
    mob.noThreatSeconds = 0;
    if (mob.rollState !== 'rolled' && mob.rollState !== 'peeking') {
      mob.rollState = 'rolled';
      mob.peekTimer = ARMADILLO_PEEK_SECONDS.min
        + random() * (ARMADILLO_PEEK_SECONDS.max - ARMADILLO_PEEK_SECONDS.min);
      return 'rolled';
    }
  } else if (mob.rollState === 'rolled' || mob.rollState === 'peeking') {
    // Count up toward the 3-second unroll. An armadillo that cannot roll (in water, on fire) also unrolls
    // immediately, which the wiki states outright.
    mob.noThreatSeconds = (mob.noThreatSeconds ?? 0) + dt;
    if (!allowed || mob.noThreatSeconds >= ARMADILLO_UNROLL_SECONDS) {
      mob.rollState = 'idle';
      mob.noThreatSeconds = 0;
      mob.peekTimer = 0;
      return 'unrolled';
    }
  }

  // While rolled it occasionally peeks out to check whether the threat is still there.
  if (mob.rollState === 'rolled') {
    mob.peekTimer = (mob.peekTimer ?? 0) - dt;
    if (mob.peekTimer <= 0) {
      mob.rollState = 'peeking';
      mob.peekHold = ARMADILLO_PEEK_SECONDS.hold;
      return 'peeking';
    }
  } else if (mob.rollState === 'peeking') {
    mob.peekHold = (mob.peekHold ?? 0) - dt;
    if (mob.peekHold <= 0) {
      mob.rollState = 'rolled';
      mob.peekTimer = ARMADILLO_PEEK_SECONDS.min
        + random() * (ARMADILLO_PEEK_SECONDS.max - ARMADILLO_PEEK_SECONDS.min);
    }
  }
  return null;
}

/** True while the armadillo is balled up, including while peeking. */
export function isRolledUp(mob) {
  return isArmadillo(mob) && (mob.rollState === 'rolled' || mob.rollState === 'peeking');
}

/**
 * Whether the armadillo should roll in response to a hit.
 *
 * Wiki: "An armadillo can hide in its shell when it is hurt". The attacker is remembered as a threat so
 * the rolled state persists rather than ending as soon as it stops moving.
 */
export function onArmadilloHurt(mob, attacker = null, { threatSeconds = 5 } = {}) {
  if (!isArmadillo(mob)) return false;
  mob.lastAttacker = attacker ?? null;
  mob.threatTimer = attacker ? threatSeconds : 0;
  if (attacker) {
    mob.rollState = 'rolled';
    mob.noThreatSeconds = 0;
    mob.peekTimer = ARMADILLO_PEEK_SECONDS.min;
    return true;
  }
  return false;
}

/** The hitbox for an armadillo, which shrinks for a baby. */
export function armadilloDimensions(mob) {
  return mob?.isBaby ? { ...ARMADILLO_BABY_DIMENSIONS } : { ...ARMADILLO_DIMENSIONS };
}

/**
 * Advance the scute-shedding timer.
 *
 * Wiki: "Armadillos drop 1 armadillo scute every 5-10 minutes", and the timer resets to a new random value
 * between 6000 and 12000 ticks. Returns true on the tick a scute is shed.
 */
export function updateArmadilloScutes(mob, dt, random = Math.random) {
  if (!isArmadillo(mob)) return false;
  mob.scuteTimer = (mob.scuteTimer ?? rollScuteDelay(random)) - dt;
  if (mob.scuteTimer > 0) return false;
  mob.scuteTimer = rollScuteDelay(random);
  return true;
}

/** A fresh shed delay in seconds, from the wiki's 6000-12000 ticks. */
export function rollScuteDelay(random = Math.random) {
  const { min, max } = ARMADILLO_SCUTE_SECONDS;
  return min + random() * (max - min);
}

/**
 * Brushing an armadillo.
 *
 * Wiki: using a brush on it drops 1 armadillo scute and costs the brush 16 durability.
 *
 * Returns true when a scute was taken.
 */
export function brushArmadillo(mob, itemId, { consumeDurability = null } = {}) {
  if (!isArmadillo(mob) || mob.health <= 0) return false;
  if (String(itemId ?? '').toLowerCase() !== 'brush') return false;
  consumeDurability?.(ARMADILLO_BRUSH_DURABILITY);
  return true;
}

/**
 * Whether spiders should flee from this armadillo.
 *
 * Wiki: "Spiders and cave spiders flee from armadillos when within 6 blocks of them. This only takes
 * effect when the armadillo is not rolled up in its shell."
 */
export function spidersFleeFrom(mob) {
  return isArmadillo(mob) && !isRolledUp(mob);
}

/** Whether an armadillo repels the given mob type right now. */
export function repelsMob(mob, type) {
  return spidersFleeFrom(mob) && ARMADILLO_SPIDER_TYPES.includes(type);
}

/**
 * Advance a baby's growth.
 *
 * Wiki: 24000 ticks, accelerated by 10% per spider eye, and stopped by a golden dandelion.
 *
 * Returns true on the step it matures.
 */
export function updateArmadilloGrowth(mob, dt) {
  if (!isArmadillo(mob) || !mob.isBaby) return false;
  if (mob.ageLocked) return false;
  mob.growthTimer = (mob.growthTimer ?? ARMADILLO_GROWTH_SECONDS) - dt;
  if (mob.growthTimer > 0) return false;
  mob.isBaby = false;
  mob.growthTimer = 0;
  const dims = armadilloDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  mob.mesh?.scale?.setScalar?.(1);
  return true;
}

/** Wiki: a spider eye takes 10% off the remaining growth time. */
export function accelerateArmadilloGrowth(mob, fraction = ARMADILLO_FEED_ACCELERATION) {
  if (!isArmadillo(mob) || !mob.isBaby) return 0;
  // A golden dandelion stops the aging entirely, so feeding must not burn the timer silently.
  if (mob.ageLocked) return 0;
  const before = mob.growthTimer ?? ARMADILLO_GROWTH_SECONDS;
  const removed = before * fraction;
  mob.growthTimer = Math.max(0, before - removed);
  return removed;
}

/** Wiki: armadillos follow players holding spider eyes within 10 blocks, and babies follow adults. */
export function armadilloFollows(mob, player, itemId, adult = null) {
  if (!isArmadillo(mob) || !player?.position) return false;
  if (mob.isBaby && adult?.mesh?.position) {
    return mob.mesh.position.distanceTo(adult.mesh.position) <= ARMADILLO_FOLLOW_RANGE;
  }
  if (String(itemId ?? '').toLowerCase() !== ARMADILLO_BREEDING_FOOD) return false;
  return mob.mesh.position.distanceTo(player.position) <= ARMADILLO_FOLLOW_RANGE;
}

/** The breeding food. Spider eyes only, per the wiki. */
export function isArmadilloBreedingFood(itemId) {
  return String(itemId ?? '').toLowerCase() === ARMADILLO_BREEDING_FOOD;
}

/**
 * Death drops.
 *
 * Wiki: armadillos drop **no items** on death — the scute comes from shedding and brushing — and
 * "killing a baby armadillo yields no items nor experience". 1-3 XP with credit.
 */
export function armadilloDrops(mob) {
  if (!isArmadillo(mob)) return [];
  return [];
}

/** Wiki: 1-3 XP with credit, and none for a baby. */
export function armadilloXp(mob) {
  if (!isArmadillo(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/** Wiki: 1-7 XP on a successful breeding, which the shared breeding path awards. */
export function armadilloBreedingXp() {
  return 1 + Math.floor(Math.random() * 7);
}

/**
 * Pose the armadillo.
 *
 * A rolled armadillo is a ball: the model tips nose-to-tail and tucks its legs. A peeking one lifts its
 * head back out, which the wiki calls out as an occasional check rather than a constant state.
 */
export function poseArmadillo(mob, phase = 0) {
  if (!isArmadillo(mob) || !mob.mesh) return;
  const rolled = mob.rollState === 'rolled';
  const peeking = mob.rollState === 'peeking';
  if (rolled || peeking) {
    // Tuck into a ball, with a slow rock so it does not read as a frozen prop.
    mob.mesh.rotation.x = peeking ? -0.35 : -1.1;
    mob.mesh.rotation.z = Math.sin(phase * 1.4) * 0.05;
    if (mob.head) mob.head.rotation.x = peeking ? -0.6 : 0.9;
    for (const leg of mob.legs ?? []) {
      if (leg?.rotation) leg.rotation.x = 1.2;
    }
    return;
  }
  mob.mesh.rotation.x = 0;
  mob.mesh.rotation.z = 0;
  if (mob.head) mob.head.rotation.x = 0;
  // A standing armadillo waddles its legs.
  (mob.legs ?? []).forEach((leg, index) => {
    if (leg?.rotation) leg.rotation.x = Math.sin(phase * 6 + index * 0.5) * 0.4;
  });
}
