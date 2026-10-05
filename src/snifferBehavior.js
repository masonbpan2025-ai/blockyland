import * as THREE from 'three';

/**
 * Sniffer rules: wandering, scenting, the dig state machine, and the seed results.
 *
 * Reference: https://minecraft.wiki/w/Sniffer
 *
 * The sniffer is a passive ancient mob whose entire purpose is one mechanic: it tracks "ancient seeds"
 * with its snout, sploots, and digs up a torchflower seed or a pitcher pod. Almost every rule below is a
 * **condition on when digging is allowed**, which is why they are collected here rather than spread
 * through the update loop.
 */

/** Wiki: 14 HP. */
export const SNIFFER_HEALTH = 14;

/** Wiki: adult 1.9 wide x 1.75 tall; a snifflet 0.95 x 0.875. */
export const SNIFFER_DIMENSIONS = { width: 1.9, height: 1.75 };
export const SNIFFLET_DIMENSIONS = { width: 0.95, height: 0.875 };
export const SNIFFLET_SCALE = 0.5;

/** Wiki: 0.1 speed. */
export const SNIFFER_SPEED = 0.1;

/**
 * Wiki: "The head location is defined as 2.25 blocks in front of the center of the body."
 */
export const SNIFFER_HEAD_OFFSET = 2.25;

/** Wiki: "stores its prior 20 digging locations to prevent subsequent digging at those locations". */
export const SNIFFER_DIG_MEMORY = 20;

/** Wiki: "After sniffing out seeds, an eight-minute cooldown is activated before it can search again." */
export const SNIFFER_SEARCH_COOLDOWN = 480;

/** Wiki: the dig itself takes a moment, and it sploots (lies down) while doing it. */
export const SNIFFER_DIG = { scentSeconds: { min: 2, max: 4 }, splootSeconds: 1.6, searchCooldownJitter: 0 };

/** Wiki: equal chance of a torchflower seed or a pitcher pod. */
export const SNIFFER_DIG_DROPS = ['torchflower_seeds', 'pitcher_pod'];

/**
 * Wiki's diggable block list. Held as names and resolved against the BLOCKS registry so a renamed block
 * id cannot silently make a sniffer unable to dig.
 *
 * Wiki: "Sniffers cannot dig on mycelium" — deliberately absent.
 */
export const SNIFFER_DIGGABLE_NAMES = [
  'coarse_dirt', 'dirt', 'grass_block', 'moss_block', 'mud',
  'muddy_mangrove_roots', 'pale_moss_block', 'rooted_dirt', 'podzol'
];

/** A cache of the numeric ids, resolved once per manager. */
let diggableCache = null;

/**
 * Resolve the diggable numeric ids.
 *
 * `blocks` is the BLOCKS registry. Returns a Set of ids. The cache is keyed on the registry object, so a
 * test that passes a different registry gets its own answer.
 */
export function diggableBlockIds(blocks) {
  if (!blocks) return new Set();
  if (diggableCache && diggableCache.blocks === blocks) return diggableCache.ids;
  const ids = new Set();
  for (const name of SNIFFER_DIGGABLE_NAMES) {
    const id = blocks[name.toUpperCase()];
    if (typeof id === 'number') ids.add(id);
  }
  diggableCache = { blocks, ids };
  return ids;
}

/** True when the mob is a sniffer. */
export function isSniffer(mob) {
  return mob?.type === 'sniffer';
}

/** Wiki: a snifflet is twice the size of an adult's baby and cannot dig. */
export function isSnifflet(mob) {
  return isSniffer(mob) && !!mob.isBaby;
}

/** The hitbox for a sniffer, which halves for a snifflet. */
export function snifferDimensions(mob) {
  return mob?.isBaby ? { ...SNIFFLET_DIMENSIONS } : { ...SNIFFER_DIMENSIONS };
}

/**
 * The position of the sniffer's snout.
 *
 * Wiki: "2.25 blocks in front of the center of the body". Used both to pick the block to dig and to test
 * whether that block is reachable.
 */
export function snifferHeadPosition(mob) {
  const yaw = mob?.yaw ?? 0;
  const from = mob.mesh.position;
  return new THREE.Vector3(
    from.x + Math.sin(yaw) * SNIFFER_HEAD_OFFSET,
    from.y,
    from.z + Math.cos(yaw) * SNIFFER_HEAD_OFFSET
  );
}

/** True when a block id is one the sniffer may dig. */
export function isDiggableBlock(id, blocks) {
  return diggableBlockIds(blocks).has(id);
}

/**
 * Why a sniffer cannot dig right now.
 *
 * Wiki: "A sniffer can only dig if it is on the ground. A sniffer cannot dig when it is leashed, in water,
 * tempted with a torchflower seed, panicking, or in a boat or minecart. The block underneath its head must
 * be diggable and reachable by the sniffer." Returns a reason string, or null when digging is allowed.
 */
export function snifferDigRefusal(mob, {
  onGround = true, leashed = false, inWater = false, tempted = false,
  panicking = false, inVehicle = false, headBlockId = null, groundBlockId = null, blocks = null
} = {}) {
  if (!isSniffer(mob)) return 'not a sniffer';
  // Wiki: "Snifflets cannot dig."
  if (mob.isBaby) return 'a snifflet cannot dig';
  if (!onGround) return 'not on the ground';
  if (leashed) return 'leashed';
  if (inWater) return 'in water';
  if (tempted) return 'tempted with a torchflower seed';
  if (panicking) return 'panicking';
  if (inVehicle) return 'in a boat or minecart';
  // The block under the head must be diggable; the snout presses into the ground below it.
  if (headBlockId !== null && !isDiggableBlock(headBlockId, blocks)) {
    return 'the block under its head is not diggable';
  }
  if (groundBlockId !== null && !isDiggableBlock(groundBlockId, blocks)) {
    return 'the ground is not diggable';
  }
  return null;
}

/** Whether the position has been dug recently. */
export function wasDugRecently(mob, position) {
  if (!mob?.dugLocations?.length) return false;
  for (const entry of mob.dugLocations) {
    if (Math.abs(entry.x - position.x) < 0.5
      && Math.abs(entry.y - position.y) < 0.5
      && Math.abs(entry.z - position.z) < 0.5) return true;
  }
  return false;
}

/**
 * Record a dig, keeping only the last 20.
 *
 * Wiki: "The sniffer also stores its prior 20 digging locations to prevent subsequent digging at those
 * locations." The oldest is dropped, so a sniffer working a small pen eventually cycles.
 */
export function rememberDig(mob, position) {
  if (!isSniffer(mob)) return [];
  if (!mob.dugLocations) mob.dugLocations = [];
  mob.dugLocations.push({ x: position.x, y: position.y, z: position.z });
  while (mob.dugLocations.length > SNIFFER_DIG_MEMORY) mob.dugLocations.shift();
  return mob.dugLocations;
}

/**
 * Pick a nearby diggable spot for the snout.
 *
 * Scans in front of the mob first, because the head has to reach the block, then a small arc around it.
 * Returns a position whose block is diggable and that has not been dug recently, or null.
 */
export function findDiggableSpot(manager, mob, { radius = 3 } = {}) {
  if (!isSniffer(mob) || mob.isBaby) return null;
  const blocks = manager?.blocks ?? null;
  const world = manager?.world;
  if (!world?.getVoxel) return null;
  const head = snifferHeadPosition(mob);
  const candidates = [];
  // The head position first, then a ring around the mob.
  candidates.push(head);
  for (let i = 0; i < 12; i++) {
    const angle = mob.yaw + (i / 12) * Math.PI * 2;
    candidates.push(new THREE.Vector3(
      mob.mesh.position.x + Math.sin(angle) * radius,
      mob.mesh.position.y,
      mob.mesh.position.z + Math.cos(angle) * radius
    ));
  }
  for (const candidate of candidates) {
    const groundY = Math.floor(candidate.y) - 1;
    const id = world.getVoxel(Math.floor(candidate.x), groundY, Math.floor(candidate.z));
    if (!isDiggableBlock(id, manager?.blockRegistry ?? blocks)) continue;
    const spot = new THREE.Vector3(Math.floor(candidate.x) + 0.5, groundY + 1, Math.floor(candidate.z) + 0.5);
    if (wasDugRecently(mob, spot)) continue;
    return spot;
  }
  return null;
}

/**
 * Advance the sniffer's digging state machine.
 *
 * Wiki: it "occasionally smell[s] its surroundings and track[s] ancient seeds by pressing its snout to the
 * ground. When they find a seed, they sploot and use their snouts to dig into the ground until they get
 * torchflower seeds or a pitcher pod", then an eight-minute cooldown applies.
 *
 * Returns 'scenting', 'searching', 'splooting', 'dug' or null.
 */
export function updateSnifferDig(manager, mob, dt, {
  random = Math.random, onGround = true, leashed = false, inWater = false,
  tempted = false, panicking = false, inVehicle = false, headBlockId = null, groundBlockId = null
} = {}) {
  if (!isSniffer(mob)) return null;
  mob.digCooldown = Math.max(0, (mob.digCooldown ?? 0) - dt);

  if (mob.digState === 'scenting') {
    // Pressing its snout to the ground, which is the visible tell.
    mob.digTimer -= dt;
    if (mob.digTimer <= 0) {
      const spot = findDiggableSpot(manager, mob);
      if (!spot) {
        mob.digState = 'idle';
        mob.digCooldown = SNIFFER_SEARCH_COOLDOWN;
        return null;
      }
      mob.digTarget = spot;
      mob.digState = 'searching';
      return 'searching';
    }
    return 'scenting';
  }

  if (mob.digState === 'searching') {
    const target = mob.digTarget;
    if (!target) { mob.digState = 'idle'; return null; }
    const dir = target.clone().sub(mob.mesh.position);
    dir.y = 0;
    const distance = dir.length();
    if (distance > 1.2) {
      dir.normalize();
      mob.yaw = Math.atan2(dir.x, dir.z);
      mob.velocity.x = dir.x * SNIFFER_SPEED * 8;
      mob.velocity.z = dir.z * SNIFFER_SPEED * 8;
      return null;
    }
    // Arrived: check the conditions once more before committing, because the wiki lists several ways the
    // dig is refused and a sniffer can walk into water or be leashed on the way.
    const refusal = snifferDigRefusal(mob, {
      onGround, leashed, inWater, tempted, panicking, inVehicle, headBlockId, groundBlockId,
      blocks: manager?.blocks
    });
    if (refusal) {
      mob.digState = 'idle';
      mob.digTarget = null;
      return null;
    }
    mob.velocity.x = 0;
    mob.velocity.z = 0;
    mob.digState = 'splooting';
    mob.digTimer = SNIFFER_DIG.splootSeconds;
    return 'splooting';
  }

  if (mob.digState === 'splooting') {
    mob.digTimer -= dt;
    if (mob.digTimer > 0) return 'splooting';
    // Wiki: equal chance of a torchflower seed or a pitcher pod.
    const drop = SNIFFER_DIG_DROPS[random() < 0.5 ? 0 : 1];
    rememberDig(mob, mob.digTarget ?? mob.mesh.position);
    mob.digTarget = null;
    mob.digState = 'idle';
    mob.digCooldown = SNIFFER_SEARCH_COOLDOWN;
    // The seed pops out as an item, which is what makes the mechanic observable.
    manager?.entities?.spawnDroppedItem?.(
      snifferHeadPosition(mob).setY(mob.mesh.position.y + 0.3),
      drop, false, 1
    );
    return 'dug';
  }

  // Idle: once the cooldown has run out, scent again.
  if (mob.digCooldown <= 0) {
    mob.digState = 'scenting';
    mob.digTimer = SNIFFER_DIG.scentSeconds.min
      + random() * (SNIFFER_DIG.scentSeconds.max - SNIFFER_DIG.scentSeconds.min);
    return 'scenting';
  }
  return null;
}

/** Wiki: the breeding food is a torchflower seed. */
export const SNIFFER_BREEDING_FOOD = 'torchflower_seeds';

/** True for the sniffer's breeding food. */
export function isSnifferBreedingFood(itemId) {
  return String(itemId ?? '').toLowerCase() === SNIFFER_BREEDING_FOOD;
}

/**
 * Wiki: "Snifflets require 48000 game ticks to grow up into adult sniffers, which is equal to 40 minutes
 * or two in-game days, twice as long as most other baby mobs in the game. The remaining growth time is
 * reduced by 10% each time a snifflet is fed torchflower seeds."
 */
export const SNIFFLET_GROWTH_SECONDS = 2400;
export const SNIFFLET_FEED_ACCELERATION = 0.1;

/**
 * Advance a snifflet's growth.
 *
 * 2400 seconds rather than the shared baby-growth 1200, because the wiki is explicit that a snifflet takes
 * twice as long. Returns true on the step it matures.
 */
export function updateSniffletGrowth(mob, dt) {
  if (!isSniffer(mob) || !mob.isBaby) return false;
  if (mob.ageLocked) return false;
  mob.growthTimer = (mob.growthTimer ?? SNIFFLET_GROWTH_SECONDS) - dt;
  if (mob.growthTimer > 0) return false;
  mob.isBaby = false;
  mob.growthTimer = 0;
  const dims = snifferDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  mob.mesh?.scale?.setScalar?.(1);
  // Wiki: "There is an initial lag period between snifflets growing into adults and splooting for seeds."
  mob.digCooldown = SNIFFER_SEARCH_COOLDOWN;
  return true;
}

/** The sniffer eye is fed torchflower seeds, taking 10% off the remaining growth. */
export function accelerateSniffletGrowth(mob, fraction = SNIFFLET_FEED_ACCELERATION) {
  if (!isSniffer(mob) || !mob.isBaby) return 0;
  // A golden dandelion stops the aging, so feeding must not burn the timer silently.
  if (mob.ageLocked) return 0;
  const before = mob.growthTimer ?? SNIFFLET_GROWTH_SECONDS;
  const removed = before * fraction;
  mob.growthTimer = Math.max(0, before - removed);
  return removed;
}

/** Wiki: a sniffer egg hatches after 10 minutes on a moss block, 20 minutes otherwise. */
export const SNIFFER_EGG_HATCH = { onMossSeconds: 600, defaultSeconds: 1200 };

/** The hatch time for the block the egg sits on. */
export function snifferEggHatchSeconds(blockName) {
  return String(blockName ?? '').toLowerCase() === 'moss_block'
    ? SNIFFER_EGG_HATCH.onMossSeconds
    : SNIFFER_EGG_HATCH.defaultSeconds;
}

/** Wiki: a breeding pair produces a sniffer egg as an item, and has a 5-minute cooldown. */
export const SNIFFER_BREEDING = { eggItem: 'sniffer_egg', cooldownSeconds: 300 };

/**
 * Wiki: an adult sniffer drops no items at all — the seeds come from digging, and the egg from breeding —
 * and gives 1-3 XP with credit. A snifflet gives none.
 */
export function snifferDrops(mob) {
  if (!isSniffer(mob)) return [];
  return [];
}

/** Wiki: 1-3 XP with credit, and none for a snifflet. */
export function snifferXp(mob) {
  if (!isSniffer(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/** Wiki: 1-7 XP on a successful breeding, which the shared breeding path awards. */
export function snifferBreedingXp() {
  return 1 + Math.floor(Math.random() * 7);
}

/** Body colours: a mossy green back over a cream belly, with a yellow snout. */
export const SNIFFER_COLORS = { body: 0x8fa86b, belly: 0xe8e0c8, shell: 0x6f8a4f, snout: 0xd9c04a, leg: 0x5c7340 };

/**
 * Build a sniffer model: a long low body on six legs, a raised head with a long snout, and a banded shell.
 *
 * Six legs is deliberate — the wiki notes the walk animation was inspired by centipedes.
 */
export function createSnifferModel(bodyMat, bellyMat, shellMat, snoutMat, legMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.7), bodyMat);
  body.position.y = 0.95;
  group.add(body);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 1.5), bellyMat);
  belly.position.y = 0.62;
  group.add(belly);

  // A banded shell over the back.
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.3, 1.5), shellMat);
  shell.position.y = 1.29;
  group.add(shell);
  const bands = [];
  for (const z of [-0.45, 0, 0.45]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.32, 0.08), bellyMat);
    band.position.set(0, 1.29, z);
    group.add(band);
    bands.push(band);
  }

  // The head sits low and forward on a short neck, with the long yellow snout.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), bodyMat);
  neck.position.set(0, 1.1, 0.9);
  group.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), bodyMat);
  head.position.set(0, 1.18, 1.25);
  group.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.5), snoutMat);
  snout.position.set(0, -0.08, 0.5);
  head.add(snout);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), snoutMat);
    eye.position.set(side * 0.2, 0.12, 0.28);
    head.add(eye);
    eyes.push(eye);
  }

  // Six short legs in two rows, which is the centipede-ish gait the wiki mentions.
  const legs = [];
  const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
  for (const z of [0.6, 0, -0.6]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(side * 0.44, 0.3, z);
      group.add(leg);
      legs.push(leg);
    }
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.4), shellMat);
  tail.position.set(0, 1.0, -1.0);
  group.add(tail);

  return { group, body, belly, shell, bands, neck, head, snout, eyes, legs, tail };
}

/**
 * Pose the sniffer.
 *
 * The sploot is the signature: it lies flat with its legs splayed out to the sides, which the wiki calls
 * out by name, and then presses its snout down to dig.
 */
export function poseSniffer(mob, phase = 0) {
  if (!isSniffer(mob) || !mob.mesh) return;
  const splooting = mob.digState === 'splooting';
  const scenting = mob.digState === 'scenting';

  if (splooting) {
    // Flat to the ground, legs splayed sideways, snout driven down.
    mob.mesh.rotation.x = 0;
    mob.mesh.position.y = (mob.groundY ?? mob.mesh.position.y) - 0.45;
    for (const leg of mob.legs ?? []) {
      if (leg?.rotation) leg.rotation.z = leg.position.x < 0 ? -1.25 : 1.25;
    }
    if (mob.head) mob.head.rotation.x = 0.5 + Math.sin(phase * 12) * 0.15;
    return;
  }

  // Standing: restore, with the snout lowered while scenting.
  if (mob.groundY !== undefined && mob.mesh.position.y < mob.groundY) mob.mesh.position.y = mob.groundY;
  if (mob.head) mob.head.rotation.x = scenting ? 0.75 : 0;
  (mob.legs ?? []).forEach((leg, index) => {
    if (!leg?.rotation) return;
    leg.rotation.z = 0;
    leg.rotation.x = Math.sin(phase * 4 + index * 0.6) * 0.35;
  });
}
