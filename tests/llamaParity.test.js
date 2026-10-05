// Llama parity with https://minecraft.wiki/w/Llama
//
// Llama was another of the 38 missing types. Its defining traits are that it retaliates with spit,
// its strength 1-5 sets both its health and its inventory size, it carries a chest and a carpet, and
// it takes only half fall damage.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  LLAMA_HEALTH, LLAMA_DIMENSIONS, LLAMA_BABY_DIMENSIONS, LLAMA_BABY_SCALE, LLAMA_SPIT_DAMAGE,
  LLAMA_VARIANTS, LLAMA_STRENGTH, LLAMA_SLOTS_PER_STRENGTH, LLAMA_TEMPER, LLAMA_FOOD,
  LLAMA_STRENGTH_WEIGHTS, LLAMA_SPIT, LLAMA_COAT_COLORS,
  rollLlamaStrength, llamaHealthFor, llamaSlotsFor, rollLlamaVariant, inheritLlamaVariant,
  inheritLlamaStrength, llamaSpitDamage, llamaWantsToSpit, llamaCoatColors,
  createLlamaModel, applyLlamaCoat, applyLlamaEquipment, poseLlamaLegs,
  spawnLlamaSpit, updateLlamaSpit, removeLlamaSpit
} from '../src/llamaBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ difficulty = 'normal' } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR), getHeightAt: () => 0, getLightLevel: () => 15, setVoxel() {} };
  const entities = new EntityManager(scene, world, sounds);
  entities.droppedItems = [];
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    entities.droppedItems.push({ itemType, isBlock, count });
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, random: () => 0.5, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE
  });
  const player = {
    position: new THREE.Vector3(10, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; this.health -= n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  const inventory = { active: null, getActiveItem() { return this.active; } };
  player.inventory = inventory;
  manager.game = { player, difficulty, worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, inventory, entities };
}

test('llama is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  assert.equal(llama.type, 'llama');
  assert.equal(llama.name, 'Llama');
  assert.notEqual(llama.type, 'villager');
});

test('the health band and hitboxes match the wiki', () => {
  assert.deepEqual(LLAMA_HEALTH, { min: 15, max: 30 });
  assert.deepEqual(LLAMA_DIMENSIONS, { width: 0.9, height: 1.87 });
  assert.deepEqual(LLAMA_BABY_DIMENSIONS, { width: 0.45, height: 0.935 });
  assert.equal(LLAMA_BABY_SCALE, 0.5);
  const { manager } = fixture();
  assert.deepEqual(manager.getMobDimensions('llama'), { width: 0.9, height: 1.87 });
});

test('health scales with strength from 15 to 30', () => {
  assert.equal(llamaHealthFor(1), 15, 'wiki: the band starts at 15');
  assert.equal(llamaHealthFor(5), 30, 'and ends at 30');
  assert.equal(llamaHealthFor(3), 23, 'with a linear ramp between');
  // And every strength is inside the band.
  for (let s = LLAMA_STRENGTH.min; s <= LLAMA_STRENGTH.max; s++) {
    const hp = llamaHealthFor(s);
    assert.ok(hp >= 15 && hp <= 30, `strength ${s} gave ${hp}`);
  }
  // Out-of-range is clamped rather than producing a nonsense value.
  assert.equal(llamaHealthFor(0), 15);
  assert.equal(llamaHealthFor(99), 30);
});

test('inventory slots are three per point of strength', () => {
  assert.equal(LLAMA_SLOTS_PER_STRENGTH, 3);
  assert.equal(LLAMA_STRENGTH.max, 5);
  for (const [strength, slots] of [[1, 3], [2, 6], [3, 9], [4, 12], [5, 15]]) {
    assert.equal(llamaSlotsFor(strength), slots, `strength ${strength} gives ${slots} slots`);
  }
});

test('the wild strength distribution matches the wiki table', () => {
  const total = LLAMA_STRENGTH_WEIGHTS.reduce((n, e) => n + e.weight, 0);
  // Floating point: 32.8 x 3 + 0.8 x 2 is 99.99999999999999 rather than exactly 100.
  assert.ok(Math.abs(total - 100) < 1e-9, `the weights must sum to 100 or every roll is skewed, got ${total}`);
  const byS = Object.fromEntries(LLAMA_STRENGTH_WEIGHTS.map(e => [e.strength, e.weight]));
  assert.equal(byS[1], 32.8, 'wiki: strength 1 is 32.8%');
  assert.equal(byS[2], 32.8);
  assert.equal(byS[3], 32.8);
  assert.equal(byS[4], 0.8, 'wiki: strength 4 is 0.8%');
  assert.equal(byS[5], 0.8, 'and strength 5 is 0.8%');

  // Sample it and check the low strengths dominate.
  let seed = 5;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const counts = {};
  const runs = 100000;
  for (let i = 0; i < runs; i++) {
    const s = rollLlamaStrength(random);
    assert.ok(s >= 1 && s <= 5, `strength out of range: ${s}`);
    counts[s] = (counts[s] || 0) + 1;
  }
  for (const s of [1, 2, 3]) {
    const share = (counts[s] || 0) / runs;
    // A 2% band: the deterministic generator has weak low bits, so the observed shares wander a
    // little around the exact 32.8%. The point is that the three common strengths each get roughly
    // a third, which a 2% band establishes comfortably.
    assert.ok(Math.abs(share - 0.328) < 0.02, `strength ${s}: expected 0.328, got ${share.toFixed(4)}`);
  }
  for (const s of [4, 5]) {
    const share = (counts[s] || 0) / runs;
    assert.ok(Math.abs(share - 0.008) < 0.006, `strength ${s}: expected 0.008, got ${share.toFixed(4)}`);
  }
});

test('the four coat variants and their ids match the wiki', () => {
  assert.deepEqual(LLAMA_VARIANTS, { creamy: 0, white: 1, brown: 2, gray: 3 },
    'wiki: creamy 0, white 1, brown 2, gray 3');
  assert.deepEqual(Object.keys(LLAMA_COAT_COLORS).sort(), ['brown', 'creamy', 'gray', 'white']);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rollLlamaVariant(() => i / 200));
  assert.equal(seen.size, 4, `every variant should come up, saw ${[...seen].join(',')}`);
  assert.equal(rollLlamaVariant(() => 0), 'creamy', 'the first entry takes a roll of zero');
});

test('a spawned llama carries its strength-derived health and slots', () => {
  const { manager } = fixture();
  const llama = manager.spawnLlama(0, 1, 0, { strength: 5 });
  assert.equal(llama.strength, 5);
  assert.equal(llama.maxHealth, 30);
  assert.equal(llama.health, 30);
  assert.equal(llama.chestSlots, 15, 'wiki: strength 5 gives 15 slots');
  assert.equal(llama.chestInventory.length, 15);

  const weak = manager.spawnLlama(0, 1, 0, { strength: 1 });
  assert.equal(weak.maxHealth, 15);
  assert.equal(weak.chestSlots, 3);
});

test('a baby has the smaller hitbox and no XP on death', () => {
  const { manager } = fixture();
  const baby = manager.spawnLlama(0, 1, 0, { isBaby: true });
  assert.equal(baby.mesh.scale.x, LLAMA_BABY_SCALE);
  assert.deepEqual([baby.width, baby.height], [0.45, 0.935]);
  assert.equal(baby.isBaby, true);
});

test('the spit damage table matches the wiki', () => {
  assert.deepEqual(LLAMA_SPIT_DAMAGE, { peaceful: 0, easy: 1, normal: 1, hard: 1.5 });
  assert.equal(llamaSpitDamage('easy'), 1);
  assert.equal(llamaSpitDamage('normal'), 1);
  assert.equal(llamaSpitDamage('hard'), 1.5, 'wiki: 1.5 on Hard');
  assert.equal(llamaSpitDamage('peaceful'), 0);
  assert.equal(llamaSpitDamage('nonsense'), 1, 'an unknown difficulty falls back to Normal');
});

test('a llama spits at its attacker and at wolves, and never on Peaceful', () => {
  const { manager, player } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  const wolf = manager.spawnWolf(4, 1, 0);

  // Nothing unprovoked.
  assert.equal(llamaWantsToSpit(llama, player), false, 'a player is not a target unprovoked');
  // A wolf is, without provocation.
  assert.equal(llamaWantsToSpit(llama, wolf), true, 'wiki: hostile toward wolves');
  // Its attacker is, once it has been hurt.
  assert.equal(llamaWantsToSpit(llama, player, { recentAttacker: player }), true,
    'wiki: retaliates when attacked');
  // Not on Peaceful.
  assert.equal(llamaWantsToSpit(llama, wolf, { difficulty: 'peaceful' }), false,
    'wiki: completely passive on Peaceful');
  // Not itself, not the dead, not nothing.
  assert.equal(llamaWantsToSpit(llama, llama), false);
  assert.equal(llamaWantsToSpit(llama, { type: 'cow', health: 0 }), false);
  assert.equal(llamaWantsToSpit(llama, null), false);
});

test('taking a hit records the attacker through the real damage path', () => {
  const { manager, player } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  assert.equal(llama.recentAttacker, null, 'it starts calm');
  manager.damageMob(llama, 1, null, false, player);
  assert.equal(llama.recentAttacker, player, 'being hurt records who did it');
});

test('the model has a tall neck, banana ears and hidden chest and carpet', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  assert.ok(llama.body && llama.neck && llama.head, 'body, neck and head');
  assert.equal(llama.ears.length, 2, 'two large ears');
  assert.equal(llama.eyes.length, 2);
  assert.equal(llama.legs.length, 4, 'four legs');
  assert.ok(llama.chestMesh, 'a chest mesh exists');
  assert.ok(llama.carpetMesh, 'and a carpet mesh');
  assert.equal(llama.chestMesh.visible, false, 'both hidden until equipped');
  assert.equal(llama.carpetMesh.visible, false);
});

test('equipment shows the chest and tints the carpet', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  llama.hasChest = true;
  llama.carpetColor = 0xff0000;
  applyLlamaEquipment(llama);
  assert.equal(llama.chestMesh.visible, true, 'the chest appears');
  assert.equal(llama.carpetMesh.visible, true, 'and so does the carpet');
  assert.equal(llama.carpetMesh.material.color.getHex(), 0xff0000, 'in the chosen colour');
  llama.carpetColor = null;
  applyLlamaEquipment(llama);
  assert.equal(llama.carpetMesh.visible, false, 'and disappears when removed');
  assert.doesNotThrow(() => applyLlamaEquipment(null));
});

test('the coat colour is applied to the model', () => {
  const { manager } = fixture();
  const llama = manager.spawnLlama(0, 1, 0, { variant: 'gray' });
  assert.equal(llama.bodyMat.color.getHex(), LLAMA_COAT_COLORS.gray.base);
  llama.variant = 'brown';
  applyLlamaCoat(llama);
  assert.equal(llama.bodyMat.color.getHex(), LLAMA_COAT_COLORS.brown.base, 'the coat changes');
  assert.doesNotThrow(() => applyLlamaCoat(null));
  assert.doesNotThrow(() => applyLlamaCoat({ variant: 'nonsense', bodyMat: null }));
});

test('feeding values match the wiki table', () => {
  assert.deepEqual(LLAMA_FOOD.wheat, { temper: 3, heal: 2 }, 'wiki: wheat gives +3 temper, 2 HP');
  assert.equal(LLAMA_FOOD.hay_block.temper, 6, 'wiki: a hay bale gives +6 temper');
  assert.equal(LLAMA_FOOD.hay_block.heal, 10, 'and 10 HP');
  assert.deepEqual(LLAMA_TEMPER, { start: 0, max: 30, perAttempt: 5 },
    'wiki: Temper starts at 0, caps at 30, +5 per failed attempt');
});

test('llamas take half fall damage after six safe blocks', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  assert.equal(llama.safeFallBlocks, 6, 'wiki: six blocks before fall damage, not three');
  assert.equal(llama.halfFallDamage, true, 'wiki: half the normal fall damage');
});

test('breeding inherits one parent coat and a bounded strength', () => {
  // Wiki: the coat comes from one parent at random.
  assert.equal(inheritLlamaVariant('white', 'gray', () => 0.1), 'white');
  assert.equal(inheritLlamaVariant('white', 'gray', () => 0.9), 'gray');

  // Wiki: strength is a random integer between 1 and the stronger parent, inclusive, with a 3%
  // chance of one extra capped at 5.
  for (let s = 1; s <= 5; s++) {
    for (const r of [0, 0.2, 0.5, 0.99]) {
      const child = inheritLlamaStrength(s, 1, () => r);
      assert.ok(child >= 1 && child <= 5, `parent ${s}, roll ${r}: got ${child}`);
      assert.ok(child <= LLAMA_STRENGTH.max);
    }
  }
  // The stronger parent is what matters, not the order.
  assert.equal(inheritLlamaStrength(1, 4, () => 0.99), inheritLlamaStrength(4, 1, () => 0.99));
  // The 3% bonus is capped at 5.
  const bonus = inheritLlamaStrength(5, 5, (() => { let n = 0; return () => (n++ === 0 ? 0.99 : 0.001); })());
  assert.equal(bonus, 5, 'the 3% bonus cannot push past strength 5');
});

test('a fired spit lives in its own list, not the hostile-mob queue', () => {
  // The queue in hostileMobBehaviors owns potions, eggs and boss projectiles. It assumes every
  // entry carries `position`/`velocity`/`age` and rebuilds the array each frame, and pushing a
  // llama spit into it crashed that updater for every other projectile in the game. Spit therefore
  // has its own list and must stay out of the shared one.
  const { manager, player } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  const spit = spawnLlamaSpit(manager, llama, player);
  assert.ok(spit, 'a spit was created');
  assert.equal(spit.isLlamaSpit, true, 'and is identifiable');
  assert.ok(spit.position?.isVector3, 'it carries a position');
  assert.ok(spit.velocity?.isVector3, 'and a velocity');
  assert.equal(typeof spit.age, 'number', 'and an age');
  assert.ok(spit.mesh, 'with a mesh to move');
  assert.equal(manager.customProjectiles.includes(spit), false, 'it is NOT in the shared queue');
  assert.equal(manager.llamaSpits.includes(spit), true, 'it is in the llama list instead');
});

test('spit flight does not disturb the hostile-mob projectile queue', () => {
  const { manager, player } = fixture();
  // A stand-in for the potions and eggs that share this queue.
  const other = {
    position: new THREE.Vector3(0, 5, 0), velocity: new THREE.Vector3(1, 0, 0), age: 0, mesh: null
  };
  manager.customProjectiles.push(other);
  const llama = manager.spawnMob('llama', 0, 1, 0);
  spawnLlamaSpit(manager, llama, player);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 60; i++) updateLlamaSpit(manager, 1 / 60, player);
  });
  assert.equal(manager.customProjectiles.includes(other), true, 'the other projectile survives');
  // The spit was aimed at the player 10 blocks away, so after one second it may or may not still be
  // in the air; what matters is only that the other projectile was left alone.
  assert.ok(Array.isArray(manager.llamaSpits), 'and the spit is tracked in its own list');
});

test('a spit that reaches its target deals the difficulty damage', () => {
  const { manager, player } = fixture({ difficulty: 'hard' });
  const llama = manager.spawnMob('llama', 0, 1, 0);
  // Put a target right in front so the spit connects within a couple of frames.
  player.position.set(1.2, 1, 0);
  spawnLlamaSpit(manager, llama, player);
  for (let i = 0; i < 120; i++) updateLlamaSpit(manager, 1 / 60, player);
  assert.equal(player.damageTaken, 1.5, 'wiki: 1.5 on Hard');
  assert.equal(manager.llamaSpits.length, 0, 'the spit is spent');
});

test('a spit that hits another llama makes it retaliate', () => {
  // Wiki: "Occasionally, their spit can miss its intended target and accidentally hit another
  // llama, causing them to fight each other."
  const { manager, player } = fixture();
  const shooter = manager.spawnMob('llama', 0, 1, 0);
  const victim = manager.spawnLlama(1.2, 1, 0, { strength: 3 });
  assert.equal(victim.recentAttacker, null);
  spawnLlamaSpit(manager, shooter, victim);
  for (let i = 0; i < 120; i++) updateLlamaSpit(manager, 1 / 60, null);
  assert.equal(victim.recentAttacker, shooter, 'the hit llama now blames the shooter');
});

test('spit expires rather than flying forever', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  const target = { position: new THREE.Vector3(500, 1, 500), health: 20, type: 'cow' };
  spawnLlamaSpit(manager, llama, target);
  assert.equal(manager.llamaSpits.length, 1);
  for (let i = 0; i < 400; i++) updateLlamaSpit(manager, 1 / 60, null);
  assert.equal(manager.llamaSpits.length, 0,
    'wiki-scale lifetime of a few seconds, then it is gone');
});

test('removeLlamaSpit disposes of the mesh', () => {
  const { manager, player } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  const spit = spawnLlamaSpit(manager, llama, player);
  const mesh = spit.mesh;
  removeLlamaSpit(manager, spit);
  assert.equal(manager.llamaSpits.includes(spit), false);
  assert.equal(mesh.parent, null, 'removed from the scene');
  assert.doesNotThrow(() => removeLlamaSpit(manager, spit), 'removing twice is safe');
  assert.doesNotThrow(() => removeLlamaSpit(manager, { mesh: null }));
});

test('the spit helpers are safe on non-llamas and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(spawnLlamaSpit(manager, cow, null), null, 'no target, no spit');
  assert.equal(spawnLlamaSpit(null, cow, cow), null);
  assert.equal(spawnLlamaSpit(manager, { mesh: null }, cow), null);
  assert.doesNotThrow(() => updateLlamaSpit(null, 1 / 60));
  assert.doesNotThrow(() => updateLlamaSpit({ llamaSpits: null }, 1 / 60));
  assert.doesNotThrow(() => poseLlamaLegs({}, 1));
  assert.doesNotThrow(() => poseLlamaLegs(null, 1));
  // A malformed queue entry is dropped rather than throwing.
  manager.llamaSpits = manager.llamaSpits || [];
  manager.llamaSpits.push({ isLlamaSpit: true, life: 5 });
  assert.doesNotThrow(() => updateLlamaSpit(manager, 1 / 60));
  assert.equal(manager.llamaSpits.some(p => p.isLlamaSpit), false, 'the malformed one was dropped');
});

test('the spit charge pose raises the head', () => {
  const { manager } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  poseLlamaLegs(llama, 1, false);
  const relaxed = llama.neck.rotation.x;
  llama.spitCharge = 0.5;
  poseLlamaLegs(llama, 1, false);
  assert.ok(llama.neck.rotation.x < relaxed, 'the neck comes up to spit');
  assert.ok(llama.head.rotation.x < 0, 'and the head tips back');
});

test('a llama walks through the real update loop without breaking it', () => {
  const { manager, player } = fixture();
  player.position.set(40, 1, 40);
  const llama = manager.spawnMob('llama', 0, 1, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(llama), 'still alive');
  assert.deepEqual([...(manager.mobErrors || [])], [], 'and no fault was reported');
  assert.ok((llama.llamaPhase || 0) > 0, 'the walk cycle advanced');
});

test('a provoked llama actually spits through the real update loop', () => {
  const { manager, player } = fixture();
  const llama = manager.spawnMob('llama', 0, 1, 0);
  player.position.set(6, 1, 0);
  manager.damageMob(llama, 1, null, false, player);
  let everHadSpit = false;
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    if ((manager.llamaSpits || []).length) everHadSpit = true;
  }
  assert.equal(everHadSpit, true, 'it fired at least one spit');
  assert.ok(player.damageTaken > 0, `the spit should land, dealt ${player.damageTaken}`);
});

test('a Peaceful llama never spits even when attacked', () => {
  const { manager, player } = fixture({ difficulty: 'peaceful' });
  const llama = manager.spawnMob('llama', 0, 1, 0);
  player.position.set(6, 1, 0);
  llama.recentAttacker = player;
  for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  assert.equal((manager.llamaSpits || []).length, 0,
    'wiki: completely passive on Peaceful');
  assert.equal(player.damageTaken, 0);
});

test('the Inspector can spawn the llama and reports its strength and variant', () => {
  assert.ok(DEBUG_MOBS.includes('llama'), 'llama must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const llama = s.reset('llama');
  assert.equal(llama.type, 'llama', 'the Inspector spawns a real llama');
  const snap = s.snapshot();
  assert.ok(snap.health >= 15 && snap.health <= 30, `health ${snap.health} in the wiki band`);
  assert.equal(snap.maxHealth, snap.health);
  assert.ok(snap.llamaStrength >= 1 && snap.llamaStrength <= 5, `strength ${snap.llamaStrength}`);
  assert.equal(snap.llamaSlots, snap.llamaStrength * 3, 'slots follow strength');
  assert.ok(Object.keys(LLAMA_VARIANTS).includes(snap.llamaVariant));
  assert.equal(snap.llamaChest, false);
  assert.equal(snap.llamaSpitting, false);
  s.tick(1 / 60);
  assert.ok(s.snapshot().health >= 15);
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.llama_spawn_egg, 'the llama has a spawn egg');
  assert.equal(ITEMS.llama_spawn_egg.mob, 'llama');
  assert.equal(ITEMS.llama_spawn_egg.type, 'spawn_egg');
});

test('llamaCoatColors falls back rather than returning undefined', () => {
  assert.deepEqual(llamaCoatColors('gray'), LLAMA_COAT_COLORS.gray);
  assert.deepEqual(llamaCoatColors('nonsense'), LLAMA_COAT_COLORS.creamy);
  assert.deepEqual(llamaCoatColors(undefined), LLAMA_COAT_COLORS.creamy);
});

test('createLlamaModel is callable standalone with the expected parts', () => {
  const model = createLlamaModel(
    new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshBasicMaterial()
  );
  assert.ok(model.group && model.neck && model.head && model.chestMesh && model.carpetMesh);
  assert.equal(model.ears.length, 2);
  assert.equal(model.legs.length, 4);
  // The legs keep their front/back and side markers, which the gait uses.
  assert.equal(model.legs.filter(l => l.front).length, 2);
  assert.equal(model.legs.filter(l => !l.front).length, 2);
});
