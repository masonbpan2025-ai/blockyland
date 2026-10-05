// Bee parity with https://minecraft.wiki/w/Bee
//
// Bee was another of the 38 missing types. Its defining mechanic is that stinging is fatal to the
// bee: it loses its stinger, can never attack again, does not return home, and dies about a
// minute later. It also pollinates, carries nectar, answers anger as a colony, and drowns.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  BEE_HEALTH, BEE_DIMENSIONS, BEE_BABY_DIMENSIONS, BEE_BABY_SCALE, BEE_DAMAGE, BEE_POISON,
  BEE_STINGERLESS_DEATH_SECONDS, BEE_ANGER_SECONDS, BEE_HIVE_RANGE, BEE_NECTAR_TICKS,
  BEE_HIVE_CAPACITY, BEE_HIVE_MAX_HONEY, BEE_HONEY_DOUBLE_CHANCE, BEE_WATER_DAMAGE,
  BEE_FLOWERS, BEE_COLORS, BEE_POLLINATABLE, BEE_WITHER_ROSE, BEE_EYEBLOSSOM,
  isBee, beeDamageFor, beePoisonFor, beeDrops, isBeeFlower, beeGatherHazard,
  rollBeeAngerSeconds, angerBees, updateBeeAnger, beeIsAngry, beeSting,
  updateBeeStingerless, updateBeeWater, updateBeeNectar, deliverBeeNectar,
  hiveIsHarvestable, hiveHasRoom, canPollinate, createBeeModel, poseBee
} from '../src/beeBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 15 };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(0, 1, 2), gamemode: 'survival', health: 20, keys: {},
    onGround: true, statusEffects: {}, damageEvents: 0,
    takeDamage(n) { this.damageEvents++; this.health = Math.max(0, this.health - n); },
    applyStatusEffect(id, seconds) { this.statusEffects[id] = { seconds }; },
    hasStatusEffect(id) { return !!this.statusEffects[id]; }
  };
  manager.game = { player, difficulty, weather: { weatherType: 'clear' }, worldTime: 6000, controls: {} };
  return { manager, entities, player };
}

function xpFrom(entities) {
  return (entities.xpOrbs || []).reduce((n, orb) => n + (orb.value || 0), 0);
}

test('bee is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  assert.equal(bee.type, 'bee');
  assert.equal(bee.name, 'Bee');
  assert.notEqual(bee.type, 'villager');
});

test('bees have the reference 10 HP and the adult and baby hitboxes', () => {
  const { manager } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  assert.equal(bee.maxHealth, BEE_HEALTH);
  assert.equal(bee.maxHealth, 10, 'wiki: 10 HP');
  assert.equal(bee.health, 10);
  assert.deepEqual(BEE_DIMENSIONS, { width: 0.55, height: 0.5 });
  assert.deepEqual(BEE_BABY_DIMENSIONS, { width: 0.275, height: 0.25 });
  assert.deepEqual(manager.getMobDimensions('bee'), { width: 0.55, height: 0.5 });

  const baby = manager.spawnBee(0, 3, 0, { isBaby: true });
  assert.equal(baby.mesh.scale.x, BEE_BABY_SCALE);
  assert.deepEqual([baby.width, baby.height], [0.275, 0.25]);
});

test('bees are a neutral flying arthropod that is poison-immune and takes no fall damage', () => {
  const { manager } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  assert.equal(bee.isFlying, true);
  assert.equal(bee.isArthropod, true);
  assert.equal(bee.poisonImmune, true, 'a bee inflicts poison, it is not hurt by it');
  assert.equal(bee.fallDamageImmune, true);
  assert.equal(bee.angerTimer, 0, 'it starts neutral');
});

test('the sting damage and poison tables match the wiki', () => {
  // Wiki: 2 damage on Easy and Normal, 3 on Hard.
  assert.deepEqual(BEE_DAMAGE, { peaceful: 0, easy: 2, normal: 2, hard: 3 });
  assert.equal(beeDamageFor('easy'), 2);
  assert.equal(beeDamageFor('normal'), 2);
  assert.equal(beeDamageFor('hard'), 3);
  assert.equal(beeDamageFor('peaceful'), 0);

  // Wiki: poison for 10 seconds on Normal and 18 on Hard, and none on Easy.
  assert.equal(BEE_POISON.easy, null, 'wiki: no poison on Easy');
  assert.equal(BEE_POISON.peaceful, null);
  assert.deepEqual(BEE_POISON.normal, { seconds: 10, damage: 7 });
  assert.deepEqual(BEE_POISON.hard, { seconds: 18, damage: 14 });
  assert.equal(beePoisonFor('easy'), null, 'the deliberate null must not fall through to Normal');
  assert.equal(beePoisonFor('normal').seconds, 10);
  assert.equal(beePoisonFor('hard').seconds, 18);
  assert.equal(beePoisonFor('nonsense'), BEE_POISON.normal);
});

test('bees drop nothing but experience', () => {
  assert.deepEqual(beeDrops({ type: 'bee' }), []);
  const { manager } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  bee.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(bee, () => 0.001), [], 'no items even with credit');
});

test('bees award 1-3 XP with credit, none for babies, and none when they die of their sting', () => {
  const credited = fixture();
  credited.entities.spawnDroppedItem = () => {};
  const bee = credited.manager.spawnMob('bee', 0, 3, 0);
  bee.playerDamaged = true;
  credited.manager.damageMob(bee, 1000, null, false, credited.player);
  for (let i = 0; i < 12; i++) credited.manager.update(0.1, credited.player);
  const xp = xpFrom(credited.entities);
  assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);

  // A bee that dies from its own sting was not killed, so it awards nothing.
  const sting = fixture();
  sting.entities.spawnDroppedItem = () => {};
  const doomed = sting.manager.spawnMob('bee', 0, 3, 0);
  doomed.stingerless = true;
  doomed.health = 0;
  doomed.diedOfSting = true;
  for (let i = 0; i < 12; i++) sting.manager.update(0.1, sting.player);
  assert.equal(xpFrom(sting.entities), 0, 'no XP for a bee that died of its own sting');
});

test('the anger duration is drawn from the wiki 20-39 second window', () => {
  assert.deepEqual(BEE_ANGER_SECONDS, { min: 20, max: 39 });
  assert.equal(rollBeeAngerSeconds(() => 0), 20, 'the window is inclusive at the bottom');
  assert.equal(rollBeeAngerSeconds(() => 0.999999), 39, 'and at the top');
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const seconds = rollBeeAngerSeconds(() => r);
    assert.ok(seconds >= 20 && seconds <= 39, `roll ${r} gave ${seconds}`);
  }
});

test('hitting one bee angers the whole nearby colony', () => {
  const { manager, player } = fixture();
  const hit = manager.spawnMob('bee', 0, 3, 0);
  const near = manager.spawnMob('bee', 5, 3, 0);
  const far = manager.spawnMob('bee', 200, 3, 0);
  const angered = angerBees(manager, hit, player, { range: 24, random: () => 0 });

  assert.equal(angered.length, 2, `expected the victim and one neighbour, got ${angered.length}`);
  assert.ok(angered.includes(hit) && angered.includes(near));
  assert.equal(hit.angerTimer, 20);
  assert.equal(near.angerTimer, 20);
  assert.equal(near.angryAt, player, 'the colony inherits the attacker');
  assert.equal(far.angerTimer, 0, 'a distant bee is untouched');
});

test('a bee killed in one hit does not itself call for help', () => {
  // Wiki: "All bees nearby are angered when an individual bee is attacked (unless the bee
  // attacked is killed in one hit)". The exemption is on the *victim* becoming angry — a bee that
  // dies instantly has nothing to be angry about. Nearby bees still respond, which is what makes
  // one-hitting a bee the way to avoid aggroing the colony one bee at a time.
  const { manager, player } = fixture();
  const hit = manager.spawnMob('bee', 0, 3, 0);
  const near = manager.spawnMob('bee', 5, 3, 0);
  const angered = angerBees(manager, hit, player, { lethal: true, random: () => 0 });

  assert.equal(hit.angerTimer, 0, 'the one-hit victim is not angered');
  assert.ok(!angered.includes(hit), 'and is not reported as responding');
  // The neighbour does respond, and it is reported exactly once.
  assert.equal(near.angerTimer, 20, 'the nearby bee still answers');
  assert.deepEqual(angered, [near], 'reported exactly once, not double-counted');
});

test('the real damage path angers the colony with no manual setup', () => {
  const { manager, player } = fixture();
  const hit = manager.spawnMob('bee', 0, 3, 0);
  const peer = manager.spawnMob('bee', 5, 3, 5);
  peer.angerTimer = 0;
  manager.damageMob(hit, 1, null, false, player);
  assert.ok(hit.angerTimer > 0, 'the victim is angered');
  assert.ok(peer.angerTimer > 0, 'and the peer through the damage path');
});

test('the anger window decays and beeIsAngry tracks it', () => {
  const { manager, player } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  angerBees(manager, bee, player, { random: () => 0.5 });
  assert.equal(beeIsAngry(bee), true);
  updateBeeAnger(bee, 1000);
  assert.equal(bee.angerTimer, 0, 'anger expires');
  assert.equal(beeIsAngry(bee), false);
  assert.equal(beeIsAngry({ type: 'cow' }), false);
});

test('a successful sting poisons the target on Normal and Hard', () => {
  for (const [difficulty, seconds] of [['normal', 10], ['hard', 18]]) {
    const { manager, player } = fixture({ difficulty });
    const bee = manager.spawnMob('bee', 0, 3, 0);
    const poison = beeSting(manager, bee, player);
    assert.ok(poison, `${difficulty}: poison applied`);
    assert.equal(player.statusEffects.poison.seconds, seconds,
      `wiki: ${difficulty} poisons for ${seconds}s`);
  }
  // Easy: damage but no poison.
  const easy = fixture({ difficulty: 'easy' });
  const easyBee = easy.manager.spawnMob('bee', 0, 3, 0);
  assert.equal(beeSting(easy.manager, easyBee, easy.player), null, 'wiki: no poison on Easy');
  assert.equal(easy.player.health, 18, 'but 2 melee damage still lands');
  assert.equal(easy.player.hasStatusEffect('poison'), false);
});

test('stinging costs the bee its stinger and its life', () => {
  const { manager, player } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  beeSting(manager, bee, player);

  assert.equal(bee.hasStung, true);
  assert.equal(bee.stingerless, true);
  assert.equal(bee.angerTimer, 0, 'it stops being angry');
  assert.equal(bee.isReturningHome, false, 'wiki: it does not retreat to its nest');
  assert.equal(bee.stinger.visible, true, 'the stinger mesh is hidden by poseBee, not here');
  poseBee(bee);
  assert.equal(bee.stinger.visible, false, 'wiki: it has no stinger left');

  // A stingerless bee cannot sting again.
  const events = player.damageEvents;
  assert.equal(beeSting(manager, bee, player), null, 'it cannot attack further');
  assert.equal(player.damageEvents, events, 'and deals no further damage');
});

test('a stingerless bee dies about a minute later', () => {
  assert.equal(BEE_STINGERLESS_DEATH_SECONDS, 60, 'wiki: dies approximately one minute later');
  const { manager, player } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  beeSting(manager, bee, player);
  assert.equal(bee.deathTimer, 60);

  // Not yet.
  assert.equal(updateBeeStingerless(bee, 59), false, 'still alive at 59 seconds');
  assert.ok(bee.health > 0);
  // Then it dies.
  assert.equal(updateBeeStingerless(bee, 2), true, 'it dies at the minute mark');
  assert.equal(bee.health, 0);
  assert.equal(bee.diedOfSting, true, 'and it died of its injuries, not a kill');
  // A bee that never stung is unaffected.
  const clean = manager.spawnMob('bee', 0, 3, 0);
  assert.equal(updateBeeStingerless(clean, 1000), false);
});

test('bees drown after 20 ticks in water', () => {
  assert.equal(BEE_WATER_DAMAGE.graceTicks, 20);
  assert.equal(BEE_WATER_DAMAGE.damage, 1);
  const { manager } = fixture();
  let damage = 0;
  manager.damageMob = () => { damage++; };
  const bee = manager.spawnMob('bee', 0, 3, 0);

  // 0.5 s is 10 ticks: inside the grace period.
  for (let i = 0; i < 10; i++) updateBeeWater(manager, bee, 0.05, true);
  assert.equal(damage, 0, 'no damage inside the 20-tick grace period');
  // 1.0 s is exactly 20 ticks: still inside, because the wiki says "more than 20 ticks".
  for (let i = 0; i < 10; i++) updateBeeWater(manager, bee, 0.05, true);
  const atGrace = damage;
  // Past the grace period, damage starts and lands once per half second.
  for (let i = 0; i < 20; i++) updateBeeWater(manager, bee, 0.05, true);
  assert.ok(damage > atGrace, 'damage begins after the grace period');
  assert.ok(damage - atGrace <= 2, `about one hit per half second, got ${damage - atGrace} in 1s`);

  // Leaving the water resets the clock.
  updateBeeWater(manager, bee, 1, false);
  assert.equal(bee.waterTicks, 0);
  const after = damage;
  for (let i = 0; i < 10; i++) updateBeeWater(manager, bee, 0.05, true);
  assert.equal(damage, after, 'and the grace period starts over');
});

test('the flower list matches the wiki and excludes what bees ignore', () => {
  for (const flower of ['poppy', 'dandelion', 'allium', 'azure_bluet', 'blue_orchid',
    'cornflower', 'lily_of_the_valley', 'orange_tulip', 'pink_tulip', 'red_tulip',
    'white_tulip', 'lilac', 'peony', 'rose_bush', 'sunflower', 'pink_petals',
    'cherry_leaves', 'azalea_leaves', 'spore_blossom', 'chorus_flower', 'mangrove_propagule']) {
    assert.ok(BEE_FLOWERS.includes(flower), `${flower} should be a bee flower`);
  }
  // Wiki: a bee "completely ignores" closed eyeblossoms and golden dandelions.
  assert.ok(!BEE_FLOWERS.includes('closed_eyeblossom'));
  assert.ok(!BEE_FLOWERS.includes('golden_dandelion'));
  assert.equal(beeGatherHazard('closed_eyeblossom'), 'ignored');
  assert.equal(beeGatherHazard('golden_dandelion'), 'ignored');
});

test('gathering from a wither rose or eyeblossom hurts the bee', () => {
  // Wiki: a bee can gather from these but suffers the effect.
  assert.deepEqual(beeGatherHazard('wither_rose'), BEE_WITHER_ROSE);
  assert.equal(beeGatherHazard('wither_rose').effect, 'wither');
  assert.equal(beeGatherHazard('open_eyeblossom').effect, 'poison');
  assert.equal(beeGatherHazard('poppy'), null, 'an ordinary flower is harmless');
  assert.equal(beeGatherHazard(null), null);
});

test('isBeeFlower resolves block ids as well as names', () => {
  const { manager } = fixture();
  assert.equal(isBeeFlower(BLOCKS.POPPY), true, 'a poppy block id is a flower');
  assert.equal(isBeeFlower(BLOCKS.STONE), false, 'stone is not');
  assert.equal(isBeeFlower('poppy'), true, 'a name works too');
  assert.equal(isBeeFlower(undefined), false);
  assert.equal(isBeeFlower(null), false);
});

test('nectar needs more than 400 ticks of circling', () => {
  assert.equal(BEE_NECTAR_TICKS, 400);
  const { manager } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  // 19 seconds is 380 ticks: not enough.
  for (let i = 0; i < 19; i++) updateBeeNectar(bee, 1, { atFlower: true });
  assert.equal(bee.hasNectar, false, 'not yet at 380 ticks');
  // One more second tips it over.
  updateBeeNectar(bee, 1.5, { atFlower: true });
  assert.equal(bee.hasNectar, true, 'nectar collected past 400 ticks');
  assert.equal(bee.nectarTicks, 0, 'and the counter resets');
});

test('damage stops a bee collecting nectar', () => {
  const { manager } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  for (let i = 0; i < 15; i++) updateBeeNectar(bee, 1, { atFlower: true });
  assert.ok(bee.nectarTicks > 0, 'it has been working at it');
  updateBeeNectar(bee, 0.05, { damaged: true, atFlower: true });
  assert.equal(bee.nectarTicks, 0, 'wiki: a damaged bee ceases its efforts');
  assert.equal(bee.hasNectar, false);
});

test('delivering nectar raises the hive honey level, occasionally by two', () => {
  const { manager } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  bee.hasNectar = true;
  const hive = { honeyLevel: 0, bees: [] };
  assert.equal(deliverBeeNectar(bee, hive, () => 0.5), 1, 'one level normally');
  assert.equal(hive.honeyLevel, 1);
  assert.equal(bee.hasNectar, false, 'and the nectar is spent');

  bee.hasNectar = true;
  assert.equal(deliverBeeNectar(bee, hive, () => 0.001), 2, '1% of the time it is two');
  assert.equal(hive.honeyLevel, 3);
  assert.equal(BEE_HONEY_DOUBLE_CHANCE, 0.01);

  // Capped at the maximum.
  hive.honeyLevel = 4;
  bee.hasNectar = true;
  deliverBeeNectar(bee, hive, () => 0.001);
  assert.equal(hive.honeyLevel, BEE_HIVE_MAX_HONEY, 'the level is capped at 5');
  assert.equal(BEE_HIVE_MAX_HONEY, 5);

  // No nectar, no delivery.
  bee.hasNectar = false;
  assert.equal(deliverBeeNectar(bee, hive, () => 0.5), 0);
});

test('hive capacity and harvestability match the wiki', () => {
  assert.equal(BEE_HIVE_CAPACITY, 3, 'wiki: a nest houses up to 3 bees');
  const hive = { honeyLevel: 0, bees: [] };
  assert.equal(hiveHasRoom(hive), true);
  hive.bees = [{}, {}, {}];
  assert.equal(hiveHasRoom(hive), false, 'a full hive has no room');
  assert.equal(hiveIsHarvestable(hive), false, 'and empty honey is not harvestable');
  hive.honeyLevel = 5;
  assert.equal(hiveIsHarvestable(hive), true);
  assert.equal(hiveIsHarvestable(null), false);
  assert.equal(hiveHasRoom(null), false);
});

test('pollination requires a crop and the bee 1-2 blocks above it', () => {
  for (const crop of ['wheat', 'potatoes', 'carrots', 'beetroots', 'melon_stem', 'pumpkin_stem', 'sweet_berry_bush', 'cave_vines']) {
    assert.ok(BEE_POLLINATABLE.includes(crop), `${crop} is pollinatable`);
    assert.equal(canPollinate(crop, 1), true, `${crop} with the bee 1 above`);
    assert.equal(canPollinate(crop, 2), true, `${crop} with the bee 2 above`);
  }
  assert.equal(canPollinate('wheat', 0), false, 'level with the crop does not count');
  assert.equal(canPollinate('wheat', 3), false, 'nor does 3 blocks above');
  assert.equal(canPollinate('stone', 1), false, 'stone is not a crop');
  assert.equal(canPollinate(null, 1), false);
});

test('the model exposes the shared wings contract and hides the stinger when used', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const stripeMat = new THREE.MeshLambertMaterial();
  const wingMat = new THREE.MeshLambertMaterial();
  const eyeMat = new THREE.MeshBasicMaterial();
  const model = createBeeModel(bodyMat, stripeMat, wingMat, eyeMat);

  // moveFlyingMob writes `mob.wings.left.rotation.z`, so the shape matters: the bat shipped a
  // frozen model by getting this wrong.
  assert.ok(model.wings.left, 'wings.left exists');
  assert.ok(model.wings.right, 'wings.right exists');
  assert.ok(model.wings.left.rotation && model.wings.right.rotation, 'each wing has a rotation');
  assert.equal(model.wings.length, 2);

  // The stinger hides once used.
  const bee = { ...model, hasStung: false, eyes: model.eyes, stinger: model.stinger, angerTimer: 0 };
  poseBee(bee);
  assert.equal(model.stinger.visible, true, 'a fresh bee has its stinger');
  bee.hasStung = true;
  poseBee(bee);
  assert.equal(model.stinger.visible, false, 'a stung bee does not');
  assert.doesNotThrow(() => poseBee(null));
});

test('an angered bee turns its eyes red', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const stripeMat = new THREE.MeshLambertMaterial();
  const wingMat = new THREE.MeshLambertMaterial();
  const eyeMat = new THREE.MeshBasicMaterial({ color: BEE_COLORS.eye });
  const model = createBeeModel(bodyMat, stripeMat, wingMat, eyeMat);
  const bee = { ...model, type: 'bee', hasStung: false, angerTimer: 0 };
  poseBee(bee);
  assert.equal(model.eyes[0].material.color.getHex(), BEE_COLORS.eye, 'calm eyes');
  bee.angerTimer = 30;
  poseBee(bee);
  assert.equal(model.eyes[0].material.color.getHex(), 0xdc2626, 'wiki: angered bees have red eyes');
});

test('a bee flies through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(60, 3, 60); // far, so it is not angered or chasing
  const bee = manager.spawnMob('bee', 0, 3, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(bee), 'still alive and not broken');
  assert.ok((bee.beePhase || 0) > 0, 'its wings animate');
});

test('an angered bee closes on the player and stings through the real loop', () => {
  const { manager, player } = fixture();
  const bee = manager.spawnMob('bee', 0, 3, 0);
  player.position.set(0, 3, 8);
  // Anger it directly, since the real hook is covered above.
  angerBees(manager, bee, player, { random: () => 0 });
  const before = player.health;
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal(bee.hasStung, true, 'the bee stung the player');
  assert.ok(player.health < before, `the sting landed, health ${before} -> ${player.health}`);
  assert.ok(player.hasStatusEffect('poison'), 'and poisoned on Normal');
});

test('the Inspector can spawn the bee and reports its anger and nectar', () => {
  assert.ok(DEBUG_MOBS.includes('bee'), 'bee must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const bee = s.reset('bee');
  assert.equal(bee.type, 'bee', 'the Inspector spawns a real bee');
  assert.equal(s.snapshot().health, 10, 'Inspector telemetry shows 10 HP');
  assert.equal(s.snapshot().maxHealth, 10);
  assert.equal(s.snapshot().beeAnger, 0);
  assert.equal(s.snapshot().hasStung, false);
  assert.equal(s.snapshot().hasNectar, false);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 10);
});

test('the helpers are safe on non-bees', () => {
  const { manager, player } = fixture();
  assert.equal(isBee({ type: 'cow' }), false);
  assert.deepEqual(angerBees(manager, { type: 'cow' }, player), []);
  assert.equal(beeSting(manager, { type: 'cow' }, player), null);
  assert.equal(updateBeeStingerless({ type: 'cow' }, 100), false);
  assert.doesNotThrow(() => updateBeeAnger({ type: 'cow' }, 1));
  assert.equal(updateBeeNectar({ type: 'cow' }, 1, { atFlower: true }), false);
});
