import * as THREE from 'three';

/**
 * Allay rules: item hoarding, delivery, note-block focus, jukebox dancing and duplication.
 *
 * Reference: https://minecraft.wiki/w/Allay
 *
 * The allay's whole purpose is a small job: you give it an item, it follows you, and it fetches dropped
 * copies of that item and brings them back. Everything else — the note-block focus, the dancing, the
 * duplication — hangs off that job.
 */

/** Wiki: 20 HP, raised from 10 in 22w16a. */
export const ALLAY_HEALTH = 20;

/** Wiki: 0.35 wide x 0.6 tall. */
export const ALLAY_DIMENSIONS = { width: 0.35, height: 0.6 };

/** Wiki: 0.4 speed. */
export const ALLAY_SPEED = 0.4;

/** Wiki entity tag: `fall_damage_immune`. */
export const ALLAY_FALL_IMMUNE = true;

/**
 * Wiki: "This allay follows the player from within a 64-block radius sphere and seeks items within a
 * 32-block radius sphere from the player."
 */
export const ALLAY_FOLLOW_RANGE = 64;
export const ALLAY_SEEK_RANGE = 32;

/** Wiki: "the allay can pick up items within a radius of about 1.3 blocks from itself". */
export const ALLAY_PICKUP_RANGE = 1.3;

/** Wiki: "drop items up to 3 blocks away from its player or note block". */
export const ALLAY_DROP_RANGE = 3;

/** Wiki: "After delivering items, the allay has a delay of three seconds until it can seek items again." */
export const ALLAY_DELIVER_DELAY = 3;

/** Wiki: "An allay has a single inventory slot to hold a stack of items (usually 64 items)". */
export const ALLAY_INVENTORY_SLOTS = 1;
export const ALLAY_STACK_SIZE = 64;

/**
 * Wiki: hearing a note block within 16 blocks while delivering makes it deliver there instead, and it
 * then spends 30 seconds around that note block. Another sound from the SAME note block resets the timer.
 */
export const ALLAY_NOTE_FOCUS = { hearRange: 16, focusSeconds: 30 };

/** Wiki: it dances near a playing jukebox, and stops when the music stops or it gets too far away. */
export const ALLAY_DANCE_RANGE = 3;

/**
 * Wiki: giving an amethyst shard to a *dancing* allay splits it into two, and "after duplication, both
 * allays have a five-minute cooldown before being able to duplicate again".
 */
export const ALLAY_DUPLICATION = { item: 'amethyst_shard', cooldownSeconds: 300 };

/** Wiki: "Allays naturally regenerate 2 HP per second if damaged." */
export const ALLAY_REGEN_PER_SECOND = 2;

/** Wiki: allays cannot be harmed by the player they are bonded to. */
export const ALLAY_OWNER_IMMUNE = true;

/** Body colours: a small luminous blue-white body with darker wings, matching the wiki's blue glow. */
export const ALLAY_COLORS = { body: 0x7dd3fc, wing: 0x38bdf8, trim: 0xe0f2fe, eye: 0x0f172a };

/** True when the mob is an allay. */
export function isAllay(mob) {
  return mob?.type === 'allay';
}

/** Wiki: allays have no baby form. Exported so the absence is explicit rather than an oversight. */
export function allayHasBabyForm() {
  return false;
}

/** The item the allay was given, which is what it seeks. */
export function allayHeldItem(mob) {
  if (!isAllay(mob)) return null;
  return mob.heldItem ?? null;
}

/**
 * Give the allay an item.
 *
 * Wiki: "flies aimlessly until a player gives it an item", after which it follows that player and seeks
 * dropped copies. Giving it an item while it already holds one replaces the item and re-bonds the owner,
 * which is how the wiki describes locking onto the last player who gave it an item.
 *
 * Returns true when the item was accepted.
 */
export function giveAllayItem(mob, itemId, player) {
  if (!isAllay(mob) || !itemId) return false;
  // Wiki: a NAMED name tag performs its normal function rather than being given, so it is not accepted.
  mob.heldItem = itemId;
  mob.owner = player ?? mob.owner ?? null;
  mob.carriedCount = 0;
  mob.seekCooldown = 0;
  return true;
}

/**
 * Take the allay's item back.
 *
 * Wiki: "The allay returns to wandering around if any player takes its item back by using an empty hand on
 * it." Any player may do it, not only the owner.
 */
export function takeAllayItem(mob, player = null) {
  if (!isAllay(mob) || !mob.heldItem) return null;
  const taken = mob.heldItem;
  mob.heldItem = null;
  mob.carriedCount = 0;
  mob.owner = null;
  mob.noteFocus = null;
  return taken;
}

/**
 * Whether an item is one the allay will seek.
 *
 * Wiki: it seeks "dropped versions of the same item". It does not distinguish enchantments or special
 * names, and it does not look inside shulker boxes -- so the comparison is the plain item id.
 */
export function allaySeeksItem(mob, itemId) {
  if (!isAllay(mob) || !mob.heldItem) return false;
  return String(itemId ?? '') === String(mob.heldItem);
}

/**
 * Whether the allay may pick items up at all.
 *
 * Wiki: "Allays don't pick up any items if the game rule mobGriefing is false, but the player can still
 * give the allay items."
 */
export function allayCanPickUp(mob, { mobGriefing = true } = {}) {
  if (!isAllay(mob)) return false;
  if (!mob.heldItem) return false;
  if (mobGriefing === false) return false;
  return true;
}

/**
 * The allay's delivery target.
 *
 * Wiki: it delivers to the note block it is focused on, or otherwise to its player.
 */
export function allayDeliveryTarget(mob, player = null) {
  if (!isAllay(mob)) return null;
  if (mob.noteFocus && (mob.noteFocusTimer ?? 0) > 0) return mob.noteFocus;
  return player ?? mob.owner ?? null;
}

/**
 * Report a note block playing near the allay.
 *
 * Wiki: "If the allay hears a note block play within 16 blocks of its location while delivering items, it
 * instead delivers its items to the note block. Then it spends 30 seconds around that particular note
 * block ... While an allay is focused on a note block, it responds only to sound from that note block,
 * which resets the time until it loses interest."
 *
 * Returns true when the note block took focus.
 */
export function hearNoteBlock(mob, noteBlock) {
  if (!isAllay(mob) || !noteBlock?.position) return false;
  const from = mob.mesh?.position;
  if (!from) return false;
  if (from.distanceTo(noteBlock.position) > ALLAY_NOTE_FOCUS.hearRange) return false;
  // Already focused on a DIFFERENT note block: the wiki says it responds only to that one, so another
  // block playing nearby cannot steal the focus.
  if (mob.noteFocus && mob.noteFocus !== noteBlock && (mob.noteFocusTimer ?? 0) > 0) return false;
  mob.noteFocus = noteBlock;
  mob.noteFocusTimer = ALLAY_NOTE_FOCUS.focusSeconds;
  return true;
}

/**
 * Whether the allay is dancing.
 *
 * Wiki: "An allay performs a dance animation when there is a nearby jukebox playing. If the jukebox stops
 * playing or if the allay gets too far away from the jukebox, it stops dancing."
 */
export function allayDances(manager, mob) {
  if (!isAllay(mob)) return false;
  const disc = manager?.jukeboxPlaying;
  if (!disc) return false;
  const box = disc.position ?? disc;
  if (!box || typeof box.x !== 'number') return false;
  const pos = mob.mesh.position;
  return Math.hypot(pos.x - box.x, pos.z - box.z) <= ALLAY_DANCE_RANGE;
}

/**
 * Try to duplicate the allay with an amethyst shard.
 *
 * Wiki: "If an allay is given an amethyst shard while it is dancing due to a nearby jukebox playing any
 * music disc, it splits into two allays (itself and a new allay) and the amethyst shard is consumed.
 * After duplication, both allays have a five-minute cooldown before being able to duplicate again."
 *
 * Returns the new allay, or null when duplication did not happen.
 */
export function duplicateAllay(manager, mob, itemId, { dancing = false } = {}) {
  if (!isAllay(mob)) return null;
  if (String(itemId ?? '') !== ALLAY_DUPLICATION.item) return null;
  // Wiki: it must be DANCING. An amethyst shard to a stationary allay does nothing.
  if (!dancing) return null;
  if ((mob.duplicationCooldown ?? 0) > 0) return null;

  mob.duplicationCooldown = ALLAY_DUPLICATION.cooldownSeconds;
  const spawner = manager?.spawnAllay;
  if (typeof spawner !== 'function') return null;
  const twin = spawner.call(manager, mob.mesh.position.x, mob.mesh.position.y, mob.mesh.position.z);
  if (!twin) return null;
  // Wiki: the second allay is freshly spawned and "doesn't retain the original allay's attributes such as
  // its custom name". It does share the cooldown, which is why both start at five minutes.
  twin.duplicationCooldown = ALLAY_DUPLICATION.cooldownSeconds;
  return twin;
}

/**
 * Find the nearest dropped instance of the allay's held item.
 *
 * Wiki: it "searches for and collects dropped instances of its held item", within a 32-block sphere of the
 * player. Returns the entity or null.
 */
export function findSeekableItem(manager, mob, player, { mobGriefing = true } = {}) {
  if (!allayCanPickUp(mob, { mobGriefing })) return null;
  const items = manager?.entities?.droppedItems;
  if (!Array.isArray(items) || !items.length) return null;
  const anchor = player?.position ?? mob.mesh.position;
  let best = null;
  let bestDistance = ALLAY_SEEK_RANGE;
  for (const drop of items) {
    if (!drop || drop.pickedUp) continue;
    if (!allaySeeksItem(mob, drop.itemType)) continue;
    const pos = drop.mesh?.position ?? drop.position;
    if (!pos) continue;
    const fromPlayer = anchor.distanceTo(pos);
    if (fromPlayer > ALLAY_SEEK_RANGE) continue;
    const fromAllay = mob.mesh.position.distanceTo(pos);
    if (fromAllay < bestDistance) { bestDistance = fromAllay; best = drop; }
  }
  return best;
}

/**
 * Advance the allay's collection job.
 *
 * Wiki: it seeks items near its player, picks them up within about 1.3 blocks, and drops them up to 3
 * blocks from its player or focused note block, then waits three seconds before seeking again.
 *
 * Returns 'seeking', 'picked-up', 'delivered', 'following', 'dancing' or 'wandering'.
 */
export function updateAllayJob(manager, mob, dt, player, { mobGriefing = true, random = Math.random } = {}) {
  if (!isAllay(mob)) return null;

  mob.duplicationCooldown = Math.max(0, (mob.duplicationCooldown ?? 0) - dt);
  mob.seekCooldown = Math.max(0, (mob.seekCooldown ?? 0) - dt);
  if ((mob.noteFocusTimer ?? 0) > 0) {
    mob.noteFocusTimer -= dt;
    if (mob.noteFocusTimer <= 0) mob.noteFocus = null;
  }

  // Dancing takes precedence over everything except holding still.
  mob.isDancing = allayDances(manager, mob);
  if (mob.isDancing) {
    mob.velocity.set(0, 0, 0);
    return 'dancing';
  }

  // No item means it just flies aimlessly.
  if (!mob.heldItem) {
    mob.velocity.y = Math.sin((mob.allayPhase ?? 0) * 1.5) * 0.4;
    return 'wandering';
  }

  const target = allayDeliveryTarget(mob, player);

  // Carrying something: go and drop it.
  if ((mob.carriedCount ?? 0) > 0) {
    const targetPos = target?.position ?? target?.mesh?.position ?? mob.owner?.position;
    if (!targetPos) return 'following';
    const toTarget = targetPos.clone().sub(mob.mesh.position);
    const distance = toTarget.length();
    if (distance > ALLAY_DROP_RANGE) {
      toTarget.normalize();
      mob.velocity.copy(toTarget.multiplyScalar(ALLAY_SPEED * 4));
      return 'following';
    }
    // In range: drop the carried items.
    manager?.entities?.spawnDroppedItem?.(
      mob.mesh.position.clone(),
      mob.heldItem,
      false,
      mob.carriedCount
    );
    mob.carriedCount = 0;
    // Wiki: a three-second delay after delivering.
    mob.seekCooldown = ALLAY_DELIVER_DELAY;
    return 'delivered';
  }

  if (mob.seekCooldown > 0) {
    // Idle near the delivery target while the delay runs.
    const targetPos = target?.position ?? mob.owner?.position;
    if (targetPos) {
      const toTarget = targetPos.clone().sub(mob.mesh.position);
      const distance = toTarget.length();
      if (distance > 4) {
        toTarget.normalize();
        mob.velocity.copy(toTarget.multiplyScalar(ALLAY_SPEED * 3));
      } else {
        mob.velocity.multiplyScalar(0.8);
      }
    }
    return 'following';
  }

  const drop = findSeekableItem(manager, mob, player, { mobGriefing });
  if (!drop) {
    // Nothing to fetch: stay near the target.
    const targetPos = target?.position ?? mob.owner?.position;
    if (targetPos) {
      const toTarget = targetPos.clone().sub(mob.mesh.position);
      const distance = toTarget.length();
      if (distance > ALLAY_FOLLOW_RANGE) {
        // Wiki: follows from within a 64-block sphere, so it closes a large gap quickly.
        toTarget.normalize();
        mob.velocity.copy(toTarget.multiplyScalar(ALLAY_SPEED * 6));
      } else if (distance > 4) {
        toTarget.normalize();
        mob.velocity.copy(toTarget.multiplyScalar(ALLAY_SPEED * 3));
      } else {
        mob.velocity.multiplyScalar(0.8);
        mob.velocity.y = Math.sin((mob.allayPhase ?? 0) * 1.5) * 0.4;
      }
    }
    return 'following';
  }

  const dropPos = drop.mesh?.position ?? drop.position;
  const toDrop = dropPos.clone().sub(mob.mesh.position);
  const distance = toDrop.length();
  if (distance > ALLAY_PICKUP_RANGE) {
    toDrop.normalize();
    mob.velocity.copy(toDrop.multiplyScalar(ALLAY_SPEED * 5));
    return 'seeking';
  }

  // Within pickup range: take it.
  drop.pickedUp = true;
  drop.removeFromWorld = true;
  mob.carriedCount = Math.min(ALLAY_STACK_SIZE, (mob.carriedCount ?? 0) + (drop.count ?? 1));
  return 'picked-up';
}

/**
 * Advance the allay's health regeneration.
 *
 * Wiki: "Allays naturally regenerate 2 HP per second if damaged." Returns the amount healed.
 */
export function updateAllayRegen(mob, dt) {
  if (!isAllay(mob)) return 0;
  if (mob.health >= mob.maxHealth) return 0;
  const heal = ALLAY_REGEN_PER_SECOND * dt;
  const before = mob.health;
  mob.health = Math.min(mob.maxHealth, mob.health + heal);
  return mob.health - before;
}

/**
 * Whether damage from a source is refused.
 *
 * Wiki: "Allays cannot be harmed by their interacting owners."
 */
export function allayRefusesDamage(mob, attacker) {
  if (!isAllay(mob) || !attacker) return false;
  return attacker === mob.owner;
}

/**
 * Death drops.
 *
 * Wiki: "Upon death, allays drop the item they are holding. Besides this, allays drop no other items or
 * experience." So the held item is dropped and the XP is zero.
 */
export function allayDrops(mob) {
  if (!isAllay(mob)) return [];
  const rows = [];
  if (mob.heldItem) rows.push([mob.heldItem, false, 1, 1]);
  if ((mob.carriedCount ?? 0) > 0) rows.push([mob.heldItem, false, mob.carriedCount, mob.carriedCount]);
  return rows;
}

/** Wiki: allays drop no experience at all. */
export function allayXp(mob) {
  return 0;
}

/**
 * Build an allay model: a small luminous body with two large wings and a trailing scarf of light.
 */
export function createAllayModel(bodyMat, wingMat, trimMat, eyeMat) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.22), bodyMat);
  body.position.y = 0.34;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), bodyMat);
  head.position.set(0, 0.56, 0.02);
  group.add(head);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), eyeMat);
    eye.position.set(side * 0.06, 0.02, 0.11);
    head.add(eye);
    eyes.push(eye);
  }

  // Two large wings, exposed as pivots with `rotation` so the shared flying helper can flap them.
  const wingGeo = new THREE.BoxGeometry(0.06, 0.26, 0.2);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.42, 0);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(side * 0.05, 0.08, 0);
    pivot.add(wing);
    group.add(pivot);
    wings.push({ pivot, wing, side, rotation: pivot.rotation });
  }
  wings.left = wings[0];
  wings.right = wings[1];

  // The trailing scarf/light, which is what makes the silhouette read as an allay.
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.06), trimMat);
  trim.position.set(0, 0.16, -0.14);
  group.add(trim);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), bodyMat);
    arm.position.set(side * 0.15, 0.36, 0.04);
    group.add(arm);
    arms.push(arm);
  }

  return { group, body, head, eyes, wings, trim, arms };
}

/**
 * Pose the allay.
 *
 * The dance is a bobbing spin with the wings held wide; carrying an item raises the arms, which is how the
 * wiki's render shows it.
 */
export function poseAllay(mob, phase = 0) {
  if (!isAllay(mob) || !mob.mesh) return;
  if (mob.isDancing) {
    mob.mesh.rotation.y = Math.sin(phase * 3) * 1.2;
    mob.mesh.position.y = (mob.baseY ?? mob.mesh.position.y) + Math.abs(Math.sin(phase * 6)) * 0.12;
    for (const w of mob.wings ?? []) {
      if (w?.pivot) w.pivot.rotation.z = w.side * -1.1;
    }
    return;
  }
  mob.mesh.rotation.y = 0;
  (mob.arms ?? []).forEach((arm) => {
    // Arms raised while holding, relaxed otherwise.
    arm.rotation.x = mob.heldItem ? -1.1 : Math.sin(phase * 2) * 0.15;
  });
  for (const w of mob.wings ?? []) {
    if (w?.pivot) w.pivot.rotation.z = w.side * (-0.3 - Math.abs(Math.sin(phase * 10)) * 0.5);
  }
  if (mob.trim) mob.trim.rotation.x = Math.sin(phase * 2) * 0.2;
}
