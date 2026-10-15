import * as THREE from 'three';
import { adoptWhenReady } from './mobVisuals/modelBuilder.js';
import { createBoxFromFaces } from './mobVisuals/entityBox.js';

/**
 * Rabbit rules and model.
 *
 * Reference: https://minecraft.wiki/w/Rabbit
 *
 * A rabbit is a small passive mob with six natural coat variants chosen by biome, a rare
 * hostile variant that can only be spawned by command, and a hop-based gait rather than a walk.
 */

/** Wiki: 3 HP (reduced from 10 in 15w46a). */
export const RABBIT_HEALTH = 3;

/** Wiki: adult 0.4 wide x 0.5 tall; baby 0.2 x 0.25. */
export const RABBIT_DIMENSIONS = { width: 0.4, height: 0.5 };
export const RABBIT_BABY_DIMENSIONS = { width: 0.2, height: 0.25 };

/** Wiki: baby scale is half the adult model. */
export const RABBIT_BABY_SCALE = 0.5;

/** Wiki: 1-3 XP, and a 10% rabbit's foot chance. */
export const RABBIT_XP = 3;
export const RABBIT_FOOT_CHANCE = 0.1;

/** Wiki: the killer bunny deals 5 / 8 / 12 damage by difficulty. */
export const KILLER_BUNNY_DAMAGE = { peaceful: 0, easy: 5, normal: 8, hard: 12 };

/** Wiki: the killer bunny has 8 armour points. */
export const KILLER_BUNNY_ARMOR = 8;

/** Wiki: the killer bunny notices players within 16 blocks. */
export const KILLER_BUNNY_SIGHT_RANGE = 16;

/** Wiki: normal rabbits keep 8 blocks from players and 10 from wolves. */
export const RABBIT_PLAYER_AVOID_RANGE = 8;
export const RABBIT_WOLF_AVOID_RANGE = 10;

/**
 * The six natural coat variants, keyed by the wiki's `RabbitType` numeric id.
 *
 * Toast (a named rabbit) and the killer bunny are not in the natural pool.
 */
export const RABBIT_COATS = ['brown', 'white', 'black', 'white_splotched', 'gold', 'salt'];

/** Wiki: `RabbitType: 99` is The Killer Bunny. */
export const KILLER_BUNNY_TYPE = 99;

/** The vanilla sheet each rabbit coat wears, where one exists on disk. A coat IS its texture. */
export const RABBIT_SKIN_PATHS = {
  brown: '/assets/entity/rabbit/brown.png',
  white: '/assets/entity/rabbit/white.png',
  black: '/assets/entity/rabbit/black.png',
  white_splotched: '/assets/entity/rabbit/white_splotched.png',
  gold: '/assets/entity/rabbit/gold.png',
  salt: '/assets/entity/rabbit/salt.png',
  toast: '/assets/entity/rabbit/toast.png',
  killer: '/assets/entity/rabbit/caerbannog.png'
};

/** Body colour per coat, with the two-tone coats expressed as a base and a patch. */
export const RABBIT_COAT_COLORS = {
  brown: { base: 0x8b5a2b, patch: 0xd6bfa3, eye: 0x1f2937 },
  white: { base: 0xf3f4f6, patch: 0xf3f4f6, eye: 0xdc2626 },
  black: { base: 0x18181b, patch: 0x3f3f46, eye: 0x1f2937 },
  white_splotched: { base: 0xf3f4f6, patch: 0x18181b, eye: 0x1f2937 },
  gold: { base: 0xeab308, patch: 0xfde68a, eye: 0x1f2937 },
  salt: { base: 0xd6d3d1, patch: 0x57534e, eye: 0x1f2937 },
  // Special variants.
  killer: { base: 0xf5f5f4, patch: 0xfecdd3, eye: 0xdc2626 },
  toast: { base: 0x18181b, patch: 0xf3f4f6, eye: 0x60a5fa }
};

/**
 * Wiki: coat by biome group.
 *
 * Snowy biomes are 80% white and 20% white splotched; deserts are 100% gold; every other
 * rabbit biome is 50% brown, 40% salt and 10% black.
 */
export function rollRabbitCoat(biome = null, random = Math.random) {
  const snowy = ['snowy_plains', 'ice_spikes', 'snowy_taiga', 'grove', 'snowy_slopes',
    'frozen_ocean', 'frozen_river', 'snowy_beach', 'frozen_peaks', 'jagged_peaks'];
  const desert = ['desert'];
  const r = random();
  if (biome && desert.includes(biome)) return 'gold';
  if (biome && snowy.includes(biome)) return r < 0.8 ? 'white' : 'white_splotched';
  // Default pool for every other biome, and when no biome is known.
  if (r < 0.5) return 'brown';
  if (r < 0.9) return 'salt';
  return 'black';
}

/** True when the mob is a rabbit (any variant). */
export function isRabbit(mob) {
  return mob?.type === 'rabbit';
}

/** Wiki: the killer bunny is `RabbitType: 99`. */
export function isKillerBunny(mob) {
  return isRabbit(mob) && (mob.rabbitType === KILLER_BUNNY_TYPE || mob.coat === 'killer');
}

/** Killer bunny melee damage at the given difficulty. */
export function killerBunnyDamageFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(KILLER_BUNNY_DAMAGE, key) ? KILLER_BUNNY_DAMAGE[key] : KILLER_BUNNY_DAMAGE.normal;
}

/**
 * Wiki: naming a rabbit "Toast" re-textures it, and Toast is not inherited by offspring.
 *
 * Returns the coat a rabbit should use given its stored coat and its name.
 */
export function rabbitCoatForName(coat, name) {
  if (typeof name === 'string' && name.trim() === 'Toast' && coat !== 'killer') return 'toast';
  return coat;
}

/** Wiki: a killer bunny stays a killer bunny even when renamed Toast. */
export function applyRabbitName(mob) {
  if (!isRabbit(mob)) return null;
  if (isKillerBunny(mob)) return mob.coat;
  mob.coat = rabbitCoatForName(mob.coat, mob.name);
  applyRabbitCoat(mob);
  return mob.coat;
}

/**
 * Paint a rabbit's coat onto its meshes.
 *
 * Two-tone coats (splotched, salt, toast) use the patch material for the head and a body
 * patch, which is what distinguishes them at a glance from the solid coats.
 */
export function applyRabbitCoat(mob) {
  if (!isRabbit(mob)) return;
  const colors = RABBIT_COAT_COLORS[mob.coat] ?? RABBIT_COAT_COLORS.brown;
  // The coat IS its sheet where one exists: naming a rabbit "Toast" re-textures it, so a colour change would be
  // invisible against the bound map. The colour stays as the fallback for coats with no sheet yet.
  const coatPath = RABBIT_SKIN_PATHS[mob.coat];
  const coatSkin = coatPath && mob.skinManager?.loadTexture ? mob.skinManager.loadTexture(coatPath) : null;
  if (coatSkin) {
    const fixAtlas = () => {
      if (coatSkin.image && coatSkin.image.height > 32 && coatSkin.image.width === 64) {
        const factor = 32 / coatSkin.image.height;
        coatSkin.repeat.set(1, factor);
        coatSkin.offset.set(0, 1 - factor);
        coatSkin.needsUpdate = true;
      }
    };
    if (coatSkin.image?.height) fixAtlas();
    else coatSkin.image?.addEventListener?.('load', fixAtlas);
  }
  if (coatSkin && mob.bodyMat) adoptWhenReady(mob.bodyMat, coatSkin, colors.base);
  else mob.bodyMat?.color?.setHex(colors.base);
  mob.patchMat?.color?.setHex(colors.patch);
  mob.eyeMat?.color?.setHex(colors.eye);
  // Emissive eyes only for the coats the wiki gives a glowing or hollow look.
  if (mob.patchMesh) {
    // Legacy box kept for model compatibility; canonical textures render coat patterns directly.
    mob.patchMesh.visible = false;
  }
}

/**
 * Death drops.
 *
 * Wiki: 0-1 rabbit hide, 1 raw rabbit (cooked when burning), and a 10% rabbit's foot that
 * requires player kill credit. Babies drop nothing.
 */
export function rabbitDrops(mob, random = Math.random) {
  if (!isRabbit(mob)) return [];
  if (mob.isBaby) return [];
  const burned = mob.isOnFire || mob.fireTicks > 0;
  const rows = [
    ['rabbit_hide', false, 0, 1],
    [burned ? 'cooked_rabbit' : 'rabbit', false, 1, 1]
  ];
  if ((mob.playerDamaged || mob.killedByTamedWolf) && random() < RABBIT_FOOT_CHANCE) {
    rows.push(['rabbit_foot', false, 1, 1]);
  }
  return rows;
}

/**
 * The killer bunny's hunt.
 *
 * Wiki: it hops toward any player within 16 blocks faster than a normal rabbit, lunges for 8
 * damage on Normal, retreats briefly when struck, and otherwise hunts wolves.
 */
export function updateKillerBunnyHunt(manager, mob, dt, player) {
  if (!isKillerBunny(mob) || mob.health <= 0) return false;
  mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
  // Attacks run on their own timer: `hitCooldown` is the hurt-immunity window, and sharing it made the mob immune
  // to the player for as long as it kept biting.
  mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);

  // Wolves are the fallback target, as the wiki describes.
  let target = null;
  let targetPos = null;
  if (player?.position && player.gamemode !== 'creative' && player.gamemode !== 'spectator') {
    const d = mob.mesh.position.distanceTo(player.position);
    if (d <= KILLER_BUNNY_SIGHT_RANGE) { target = player; targetPos = player.position; }
  }
  if (!target) {
    const wolf = manager.mobs.find(m => m.type === 'wolf' && m.health > 0);
    if (wolf) { target = wolf; targetPos = wolf.mesh.position; }
  }
  if (!targetPos) {
    mob.velocity.x *= 0.8;
    mob.velocity.z *= 0.8;
    return false;
  }

  // Wiki: it retreats briefly after being struck.
  if (mob.retreatTimer > 0) {
    mob.retreatTimer = Math.max(0, mob.retreatTimer - dt);
    const away = mob.mesh.position.clone().sub(targetPos);
    away.y = 0;
    if (away.lengthSq() > 1e-6) away.normalize();
    mob.velocity.x = away.x * 3.2;
    mob.velocity.z = away.z * 3.2;
    return true;
  }

  const dir = targetPos.clone().sub(mob.mesh.position);
  dir.y = 0;
  const dist = dir.length();
  if (dist < 0.001) return false;
  dir.normalize();
  const targetYaw = Math.atan2(dir.x, dir.z);
  const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
  mob.yaw += turn * Math.min(1, 9 * dt);

  const reach = 1.2;
  if (dist > reach) {
    // "Much faster than a normal rabbit", and hopping like a spider's approach.
    mob.velocity.x = Math.sin(mob.yaw) * 3.4;
    mob.velocity.z = Math.cos(mob.yaw) * 3.4;
    if (mob.onGround && Math.random() < 5 * dt) { mob.velocity.y = 4.2; mob.onGround = false; }
  } else {
    mob.velocity.x *= 0.5;
    mob.velocity.z *= 0.5;
    if (mob.attackCooldown <= 0) {
      const damage = killerBunnyDamageFor(manager?.game?.difficulty);
      // Wiki: on Peaceful it still attacks wolves, just not the player.
      if (target === player && damage <= 0) { /* no player damage on Peaceful */ }
      else if (target === player) player.takeDamage?.(damage, mob.mesh.position, mob.type);
      else manager.damageMob?.(target, killerBunnyDamageFor(manager?.game?.difficulty) || 4, mob.mesh.position, false, mob);
      mob.attackCooldown = 1.0;
    }
  }
  return true;
}

/**
 * The chance an offspring of a killer bunny is itself a killer bunny.
 *
 * Wiki: "Despite their hostile nature, killer bunnies can breed with other rabbits and with each other,
 * having the unusual chance of creating a baby killer bunny." The page gives no number, so this is the
 * standard rare-inheritance figure used elsewhere in this codebase, and it is a named constant precisely
 * so the guess is visible and adjustable rather than buried.
 */
export const KILLER_BUNNY_INHERIT_CHANCE = 0.05;

/**
 * Whether a baby rabbit is a killer bunny.
 *
 * Wiki: a killer bunny can breed with any rabbit, and the offspring has "the unusual chance of creating a
 * baby killer bunny". So the parents need not both be killers, which is the unusual part -- normally a
 * special variant requires two special parents.
 *
 * This is the opposite of what this file previously claimed, and the earlier note is why the rule is now a
 * documented function rather than an inline `if` that reads like a deliberate omission.
 */
export function inheritKillerBunny(parentA, parentB, random = Math.random) {
  const eitherParent = isKillerBunny(parentA) || isKillerBunny(parentB);
  // Wiki: only a killer bunny parent can pass it on, since it is not a coat in the normal pool.
  if (!eitherParent) return false;
  return random() < KILLER_BUNNY_INHERIT_CHANCE;
}

/**
 * Apply the killer bunny identity to a rabbit mob.
 *
 * Wiki: `RabbitType` 99, 8 armour points, hostile, and the name is "The Killer Bunny".
 */
export function makeKillerBunny(mob) {
  if (!isRabbit(mob)) return false;
  mob.rabbitType = KILLER_BUNNY_TYPE;
  mob.coat = 'killer';
  mob.isHostile = true;
  mob.armor = KILLER_BUNNY_ARMOR;
  mob.attackDamage = KILLER_BUNNY_DAMAGE.normal;
  applyRabbitCoat(mob);
  return true;
}

/** Called when a killer bunny is struck: the wiki has it retreat before returning. */
export function onKillerBunnyHurt(mob, seconds = 1.5) {
  if (!isKillerBunny(mob)) return false;
  mob.retreatTimer = seconds;
  return true;
}

/**
 * UV face unwrap for vanilla 64x32 rabbit texture atlas.
 */
function rabbitFaces(u, v, tw, th, td) {
  return [
    { x: u, y: v + td, w: td, h: th },                  // +X (right)
    { x: u + td + tw, y: v + td, w: td, h: th },        // -X (left)
    { x: u + td, y: v, w: tw, h: td },                  // +Y (top)
    { x: u + td + tw, y: v, w: tw, h: td },             // -Y (bottom)
    { x: u + td, y: v + td, w: tw, h: th },             // +Z (front)
    { x: u + td + tw + td, y: v + td, w: tw, h: th }    // -Z (back)
  ];
}

function rabbitBoxGeo(w, h, d, u, v, tw, th, td) {
  return createBoxFromFaces(w, h, d, rabbitFaces(u, v, tw, th, td), { texW: 64, texH: 32 });
}

/**
 * Rabbit model: vanilla-accurate geometry and UV mapping from RabbitEntityModel (class_596).
 *
 * Atlas is 64x32:
 *   body: 6x5x10 at (0, 0)
 *   head: 5x4x5 at (32, 0), nose 1x1x1 at (32, 9)
 *   right ear: 2x5x1 at (52, 0), left ear: 2x5x1 at (58, 0)
 *   tail: 3x3x2 at (52, 6)
 *   front legs: 2x7x2 at (0, 15) right, (8, 15) left
 *   haunches: 2x4x5 at (16, 15) right, (30, 15) left
 *   hind feet: 2x1x7 at (8, 24) right, (26, 24) left
 */
export function createRabbitModel(bodyMat, patchMat, eyeMat) {
  const group = new THREE.Group();

  // Hunched body: 6x5x10 at (0, 0) on 64x32 atlas.
  const bodyGeo = rabbitBoxGeo(0.24, 0.20, 0.36, 0, 0, 6, 5, 10);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.16, -0.02);
  body.rotation.x = -Math.PI / 9;
  group.add(body);

  // The patch, used by the two-tone coats.
  const patchMesh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.16, 0.12), patchMat);
  patchMesh.position.set(0, 0.17, 0.1);
  patchMesh.visible = false;
  group.add(patchMesh);

  // Head: 5x4x5 at (32, 0) on 64x32 atlas.
  const headGeo = rabbitBoxGeo(0.20, 0.16, 0.20, 32, 0, 5, 4, 5);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 0.20, 0.14);
  group.add(head);

  // Nose: 1x1x1 at (32, 9).
  const noseGeo = rabbitBoxGeo(0.04, 0.04, 0.04, 32, 9, 1, 1, 1);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.set(0, -0.03, 0.105);
  head.add(nose);

  // Eyes on the sides of the head.
  const eyeGeo = new THREE.BoxGeometry(0.002, 0.02, 0.02);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.101, 0.01, 0.02);
    head.add(eye);
    return eye;
  });

  // Long ears: right 2x5x1 at (52, 0), left 2x5x1 at (58, 0).
  const rightEarGeo = rabbitBoxGeo(0.06, 0.20, 0.03, 52, 0, 2, 5, 1);
  const rightEar = new THREE.Mesh(rightEarGeo, bodyMat);
  rightEar.position.set(-0.045, 0.17, -0.01);
  rightEar.rotation.y = -Math.PI / 12;
  rightEar.rotation.x = -0.15;
  head.add(rightEar);

  const leftEarGeo = rabbitBoxGeo(0.06, 0.20, 0.03, 58, 0, 2, 5, 1);
  const leftEar = new THREE.Mesh(leftEarGeo, bodyMat);
  leftEar.position.set(0.045, 0.17, -0.01);
  leftEar.rotation.y = Math.PI / 12;
  leftEar.rotation.x = -0.15;
  head.add(leftEar);

  const ears = [rightEar, leftEar];

  // Tail: 3x3x2 at (52, 6).
  const tailGeo = rabbitBoxGeo(0.10, 0.10, 0.07, 52, 6, 3, 3, 2);
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.position.set(0, 0.17, -0.21);
  tail.rotation.x = -0.35;
  group.add(tail);

  // Front legs (short): 2x7x2 at (0, 15) right, (8, 15) left, pivoting at hip joint (y = 0.14)
  const rfGeo = rabbitBoxGeo(0.06, 0.14, 0.06, 0, 15, 2, 7, 2);
  rfGeo.translate(0, -0.07, 0);
  const rf = new THREE.Mesh(rfGeo, bodyMat);
  rf.position.set(-0.065, 0.14, 0.10);
  rf.rotation.x = -Math.PI / 18;
  group.add(rf);

  const lfGeo = rabbitBoxGeo(0.06, 0.14, 0.06, 8, 15, 2, 7, 2);
  lfGeo.translate(0, -0.07, 0);
  const lf = new THREE.Mesh(lfGeo, bodyMat);
  lf.position.set(0.065, 0.14, 0.10);
  lf.rotation.x = -Math.PI / 18;
  group.add(lf);

  // Hind legs (long): haunches 2x4x5 at (16, 15) right, (30, 15) left; feet 2x1x7 at (8, 24) right, (26, 24) left, pivoting at hip joint (y = 0.135)
  const rhHaunchGeo = rabbitBoxGeo(0.06, 0.12, 0.16, 16, 15, 2, 4, 5);
  rhHaunchGeo.translate(0, -0.06, 0);
  const rhHaunch = new THREE.Mesh(rhHaunchGeo, bodyMat);
  rhHaunch.position.set(-0.08, 0.135, -0.12);
  rhHaunch.rotation.x = -Math.PI / 9;

  const rhFootGeo = rabbitBoxGeo(0.06, 0.035, 0.22, 8, 24, 2, 1, 7);
  const rhFoot = new THREE.Mesh(rhFootGeo, bodyMat);
  rhFoot.position.set(0, -0.105, 0.04);
  rhFoot.rotation.x = Math.PI / 9;
  rhHaunch.add(rhFoot);
  group.add(rhHaunch);

  const lhHaunchGeo = rabbitBoxGeo(0.06, 0.12, 0.16, 30, 15, 2, 4, 5);
  lhHaunchGeo.translate(0, -0.06, 0);
  const lhHaunch = new THREE.Mesh(lhHaunchGeo, bodyMat);
  lhHaunch.position.set(0.08, 0.135, -0.12);
  lhHaunch.rotation.x = -Math.PI / 9;

  const lhFootGeo = rabbitBoxGeo(0.06, 0.035, 0.22, 26, 24, 2, 1, 7);
  const lhFoot = new THREE.Mesh(lhFootGeo, bodyMat);
  lhFoot.position.set(0, -0.105, 0.04);
  lhFoot.rotation.x = Math.PI / 9;
  lhHaunch.add(lhFoot);
  group.add(lhHaunch);

  const legs = [
    { mesh: rf, side: -1, hind: false, baseY: 0.14 },
    { mesh: lf, side: 1, hind: false, baseY: 0.14 },
    { mesh: rhHaunch, side: -1, hind: true, baseY: 0.135 },
    { mesh: lhHaunch, side: 1, hind: true, baseY: 0.135 }
  ];

  return { group, head, body, patchMesh, tail, ears, legs, eyes };
}

/**
 * Hop animation: the body tilts and the legs tuck in a single cycle rather than a walk.
 */
export function poseRabbitHop(rabbit, phase, airborne = false) {
  const legs = rabbit?.legs;
  if (!legs) return;
  const tuck = airborne ? 1 : 0;
  for (const leg of legs) {
    const swing = Math.sin(phase + (leg.hind ? Math.PI : 0));
    leg.mesh.position.y = leg.baseY + tuck * 0.04 + Math.abs(swing) * 0.02;
    leg.mesh.rotation.x = (leg.hind ? -Math.PI / 9 - 0.4 * tuck : -Math.PI / 18 + 0.3 * tuck) + swing * 0.15;
  }
  if (rabbit.body) rabbit.body.rotation.x = -Math.PI / 9 - tuck * 0.18;
}
