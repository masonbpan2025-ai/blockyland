import * as THREE from 'three';

/**
 * Camel rules: the sit/stand cycle, the dash, the tall step, fall tolerance and two-seat riding.
 *
 * Reference: https://minecraft.wiki/w/Camel
 *
 * The camel is defined by three things nothing else here has: it **sits down** on a timer, it can **dash**
 * 12 blocks forward, and it **steps up 1.5 blocks** so it walks over fences. It is also the only mob here
 * with **two seats**.
 */

/** Wiki: 32 HP. */
export const CAMEL_HEALTH = 32;

/** Wiki: adult 1.7 wide x 2.375 tall; sitting 1.7 x 0.945; baby 0.85 x 1.1875. */
export const CAMEL_DIMENSIONS = { width: 1.7, height: 2.375 };
export const CAMEL_SITTING_DIMENSIONS = { width: 1.7, height: 0.945 };
export const CAMEL_BABY_DIMENSIONS = { width: 0.85, height: 1.1875 };
export const CAMEL_BABY_SCALE = 0.5;

/**
 * Wiki: "Camels have the unique ability to step up 1.5 blocks, allowing them to surmount fences and walls
 * with ease", unlike horses, donkeys and mules which cannot step up more than one block without jumping.
 */
export const CAMEL_STEP_HEIGHT = 1.5;

/**
 * Wiki: "Camels can safely fall 6 blocks before they begin to accumulate fall damage, unlike most mobs,
 * which can safely fall 3 blocks. Camels also take half of the normal fall damage (rounded up)".
 */
export const CAMEL_FALL = { safeBlocks: 6, damagePerBlock: 0.5 };

/** Wiki: "Camels can dash every 2.75 seconds. When dashing, the camel launches up to 12 blocks forward and one block upward." */
export const CAMEL_DASH = { cooldownSeconds: 2.75, forward: 12, upward: 1 };

/** Wiki: "can also manually sprint at a speed of 8.203 blocks/s", against a walking speed of 3.885. */
export const CAMEL_SPEED = { walk: 3.885, sprint: 8.203 };

/** Wiki: it "occasionally sits for two to seven seconds before standing up again". */
export const CAMEL_SIT = { minSeconds: 2, maxSeconds: 7 };

/**
 * Wiki: a sitting camel "does not stand up if there are solid blocks above them, as doing so would inflict
 * suffocation damage". So standing is refused when the space above is too short for the full height.
 */
export const CAMEL_STAND_CLEARANCE = CAMEL_DIMENSIONS.height - CAMEL_SITTING_DIMENSIONS.height;

/** Wiki: "Camels are healed by 2 health points each time they are fed a cactus", and heal slowly on their own. */
export const CAMEL_CACTUS_HEAL = 2;

/** Wiki: "Camels have a 1/900 chance to regenerate 1 health point each game tick." */
export const CAMEL_REGEN_CHANCE = 1 / 900;

/** Wiki: "Baby camels take 24000 ticks (20 minutes) to grow up", accelerated by "10 seconds off" per cactus. */
export const CAMEL_BABY_GROWTH_SECONDS = 1200;
export const CAMEL_CACTUS_GROWTH_SECONDS = 10;

/** Wiki: "Camels follow players holding cactus but stop following when separated ... by 10 blocks". */
export const CAMEL_FOLLOW_RANGE = 10;

/** Wiki: the breeding food is a cactus. */
export const CAMEL_BREEDING_FOOD = 'cactus';

/** Wiki: "Up to two players can ride one camel", and "Baby camels cannot be equipped or ridden". */
export const CAMEL_SEATS = 2;

/** Wiki: a saddle can be equipped, and removed with shears. */
export const CAMEL_EQUIPMENT = { item: 'saddle', remover: 'shears' };

/** Body colours: a sandy tan coat with a darker hump and lighter belly. */
export const CAMEL_COLORS = { coat: 0xd9b382, hump: 0xb98d5a, belly: 0xf0dcc0, hoof: 0x6b4f35, eye: 0x2b2118 };

/** True when the mob is a camel. */
export function isCamel(mob) {
  return mob?.type === 'camel';
}

/** The hitbox for a camel: shorter while sitting, half-size for a baby. */
export function camelDimensions(mob) {
  if (mob?.isBaby) return { ...CAMEL_BABY_DIMENSIONS };
  if (mob?.isSitting) return { ...CAMEL_SITTING_DIMENSIONS };
  return { ...CAMEL_DIMENSIONS };
}

/** Wiki: "Baby camels cannot be equipped or ridden." */
export function camelCanBeRidden(mob) {
  if (!isCamel(mob)) return false;
  return !mob.isBaby;
}

/** Wiki: riding requires a saddle, but camels are "naturally tame" so no taming step is needed. */
export function camelCanBeControlled(mob) {
  return camelCanBeRidden(mob) && mob.hasSaddle === true;
}

/**
 * Whether the camel can seat another rider.
 *
 * Wiki: "Up to two players can ride one camel", and the back seat cannot hurt the driver or the camel.
 */
export function camelCanSeat(mob) {
  if (!camelCanBeRidden(mob)) return false;
  return (mob.riderCount ?? 0) < CAMEL_SEATS;
}

/** Equip a saddle. Wiki: a camel has one inventory slot for a saddle. */
export function equipCamelSaddle(mob, itemId) {
  if (!isCamel(mob) || mob.isBaby) return false;
  if (String(itemId ?? '') !== CAMEL_EQUIPMENT.item) return false;
  if (mob.hasSaddle) return false;
  mob.hasSaddle = true;
  return true;
}

/** Wiki: "Saddles can now be removed from camels using shears." */
export function removeCamelSaddle(mob, itemId) {
  if (!isCamel(mob)) return false;
  if (String(itemId ?? '') !== CAMEL_EQUIPMENT.remover) return false;
  if (!mob.hasSaddle) return false;
  mob.hasSaddle = false;
  return true;
}

/**
 * Whether the camel may stand up.
 *
 * Wiki: a sitting camel "does not stand up if there are solid blocks above them, as doing so would inflict
 * suffocation damage". `clearance` is the headroom in blocks above the sitting camel.
 */
export function camelCanStand(mob, clearance = Infinity) {
  if (!isCamel(mob)) return false;
  if (!mob.isSitting) return false;
  return clearance >= CAMEL_STAND_CLEARANCE;
}

/**
 * Sit down.
 *
 * Wiki: it sits occasionally for 2-7 seconds. A sitting camel cannot be pushed, and its hitbox shrinks.
 * Returns true when it sat.
 */
export function camelSit(mob) {
  if (!isCamel(mob) || mob.isSitting || mob.isBaby) return false;
  // A ridden camel cannot sit.
  if ((mob.riderCount ?? 0) > 0) return false;
  mob.isSitting = true;
  const dims = camelDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  return true;
}

/**
 * Stand up.
 *
 * Returns 'stood' when it stood, or 'blocked' when the headroom is too short -- the wiki's suffocation
 * guard. A blocked camel stays sitting, which is the point of the rule.
 */
export function camelStand(mob, clearance = Infinity) {
  if (!isCamel(mob) || !mob.isSitting) return null;
  if (!camelCanStand(mob, clearance)) return 'blocked';
  mob.isSitting = false;
  const dims = camelDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  return 'stood';
}

/**
 * Advance the sit timer.
 *
 * Wiki: it "occasionally sits for two to seven seconds before standing up again", and "immediately flee[s]
 * after being harmed, even when sitting", and "sitting camels immediately start to stand up and follow once
 * they notice the player holding cactus".
 *
 * Returns 'sat', 'stood', 'blocked' or null.
 */
export function updateCamelSitting(mob, dt, {
  clearance = Infinity, random = Math.random, alerted = false, fleeing = false, tempted = false
} = {}) {
  if (!isCamel(mob) || mob.isBaby) return null;

  // Wiki: it flees when harmed even while sitting, so a fleeing camel stands.
  if ((fleeing || alerted) && mob.isSitting) {
    const result = camelStand(mob, clearance);
    if (result === 'stood') return 'stood';
    // Blocked: it stays down, which the wiki says prevents suffocation.
    return 'blocked';
  }
  // Wiki: a cactus-tempted sitting camel stands to follow.
  if (tempted && mob.isSitting) {
    const result = camelStand(mob, clearance);
    return result === 'stood' ? 'stood' : 'blocked';
  }

  if (mob.isSitting) {
    mob.sitTimer = (mob.sitTimer ?? 0) - dt;
    if (mob.sitTimer > 0) return null;
    const result = camelStand(mob, clearance);
    if (result === 'stood') return 'stood';
    // Blocked, so try again shortly rather than giving up on standing.
    mob.sitTimer = 1;
    return 'blocked';
  }

  // Standing: count down to the next sit.
  mob.standTimer = (mob.standTimer ?? rollCamelStandDelay(random)) - dt;
  if (mob.standTimer <= 0) {
    if (camelSit(mob)) {
      mob.sitTimer = CAMEL_SIT.minSeconds
        + random() * (CAMEL_SIT.maxSeconds - CAMEL_SIT.minSeconds);
      return 'sat';
    }
  }
  return null;
}

/** A fresh wait before sitting, which the wiki does not fix, so it is drawn from the sit window. */
export function rollCamelStandDelay(random = Math.random) {
  // Stand for a while between sittings; the wiki only bounds the sit itself.
  return 4 + random() * 6;
}

/**
 * The dash.
 *
 * Wiki: "Dashing is done using the jump control ... When dashing, the camel launches up to 12 blocks forward
 * and one block upward", and "Camels can dash every 2.75 seconds". Returns the launch velocity, or null
 * when the dash is unavailable.
 */
export function camelDash(mob, {
  gravity = 18, charged = true, hasSaddle = null, riderCount = null
} = {}) {
  if (!isCamel(mob) || mob.isBaby) return null;
  // Wiki: only a SADDLED camel can dash, because the dash uses the jump control while riding.
  const saddled = hasSaddle ?? mob.hasSaddle === true;
  if (!saddled) return null;
  const riders = riderCount ?? mob.riderCount ?? 0;
  if (riders <= 0) return null;
  if ((mob.dashCooldown ?? 0) > 0) return null;

  mob.dashCooldown = CAMEL_DASH.cooldownSeconds;
  // A short dash when the control is tapped rather than held, which the wiki describes as "holding the
  // control charges for a longer dashing".
  const scale = charged ? 1 : 0.4;
  const forward = CAMEL_DASH.forward * scale;
  const rise = CAMEL_DASH.upward;
  // v = sqrt(2gh) for the upward launch, and the airtime gives the horizontal speed for the distance.
  const vy = Math.sqrt(2 * gravity * rise);
  const airtime = (2 * vy) / gravity;
  const speed = airtime > 0 ? forward / airtime : 0;
  return new THREE.Vector3(Math.sin(mob.yaw ?? 0) * speed, vy, Math.cos(mob.yaw ?? 0) * speed);
}

/** Advance the dash cooldown. Returns true on the frame it becomes ready again. */
export function updateCamelDash(mob, dt) {
  if (!isCamel(mob)) return false;
  const before = mob.dashCooldown ?? 0;
  mob.dashCooldown = Math.max(0, before - dt);
  return before > 0 && mob.dashCooldown === 0;
}

/**
 * Fall damage for a camel.
 *
 * Wiki: it falls 6 blocks safely rather than 3, and then takes half a heart of damage per block rather
 * than a full one. Returns the damage, which is 0 inside the safe distance.
 */
export function camelFallDamage(blocksFallen) {
  const beyond = (blocksFallen ?? 0) - CAMEL_FALL.safeBlocks;
  if (beyond <= 0) return 0;
  return Math.ceil(beyond * CAMEL_FALL.damagePerBlock);
}

/**
 * Advance the camel's slow self-healing.
 *
 * Wiki: "Camels have a 1/900 chance to regenerate 1 health point each game tick." `dt` is in seconds, so
 * the per-tick chance is scaled to the 20 ticks a second the wiki means.
 */
export function updateCamelRegen(mob, dt, random = Math.random) {
  if (!isCamel(mob)) return 0;
  if (mob.health >= mob.maxHealth) return 0;
  const ticks = dt * 20;
  // The expected number of successes in this window, with a fractional part rolled fairly.
  const expected = CAMEL_REGEN_CHANCE * ticks;
  const whole = Math.floor(expected);
  let heal = whole;
  if (random() < expected - whole) heal += 1;
  if (heal <= 0) return 0;
  const before = mob.health;
  mob.health = Math.min(mob.maxHealth, mob.health + heal);
  return mob.health - before;
}

/** Wiki: a cactus heals 2 HP. Returns the amount healed. */
export function feedCamelCactus(mob) {
  if (!isCamel(mob)) return 0;
  if (mob.health >= mob.maxHealth) return 0;
  const before = mob.health;
  mob.health = Math.min(mob.maxHealth, mob.health + CAMEL_CACTUS_HEAL);
  return mob.health - before;
}

/**
 * Advance a baby camel's growth.
 *
 * Wiki: 24000 ticks (20 minutes), accelerated by 10 seconds per cactus, and stopped by a golden dandelion.
 * Returns true on the step it matures.
 */
export function updateCamelGrowth(mob, dt) {
  if (!isCamel(mob) || !mob.isBaby) return false;
  if (mob.ageLocked) return false;
  mob.growthTimer = (mob.growthTimer ?? CAMEL_BABY_GROWTH_SECONDS) - dt;
  if (mob.growthTimer > 0) return false;
  mob.isBaby = false;
  mob.growthTimer = 0;
  const dims = camelDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  mob.mesh?.scale?.setScalar?.(1);
  return true;
}

/** Wiki: each cactus takes 10 seconds off the remaining growth. */
export function accelerateCamelGrowth(mob, seconds = CAMEL_CACTUS_GROWTH_SECONDS) {
  if (!isCamel(mob) || !mob.isBaby) return 0;
  // A golden dandelion stops the aging, so feeding must not burn the timer silently.
  if (mob.ageLocked) return 0;
  const before = mob.growthTimer ?? CAMEL_BABY_GROWTH_SECONDS;
  const removed = Math.min(before, seconds);
  mob.growthTimer = before - removed;
  return removed;
}

/** Wiki: camels follow a cactus-holding player within 10 blocks, and babies follow adults. */
export function camelFollows(mob, player, itemId, adult = null) {
  if (!isCamel(mob) || !player?.position) return false;
  if (mob.isBaby && adult?.mesh?.position) {
    return mob.mesh.position.distanceTo(adult.mesh.position) <= CAMEL_FOLLOW_RANGE;
  }
  if (String(itemId ?? '').toLowerCase() !== CAMEL_BREEDING_FOOD) return false;
  return mob.mesh.position.distanceTo(player.position) <= CAMEL_FOLLOW_RANGE;
}

/** True for the camel's breeding food. */
export function isCamelBreedingFood(itemId) {
  return String(itemId ?? '').toLowerCase() === CAMEL_BREEDING_FOOD;
}

/**
 * Death drops.
 *
 * Wiki: it drops its SADDLE if it had one, and "killing a baby camel yields neither items nor
 * experience". The wiki gives no other item drops, so there are none.
 */
export function camelDrops(mob) {
  if (!isCamel(mob) || mob.isBaby) return [];
  const rows = [];
  if (mob.hasSaddle) rows.push([CAMEL_EQUIPMENT.item, false, 1, 1]);
  return rows;
}

/** Wiki: 1-3 XP with credit, and none for a baby. */
export function camelXp(mob) {
  if (!isCamel(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/** Wiki: 1-7 XP on a successful breeding, which the shared breeding path awards. */
export function camelBreedingXp() {
  return 1 + Math.floor(Math.random() * 7);
}

/**
 * Build a camel model: a tall body on long legs, a single hump, a long neck and a small head.
 *
 * The single hump is deliberate: the wiki notes the camel is based on the one-humped dromedary, and that
 * the first model wrongly had two.
 */
export function createCamelModel(coatMat, humpMat, bellyMat, hoofMat, eyeMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.5), coatMat);
  body.position.y = 1.45;
  group.add(body);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.35), bellyMat);
  belly.position.y = 1.1;
  group.add(belly);

  // Exactly one hump.
  const hump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.9), humpMat);
  hump.position.set(0, 2.05, -0.1);
  group.add(hump);

  // A long neck rising to a small head, which is what makes the camel tall enough to protect its riders.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), coatMat);
  neck.position.set(0, 2.1, 0.7);
  group.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.7), coatMat);
  head.position.set(0, 2.6, 0.95);
  group.add(head);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.3), bellyMat);
  muzzle.position.set(0, -0.06, 0.44);
  head.add(muzzle);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eye.position.set(side * 0.22, 0.08, 0.28);
    head.add(eye);
    eyes.push(eye);
  }

  // Long legs, four of them.
  const legGeo = new THREE.BoxGeometry(0.22, 1.1, 0.22);
  const legs = [];
  for (const [lx, lz] of [[-0.32, 0.5], [0.32, 0.5], [-0.32, -0.5], [0.32, -0.5]]) {
    const leg = new THREE.Mesh(legGeo, coatMat);
    leg.position.set(lx, 0.55, lz);
    group.add(leg);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.26), hoofMat);
    hoof.position.y = -0.52;
    leg.add(hoof);
    legs.push(leg);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), humpMat);
  tail.position.set(0, 1.5, -0.85);
  group.add(tail);

  // The saddle, hidden until equipped.
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 0.8), hoofMat);
  saddle.position.set(0, 1.9, 0.1);
  saddle.visible = false;
  group.add(saddle);

  return { group, body, belly, hump, neck, head, muzzle, eyes, legs, tail, saddle };
}

/**
 * Pose the camel.
 *
 * Sitting folds the legs under the body and drops it, which is the wiki's sit pose. The ear wiggle is a
 * purely visual tic the wiki describes happening every few seconds regardless of state.
 */
export function poseCamel(mob, phase = 0) {
  if (!isCamel(mob) || !mob.mesh) return;
  if (mob.isSitting) {
    // Folded: the body drops and the legs tuck under.
    mob.mesh.position.y = (mob.groundY ?? mob.mesh.position.y) - 0.5;
    for (const leg of mob.legs ?? []) {
      if (leg?.rotation) leg.rotation.x = 1.4;
    }
    if (mob.neck) mob.neck.rotation.x = 0.5;
    return;
  }
  if (mob.groundY !== undefined && mob.mesh.position.y < mob.groundY) mob.mesh.position.y = mob.groundY;
  (mob.legs ?? []).forEach((leg, index) => {
    if (leg?.rotation) leg.rotation.x = Math.sin(phase * 3 + index * 0.8) * 0.35;
  });
  if (mob.neck) mob.neck.rotation.x = 0;
  // The head raise and ear wiggle, which the wiki says happens every few seconds regardless of state.
  if (mob.head) {
    const cycle = (phase % 6) / 6;
    const raised = cycle < 0.1 ? Math.sin(cycle * Math.PI * 10) * 0.12 : 0;
    mob.head.rotation.x = -raised;
    mob.head.rotation.z = cycle > 0.1 && cycle < 0.25 ? Math.sin(phase * 30) * 0.06 : 0;
  }
  if (mob.tail) mob.tail.rotation.z = Math.sin(phase * 1.5) * 0.15;
}
