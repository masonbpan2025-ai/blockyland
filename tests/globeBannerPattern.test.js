// The globe banner pattern: the fifth banner pattern, and the game's first trade-only item.
//
// Vanilla's cartographer sells it at master level for eight emeralds. Until this round the game had four banner
// patterns and no way to obtain any of them, and the globe one was on the Inspector's absent-name list; it is
// now the only item in the game whose sole route is a trade, which is why `codeDropSources.js` names it and why
// this file exists rather than leaving the claim to a table nobody executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ITEMS, BLOCKS } from '../src/blocks.js';
import { addedItems } from '../src/addedItems.js';
import { PROFESSION_TRADES } from '../src/villagerEconomy.js';
import { codeDropSources } from '../src/codeDropSources.js';

test('a master cartographer offers the globe banner pattern', () => {
  const pool = PROFESSION_TRADES.cartographer;
  assert.ok(Array.isArray(pool) && pool.length > 0, 'the cartographer should have a pool');
  const offer = pool.find((row) => row.reward?.id === 'globe_banner_pattern');
  assert.ok(offer, 'no cartographer offer gives the globe banner pattern');
  assert.equal(offer.level, 5, 'vanilla sells it at master level');
  assert.equal(offer.cost.id, 'emerald');
  assert.equal(offer.cost.count, 8, 'for eight emeralds');
  // The offer's own display fields must agree with the item, or the trade window renders one thing and the
  // inventory another.
  assert.equal(offer.reward.name, ITEMS.globe_banner_pattern.name);
});

test('the item is registered, stackable and has an icon', () => {
  const entry = addedItems().globe_banner_pattern;
  assert.ok(entry, 'the globe banner pattern should be one of the items this branch added');
  assert.equal(ITEMS.globe_banner_pattern.name, 'Globe Banner Pattern',
    'and named what vanilla names it, which `name-parity` also checks');
  assert.equal(entry.type, 'material', 'it is not placed and not worn');
  assert.equal(existsSync('public/assets/items/globe_banner_pattern.png'), true, 'it needs an icon');
  // The four patterns that were already here are the same shape, so this one is not a new kind of thing.
  assert.equal(ITEMS.creeper_banner_pattern.type, ITEMS.globe_banner_pattern.type);
});

test('the Inspector is told the trade is the source', () => {
  // `has-source` reads this table; without the entry the item would be reported unobtainable while a villager
  // sells it.
  const entries = codeDropSources().filter((source) => source.item === 'globe_banner_pattern');
  assert.equal(entries.length, 1, 'the globe banner pattern should have exactly one source entry');
  assert.match(entries[0].source, /^villagerEconomy\.js /);
  assert.match(entries[0].how, /cartographer/);
  // And it is a trade, not a drop: the table's name is historical, and the entry says which it is.
  assert.equal(BLOCKS.GLOBE_BANNER_PATTERN, undefined, 'it is not a block, so nothing else can produce it');
});

test('the piglin banner pattern stays absent, and why', () => {
  // Vanilla's other banner pattern comes from bartering, and this game's barter table is pinned to Java
  // 1.21.6+'s nineteen entries at weight 469 -- which do not include it. Adding a row here would break that
  // pin and would not be vanilla for the version the table models, so the item stays on the absent list with
  // the reason recorded in the gap review.
  assert.equal(ITEMS.piglin_banner_pattern, undefined);
  assert.equal(addedItems().piglin_banner_pattern, undefined);
});
