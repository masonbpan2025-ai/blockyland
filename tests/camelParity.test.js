// Camel parity with https://minecraft.wiki/w/Camel
//
// A new large passive mob defined by three things nothing else here has: it SITS on a timer, it can DASH 12
// blocks forward, and it STEPS UP 1.5 blocks so it walks over fences. It is also the only mob here with two
// seats.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { AnimalBehaviors, BREEDING_FOODS } from '../src/animalBehaviors.js';
import {
  CAMEL_HEALTH, CAMEL_DIMENSIONS, CAMEL_SITTING_DIMENSIONS, CAMEL_BABY_DIMENSIONS, CAMEL_BABY_SCALE,
  CAMEL_STEP_HEIGHT, CAMEL_FALL, CAMEL_DASH, CAMEL_SPEED, CAMEL_SIT, CAMEL_STAND_CLEARANCE,
  CAMEL_CACTUS_HEAL, CAMEL_REGEN_CHANCE, CAMEL_BABY_GROWTH_SECONDS, CAMEL_CACTUS_GROWTH_SECONDS,
  CAMEL_FOLLOW_RANGE, CAMEL_BREEDING_FOOD, CAMEL_SEATS, CAMEL_EQUIPMENT, CAMEL_COLORS,
  isCamel, camelDimensions, camelCanBeRidden, camelCanBeControlled, camelCanSeat, equipCamelSaddle,
  removeCamelSaddle, camelCanStand, camelSit, camelStand, updateCamelSitting, rollCamelStandDelay,
  camelDash, updateCamelDash, camelFallDamage, updateCamelRegen, feedCamelCactus, updateCamelGrowth,
  accelerateCamelGrowth, camelFollows, isCamelBreedingFood, camelDrops, camelXp, camelBreedingXp,
  createCamelModel, poseCamel, camelProtectsRiderFrom
} from '../src/camelBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

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
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(30, 1, 30), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  return { manager, player, entities };
}

test('camel is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.equal(camel.type, 'camel');
  assert.equal(camel.name, 'Camel');
  assert.notEqual(camel.type, 'villager');
});

test('the health and every hitbox match the wiki', () => {
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.equal(CAMEL_HEALTH, 32);
  assert.equal(camel.maxHealth, 32, 'wiki: 32 HP');
  // Wiki: adult 1.7 x 2.375, sitting 1.7 x 0.945, baby 0.85 x 1.1875.
  assert.deepEqual(CAMEL_DIMENSIONS, { width: 1.7, height: 2.375 });
  assert.deepEqual(CAMEL_SITTING_DIMENSIONS, { width: 1.7, height: 0.945 });
  assert.deepEqual(CAMEL_BABY_DIMENSIONS, { width: 0.85, height: 1.1875 });
  assert.deepEqual([camel.width, camel.height], [1.7, 2.375]);
  assert.deepEqual(manager.getMobDimensions('camel'), { width: 1.7, height: 2.375 });
  assert.equal(camel.onGround, true, 'a definite groundedness at spawn');
});

test('the three signature traits are declared', () => {
  // Wiki: it steps up 1.5 blocks so it "surmount[s] fences and walls with ease"; it falls 6 blocks safely
  // at half damage; and it is the only mob here with two seats.
  assert.equal(CAMEL_STEP_HEIGHT, 1.5);
  assert.deepEqual(CAMEL_FALL, { safeBlocks: 6, damagePerBlock: 0.5 });
  assert.equal(CAMEL_SEATS, 2);
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.equal(camel.stepHeight, CAMEL_STEP_HEIGHT, 'a 1.5-block step is walkable');
  assert.equal(camel.fallDamageReduction, 6);
  assert.equal(camel.seats, 2, 'wiki: up to two players');
  assert.equal(CAMEL_SPEED.walk, 3.885);
  assert.equal(CAMEL_SPEED.sprint, 8.203);
});

test('it sits and stands, shrinking its hitbox', () => {
  // Wiki: it "occasionally sits for two to seven seconds before standing up again".
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.equal(camel.isSitting, false);
  assert.equal(camelSit(camel), true);
  assert.equal(camel.isSitting, true);
  assert.deepEqual([camel.width, camel.height], [1.7, 0.945], 'the sitting hitbox is shorter');
  assert.equal(camelStand(camel, 5), 'stood');
  assert.deepEqual([camel.width, camel.height], [1.7, 2.375], 'and the standing height returns');
  // Sitting twice is a no-op, and standing a standing camel is a no-op.
  camelSit(camel);
  assert.equal(camelSit(camel), false);
  assert.equal(camelStand(camel, 5), 'stood');
  assert.equal(camelStand(camel, 5), null);
  assert.equal(camelSit(manager.spawnCow(0, 1, 0)), false);
});

test('a sitting camel refuses to stand under a low ceiling', () => {
  // Wiki: "Sitting camels do not stand up if there are solid blocks above them, as doing so would inflict
  // suffocation damage."
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camelSit(camel);
  // The clearance it needs is the difference between its standing and sitting heights.
  assert.ok(Math.abs(CAMEL_STAND_CLEARANCE - (CAMEL_DIMENSIONS.height - CAMEL_SITTING_DIMENSIONS.height)) < 1e-9);
  assert.equal(camelCanStand(camel, CAMEL_STAND_CLEARANCE - 0.1), false, 'not enough headroom');
  assert.equal(camelCanStand(camel, CAMEL_STAND_CLEARANCE), true, 'exactly enough is enough');
  assert.equal(camelStand(camel, 1), 'blocked');
  assert.equal(camel.isSitting, true, 'it stays sitting, which is the point of the rule');
  assert.deepEqual([camel.width, camel.height], [1.7, 0.945], 'and keeps the sitting hitbox');
  // Blocked once, then allowed.
  assert.equal(camelStand(camel, 8), 'stood');
});

test('the sit cycle runs on its own timer', () => {
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  const random = () => 0.5;
  camel.standTimer = 0.01;
  assert.equal(updateCamelSitting(camel, 0.016, { clearance: 5, random }), 'sat');
  assert.equal(camel.isSitting, true);
  // The sit lasts between 2 and 7 seconds.
  assert.ok(camel.sitTimer >= CAMEL_SIT.minSeconds && camel.sitTimer <= CAMEL_SIT.maxSeconds,
    `sit timer ${camel.sitTimer}`);
  // It stands again when the timer runs out.
  assert.equal(updateCamelSitting(camel, camel.sitTimer + 0.1, { clearance: 5, random }), 'stood');
  assert.equal(camel.isSitting, false);
  // And reports 'blocked' rather than standing when there is no headroom.
  camel.sitTimer = 0;
  camel.isSitting = true;
  assert.equal(updateCamelSitting(camel, 1, { clearance: 0, random }), 'blocked');
  assert.equal(camel.isSitting, true);
  // The stand delay is drawn from a sensible window.
  for (const r of [0, 0.5, 0.999]) {
    const d = rollCamelStandDelay(() => r);
    assert.ok(d >= 4 && d <= 10, `stand delay ${d}`);
  }
  // A baby never sits.
  const baby = manager.spawnCamel(0, 1, 0, { isBaby: true });
  assert.equal(updateCamelSitting(baby, 100, { clearance: 9 }), null);
});

test('it stands when harmed, even while sitting', () => {
  // Wiki: "Camels immediately flee after being harmed, even when sitting."
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camelSit(camel);
  assert.equal(updateCamelSitting(camel, 0.016, { clearance: 5, fleeing: true }), 'stood');
  assert.equal(camel.isSitting, false);
  // But not into a ceiling.
  camelSit(camel);
  assert.equal(updateCamelSitting(camel, 0.016, { clearance: 0, fleeing: true }), 'blocked');
  assert.equal(camel.isSitting, true);
});

test('a cactus-tempted sitting camel stands to follow', () => {
  // Wiki: "Sitting camels immediately start to stand up and follow once they notice the player holding
  // cactus."
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camelSit(camel);
  assert.equal(updateCamelSitting(camel, 0.016, { clearance: 5, tempted: true }), 'stood');
  assert.equal(camel.isSitting, false);
});

test('the fall damage is six safe blocks at half damage', () => {
  // Wiki: "Camels can safely fall 6 blocks before they begin to accumulate fall damage ... Camels also take
  // half of the normal fall damage (rounded up)".
  assert.equal(camelFallDamage(1), 0);
  assert.equal(camelFallDamage(3), 0, 'three blocks is safe for a camel but not for most mobs');
  assert.equal(camelFallDamage(6), 0, 'six is the boundary');
  assert.equal(camelFallDamage(7), 1, '0.5 rounds up to 1');
  assert.equal(camelFallDamage(8), 1);
  assert.equal(camelFallDamage(10), 2);
  assert.equal(camelFallDamage(0), 0);
  assert.equal(camelFallDamage(undefined), 0);
});

test('the dash travels 12 blocks forward and one up', () => {
  // Wiki: "When dashing, the camel launches up to 12 blocks forward and one block upward", and "Camels can
  // dash every 2.75 seconds".
  assert.deepEqual(CAMEL_DASH, { cooldownSeconds: 2.75, forward: 12, upward: 1 });
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.hasSaddle = true;
  camel.riderCount = 1;
  camel.yaw = 0;
  const gravity = 18;
  const velocity = camelDash(camel, { gravity, charged: true });
  assert.ok(velocity, 'the dash launched');
  const airtime = (2 * velocity.y) / gravity;
  const travelled = Math.hypot(velocity.x, velocity.z) * airtime;
  assert.ok(Math.abs(travelled - CAMEL_DASH.forward) < 0.01,
    `the dash travels 12 blocks, got ${travelled.toFixed(3)}`);
  const rise = (velocity.y * velocity.y) / (2 * gravity);
  assert.ok(Math.abs(rise - CAMEL_DASH.upward) < 1e-9, `rises one block, got ${rise.toFixed(3)}`);
  assert.equal(camel.dashCooldown, CAMEL_DASH.cooldownSeconds);
  // On cooldown it cannot dash again.
  assert.equal(camelDash(camel, { gravity }), null);
  // Once it expires, it can.
  assert.equal(updateCamelDash(camel, 1), false);
  assert.equal(updateCamelDash(camel, 2), true, 'it becomes ready');
  assert.ok(camelDash(camel, { gravity }));
});

test('the dash needs a saddle and a rider', () => {
  // Wiki: dashing uses the jump control "when the player rides them", so it needs both.
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.equal(camelDash(camel, { hasSaddle: false, riderCount: 1 }), null, 'no saddle, no dash');
  assert.equal(camelDash(camel, { hasSaddle: true, riderCount: 0 }), null, 'no rider, no dash');
  assert.ok(camelDash(camel, { hasSaddle: true, riderCount: 1 }), 'both present');
  // A baby never dashes.
  const baby = manager.spawnCamel(0, 1, 0, { isBaby: true, hasSaddle: true });
  baby.riderCount = 1;
  assert.equal(camelDash(baby, { hasSaddle: true, riderCount: 1 }), null, 'wiki: babies cannot be ridden');
});

test('an uncharged dash is shorter than a charged one', () => {
  // Wiki: "holding the control charges for a longer dashing", so a tap is shorter.
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.hasSaddle = true;
  camel.riderCount = 1;
  const gravity = 18;
  const charged = camelDash(camel, { gravity, charged: true, hasSaddle: true, riderCount: 1 });
  camel.dashCooldown = 0;
  const tapped = camelDash(camel, { gravity, charged: false, hasSaddle: true, riderCount: 1 });
  const chargedDistance = Math.hypot(charged.x, charged.z) * ((2 * charged.y) / gravity);
  const tappedDistance = Math.hypot(tapped.x, tapped.z) * ((2 * tapped.y) / gravity);
  assert.ok(tappedDistance < chargedDistance, 'a tap goes less far than a held charge');
  assert.ok(tappedDistance > 0);
});

test('it heals slowly on its own and by two from a cactus', () => {
  // Wiki: "Camels are healed by 2 health points each time they are fed a cactus" and "have a 1/900 chance
  // to regenerate 1 health point each game tick".
  assert.equal(CAMEL_CACTUS_HEAL, 2);
  assert.equal(CAMEL_REGEN_CHANCE, 1 / 900);
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.health = 20;
  assert.equal(feedCamelCactus(camel), 2, 'a cactus heals two');
  assert.equal(camel.health, 22);
  camel.health = camel.maxHealth;
  assert.equal(feedCamelCactus(camel), 0, 'no overheal');
  assert.equal(feedCamelCactus(manager.spawnCow(0, 1, 0)), 0);

  // The slow regeneration is a per-tick chance, so a whole second usually heals nothing but a long window
  // heals something.
  camel.health = 20;
  assert.equal(updateCamelRegen(camel, 1 / 20, () => 0.99), 0, 'one tick almost never heals');
  let healed = 0;
  for (let i = 0; i < 900; i++) healed += updateCamelRegen(camel, 1 / 20, () => 0);
  assert.ok(healed > 0, 'over 45 seconds it heals');
  assert.equal(updateCamelRegen(manager.spawnCow(0, 1, 0), 1), 0);
});

test('it can be saddled and unsaddled with shears', () => {
  // Wiki: a camel has one inventory slot for a saddle, and "Saddles can now be removed from camels using
  // shears."
  assert.deepEqual(CAMEL_EQUIPMENT, { item: 'saddle', remover: 'shears' });
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.equal(equipCamelSaddle(camel, 'saddle'), true);
  assert.equal(camel.hasSaddle, true);
  assert.equal(equipCamelSaddle(camel, 'saddle'), false, 'already saddled');
  assert.equal(removeCamelSaddle(camel, 'shears'), true);
  assert.equal(camel.hasSaddle, false);
  assert.equal(removeCamelSaddle(camel, 'shears'), false, 'nothing to remove');
  assert.equal(equipCamelSaddle(camel, 'wheat'), false, 'only a saddle fits');
  assert.equal(removeCamelSaddle(camel, 'saddle'), false, 'only shears remove it');
  // A baby cannot be equipped.
  const baby = manager.spawnCamel(0, 1, 0, { isBaby: true });
  assert.equal(equipCamelSaddle(baby, 'saddle'), false);
});

test('two players can ride, and a baby cannot', () => {
  // Wiki: "Up to two players can ride one camel", and "Baby camels cannot be equipped or ridden".
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.equal(camelCanBeRidden(camel), true, 'naturally tame, so no taming step');
  assert.equal(camelCanSeat(camel), true, 'the first seat is free');
  camel.riderCount = 1;
  assert.equal(camelCanSeat(camel), true, 'the second seat is free');
  camel.riderCount = 2;
  assert.equal(camelCanSeat(camel), false, 'no third seat');
  // Control needs a saddle; a passenger does not.
  assert.equal(camelCanBeControlled(camel), false, 'unsaddled cannot be steered');
  camel.hasSaddle = true;
  assert.equal(camelCanBeControlled(camel), true);
  const baby = manager.spawnCamel(0, 1, 0, { isBaby: true });
  assert.equal(camelCanBeRidden(baby), false);
  assert.equal(camelCanSeat(baby), false);
  assert.equal(camelCanBeControlled(baby), false);
});

test('a ridden camel cannot sit', () => {
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.riderCount = 1;
  assert.equal(camelSit(camel), false, 'a rider keeps it up');
  assert.equal(camel.isSitting, false);
});

test('a baby grows in 20 minutes, accelerated by 10 s per cactus', () => {
  // Wiki: "Baby camels take 24000 ticks (20 minutes) to grow up ... Each use takes 10 seconds off".
  assert.equal(CAMEL_BABY_GROWTH_SECONDS, 1200);
  assert.equal(CAMEL_CACTUS_GROWTH_SECONDS, 10);
  const { manager } = fixture();
  const baby = manager.spawnCamel(0, 1, 0, { isBaby: true });
  assert.equal(baby.growthTimer, 1200);
  assert.equal(baby.mesh.scale.x, CAMEL_BABY_SCALE);
  assert.equal(accelerateCamelGrowth(baby), 10, 'ten seconds off');
  assert.equal(baby.growthTimer, 1190);
  // A golden dandelion stops it, and feeding must not burn the timer silently.
  baby.ageLocked = true;
  assert.equal(accelerateCamelGrowth(baby), 0);
  assert.equal(updateCamelGrowth(baby, 100000), false);
  baby.ageLocked = false;
  let matured = false;
  for (let i = 0; i < 400 && !matured; i++) matured = updateCamelGrowth(baby, 5);
  assert.equal(matured, true);
  assert.equal(baby.isBaby, false);
  assert.deepEqual([baby.width, baby.height], [1.7, 2.375], 'the adult hitbox is restored');
  assert.equal(updateCamelGrowth(manager.spawnMob('camel', 0, 1, 0), 100000), false);
});

test('camels breed with cactus and follow within 10 blocks', () => {
  // Wiki: "Camels follow players holding cactus but stop following when separated ... by 10 blocks", and "A
  // player can breed camels by using cactus."
  assert.equal(CAMEL_BREEDING_FOOD, 'cactus');
  assert.equal(CAMEL_FOLLOW_RANGE, 10);
  assert.equal(isCamelBreedingFood('cactus'), true);
  assert.equal(isCamelBreedingFood('CACTUS'), true);
  for (const other of ['wheat', 'seagrass', 'spider_eye', '']) {
    assert.equal(isCamelBreedingFood(other), false, `${other} is not the breeding food`);
  }
  assert.deepEqual(BREEDING_FOODS.camel, ['cactus'], 'and it is registered for breeding');

  const { manager, player } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  player.position.set(8, 1, 0);
  assert.equal(camelFollows(camel, player, 'cactus'), true);
  assert.equal(camelFollows(camel, player, 'wheat'), false);
  player.position.set(40, 1, 0);
  assert.equal(camelFollows(camel, player, 'cactus'), false, 'beyond 10 blocks');
  // A baby follows an adult with no item.
  const baby = manager.spawnCamel(1, 1, 0, { isBaby: true });
  const adult = manager.spawnMob('camel', 3, 1, 0);
  assert.equal(camelFollows(baby, player, '', adult), true, 'wiki: baby camels follow adults');
});

test('it drops its saddle and a baby drops nothing', () => {
  // Wiki: "A saddle is dropped if the camel was already equipped with one", and "Killing a baby camel
  // yields neither items nor experience".
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.deepEqual(camelDrops(camel), [], 'no saddle, no drop');
  camel.hasSaddle = true;
  camel.playerDamaged = true;
  assert.deepEqual(camelDrops(camel), [['saddle', false, 1, 1]]);
  assert.deepEqual(manager.getMobDeathDrops(camel, () => 0.5), [['saddle', false, 1, 1]],
    'and it flows through the manager');
  const baby = manager.spawnCamel(5, 1, 0, { isBaby: true });
  baby.hasSaddle = true;
  baby.playerDamaged = true;
  assert.deepEqual(camelDrops(baby), [], 'a baby drops nothing');
  assert.deepEqual(manager.getMobDeathDrops(baby, () => 0.5), []);

  let sawValue = false;
  for (let i = 0; i < 40; i++) {
    const xp = camelXp(camel);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(camelXp(baby), 0, 'none for a baby');
  for (let i = 0; i < 40; i++) {
    const xp = camelBreedingXp();
    assert.ok(xp >= 1 && xp <= 7, `wiki: 1-7 XP on breeding, got ${xp}`);
  }
});

test('the model has exactly one hump and a saddle overlay', () => {
  // Wiki: "Minecraft camels are specifically based on the one-humped dromedary camel, though the first model
  // was based on the two-humped Bactrian camel."
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  assert.ok(camel.hump, 'a hump');
  assert.equal(camel.hump.geometry.parameters.height > 0, true);
  // One hump mesh, not two: the model exposes exactly one.
  assert.equal(camel.hump.geometry.parameters.depth, 0.9, 'a single wide hump');
  assert.ok(camel.neck && camel.head && camel.muzzle, 'a long neck and a small head');
  assert.equal(camel.legs.length, 4, 'four long legs');
  assert.equal(camel.eyes.length, 2);
  assert.ok(camel.tail);
  // The saddle is its own mesh, hidden until equipped.
  assert.ok(camel.saddleMesh, 'a saddle overlay');
  assert.equal(camel.saddleMesh.visible, false, 'hidden when unsaddled');
  assert.ok(CAMEL_COLORS.coat > 0);
  const model = createCamelModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial()
  );
  assert.ok(model.group && model.hump && model.saddle);
});

test('the sitting pose folds the legs and drops the body', () => {
  const { manager } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.groundY = 1;
  poseCamel(camel, 0);
  const standingY = camel.mesh.position.y;
  camelSit(camel);
  poseCamel(camel, 0);
  assert.ok(camel.mesh.position.y < standingY, 'the body drops when it sits');
  assert.equal(camel.legs.every(l => l.rotation.x > 1), true, 'and the legs fold under');
  camelStand(camel, 5);
  poseCamel(camel, 0);
  assert.equal(camel.mesh.position.y, 1, 'standing restores the height');
  assert.doesNotThrow(() => poseCamel(null));
  assert.doesNotThrow(() => poseCamel({}));
});

test('it walks through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(200, 1, 200);
  const camel = manager.spawnMob('camel', 0, 1, 0);
  const start = camel.mesh.position.clone();
  // Twenty seconds rather than fifteen. A camel sits for 2-7 seconds at a time, so a 15-second window could
  // in principle be mostly sitting -- which made the `moved > 0.1` assertion fail roughly once in eighteen
  // runs, measured. A longer window makes the premise (it gets to walk) reliable without weakening the claim.
  assert.doesNotThrow(() => {
    for (let i = 0; i < 1200; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(camel), 'still alive');
  assert.ok(camel.mesh.position.distanceTo(start) > 0.1, 'it moved around');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('it sits and stands through the real loop', () => {
  const { manager, player } = fixture();
  player.position.set(200, 1, 200);
  const camel = manager.spawnMob('camel', 0, 1, 0);
  const states = new Set();
  for (let i = 0; i < 3000; i++) {
    manager.update(1 / 60, player);
    if (camel.isSitting) states.add('sitting');
    else states.add('standing');
  }
  assert.equal(states.has('sitting'), true, 'it sat at some point');
  assert.equal(states.has('standing'), true, 'and stood again');
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('the Inspector can spawn the camel', () => {
  assert.ok(DEBUG_MOBS.includes('camel'), 'camel must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const camel = s.reset('camel');
  assert.equal(camel.type, 'camel');
  assert.equal(s.snapshot().maxHealth, 32, 'Inspector telemetry shows 32 HP');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.camel_spawn_egg, 'the camel has a spawn egg');
  assert.equal(ITEMS.camel_spawn_egg.mob, 'camel');
  assert.equal(ITEMS.camel_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.saddle, 'and a saddle item exists to equip');
});

test('the helpers are safe on non-camels and malformed input', () => {
  const { manager, player } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isCamel(cow), false);
  assert.equal(camelCanBeRidden(cow), false);
  assert.equal(camelCanBeControlled(cow), false);
  assert.equal(camelCanSeat(cow), false);
  assert.equal(equipCamelSaddle(cow, 'saddle'), false);
  assert.equal(removeCamelSaddle(cow, 'shears'), false);
  assert.equal(camelSit(cow), false);
  assert.equal(camelStand(cow), null);
  assert.equal(updateCamelSitting(cow, 1), null);
  assert.equal(camelDash(cow), null);
  assert.equal(updateCamelDash(cow, 1), false);
  assert.equal(updateCamelRegen(cow, 1), 0);
  assert.equal(feedCamelCactus(cow), 0);
  assert.equal(updateCamelGrowth(cow, 1), false);
  assert.equal(accelerateCamelGrowth(cow), 0);
  assert.equal(camelFollows(cow, player, 'cactus'), false);
  assert.deepEqual(camelDrops(cow), []);
  assert.equal(camelXp(cow), 0);
  // Hitbox lookup is safe on malformed input.
  assert.equal(camelDimensions(null).width, 1.7);
  assert.equal(camelDimensions({ type: 'camel', isSitting: true }).height, 0.945);
  assert.doesNotThrow(() => poseCamel(null));
  assert.equal(manager.spawnMob('camel', 9, 1, 9).type, 'camel');
});

test('camel height advantage protects mounted rider from short ground melee mobs', () => {
  const { manager, player } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  player.position.set(0, 3.1, 0); // mounted camera / player height on standing camel
  player.ridingMob = camel;

  const zombie = { height: 1.95, position: new THREE.Vector3(0, 1, 0) };
  const spider = { height: 0.9, position: new THREE.Vector3(0, 1, 0) };
  const silverfish = { height: 0.3, position: new THREE.Vector3(0, 1, 0) };
  const enderman = { height: 2.9, position: new THREE.Vector3(0, 1, 0) };
  const ironGolem = { height: 2.7, position: new THREE.Vector3(0, 1, 0) };

  // Wiki: "Due to the camel's height, most hostile melee mobs are unable to reach the player while riding,
  // including zombies, vindicators, husks, drowned, piglins, and silverfish."
  assert.equal(camelProtectsRiderFrom(zombie, player), true, 'protected from zombie');
  assert.equal(camelProtectsRiderFrom(spider, player), true, 'protected from spider');
  assert.equal(camelProtectsRiderFrom(silverfish, player), true, 'protected from silverfish');

  // Tall mobs can reach
  assert.equal(camelProtectsRiderFrom(enderman, player), false, 'not protected from enderman');
  assert.equal(camelProtectsRiderFrom(ironGolem, player), false, 'not protected from iron golem');

  // Sitting camel lowers the rider so protection is lost
  camel.isSitting = true;
  assert.equal(camelProtectsRiderFrom(zombie, player), false, 'sitting camel loses height protection');

  // Unmounted player has no camel height protection
  player.ridingMob = null;
  assert.equal(camelProtectsRiderFrom(zombie, player), false, 'unmounted player is not protected');
});

test('camel interacts with saddle, shears, cactus, and empty-hand mounting for two riders', () => {
  const { manager, player, entities } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.health = 20; // injured adult
  const inventory = {
    active: null,
    getActiveItem() { return this.active; },
    consumeActiveItem(n = 1) { if (this.active) this.active.count -= n; }
  };

  // 1. Equip saddle
  inventory.active = { id: 'saddle', count: 1 };
  assert.equal(manager.animalBehaviors.interact(camel, player, inventory), true);
  assert.equal(camel.hasSaddle, true);
  assert.equal(camel.saddleMesh?.visible, true);
  assert.equal(inventory.active.count, 0);

  // 2. Feed cactus to heal
  inventory.active = { id: 'cactus', count: 2 };
  assert.equal(manager.animalBehaviors.interact(camel, player, inventory), true);
  assert.equal(camel.health, 22, 'cactus heals camel by 2 HP');
  assert.equal(inventory.active.count, 1);

  // 3. Remove saddle with shears
  inventory.active = { id: 'shears', durability: 238 };
  assert.equal(manager.animalBehaviors.interact(camel, player, inventory), true);
  assert.equal(camel.hasSaddle, false);
  assert.equal(camel.saddleMesh?.visible, false);
  assert.ok(entities.droppedItems.some(d => d.itemType === 'saddle'));

  // 4. Mount with empty hand
  inventory.active = null;
  assert.equal(manager.animalBehaviors.interact(camel, player, inventory), true);
  assert.equal(player.ridingMob, camel);
  assert.equal(camel.riderCount, 1);
  assert.equal(camelCanSeat(camel), true, 'camel has space for a second rider');

  // 5. Second rider mounts
  const player2 = { position: new THREE.Vector3(), keys: {} };
  assert.equal(manager.animalBehaviors.mountMob(camel, player2), true);
  assert.equal(camel.riderCount, 2);
  assert.equal(camelCanSeat(camel), false, 'two players is the maximum capacity');

  // Dismounting clears seats
  manager.animalBehaviors.dismount(player);
  assert.equal(player.ridingMob, null);
  assert.equal(camel.riderCount, 1);
  assert.equal(camelCanSeat(camel), true);
});

test('mounted camel steering supports walk and sprint speed, 1.5m step height, and dash charge', () => {
  const { manager, player } = fixture();
  const camel = manager.spawnMob('camel', 0, 1, 0);
  camel.hasSaddle = true;
  manager.animalBehaviors.mountMob(camel, player);
  assert.equal(player.ridingMob, camel);

  // Steer forward while walking
  manager.animalBehaviors.updateMountSteering(0.1, player, { forward: true, sprint: false }, { forward: true });
  const walkSpeed = Math.hypot(camel.velocity.x, camel.velocity.z);
  assert.ok(Math.abs(walkSpeed - CAMEL_SPEED.walk) < 0.1, `walk speed matches CAMEL_SPEED.walk: ${walkSpeed}`);
  assert.equal(camel.stepHeight, 1.5, 'stepHeight is 1.5m');

  // Steer forward while sprinting
  manager.animalBehaviors.updateMountSteering(0.1, player, { forward: true, sprint: true }, { forward: true });
  const sprintSpeed = Math.hypot(camel.velocity.x, camel.velocity.z);
  assert.ok(Math.abs(sprintSpeed - CAMEL_SPEED.sprint) < 0.1, `sprint speed matches CAMEL_SPEED.sprint: ${sprintSpeed}`);

  // Jump charge and dash release
  camel.onGround = true;
  camel.dashCooldown = 0;
  // Hold jump to charge
  manager.animalBehaviors.updateMountSteering(0.5, player, { jump: true }, {});
  assert.ok(manager.animalBehaviors.isChargingJump);
  assert.ok(manager.animalBehaviors.jumpCharge >= 0.5);

  // Release jump to dash
  manager.animalBehaviors.updateMountSteering(0.1, player, { jump: false }, {});
  assert.equal(manager.animalBehaviors.isChargingJump, false);
  assert.ok(camel.isDashing, 'camel launched dash');
});

