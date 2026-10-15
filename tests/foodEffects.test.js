// Food side effects (src/foodEffects.js) against the wiki's Food, "Food effects" table. Found by the wiki-tutorial
// play-test (Things not to do): pufferfish, spider eyes, poisonous potatoes, rotten flesh and raw chicken had none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFoodEffects, chorusTeleport, FOOD_EFFECTS } from '../src/foodEffects.js';
import { BLOCKS } from '../src/blocks.js';

const player = () => {
  const effects = new Map();
  return { statusEffects: effects, applyStatusEffect: (e, s, l) => effects.set(e, { duration: s, level: l }), clearStatusEffect: (e) => effects.delete(e) };
};

test('the wiki table', () => {
  assert.deepEqual(FOOD_EFFECTS.pufferfish, [['hunger', 15, 3, 1], ['nausea', 15, 1, 1], ['poison', 60, 2, 1]], '0:15 Hunger III, 0:15 Nausea, 1:00 Poison II');
  assert.deepEqual(FOOD_EFFECTS.spider_eye, [['poison', 5, 1, 1]]);
  assert.deepEqual(FOOD_EFFECTS.poisonous_potato, [['poison', 5, 1, 0.6]], '60% chance');
  assert.deepEqual(FOOD_EFFECTS.rotten_flesh, [['hunger', 30, 1, 0.8]], '80% chance');
  assert.deepEqual(FOOD_EFFECTS.chicken, [['hunger', 30, 1, 0.3]], '30% chance');
});

test('effects apply, chances roll, a honey bottle clears poison', () => {
  const p = player();
  applyFoodEffects(p, 'pufferfish');
  assert.deepEqual([...p.statusEffects.keys()].sort(), ['hunger', 'nausea', 'poison']);
  const lucky = player(); applyFoodEffects(lucky, 'poisonous_potato', () => 0.7);
  assert.equal(lucky.statusEffects.has('poison'), false, '0.7 >= 0.6: no poison');
  const unlucky = player(); applyFoodEffects(unlucky, 'poisonous_potato', () => 0.5);
  assert.equal(unlucky.statusEffects.has('poison'), true);
  applyFoodEffects(p, 'honey_bottle');
  assert.equal(p.statusEffects.has('poison'), false, 'honey clears poison');
  assert.equal(p.statusEffects.has('nausea'), true, 'and only poison');
});

test('chorus fruit lands on solid ground within 8 blocks', () => {
  const world = { getVoxel: (x, y, z) => (y <= 4 ? BLOCKS.STONE : BLOCKS.AIR) };
  for (let i = 0; i < 50; i++) {
    const to = chorusTeleport(world, { x: 0.5, y: 5, z: 0.5 });
    assert.ok(to && to.y === 5 && Math.abs(to.x) <= 9 && Math.abs(to.z) <= 9, JSON.stringify(to));
  }
});

test('the game applies them when a bite completes', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const finish = main.slice(main.indexOf('  finishEating(activeItem) {'), main.indexOf('  finishEating(activeItem) {') + 3500);
  assert.match(finish, /applyFoodEffects\(this\.player, activeItem\.id\);/);
  assert.match(finish, /chorusTeleport\(this\.world, this\.player\.position\)/);
});
