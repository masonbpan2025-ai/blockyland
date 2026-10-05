// Copper Golem parity with https://minecraft.wiki/w/Copper_Golem
//
// The copper golem is a buildable passive mob with a small job: it "takes items out of copper chests, and
// attempts to store them in nearby wooden chests and trapped chests". It is also the only mob that AGES into a
// block -- un-waxed it oxidizes through four stages until it becomes a statue, dropping whatever it held.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  COPPER_GOLEM_HEALTH, COPPER_GOLEM_DIMENSIONS, COPPER_GOLEM_SPEED, COPPER_OXIDATION_STAGES,
  COPPER_OXIDATION_SECONDS, COPPER_GOLEM_COLORS,
  isCopperGolem, copperGolemDimensions, copperGolemCanPlaceIn, copperGolemCanTakeFrom, copperGolemCanStoreIn,
  findCopperGolemSource, findCopperGolemDestination, copperGolemTake, copperGolemPlace,
  updateCopperGolemOxidation, waxCopperGolem, scrapeCopperGolem, reanimateCopperGolemStatue, shearCopperGolem,
  giveCopperGolemPoppy, copperGolemDrops, copperGolemXp, copperGolemColor, createCopperGolemModel, poseCopperGolem
} from '../src/copperGolemBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const dropped = [];
  const entities = {
    droppedItems: dropped,
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { dropped.push({ itemType, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [], snowballs: [],
    textures: {}, blocks: BLOCKS, blockRegistry: BLOCKS, chests: [],
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(300, 1, 300), velocity: new THREE.Vector3(), type: 'player',
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities, dropped };
}

const chest = (type, x, z, inventory = []) => ({
  type, position: new THREE.Vector3(x, 1, z), inventory
});

test('copper golem is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  assert.equal(golem.type, 'copper_golem');
  assert.equal(golem.name, 'Copper Golem');
  assert.notEqual(golem.type, 'villager');
  assert.equal(isCopperGolem(golem), true);
  assert.equal(isCopperGolem('copper_golem'), true);
  assert.equal(isCopperGolem('iron_golem'), false, 'a different golem');
  assert.equal(isCopperGolem(null), false);
});

test('the health, hitbox and speed match the wiki', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  assert.equal(COPPER_GOLEM_HEALTH, 12);
  assert.equal(golem.maxHealth, 12, 'wiki: 12 HP');
  // Wiki: 0.49 x 0.98 in Java.
  assert.deepEqual(COPPER_GOLEM_DIMENSIONS, { width: 0.49, height: 0.98 });
  assert.deepEqual([golem.width, golem.height], [0.49, 0.98]);
  assert.deepEqual(manager.getMobDimensions('copper_golem'), { width: 0.49, height: 0.98 });
  assert.deepEqual(copperGolemDimensions(), COPPER_GOLEM_DIMENSIONS);
  assert.equal(COPPER_GOLEM_SPEED, 0.2);
  assert.equal(golem.speed, 0.2);
  assert.equal(golem.onGround, true, 'a definite groundedness at spawn');
  // Wiki: passive, and not undead, so it does not burn.
  assert.equal(golem.isHostile, false);
  assert.equal(golem.isPassive, true);
  assert.equal(golem.undead, false);
  assert.equal(golem.burnsInDaylight, false);
});

test('the destination rule is the wiki\'s: empty, or already holding that type', () => {
  // Wiki: a chest "must either be empty, or contain the item type it is holding, for the golem to place
  // anything inside of it".
  assert.equal(copperGolemCanPlaceIn([], 'copper_ingot'), true, 'empty accepts anything');
  assert.equal(copperGolemCanPlaceIn([{ id: 'copper_ingot' }], 'copper_ingot'), true, 'same type accepts');
  assert.equal(copperGolemCanPlaceIn([{ id: 'iron_ingot' }], 'copper_ingot'), false, 'a different type refuses');
  assert.equal(copperGolemCanPlaceIn([{ id: 'copper_ingot' }, { id: 'iron_ingot' }], 'copper_ingot'), false,
    'one mismatched slot is enough to refuse');
  assert.equal(copperGolemCanPlaceIn([null, { id: 'copper_ingot' }], 'copper_ingot'), true,
    'empty slots are ignored');
  assert.equal(copperGolemCanPlaceIn(null, 'copper_ingot'), false);
  assert.equal(copperGolemCanPlaceIn([], null), true, 'an empty chest has no type to disagree with');
});

test('it takes from copper chests and stores in wooden ones', () => {
  // Wiki: it "takes items out of copper chests, and attempts to store them in nearby wooden chests and trapped
  // chests".
  assert.equal(copperGolemCanTakeFrom({ type: 'copper_chest' }), true);
  assert.equal(copperGolemCanTakeFrom({ type: 'chest' }), false, 'a wooden chest is a destination, not a source');
  assert.equal(copperGolemCanStoreIn({ type: 'chest' }), true);
  assert.equal(copperGolemCanStoreIn({ type: 'trapped_chest' }), true);
  assert.equal(copperGolemCanStoreIn({ type: 'copper_chest' }), false, 'and a copper chest is not a destination');
  assert.equal(copperGolemCanTakeFrom(null), false);
  assert.equal(copperGolemCanStoreIn(null), false);
});

test('the whole hauling job: take one type, carry it, store it', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  const source = chest('copper_chest', 2, 0, [{ id: 'copper_ingot', count: 3 }]);
  const destination = chest('chest', 6, 0, []);
  manager.chests = [source, destination];

  // It finds the source, and the destination that will accept what it is about to carry.
  assert.equal(findCopperGolemSource(manager, golem), source);
  assert.equal(findCopperGolemDestination(manager, golem, 'copper_ingot'), destination);
  // Nothing held means nothing to place.
  assert.equal(copperGolemPlace(golem, destination), false);

  const taken = copperGolemTake(golem, source);
  assert.equal(taken.id, 'copper_ingot');
  assert.equal(golem.heldItem, 'copper_ingot');
  assert.equal(golem.heldCount, 3);
  assert.equal(source.inventory[0], null, 'the item left the copper chest');
  // Wiki: it carries ONE type, so a second take is refused while holding.
  assert.equal(copperGolemTake(golem, source), null);

  assert.equal(copperGolemPlace(golem, destination), true);
  assert.equal(golem.heldItem, null);
  assert.deepEqual(destination.inventory, [{ id: 'copper_ingot', count: 3 }]);
  // A destination holding a different type refuses, and it keeps holding.
  golem.heldItem = 'copper_ingot';
  golem.heldCount = 2;
  const wrong = chest('chest', 9, 0, [{ id: 'iron_ingot', count: 1 }]);
  manager.chests.push(wrong);
  assert.equal(copperGolemPlace(golem, wrong), false);
  assert.equal(golem.heldItem, 'copper_ingot', 'still holding it');
  // It merges into an existing stack of the same type rather than adding a slot.
  const same = chest('chest', 8, 0, [{ id: 'copper_ingot', count: 1 }]);
  assert.equal(copperGolemPlace(golem, same), true);
  assert.deepEqual(same.inventory, [{ id: 'copper_ingot', count: 3 }], 'merged into the existing stack');
});

test('the source search skips empty copper chests and out-of-range ones', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  const empty = chest('copper_chest', 1, 0, []);
  const far = chest('copper_chest', 60, 0, [{ id: 'copper_ingot', count: 1 }]);
  manager.chests = [empty, far];
  assert.equal(findCopperGolemSource(manager, golem), null, 'empty is pointless and far is out of range');
  const near = chest('copper_chest', 3, 0, [{ id: 'copper_ingot', count: 1 }]);
  manager.chests.push(near);
  assert.equal(findCopperGolemSource(manager, golem), near, 'the nearest useful one');
  assert.equal(findCopperGolemSource(manager, manager.spawnCow(0, 1, 0)), null, 'only a golem hauls');
});

test('it oxidizes through four stages and becomes a statue, dropping what it held', () => {
  // Wiki: "If not waxed, a copper golem oxidizes over time and eventually turns into a copper golem statue,
  // dropping its currently held items."
  assert.deepEqual(COPPER_OXIDATION_STAGES, ['unoxidized', 'exposed', 'weathered', 'oxidized']);
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  assert.equal(golem.oxidationStage, 'unoxidized');
  assert.equal(golem.isStatue, false);
  const advance = () => {
    golem.oxidationTimer = COPPER_OXIDATION_SECONDS;
    return updateCopperGolemOxidation(golem, 0);
  };
  assert.equal(advance(), 'exposed');
  assert.equal(advance(), 'weathered');
  assert.equal(advance(), 'oxidized');
  // It carries something at the end, which must be dropped rather than lost.
  golem.heldItem = 'copper_ingot';
  golem.heldCount = 2;
  assert.equal(advance(), 'statue');
  assert.equal(golem.isStatue, true);
  assert.equal(golem.heldItem, null, 'it no longer holds it');
  assert.deepEqual(golem.droppedOnOxidizing, { id: 'copper_ingot', count: 2 }, 'and it was recorded as dropped');
  // A statue does not oxidize further.
  golem.oxidationTimer = COPPER_OXIDATION_SECONDS;
  assert.equal(updateCopperGolemOxidation(golem, 0), null);
});

test('the oxidation interval is a named, documented constant', () => {
  // The wiki says it oxidizes "over time" without giving an interval on the page this was written from, so the
  // value is a named constant with a stated assumption rather than a magic number in a loop.
  assert.equal(typeof COPPER_OXIDATION_SECONDS, 'number');
  assert.ok(COPPER_OXIDATION_SECONDS > 0);
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  // It does not advance early.
  assert.equal(updateCopperGolemOxidation(golem, COPPER_OXIDATION_SECONDS - 1), null);
  assert.equal(golem.oxidationStage, 'unoxidized');
  assert.equal(updateCopperGolemOxidation(golem, 1), 'exposed', 'and does at the boundary');
});

test('an un-waxed golem oxidizes through the REAL update loop and drops its item', () => {
  const { manager, player, entities } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  // Start one step from the end of the ladder, holding something.
  golem.oxidationStage = 'oxidized';
  golem.oxidationTimer = COPPER_OXIDATION_SECONDS - 0.01;
  golem.heldItem = 'copper_ingot';
  golem.heldCount = 3;
  for (let i = 0; i < 5; i++) manager.update(1 / 60, player);
  assert.equal(golem.isStatue, true, 'the loop drove it to a statue');
  assert.equal(golem.state, 'statue');
  assert.equal(golem.heldItem, null);
  assert.equal(entities.droppedItems.some(d => d.itemType === 'copper_ingot' && d.count === 3), true,
    'and the held item was actually dropped into the world');
  // A statue does not move.
  const at = golem.mesh.position.clone();
  for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  assert.equal(golem.mesh.position.distanceTo(at), 0, 'a statue is frozen');
});

test('waxing stops the oxidation permanently', () => {
  // Wiki: honeycomb is a usable item, and "if not waxed" is the condition for oxidizing at all.
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  assert.equal(waxCopperGolem(golem, 'honeycomb'), true);
  assert.equal(golem.waxed, true);
  assert.equal(waxCopperGolem(golem, 'honeycomb'), false, 'already waxed');
  assert.equal(waxCopperGolem(golem, 'copper_ingot'), false, 'only honeycomb waxes');
  // It no longer oxidizes, even past the interval.
  assert.equal(updateCopperGolemOxidation(golem, COPPER_OXIDATION_SECONDS * 10), null);
  assert.equal(golem.oxidationStage, 'unoxidized');
  assert.equal(golem.isStatue, false);
  // And a statue cannot be waxed back, since the wiki gives no route from there.
  const statue = manager.spawnMob('copper_golem', 5, 1, 0);
  statue.isStatue = true;
  assert.equal(waxCopperGolem(statue, 'honeycomb'), false);
});

test('an axe scrapes one stage off, and scraping stops at unoxidized', () => {
  // The axe is listed as a usable item, and scraping one stage at a time is how copper works elsewhere in the
  // game.
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0, { oxidationStage: 'weathered' });
  assert.equal(golem.oxidationStage, 'weathered');
  assert.equal(scrapeCopperGolem(golem, 'iron_axe'), 'exposed');
  assert.equal(scrapeCopperGolem(golem, 'netherite_axe'), 'unoxidized');
  assert.equal(scrapeCopperGolem(golem, 'iron_axe'), null, 'already as fresh as it gets');
  assert.equal(scrapeCopperGolem(golem, 'stick'), null, 'only an axe scrapes');
  // Waxed copper cannot be scraped.
  const waxed = manager.spawnMob('copper_golem', 5, 1, 0, { oxidationStage: 'oxidized', waxed: true });
  assert.equal(scrapeCopperGolem(waxed, 'iron_axe'), null);
  assert.equal(scrapeCopperGolem(manager.spawnCow(0, 1, 0), 'iron_axe'), null);
});

test('an unwaxed unoxidized statue reanimates with an axe', () => {
  // Wiki: "Using an axe on an unwaxed and unoxidized copper golem statue causes it to reanimate into a copper
  // golem." Both conditions are required.
  const fresh = { type: 'copper_golem_statue', oxidationStage: 'unoxidized' };
  assert.equal(reanimateCopperGolemStatue(fresh, 'iron_axe'), true);
  assert.equal(reanimateCopperGolemStatue({ type: 'copper_golem_statue' }, 'iron_axe'), true,
    'an absent stage counts as unoxidized');
  // Waxed: no.
  assert.equal(reanimateCopperGolemStatue({ ...fresh, waxed: true }, 'iron_axe'), false);
  // Oxidized: no.
  assert.equal(reanimateCopperGolemStatue({ ...fresh, oxidationStage: 'exposed' }, 'iron_axe'), false);
  assert.equal(reanimateCopperGolemStatue({ ...fresh, oxidationStage: 'oxidized' }, 'iron_axe'), false);
  // Not a statue, or not an axe: no.
  assert.equal(reanimateCopperGolemStatue({ type: 'copper_golem' }, 'iron_axe'), false);
  assert.equal(reanimateCopperGolemStatue(fresh, 'honeycomb'), false);
  assert.equal(reanimateCopperGolemStatue(null, 'iron_axe'), false);
});

test('an iron golem can give it a poppy, and shears take it back', () => {
  // Wiki: "When a copper golem has been given a poppy by an iron golem, it can be sheared to drop 1 poppy."
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  assert.equal(shearCopperGolem(golem, 'shears'), null, 'nothing to shear yet');
  assert.equal(giveCopperGolemPoppy(golem, 'player'), false, 'only an iron golem gives it');
  assert.equal(giveCopperGolemPoppy(golem, 'iron_golem'), true);
  assert.equal(golem.hasPoppy, true);
  assert.equal(giveCopperGolemPoppy(golem, 'iron_golem'), false, 'only one');
  assert.equal(shearCopperGolem(golem, 'iron_axe'), null, 'only shears');
  assert.equal(shearCopperGolem(golem, 'shears'), 'poppy');
  assert.equal(golem.hasPoppy, false);
  assert.equal(shearCopperGolem(golem, 'shears'), null, 'and only once');
  assert.ok(BLOCKS.POPPY !== undefined, 'the poppy it drops is a real block');
});

test('the palette follows the oxidation stage', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  assert.equal(COPPER_GOLEM_COLORS.unoxidized, copperGolemColor('unoxidized'));
  for (const stage of COPPER_OXIDATION_STAGES) {
    assert.equal(typeof copperGolemColor(stage), 'number', `${stage} has a colour`);
  }
  assert.equal(copperGolemColor('nonsense'), COPPER_GOLEM_COLORS.unoxidized, 'unknown falls back');
  // The loop repaints the body as it oxidizes, so the change is visible as well as mechanical.
  golem.oxidationTimer = COPPER_OXIDATION_SECONDS;
  const before = golem.bodyMat.color.getHex();
  manager.update(1 / 60, manager.game.player);
  assert.equal(golem.oxidationStage, 'exposed');
  assert.notEqual(golem.bodyMat.color.getHex(), before, 'the body changed colour with the stage');
});

test('it drops 1-3 copper ingots and gives no experience', () => {
  // Wiki: 1-3 copper ingots. No XP value is given, so it is zero rather than a guess.
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  golem.playerDamaged = true;
  assert.deepEqual(copperGolemDrops(golem), [['copper_ingot', false, 1, 3]]);
  assert.deepEqual(manager.getMobDeathDrops(golem, () => 0.5), copperGolemDrops(golem),
    'the manager agrees with the module');
  const row = manager.getMobDeathDrops(golem, () => 0.5)[0];
  assert.equal(row[2], 1, 'minimum 1');
  assert.equal(row[3], 3, 'maximum 3');
  assert.equal(copperGolemXp(golem), 0);
});

test('it walks around through the real update loop', () => {
  const { manager, player } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  const start = golem.mesh.position.clone();
  assert.doesNotThrow(() => {
    for (let i = 0; i < 360; i++) manager.update(1 / 60, player);
  });
  assert.ok(manager.mobs.includes(golem), 'still alive');
  // It is a mobile mob, not one of the deliberately stationary ones: if this regresses it is a real defect.
  assert.ok(golem.mesh.position.distanceTo(start) > 0.25,
    `the copper golem moved, got ${golem.mesh.position.distanceTo(start)}`);
  assert.deepEqual([...(manager.mobErrors || [])], [], 'with no reported fault');
});

test('it hauls an item end to end through the real update loop', () => {
  const { manager, player } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  const source = chest('copper_chest', 1.2, 0, [{ id: 'copper_ingot', count: 1 }]);
  const destination = chest('chest', 1.2, 1.2, []);
  manager.chests = [source, destination];
  let pickedUp = false;
  let stored = false;
  for (let i = 0; i < 3000 && !stored; i++) {
    manager.update(1 / 60, player);
    if (golem.heldItem) pickedUp = true;
    if (pickedUp && !golem.heldItem) stored = true;
  }
  assert.equal(pickedUp, true, 'it picked the item up out of the copper chest');
  assert.equal(stored, true, 'and stored it in the wooden chest');
  assert.equal(source.inventory[0], null, 'the source is empty');
  assert.deepEqual(destination.inventory, [{ id: 'copper_ingot', count: 1 }], 'and the destination has it');
});

test('the model has the copper golem silhouette, including the antenna', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  assert.ok(golem.body && golem.head, 'a body and head');
  assert.equal(golem.arms.length, 2);
  assert.equal(golem.legs.length, 2);
  assert.equal(golem.eyes.length, 2);
  assert.ok(golem.antenna && golem.bulb, 'the antenna and its bulb');
  assert.ok(golem.held && golem.held.visible === false, 'a hidden carried item');
  const model = createCopperGolemModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial());
  assert.ok(model.antenna && model.arms.length === 2 && model.held.visible === false);
});

test('the pose animates a walker and freezes a statue', () => {
  const { manager } = fixture();
  const golem = manager.spawnMob('copper_golem', 0, 1, 0);
  poseCopperGolem(golem, 0.3);
  assert.notEqual(golem.legs[0].rotation.x, 0, 'the legs swing');
  assert.notEqual(golem.arms[0].rotation.x, 0, 'and the arms');
  // The carried item is only shown while carrying.
  assert.equal(golem.held.visible, false);
  golem.heldItem = 'copper_ingot';
  poseCopperGolem(golem, 0.3);
  assert.equal(golem.held.visible, true);
  // A statue is frozen, which is the point of the oxidised end state.
  golem.legs[0].rotation.x = 1;
  golem.arms[0].rotation.x = 1;
  golem.isStatue = true;
  poseCopperGolem(golem, 0.3);
  assert.equal(golem.legs[0].rotation.x, 0);
  assert.equal(golem.arms[0].rotation.x, 0);
  assert.doesNotThrow(() => poseCopperGolem(null));
  assert.doesNotThrow(() => poseCopperGolem({}));
});

test('the Inspector can spawn the copper golem', () => {
  assert.ok(DEBUG_MOBS.includes('copper_golem'), 'copper_golem must be selectable');
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const golem = s.reset('copper_golem');
  assert.equal(golem.type, 'copper_golem');
  assert.equal(s.snapshot().maxHealth, 12, 'Inspector telemetry shows 12 HP');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.copper_golem_spawn_egg, 'the copper golem has a spawn egg');
  assert.equal(ITEMS.copper_golem_spawn_egg.mob, 'copper_golem');
  assert.equal(ITEMS.copper_golem_spawn_egg.type, 'spawn_egg');
  // The items its interactions need.
  assert.ok(ITEMS.honeycomb, 'honeycomb exists, to wax it');
  assert.ok(ITEMS.shears, 'shears exist, to take the poppy');
  assert.ok(ITEMS.copper_ingot, 'copper ingot exists, for the drop');
});

test('the helpers are safe on non-golems and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isCopperGolem(cow), false);
  assert.equal(copperGolemCanTakeFrom(cow), false);
  assert.equal(copperGolemCanStoreIn(cow), false);
  assert.deepEqual(copperGolemDimensions(), COPPER_GOLEM_DIMENSIONS);
  assert.equal(copperGolemTake(cow, { type: 'copper_chest', inventory: [] }), null);
  assert.equal(copperGolemPlace(cow, { type: 'chest', inventory: [] }), false);
  assert.equal(updateCopperGolemOxidation(cow, 1e9), null);
  assert.equal(waxCopperGolem(cow, 'honeycomb'), false);
  assert.equal(scrapeCopperGolem(cow, 'iron_axe'), null);
  assert.equal(shearCopperGolem(cow, 'shears'), null);
  assert.equal(giveCopperGolemPoppy(cow, 'iron_golem'), false);
  assert.deepEqual(copperGolemDrops(cow), []);
  assert.equal(copperGolemXp(cow), 0);
  assert.equal(findCopperGolemSource(manager, cow), null);
  assert.equal(findCopperGolemDestination(manager, cow, 'copper_ingot'), null);
  assert.equal(manager.spawnMob('copper_golem', 9, 1, 9).type, 'copper_golem');
});
