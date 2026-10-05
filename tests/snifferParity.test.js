// Sniffer parity with https://minecraft.wiki/w/Sniffer
//
// A new passive mob whose entire purpose is one mechanic: it scents the ground, sploots, and digs up a
// torchflower seed or a pitcher pod. Almost every rule is a CONDITION on when digging is allowed, so the
// suite is mostly about those conditions.
//
// `checkMobCollision` is provided by the fixture so the shared mover keeps the sniffer on the floor: the
// shared mover settles a mob only through the collision path, and without it every mob falls forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { AnimalBehaviors, BREEDING_FOODS } from '../src/animalBehaviors.js';
import {
  SNIFFER_HEALTH, SNIFFER_DIMENSIONS, SNIFFLET_DIMENSIONS, SNIFFLET_SCALE, SNIFFER_SPEED,
  SNIFFER_HEAD_OFFSET, SNIFFER_DIG_MEMORY, SNIFFER_SEARCH_COOLDOWN, SNIFFER_DIG, SNIFFER_DIG_DROPS,
  SNIFFER_DIGGABLE_NAMES, SNIFFER_BREEDING_FOOD, SNIFFLET_GROWTH_SECONDS, SNIFFLET_FEED_ACCELERATION,
  SNIFFER_EGG_HATCH, SNIFFER_BREEDING, SNIFFER_COLORS,
  diggableBlockIds, isSniffer, isSnifflet, snifferDimensions, snifferHeadPosition, isDiggableBlock,
  snifferDigRefusal, wasDugRecently, rememberDig, findDiggableSpot, updateSnifferDig,
  isSnifferBreedingFood, updateSniffletGrowth, accelerateSniffletGrowth, snifferEggHatchSeconds,
  snifferDrops, snifferXp, snifferBreedingXp, createSnifferModel, poseSniffer
} from '../src/snifferBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal', digBlock = BLOCKS.GRASS_BLOCK } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    // A flat world: `digBlock` below y=1, air above.
    getVoxel: (x, y, z) => (y < 1 ? digBlock : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, isBlock, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS,
    // Floor collision, so the shared mover holds mobs up.
    isBlockSolid: (x, y, z) => world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z)) === digBlock,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(60, 1, 60), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {}, effects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  return { manager, player, entities, world };
}

test('sniffer is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  assert.equal(sniffer.type, 'sniffer');
  assert.equal(sniffer.name, 'Sniffer');
  assert.notEqual(sniffer.type, 'villager');
});

test('the health and hitboxes match the wiki', () => {
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  assert.equal(SNIFFER_HEALTH, 14);
  assert.equal(sniffer.maxHealth, 14, 'wiki: 14 HP');
  assert.deepEqual(SNIFFER_DIMENSIONS, { width: 1.9, height: 1.75 });
  assert.deepEqual(SNIFFLET_DIMENSIONS, { width: 0.95, height: 0.875 });
  assert.equal(SNIFFER_SPEED, 0.1);
  assert.deepEqual([sniffer.width, sniffer.height], [1.9, 1.75]);
  assert.deepEqual(manager.getMobDimensions('sniffer'), { width: 1.9, height: 1.75 });
  const snifflet = manager.spawnSniffer(5, 1, 0, { isBaby: true });
  assert.deepEqual([snifflet.width, snifflet.height], [0.95, 0.875]);
  assert.equal(snifflet.mesh.scale.x, SNIFFLET_SCALE);
});

test('the snout sits 2.25 blocks in front of the body', () => {
  // Wiki: "The head location is defined as 2.25 blocks in front of the center of the body."
  assert.equal(SNIFFER_HEAD_OFFSET, 2.25);
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  sniffer.yaw = 0; // Facing +z.
  const forward = snifferHeadPosition(sniffer);
  assert.ok(Math.abs(forward.z - 2.25) < 1e-9, `expected z 2.25, got ${forward.z}`);
  assert.ok(Math.abs(forward.x) < 1e-9);
  sniffer.yaw = Math.PI / 2; // Facing +x.
  const sideways = snifferHeadPosition(sniffer);
  assert.ok(Math.abs(sideways.x - 2.25) < 1e-9, `expected x 2.25, got ${sideways.x}`);
});

test('the diggable block list matches the wiki exactly', () => {
  // Wiki's list, and mycelium is deliberately absent because "Sniffers cannot dig on mycelium".
  assert.deepEqual(SNIFFER_DIGGABLE_NAMES, [
    'coarse_dirt', 'dirt', 'grass_block', 'moss_block', 'mud',
    'muddy_mangrove_roots', 'pale_moss_block', 'rooted_dirt', 'podzol'
  ]);
  assert.equal(SNIFFER_DIGGABLE_NAMES.includes('mycelium'), false);
  // Every named block resolves to a real id, so a rename cannot silently break digging.
  const ids = diggableBlockIds(BLOCKS);
  assert.equal(ids.size, SNIFFER_DIGGABLE_NAMES.length,
    'every name must resolve; a missing one means a renamed block id');
  for (const name of SNIFFER_DIGGABLE_NAMES) {
    assert.equal(isDiggableBlock(BLOCKS[name.toUpperCase()], BLOCKS), true, `${name} is diggable`);
  }
  for (const notDiggable of ['MYCELIUM', 'STONE', 'SAND', 'GRAVEL', 'AIR']) {
    assert.equal(isDiggableBlock(BLOCKS[notDiggable], BLOCKS), false, `${notDiggable} is not diggable`);
  }
});

test('each refusal condition matches the wiki', () => {
  // Wiki: "A sniffer can only dig if it is on the ground. A sniffer cannot dig when it is leashed, in
  // water, tempted with a torchflower seed, panicking, or in a boat or minecart."
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  assert.equal(snifferDigRefusal(sniffer), null, 'on the ground with nothing wrong is allowed');
  assert.match(snifferDigRefusal(sniffer, { onGround: false }), /ground/);
  assert.match(snifferDigRefusal(sniffer, { leashed: true }), /leashed/);
  assert.match(snifferDigRefusal(sniffer, { inWater: true }), /water/);
  assert.match(snifferDigRefusal(sniffer, { tempted: true }), /tempted/);
  assert.match(snifferDigRefusal(sniffer, { panicking: true }), /panicking/);
  assert.match(snifferDigRefusal(sniffer, { inVehicle: true }), /boat or minecart/);
  assert.match(snifferDigRefusal(sniffer, { headBlockId: BLOCKS.STONE, blocks: BLOCKS }), /not diggable/);
  assert.match(snifferDigRefusal(sniffer, { groundBlockId: BLOCKS.MYCELIUM, blocks: BLOCKS }), /not diggable/);
  // A snifflet is refused outright.
  const snifflet = manager.spawnSniffer(0, 1, 0, { isBaby: true });
  assert.match(snifferDigRefusal(snifflet), /snifflet/);
  assert.equal(snifferDigRefusal(manager.spawnCow(0, 1, 0)), 'not a sniffer');
});

test('it remembers the last 20 digging locations', () => {
  // Wiki: "The sniffer also stores its prior 20 digging locations to prevent subsequent digging at those
  // locations." A 21st dig must therefore forget the first, or a sniffer in a small pen deadlocks.
  assert.equal(SNIFFER_DIG_MEMORY, 20);
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  for (let i = 0; i < 21; i++) rememberDig(sniffer, new THREE.Vector3(i, 0, 0));
  assert.equal(sniffer.dugLocations.length, 20, 'capped at 20');
  assert.equal(wasDugRecently(sniffer, new THREE.Vector3(0, 0, 0)), false, 'the oldest was forgotten');
  assert.equal(wasDugRecently(sniffer, new THREE.Vector3(20, 0, 0)), true, 'the newest is remembered');
  assert.equal(wasDugRecently(sniffer, new THREE.Vector3(20.2, 0, 0)), true, 'within half a block');
  assert.equal(wasDugRecently(sniffer, new THREE.Vector3(20.9, 0, 0)), false, 'beyond it');
  assert.equal(wasDugRecently(manager.spawnCow(0, 1, 0), new THREE.Vector3()), false);
  assert.deepEqual(rememberDig(manager.spawnCow(0, 1, 0), new THREE.Vector3()), []);
});

test('it finds a diggable spot and refuses a non-diggable one', () => {
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  const spot = findDiggableSpot(manager, sniffer);
  assert.ok(spot, 'it found somewhere to dig on grass');
  // A stone floor has nowhere.
  const { manager: stoneManager } = fixture({ digBlock: BLOCKS.STONE });
  const onStone = stoneManager.spawnMob('sniffer', 0, 1, 0);
  assert.equal(findDiggableSpot(stoneManager, onStone), null, 'stone is not diggable');
  // Mycelium is not diggable either, which the wiki calls out specifically.
  const { manager: myceliumManager } = fixture({ digBlock: BLOCKS.MYCELIUM });
  assert.equal(findDiggableSpot(myceliumManager, myceliumManager.spawnMob('sniffer', 0, 1, 0)), null,
    'wiki: sniffers cannot dig on mycelium');
  // A snifflet cannot dig at all.
  assert.equal(findDiggableSpot(manager, manager.spawnSniffer(5, 1, 0, { isBaby: true })), null);
});

test('the dig cycle scents, searches, sploots and drops a seed', () => {
  const { manager, entities } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  sniffer.digCooldown = 0;
  // Scenting first, which is the visible tell.
  assert.equal(updateSnifferDig(manager, sniffer, 0.016, { onGround: true }), 'scenting');
  assert.equal(sniffer.digState, 'scenting');
  // Then a search, then the sploot. The search moves by setting a velocity, which the shared mover
  // applies -- so the sniffer is placed at its chosen spot to reach the sploot deterministically rather
  // than relying on the mover.
  let sawSearching = false;
  let sawSplooting = false;
  let dug = false;
  for (let i = 0; i < 600 && !dug; i++) {
    const outcome = updateSnifferDig(manager, sniffer, 0.05, {
      onGround: true, headBlockId: BLOCKS.GRASS_BLOCK, groundBlockId: BLOCKS.GRASS_BLOCK
    });
    if (outcome === 'searching') {
      sawSearching = true;
      // Arrive at the chosen spot, which is what the mover would do over the next few frames.
      if (sniffer.digTarget) {
        sniffer.mesh.position.x = sniffer.digTarget.x;
        sniffer.mesh.position.z = sniffer.digTarget.z;
      }
    }
    if (sniffer.digState === 'splooting') sawSplooting = true;
    if (outcome === 'dug') dug = true;
  }
  assert.equal(sawSearching, true, 'it searched for a spot');
  assert.equal(sawSplooting, true, 'it splooted');
  assert.equal(dug, true, 'and dug');
  assert.equal(entities.droppedItems.length, 1, 'one item dropped');
  assert.ok(SNIFFER_DIG_DROPS.includes(entities.droppedItems[0].itemType), 'a seed or a pod');
  assert.equal(entities.droppedItems[0].isBlock, false, 'as an item');
  assert.equal(entities.droppedItems[0].count, 1);
  assert.equal(sniffer.dugLocations.length, 1, 'and the location was remembered');
  // Wiki: "After sniffing out seeds, an eight-minute cooldown is activated before it can search again."
  assert.equal(sniffer.digCooldown, SNIFFER_SEARCH_COOLDOWN);
  assert.equal(SNIFFER_SEARCH_COOLDOWN, 480, 'eight minutes');
});

test('the two dig results are equally likely', () => {
  // Wiki: "an equal chance of digging up either one".
  assert.deepEqual(SNIFFER_DIG_DROPS, ['torchflower_seeds', 'pitcher_pod']);
  const { manager, entities } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  const seen = new Set();
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let run = 0; run < 200; run++) {
    sniffer.digState = 'splooting';
    sniffer.digTimer = 0;
    sniffer.digTarget = new THREE.Vector3(run, 0, 0);
    updateSnifferDig(manager, sniffer, 0.016, { onGround: true, random });
    seen.add(entities.droppedItems[entities.droppedItems.length - 1].itemType);
  }
  assert.deepEqual([...seen].sort(), ['pitcher_pod', 'torchflower_seeds'],
    'both results occur, so it is not a fixed drop');
});

test('a dig is refused at the last moment if the conditions changed', () => {
  // A sniffer can walk into water or be leashed on the way to the spot, so the conditions are rechecked
  // when it arrives rather than only when it sets out.
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  sniffer.digState = 'searching';
  sniffer.digTarget = sniffer.mesh.position.clone();
  const outcome = updateSnifferDig(manager, sniffer, 0.016, {
    onGround: true, inWater: true, headBlockId: BLOCKS.GRASS_BLOCK, groundBlockId: BLOCKS.GRASS_BLOCK
  });
  assert.equal(outcome, null, 'no dig');
  assert.equal(sniffer.digState, 'idle', 'and it gives up');
  assert.equal(sniffer.digTarget, null);
});

test('a snifflet cannot dig, and grows in twice the shared time', () => {
  // Wiki: "Snifflets cannot dig." and "Snifflets require 48000 game ticks to grow up ... which is equal
  // to 40 minutes or two in-game days, twice as long as most other baby mobs in the game."
  assert.equal(SNIFFLET_GROWTH_SECONDS, 2400);
  assert.equal(SNIFFLET_GROWTH_SECONDS, 1200 * 2, 'twice the shared 20-minute growth');
  const { manager } = fixture();
  const snifflet = manager.spawnSniffer(0, 1, 0, { isBaby: true });
  assert.equal(isSnifflet(snifflet), true);
  assert.equal(snifflet.growthTimer, SNIFFLET_GROWTH_SECONDS);
  // It never digs, however long it is left.
  snifflet.digCooldown = 0;
  for (let i = 0; i < 400; i++) updateSnifferDig(manager, snifflet, 0.05, { onGround: true });
  assert.notEqual(snifflet.digState, 'splooting');
  assert.equal(updateSnifferDig(manager, snifflet, 0.05, { onGround: true }), null,
    'a snifflet is refused');
});

test('a snifflet matures after 2400 s and feeding takes 10% off', () => {
  assert.equal(SNIFFLET_FEED_ACCELERATION, 0.1);
  const { manager } = fixture();
  const snifflet = manager.spawnSniffer(0, 1, 0, { isBaby: true });
  const removed = accelerateSniffletGrowth(snifflet);
  assert.ok(Math.abs(removed - 240) < 1e-9, '10% of 2400');
  assert.ok(snifflet.growthTimer < SNIFFLET_GROWTH_SECONDS);
  // A golden dandelion stops it, and feeding must not burn the timer silently.
  snifflet.ageLocked = true;
  assert.equal(accelerateSniffletGrowth(snifflet), 0);
  assert.equal(updateSniffletGrowth(snifflet, 100000), false);
  snifflet.ageLocked = false;
  let matured = false;
  for (let i = 0; i < 600 && !matured; i++) matured = updateSniffletGrowth(snifflet, 5);
  assert.equal(matured, true);
  assert.equal(snifflet.isBaby, false);
  assert.deepEqual([snifflet.width, snifflet.height], [1.9, 1.75], 'the adult hitbox is restored');
  // Wiki: "There is an initial lag period between snifflets growing into adults and splooting for seeds."
  assert.equal(snifflet.digCooldown, SNIFFER_SEARCH_COOLDOWN, 'the adult starts on the full cooldown');
});

test('the shared baby-growth pass does not also tick a snifflet', () => {
  // If it did, a snifflet would mature in half the wiki's time.
  const { manager, player } = fixture();
  player.position.set(200, 1, 200);
  const snifflet = manager.spawnSniffer(0, 1, 0, { isBaby: true });
  const start = snifflet.growthTimer;
  for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  const elapsed = start - snifflet.growthTimer;
  // Ten seconds of updates should remove about ten seconds, not twenty.
  assert.ok(elapsed > 9 && elapsed < 12,
    `about 10 s should have elapsed, got ${elapsed.toFixed(2)}`);
});

test('the breeding food is a torchflower seed', () => {
  assert.equal(SNIFFER_BREEDING_FOOD, 'torchflower_seeds');
  assert.equal(isSnifferBreedingFood('torchflower_seeds'), true);
  assert.equal(isSnifferBreedingFood('TORCHFLOWER_SEEDS'), true);
  for (const other of ['pitcher_pod', 'wheat', 'seagrass', '']) {
    assert.equal(isSnifferBreedingFood(other), false, `${other} is not the breeding food`);
  }
  assert.deepEqual(BREEDING_FOODS.sniffer, ['torchflower_seeds'], 'and it is registered for breeding');
});

test('breeding produces an egg item, not a baby', () => {
  // Wiki: "Breeding two sniffers now causes a sniffer egg to drop as an item."
  assert.equal(SNIFFER_BREEDING.eggItem, 'sniffer_egg');
  assert.equal(SNIFFER_BREEDING.cooldownSeconds, 300, 'and a 5-minute cooldown');
  assert.ok(ITEMS.sniffer_egg, 'the egg is a real item');
  const { manager, entities } = fixture();
  const a = manager.spawnMob('sniffer', 0, 1, 0);
  const b = manager.spawnSniffer(0.8, 1, 0);
  a.inLove = 30;
  b.inLove = 30;
  const before = manager.mobs.filter(m => m.type === 'sniffer').length;
  let bred = false;
  for (let i = 0; i < 400 && !bred; i++) {
    manager.animalBehaviors.checkBreedingPair(a, 0.05);
    if (entities.droppedItems.some(d => d.itemType === 'sniffer_egg')) bred = true;
  }
  assert.equal(bred, true, 'an egg was dropped');
  assert.equal(manager.mobs.filter(m => m.type === 'sniffer').length, before,
    'and no baby sniffer was spawned directly');
});

test('a sniffer egg hatches in 10 minutes on moss and 20 otherwise', () => {
  // Wiki: "a sniffer egg hatches after 10 minutes if placed on a moss block or 20 minutes otherwise."
  assert.deepEqual(SNIFFER_EGG_HATCH, { onMossSeconds: 600, defaultSeconds: 1200 });
  assert.equal(snifferEggHatchSeconds('moss_block'), 600);
  assert.equal(snifferEggHatchSeconds('MOSS_BLOCK'), 600);
  assert.equal(snifferEggHatchSeconds('grass_block'), 1200);
  assert.equal(snifferEggHatchSeconds(null), 1200);

  const { manager } = fixture();
  const onMoss = manager.placeSnifferEgg(0, 1, 0, { blockName: 'moss_block' });
  assert.equal(onMoss.hatchTimer, 600);
  const onGrass = manager.placeSnifferEgg(5, 1, 0, { blockName: 'grass_block' });
  assert.equal(onGrass.hatchTimer, 1200);
  // The moss egg hatches first, and produces a snifflet.
  const hatched = manager.updateSnifferEggs(600);
  assert.equal(hatched.length, 1, 'one egg hatched');
  assert.equal(hatched[0].type, 'sniffer');
  assert.equal(hatched[0].isBaby, true, 'and it is a snifflet');
  assert.equal(hatched[0].growthTimer, SNIFFLET_GROWTH_SECONDS);
  assert.equal(manager.snifferEggs.length, 1, 'the other egg remains');
  assert.equal(manager.updateSnifferEggs(700).length, 1, 'and hatches later');
  assert.equal(manager.snifferEggs.length, 0);
  assert.deepEqual(manager.updateSnifferEggs(10), [], 'nothing left to hatch');
});

test('a sniffer really digs through the real update loop', () => {
  const { manager, player, entities } = fixture();
  player.position.set(200, 1, 200);
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  sniffer.digCooldown = 0;
  let dug = false;
  for (let i = 0; i < 6000 && !dug; i++) {
    manager.update(1 / 60, player);
    if (entities.droppedItems.length) dug = true;
  }
  assert.equal(dug, true, 'it dug up something');
  assert.ok(SNIFFER_DIG_DROPS.includes(entities.droppedItems[0].itemType), 'a seed or a pod');
  assert.equal(sniffer.dugLocations.length, 1, 'and remembered where');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('it drops no items on death, and 1-3 XP only with credit', () => {
  // Wiki: an adult sniffer drops no items at all — the seeds come from digging and the egg from breeding.
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  sniffer.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(sniffer, () => 0.5), [], 'no items on death');
  assert.deepEqual(snifferDrops(sniffer), []);

  let sawValue = false;
  for (let i = 0; i < 40; i++) {
    const xp = snifferXp(sniffer);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(snifferXp(manager.spawnSniffer(0, 1, 0, { isBaby: true })), 0,
    'wiki: a snifflet drops no experience');
  for (let i = 0; i < 40; i++) {
    const xp = snifferBreedingXp();
    assert.ok(xp >= 1 && xp <= 7, `wiki: 1-7 XP on breeding, got ${xp}`);
  }
});

test('the model has six legs, a shell and a snout', () => {
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  assert.equal(sniffer.legs.length, 6, 'the centipede-ish gait the wiki describes');
  assert.ok(sniffer.shell && sniffer.snout && sniffer.head);
  assert.equal(sniffer.bands.length, 3, 'banded shell');
  assert.equal(sniffer.eyes.length, 2);
  assert.ok(SNIFFER_COLORS.body > 0);
  const model = createSnifferModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial()
  );
  assert.ok(model.group && model.head && model.snout);
  assert.equal(model.legs.length, 6);
});

test('the sploot pose flattens the model and splays the legs', () => {
  // Wiki calls the digging posture a "sploot": flat to the ground with its legs spread out.
  const { manager } = fixture();
  const sniffer = manager.spawnMob('sniffer', 0, 1, 0);
  sniffer.groundY = 1;
  sniffer.digState = 'splooting';
  poseSniffer(sniffer, 0);
  assert.ok(sniffer.mesh.position.y < 1, 'the body drops to the ground');
  assert.ok(sniffer.legs.every(l => Math.abs(l.rotation.z) > 1), 'and the legs splay sideways');
  // Standing again restores it.
  sniffer.digState = 'idle';
  poseSniffer(sniffer, 0);
  assert.equal(sniffer.mesh.position.y, 1);
  assert.equal(sniffer.legs.every(l => l.rotation.z === 0), true);
  // Scenting lowers the snout.
  sniffer.digState = 'scenting';
  poseSniffer(sniffer, 0);
  assert.ok(sniffer.head.rotation.x > 0, 'the snout presses toward the ground');
  assert.doesNotThrow(() => poseSniffer(null));
  assert.doesNotThrow(() => poseSniffer({}));
});

test('the Inspector can spawn the sniffer and reports its dig state', () => {
  assert.ok(DEBUG_MOBS.includes('sniffer'), 'sniffer must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const sniffer = s.reset('sniffer');
  assert.equal(sniffer.type, 'sniffer', 'the Inspector spawns a real sniffer');
  const snap = s.snapshot();
  assert.equal(snap.health, 14, 'Inspector telemetry shows 14 HP');
  assert.equal(snap.maxHealth, 14);
  assert.equal(snap.snifferBaby, false);
  assert.ok(['idle', 'scenting', 'searching', 'splooting'].includes(snap.snifferDig), `dig ${snap.snifferDig}`);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 14);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.sniffer_spawn_egg, 'the sniffer has a spawn egg');
  assert.equal(ITEMS.sniffer_spawn_egg.mob, 'sniffer');
  assert.equal(ITEMS.sniffer_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-sniffers and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isSniffer(cow), false);
  assert.equal(isSnifflet(cow), false);
  assert.equal(updateSnifferDig(manager, cow, 0.1), null);
  assert.equal(findDiggableSpot(null, cow), null);
  assert.deepEqual(snifferDrops(cow), []);
  assert.equal(snifferXp(cow), 0);
  assert.equal(updateSniffletGrowth(cow, 1), false);
  assert.equal(accelerateSniffletGrowth(cow), 0);
  assert.equal(snifferDimensions(null).width, 1.9, 'a malformed mob gets the adult hitbox');
  assert.equal(isDiggableBlock(undefined, BLOCKS), false);
  assert.equal(isDiggableBlock(1, null), false);
  assert.doesNotThrow(() => poseSniffer(null));
  assert.doesNotThrow(() => rememberDig(null, new THREE.Vector3()));
  assert.equal(manager.spawnMob('sniffer', 9, 1, 9).type, 'sniffer');
});
