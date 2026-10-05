// Wandering Trader parity with https://minecraft.wiki/w/Wandering_Trader
//
// A new passive mob whose identity is almost entirely two things: a RANDOMIZED trade table (two purchase,
// two special, five ordinary offers) and a DESPAWN timer. Both are data in the behaviour module, so this
// suite asserts the table's shape and the timer's rules rather than poking at the update loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  WANDERING_TRADER_HEALTH, WANDERING_TRADER_DIMENSIONS, WANDERING_TRADER_SPEED,
  WANDERING_TRADER_DESPAWN_SECONDS, WANDERING_TRADER_WANDER_RANGE, WANDERING_TRADER_SPAWN_RANGE,
  WANDERING_TRADER_LLAMAS, WANDERING_TRADER_INVISIBILITY, WANDERING_TRADER_AVOIDED,
  WANDERING_TRADER_AVOID_RANGE, WANDERING_TRADER_DROP_CHANCE, WANDERING_TRADER_DROP_LOOTING_BONUS,
  WANDERING_TRADER_COLORS, TRADES, TRADE_LAYOUT,
  isWanderingTrader, wanderingTraderHasBabyForm, isResolvableTradeItem, availableTrades, rollTrades,
  tradeLocked, useTrade, usableTradeCount, updateTraderDespawn, traderWantsInvisibility,
  updateTraderInvisibility, findTraderHazard, wanderingTraderDrops, wanderingTraderXp,
  spawnTraderWithLlamas, traderLlamaRetaliates, createWanderingTraderModel, poseWanderingTrader
} from '../src/wanderingTraderBehavior.js';
import { createMobDebugSession, DEBUG_MOBS } from '../src/mobDebugSession.js';

function fixture({ worldTime = 6000 } = {}) {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  const entities = {
    droppedItems: [],
    spawnDroppedItem(pos, itemType, isBlock = true, count = 1) { this.droppedItems.push({ itemType, count }); },
    spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, blockRegistry: BLOCKS,
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    checkMobCollision: (mob, p) => p.y < 1
  });
  const player = {
    position: new THREE.Vector3(30, 1, 30), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 100, keys: {}, onGround: true, statusEffects: {},
    damageTaken: 0,
    takeDamage(n) { this.damageTaken += n; },
    applyStatusEffect() {}, hasStatusEffect: () => false
  };
  player.inventory = { active: null, getActiveItem() { return this.active; }, consumeActiveItem() {} };
  manager.game = { player, difficulty: 'normal', worldTime, controls: {}, weather: { weatherType: 'clear' }, ui: null };
  return { manager, player, entities };
}

test('wandering trader is a native type, not the Villager fallback', () => {
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.equal(trader.type, 'wandering_trader');
  assert.equal(trader.name, 'Wandering Trader');
  assert.notEqual(trader.type, 'villager');
});

test('the health, hitbox and speed match the wiki', () => {
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.equal(WANDERING_TRADER_HEALTH, 20);
  assert.equal(trader.maxHealth, 20, 'wiki: 20 HP');
  assert.deepEqual(WANDERING_TRADER_DIMENSIONS, { width: 0.6, height: 1.95 });
  assert.deepEqual([trader.width, trader.height], [0.6, 1.95]);
  assert.deepEqual(manager.getMobDimensions('wandering_trader'), { width: 0.6, height: 1.95 });
  assert.equal(WANDERING_TRADER_SPEED, 0.7, 'wiki: 0.7, notably faster than a villager');
  // A definite groundedness, so no branch reads undefined.
  assert.equal(trader.onGround, true);
});

test('a wandering trader cannot be a baby', () => {
  // Wiki: "The Age tag cannot be set to a negative number, making it impossible for them to be a baby."
  assert.equal(wanderingTraderHasBabyForm(), false);
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false, isBaby: true });
  assert.deepEqual([trader.width, trader.height], [0.6, 1.95], 'still the adult hitbox');
});

test('it spawns with two leashed trader llamas', () => {
  // Wiki: "sometimes spawns near players, alongside two trader llamas tied to it with leads", placed
  // within -4/+3 of the trader.
  assert.deepEqual(WANDERING_TRADER_LLAMAS, { count: 2, offsetMin: -4, offsetMax: 3 });
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0);
  const llamas = manager.mobs.filter(m => m.type === 'trader_llama');
  assert.equal(llamas.length, 2, 'two llamas');
  assert.equal(trader.llamaCount, 2);
  for (const llama of llamas) {
    assert.equal(llama.leashHolder, trader, 'each is tied to the trader');
    assert.equal(llama.isTraderLlama, true);
    // Within the wiki's offset box.
    const dx = Math.abs(llama.mesh.position.x - trader.mesh.position.x);
    const dz = Math.abs(llama.mesh.position.z - trader.mesh.position.z);
    assert.ok(dx <= 4 && dz <= 4, `llama placed within the box, got ${dx.toFixed(2)},${dz.toFixed(2)}`);
  }
  // The opt-out is honoured, which is what a test or a command spawn wants.
  const solo = manager.spawnMob('wandering_trader', 20, 1, 20, { withLlamas: false });
  assert.equal(solo.llamaCount, 0);
});

test('the trader llama is a llama in every code path', () => {
  // A trader llama IS a llama with a carpet, so the llama's AI, loot and XP must accept it. Matching only
  // the literal 'llama' broke its update branch the moment the type was renamed.
  const { manager, player } = fixture();
  const llama = manager.spawnMob('trader_llama', 0, 1, 0);
  assert.equal(llama.type, 'trader_llama');
  assert.equal(llama.name, 'Trader Llama');
  assert.equal(llama.isTraderLlama, true);
  assert.equal(llama.hasTraderCarpet, true);
  assert.deepEqual(manager.getMobDimensions('trader_llama'),
    manager.getMobDimensions('llama'), 'it shares the llama hitbox');
  // It updates through the real loop without a fault, which is what regressed.
  assert.doesNotThrow(() => {
    for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  });
  assert.deepEqual([...(manager.mobErrors || [])], []);
  // And it drops llama loot.
  llama.playerDamaged = true;
  const loot = manager.getMobDeathDrops(llama, () => 0.5);
  assert.equal(loot.length > 0, true, 'a trader llama yields llama loot');
});

test('the trade table has the wiki shape: 2 purchase, 2 special, 5 ordinary', () => {
  // Wiki: "The wandering trader offers nine trades in total, always consisting of two purchase trades, two
  // special trades, and five ordinary trades."
  assert.deepEqual(TRADE_LAYOUT, { purchase: 2, special: 2, ordinary: 5 });
  assert.equal(TRADE_LAYOUT.purchase + TRADE_LAYOUT.special + TRADE_LAYOUT.ordinary, 9);
  // Every group has at least as many candidates as it needs, or the layout could not be filled.
  const available = availableTrades(ITEMS, BLOCKS);
  for (const [group, wanted] of Object.entries(TRADE_LAYOUT)) {
    assert.ok(available[group].length >= wanted,
      `${group} needs ${wanted} but only ${available[group].length} resolve`);
  }
});

test('every trade in the table is well formed, and unresolvable ones are filtered out', () => {
  for (const [group, entries] of Object.entries(TRADES)) {
    assert.ok(entries.length > 0, `${group} is not empty`);
    for (const entry of entries) {
      assert.equal(typeof entry.give, 'string', `${group}: give is a string`);
      assert.equal(typeof entry.want, 'string', `${group}: want is a string`);
      assert.ok(entry.giveCount >= 1 && entry.wantCount >= 1, 'counts are at least one');
      assert.ok(entry.maxTrades >= 1, 'a trade is usable at least once');
    }
    // No duplicate offers within a group, or the roll would be biased. For a PURCHASE trade the player
    // receives emeralds, so every entry shares its `give` by design; the distinct key there is `want`.
    const key = group === 'purchase' ? 'want' : 'give';
    const keys = entries.map(e => e[key]);
    assert.equal(new Set(keys).size, keys.length, `${group} has no duplicate ${key} ids`);
  }
  // The filter drops anything this build cannot resolve, rather than offering a broken trade.
  assert.equal(isResolvableTradeItem('emerald', ITEMS, BLOCKS), true);
  assert.equal(isResolvableTradeItem('definitely_not_an_item', ITEMS, BLOCKS), false);
  assert.equal(isResolvableTradeItem(null, ITEMS, BLOCKS), false);
  const available = availableTrades(ITEMS, BLOCKS);
  const total = Object.values(available).reduce((n, list) => n + list.length, 0);
  const all = Object.values(TRADES).reduce((n, list) => n + list.length, 0);
  assert.ok(total > 0, 'some trades resolve');
  assert.ok(total <= all, 'the filter can only remove entries');
});

test('a rolled table always fills the layout from the available pool', () => {
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  const offers = rollTrades(ITEMS, BLOCKS, () => 0.5);
  assert.equal(offers.length, 9, 'nine offers');
  const counts = offers.reduce((acc, o) => { acc[o.group] = (acc[o.group] ?? 0) + 1; return acc; }, {});
  assert.deepEqual(counts, { purchase: 2, special: 2, ordinary: 5 }, 'in the wiki\'s group proportions');
  // Offers are listed purchase, special, ordinary.
  assert.deepEqual(offers.map(o => o.group),
    ['purchase', 'purchase', 'special', 'special', 'ordinary', 'ordinary', 'ordinary', 'ordinary', 'ordinary']);
  // Every offer starts unused.
  assert.equal(offers.every(o => o.uses === 0), true);
  // Two rolls differ, since each individual trade is equally likely.
  const a = rollTrades(ITEMS, BLOCKS, () => 0.1).map(o => o.give).join(',');
  const b = rollTrades(ITEMS, BLOCKS, () => 0.9).map(o => o.give).join(',');
  assert.notEqual(a, b, 'the roll is randomized');
  // And every offer resolves.
  for (const offer of offers) {
    assert.equal(isResolvableTradeItem(offer.give, ITEMS, BLOCKS), true, `${offer.give} resolves`);
    assert.equal(isResolvableTradeItem(offer.want, ITEMS, BLOCKS), true, `${offer.want} resolves`);
  }
});

test('a used-up trade locks and never unlocks', () => {
  // Wiki: "After the player uses the same trade several times, the wandering trader locks the trade, but
  // unlike villagers, never unlocks the trade."
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  const offers = rollTrades(ITEMS, BLOCKS, () => 0.5);
  const offer = offers.find(o => o.maxTrades >= 2) ?? offers[0];
  const capacity = offer.maxTrades;
  assert.equal(tradeLocked(offer), false, 'usable at first');
  for (let i = 0; i < capacity; i++) assert.equal(useTrade(offer), true, `use ${i + 1} allowed`);
  assert.equal(tradeLocked(offer), true, 'now locked');
  assert.equal(useTrade(offer), false, 'and unusable');
  assert.equal(offer.uses, capacity, 'the count is capped');
  // Locking is permanent: no restock path exists.
  assert.equal(tradeLocked(offer), true);
  assert.equal(usableTradeCount(offers) < 9, true, 'the table lost a usable offer');
  assert.equal(usableTradeCount(null), 0);
});

test('the despawn timer follows the wiki', () => {
  // Wiki: it despawns after 48000 ticks (40 minutes) loaded, ticks with the UI open do not count, and a
  // command/egg/spawner trader has a zero delay and never despawns.
  assert.equal(WANDERING_TRADER_DESPAWN_SECONDS, 2400, '48000 ticks');
  const mob = { type: 'wandering_trader', despawnTimer: 100 };
  assert.equal(updateTraderDespawn(mob, 10), 'counting');
  assert.equal(mob.despawnTimer, 90);
  assert.equal(updateTraderDespawn(mob, 10, { tradingOpen: true }), null, 'the UI freezes the timer');
  assert.equal(mob.despawnTimer, 90, 'the timer did not move');
  assert.equal(updateTraderDespawn(mob, 200), 'despawned');
  // A persistent trader is exempt entirely.
  const persistent = { type: 'wandering_trader', persistent: true };
  assert.equal(updateTraderDespawn(persistent, 1e9), null);
  assert.equal(persistent.despawnTimer, undefined, 'no timer is even created');
  // And a spawned-in trader defaults to the full 40 minutes.
  const { manager } = fixture();
  assert.equal(manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false }).despawnTimer, 2400);
  assert.equal(updateTraderDespawn({ type: 'cow' }, 10), null);
});

test('it turns invisible at dusk and drinks milk at dawn', () => {
  // Wiki: "Wandering traders drink a potion of Invisibility during dusk and as needed to renew the effect
  // during the night. They also drink milk if invisible during the day to remove the effect."
  assert.deepEqual(WANDERING_TRADER_INVISIBILITY, { drinkAtDusk: true, renewAtNight: true, milkAtDawn: true });
  // Day is visible, dusk through the small hours is invisible.
  assert.equal(traderWantsInvisibility(6000), false, 'midday');
  assert.equal(traderWantsInvisibility(11000), false, 'late afternoon');
  assert.equal(traderWantsInvisibility(13000), true, 'dusk');
  assert.equal(traderWantsInvisibility(18000), true, 'midnight');
  assert.equal(traderWantsInvisibility(23500), false, 'dawn');
  // The time wraps safely.
  assert.equal(traderWantsInvisibility(25000), traderWantsInvisibility(1000));
  assert.equal(traderWantsInvisibility(undefined), false, 'a missing clock is treated as day');

  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.equal(updateTraderInvisibility(trader, 1 / 60, 13000), 'drank_potion');
  assert.equal(trader.isInvisible, true);
  assert.equal(updateTraderInvisibility(trader, 1 / 60, 13000), null, 'not re-drunk every frame');
  assert.equal(updateTraderInvisibility(trader, 1 / 60, 6000), 'drank_milk');
  assert.equal(trader.isInvisible, false);
  assert.equal(updateTraderInvisibility({ type: 'cow' }, 1, 13000), null);
});

test('it avoids zombies, illagers, ravagers and vexes within 8 blocks', () => {
  // Wiki: it "avoid[s] zombies and their variants ..., all illager variants, ravagers, and vexes, staying at
  // least 8 blocks away".
  assert.equal(WANDERING_TRADER_AVOID_RANGE, 8);
  for (const type of ['zombie', 'husk', 'drowned', 'zombified_piglin', 'zoglin', 'zombie_villager',
    'pillager', 'vindicator', 'evoker', 'ravager', 'vex']) {
    assert.ok(WANDERING_TRADER_AVOIDED.includes(type), `${type} should be avoided`);
  }
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.equal(findTraderHazard(manager, trader), null, 'nothing nearby');
  const zombie = manager.spawnMob('zombie', 3, 1, 0);
  assert.equal(findTraderHazard(manager, trader), zombie, 'a nearby zombie is a hazard');
  zombie.mesh.position.set(40, 1, 40);
  assert.equal(findTraderHazard(manager, trader), null, 'out of the 8-block range');
  // A passive mob is not a hazard.
  manager.mobs.splice(manager.mobs.indexOf(zombie), 1);
  manager.spawnMob('cow', 2, 1, 0);
  assert.equal(findTraderHazard(manager, trader), null, 'a cow is not a hazard');
  assert.equal(findTraderHazard(manager, manager.spawnMob('cow', 5, 1, 5)), null);
});

test('it flees a hazard through the real loop', () => {
  const { manager, player } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  const zombie = manager.spawnMob('zombie', 1.5, 1, 0);
  const start = trader.mesh.position.distanceTo(zombie.mesh.position);
  for (let i = 0; i < 120; i++) manager.update(1 / 60, player);
  const end = trader.mesh.position.distanceTo(zombie.mesh.position);
  assert.ok(end > start || trader.state === 'fleeing',
    `the trader should move away, ${start.toFixed(2)} -> ${end.toFixed(2)}`);
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('the death drops are only the consumable it was holding', () => {
  // Wiki: "Wandering traders do not drop any loot or experience when killed", except a milk bucket or a
  // potion of Invisibility at 8.5% (plus 1% per Looting) while holding or drinking one.
  assert.equal(WANDERING_TRADER_DROP_CHANCE, 0.085);
  assert.equal(WANDERING_TRADER_DROP_LOOTING_BONUS, 0.01);
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.deepEqual(wanderingTraderDrops(trader, () => 0), [], 'nothing while not drinking');
  trader.drinkingItem = 'milk_bucket';
  assert.deepEqual(wanderingTraderDrops(trader, () => 0), [['milk_bucket', false, 1, 1]],
    'the milk bucket while drinking');
  // A high roll gives nothing, since the chance is 8.5%.
  assert.deepEqual(wanderingTraderDrops(trader, () => 0.99), []);
  // Looting raises the chance past the base.
  trader.lootingLevel = 3;
  assert.deepEqual(wanderingTraderDrops(trader, () => 0.1), [['milk_bucket', false, 1, 1]],
    'Looting III raises the chance to 11.5%');
  assert.equal(wanderingTraderXp(trader), 0, 'wiki: no experience at all');
  assert.equal(wanderingTraderXp(manager.spawnMob('cow', 0, 1, 0)), 0);
  assert.deepEqual(wanderingTraderDrops(manager.spawnMob('cow', 0, 1, 0)), []);
});

test('the trader llama spits back except on Peaceful', () => {
  // Wiki: "The trader llamas, however, attack the player by spitting if they or their master get hit,
  // except in Peaceful."
  const llama = { type: 'trader_llama', isTraderLlama: true };
  const player = { type: 'player' };
  assert.equal(traderLlamaRetaliates(llama, player, 'normal'), true);
  assert.equal(traderLlamaRetaliates(llama, player, 'hard'), true);
  assert.equal(traderLlamaRetaliates(llama, player, 'peaceful'), false, 'wiki: not on Peaceful');
  assert.equal(traderLlamaRetaliates(llama, null, 'normal'), false, 'no attacker, no retaliation');
  assert.equal(traderLlamaRetaliates({ type: 'llama' }, player, 'normal'), false, 'only trader llamas');
  assert.equal(traderLlamaRetaliates(null, player, 'normal'), false);
});

test('the model has a wide-brimmed hat and a pack', () => {
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.ok(trader.head && trader.brim && trader.crown, 'a head with a brimmed hat');
  assert.ok(trader.brim.geometry.parameters.width > trader.head.geometry.parameters.width,
    'the brim is wider than the head, which is what reads as a trader');
  assert.ok(trader.pack, 'the back pack');
  assert.equal(trader.arms.length, 2);
  assert.equal(trader.legs.length, 2);
  assert.equal(trader.eyes.length, 2);
  assert.ok(WANDERING_TRADER_COLORS.robe > 0);
  const model = createWanderingTraderModel(
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial(),
    new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial()
  );
  assert.ok(model.group && model.brim && model.pack);
});

test('the drinking pose raises an arm', () => {
  const { manager } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  poseWanderingTrader(trader, 0);
  const idle = trader.arms.map(a => a.rotation.x);
  trader.drinking = true;
  poseWanderingTrader(trader, 0);
  assert.equal(trader.arms.every(a => a.rotation.x < -1), true, 'both arms raised to drink');
  assert.ok(trader.head.rotation.x > 0, 'and the head tilts');
  trader.drinking = false;
  poseWanderingTrader(trader, 0);
  assert.notDeepEqual(trader.arms.map(a => a.rotation.x), [idle[0], idle[1]].map(() => -2));
  assert.doesNotThrow(() => poseWanderingTrader(null));
  assert.doesNotThrow(() => poseWanderingTrader({}));
});

test('it wanders near its spawn point rather than following the player', () => {
  // Wiki: it "prefers to wander within 16 blocks of the initial spawning target location, even if that
  // player leaves".
  assert.equal(WANDERING_TRADER_WANDER_RANGE, 16);
  const { manager, player } = fixture();
  player.position.set(400, 1, 400);
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.equal(trader.homeX, 0);
  assert.equal(trader.homeZ, 0);
  for (let i = 0; i < 400; i++) manager.update(1 / 60, player);
  const fromHome = Math.hypot(trader.mesh.position.x - trader.homeX, trader.mesh.position.z - trader.homeZ);
  assert.ok(fromHome <= WANDERING_TRADER_WANDER_RANGE + 4,
    `it stayed near home, wandered ${fromHome.toFixed(2)}`);
  assert.deepEqual([...(manager.mobErrors || [])], []);
});

test('it rolls its offers once, on its first update', () => {
  const { manager, player } = fixture();
  const trader = manager.spawnMob('wandering_trader', 0, 1, 0, { withLlamas: false });
  assert.equal(trader.tradesRolled, false);
  assert.deepEqual(trader.offers, []);
  manager.update(1 / 60, player);
  assert.equal(trader.tradesRolled, true);
  assert.equal(trader.offers.length, 9, 'the table was rolled');
  const first = trader.offers.map(o => o.give).join(',');
  for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  assert.equal(trader.offers.map(o => o.give).join(','), first, 'and not re-rolled');
});

test('the Inspector can spawn the trader and the trader llama', () => {
  for (const type of ['wandering_trader', 'trader_llama']) {
    assert.ok(DEBUG_MOBS.includes(type), `${type} must be selectable`);
  }
  assert.equal(new Set(DEBUG_MOBS).size, DEBUG_MOBS.length, 'no duplicate ids');
  const s = createMobDebugSession(new THREE.Scene(), () => {});
  const trader = s.reset('wandering_trader');
  assert.equal(trader.type, 'wandering_trader');
  assert.equal(s.snapshot().maxHealth, 20);
  assert.equal(s.reset('trader_llama').type, 'trader_llama');
});

test('the spawn egg is registered', () => {
  assert.ok(ITEMS.wandering_trader_spawn_egg, 'the trader has a spawn egg');
  assert.equal(ITEMS.wandering_trader_spawn_egg.mob, 'wandering_trader');
  assert.equal(ITEMS.wandering_trader_spawn_egg.type, 'spawn_egg');
});

test('the helpers are safe on non-traders and malformed input', () => {
  const { manager } = fixture();
  const cow = manager.spawnCow(0, 1, 0);
  assert.equal(isWanderingTrader(cow), false);
  assert.equal(updateTraderDespawn(cow, 10), null);
  assert.equal(updateTraderInvisibility(cow, 1, 13000), null);
  assert.equal(findTraderHazard(manager, cow), null);
  assert.deepEqual(wanderingTraderDrops(cow), []);
  assert.equal(wanderingTraderXp(cow), 0);
  assert.deepEqual(spawnTraderWithLlamas(manager, cow), []);
  assert.equal(tradeLocked(null), true);
  assert.equal(useTrade(null), false);
  assert.equal(usableTradeCount(undefined), 0);
  assert.deepEqual(availableTrades(null, null).purchase, [], 'no registry means no offers');
  assert.deepEqual(rollTrades(null, null), [], 'and nothing to roll');
  assert.equal(isResolvableTradeItem(undefined, ITEMS, BLOCKS), false);
  assert.doesNotThrow(() => poseWanderingTrader(null));
  assert.equal(WANDERING_TRADER_SPAWN_RANGE, 48, 'wiki: spawns within a 48-block box of a player');
  assert.equal(manager.spawnMob('wandering_trader', 9, 1, 9, { withLlamas: false }).type, 'wandering_trader');
});
