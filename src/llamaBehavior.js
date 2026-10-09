import * as THREE from 'three';
import { adoptWhenReady, applyVanillaBoxUVs } from './mobVisuals/modelBuilder.js';
import { applyQuadUvs } from './mobVisuals/entityBox.js';

/**
 * Llama rules and the llama spit projectile.
 *
 * Reference: https://minecraft.wiki/w/Llama and https://minecraft.wiki/w/Llama_Spit
 *
 * The llama is a tameable neutral animal defined by four things: it retaliates with spit, it has a
 * strength 1-5 that sets both its health and its inventory size, it carries a chest and a carpet,
 * and leashed llamas form a caravan.
 */

/** Wiki: base health is 15 to 30, scaling with strength. */
export const LLAMA_HEALTH = { min: 15, max: 30 };

/** Wiki: adult 0.9 wide x 1.87 tall; baby 0.45 x 0.935. */
export const LLAMA_DIMENSIONS = { width: 0.9, height: 1.87 };
export const LLAMA_BABY_DIMENSIONS = { width: 0.45, height: 0.935 };
export const LLAMA_BABY_SCALE = 0.5;

/** Wiki: spit deals 1 on Easy and Normal, 1.5 on Hard. */
export const LLAMA_SPIT_DAMAGE = { peaceful: 0, easy: 1, normal: 1, hard: 1.5 };

/** Wiki: the four coat colours, with their numeric variant ids. */
export const LLAMA_VARIANTS = { creamy: 0, white: 1, brown: 2, gray: 3 };

/** Body colours per coat. */
/** The vanilla sheet each llama coat wears. A coat IS its texture, so the name selects a sheet. */
export const LLAMA_SKIN_PATHS = {
  creamy: '/assets/entity/llama/creamy.png',
  white: '/assets/entity/llama/white.png',
  brown: '/assets/entity/llama/brown.png',
  gray: '/assets/entity/llama/gray.png'
};

export const LLAMA_COAT_COLORS = {
  creamy: { base: 0xf5e6c8, dark: 0xe0cba8 },
  white: { base: 0xf8fafc, dark: 0xe2e8f0 },
  brown: { base: 0x8b5a3c, dark: 0x6b4226 },
  gray: { base: 0xa8a29e, dark: 0x78716c }
};

/**
 * Wiki, wild llama strength distribution: 1, 2 and 3 with 32.8% each, and 4 and 5 with 0.8% each.
 */
export const LLAMA_STRENGTH_WEIGHTS = [
  { strength: 1, weight: 32.8 },
  { strength: 2, weight: 32.8 },
  { strength: 3, weight: 32.8 },
  { strength: 4, weight: 0.8 },
  { strength: 5, weight: 0.8 }
];

/** Wiki: strength runs 1 to 5. */
export const LLAMA_STRENGTH = { min: 1, max: 5 };

/** Wiki: the chest gives 3 slots per point of strength, so 3 to 15. */
export const LLAMA_SLOTS_PER_STRENGTH = 3;

/** Wiki: taming Temper starts at 0, caps at 30, and rises by 5 per failed attempt. */
export const LLAMA_TEMPER = { start: 0, max: 30, perAttempt: 5 };

/** Wiki: feeding wheat adds 3 temper and 2 health; a hay bale adds 6 temper and 10 health. */
export const LLAMA_FOOD = {
  wheat: { temper: 3, heal: 2 },
  hay_block: { temper: 6, heal: 10 },
};

/** Wiki: a baby takes about 20 minutes to mature, sped up 10% per feeding. */
export const LLAMA_BABY_FEED_ACCELERATION = 0.1;

/** Wiki: a wild llama's strength is 1-3 (32.8% each) or 4-5 (0.8% each). */
export function rollLlamaStrength(random = Math.random) {
  const total = LLAMA_STRENGTH_WEIGHTS.reduce((n, e) => n + e.weight, 0);
  let roll = random() * total;
  for (const entry of LLAMA_STRENGTH_WEIGHTS) {
    roll -= entry.weight;
    if (roll < 0) return entry.strength;
  }
  return LLAMA_STRENGTH_WEIGHTS[LLAMA_STRENGTH_WEIGHTS.length - 1].strength;
}

/**
 * Wiki: a llama's base health is 15 to 30, scaling with strength.
 *
 * The exact mapping is linear across the strength range, which is what "calculated based on that of
 * its parents, in the same way as a horse's" produces in practice.
 */
export function llamaHealthFor(strength) {
  const clamped = Math.min(Math.max(strength, LLAMA_STRENGTH.min), LLAMA_STRENGTH.max);
  const steps = LLAMA_STRENGTH.max - LLAMA_STRENGTH.min;
  return LLAMA_HEALTH.min + Math.round((clamped - LLAMA_STRENGTH.min) / steps * (LLAMA_HEALTH.max - LLAMA_HEALTH.min));
}

/** Wiki: inventory slots are 3 times the strength. */
export function llamaSlotsFor(strength) {
  return strength * LLAMA_SLOTS_PER_STRENGTH;
}

/** Wiki: the coat is chosen at random from the four variants. */
export function rollLlamaVariant(random = Math.random) {
  const names = Object.keys(LLAMA_VARIANTS);
  return names[Math.floor(random() * names.length)] ?? 'creamy';
}

/** Wiki: the baby takes on the coat colour of one parent at random. */
export function inheritLlamaVariant(variantA, variantB, random = Math.random) {
  return random() < 0.5 ? variantA : variantB;
}

/**
 * Wiki: offspring strength "is chosen as a random integer between 1 and the strength of the
 * stronger parent, inclusive. 3% of the time the resulting strength is increased by 1, but it is
 * capped at 5."
 */
export function inheritLlamaStrength(parentA, parentB, random = Math.random) {
  const stronger = Math.max(parentA ?? 1, parentB ?? 1);
  const base = 1 + Math.floor(random() * stronger);
  const bonus = random() < 0.03 ? 1 : 0;
  return Math.min(LLAMA_STRENGTH.max, base + bonus);
}

/** The decor texture sheet worn by Trader Llamas. */
export const TRADER_LLAMA_CARPET_PATH = '/assets/entity/llama/decor/trader_llama.png';

/** Wiki: carpet decor hex colors for the 16 dyed carpets. */
export const LLAMA_CARPET_COLORS = {
  white: 0xf9fffe,
  orange: 0xf9801d,
  magenta: 0xc74ebd,
  light_blue: 0x3ab3da,
  yellow: 0xfed83d,
  lime: 0x80c71f,
  pink: 0xf4b2c8,
  gray: 0x474f52,
  light_gray: 0x9d9d97,
  cyan: 0x169c9c,
  purple: 0x8932b8,
  blue: 0x3c44aa,
  brown: 0x835432,
  green: 0x5e7c16,
  red: 0xb02e26,
  black: 0x1d1d21
};

export function resolveLlamaCarpetHex(color) {
  if (typeof color === 'number') return color;
  if (!color) return 0xf9fffe;
  const clean = String(color).replace('_carpet', '').toLowerCase();
  return LLAMA_CARPET_COLORS[clean] ?? 0xf9fffe;
}

/** Wiki: Trader Llamas defend the Wandering Trader against zombies, illagers, and vexes. */
export const LLAMA_DEFENSE_TARGETS = [
  'zombie',
  'husk',
  'drowned',
  'zombie_villager',
  'pillager',
  'vindicator',
  'evoker',
  'illusioner',
  'vex'
];

/** Maximum number of llamas in a caravan train. */
export const LLAMA_MAX_CARAVAN_LENGTH = 10;

/** Whether a mob is a llama or trader llama. */
export function isLlama(mob) {
  return mob?.type === 'llama' || mob?.type === 'trader_llama' || !!mob?.isTraderLlama;
}

/** Whether a mob is specifically a trader llama. */
export function isTraderLlama(mob) {
  return mob?.type === 'trader_llama' || !!mob?.isTraderLlama;
}

/**
 * Wiki: untamed wolves flee from llamas with strength >= 4, and attack llamas with strength 1-3.
 * Tamed wolves ignore wild llamas.
 */
export function wolfReactsToLlama(wolf, llama) {
  if (!wolf || !llama || wolf.isTamed) return null;
  const strength = llama.strength ?? 1;
  return strength >= 4 ? 'flee' : 'attack';
}

/** Wiki: spit damage by difficulty. */
export function llamaSpitDamage(difficulty) {
  const key = Object.hasOwn(LLAMA_SPIT_DAMAGE, difficulty ?? '') ? difficulty : 'normal';
  return LLAMA_SPIT_DAMAGE[key];
}

/**
 * Whether a candidate is worth spitting at.
 *
 * Wiki: a llama retaliates when attacked by a player or another mob, and is hostile toward wolves
 * without provocation. It never attacks on Peaceful.
 * Trader Llamas also retaliate against anyone attacking their Wandering Trader, and naturally attack
 * zombies, illagers, and vexes within 16 blocks.
 */
export function llamaWantsToSpit(llama, candidate, { difficulty = 'normal', recentAttacker = null } = {}) {
  if (!llama || !candidate || candidate === llama) return false;
  if (difficulty === 'peaceful') return false;
  if (candidate.health !== undefined && candidate.health <= 0) return false;

  // Wiki: hostile toward wolves without provocation.
  if (candidate.type === 'wolf' && !candidate.isTamed) return true;

  // Wiki: retaliates against whoever attacked it.
  if (recentAttacker && candidate === recentAttacker) return true;
  if (llama.recentAttacker && candidate === llama.recentAttacker) return true;

  // Wiki: Trader llama defends its master and attacks zombies, illagers, vexes
  if (isTraderLlama(llama)) {
    if (llama.leashHolder?.recentAttacker && candidate === llama.leashHolder.recentAttacker) return true;
    if (LLAMA_DEFENSE_TARGETS.includes(candidate.type)) return true;
  }

  return false;
}

/**
 * The spit projectile.
 *
 * Wiki: "Llamas attack other mobs by spitting at them, dealing 1 damage." Spit is its own tiny
 * projectile rather than an arrow, so it has its own flight and collision here.
 */
export const LLAMA_SPIT = { speed: 14, gravity: 12, life: 3, radius: 0.5 };

/** Body colours for a coat. */
export function llamaCoatColors(variant) {
  return LLAMA_COAT_COLORS[variant] ?? LLAMA_COAT_COLORS.creamy;
}

/**
 * Fire a spit.
 *
 * Aims slightly above the target so the arc lands on it rather than at its feet, which is what the
 * wiki's spit does in practice.
 */
export function spawnLlamaSpit(manager, llama, target) {
  if (!manager || !llama?.mesh) return null;
  const targetPos = target?.position ?? target?.mesh?.position ?? null;
  if (!targetPos) return null;
  const origin = llama.mesh.position.clone();
  origin.y += llama.isBaby ? 0.7 : 1.5;
  const aim = targetPos.clone();
  aim.y += (target.height ?? 1.6) * 0.5;

  const dir = aim.sub(origin);
  const distance = Math.hypot(dir.x, dir.z);
  // A ballistic solution for the horizontal distance, so the arc actually reaches the target.
  const speed = LLAMA_SPIT.speed;
  const flat = new THREE.Vector3(dir.x, 0, dir.z);
  if (flat.lengthSq() < 1e-6) flat.set(Math.sin(llama.yaw), 0, Math.cos(llama.yaw));
  flat.normalize();
  const flightTime = Math.max(0.15, distance / speed);
  const velocity = flat.multiplyScalar(speed);
  velocity.y = dir.y / flightTime + 0.5 * LLAMA_SPIT.gravity * flightTime;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.18),
    new THREE.MeshLambertMaterial({ color: 0xd9f99d })
  );
  mesh.name = 'llama-spit';
  mesh.position.copy(origin);
  manager.scene.add(mesh);

  const spit = {
    kind: 'llama_spit',
    isLlamaSpit: true,
    mesh,
    // Llama spit deliberately does NOT go into `customProjectiles`. That queue belongs to
    // hostileMobBehaviors, which assumes every entry carries `position`, `velocity` and `age` and
    // rebuilds the array each frame — and pushing a llama spit into it crashed that updater for
    // every other projectile in the game. A separate list keeps both owners honest.
    position: origin.clone(),
    velocity,
    age: 0,
    shooter: llama,
    life: LLAMA_SPIT.life,
    damage: llamaSpitDamage(manager.game?.difficulty ?? 'normal')
  };
  if (!manager.llamaSpits) manager.llamaSpits = [];
  manager.llamaSpits.push(spit);
  return spit;
}

/**
 * Advance llama spit.
 *
 * This owns the spit's whole flight, flight being short and self-contained: gravity, terrain, then
 * a mob or the player. It also applies the wiki's note that a spit which misses one target can hit
 * another llama and make them fight.
 *
 * Returns the number of spit still in the air.
 */
export function updateLlamaSpit(manager, dt, player = null) {
  if (!manager?.llamaSpits?.length) return 0;
  // A copy: removal happens inside the loop.
  for (const spit of [...manager.llamaSpits]) {
    if (!spit.position || !spit.velocity) { removeLlamaSpit(manager, spit); continue; }
    spit.life -= dt;
    spit.age += dt;
    if (spit.life <= 0) { removeLlamaSpit(manager, spit); continue; }

    spit.velocity.y -= LLAMA_SPIT.gravity * dt;
    const next = spit.position.clone().addScaledVector(spit.velocity, dt);

    // Terrain stops it.
    const bx = Math.floor(next.x), by = Math.floor(next.y), bz = Math.floor(next.z);
    if (manager.isBlockSolid?.(bx, by, bz)) { removeLlamaSpit(manager, spit); continue; }

    let hit = null;
    if (player?.position && next.distanceTo(player.position.clone().add(new THREE.Vector3(0, 0.9, 0))) < LLAMA_SPIT.radius + 0.3) {
      hit = player;
    } else {
      for (const other of manager.mobs) {
        if (other === spit.shooter || other.health <= 0) continue;
        const otherPos = other.mesh.position.clone();
        otherPos.y += (other.height ?? 1.6) * 0.5;
        if (next.distanceTo(otherPos) < LLAMA_SPIT.radius + (other.width ?? 0.6) * 0.5) {
          hit = other;
          break;
        }
      }
    }

    if (hit) {
      if (spit.damage > 0) hit.takeDamage?.(spit.damage, next, 'llama');
      // Wiki: "Occasionally, their spit can miss its intended target and accidentally hit another
      // llama, causing them to fight each other."
      if (hit.type === 'llama') {
        hit.recentAttacker = spit.shooter;
        hit.spitCooldown = 0;
      }
      removeLlamaSpit(manager, spit);
      continue;
    }

    spit.position.copy(next);
    if (spit.mesh) {
      spit.mesh.position.copy(next);
      // Face along the arc, which is what makes the little cube read as spit in flight.
      if (spit.velocity.lengthSq() > 1e-6) {
        spit.mesh.lookAt(next.clone().add(spit.velocity));
      }
    }
  }
  return manager.llamaSpits.length;
}

/** Remove a spit and its mesh. */
export function removeLlamaSpit(manager, spit) {
  if (!spit) return;
  const index = manager?.llamaSpits?.indexOf(spit) ?? -1;
  if (index >= 0) manager.llamaSpits.splice(index, 1);
  spit.mesh?.removeFromParent?.();
  spit.mesh?.geometry?.dispose?.();
  spit.mesh?.material?.dispose?.();
}

/**
 * Llama model: a tall neck, a small head, large banana-shaped ears and four long legs.
 *
 * The neck is separate from the body so the head can be raised and the spitting pose can be read.
 */
export function createLlamaModel(bodyMat, darkMat, eyeMat) {
  const group = new THREE.Group();

  // Vanilla LlamaModel texture: 128x64
  // Body: 12x18x10 at (29, 0), rotated PI/2 on X like vanilla PartPose
  const bodyGeo = new THREE.BoxGeometry(0.75, 1.125, 0.625);
  applyVanillaBoxUVs(bodyGeo, 29, 0, 128, 64, 12, 18, 10);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 1.1875, 0);
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // Neck group: hinged at base of neck (front of body).
  // Contains the 8x18x6 pillar which carries the eyes and head on its upper front!
  const neck = new THREE.Group();
  neck.position.set(0, 1.05, 0.35);
  neck.rotation.x = 0.28;
  group.add(neck);

  // Neck + Head pillar: 8x18x6 at (0, 14).
  // The upper part of this pillar carries the facial features (eyes and mouth) in vanilla!
  const neckGeo = new THREE.BoxGeometry(0.5, 1.125, 0.375);
  applyVanillaBoxUVs(neckGeo, 0, 14, 128, 64, 8, 18, 6);
  const neckMesh = new THREE.Mesh(neckGeo, bodyMat);
  neckMesh.position.set(0, 1.125 / 2, 0);
  neck.add(neckMesh);

  // Head group at the top of the neck pillar. Holds the protruding snout and ears.
  const head = new THREE.Group();
  head.position.set(0, 1.125, 0);
  neck.add(head);

  // Snout (muzzle): 4x4x9 at (0, 0) - protruding forward in front of the upper head
  const snoutGeo = new THREE.BoxGeometry(0.25, 0.25, 0.5625);
  applyVanillaBoxUVs(snoutGeo, 0, 0, 128, 64, 4, 4, 9);
  const muzzle = new THREE.Mesh(snoutGeo, bodyMat);
  muzzle.position.set(0, -0.22, 0.125);
  head.add(muzzle);

  // Ears: 3x3x2 at (17, 0) - placed directly on top of the head
  const ears = [-1, 1].map((side) => {
    const earGeo = new THREE.BoxGeometry(0.1875, 0.1875, 0.125);
    applyVanillaBoxUVs(earGeo, 17, 0, 128, 64, 3, 3, 2);
    const ear = new THREE.Mesh(earGeo, bodyMat);
    ear.position.set(side * 0.156, 0.09375, -0.0625);
    head.add(ear);
    return ear;
  });

  const eyes = [-1, 1].map(side => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), bodyMat);
    eye.position.set(side * 0.25, -0.12, 0.1875);
    eye.visible = false;
    head.add(eye);
    return eye;
  });

  // Tail: 2x6x2 at (29, 29)
  const tailGeo = new THREE.BoxGeometry(0.125, 0.375, 0.125);
  applyVanillaBoxUVs(tailGeo, 29, 29, 128, 64, 2, 6, 2);
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.position.set(0, 1.15, -0.6);
  tail.rotation.x = -0.3;
  group.add(tail);

  // Dual side chest packs:
  const chestMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  const chestMesh = new THREE.Group();
  chestMesh.name = 'llama-chest';
  chestMesh.material = chestMat;

  const leftChestGeo = new THREE.BoxGeometry(0.2, 0.45, 0.45);
  applyVanillaBoxUVs(leftChestGeo, 45, 28, 128, 64, 8, 8, 3);
  const leftChest = new THREE.Mesh(leftChestGeo, chestMat);
  leftChest.position.set(-0.44, 1.15, -0.05);
  chestMesh.add(leftChest);

  const rightChestGeo = new THREE.BoxGeometry(0.2, 0.45, 0.45);
  applyVanillaBoxUVs(rightChestGeo, 45, 41, 128, 64, 8, 8, 3);
  const rightChest = new THREE.Mesh(rightChestGeo, chestMat);
  rightChest.position.set(0.44, 1.15, -0.05);
  chestMesh.add(rightChest);

  chestMesh.visible = false;
  group.add(chestMesh);

  // Carpet overlay:
  const carpetMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
  const carpetMesh = new THREE.Group();
  carpetMesh.name = 'llama-carpet';
  carpetMesh.material = carpetMat;

  const carpetBodyGeo = new THREE.BoxGeometry(0.77, 1.15, 0.65);
  applyVanillaBoxUVs(carpetBodyGeo, 29, 10, 128, 64, 11, 11, 20);
  const carpetBody = new THREE.Mesh(carpetBodyGeo, carpetMat);
  carpetBody.position.set(0, 1.1875, 0);
  carpetBody.rotation.x = Math.PI / 2;
  carpetMesh.add(carpetBody);

  const carpetNeckGeo = new THREE.BoxGeometry(0.53, 1.13, 0.40);
  carpetNeckGeo.translate(0, 1.125 / 2, 0);
  applyVanillaBoxUVs(carpetNeckGeo, 0, 14, 128, 64, 4, 14, 7);
  const carpetNeck = new THREE.Mesh(carpetNeckGeo, carpetMat);
  carpetNeck.position.set(0, 1.05, 0.35);
  carpetNeck.rotation.x = 0.28;
  carpetMesh.add(carpetNeck);

  carpetMesh.visible = false;
  group.add(carpetMesh);

  // Legs: 4x14x4 at (29, 29)
  const legs = [];
  for (const side of [-1, 1]) {
    for (const z of [0.3125, -0.375]) {
      const legGeo = new THREE.BoxGeometry(0.25, 0.875, 0.25);
      applyVanillaBoxUVs(legGeo, 29, 29, 128, 64, 4, 14, 4);
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(side * 0.21875, 0.4375, z);
      group.add(leg);
      legs.push({ mesh: leg, side, front: z > 0 });
    }
  }

  return {
    group,
    body,
    neck,
    head,
    muzzle,
    ears,
    eyes,
    tail,
    legs,
    chest: chestMesh,
    carpet: carpetMesh,
    chestMesh,
    carpetMesh,
    carpetNeck,
    leftChest,
    rightChest,
    carpetBody
  };
}

/** Apply the coat colour to the model. */
export function applyLlamaCoat(llama) {
  if (!llama) return;
  const colors = llamaCoatColors(llama.variant);

  // The coat IS its sheet. Setting only the colour would tint a material that the bound texture has already
  // whitened, so a coat change would be INVISIBLE -- which is exactly what it was before this.
  const path = LLAMA_SKIN_PATHS[llama.variant] ?? LLAMA_SKIN_PATHS.creamy;
  const skin = llama.skinManager?.loadTexture ? llama.skinManager.loadTexture(path) : null;
  if (skin && llama.bodyMat) adoptWhenReady(llama.bodyMat, skin, colors.base);
  else llama.bodyMat?.color?.setHex(colors.base);  llama.darkMat?.color?.setHex(colors.dark);
}

/** Show or hide the chest and carpet according to what the llama is wearing. */
export function applyLlamaEquipment(llama) {
  if (!llama) return;
  if (llama.chestMesh) llama.chestMesh.visible = !!llama.hasChest;

  if (llama.carpetMesh) {
    const isTrader = isTraderLlama(llama) || !!llama.hasTraderCarpet;
    const hasCarpet = isTrader || Boolean(llama.carpetColor) || Boolean(llama.carpetItem);
    llama.carpetMesh.visible = hasCarpet;

    if (hasCarpet && llama.carpetMesh.material) {
      if (isTrader && !llama.carpetColor) {
        // Default Trader Llama carpet overlay from trader_llama.png
        const path = TRADER_LLAMA_CARPET_PATH;
        const skin = llama.skinManager?.loadTexture ? llama.skinManager.loadTexture(path) : null;
        if (skin) {
          adoptWhenReady(llama.carpetMesh.material, skin, 0xffffff);
          llama.carpetMesh.material.transparent = true;
          llama.carpetMesh.material.alphaTest = 0.1;
        } else {
          llama.carpetMesh.material.color?.setHex(0x3c44aa);
        }
      } else if (llama.carpetColor) {
        if (llama.carpetMesh.material.map) {
          llama.carpetMesh.material.map = null;
          llama.carpetMesh.material.transparent = false;
          llama.carpetMesh.material.needsUpdate = true;
        }
        if (llama.carpetMesh.material.color) {
          llama.carpetMesh.material.color.set(resolveLlamaCarpetHex(llama.carpetColor));
        }
      }
    }
  }
}

/** Walk animation, and the raised-head spit pose. */
export function poseLlamaLegs(llama, phase, walking = true) {
  if (!llama?.legs) return;
  llama.legs.forEach((leg, index) => {
    const swing = walking ? Math.sin(phase + (leg.front ? 0 : Math.PI) + index * 0.15) : 0;
    leg.mesh.rotation.x = swing * 0.45;
  });
  // Wiki: a spitting llama raises its head and leans back before firing.
  const spitting = (llama.spitCharge || 0) > 0;
  if (llama.neck) llama.neck.rotation.x = spitting ? -0.15 : 0.28;
  if (llama.carpetNeck) llama.carpetNeck.rotation.x = spitting ? -0.15 : 0.28;
  if (llama.head) llama.head.rotation.x = spitting ? -0.3 : 0;
}

/** Equip a chest onto a llama, creating its inventory based on its strength. */
export function equipLlamaChest(llama) {
  if (!llama) return false;
  llama.hasChest = true;
  llama.chestSlots = llamaSlotsFor(llama.strength ?? 1);
  if (!llama.chestInventory || llama.chestInventory.length !== llama.chestSlots) {
    llama.chestInventory = new Array(llama.chestSlots).fill(null);
  }
  applyLlamaEquipment(llama);
  return true;
}

/** Equip a carpet onto a llama, displaying its dyed pattern. */
export function equipLlamaCarpet(llama, carpet) {
  if (!llama || !carpet) return false;
  llama.carpetItem = typeof carpet === 'string' ? carpet : 'white_carpet';
  llama.carpetColor = carpet;
  llama.hasTraderCarpet = false;
  applyLlamaEquipment(llama);
  return true;
}

/**
 * Caravan train mechanics.
 *
 * Wiki: When a llama is leashed, up to 10 llamas form a caravan following the llama ahead of them.
 * If a follower gets > 16 blocks away, it leaves the caravan.
 */
export function updateLlamaCaravan(manager, llama, dt) {
  if (!llama || !manager?.mobs) return;

  // 1. If following another llama in caravan:
  if (llama.caravanFollows) {
    const ahead = llama.caravanFollows;
    if (ahead.health <= 0 || !manager.mobs.includes(ahead)) {
      llama.caravanFollows = null;
      if (ahead.caravanFollower === llama) ahead.caravanFollower = null;
      return;
    }

    const dist = llama.mesh.position.distanceTo(ahead.mesh.position);
    if (dist > 16.0) {
      llama.caravanFollows = null;
      if (ahead.caravanFollower === llama) ahead.caravanFollower = null;
      return;
    }

    if (dist > 2.0) {
      const dir = ahead.mesh.position.clone().sub(llama.mesh.position);
      dir.y = 0;
      if (dir.lengthSq() > 1e-4) {
        dir.normalize();
        llama.yaw = Math.atan2(dir.x, dir.z);
        if (llama.mesh) llama.mesh.rotation.y = llama.yaw;
        const speed = dist > 5.0 ? 3.8 : 2.4;
        llama.velocity.x = dir.x * speed;
        llama.velocity.z = dir.z * speed;
      }
    } else {
      llama.velocity.x *= 0.2;
      llama.velocity.z *= 0.2;
    }
    return;
  }

  // 2. Lead llama recruits followers up to maximum 10
  if (llama.leashHolder && !llama.caravanFollows) {
    let tail = llama;
    let length = 1;
    while (tail.caravanFollower && length < LLAMA_MAX_CARAVAN_LENGTH) {
      tail = tail.caravanFollower;
      length++;
    }

    if (length < LLAMA_MAX_CARAVAN_LENGTH) {
      for (const other of manager.mobs) {
        if (other === llama || !isLlama(other) || other.health <= 0) continue;
        if (other.caravanFollows || other.leashHolder) continue;
        const dist = tail.mesh.position.distanceTo(other.mesh.position);
        if (dist <= 10.0) {
          tail.caravanFollower = other;
          other.caravanFollows = tail;
          tail = other;
          length++;
          if (length >= LLAMA_MAX_CARAVAN_LENGTH) break;
        }
      }
    }
  }
}

/**
 * Death drops.
 *
 * Wiki:
 * - 0-2 leather, increased by looting (max +1 per looting level)
 * - Equipped carpet
 * - Equipped chest + all items in chest inventory
 */
export function llamaDrops(mob, { random = Math.random, looting = 0 } = {}) {
  if (!isLlama(mob)) return [];
  const rows = [];
  if (mob.isBaby) return rows;

  const maxLeather = 2 + Math.max(0, Math.floor(looting));
  rows.push(['leather', false, 0, maxLeather]);

  // Equipped carpet
  if (mob.carpetItem) {
    rows.push([mob.carpetItem, false, 1, 1]);
  } else if (mob.carpetColor) {
    const carpetName = typeof mob.carpetColor === 'string'
      ? (mob.carpetColor.endsWith('_carpet') ? mob.carpetColor : `${mob.carpetColor}_carpet`)
      : 'white_carpet';
    rows.push([carpetName, false, 1, 1]);
  } else if (isTraderLlama(mob) && mob.hasTraderCarpet) {
    rows.push(['blue_carpet', false, 1, 1]);
  }

  // Equipped chest + inventory contents
  if (mob.hasChest) {
    rows.push(['chest', true, 1, 1]);
    if (Array.isArray(mob.chestInventory)) {
      for (const item of mob.chestInventory) {
        if (item && item.id) {
          rows.push([item.id, !!item.isBlock, item.count || 1, item.count || 1]);
        }
      }
    }
  }

  return rows;
}

/** Wiki: 1-3 XP for adult, 0 for baby. */
export function llamaXp(mob) {
  if (!isLlama(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}
