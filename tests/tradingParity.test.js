// Trading parity with https://minecraft.wiki/w/Trading
//
// Trading was the last large survival mechanic that existed in name only. The profession tables were a
// hand-written approximation -- a novice farmer held all five of its offers at once, every offer was worth
// twelve uses whatever the wiki said, no offer carried a price multiplier, and four rewards named ids the
// game did not have -- and none of the article's *mechanics* were implemented: demand was a made-up
// "+1 per two purchases", reputation did not exist, Hero of the Village was a flat 30%, an offer could be
// restocked without limit, a level-up granted nothing, and a cost written as `{id:'stone', isBlock:true}`
// could never match the stone the player was actually carrying.
//
// This file is the ledger. Section 1 pins the tables against the wiki's own columns, section 2 pins the
// selection rules, section 3 pins the price formula, and sections 4-6 pin the surrounding mechanics that
// make a price mean anything: gossip, restocking, level-ups and the wandering trader's own table.
//
// The two reductions this build makes on purpose are asserted as *documented* reductions rather than left
// to be discovered: a wiki row that reads "any colour" pins one representative, and a row whose probability
// the wiki computes per biome pins one target. Both carry their explanation on the row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';
import { POTION_ITEMS } from '../src/extraPotions.js';
import { addedItems } from '../src/addedItems.js';
import { World } from '../src/world.js';
import { MobManager } from '../src/mobs.js';
import { Inventory } from '../src/inventory.js';
import {
  PROFESSIONS, WORKSTATION_TO_PROFESSION, VILLAGER_LEVELS, PROFESSION_TRADES,
  WIKI_ID_ALIASES, GOSSIP_TYPES, GOSSIP_DECAY_SECONDS, CURE_REPUTATION, DEFAULT_PLAYER_KEY,
  MAX_TRADES, MAX_NEW_TRADES_PER_LEVEL, RESTOCKS_PER_DAY, TRADE_XP, LEVEL_UP_REGENERATION_SECONDS,
  initVillagerEconomy, unlockTradesForLevel, resetVillagerTrades, tradePoolFor, maxOffersFor,
  instantiateTrade, calculateTradeCost, executeTrade, restockVillager, updateVillagerWorkstation,
  updateVillagerRegeneration, villagerCanTrade, tradeRefusal, tradeSide, canonicalItemKey,
  blockIdForTradeId, resolveWikiId, addGossip, reputationOf, decayGossip, shareGossip,
  recordTrade, recordCure, recordAttack, recordKill, tradePlayerXp
} from '../src/villagerEconomy.js';
import {
  TRADES as TRADER_TRADES, TRADE_LAYOUT, availableTrades, rollTrades, isResolvableTradeItem,
  tradeLocked, useTrade, usableTradeCount
} from '../src/wanderingTraderBehavior.js';

const EVERY_REGISTERED_ITEM = { ...ITEMS, ...EXTRA_ITEMS, ...POTION_ITEMS, ...addedItems() };

const resolves = (id) => (typeof id === 'number'
  ? BLOCK_DEFS[id] !== undefined
  : EVERY_REGISTERED_ITEM[id] !== undefined || BLOCKS[String(id).toUpperCase()] !== undefined);

/** A player inventory that behaves like the real one for the parts trading touches. */
function inventoryWith(...stacks) {
  const inv = new Inventory();
  for (const [index, stack] of stacks.entries()) inv.hotbar[index] = stack;
  return inv;
}

/** Count the copies of a canonical item across both inventory lists. */
function countOf(inv, id, isBlock = false) {
  const key = canonicalItemKey(id, isBlock);
  let total = 0;
  for (const slot of [...inv.hotbar, ...inv.storage]) {
    if (slot && canonicalItemKey(slot.id, slot.isBlock) === key) total += slot.count;
  }
  return total;
}

const findOffer = (inventory, id, isBlock, count) => ({ id, isBlock, count });

// ===================================================================================================
// 1. The trade tables
// ===================================================================================================

/**
 * Every row of the article's thirteen profession tables, as `[profession, level, cost, cost2, reward,
 * stock, villagerXp, priceMultiplier, enchanted, enchantedBook]`.
 *
 * The wiki's own columns, transcribed from the article, and deliberately a copy of the data rather than a
 * derivation of it: a derivation would agree with whatever the source happened to say. Costs written with
 * two numbers are the prices vanilla rolls when the offer is created.
 */
const WIKI_LEDGER = [
  ['armorer', 1, ['coal', 15], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['armorer', 1, ['emerald', 5], null, ['iron_helmet', 1], 12, 1, 0.2, false, false],
  ['armorer', 1, ['emerald', 9], null, ['iron_chestplate', 1], 12, 1, 0.2, false, false],
  ['armorer', 1, ['emerald', 7], null, ['iron_leggings', 1], 12, 1, 0.2, false, false],
  ['armorer', 1, ['emerald', 4], null, ['iron_boots', 1], 12, 1, 0.2, false, false],
  ['armorer', 2, ['iron_ingot', 4], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['armorer', 2, ['emerald', 36], null, ['bell', 1], 12, 5, 0.2, false, false],
  ['armorer', 2, ['emerald', 3], null, ['chainmail_leggings', 1], 12, 5, 0.2, false, false],
  ['armorer', 2, ['emerald', 1], null, ['chainmail_boots', 1], 12, 5, 0.2, false, false],
  ['armorer', 3, ['lava_bucket', 1], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['armorer', 3, ['diamond', 1], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['armorer', 3, ['emerald', 1], null, ['chainmail_helmet', 1], 12, 10, 0.2, false, false],
  ['armorer', 3, ['emerald', 4], null, ['chainmail_chestplate', 1], 12, 10, 0.2, false, false],
  ['armorer', 3, ['emerald', 5], null, ['shield', 1], 12, 10, 0.2, false, false],
  ['armorer', 4, ['emerald', [19, 33]], null, ['diamond_leggings', 1], 3, 15, 0.2, true, false],
  ['armorer', 4, ['emerald', [13, 27]], null, ['diamond_boots', 1], 3, 15, 0.2, true, false],
  ['armorer', 5, ['emerald', [13, 27]], null, ['diamond_helmet', 1], 3, 30, 0.2, true, false],
  ['armorer', 5, ['emerald', [21, 35]], null, ['diamond_chestplate', 1], 3, 30, 0.2, true, false],
  ['butcher', 1, ['chicken', 14], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['butcher', 1, ['rabbit', 4], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['butcher', 1, ['porkchop', 7], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['butcher', 1, ['emerald', 1], null, ['rabbit_stew', 1], 12, 1, 0.05, false, false],
  ['butcher', 2, ['coal', 15], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['butcher', 2, ['emerald', 1], null, ['cooked_chicken', 8], 16, 5, 0.05, false, false],
  ['butcher', 2, ['emerald', 1], null, ['cooked_porkchop', 5], 16, 5, 0.05, false, false],
  ['butcher', 3, ['beef', 10], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['butcher', 3, ['mutton', 7], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['butcher', 4, ['dried_kelp_block', 10], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['butcher', 5, ['sweet_berries', 10], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['cartographer', 1, ['paper', 24], null, ['emerald', 1], 12, 2, 0.05, false, false],
  ['cartographer', 1, ['emerald', 7], null, ['map', 1], 12, 1, 0.05, false, false],
  ['cartographer', 2, ['glass_pane', 11], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['cartographer', 2, ['emerald', 8], ['compass', 1], ['village_map', 1], 12, 5, 0.2, false, false],
  ['cartographer', 3, ['compass', 1], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['cartographer', 3, ['emerald', 13], ['compass', 1], ['ocean_monument_map', 1], 12, 10, 0.2, false, false],
  ['cartographer', 3, ['emerald', 12], ['compass', 1], ['buried_trial_chambers_map', 1], 12, 10, 0.2, false, false],
  ['cartographer', 4, ['emerald', 7], null, ['item_frame', 1], 12, 15, 0.05, false, false],
  ['cartographer', 4, ['emerald', 3], null, ['white_banner', 1], 12, 15, 0.05, false, false],
  ['cartographer', 5, ['emerald', 8], null, ['globe_banner_pattern', 1], 12, 30, 0.05, false, false],
  ['cartographer', 5, ['emerald', 14], ['compass', 1], ['woodland_mansion_map', 1], 12, 30, 0.2, false, false],
  ['cleric', 1, ['rotten_flesh', 32], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['cleric', 1, ['emerald', 1], null, ['redstone', 2], 12, 1, 0.05, false, false],
  ['cleric', 2, ['gold_ingot', 3], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['cleric', 2, ['emerald', 1], null, ['lapis_lazuli', 1], 12, 5, 0.05, false, false],
  ['cleric', 3, ['rabbit_foot', 2], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['cleric', 3, ['emerald', 4], null, ['glowstone', 1], 12, 10, 0.05, false, false],
  ['cleric', 4, ['turtle_scute', 4], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['cleric', 4, ['glass_bottle', 9], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['cleric', 4, ['emerald', 5], null, ['ender_pearl', 1], 12, 15, 0.05, false, false],
  ['cleric', 5, ['nether_wart', 22], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['cleric', 5, ['emerald', 3], null, ['experience_bottle', 1], 12, 30, 0.05, false, false],
  ['farmer', 1, ['wheat', 20], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['farmer', 1, ['potato', 26], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['farmer', 1, ['carrot', 22], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['farmer', 1, ['beetroot', 15], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['farmer', 1, ['emerald', 1], null, ['bread', 6], 16, 1, 0.05, false, false],
  ['farmer', 2, ['pumpkin', 6], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['farmer', 2, ['emerald', 1], null, ['pumpkin_pie', 4], 12, 5, 0.05, false, false],
  ['farmer', 2, ['emerald', 1], null, ['apple', 4], 16, 5, 0.05, false, false],
  ['farmer', 3, ['melon', 4], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['farmer', 3, ['emerald', 3], null, ['cookie', 18], 12, 10, 0.05, false, false],
  ['farmer', 4, ['emerald', 1], null, ['suspicious_stew', 1], 12, 15, 0.05, false, false],
  ['farmer', 4, ['emerald', 1], null, ['cake', 1], 12, 15, 0.05, false, false],
  ['farmer', 5, ['emerald', 3], null, ['golden_carrot', 3], 12, 30, 0.05, false, false],
  ['farmer', 5, ['emerald', 4], null, ['glistering_melon_slice', 3], 12, 30, 0.05, false, false],
  ['fisherman', 1, ['string', 20], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['fisherman', 1, ['coal', 10], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['fisherman', 1, ['emerald', 3], null, ['cod_bucket', 1], 16, 1, 0.05, false, false],
  ['fisherman', 1, ['cod', 6], ['emerald', 1], ['cooked_cod', 6], 16, 1, 0.05, false, false],
  ['fisherman', 2, ['cod', 15], null, ['emerald', 1], 16, 10, 0.05, false, false],
  ['fisherman', 2, ['emerald', 2], null, ['campfire', 1], 12, 5, 0.05, false, false],
  ['fisherman', 2, ['salmon', 6], ['emerald', 1], ['cooked_salmon', 6], 16, 5, 0.05, false, false],
  ['fisherman', 3, ['salmon', 13], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['fisherman', 3, ['emerald', [8, 22]], null, ['fishing_rod', 1], 3, 10, 0.2, true, false],
  ['fisherman', 4, ['tropical_fish', 6], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['fisherman', 5, ['pufferfish', 4], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['fisherman', 5, ['boat', 1], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['fletcher', 1, ['stick', 32], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['fletcher', 1, ['emerald', 1], null, ['arrow', 16], 12, 1, 0.05, false, false],
  ['fletcher', 1, ['gravel', 10], ['emerald', 1], ['flint', 10], 12, 1, 0.05, false, false],
  ['fletcher', 2, ['flint', 26], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['fletcher', 2, ['emerald', 2], null, ['bow', 1], 12, 5, 0.05, false, false],
  ['fletcher', 3, ['string', 14], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['fletcher', 3, ['emerald', 3], null, ['crossbow', 1], 12, 10, 0.05, false, false],
  ['fletcher', 4, ['feather', 24], null, ['emerald', 1], 16, 30, 0.05, false, false],
  ['fletcher', 4, ['emerald', [7, 21]], null, ['bow', 1], 3, 15, 0.05, true, false],
  ['fletcher', 5, ['tripwire_hook', 8], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['fletcher', 5, ['emerald', [8, 22]], null, ['crossbow', 1], 3, 15, 0.05, true, false],
  ['fletcher', 5, ['emerald', 2], ['arrow', 5], ['tipped_arrow', 5], 12, 30, 0.05, false, false],
  ['leatherworker', 1, ['leather', 6], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['leatherworker', 1, ['emerald', 3], null, ['leather_leggings', 1], 12, 1, 0.2, false, false],
  ['leatherworker', 1, ['emerald', 7], null, ['leather_chestplate', 1], 12, 1, 0.2, false, false],
  ['leatherworker', 2, ['flint', 26], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['leatherworker', 2, ['emerald', 5], null, ['leather_helmet', 1], 12, 5, 0.2, false, false],
  ['leatherworker', 2, ['emerald', 4], null, ['leather_boots', 1], 12, 5, 0.2, false, false],
  ['leatherworker', 3, ['rabbit_hide', 9], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['leatherworker', 3, ['emerald', 7], null, ['leather_chestplate', 1], 12, 10, 0.2, false, false],
  ['leatherworker', 4, ['turtle_scute', 4], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['leatherworker', 4, ['emerald', 6], null, ['leather_horse_armor', 1], 12, 15, 0.2, false, false],
  ['leatherworker', 5, ['emerald', 5], null, ['leather_helmet', 1], 12, 30, 0.2, false, false],
  ['leatherworker', 5, ['emerald', 6], null, ['saddle', 1], 12, 30, 0.2, false, false],
  ['librarian', 1, ['paper', 24], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['librarian', 1, ['emerald', 9], null, ['bookshelf', 1], 12, 1, 0.05, false, false],
  ['librarian', 1, ['emerald', [5, 64]], ['book', 1], ['enchanted_book', 1], 12, 1, 0.2, false, true],
  ['librarian', 2, ['book', 4], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['librarian', 2, ['emerald', 1], null, ['lantern', 1], 12, 5, 0.05, false, false],
  ['librarian', 2, ['emerald', [5, 64]], ['book', 1], ['enchanted_book', 1], 12, 5, 0.2, false, true],
  ['librarian', 3, ['ink_sac', 5], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['librarian', 3, ['emerald', 1], null, ['glass', 4], 12, 10, 0.05, false, false],
  ['librarian', 3, ['emerald', [5, 64]], ['book', 1], ['enchanted_book', 1], 12, 10, 0.2, false, true],
  ['librarian', 4, ['writable_book', 1], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['librarian', 4, ['emerald', 4], null, ['compass', 1], 12, 15, 0.05, false, false],
  ['librarian', 4, ['emerald', 5], null, ['clock', 1], 12, 15, 0.05, false, false],
  ['librarian', 4, ['emerald', [5, 64]], ['book', 1], ['enchanted_book', 1], 12, 15, 0.2, false, true],
  ['librarian', 5, ['emerald', 3], null, ['red_candle', 1], 12, 30, 0.05, false, false],
  ['librarian', 5, ['emerald', 3], null, ['yellow_candle', 1], 12, 30, 0.05, false, false],
  ['mason', 1, ['clay_ball', 10], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['mason', 1, ['emerald', 1], null, ['brick', 10], 16, 1, 0.05, false, false],
  ['mason', 2, ['stone', 20], null, ['emerald', 1], 16, 10, 0.05, false, false],
  ['mason', 2, ['emerald', 1], null, ['chiseled_stone_bricks', 4], 16, 5, 0.05, false, false],
  ['mason', 3, ['granite', 16], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['mason', 3, ['andesite', 16], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['mason', 3, ['diorite', 16], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['mason', 3, ['emerald', 1], null, ['dripstone_block', 4], 16, 10, 0.05, false, false],
  ['mason', 3, ['emerald', 1], null, ['polished_andesite', 4], 16, 10, 0.05, false, false],
  ['mason', 3, ['emerald', 1], null, ['polished_diorite', 4], 16, 10, 0.05, false, false],
  ['mason', 3, ['emerald', 1], null, ['polished_granite', 4], 16, 10, 0.05, false, false],
  ['mason', 4, ['quartz', 12], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['mason', 4, ['emerald', 1], null, ['white_terracotta', 1], 12, 15, 0.05, false, false],
  ['mason', 4, ['emerald', 1], null, ['white_glazed_terracotta', 1], 12, 15, 0.05, false, false],
  ['mason', 5, ['emerald', 1], null, ['quartz_pillar', 1], 12, 30, 0.05, false, false],
  ['mason', 5, ['emerald', 1], null, ['quartz_block', 1], 12, 30, 0.05, false, false],
  ['shepherd', 1, ['white_wool', 18], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['shepherd', 1, ['brown_wool', 18], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['shepherd', 1, ['black_wool', 18], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['shepherd', 1, ['gray_wool', 18], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['shepherd', 1, ['emerald', 2], null, ['shears', 1], 12, 1, 0.05, false, false],
  ['shepherd', 2, ['white_dye', 12], null, ['emerald', 1], 16, 10, 0.05, false, false],
  ['shepherd', 2, ['gray_dye', 12], null, ['emerald', 1], 16, 10, 0.05, false, false],
  ['shepherd', 2, ['black_dye', 12], null, ['emerald', 1], 16, 10, 0.05, false, false],
  ['shepherd', 2, ['light_blue_dye', 12], null, ['emerald', 1], 16, 10, 0.05, false, false],
  ['shepherd', 2, ['lime_dye', 12], null, ['emerald', 1], 16, 10, 0.05, false, false],
  ['shepherd', 2, ['emerald', 1], null, ['white_wool', 1], 16, 5, 0.05, false, false],
  ['shepherd', 2, ['emerald', 1], null, ['white_carpet', 4], 16, 5, 0.05, false, false],
  ['shepherd', 3, ['yellow_dye', 12], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['shepherd', 3, ['light_gray_dye', 12], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['shepherd', 3, ['orange_dye', 12], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['shepherd', 3, ['red_dye', 12], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['shepherd', 3, ['pink_dye', 12], null, ['emerald', 1], 16, 20, 0.05, false, false],
  ['shepherd', 3, ['emerald', 3], null, ['red_bed', 1], 12, 10, 0.05, false, false],
  ['shepherd', 4, ['brown_dye', 12], null, ['emerald', 1], 16, 30, 0.05, false, false],
  ['shepherd', 4, ['purple_dye', 12], null, ['emerald', 1], 16, 30, 0.05, false, false],
  ['shepherd', 4, ['blue_dye', 12], null, ['emerald', 1], 16, 30, 0.05, false, false],
  ['shepherd', 4, ['green_dye', 12], null, ['emerald', 1], 16, 30, 0.05, false, false],
  ['shepherd', 4, ['magenta_dye', 12], null, ['emerald', 1], 16, 30, 0.05, false, false],
  ['shepherd', 4, ['cyan_dye', 12], null, ['emerald', 1], 16, 30, 0.05, false, false],
  ['shepherd', 4, ['emerald', 3], null, ['white_banner', 1], 12, 15, 0.05, false, false],
  ['shepherd', 5, ['emerald', 2], null, ['painting', 3], 12, 30, 0.05, false, false],
  ['toolsmith', 1, ['coal', 15], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['toolsmith', 1, ['emerald', 1], null, ['stone_axe', 1], 12, 1, 0.2, false, false],
  ['toolsmith', 1, ['emerald', 1], null, ['stone_shovel', 1], 12, 1, 0.2, false, false],
  ['toolsmith', 1, ['emerald', 1], null, ['stone_pickaxe', 1], 12, 1, 0.2, false, false],
  ['toolsmith', 1, ['emerald', 1], null, ['stone_hoe', 1], 12, 1, 0.2, false, false],
  ['toolsmith', 2, ['iron_ingot', 4], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['toolsmith', 2, ['emerald', 36], null, ['bell', 1], 12, 5, 0.2, false, false],
  ['toolsmith', 3, ['flint', 30], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['toolsmith', 3, ['emerald', [6, 20]], null, ['iron_axe', 1], 3, 10, 0.2, true, false],
  ['toolsmith', 3, ['emerald', [7, 21]], null, ['iron_shovel', 1], 3, 10, 0.2, true, false],
  ['toolsmith', 3, ['emerald', [8, 22]], null, ['iron_pickaxe', 1], 3, 10, 0.2, true, false],
  ['toolsmith', 3, ['emerald', 4], null, ['diamond_hoe', 1], 3, 10, 0.2, false, false],
  ['toolsmith', 4, ['diamond', 1], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['toolsmith', 4, ['emerald', [17, 31]], null, ['diamond_axe', 1], 3, 15, 0.2, true, false],
  ['toolsmith', 4, ['emerald', [10, 24]], null, ['diamond_shovel', 1], 3, 15, 0.2, true, false],
  ['toolsmith', 5, ['emerald', [18, 32]], null, ['diamond_pickaxe', 1], 3, 30, 0.2, true, false],
  ['weaponsmith', 1, ['coal', 15], null, ['emerald', 1], 16, 2, 0.05, false, false],
  ['weaponsmith', 1, ['emerald', 3], null, ['iron_axe', 1], 12, 1, 0.2, false, false],
  ['weaponsmith', 1, ['emerald', [7, 21]], null, ['iron_sword', 1], 3, 1, 0.05, true, false],
  ['weaponsmith', 2, ['iron_ingot', 4], null, ['emerald', 1], 12, 10, 0.05, false, false],
  ['weaponsmith', 2, ['emerald', 36], null, ['bell', 1], 12, 5, 0.2, false, false],
  ['weaponsmith', 3, ['flint', 24], null, ['emerald', 1], 12, 20, 0.05, false, false],
  ['weaponsmith', 4, ['diamond', 1], null, ['emerald', 1], 12, 30, 0.05, false, false],
  ['weaponsmith', 4, ['emerald', [17, 31]], null, ['diamond_axe', 1], 3, 15, 0.2, true, false],
  ['weaponsmith', 5, ['emerald', [13, 27]], null, ['diamond_sword', 1], 3, 30, 0.2, true, false]
];

/** The wiki's per-level pool sizes: how many rows each level chooses its two offers from. */
const WIKI_POOL_SIZES = {
  armorer: [5, 4, 5, 2, 2],
  butcher: [4, 3, 2, 1, 1],
  cartographer: [2, 2, 3, 2, 2],
  cleric: [2, 2, 2, 3, 2],
  farmer: [5, 3, 2, 2, 2],
  fisherman: [4, 3, 2, 1, 2],
  fletcher: [3, 2, 2, 2, 3],
  leatherworker: [3, 3, 2, 2, 2],
  librarian: [3, 3, 3, 4, 2],
  mason: [2, 2, 7, 3, 2],
  shepherd: [5, 7, 6, 7, 1],
  toolsmith: [5, 2, 5, 3, 1],
  weaponsmith: [3, 2, 1, 2, 1]
};

test('the trade pools cover all thirteen professions at all five levels', () => {
  assert.deepEqual(Object.keys(PROFESSION_TRADES).sort(), Object.keys(PROFESSIONS).sort(),
    'every profession needs a pool and no pool may name a profession that does not exist');
  for (const profession of Object.keys(PROFESSIONS)) {
    for (const level of VILLAGER_LEVELS) {
      assert.ok(tradePoolFor(profession, level.level).length > 0,
        `${profession} has no offer pool at ${level.title}`);
    }
    assert.equal(WORKSTATION_TO_PROFESSION[PROFESSIONS[profession].workstation], profession,
      `${profession}'s workstation must map back to it`);
  }
});

test('each level pool holds the number of rows the wiki lists', () => {
  for (const [profession, sizes] of Object.entries(WIKI_POOL_SIZES)) {
    const actual = VILLAGER_LEVELS.map((level) => tradePoolFor(profession, level.level).length);
    assert.deepEqual(actual, sizes, `${profession} pool sizes are stale`);
  }
});

test('every row matches the wiki ledger', () => {
  const actual = [];
  for (const [profession, rows] of Object.entries(PROFESSION_TRADES)) {
    for (const row of rows) {
      const costCount = row.cost.countMin === row.cost.countMax
        ? row.cost.countMin
        : [row.cost.countMin, row.cost.countMax];
      actual.push([
        profession,
        row.level,
        [row.cost.wikiId, costCount],
        row.cost2 ? [row.cost2.wikiId, row.cost2.countMin] : null,
        [row.reward.wikiId, row.reward.countMin],
        row.maxUses,
        row.xp,
        row.priceMultiplier,
        row.enchanted === true,
        row.enchantedBook === true
      ]);
    }
  }
  // Compared row by row so a failure names the row that moved rather than dumping two 183-row arrays.
  assert.equal(actual.length, WIKI_LEDGER.length, 'the pool sizes no longer match the ledger');
  for (let i = 0; i < WIKI_LEDGER.length; i++) {
    assert.deepEqual(actual[i], WIKI_LEDGER[i], `row ${i} drifted from the wiki`);
  }
});

test('every trade side resolves to a real item or block, with an icon on disk', () => {
  const missing = [];
  for (const [profession, rows] of Object.entries(PROFESSION_TRADES)) {
    for (const row of rows) {
      for (const field of ['cost', 'cost2', 'reward']) {
        const side = row[field];
        if (!side) continue;
        const where = `${profession} ${row.level} ${field}`;
        if (!resolves(side.id)) missing.push(`${where}: ${side.wikiId} -> ${side.id}`);
        if (!side.name || side.name === String(side.id)) missing.push(`${where}: no display name`);
        if (!side.icon?.startsWith('/assets/')) missing.push(`${where}: no icon`);
        else if (!existsSync('public' + side.icon)) missing.push(`${where}: icon file missing ${side.icon}`);
      }
    }
  }
  assert.deepEqual(missing, [],
    'a trade offering an id this game cannot resolve grants a phantom stack');
});

test('the wiki columns stay inside their legal value sets', () => {
  const STOCK = new Set([1, 2, 3, 4, 5, 6, 8, 12, 16]);
  const XP = new Set([1, 2, 5, 10, 15, 20, 30]);
  const MULTIPLIER = new Set([0.05, 0.2]);
  for (const [profession, rows] of Object.entries(PROFESSION_TRADES)) {
    for (const row of rows) {
      const where = `${profession} ${row.level} ${row.reward.wikiId}`;
      assert.ok(STOCK.has(row.maxUses), `${where}: stock ${row.maxUses} is not a wiki value`);
      assert.ok(XP.has(row.xp), `${where}: villager experience ${row.xp} is not a wiki value`);
      assert.ok(MULTIPLIER.has(row.priceMultiplier), `${where}: multiplier ${row.priceMultiplier} is not a wiki value`);
      assert.ok(row.cost.countMin >= 1 && row.cost.countMin <= row.cost.countMax, `${where}: bad cost range`);
      if (row.cost2) assert.ok(row.cost2.countMin >= 1, `${where}: bad secondary cost`);
      assert.ok(row.reward.countMin >= 1, `${where}: the reward count must be at least one`);
      assert.ok(row.reward.countMin <= stackLimitFor(row.reward.id), `${where}: the reward exceeds a stack`);
    }
  }
});

test('the two reductions this build makes are recorded on the rows themselves', () => {
  // A row the wiki prints as "any colour", and a row whose probability the wiki computes per biome, are the
  // only places this build does not reproduce the article exactly. Each carries its explanation, so the
  // reduction cannot be mistaken for a transcription slip.
  const colourRows = [
    ['cartographer', 4, 'white_banner'],
    ['mason', 4, 'white_terracotta'],
    ['mason', 4, 'white_glazed_terracotta'],
    ['shepherd', 2, 'white_wool'],
    ['shepherd', 2, 'white_carpet'],
    ['shepherd', 3, 'red_bed'],
    ['shepherd', 4, 'white_banner']
  ];
  // A wiki row can name the collapsed item on either side: a shepherd sells a wool, a fisherman buys a boat.
  const rowFor = (profession, level, wikiId) => tradePoolFor(profession, level)
    .find((r) => r.cost.wikiId === wikiId || r.reward.wikiId === wikiId);

  for (const [profession, level, reward] of colourRows) {
    const row = rowFor(profession, level, reward);
    assert.ok(row, `${profession} ${level} should still offer ${reward} as the pinned colour`);
    assert.match(row.note, /colou?r/i, `${profession} ${level} ${reward} must record that vanilla offers every colour`);
  }

  const biomeRows = [
    ['cartographer', 2, 'village_map'],
    ['fisherman', 5, 'boat']
  ];
  for (const [profession, level, reward] of biomeRows) {
    const row = rowFor(profession, level, reward);
    assert.ok(row, `${profession} ${level} should offer ${reward}`);
    assert.match(row.note, /biome/i, `${profession} ${level} ${reward} must record the biome dependence`);
  }

  // And the alias table itself is the record of the renames, so it may not silently empty.
  assert.equal(resolveWikiId('empty_map'), 'map');
  assert.equal(resolveWikiId('book_and_quill'), 'writable_book');
  assert.equal(resolveWikiId('nether_quartz'), 'quartz');
  assert.equal(typeof WIKI_ID_ALIASES.village_map, 'object', 'a renamed map keeps its own display name');
});

// ===================================================================================================
// 2. What a level offers
// ===================================================================================================

test('a level offers two of its pool, one when the pool holds one, and never more than ten offers', () => {
  // Wiki: "Each level unlocks a maximum of two new trades. If a level has a pool of more than two trades,
  // the two offered trades are chosen randomly from the set." A pool of one obviously offers that one.
  const seeds = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.99];
  for (const profession of Object.keys(PROFESSIONS)) {
    for (const seed of seeds) {
      const villager = {};
      initVillagerEconomy(villager, profession, { random: () => seed });
      const novice = tradePoolFor(profession, 1);
      const wanted = Math.min(novice.length, MAX_NEW_TRADES_PER_LEVEL);
      assert.equal(villager.trades.length, wanted,
        `${profession} at seed ${seed} should offer ${wanted} of its ${novice.length} novice rows`);

      // Walk to master and confirm the ten-offer ceiling and the five career levels.
      villager.xp = 250;
      for (let level = 2; level <= 5; level++) unlockTradesForLevel(villager, level, () => seed);
      assert.ok(villager.trades.length <= MAX_TRADES,
        `${profession} at seed ${seed} holds ${villager.trades.length} offers, over the wiki's ten`);
      const keys = villager.trades.map((trade) => trade.key);
      assert.equal(new Set(keys).size, keys.length, `${profession} offered the same pool row twice`);
      for (const trade of villager.trades) {
        assert.ok(trade.uses === 0 && trade.disabled === false, 'a fresh offer starts unused');
      }
    }
  }
});

test('a different draw produces a different set of offers', () => {
  const draw = (seed) => {
    const villager = {};
    initVillagerEconomy(villager, 'farmer', { random: () => seed });
    return villager.trades.map((trade) => trade.key).join(',');
  };
  assert.notEqual(draw(0), draw(0.99), 'the novice farmer pool has five rows and only two slots');
  assert.notEqual(draw(0.2), draw(0.8));
});

test('the master librarian is the wiki exception and picks three where the pool allows', () => {
  // Wiki: "Master librarians are currently the only exception, as they pick 3 trades; this is visible when
  // only the Villager Trade Rebalance experiment is enabled, as the default pool contains only two possible
  // choices so those two trades are offered." So the rule is three, and the default outcome is two.
  assert.equal(maxOffersFor('librarian', 5), 3);
  assert.equal(maxOffersFor('librarian', 4), MAX_NEW_TRADES_PER_LEVEL);
  assert.equal(maxOffersFor('farmer', 5), MAX_NEW_TRADES_PER_LEVEL);
  assert.equal(tradePoolFor('librarian', 5).length, 2, 'the default master pool holds two rows');
  const villager = {};
  initVillagerEconomy(villager, 'librarian', { random: () => 0 });
  villager.xp = 250;
  for (let level = 2; level <= 5; level++) unlockTradesForLevel(villager, level, () => 0);
  assert.equal(villager.trades.filter((trade) => trade.level === 5).length, 2,
    'both of the two master rows are offered');
});

test('a master villager reaches exactly the wiki ten offers', () => {
  // The wiki's two-per-level rule over five levels is exactly ten, which is also its stated maximum. A pool
  // that lapses under two rows is what would break this, so it is worth asserting on a real profession.
  const villager = { level: 1, xp: 0 };
  initVillagerEconomy(villager, 'farmer', { random: () => 0.3 });
  for (let level = 2; level <= 5; level++) {
    villager.xp = VILLAGER_LEVELS[level - 1].xpRequired;
    unlockTradesForLevel(villager, level, () => 0.3);
  }
  assert.equal(villager.trades.length, MAX_TRADES);
  assert.deepEqual([...new Set(villager.trades.map((t) => t.level))].sort(), [1, 2, 3, 4, 5]);
});

// ===================================================================================================
// 3. The price formula
// ===================================================================================================

const priceTrade = (overrides = {}) => ({
  cost: { id: 'wheat', isBlock: false, count: 20, name: 'Wheat', icon: '' },
  cost2: null,
  reward: { id: 'emerald', isBlock: false, count: 1, name: 'Emerald', icon: '' },
  maxUses: 16,
  xp: 2,
  priceMultiplier: 0.05,
  demand: 0,
  uses: 0,
  disabled: false,
  ...overrides
});

test('an offer is created with demand of minus twice its stock', () => {
  // Wiki: "Demand is tracked per item and is initially minus two times the number of times the villager has
  // the trade in stock."
  const row = tradePoolFor('farmer', 1).find((r) => r.cost.wikiId === 'wheat');
  const trade = instantiateTrade(row, () => 0);
  assert.equal(trade.demand, -2 * trade.maxUses);
  assert.equal(trade.maxUses, 16);
  assert.equal(trade.cost.count, 20);
  assert.equal(calculateTradeCost(trade, {}, {}).effectiveCount, 20,
    'a negative demand leaves the initial price alone');
});

test('the demand markup is the article formula', () => {
  // Wiki: price = floor(p * (m * max(0, d) + 1)). Demand of six on a five-emerald iron helmet is
  // floor(5 * (0.2 * 6 + 1)) = floor(11) = 11.
  const trade = priceTrade({ cost: { id: 'emerald', isBlock: false, count: 5, name: 'Emerald', icon: '' }, priceMultiplier: 0.2, demand: 6 });
  const price = calculateTradeCost(trade, {}, {});
  assert.equal(price.demandPrice, 11);
  assert.equal(price.effectiveCount, 11);
  assert.equal(price.markup, true);
  // A zero multiplier ignores demand entirely, which is what a wandering trader's offers do.
  const flat = calculateTradeCost(priceTrade({ demand: 40, priceMultiplier: 0 }), {}, {});
  assert.equal(flat.effectiveCount, 20);
});

test('reputation discounts a price, and a negative reputation raises it the Java way', () => {
  // Wiki: "The price is decreased by the price multiplier times the reputation, rounded down, though it can
  // result in an overall price increase only in Java Edition."
  const trade = priceTrade({ priceMultiplier: 0.05 });
  assert.equal(calculateTradeCost(trade, {}, { reputation: 0 }).effectiveCount, 20);
  assert.equal(calculateTradeCost(trade, {}, { reputation: 20 }).effectiveCount, 19, 'floor(0.05 * 20) = 1');
  // Java's floor of a negative product makes the price rise.
  assert.equal(calculateTradeCost(trade, {}, { reputation: -20 }).effectiveCount, 21, 'floor(0.05 * -20) = -1');

  // The reputation can also come from the villager's own gossip store.
  const villager = { gossip: { [DEFAULT_PLAYER_KEY]: { trading: 20 } } };
  assert.equal(reputationOf(villager), 20);
  assert.equal(calculateTradeCost(trade, villager, {}).effectiveCount, 19,
    'with no explicit reputation the villager reports its own');
});

test('hero of the village scales 30% then 6.25% a level, and never below one', () => {
  // Wiki: the effect "reduces the price of all villagers by 30% and 6.25% per additional level, both being
  // of the initial price, giving 55% at level V", and the reduction "is at least 1".
  const trade = priceTrade({ cost: { id: 'emerald', isBlock: false, count: 20, name: 'Emerald', icon: '' }, priceMultiplier: 0.05 });
  assert.equal(calculateTradeCost(trade, {}, { heroOfTheVillageLevel: 0 }).effectiveCount, 20);
  assert.equal(calculateTradeCost(trade, {}, { heroOfTheVillageLevel: 1 }).effectiveCount, 14, '30% of 20 is 6');
  assert.equal(calculateTradeCost(trade, {}, { heroOfTheVillageLevel: 2 }).effectiveCount, 13, '36.25% of 20 is 7.25');
  assert.equal(calculateTradeCost(trade, {}, { heroOfTheVillageLevel: 3 }).effectiveCount, 12, '42.5% of 20 is 8.5');
  assert.equal(calculateTradeCost(trade, {}, { heroOfTheVillageLevel: 5 }).effectiveCount, 9, '55% of 20 is 11');
  // The `sgn(h)` in the formula: an explicit false is level zero, and level zero is no discount at all.
  assert.equal(calculateTradeCost(trade, {}, { heroOfTheVillage: false }).effectiveCount, 20);
  assert.equal(calculateTradeCost(trade, {}, { heroOfTheVillage: true }).effectiveCount, 14);
  // The floor of 1 applies to the discount itself, so a one-emerald trade stays one emerald.
  const cheap = priceTrade({ cost: { id: 'emerald', isBlock: false, count: 1, name: 'Emerald', icon: '' } });
  assert.equal(calculateTradeCost(cheap, {}, { heroOfTheVillageLevel: 5 }).effectiveCount, 1);
});

test('a price never falls below one or rises above the stack size', () => {
  // Wiki: "no quantity can go lower than 1 or higher than the stack size".
  const trade = priceTrade({ cost: { id: 'wheat', isBlock: false, count: 64, name: 'Wheat', icon: '' }, priceMultiplier: 0.05, demand: 4 });
  const inflated = calculateTradeCost(trade, {}, {});
  assert.equal(inflated.effectiveCount, 64, 'floor(64 * (0.05 * 4 + 1)) = 76, clamped to a stack');
  assert.equal(inflated.clampedToStack, true);
  const floored = calculateTradeCost(trade, {}, { reputation: 100000 });
  assert.equal(floored.effectiveCount, 1);
  // A stack of one, like the saddle the leatherworker sells, cannot be discounted to nothing either.
  const saddle = calculateTradeCost(
    priceTrade({ cost: { id: 'saddle', isBlock: false, count: 1, name: 'Saddle', icon: '' } }), {}, { reputation: 500 });
  assert.equal(saddle.effectiveCount, 1);
});

test('only the first item of a two-cost trade moves', () => {
  // Wiki: "All price fluctuations affect only the first item involved in trade; for example, for an initial
  // trade of 32 sticks for 1 emerald, the price might be driven down to 1 stick or up to 64 sticks for 1
  // emerald, but never for 2 emeralds."
  const row = tradePoolFor('fletcher', 1).find((r) => r.cost2 && r.cost.wikiId === 'gravel');
  assert.ok(row, 'the fletcher buys ten gravel plus one emerald for ten flint');
  const trade = instantiateTrade(row, () => 0);
  trade.demand = 40;
  const price = calculateTradeCost(trade, {}, {});
  assert.ok(price.effectiveCount > 10, 'the gravel price rose');

  const inv = inventoryWith(
    { id: 'gravel', isBlock: true, count: 64 },
    { id: 'emerald', isBlock: false, count: 8 }
  );
  const result = executeTrade(trade, {}, inv, null, { random: () => 0 });
  assert.equal(result.success, true);
  assert.equal(countOf(inv, 'emerald', false), 7, 'exactly one emerald is spent, never more');
  assert.equal(countOf(inv, 'flint', false), 10, 'and the flint is granted');
  // The resolved price object never touches the secondary cost.
  assert.equal(trade.cost2.count, 1);
});

test('curing a zombie villager stores the wiki gossip, and a second cure stores nothing', () => {
  // Wiki: curing stores a `major_positive` of 20 and a `minor_positive` of 25, which the multipliers turn
  // into +100 and +25.
  assert.equal(CURE_REPUTATION, 125);
  const villager = {};
  initVillagerEconomy(villager, 'armorer');
  recordCure(villager);
  assert.equal(reputationOf(villager), 125);
  // Vanilla 1.20.2: "A villager now gives a big discount only the first time it is cured".
  recordCure(villager);
  assert.equal(reputationOf(villager), 125, 'a second cure may not stack a second major discount');

  // The discount reaches a real price: the armorer's five-emerald iron helmet falls to its floor of one.
  const helmet = instantiateTrade(tradePoolFor('armorer', 1).find((r) => r.reward.wikiId === 'iron_helmet'), () => 0);
  assert.equal(calculateTradeCost(helmet, villager, {}).effectiveCount, 1);
  assert.equal(calculateTradeCost(helmet, {}, {}).effectiveCount, 5, 'and an uncured armorer charges five');
});

test('attack and kill gossip are negative, and gossip decays on the twenty-minute clock', () => {
  // Wiki's gossiping table: trading 4, major_positive 20 (multiplier 5), minor_positive 25 (1),
  // minor_negative 25 (-1), major_negative 25 (-5); decay 2, 0, 1, 20 and 10 per twenty minutes.
  assert.deepEqual(
    Object.fromEntries(Object.entries(GOSSIP_TYPES).map(([k, v]) => [k, [v.gain, v.decay, v.shareCost, v.max, v.multiplier]])),
    {
      trading: [4, 2, 20, 25, 1],
      major_positive: [20, 0, 100, 20, 5],
      minor_positive: [25, 1, 5, 25, 1],
      minor_negative: [25, 20, 20, 200, -1],
      major_negative: [25, 10, 10, 100, -5]
    });

  const villager = { gossip: {} };
  recordAttack(villager);
  assert.equal(reputationOf(villager), -25);
  recordKill(villager);
  assert.equal(reputationOf(villager), -25 - 125, 'a kill is a major_negative times a multiplier of 5');

  // Storage is clamped to each type's maximum, and the multiplier supplies the sign.
  for (let i = 0; i < 20; i++) recordTrade(villager);
  assert.equal(villager.gossip[DEFAULT_PLAYER_KEY].trading, GOSSIP_TYPES.trading.max);
  assert.equal(reputationOf(villager), 25 - 25 - 125);

  // Decay: the trading gossip loses 2 an interval, and the curing gossip is permanent.
  const decayer = { gossip: {}, gossipClock: 0 };
  recordTrade(decayer);
  recordCure(decayer);
  assert.equal(decayGossip(decayer, GOSSIP_DECAY_SECONDS - 1), false, 'nothing happens before the interval');
  assert.equal(decayGossip(decayer, 1), true);
  assert.equal(decayer.gossip[DEFAULT_PLAYER_KEY].trading, 4 - 2);
  assert.equal(decayer.gossip[DEFAULT_PLAYER_KEY].major_positive, 20, 'a decay of zero is what makes a cure permanent');
  assert.equal(decayer.gossip[DEFAULT_PLAYER_KEY].minor_positive, 25 - 1);
  // Two intervals at once decay twice, and the minor_positive decays with them.
  recordTrade(decayer);
  decayGossip(decayer, GOSSIP_DECAY_SECONDS * 2);
  assert.equal(decayer.gossip[DEFAULT_PLAYER_KEY].trading, 2, '2 + 4 - 2 * 2');
  assert.equal(decayer.gossip[DEFAULT_PLAYER_KEY].minor_positive, 22, '24 - 1 * 2');
  assert.equal(decayer.gossip[DEFAULT_PLAYER_KEY].major_positive, 20, 'the permanent gossip is still 20');
  assert.equal(reputationOf(decayer), 2 + 20 * 5 + 22, 'and the cure still dominates the total');
});

test('the curing gossip can never be shared', () => {
  // Wiki: "Because the cost of sharing the major gossip gained from curing is greater than its maximum, it
  // can never be shared."
  const from = { gossip: {} };
  const to = { gossip: {} };
  recordCure(from);
  const shared = shareGossip(from, to);
  assert.ok(!shared.includes('major_positive'), 'the curing gossip is unshareable');
  assert.equal(reputationOf(to), 20, 'only the minor_positive of 25 minus its sharing cost of 5 travels');

  const talker = { gossip: {} };
  for (let i = 0; i < 20; i++) recordTrade(talker);
  shareGossip(talker, to);
  assert.equal(reputationOf(to), 25, 'the trading gossip shares its value minus the sharing cost');
});

// ===================================================================================================
// 4. Trading, experience and restocking
// ===================================================================================================

test('a trade pays the player 3-6 experience and five more on a level up', () => {
  // Wiki: "All villager trades reward the player with 3-6 experience plus an additional 5 experience if the
  // villager levels up with the trade."
  assert.equal(TRADE_XP.playerMin, 3);
  assert.equal(TRADE_XP.playerMax, 6);
  assert.equal(TRADE_XP.levelUpBonus, 5);
  assert.equal(tradePlayerXp(() => 0, false), 3);
  assert.equal(tradePlayerXp(() => 0.999, false), 6);
  assert.equal(tradePlayerXp(() => 0.999, true), 11);
  assert.equal(tradePlayerXp(() => 1, false), 6, 'a random of exactly one cannot overpay');

  const villager = {};
  initVillagerEconomy(villager, 'farmer', { random: () => 0 });
  const wheat = villager.trades.find((trade) => trade.cost.wikiId === 'wheat');
  assert.ok(wheat, 'a zero draw picks the first two rows, and wheat is the first');
  const player = { level: 0, exp: 0 };
  const inv = inventoryWith({ id: 'wheat', isBlock: false, count: 200 });
  const result = executeTrade(wheat, villager, inv, null, { player, random: () => 0 });
  assert.equal(result.success, true);
  assert.equal(result.playerXpGained, 3);
  assert.equal(player.exp, 3, 'the experience reaches the player, not just the result');
});

test('villager experience and the five career thresholds follow the wiki', () => {
  // Wiki: Novice 0, Apprentice 10, Journeyman 70, Expert 150, Master 250.
  assert.deepEqual(VILLAGER_LEVELS.map((l) => [l.level, l.title, l.xpRequired]),
    [[1, 'Novice', 0], [2, 'Apprentice', 10], [3, 'Journeyman', 70], [4, 'Expert', 150], [5, 'Master', 250]]);

  const villager = {};
  initVillagerEconomy(villager, 'weaponsmith', { random: () => 0 });
  const coal = villager.trades.find((trade) => trade.cost.wikiId === 'coal');
  assert.ok(coal);
  const inv = inventoryWith({ id: 'coal', isBlock: false, count: 200 });

  // Each coal trade is worth the wiki's two villager experience.
  executeTrade(coal, villager, inv, null, { random: () => 0 });
  assert.equal(villager.xp, 2);
  while (villager.level === 1) {
    coal.uses = 0;
    coal.disabled = false;
    executeTrade(coal, villager, inv, null, { random: () => 0 });
  }
  assert.equal(villager.level, 2, 'ten experience is the apprentice threshold');
  assert.ok(villager.trades.some((trade) => trade.level === 2), 'and the new level unlocked offers');

  // The master threshold, and the fact that a master stops there.
  villager.xp = 250;
  executeTrade(coal, villager, inv, null, { random: () => 0 });
  assert.equal(villager.level, 5);
  const before = villager.xp;
  coal.uses = 0;
  coal.disabled = false;
  executeTrade(coal, villager, inv, null, { random: () => 0 });
  assert.equal(villager.level, 5, 'a master cannot level past five');
  assert.equal(villager.xp, before + 2, 'though the experience still accrues, as the wiki says it does');
});

test('a level up grants ten seconds of Regeneration I, worth four hit points', () => {
  // Wiki: "When a villager levels up its profession, it receives 10 seconds of Regeneration I (totaling to
  // 4HP of restoration), which emits magenta particles."
  const villager = { health: 10, maxHealth: 20 };
  initVillagerEconomy(villager, 'farmer', { random: () => 0 });
  const wheat = villager.trades.find((trade) => trade.cost.wikiId === 'wheat');
  villager.xp = 8;
  const inv = inventoryWith({ id: 'wheat', isBlock: false, count: 200 });
  const result = executeTrade(wheat, villager, inv, null, { random: () => 0 });
  assert.equal(result.leveledUp, true);
  assert.equal(result.regenerationSeconds, LEVEL_UP_REGENERATION_SECONDS);
  assert.equal(villager.regenerationTimer, 10);
  assert.equal(villager.levelUpFlash, true, 'which the update loop turns into particles');

  let healed = 0;
  for (let i = 0; i < 40; i++) if (updateVillagerRegeneration(villager, 0.25) === 'healed') healed++;
  assert.equal(healed, 4, 'Regeneration I is one point every 50 ticks, so four over ten seconds');
  assert.equal(villager.health, 14);
  assert.equal(villager.regenerationTimer, 0);
  assert.equal(updateVillagerRegeneration(villager, 1), null, 'and the effect ends');
});

test('an exhausted offer is disabled and cannot be used again', () => {
  // Wiki: "Each trade can be used a maximum number of times, after which the villager runs out of stock, and
  // the trade becomes disabled."
  const villager = {};
  initVillagerEconomy(villager, 'farmer', { random: () => 0 });
  const wheat = villager.trades.find((trade) => trade.cost.wikiId === 'wheat');
  const inv = inventoryWith({ id: 'wheat', isBlock: false, count: 2000 });
  for (let i = 0; i < wheat.maxUses; i++) {
    assert.equal(executeTrade(wheat, villager, inv, null, { random: () => 0 }).success, true, `use ${i + 1}`);
  }
  assert.equal(wheat.uses, 16);
  assert.equal(wheat.disabled, true);
  const after = executeTrade(wheat, villager, inv, null, { random: () => 0 });
  assert.equal(after.success, false);
  assert.equal(after.reason, 'out_of_stock');
});

test('an offer the player cannot afford is refused before anything is consumed', () => {
  const villager = {};
  initVillagerEconomy(villager, 'armorer', { random: () => 0 });
  for (const level of [2, 3, 4, 5]) unlockTradesForLevel(villager, level, () => 0);
  const helmet = villager.trades.find((trade) => trade.reward.wikiId === 'iron_helmet');
  const inv = inventoryWith({ id: 'emerald', isBlock: false, count: 4 });
  const result = executeTrade(helmet, villager, inv, null, { random: () => 0 });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'insufficient_items');
  assert.equal(countOf(inv, 'emerald', false), 4, 'nothing was spent');
  assert.equal(helmet.uses, 0);
});

test('restocking moves demand by the wiki rule and is capped at twice a day', () => {
  // Wiki: "Villagers restock twice per day, at which point they subtract the number of possible purchases
  // before running out of stock and add twice the number of actually made purchases", and they
  // "activate their offers again, up to twice per day."
  assert.equal(RESTOCKS_PER_DAY, 2);
  const villager = {};
  initVillagerEconomy(villager, 'farmer', { random: () => 0 });
  const wheat = villager.trades[0];
  const initialDemand = wheat.demand;
  wheat.uses = 10;
  assert.equal(restockVillager(villager, { day: 4 }), true);
  assert.equal(wheat.uses, 0);
  assert.equal(wheat.disabled, false);
  assert.equal(wheat.demand, initialDemand + 10 - (16 - 10), 'demand += uses - (maxUses - uses)');
  assert.equal(villager.restocksToday, 1);
  assert.equal(villager.restockDay, 4);
  assert.equal(restockVillager(villager, { day: 4 }), true, 'the second restock of the day');
  assert.equal(restockVillager(villager, { day: 4 }), false, 'and no third');
  assert.equal(villager.restocksToday, 2);
  // A new day restores the allowance.
  assert.equal(restockVillager(villager, { day: 5 }), true);
  assert.equal(villager.restocksToday, 1);
  // A fully sold-out offer pushes demand up, which is what makes an over-used trade dearer.
  const before = wheat.demand;
  wheat.uses = 16;
  restockVillager(villager, { day: 5 });
  assert.equal(wheat.demand, before + 16);
});

test('buying ignores extra item data, as the wiki says it does', () => {
  // Wiki: "When buying items from players, villagers ignore additional item data; this allows, for example,
  // selling renamed or enchanted items".
  const villager = {};
  initVillagerEconomy(villager, 'farmer', { random: () => 0 });
  const wheat = villager.trades.find((trade) => trade.cost.wikiId === 'wheat');
  const inv = inventoryWith({
    id: 'wheat',
    isBlock: false,
    count: 20,
    name: 'Rename Me',
    enchantments: [{ id: 'sharpness', name: 'Sharpness I', level: 1 }]
  });
  const result = executeTrade(wheat, villager, inv, null, { random: () => 0 });
  assert.equal(result.success, true, 'a renamed, enchanted stack still counts as wheat');
  assert.equal(countOf(inv, 'wheat', false), 0);
  assert.equal(countOf(inv, 'emerald', false), 1);
});

test('a block cost matches the form the player really carries', () => {
  // The masonry cost is the failure this guards: `stone` is a block, and a block is stored two ways
  // depending on whether it drops a named item, so a literal `(id, isBlock)` comparison never matched.
  const villager = {};
  initVillagerEconomy(villager, 'mason', { random: () => 0 });
  const stone = instantiateTrade(tradePoolFor('mason', 2).find((r) => r.cost.wikiId === 'stone'), () => 0);
  assert.equal(stone.cost.id, BLOCKS.STONE, 'resolved to the numeric block id');
  assert.equal(stone.cost.isBlock, true);

  for (const carried of [
    { id: BLOCKS.STONE, isBlock: true, count: 20 },
    { id: 'stone', isBlock: true, count: 20 },
    { id: 'STONE', isBlock: true, count: 20 }
  ]) {
    const inv = inventoryWith({ ...carried });
    const result = executeTrade(stone, villager, inv, null, { random: () => 0 });
    assert.equal(result.success, true, `carrying ${JSON.stringify(carried)} should be enough stone`);
    assert.equal(countOf(inv, BLOCKS.STONE, true), 0);
    stone.uses = 0;
    stone.disabled = false;
  }
  // A block whose own drop is a named item is held as that item, so harvested wheat is not a crop block.
  assert.equal(blockIdForTradeId('wheat'), null);
  assert.equal(tradeSide('wheat', 20).isBlock, false);
  assert.equal(canonicalItemKey('wheat', false), 'wheat');
  assert.equal(canonicalItemKey(BLOCKS.STONE, true), 'stone');
  assert.equal(canonicalItemKey('stone', true), 'stone');
});

test('nitwits, unemployed villagers and babies refuse to trade', () => {
  // Wiki: nitwits "cannot gain a profession", "Villagers without a job do not trade", "They can't get a job
  // or trade", and "If the player attempts to trade with a non-trading villager in Java Edition, it grunts
  // and bobs its head."
  const unemployed = {};
  initVillagerEconomy(unemployed, 'unemployed');
  assert.equal(villagerCanTrade(unemployed), false);
  assert.deepEqual(tradeRefusal(unemployed), { reason: 'unemployed', response: 'grunts_and_bobs' });

  const nitwit = {};
  initVillagerEconomy(nitwit, 'nitwit');
  assert.equal(nitwit.trades.length, 0, 'a nitwit never gains a pool');
  assert.equal(tradeRefusal(nitwit).reason, 'nitwit');

  const baby = {};
  initVillagerEconomy(baby, 'farmer', { random: () => 0 });
  baby.isBaby = true;
  assert.equal(villagerCanTrade(baby), false, 'a baby villager cannot trade');
  assert.equal(tradeRefusal(baby).reason, 'baby');

  const employed = {};
  initVillagerEconomy(employed, 'farmer', { random: () => 0 });
  assert.equal(villagerCanTrade(employed), true);
  assert.equal(tradeRefusal(employed), null);
});

test('a novice loses its profession with the job site, and a traded villager keeps it', () => {
  const world = new World(4242);
  world.reseed(4242);
  const scene = new THREE.Scene();
  const mobs = new MobManager(scene, world, null, null);

  const villager = mobs.spawnVillager(0, 10, 0, 'unemployed');
  world.setVoxel(3, 10, 3, BLOCKS.LECTERN);
  updateVillagerWorkstation(villager, world, mobs.mobs, { day: 1, random: () => 0 });
  assert.equal(villager.profession, 'librarian');
  assert.equal(villager.trades.length, 2, 'two of the three novice rows');

  world.setVoxel(3, 10, 3, BLOCKS.AIR);
  updateVillagerWorkstation(villager, world, mobs.mobs, { day: 1, random: () => 0 });
  assert.equal(villager.profession, 'unemployed', 'a novice with no experience loses the job');
  assert.equal(villager.trades.length, 0);

  // With experience the profession is locked, and losing the block only clears the workstation pointer.
  world.setVoxel(2, 10, 2, BLOCKS.COMPOSTER);
  updateVillagerWorkstation(villager, world, mobs.mobs, { day: 1, random: () => 0 });
  assert.equal(villager.profession, 'farmer');
  villager.xp = 4;
  world.setVoxel(2, 10, 2, BLOCKS.AIR);
  updateVillagerWorkstation(villager, world, mobs.mobs, { day: 1, random: () => 0 });
  assert.equal(villager.profession, 'farmer', 'a traded villager keeps its profession forever');
  assert.equal(villager.workstation, null);
  assert.ok(villager.trades.length > 0, 'and keeps its offers');
});

test('replacing a job site block re-rolls a novice villager trades', () => {
  // Wiki: "Removing and then replacing a job site block can alter the trades offered, and a villager with no
  // experience resets its trades every so often."
  const villager = { mesh: { position: new THREE.Vector3(0, 10, 0) }, xp: 0, profession: 'unemployed' };
  initVillagerEconomy(villager, 'unemployed');
  const world = {
    getVoxel: (x, y, z) => (Math.floor(x) === 3 && Math.floor(y) === 10 && Math.floor(z) === 3 ? BLOCKS.BARREL : BLOCKS.AIR)
  };
  updateVillagerWorkstation(villager, world, [], { day: 1, random: () => 0 });
  assert.equal(villager.profession, 'fisherman');
  const first = villager.trades.map((trade) => trade.key).join(',');

  // A different draw on the re-claim is what "can alter the trades offered" means.
  villager.workstation = null;
  villager.profession = 'unemployed';
  resetVillagerTrades(villager, () => 0.99);
  assert.notEqual(villager.trades.map((trade) => trade.key).join(','), first);
});

test('an enchanted offer hands over an item that is really enchanted', () => {
  // The article opens by naming this: trading is how a player obtains "enchanted books with 'treasure'
  // enchantments (e.g., Mending)".
  const villager = {};
  initVillagerEconomy(villager, 'librarian', { random: () => 0 });
  const row = tradePoolFor('librarian', 1).find((r) => r.enchantedBook);
  const book = instantiateTrade(row, () => 0);
  assert.equal(book.cost.count, 5, 'the rolled price starts at the bottom of the wiki range');

  const inv = inventoryWith(
    { id: 'emerald', isBlock: false, count: 64 },
    { id: 'book', isBlock: false, count: 1 }
  );
  const result = executeTrade(book, villager, inv, null, { random: () => 0.5 });
  assert.equal(result.success, true);
  const granted = [...inv.hotbar, ...inv.storage].find((slot) => slot?.id === 'enchanted_book');
  assert.ok(granted, 'the enchanted book reached the inventory');
  assert.ok(Array.isArray(granted.enchantments) && granted.enchantments.length > 0,
    'and it carries an enchantment array in the shape the rest of the game reads');
  for (const enchantment of granted.enchantments) {
    assert.equal(typeof enchantment.id, 'string');
    assert.equal(typeof enchantment.name, 'string');
    assert.ok(enchantment.level >= 1);
  }
  assert.equal(countOf(inv, 'emerald', false), 59);
  assert.equal(countOf(inv, 'book', false), 0, 'the secondary cost is spent');

  // An armorer's diamond leggings are enchanted too.
  const gear = instantiateTrade(tradePoolFor('armorer', 4).find((r) => r.reward.wikiId === 'diamond_leggings'), () => 0);
  const gearInv = inventoryWith({ id: 'emerald', isBlock: false, count: 64 });
  const gearResult = executeTrade(gear, {}, gearInv, null, { random: () => 0.5 });
  assert.equal(gearResult.success, true);
  assert.equal(gear.cost.count, 19, 'the rolled price starts at the bottom of 19-33');
  const leggings = [...gearInv.hotbar, ...gearInv.storage].find((slot) => slot?.id === 'diamond_leggings');
  assert.ok(leggings?.enchantments?.length > 0, 'the gear is enchanted, as the wiki note says');
});

test('the wiki trade experience reaches the player through a real trade', () => {
  const villager = {};
  initVillagerEconomy(villager, 'butcher', { random: () => 0 });
  const chicken = villager.trades.find((trade) => trade.cost.wikiId === 'chicken');
  const player = { level: 0, exp: 0 };
  const inv = inventoryWith({ id: 'chicken', isBlock: false, count: 14 });
  const result = executeTrade(chicken, villager, inv, null, { player, random: () => 0.5 });
  assert.equal(result.success, true);
  assert.ok(result.playerXpGained >= 3 && result.playerXpGained <= 6);
  assert.equal(player.exp, result.playerXpGained);
});

// ===================================================================================================
// 5. The wandering trader
// ===================================================================================================

test('the wandering trader table holds every row of the wiki three tables', () => {
  // Wiki: "two random trades from the purchasing table, two random trades from the special selling table,
  // and five random trades from the ordinary selling table."
  assert.equal(TRADER_TRADES.purchase.length, 6);
  assert.equal(TRADER_TRADES.special.length, 16);
  assert.equal(TRADER_TRADES.ordinary.length, 78);
  for (const [group, rows] of Object.entries(TRADER_TRADES)) {
    for (const row of rows) {
      assert.equal(typeof row.give, 'string', `${group} give`);
      assert.equal(typeof row.want, 'string', `${group} want`);
      assert.ok(row.giveCount >= 1 && row.wantCount >= 1, `${group} counts`);
      assert.ok(row.maxTrades >= 1, `${group} stock`);
    }
    const key = group === 'purchase' ? 'want' : 'give';
    const keys = rows.map((row) => row[key]);
    assert.equal(new Set(keys).size, keys.length, `${group} repeats a ${key}`);
  }
});

test('a wandering trader rolls nine offers in the wiki order, two/two/five', () => {
  const offers = rollTrades(ITEMS, BLOCKS, () => 0.42);
  assert.equal(offers.length, 9);
  assert.deepEqual(offers.map((offer) => offer.group),
    ['purchase', 'purchase', 'special', 'special', 'ordinary', 'ordinary', 'ordinary', 'ordinary', 'ordinary']);
  assert.deepEqual(TRADE_LAYOUT, { purchase: 2, special: 2, ordinary: 5 });
  for (const offer of offers) {
    assert.equal(offer.uses, 0);
    assert.equal(offer.disabled, false);
    assert.ok(resolves(offer.cost.id), `${offer.want} should resolve`);
    assert.ok(resolves(offer.reward.id), `${offer.give} should resolve`);
    assert.ok(offer.cost.name && offer.reward.name, 'both sides carry a display name');
    assert.ok(offer.cost.icon && offer.reward.icon, 'and an icon');
    assert.equal(offer.maxUses, offer.maxTrades, 'the stock is the villager-shaped maxUses too');
  }
  // The rows this build has no item for are filtered rather than offered as phantoms.
  const available = availableTrades(ITEMS, BLOCKS);
  for (const [group, wanted] of Object.entries(TRADE_LAYOUT)) {
    assert.ok(available[group].length >= wanted, `${group} needs ${wanted} resolvable rows`);
  }
  assert.equal(isResolvableTradeItem('definitely_not_an_item', ITEMS, BLOCKS), false);
  assert.equal(isResolvableTradeItem('potion_water', ITEMS, BLOCKS), true,
    'the wiki name resolves through the alias table rather than being dropped');
});

test('a purchase trade pays emeralds and a sale trade takes them', () => {
  const offers = rollTrades(ITEMS, BLOCKS, () => 0.42);
  const purchase = offers.find((offer) => offer.group === 'purchase');
  const sale = offers.find((offer) => offer.group === 'ordinary');
  assert.equal(purchase.reward.wikiId, 'emerald', 'a purchase trade pays out emeralds');
  assert.equal(sale.cost.wikiId, 'emerald', 'a sale trade wants them');

  const inv = inventoryWith({ id: purchase.cost.id, isBlock: purchase.cost.isBlock, count: 8 });
  const result = executeTrade(purchase, { type: 'wandering_trader' }, inv, null, {
    kind: 'wandering_trader',
    random: () => 0.5
  });
  assert.equal(result.success, true);
  assert.equal(countOf(inv, 'emerald', false), purchase.reward.count, 'the emeralds arrived');
  assert.ok(result.playerXpGained >= TRADE_XP.playerMin && result.playerXpGained <= TRADE_XP.playerMax);
  assert.equal(result.xpGained, 0, 'a wandering trader has no career levels to feed');
});

test('a wandering trader offer locks forever, unlike a villager', () => {
  // Wiki: "After the player uses the same trade several times, the wandering trader locks the trade, but
  // unlike villagers, never unlocks the trade."
  const offers = rollTrades(ITEMS, BLOCKS, () => 0);
  const offer = offers.find((candidate) => candidate.group === 'ordinary');
  const inv = inventoryWith({ id: 'emerald', isBlock: false, count: 64 });
  for (let i = 0; i < offer.maxUses; i++) {
    assert.equal(useTrade(offer), true, `use ${i + 1}`);
  }
  assert.equal(tradeLocked(offer), true);
  assert.equal(useTrade(offer), false);
  const blocked = executeTrade(offer, { type: 'wandering_trader' }, inv, null, { kind: 'wandering_trader' });
  assert.equal(blocked.success, false);
  assert.equal(blocked.reason, 'out_of_stock');
  assert.equal(usableTradeCount(offers), 8, 'and the lock is permanent');
});

test('a wandering trader window can be built from its offers alone', () => {
  // The trading menu reads `cost`, `reward`, `uses` and `maxUses` off whatever merchant it is given, so the
  // rolled offers have to carry all four rather than the wiki's `give`/`want`/`maxTrades` names.
  const trader = { type: 'wandering_trader', offers: rollTrades(ITEMS, BLOCKS, () => 0.31) };
  for (const offer of trader.offers) {
    assert.ok(offer.cost && offer.reward, 'an offer without sides cannot be rendered or used');
    assert.equal(typeof offer.maxUses, 'number');
    assert.equal(typeof offer.uses, 'number');
    assert.equal(typeof offer.disabled, 'boolean');
  }
});

// ===================================================================================================
// 6. Through the real mob loop
// ===================================================================================================

test('an employed villager runs its update loop and restocks without fault', () => {
  const world = new World(77);
  world.reseed(77);
  const scene = new THREE.Scene();
  const manager = new MobManager(scene, world, null, null);
  const player = {
    position: new THREE.Vector3(4, 10, 4),
    velocity: new THREE.Vector3(),
    gamemode: 'survival',
    health: 20,
    keys: {},
    onGround: true,
    statusEffects: new Map(),
    inventory: { hotbar: [], storage: [], active: null, getActiveItem() { return null; } },
    hasStatusEffect: () => false,
    takeDamage() {}
  };
  Object.assign(manager, { game: { player, worldTime: 6000, dayCount: 1, difficulty: 'normal', controls: {}, weather: { weatherType: 'clear' } } });

  // On the ground, not inside it: a villager spawned in stone is pushed out into the next chunk, which this test
  // never generates, and falls through it.
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.getOrCreateChunk(cx, cz);
  const y = world.getHighestSolidY(0, 0) + 1;
  player.position.set(4, y, 4);
  const villager = manager.spawnVillager(0.5, y, 0.5, 'farmer');
  world.setVoxel(1, y, 1, BLOCKS.COMPOSTER);
  assert.equal(villager.trades.length, 2, 'a novice farmer holds two of its five offers');

  const inv = inventoryWith({ id: 'wheat', isBlock: false, count: 4000 });
  for (const trade of villager.trades) {
    if (canonicalItemKey(trade.cost.id, trade.cost.isBlock) !== 'wheat') continue;
    for (let i = 0; i < trade.maxUses; i++) {
      assert.equal(executeTrade(trade, villager, inv, null, { random: () => 0 }).success, true, `use ${i + 1}`);
    }
    assert.equal(trade.uses, trade.maxUses);
    assert.equal(trade.disabled, true);
  }

  // Two seconds of simulated time is what `updateVillagerWorkstation` waits between checks, and the run has
  // to be clean: this is the loop that used to be able to throw from a price or a restock.
  assert.doesNotThrow(() => {
    for (let i = 0; i < 300; i++) manager.update(1 / 60, player);
  });
  assert.deepEqual([...(manager.mobErrors || [])], []);
  assert.ok(villager.trades.length <= MAX_TRADES);

  // Wiki: opening the menu "pauses their pathfinding, and makes them face the trading player."
  villager.mesh.position.set(0.5, y, 0.5);
  player.position.set(0.5, y, 4.5);
  villager.tradingWith = true;
  for (let i = 0; i < 60; i++) manager.update(1 / 60, player);
  assert.equal(villager.velocity.x, 0);
  assert.equal(villager.velocity.z, 0);
  assert.ok(Math.abs(villager.yaw) < 0.01, `the villager should face the player, yaw ${villager.yaw}`);
  villager.tradingWith = false;
});

test('the mechanics that need a clock or a hook are wired into the game, not just exported', () => {
  // Four of the wiki's rules only exist if something calls them: gossip decay, level-up regeneration, the
  // attack and kill memories, and the day counter that caps restocking. A helper with no caller is the exact
  // failure this round started from, so the wiring is asserted rather than assumed.
  const mobs = readFileSync('src/mobs.js', 'utf8');
  const main = readFileSync('src/main.js', 'utf8');
  const ui = readFileSync('src/ui.js', 'utf8');

  assert.match(mobs, /decayGossip\(mob, dt\)/, 'gossip must decay on the update loop');
  assert.match(mobs, /updateVillagerRegeneration\(mob, dt\)/, 'a level-up must actually heal');
  assert.match(mobs, /recordAttack\(mob\)/, 'hitting a villager must be remembered');
  assert.match(mobs, /recordKill\(other\)/, 'killing one must be remembered by its neighbours');
  assert.match(mobs, /day: this\.game\?\.dayCount \?\? 0/, 'restocking needs a day to cap against');

  // `worldTime` wraps every 24000 ticks, so the day has to be counted where the wrap happens.
  assert.match(main, /this\.dayCount = \(this\.dayCount \?\? 0\) \+ Math\.floor\(advancedTime \/ 24000\)/);
  assert.match(main, /if \(this\.tradingOpen\)/, 'the menu must close on damage or out of reach');
  assert.match(main, /tradeRefusal\(this\.targetMob\)/, 'a non-trading villager must be refused');

  assert.match(ui, /villagerMob\.tradingWith = true/, 'trading pauses the merchant');
  assert.match(ui, /this\.game\.tradingOpen = true/, 'and freezes a wandering trader\u2019s despawn timer');
  assert.match(ui, /isWanderingTrader\(mob\)/, 'the window must serve both merchants');
  assert.match(ui, /kind: trader \? 'wandering_trader' : 'villager'/, 'with the right experience rules');
});
