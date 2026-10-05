// Mooshroom parity with https://minecraft.wiki/w/Mooshroom
//
// The audit recorded mooshrooms at 14 HP against a reference of 10, with no breeding
// entry, no bowl stew, no brown variant and no shearing conversion. All of those are
// pinned here against wiki values. Mooshrooms had also fallen through the dimension
// table to the humanoid default of 0.6 x 1.95.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { AnimalBehaviors, BREEDING_FOODS } from '../src/animalBehaviors.js';
import {
  MOOSHROOM_VARIANTS, MOOSHROOM_COLORS, MOOSHROOM_MUSHROOM_BLOCK, MOOSHROOM_SHEAR_DROPS,
  STEW_EFFECTS, isSmallFlower, isBrownMooshroom, isMooshroom, otherMooshroomVariant,
  applyMooshroomVariant, convertMooshroomVariant, convertLightningMooshrooms, convertMooshroomToCow
} from '../src/mooshroomBehavior.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';

function fixture(world = null) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const terrain = world || { getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR) };
  const entities = new EntityManager(scene, terrain, sounds);
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world: terrain, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: { cow: new THREE.Texture() },
    isBlockSolid: (x, y, z) => terrain.getVoxel(x, y, z) === BLOCKS.STONE
  });
  manager.animalBehaviors = new AnimalBehaviors(manager, terrain, sounds, entities);
  const player = {
    position: new THREE.Vector3(0, 1, 0), gamemode: 'survival', health: 20, keys: {},
    takeDamage() {}, applyStatusEffect() {}
  };
  const inventory = {
    active: null, hotbar: [], storage: [], armor: {},
    getActiveItem() { return this.active; },
    consumeActiveItem(n = 1) { if (this.active) this.active.count -= n; },
    addItem(id, isBlock, count = 1) { this.storage.push({ id, isBlock, count }); return true; },
    updateUI() {}, updateHotbar() {}
  };
  player.inventory = inventory;
  manager.game = { player, inventory, difficulty: 'normal', weather: { weatherType: 'clear' }, controls: {} };
  return { manager, entities, player, inventory, sounds, world: terrain };
}

const held = (inventory, id, extra = {}) => { inventory.active = { id, count: 64, ...extra }; return inventory.active; };

/** Record drops as data; the real spawnDroppedItem needs `document` for icons. */
function recordDrops(entities, into = []) {
  entities.spawnDroppedItem = (pos, itemType, isBlock = true, count = 1) => {
    into.push({ itemType, isBlock, count });
    return into[into.length - 1];
  };
  return into;
}

test('mooshrooms have the reference 10 HP and cow-sized hitbox', () => {
  const { manager } = fixture();
  const mooshroom = manager.spawnMooshroom(0, 1, 0);
  assert.equal(mooshroom.maxHealth, 10, 'wiki: mooshrooms have 10 HP');
  assert.equal(mooshroom.health, 10);
  // They previously fell through to the humanoid default.
  assert.deepEqual(manager.getMobDimensions('mooshroom'), { width: 0.9, height: 1.4 },
    'wiki: adult 1.4 tall, 0.9 wide');
});

test('a mooshroom spawns red with five visible mushrooms, matching the shear drop count', () => {
  const { manager } = fixture();
  const mooshroom = manager.spawnMooshroom(0, 1, 0);
  assert.equal(mooshroom.variant, 'red', 'red spawns naturally; brown does not');
  assert.equal(mooshroom.mushroomMeshes.length, 5, 'wiki: shearing yields 5 mushrooms');
  for (const mesh of mooshroom.mushroomMeshes) {
    assert.equal(mesh.visible, true, 'an adult shows its mushrooms');
  }
  assert.equal(MOOSHROOM_SHEAR_DROPS, 5);
});

test('a baby mooshroom has no mushrooms until it grows up', () => {
  const { manager, player } = fixture();
  const baby = manager.spawnMooshroom(0, 1, 0, { isBaby: true });
  assert.equal(baby.isBaby, true);
  for (const mesh of baby.mushroomMeshes) {
    assert.equal(mesh.visible, false, 'wiki: babies do not have mushrooms on their backs');
  }

  // Growing up is what makes them appear.
  baby.babyGrowthTimer = 0.001;
  manager.animalBehaviors.update(0.01, player);
  assert.equal(baby.isBaby, false, 'the baby grew up');
  for (const mesh of baby.mushroomMeshes) {
    assert.equal(mesh.visible, true, 'mushrooms appear once it is an adult');
  }
});

test('the brown variant recolours the body and drops brown mushrooms', () => {
  const { manager } = fixture();
  const brown = manager.spawnMooshroom(0, 1, 0, { variant: 'brown' });
  assert.equal(brown.variant, 'brown');
  assert.equal(brown.mushroomType, 'brown');
  assert.equal(brown.mesh.children[0].material.color.getHex(), MOOSHROOM_COLORS.brown,
    'the body mesh takes the brown colour');
  assert.equal(MOOSHROOM_MUSHROOM_BLOCK.brown, 'BROWN_MUSHROOM');
  assert.equal(MOOSHROOM_MUSHROOM_BLOCK.red, 'RED_MUSHROOM');
});

test('shearing drops five mushrooms of the right colour, then converts the mob to a cow', () => {
  for (const variant of MOOSHROOM_VARIANTS) {
    const { manager, entities, player, inventory } = fixture();
    const drops = recordDrops(entities);
    const mooshroom = manager.spawnMooshroom(0, 1, 0, { variant });
    held(inventory, 'shears', { durability: 238 });

    assert.equal(manager.animalBehaviors.interact(mooshroom, player, inventory), true);
    assert.equal(drops.length, 5, 'wiki: shearing drops exactly 5 mushrooms');
    const expected = BLOCKS[MOOSHROOM_MUSHROOM_BLOCK[variant]];
    for (const drop of drops) {
      assert.equal(drop.itemType, expected, `${variant} drops its own mushroom`);
      assert.equal(drop.isBlock, true);
    }
    assert.equal(inventory.active.durability, 237, 'shears lose one durability');

    // The mob is replaced outright: it is no longer a mooshroom, it is a cow.
    assert.equal(manager.mobs.length, 1, 'exactly one mob remains');
    const cow = manager.mobs[0];
    assert.equal(cow.type, 'cow', 'wiki: shearing turns the mooshroom into a temperate cow');
    assert.equal(mooshroom.mesh.parent, null, 'the mooshroom mesh is removed from the scene');
    assert.equal(cow.health, 10, 'a cow has 10 HP, and the mooshroom was unharmed at 10');

    // Wiki: the mushrooms do not grow back, so there is no way to shear it again.
    assert.equal(manager.animalBehaviors.interact(cow, player, inventory), false);
    assert.equal(drops.length, 5, 'no further mushroom drops');
  }
});

test('shearing preserves identity a player can observe', () => {
  const { manager, player, inventory } = fixture();
  recordDrops(manager.entities);
  const mooshroom = manager.spawnMooshroom(2, 1, 3);
  mooshroom.name = 'Dinnerbone';
  mooshroom.persistent = true;
  mooshroom.yaw = 1.25;
  held(inventory, 'shears');
  manager.animalBehaviors.interact(mooshroom, player, inventory);

  const cow = manager.mobs[0];
  assert.equal(cow.type, 'cow');
  assert.equal(cow.name, 'Dinnerbone', 'the custom name carries over');
  assert.equal(cow.persistent, true, 'so does persistence');
  assert.equal(cow.yaw, 1.25, 'and facing');
  assert.deepEqual([cow.mesh.position.x, cow.mesh.position.z], [2, 3], 'placed where the mooshroom stood');
});

test('a bowl yields mushroom stew, and suspicious stew from a flower-fed brown mooshroom', () => {
  // Red: plain mushroom stew, and no suspicious stew even after a flower.
  const red = fixture();
  const redShroom = red.manager.spawnMooshroom(0, 1, 0);
  held(red.inventory, 'poppy');
  red.manager.animalBehaviors.interact(redShroom, red.player, red.inventory);
  assert.equal(redShroom.stewEffect ?? null, null, 'wiki: red mooshrooms do not produce suspicious stew');

  held(red.inventory, 'bowl');
  assert.equal(red.manager.animalBehaviors.interact(redShroom, red.player, red.inventory), true);
  assert.equal(red.inventory.active.count, 63, 'the bowl is consumed');
  assert.ok(red.inventory.storage.some(i => i.id === 'mushroom_stew'), 'a bowl gives mushroom stew');

  // Brown: flower first, then suspicious stew.
  const brown = fixture();
  const brownShroom = brown.manager.spawnMooshroom(0, 1, 0, { variant: 'brown' });
  held(brown.inventory, 'bowl');
  assert.equal(brown.manager.animalBehaviors.interact(brownShroom, brown.player, brown.inventory), true);
  assert.ok(brown.inventory.storage.some(i => i.id === 'mushroom_stew'),
    'wiki: a brown mooshroom without a flower still gives mushroom stew');

  held(brown.inventory, 'poppy');
  assert.equal(brown.manager.animalBehaviors.interact(brownShroom, brown.player, brown.inventory), true);
  assert.equal(brownShroom.stewEffect.effect, STEW_EFFECTS.poppy.effect, 'the flower sets the stew effect');
  assert.equal(brownShroom.stewEffect.effect, 'night_vision');

  held(brown.inventory, 'bowl');
  brown.manager.animalBehaviors.interact(brownShroom, brown.player, brown.inventory);
  assert.ok(brown.inventory.storage.some(i => i.id === 'suspicious_stew'), 'a bowl now gives suspicious stew');
  assert.equal(brownShroom.stewEffect, null, 'the flower effect is spent after one milking');
});

test('the small-flower table matches the wiki effect list', () => {
  const expected = {
    allium: 'fire_resistance', azure_bluet: 'blindness', blue_orchid: 'saturation',
    cornflower: 'jump_boost', dandelion: 'saturation', lily_of_the_valley: 'poison',
    oxeye_daisy: 'regeneration', poppy: 'night_vision',
    tulip: 'weakness', orange_tulip: 'weakness', pink_tulip: 'weakness',
    red_tulip: 'weakness', white_tulip: 'weakness'
  };
  for (const [flower, effect] of Object.entries(expected)) {
    assert.equal(STEW_EFFECTS[flower]?.effect, effect, `${flower} gives ${effect}`);
    assert.equal(isSmallFlower(flower), true);
  }
  // Not flowers, and not items at all.
  assert.equal(isSmallFlower('wheat'), false);
  assert.equal(isSmallFlower('sunflower'), false, 'tall flowers are not small flowers');
  assert.equal(isSmallFlower(undefined), false);
  assert.equal(isSmallFlower('hasOwnProperty'), false, 'the table must not inherit from Object.prototype');
});

test('a baby mooshroom cannot be milked, stewed or sheared', () => {
  const { manager, player, inventory } = fixture();
  const baby = manager.spawnMooshroom(0, 1, 0, { isBaby: true });
  for (const item of ['bucket', 'bowl', 'shears']) {
    held(inventory, item);
    assert.equal(manager.animalBehaviors.canInteract(baby, player, inventory), false, `no ${item} on a baby`);
    assert.equal(manager.animalBehaviors.interact(baby, player, inventory), false);
  }
  assert.equal(manager.mobs[0].type, 'mooshroom', 'the baby is untouched');
});

test('a bucket still milks a mooshroom for a milk bucket', () => {
  const { manager, player, inventory } = fixture();
  const mooshroom = manager.spawnMooshroom(0, 1, 0);
  held(inventory, 'bucket');
  assert.equal(manager.animalBehaviors.interact(mooshroom, player, inventory), true);
  assert.ok(inventory.storage.some(i => i.id === 'milk_bucket'), 'bucket milking is unchanged');
  assert.equal(manager.mobs[0].type, 'mooshroom', 'and does not convert the mob');
});

test('lightning switches the variant without damaging the mooshroom', () => {
  const { manager } = fixture();
  const near = manager.spawnMooshroom(1, 1, 1);
  const far = manager.spawnMooshroom(30, 1, 30);
  const strike = new THREE.Vector3(0, 1, 0);

  const converted = convertLightningMooshrooms(manager, strike);
  assert.equal(converted.length, 1, 'only the mooshroom within 4 blocks converts');
  assert.equal(near.variant, 'brown', 'red becomes brown');
  assert.equal(near.health, 10, 'wiki: mooshrooms take no damage from the transformation');
  assert.equal(near.mesh.children[0].material.color.getHex(), MOOSHROOM_COLORS.brown, 'and looks brown');
  assert.equal(far.variant, 'red', 'the distant mooshroom is untouched');

  // It is a toggle, not a one-way change.
  convertLightningMooshrooms(manager, strike);
  assert.equal(near.variant, 'red', 'brown becomes red again');
  assert.equal(near.health, 10);
});

test('the variant helpers are individually correct', () => {
  assert.deepEqual(MOOSHROOM_VARIANTS, ['red', 'brown']);
  assert.equal(otherMooshroomVariant('red'), 'brown');
  assert.equal(otherMooshroomVariant('brown'), 'red');
  assert.equal(otherMooshroomVariant(undefined), 'brown');

  const { manager } = fixture();
  const m = manager.spawnMooshroom(0, 1, 0);
  assert.equal(isMooshroom(m), true);
  assert.equal(isBrownMooshroom(m), false);
  assert.equal(isMooshroom({ type: 'cow' }), false);

  assert.equal(convertMooshroomVariant(m), 'brown');
  assert.equal(isBrownMooshroom(m), true);
  assert.equal(convertMooshroomVariant({ type: 'cow' }), null, 'a cow is not convertible');
});

test('converting a mooshroom to a cow carries baby state across', () => {
  const { manager } = fixture();
  const baby = manager.spawnMooshroom(0, 1, 0, { isBaby: true });
  const cow = convertMooshroomToCow(manager, baby);
  assert.ok(cow, 'a cow replaces it');
  assert.equal(cow.type, 'cow');
  assert.equal(cow.isBaby, true, 'a baby mooshroom becomes a baby cow');
  assert.equal(manager.mobs.length, 1);
  assert.equal(manager.mobs[0], cow);
});

test('mooshrooms breed with wheat but never with cows', () => {
  assert.deepEqual(BREEDING_FOODS.mooshroom, ['wheat'], 'wiki: mooshrooms breed with wheat');
  assert.deepEqual(BREEDING_FOODS.cow, ['wheat']);

  const { manager, player, inventory } = fixture();
  const mooshroom = manager.spawnMooshroom(0, 1, 0);
  const cow = manager.spawnCow(1.5, 1, 0);
  held(inventory, 'wheat');
  assert.equal(manager.animalBehaviors.interact(mooshroom, player, inventory), true, 'wheat starts courtship');
  assert.ok(mooshroom.inLove > 0);

  // The pair check requires matching types, so the cow is never a partner.
  for (let i = 0; i < 200; i++) manager.animalBehaviors.update(1 / 60, player);
  assert.equal(manager.mobs.filter(m => m.isBaby).length, 0,
    'wiki: a mooshroom cannot be bred with a cow');
});

test('two mooshrooms do breed, producing a mooshroom lamb', () => {
  const { manager, player, inventory } = fixture();
  const a = manager.spawnMooshroom(0, 1, 0);
  const b = manager.spawnMooshroom(1.5, 1, 0);
  for (const mob of [a, b]) {
    held(inventory, 'wheat');
    manager.animalBehaviors.interact(mob, player, inventory);
  }
  // Mooshrooms can now walk, which they could not before ambientLocomotion.js gave them a wander
  // role. Breeding needs them within reach of each other, and wandering can carry them apart
  // before they meet, so the pair is closed up once they are both in love rather than left to
  // find each other by chance. The breeding rule itself is what this test is about.
  for (let i = 0; i < 600; i++) {
    manager.update(1 / 60, player);
    if (a.inLove > 0 && b.inLove > 0 && i === 5) {
      b.mesh.position.set(a.mesh.position.x + 0.6, a.mesh.position.y, a.mesh.position.z);
    }
  }
  const baby = manager.mobs.find(m => m.isBaby);
  assert.ok(baby, `a baby is born (a and b are ${a.mesh.position.distanceTo(b.mesh.position).toFixed(2)} apart)`);
  assert.equal(baby.type, 'mooshroom', 'mooshroom x mooshroom keeps the species');
});

test('mooshrooms drop beef and leather like cows, and no mushrooms', () => {
  const { manager } = fixture();
  const mooshroom = manager.spawnMooshroom(0, 1, 0);
  const rows = manager.getMobDeathDrops(mooshroom);
  const ids = rows.map(r => r[0]);
  assert.ok(ids.includes('beef'), `expected beef, got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('leather'), `expected leather, got ${JSON.stringify(ids)}`);
  assert.ok(!ids.some(id => id === BLOCKS.RED_MUSHROOM || id === BLOCKS.BROWN_MUSHROOM),
    'wiki: mooshrooms do not drop mushrooms on death; only shearing gives those');
  assert.deepEqual(manager.getMobDeathDrops(mooshroom), manager.getMobDeathDrops(manager.spawnCow(4, 1, 0)),
    'the drop table matches a cow exactly');
});

test('the Inspector can spawn the mooshroom and reports variant and health', () => {
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const mooshroom = s.reset('mooshroom');
  assert.equal(mooshroom.type, 'mooshroom');
  assert.equal(s.snapshot().health, 10, 'Inspector telemetry shows 10 HP');
  assert.equal(s.snapshot().maxHealth, 10);
  assert.equal(s.snapshot().variant, 'red');
  assert.equal(s.snapshot().mushrooms, 5, 'five mushroom meshes are visible');
  s.tick(1 / 60);
  assert.equal(s.snapshot().health, 10);
});

test('applyMooshroomVariant is a no-op on non-mooshrooms and idempotent on mooshrooms', () => {
  assert.doesNotThrow(() => applyMooshroomVariant(null));
  assert.doesNotThrow(() => applyMooshroomVariant({ type: 'cow' }));
  const { manager } = fixture();
  const m = manager.spawnMooshroom(0, 1, 0, { variant: 'brown' });
  const before = m.mesh.children[0].material.color.getHex();
  applyMooshroomVariant(m);
  applyMooshroomVariant(m);
  assert.equal(m.mesh.children[0].material.color.getHex(), before, 're-applying changes nothing');
});
