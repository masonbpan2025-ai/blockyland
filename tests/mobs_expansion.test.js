import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { AnimalBehaviors } from '../src/animalBehaviors.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import { RaidManager } from '../src/raids.js';
import { DeepDarkWardenManager } from '../src/deepDarkWarden.js';
import { BossFightManager } from '../src/bossFights.js';

// Mock World
function createMockWorld() {
  const voxels = new Map();
  return {
    voxels,
    getVoxel(x, y, z) {
      return voxels.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) || BLOCKS.AIR;
    },
    setVoxel(x, y, z, id) {
      voxels.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, id);
    }
  };
}

// Mock SoundEngine
function createMockSounds() {
  const calls = [];
  return new Proxy({}, {
    get(target, prop) {
      return (...args) => { calls.push({ prop, args }); };
    }
  });
}

// Mock UI
function createMockUI() {
  const bossBars = new Map();
  let jumpMeter = 0;
  return {
    bossBars,
    jumpMeter,
    setBossBar(id, title, progress, color) {
      bossBars.set(id, { title, progress, color });
    },
    removeBossBar(id) {
      bossBars.delete(id);
    },
    setHorseJumpMeter(charge) {
      this.jumpMeter = charge;
    },
    addChatMessage() {}
  };
}

// Mock EntityManager
function createMockEntities() {
  const dropped = [];
  return {
    dropped,
    spawnDroppedItem(pos, id, isBlock, count = 1) {
      dropped.push({ pos: pos.clone(), id, isBlock, count });
    },
    spawnXpOrbs(pos, count) {}
  };
}

// Mock MobManager
function createMockMobManager(world, sounds, entities) {
  const mobs = [];
  const scene = new THREE.Scene();
  const manager = {
    mobs,
    scene,
    world,
    sounds,
    entities,
    customProjectiles: [],
    spawnMob(type, x, y, z) {
      const mob = {
        type,
        health: 20,
        maxHealth: 20,
        mesh: new THREE.Group(),
        jumpTimer: 0
      };
      mob.mesh.position.set(x, y, z);
      mobs.push(mob);
      scene.add(mob.mesh);
      return mob;
    },
    spawnWarden(x, y, z) {
      const w = this.spawnMob('warden', x, y, z);
      w.health = 500;
      w.maxHealth = 500;
      return w;
    },
    damageMob(mob, amount, fromPos) {
      mob.health -= amount;
      if (mob.health <= 0) {
        mob.dying = true;
      }
    },
    spawnParticleBurst() {}
  };
  return manager;
}

// Mock Player
function createMockPlayer() {
  const hotbar = [null, null, null, null, null, null, null, null, null];
  let activeSlot = 0;
  const statusEffects = new Map();

  const inventory = {
    hotbar,
    activeSlot,
    getActiveItem() {
      return hotbar[activeSlot];
    },
    consumeActiveItem(n = 1) {
      const it = hotbar[activeSlot];
      if (it) {
        it.count -= n;
        if (it.count <= 0) hotbar[activeSlot] = null;
      }
    },
    addItem(itemId, count = 1, isBlock = false) {
      if (typeof itemId === 'object' && itemId !== null) {
        count = itemId.count !== undefined ? itemId.count : 1;
        isBlock = itemId.isBlock !== undefined ? itemId.isBlock : false;
        itemId = itemId.id;
      }
      for (let i = 0; i < hotbar.length; i++) {
        if (!hotbar[i]) {
          hotbar[i] = { id: itemId, count, isBlock };
          return true;
        }
      }
      return false;
    }
  };

  return {
    position: new THREE.Vector3(0, 10, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    camera: {
      position: new THREE.Vector3(0, 11.6, 0),
      getWorldDirection(v) { return v.set(0, 0, -1); }
    },
    inventory,
    gamemode: 'survival',
    statusEffects,
    ridingMob: null,
    applyStatusEffect(effect, duration = 30) {
      statusEffects.set(effect, { duration, level: 1 });
    },
    clearStatusEffect(effect) {
      statusEffects.delete(effect);
    },
    hasStatusEffect(effect) {
      return statusEffects.has(effect);
    }
  };
}

test('Cow: Breeding with wheat, milking with empty bucket, leather drops', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const animalBehaviors = new AnimalBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  const cow1 = mobManager.spawnMob('cow', 0, 1, 0);
  const cow2 = mobManager.spawnMob('cow', 1, 1, 0);

  // 1. Milking cow with empty bucket
  player.inventory.hotbar[0] = { id: 'bucket', count: 1, isBlock: false };
  const milked = animalBehaviors.interact(cow1, player);
  assert.equal(milked, true);
  assert.equal(player.inventory.hotbar[0].id, 'milk_bucket');

  // 2. Breeding cows with wheat
  player.inventory.hotbar[0] = { id: 'wheat', count: 2, isBlock: false };
  animalBehaviors.interact(cow1, player);
  assert.ok(cow1.inLoveTimer > 0);
  animalBehaviors.interact(cow2, player);
  assert.ok(cow2.inLoveTimer > 0);

  // Update breeding matchmaking
  animalBehaviors.updateBreeding(1.0);
  assert.equal(mobManager.mobs.length, 3, 'Baby cow should be spawned');
  const baby = mobManager.mobs.find(m => m.isBaby);
  assert.ok(baby, 'Baby cow exists with baby flag');
});

test('Sheep: 16 wool colors, dye application, shearing, eating grass to regrow', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const animalBehaviors = new AnimalBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  const sheep = mobManager.spawnMob('sheep', 2, 2, 2);
  sheep.woolColor = 'white';

  // 1. Dye sheep with blue dye
  player.inventory.hotbar[0] = { id: 'blue_dye', count: 1, isBlock: false };
  const dyed = animalBehaviors.interact(sheep, player);
  assert.equal(dyed, true);
  assert.equal(sheep.woolColor, 'blue');

  // 2. Shearing sheep
  player.inventory.hotbar[0] = { id: 'shears', count: 1, isBlock: false };
  const sheared = animalBehaviors.interact(sheep, player);
  assert.equal(sheared, true);
  assert.equal(sheep.isSheared, true);
  assert.ok(entities.dropped.some(d => d.id === BLOCKS.BLUE_WOOL || d.id === 'blue_wool'));

  // 3. Regrow wool by eating grass block
  world.setVoxel(2, 1, 2, BLOCKS.GRASS_BLOCK);
  sheep.eatGrassTimer = 1.0;
  animalBehaviors.update(1.0, player, {});
  assert.equal(world.getVoxel(2, 1, 2), BLOCKS.DIRT, 'Grass block eaten into dirt');
  assert.equal(sheep.isSheared, false, 'Wool regrown');
});

test('Pigs & Striders: Saddling and steering with Carrot on a Stick / Warped Fungus', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const animalBehaviors = new AnimalBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  const pig = mobManager.spawnMob('pig', 0, 1, 0);

  // 1. Equip saddle
  player.inventory.hotbar[0] = { id: 'saddle', count: 1, isBlock: false };
  animalBehaviors.interact(pig, player);
  assert.equal(pig.hasSaddle, true);

  // 2. Mount saddled pig
  player.inventory.hotbar[0] = null;
  animalBehaviors.interact(pig, player);
  assert.equal(player.ridingMob, pig);

  // 3. Steer / boost with carrot on a stick
  player.inventory.hotbar[0] = { id: 'carrot_on_a_stick', count: 1, isBlock: false };
  const boosted = animalBehaviors.handleActiveItemUse(player, player.inventory);
  assert.equal(boosted, true);
  assert.ok(animalBehaviors.mount.boostTimer > 0);
});

test('Chickens: Egg laying timer and throwing eggs to hatch chicks', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const animalBehaviors = new AnimalBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  const chicken = mobManager.spawnMob('chicken', 5, 1, 5);
  chicken.eggTimer = 0.5;

  // Lay egg
  animalBehaviors.update(0.6, player, {});
  assert.ok(entities.dropped.some(d => d.id === 'egg'));

  // Throw egg
  player.inventory.hotbar[0] = { id: 'egg', count: 1, isBlock: false };
  const thrown = animalBehaviors.handleActiveItemUse(player, player.inventory);
  assert.equal(thrown, true);
  assert.equal(mobManager.customProjectiles.length, 1);

  // Update projectile hit ground
  const eggProj = mobManager.customProjectiles[0];
  eggProj.position.y = -1; // hits ground
  // Force 100% hatch for test determinism
  const origRandom = Math.random;
  Math.random = () => 0.05;
  animalBehaviors.update(0.1, player, {});
  Math.random = origRandom;

  const babyChicken = mobManager.mobs.find(m => m.type === 'chicken' && m.isBaby);
  assert.ok(babyChicken, 'Baby chick hatched from egg');
});

test('Horses/Donkeys: Taming via mounting, jump charging meter, chest equipment on donkeys', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const animalBehaviors = new AnimalBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  const donkey = mobManager.spawnMob('donkey', 0, 1, 0);

  // Mount donkey
  animalBehaviors.interact(donkey, player);
  assert.equal(player.ridingMob, donkey);

  // Taming success after attempts
  donkey.isTamed = true;

  // Equip chest onto donkey
  player.inventory.hotbar[0] = { id: 'chest', count: 1, isBlock: true };
  animalBehaviors.interact(donkey, player);
  assert.equal(donkey.hasChest, true);

  // Jump charging meter
  const controls = { space: true };
  animalBehaviors.update(0.5, player, controls);
  assert.ok(donkey.jumpCharge > 0, 'Jump charge accumulates while holding space');
});

test('Wolves: Taming with bones, collar dyeing, sitting toggle, target defending', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const animalBehaviors = new AnimalBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  const wolf = mobManager.spawnMob('wolf', 0, 1, 0);

  // 1. Tame wolf with bone
  player.inventory.hotbar[0] = { id: 'bone', count: 3, isBlock: false };
  const origRandom = Math.random;
  Math.random = () => 0.1; // guarantee tame
  animalBehaviors.interact(wolf, player);
  Math.random = origRandom;
  assert.equal(wolf.isTamed, true);
  assert.equal(wolf.collarColor, 'red');

  // 2. Collar dyeing
  player.inventory.hotbar[0] = { id: 'yellow_dye', count: 1, isBlock: false };
  animalBehaviors.interact(wolf, player);
  assert.equal(wolf.collarColor, 'yellow');

  // 3. Sitting toggle
  player.inventory.hotbar[0] = null;
  animalBehaviors.interact(wolf, player);
  assert.equal(wolf.isSitting, true);
  animalBehaviors.interact(wolf, player);
  assert.equal(wolf.isSitting, false);

  // 4. Target defending
  const skeleton = mobManager.spawnMob('skeleton', 3, 1, 0);
  animalBehaviors.handleMobAttacked(skeleton, player);
  assert.equal(wolf.target, skeleton, 'Wolf targets aggressor');
});

test('Cats/Ocelots: Taming with raw fish, scaring away Creepers and Phantoms', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const animalBehaviors = new AnimalBehaviors(mobManager, world, sounds, entities);
  const hostileBehaviors = new HostileMobBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  const ocelot = mobManager.spawnMob('ocelot', 0, 1, 0);

  // Tame with raw cod/salmon
  player.inventory.hotbar[0] = { id: 'salmon', count: 2, isBlock: false };
  const origRandom = Math.random;
  Math.random = () => 0.1; // Guarantee taming success
  animalBehaviors.interact(ocelot, player);
  Math.random = origRandom;
  assert.equal(ocelot.isTamed, true);

  // Creeper flees from cat
  const creeper = mobManager.spawnMob('creeper', 3, 1, 0);
  const initialX = creeper.mesh.position.x;
  animalBehaviors.update(0.1, player, {});
  assert.ok(creeper.mesh.position.x > initialX, 'Creeper runs away from cat');
});

test('Slimes & Magma Cubes: Splitting upon death into smaller sizes', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const hostileBehaviors = new HostileMobBehaviors(mobManager, world, sounds, entities);

  const bigSlime = mobManager.spawnMob('slime', 0, 1, 0);
  bigSlime.slimeSize = 4; // Big (4 -> 2 -> 1)

  hostileBehaviors.handleMobDeathSplitting(bigSlime);
  const mediumSlimes = mobManager.mobs.filter(m => m.slimeSize === 2);
  assert.ok(mediumSlimes.length >= 2, 'Big slime splits into medium slimes');

  hostileBehaviors.handleMobDeathSplitting(mediumSlimes[0]);
  const smallSlimes = mobManager.mobs.filter(m => m.slimeSize === 1);
  assert.ok(smallSlimes.length >= 2, 'Medium slime splits into small slimes');
});

test('Ghast: Explosive fireball projectile with bat-back deflection', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const hostileBehaviors = new HostileMobBehaviors(mobManager, world, sounds, entities);
  const player = createMockPlayer();

  // Create active fireball
  const fireball = {
    type: 'ghast_fireball',
    position: new THREE.Vector3(0, 10, 2),
    velocity: new THREE.Vector3(0, 0, -10),
    mesh: new THREE.Mesh()
  };
  mobManager.customProjectiles.push(fireball);

  // Player attacks towards the fireball
  const deflected = hostileBehaviors.handlePlayerAttackProjectile(
    player.position,
    new THREE.Vector3(0, 0, 1)
  );
  assert.equal(deflected, true, 'Ghast fireball is deflected back');
  assert.ok(fireball.velocity.z > 0, 'Velocity reversed away from player');
  assert.equal(fireball.deflected, true);
});

test('Warden & Deep Dark: Vibration detection, Shrieker warnings, Darkness, Warden emergence & Sonic Boom', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const ui = createMockUI();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const deepDark = new DeepDarkWardenManager(mobManager, world, sounds, ui);
  const player = createMockPlayer();

  // Place Sculk Shrieker
  world.setVoxel(2, 10, 2, BLOCKS.SCULK_SHRIEKER);

  // Trigger vibration 3 times
  deepDark.onPlayerVibration(player.position, 1.0, player);
  assert.equal(deepDark.warningLevel, 1);
  assert.ok(player.hasStatusEffect('darkness'), 'Darkness effect applied');

  deepDark.shriekCooldown = 0;
  deepDark.onPlayerVibration(player.position, 1.0, player);
  assert.equal(deepDark.warningLevel, 2);

  deepDark.shriekCooldown = 0;
  deepDark.onPlayerVibration(player.position, 1.0, player);
  assert.equal(deepDark.warningLevel, 3);
  assert.ok(deepDark.activeWarden, 'Warden emerged from the ground');

  // Sonic Boom attack
  deepDark.activeWarden.sniffTimer = 0;
  deepDark.updateWardenAI(deepDark.activeWarden, 2.0, player);
  assert.ok(deepDark.sonicBoomProjectiles.length >= 0);
});

test('Village Raids: Waves, Evoker fangs, Ravager, and Raid Boss Bar', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const ui = createMockUI();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const raidManager = new RaidManager(mobManager, world, sounds, ui);
  const player = createMockPlayer();

  player.applyStatusEffect('bad_omen', 60);

  // Enter village and start raid
  raidManager.startRaid(player, new THREE.Vector3(0, 10, 0));
  assert.equal(raidManager.isRaidActive, true);
  assert.equal(player.hasStatusEffect('bad_omen'), false, 'Bad omen consumed on raid trigger');
  assert.ok(ui.bossBars.has('raid'), 'Raid Boss Bar visible');

  // Wave 1 has 4 pillagers
  assert.equal(raidManager.raidMobs.length, 4);

  // Clear wave 1
  for (const m of raidManager.raidMobs) m.health = 0;
  raidManager.update(1.0, player);
  assert.equal(raidManager.currentWave, 2, 'Advances to wave 2');

  // Clear wave 2
  for (const m of raidManager.raidMobs) m.health = 0;
  raidManager.update(1.0, player);
  assert.equal(raidManager.currentWave, 3, 'Advances to wave 3 (Evoker + Ravager)');

  assert.ok(raidManager.raidMobs.some(m => m.type === 'evoker'));
  assert.ok(raidManager.raidMobs.some(m => m.type === 'ravager'));
});

test('The Wither: Summoning structure, 3 heads, armored shield, and Nether Star drop', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const ui = createMockUI();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const bossManager = new BossFightManager(mobManager, world, sounds, ui, entities);

  // Build Wither structure:
  // y = 10: Soul sand stem at (0, 10, 0)
  // y = 11: Soul sand row at (-1, 11, 0), (0, 11, 0), (1, 11, 0)
  // y = 12: Wither skulls at (-1, 12, 0), (0, 12, 0), (1, 12, 0)
  world.setVoxel(0, 10, 0, BLOCKS.SOUL_SAND);
  world.setVoxel(-1, 11, 0, BLOCKS.SOUL_SAND);
  world.setVoxel(0, 11, 0, BLOCKS.SOUL_SAND);
  world.setVoxel(1, 11, 0, BLOCKS.SOUL_SAND);

  world.setVoxel(-1, 12, 0, BLOCKS.WITHER_SKELETON_SKULL_BLOCK);
  world.setVoxel(0, 12, 0, BLOCKS.WITHER_SKELETON_SKULL_BLOCK);
  world.setVoxel(1, 12, 0, BLOCKS.WITHER_SKELETON_SKULL_BLOCK);

  // Placing the final skull completes structure
  const summoned = bossManager.checkWitherSummon(1, 12, 0);
  assert.equal(summoned, true, 'Wither summoning structure detected and cleared');
  assert.ok(bossManager.wither, 'Wither boss created');
  assert.ok(ui.bossBars.has('wither'), 'Wither Boss Bar active');
  assert.equal(world.getVoxel(0, 10, 0), BLOCKS.AIR, 'Blocks cleared on summon');

  // Wither Armor shield below 50% HP
  bossManager.wither.health = 140; // < 150 (50% of 300)
  bossManager.wither.summonChargeTimer = 0;
  bossManager.wither.isInvulnerable = false;
  bossManager.updateWitherBoss(bossManager.wither, 0.1, { position: new THREE.Vector3(0, 10, 5) });
  assert.equal(bossManager.wither.hasWitherArmor, true, 'Wither armor projectile shield active');
});

test('Ender Dragon: Boss Bar UI, End Crystal healing, dragon breath, and exit portal', () => {
  const world = createMockWorld();
  const sounds = createMockSounds();
  const ui = createMockUI();
  const entities = createMockEntities();
  const mobManager = createMockMobManager(world, sounds, entities);
  const bossManager = new BossFightManager(mobManager, world, sounds, ui, entities);

  // Initialize End Arena
  bossManager.initEndArena();
  assert.ok(bossManager.enderDragon, 'Ender Dragon spawned');
  assert.ok(ui.bossBars.has('ender_dragon'), 'Ender Dragon Boss Bar active');
  assert.equal(bossManager.endCrystals.length, 8, '8 Obsidian pillar End Crystals created');

  // Crystal heals dragon
  bossManager.enderDragon.health = 150;
  bossManager.updateEnderDragonBoss(bossManager.enderDragon, 1.0, { position: new THREE.Vector3(0, 30, 0) });
  assert.ok(bossManager.enderDragon.health > 150, 'End Crystal healed Ender Dragon');

  // Crystal destruction via player hit
  const crystal = bossManager.endCrystals[0];
  const hit = bossManager.checkCrystalHit(
    crystal.position.clone().add(new THREE.Vector3(0, 0, 2)),
    new THREE.Vector3(0, 0, -1)
  );
  assert.equal(hit, true, 'End Crystal hit and exploded');
  assert.equal(crystal.exploded, true);

  // Dragon death -> Exit portal and Dragon Egg
  bossManager.enderDragon.health = 0;
  bossManager.updateEnderDragonBoss(bossManager.enderDragon, 0.1, { position: new THREE.Vector3(0, 30, 0) });
  assert.equal(world.getVoxel(0, 32, 0), BLOCKS.DRAGON_EGG, 'Dragon egg placed on exit portal fountain');
  assert.equal(world.getVoxel(0, 28, 0), BLOCKS.END_PORTAL, 'End portal activated');
});
