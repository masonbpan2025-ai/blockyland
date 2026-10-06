import * as THREE from 'three';
import { adoptWhenReady } from './mobVisuals/modelBuilder.js';
import { applyQuadUvs } from './mobVisuals/entityBox.js';

/** The real 128x64 trader llama caravan decor sheet. */
const TRADER_LLAMA_CARPET_PATH = '/assets/entity/llama/decor/trader_llama.png';

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
 */
export function llamaWantsToSpit(llama, candidate, { difficulty = 'normal', recentAttacker = null } = {}) {
  if (!llama || !candidate || candidate === llama) return false;
  if (difficulty === 'peaceful') return false;
  if (candidate.health !== undefined && candidate.health <= 0) return false;
  // Wiki: hostile toward wolves without provocation.
  if (candidate.type === 'wolf') return true;
  // Otherwise it only retaliates against whoever hurt it.
  return !!recentAttacker && candidate === recentAttacker;
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
export function createLlamaModel(bodyMat, darkMat, eyeMat, options = {}) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.62, 1.0), bodyMat);
  applyQuadUvs(body, 16, 16, 12, 9, 18, 128, 64);
  body.position.set(0, 1.0, 0);
  group.add(body);

  // The neck, tall and slightly forward.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.72, 0.32), bodyMat);
  applyQuadUvs(neck, 0, 16, 4, 18, 6, 128, 64);
  neck.position.set(0, 1.55, 0.34);
  neck.rotation.x = 0.28;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.44), bodyMat);
  applyQuadUvs(head, 0, 42, 5, 5, 6, 128, 64);
  head.position.set(0, 1.95, 0.5);
  group.add(head);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), darkMat);
  muzzle.position.set(0, -0.04, 0.28);
  head.add(muzzle);

  // Large banana-shaped ears, which are the llama's most recognisable feature.
  const earGeo = new THREE.BoxGeometry(0.07, 0.3, 0.1);
  const ears = [-1, 1].map((side) => {
    const ear = new THREE.Mesh(earGeo, darkMat);
    ear.position.set(side * 0.1, 0.2, -0.05);
    ear.rotation.z = side * 0.35;
    ear.rotation.x = -0.2;
    head.add(ear);
    return ear;
  });

  const eyeGeo = new THREE.BoxGeometry(0.06, 0.07, 0.03);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.1, 0.04, 0.23);
    head.add(eye);
    return eye;
  });

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.12), darkMat);
  tail.position.set(0, 1.15, -0.55);
  tail.rotation.x = -0.3;
  group.add(tail);

  // A chest, hidden until the llama is equipped with one.
  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.4, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b })
  );
  chest.position.set(0, 1.2, -0.2);
  chest.visible = false;
  group.add(chest);

  // A carpet, hidden until one is applied. Its colour is set by the caller.
  // The real caravan decor sheet, when a loader supplies one. The flat blue remains the stand-in, so a build with
  // no assets still renders a carpet. // TRADER_CARPET_SHEET
  const traderCarpetSheet = options.loadTexture ? options.loadTexture(TRADER_LLAMA_CARPET_PATH) : null;
  if (traderCarpetSheet) {
    traderCarpetSheet.magFilter = THREE.NearestFilter;
    traderCarpetSheet.minFilter = THREE.NearestFilter;
    traderCarpetSheet.needsUpdate = true;
  }
  const carpetMat = traderCarpetSheet
    ? new THREE.MeshLambertMaterial({ map: traderCarpetSheet, transparent: true, alphaTest: 0.5 })
    : new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.8), carpetMat);
  carpet.position.set(0, 1.32, 0.05);
  carpet.visible = false;
  group.add(carpet);

  const legGeo = new THREE.BoxGeometry(0.16, 0.72, 0.16);
  const legs = [];
  for (const side of [-1, 1]) {
    for (const z of [0.3, -0.3]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(side * 0.21, 0.36, z);
      group.add(leg);
      legs.push({ mesh: leg, side, front: z > 0 });
    }
  }

  return { group, body, neck, head, muzzle, ears, eyes, tail, legs, chest, carpet, chestMesh: chest, carpetMesh: carpet };
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
    llama.carpetMesh.visible = !!llama.carpetColor;
    if (llama.carpetColor && llama.carpetMesh.material?.color) {
      llama.carpetMesh.material.color.set(llama.carpetColor);
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
  const spitting = llama.spitCharge > 0;
  if (llama.neck) llama.neck.rotation.x = spitting ? -0.15 : 0.28;
  if (llama.head) llama.head.rotation.x = spitting ? -0.3 : 0;
}
