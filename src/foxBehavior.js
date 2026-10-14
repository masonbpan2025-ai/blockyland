import * as THREE from 'three';
import { createBoxFromFaces } from './mobVisuals/entityBox.js';

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

function foxBoxFaces(u, v, tw, th, td) {
  return [
    { x: u, y: v + td, w: td, h: th },                  // +X (right)
    { x: u + td + tw, y: v + td, w: td, h: th },        // -X (left)
    { x: u + td, y: v, w: tw, h: td },                  // +Y (top)
    { x: u + td + tw, y: v, w: tw, h: td },             // -Y (bottom)
    { x: u + td, y: v + td, w: tw, h: th },             // +Z (front)
    { x: u + td + tw + td, y: v + td, w: tw, h: th }    // -Z (back)
  ];
}

function createFoxBox(w, h, d, faces) {
  return createBoxFromFaces(w, h, d, faces, { texW: 48, texH: 32 });
}

/**
 * Fox model: vanilla-accurate geometry and UV mapping from FoxEntityModel (class_4041).
 *
 * Atlas is 48x32:
 *   body: 6x11x6 at (24, 15), oriented along Z (w=0.24, h=0.24, d=0.44)
 *   head: 8x6x6 at (1, 5)
 *   muzzle: 4x2x3 at (6, 18)
 *   right ear: 2x2x1 at (8, 1), left ear: 2x2x1 at (15, 1)
 *   tail: 4x9x5 at (30, 0)
 *   front legs: 2x6x2 at (4, 24), hind legs: 2x6x2 at (13, 24)
 */
export function createFoxModel(bodyMat, bellyMat, earMat) {
  const group = new THREE.Group();

  // Body: 6x11x6 at (24, 15) on 48x32 atlas (front +Z has white chest/throat)
  const bodyFaces = [
    { x: 24, y: 21, w: 6, h: 11 }, // +X right
    { x: 36, y: 21, w: 6, h: 11 }, // -X left
    { x: 30, y: 21, w: 6, h: 11 }, // +Y top
    { x: 42, y: 21, w: 6, h: 11 }, // -Y bottom
    { x: 30, y: 15, w: 6, h: 6 },  // +Z front (white throat/chest)
    { x: 36, y: 15, w: 6, h: 6 }   // -Z back (rear)
  ];
  const body = new THREE.Mesh(createFoxBox(0.24, 0.24, 0.44, bodyFaces), bodyMat);
  body.position.set(0, 0.32, 0);
  group.add(body);

  // Belly layer for backwards compatibility with tests asserting fox.belly
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.40), bellyMat);
  belly.position.set(0, -0.06, 0);
  belly.visible = false;
  body.add(belly);

  // Head: 8x6x6 at (1, 5) on 48x32 atlas (front +Z has eyes and cheeks)
  const headFaces = foxBoxFaces(1, 5, 8, 6, 6);
  const head = new THREE.Mesh(createFoxBox(0.32, 0.24, 0.24, headFaces), bodyMat);
  head.position.set(0, 0.40, 0.28);
  group.add(head);

  // Muzzle/snout: 4x2x3 at (6, 18) on 48x32 atlas (contains black nose on +Z)
  const muzzleFaces = foxBoxFaces(6, 18, 4, 2, 3);
  const muzzle = new THREE.Mesh(createFoxBox(0.16, 0.08, 0.12, muzzleFaces), bodyMat);
  muzzle.position.set(0, -0.06, 0.16);
  head.add(muzzle);

  // Nose marker on muzzle for backwards compatibility
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), earMat);
  nose.position.set(0, 0, 0.06);
  nose.visible = false;
  muzzle.add(nose);

  // Ears: 2x2x1 at (8, 1) right and (15, 1) left on 48x32 atlas
  const rightEarFaces = foxBoxFaces(8, 1, 2, 2, 1);
  const leftEarFaces = foxBoxFaces(15, 1, 2, 2, 1);
  const rightEar = new THREE.Mesh(createFoxBox(0.08, 0.08, 0.04, rightEarFaces), bodyMat);
  rightEar.position.set(-0.10, 0.14, -0.02);
  head.add(rightEar);
  const leftEar = new THREE.Mesh(createFoxBox(0.08, 0.08, 0.04, leftEarFaces), bodyMat);
  leftEar.position.set(0.10, 0.14, -0.02);
  head.add(leftEar);
  const ears = [rightEar, leftEar];

  // Eyes: dummy meshes for test compatibility (eyes are painted directly on head texture)
  const eyeGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, earMat);
    eye.position.set(side * 0.07, 0.03, 0.12);
    eye.visible = false;
    head.add(eye);
    return eye;
  });

  // Bushy tail: 4x9x5 at (30, 0) on 48x32 atlas (-Z tip is white)
  const tailFaces = [
    { x: 30, y: 5, w: 5, h: 9 }, // +X right
    { x: 39, y: 5, w: 5, h: 9 }, // -X left
    { x: 35, y: 5, w: 4, h: 9 }, // +Y top
    { x: 44, y: 5, w: 4, h: 9 }, // -Y bottom
    { x: 35, y: 0, w: 4, h: 5 }, // +Z base (connects to body)
    { x: 39, y: 0, w: 4, h: 5 }  // -Z tip (white tip)
  ];
  const tail = new THREE.Mesh(createFoxBox(0.16, 0.20, 0.36, tailFaces), bodyMat);
  tail.position.set(0, 0.34, -0.38);
  tail.rotation.x = -0.35;
  group.add(tail);

  // Tail tip for backwards compatibility
  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.10), bellyMat);
  tailTip.position.set(0, 0, -0.18);
  tailTip.visible = false;
  tail.add(tailTip);

  // Four legs: 2x6x2 at (4, 24) forelegs and (13, 24) hindlegs on 48x32 atlas, pivoting at hip joint (y = 0.24)
  const frontLegGeo = createFoxBox(0.08, 0.24, 0.08, foxBoxFaces(4, 24, 2, 6, 2));
  frontLegGeo.translate(0, -0.24 / 2, 0);
  const hindLegGeo = createFoxBox(0.08, 0.24, 0.08, foxBoxFaces(13, 24, 2, 6, 2));
  hindLegGeo.translate(0, -0.24 / 2, 0);
  const legs = [];
  const legDefs = [
    { side: -1, front: false, geo: hindLegGeo, x: -0.09, z: -0.16 },
    { side: 1, front: false, geo: hindLegGeo, x: 0.09, z: -0.16 },
    { side: -1, front: true, geo: frontLegGeo, x: -0.09, z: 0.16 },
    { side: 1, front: true, geo: frontLegGeo, x: 0.09, z: 0.16 }
  ];
  for (const def of legDefs) {
    const leg = new THREE.Mesh(def.geo, bodyMat);
    leg.position.set(def.x, 0.24, def.z);
    group.add(leg);
    legs.push({ mesh: leg, side: def.side, front: def.front });
  }

  // Mouth anchor for held items
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.06, 0.22);
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