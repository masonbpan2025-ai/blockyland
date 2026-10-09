import * as THREE from 'three';

/**
 * Happy ghast rules: a flying MOUNT, its ghastling young, the home-bound roaming, and the carry-leashed-entities
 * job (the "sky crane").
 *
 * Reference: https://minecraft.wiki/w/Happy_Ghast
 *
 * The happy ghast is the passive counterpart of the ghast, and its differences from its hostile relative are
 * almost all social: it is passive, it is tame by construction, four players can ride it at once, and it can
 * carry leashed entities through the air.
 */

/** Wiki: 20 HP. */
export const HAPPY_GHAST_HEALTH = 20;

/** Wiki: height and width both 4.0 blocks. */
export const HAPPY_GHAST_DIMENSIONS = { width: 4.0, height: 4.0 };

/** Wiki: a ghastling is 0.95 blocks. */
export const GHASTLING_DIMENSIONS = { width: 0.95, height: 0.95 };

/** Wiki: speed 0.05. */
export const HAPPY_GHAST_SPEED = 0.05;

/** Wiki: "A ridden happy ghast moves at about 3.6 m/s". */
export const HAPPY_GHAST_RIDDEN_SPEED = 3.6;

/**
 * Wiki: "Up to four players can ride a happy ghast. The first player who mounts ... controls it, sitting in the
 * front just above its face. Players who mount after the piloting player sit in a spot on the remaining sides,
 * starting clockwise from the first player."
 */
export const HAPPY_GHAST_SEATS = 4;

/**
 * Wiki: "When one of the players dismounts, the next players are rotated counter-clockwise, filling in the empty
 * seat." So the seats are a ring, and dismounting compacts it.
 */
export const HAPPY_GHAST_SEAT_ORDER = ['front', 'left', 'back', 'right'];

/** Wiki: un-harnessed adults roam 64 blocks from home; harnessed ones and ghastlings roam 32. */
export const HAPPY_GHAST_ROAM = { unharnessed: 64, harnessed: 32, ghastling: 32 };

/** Wiki: a ghastling takes 20 minutes to grow up. */
export const GHASTLING_GROWTH_SECONDS = 1200;

/**
 * Wiki: "each snowball fed to a ghastling reduces its remaining growth time by 10%" in Java. Bedrock instead
 * needs a flat 10 snowballs, and Java is what this codebase follows.
 */
export const GHASTLING_SNOWBALL_SPEEDUP = 0.1;
/** Wiki: the Bedrock figure, recorded for contrast. */
export const GHASTLING_BEDROCK_SNOWBALLS = 10;

/** Wiki: ghastlings "occasionally follow nearby players or specific mobs within a range of 16 blocks". */
export const GHASTLING_FOLLOW_RANGE = 16;
/** Wiki: "They move toward their target with a slight speed boost (x 1.1) and stop once they are within 5
 * blocks of it." */
export const GHASTLING_FOLLOW_SPEED_BOOST = 1.1;
export const GHASTLING_STOP_DISTANCE = 5;

/**
 * The mobs a ghastling will follow, from the wiki's list.
 *
 * Wiki: "They prioritize players but can also follow the mobs listed below, provided they are not babies." So
 * `isBaby` excludes a candidate, and the list is explicit because this codebase has no shared "followable" tag.
 */
export const GHASTLING_FOLLOWABLE = [
  'armadillo', 'bee', 'camel', 'cat', 'chicken', 'cow', 'donkey', 'fox', 'goat', 'happy_ghast', 'horse',
  'llama', 'mule', 'ocelot', 'panda', 'parrot', 'pig', 'polar_bear', 'rabbit', 'sheep', 'skeleton_horse',
  'sniffer', 'strider', 'villager', 'wolf'
];

/**
 * Wiki: ghastlings "do not follow ambient mobs such as bats, aquatic-based mobs, monsters other than skeleton
 * horses, golems, allays, mooshrooms, and wandering traders and their llamas."
 *
 * These are excluded even when they would otherwise look followable, so the exclusion is checked as well as the
 * list -- a name in both is a bug.
 */
export const GHASTLING_NEVER_FOLLOWS = [
  'bat', 'allay', 'mooshroom', 'wandering_trader', 'trader_llama', 'iron_golem', 'snow_golem', 'copper_golem',
  'ghast', 'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'pillager', 'vindicator', 'evoker',
  'ravager', 'piglin', 'piglin_brute', 'hoglin', 'zoglin', 'blaze', 'guardian', 'elder_guardian', 'shulker',
  'silverfish', 'endermite', 'phantom', 'drowned', 'husk', 'stray', 'bogged', 'wither_skeleton', 'magma_cube',
  'slime', 'cave_spider', 'vex', 'creaking', 'breeze', 'warden', 'wither', 'ender_dragon', 'zombified_piglin',
  'camel_husk', 'zombie_horse', 'zombie_villager', 'illusioner', 'parched'
];

/**
 * The entities that get the four-lead "sky crane" treatment.
 *
 * Wiki: "The player can attach a leashed boat, boat with chest, or specific leash-able mobs too large to fit in
 * boats (horses, donkeys, mules, skeleton horses, zombie horses, camels, camel husks, and sniffers)".
 * Anything else leashable can still be attached, but with a single lead.
 */
export const HAPPY_GHAST_BULKY_CARGO = [
  'boat', 'chest_boat', 'horse', 'donkey', 'mule', 'skeleton_horse', 'zombie_horse', 'camel', 'camel_husk',
  'sniffer'
];

/** Wiki: standing on one makes it stationary and cardinal-aligned; south after a chunk reload. */
export const HAPPY_GHAST_STANDING_FACING = 0;

/** Wiki: the dried ghast must be rehydrated in water, and the spawn is a GHASTLING. */
export const DRIED_GHAST_REHYDRATION = { requiresWater: true, producesGhastling: true };

/** The pale, cheerful palette, against the ghast's grey. */
export const HAPPY_GHAST_COLORS = {
  skin: 0xf2ece1,
  tentacle: 0xdcd3c4,
  eye: 0x2c2c2c,
  mouth: 0xbfa9a0,
  harness: 0x8a5a3c
};

/** True when the mob is a happy ghast, adult or ghastling. */
export function isHappyGhast(mob) {
  const type = typeof mob === 'string' ? mob : mob?.type;
  return type === 'happy_ghast';
}

/** True when it is a ghastling (a baby happy ghast). */
export function isGhastling(mob) {
  return isHappyGhast(mob) && mob.isBaby === true;
}

/** The hitbox for its age. */
export function happyGhastDimensions(mob) {
  if (mob?.isBaby) return { ...GHASTLING_DIMENSIONS };
  return { ...HAPPY_GHAST_DIMENSIONS };
}

/**
 * The roaming radius from home.
 *
 * Wiki: "Unharnessed happy ghasts roam within a 64-block radius of their home, while harnessed happy ghasts and
 * ghastlings roam within a 32-block radius." A ghastling is 32 whether or not it is harnessed, so the age check
 * comes first.
 */
export function happyGhastRoamRadius(mob) {
  if (!isHappyGhast(mob)) return 0;
  if (isGhastling(mob)) return HAPPY_GHAST_ROAM.ghastling;
  return mob.hasHarness ? HAPPY_GHAST_ROAM.harnessed : HAPPY_GHAST_ROAM.unharnessed;
}

/**
 * Set the home location.
 *
 * Wiki: the home "is initially set as the location where it spawns, and is updated to its current location"
 * on five named events. This is the one entry point for all of them, so the list lives in one place.
 */
export function setHappyGhastHome(mob, position = mob?.mesh?.position) {
  if (!isHappyGhast(mob) || !position) return false;
  mob.home = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);
  return true;
}

/**
 * The five events that re-home it.
 *
 * Wiki: equipping or removing a harness, detaching a lead, being dismounted, no longer being tempted by a snowball
 * or harness, and a ghastling stopping following a mob.
 */
export const HAPPY_GHAST_REHOME_EVENTS = [
  'harness_equipped', 'harness_removed', 'lead_detached', 'dismounted', 'temptation_ended',
  'ghastling_follow_ended'
];

/** Re-home it if the event is one of the five. */
export function onHappyGhastEvent(mob, event) {
  if (!isHappyGhast(mob)) return false;
  if (!HAPPY_GHAST_REHOME_EVENTS.includes(event)) return false;
  setHappyGhastHome(mob);
  return true;
}

/**
 * Clamp a wanted position into the roaming radius.
 *
 * The wiki gives the radius; how it is applied is this codebase's business, so it is a pure function a test can
 * drive.
 */
export function clampToHome(mob, wanted) {
  if (!isHappyGhast(mob) || !mob.home || !wanted) return wanted ?? null;
  const radius = happyGhastRoamRadius(mob);
  const offset = wanted.clone().sub(mob.home);
  offset.y = 0;
  if (offset.length() <= radius) return wanted;
  offset.setLength(radius);
  return mob.home.clone().add(offset).setY(wanted.y);
}

/** Wiki: only an ADULT can be harnessed and ridden. */
export function equipHappyGhastHarness(mob, itemId) {
  if (!isHappyGhast(mob)) return false;
  if (String(itemId ?? '') !== 'harness') return false;
  if (mob.isBaby) return false;
  if (mob.hasHarness) return false;
  mob.hasHarness = true;
  onHappyGhastEvent(mob, 'harness_equipped');
  return true;
}

/** Wiki: "The harness can be taken off using shears to retrieve the item." */
export function removeHappyGhastHarness(mob, itemId) {
  if (!isHappyGhast(mob)) return false;
  if (String(itemId ?? '') !== 'shears') return false;
  if (!mob.hasHarness) return false;
  mob.hasHarness = false;
  onHappyGhastEvent(mob, 'harness_removed');
  return true;
}

/**
 * Mount a rider.
 *
 * Wiki: "The first player who mounts a happy ghast controls it, sitting in the front just above its face.
 * Players who mount after the piloting player sit in a spot on the remaining sides, starting clockwise from the
 * first player."
 */
export function mountHappyGhast(mob, rider) {
  if (!isHappyGhast(mob) || !rider) return null;
  if (mob.isBaby) return null;
  // Wiki: only a harnessed happy ghast can be ridden.
  if (!mob.hasHarness) return null;
  mob.riders = mob.riders ?? [];
  if (mob.riders.length >= HAPPY_GHAST_SEATS) return null;
  if (mob.riders.includes(rider)) return null;
  mob.riders.push(rider);
  // The seats are handed out in ring order, so the first rider is the pilot.
  const index = mob.riders.length - 1;
  mob.seats = mob.seats ?? {};
  mob.seats[HAPPY_GHAST_SEAT_ORDER[index]] = rider;
  mob.pilot = mob.riders[0];
  return HAPPY_GHAST_SEAT_ORDER[index];
}

/**
 * Dismount a rider, compacting the seats counter-clockwise as the wiki describes.
 */
export function dismountHappyGhast(mob, rider) {
  if (!isHappyGhast(mob)) return false;
  const index = (mob.riders ?? []).indexOf(rider);
  if (index < 0) return false;
  mob.riders.splice(index, 1);
  // The wiki rotates the remaining players counter-clockwise to fill the gap, which is a re-seat in order.
  mob.seats = {};
  mob.riders.forEach((r, i) => { mob.seats[HAPPY_GHAST_SEAT_ORDER[i]] = r; });
  mob.pilot = mob.riders[0] ?? null;
  onHappyGhastEvent(mob, 'dismounted');
  return true;
}

/** The seat a rider occupies, or null. */
export function happyGhastSeatOf(mob, rider) {
  for (const [seat, occupant] of Object.entries(mob?.seats ?? {})) {
    if (occupant === rider) return seat;
  }
  return null;
}

/**
 * Whether it is stationary because something is standing ON it.
 *
 * Wiki: "Players can stand on top of a happy ghast ... While players are standing on it, the happy ghast becomes
 * stationary and aligns to one of the cardinal directions."
 */
export function happyGhastIsStationary(mob, { standers = 0 } = {}) {
  if (!isHappyGhast(mob)) return false;
  return standers > 0;
}

/**
 * The facing it snaps to while stationary.
 *
 * Wiki: "Reloading the chunks causes the happy ghast to realign and face south."
 */
export function happyGhastStationaryFacing() {
  return HAPPY_GHAST_STANDING_FACING;
}

/**
 * Attach a leashed entity underneath.
 *
 * Wiki: "Multiple entities can be attached this way at once, with there being no limit to how many." A bulky
 * entity gets the four-lead design; anything else a single lead.
 */
export function attachHappyGhastCargo(mob, entity) {
  if (!isHappyGhast(mob) || !entity) return null;
  mob.cargo = mob.cargo ?? [];
  const type = entity.type ?? entity.kind;
  const bulky = HAPPY_GHAST_BULKY_CARGO.includes(type);
  const entry = { entity, type, leads: bulky ? 4 : 1 };
  mob.cargo.push(entry);
  return entry;
}

/** Wiki: shears on the happy ghast "cuts all leads simultaneously". */
export function releaseHappyGhastCargo(mob, itemId, entity = null) {
  if (!isHappyGhast(mob)) return [];
  if (String(itemId ?? '') !== 'shears') return [];
  mob.cargo = mob.cargo ?? [];
  if (entity) {
    const entry = mob.cargo.find(c => c.entity === entity);
    if (!entry) return [];
    mob.cargo.splice(mob.cargo.indexOf(entry), 1);
    return [entry];
  }
  const all = [...mob.cargo];
  mob.cargo = [];
  return all;
}

/**
 * Tempt it with a snowball or a harness.
 *
 * Wiki: "no longer being tempted by a player with a snowball or a harness" is one of the re-homing events, so
 * temptation has a start and an end and the end is what matters.
 */
export function temptHappyGhast(mob, itemId) {
  if (!isHappyGhast(mob)) return false;
  return String(itemId ?? '') === 'snowball' || String(itemId ?? '') === 'harness';
}

/** End the temptation, which re-homes it. */
export function endHappyGhastTemptation(mob) {
  if (!isHappyGhast(mob) || !mob.tempted) return false;
  mob.tempted = false;
  onHappyGhastEvent(mob, 'temptation_ended');
  return true;
}

/**
 * Feed a ghastling a snowball.
 *
 * Wiki: "each snowball fed to a ghastling reduces its remaining growth time by 10%". Returns the new remaining
 * time, or null if the feed did not apply.
 */
export function feedGhastlingSnowball(mob, itemId) {
  if (!isGhastling(mob)) return null;
  if (String(itemId ?? '') !== 'snowball') return null;
  mob.growthRemaining = (mob.growthRemaining ?? GHASTLING_GROWTH_SECONDS) * (1 - GHASTLING_SNOWBALL_SPEEDUP);
  mob.snowballsFed = (mob.snowballsFed ?? 0) + 1;
  return mob.growthRemaining;
}

/**
 * Grow a ghastling up.
 *
 * Wiki: 20 minutes, with snowballs reducing the remainder. Returns 'grown' when it becomes an adult.
 */
export function updateGhastlingGrowth(mob, dt) {
  if (!isGhastling(mob)) return null;
  mob.growthRemaining = (mob.growthRemaining ?? GHASTLING_GROWTH_SECONDS) - dt;
  if (mob.growthRemaining > 0) return null;
  mob.isBaby = false;
  // The name changes with the age, and the dims with both -- done here rather than at the call site so the
  // transition is complete wherever it is triggered from.
  mob.name = 'Happy Ghast';
  const dims = happyGhastDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  // Wiki: an adult is 4.0 and a ghastling 0.95, so growing up is a large change in hitbox.
  return 'grown';
}

/**
 * Find a hover target for an unridden adult: a point inside its home radius at its own altitude.
 *
 * The wiki gives the radius and says unharnessed adults roam; the wander itself is this codebase's business, so
 * it is a pure function returning a point a test can assert is within the radius.
 */
export function happyGhastWanderTarget(mob, random = Math.random) {
  if (!isHappyGhast(mob) || !mob.home) return null;
  const radius = happyGhastRoamRadius(mob) * 0.4;
  const angle = random() * Math.PI * 2;
  const distance = radius * Math.sqrt(random());
  return new THREE.Vector3(
    mob.home.x + Math.cos(angle) * distance,
    // It holds its own altitude rather than the home's, so a ghast that has drifted up stays there.
    mob.homeAltitude ?? mob.home.y,
    mob.home.z + Math.sin(angle) * distance
  );
}

/** Steer toward a hover target at the given speed. Returns the velocity actually set. */
export function steerHappyGhast(mob, target, dt, speed = HAPPY_GHAST_SPEED * 20) {
  if (!isHappyGhast(mob) || !target || !mob.mesh) return null;
  const offset = target.clone().sub(mob.mesh.position);
  // Stop when close, so it does not jitter around the target.
  if (offset.length() < 0.5) { mob.velocity.set(0, 0, 0); return mob.velocity; }
  offset.setLength(Math.min(speed, offset.length() / Math.max(dt, 1e-6)));
  mob.velocity.copy(offset);
  mob.yaw = Math.atan2(offset.x, offset.z);
  return mob.velocity;
}

/**
 * Whether a ghastling will follow a candidate.
 *
 * Wiki: players first, then the listed mobs "provided they are not babies", and never the excluded set. So the
 * baby check and the exclusion both apply to mobs, and a player is always eligible.
 */
export function ghastlingFollows(candidate) {
  if (!candidate) return false;
  if (candidate.type === 'player') return true;
  const type = candidate.type;
  if (!type) return false;
  // Wiki: "provided they are not babies".
  if (candidate.isBaby) return false;
  if (GHASTLING_NEVER_FOLLOWS.includes(type)) return false;
  return GHASTLING_FOLLOWABLE.includes(type);
}

/**
 * Pick what to follow.
 *
 * Wiki: "They prioritize players but can also follow the mobs listed below" within 16 blocks, so a player in
 * range wins over a nearer mob.
 */
export function findGhastlingTarget(mob, candidates = []) {
  if (!isGhastling(mob) || !mob.mesh) return null;
  const inRange = candidates.filter(c => {
    if (!ghastlingFollows(c)) return false;
    const pos = c.position ?? c.mesh?.position;
    return !!pos && mob.mesh.position.distanceTo(pos) <= GHASTLING_FOLLOW_RANGE;
  });
  const players = inRange.filter(c => c.type === 'player');
  if (players.length) {
    return players.sort((a, b) => nearest(mob, a) - nearest(mob, b))[0];
  }
  return inRange.sort((a, b) => nearest(mob, a) - nearest(mob, b))[0] ?? null;
}

function nearest(mob, candidate) {
  const pos = candidate.position ?? candidate.mesh?.position;
  return pos ? mob.mesh.position.distanceTo(pos) : Infinity;
}

/**
 * Whether it should stop approaching.
 *
 * Wiki: "stop once they are within 5 blocks of it".
 */
export function ghastlingShouldStop(mob, target) {
  if (!isGhastling(mob) || !target) return true;
  return nearest(mob, target) <= GHASTLING_STOP_DISTANCE;
}

/**
 * Rehydrate a dried ghast into a ghastling.
 *
 * Wiki: a happy ghast spawns "when a dried ghast is rehydrated in water (as ghastling)". So the product is
 * always a baby, which is why the spawn egg's own route also starts it young.
 */
export function rehydrateDriedGhast(block, { inWater = false } = {}) {
  if (!block || block !== 'dried_ghast') return null;
  if (DRIED_GHAST_REHYDRATION.requiresWater && !inWater) return null;
  return { type: 'happy_ghast', isBaby: DRIED_GHAST_REHYDRATION.producesGhastling };
}

/**
 * Death drops.
 *
 * Wiki: the happy ghast's page has NO "On death" section and its infobox lists only USABLE items (snowball,
 * golden dandelion, harness, shears, name tag, lead). So it drops nothing, and this is deliberate rather than
 * an omission.
 */
export function happyGhastDrops(mob) {
  if (!isHappyGhast(mob)) return [];
  return [];
}

/** Wiki: no experience value is given, so it is zero rather than a guess. */
export function happyGhastXp() {
  return 0;
}

/**
 * Build the model: a big pale jellyfish body with nine tentacles.
 *
 * The ghast's silhouette with the happy ghast's palette, since the wiki calls it the passive COUNTERPART of the
 * ghast.
 */
export function createHappyGhastModel(skinMat, tentacleMat, eyeMat, mouthMat) {
  const group = new THREE.Group();

  // 3.8 x 3.6 x 3.8 pale ghostly body, positioned so it hovers with tentacles clearly visible below
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.6, 3.8), skinMat);
  body.position.y = 2.8;
  group.add(body);

  // Face panel sitting flush on the +Z front face of the body
  const face = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.05), skinMat);
  face.position.set(0, 0, 1.91);
  body.add(face);

  // Joyful arched smiling eyes ^_^
  const eyes = [];
  for (const side of [-1, 1]) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.9, 0.4, 0.04);
    // Arch: horizontal center bar with downward corners for a happy closed eye
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.04), eyeMat);
    eyeGroup.add(topBar);
    const leftCorner = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), eyeMat);
    leftCorner.position.set(-0.24, -0.12, 0);
    eyeGroup.add(leftCorner);
    const rightCorner = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), eyeMat);
    rightCorner.position.set(0.24, -0.12, 0);
    eyeGroup.add(rightCorner);

    face.add(eyeGroup);
    eyes.push(eyeGroup);
  }

  // Rosy pink blush cheeks below the eyes, signature of the Happy Ghast
  const blushMat = new THREE.MeshLambertMaterial({ color: 0xf4a6b2 });
  for (const side of [-1, 1]) {
    const blush = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.04), blushMat);
    blush.position.set(side * 1.15, -0.05, 0.035);
    face.add(blush);
  }

  // Friendly warm smile (upturned mouth)
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.45, 0.04);
  const mouthCenter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.04), mouthMat);
  mouth.add(mouthCenter);
  for (const side of [-1, 1]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.04), mouthMat);
    corner.position.set(side * 0.38, 0.08, 0);
    mouth.add(corner);
  }
  face.add(mouth);

  // Nine dangling tentacles hanging visibly BELOW the body (pivoted at top)
  const tentacles = [];
  const offsets = [
    [-1.2, -1.2], [0, -1.3], [1.2, -1.2],
    [-1.3, 0], [1.3, 0],
    [-1.2, 1.2], [0, 1.3], [1.2, 1.2],
    [0, 0]
  ];
  offsets.forEach(([x, z], index) => {
    // Pivot at top of tentacle where it attaches to underside of body (y = -1.8)
    const tentaclePivot = new THREE.Group();
    tentaclePivot.position.set(x, -1.8, z);
    tentaclePivot.userData.phase = index * 0.7;

    const tentacleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.35), tentacleMat);
    // Center mesh so its top connects to the pivot
    tentacleMesh.position.y = -0.9;
    tentaclePivot.add(tentacleMesh);

    body.add(tentaclePivot);
    tentacles.push(tentaclePivot);
  });

  // The harness overlay and its lowered goggles, both hidden until equipped.
  const harnessMat = new THREE.MeshLambertMaterial({ color: HAPPY_GHAST_COLORS.harness || 0x8a5a3c });
  const harness = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.8, 3.9), harnessMat);
  harness.position.y = 0.2;
  harness.visible = false;
  body.add(harness);

  const goggles = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.25), eyeMat);
  goggles.position.set(0, 0.5, 1.95);
  goggles.visible = false;
  body.add(goggles);

  return { group, body, face, eyes, mouth, tentacles, harness, goggles };
}

/**
 * Pose it.
 *
 * Wiki: "While the happy ghast is being ridden, its goggles lower to cover its eyes." So the goggles are the one
 * stateful part of the silhouette.
 */
export function poseHappyGhast(mob, phase = 0) {
  if (!isHappyGhast(mob) || !mob.mesh) return;
  (mob.tentacles ?? []).forEach((tentacle, index) => {
    if (!tentacle?.rotation) return;
    const offset = tentacle.userData?.phase ?? index * 0.7;
    // A slow drift, which is what makes a hovering jellyfish read as alive.
    tentacle.rotation.x = Math.sin(phase * 1.5 + offset) * 0.18;
    tentacle.rotation.z = Math.cos(phase * 1.2 + offset) * 0.14;
  });
  if (mob.harness) mob.harness.visible = !!mob.hasHarness;
  if (mob.goggles) {
    // Wiki: down while ridden, up otherwise.
    mob.goggles.visible = !!mob.hasHarness;
    mob.goggles.position.y = (mob.riders?.length ?? 0) > 0 ? 0.2 : 0.85;
  }
}
