import * as THREE from 'three';
import { applyVanillaBoxUVs } from './mobVisuals/modelBuilder.js';

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

/**
 * The real sheet for a tropical fish variant.
 *
 * Vanilla names the sheets by SHAPE LETTER and PATTERN NUMBER: `tropical_a.png` is shape A with no pattern, and
 * `tropical_a_pattern_3.png` is shape A with pattern 3. This project carries `shape` as `small` / `large` and `pattern` as
 * a NAME from TROPICAL_FISH_PATTERNS, so the number is that name's ONE-BASED INDEX in the list.
 *
 * A variant whose pattern is not in its shape's list falls back to the base sheet, rather than to a path that does not
 * exist -- which would load nothing and fail silently.
 */
const TROPICAL_FISH_SHAPE_LETTER = { small: 'a', large: 'b' };

/** The sheet path for a variant. Vanilla's pattern 0 means the plain body sheet. */
export function TROPICAL_FISH_SHEET_FOR(variant) {
  const shape = variant?.shape === 'large' ? 'large' : 'small';
  const letter = TROPICAL_FISH_SHAPE_LETTER[shape];
  const names = TROPICAL_FISH_PATTERNS[shape] || [];
  const index = names.indexOf(variant?.pattern);
  const suffix = index >= 0 ? `_pattern_${index + 1}` : '';
  return `/assets/entity/fish/tropical_${letter}${suffix}.png`;
}

/**
 * The BASE body sheet for a variant -- vanilla's `MODEL_A_TEXTURE` / `MODEL_B_TEXTURE`, selected by SHAPE only.
 *
 * Distinct from `TROPICAL_FISH_SHEET_FOR`, which returns the PATTERN sheet. Vanilla draws the fish in two passes and they
 * read from different files: the body from `tropical_a.png` / `tropical_b.png` tinted by `baseColor`, and the pattern from
 * one of the twelve `tropical_<letter>_pattern_<n>.png` stencils tinted by `patternColor`.
 */
export function TROPICAL_FISH_BASE_SHEET_FOR(variant) {
  const letter = variant?.shape === 'large' ? 'b' : 'a';
  return `/assets/entity/fish/tropical_${letter}.png`;
}

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
/** The real 32x32 pufferfish sheet. */
const PUFFERFISH_SKIN_PATH = '/assets/entity/fish/pufferfish.png';

/**
 * Apply vanilla's box UV layout to a BoxGeometry's six faces, in ATLAS PIXELS from the top-left.
 */
function applyBoxUVs(geo, u, v, texW, texH, tw, th, td) {
  const faces = [
    { x: u + td + tw, y: v + td, w: td, h: th },
    { x: u, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw + td, y: v + td, w: tw, h: th }
  ];
  const uvs = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = faces[f];
    const u0 = r.x / texW, u1 = (r.x + r.w) / texW;
    const v1 = 1 - r.y / texH, v0 = 1 - (r.y + r.h) / texH;
    const b = f * 4;
    uvs.setXY(b + 0, u0, v1); uvs.setXY(b + 1, u1, v1);
    uvs.setXY(b + 2, u0, v0); uvs.setXY(b + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}

/** A flat plane sampling one atlas rectangle, for a part vanilla gives a zero dimension. */
function applyPlaneUVs(geo, u, v, texW, texH, tw, th) {
  const uvs = geo.attributes.uv;
  const u0 = u / texW, u1 = (u + tw) / texW;
  const v1 = 1 - v / texH, v0 = 1 - (v + th) / texH;
  uvs.setXY(0, u0, v1); uvs.setXY(1, u1, v1);
  uvs.setXY(2, u0, v0); uvs.setXY(3, u1, v0);
  uvs.needsUpdate = true;
  return geo;
}

export function createPufferfishModel(bodyMat, bellyMat, spineMat, eyeMat, options = {}) {
  // The REAL sheet on the body. The drawn materials remain the stand-in, so a build with no assets still renders a
  // pufferfish. // PUFFERFISH_REBUILT
  const sheet = options.loadTexture ? options.loadTexture(PUFFERFISH_SKIN_PATH) : null;
  if (sheet) { sheet.magFilter = THREE.NearestFilter; sheet.minFilter = THREE.NearestFilter; sheet.needsUpdate = true; }

  const group = new THREE.Group();
  const u = 1 / 16;
  const skinMat = sheet ? new THREE.MeshLambertMaterial({ map: sheet, transparent: true, alphaTest: 0.5 }) : bodyMat;
  const finMat = sheet ? skinMat : spineMat;

  // The body: 5x5x5 units, carrying the sheet rectangle at (12, 22).
  const bodyGeo = new THREE.BoxGeometry(5 * u, 5 * u, 5 * u);
  if (sheet) applyBoxUVs(bodyGeo, 12, 22, 32, 32, 5, 5, 5);
  const body = new THREE.Mesh(bodyGeo, skinMat);
  body.name = 'body';
  group.add(body);

  // The bladder overlay. Vanilla has no separate belly on the medium model, so this stays the project's own, scaled
  // with the puff -- which is what makes a pufferfish inflate rather than just grow fins.
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), bellyMat);
  body.add(belly);

  // Eyes are painted on the sheet, so without one they stay modelled marks.
  const eyes = [];
  if (!sheet) {
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), eyeMat);
      eye.position.set(side * 0.11, 0.03, 0.12);
      body.add(eye);
      eyes.push(eye);
    }
  }

  // The ten fins, each carrying its own rectangle. Two of them have ZERO height, so they are planes.
  const spines = [];
  const finBox = (name, size, uu, vv, tw, th, td, pos) => {
    const geo = new THREE.BoxGeometry(size[0] * u, size[1] * u, size[2] * u);
    if (sheet) applyBoxUVs(geo, uu, vv, 32, 32, tw, th, td);
    const fin = new THREE.Mesh(geo, finMat);
    fin.name = name;
    fin.position.set(pos[0] * u, pos[1] * u, pos[2] * u);
    body.add(fin);
    spines.push(fin);
    return fin;
  };
  const finPlane = (name, w, h, uu, vv, tw, th, pos) => {
    const geo = new THREE.PlaneGeometry(w * u, h * u);
    if (sheet) applyPlaneUVs(geo, uu, vv, 32, 32, tw, th);
    const fin = new THREE.Mesh(geo, finMat);
    fin.name = name;
    fin.position.set(pos[0] * u, pos[1] * u, pos[2] * u);
    body.add(fin);
    spines.push(fin);
    return fin;
  };

  // Vanilla offsets these from a frame at y = 22; the body already sits at the group origin here, so the offsets are
  // relative to the body and the frame shift is dropped.
  finPlane('right_blue_fin', 2, 2, 24, 0, 2, 2, [-2.5, -5, -1.5]);
  finPlane('left_blue_fin', 2, 2, 24, 3, 2, 2, [2.5, -5, -1.5]);
  finBox('top_front_fin', [5, 1, 1], 15, 16, 5, 1, 1, [0, 2.5, -2.5]);
  finBox('top_back_fin', [5, 1, 1], 10, 16, 5, 1, 1, [0, 2.5, 0]);
  finBox('right_front_fin', [1, 5, 1], 8, 16, 1, 5, 1, [-2.5, 0, 1]);
  finBox('right_back_fin', [1, 5, 1], 8, 16, 1, 5, 1, [-2.5, 0, -1]);
  finBox('left_front_fin', [1, 5, 1], 0, 16, 1, 5, 1, [2.5, 0, 1]);
  finBox('left_back_fin', [1, 5, 1], 4, 16, 1, 5, 1, [2.5, 0, -1]);
  finBox('bottom_front_fin', [5, 1, 1], 17, 21, 5, 1, 1, [0, -2.5, 1]);
  finBox('bottom_back_fin', [1, 1, 1], 8, 22, 1, 1, 1, [0, -2.5, -1]);

  const tail = finBox('tail', [1, 1, 1], 8, 22, 1, 1, 1, [0, 0, -3]);

  group.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return { group, body, belly, eyes, tail, spines };
}
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

  // Vanilla's body rectangle: 2x3x6 at (0, 0) on the 32x32 sheet. The box KEEPS its own 0.16 x 0.3 x 0.4 -- the helper
  // maps the layout onto whatever size it is given. // TROPICAL_FISH_BOUND
  const bodyGeo = new THREE.BoxGeometry(0.16, 0.3, 0.4);
  applyVanillaBoxUVs(bodyGeo, 0, 0, 32, 32, 2, 3, 6);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Vanilla's tail plane: 0x3x6 at (22, -6) -- a PLANE with no width, placed at a NEGATIVE v, which
  // applyVanillaBoxUVs supports.
  const tailGeo = new THREE.BoxGeometry(0.04, 0.22, 0.16);
  applyVanillaBoxUVs(tailGeo, 22, -6, 32, 32, 0, 3, 6);
  const tail = new THREE.Mesh(tailGeo, finMat);
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
  // Vanilla's dorsal plane: 0x3x6 at (10, -5), also at a negative v.
  const dorsalGeo = new THREE.BoxGeometry(0.04, 0.14, 0.24);
  applyVanillaBoxUVs(dorsalGeo, 10, -5, 32, 32, 0, 3, 6);
  const dorsal = new THREE.Mesh(dorsalGeo, finMat);
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
