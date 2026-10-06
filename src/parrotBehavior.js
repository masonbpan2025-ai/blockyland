import * as THREE from 'three';
import { adoptWhenReady } from './mobVisuals/modelBuilder.js';
import { createEntityBox, createBoxFromFaces } from './mobVisuals/entityBox.js';

/**
 * Parrot rules and model.
 *
 * Reference: https://minecraft.wiki/w/Parrot
 *
 * The parrot is a tameable flying passive mob defined by five things: five colour variants, taming
 * by seed with a 1-in-10 chance, perching on the player's shoulder, imitating nearby hostile mobs,
 * and dancing by a jukebox that is playing a music disc.
 */

/** Wiki: 6 HP. */
export const PARROT_HEALTH = 6;

/** Wiki: 0.5 wide x 0.9 tall in Java. */
export const PARROT_DIMENSIONS = { width: 0.5, height: 0.9 };

/** Wiki: the five variants with their numeric ids. */
export const PARROT_VARIANTS = { red_blue: 0, blue: 1, green: 2, yellow_blue: 3, gray: 4 };

/** The short names used for display and telemetry, in id order. */
export const PARROT_VARIANT_NAMES = ['red', 'blue', 'green', 'cyan', 'gray'];

/**
 * The vanilla sheet each parrot variant wears.
 *
 * A parrot variant IS its texture: there are five 32x32 sheets and the mob picks one. Binding the sheet is what
 * makes the variant visible, and the `PARROT_COLORS` table is only the fallback for a build with no assets.
 */
export const PARROT_SKIN_PATHS = [
  '/assets/entity/parrot/parrot_red_blue.png',
  '/assets/entity/parrot/parrot_blue.png',
  '/assets/entity/parrot/parrot_green.png',
  '/assets/entity/parrot/parrot_yellow_blue.png',
  '/assets/entity/parrot/parrot_grey.png'
];

/** Body colours per variant, matching each real macaw the wiki names. */
export const PARROT_COLORS = {
  red: { body: 0xdc2626, wing: 0x2563eb, head: 0xdc2626, beak: 0x4b5563 },
  blue: { body: 0x2563eb, wing: 0x1e40af, head: 0x2563eb, beak: 0x4b5563 },
  green: { body: 0x16a34a, wing: 0x15803d, head: 0x16a34a, beak: 0x4b5563 },
  cyan: { body: 0xfacc15, wing: 0x06b6d4, head: 0xfacc15, beak: 0x4b5563 },
  gray: { body: 0xd4d4d8, wing: 0xa1a1aa, head: 0xfacc15, beak: 0x4b5563 }
};

/**
 * Wiki: parrots are tamed with any of these seeds, each with a 1-in-10 chance.
 */
export const PARROT_TAMING_FOODS = [
  'wheat_seeds',
  'melon_seeds', 'pumpkin_seeds',
  'beetroot_seeds', 'torchflower_seeds', 'pitcher_pod'
];

/** Wiki: "Each item fed has a 1/10 chance of successfully taming them." */
export const PARROT_TAME_CHANCE = 0.1;

/**
 * Wiki: a cookie is toxic to parrots and kills them, because chocolate is poisonous to real parrots.
 * In Java the damage is effectively infinite; here it is modelled as a lethal hit attributed to the
 * player who fed it, which is also what the wiki says about death messages and loot credit.
 */
export const PARROT_COOKIE_KILLS = true;

/** Wiki: a tamed parrot follows its player and teleports at 12 blocks. */
export const PARROT_FOLLOW_RANGE = 12;

/** Wiki: imitations have a detection range of 20 blocks. */
export const PARROT_IMITATE_RANGE = 20;

/** Wiki: "The dancing radius is 3 blocks from the jukebox." */
export const PARROT_DANCE_RANGE = 3;

/** Wiki: parrots fly idly and land frequently to rest. */
export const PARROT_FLIGHT = { speed: 3.0, restSeconds: { min: 2, max: 5 }, flySeconds: { min: 3, max: 8 } };

/** Wiki: flight ceiling for the idle wandering. */
export const PARROT_FLY_HEIGHT = { min: 2, max: 6 };

/**
 * Wiki: the mobs a parrot imitates. Java Edition's list; Bedrock adds a few neutrals, and the
 * project targets Java.
 */
export const PARROT_IMITATED_MOBS = [
  'blaze', 'bogged', 'breeze', 'camel_husk', 'cave_spider', 'creaking', 'creeper', 'drowned',
  'elder_guardian', 'ender_dragon', 'endermite', 'evoker', 'ghast', 'guardian', 'hoglin', 'husk',
  'illusioner', 'magma_cube', 'parched', 'phantom', 'piglin', 'piglin_brute', 'pillager', 'ravager',
  'shulker', 'silverfish', 'skeleton', 'slime', 'spider', 'stray', 'vex', 'vindicator', 'warden',
  'witch', 'wither', 'wither_skeleton', 'zoglin', 'zombie', 'zombie_horse', 'zombie_nautilus',
  'zombie_villager'
];

/** Wiki: a parrot drops 1-2 feathers. */
export const PARROT_FEATHER_DROP = { min: 1, max: 2 };

/** True when the mob is a parrot. */
export function isParrot(mob) {
  return mob?.type === 'parrot';
}

/** The display name for a variant index. */
export function parrotVariantName(index) {
  return PARROT_VARIANT_NAMES[index] ?? PARROT_VARIANT_NAMES[0];
}

/** Roll a variant index, 0 to 4. */
export function rollParrotVariant(random = Math.random) {
  return Math.min(4, Math.floor(random() * 5));
}

/** The colours for a variant index. */
export function parrotColors(variant) {
  return PARROT_COLORS[parrotVariantName(variant)] ?? PARROT_COLORS.red;
}

/** True when the item is one a parrot can be tamed with. */
export function isParrotTamingFood(itemId) {
  if (!itemId) return false;
  return PARROT_TAMING_FOODS.includes(String(itemId).toLowerCase());
}

/**
 * Wiki: a cookie fed to a parrot kills it. The check is separate from the taming food list so a
 * cookie can never be mistaken for one.
 */
export function isParrotLethalFood(itemId) {
  if (!itemId) return false;
  const id = String(itemId).toLowerCase();
  return id === 'cookie' || id === 'cocoa_beans';
}

/**
 * Roll a taming attempt.
 *
 * Wiki: each feeding has a 1-in-10 chance. Returns true when the parrot is now tamed.
 */
export function rollParrotTaming(random = Math.random, chance = PARROT_TAME_CHANCE) {
  return random() < chance;
}

/**
 * Whether a parrot is currently perched on a shoulder.
 *
 * Wiki: a parrot on a shoulder "ceases to be a distinct entity"; here it keeps its object but is
 * flagged, which is what lets it be posed against the player's head.
 */
export function isPerched(mob) {
  return isParrot(mob) && !!mob.perchedOn;
}

/**
 * Put a parrot on a player's shoulder.
 *
 * Wiki: "A player can have one parrot on each shoulder. Parrots always prefer a player's left
 * shoulder first, if it is empty." Returns 'left', 'right' or null when both are taken.
 */
export function perchOnShoulder(mob, player) {
  if (!isParrot(mob) || !player) return null;
  if (mob.isSitting) return null;
  const left = player.shoulderLeftParrot ?? null;
  const right = player.shoulderRightParrot ?? null;
  if (!left) {
    player.shoulderLeftParrot = mob;
    mob.perchedOn = 'left';
    return 'left';
  }
  if (!right) {
    player.shoulderRightParrot = mob;
    mob.perchedOn = 'right';
    return 'right';
  }
  return null;
}

/** Take a parrot off its shoulder and clear the player's slot. */
export function dismountShoulder(mob, player) {
  if (!isParrot(mob) || !mob.perchedOn) return null;
  const side = mob.perchedOn;
  if (player) {
    if (side === 'left' && player.shoulderLeftParrot === mob) player.shoulderLeftParrot = null;
    if (side === 'right' && player.shoulderRightParrot === mob) player.shoulderRightParrot = null;
  }
  mob.perchedOn = null;
  return side;
}

/**
 * Whether the player's state forces a perch to dismount.
 *
 * Wiki lists the triggers: landing on a surface half a block up or higher, dropping off a ledge of
 * more than three quarters of a block, taking damage, touching water, touching powder snow, creative
 * flight, elytra gliding, sleeping, and submerging the head in lava.
 */
export function shouldDismountForPlayerState(player, previous = {}) {
  if (!player) return false;
  if (player.isSleeping) return true;
  if (player.gamemode === 'creative' && player.isFlying) return true;
  if (player.isGliding || player.elytraActive) return true;
  if (player.inWater || player.isInWater) return true;
  if (player.inPowderSnow) return true;
  if (player.inLava) return true;
  // Wiki: a rise of half a block or more, or a drop of more than three quarters.
  const prevY = previous.y;
  if (typeof prevY === 'number' && typeof player.position?.y === 'number') {
    const dy = player.position.y - prevY;
    if (dy >= 0.5) return true;
    if (dy <= -0.75) return true;
  }
  return false;
}

/**
 * Pick a mob for the parrot to imitate.
 *
 * Wiki: it imitates the idle sounds of nearby hostile mobs within 20 blocks, and never on Peaceful.
 * Returns the mob, or null.
 */
export function findImitateTarget(manager, parrot, { difficulty = 'normal', random = Math.random } = {}) {
  if (!isParrot(parrot) || difficulty === 'peaceful') return null;
  if (!manager?.mobs) return null;
  const candidates = [];
  for (const other of manager.mobs) {
    if (other === parrot || other.health <= 0) continue;
    if (!PARROT_IMITATED_MOBS.includes(other.type)) continue;
    if (parrot.mesh.position.distanceTo(other.mesh.position) > PARROT_IMITATE_RANGE) continue;
    candidates.push(other);
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
}

/**
 * Whether the parrot is in dancing range of a playing jukebox.
 *
 * Wiki: "Parrots dance near a jukebox if a music disc is inside it", within 3 blocks, and they stop
 * when the track ends.
 */
export function canDance(manager, parrot) {
  if (!isParrot(parrot)) return false;
  const disc = manager?.jukeboxPlaying;
  if (!disc) return false;
  const box = disc.position ?? disc;
  if (!box || typeof box.x !== 'number') return false;
  const pos = parrot.mesh.position;
  const dist = Math.hypot(pos.x - box.x, pos.z - box.z);
  return dist <= PARROT_DANCE_RANGE;
}

/** Wiki: 1-2 feathers with credit, and 1-3 XP. */
export function parrotDrops(mob) {
  if (!isParrot(mob)) return [];
  const { min, max } = PARROT_FEATHER_DROP;
  return [['feather', false, min, max]];
}

/** Wiki: 1-3 XP when killed by a player or a tamed wolf. */
export function parrotXp(mob) {
  if (!isParrot(mob)) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/**
 * Advance a parrot's idle flight.
 *
 * Wiki: parrots "fly around idly ... landing frequently to rest", and they can flap to slow their
 * falls and prevent fall damage. Returns what it did this step.
 */
export function updateParrotFlight(manager, mob, dt, player, { random = Math.random, move = null } = {}) {
  if (!isParrot(mob) || !mob.velocity) return null;

  // Wiki: a tamed parrot follows its player and teleports at 12 blocks.
  if (mob.isTamed && !mob.isSitting && player?.position) {
    const dist = mob.mesh.position.distanceTo(player.position);
    if (dist > PARROT_FOLLOW_RANGE && mob.perchedOn === null) {
      // Teleport rather than fly, which is what the wiki describes.
      mob.mesh.position.copy(player.position).add(new THREE.Vector3(1.2, 1.4, 0));
      mob.velocity.set(0, 0, 0);
      mob.state = 'following';
      return 'teleported';
    }
    if (dist > 3.5 && dist <= PARROT_FOLLOW_RANGE && mob.perchedOn === null) {
      const dir = player.position.clone().sub(mob.mesh.position);
      mob.yaw = Math.atan2(dir.x, dir.z);
      const speed = Math.min(PARROT_FLIGHT.speed, dist);
      mob.velocity.set(dir.x / dist * speed, dir.y / dist * speed, dir.z / dist * speed);
      move?.(manager, mob, dt);
      mob.state = 'following';
      return 'following';
    }
  }

  if (mob.perchedOn) {
    // Wiki: a perched parrot looks the same way the player's head does.
    mob.mesh.position.copy(player.position);
    mob.mesh.position.y += 1.5;
    const side = mob.perchedOn === 'left' ? -0.35 : 0.35;
    mob.mesh.position.x += Math.cos(player.yaw ?? 0) * side;
    mob.mesh.position.z += -Math.sin(player.yaw ?? 0) * side;
    mob.yaw = player.yaw ?? mob.yaw;
    mob.velocity.set(0, 0, 0);
    return 'perched';
  }

  // Idle: alternate between flying and resting.
  mob.flightTimer = (mob.flightTimer ?? 0) - dt;
  if (mob.flightTimer <= 0) {
    mob.resting = !mob.resting;
    mob.flightTimer = mob.resting
      ? PARROT_FLIGHT.restSeconds.min + random() * (PARROT_FLIGHT.restSeconds.max - PARROT_FLIGHT.restSeconds.min)
      : PARROT_FLIGHT.flySeconds.min + random() * (PARROT_FLIGHT.flySeconds.max - PARROT_FLIGHT.flySeconds.min);
    if (!mob.resting) {
      mob.yaw = random() * Math.PI * 2;
      const height = PARROT_FLY_HEIGHT.min + random() * (PARROT_FLY_HEIGHT.max - PARROT_FLY_HEIGHT.min);
      mob.flyTargetY = mob.mesh.position.y + height;
    }
  }

  if (mob.resting) {
    // Wiki: they land frequently to rest. Flapping still slows the descent.
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    mob.velocity.y = mob.mesh.position.y > 1 ? -1.0 : 0;
    mob.state = 'resting';
    move?.(manager, mob, dt);
    return 'resting';
  }

  // Flying: wander at a chosen altitude.
  const targetY = mob.flyTargetY ?? mob.mesh.position.y + 2;
  mob.velocity.y = Math.max(-2, Math.min(2, (targetY - mob.mesh.position.y) * 1.5));
  mob.velocity.x = Math.sin(mob.yaw) * PARROT_FLIGHT.speed;
  mob.velocity.z = Math.cos(mob.yaw) * PARROT_FLIGHT.speed;
  mob.state = 'flying';
  move?.(manager, mob, dt);
  return 'flying';
}

/**
 * Parrot model: a small upright body, a large hooked beak, a long tail and two wings.
 *
 * The beak and tail are what make the silhouette read as a parrot rather than a generic bird.
 */
export function createParrotModel(bodyMat, wingMat, headMat, beakMat) {
  const group = new THREE.Group();

  // Every part samples the real 32x32 parrot sheet, so the variant is a TEXTURE choice rather than a set of flat
  // colours. Previously none of these boxes read the skin at all.
  const box = (w, h, d, u, v, tw, th, td) => new THREE.Mesh(
    createEntityBox(w, h, d, u, v, tw, th, td, { texW: 32, texH: 32 }), bodyMat);

  // Body: 6x8x6 at (2,8).
  const body = box(0.3, 0.4, 0.3, 2, 8, 6, 8, 6);
  body.position.set(0, 0.5, 0);
  group.add(body);

  // Head: 4x4x4 at (0,0), which is where the face is drawn.
  const head = new THREE.Mesh(createEntityBox(0.26, 0.26, 0.26, 0, 0, 4, 4, 4, { texW: 32, texH: 32 }), headMat);
  head.position.set(0, 0.76, 0.04);
  group.add(head);

  // The hooked beak is the parrot's most recognisable feature, and it is geometry rather than texture because it
  // protrudes from the face.
  const beakUpper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.1), beakMat);
  beakUpper.position.set(0, 0.03, 0.17);
  head.add(beakUpper);
  const beakLower = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.07), beakMat);
  beakLower.position.set(0, -0.05, 0.14);
  head.add(beakLower);

  const eyeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.03);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, beakMat);
    eye.position.set(side * 0.1, 0.03, 0.12);
    head.add(eye);
    return eye;
  });

  // Wings: panels hinged at the shoulder. `wings` carries BOTH `length` and named `left`/`right`, because
  // `moveFlyingMob` writes `mob.wings.left.rotation.z` and parrotBehavior.test.js pins the array length too.
  // The wing is 1 wide but 6 deep, so depth exceeds half its width and vanilla's own layout has no room for its
  // side faces; `createEntityBox` refuses that shape. Explicit rectangles are the escape hatch.
  const wingGeo = createBoxFromFaces(0.07, 0.28, 0.3, [
    { x: 1, y: 16, w: 6, h: 8 },   // +X right
    { x: 0, y: 16, w: 6, h: 8 },   // -X left
    { x: 0, y: 16, w: 1, h: 6 },   // +Y top
    { x: 1, y: 16, w: 1, h: 6 },   // -Y bottom
    { x: 0, y: 16, w: 1, h: 8 },   // +Z front
    { x: 1, y: 16, w: 1, h: 8 }    // -Z back
  ], { texW: 32, texH: 32 });
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.56, 0);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(side * 0.04, 0, 0);
    pivot.add(wing);
    group.add(pivot);
    wings.push({ pivot, wing, side, rotation: pivot.rotation });
  }
  wings.left = wings[0];
  wings.right = wings[1];

  // The long tail, which reads at a glance from behind.
  // The tail is 2 wide but 8 deep, so like the wings it cannot use the standard layout: depth exceeds half its
  // width. Its length runs along Z, the same direction as its texture strip, so a plain box samples it correctly.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.4), wingMat);
  tail.position.set(0, 0.42, -0.3);
  tail.rotation.x = 0.2;
  group.add(tail);

  // Two small feet.
  const footGeo = new THREE.BoxGeometry(0.06, 0.14, 0.06);
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(footGeo, beakMat);
    foot.position.set(side * 0.07, 0.08, 0.03);
    group.add(foot);
  }

  return { group, body, head, beakUpper, beakLower, eyes, wings, tail };
}
export function applyParrotVariant(parrot) {
  if (!isParrot(parrot)) return;
  const colors = parrotColors(parrot.variant);
  const path = PARROT_SKIN_PATHS[parrot.variant] ?? PARROT_SKIN_PATHS[0];

  // The variant is its SHEET. Binding it is what makes the colour change; tinting the materials instead would
  // fight `adoptTexture`, which whitens a material once its map lands.
  const skin = parrot.skinManager?.loadTexture ? parrot.skinManager.loadTexture(path) : null;
  if (skin && parrot.bodyMat) adoptWhenReady(parrot.bodyMat, skin, colors.body);
  else parrot.bodyMat?.color?.setHex?.(colors.body);

  // The head and wings share the body sheet, so a fallback colour is all they need when there is no asset.
  if (!skin) {
    parrot.wingMat?.color?.setHex(colors.wing);
    parrot.headMat?.color?.setHex(colors.head);
  }
  parrot.beakMat?.color?.setHex(colors.beak);
}

/**
 * The dance: a bobbing, head-swinging motion that the wiki calls the party parrot.
 *
 * A perched parrot is drawn against the player's head instead, so it does not bob.
 */
export function poseParrot(parrot, phase) {
  if (!parrot) return;
  if (parrot.perchedOn) {
    if (parrot.head) parrot.head.rotation.z = 0;
    if (parrot.tail) parrot.tail.rotation.x = 0.2;
    return;
  }
  if (parrot.isDancing) {
    // Head swings side to side and the body bobs, which is the dance.
    if (parrot.head) parrot.head.rotation.z = Math.sin(phase * 6) * 0.5;
    if (parrot.body) parrot.body.position.y = 0.5 + Math.abs(Math.sin(phase * 6)) * 0.06;
    if (parrot.tail) parrot.tail.rotation.x = 0.2 + Math.sin(phase * 6) * 0.25;
  } else {
    if (parrot.head) parrot.head.rotation.z = 0;
    if (parrot.body) parrot.body.position.y = 0.5;
    if (parrot.tail) parrot.tail.rotation.x = 0.2;
  }
}
