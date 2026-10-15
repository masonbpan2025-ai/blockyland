// Advancements earned by playing (src/advancements.js). Found by the wiki-tutorial play-test (Advancement guide): the
// 126 advancements could only be granted with /advancement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AdvancementTracker, advancementEvent, ITEM_CRITERIA, HOSTILE_MOBS } from '../src/advancements.js';
import { BLOCKS } from '../src/blocks.js';

function game() {
  const inventory = { hotbar: Array(9).fill(null), storage: Array(27).fill(null), armor: {}, offhand: null };
  const chat = [];
  return { inventory, chat, player: { advancements: new Set() }, currentDimension: 'overworld', mobs: { mobs: [] }, ui: { addChatMessage: (m) => chat.push(m) } };
}

test('holding the item earns it: a crafting table is "Minecraft", cobblestone "Stone Age"', () => {
  const g = game(); const t = new AdvancementTracker(g);
  g.inventory.hotbar[0] = { id: BLOCKS.CRAFTING_TABLE, isBlock: true, count: 1 };
  t.update(1);
  assert.ok(t.has('story/root'));
  assert.ok(!t.has('story/mine_stone'));
  g.inventory.storage[3] = { id: BLOCKS.COBBLESTONE, isBlock: true, count: 1 };
  t.update(1);
  assert.ok(t.has('story/mine_stone'));
  assert.match(g.chat.at(-1), /Stone Age/);
});

test('entering the Nether earns "We Need to Go Deeper" and "Nether"', () => {
  const g = game(); const t = new AdvancementTracker(g);
  g.currentDimension = 'nether'; t.update(1);
  assert.ok(t.has('story/enter_the_nether') && t.has('nether/root'));
});

test('events: a hostile kill is "Monster Hunter", a passive one only "Adventure"; eating, sleeping, trading', () => {
  const g = game(); const t = new AdvancementTracker(g);
  advancementEvent('kill', { type: 'pig' });
  assert.ok(t.has('adventure/root') && !t.has('adventure/kill_a_mob'));
  advancementEvent('kill', { type: 'zombie' });
  assert.ok(t.has('adventure/kill_a_mob'));
  for (const [e, id] of [['eat', 'husbandry/root'], ['sleep', 'adventure/sleep_in_bed'], ['trade', 'adventure/trade'], ['breed', 'husbandry/breed_an_animal'], ['totem', 'adventure/totem_of_undying']]) {
    advancementEvent(e, { type: 'cow', item: 'bread' }); assert.ok(t.has(id), id);
  }
  assert.ok(HOSTILE_MOBS.includes('creeper') && ITEM_CRITERIA['story/upgrade_tools'].includes('stone_pickaxe'));
});

test('the game creates the tracker and reports its events', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.advancements = new AdvancementTracker\(this\);/);
  assert.match(main, /advancementEvent\('eat'/);
  for (const [file, event] of [['mobs.js', 'kill'], ['bed.js', 'sleep'], ['villagerEconomy.js', 'trade'], ['enchanting.js', 'enchant'], ['farming.js', 'plant'], ['fishingRod.js', 'fish'], ['animalBehaviors.js', 'breed'], ['brewing.js', 'brew'], ['player.js', 'totem']]) {
    assert.ok(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').includes(`advancementEvent('${event}'`), file);
  }
});

test('a Totem of Undying in hand cheats death', async () => {
  const { Player } = await import('../src/player.js');
  const p = Object.create(Player.prototype);
  const effects = new Map();
  let consumed = 0;
  Object.assign(p, { gamemode: 'survival', isDead: false, invulnerableTimer: 0, health: 4, maxHealth: 20, position: { x: 0, y: 0, z: 0 }, velocity: { set() {} },
    statusEffects: effects, sounds: { playHurt() {} }, addExhaustion() {}, armourEnchantmentLists: () => [], hasStatusEffect: () => false,
    applyStatusEffect: (e, s, l) => effects.set(e, { duration: s, level: l }), clearStatusEffect: (e) => effects.delete(e),
    inventory: { armor: {}, getActiveItem: () => ({ id: 'totem_of_undying', count: 1 }), getOffhandItem: () => null, consumeActiveItem: () => { consumed++; }, getTotalArmorPoints: () => 0, getTotalArmorToughness: () => 0, getArmorPoints: () => 0 } });
  p.takeDamage(20, null, 'generic');
  assert.equal(p.isDead, false);
  assert.equal(p.health, 1);
  assert.equal(consumed, 1);
  assert.deepEqual([...effects.keys()].sort(), ['absorption', 'fire_resistance', 'regeneration']);
});
