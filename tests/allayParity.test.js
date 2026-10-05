// Allay parity with https://minecraft.wiki/w/Allay
//
// A new flying passive mob whose whole purpose is a small job: you give it an item, it follows you, and it
// fetches dropped copies of that item and brings them back. Everything else — note-block focus, dancing,
// duplication — hangs off that job.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  ALLAY_HEALTH, ALLAY_DIMENSIONS, ALLAY_SPEED, ALLAY_FALL_IMMUNE, ALLAY_FOLLOW_RANGE,
  ALLAY_SEEK_RANGE, ALLAY_PICKUP_RANGE, ALLAY_DROP_RANGE, ALLAY_DELIVER_DELAY,
  ALLAY_INVENTORY_SLOTS, ALLAY_STACK_SIZE, ALLAY_NOTE_FOCUS, ALLAY_DANCE_RANGE,
  ALLAY_DUPLICATION, ALLAY_REGEN_PER_SECOND, ALLAY_OWNER_IMMUNE, ALLAY_COLORS,
  isAllay, allayHasBabyForm, allayHeldItem, giveAllayItem, takeAllayItem, allaySeeksItem,
  allayCanPickUp, allayDeliveryTarget, hearNoteBlock, allayDances, duplicateAllay,
  findSeekableItem, updateAllayJob, updateAllayRegen, allayRefusesDamage, allayDrops, allayXp,
  createAllayModel, poseAllay
} from '../src/allayBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    delivered: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) {
      this.delivered.push({ itemType, isBlock, count });
    },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(2, 2, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities };
}

/** A dropped item as the allay sees it. */
function dropped(manager, itemType, position, count = 1) {
  const drop = { itemType, count, mesh: { position: position.clone() } };
  manager.entities.droppedItems.push(drop);
  return drop;
}

test('allay is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.equal(allay.type, 'allay');
  assert.equal(allay.name, 'Allay');
  assert.notEqual(allay.type, 'villager');
});

test('the health, hitbox and traits match the wiki', () => {
  const { manager } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.equal(ALLAY_HEALTH, 20, 'wiki: 20 HP, raised from 10 in 22w16a');
  assert.equal(allay.maxHealth, 20);
  assert.deepEqual(ALLAY_DIMENSIONS, { width: 0.35, height: 0.6 });
  assert.deepEqual([allay.width, allay.height], [0.35, 0.6]);
  assert.deepEqual(manager.getMobDimensions('allay'), { width: 0.35, height: 0.6 });
  assert.equal(ALLAY_SPEED, 0.4);
  assert.equal(allay.isFlying, true, 'wiki: a flying mob');
  // Wiki entity tag: fall_damage_immune.
  assert.equal(ALLAY_FALL_IMMUNE, true);
  assert.equal(allay.fallDamageImmune, true);
  // Wiki: "Allays cannot enter water."
  assert.equal(allay.avoidsWater, true);
});

test('allays have no baby form', () => {
  // Wiki: "Allays do not have a baby form." Asserted so the absence is deliberate rather than an omission.
  assert.equal(allayHasBabyForm(), false);
  const { manager } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.equal(allay.isBaby, undefined, 'no baby flag');
  assert.equal(manager.spawnMob('allay', 0, 2, 0, { isBaby: true }).width, 0.35,
    'asking for a baby still yields the adult hitbox');
});

test('it flies aimlessly until given an item', () => {
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.equal(allayHeldItem(allay), null);
  assert.equal(updateAllayJob(manager, allay, 1 / 60, player), 'wandering');
  assert.equal(giveAllayItem(allay, 'dirt', player), true);
  assert.equal(allayHeldItem(allay), 'dirt');
  assert.equal(allay.owner, player, 'and it locks onto the player who gave it');
});

test('giving an item re-bonds the owner, and an empty hand takes it back', () => {
  // Wiki: "The allay locks onto the player who last gave it an item", and "The allay returns to wandering
  // around if any player takes its item back by using an empty hand on it."
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  const other = { position: new THREE.Vector3(5, 2, 0) };
  giveAllayItem(allay, 'dirt', player);
  assert.equal(allay.owner, player);
  giveAllayItem(allay, 'stone', other);
  assert.equal(allayHeldItem(allay), 'stone', 'the item is replaced');
  assert.equal(allay.owner, other, 'and so is the owner');

  assert.equal(takeAllayItem(allay, player), 'stone');
  assert.equal(allayHeldItem(allay), null);
  assert.equal(allay.owner, null, 'it returns to wandering');
  assert.equal(takeAllayItem(allay, player), null, 'nothing left to take');
  assert.equal(giveAllayItem(allay, null, player), false);
});

test('it seeks only its own item, ignoring enchantments and other items', () => {
  // Wiki: "It searches for and collects dropped instances of its held item", and "the allay does not
  // discern enchantments ... or items in shulker boxes when it seeks".
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  giveAllayItem(allay, 'dirt', player);
  assert.equal(allaySeeksItem(allay, 'dirt'), true);
  assert.equal(allaySeeksItem(allay, 'stone'), false);
  assert.equal(allaySeeksItem(allay, null), false);
  // With no item held, it seeks nothing.
  takeAllayItem(allay);
  assert.equal(allaySeeksItem(allay, 'dirt'), false);
});

test('the follow and seek radii match the wiki', () => {
  // Wiki: "follows the player from within a 64-block radius sphere and seeks items within a 32-block
  // radius sphere from the player."
  assert.equal(ALLAY_FOLLOW_RANGE, 64);
  assert.equal(ALLAY_SEEK_RANGE, 32);
  assert.equal(ALLAY_PICKUP_RANGE, 1.3, 'wiki: picks up within about 1.3 blocks of itself');
  assert.equal(ALLAY_DROP_RANGE, 3, 'wiki: drops up to 3 blocks from its player');
  assert.equal(ALLAY_DELIVER_DELAY, 3, 'wiki: a three-second delay after delivering');
  assert.equal(ALLAY_INVENTORY_SLOTS, 1, 'wiki: a single inventory slot');
  assert.equal(ALLAY_STACK_SIZE, 64);
});

test('it finds only its own item inside the seek radius', () => {
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  giveAllayItem(allay, 'dirt', player);
  assert.equal(findSeekableItem(manager, allay, player), null, 'nothing dropped yet');

  dropped(manager, 'stone', new THREE.Vector3(1, 2, 0));
  assert.equal(findSeekableItem(manager, allay, player), null, 'the wrong item is ignored');

  const dirt = dropped(manager, 'dirt', new THREE.Vector3(1, 2, 0));
  assert.equal(findSeekableItem(manager, allay, player), dirt, 'the right item is found');

  // Too far from the player is out of range.
  dirt.mesh.position.set(player.position.x + ALLAY_SEEK_RANGE + 5, 2, 0);
  assert.equal(findSeekableItem(manager, allay, player), null, 'beyond the 32-block sphere');
});

test('it fetches a dropped item and delivers it to the player', () => {
  const { manager, player, entities } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  giveAllayItem(allay, 'dirt', player);
  player.position.set(2, 2, 0);
  const dirt = dropped(manager, 'dirt', new THREE.Vector3(1, 2, 0), 3);

  const seen = new Set();
  let cooldownAtDelivery = null;
  for (let i = 0; i < 400; i++) {
    const outcome = updateAllayJob(manager, allay, 1 / 60, player);
    if (outcome) seen.add(outcome);
    if (outcome === 'delivered' && cooldownAtDelivery === null) cooldownAtDelivery = allay.seekCooldown;
  }
  assert.equal(seen.has('picked-up'), true, 'it picked the item up');
  assert.equal(dirt.pickedUp, true, 'the drop is marked taken');
  assert.equal(seen.has('delivered'), true, 'and it delivered');
  assert.equal(entities.delivered.length >= 1, true, 'something was dropped in the world');
  const delivery = entities.delivered[entities.delivered.length - 1];
  assert.equal(delivery.itemType, 'dirt', 'the same item');
  assert.equal(delivery.count, 3, 'the whole stack');
  assert.equal(allay.carriedCount, 0, 'and it is no longer carrying anything');
  // Wiki: a three-second delay after delivering. Asserted on the value the moment it delivered, because a
  // 400-frame run outlives the delay and would read back as zero.
  assert.equal(cooldownAtDelivery, ALLAY_DELIVER_DELAY, 'the three-second delay is set on delivery');
});

test('it does not pick items up when mobGriefing is false', () => {
  // Wiki: "Allays don't pick up any items if the game rule mobGriefing is false, but the player can still
  // give the allay items."
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.equal(allayCanPickUp(allay, { mobGriefing: true }), false, 'no item held yet');
  giveAllayItem(allay, 'dirt', player);
  assert.equal(allayCanPickUp(allay, { mobGriefing: true }), true);
  assert.equal(allayCanPickUp(allay, { mobGriefing: false }), false, 'the game rule blocks it');

  dropped(manager, 'dirt', new THREE.Vector3(1, 2, 0));
  manager.game.mobGriefing = false;
  assert.equal(findSeekableItem(manager, allay, player, { mobGriefing: false }), null);
  // But the item can still be given.
  assert.equal(giveAllayItem(allay, 'stone', player), true);
});

test('a note block within 16 blocks takes over the delivery target for 30 seconds', () => {
  // Wiki: "If the allay hears a note block play within 16 blocks of its location while delivering items, it
  // instead delivers its items to the note block. Then it spends 30 seconds around that particular note
  // block ... While an allay is focused on a note block, it responds only to sound from that note block."
  assert.deepEqual(ALLAY_NOTE_FOCUS, { hearRange: 16, focusSeconds: 30 });
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  giveAllayItem(allay, 'dirt', player);

  const near = { position: new THREE.Vector3(4, 2, 0) };
  const far = { position: new THREE.Vector3(40, 2, 0) };
  assert.equal(hearNoteBlock(allay, far), false, 'too far to hear');
  assert.equal(hearNoteBlock(allay, near), true);
  assert.equal(allay.noteFocus, near);
  assert.equal(allay.noteFocusTimer, ALLAY_NOTE_FOCUS.focusSeconds);
  assert.equal(allayDeliveryTarget(allay, player), near, 'it delivers to the note block now');

  // Another note block cannot steal the focus while the timer runs.
  const other = { position: new THREE.Vector3(2, 2, 0) };
  assert.equal(hearNoteBlock(allay, other), false, 'it responds only to the focused block');
  assert.equal(allay.noteFocus, near);
  // The same block re-heard resets the timer.
  allay.noteFocusTimer = 5;
  assert.equal(hearNoteBlock(allay, near), true);
  assert.equal(allay.noteFocusTimer, ALLAY_NOTE_FOCUS.focusSeconds, 'the timer is reset');

  // After 30 seconds it reverts to the player.
  for (let i = 0; i < 2000; i++) updateAllayJob(manager, allay, 1 / 60, player);
  assert.equal(allay.noteFocus, null, 'the focus lapsed');
  assert.equal(allayDeliveryTarget(allay, player), player);
});

test('it dances near a playing jukebox and stops when it ends', () => {
  // Wiki: "An allay performs a dance animation when there is a nearby jukebox playing. If the jukebox stops
  // playing or if the allay gets too far away from the jukebox, it stops dancing."
  assert.equal(ALLAY_DANCE_RANGE, 3);
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.equal(allayDances(manager, allay), false, 'no jukebox, no dancing');

  manager.jukeboxPlaying = { position: new THREE.Vector3(1, 2, 0) };
  assert.equal(allayDances(manager, allay), true, 'in range');
  assert.equal(updateAllayJob(manager, allay, 1 / 60, player), 'dancing');
  assert.equal(allay.isDancing, true);
  assert.equal(allay.velocity.length(), 0, 'it holds still while dancing');

  manager.jukeboxPlaying = { position: new THREE.Vector3(20, 2, 0) };
  assert.equal(allayDances(manager, allay), false, 'too far away');
  manager.jukeboxPlaying = null;
  assert.equal(allayDances(manager, allay), false, 'the music stopped');
});

test('duplication needs a dancing allay, an amethyst shard and a clear cooldown', () => {
  // Wiki: "If an allay is given an amethyst shard while it is dancing due to a nearby jukebox playing any
  // music disc, it splits into two allays ... After duplication, both allays have a five-minute cooldown."
  assert.deepEqual(ALLAY_DUPLICATION, { item: 'amethyst_shard', cooldownSeconds: 300 });
  const { manager } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);

  // The wrong item does nothing.
  assert.equal(duplicateAllay(manager, allay, 'dirt', { dancing: true }), null);
  // An amethyst shard to a NON-dancing allay does nothing, which is the wiki's condition.
  assert.equal(duplicateAllay(manager, allay, 'amethyst_shard', { dancing: false }), null);
  assert.equal(manager.mobs.length, 1, 'no twin yet');

  const twin = duplicateAllay(manager, allay, 'amethyst_shard', { dancing: true });
  assert.ok(twin, 'a second allay appeared');
  assert.equal(manager.mobs.length, 2);
  assert.equal(twin.type, 'allay');
  assert.equal(twin.duplicationCooldown, ALLAY_DUPLICATION.cooldownSeconds, 'the twin shares the cooldown');
  assert.equal(allay.duplicationCooldown, 300, 'and so does the original');

  // The cooldown blocks a second duplication.
  assert.equal(duplicateAllay(manager, allay, 'amethyst_shard', { dancing: true }), null);
  // After five minutes it may duplicate again.
  for (let i = 0; i < 310; i++) updateAllayJob(manager, allay, 1, null);
  assert.equal(allay.duplicationCooldown, 0);
  assert.ok(duplicateAllay(manager, allay, 'amethyst_shard', { dancing: true }), 'and it can again');
});

test('a duplicated allay is fresh, with no name or owner carried over', () => {
  // Wiki: the second allay "doesn't retain the original allay's attributes such as its custom name".
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  giveAllayItem(allay, 'dirt', player);
  allay.name = 'Bertie';
  const twin = duplicateAllay(manager, allay, 'amethyst_shard', { dancing: true });
  assert.equal(twin.name, 'Allay', 'the twin has the default name');
  assert.equal(twin.heldItem, null, 'and no item');
  assert.equal(twin.owner, null, 'and no owner');
});

test('it regenerates 2 HP a second and refuses its owner damage', () => {
  // Wiki: "Allays naturally regenerate 2 HP per second if damaged" and "Allays cannot be harmed by their
  // interacting owners."
  assert.equal(ALLAY_REGEN_PER_SECOND, 2);
  assert.equal(ALLAY_OWNER_IMMUNE, true);
  const { manager, player } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  allay.health = 10;
  assert.ok(Math.abs(updateAllayRegen(allay, 1) - 2) < 1e-9, 'two points in a second');
  assert.equal(allay.health, 12);
  // It never overheals.
  allay.health = allay.maxHealth;
  assert.equal(updateAllayRegen(allay, 10), 0);
  assert.equal(allay.health, allay.maxHealth);
  assert.equal(updateAllayRegen(manager.spawnMob('cow', 0, 1, 0), 1), 0, 'only allays');

  giveAllayItem(allay, 'dirt', player);
  assert.equal(allayRefusesDamage(allay, player), true, 'the owner cannot hurt it');
  assert.equal(allayRefusesDamage(allay, { type: 'zombie' }), false, 'anything else can');
  assert.equal(allayRefusesDamage(allay, null), false);
  assert.equal(allayRefusesDamage(manager.spawnMob('cow', 0, 1, 0), player), false);
});

test('it drops the item it is holding and gives no XP', () => {
  // Wiki: "Upon death, allays drop the item they are holding. Besides this, allays drop no other items or
  // experience."
  const { manager } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.deepEqual(allayDrops(allay), [], 'holding nothing drops nothing');
  giveAllayItem(allay, 'dirt', allay.owner);
  assert.deepEqual(allayDrops(allay), [['dirt', false, 1, 1]], 'the held item is dropped');
  allay.carriedCount = 5;
  const rows = allayDrops(allay);
  assert.equal(rows.length, 2, 'the carried stack is dropped too');
  assert.equal(rows[1][2], 5);

  allay.playerDamaged = true;
  assert.equal(allayXp(allay), 0, 'wiki: allays drop no experience at all');
  assert.equal(manager.getMobDeathDrops(allay, () => 0.5).length > 0, true,
    'and the drops flow through the manager');
  assert.deepEqual(allayDrops(manager.spawnMob('cow', 0, 1, 0)), []);
});

test('it flies through the real update loop without breaking it', () => {
  const { manager, player, entities } = fixture();
  player.position.set(4, 2, 0);
  const allay = manager.spawnMob('allay', 0, 2, 0);
  giveAllayItem(allay, 'dirt', player);
  dropped(manager, 'dirt', new THREE.Vector3(1, 2, 0), 2);
  const start = allay.mesh.position.clone();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(allay), 'still alive');
  assert.ok(allay.mesh.position.distanceTo(start) > 0.1, 'and it moved');
  assert.equal(entities.delivered.length > 0, true, 'it collected and delivered');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('the model has wings satisfying the shared flight contract', () => {
  // `moveFlyingMob` writes `mob.wings.left.rotation.z`, so the shape has to match or the allay freezes.
  const { manager } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  assert.ok(allay.wings.left && allay.wings.right, 'wings.left and wings.right exist');
  assert.ok(allay.wings.left.rotation && allay.wings.right.rotation, 'each has a rotation');
  assert.equal(allay.wings.length, 2);
  assert.ok(allay.body && allay.head && allay.trim, 'a body, head and trailing trim');
  assert.equal(allay.eyes.length, 2);
  assert.equal(allay.arms.length, 2, 'and arms to raise while holding');
  assert.ok(ALLAY_COLORS.body > 0);
  const model = createAllayModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()
  );
  assert.ok(model.group && model.head && model.trim);
  assert.ok(model.wings.left.rotation);
});

test('the dance and carry poses differ', () => {
  const { manager } = fixture();
  const allay = manager.spawnMob('allay', 0, 2, 0);
  allay.baseY = 2;
  poseAllay(allay, 0.5);
  const restingY = allay.mesh.position.y;
  allay.isDancing = true;
  poseAllay(allay, 0.5);
  assert.ok(Math.abs(allay.mesh.rotation.y) > 0, 'the dance spins');
  assert.ok(Math.abs(allay.mesh.rotation.y) > 0);
  // Carrying raises the arms.
  allay.isDancing = false;
  allay.heldItem = 'dirt';
  poseAllay(allay, 0);
  assert.ok(allay.arms.every(a => a.rotation.x < -1), 'the arms are raised while holding');
  allay.heldItem = null;
  poseAllay(allay, 0);
  assert.ok(allay.arms.every(a => a.rotation.x > -1), 'and relaxed otherwise');
  assert.doesNotThrow(() => poseAllay(null));
  assert.doesNotThrow(() => poseAllay({}));
});

test('the Inspector can spawn the allay and reports its job', () => {
  assert.ok(DEBUG_MOBS.includes('allay'), 'allay must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const allay = s.reset('allay');
  assert.equal(allay.type, 'allay', 'the Inspector spawns a real allay');
  const snap = s.snapshot();
  assert.equal(snap.health, 20, 'Inspector telemetry shows 20 HP');
  assert.equal(snap.maxHealth, 20);
  assert.equal(snap.allayHeld, null, 'holding nothing');
  assert.equal(snap.allayCarrying, 0);
  assert.equal(snap.allayDancing, false);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 20);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.allay_spawn_egg, 'the allay has a spawn egg');
  assert.equal(ITEMS.allay_spawn_egg.mob, 'allay');
  assert.equal(ITEMS.allay_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-allays and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isAllay(cow), false);
  assert.equal(allayHeldItem(cow), null);
  assert.equal(giveAllayItem(cow, 'dirt', player), false);
  assert.equal(takeAllayItem(cow), null);
  assert.equal(allaySeeksItem(cow, 'dirt'), false);
  assert.equal(allayCanPickUp(cow), false);
  assert.equal(allayDeliveryTarget(cow, player), null);
  assert.equal(hearNoteBlock(cow, { position: new THREE.Vector3() }), false);
  assert.equal(allayDances(manager, cow), false);
  assert.equal(duplicateAllay(manager, cow, 'amethyst_shard', { dancing: true }), null);
  assert.equal(findSeekableItem(manager, cow, player), null);
  assert.equal(updateAllayJob(manager, cow, 1 / 60, player), null);
  assert.equal(updateAllayRegen(cow, 1), 0);
  assert.equal(allayRefusesDamage(cow, player), false);
  assert.deepEqual(allayDrops(cow), []);
  assert.equal(allayXp(cow), 0);
  assert.doesNotThrow(() => poseAllay(null));
  assert.equal(manager.spawnMob('allay', 9, 2, 9).type, 'allay');
});
