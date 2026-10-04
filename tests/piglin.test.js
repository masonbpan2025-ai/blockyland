import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { HostileMobBehaviors } from '../src/hostileMobBehaviors.js';
import { updatePiglin, angerPiglins, barterReward, PIGLIN_BARTER_LOOT } from '../src/piglin.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';

function fixture() {
  const world = { dimension: 'nether', getVoxel: () => 0 };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    scene: new THREE.Scene(), world, textures: {}, mobs: [],
    isBlockSolid: () => false, checkMobCollision: () => false,
    spawnArrow: (...args) => arrows.push(args)
  });
  const rewards = [], arrows = [];
  const entities = { droppedItems: [], spawnDroppedItem: (...args) => rewards.push(args) };
  const behavior = new HostileMobBehaviors(manager, world, {}, entities);
  const mob = manager.spawnPiglin(0, 1, 0);
  let consumed = 0;
  const player = { position: new THREE.Vector3(0, 1, 4), gamemode: 'survival',
    inventory: { armor: {}, getActiveItem: () => ({ id: 'gold_ingot' }), consumeActiveItem: () => consumed++ } };
  return { manager, world, mob, player, behavior, entities, rewards, arrows,
    consumed: () => consumed, tick: dt => updatePiglin(behavior, mob, dt, player) };
}
test('Piglin has separate opaque textured hide and clothes, a modeled face and weapon', () => {
  const f = fixture();
  for (const name of ['piglin_hide', 'piglin_clothes']) {
    const data = f.manager.textures[name].image.data;
    assert.equal(data.length, 1024);
    assert.ok(new Set(data.filter((_, i) => i % 4 === 0)).size > 1);
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255);
  }
  assert.notEqual(f.manager.textures.piglin_hide, f.manager.textures.piglin_clothes);
  assert.ok(f.mob.head.children.length >= 9);
  assert.ok(['golden_sword', 'crossbow'].includes(f.mob.weapon));
});
test('two-argument interaction consumes one ingot and returns one reward after six seconds', () => {
  const f = fixture();
  assert.equal(f.behavior.interactPiglin(f.mob, f.player), true);
  assert.equal(f.behavior.interactPiglin(f.mob, f.player), false);
  assert.equal(f.consumed(), 1);
  f.tick(5.9); assert.equal(f.rewards.length, 0); assert.equal(f.mob.admiredGold.visible, true);
  f.tick(0.11); assert.equal(f.rewards.length, 1);
  assert.ok(f.rewards[0][3] >= 1);
  assert.equal(f.mob.admiredGold.visible, false);
});
test('dropped gold attracts Piglins and consumes only one item from a stack', () => {
  const f = fixture(); const group = new THREE.Group(); group.position.set(3, 1, 0);
  f.entities.droppedItems.push({ itemType: 'gold_ingot', count: 3, group, isBlock: false });
  f.tick(0.1); assert.ok(f.mob.velocity.x > 0);
  group.position.x = 0.5; f.tick(0.1);
  assert.equal(f.entities.droppedItems[0].count, 2); assert.equal(f.mob.isBartering, true);
});
test('gold armor prevents unprovoked attacks; group anger cancels a barter', () => {
  const f = fixture(); f.player.inventory.armor.head = { id: 'golden_helmet' };
  f.tick(0.1); assert.equal(f.mob.target, null);
  f.behavior.interactPiglin(f.mob, f.player);
  angerPiglins(f.manager, f.player.position); f.tick(0.1);
  assert.equal(f.mob.target, f.player); assert.equal(f.mob.isBartering, false);
  assert.equal(f.rewards.length, 0);
});
test('sword and crossbow attacks actually damage or launch a projectile', () => {
  const f = fixture(); let damage = 0; f.player.takeDamage = n => damage += n;
  f.mob.weapon = 'golden_sword'; f.player.position.z = 1; f.tick(0.1); assert.equal(damage, 8);
  f.mob.weapon = 'crossbow'; f.mob.attackCooldown = 0; f.player.position.z = 8;
  f.tick(0.1); assert.equal(f.arrows.length, 1);
  f.player.gamemode = 'creative'; f.tick(3); assert.equal(f.mob.target, null); assert.equal(f.arrows.length, 1);
});
test('babies take gold without bartering and flee nearby zombified Piglins', () => {
  const f = fixture(); f.mob.isBaby = true;
  f.behavior.interactPiglin(f.mob, f.player); f.tick(6.1); assert.equal(f.rewards.length, 0);
  f.manager.mobs.push({ type: 'zombified_piglin', health: 20, mesh: { position: new THREE.Vector3(1, 1, 0) } });
  f.tick(0.1); assert.ok(f.mob.velocity.x < 0);
});
test('soul torches repel idle Piglins', () => {
  const f = fixture(); f.player.inventory.armor.head = { id: 'golden_helmet' }; f.world.getVoxel = (x,y,z) => x === 1 && y === 1 && z === 0 ? BLOCKS.SOUL_TORCH : 0;
  f.tick(0.1); assert.ok(f.mob.velocity.x < 0); assert.equal(f.mob.target, null);
});
test('supported rewards have usable IDs and inclusive count ranges', () => {
  let offset = 0; const total = PIGLIN_BARTER_LOOT.reduce((n,e) => n + e.weight,0);
  for (const entry of PIGLIN_BARTER_LOOT) {
    assert.ok(entry.isBlock ? Object.values(BLOCKS).includes(entry.id) : ITEMS[entry.id]);
    for (const [roll, expected] of [[0, entry.min], [0.999999, entry.max]]) {
      let call = 0; const reward = barterReward(() => call++ === 0 ? (offset + 0.5) / total : roll);
      assert.equal(reward.id, entry.id); assert.equal(reward.count, expected);
    }
    offset += entry.weight;
  }
});
test('conversion takes 15 seconds outside Nether and resets on return', () => {
  const f = fixture(); let conversions = 0;
  const spawn=f.manager.spawnZombifiedPiglin.bind(f.manager);
  f.manager.spawnZombifiedPiglin = (...args) => { conversions++; return spawn(...args); };
  f.world.dimension = 'overworld'; f.tick(14); assert.equal(conversions, 0);
  f.world.dimension = 'nether'; f.tick(1); assert.equal(f.mob.conversionTime, 0);
  f.world.dimension = 'overworld'; f.tick(15); assert.equal(conversions, 1);
  assert.ok(!f.manager.mobs.includes(f.mob));
});

test('Piglins cannot collect gold through a wall or several blocks above them', () => {
  const f = fixture(); const group = new THREE.Group(); group.position.set(0.5, 4, 0);
  f.entities.droppedItems.push({ itemType: 'gold_ingot', count: 1, group, isBlock: false });
  f.tick(0.1); assert.equal(f.entities.droppedItems[0].count, 1);
  f.manager.isBlockSolid = () => true; group.position.set(0.5, 1, 0);
  f.tick(0.1); assert.equal(f.entities.droppedItems[0].count, 1);
});
test('Piglin attacks cannot pass through solid walls', () => {
  const f = fixture(); let damage = 0; f.player.takeDamage = n => damage += n;
  f.manager.isBlockSolid = () => true;
  f.mob.weapon = 'golden_sword'; f.player.position.z = 1; f.tick(0.1);
  f.mob.weapon = 'crossbow'; f.player.position.z = 8; f.tick(3);
  assert.equal(damage, 0); assert.equal(f.arrows.length, 0);
});
