import * as THREE from 'three';

/**
 * Copper golem rules: the item-hauling job, the oxidation ladder, and the wax/scrape/statue interactions.
 *
 * Reference: https://minecraft.wiki/w/Copper_Golem
 *
 * A buildable passive mob whose whole purpose is a small job: it "takes items out of copper chests, and
 * attempts to store them in nearby wooden chests and trapped chests". It is also the only mob that AGES into a
 * block -- un-waxed, it oxidizes through four stages and eventually becomes a statue, dropping whatever it held.
 */

/** Wiki: 12 HP. */
export const COPPER_GOLEM_HEALTH = 12;

/** Wiki: 0.49 wide x 0.98 tall in Java. */
export const COPPER_GOLEM_DIMENSIONS = { width: 0.49, height: 0.98 };

/** Wiki: speed 0.2. */
export const COPPER_GOLEM_SPEED = 0.2;

/**
 * Wiki: "If not waxed, a copper golem oxidizes over time and eventually turns into a copper golem statue,
 * dropping its currently held items."
 *
 * The four stages are the same ladder copper blocks use, so the names are shared with the block system rather
 * than invented here.
 */
export const COPPER_OXIDATION_STAGES = ['unoxidized', 'exposed', 'weathered', 'oxidized'];

/**
 * How long each stage lasts.
 *
 * The wiki states that it oxidizes over time and that it eventually becomes a statue, but gives no interval on
 * the page this was written from. A named constant with a documented value is used rather than a magic number,
 * so the guess is visible and adjustable -- the same treatment as the allay's duplication chance.
 */
export const COPPER_OXIDATION_SECONDS = 600;

/**
 * Wiki: a golem "must either be empty, or contain the item type it is holding, for the golem to place anything
 * inside of it". So the placement rule is a check on the destination, not a free-for-all.
 */
export function copperGolemCanPlaceIn(chestContents, itemType) {
  if (!Array.isArray(chestContents)) return false;
  const slots = chestContents.filter(Boolean);
  // An empty chest always accepts.
  if (slots.length === 0) return true;
  // Otherwise every occupied slot must already hold the same item type.
  return slots.every(slot => slot?.id === itemType || slot?.itemType === itemType);
}

/** Wiki: it takes items out of COPPER chests. */
export function copperGolemCanTakeFrom(chest) {
  if (!chest) return false;
  return chest.type === 'copper_chest' || chest.isCopperChest === true;
}

/** Wiki: and stores them in nearby WOODEN chests and trapped chests. */
export function copperGolemCanStoreIn(chest) {
  if (!chest) return false;
  return chest.type === 'chest' || chest.type === 'trapped_chest'
    || chest.isWoodenChest === true || chest.isTrappedChest === true;
}

/**
 * Find the nearest chest it can take from.
 *
 * `range` is not given by the wiki, so it is a named parameter with a documented default rather than a hidden
 * literal inside a loop.
 */
export function findCopperGolemSource(manager, mob, { range = 8 } = {}) {
  if (!isCopperGolem(mob)) return null;
  const chests = manager?.chests ?? manager?.blockEntities?.chests ?? [];
  let best = null;
  let bestDistance = range;
  for (const chest of chests) {
    if (!copperGolemCanTakeFrom(chest)) continue;
    const pos = chest.position ?? chest.mesh?.position;
    if (!pos) continue;
    const distance = mob.mesh.position.distanceTo(pos);
    if (distance >= bestDistance) continue;
    // Only a chest with something in it is worth walking to.
    const contents = chest.inventory ?? chest.contents ?? [];
    if (!contents.some(Boolean)) continue;
    bestDistance = distance;
    best = chest;
  }
  return best;
}

/** Find the nearest wooden chest that will accept what it is holding. */
export function findCopperGolemDestination(manager, mob, itemType, { range = 8 } = {}) {
  if (!isCopperGolem(mob) || !itemType) return null;
  const chests = manager?.chests ?? manager?.blockEntities?.chests ?? [];
  let best = null;
  let bestDistance = range;
  for (const chest of chests) {
    if (!copperGolemCanStoreIn(chest)) continue;
    const contents = chest.inventory ?? chest.contents ?? [];
    if (!copperGolemCanPlaceIn(contents, itemType)) continue;
    const pos = chest.position ?? chest.mesh?.position;
    if (!pos) continue;
    const distance = mob.mesh.position.distanceTo(pos);
    if (distance < bestDistance) { bestDistance = distance; best = chest; }
  }
  return best;
}

/**
 * Take one item out of a copper chest.
 *
 * Returns the item, or null. Only one type is carried at a time, which is what makes the destination rule
 * meaningful.
 */
export function copperGolemTake(mob, chest) {
  if (!isCopperGolem(mob) || !copperGolemCanTakeFrom(chest)) return null;
  // It carries one item type, so it will not take a second kind.
  if (mob.heldItem) return null;
  const contents = chest.inventory ?? chest.contents ?? [];
  const index = contents.findIndex(Boolean);
  if (index < 0) return null;
  const item = contents[index];
  contents[index] = null;
  mob.heldItem = item.id ?? item.itemType ?? null;
  mob.heldCount = item.count ?? 1;
  return item;
}

/**
 * Place the held item into a chest.
 *
 * Returns true when it was placed. The destination must be empty or already hold the same type, so this is
 * where the wiki's rule is enforced rather than at the search step alone.
 */
export function copperGolemPlace(mob, chest) {
  if (!isCopperGolem(mob) || !mob.heldItem) return false;
  if (!copperGolemCanStoreIn(chest)) return false;
  const contents = chest.inventory ?? chest.contents ?? [];
  if (!copperGolemCanPlaceIn(contents, mob.heldItem)) return false;
  // Merge into an existing stack of the same type, or fill the first empty slot.
  const same = contents.findIndex(slot => slot && (slot.id === mob.heldItem || slot.itemType === mob.heldItem));
  if (same >= 0) {
    contents[same].count = (contents[same].count ?? 1) + (mob.heldCount ?? 1);
  } else {
    const empty = contents.findIndex(slot => !slot);
    if (empty >= 0) contents[empty] = { id: mob.heldItem, count: mob.heldCount ?? 1 };
    else contents.push({ id: mob.heldItem, count: mob.heldCount ?? 1 });
  }
  mob.heldItem = null;
  mob.heldCount = 0;
  return true;
}

/**
 * Advance the oxidation.
 *
 * Wiki: a golem that is not waxed oxidizes through the stages and eventually becomes a statue, dropping what it
 * held. Returns 'exposed', 'weathered', 'oxidized', 'statue' or null.
 */
export function updateCopperGolemOxidation(mob, dt) {
  if (!isCopperGolem(mob)) return null;
  // Wiki: waxing stops it, and an oxidized golem is past saving.
  if (mob.waxed) return null;
  if (mob.isStatue) return null;
  const before = mob.oxidationStage ?? 'unoxidized';
  mob.oxidationTimer = (mob.oxidationTimer ?? COPPER_OXIDATION_SECONDS) + dt;
  if (mob.oxidationTimer < COPPER_OXIDATION_SECONDS) return null;
  mob.oxidationTimer = 0;

  const index = COPPER_OXIDATION_STAGES.indexOf(before);
  const next = COPPER_OXIDATION_STAGES[index + 1];
  if (next) {
    mob.oxidationStage = next;
    return next;
  }
  // Past the last stage: it becomes a statue and drops what it held.
  mob.isStatue = true;
  mob.droppedOnOxidizing = mob.heldItem ? { id: mob.heldItem, count: mob.heldCount ?? 1 } : null;
  mob.heldItem = null;
  mob.heldCount = 0;
  return 'statue';
}

/**
 * Wax it.
 *
 * Wiki: honeycomb waxes it, and "if not waxed" it oxidizes -- so waxing is what stops the process permanently.
 */
export function waxCopperGolem(mob, itemId) {
  if (!isCopperGolem(mob)) return false;
  if (String(itemId ?? '') !== 'honeycomb') return false;
  if (mob.waxed) return false;
  // An oxidized golem is already a statue; the wiki gives no route back from there.
  if (mob.isStatue) return false;
  mob.waxed = true;
  return true;
}

/**
 * Scrape a stage off with an axe.
 *
 * The axe is listed as a usable item, and scraping one stage at a time is how copper works everywhere else in
 * the game, so it is modelled the same way. Returns the new stage, or null.
 */
export function scrapeCopperGolem(mob, itemId) {
  if (!isCopperGolem(mob)) return null;
  if (!String(itemId ?? '').endsWith('_axe') && String(itemId ?? '') !== 'axe') return null;
  if (mob.waxed) return null;
  const index = COPPER_OXIDATION_STAGES.indexOf(mob.oxidationStage ?? 'unoxidized');
  if (index <= 0) return null;
  mob.oxidationStage = COPPER_OXIDATION_STAGES[index - 1];
  mob.oxidationTimer = 0;
  return mob.oxidationStage;
}

/**
 * Reanimate a statue.
 *
 * Wiki: "Using an axe on an unwaxed and unoxidized copper golem statue causes it to reanimate into a copper
 * golem."
 */
export function reanimateCopperGolemStatue(statue, itemId) {
  if (!statue || statue.type !== 'copper_golem_statue') return false;
  if (!String(itemId ?? '').endsWith('_axe')) return false;
  // Wiki: it must be UNWAXED and UNOXIDIZED, so both conditions are required.
  if (statue.waxed) return false;
  if ((statue.oxidationStage ?? 'unoxidized') !== 'unoxidized') return false;
  return true;
}

/**
 * Shear the poppy off.
 *
 * Wiki: "When a copper golem has been given a poppy by an iron golem, it can be sheared to drop 1 poppy."
 */
export function shearCopperGolem(mob, itemId) {
  if (!isCopperGolem(mob)) return null;
  if (String(itemId ?? '') !== 'shears') return null;
  if (!mob.hasPoppy) return null;
  mob.hasPoppy = false;
  return 'poppy';
}

/** Wiki: an iron golem can give it a poppy, which is the only way it gets one. */
export function giveCopperGolemPoppy(mob, fromType) {
  if (!isCopperGolem(mob)) return false;
  if (fromType !== 'iron_golem') return false;
  if (mob.hasPoppy) return false;
  mob.hasPoppy = true;
  return true;
}

/** Wiki: 1-3 copper ingots on death. */
export function copperGolemDrops(mob, random = Math.random) {
  if (!isCopperGolem(mob)) return [];
  // The base table carries the row; this MIRRORS it so a test can cross-check the two.
  return [['copper_ingot', false, 1, 3]];
}

/** Wiki: no experience value is given, so it is zero rather than a guess. */
export function copperGolemXp() {
  return 0;
}

/** True when the mob is a copper golem. */
export function isCopperGolem(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'copper_golem';
}

/** Wiki: 0.49 x 0.98. */
export function copperGolemDimensions() {
  return { ...COPPER_GOLEM_DIMENSIONS };
}

/** Body colours by oxidation stage, matching copper's own ladder. */
export const COPPER_GOLEM_COLORS = {
  unoxidized: 0xe0724f,
  exposed: 0xc47b5c,
  weathered: 0x8fa583,
  oxidized: 0x6ea88a
};

/** The colour for a stage. */
export function copperGolemColor(stage = 'unoxidized') {
  return COPPER_GOLEM_COLORS[stage] ?? COPPER_GOLEM_COLORS.unoxidized;
}

/**
 * Build a copper golem model: a small blocky body with a copper head, stubby arms and a lightning-rod antenna.
 *
 * The antenna is the detail that reads as a copper golem rather than a small iron golem.
 */
export function createCopperGolemModel(bodyMat, trimMat, eyeMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.22), bodyMat);
  body.position.y = 0.36;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), bodyMat);
  head.position.y = 0.68;
  group.add(head);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), eyeMat);
    eye.position.set(side * 0.08, 0.03, 0.16);
    head.add(eye);
    eyes.push(eye);
  }

  // The antenna, which is what makes the silhouette a copper golem.
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), trimMat);
  antenna.position.set(0, 0.23, 0);
  head.add(antenna);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), trimMat);
  bulb.position.set(0, 0.12, 0);
  antenna.add(bulb);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), trimMat);
    arm.position.set(side * 0.24, 0.4, 0);
    group.add(arm);
    arms.push(arm);
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), trimMat);
    leg.position.set(side * 0.09, 0.1, 0);
    group.add(leg);
    legs.push(leg);
  }

  // The carried item, hidden until it picks something up.
  const held = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), trimMat);
  held.position.set(0, 0.52, 0.18);
  held.visible = false;
  group.add(held);

  return { group, body, head, eyes, antenna, bulb, arms, legs, held };
}

/** Pose the golem: a walking arm swing, and the held item shown only while carrying. */
export function poseCopperGolem(mob, phase = 0) {
  if (!isCopperGolem(mob) || !mob.mesh) return;
  // A statue is frozen, which is the whole point of the oxidised end state.
  if (mob.isStatue) {
    for (const leg of mob.legs ?? []) if (leg?.rotation) leg.rotation.x = 0;
    for (const arm of mob.arms ?? []) if (arm?.rotation) arm.rotation.x = 0;
    return;
  }
  (mob.legs ?? []).forEach((leg, index) => {
    if (leg?.rotation) leg.rotation.x = Math.sin(phase * 6 + index * Math.PI) * 0.35;
  });
  (mob.arms ?? []).forEach((arm, index) => {
    if (arm?.rotation) arm.rotation.x = Math.sin(phase * 6 + index * Math.PI) * 0.4;
  });
  if (mob.held) mob.held.visible = !!mob.heldItem;
  // The antenna sways, which is its only animation.
  if (mob.antenna) mob.antenna.rotation.z = Math.sin(phase * 3) * 0.12;
}
