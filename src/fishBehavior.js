import * as THREE from 'three';

/**
 * Pufferfish and tropical fish rules.
 *
 * References: https://minecraft.wiki/w/Pufferfish · https://minecraft.wiki/w/Tropical_Fish
 *
 * They are both small aquatic fish at 3 HP and speed 0.7, so they share a module. The pufferfish is the
 * interesting one: it is NEUTRAL, never seeks a fight, and instead inflates through two stages as something
 * approaches, dealing Poison contact damage that depends on how puffed it is.
 */

/** Wiki: both are 3 HP. */
export const PUFFERFISH_HEALTH = 3;
export const TROPICAL_FISH_HEALTH = 3;

/**
 * Wiki: the pufferfish has THREE hitboxes -- unpuffed 0.35, semi-puffed 0.49, fully puffed 0.7. Tropical fish
 * are a flat 0.5 x 0.4.
 */
export const PUFFERFISH_DIMENSIONS = {
  unpuffed: { width: 0.35, height: 0.35 },
  semi: { width: 0.49, height: 0.49 },
  puffed: { width: 0.7, height: 0.7 }
};
export const TROPICAL_FISH_DIMENSIONS = { width: 0.5, height: 0.4 };

/** Wiki: both list a speed of 0.7. */
export const FISH_SPEED = 0.7;

/**
 * Wiki contact damage. The pufferfish deals damage TOGETHER WITH Poison, so every entry carries both.
 *
 * "Semi-puffed: Easy and Normal 2, Hard 3. Fully puffed: Easy 2.5, Normal 3, Hard 4.5."
 */
export const PUFFERFISH_CONTACT = {
  unpuffed: { peaceful: 0, easy: 0, normal: 0, hard: 0 },
  semi: { peaceful: 0, easy: 2, normal: 2, hard: 3 },
  puffed: { peaceful: 0, easy: 2.5, normal: 3, hard: 4.5 }
};

/** Wiki: Poison for 3 seconds when semi-puffed and 6 seconds when fully puffed, in Java. */
export const PUFFERFISH_POISON = { semi: 3, puffed: 6 };

/**
 * Wiki: it inflates "when approached too closely by players, axolotls, or non-aquatic mobs". So the trigger is
 * a nearby NON-AQUATIC entity, which is a category rather than a single mob.
 */
export const PUFFERFISH_TRIGGER = { semiRange: 3.5, puffedRange: 1.8 };

/** The mobs it does NOT react to, because they are aquatic like it. */
export const AQUATIC_TYPES = [
  'cod', 'salmon', 'tropical_fish', 'pufferfish', 'squid', 'glow_squid',
  'dolphin', 'turtle', 'guardian', 'elder_guardian', 'axolotl', 'tadpole', 'drowned'
];

/** Wiki: tropical fish have 3,072 variants in Java across two body shapes. */
export const TROPICAL_FISH_VARIANTS = 3072;
export const TROPICAL_FISH_SHAPES = ['small', 'large'];

/** Wiki: 16 base colours are combined for the pattern, body and fins. */
export const TROPICAL_FISH_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
];

/** The six patterns the wiki lists for a small fish and the five for a large one. */
export const TROPICAL_FISH_PATTERNS = {
  small: ['kob', 'sunstreak', 'snooper', 'dasher', 'brinely', 'spotty'],
  large: ['flopper', 'stripey', 'glitter', 'blockfish', 'betty', 'clayfish']
};

/** Body colours for the models. */
export const FISH_COLORS = {
  pufferfish: { body: 0xc9a227, belly: 0xf0e2b6, spine: 0x6b5410, eye: 0x101010 },
  tropical_fish: { body: 0xf28c28, belly: 0xffe1b3, fin: 0xffffff, eye: 0x101010 }
};

/** True when the mob is a pufferfish. */
export function isPufferfish(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'pufferfish';
}

/** True when the mob is a tropical fish. */
export function isTropicalFish(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'tropical_fish';
}

/** True for either fish. */
export function isSmallFish(mob) {
  return isPufferfish(mob) || isTropicalFish(mob);
}

/**
 * The pufferfish's hitbox for its current puff stage.
 *
 * Wiki: this is a real gameplay difference, not a cosmetic one -- the hitbox grows by 2x from unpuffed to
 * fully puffed, which is what makes the contact damage reach further.
 */
export function pufferfishDimensions(stage = 'unpuffed') {
  return { ...(PUFFERFISH_DIMENSIONS[stage] ?? PUFFERFISH_DIMENSIONS.unpuffed) };
}

/** The puff stage for a mob, defaulting to unpuffed. */
export function pufferfishStage(mob) {
  if (!isPufferfish(mob)) return null;
  if (mob.puffStage) return mob.puffStage;
  const progress = mob.puffProgress ?? 0;
  if (progress >= 0.66) return 'puffed';
  if (progress >= 0.33) return 'semi';
  return 'unpuffed';
}

/**
 * Contact damage for the stage and difficulty.
 *
 * Wiki: 0 when unpuffed, 2/2/3 when semi-puffed, 2.5/3/4.5 when fully puffed on Easy/Normal/Hard.
 */
export function pufferfishDamageFor(stage, difficulty = 'normal') {
  const table = PUFFERFISH_CONTACT[stage] ?? PUFFERFISH_CONTACT.unpuffed;
  return table[difficulty] ?? table.normal;
}

/** The Poison duration that accompanies the contact damage. */
export function pufferfishPoisonFor(stage) {
  if (stage === 'puffed') return PUFFERFISH_POISON.puffed;
  if (stage === 'semi') return PUFFERFISH_POISON.semi;
  return 0;
}

/**
 * Whether the pufferfish reacts to this entity.
 *
 * Wiki: it inflates when approached by "players, axolotls, or non-aquatic mobs". So an aquatic mob nearby is
 * ignored, which is what stops a shoal of pufferfish inflating at each other.
 */
export function pufferfishReactsTo(entity) {
  if (!entity) return false;
  if (entity.type === 'player') return true;
  // The wiki singles the axolotl out as a trigger even though it is ITSELF aquatic, and the list below
  // contains it. So this check must come FIRST: putting it after the list would silently swallow it, which is
  // exactly what happened on the first attempt.
  if (entity.type === 'axolotl') return true;
  return !AQUATIC_TYPES.includes(entity.type);
}

/**
 * Find the nearest thing worth reacting to.
 *
 * Returns the entity, or null.
 */
export function findPufferfishThreat(manager, mob, player = null) {
  if (!isPufferfish(mob) || !mob.mesh) return null;
  const candidates = [];
  if (player?.position) candidates.push(player);
  for (const other of manager?.mobs ?? []) {
    if (other === mob || other.health <= 0) continue;
    candidates.push(other);
  }
  let best = null;
  let bestDistance = PUFFERFISH_TRIGGER.semiRange;
  for (const candidate of candidates) {
    if (!pufferfishReactsTo(candidate)) continue;
    const position = candidate.position ?? candidate.mesh?.position;
    if (!position) continue;
    const distance = mob.mesh.position.distanceTo(position);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}

/**
 * Advance the puff state.
 *
 * Wiki: it inflates as something approaches, so this returns the new stage and reports whether the hitbox
 * changed. The stage is driven by distance, which is why `mob.width`/`mob.height` are updated here -- the
 * shared collision code reads them.
 *
 * Returns 'puffed', 'semi', 'deflating' or null.
 */
export function updatePufferfishPuff(manager, mob, player = null) {
  if (!isPufferfish(mob)) return null;
  const before = pufferfishStage(mob);
  const threat = findPufferfishThreat(manager, mob, player);

  let target = 'unpuffed';
  if (threat) {
    const position = threat.position ?? threat.mesh?.position;
    const distance = mob.mesh.position.distanceTo(position);
    if (distance <= PUFFERFISH_TRIGGER.puffedRange) target = 'puffed';
    else if (distance <= PUFFERFISH_TRIGGER.semiRange) target = 'semi';
  }

  mob.puffProgress = target === 'puffed' ? 1 : target === 'semi' ? 0.5 : 0;
  mob.puffStage = target;
  mob.threat = threat;

  const dims = pufferfishDimensions(target);
  mob.width = dims.width;
  mob.height = dims.height;
  mob.puffed = target !== 'unpuffed';

  if (target === before) return null;
  if (target === 'unpuffed') return 'deflating';
  return target;
}

/**
 * The contact attack.
 *
 * Wiki: contact deals damage AND inflicts Poison, and only when puffed. An unpuffed pufferfish is harmless.
 * Returns the hit, or null.
 */
export function pufferfishContact(mob, entity, difficulty = 'normal') {
  if (!isPufferfish(mob) || !entity) return null;
  const stage = pufferfishStage(mob);
  const damage = pufferfishDamageFor(stage, difficulty);
  const poison = pufferfishPoisonFor(stage);
  if (damage <= 0 && poison <= 0) return null;
  // Wiki: contact, so the entity must be within reach -- which is the CURRENT hitbox.
  const position = entity.position ?? entity.mesh?.position;
  if (!position) return null;
  const reach = (mob.width ?? 0.35) * 0.5 + 0.6;
  if (mob.mesh.position.distanceTo(position) > reach) return null;
  return { damage, poison, stage, target: entity };
}

/**
 * Roll a tropical fish variant.
 *
 * Wiki: 3,072 variants in Java, from a body shape, a pattern, and three colours (base, pattern, fin) drawn
 * from 16. `random` is injectable so a test can pin one.
 */
export function rollTropicalFishVariant(random = Math.random) {
  const shape = TROPICAL_FISH_SHAPES[Math.floor(random() * TROPICAL_FISH_SHAPES.length)];
  const patterns = TROPICAL_FISH_PATTERNS[shape];
  const pattern = patterns[Math.floor(random() * patterns.length)];
  const pick = () => TROPICAL_FISH_COLORS[Math.floor(random() * TROPICAL_FISH_COLORS.length)];
  return { shape, pattern, baseColor: pick(), patternColor: pick(), finColor: pick() };
}

/** A stable name for a variant, so the Inspector can show it. */
export function tropicalFishVariantName(variant) {
  if (!variant) return 'Tropical Fish';
  return `${variant.shape} ${variant.pattern} (${variant.baseColor}/${variant.patternColor}/${variant.finColor})`;
}

/** Wiki: neither fish drops anything on death; they are the source of their own ITEM, which is a separate drop. */
export function fishDrops(mob, random = Math.random) {
  if (isPufferfish(mob)) {
    // Wiki: a pufferfish drops its item, and nothing else.
    return [['pufferfish', false, 1, 1]];
  }
  if (isTropicalFish(mob)) {
    // Wiki: a tropical fish drops its item, and nothing else.
    return [['tropical_fish', false, 1, 1]];
  }
  return [];
}

/** Wiki: fish give 1-3 XP with player credit. */
export function fishXp(mob, random = Math.random) {
  if (!isSmallFish(mob)) return 0;
  return 1 + Math.floor(random() * 3);
}

/**
 * Build a pufferfish model: a round body with a tail, and spines that extend with the puff.
 */
export function createPufferfishModel(bodyMat, bellyMat, spineMat, eyeMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), bellyMat);
  belly.position.set(0, -0.06, 0.05);
  group.add(belly);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), eyeMat);
    eye.position.set(side * 0.16, 0.06, 0.16);
    group.add(eye);
    eyes.push(eye);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.14), bellyMat);
  tail.position.set(0, 0, -0.24);
  group.add(tail);

  // The spines, which is what the puff is FOR. They scale out with the stage.
  const spines = [];
  for (const [sx, sy, sz] of [[0.2, 0.1, 0], [-0.2, 0.1, 0], [0, 0.22, 0], [0, -0.1, 0.1], [0, 0.05, -0.18]]) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5), spineMat);
    spine.position.set(sx, sy, sz);
    spine.rotation.z = sx !== 0 ? (sx > 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
    spine.rotation.x = sz !== 0 ? (sz > 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
    group.add(spine);
    spines.push(spine);
  }

  return { group, body, belly, eyes, tail, spines };
}

/**
 * Pose the pufferfish: inflate the body and extend the spines by stage.
 *
 * Wiki: three sizes, 0.35 to 0.7, so the visual scale and the hitbox move together.
 */
export function posePufferfish(mob, phase = 0) {
  if (!isPufferfish(mob) || !mob.mesh) return;
  const stage = pufferfishStage(mob);
  const scale = stage === 'puffed' ? 1.55 : stage === 'semi' ? 1.28 : 1;
  if (mob.body) mob.body.scale.setScalar(scale);
  if (mob.belly) mob.belly.scale.setScalar(scale);
  // The spines sit flat when unpuffed and stand out as it inflates.
  const spineScale = stage === 'puffed' ? 1.6 : stage === 'semi' ? 1.2 : 0.35;
  for (const spine of mob.spines ?? []) {
    if (spine?.scale) spine.scale.setScalar(spineScale);
  }
  if (mob.tail) mob.tail.rotation.y = Math.sin(phase * 8) * 0.5;
}

/**
 * Build a tropical fish model: a flattened disc with a tail and fins, in the variant's colours.
 */
export function createTropicalFishModel(bodyMat, finMat, eyeMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.4), bodyMat);
  group.add(body);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.16), finMat);
  tail.position.set(0, 0, -0.26);
  group.add(tail);

  const fins = [];
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.16), finMat);
    fin.position.set(side * 0.12, 0, 0.06);
    group.add(fin);
    fins.push(fin);
  }
  // The dorsal fin, which is what the "large" shapes exaggerate.
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.24), finMat);
  dorsal.position.set(0, 0.2, 0);
  group.add(dorsal);
  fins.push(dorsal);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.04), eyeMat);
    eye.position.set(side * 0.08, 0.06, 0.16);
    group.add(eye);
    eyes.push(eye);
  }

  return { group, body, tail, fins, dorsal, eyes };
}

/** Pose a tropical fish: a tail swish, which is all the animation it has. */
export function poseTropicalFish(mob, phase = 0) {
  if (!isTropicalFish(mob) || !mob.mesh) return;
  if (mob.tail) mob.tail.rotation.y = Math.sin(phase * 9) * 0.5;
  (mob.fins ?? []).forEach((fin, index) => {
    if (fin?.rotation) fin.rotation.z = Math.sin(phase * 6 + index) * 0.15;
  });
}
