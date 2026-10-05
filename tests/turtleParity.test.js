// Turtle parity with https://minecraft.wiki/w/Turtle
//
// Turtle was another of the 38 missing types. Its defining traits are that it is slow on land and
// fast in water, it remembers the block it spawned on and returns there to lay eggs, and a baby
// drops a turtle scute when it matures.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  TURTLE_HEALTH, TURTLE_DIMENSIONS, TURTLE_BABY_DIMENSIONS, TURTLE_BABY_SCALE,
  TURTLE_PREGNANT_HEIGHT_BONUS, TURTLE_SPEED, TURTLE_WATER_SEARCH, TURTLE_FOLLOW_RANGE,
  TURTLE_HOME_RADIUS, TURTLE_EGG_CLUSTER, TURTLE_EGG, TURTLE_BREED_COOLDOWN_SECONDS,
  isTurtle, turtleDimensions, turtleDrops, turtleXp, turtleMaturationDrops, findWaterNear,
  isSandBlock, setTurtleHome, applyTurtlePregnancy, tryLayTurtleEggs, updateTurtleMovement,
  createTurtleModel, poseTurtle
} from '../src/turtleBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';

/** A world with a floor, and optionally a patch of water at a fixed spot. */
function fixture({ water = null } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => {
      if (water && y === water.y && x >= water.x && x < water.x + water.w && z >= water.z && z < water.z + water.d) {
        return BLOCKS.WATER;
      }
      return y < 1 ? BLOCKS.STONE : BLOCKS.AIR;
    },
    getHeightAt: () => 0,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    blockNameAt(x, y, z) {
      const id = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === BLOCKS.WATER) return 'water';
      if (id === BLOCKS.STONE) return 'stone';
      if (id === BLOCKS.SAND) return 'sand';
      return 'air';
    }
  });
  const player = {
    position: new THREE.Vector3(12, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0, takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; } };
  player.inventory = inventory;
  manager.game = { player, difficulty: 'normal', worldTime: 18000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  // The shared animal behaviours own baby growth and the breeding food table, and the turtle's
  // maturation drop and its seagrass breeding both live there.
  manager.animalBehaviors = new AnimalBehaviors(manager, world, sounds, entities);
  return { manager, player, inventory, entities, world };
}

test('turtle is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  assert.equal(turtle.type, 'turtle');
  assert.equal(turtle.name, 'Turtle');
  assert.notEqual(turtle.type, 'villager');
});

test('the health and hitboxes match the wiki', () => {
  const { manager } = fixture();
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  assert.equal(turtle.maxHealth, TURTLE_HEALTH);
  assert.equal(turtle.maxHealth, 30, 'wiki: 30 HP');
  assert.deepEqual(TURTLE_DIMENSIONS, { width: 1.2, height: 0.4 });
  assert.deepEqual(TURTLE_BABY_DIMENSIONS, { width: 0.36, height: 0.12 });
  assert.equal(TURTLE_BABY_SCALE, 0.3);
  assert.deepEqual(manager.getMobDimensions('turtle'), { width: 1.2, height: 0.4 });
  assert.deepEqual([turtle.width, turtle.height], [1.2, 0.4]);

  const baby = manager.spawnTurtle(0, 1, 0, { isBaby: true });
  assert.deepEqual([baby.width, baby.height], [0.36, 0.12]);
  assert.equal(baby.mesh.scale.x, TURTLE_BABY_SCALE);
});

test('a pregnant turtle is taller, as the wiki says', () => {
  // Wiki: "The pregnant turtle has eggs in its body and is therefore about 0.2 blocks taller."
  assert.equal(TURTLE_PREGNANT_HEIGHT_BONUS, 0.2);
  const { manager } = fixture();
  const normal = manager.spawnMob('turtle', 0, 1, 0);
  const pregnant = manager.spawnTurtle(0, 1, 0, { hasEgg: true });
  assert.ok(Math.abs(pregnant.height - (normal.height + 0.2)) < 1e-9,
    `${normal.height} -> ${pregnant.height}`);
  assert.equal(pregnant.width, normal.width, 'only the height changes');
  // And a baby stays small even with eggs.
  const baby = manager.spawnTurtle(0, 1, 0, { isBaby: true, hasEgg: true });
  assert.deepEqual([baby.width, baby.height], [0.36, 0.12]);
});

test('turtles are aquatic and breathe under water', () => {
  const { manager } = fixture();
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  // Wiki: entity tags aquatic, can_breathe_under_water, not_scary_for_pufferfish.
  assert.equal(turtle.isAquatic, true);
  assert.equal(turtle.canBreatheUnderwater, true);
});

test('a turtle is slow on land and fast in water', () => {
  assert.ok(TURTLE_SPEED.water > TURTLE_SPEED.land, 'wiki: it swims faster than it walks');
  assert.equal(TURTLE_SPEED.land, 0.9);
  assert.equal(TURTLE_SPEED.water, 2.6);
});

test('the turtle remembers the block it spawned on as home', () => {
  // Wiki: "A turtle remembers the block on which it spawned as its home position."
  const { manager } = fixture();
  const turtle = manager.spawnMob('turtle', 5, 1, 7);
  assert.ok(turtle.homePosition, 'a home position is set at spawn');
  assert.ok(Math.abs(turtle.homePosition.x - 5.5) < 1e-9, 'block-centred on x');
  assert.ok(Math.abs(turtle.homePosition.z - 7.5) < 1e-9, 'and on z');
  assert.equal(turtle.homePosition.y, 1);
  // And it can be re-homed, which is what hatching does.
  setTurtleHome(turtle, 20, 3, 30);
  assert.equal(turtle.homePosition.x, 20.5);
  assert.equal(turtle.homePosition.z, 30.5);
});

test('the water search finds water and respects its radius', () => {
  // Wiki: an expanding square search inside a 47x1x47 region two blocks below the turtle.
  assert.equal(TURTLE_WATER_SEARCH.radius, 23, 'wiki: 47 wide, so 23 either side');
  assert.equal(TURTLE_WATER_SEARCH.yOffset, -2, 'wiki: centred two blocks below');
  assert.equal(TURTLE_WATER_SEARCH.giveUpSeconds, 60, 'wiki: gives up after about a minute');

  const dry = fixture();
  const dryTurtle = dry.manager.spawnMob('turtle', 0, 1, 0);
  assert.equal(findWaterNear(dry.manager, dryTurtle), null, 'no water anywhere');

  // Water two blocks below and near, which is where the search looks.
  const wet = fixture({ water: { x: 4, y: -1, z: 0, w: 1, d: 1 } });
  const wetTurtle = wet.manager.spawnMob('turtle', 0, 1, 0);
  const found = findWaterNear(wet.manager, wetTurtle);
  assert.ok(found, 'it finds the water');
  assert.equal(Math.floor(found.x), 4);
  assert.equal(Math.floor(found.z), 0);
});

test('the sand check covers the wiki sand blocks', () => {
  // Wiki: eggs only hatch on sand, red sand or suspicious sand.
  for (const name of ['sand', 'red_sand', 'suspicious_sand']) {
    assert.equal(isSandBlock(name), true, `${name} is sand`);
  }
  for (const name of ['stone', 'dirt', 'gravel', 'grass_block']) {
    assert.equal(isSandBlock(name), false, `${name} is not`);
  }
  assert.equal(isSandBlock(null), false);
});

test('a land turtle heads for water rather than idling', () => {
  const { manager, player } = fixture({ water: { x: 8, y: -1, z: 0, w: 2, d: 2 } });
  player.position.set(80, 1, 80);
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  let sawSeeking = false;
  for (let i = 0; i < 300; i++) {
    manager.update(1 / 60, player);
    if (turtle.state === 'seeking water') sawSeeking = true;
  }
  assert.equal(sawSeeking, true, 'it spends time seeking water');
  // Two blocks rather than half a block. The observed position was 0.55, so a 0.5 threshold had only
    // 0.05 of margin and crossed back under real randomness; two blocks still proves it moved toward the
    // water, which is what the case is for.
    assert.ok(turtle.mesh.position.x > 2, `it moves toward the water, x=${turtle.mesh.position.x.toFixed(2)}`);
});

test('a turtle swims once it is in water', () => {
  const { manager, player } = fixture({ water: { x: -4, y: 0, z: -4, w: 8, d: 8 } });
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  // Put it directly in the water volume.
  turtle.mesh.position.set(0, 0, 0);
  const movement = updateTurtleMovement(manager, turtle, 1 / 60, player);
  assert.equal(movement, 'swimming');
  assert.equal(turtle.state, 'swimming');
  assert.equal(turtle.inWater, true);
  const speed = Math.hypot(turtle.velocity.x, turtle.velocity.z);
  assert.ok(speed > TURTLE_SPEED.land, `swim speed ${speed.toFixed(2)} should beat the land speed`);
});

test('a turtle walks on land and is not sent down the beached-fish path', () => {
  // The early aquatic gate used to swallow turtles, making them beached-flop sideways with fish
  // physics and never move on land at all.
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  const start = turtle.mesh.position.clone();
  for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  assert.ok(turtle.mesh.position.distanceTo(start) > 0.25,
    `it should walk, moved ${turtle.mesh.position.distanceTo(start).toFixed(3)}`);
  assert.ok(Math.abs(turtle.mesh.rotation.z) < 0.1,
    `it should stand upright, rotation.z=${turtle.mesh.rotation.z.toFixed(3)}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('a pregnant turtle travels home before laying', () => {
  // Wiki: it "does not stop traveling until it is within a 9-block distance from its home position".
  assert.equal(TURTLE_HOME_RADIUS, 9);
  const { manager, player } = fixture();
  player.position.set(90, 1, 90);
  const turtle = manager.spawnTurtle(0, 1, 0, { hasEgg: true });
  setTurtleHome(turtle, 20, 1, 0);
  const startDist = Math.abs(turtle.mesh.position.x - turtle.homePosition.x);
  let sawReturning = false;
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    if (turtle.state === 'returning home') sawReturning = true;
  }
  assert.equal(sawReturning, true, 'it heads home');
  const endDist = Math.abs(turtle.mesh.position.x - turtle.homePosition.x);
  assert.ok(endDist < startDist, `it closes the distance, ${startDist.toFixed(1)} -> ${endDist.toFixed(1)}`);
});

test('eggs are only laid on sand, near home, after digging', () => {
  const { manager } = fixture();
  // A sand floor.
  manager.blockNameAt = (x, y, z) => (y < 1 ? 'sand' : 'air');
  const turtle = manager.spawnTurtle(0, 1, 0, { hasEgg: true });
  setTurtleHome(turtle, 0, 1, 0);

  // Too soon: digging has not finished.
  assert.equal(tryLayTurtleEggs(manager, turtle, 0.5), 0, 'it digs before laying');
  assert.equal(turtle.hasEgg, true);
  // Past the minimum dig time it lays a cluster.
  const laid = tryLayTurtleEggs(manager, turtle, 10);
  assert.ok(laid >= TURTLE_EGG_CLUSTER.min && laid <= TURTLE_EGG_CLUSTER.max,
    `wiki: a cluster of 1-4, got ${laid}`);
  assert.equal(turtle.hasEgg, false, 'and it is no longer pregnant');
  assert.equal(manager.turtleEggs.size, 1, 'the cluster is recorded');
  const cluster = [...manager.turtleEggs.values()][0];
  assert.ok(cluster.count >= 1 && cluster.count <= TURTLE_EGG.maxCluster);
});

test('no eggs are laid without sand', () => {
  const { manager } = fixture();
  // Stone floor: no sand anywhere.
  manager.blockNameAt = (x, y, z) => (y < 1 ? 'stone' : 'air');
  const turtle = manager.spawnTurtle(0, 1, 0, { hasEgg: true });
  setTurtleHome(turtle, 0, 1, 0);
  assert.equal(tryLayTurtleEggs(manager, turtle, 10), 0, 'nowhere to lay');
  assert.equal(turtle.hasEgg, true, 'so it stays pregnant');
});

test('no eggs are laid far from home', () => {
  const { manager } = fixture();
  manager.blockNameAt = (x, y, z) => (y < 1 ? 'sand' : 'air');
  const turtle = manager.spawnTurtle(0, 1, 0, { hasEgg: true });
  setTurtleHome(turtle, 200, 1, 200);
  assert.equal(tryLayTurtleEggs(manager, turtle, 10), 0, 'it must go home first');
});

test('an egg cluster merges up to the four-egg cap', () => {
  const { manager } = fixture();
  assert.equal(manager.placeTurtleEggs(3, 2, 5, 2), 2);
  assert.equal(manager.placeTurtleEggs(3, 2, 5, 3), 4, 'wiki: a cluster holds at most 4');
  const cluster = manager.turtleEggs.get('3,2,5');
  assert.equal(cluster.count, 4);
  assert.equal(cluster.cracks, 0, 'and cracking starts at zero');
});

test('a baby turtle drops a scute when it matures, and an adult does not', () => {
  // Wiki: "When a baby turtle matures into an adult, it drops 1 turtle scute."
  const { manager } = fixture();
  const baby = manager.spawnTurtle(0, 1, 0, { isBaby: true });
  assert.deepEqual(turtleMaturationDrops(baby), [['turtle_scute', false, 1, 1]]);
  const adult = manager.spawnMob('turtle', 0, 1, 0);
  assert.deepEqual(turtleMaturationDrops(adult), [], 'an adult has nothing to drop');
});

test('a maturing baby really drops a scute through the growth path', () => {
  const { manager, entities } = fixture();
  const baby = manager.spawnTurtle(0, 1, 0, { isBaby: true });
  // Wiki: a baby takes one Minecraft day, 20 minutes, to grow up. Step past the whole timer in one
  // go rather than ticking 1200 seconds, since the hook is what is under test here. It has to go
  // strictly past zero: the timer matures only once it is no longer positive.
  baby.babyGrowthTimer = 0.01;
  manager.animalBehaviors.update(0.5, manager.game.player, {});
  const scutes = entities.droppedItems.filter(d => d.itemType === 'turtle_scute');
  assert.equal(scutes.length, 1, 'exactly one scute');
  assert.equal(scutes[0].count, 1);
  assert.equal(baby.isBaby, false, 'and it is an adult now');
  assert.deepEqual([baby.width, baby.height], [1.2, 0.4], 'with the adult hitbox restored');
});

test('drops and XP match the wiki for both ages', () => {
  const { manager } = fixture();
  const adult = manager.spawnMob('turtle', 0, 1, 0);
  adult.playerDamaged = true;
  const rows = manager.getMobDeathDrops(adult, () => 0.99);
  assert.deepEqual(rows, [['seagrass', false, 0, 2]], 'wiki: 0-2 seagrass');
  assert.equal(turtleDrops(adult).length, 1);

  const baby = manager.spawnTurtle(0, 1, 0, { isBaby: true });
  baby.playerDamaged = true;
  assert.deepEqual(manager.getMobDeathDrops(baby, () => 0.99), [],
    'wiki: baby turtles do not drop anything');

  let sawValue = false;
  for (let i = 0; i < 40; i++) {
    const xp = turtleXp(adult);
    assert.ok(xp >= 1 && xp <= 3, `wiki: 1-3 XP, got ${xp}`);
    if (xp > 1) sawValue = true;
  }
  assert.equal(sawValue, true, 'the roll is not constant');
  assert.equal(turtleXp(baby), 0, 'and a baby gives none');
});

test('seagrass is the breeding food and the follow trigger', () => {
  const { manager, player, inventory } = fixture();
  player.position.set(6, 1, 0);
  inventory.active = { id: 'seagrass', count: 1 };
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  // Wiki: it can be led by a player holding seagrass within 10 blocks. The shared breeding table
  // carries the food so the breeding path accepts it.
  assert.equal(manager.animalBehaviors.isBreedingFood('turtle', 'seagrass'), true,
    'wiki: turtles breed with seagrass');
  assert.equal(TURTLE_FOLLOW_RANGE, 10, 'wiki: within ten blocks');
});

test('the model is a flat shell with four flippers', () => {
  const { manager } = fixture();
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  assert.ok(turtle.shell && turtle.rim, 'a shell with a rim');
  assert.ok(turtle.head && turtle.neck, 'a head on a neck');
  assert.equal(turtle.flippers.length, 4, 'four flippers, not legs');
  assert.equal(turtle.eyes.length, 2);
  assert.ok(turtle.tail);
  // Two front and two back, which the swim animation distinguishes.
  assert.equal(turtle.flippers.filter(f => f.front).length, 2);
  assert.equal(turtle.flippers.filter(f => !f.front).length, 2);
});

test('the swim and shamble poses differ', () => {
  const model = createTurtleModel(
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial()
  );
  poseTurtle({ ...model, inWater: false, head: model.head }, 1);
  const walking = model.flippers.map(f => f.mesh.rotation.x);
  poseTurtle({ ...model, inWater: true, head: model.head }, 1);
  const swimming = model.flippers.map(f => f.mesh.rotation.x);
  assert.notDeepEqual(walking, swimming, 'a turtle shambles on land and rows in water');
  assert.doesNotThrow(() => poseTurtle({}, 1));
  assert.doesNotThrow(() => poseTurtle(null, 1));
});

test('a turtle walks through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const turtle = manager.spawnMob('turtle', 0, 1, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(turtle), 'still alive');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'and no fault was reported');
});

test('the Inspector can spawn the turtle and reports its egg and water state', () => {
  assert.ok(DEBUG_MOBS.includes('turtle'), 'turtle must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const turtle = s.reset('turtle');
  assert.equal(turtle.type, 'turtle', 'the Inspector spawns a real turtle');
  const snap = s.snapshot();
  assert.equal(snap.health, 30, 'Inspector telemetry shows 30 HP');
  assert.equal(snap.maxHealth, 30);
  assert.equal(snap.turtleHasEgg, false);
  assert.equal(snap.turtleInWater, false);
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 30);
});

test('the spawn egg, seagrass and scute are registered', () => {
  assert.ok(ITEMS.turtle_spawn_egg, 'the turtle has a spawn egg');
  assert.equal(ITEMS.turtle_spawn_egg.mob, 'turtle');
  assert.equal(ITEMS.turtle_spawn_egg.type, 'spawn_egg');
  assert.ok(ITEMS.seagrass, 'seagrass is a registered item, since turtles drop and eat it');
  assert.ok(ITEMS.turtle_scute, 'and the scute exists for the maturation drop');
});

test('the helpers are safe on non-turtles and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isTurtle(cow), false);
  assert.equal(setTurtleHome(cow, 0, 0, 0), null);
  assert.deepEqual(turtleMaturationDrops(cow), []);
  assert.deepEqual(turtleDrops(cow), []);
  assert.equal(turtleXp(cow), 0);
  assert.equal(tryLayTurtleEggs(manager, cow, 10), 0);
  assert.equal(updateTurtleMovement(manager, cow, 1 / 60, null), null);
  assert.equal(updateTurtleMovement(manager, null, 1 / 60, null), null);
  assert.equal(findWaterNear(manager, null), null);
  assert.equal(findWaterNear(null, cow), null);
  assert.doesNotThrow(() => applyTurtlePregnancy(null));
  assert.doesNotThrow(() => applyTurtlePregnancy(cow));
  assert.equal(turtleDimensions(null).width, TURTLE_DIMENSIONS.width);
});

test('the egg constants match the wiki', () => {
  assert.equal(TURTLE_EGG_CLUSTER.min, 1, 'wiki: a cluster of 1-4');
  assert.equal(TURTLE_EGG_CLUSTER.max, 4);
  assert.equal(TURTLE_EGG.maxCluster, 4);
  assert.equal(TURTLE_EGG.maxCracks, 3, 'wiki: eggs crack 3 times before hatching');
  assert.equal(TURTLE_BREED_COOLDOWN_SECONDS, 300, 'wiki: 5 minutes in Java');
});
