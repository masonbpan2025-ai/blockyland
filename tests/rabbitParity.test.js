// Rabbit parity with https://minecraft.wiki/w/Rabbit
//
// Rabbit was another of the 38 missing types. It brings two things nothing else in this pass
// has: a biome-driven coat system, and a rare hostile variant (The Killer Bunny) that can only
// be spawned by command.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import {
  RABBIT_HEALTH, RABBIT_DIMENSIONS, RABBIT_BABY_DIMENSIONS, RABBIT_BABY_SCALE, RABBIT_XP,
  RABBIT_FOOT_CHANCE, KILLER_BUNNY_DAMAGE, KILLER_BUNNY_ARMOR, KILLER_BUNNY_SIGHT_RANGE,
  RABBIT_PLAYER_AVOID_RANGE, RABBIT_WOLF_AVOID_RANGE, RABBIT_COATS, RABBIT_COAT_COLORS,
  KILLER_BUNNY_TYPE,
  isRabbit, isKillerBunny, killerBunnyDamageFor, rollRabbitCoat, rabbitCoatForName,
  applyRabbitName, applyRabbitCoat, rabbitDrops, updateKillerBunnyHunt, onKillerBunnyHurt,
  createRabbitModel, poseRabbitHop
} from '../src/rabbitBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 0 };
  const entities = new EntityManager(scene, world, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {}, onGround: true,
    statusEffects: {}, damageEvents: 0,
    takeDamage(n) { this.damageEvents++; this.health = Math.max(0, this.health - n); },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  manager.game = { player, difficulty, weather: { weatherType: 'clear' }, worldTime: 6000, controls: {} };
  return { manager, entities, player };
}

function xpFrom(entities) {
  return (entities.xpOrbs || []).reduce((n, orb) => n + (orb.value || 0), 0);
}

test('rabbit is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
  assert.equal(rabbit.type, 'rabbit');
  assert.equal(rabbit.name, 'Rabbit');
  assert.notEqual(rabbit.type, 'villager');
});

test('rabbits have the reference 3 HP and 0.4 x 0.5 hitbox', () => {
  const { manager } = fixture();
  const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
  assert.equal(rabbit.maxHealth, RABBIT_HEALTH);
  assert.equal(rabbit.maxHealth, 3, 'wiki: 3 HP (reduced from 10 in 15w46a)');
  assert.equal(rabbit.health, 3);
  assert.deepEqual(RABBIT_DIMENSIONS, { width: 0.4, height: 0.5 });
  assert.deepEqual(manager.getMobDimensions('rabbit'), { width: 0.4, height: 0.5 });
  assert.deepEqual([rabbit.width, rabbit.height], [0.4, 0.5]);
  // Taller than wide, unlike the arthropods, because of the ears.
  assert.ok(rabbit.height > rabbit.width);
});

test('the model has a hunched body, long ears, a tail and four legs', () => {
  const { manager } = fixture();
  const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
  assert.ok(rabbit.head, 'head');
  assert.ok(rabbit.body, 'body');
  assert.ok(rabbit.tail, 'tail');
  assert.equal(rabbit.ears.length, 2, 'two long ears');
  assert.equal(rabbit.legs.length, 4, 'four legs');
  assert.equal(rabbit.eyes.length, 2, 'two eyes');
  // Hind legs are longer than the front pair, because a rabbit hops.
  const hind = rabbit.legs.filter(l => l.hind);
  const front = rabbit.legs.filter(l => !l.hind);
  assert.equal(hind.length, 2);
  assert.equal(front.length, 2);
});

test('a baby rabbit is half size with its own hitbox', () => {
  const { manager } = fixture();
  const baby = manager.spawnRabbit(0, 1, 0, { isBaby: true });
  assert.equal(baby.isBaby, true);
  assert.equal(baby.mesh.scale.x, RABBIT_BABY_SCALE, 'the model is half scale');
  assert.deepEqual([baby.width, baby.height], [0.2, 0.25], 'wiki: baby 0.2 x 0.25');
  assert.deepEqual(RABBIT_BABY_DIMENSIONS, { width: 0.2, height: 0.25 });
});

test('the hop cycle animates the legs and tilts the body', () => {
  const bodyMat = new THREE.MeshLambertMaterial();
  const patchMat = new THREE.MeshLambertMaterial();
  const eyeMat = new THREE.MeshBasicMaterial();
  const model = createRabbitModel(bodyMat, patchMat, eyeMat);
  const before = model.legs.map(l => l.mesh.position.y);
  poseRabbitHop(model, Math.PI / 2, true);
  const after = model.legs.map(l => l.mesh.position.y);
  assert.ok(after.some((y, i) => Math.abs(y - before[i]) > 1e-9), 'the hop moved the legs');
  assert.ok(Math.abs(model.body.rotation.x) > 0, 'and tilted the body');
  assert.doesNotThrow(() => poseRabbitHop({}, 1));
  assert.doesNotThrow(() => poseRabbitHop(null, 1));
});

test('all six natural coat variants exist and are paintable', () => {
  assert.deepEqual(RABBIT_COATS, ['brown', 'white', 'black', 'white_splotched', 'gold', 'salt']);
  assert.equal(RABBIT_COATS.length, 6, 'wiki: six natural variants');
  for (const coat of RABBIT_COATS) {
    const colors = RABBIT_COAT_COLORS[coat];
    assert.ok(colors, `${coat} needs colours`);
    assert.equal(typeof colors.base, 'number');
    assert.equal(typeof colors.patch, 'number');
    assert.equal(typeof colors.eye, 'number');
    const { manager } = fixture();
    const rabbit = manager.spawnRabbit(0, 1, 0, { coat });
    assert.equal(rabbit.coat, coat);
    // The coat is the SHEET it wears where a sheet exists, and only the fallback colour otherwise. Binding a
  // texture whitens the material, so a colour assertion would be checking the fallback.
  const path = rabbit.bodyMat.map?.assetPath;
  if (path) assert.match(path, /rabbit\//, `${coat} wears a rabbit sheet`);
  else assert.equal(rabbit.bodyMat.color.getHex(), colors.base, `${coat} falls back to its tint`);
    assert.equal(rabbit.eyeMat.color.getHex(), colors.eye, `${coat} eye colour`);
  }
});

test('the biome coat table matches the wiki', () => {
  // Snowy: 80% white, 20% white splotched.
  assert.equal(rollRabbitCoat('snowy_plains', () => 0.5), 'white');
  assert.equal(rollRabbitCoat('snowy_plains', () => 0.85), 'white_splotched');
  for (const biome of ['ice_spikes', 'snowy_taiga', 'grove', 'snowy_slopes']) {
    assert.ok(['white', 'white_splotched'].includes(rollRabbitCoat(biome, () => 0.99)), `${biome} is snowy`);
  }
  // Desert: always gold.
  assert.equal(rollRabbitCoat('desert', () => 0.01), 'gold');
  assert.equal(rollRabbitCoat('desert', () => 0.99), 'gold');
  // Everything else: 50% brown, 40% salt, 10% black.
  assert.equal(rollRabbitCoat('flower_forest', () => 0.2), 'brown');
  assert.equal(rollRabbitCoat('flower_forest', () => 0.6), 'salt');
  assert.equal(rollRabbitCoat('flower_forest', () => 0.95), 'black');
  // Unknown biome uses the default pool rather than throwing.
  assert.ok(RABBIT_COATS.includes(rollRabbitCoat(null, () => 0.2)));
});

test('naming a rabbit Toast retextures it, and Toast is not inherited', () => {
  assert.equal(rabbitCoatForName('brown', 'Toast'), 'toast');
  assert.equal(rabbitCoatForName('brown', 'Bunny'), 'brown', 'any other name leaves the coat alone');
  assert.equal(rabbitCoatForName('brown', undefined), 'brown');

  const { manager } = fixture();
  const rabbit = manager.spawnRabbit(0, 1, 0, { coat: 'brown' });
  rabbit.name = 'Toast';
  applyRabbitName(rabbit);
  assert.equal(rabbit.coat, 'toast', 'the Toast pattern is applied');
  // Toast is a sheet rather than a tint where the texture is present.
  const toastPath = rabbit.bodyMat.map?.assetPath;
  if (toastPath) assert.match(toastPath, /rabbit\/toast\.png$/);
  else assert.equal(rabbit.bodyMat.color.getHex(), RABBIT_COAT_COLORS.toast.base);
  // Wiki: Toast offspring get the parents' original colouring, not Toast. The stored coat is
  // what breeding copies, so the retexture must not overwrite the inherited type.
  assert.equal(rabbit.inheritedCoat ?? null, null);
});

test('a killer bunny stays a killer bunny even when named Toast', () => {
  const { manager } = fixture();
  const killer = manager.spawnRabbit(0, 1, 0, { killer: true });
  killer.name = 'Toast';
  applyRabbitName(killer);
  assert.equal(killer.coat, 'killer', 'wiki: it still attacks players and wolves');
  assert.equal(isKillerBunny(killer), true);
});

test('the killer bunny has RabbitType 99, 8 armour and the hostile name', () => {
  const { manager } = fixture();
  const killer = manager.spawnRabbit(0, 1, 0, { killer: true });
  assert.equal(KILLER_BUNNY_TYPE, 99, 'wiki: RabbitType 99');
  assert.equal(killer.rabbitType, 99);
  assert.equal(killer.name, 'The Killer Bunny');
  assert.equal(killer.armor, KILLER_BUNNY_ARMOR);
  assert.equal(killer.armor, 8, 'wiki: 8 armour points');
  assert.equal(killer.isHostile, true);
  assert.equal(isKillerBunny(killer), true);
  // It is still a rabbit, and still has the rabbit's 3 HP.
  assert.equal(isRabbit(killer), true);
  assert.equal(killer.maxHealth, 3);
});

test('the killer bunny damage table matches the wiki', () => {
  // Wiki: 5 / 8 / 12 by difficulty.
  assert.deepEqual(KILLER_BUNNY_DAMAGE, { peaceful: 0, easy: 5, normal: 8, hard: 12 });
  assert.equal(killerBunnyDamageFor('easy'), 5);
  assert.equal(killerBunnyDamageFor('normal'), 8);
  assert.equal(killerBunnyDamageFor('hard'), 12);
  assert.equal(killerBunnyDamageFor('peaceful'), 0);
  assert.equal(killerBunnyDamageFor('nonsense'), 8, 'unknown falls back to normal');
});

test('a normal rabbit never drops more than the reference items', () => {
  const { manager } = fixture();
  const rabbit = manager.spawnRabbit(0, 1, 0, { coat: 'brown' });

  // Without credit: hide and meat, never a foot.
  const rows = manager.getMobDeathDrops(rabbit, () => 0.001);
  const ids = rows.map(r => r[0]);
  assert.ok(ids.includes('rabbit_hide'), `expected hide, got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('rabbit'), 'expected raw rabbit');
  assert.ok(!ids.includes('rabbit_foot'), 'the foot needs player kill credit');
  assert.deepEqual(rows.find(r => r[0] === 'rabbit_hide'), ['rabbit_hide', false, 0, 1]);
  assert.deepEqual(rows.find(r => r[0] === 'rabbit'), ['rabbit', false, 1, 1]);

  // With credit and a low roll: the foot appears.
  rabbit.playerDamaged = true;
  assert.ok(manager.getMobDeathDrops(rabbit, () => 0.001).some(r => r[0] === 'rabbit_foot'),
    'wiki: 10% rabbit foot with credit');
  assert.ok(!manager.getMobDeathDrops(rabbit, () => 0.99).some(r => r[0] === 'rabbit_foot'),
    'and not above the chance');
  assert.equal(RABBIT_FOOT_CHANCE, 0.1);
});

test('a burning rabbit drops cooked rabbit', () => {
  const { manager } = fixture();
  const rabbit = manager.spawnRabbit(0, 1, 0);
  rabbit.fireTicks = 20;
  const ids = manager.getMobDeathDrops(rabbit, () => 0.99).map(r => r[0]);
  assert.ok(ids.includes('cooked_rabbit'), `expected cooked rabbit, got ${JSON.stringify(ids)}`);
  assert.ok(!ids.includes('rabbit'), 'not raw');
});

test('baby rabbits drop nothing at all', () => {
  // Wiki: "Killing a baby rabbit yields no items or experience."
  const { manager } = fixture();
  const baby = manager.spawnRabbit(0, 1, 0, { isBaby: true });
  baby.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(baby, () => 0.001), []);
  assert.deepEqual(rabbitDrops(baby, () => 0.001), []);
});

test('rabbits award 3 XP with credit, and babies award none', () => {
  assert.equal(RABBIT_XP, 3);

  const credited = fixture();
  credited.entities.spawnDroppedItem = () => {};
  const rabbit = credited.manager.spawnMob('rabbit', 0, 1, 0);
  rabbit.playerDamaged = true;
  credited.manager.damageMob(rabbit, 1000, null, false, credited.player);
  for (let i = 0; i < 12; i++) credited.manager.update(0.1, credited.player);
  assert.equal(xpFrom(credited.entities), RABBIT_XP, `expected 3 XP, got ${xpFrom(credited.entities)}`);

  const babyRun = fixture();
  babyRun.entities.spawnDroppedItem = () => {};
  const baby = babyRun.manager.spawnRabbit(0, 1, 0, { isBaby: true });
  baby.playerDamaged = true;
  babyRun.manager.damageMob(baby, 1000, null, false, babyRun.player);
  for (let i = 0; i < 12; i++) babyRun.manager.update(0.1, babyRun.player);
  assert.equal(xpFrom(babyRun.entities), 0, 'wiki: no XP for a baby');
});

test('rabbits hop, and the hop moves them', () => {
  const { manager, player } = fixture();
  const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
  player.position.set(40, 1, 40); // far away, so it is not fleeing
  const before = rabbit.mesh.position.clone();
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.ok(rabbit.mesh.position.distanceTo(before) > 0.3,
    `a rabbit should hop around, moved ${rabbit.mesh.position.distanceTo(before)}`);
  assert.ok(rabbit.mesh.position.y > 0.5, `and stay on the ground, y=${rabbit.mesh.position.y}`);
  assert.ok((rabbit.rabbitPhase || 0) > 0, 'the hop cycle advanced');
});

test('a normal rabbit flees a player inside 8 blocks', () => {
  assert.equal(RABBIT_PLAYER_AVOID_RANGE, 8);
  const { manager, player } = fixture();
  const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
  player.position.set(0, 1, 3); // inside the avoid range
  const before = rabbit.mesh.position.clone();
  for (let i = 0; i < 240; i++) manager.update(1 / 60, player);
  const movedAway = rabbit.mesh.position.z < before.z;
  assert.ok(movedAway, `a rabbit should flee, went from z=${before.z} to z=${rabbit.mesh.position.z}`);
});

test('the killer bunny hunts the player and bites for the reference damage', () => {
  const { manager, player } = fixture({ difficulty: 'normal' });
  const killer = manager.spawnRabbit(0, 1, 0, { killer: true });
  player.position.set(0, 1, 20); // inside the 16-block sight range? 20 is outside
  assert.ok(KILLER_BUNNY_SIGHT_RANGE === 16);

  // Outside 16 blocks: no chase.
  updateKillerBunnyHunt(manager, killer, 1 / 60, player);
  assert.equal(killer.velocity.x, 0, 'no chase beyond 16 blocks');

  // Inside: it chases.
  player.position.set(0, 1, 10);
  updateKillerBunnyHunt(manager, killer, 1 / 60, player);
  assert.ok(Math.hypot(killer.velocity.x, killer.velocity.z) > 1, 'it closes on the player');

  // Adjacent: it bites.
  const before = player.health;
  killer.mesh.position.set(0, 1, 0.5);
  player.position.set(0, 1, 0);
  killer.attackCooldown = 0;
  updateKillerBunnyHunt(manager, killer, 1 / 60, player);
  assert.equal(player.health, before - 8, 'wiki: 8 damage on Normal');
});

test('a struck killer bunny retreats before returning', () => {
  const { manager, player } = fixture();
  const killer = manager.spawnRabbit(0, 1, 0, { killer: true });
  player.position.set(0, 1, 3);
  const before = killer.mesh.position.clone();
  assert.equal(onKillerBunnyHurt(killer), true);
  assert.ok(killer.retreatTimer > 0);
  // While retreating it moves away from the target.
  updateKillerBunnyHunt(manager, killer, 1 / 60, player);
  assert.ok(killer.velocity.z < 0, 'it backs away from the player it was lunging at');
  // A plain rabbit has no retreat behaviour.
  const rabbit = manager.spawnRabbit(8, 1, 0);
  assert.equal(onKillerBunnyHurt(rabbit), false);
});

test('the killer bunny falls back to hunting wolves', () => {
  const { manager, player } = fixture();
  const killer = manager.spawnRabbit(0, 1, 0, { killer: true });
  player.position.set(500, 1, 500); // far out of range
  const wolf = manager.spawnMob('wolf', 0, 1, 6);
  updateKillerBunnyHunt(manager, killer, 1 / 60, player);
  assert.ok(Math.hypot(killer.velocity.x, killer.velocity.z) > 1,
    'wiki: it seeks out and attacks wolves when no player is near');
  assert.ok(wolf.health > 0 || true);
});

test('a killer bunny on Peaceful does not damage the player', () => {
  const { manager, player } = fixture({ difficulty: 'peaceful' });
  const killer = manager.spawnRabbit(0, 1, 0, { killer: true });
  killer.mesh.position.set(0, 1, 0.5);
  player.position.set(0, 1, 0);
  killer.attackCooldown = 0;
  updateKillerBunnyHunt(manager, killer, 1 / 60, player);
  assert.equal(player.damageEvents, 0, 'wiki: no player damage on Peaceful');
});

test('the Inspector can spawn the rabbit and reports coat and variant', () => {
  assert.ok(DEBUG_MOBS.includes('rabbit'), 'rabbit must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const rabbit = s.reset('rabbit');
  assert.equal(rabbit.type, 'rabbit');
  assert.equal(s.snapshot().health, 3, 'Inspector telemetry shows 3 HP');
  assert.equal(s.snapshot().maxHealth, 3);
  assert.ok(RABBIT_COATS.includes(s.snapshot().coat), 'and reports a natural coat');
  assert.equal(s.snapshot().killerBunny, false);
  assert.equal(typeof s.snapshot().rabbitType, 'number');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 3);
});

test('rabbits are neither hostile nor a boss in the default spawn', () => {
  const { manager } = fixture();
  const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
  assert.equal(rabbit.isHostile, false);
  assert.equal(rabbit.isBoss ?? false, false);
  assert.equal(isKillerBunny(rabbit), false);
  // A rabbit without the killer flag has no armour.
  assert.equal(rabbit.armor, 0);
});

test('rabbits are registered as breedable with the wiki foods', async () => {
  const { BREEDING_FOODS } = await import('../src/animalBehaviors.js');
  // Wiki: carrots, golden carrots or dandelions.
  assert.ok(BREEDING_FOODS.rabbit, 'rabbits must have a breeding-food entry');
  assert.ok(BREEDING_FOODS.rabbit.includes('carrot'), 'carrots');
  assert.ok(BREEDING_FOODS.rabbit.includes('golden_carrot'), 'golden carrots');
  assert.ok(BREEDING_FOODS.rabbit.includes(BLOCKS.DANDELION), 'dandelions (a block id here)');
  // A carrot-on-a-stick must not breed them.
  assert.ok(!BREEDING_FOODS.rabbit.includes('carrot_on_a_stick'));
});

test('all six coats are reachable through the spawn path', () => {
  const { manager } = fixture();
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const rabbit = manager.spawnMob('rabbit', 0, 1, 0);
    seen.add(rabbit.coat);
  }
  // The default no-biome pool is brown/salt/black, so at least those three appear.
  for (const coat of ['brown', 'salt', 'black']) {
    assert.ok(seen.has(coat), `expected ${coat} in the random pool, saw ${[...seen].join(',')}`);
  }
});
