// Breeding trait inheritance.
//
// The shared breeding path builds a baby with `spawnMob(mob.type, ...)`, which is a plain copy of the
// species with default traits. Per-type variation was then patched in at the call site for exactly two
// mobs (equines and sheep), so every other mob with a variant system produced babies that ignored their
// parents: pandas lost their genes, rabbits/foxes/parrots lost their variant entirely, and wolves lost
// their collar colour.
//
// This suite covers the dispatcher that replaced the ad-hoc patches.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { AnimalBehaviors, BREEDING_FOODS } from '../src/animalBehaviors.js';
import { PANDA_GENES } from '../src/pandaBehavior.js';

/**
 * Run `body` with a seeded `Math.random`, restoring the real one afterwards.
 *
 * The inheritance roll fires a 1/32 mutation PER GENE, so a case that asserts each gene came from a
 * parent fails about 6% of the time under real randomness. The claim is correct; the coin flip is not
 * part of it. A fixed seed makes the outcome stable without weakening the assertion.
 */
function withSeededRandom(seed, body) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  try {
    return body();
  } finally {
    Math.random = original;
  }
}


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
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  let bambooAt = null;
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    blockNameAt: (x, y, z) => (bambooAt && bambooAt(x, y, z) ? 'bamboo' : 'air')
  });
  const player = {
    position: new THREE.Vector3(6, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; }, applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  player.inventory = inventory;
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  const behaviors = new AnimalBehaviors(manager, world, sounds, entities);
  manager.animalBehaviors = behaviors;
  return { manager, behaviors, player, inventory, setBamboo: (fn) => { bambooAt = fn; } };
}

test('the breeding food table includes panda and bamboo', () => {
  // Wiki: pandas "are bred using bamboo".
  assert.deepEqual(BREEDING_FOODS.panda, ['bamboo']);
});

test('a panda cub inherits genes from both parents and presents a personality', () => {
  // Seeded: the inheritance roll also fires a 1/32 mutation per gene, and this case asserts that each
  // gene came from a PARENT, so an unlucky mutation would fail it for the wrong reason.
  withSeededRandom(7, () => {

    const { manager, behaviors } = fixture();
    const a = manager.spawnPanda(0, 1, 0, { mainGene: 'aggressive', hiddenGene: 'normal' });
    const b = manager.spawnPanda(2, 1, 0, { mainGene: 'lazy', hiddenGene: 'brown' });
    const baby = manager.spawnPanda(1, 1, 0);

    const applied = behaviors.inheritBabyTraits(baby, a, b);
    assert.equal(applied, 'pandaGenes');
    assert.ok(PANDA_GENES.includes(baby.mainGene), `main ${baby.mainGene}`);
    assert.ok(PANDA_GENES.includes(baby.hiddenGene), `hidden ${baby.hiddenGene}`);
    // The personality has to be recomputed from the inherited genes, not copied.
    assert.ok(PANDA_GENES.includes(baby.personality), `personality ${baby.personality}`);
    // With no mutation, each gene comes from one of the two parents.
    const parentGenes = [a.mainGene, a.hiddenGene, b.mainGene, b.hiddenGene];
    assert.ok(parentGenes.includes(baby.mainGene), 'the main gene came from a parent');
    assert.ok(parentGenes.includes(baby.hiddenGene), 'so did the hidden gene');
  });
});

test('a weak panda cub is weak only when both genes are weak', () => {
  const { manager, behaviors } = fixture();
  const weakA = manager.spawnPanda(0, 1, 0, { mainGene: 'weak', hiddenGene: 'weak' });
  const weakB = manager.spawnPanda(2, 1, 0, { mainGene: 'weak', hiddenGene: 'weak' });
  const found = {};
  for (let i = 0; i < 200; i++) {
    const baby = manager.spawnPanda(1, 1, 0);
    behaviors.inheritBabyTraits(baby, weakA, weakB);
    found[baby.personality] = true;
    // Two weak parents can produce a non-weak cub only via a mutation.
    if (baby.personality === 'weak') assert.equal(baby.maxHealth, 10, 'a weak cub has 10 HP');
    else assert.equal(baby.maxHealth, 20, 'a non-weak cub has 20 HP');
  }
  assert.equal(found.weak, true, 'two weak parents mostly produce weak cubs');
});

test('a fox cub inherits one parent coat', () => {
  const { manager, behaviors } = fixture();
  const snow = manager.spawnMob('fox', 0, 1, 0);
  snow.coat = 'snow';
  const red = manager.spawnMob('fox', 0, 1, 0);
  red.coat = 'red';
  const baby = manager.spawnMob('fox', 0, 1, 0);

  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const applied = behaviors.inheritBabyTraits(baby, snow, red);
    assert.equal(applied, 'foxCoat');
    seen.add(baby.coat);
    assert.equal(baby.variant, baby.coat, 'the variant mirrors the coat');
  }
  assert.deepEqual([...seen].sort(), ['red', 'snow'], 'both parents coats appear, so it is a real 50/50');
});

test('a rabbit cub inherits one parent coat', () => {
  const { manager, behaviors } = fixture();
  const gold = manager.spawnMob('rabbit', 0, 1, 0);
  gold.coat = 'gold';
  const black = manager.spawnMob('rabbit', 0, 1, 0);
  black.coat = 'black';
  const baby = manager.spawnMob('rabbit', 0, 1, 0);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    assert.equal(behaviors.inheritBabyTraits(baby, gold, black), 'rabbitCoat');
    seen.add(baby.coat);
  }
  assert.deepEqual([...seen].sort(), ['black', 'gold']);
});

test('a parrot chick inherits one parent colour', () => {
  const { manager, behaviors } = fixture();
  const a = manager.spawnParrot(0, 1, 0, { variant: 2 });
  const b = manager.spawnParrot(0, 1, 0, { variant: 4 });
  const baby = manager.spawnParrot(0, 1, 0, { variant: 0 });
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    assert.equal(behaviors.inheritBabyTraits(baby, a, b), 'parrotVariant');
    seen.add(baby.variant);
    // The name and the material colour must follow the chosen variant.
    assert.equal(baby.variantName, baby.variant === 2 ? 'green' : 'gray');
  }
  assert.deepEqual([...seen].sort(), [2, 4], 'both parents colours appear');
});

test('a wolf pup inherits one parent collar colour', () => {
  const { manager, behaviors } = fixture();
  const a = manager.spawnMob('wolf', 0, 1, 0);
  a.collarColor = 'red';
  const b = manager.spawnMob('wolf', 0, 1, 0);
  b.collarColor = 'blue';
  const baby = manager.spawnMob('wolf', 0, 1, 0);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    assert.equal(behaviors.inheritBabyTraits(baby, a, b), 'wolfCollar');
    seen.add(baby.collarColor);
  }
  assert.deepEqual([...seen].sort(), ['blue', 'red']);
});

test('a mob with no variant system is left alone', () => {
  const { manager, behaviors } = fixture();
  const cowA = manager.spawnCow(0, 1, 0);
  const cowB = manager.spawnCow(2, 1, 0);
  const baby = manager.spawnCow(1, 1, 0);
  assert.equal(behaviors.inheritBabyTraits(baby, cowA, cowB), null,
    'a cow has nothing to inherit, so the dispatcher reports nothing');
});

test('a goat cub inherits horns and can rarely be a screaming goat', () => {
  const { manager, behaviors } = fixture();
  const a = manager.spawnMob('goat', 0, 1, 0);
  const b = manager.spawnMob('goat', 2, 1, 0);
  assert.ok(a.horns, 'the goat spawner provides horns');
  const baby = manager.spawnMob('goat', 1, 1, 0);
  const applied = behaviors.inheritBabyTraits(baby, a, b);
  assert.equal(applied, 'goatTraits');
  assert.equal(typeof baby.isScreamingGoat, 'boolean', 'wiki: screaming is a trait');

  // A screaming parent passes it on about half the time.
  a.isScreamingGoat = true;
  let screaming = 0;
  for (let i = 0; i < 400; i++) {
    behaviors.inheritBabyTraits(baby, a, b);
    if (baby.isScreamingGoat) screaming++;
  }
  assert.ok(screaming > 120 && screaming < 280,
    `wiki: about half inherit it from a screaming parent, got ${screaming}/400`);
});

test('the dispatcher is safe on malformed input', () => {
  const { manager, behaviors } = fixture();
  assert.equal(behaviors.inheritBabyTraits(null, null, null), null);
  assert.equal(behaviors.inheritBabyTraits(manager.spawnCow(0, 1, 0), null, null), null);
  assert.equal(behaviors.inheritBabyTraits(manager.spawnCow(0, 1, 0), manager.spawnCow(0, 1, 0), null), null);
  // A parent with no coat must not crash the rabbit branch.
  const bare = manager.spawnMob('rabbit', 0, 1, 0);
  delete bare.coat;
  assert.equal(behaviors.inheritBabyTraits(manager.spawnMob('rabbit', 0, 1, 0), bare, bare), null);
});

test('pandas only breed with bamboo within 7x7x3', () => {
  // Wiki: Java pandas "breed only if there is at least one bamboo plant (not including shoots) within
  // a 7x7x3 area", and otherwise shake their heads and do not breed.
  const { manager, behaviors, player, inventory, setBamboo } = fixture();
  const a = manager.spawnPanda(0, 1, 0, { mainGene: 'normal', hiddenGene: 'normal' });
  const b = manager.spawnPanda(0.6, 1, 0, { mainGene: 'normal', hiddenGene: 'normal' });
  inventory.active = { id: 'bamboo', count: 4 };
  a.inLove = 30;
  b.inLove = 30;

  // No bamboo anywhere: the pair must never produce a cub, however long they court.
  for (let i = 0; i < 400; i++) behaviors.checkBreedingPair(a, 0.05);
  const pandasWithout = manager.mobs.filter(m => m.type === 'panda').length;
  assert.equal(pandasWithout, 2, 'wiki: no bamboo nearby means no cub');

  // With bamboo inside the box, the same pair does breed.
  setBamboo((x, y, z) => x === 1 && z === 1 && y === 1);
  let bred = false;
  for (let i = 0; i < 400 && !bred; i++) {
    behaviors.checkBreedingPair(a, 0.05);
    if (manager.mobs.filter(m => m.type === 'panda').length > 2) bred = true;
  }
  assert.equal(bred, true, 'with bamboo nearby the pair breeds');
  const cub = manager.mobs.filter(m => m.type === 'panda').at(-1);
  assert.equal(cub.isBaby, true, 'the new panda is a cub');
  assert.ok(PANDA_GENES.includes(cub.mainGene), 'and it has real genes');
  assert.ok(PANDA_GENES.includes(cub.personality), 'and a personality');
});
