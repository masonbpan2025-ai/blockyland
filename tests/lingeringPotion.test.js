// Thrown lingering potions (src/lingeringPotion.js): they brewed and could not be used. Java's area effect cloud as a
// lingering potion makes it (the wiki's Lingering Potion page): radius 3, gone in 30 seconds, after a half-second wait;
// half a block smaller each time it gives its effect; the same target at most once a second; a quarter of the
// potion's duration, and Healing and Harming at half potency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LINGERING_CLOUD, isLingeringPotion, createCloud, stepCloud, inCloud, LingeringClouds } from '../src/lingeringPotion.js';

const at = (x, y = 0, z = 0) => ({ x, y, z });
const holder = (type, x = 0) => {
  const given = [];
  return { type, health: 10, maxHealth: 20, mesh: { position: at(x) }, given, applyStatusEffect: (name, seconds, level) => given.push([name, seconds, level]) };
};

test('the cloud\'s numbers are Java\'s', () => {
  assert.deepEqual({ ...LINGERING_CLOUD }, { radius: 3, seconds: 30, waitSeconds: 0.5, radiusOnUse: 0.5, reapplySeconds: 1, durationScale: 0.25, instantScale: 0.5 });
  assert.ok(isLingeringPotion('lingering_potion_of_poison'));
  assert.ok(!isLingeringPotion('splash_potion_of_poison') && !isLingeringPotion('potion_of_poison'));
});

test('a cloud gives a quarter of the potion\'s duration, after its wait, once a second, shrinking as it does', () => {
  const cloud = createCloud(at(0), 'lingering_potion_of_poison'), cow = holder('cow');
  stepCloud(cloud, 0.4, [cow]);
  assert.equal(cow.given.length, 0, 'not during the wait');
  stepCloud(cloud, 0.2, [cow]);
  assert.deepEqual(cow.given, [['poison', 45 / 4, 1]]);
  const radius = cloud.radius;
  stepCloud(cloud, 0.5, [cow]);
  assert.equal(cow.given.length, 1, 'not again within the second');
  stepCloud(cloud, 0.6, [cow]);
  assert.equal(cow.given.length, 2);
  assert.ok(cloud.radius < radius - 0.5 + 1e-9, 'half a block smaller for the use, and shrinking with time');
});

test('a cloud shrinks to nothing over 30 seconds, and only reaches what stands in it', () => {
  const cloud = createCloud(at(0), 'lingering_potion_of_swiftness'), far = holder('cow', 4);
  let alive = true, t = 0;
  while (alive && t < 40) { alive = stepCloud(cloud, 0.5, [far]); t += 0.5; }
  assert.ok(t <= 30.5 && t >= 29.5, `gone after ${t} s`);
  assert.equal(far.given.length, 0, 'four blocks off is outside a radius of 3');
  assert.ok(inCloud(createCloud(at(0), 'lingering_potion_of_swiftness'), at(2.9)));
  assert.ok(!inCloud(createCloud(at(0), 'lingering_potion_of_swiftness'), at(0, 3)));
});

test('Healing and Harming at half potency, and reversed on the undead', () => {
  const player = { health: 10, maxHealth: 20, position: at(0), hurt: [], takeDamage(n, from, type) { this.hurt.push([n, type]); } };
  const healing = createCloud(at(0), 'lingering_potion_of_healing');
  stepCloud(healing, 0.6, [player], { player });
  assert.equal(player.health, 12, 'Healing I is 4, halved');
  const harming = createCloud(at(0), 'lingering_potion_of_harming'), zombie = { type: 'zombie', health: 10, maxHealth: 20, mesh: { position: at(0) } };
  stepCloud(harming, 0.6, [player, zombie], { player });
  assert.deepEqual(player.hurt, [[3, 'magic']], 'Harming I is 6, halved');
  assert.equal(zombie.health, 12, 'and it heals the undead by half of 4');
});

test('the game throws a cloud to the ground ahead, steps it and clears it', () => {
  const voxels = new Map([['0,-1,0', 1]]);
  const game = { world: { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? 0 }, player: null, mobs: { mobs: [] } };
  const clouds = new LingeringClouds(game);
  assert.equal(clouds.throw(at(0.5, 3, 0.5), 'potion_of_poison'), false, 'only a lingering potion');
  assert.equal(clouds.throw(at(0.5, 3, 0.5), 'lingering_potion_of_poison'), true);
  assert.equal(clouds.clouds[0].y, 0, 'settled on the block below');
  for (let i = 0; i < 70; i++) clouds.update(0.5);
  assert.equal(clouds.clouds.length, 0);
  clouds.throw(at(0, 0, 0), 'lingering_potion_of_poison'); clouds.clear();
  assert.equal(clouds.clouds.length, 0);
});
