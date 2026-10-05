// Happy Ghast parity with https://minecraft.wiki/w/Happy_Ghast
//
// The happy ghast is the passive counterpart of the ghast, and its differences from its hostile relative are
// almost all SOCIAL: it is passive, four players can ride it at once, it is bound to a home it roams around, and
// it can airlift leashed entities. Its young, the ghastling, grows up and follows things.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  HAPPY_GHAST_HEALTH, HAPPY_GHAST_DIMENSIONS, GHASTLING_DIMENSIONS, HAPPY_GHAST_SPEED,
  HAPPY_GHAST_RIDDEN_SPEED, HAPPY_GHAST_SEATS, HAPPY_GHAST_SEAT_ORDER, HAPPY_GHAST_ROAM,
  GHASTLING_GROWTH_SECONDS, GHASTLING_SNOWBALL_SPEEDUP, GHASTLING_BEDROCK_SNOWBALLS,
  GHASTLING_FOLLOW_RANGE, GHASTLING_FOLLOW_SPEED_BOOST, GHASTLING_STOP_DISTANCE, GHASTLING_FOLLOWABLE,
  GHASTLING_NEVER_FOLLOWS, HAPPY_GHAST_BULKY_CARGO, HAPPY_GHAST_STANDING_FACING, DRIED_GHAST_REHYDRATION,
  HAPPY_GHAST_COLORS, HAPPY_GHAST_REHOME_EVENTS,
  isHappyGhast, isGhastling, happyGhastDimensions, happyGhastRoamRadius, setHappyGhastHome, onHappyGhastEvent,
  clampToHome, equipHappyGhastHarness, removeHappyGhastHarness, mountHappyGhast, dismountHappyGhast,
  happyGhastSeatOf, happyGhastIsStationary, happyGhastStationaryFacing, attachHappyGhastCargo,
  releaseHappyGhastCargo, temptHappyGhast, endHappyGhastTemptation, feedGhastlingSnowball, updateGhastlingGrowth,
  ghastlingFollows, findGhastlingTarget, ghastlingShouldStop, happyGhastWanderTarget, steerHappyGhast,
  rehydrateDriedGhast, happyGhastDrops, happyGhastXp, createHappyGhastModel, poseHappyGhast
} from '../src/happyGhastBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { SNOW_GOLEM_NEVER_TARGETS } from '../src/snowGolemBehavior.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [], snowballs: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(0, 10, 500), velocity: new THREE.Vector3(), type: 'player',
    gamemode: 'survival', health: 20, keys: {}, onGround: false, statusEffects: {},
    rotation: new THREE.Euler(), mesh: { position: new THREE.Vector3(0, 10, 500) },
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities };
}

const rider = (id, keys = {}) => ({
  type: 'player', id, gamemode: 'survival', keys,
  position: new THREE.Vector3(0, 10, 0), rotation: new THREE.Euler(), mesh: { position: new THREE.Vector3(0, 10, 0) }
});

test('happy ghast is a native type, and the ghast is not one', () => {
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.equal(ghast.type, 'happy_ghast');
  assert.equal(ghast.name, 'Happy Ghast');
  assert.notEqual(ghast.type, 'villager');
  assert.equal(isHappyGhast(ghast), true);
  assert.equal(isHappyGhast('happy_ghast'), true);
  // Wiki: the happy ghast is the passive COUNTERPART of the ghast, so the two must not be confused.
  assert.equal(isHappyGhast(manager.spawnMob('ghast', 40, 10, 0)), false);
  assert.equal(isHappyGhast(null), false);
});

test('the health, hitbox and speed match the wiki', () => {
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.equal(HAPPY_GHAST_HEALTH, 20);
  assert.equal(ghast.maxHealth, 20, 'wiki: 20 HP');
  // Wiki: height and width both 4.0 blocks.
  assert.deepEqual(HAPPY_GHAST_DIMENSIONS, { width: 4.0, height: 4.0 });
  assert.deepEqual([ghast.width, ghast.height], [4.0, 4.0]);
  assert.deepEqual(manager.getMobDimensions('happy_ghast'), { width: 4.0, height: 4.0 });
  assert.equal(manager.getMobDimensions('happy_ghast').width, manager.getMobDimensions('ghast').width,
    'the same box as the ghast it is the counterpart of');
  assert.equal(HAPPY_GHAST_SPEED, 0.05);
  assert.equal(ghast.speed, 0.05);
  assert.equal(HAPPY_GHAST_RIDDEN_SPEED, 3.6, 'wiki: about 3.6 m/s when ridden');
  assert.equal(ghast.riddenSpeed, 3.6);
});

test('it is passive, flying, and not undead', () => {
  // Wiki: "behavior = Passive", "mobtype = Animal".
  const { manager, player } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.equal(ghast.isHostile, false);
  assert.equal(ghast.isPassive, true);
  assert.equal(ghast.isFlying, true);
  assert.equal(ghast.undead, false);
  assert.equal(ghast.burnsInDaylight, false);
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(ghast.isBurning, false);
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('a ghastling is 0.95 and an adult 4.0', () => {
  // Wiki: "Happy Ghast: Height and width: 4.0 blocks. Ghastling: Height and width: 0.95 blocks."
  assert.deepEqual(GHASTLING_DIMENSIONS, { width: 0.95, height: 0.95 });
  const { manager } = fixture();
  const baby = manager.spawnMob('happy_ghast', 0, 10, 0, { isBaby: true });
  assert.equal(baby.name, 'Ghastling', 'wiki: a baby happy ghast is called a ghastling');
  assert.equal(baby.isBaby, true);
  assert.deepEqual([baby.width, baby.height], [0.95, 0.95]);
  assert.equal(isGhastling(baby), true);
  assert.equal(isGhastling(manager.spawnMob('happy_ghast', 40, 10, 0)), false, 'an adult is not a ghastling');
  assert.deepEqual(happyGhastDimensions(baby), GHASTLING_DIMENSIONS);
  assert.deepEqual(happyGhastDimensions(manager.spawnMob('happy_ghast', 60, 10, 0)), HAPPY_GHAST_DIMENSIONS);
  assert.equal(HAPPY_GHAST_HEALTH, 20, 'the health is the same for both ages');
  assert.equal(baby.maxHealth, 20);
});

test('ghastlings do not drown, and adults do', () => {
  // Wiki: "Ghastlings, unlike adults, do not drown when submerged underwater."
  const { manager } = fixture();
  assert.equal(manager.spawnMob('happy_ghast', 0, 10, 0, { isBaby: true }).canBreatheUnderwater, true);
  assert.equal(manager.spawnMob('happy_ghast', 40, 10, 0).canBreatheUnderwater, false);
});

test('the roaming radius depends on the harness, and a ghastling is always 32', () => {
  // Wiki: "Unharnessed happy ghasts roam within a 64-block radius of their home, while harnessed happy ghasts
  // and ghastlings roam within a 32-block radius of their home."
  assert.deepEqual(HAPPY_GHAST_ROAM, { unharnessed: 64, harnessed: 32, ghastling: 32 });
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.equal(happyGhastRoamRadius(ghast), 64, 'unharnessed roams furthest');
  assert.equal(equipHappyGhastHarness(ghast, 'harness'), true);
  assert.equal(happyGhastRoamRadius(ghast), 32, 'harnessing halves it');
  // A ghastling is 32 either way, since the age check comes first.
  const baby = manager.spawnMob('happy_ghast', 40, 10, 0, { isBaby: true });
  assert.equal(happyGhastRoamRadius(baby), 32);
  assert.equal(equipHappyGhastHarness(baby, 'harness'), false, 'and it cannot be harnessed at all');
  assert.equal(happyGhastRoamRadius(baby), 32);
  assert.equal(happyGhastRoamRadius(manager.spawnCow(0, 1, 0)), 0);
});

test('it is clamped to its home radius', () => {
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.deepEqual(ghast.home, new THREE.Vector3(0, 10, 0), 'the home is where it spawns');
  // Inside the radius: unchanged.
  const near = new THREE.Vector3(10, 10, 0);
  assert.deepEqual(clampToHome(ghast, near), near);
  // Outside: pulled back to exactly the radius.
  const far = new THREE.Vector3(500, 10, 0);
  const clamped = clampToHome(ghast, far);
  assert.equal(Math.round(Math.hypot(clamped.x - ghast.home.x, clamped.z - ghast.home.z)), 64);
  // Harnessing tightens it.
  equipHappyGhastHarness(ghast, 'harness');
  const tighter = clampToHome(ghast, far);
  assert.equal(Math.round(Math.hypot(tighter.x - ghast.home.x, tighter.z - ghast.home.z)), 32);
  // And the wander target is always inside.
  for (let i = 0; i < 40; i++) {
    const target = happyGhastWanderTarget(ghast);
    assert.ok(Math.hypot(target.x - ghast.home.x, target.z - ghast.home.z) <= 32.01, 'inside the radius');
  }
});

test('the home is re-set by exactly the six named events', () => {
  // Wiki: the home "is initially set as the location where it spawns, and is updated to its current location
  // whenever any of the following events happen" -- then lists six.
  assert.equal(HAPPY_GHAST_REHOME_EVENTS.length, 6);
  for (const event of ['harness_equipped', 'harness_removed', 'lead_detached', 'dismounted', 'temptation_ended']) {
    assert.ok(HAPPY_GHAST_REHOME_EVENTS.includes(event), `${event} re-homes it`);
  }
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  ghast.mesh.position.set(50, 10, 50);
  assert.equal(onHappyGhastEvent(ghast, 'dismounted'), true);
  assert.deepEqual(ghast.home, new THREE.Vector3(50, 10, 50), 'the home followed it');
  assert.equal(onHappyGhastEvent(ghast, 'sneezed'), false, 'an unlisted event does not');
  assert.equal(onHappyGhastEvent(manager.spawnCow(0, 1, 0), 'dismounted'), false);
});

test('the harness gates riding, and shears take it off', () => {
  // Wiki: "Only adult happy ghasts can be equipped with a harness and ridden", and "The harness can be taken
  // off using shears to retrieve the item."
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  const someone = rider('a');
  // Wiki: unharnessed cannot be ridden.
  assert.equal(mountHappyGhast(ghast, someone), null);
  assert.equal(equipHappyGhastHarness(ghast, 'harness'), true);
  assert.equal(ghast.hasHarness, true);
  assert.equal(equipHappyGhastHarness(ghast, 'harness'), false, 'already harnessed');
  assert.equal(equipHappyGhastHarness(ghast, 'saddle'), false, 'only a harness');
  assert.equal(mountHappyGhast(ghast, someone), 'front', 'now it can be ridden');
  assert.equal(removeHappyGhastHarness(ghast, 'shears'), true);
  assert.equal(ghast.hasHarness, false);
  assert.equal(removeHappyGhastHarness(ghast, 'shears'), false, 'already off');
  assert.equal(removeHappyGhastHarness(ghast, 'axe'), false, 'only shears');
  assert.equal(removeHappyGhastHarness(manager.spawnCow(0, 1, 0), 'shears'), false);
});

test('up to four riders, the first is the pilot, and seats compact counter-clockwise', () => {
  // Wiki: "Up to four players can ride a happy ghast. The first player who mounts ... controls it, sitting in
  // the front just above its face. Players who mount after the piloting player sit in a spot on the remaining
  // sides, starting clockwise from the first player. When one of the players dismounts, the next players are
  // rotated counter-clockwise, filling in the empty seat."
  assert.equal(HAPPY_GHAST_SEATS, 4);
  assert.deepEqual(HAPPY_GHAST_SEAT_ORDER, ['front', 'left', 'back', 'right']);
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0, { hasHarness: true });
  const riders = [rider('a'), rider('b'), rider('c'), rider('d'), rider('e')];
  assert.deepEqual(riders.slice(0, 4).map(r => mountHappyGhast(ghast, r)),
    ['front', 'left', 'back', 'right']);
  assert.equal(mountHappyGhast(ghast, riders[4]), null, 'a fifth is refused');
  assert.equal(ghast.riders.length, 4);
  assert.equal(ghast.pilot, riders[0], 'the first to mount controls it');
  assert.equal(mountHappyGhast(ghast, riders[0]), null, 'and cannot mount twice');
  assert.equal(happyGhastSeatOf(ghast, riders[1]), 'left');
  // Dismounting the pilot compacts the ring counter-clockwise.
  assert.equal(dismountHappyGhast(ghast, riders[0]), true);
  assert.equal(ghast.riders.length, 3);
  assert.equal(ghast.pilot, riders[1], 'the next rider becomes the pilot');
  assert.equal(happyGhastSeatOf(ghast, riders[1]), 'front', 'and moves to the front seat');
  assert.equal(happyGhastSeatOf(ghast, riders[2]), 'left');
  assert.equal(happyGhastSeatOf(ghast, riders[3]), 'back');
  assert.equal(dismountHappyGhast(ghast, rider('nobody')), false);
  assert.equal(dismountHappyGhast(manager.spawnCow(0, 1, 0), riders[1]), false);
});

test('standing on it makes it stationary and cardinal-aligned', () => {
  // Wiki: "While players are standing on it, the happy ghast becomes stationary and aligns to one of the
  // cardinal directions", and "Reloading the chunks causes the happy ghast to realign and face south."
  assert.equal(HAPPY_GHAST_STANDING_FACING, 0, 'south is yaw 0 in this codebase');
  assert.equal(happyGhastStationaryFacing(), 0);
  const { manager, player } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.equal(happyGhastIsStationary(ghast, { standers: 0 }), false);
  assert.equal(happyGhastIsStationary(ghast, { standers: 1 }), true);
  assert.equal(happyGhastIsStationary(manager.spawnCow(0, 1, 0), { standers: 1 }), false);
  // Drive it: put a player on top and check that it stops.
  ghast.mesh.position.set(0, 10, 0);
  player.position.set(0, 10 + ghast.height, 0);
  const before = ghast.mesh.position.clone();
  for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  assert.equal(ghast.mesh.position.distanceTo(before), 0, 'it is stationary with a player on top');
  assert.equal(ghast.mesh.rotation.y, HAPPY_GHAST_STANDING_FACING, 'and cardinal-aligned');
  // Move the player off: it becomes mobile again.
  player.position.set(0, 10, 500);
  for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  assert.notEqual(ghast.state, 'stood-on', 'and mobile once they step off');
});

test('a ridden one flies where the pilot looks, with no gravity', () => {
  // Wiki: "pressing forward moves the happy ghast in the direction the player is looking. Pressing jump moves
  // the happy ghast straight upward. There is no dedicated control to move downward."
  const { manager, player } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0, { hasHarness: true });
  const pilot = rider('p', { forward: true });
  mountHappyGhast(ghast, pilot);
  const start = ghast.mesh.position.clone();
  for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  assert.equal(ghast.state, 'ridden');
  assert.ok(ghast.mesh.position.distanceTo(start) > 1, `it flew, moved ${ghast.mesh.position.distanceTo(start)}`);
  assert.ok(ghast.velocity.y > -1e-6, 'it did not fall, because a ridden one has no gravity');
  // Jump moves it straight up.
  const airborne = ghast.mesh.position.y;
  pilot.keys = { jump: true };
  for (let i = 0; i < 30; i++) manager.update(1 / 60, player);
  assert.ok(ghast.mesh.position.y > airborne, 'jump lifted it');
});

test('the ghastling growth is 20 minutes, sped up 10% per snowball', () => {
  // Wiki: "ghastlings require 20 minutes to grow up ... each snowball fed to a ghastling reduces its remaining
  // growth time by 10%".
  assert.equal(GHASTLING_GROWTH_SECONDS, 1200);
  assert.equal(GHASTLING_SNOWBALL_SPEEDUP, 0.1);
  assert.equal(GHASTLING_BEDROCK_SNOWBALLS, 10, 'the Bedrock figure, recorded for contrast');
  const { manager } = fixture();
  const baby = manager.spawnMob('happy_ghast', 0, 10, 0, { isBaby: true });
  assert.equal(baby.growthRemaining, GHASTLING_GROWTH_SECONDS);
  assert.equal(feedGhastlingSnowball(baby, 'snowball'), 1080, 'one snowball removes exactly 10%');
  assert.equal(baby.snowballsFed, 1);
  assert.equal(feedGhastlingSnowball(baby, 'apple'), null, 'only a snowball');
  assert.equal(feedGhastlingSnowball(manager.spawnMob('happy_ghast', 40, 10, 0), 'snowball'), null,
    'an adult cannot be fed');
  // Growing up changes the name AND the hitbox together.
  assert.equal(updateGhastlingGrowth(baby, 100), null, 'not yet');
  assert.equal(updateGhastlingGrowth(baby, 2000), 'grown');
  assert.equal(baby.isBaby, false);
  assert.equal(baby.name, 'Happy Ghast', 'the name changes with the age');
  assert.deepEqual([baby.width, baby.height], [4.0, 4.0], 'and the hitbox grows 0.95 -> 4.0');
  assert.equal(updateGhastlingGrowth(baby, 100), null, 'and growing up only happens once');
});

test('a ghastling follows players first, then the listed mobs, never babies', () => {
  // Wiki: "Ghastlings occasionally follow nearby players or specific mobs within a range of 16 blocks. ...
  // They prioritize players but can also follow the mobs listed below, provided they are not babies."
  assert.equal(GHASTLING_FOLLOW_RANGE, 16);
  assert.equal(GHASTLING_FOLLOW_SPEED_BOOST, 1.1);
  assert.equal(GHASTLING_STOP_DISTANCE, 5);
  // A player is always eligible.
  assert.equal(ghastlingFollows({ type: 'player' }), true);
  // A listed mob is eligible, a baby of it is not.
  assert.equal(ghastlingFollows({ type: 'cow' }), true);
  assert.equal(ghastlingFollows({ type: 'cow', isBaby: true }), false, 'provided they are not babies');
  // Never follows the excluded sets.
  for (const type of ['bat', 'allay', 'mooshroom', 'wandering_trader', 'trader_llama', 'iron_golem',
    'snow_golem', 'copper_golem', 'zombie', 'creeper', 'witch']) {
    assert.equal(ghastlingFollows({ type }), false, `${type} must never be followed`);
  }
  // Wiki: skeleton horses ARE followed, despite being undead -- the wiki flags this as an inconsistency.
  assert.equal(ghastlingFollows({ type: 'skeleton_horse' }), true);
  assert.equal(ghastlingFollows(null), false);
  assert.equal(ghastlingFollows({}), false);
  // The two lists must not overlap, or an entry would be both allowed and forbidden.
  const both = GHASTLING_FOLLOWABLE.filter(t => GHASTLING_NEVER_FOLLOWS.includes(t));
  assert.deepEqual(both, [], 'no type is on both lists');
});

test('the follow target prefers a player over a nearer mob', () => {
  const { manager, player } = fixture();
  const baby = manager.spawnMob('happy_ghast', 0, 10, 0, { isBaby: true });
  const cow = manager.spawnMob('cow', 3, 10, 0);
  // The cow is much nearer, but the player wins.
  player.position.set(12, 10, 0);
  player.mesh.position.set(12, 10, 0);
  assert.equal(findGhastlingTarget(baby, [player, cow]), player, 'players are prioritized');
  // With the player out of range, the mob is chosen.
  player.position.set(500, 10, 0);
  assert.equal(findGhastlingTarget(baby, [player, cow]), cow);
  // With nothing in range, nothing.
  assert.equal(findGhastlingTarget(baby, [manager.spawnMob('cow', 500, 10, 0)]), null);
  assert.equal(findGhastlingTarget(manager.spawnMob('happy_ghast', 40, 10, 0), [cow]), null,
    'only a ghastling follows');
  // It stops within 5 blocks.
  assert.equal(ghastlingShouldStop(baby, { mesh: { position: new THREE.Vector3(4, 10, 0) } }), true);
  assert.equal(ghastlingShouldStop(baby, { mesh: { position: new THREE.Vector3(6, 10, 0) } }), false);
  assert.equal(ghastlingShouldStop(baby, null), true);
});

test('a ghastling actually follows through the real update loop', () => {
  const { manager, player } = fixture();
  const baby = manager.spawnMob('happy_ghast', 0, 10, 0, { isBaby: true });
  const cow = manager.spawnMob('cow', 14, 10, 0);
  manager.update(1 / 60, player);
  assert.equal(baby.target, cow, 'it picked the cow');
  const start = baby.mesh.position.clone();
  for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  assert.equal(baby.state, 'following');
  assert.ok(baby.mesh.position.distanceTo(start) > 1, 'it moved toward the cow');
  assert.ok(baby.mesh.position.distanceTo(cow.mesh.position) < 14, 'and closed the distance');
});

test('it can airlift cargo, with four leads for the bulky things', () => {
  // Wiki: "The player can attach a leashed boat, boat with chest, or specific leash-able mobs too large to fit
  // in boats (horses, donkeys, mules, skeleton horses, zombie horses, camels, camel husks, and sniffers) ...
  // Any other leashable entity not listed above can also be leashed ... but they do not gain the 4-lead design".
  assert.deepEqual(HAPPY_GHAST_BULKY_CARGO,
    ['boat', 'chest_boat', 'horse', 'donkey', 'mule', 'skeleton_horse', 'zombie_horse', 'camel', 'camel_husk', 'sniffer']);
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  for (const type of HAPPY_GHAST_BULKY_CARGO) {
    assert.equal(attachHappyGhastCargo(ghast, { type }).leads, 4, `${type} gets four leads`);
  }
  assert.equal(attachHappyGhastCargo(ghast, { type: 'villager' }).leads, 1, 'anything else gets one');
  // Wiki: "Multiple entities can be attached this way at once, with there being no limit to how many."
  for (let i = 0; i < 20; i++) attachHappyGhastCargo(ghast, { type: 'pig' });
  assert.equal(ghast.cargo.length, 31, 'no limit');
  // Wiki: "Using shears on the happy ghast while carrying multiple entities cuts all leads simultaneously."
  const all = releaseHappyGhastCargo(ghast, 'shears');
  assert.equal(all.length, 31, 'shears cut them all at once');
  assert.equal(ghast.cargo.length, 0);
  assert.deepEqual(releaseHappyGhastCargo(ghast, 'shears'), [], 'nothing left to cut');
  assert.deepEqual(releaseHappyGhastCargo(ghast, 'hand'), [], 'only shears');
  assert.equal(attachHappyGhastCargo(null, { type: 'pig' }), null);
});

test('a dried ghast rehydrated in water produces a GHASTLING', () => {
  // Wiki: a happy ghast spawns "when a dried ghast is rehydrated in water (as ghastling)".
  assert.deepEqual(DRIED_GHAST_REHYDRATION, { requiresWater: true, producesGhastling: true });
  assert.deepEqual(rehydrateDriedGhast('dried_ghast', { inWater: true }),
    { type: 'happy_ghast', isBaby: true }, 'always a baby');
  assert.equal(rehydrateDriedGhast('dried_ghast', { inWater: false }), null, 'water is required');
  assert.equal(rehydrateDriedGhast('dried_ghast'), null);
  assert.equal(rehydrateDriedGhast('stone', { inWater: true }), null);
  assert.equal(rehydrateDriedGhast(null, { inWater: true }), null);
});

test('it drops nothing, which the wiki page states by omission', () => {
  // Wiki: the happy ghast's page has NO "On death" section, and its infobox lists only USABLE items (snowball,
  // golden dandelion, harness, shears, name tag, lead). So the empty table is deliberate.
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  ghast.playerDamaged = true;
  assert.deepEqual(happyGhastDrops(ghast), []);
  assert.deepEqual(manager.getMobDeathDrops(ghast, () => 0.01), [], 'nothing through the manager either');
  assert.equal(happyGhastXp(ghast), 0);
  assert.deepEqual(happyGhastDrops(manager.spawnCow(0, 1, 0)), []);
});

test('temptation has an end, and the end re-homes it', () => {
  // Wiki: "no longer being tempted by a player with a snowball or a harness" is one of the re-homing events, so
  // the END matters as much as the start.
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.equal(temptHappyGhast(ghast, 'snowball'), true);
  assert.equal(temptHappyGhast(ghast, 'harness'), true);
  assert.equal(temptHappyGhast(ghast, 'apple'), false);
  ghast.tempted = true;
  ghast.mesh.position.set(70, 10, 0);
  assert.equal(endHappyGhastTemptation(ghast), true);
  assert.equal(ghast.tempted, false);
  assert.deepEqual(ghast.home, new THREE.Vector3(70, 10, 0), 'the home followed it');
  assert.equal(endHappyGhastTemptation(ghast), false, 'not tempted any more');
  assert.equal(endHappyGhastTemptation(manager.spawnCow(0, 1, 0)), false);
});

test('it roams, and stays inside its home radius, through the real loop', () => {
  const { manager, player } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  const start = ghast.mesh.position.clone();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) {
      manager.update(1 / 60, player);
      const offset = Math.hypot(ghast.mesh.position.x - ghast.home.x, ghast.mesh.position.z - ghast.home.z);
      assert.ok(offset <= 64.5, `stayed inside the 64-block home radius, got ${offset}`);
    }
  });
  assert.ok(ghast.mesh.position.distanceTo(start) > 0.25,
    `it roamed rather than hanging still, moved ${ghast.mesh.position.distanceTo(start)}`);
  assert.deepEqual([...(manager.mobErrors || [])], []);
  // The steer helper stops it when it arrives, so it does not jitter.
  const arrived = ghast.mesh.position.clone();
  steerHappyGhast(ghast, arrived.clone(), 1 / 60);
  assert.deepEqual([ghast.velocity.x, ghast.velocity.y, ghast.velocity.z], [0, 0, 0]);
  assert.equal(steerHappyGhast(ghast, null, 1 / 60), null);
  assert.equal(steerHappyGhast(manager.spawnCow(0, 1, 0), new THREE.Vector3(), 1 / 60), null);
});

test('the snow golem leaves it alone, as its own list already declared', () => {
  // The snow golem's never-target list already contained happy_ghast before this mob existed, so the two now
  // agree by data rather than by omission.
  assert.ok(SNOW_GOLEM_NEVER_TARGETS.includes('happy_ghast'));
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.equal(ghast.isHostile, false, 'it is passive, so nothing should target it');
});

test('the model is a pale big-bodied jellyfish with nine tentacles', () => {
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0);
  assert.ok(ghast.body && ghast.face, 'a body and a face');
  assert.equal(ghast.eyes.length, 2);
  assert.equal(ghast.tentacles.length, 9, 'the ghast silhouette has nine tentacles');
  assert.ok(ghast.harness && ghast.goggles, 'a harness overlay and goggles');
  assert.equal(ghast.harness.visible, false, 'hidden until harnessed');
  assert.ok(HAPPY_GHAST_COLORS.skin > 0);
  const model = createHappyGhastModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial(), new THREE.MeshLambertMaterial());
  assert.ok(model.tentacles.length === 9 && model.harness.visible === false);
});

test('the goggles lower while ridden', () => {
  // Wiki: "While the happy ghast is being ridden, its goggles lower to cover its eyes."
  const { manager } = fixture();
  const ghast = manager.spawnMob('happy_ghast', 0, 10, 0, { hasHarness: true });
  poseHappyGhast(ghast, 0.5);
  assert.equal(ghast.harness.visible, true, 'the harness shows once equipped');
  const raised = ghast.goggles.position.y;
  mountHappyGhast(ghast, rider('p'));
  poseHappyGhast(ghast, 0.5);
  assert.ok(ghast.goggles.position.y < raised, 'the goggles lowered when mounted');
  // The tentacles drift, so it does not look frozen.
  const before = ghast.tentacles[0].rotation.x;
  poseHappyGhast(ghast, 2.7);
  assert.notEqual(ghast.tentacles[0].rotation.x, before);
  assert.doesNotThrow(() => poseHappyGhast(null));
  assert.doesNotThrow(() => poseHappyGhast({}));
});

test('the Inspector can spawn it, adult and ghastling', () => {
  assert.ok(DEBUG_MOBS.includes('happy_ghast'), 'happy_ghast must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const ghast = s.reset('happy_ghast');
  assert.equal(ghast.type, 'happy_ghast');
  assert.equal(s.snapshot().maxHealth, 20, 'Inspector telemetry shows 20 HP');
  // The hostile ghast is still a different mob.
  assert.equal(s.reset('ghast').type, 'ghast');
});

test('the spawn egg and the items it uses are registered', () => {
  assert.ok(ITEMS.happy_ghast_spawn_egg, 'the happy ghast has a spawn egg');
  assert.equal(ITEMS.happy_ghast_spawn_egg.mob, 'happy_ghast');
  assert.equal(ITEMS.happy_ghast_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.harness, 'the harness exists, since it gates riding');
  assert.ok(ITEMS.snowball, 'snowballs exist, to tempt and to feed a ghastling');
  assert.ok(ITEMS.shears, 'shears exist, to remove the harness and cut leads');
  assert.ok(ITEMS.lead, 'and a lead, for the cargo');
});

test('the helpers are safe on non-happy-ghasts and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isHappyGhast(cow), false);
  assert.equal(isGhastling(cow), false);
  assert.equal(happyGhastRoamRadius(cow), 0);
  assert.equal(setHappyGhastHome(cow), false);
  assert.equal(setHappyGhastHome(manager.spawnMob('happy_ghast', 0, 10, 0), null), false);
  assert.equal(onHappyGhastEvent(cow, 'dismounted'), false);
  assert.equal(clampToHome(cow, new THREE.Vector3(1, 1, 1)).x, 1, 'returned unchanged');
  assert.equal(clampToHome(null, null), null);
  assert.equal(equipHappyGhastHarness(cow, 'harness'), false);
  assert.equal(removeHappyGhastHarness(cow, 'shears'), false);
  assert.equal(mountHappyGhast(cow, rider('x')), null);
  assert.equal(dismountHappyGhast(cow, rider('x')), false);
  assert.equal(happyGhastSeatOf(cow, rider('x')), null);
  assert.equal(happyGhastIsStationary(cow, { standers: 1 }), false);
  assert.equal(attachHappyGhastCargo(cow, { type: 'pig' }), null);
  assert.deepEqual(releaseHappyGhastCargo(cow, 'shears'), []);
  assert.equal(temptHappyGhast(cow, 'snowball'), false);
  assert.equal(feedGhastlingSnowball(cow, 'snowball'), null);
  assert.equal(updateGhastlingGrowth(cow, 1e9), null);
  assert.equal(ghastlingFollows(undefined), false);
  assert.equal(findGhastlingTarget(cow, []), null);
  assert.equal(ghastlingShouldStop(cow, {}), true);
  assert.equal(happyGhastWanderTarget(cow), null);
  assert.deepEqual(happyGhastDrops(cow), []);
  assert.equal(happyGhastXp(cow), 0);
  assert.equal(manager.spawnMob('happy_ghast', 9, 10, 9).type, 'happy_ghast');
});
