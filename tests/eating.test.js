// Eating takes time (src/eating.js). Wiki, Food: consumption takes 32 ticks (1.6 s) for most foods, 16 ticks for
// dried kelp, 40 for a honey bottle; it is held, and stops when let go. Found by the wiki-tutorial play-test: Hunger
// management and Combat say eating "takes a few seconds", and in the game a click ate at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EatingController, consumeSeconds, USING_ITEM_SPEED } from '../src/eating.js';
import { finishFoodUse } from '../src/foodUse.js';
import { Player } from '../src/player.js';
import { Inventory } from '../src/inventory.js';
import { createHungerState } from '../src/hunger.js';
import { bridgeTarget, canBridgeWithItem, useWithoutBlockTarget } from '../src/bedrockBridging.js';
import { HeldItemRenderer } from '../src/heldItem.js';
import { createRuntime as bedWarsRuntime } from '../src/mods/bedwars/index.js';
import { createRuntime as skyWarsRuntime } from '../src/mods/skywars/index.js';
import { buy, ITEM_SHOP, newKit } from '../src/mods/bedwars/shop.js';

function game(id = 'cooked_beef') {
  const item = { id, count: 3, isBlock: false };
  const eaten = [];
  const g = {
    player: { isDead: false },
    inventory: { activeSlot: 0, held: item, getActiveItem() { return this.held; } },
    ui: { isModalOpen: () => false },
    finishEating: (it) => { eaten.push(it.id); it.count--; },
  };
  g.eating = new EatingController(g);
  return { g, item, eaten, run: (s) => { for (let i = 0; i < Math.round(s * 20); i++) g.eating.update(1 / 20); } };
}

test('the wiki\'s consumption times', () => {
  assert.equal(consumeSeconds('cooked_beef'), 1.6);
  assert.equal(consumeSeconds('dried_kelp'), 0.8);
  assert.equal(consumeSeconds('honey_bottle'), 2);
  assert.equal(USING_ITEM_SPEED, 0.2);
});

test('food is eaten only after 1.6 s of holding use, and slows the player meanwhile', () => {
  const { g, item, eaten, run } = game();
  g.eating.start(item);
  assert.equal(g.player.usingItem, true);
  run(1.5);
  assert.deepEqual(eaten, [], 'not yet');
  g.eating.start(item); // still holding: continues, does not restart
  run(0.15);
  assert.deepEqual(eaten, ['cooked_beef']);
  assert.equal(g.player.usingItem, false);
});

test('letting go, or switching item, eats nothing', () => {
  const a = game();
  a.g.eating.start(a.item); a.run(1); a.g.eating.release(); a.run(2);
  assert.deepEqual(a.eaten, []);
  const b = game();
  b.g.eating.start(b.item); b.run(1); b.g.inventory.held = { id: 'bread', count: 1 }; b.run(2);
  assert.deepEqual(b.eaten, []);
});

test('dried kelp is twice as quick', () => {
  const { g, item, eaten, run } = game('dried_kelp');
  g.eating.start(item); run(0.85);
  assert.deepEqual(eaten, ['dried_kelp']);
});

function appleGame({ mode = 'survival', hardcore = false, id = 'golden_apple', count = 2, hunger = 20 } = {}) {
  const player = Object.assign(Object.create(Player.prototype), {
    gamemode: mode, hardcore, hunger, maxHunger: 20, saturation: 1, exhaustion: 0,
    health: 6, maxHealth: 20, absorption: 0, statusEffects: new Map(), _hungerState: createHungerState(),
  });
  const inventory = new Inventory();
  if (count) inventory.hotbar[0] = { id, count, isBlock: false };
  const game = { player, inventory, targetBlock: null };
  game.finishEating = (item) => finishFoodUse(game, item);
  game.eating = new EatingController(game);
  game.useConsumable = (item) => game.eating.startFood(item);
  return game;
}

for (const [label, mode, hardcore] of [
  ['Survival', 'survival', false], ['Hardcore', 'survival', true],
  ['Adventure', 'adventure', false], ['Creative', 'creative', false],
]) {
  test(`${label}: a held golden apple is edible at full hunger and grants the bite's effects`, () => {
    const g = appleGame({ mode, hardcore });
    assert.equal(useWithoutBlockTarget(g, g.inventory.getActiveItem()), true, 'looking at open air');
    g.eating.update(1.55);
    assert.equal(g.inventory.getActiveItem().count, 2);
    assert.equal(g.player.absorption, 0, 'benefits wait for the bite');
    g.eating.update(0.06);
    assert.equal(g.player.absorption, 4, 'two golden hearts');
    assert.equal(g.player.health, 6, 'regeneration heals over time');
    assert.equal(g.player.statusEffects.get('regeneration')?.level, 2);
    assert.equal(g.player.statusEffects.get('regeneration')?.duration, 5);
    assert.equal(g.player.statusEffects.get('absorption')?.duration, 120);
    assert.equal(g.player.hunger, 20);
    assert.equal(g.player.saturation, 10.6);
    assert.equal(g.inventory.getActiveItem().count, mode === 'creative' ? 2 : 1);
    assert.equal(g.player.usingItem, false);
  });
}

for (const [label, key, runtime] of [['Bed Wars', 'bedwars', bedWarsRuntime], ['SkyWars', 'skywars', skyWarsRuntime]]) {
  test(`${label}: a golden apple takes priority over the island-edge bridge preview`, () => {
    const g = appleGame({ count: key === 'bedwars' ? 0 : 1, hunger: 14 });
    g[key] = { active: true };
    g.modRuntime = runtime(g);
    assert.equal(g.modRuntime.bedrockBridging(), true);
    if (key === 'bedwars') {
      g.inventory.addItem('gold_ingot', false, 3);
      assert.equal(buy(ITEM_SHOP.find(({ key }) => key === 'gapple'), { inv: g.inventory, kit: newKit(), group: 'small' }).ok, true);
    }
    const underfoot = (x, y, z) => x === 0 && y === 30 && z === 0;
    g.bridgeTarget = bridgeTarget({
      origin: { x: 0.5, y: 32.62, z: 0.4 }, position: { x: 0.5, y: 31, z: 0.4 },
      direction: { x: 0, y: -Math.sin(1), z: -Math.cos(1) }, reach: 5.2, yaw: 0,
      isSolid: underfoot, isReplaceable: (...xyz) => !underfoot(...xyz),
    });
    assert.ok(g.bridgeTarget, 'a real bridge target exists at this edge');
    const apple = g.inventory.getActiveItem();
    assert.equal(apple?.id, 'golden_apple');
    assert.equal(canBridgeWithItem(g.player, apple), false);
    g.placeBlockOnFace = () => assert.fail('an apple is not a bridge block');
    assert.equal(useWithoutBlockTarget(g, apple), true);
    g.eating.update(1.6);
    assert.equal(g.inventory.getActiveItem(), null, 'the one apple was eaten');
    assert.equal(g.player.hunger, 18);
    assert.equal(g.player.absorption, 4);
  });
}

test('spectators cannot eat, and switching to Spectator cancels a bite in progress', () => {
  const g = appleGame({ mode: 'spectator' });
  const apple = g.inventory.getActiveItem();
  assert.equal(useWithoutBlockTarget(g, apple), false);
  g.player.gamemode = 'survival';
  assert.equal(useWithoutBlockTarget(g, apple), true);
  g.eating.update(1);
  g.player.gamemode = 'spectator';
  g.eating.update(1);
  assert.equal(g.player.usingItem, false);
  assert.equal(g.player.absorption, 0);
  assert.equal(apple.count, 2);
});

test('an enchanted apple gives its stronger effects without instantly healing', () => {
  const g = appleGame({ id: 'enchanted_golden_apple', count: 1 });
  assert.equal(g.eating.startFood(g.inventory.getActiveItem()), true);
  g.eating.update(1.6);
  assert.equal(g.inventory.getActiveItem(), null);
  assert.equal(g.player.absorption, 16);
  assert.equal(g.player.health, 6);
  assert.equal(g.player.statusEffects.get('regeneration')?.duration, 20);
  assert.equal(g.player.statusEffects.get('resistance')?.duration, 300);
  assert.equal(g.player.statusEffects.get('fire_resistance')?.duration, 300);
});

test('the held apple rises toward the mouth while eating and drops back on release', () => {
  const g = appleGame();
  const renderer = new HeldItemRenderer(new THREE.PerspectiveCamera(), {});
  renderer.setItem(g.inventory.getActiveItem());
  renderer.update(0, 0, g.eating.useElapsed);
  const rest = renderer.container.position.clone();
  g.eating.startFood(g.inventory.getActiveItem());
  g.eating.update(0.2);
  renderer.update(0.02, 0, g.eating.useElapsed);
  assert.ok(renderer.container.position.y > rest.y && renderer.container.position.x < rest.x);
  g.eating.release();
  renderer.update(0.02, 0, g.eating.useElapsed);
  assert.deepEqual(renderer.container.position.toArray(), rest.toArray());
  assert.equal(g.inventory.getActiveItem().count, 2);
  renderer.unsubscribePack();
  renderer.unsubscribeSkin();
});

test('golden apples give the wiki\'s effects, and the apple table agrees with the items\' own', async () => {
  const { GOLDEN_APPLE_EFFECTS } = await import('../src/goldenApple.js');
  const { ITEMS } = await import('../src/blocks.js');
  const levels = (list) => Object.fromEntries(list.map((e) => [e.id, [e.seconds, e.level]]));
  // Golden Apple: Absorption I (4 extra health) for 2 minutes, Regeneration II for 5 seconds.
  assert.deepEqual(levels(GOLDEN_APPLE_EFFECTS.golden_apple), { absorption: [120, 1], regeneration: [5, 2] });
  // Enchanted: Absorption IV 2:00, Regeneration II 0:20, Fire Resistance and Resistance 5:00.
  assert.deepEqual(levels(GOLDEN_APPLE_EFFECTS.enchanted_golden_apple), { absorption: [120, 4], regeneration: [20, 2], fire_resistance: [300, 1], resistance: [300, 1] });
  for (const id of ['golden_apple', 'enchanted_golden_apple']) {
    const own = Object.fromEntries(ITEMS[id].effects.map(([name, seconds, level]) => [name, [seconds, level]]));
    assert.deepEqual(own, levels(GOLDEN_APPLE_EFFECTS[id]), id);
  }
});
