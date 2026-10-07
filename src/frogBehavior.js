import * as THREE from 'three';
import { buildModel } from './mobVisuals/modelBuilder.js';

/**
 * Frog rules and model.
 *
 * Reference: https://minecraft.wiki/w/Frog
 *
 * The frog is a passive mob defined by four things: it makes long jumps and takes reduced fall
 * damage, it swims fast and cannot drown, it has three biome-determined variants, and it eats small
 * slimes and magma cubes with its tongue, producing a froglight of a colour set by its variant.
 */

/** Wiki: 10 HP. */
export const FROG_HEALTH = 10;

/** Wiki: 0.5 wide x 0.5 tall. */
export const FROG_DIMENSIONS = { width: 0.5, height: 0.5 };

/**
 * Wiki: "They can jump up to 8 blocks high and take 5 less damage from falling than most other
 * mobs."
 */
export const FROG_JUMP = { maxHeight: 8, fallDamageReduction: 5 };

/** Wiki: in water frogs "swim and move much faster". */
export const FROG_SPEED = { land: 1.0, water: 2.4 };

/** Wiki: frogs follow a slimeball-holding player within 6 blocks. */
export const FROG_FOLLOW_RANGE = 6;

/** Wiki: the tongue pulls a mob in. Reach is generous, which is what makes the flick readable. */
export const FROG_TONGUE = { range: 6, seconds: 0.35, cooldown: 1.2 };

/**
 * Wiki: "frogs only attack slimes and magma cubes, but they never attack any cube mobs with a size
 * other than 1".
 */
export const FROG_PREY = ['slime', 'magma_cube'];
export const FROG_PREY_MAX_SIZE = 1;

/**
 * Wiki: a small slime killed by any frog always drops exactly one slimeball; a magma cube drops a
 * froglight whose colour depends on the frog's variant.
 */
export const FROG_FROGLIGHT_BY_VARIANT = {
  temperate: 'ochre_froglight',
  warm: 'pearlescent_froglight',
  cold: 'verdant_froglight'
};

/** Wiki: frogs drop 1-3 XP with credit; they drop no items. */
export const FROG_XP = 3;

/** Wiki: feeding a slimeball breeds them, and the pregnant frog lays frogspawn. */
export const FROG_BREEDING_FOOD = 'slime_ball';

/** Wiki: the three variants and the biomes that produce them. */
export const FROG_VARIANTS = ['temperate', 'warm', 'cold'];

export const FROG_COLD_BIOMES = [
  'frozen_ocean', 'deep_frozen_ocean', 'frozen_river', 'frozen_peaks', 'grove', 'ice_spikes',
  'jagged_peaks', 'snowy_beach', 'snowy_plains', 'snowy_slopes', 'snowy_taiga', 'the_end',
  'deep_dark', 'end_barrens', 'end_highlands', 'end_midlands', 'small_end_islands'
];

export const FROG_WARM_BIOMES = [
  'badlands', 'bamboo_jungle', 'basalt_deltas', 'crimson_forest', 'desert', 'eroded_badlands',
  'jungle', 'nether_wastes', 'savanna_plateau', 'savanna', 'soul_sand_valley', 'sparse_jungle',
  'warm_ocean', 'warped_forest', 'windswept_savanna', 'wooded_badlands'
];

/** Body colours per variant. */
export const FROG_COLORS = {
  temperate: { base: 0x7c6a3f, belly: 0xd9cfa3, eye: 0x1c1917 },
  warm: { base: 0xd97706, belly: 0xfde68a, eye: 0x1c1917 },
  cold: { base: 0x4d7c5f, belly: 0xb9d9b0, eye: 0x1c1917 }
};

/** True when the mob is a frog. */
export function isFrog(mob) {
  return mob?.type === 'frog';
}

/**
 * The variant for a biome.
 *
 * Wiki: swamp gives temperate, mangrove swamp gives warm, and the cold biomes give cold. Everything
 * else falls to temperate, which is what the wiki's long "other" table resolves to for the biomes
 * this project has.
 */
export function frogVariantForBiome(biome) {
  const name = String(biome ?? '').toLowerCase();
  if (name === 'mangrove_swamp') return 'warm';
  // Wiki: a swamp itself is temperate, even though the swamp biome is not "cold".
  if (name === 'swamp') return 'temperate';
  if (FROG_COLD_BIOMES.includes(name)) return 'cold';
  if (FROG_WARM_BIOMES.includes(name)) return 'warm';
  return 'temperate';
}

/** The froglight a variant produces when it eats a magma cube. */
export function froglightForVariant(variant) {
  return FROG_FROGLIGHT_BY_VARIANT[variant] ?? FROG_FROGLIGHT_BY_VARIANT.temperate;
}

/**
 * Whether a frog may eat this mob.
 *
 * Wiki: only slimes and magma cubes, and only size 1 ones — "they never attack any cube mobs with a
 * size other than 1". A size 1 cube is the smallest.
 */
export function frogCanEat(frog, candidate) {
  if (!isFrog(frog) || !candidate) return false;
  if (candidate === frog) return false;
  if (candidate.health !== undefined && candidate.health <= 0) return false;
  if (!FROG_PREY.includes(candidate.type)) return false;
  // `slimeSize` 1 is the smallest cube, which is the only size a frog eats.
  return candidate.slimeSize === FROG_PREY_MAX_SIZE;
}

/**
 * What a frog leaves behind when it eats a mob.
 *
 * Wiki: a small slime always drops exactly one slimeball, and a magma cube drops the froglight for
 * the frog's variant. A mob eaten by a frog "instantly despawns without a death animation", so this
 * is the whole drop.
 */
export function frogEatingDrops(frog, prey) {
  if (!isFrog(frog) || !prey) return [];
  if (prey.type === 'slime') return [['slime_ball', false, 1, 1]];
  if (prey.type === 'magma_cube') return [[froglightForVariant(frog.variant), true, 1, 1]];
  return [];
}

/** Wiki: frogs drop no items on death. */
export function frogDrops() {
  return [];
}

/** Wiki: 1-3 XP with credit. */
export function frogXp(mob) {
  if (!isFrog(mob)) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/**
 * Start a tongue flick at a target.
 *
 * Wiki: "Frogs attack by using their tongue to pull certain mobs into their mouth and eat them."
 * The prey is dragged to the frog's mouth, which is why the flick is a two-stage action rather than
 * a projectile.
 */
export function startFrogTongue(mob, target) {
  if (!isFrog(mob) || !target) return false;
  if (mob.tongueTimer > 0) return false;
  mob.tongueTarget = target;
  mob.tongueTimer = FROG_TONGUE.seconds;
  return true;
}

/**
 * Advance a tongue flick.
 *
 * Pulls the target toward the frog's mouth and, when it arrives, eats it. Returns 'flicking',
 * 'eaten' or null.
 */
export function updateFrogTongue(manager, mob, dt) {
  if (!isFrog(mob) || !mob.tongueTimer) return null;
  const target = mob.tongueTarget;
  mob.tongueTimer -= dt;

  // The target must still be a live mob in the world. A reference alone is not enough: a mob that
  // has despawned, been eaten by something else or been teleported away keeps its object alive, and
  // dragging it in from outside the world would move something nothing else can see.
  const stillAlive = target
    && target.mesh
    && target.health > 0
    && (manager?.mobs ? manager.mobs.includes(target) : true);
  if (!stillAlive) {
    mob.tongueTimer = 0;
    mob.tongueTarget = null;
    return null;
  }

  const mouth = mob.mesh.position.clone();
  mouth.y += 0.35;
  const targetPos = target.mesh.position;
  const dir = mouth.clone().sub(targetPos);
  const dist = dir.length();
  if (dist > 1e-6) {
    dir.normalize();
    // Drag it in quickly, which is the "pull into their mouth" part.
    targetPos.addScaledVector(dir, Math.min(dist, 7 * dt));
  }

  if (mob.tongueTimer > 0) return 'flicking';

  // It arrives: the mob is eaten and despawns without a death animation.
  return eatFrogPrey(manager, mob, target);
}

/**
 * Eat a mob.
 *
 * Wiki: "If the mob dies from this attack, it instantly despawns without a death animation", and the
 * loot is the frog-specific table. So this removes the prey outright rather than running the normal
 * death path.
 *
 * Returns 'eaten', or null when the prey was not edible.
 */
export function eatFrogPrey(manager, mob, target) {
  if (!frogCanEat(mob, target)) {
    mob.tongueTimer = 0;
    mob.tongueTarget = null;
    return null;
  }
  for (const [id, isBlock, min, max] of frogEatingDrops(mob, target)) {
    const count = min + Math.floor(Math.random() * (max - min + 1));
    if (count > 0) {
      const pos = target.mesh.position.clone();
      manager.entities?.spawnDroppedItem?.(pos, id, isBlock, count);
    }
  }
  // Despawn the prey directly: no death animation, no ordinary loot.
  target.mesh.removeFromParent?.();
  const index = manager.mobs.indexOf(target);
  if (index >= 0) manager.mobs.splice(index, 1);
  target.eatenByFrog = true;

  mob.tongueTimer = 0;
  mob.tongueTarget = null;
  mob.tongueCooldown = FROG_TONGUE.cooldown;
  mob.eatTimer = 0.4;
  return 'eaten';
}

/**
 * Frog model: a wide squat body, a broad head with bulging eyes, and long folded hind legs.
 *
 * The tongue is a separate mesh so the flick can be drawn.
 */
/** The real 48x48 frog sheet. The model lives in this module, so its texture path does too. */
const FROG_SKIN_PATH = '/assets/entity/frog/temperate_frog.png';
const FROG_MODEL = {
  texture: FROG_SKIN_PATH,
  textureSize: [48, 48],
  units: 16,
  transparent: true,
  alphaTest: 0.5,
  parts: [
    { name: 'root', box: [0, 0, 0], at: [0, 24, 0] },
    // Body 7x3x9, with a flat layer above it.
    { name: 'body', parent: 'root', box: [7, 3, 9], uv: { u: 3, v: 1, tw: 7, th: 3, td: 9 }, at: [0, -2, 4] },
    { name: 'bodyLayer', parent: 'body', plane: [9, 7], uv: { u: 23, v: 22, tw: 7, th: 9 }, at: [0, 1.5, 0], rotate: [-Math.PI / 2, 0, 0] },
    // Head 7x3x9, carrying the eyes.
    { name: 'head', parent: 'body', box: [7, 3, 9], uv: { u: 0, v: 13, tw: 7, th: 3, td: 9 }, at: [0, -2, -1] },
    { name: 'eyes', parent: 'head', box: [0, 0, 0], at: [-0.5, 0, 2] },
    { name: 'eyeRight', parent: 'eyes', box: [3, 2, 3], uv: { u: 0, v: 0, tw: 3, th: 2, td: 3 }, at: [-1.5, -3, -6.5] },
    { name: 'eyeLeft', parent: 'eyes', box: [3, 2, 3], uv: { u: 0, v: 5, tw: 3, th: 2, td: 3 }, at: [2.5, -3, -6.5] },
    // The croaking throat, which inflates; it is part of the model.
    { name: 'croak', parent: 'body', box: [7, 2, 3], uv: { u: 26, v: 5, tw: 7, th: 2, td: 3 }, at: [0, -1, -5] },
    // The tongue is FLAT: 4 wide, 7 deep, no height.
    { name: 'tongue', parent: 'body', plane: [7, 4], uv: { u: 17, v: 13, tw: 4, th: 7 }, at: [0, -1.01, 1], rotate: [-Math.PI / 2, 0, 0] },
    // Arms, each with a FLAT hand.
    { name: 'armLeft', parent: 'body', box: [2, 3, 3], uv: { u: 0, v: 32, tw: 2, th: 3, td: 3 }, at: [4, -1, -6.5] },
    { name: 'handLeft', parent: 'armLeft', plane: [8, 8], uv: { u: 18, v: 40, tw: 8, th: 8 }, at: [0, 3, -1], rotate: [-Math.PI / 2, 0, 0] },
    { name: 'armRight', parent: 'body', box: [2, 3, 3], uv: { u: 0, v: 38, tw: 2, th: 3, td: 3 }, at: [-4, -1, -6.5] },
    { name: 'handRight', parent: 'armRight', plane: [8, 8], uv: { u: 2, v: 40, tw: 8, th: 8 }, at: [0, 3, 0], rotate: [-Math.PI / 2, 0, 0] },
    // Legs, each with a FLAT foot.
    { name: 'legLeft', parent: 'root', box: [3, 3, 4], uv: { u: 14, v: 25, tw: 3, th: 3, td: 4 }, at: [3.5, -3, 4] },
    { name: 'footLeft', parent: 'legLeft', plane: [8, 8], uv: { u: 2, v: 32, tw: 8, th: 8 }, at: [2, 3, 0], rotate: [-Math.PI / 2, 0, 0] },
    { name: 'legRight', parent: 'root', box: [3, 3, 4], uv: { u: 0, v: 25, tw: 3, th: 3, td: 4 }, at: [-3.5, -3, 4] },
    { name: 'footRight', parent: 'legRight', plane: [8, 8], uv: { u: 18, v: 32, tw: 8, th: 8 }, at: [-2, 3, 0], rotate: [-Math.PI / 2, 0, 0] }
  ]
};

export function createFrogModel(bodyMat, bellyMat, eyeMat, options = {}) {
  // The real decompiled frog. Its tongue and all four hands and feet are FLAT, so this needs `plane` parts and a
  // texture; without a skin the old flat build is used so the mob still renders in a build with no assets.
  if (options.texture) {
    const built = buildModel(FROG_MODEL, {
      materials: { default: bodyMat, belly: bellyMat, eye: eyeMat },
      textureContext: { texW: 48, texH: 48 },
      texture: options.texture,
      onTextureReady: options.onTextureReady
    });
    const eyes = [built.parts.eyeRight, built.parts.eyeLeft].filter(Boolean);
    const tongue = built.parts.tongue;
    // The tongue is only visible mid-flick.
    if (tongue) tongue.visible = false;
    return {
      group: built.group,
      body: built.parts.body,
      belly: built.parts.bodyLayer,
      head: built.parts.head,
      eyes,
      tongue,
      // Four limbs. Vanilla calls the front pair `arms` and the back pair `legs`; the jump pose below distinguishes
      // them with `front`, which is also how the tests describe a frog: two long hind legs and two small forelegs.
      legs: [
        { mesh: built.parts.legLeft },
        { mesh: built.parts.legRight },
        { mesh: built.parts.armLeft, front: true },
        { mesh: built.parts.armRight, front: true }
      ].filter((l) => l.mesh),
      parts: built.parts
    };
  }

  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.46), bodyMat);
  body.position.set(0, 0.24, 0);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.4), bellyMat);
  belly.position.set(0, 0.15, 0.02);
  group.add(belly);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.32), bodyMat);
  head.position.set(0, 0.3, 0.36);
  group.add(head);

  // Bulging eyes on top of the head, which is the frog's silhouette.
  const eyeGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.11, 0.14, 0.06);
    head.add(eye);
    return eye;
  });

  // The tongue, hidden until a flick is in progress.
  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.05, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xf472b6 })
  );
  tongue.position.set(0, 0.02, 0.3);
  tongue.visible = false;
  head.add(tongue);

  // Long folded hind legs, which is what makes a frog read as a jumper rather than a walker.
  const hindGeo = new THREE.BoxGeometry(0.14, 0.12, 0.34);
  const legs = [];
  for (const side of [-1, 1]) {
    const hind = new THREE.Mesh(hindGeo, bodyMat);
    hind.position.set(side * 0.2, 0.14, -0.16);
    hind.rotation.y = side * 0.5;
    group.add(hind);
    legs.push({ mesh: hind, side, front: false });
  }
  // Small front legs.
  const foreGeo = new THREE.BoxGeometry(0.09, 0.2, 0.09);
  for (const side of [-1, 1]) {
    const fore = new THREE.Mesh(foreGeo, bodyMat);
    fore.position.set(side * 0.13, 0.1, 0.28);
    group.add(fore);
    legs.push({ mesh: fore, side, front: true });
  }

  return { group, body, belly, head, eyes, tongue, legs };
}

/** Apply the variant colours. */
export function applyFrogVariant(frog) {
  if (!isFrog(frog)) return;
  const colors = FROG_COLORS[frog.variant] ?? FROG_COLORS.temperate;
  frog.bodyMat?.color?.setHex(colors.base);
  frog.bellyMat?.color?.setHex(colors.belly);
}

/**
 * The idle crouch, the jump stretch, and the croak.
 *
 * Wiki: a frog "may croak and inflate their vocal sac", and its long jump starts from a crouch.
 */
export function poseFrog(frog, phase) {
  if (!frog) return;
  const crouching = frog.isFrogJumping && !frog.onGround === false;
  const airborne = !!frog.isFrogJumping && frog.onGround === false;
  // Hind legs fold tight to launch and extend in the air.
  frog.legs?.forEach((leg) => {
    if (leg.front) {
      leg.mesh.rotation.x = airborne ? -0.4 : 0;
      return;
    }
    leg.mesh.rotation.x = airborne ? 0.6 : crouching ? 0.5 : Math.sin(phase) * 0.12;
  });
  // The vocal sac inflates while croaking.
  if (frog.body) {
    const croak = frog.croakTimer > 0 ? 1 + Math.sin(phase * 18) * 0.06 : 1;
    frog.body.scale.set(croak, croak, croak);
  }
  if (frog.tongue) frog.tongue.visible = (frog.tongueTimer || 0) > 0;
}

/**
 * Start a long jump.
 *
 * Wiki: "They can jump up to 8 blocks high". Returns true when the jump started.
 */
export function startFrogJump(mob, { height = 2.5, forward = 2.0 } = {}) {
  if (!isFrog(mob)) return false;
  if (mob.onGround === false) return false;
  const clamped = Math.min(Math.max(1, height), FROG_JUMP.maxHeight);
  const gravity = 22;
  mob.velocity.y = Math.sqrt(2 * gravity * clamped);
  mob.velocity.x = Math.sin(mob.yaw) * forward;
  mob.velocity.z = Math.cos(mob.yaw) * forward;
  mob.onGround = false;
  mob.isFrogJumping = true;
  mob.frogJumpHeight = clamped;
  return true;
}