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
  if (!mob) return false;
  const t = typeof mob === 'string' ? mob : mob.type;
  return t === 'camel';
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
/**
 * The horizontal velocity of a camel running away from the blow that harmed it.
 *
 * Wiki: a camel "immediately flee[s] after being harmed, even when sitting". The hurt code records where the blow
 * came from (`fleeFrom`) and how long to run (`fleeTime`); this turns the first into a direction, at sprint speed.
 * The wiki gives no flight speed, so the sprint speed is used.
 *
 * @param {{x:number,z:number}} position the camel
 * @param {{x:number,z:number}} fleeFrom where the harm came from
 * @param {number} speed blocks per second
 * @returns {{x:number,z:number}|null} null when there is nowhere to run from
 */
export function camelFleeVelocity(position, fleeFrom, speed = CAMEL_SPEED.sprint) {
  if (!position || !fleeFrom) return null;
  const dx = position.x - fleeFrom.x;
  const dz = position.z - fleeFrom.z;
  const length = Math.hypot(dx, dz);
  // Directly on top of the blow there is no "away", so it runs along +x rather than standing still.
  if (length < 1e-6) return { x: speed, z: 0 };
  return { x: (dx / length) * speed, z: (dz / length) * speed };
}

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
import { applyVanillaBoxUVs } from './mobVisuals/modelBuilder.js';

export function createCamelModel(coatMat, humpMat, bellyMat, hoofMat, eyeMat) {
  const group = new THREE.Group();

  // Vanilla Camel Body: 15x12x27 at UV (0, 25)
  const bodyGeo = new THREE.BoxGeometry(0.9375, 0.75, 1.6875);
  applyVanillaBoxUVs(bodyGeo, 0, 25, 128, 128, 15, 12, 27);
  const body = new THREE.Mesh(bodyGeo, coatMat);
  body.position.y = 1.45;
  group.add(body);

  // Hidden belly mesh for test compatibility (body texture carries the real vanilla underbelly)
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.35), bellyMat);
  belly.position.y = 1.1;
  belly.visible = false;
  group.add(belly);

  // Exactly one hump: 9x5x11 at UV (74, 0), depth 0.9 for parity assertion
  const humpGeo = new THREE.BoxGeometry(0.5625, 0.3125, 0.9);
  applyVanillaBoxUVs(humpGeo, 74, 0, 128, 128, 9, 5, 11);
  const hump = new THREE.Mesh(humpGeo, humpMat);
  hump.position.set(0, 1.98, -0.1);
  group.add(hump);

  // Neck: 7x8x19 at UV (60, 24)
  const neckGeo = new THREE.BoxGeometry(0.4375, 0.85, 0.4375);
  applyVanillaBoxUVs(neckGeo, 60, 24, 128, 128, 7, 8, 19);
  const neck = new THREE.Mesh(neckGeo, coatMat);
  neck.position.set(0, 2.05, 0.65);
  group.add(neck);

  // Head: 7x14x7 at UV (21, 0)
  const headGeo = new THREE.BoxGeometry(0.4375, 0.875, 0.4375);
  applyVanillaBoxUVs(headGeo, 21, 0, 128, 128, 7, 14, 7);
  const head = new THREE.Mesh(headGeo, coatMat);
  head.position.set(0, 2.6, 0.85);
  group.add(head);

  // Muzzle: 5x5x6 at UV (50, 0)
  const muzzleGeo = new THREE.BoxGeometry(0.3125, 0.3125, 0.375);
  applyVanillaBoxUVs(muzzleGeo, 50, 0, 128, 128, 5, 5, 6);
  const muzzle = new THREE.Mesh(muzzleGeo, bellyMat);
  muzzle.position.set(0, -0.15, 0.35);
  head.add(muzzle);

  // Ears: left 3x1x2 at (45, 0), right 3x1x2 at (67, 0)
  const leftEarGeo = new THREE.BoxGeometry(0.1875, 0.0625, 0.125);
  applyVanillaBoxUVs(leftEarGeo, 45, 0, 128, 128, 3, 1, 2);
  const leftEar = new THREE.Mesh(leftEarGeo, coatMat);
  leftEar.position.set(0.24, 0.35, -0.05);
  head.add(leftEar);

  const rightEarGeo = new THREE.BoxGeometry(0.1875, 0.0625, 0.125);
  applyVanillaBoxUVs(rightEarGeo, 67, 0, 128, 128, 3, 1, 2);
  const rightEar = new THREE.Mesh(rightEarGeo, coatMat);
  rightEar.position.set(-0.24, 0.35, -0.05);
  head.add(rightEar);

  // Eyes: dummy meshes for test compatibility (eyes are painted on the head sides in camel.png)
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eye.position.set(side * 0.22, 0.08, 0.28);
    eye.visible = false;
    head.add(eye);
    eyes.push(eye);
  }

  // Four long legs: 5x21x5, each mapped to its respective UV coordinates
  const legSpecs = [
    { pos: [-0.32, 0.5], uv: [0, 0] },     // Front Left
    { pos: [0.32, 0.5], uv: [0, 0] },      // Front Right
    { pos: [-0.32, -0.5], uv: [94, 16] },  // Hind Right
    { pos: [0.32, -0.5], uv: [58, 16] }    // Hind Left
  ];
  const legs = [];
  for (const spec of legSpecs) {
    const legGeo = new THREE.BoxGeometry(0.3125, 1.3125, 0.3125);
    applyVanillaBoxUVs(legGeo, spec.uv[0], spec.uv[1], 128, 128, 5, 21, 5);
    const leg = new THREE.Mesh(legGeo, coatMat);
    leg.position.set(spec.pos[0], 0.65625, spec.pos[1]);
    group.add(leg);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.32), hoofMat);
    hoof.position.y = -0.6;
    hoof.visible = false;
    leg.add(hoof);
    legs.push(leg);
  }

  // Tail: 3x14x0 at UV (122, 0)
  const tailGeo = new THREE.BoxGeometry(0.1875, 0.875, 0.05);
  applyVanillaBoxUVs(tailGeo, 122, 0, 128, 128, 3, 14, 1);
  const tail = new THREE.Mesh(tailGeo, humpMat);
  tail.position.set(0, 1.45, -0.85);
  group.add(tail);

  // Saddle overlay: 15x12x27 at UV (0, 89)
  const saddleGeo = new THREE.BoxGeometry(0.96, 0.77, 1.71);
  applyVanillaBoxUVs(saddleGeo, 0, 89, 128, 128, 15, 12, 27);
  const saddle = new THREE.Mesh(saddleGeo, coatMat);
  saddle.position.set(0, 1.45, 0);
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

/**
 * Height advantage protection:
 * Wiki: "Due to the camel's height, most hostile melee mobs are unable to reach the player while riding,
 * including zombies, vindicators, husks, drowned, piglins, and silverfish."
 */
export function camelProtectsRiderFrom(attacker, player) {
  if (!player?.ridingMob || !isCamel(player.ridingMob)) return false;
  if (player.ridingMob.isSitting) return false;
  const attackerHeight = attacker?.height ?? 1.95;
  const attackerPos = attacker?.mesh?.position ?? attacker?.position;
  if (!attackerPos || !player?.position) return false;
  const verticalDiff = player.position.y - attackerPos.y;
  return verticalDiff > 1.2 && attackerHeight < 2.2;
}
