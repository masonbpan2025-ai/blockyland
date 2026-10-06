import * as THREE from 'three';
import { applyQuadUvs } from './mobVisuals/entityBox.js';

/**
 * Fox rules and model.
 *
 * Reference: https://minecraft.wiki/w/Fox
 *
 * The fox's defining traits are that it hunts small animals, pounces, carries an item in its
 * mouth, sleeps during the day under cover, and is only tame in the sense of *trusting* the
 * player who bred it.
 */

/** Wiki: 10 HP (lowered from 20 in 1.14-pre4). */
export const FOX_HEALTH = 10;

/** Wiki: adult 0.6 wide x 0.7 tall; baby 0.36 x 0.42. */
export const FOX_DIMENSIONS = { width: 0.6, height: 0.7 };
export const FOX_BABY_DIMENSIONS = { width: 0.36, height: 0.42 };
export const FOX_BABY_SCALE = 0.6;

/** Wiki: 2 damage on Easy and Normal, 3 on Hard. */
export const FOX_DAMAGE = { peaceful: 0, easy: 2, normal: 2, hard: 3 };

/** Wiki: a fox can safely fall 5 blocks, versus the usual 3. */
export const FOX_SAFE_FALL_BLOCKS = 5;

/** Wiki: the fox targets these mobs. */
export const FOX_PREY = ['chicken', 'rabbit', 'cod', 'salmon', 'tropical_fish', 'turtle'];

/**
 * Wiki: 20% of foxes spawn holding an item, and the per-item weights differ between editions.
 *
 * The Java column is implemented. The weights sum to 100 each, which a test asserts, because a
 * typo here would silently skew every fox's mouth contents.
 */
export const FOX_HELD_ITEM_WEIGHTS = [
  { id: 'emerald', weight: 5 },
  { id: 'rabbit_foot', weight: 10 },
  { id: 'rabbit_hide', weight: 10 },
  { id: 'egg', weight: 15 },
  { id: 'wheat', weight: 20 },
  { id: 'leather', weight: 20 },
  { id: 'feather', weight: 20 }
];

/** Wiki: the chance a wild fox spawns with something in its mouth. */
export const FOX_HELD_ITEM_CHANCE = 0.2;

/**
 * Wiki: a fox eats whatever food it picks up after 30 seconds.
 */
export const FOX_EAT_SECONDS = 30;

/** Wiki: foxes sleep only where the sky light is 14 or less. */
export const FOX_SLEEP_MAX_SKY_LIGHT = 14;

/** How long a pounce takes, matching the wiki's described crouch-then-leap sequence. */
export const FOX_POUNCE = { crouch: 0.4, air: 0.5, reach: 4 };

/** Body colours per variant. */
export const FOX_COAT_COLORS = {
  red: { base: 0xd97706, belly: 0xfef3c7, ear: 0x1c1917 },
  snow: { base: 0xf8fafc, belly: 0xe2e8f0, ear: 0x94a3b8 }
};

/** True when the mob is a fox. */
export function isFox(mob) {
  return mob?.type === 'fox';
}

/** Melee damage at the given difficulty. */
export function foxDamageFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(FOX_DAMAGE, key) ? FOX_DAMAGE[key] : FOX_DAMAGE.normal;
}

/**
 * Wiki: red foxes spawn in taigas and old growth taigas, snow foxes in groves and snowy taigas.
 */
export function rollFoxCoat(biome = null) {
  const snowy = ['grove', 'snowy_taiga', 'snowy_taiga_hills'];
  return (biome && snowy.includes(biome)) ? 'snow' : 'red';
}

/**
 * Pick a held item, or null.
 *
 * Uses a cumulative walk over the wiki's weights so the table stays readable and the selection
 * is exact rather than a set of nested thresholds.
 */
export function rollFoxHeldItem(random = Math.random, chance = FOX_HELD_ITEM_CHANCE) {
  if (random() >= chance) return null;
  const total = FOX_HELD_ITEM_WEIGHTS.reduce((n, e) => n + e.weight, 0);
  let roll = random() * total;
  for (const entry of FOX_HELD_ITEM_WEIGHTS) {
    roll -= entry.weight;
    if (roll < 0) return entry.id;
  }
  // Floating-point edge: fall through to the last entry rather than returning undefined.
  return FOX_HELD_ITEM_WEIGHTS[FOX_HELD_ITEM_WEIGHTS.length - 1].id;
}

/** Paint the coat onto the fox's meshes. */
export function applyFoxCoat(mob) {
  if (!isFox(mob)) return;
  const colors = FOX_COAT_COLORS[mob.coat] ?? FOX_COAT_COLORS.red;
  mob.bodyMat?.color?.setHex(colors.base);
  mob.bellyMat?.color?.setHex(colors.belly);
  mob.earMat?.color?.setHex(colors.ear);
}

/**
 * Wiki: a baby fox inherits one parent's variant, and a red x snow pairing is a 50/50.
 */
export function inheritFoxCoat(a, b, random = Math.random) {
  if (a === b) return a;
  return random() < 0.5 ? a : b;
}

/**
 * Death drops.
 *
 * Wiki: a fox "always drops any item they pick up and are still holding", plus the item it
 * spawned with, and 1-3 XP. Wiki also notes a fox holding a totem of undying consumes it instead
 * of dropping it, which is handled by the caller because it is a revival, not a drop.
 */
export function foxDrops(mob) {
  if (!isFox(mob)) return [];
  const rows = [];
  // Wiki: a fox drops the item it spawned with, and drops anything it picked up and is still
  // holding. Those are the same item when an untouched fox dies, so the spawn item is counted
  // once rather than twice.
  if (mob.heldItem) rows.push([mob.heldItem, false, 1, 1]);
  if (mob.spawnedWithItem && mob.spawnedWithItem !== mob.heldItem) {
    rows.push([mob.spawnedWithItem, false, 1, 1]);
  }
  return rows;
}

/** True when the fox is holding a totem of undying, which saves it from death. */
export function foxHasTotem(mob) {
  return isFox(mob) && (mob.heldItem === 'totem_of_undying' || mob.spawnedWithItem === 'totem_of_undying');
}

/**
 * Consume a held totem instead of dying.
 *
 * Wiki: "If a fox is killed while holding a totem of undying, then the fox consumes the totem
 * and revives itself instead of dropping the totem."
 *
 * Returns true when the totem saved the fox.
 */
export function consumeFoxTotem(mob) {
  if (!foxHasTotem(mob)) return false;
  // Both slots are cleared, because an untouched fox's held item *is* its spawn item and leaving
  // one of them set would make the "consumed" totem drop anyway.
  mob.heldItem = null;
  mob.spawnedWithItem = null;
  if (mob.mesh) mob.mesh.visible = true;
  // The wiki gives the totem's usual effects; with no effect system on mobs, the revive itself
  // is what is observable.
  mob.totemConsumed = true;
  return true;
}

/**
 * Whether the fox should be asleep.
 *
 * Wiki: during the day, and if a thunderstorm is not occurring, a fox sleeps where the sky light
 * is 14 or less. Block light is explicitly irrelevant.
 */
export function foxCanSleep(manager, mob, isDaytime, isThundering = false) {
  if (!isFox(mob) || mob.health <= 0) return false;
  if (!isDaytime || isThundering) return false;
  const pos = mob.mesh.position;
  const skyLight = lightAt(manager, pos.x, pos.y, pos.z);
  return skyLight <= FOX_SLEEP_MAX_SKY_LIGHT;
}

/** Sky light at a position, with a day/night fallback like the other mobs use. */
export function lightAt(manager, x, y, z) {
  const world = manager?.world;
  if (typeof world?.getLightLevel === 'function') {
    const level = world.getLightLevel(x, y, z);
    if (typeof level === 'number') return level;
  }
  const worldTime = manager?.game?.worldTime ?? 6000;
  return worldTime < 12000 ? 15 : 0;
}

/** True when the fox trusts this player, which is what stops it fleeing. */
export function foxTrusts(mob, player) {
  return isFox(mob) && !!mob.trustedPlayer && mob.trustedPlayer === player;
}

/**
 * Whether the fox should flee from the player.
 *
 * Wiki: foxes "flee from nearby wolves, polar bears or players unless the player is trusted or
 * approaches them while sneaking". The sneaking exception is the interesting half.
 */
export function foxShouldFlee(mob, player, { sneaking = false, range = 8 } = {}) {
  if (!isFox(mob) || !player?.position) return false;
  if (foxTrusts(mob, player)) return false;
  if (sneaking) return false;
  return mob.mesh.position.distanceTo(player.position) < range;
}

/** True when the fox may attack that mob type. */
export function foxCanAttackType(mob, type) {
  return isFox(mob) && FOX_PREY.includes(type);
}

/**
 * Start a pounce.
 *
 * Wiki: the fox crouches, lowering and tilting its head, then leaps up to four blocks into the
 * air, clearing fences and walls.
 */
export function startFoxPounce(mob) {
  if (!isFox(mob)) return false;
  mob.pouncePhase = 'crouch';
  mob.pounceTimer = FOX_POUNCE.crouch;
  mob.velocity.x = 0;
  mob.velocity.z = 0;
  return true;
}

/**
 * Advance the pounce. Crouch first, then leap toward the target.
 *
 * Returns 'crouching', 'leaping' or null.
 */
export function updateFoxPounce(mob, dt, targetPos = null) {
  if (!isFox(mob) || !mob.pouncePhase) return null;
  mob.pounceTimer = (mob.pounceTimer || 0) - dt;
  if (mob.pounceTimer > 0) return mob.pouncePhase === 'crouch' ? 'crouching' : 'leaping';

  if (mob.pouncePhase === 'crouch') {
    // The leap itself.
    mob.pouncePhase = 'air';
    mob.pounceTimer = FOX_POUNCE.air;
    let dirX = Math.sin(mob.yaw);
    let dirZ = Math.cos(mob.yaw);
    if (targetPos) {
      const dir = targetPos.clone().sub(mob.mesh.position);
      dir.y = 0;
      if (dir.lengthSq() > 1e-6) { dir.normalize(); dirX = dir.x; dirZ = dir.z; }
    }
    // "leaps up to four blocks into the air", which is what clears a fence.
    mob.velocity.set(dirX * 4.2, 7.2, dirZ * 4.2);
    mob.isPouncing = true;
    return 'leaping';
  }

  // The leap finished.
  mob.pouncePhase = null;
  mob.pounceTimer = 0;
  mob.isPouncing = false;
  return null;
}

/**
 * Fox model: a slender quadruped with a long bushy tail, a pointed muzzle and large ears.
 *
 * Distinct from the wolf in silhouette: the fox is lower and slighter, with a much longer tail
 * that reads at a glance.
 */
export function createFoxModel(bodyMat, bellyMat, earMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.6), bodyMat);
  applyQuadUvs(body, 0, 1, 6, 6, 12, 48, 32);
  body.position.set(0, 0.32, 0);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.5), bellyMat);
  applyQuadUvs(belly, 0, 1, 6, 6, 12, 48, 32);
  belly.position.set(0, 0.22, 0.02);
  group.add(belly);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.26), bodyMat);
  applyQuadUvs(head, 16, 10, 8, 8, 8, 48, 32);
  head.position.set(0, 0.44, 0.4);
  group.add(head);

  // Pointed muzzle, which is what separates the head from a wolf's blunt one.
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.18), bellyMat);
  applyQuadUvs(muzzle, 9, 18, 4, 3, 4, 48, 32);
  muzzle.position.set(0, -0.03, 0.2);
  head.add(muzzle);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.04), earMat);
  nose.position.set(0, 0.01, 0.1);
  muzzle.add(nose);

  // Two large triangular ears.
  const earGeo = new THREE.BoxGeometry(0.1, 0.14, 0.05);
  const ears = [-1, 1].map((side) => {
    const ear = new THREE.Mesh(earGeo, earMat);
    ear.position.set(side * 0.08, 0.16, -0.04);
    ear.rotation.z = side * 0.2;
    head.add(ear);
    return ear;
  });

  const eyeGeo = new THREE.BoxGeometry(0.045, 0.045, 0.02);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, earMat);
    eye.position.set(side * 0.07, 0.03, 0.135);
    head.add(eye);
    return eye;
  });

  // The long bushy tail.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.5), bodyMat);
  applyQuadUvs(tail, 0, 1, 6, 6, 12, 48, 32);
  tail.position.set(0, 0.34, -0.52);
  tail.rotation.x = -0.35;
  group.add(tail);

  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.14), bellyMat);
  tailTip.position.set(0, 0, -0.3);
  tail.add(tailTip);

  // Four slim legs.
  const legGeo = new THREE.BoxGeometry(0.09, 0.24, 0.09);
  const legs = [];
  for (const side of [-1, 1]) {
    for (const z of [0.2, -0.2]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(side * 0.12, 0.13, z);
      group.add(leg);
      legs.push({ mesh: leg, side, front: z > 0 });
    }
  }

  // A held item sits in the mouth; the mesh is created on demand so an empty fox has no marker.
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.04, 0.3);
  head.add(mouth);

  return { group, body, belly, head, muzzle, tail, ears, eyes, legs, mouth };
}

/** Walk animation, and the crouch that precedes a pounce. */
export function poseFoxLegs(fox, phase, walking = true) {
  const legs = fox?.legs;
  if (!legs) return;
  const crouch = fox.pouncePhase === 'crouch';
  legs.forEach((leg, index) => {
    const swing = walking ? Math.sin(phase + (leg.front ? 0 : Math.PI) + index * 0.2) : 0;
    leg.mesh.rotation.x = swing * 0.5;
  });
  // The wiki describes the pounce preparation as lowering and tilting the head and body.
  if (fox.body) fox.body.position.y = crouch ? 0.26 : 0.32;
  if (fox.head) fox.head.rotation.x = crouch ? 0.35 : 0;
  if (fox.body) fox.body.rotation.x = crouch ? 0.2 : 0;
}
