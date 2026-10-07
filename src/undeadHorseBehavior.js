import * as THREE from 'three';

/**
 * Undead horse rules: the skeleton horse and the zombie horse.
 *
 * References: https://minecraft.wiki/w/Skeleton_Horse · https://minecraft.wiki/w/Zombie_Horse
 *
 * They are a natural pair and are implemented together because they share almost everything: both are undead
 * HORSES, both are passive alone and hostile only as a jockey, both can be saddled and ridden once separated
 * from a rider, both share the horse hitbox, and neither is bred. The differences are health, speed, the
 * skeleton trap, and sunlight.
 */

/** Wiki: skeleton horse 15 HP; zombie horse 25 HP. */
export const UNDEAD_HORSE_HEALTH = { skeleton_horse: 15, zombie_horse: 25 };

/**
 * Wiki: both are 1.3965 wide x 1.6 tall in Java, with babies at 0.6982 x 0.8 -- the horse box exactly, which
 * is why the horse's own dimensions are reused rather than restated.
 */
export const UNDEAD_HORSE_DIMENSIONS = { width: 1.3965, height: 1.6 };
export const UNDEAD_HORSE_BABY_DIMENSIONS = { width: 0.6982, height: 0.8 };
export const UNDEAD_HORSE_BABY_SCALE = 0.5;

/** Wiki: both list a speed of 0.2. */
export const UNDEAD_HORSE_SPEED = 0.2;

/**
 * Wiki: the skeleton horse spawns "rarely during thunderstorms as skeleton trap horses" and, once approached,
 * "transforms into four skeleton horsemen". So the trap is four riders, and it needs a thunderstorm.
 */
export const SKELETON_TRAP = { riders: 4, requiresThunder: true, triggerRange: 10 };

/**
 * Wiki: the skeleton horse, "unlike most undead mobs, ... do[es] not burn under direct sunlight". The zombie
 * horse's page gives no such exemption, so this is a real difference between the pair rather than shared.
 */
export const UNDEAD_HORSE_SUN = { skeleton_horse: false, zombie_horse: true };

/** Wiki: both are undead, so they share the undead traits. */
export const UNDEAD_HORSE_TRAITS = {
  undead: true,
  poisonImmune: true,
  invertedHealing: true,
  canBreatheUnderwater: true,
  sensitiveToSmite: true
};

/**
 * Wiki: both lead with a lead "only when dismounted" in the zombie horse's case, and both refuse a boat.
 * Recorded as data because neither transport nor leads are modelled.
 */
export const UNDEAD_HORSE_TRANSPORT = { boat: false, minecart: true, leashableWhenDismounted: true };

/** Wiki: a saddle can be equipped, and removed with shears. The zombie horse accepts horse armour too. */
export const UNDEAD_HORSE_EQUIPMENT = {
  skeleton_horse: { saddle: true, armor: false, remover: 'shears' },
  zombie_horse: { saddle: true, armor: true, remover: 'shears' }
};

/** Body colours: bone white for the skeleton, rotted green-grey for the zombie. */
export const UNDEAD_HORSE_COLORS = {
  skeleton_horse: { coat: 0xd8d8cc, mane: 0xbdbdb0, eye: 0x101010 },
  zombie_horse: { coat: 0x4a6b3a, mane: 0x2f4425, eye: 0x101010 }
};

/** True for either undead horse. */
export function isUndeadHorse(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'skeleton_horse' || type === 'zombie_horse';
}

/** True for the skeleton horse specifically. */
export function isSkeletonHorse(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'skeleton_horse';
}

/** True for the zombie horse specifically. */
export function isZombieHorse(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'zombie_horse';
}

/** The health for the type. */
export function undeadHorseHealth(type) {
  return UNDEAD_HORSE_HEALTH[type] ?? UNDEAD_HORSE_HEALTH.skeleton_horse;
}

/** The dimensions for the type, honouring the baby form. */
export function undeadHorseDimensions(type, { isBaby = false } = {}) {
  if (!isUndeadHorse(type)) return null;
  return isBaby ? { ...UNDEAD_HORSE_BABY_DIMENSIONS } : { ...UNDEAD_HORSE_DIMENSIONS };
}

/**
 * Whether this undead horse burns in daylight.
 *
 * Wiki: the skeleton horse "do[es] not burn under direct sunlight", called out as unlike most undead mobs.
 * The zombie horse's page grants no such exemption, so it does.
 */
export function undeadHorseBurnsInDaylight(type) {
  const burns = UNDEAD_HORSE_SUN[type];
  return burns ?? false;
}

/** Wiki: both are passive alone and hostile only as a jockey, because the rider controls the pathfinding. */
export function undeadHorseIsHostile(mob) {
  if (!isUndeadHorse(mob)) return false;
  return !!mob.rider;
}

/** Wiki: it becomes passive "once separated from its skeleton/zombie rider". */
export function undeadHorseSeparateFromRider(mob) {
  if (!isUndeadHorse(mob)) return null;
  const rider = mob.rider ?? null;
  mob.rider = null;
  mob.riderCount = 0;
  // Wiki: it is tame once separated, so a player can then ride it.
  mob.tame = true;
  return rider;
}

/** Wiki: a saddle can be equipped; the zombie horse also takes horse armour. */
export function equipUndeadHorse(mob, itemId) {
  if (!isUndeadHorse(mob)) return false;
  const equipment = UNDEAD_HORSE_EQUIPMENT[mob.type];
  if (!equipment) return false;
  const id = String(itemId ?? '');
  if (id === 'saddle') {
    if (!equipment.saddle || mob.hasSaddle) return false;
    mob.hasSaddle = true;
    return true;
  }
  // Wiki: the zombie horse accepts horse armour, the skeleton horse does not.
  if (id.endsWith('_horse_armor')) {
    if (!equipment.armor || mob.horseArmor) return false;
    mob.horseArmor = id;
    return true;
  }
  return false;
}

/** Wiki: shears remove the saddle or the armour. */
export function shearUndeadHorse(mob, itemId) {
  if (!isUndeadHorse(mob)) return null;
  if (String(itemId ?? '') !== UNDEAD_HORSE_EQUIPMENT[mob.type]?.remover) return null;
  if (mob.horseArmor) {
    const removed = mob.horseArmor;
    mob.horseArmor = null;
    return removed;
  }
  if (mob.hasSaddle) {
    mob.hasSaddle = false;
    return 'saddle';
  }
  return null;
}

/**
 * Whether the skeleton trap may spring.
 *
 * Wiki: a skeleton horse "sometimes spawns from lightning strikes during thunderstorms, as a skeleton trap.
 * When this trap is approached, it transforms into four skeleton horsemen."
 */
export function skeletonTrapReady(mob, {
  weatherType = 'clear', distanceToPlayer = Infinity
} = {}) {
  if (!isSkeletonHorse(mob)) return false;
  if (!mob.isTrap) return false;
  if (SKELETON_TRAP.requiresThunder && weatherType !== 'thunder') return false;
  return distanceToPlayer <= SKELETON_TRAP.triggerRange;
}

/**
 * Spring the trap.
 *
 * Wiki: it "transforms into four skeleton horsemen" -- a skeleton with an enchanted bow and an enchanted iron
 * helmet on each horse. Returns the riders created.
 */
export function springSkeletonTrap(manager, mob, random = Math.random) {
  if (!isSkeletonHorse(mob) || !mob.isTrap) return [];
  mob.isTrap = false;
  const riders = [];
  const spawn = manager?.spawnMob;
  if (typeof spawn !== 'function') return riders;
  // The trap horse itself becomes the first horseman.
  const first = spawn.call(manager, 'skeleton', mob.mesh.position.x, mob.mesh.position.y, mob.mesh.position.z);
  if (first) {
    first.rider = mob;
    first.mount = mob;
    first.enchanted = true;
    mob.rider = first;
    mob.riderCount = 1;
    riders.push(first);
  }
  // The other three arrive nearby.
  for (let i = 1; i < SKELETON_TRAP.riders; i++) {
    const angle = (i / SKELETON_TRAP.riders) * Math.PI * 2;
    const horse = spawn.call(
      manager, 'skeleton_horse',
      mob.mesh.position.x + Math.cos(angle) * 2,
      mob.mesh.position.y,
      mob.mesh.position.z + Math.sin(angle) * 2
    );
    if (!horse) continue;
    horse.isTrap = false;
    const skeleton = spawn.call(manager, 'skeleton', horse.mesh.position.x, horse.mesh.position.y, horse.mesh.position.z);
    if (skeleton) {
      skeleton.rider = horse;
      skeleton.mount = horse;
      skeleton.enchanted = true;
      horse.rider = skeleton;
      horse.riderCount = 1;
      riders.push(skeleton);
    }
  }
  return riders;
}

/** Wiki: a zombie horse "rarely spawns in dark areas ... being ridden and controlled by a zombie horseman". */
export function zombieHorseWantsRider(mob, { lightLevel = 15, night = false } = {}) {
  if (!isZombieHorse(mob)) return false;
  if (mob.rider) return false;
  return night || lightLevel <= 7;
}

/**
 * Whether the type can be bred.
 *
 * Wiki: neither page gives a breeding route for these two -- the zombie horse in particular is created rather
 * than bred -- so the absence is explicit rather than an oversight.
 */
export function undeadHorseCanBreed() {
  return false;
}

/**
 * The base death drop for the type.
 *
 * Wiki: the skeleton horse drops 0-2 bones and the zombie horse 2-3 rotten flesh. This MIRRORS the loot
 * table in `mobs.js` rather than replacing it -- the table is what the manager routes through -- so a test
 * can assert the two agree, which is how the 0-2 versus 2-3 error was found.
 *
 * A baby yields nothing on either page.
 */
export function undeadHorseDrops(mob) {
  if (!isUndeadHorse(mob) || mob.isBaby) return [];
  if (isSkeletonHorse(mob)) return [['bone', false, 0, 2]];
  return [['rotten_flesh', false, 2, 3]];
}

/**
 * Gear the mob is wearing, which the wiki says is dropped on death as well as by shearing.
 *
 * Wiki: the skeleton horse "If saddled, it drops a saddle", and the zombie horse "If equipped with a
 * saddle or horse armor, the saddle and/or horse armor will be dropped".
 */
export function undeadHorseEquipmentDrops(mob) {
  if (!isUndeadHorse(mob) || mob.isBaby) return [];
  const rows = [];
  if (mob.hasSaddle) rows.push(['saddle', false, 1, 1]);
  if (mob.horseArmor) rows.push([mob.horseArmor, false, 1, 1]);
  return rows;
}

/**
 * Wiki: "1-3 when killed by a player or tamed wolf", and a baby yields none.
 *
 * I first wrote this as zero on the assumption that the pages gave no value. They do, and the correction is
 * recorded rather than quietly changed.
 */
export function undeadHorseXp(mob, random = Math.random) {
  if (!isUndeadHorse(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(random() * 3);
}

/**
 * Build an undead horse model: the horse silhouette in bone or rotted flesh, with a saddle overlay.
 *
 * The horse geometry is deliberately the same shape as the living horse, because the wiki gives the same
 * hitbox -- only the materials and the missing eye glow differ.
 */
export function createUndeadHorseModel(type, coatMat, maneMat, eyeMat, hoofMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.6), coatMat);
  body.position.y = 1.0;
  group.add(body);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.5), coatMat);
  neck.position.set(0, 1.45, 0.85);
  group.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.85), coatMat);
  head.position.set(0, 1.85, 1.15);
  group.add(head);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
    eye.position.set(side * 0.16, 0.04, 0.44);
    head.add(eye);
    eyes.push(eye);
  }

  // The mane, which is what reads as a horse at a glance.
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.9), maneMat);
  mane.position.set(0, 1.8, 0.7);
  group.add(mane);

  const legGeo = new THREE.BoxGeometry(0.24, 0.95, 0.24);
  const legs = [];
  for (const [lx, lz] of [[-0.28, 0.55], [0.28, 0.55], [-0.28, -0.55], [0.28, -0.55]]) {
    const leg = new THREE.Mesh(legGeo, coatMat);
    leg.position.set(lx, 0.48, lz);
    group.add(leg);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.28), hoofMat);
    hoof.position.y = -0.45;
    leg.add(hoof);
    legs.push(leg);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), maneMat);
  tail.position.set(0, 1.2, -0.9);
  group.add(tail);

  // The saddle, hidden until equipped. The skeleton horse is saddled in its trap form.
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 0.7), hoofMat);
  saddle.position.set(0, 1.42, 0);
  saddle.visible = false;
  group.add(saddle);

  return { group, body, neck, head, eyes, mane, legs, tail, saddle };
}

/** Pose the undead horse: the living horse's gait, plus the undead head droop. */
export function poseUndeadHorse(mob, phase = 0) {
  if (!isUndeadHorse(mob) || !mob.mesh) return;
  (mob.legs ?? []).forEach((leg, index) => {
    if (leg?.rotation) leg.rotation.x = Math.sin(phase * 3 + index * 0.8) * 0.3;
  });
  if (mob.head) {
    // Wiki: an undead horse keeps its head lower than a living one, which is what the renders show.
    mob.head.rotation.x = 0.18 + Math.sin(phase * 0.8) * 0.05;
  }
  if (mob.tail) mob.tail.rotation.z = Math.sin(phase * 1.4) * 0.12;
  if (mob.saddle) mob.saddle.visible = mob.hasSaddle === true;
}
