// Eating takes time (src/eating.js). Wiki, Food: consumption takes 32 ticks (1.6 s) for most foods, 16 ticks for
// dried kelp, 40 for a honey bottle; it is held, and stops when let go. Found by the wiki-tutorial play-test: Hunger
// management and Combat say eating "takes a few seconds", and in the game a click ate at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EatingController, consumeSeconds, USING_ITEM_SPEED } from '../src/eating.js';

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

test('the game eats through the controller, and the player slows while using an item', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.eating\.start\(activeItem\);/);
  assert.match(main, /finishEating\(activeItem\) \{/);
  assert.match(main, /this\.eating\?\.release\(\);/, 'releasing the button stops eating');
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player, /if \(\(this\.usingItem \|\| this\.bowDraw > 0\) && !this\.isFlying\) targetSpeed \*= USING_ITEM_SPEED;/);
});
