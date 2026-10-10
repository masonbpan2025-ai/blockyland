// Command parity against https://minecraft.wiki/w/Commands and https://minecraft.wiki/w/Commands/give.
//
// `/give` is the command every player uses first, and it had four defects that nothing could see,
// because its parsing lived inside a 4,000-line `main.js` with no test reaching it:
//
//   1. It took no target. Vanilla is `/give <targets> <item> [<count>]`; this was `/give <item>
//      [<count>]`, so the wiki's own first example, `/give @p pig_spawn_egg`, treated `@p` as an item
//      name and failed with "Unknown item '@p'".
//   2. The count defaulted to 64. The wiki says "If not specified, defaults to 1" and shows
//      `/give @p pig_spawn_egg`; asking for one diamond sword gave a stack of sixty-four.
//   3. Names were matched by brute force over the BLOCK registry only, comparing a lowercased argument
//      against an uppercase key, so an item had to be spelled exactly as its registry key and the
//      `minecraft:` namespace vanilla requires was rejected.
//   4. A full inventory was silently dropped: `addItem` returns false and the return value was ignored,
//      where vanilla gives what fits and summons the rest as an item entity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMMANDS, findCommand, splitItemArgument, resolveItem, suggestItems,
  TARGET_SELECTORS, resolveTargets, GIVE_COUNT, parseGive, giveItems, giveMessage,
} from '../src/commands.js';
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from '../src/blocks.js';

// --- the command table ---------------------------------------------------------

test('the command table names every command the dispatcher implements', () => {
  // The table is what `/help` renders and what `findCommand` looks up, so a command the dispatcher
  // handles but the table omits is a command `/help` cannot describe.
  const source = readFileSync('src/main.js', 'utf8');
  // Both spellings of the dispatcher's comparison appear in the file: `===` for the recent commands and
  // `==` for the older ones, and `/redstone` uses the `==` form.
  const handled = new Set(
    [...source.matchAll(/root\s*===?\s*'(\/[a-z_]+)'/g)].map((m) => m[1].slice(1)),
  );
  const known = new Set(COMMANDS.map((c) => c.name));
  const aliases = new Set(COMMANDS.flatMap((c) => c.aliases ?? []));
  const undocumented = [...handled].filter((name) => !known.has(name) && !aliases.has(name)).sort();
  assert.deepEqual(undocumented, [], 'these are dispatched but missing from the command table');
  // And the reverse, for a command that is described but does nothing. An alias is not a `root ===`
  // branch of its own, so it is excluded here for the same reason it is excluded above.
  const unhandled = [...known].filter((name) => !handled.has(name) && !aliases.has(name)).sort();
  assert.deepEqual(unhandled, [], 'these are in the table but the dispatcher does not handle them');
});

test('every command declares vanilla\'s arguments and a permission level', () => {
  for (const command of COMMANDS) {
    assert.ok(command.name && /^[a-z_]+$/.test(command.name), `${command.name} is not a valid name`);
    assert.equal(typeof command.args, 'string', `${command.name} needs an argument list`);
    assert.equal(typeof command.help, 'string', `${command.name} needs help text`);
    assert.ok(Number.isInteger(command.level), `${command.name} needs a permission level`);
  }
  // `/give` is vanilla's own usage string and permission level 2 (a cheat).
  const give = findCommand('give');
  assert.equal(give.args, '<targets> <item> [<count>]');
  assert.equal(give.level, 2);
  // Aliases resolve to their command.
  assert.equal(findCommand('saves').name, 'maps');
  assert.equal(findCommand('/saves').name, 'maps', 'a leading slash is accepted');
  assert.equal(findCommand('GIVE').name, 'give', 'and the lookup is case-insensitive');
  assert.equal(findCommand('nonsense'), null);
  assert.equal(findCommand(''), null);
  assert.equal(findCommand(undefined), null);
});

// --- the argument parser against the wiki's syntax --------------------------------

test('the syntax is `/give <targets> <item> [<count>]`', () => {
  // The wiki's first example, which the old parser rejected because `@p` was read as an item name.
  const first = parseGive(['@p', 'pig_spawn_egg']);
  assert.equal(first.ok, true, first.ok ? '' : first.reason);
  assert.equal(first.target, '@p');
  assert.equal(first.item.key, 'pig_spawn_egg');
  assert.equal(first.count, 1, 'the count defaults to 1');
});

test('an incomplete command is refused with the usage line', () => {
  // "The command is incomplete, or any argument is not specified correctly -> Unparseable".
  for (const args of [[], ['@p'], ['diamond_sword']]) {
    const result = parseGive(args);
    assert.equal(result.ok, false, `${JSON.stringify(args)} should not parse`);
    assert.match(result.usage, /<targets> <item> \[<count>\]/, 'and should show the usage');
  }
  // The old form `/give diamond_sword` is exactly the `['diamond_sword']` case above: one argument is
  // now read as the TARGET, so it fails loudly rather than silently giving the player 64 of something.
  assert.equal(parseGive(['diamond_sword']).ok, false);
});

test('the count is a whole number in vanilla\'s range, and defaults to 1', () => {
  assert.equal(parseGive(['@p', 'stone']).count, GIVE_COUNT.default, 'no count means one');
  assert.equal(parseGive(['@p', 'stone', '5']).count, 5);
  assert.equal(parseGive(['@p', 'stone', '1']).ok, true);
  assert.equal(GIVE_COUNT.min, 1, 'the wiki: between 1 and 2147483647');
  assert.equal(GIVE_COUNT.max, 2147483647);
  assert.equal(parseGive(['@p', 'stone', '2147483647']).ok, true, 'the maximum is inclusive');
  for (const bad of ['0', '-1', '2147483648', '64abc', '1.5', 'many', '']) {
    if (bad === '') continue; // an empty third argument is treated as absent
    const result = parseGive(['@p', 'stone', bad]);
    assert.equal(result.ok, false, `count '${bad}' should be refused`);
    assert.match(result.reason, /whole number|between 1 and/, `count '${bad}' reason`);
  }
  // `parseInt('64abc')` is 64, which is why the parser uses `Number`.
  assert.equal(parseGive(['@p', 'stone', '64abc']).ok, false, 'a trailing letter is not a number');
});

test('target selectors resolve only where this world can satisfy them', () => {
  // "It must be a player name, a target selector or a UUID."
  assert.equal(resolveTargets('@s').ok, true, 'the executing player');
  assert.equal(resolveTargets('@p').ok, true, 'the nearest player');
  // `@a` and `@r` name sets, and there is one player here. Refusing them is the point: quietly giving
  // the caller the items would make `/give @a diamond 1` look like it had worked.
  for (const selector of ['@a', '@r', '@e']) {
    assert.equal(TARGET_SELECTORS[selector].resolves, false, `${selector} is not a single player`);
    const result = resolveTargets(selector);
    assert.equal(result.ok, false, `${selector} should be refused`);
    assert.match(result.reason, /one player/, `${selector} refusal should say why`);
  }
  // A literal player name is the player, since there is exactly one.
  assert.equal(resolveTargets('Steve').ok, true);
  assert.equal(resolveTargets('Steve_01').ok, true);
  // Nonsense is not a selector.
  assert.equal(resolveTargets('@z').ok, false);
  assert.equal(resolveTargets('a name with spaces').ok, false, 'a name is at most 16 word characters');
  assert.equal(resolveTargets('').ok, false);
  assert.equal(resolveTargets(undefined).ok, false);
});

// --- item resolution -------------------------------------------------------------

test('an item resolves by namespaced id, registry key or display name', () => {
  const cases = [
    ['diamond_sword', 'diamond_sword', false],
    ['minecraft:diamond_sword', 'diamond_sword', false],
    ['Diamond Sword', 'diamond_sword', false],
    ['DIAMOND_SWORD', 'diamond_sword', false],
    ['ender_pearl', 'ender_pearl', false],
    ['stone', 'STONE', true],
    ['minecraft:stone', 'STONE', true],
    ['oak_planks', 'OAK_PLANKS', true],
    ['OAK_PLANKS', 'OAK_PLANKS', true],
  ];
  for (const [raw, key, isBlock] of cases) {
    const got = resolveItem(raw);
    assert.equal(got.ok, true, `${raw} should resolve: ${got.ok ? '' : got.reason}`);
    assert.equal(got.key, key, raw);
    assert.equal(got.isBlock, isBlock, `${raw} block-ness`);
    assert.ok(got.display.length > 0, `${raw} should carry a display name`);
  }
});

test('the wiki\'s spellings of a block resolve too', () => {
  // `blockNameMatch.js` exists because the wiki and this game disagree about block names in three ways.
  // `/give` had none of that vocabulary, so "Block of Coal" and "Grass Block" were unknown while
  // `COAL_BLOCK` and `GRASS` worked only by exact uppercase match.
  const cases = [
    ['block_of_coal', BLOCKS.COAL_BLOCK],
    ['grass_block', BLOCKS.GRASS],
    ['grass', BLOCKS.GRASS],
    ['hay_bale', BLOCKS.HAY_BLOCK],
    ['redstone_comparator', BLOCKS.COMPARATOR],
    ['redstone_repeater', BLOCKS.REPEATER],
    ['wet_sponge', BLOCKS.WET_SPONGE],
    ['jack_o_lantern', BLOCKS.JACK_O_LANTERN],
  ];
  for (const [raw, blockId] of cases) {
    const got = resolveItem(raw);
    assert.equal(got.ok, true, `${raw} should resolve: ${got.ok ? '' : got.reason}`);
    assert.equal(got.id, blockId, `${raw} should be block id ${blockId}`);
    assert.equal(got.isBlock, true);
  }
});

test('a name this game uses for two different blocks resolves to the one whose key matches', () => {
  // This game registers a `TARGET` block and a `TARGET_BLOCK`, and the wiki's block vocabulary folds
  // the bare name "target" onto TARGET_BLOCK. Both spellings are therefore real and they are different
  // blocks, so the exact-key match wins and `target_block` gets the other one. Vanilla has a single
  // Target Block, which is why this is a naming split in this game rather than an alias that is wrong.
  assert.notEqual(BLOCKS.TARGET, BLOCKS.TARGET_BLOCK, 'they really are two blocks');
  const bare = resolveItem('target');
  assert.equal(bare.ok, true);
  assert.equal(bare.id, BLOCKS.TARGET, 'the exact key wins for the bare name');
  const explicit = resolveItem('target_block');
  assert.equal(explicit.ok, true);
  assert.equal(explicit.id, BLOCKS.TARGET_BLOCK, 'and the fuller name gets the other');
});

test('a block with an item form is given as its item, and a block without one as the block', () => {
  // 720 of the registry's items are block item forms. `give` must use the form, because that is what
  // the player gets when they mine the block -- what matters is that the id is one the inventory can
  // hold and stack, not which of the two registries named it.
  for (const raw of ['oak_planks', 'white_wool', 'stone', 'dirt', 'target']) {
    const got = resolveItem(raw);
    assert.equal(got.ok, true, `${raw} should resolve`);
    assert.equal(got.isBlock, true, `${raw} is a block`);
    const holds = typeof got.id === 'number' || Object.prototype.hasOwnProperty.call(ITEMS, got.id);
    assert.ok(holds, `${raw} resolved to ${got.id}, which neither registry can hold`);
    assert.ok(got.display.length > 0, `${raw} needs a display name for the confirmation line`);
  }
});

test('an unresolvable item is refused with suggestions', () => {
  const result = resolveItem('not_a_thing');
  assert.equal(result.ok, false);
  assert.match(result.reason, /unknown item/);

  // A near miss suggests the real names, which is what makes a refusal actionable.
  const near = parseGive(['@p', 'diamon']);
  assert.equal(near.ok, false);
  assert.match(near.reason, /Did you mean:/);
  assert.match(near.reason, /diamond/);
  const suggestions = suggestItems('diamon');
  assert.ok(suggestions.length > 0 && suggestions.length <= 5);
  assert.ok(suggestions.includes('diamond'));
  // Nothing close, no suggestions, and no crash.
  assert.deepEqual(suggestItems('zzzzzzzz'), []);
  assert.deepEqual(suggestItems(''), []);
  assert.deepEqual(suggestItems(undefined), []);
});

test('the minecraft: namespace is stripped and data components are refused by name', () => {
  assert.deepEqual(splitItemArgument('minecraft:stone'), { id: 'stone', components: null, malformed: false });
  assert.deepEqual(splitItemArgument('stone'), { id: 'stone', components: null, malformed: false });
  const withComponents = splitItemArgument('diamond_sword[enchantments={"minecraft:sharpness":10}]');
  assert.equal(withComponents.id, 'diamond_sword');
  assert.match(withComponents.components, /sharpness/);
  // An unterminated bracket is malformed rather than silently part of the id.
  assert.equal(splitItemArgument('stone[oops').malformed, true);
  // And a component block is refused with a reason, since parsing data components is not modelled.
  const refused = resolveItem('diamond_sword[enchantments={}]');
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /data components are not supported/);

  // A namespace with nothing after the colon is not an item.
  assert.equal(resolveItem('minecraft:').ok, false);
  assert.equal(resolveItem('').ok, false);
  assert.equal(resolveItem(undefined).ok, false);
  assert.equal(resolveItem(null).ok, false);
});

// --- execution: what fits, and what is dropped -------------------------------------

/**
 * An inventory whose `addItem` is all-or-nothing, like the real one.
 *
 * `addItem` must NOT mutate on a refusal: `giveItems` finds the fitting count by bisection, so an
 * implementation that partly filled and refused would be asked the same question repeatedly and count
 * the same items more than once.
 */
function fakeInventory(capacity) {
  let used = 0;
  const calls = [];
  return {
    calls,
    get used() { return used; },
    addItem(id, isBlock, count) {
      calls.push({ id, isBlock, count });
      if (used + count > capacity) return false;
      used += count;
      return true;
    },
  };
}

test('an item that fits is given whole and nothing is dropped', () => {
  const inventory = fakeInventory(100);
  const dropped = [];
  const result = giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push({ id, n }), gamemode: 'survival',
    item: { id: 'stone', isBlock: true }, count: 10,
  });
  assert.deepEqual(result, { given: 10, dropped: 0 });
  assert.deepEqual(dropped, []);
  assert.equal(inventory.used, 10);
  // The first call is the whole count, as the real inventory's happy path expects.
  assert.deepEqual(inventory.calls[0], { id: 'stone', isBlock: true, count: 10 });
});

test('a full inventory gives what fits and drops the rest, as vanilla does', () => {
  // "If there is not enough room in the player's inventory, and the player is not in creative mode,
  // gives the specified item(s) until the inventory is full, and summons the rest items as an item
  // entity dropped by the player." The old path called `addItem` and threw its `false` away, so the
  // whole request vanished.
  //
  // The probe is the fitting count, not an accumulating inventory: `giveItems` bisects, so a fake that
  // filled on every successful call would answer the later probes differently and the search would
  // converge on the wrong number.
  const capacity = 7;
  const inventory = { addItem: (id, isBlock, count) => count <= capacity };
  const dropped = [];
  const result = giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push({ id, isBlock, n }), gamemode: 'survival',
    item: { id: 'stone', isBlock: true }, count: 10,
  });
  assert.equal(result.given, 7, 'the inventory took seven');
  assert.equal(result.dropped, 3, 'and three were dropped');
  assert.equal(dropped.reduce((n, d) => n + d.n, 0), 3);
  assert.deepEqual(dropped, [{ id: 'stone', isBlock: true, n: 3 }], 'one entity, since 3 fits a stack');
});

test('an inventory with no room drops everything', () => {
  const inventory = { addItem: () => false };
  const dropped = [];
  const result = giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push(n), gamemode: 'survival',
    item: { id: 'stone', isBlock: true }, count: 5,
  });
  assert.deepEqual(result, { given: 0, dropped: 5 });
  assert.deepEqual(dropped, [5]);
});

test('the drop obeys the stack limit, one entity per stack', () => {
  // A stack of 16 ender pearls cannot be one entity of 64 just because the request was large.
  const inventory = fakeInventory(0);
  const dropped = [];
  giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push(n), gamemode: 'survival',
    item: { id: 'ender_pearl', isBlock: false }, count: 40,
  });
  const limit = stackLimitFor('ender_pearl');
  assert.equal(limit, 16);
  assert.deepEqual(dropped, [16, 16, 8], '40 pearls are 16 + 16 + 8');
  for (const n of dropped) assert.ok(n <= limit, `${n} exceeds the stack limit of ${limit}`);
});

test('creative takes the whole count rather than dropping it', () => {
  // "If there is enough room in the player's inventory, OR THE PLAYER IS IN CREATIVE MODE, gives the
  // specified item(s)." There is nothing to drop into in creative, so the count is reported as given.
  const inventory = fakeInventory(0);
  const dropped = [];
  const result = giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push(n), gamemode: 'creative',
    item: { id: 'stone', isBlock: true }, count: 64,
  });
  assert.equal(result.given, 64);
  assert.equal(result.dropped, 0);
  assert.deepEqual(dropped, [], 'nothing is summoned onto the ground');
});

test('execution tolerates a missing inventory or drop hook', () => {
  assert.deepEqual(
    giveItems({ inventory: null, drop: null, gamemode: 'survival', item: { id: 'stone', isBlock: true }, count: 5 }),
    { given: 0, dropped: 5 },
  );
  const inventory = fakeInventory(0);
  assert.doesNotThrow(() => giveItems({
    inventory, drop: undefined, gamemode: 'survival', item: { id: 'stone', isBlock: true }, count: 3,
  }));
});

test('the confirmation line is vanilla\'s', () => {
  // "Gave <count> [<item>] to <target>".
  assert.equal(giveMessage('Diamond Sword', 1, '@p'), 'Gave 1 [Diamond Sword] to @p');
  assert.equal(giveMessage('Stone', 64, 'Steve'), 'Gave 64 [Stone] to Steve');
});

test('a huge count does not hang the bisection', () => {
  // `addItem` is all-or-nothing, so the fitting count is found by bisection. Adding one at a time would
  // be 2 billion calls for the maximum count.
  let calls = 0;
  const inventory = {
    addItem(id, isBlock, count) { calls++; return count <= 640; },
  };
  const started = Date.now();
  const result = giveItems({
    inventory, drop: () => {}, gamemode: 'survival',
    item: { id: 'stone', isBlock: true }, count: 2147483647,
  });
  assert.equal(result.given, 640);
  assert.ok(calls < 200, `expected a logarithmic search, made ${calls} calls`);
  assert.ok(Date.now() - started < 1000, 'and it should finish immediately');
});

// --- the call site ------------------------------------------------------------------

test('main.js uses the shared parser rather than its own', () => {
  const source = readFileSync('src/main.js', 'utf8');
  assert.match(source, /import \{ COMMANDS, parseGive, giveItems, giveMessage \} from '\.\/commands\.js'/);
  assert.match(source, /const parsed = parseGive\(parts\.slice\(1\)\)/);
  assert.match(source, /giveItems\(\{/);
  assert.match(source, /giveMessage\(item\.display, result\.given, target\)/);
  // The old inline form must be gone, or it would shadow the shared one.
  assert.equal(/const count = parts\[2\] \? parseInt\(parts\[2\]\) : 64/.test(source), false,
    'the old default-to-64 line should be gone');
  assert.equal(/Gave \$\{count\} \[\$\{itName\}\] to Player/.test(source), false,
    'and so should the old confirmation line');
  assert.equal(/Unknown item '\$\{itName\}'/.test(source), false,
    'and the old unknown-item line, which had no suggestions');
});

test('/help is rendered from the command table, so the two cannot disagree', () => {
  // The help text used to be a hand-written list beside the dispatcher, and it had already drifted:
  // it advertised `/give <item_name> [amount]`, which is not the syntax the dispatcher accepted or
  // vanilla's. It iterates `COMMANDS` now.
  const source = readFileSync('src/main.js', 'utf8');
  const helpBlock = source.slice(source.indexOf("if (root === '/help')"), source.indexOf("} else if (root === '/offline')"));
  assert.match(helpBlock, /for \(const command of COMMANDS\)/, '/help should iterate the table');
  assert.equal(/\/give <item_name>/.test(source), false, 'the stale /give help line should be gone');
  // Every command in the table reaches the help output, apart from the ones with their own longer
  // explanation above it.
  const blurbed = new Set(['redstone', 'locate', 'show_mobs']);
  for (const command of COMMANDS) {
    if (blurbed.has(command.name)) continue;
    assert.ok(helpBlock.includes('command.name') || helpBlock.includes(`/${command.name}`),
      `/${command.name} should be described by /help`);
  }
});
