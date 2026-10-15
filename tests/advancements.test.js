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

test('"A Furious Cocktail" and "How Did We Get Here?" need every listed effect at once', async () => {
  const { COCKTAIL_EFFECTS, ALL_EFFECTS } = await import('../src/advancements.js');
  const g = game(); g.player.statusEffects = new Map(COCKTAIL_EFFECTS.map((e) => [e, { duration: 10, level: 1 }]));
  const t = new AdvancementTracker(g); t.update(1);
  assert.ok(t.has('nether/all_potions') && !t.has('nether/all_effects'));
  for (const e of ALL_EFFECTS) g.player.statusEffects.set(e, { duration: 10, level: 1 });
  t.update(1);
  assert.ok(t.has('nether/all_effects'));
});

// Advancement guide, Nether and The End tabs (wiki-tutorial play-test, dimensions group).
test('Subspace Bubble: a Nether trip between Overworld points 7000 blocks apart (875 in the Nether)', () => {
  const g = game(); const t = new AdvancementTracker(g);
  const pos = (x, z) => { g.player.position = { x, y: 30, z }; };
  pos(0, 0); t.update(1);
  g.currentDimension = 'nether'; pos(0, 0); t.update(1);
  g.currentDimension = 'overworld'; pos(600 * 8, 600 * 8); t.update(1);
  assert.ok(!t.has('nether/fast_travel'), '600,600 in the Nether is 6788 blocks: "not enough"');
  g.currentDimension = 'nether'; pos(600, 600); t.update(1);
  g.currentDimension = 'overworld'; pos(600 * 8 + 5600, 600 * 8 + 5600); t.update(1);
  assert.ok(t.has('nether/fast_travel'), '700 * 8 * sqrt(2) is "roughly 7,920"');
});

test('places: a fortress, a bastion, an end city and a stronghold are entered; every Nether biome explored', () => {
  const g = game(); const t = new AdvancementTracker(g);
  let here = null; g.structureIdAt = () => here; g.player.position = { x: 0, y: 30, z: 0 };
  const biomes = ['nether_wastes', 'soul_sand_valley', 'crimson_forest', 'warped_forest', 'basalt_deltas'];
  let biome = biomes[0]; g.world = { getBiome: () => biome };
  g.currentDimension = 'nether';
  for (const [s, id] of [['fortress', 'nether/find_fortress'], ['bastion_remnant', 'nether/find_bastion'], ['end_city', 'end/find_end_city'], ['stronghold', 'story/follow_ender_eye']]) {
    here = s; t.slowTimer = 0; t.update(1); assert.ok(t.has(id), id);
  }
  here = null;
  for (const b of biomes.slice(0, 4)) { biome = b; t.slowTimer = 0; t.update(1); }
  assert.ok(!t.has('nether/explore_nether'));
  biome = 'basalt_deltas'; t.slowTimer = 0; t.update(1);
  assert.ok(t.has('nether/explore_nether'), 'Hot Tourist Destinations');
});

test('Oh Shiny needs no golden armour; Uneasy Alliance is a ghast killed in the Overworld; Return to Sender a fireball', () => {
  const g = game(); const t = new AdvancementTracker(g);
  g.inventory.armor = { head: { id: 'golden_helmet' } };
  advancementEvent('distract_piglin'); assert.ok(!t.has('nether/distract_piglin'), '"while not wearing golden armor"');
  g.inventory.armor = {}; advancementEvent('distract_piglin'); assert.ok(t.has('nether/distract_piglin'));
  advancementEvent('kill', { type: 'ghast', dimension: 'nether' }); assert.ok(!t.has('nether/uneasy_alliance') && !t.has('nether/return_to_sender'));
  advancementEvent('kill', { type: 'ghast', dimension: 'overworld', fireball: true });
  assert.ok(t.has('nether/uneasy_alliance') && t.has('nether/return_to_sender'));
  for (const [e, id, d] of [['ride_strider', 'nether/ride_strider'], ['charge_respawn_anchor', 'nether/charge_respawn_anchor'], ['end_gateway', 'end/enter_end_gateway'], ['respawn_dragon', 'end/respawn_dragon'], ['beacon', 'nether/create_beacon', { tier: 1 }], ['summon_wither', 'nether/summon_wither']]) {
    advancementEvent(e, d ?? {}); assert.ok(t.has(id), id);
  }
  assert.ok(!t.has('nether/create_full_beacon')); advancementEvent('beacon', { tier: 4 }); assert.ok(t.has('nether/create_full_beacon'));
});

test('Great View From Up Here: levitating 50 blocks up', () => {
  const g = game(); const t = new AdvancementTracker(g);
  g.player.statusEffects = new Map([['levitation', {}]]);
  g.player.position = { x: 0, y: 10, z: 0 }; t.update(1);
  g.player.position.y = 59; t.update(1); assert.ok(!t.has('end/levitate'));
  g.player.position.y = 60; t.update(1); assert.ok(t.has('end/levitate'));
});

test('the game reports the new triggers from where they happen', () => {
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  assert.match(src('striderBehavior.js'), /advancementEvent\('ride_strider'\)/);
  assert.match(src('respawnAnchor.js'), /charge\+1===4\)advancementEvent\('charge_respawn_anchor'\)/);
  assert.match(src('endProgression.js'), /advancementEvent\('end_gateway'\)/);
  assert.match(src('bossFights.js'), /advancementEvent\('summon_wither'\)/);
  assert.match(src('bossFights.js'), /advancementEvent\('respawn_dragon'\)/);
  assert.match(src('beaconManager.js'), /advancementEvent\('beacon'/);
  assert.match(src('hostileMobBehaviors.js'), /advancementEvent\('distract_piglin'\)/);
  assert.match(src('villagerEconomy.js'), /advancementEvent\('cure_zombie_villager'\)/);
  assert.match(src('ui.js'), /advancementEvent\('open_loot_chest'/);
  assert.match(src('mobs.js'), /killedByDeflectedFireball\), dimension:/);
});
