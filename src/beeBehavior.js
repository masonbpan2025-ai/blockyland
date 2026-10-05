import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

/**
 * Bee rules and model.
 *
 * Reference: https://minecraft.wiki/w/Bee
 *
 * The bee is a neutral flying arthropod whose defining mechanic is that **stinging is fatal to
 * the bee**: it loses its stinger, cannot attack again, and dies about a minute later. It also
 * pollinates flowers, carries nectar home to a hive, and answers anger as a colony.
 */

/** Wiki: 10 HP. */
export const BEE_HEALTH = 10;

/** Wiki: adult 0.55 wide x 0.5 tall; baby 0.275 x 0.25. */
export const BEE_DIMENSIONS = { width: 0.55, height: 0.5 };
export const BEE_BABY_DIMENSIONS = { width: 0.275, height: 0.25 };
export const BEE_BABY_SCALE = 0.5;

/** Wiki: 2 damage on Easy and Normal, 3 on Hard, and no damage on Peaceful. */
export const BEE_DAMAGE = { peaceful: 0, easy: 2, normal: 2, hard: 3 };

/**
 * Wiki: the sting also poisons — 10 seconds on Normal, 18 on Hard.
 *
 * Easy deals melee damage but no poison.
 */
export const BEE_POISON = {
  peaceful: null,
  easy: null,
  normal: { seconds: 10, damage: 7 },
  hard: { seconds: 18, damage: 14 }
};

/**
 * Wiki: "when a bee's attack on a player succeeds... it loses its stinger after a successful
 * attack, cannot attack further and does not retreat to its nest... and dies approximately one
 * minute later."
 */
export const BEE_STINGERLESS_DEATH_SECONDS = 60;

/**
 * Wiki: "Anger duration is randomly selected between 20 and 39 seconds, inclusive."
 */
export const BEE_ANGER_SECONDS = { min: 20, max: 39 };

/** Wiki: a bee ventures up to 22 blocks from its hive. */
export const BEE_HIVE_RANGE = 22;

/** Wiki: a bee must circle a flower for more than 400 ticks before collecting nectar. */
export const BEE_NECTAR_TICKS = 400;

/** Wiki: a bee can fertilise 10 plants per nectar load, at about a 5% chance per tick. */
export const BEE_MAX_CROPS_GROWN = 10;
export const BEE_POLLINATE_CHANCE = 0.05;

/** Wiki: returning with nectar raises the hive's honey level by one, 1% of the time by two. */
export const BEE_HONEY_PER_TRIP = 1;
export const BEE_HONEY_DOUBLE_CHANCE = 0.01;

/** Wiki: a nest or hive houses up to 3 bees, and honey harvests at level 5. */
export const BEE_HIVE_CAPACITY = 3;
export const BEE_HIVE_MAX_HONEY = 5;

/** Wiki: a bee takes 1 damage every half second after 20 ticks in water. */
export const BEE_WATER_DAMAGE = { graceTicks: 20, damage: 1, intervalSeconds: 0.5 };

/**
 * Wiki: the plants a bee gathers nectar from.
 *
 * Allium through the tulips, plus the special cases the wiki calls out. Closed eyeblossoms and
 * golden dandelions are deliberately excluded because a bee "completely ignores" them.
 */
export const BEE_FLOWERS = [
  'poppy', 'dandelion', 'allium', 'azure_bluet', 'blue_orchid', 'cornflower',
  'lily_of_the_valley', 'orange_tulip', 'pink_tulip', 'red_tulip', 'white_tulip',
  'lilac', 'peony', 'rose_bush', 'sunflower', 'pink_petals',
  'cherry_leaves', 'azalea_leaves', 'spore_blossom', 'chorus_flower', 'mangrove_propagule'
];

/** Wiki: feeding a bee a wither rose gives it Wither for 2 seconds. */
export const BEE_WITHER_ROSE = { effect: 'wither', seconds: 2 };

/** Wiki: feeding an open eyeblossom gives it Poison for 1.25 seconds. */
export const BEE_EYEBLOSSOM = { effect: 'poison', seconds: 1.25 };

/** Body colours. */
export const BEE_COLORS = { body: 0xf5c518, stripe: 0x1f2937, wing: 0xdbeafe, eye: 0x111827 };

/** True when the mob is a bee. */
export function isBee(mob) {
  return mob?.type === 'bee';
}

/** Melee damage at the given difficulty. */
export function beeDamageFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(BEE_DAMAGE, key) ? BEE_DAMAGE[key] : BEE_DAMAGE.normal;
}

/**
 * The poison a bee's sting applies, or null.
 *
 * Note the explicit key check: `??` would treat Easy's deliberate `null` as nullish and hand
 * back Normal's poison, which is the bug the cave spider's identical table had.
 */
export function beePoisonFor(difficulty) {
  const key = difficulty ?? 'normal';
  return Object.hasOwn(BEE_POISON, key) ? BEE_POISON[key] : BEE_POISON.normal;
}

/** Wiki: 1-3 XP with credit; babies none. */
export const BEE_XP = 3;

/** Wiki: bees drop nothing but experience. */
export function beeDrops() {
  return [];
}

/** True when the block id is a plant a bee will take nectar from. */
export function isBeeFlower(blockId) {
  if (blockId === undefined || blockId === null) return false;
  // Block ids in this engine are numbers, so resolve to a name where possible.
  if (typeof blockId === 'number') {
    for (const [name, id] of Object.entries(BLOCKS)) {
      if (id === blockId) return BEE_FLOWERS.includes(name.toLowerCase());
    }
    return false;
  }
  return BEE_FLOWERS.includes(String(blockId).toLowerCase());
}

/**
 * Whether a bee may gather from that plant, and what it suffers for it.
 *
 * Wiki: a bee can gather from a wither rose but receives the Wither effect, and can gather from
 * an open eyeblossom but is poisoned. Golden dandelions and closed eyeblossoms are ignored
 * entirely.
 */
export function beeGatherHazard(blockName) {
  const name = String(blockName ?? '').toLowerCase();
  if (name === 'wither_rose') return BEE_WITHER_ROSE;
  if (name === 'open_eyeblossom') return BEE_EYEBLOSSOM;
  if (name === 'closed_eyeblossom' || name === 'golden_dandelion') return 'ignored';
  return null;
}

/**
 * Roll an anger duration.
 *
 * Wiki: "Anger duration is randomly selected between 20 and 39 seconds, inclusive."
 */
export function rollBeeAngerSeconds(random = Math.random) {
  const { min, max } = BEE_ANGER_SECONDS;
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * Anger a bee, and its colony.
 *
 * Wiki: "All bees nearby are angered when an individual bee is attacked (unless the bee attacked
 * is killed in one hit)". Returns the bees that responded, including the victim.
 *
 * `lethal` carries the one-hit-kill exemption: a bee killed outright does not call for help.
 */
export function angerBees(manager, bee, attacker = null, { range = 24, lethal = false, random = Math.random } = {}) {
  const angered = [];
  if (!manager?.mobs || !isBee(bee)) return angered;
  if (!lethal) {
    // Wiki: a bee killed in one hit does not call for help, and does not itself become angry.
    bee.angerTimer = Math.max(bee.angerTimer || 0, rollBeeAngerSeconds(random));
    bee.angryAt = attacker || bee.angryAt || null;
    angered.push(bee);
  }
  for (const other of manager.mobs) {
    // The victim is skipped here: when `lethal` it has already been excluded above, and when not
    // it was pushed once, so counting it again would report it twice.
    if (other === bee || !isBee(other) || other.health <= 0) continue;
    if (other.mesh.position.distanceTo(bee.mesh.position) > range) continue;
    other.angerTimer = Math.max(other.angerTimer || 0, rollBeeAngerSeconds(random));
    other.angryAt = attacker || bee.angryAt || null;
    angered.push(other);
  }
  return angered;
}

/** Tick a bee's anger down. */
export function updateBeeAnger(bee, dt) {
  if (!isBee(bee)) return;
  if (bee.angerTimer > 0) bee.angerTimer = Math.max(0, bee.angerTimer - dt);
}

/** True while the bee is hostile. */
export function beeIsAngry(bee) {
  return isBee(bee) && (bee.angerTimer || 0) > 0;
}

/**
 * A successful sting.
 *
 * Wiki: the target is poisoned, the bee loses its stinger, can never attack again, does not return
 * to its nest, and dies about a minute later.
 *
 * Returns the poison applied, or null.
 */
export function beeSting(manager, bee, target) {
  if (!isBee(bee) || bee.hasStung || !target) return null;
  const difficulty = manager?.game?.difficulty ?? 'normal';
  const poison = beePoisonFor(difficulty);

  const damage = beeDamageFor(difficulty);
  if (damage > 0) target.takeDamage?.(damage, bee.mesh.position, 'bee');
  if (poison && !target.poisonImmune) target.applyStatusEffect?.('poison', poison.seconds, 1);

  bee.hasStung = true;
  bee.stingerless = true;
  bee.angerTimer = 0;
  bee.angryAt = null;
  bee.deathTimer = BEE_STINGERLESS_DEATH_SECONDS;
  bee.isReturningHome = false;
  return poison;
}

/**
 * Count a stingerless bee down to its death.
 *
 * Wiki: it "dies approximately one minute later", and does not retreat to its nest in the
 * meantime. Returns true when the bee died this step.
 */
export function updateBeeStingerless(bee, dt) {
  if (!isBee(bee) || !bee.stingerless || bee.health <= 0) return false;
  bee.deathTimer = (bee.deathTimer ?? BEE_STINGERLESS_DEATH_SECONDS) - dt;
  if (bee.deathTimer > 0) return false;
  // It dies of its injuries rather than being killed, so no loot or XP is awarded.
  bee.health = 0;
  bee.diedOfSting = true;
  return true;
}

/**
 * Water exposure.
 *
 * Wiki: a bee "takes 1 damage every half second if they stay in water for more than 20 ticks".
 */
export function updateBeeWater(manager, bee, dt, inWater) {
  if (!isBee(bee) || bee.health <= 0) return false;
  if (!inWater) {
    bee.waterTicks = 0;
    bee.waterDamageTimer = 0;
    return false;
  }
  bee.waterTicks = (bee.waterTicks || 0) + dt * 20;
  if (bee.waterTicks <= BEE_WATER_DAMAGE.graceTicks) return false;
  bee.waterDamageTimer = (bee.waterDamageTimer || 0) + dt;
  if (bee.waterDamageTimer < BEE_WATER_DAMAGE.intervalSeconds) return false;
  bee.waterDamageTimer = 0;
  manager?.damageMob?.(bee, BEE_WATER_DAMAGE.damage, null, false, null, true);
  return true;
}

/**
 * Collecting nectar.
 *
 * Wiki: a bee circles a flower for more than 400 ticks before collecting, and a damaged bee
 * "ceases its efforts". Returns true when the bee now carries nectar.
 */
export function updateBeeNectar(bee, dt, { damaged = false, atFlower = false } = {}) {
  if (!isBee(bee)) return false;
  if (bee.hasNectar) return true;
  if (damaged || !atFlower) {
    // Any damage resets the effort entirely.
    bee.nectarTicks = damaged ? 0 : (bee.nectarTicks || 0);
    if (!atFlower) bee.nectarTicks = 0;
    return false;
  }
  bee.nectarTicks = (bee.nectarTicks || 0) + dt * 20;
  if (bee.nectarTicks < BEE_NECTAR_TICKS) return false;
  bee.hasNectar = true;
  bee.nectarTicks = 0;
  bee.cropsGrownSincePollination = 0;
  return true;
}

/**
 * Delivering nectar to a hive.
 *
 * Wiki: entering with nectar raises the hive's honey level by one, with a 1% chance of two.
 * Returns the amount added.
 */
export function deliverBeeNectar(bee, hive, random = Math.random) {
  if (!isBee(bee) || !bee.hasNectar || !hive) return 0;
  const add = (random() < BEE_HONEY_DOUBLE_CHANCE ? 2 : 1) * BEE_HONEY_PER_TRIP;
  hive.honeyLevel = Math.min(BEE_HIVE_MAX_HONEY, (hive.honeyLevel || 0) + add);
  bee.hasNectar = false;
  return add;
}

/** True when a hive is full of honey and can be harvested. */
export function hiveIsHarvestable(hive) {
  return !!hive && (hive.honeyLevel || 0) >= BEE_HIVE_MAX_HONEY;
}

/** True when the hive has room for another bee. */
export function hiveHasRoom(hive) {
  return !!hive && (hive.bees?.length || 0) < BEE_HIVE_CAPACITY;
}

/**
 * Whether a plant may be pollinated.
 *
 * Wiki: the crop list, and the bee must be 1 to 2 blocks directly above the plant.
 */
export const BEE_POLLINATABLE = [
  'wheat', 'potatoes', 'carrots', 'beetroots', 'melon_stem', 'pumpkin_stem',
  'sweet_berry_bush', 'cave_vines', 'torchflower_crop'
];

export function canPollinate(blockName, verticalOffset) {
  const name = String(blockName ?? '').toLowerCase();
  if (!BEE_POLLINATABLE.includes(name)) return false;
  return verticalOffset >= 1 && verticalOffset <= 2;
}

/**
 * Bee model: a striped body, two pairs of wings, antennae, and a stinger that is hidden once the
 * bee has stung.
 *
 * The wings are exposed as `left`/`right` aliases carrying a reachable `rotation`, because the
 * shared `moveFlyingMob` animates wings through exactly that path. The bat shipped a frozen model
 * by getting this shape wrong, so it is matched deliberately here.
 */
export function createBeeModel(bodyMat, stripeMat, wingMat, eyeMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.4), bodyMat);
  body.position.set(0, 0.28, 0);
  group.add(body);

  // Two dark stripes, which is what makes a bee read as a bee at a glance.
  for (const z of [0.06, -0.08]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.27, 0.07), stripeMat);
    stripe.position.set(0, 0.28, z);
    group.add(stripe);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), bodyMat);
  head.position.set(0, 0.3, 0.28);
  group.add(head);

  const eyeGeo = new THREE.BoxGeometry(0.05, 0.06, 0.03);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.07, 0.02, 0.1);
    head.add(eye);
    return eye;
  });

  // Antennae.
  const antennaGeo = new THREE.BoxGeometry(0.02, 0.02, 0.16);
  for (const side of [-1, 1]) {
    const antenna = new THREE.Mesh(antennaGeo, stripeMat);
    antenna.position.set(side * 0.05, 0.11, 0.06);
    antenna.rotation.x = -0.5;
    antenna.rotation.y = side * 0.4;
    head.add(antenna);
  }

  // The stinger, hidden once the bee has stung.
  const stinger = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), stripeMat);
  stinger.position.set(0, 0.26, -0.24);
  group.add(stinger);

  // Two wings per side. The wrapper carries `rotation` pointing at the pivot, which is the
  // contract `moveFlyingMob` writes to.
  const wingGeo = new THREE.BoxGeometry(0.22, 0.02, 0.12);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.42, 0);
    for (const z of [0.06, -0.06]) {
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.position.set(side * 0.11, 0, z);
      wing.rotation.z = side * 0.15;
      pivot.add(wing);
    }
    group.add(pivot);
    wings.push({ pivot, side, rotation: pivot.rotation, wing: pivot.children[0] });
  }
  wings.left = wings[0];
  wings.right = wings[1];

  return { group, body, head, eyes, stinger, wings };
}

/** Hide the stinger once the bee has used it, and tint an angry bee's eyes red. */
export function poseBee(bee) {
  if (!bee) return;
  if (bee.stinger) bee.stinger.visible = !bee.hasStung;
  if (bee.eyes) {
    for (const eye of bee.eyes) {
      if (!eye.material?.color) continue;
      // Wiki: "the eyes of angered bees turn red".
      const target = beeIsAngry(bee) ? 0xdc2626 : BEE_COLORS.eye;
      eye.material.color.setHex(target);
    }
  }
}
