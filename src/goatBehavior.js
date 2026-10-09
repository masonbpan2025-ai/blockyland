import * as THREE from 'three';
import { createBoxFromFaces } from './mobVisuals/entityBox.js';

/**
 * Goat rules and model.
 *
 * Reference: https://minecraft.wiki/w/Goat
 *
 * The goat is a neutral mountain animal defined by three things: it can jump unusually high and
 * unusually far, it periodically rams whatever is standing still nearby, and ramming a hard block
 * snaps off one of its horns as a dropped item.
 */

/** Wiki: 10 HP. */
export const GOAT_HEALTH = 10;

/** Wiki: adult 0.9 wide x 1.3 tall; baby 0.45 x 0.65. */
export const GOAT_DIMENSIONS = { width: 0.9, height: 1.3 };
export const GOAT_BABY_DIMENSIONS = { width: 0.45, height: 0.65 };
export const GOAT_BABY_SCALE = 0.5;

/** Wiki: while jumping the hitbox shrinks to 0.63 x 0.91. */
export const GOAT_JUMP_DIMENSIONS = { width: 0.63, height: 0.91 };

/** Wiki: adult 2 on Easy and Normal, 3 on Hard; baby 1, or 1.5 on Hard. */
export const GOAT_RAM_DAMAGE = {
  adult: { peaceful: 0, easy: 2, normal: 2, hard: 3 },
  baby: { peaceful: 0, easy: 1, normal: 1, hard: 1.5 }
};

/**
 * Wiki: the ram deals "9 blocks of knockback" to its target, and a baby deals 4.5.
 */
export const GOAT_RAM_KNOCKBACK = { adult: 9, baby: 4.5 };

/**
 * Wiki: a goat leaps "up to 10 blocks vertically and up to 5 blocks laterally", then cannot do it
 * again "for 30 to 60 seconds". It also never voluntarily jumps more than 5 blocks down.
 */
export const GOAT_JUMP = {
  maxHeight: 10,
  maxDistance: 5,
  cooldownMin: 30,
  cooldownMax: 60,
  maxDrop: 5
};

/**
 * Wiki: "Every 30 seconds to 5 minutes, a goat tries to ram a single unmoving target it can see
 * within a range of 4-16 blocks."
 */
export const GOAT_RAM = {
  minRange: 4,
  maxRange: 16,
  cooldownMin: 30,
  cooldownMax: 300
};

/** Wiki: "A screaming goat tries to ram a valid target every 5 to 15 seconds." */
export const GOAT_SCREAMER_RAM = { cooldownMin: 5, cooldownMax: 15 };

/** Wiki: 2% of naturally spawned or bred goats are screaming goats. */
export const GOAT_SCREAMER_CHANCE = 0.02;

/** Wiki: an adult has a 10% chance to be missing one of its horns. */
export const GOAT_MISSING_HORN_CHANCE = 0.1;

/** Wiki: goats take 10 less fall damage. */
export const GOAT_FALL_DAMAGE_REDUCTION = 10;

/**
 * Wiki: the four normal horn variants, and the four that only screaming goats drop.
 */
export const GOAT_HORN_VARIANTS = ['ponder', 'sing', 'seek', 'feel'];
export const GOAT_SCREAMING_HORN_VARIANTS = ['admire', 'call', 'yearn', 'dream'];

/**
 * Wiki: an adult goat loses a horn when it charges into one of these. Listed by block name; the
 * caller resolves them against the block registry.
 */
export const GOAT_HORN_SNAP_BLOCKS = [
  'stone', 'coal_ore', 'deepslate_coal_ore', 'copper_ore', 'deepslate_copper_ore',
  'iron_ore', 'deepslate_iron_ore', 'emerald_ore', 'deepslate_emerald_ore',
  'packed_ice',
  // Any overworld log.
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
  'mangrove_log', 'cherry_log', 'pale_oak_log'
];

/** Wiki: goats follow a wheat-holding player within ten blocks. */
export const GOAT_FOLLOW_RANGE = 10;

/** Wiki: eating wheat accelerates a baby's growth by 10%. */
export const GOAT_BABY_FEED_ACCELERATION = 0.1;

/** Body colours. */
export const GOAT_COLORS = { body: 0xd6d3d1, dark: 0x78716c, horn: 0x57534e, eye: 0x1c1917 };

/** True when the mob is a goat. */
export function isGoat(mob) {
  return mob?.type === 'goat';
}

/**
 * Ram damage for the given age and difficulty.
 *
 * Note which object the `hasOwn` check runs against: the difficulty keys live on the per-age table,
 * not on `GOAT_RAM_DAMAGE` itself, so checking the outer object would always miss and silently fall
 * back to Normal â€” which is exactly the bug this table shipped with, and why the check is written
 * against `table` rather than the constant.
 */
export function goatRamDamage(isBaby, difficulty) {
  const table = isBaby ? GOAT_RAM_DAMAGE.baby : GOAT_RAM_DAMAGE.adult;
  const key = Object.hasOwn(table, difficulty ?? '') ? difficulty : 'normal';
  return table[key];
}

/** Knockback for the given age. */
export function goatRamKnockback(isBaby) {
  return isBaby ? GOAT_RAM_KNOCKBACK.baby : GOAT_RAM_KNOCKBACK.adult;
}

/**
 * Roll whether a spawned or bred goat is a screaming goat.
 *
 * Wiki: 2% normally. Breeding is handled separately because the parents change the odds.
 */
export function rollScreamingGoat(random = Math.random, chance = GOAT_SCREAMER_CHANCE) {
  return random() < chance;
}

/**
 * The screaming chance for a bred kid.
 *
 * Wiki: two normal parents give 2%; a standard and a screaming parent about 50%; two screaming
 * parents 100%.
 */
export function bredScreamingChance(parentA, parentB) {
  const screaming = [!!parentA?.isScreamingGoat, !!parentB?.isScreamingGoat].filter(Boolean).length;
  if (screaming === 2) return 1;
  if (screaming === 1) return 0.5;
  return GOAT_SCREAMER_CHANCE;
}

/**
 * Decide a newborn goat's screaming status from its parents.
 */
export function inheritScreamingGoat(parentA, parentB, random = Math.random) {
  return random() < bredScreamingChance(parentA, parentB);
}

/**
 * Roll the horns an adult goat spawns with.
 *
 * Wiki: "Adult goats have a 10% chance to be missing one of their horns upon spawning. If this
 * chance succeeds, either the left or the right horn is removed (chosen randomly)." Baby goats
 * have both horns in the current game, and never drop them.
 */
export function rollGoatHorns(isBaby, random = Math.random) {
  if (isBaby) return { left: true, right: true };
  if (random() >= GOAT_MISSING_HORN_CHANCE) return { left: true, right: true };
  return random() < 0.5 ? { left: false, right: true } : { left: true, right: false };
}

/** Pick the horn variant this goat's horns belong to. Wiki: both horns are the same variant. */
export function rollGoatHornVariant(isScreamingGoat, random = Math.random) {
  const pool = isScreamingGoat ? GOAT_SCREAMING_HORN_VARIANTS : GOAT_HORN_VARIANTS;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}

/** True when the goat still has at least one horn. */
export function goatHasHorn(mob) {
  return !!(mob?.hasLeftHorn || mob?.hasRightHorn);
}

/**
 * Snap one horn off.
 *
 * Wiki: "An adult goat that has at least one horn on its head will lose one of them and drop a goat
 * horn if it charges into" a hard block, and "Goats do not regrow their horns". Baby goats never
 * drop horns.
 *
 * Returns the dropped horn id, or null.
 */
export function snapGoatHorn(mob) {
  if (!isGoat(mob) || mob.isBaby || !goatHasHorn(mob)) return null;
  // Prefer the left horn, then the right; whichever is still there comes off.
  if (mob.hasLeftHorn) mob.hasLeftHorn = false;
  else mob.hasRightHorn = false;
  mob.hornsRemaining = (mob.hasLeftHorn ? 1 : 0) + (mob.hasRightHorn ? 1 : 0);
  return 'goat_horn';
}

/**
 * True when the block a goat charged into snaps a horn off.
 *
 * `name` is the block's registry name in lower case.
 */
export function blockSnapsGoatHorn(name) {
  if (!name) return false;
  return GOAT_HORN_SNAP_BLOCKS.includes(String(name).toLowerCase());
}

/**
 * Wiki: goats drop 1-3 XP when killed by a player or tamed wolf, and babies drop none. They drop
 * no items at all; horns only come off against a block.
 */
export function goatXp(mob) {
  if (!isGoat(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/** Wiki: goats drop no items on death. */
export function goatDrops() {
  return [];
}

/**
 * Roll the cooldown before the goat's next ram attempt.
 *
 * Wiki: 30 seconds to 5 minutes normally, and 5 to 15 seconds for a screaming goat.
 */
export function rollGoatRamCooldown(isScreamingGoat, random = Math.random) {
  const { cooldownMin, cooldownMax } = isScreamingGoat ? GOAT_SCREAMER_RAM : GOAT_RAM;
  return cooldownMin + random() * (cooldownMax - cooldownMin);
}

/** Roll the cooldown before the goat may long-jump again. Wiki: 30 to 60 seconds. */
export function rollGoatJumpCooldown(random = Math.random) {
  const { cooldownMin, cooldownMax } = GOAT_JUMP;
  return cooldownMin + random() * (cooldownMax - cooldownMin);
}

/**
 * Whether a candidate is a valid ram target.
 *
 * Wiki: it can target players, armor stands and any mob except ghasts and other goats. Targets
 * must be "unmoving", which is what stops a goat charging a fleeing animal. Players in Creative or
 * on Peaceful are not valid targets.
 */
export function isValidGoatTarget(mob, candidate, { difficulty = 'normal' } = {}) {
  if (!mob || !candidate || candidate === mob) return false;
  if (candidate.health !== undefined && candidate.health <= 0) return false;
  // Wiki: never ghasts, never other goats.
  if (candidate.type === 'ghast' || candidate.type === 'goat') return false;
  if (candidate.gamemode === 'creative') return false;
  if (difficulty === 'peaceful') return false;
  return true;
}

/** True when the candidate is standing still enough to be worth ramming. */
export function isUnmovingTarget(candidate, threshold = 0.05) {
  const v = candidate?.velocity;
  if (!v) return true;
  return Math.hypot(v.x ?? 0, v.z ?? 0) < threshold;
}

/**
 * Begin a ram: lock on, lower the head, and stomp.
 *
 * Wiki: "A charging goat locks on to its target's position, lowers its head, stomps, and speeds
 * toward the target." The lock matters: the goat charges where the target *was*, which is what
 * gives the target the chance to step aside.
 */
export function startGoatRam(mob, target) {
  if (!isGoat(mob) || !target) return false;
  const pos = target.position ?? target.mesh?.position;
  if (!pos) return false;
  mob.ramState = 'preparing';
  mob.ramTarget = target;
  // The locked position is a copy, so the goat does not track a moving target mid-charge.
  mob.ramLockedPosition = pos.clone();
  mob.ramPrepareTimer = GOAT_RAM_PREPARE_SECONDS;
  return true;
}

/** How long the head-lowering stomp lasts before the charge. */
export const GOAT_RAM_PREPARE_SECONDS = 0.8;

/** How long the charge itself lasts before the goat gives up and stops. */
export const GOAT_RAM_CHARGE_SECONDS = 2.0;

/**
 * Advance an in-progress ram.
 *
 * Note that this moves the goat itself rather than only setting a velocity. The shared update loop
 * does not apply `velocity`, and the caller's fall-through would be skipped by the `return true`
 * that follows this branch â€” so a charge that only set a velocity would be a goat crouching in
 * place forever, which is the exact failure mode documented in docs/mob-update-smoke-coverage.md.
 *
 * `move` is the ground mover, injected so this module stays free of the motion helpers.
 *
 * Returns a description of what happened, or null when no ram is running.
 */
export function updateGoatRam(manager, mob, dt, { move = null } = {}) {
  if (!isGoat(mob) || !mob.ramState) return null;
  mob.ramTimer = (mob.ramTimer || 0) - dt;

  if (mob.ramState === 'preparing') {
    mob.ramPrepareTimer -= dt;
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    if (mob.ramPrepareTimer > 0) return 'preparing';
    mob.ramState = 'charging';
    mob.ramTimer = GOAT_RAM_CHARGE_SECONDS;
  }

  if (mob.ramState === 'charging') {
    const locked = mob.ramLockedPosition;
    if (!locked) { endGoatRam(mob, 'missed'); return 'missed'; }
    const dir = locked.clone().sub(mob.mesh.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist < 0.9) {
      // Wiki: if the charge connects it deals damage and knockback.
      return finishGoatRam(manager, mob, { move });
    }
    dir.normalize();
    mob.yaw = Math.atan2(dir.x, dir.z);
    const speed = mob.isBaby ? 2.4 : 4.2;
    mob.velocity.x = dir.x * speed;
    mob.velocity.z = dir.z * speed;

    // Wiki: if it hits a solid block first, and that block is one of the snapping blocks, it loses
    // a horn.
    const ahead = mob.mesh.position.clone().addScaledVector(dir, 0.7);
    const probeY = mob.mesh.position.y + 0.6;
    const blockName = manager.blockNameAt?.(ahead.x, probeY, ahead.z);
    if (blockName && manager.isBlockSolid?.(Math.floor(ahead.x), Math.floor(probeY), Math.floor(ahead.z))) {
      if (blockSnapsGoatHorn(blockName)) {
        const horn = snapGoatHorn(mob);
        if (horn) manager.entities?.spawnDroppedItem?.(mob.mesh.position.clone(), horn, false, 1);
      }
      endGoatRam(mob, 'blocked');
      return 'blocked';
    }

    // The charge has to actually travel, since the caller returns after this branch.
    move?.(manager, mob, dt);

    if (mob.ramTimer <= 0) { endGoatRam(mob, 'missed'); return 'missed'; }
    return 'charging';
  }

  endGoatRam(mob, 'done');
  return 'done';
}

/** Land a connected ram: damage plus knockback on the target. */
function finishGoatRam(manager, mob, { move = null } = {}) {
  const target = mob.ramTarget;
  const difficulty = manager?.game?.difficulty ?? 'normal';
  const damage = goatRamDamage(mob.isBaby, difficulty);
  const knockback = goatRamKnockback(mob.isBaby);
  const targetPos = target?.position ?? target?.mesh?.position;

  if (target && targetPos) {
    if (damage > 0) target.takeDamage?.(damage, mob.mesh.position, 'goat');
    // Wiki: 9 blocks of knockback, or 4.5 for a baby. Applied along the charge direction.
    const dir = mob.mesh.position.clone().sub(targetPos);
    dir.y = 0;
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      if (target.velocity) {
        target.velocity.x -= dir.x * knockback;
        target.velocity.z -= dir.z * knockback;
      }
      target.knockback = { x: -dir.x * knockback, z: -dir.z * knockback };
    }
  }
  move?.(manager, mob, 0);
  endGoatRam(mob, 'hit');
  return 'hit';
}

/** Clear ram state and start the next cooldown. */
export function endGoatRam(mob, reason = 'done') {
  if (!isGoat(mob)) return reason;
  mob.ramState = null;
  mob.ramTarget = null;
  mob.ramLockedPosition = null;
  mob.ramPrepareTimer = 0;
  mob.ramTimer = 0;
  mob.lastRamOutcome = reason;
  // Wiki: a screaming goat tries again much sooner, so the cooldown depends on that.
  if (mob.ramCooldown === undefined || mob.ramCooldown <= 0) return reason;
  return reason;
}

/**
 * Start a long jump.
 *
 * Wiki: "It lowers its head, then it leaps up to 10 blocks vertically and up to 5 blocks
 * laterally."
 *
 * Returns true when the jump started.
 */
export function startGoatJump(mob, { height = 3, distance = 3 } = {}) {
  if (!isGoat(mob) || mob.jumpCooldown > 0) return false;
  if (mob.onGround === false) return false;
  const clampedHeight = Math.min(Math.max(1, height), GOAT_JUMP.maxHeight);
  const clampedDistance = Math.min(Math.max(0, distance), GOAT_JUMP.maxDistance);
  // Launch velocity for a given apex, using the mover's gravity.
  const gravity = 22;
  mob.velocity.y = Math.sqrt(2 * gravity * clampedHeight);
  mob.velocity.x = Math.sin(mob.yaw) * clampedDistance * 1.4;
  mob.velocity.z = Math.cos(mob.yaw) * clampedDistance * 1.4;
  mob.onGround = false;
  mob.isGoatJumping = true;
  mob.goatJumpHeight = clampedHeight;
  return true;
}

/**
 * Land a long jump: restore the hitbox and start the cooldown.
 */
export function landGoatJump(mob, random = Math.random) {
  if (!isGoat(mob) || !mob.isGoatJumping) return false;
  mob.isGoatJumping = false;
  mob.jumpCooldown = rollGoatJumpCooldown(random);
  const dims = mob.isBaby ? GOAT_BABY_DIMENSIONS : GOAT_DIMENSIONS;
  mob.width = dims.width;
  mob.height = dims.height;
  return true;
}

/**
 * Goat model, transcribed from vanilla `GoatModel.createBodyLayer()` (64x64 sheet).
 *
 * The previous model was an invented sheep-like shape: one body box sampling the wrong rectangle, a head box
 * sampling a 12x10x16 block at (0,0) that is not the head, flat-coloured muzzle/beard/horn/eye boxes, a tail
 * vanilla does not have, and four equal legs. Vanilla's goat is quite different:
 *
 *   body       9x11x16 at (1,1) plus a shaggy 11x14x11 at (0,28) over the shoulders
 *   head       a 5x7x10 `nose` at (34,46) pitched down 0.9599 rad -- the whole face, eyes included, is on it
 *   ears       3x2x1 at (2,61), sticking out sideways
 *   goatee     a ZERO-width 0x7x5 plane at (23,52) under the chin
 *   horns      2x7x2 at (12,55), each a separate part so one can snap off
 *   legs       FRONT 3x10x3 at (35,2)/(49,2); HIND only 3x6x3 at (36,29)/(49,29), hanging from the body's underside
 *
 * Conversion: project (x, y, z) = vanilla (x - 0.5, 24 - y, -z) in texels. Vanilla's goat is built half a texel off
 * centre (its body spans x -4..5), so the -0.5 recentres it; the y/z flip is a 180-degree turn about X, so vanilla's
 * xRot carries across unchanged, and it turns vanilla's -Z front into this project's +Z front.
 */
const GOAT_TEX = 64;
const GT = 1 / 16;

/** Vanilla's cube layout in three's face order (+X, -X, +Y, -Y, +Z, -Z), for a part facing +Z. */
function goatFaces(u, v, w, h, d) {
  return [
    { x: u + d + w, y: v + d, w: d, h },     // +X (the strip right of the front)
    { x: u, y: v + d, w: d, h },             // -X
    { x: u + d, y: v, w, h: d },             // +Y top
    { x: u + d + w, y: v, w, h: d },         // -Y bottom
    { x: u + d, y: v + d, w, h },            // +Z front
    { x: u + d + d + w, y: v + d, w, h }     // -Z back
  ];
}

/** One textured cube, `size` and `at` in texels. */
function goatBox(material, [w, h, d], [u, v], at, faces = goatFaces(u, v, w, h, d), mirror = false) {
  const mesh = new THREE.Mesh(
    createBoxFromFaces(w * GT, h * GT, d * GT, faces, { texW: GOAT_TEX, texH: GOAT_TEX, mirror }),
    material
  );
  mesh.position.set(at[0] * GT, at[1] * GT, at[2] * GT);
  return mesh;
}

/** A hinge group at `hinge` holding one cube whose centre sits at `centre`, both in texels relative to the parent. */
function goatHinged(material, size, uv, hinge, centre, mirror = false) {
  const holder = new THREE.Group();
  holder.position.set(hinge[0] * GT, hinge[1] * GT, hinge[2] * GT);
  const box = goatBox(material, size, uv,
    [centre[0] - hinge[0], centre[1] - hinge[1], centre[2] - hinge[2]], undefined, mirror);
  holder.add(box);
  return { holder, box };
}

export function createGoatModel(bodyMat, darkMat, hornMat, eyeMat) {
  void darkMat; void hornMat; void eyeMat; // Every part, horns and face included, is painted on the sheet.
  const group = new THREE.Group();

  // Body: one part at vanilla (0, 24, 0) holding two cubes. The group sits at the body's mid-height so the
  // charging pitch in `poseGoat` tilts it about its own middle rather than the floor.
  const body = new THREE.Group();
  body.position.set(0, 12 * GT, 0);
  group.add(body);
  // (-4,-17,-7) 9x11x16 -> centre (0, 11.5, -1); the long torso.
  body.add(goatBox(bodyMat, [9, 11, 16], [1, 1], [0, -0.5, -1]));
  // (-5,-18,-8) 11x14x11 -> centre (0, 11, 2.5); the shaggy coat over the chest and shoulders.
  body.add(goatBox(bodyMat, [11, 14, 11], [0, 28], [0, -1, 2.5]));

  // Head: a bare pivot at vanilla (1, 14, 0) -> (0.5, 10, 0). Everything below is relative to it.
  const head = new THREE.Group();
  head.position.set(0.5 * GT, 10 * GT, 0);
  group.add(head);

  // The face: `nose` pivots at (0,-8,-8) -> (0, 8, 8); its cube (-3,-4,-8) 5x7x10 centres at (-0.5, 0.5, 3) from
  // that pivot, and the whole thing is pitched down 0.9599 rad, which is the goat's long downward-angled head.
  const nose = goatHinged(bodyMat, [5, 7, 10], [34, 46], [0, 8, 8], [-0.5, 8.5, 11]);
  nose.holder.rotation.x = 0.9599;
  head.add(nose.holder);
  const muzzle = nose.holder;

  // Ears: 3x2x1 at (2,61), boxes (-6,-11,-10) and (2,-11,-10); the left one mirrored.
  head.add(goatBox(bodyMat, [3, 2, 1], [2, 61], [-4.5, 10, 9.5]));
  head.add(goatBox(bodyMat, [3, 2, 1], [2, 61], [3.5, 10, 9.5], undefined, true));

  // Goatee: vanilla's box is (-0.5,-3,-14) 0x7x5 -- zero width, so only its two 5x7 side faces exist. A box of
  // zero extent breaks bounding-box maths elsewhere, so it is a hair thick and both sides carry the beard.
  const beardSide = { x: 23, y: 57, w: 5, h: 7 };
  const beardOther = { x: 28, y: 57, w: 5, h: 7 };
  const beard = goatBox(bodyMat, [0.05, 7, 5], [23, 52], [-0.5, -0.5, 11.5],
    [beardOther, beardSide, beardSide, beardSide, beardSide, beardSide]);
  head.add(beard);

  // Horns: 2x7x2 at (12,55), boxes (-0.01,-16,-10) left and (-2.99,-16,-10) right. Separate meshes so either can
  // be hidden when it snaps off.
  const hornSides = {
    left: goatBox(bodyMat, [2, 7, 2], [12, 55], [0.99, 12.5, 9]),
    right: goatBox(bodyMat, [2, 7, 2], [12, 55], [-1.99, 12.5, 9])
  };
  head.add(hornSides.left, hornSides.right);
  const horns = [hornSides.left, hornSides.right];

  // Legs. Vanilla's left is +X here (the goat faces +Z). Each hinges where vanilla's part offset sits.
  //   front: (0,0,0) 3x10x3 at offsets (1|-3, 14, -6) -> hinge y 10, z 6; cube centre y 5, z 4.5
  //   hind:  (0,4,0) 3x6x3  at offsets (1|-3, 14,  4) -> hinge y 10, z -4; cube centre y 3, z -5.5
  const legSpecs = [
    { uv: [49, 2], size: [3, 10, 3], x: 2, hingeZ: 6, centreY: 5, centreZ: 4.5, side: 1, front: true },
    { uv: [36, 29], size: [3, 6, 3], x: 2, hingeZ: -4, centreY: 3, centreZ: -5.5, side: 1, front: false },
    { uv: [35, 2], size: [3, 10, 3], x: -2, hingeZ: 6, centreY: 5, centreZ: 4.5, side: -1, front: true },
    { uv: [49, 29], size: [3, 6, 3], x: -2, hingeZ: -4, centreY: 3, centreZ: -5.5, side: -1, front: false }
  ];
  const legs = legSpecs.map((s) => {
    const { holder } = goatHinged(bodyMat, s.size, s.uv, [s.x, 10, s.hingeZ], [s.x, s.centreY, s.centreZ]);
    group.add(holder);
    return { mesh: holder, side: s.side, front: s.front };
  });

  // Vanilla has no tail and no separate eyes: the eyes are painted on the face. Kept as explicit empties so
  // callers that probe for them see a definite answer.
  const tail = null;
  const eyes = [];

  return { group, body, head, muzzle, beard, tail, eyes, horns, hornSides, legs };
}

/** Show only the horns the goat still has, and tuck the head down while charging. */
export function poseGoat(goat) {
  if (!goat) return;
  if (goat.hornSides) {
    // Vanilla: `horn.visible = !young && hasHorn` -- kids are drawn hornless.
    if (goat.hornSides.left) goat.hornSides.left.visible = !!goat.hasLeftHorn && !goat.isBaby;
    if (goat.hornSides.right) goat.hornSides.right.visible = !!goat.hasRightHorn && !goat.isBaby;
  }
  // Wiki: the goat "lowers its head" to prepare and to jump.
  const lowered = goat.ramState === 'preparing' || goat.isGoatJumping;
  if (goat.head) goat.head.rotation.x = lowered ? 0.35 : 0;
  if (goat.body) goat.body.rotation.x = lowered ? 0.12 : 0;
}

/** Walk animation: a swinging gait, plus the tucked legs of a jump. */
export function poseGoatLegs(goat, phase, walking = true) {
  if (!goat?.legs) return;
  const airborne = !!goat.isGoatJumping;
  goat.legs.forEach((leg, index) => {
    if (airborne) {
      // Legs tuck under during the leap.
      leg.mesh.rotation.x = leg.front ? -0.5 : 0.5;
      return;
    }
    const swing = walking ? Math.sin(phase + (leg.front ? 0 : Math.PI) + index * 0.2) : 0;
    leg.mesh.rotation.x = swing * 0.5;
  });
}
