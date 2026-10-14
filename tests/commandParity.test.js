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
  TARGET_SELECTORS, resolveTargets, GIVE_COUNT, parseGive, giveItems, giveMessage, giveCountLimitFor,
} from '../src/commands.js';
import { HANDLED_HERE, HANDLED_ELSEWHERE, buildCommandContext, runCommand } from '../src/commandRunner.js';
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from '../src/blocks.js';

// --- the command table ---------------------------------------------------------

test('every command in the table is dispatched by exactly one of the two handlers', () => {
  // Commands are split: the portable ones live in `commandRunner.js`, the six that need a manager stay on
  // the Game class. Both sides are checked against the table, because a command in the table that nothing
  // implements is a `/help` line that lies, and a command implemented but absent from the table is one
  // `/help` cannot describe.
  const main = readFileSync('src/main.js', 'utf8');
  // The runner's switch, and the Java commands it hands to vanillaCommands.js.
  const runner = readFileSync('src/commandRunner.js', 'utf8') + readFileSync('src/vanillaCommands.js', 'utf8') + readFileSync('src/advancedCommands.js', 'utf8');

  const inRunner = new Set(
    [...runner.matchAll(/case '(\/[a-z_]+)':/g)].map((m) => m[1].slice(1)),
  );
  const inMain = new Set(
    [...main.matchAll(/case '(\/[a-z_]+)':/g)].map((m) => m[1].slice(1)),
  );
  // `/maps` and `/saves` share one branch, so the second spelling has no `case` of its own.
  inMain.add('saves');

  // The two handler lists in `commandRunner.js` say which is which, and they must agree with the code.
  // `saves` is an alias of `maps` rather than a `case` of its own, and it is in the runner's table.
  assert.deepEqual([...HANDLED_HERE].sort(), [...inRunner].sort(),
    'HANDLED_HERE and the runner switch disagree');
  const elsewhere = [...inMain].filter((n) => !inRunner.has(n) && n !== 'saves' && n !== 'tp');
  assert.deepEqual([...HANDLED_ELSEWHERE].sort(), elsewhere.sort(),
    'HANDLED_ELSEWHERE and the Game switch disagree');

  const known = new Set(COMMANDS.map((c) => c.name));
  const aliases = new Set(COMMANDS.flatMap((c) => c.aliases ?? []));
  const dispatched = new Set([...inRunner, ...inMain]);
  assert.deepEqual([...dispatched].filter((n) => !known.has(n) && !aliases.has(n)).sort(), [],
    'these are dispatched but missing from the command table');
  assert.deepEqual([...known].filter((n) => !dispatched.has(n) && !aliases.has(n)).sort(), [],
    'these are in the table but nothing dispatches them');
});

test('main.js delegates rather than parsing commands itself', () => {
  const source = readFileSync('src/main.js', 'utf8');
  // The dispatcher assembles a context and hands the line to the runner first. `permissionRefusal` joined the
  // import when the cheats gate moved ahead of both dispatchers, so the pattern allows extra named imports
  // rather than pinning the list -- what matters is that `runCommand` and `buildCommandContext` come from here.
  assert.match(source, /import \{[^}]*\bbuildCommandContext\b[^}]*\brunCommand\b[^}]*\} from '\.\/commandRunner\.js'/);
  assert.match(source, /if \(runCommand\(buildCommandContext\(this\), cmd\)\) return;/);
  // And it no longer owns the parsing or the item vocabulary.
  assert.equal(/from '\.\/commands\.js'/.test(source), false,
    'main.js should not import the command table or the parsers directly');
  assert.equal(/const count = parts\[2\] \? parseInt\(parts\[2\]\) : 64/.test(source), false,
    'the old default-to-64 line should be gone');
  assert.equal(/Gave \$\{count\} \[\$\{itName\}\] to Player/.test(source), false,
    'and so should the old confirmation line');
  assert.equal(/Unknown item '\$\{itName\}'/.test(source), false,
    'and the old unknown-item line, which had no suggestions');
  // `/summon` reads a table rather than being a forty-branch chain. The check is scoped to the method,
  // because a separate `mobType ===` chain in the click handler summons mobs for the world agent and is
  // deliberately left alone.
  assert.match(source, /const SUMMONABLE_MOBS = \{/);
  const summonStart = source.indexOf('runSummonCommand(rawType, posArgs = []) {');
  const summonBody = source.slice(summonStart, source.indexOf('\n  }', summonStart));
  assert.equal(/mobType ===/.test(summonBody), false, 'the /summon if/else chain should be gone');
  assert.match(summonBody, /SUMMONABLE_MOBS\[type\]/, 'and should read the table');
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
  for (const bad of ['0', '-1', '2147483648', '64abc', '1.5', 'many', '']) {
    if (bad === '') continue; // an empty third argument is treated as absent
    const result = parseGive(['@p', 'stone', bad]);
    assert.equal(result.ok, false, `count '${bad}' should be refused`);
    assert.match(result.reason, /whole number|between 1 and/, `count '${bad}' reason`);
  }
  // `parseInt('64abc')` is 64, which is why the parser uses `Number`.
  assert.equal(parseGive(['@p', 'stone', '64abc']).ok, false, 'a trailing letter is not a number');
  // The integer ceiling is inside the parser's range but above the delivery limit, so it is refused for the
  // SECOND reason. Asserting only "refused" here would let the two checks be confused for each other.
  const ceiling = parseGive(['@p', 'stone', String(GIVE_COUNT.max)]);
  assert.equal(ceiling.ok, false);
  assert.doesNotMatch(ceiling.reason, /between 1 and/, 'the integer is in range; the execution limit is what refuses it');
  assert.match(ceiling.reason, /exceeds/);
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
  // The namespace is VALIDATED, not sliced off: `splitItemArgument` decides whether the caller named this
  // game's own registry or somebody else's resource location.
  const namespaced = splitItemArgument('minecraft:stone');
  assert.equal(namespaced.id, 'stone');
  assert.equal(namespaced.components, null);
  assert.equal(namespaced.malformed, false);
  assert.equal(namespaced.unknownNamespace, undefined, 'minecraft: is this game\'s registry');
  assert.equal(splitItemArgument('stone').id, 'stone');
  const withComponents = splitItemArgument('diamond_sword[enchantments={"minecraft:sharpness":10}]');
  assert.equal(withComponents.id, 'diamond_sword');
  assert.match(withComponents.components, /sharpness/);
  // An unterminated bracket is malformed rather than silently part of the id.
  assert.equal(splitItemArgument('stone[oops').malformed, true);
  // And a component block is refused with a reason, since parsing data components is not modelled.
  const refused = resolveItem('diamond_sword[enchantments={}]');
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /data components are not supported/);

  // A foreign namespace is a DIFFERENT resource location. It used to be sliced at the last colon, so
  // `other_namespace:stone` handed over a vanilla stone: a typo resolved to the wrong item instead of
  // failing.
  const foreign = resolveItem('other_namespace:stone');
  assert.equal(foreign.ok, false, 'a foreign namespace must not resolve');
  assert.match(foreign.reason, /unknown item namespace/);
  assert.equal(splitItemArgument('other_namespace:stone').unknownNamespace, true);
  // Only the exact namespace counts, and `Minecraft:` is accepted as the same registry.
  assert.equal(resolveItem('Minecraft:stone').ok, true, 'the namespace is case-insensitive');
  assert.equal(resolveItem('notminecraft:stone').ok, false);
  assert.equal(resolveItem('minecraft:crafting:stone').ok, false, 'a path may not contain another colon');

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
function fakeInventory({ slots = 36, limit = 64, stacks = [] } = {}) {
  const grid = new Array(slots).fill(null);
  for (let i = 0; i < stacks.length; i++) grid[i] = { ...stacks[i] };
  const all = () => grid;
  const room = (id, isBlock, enchantments) => {
    let r = 0;
    if (!enchantments) {
      for (const s of all()) if (s && s.id === id && s.isBlock === isBlock && s.count < limit) r += limit - s.count;
    }
    r += all().filter((s) => !s).length * limit;
    return r;
  };
  const inventory = {
    hotbar: grid,
    storage: [],
    get used() { return all().filter(Boolean).reduce((n, s) => n + s.count, 0); },
    /** Non-mutating, mirroring `Inventory.countRoomFor`. */
    countRoomFor(id, isBlock) { return room(id, isBlock, null); },
    /** Fills what it can and reports whether the WHOLE request landed, like the real inventory. */
    addItem(id, isBlock, count, enchantments = null) {
      let remaining = count;
      if (remaining > 0) {
        for (const s of all()) {
          if (remaining <= 0) break;
          if (s && s.id === id && s.isBlock === isBlock && s.count < limit) {
            const add = Math.min(limit - s.count, remaining);
            s.count += add; remaining -= add;
          }
        }
        for (let i = 0; i < grid.length && remaining > 0; i++) {
          if (grid[i]) continue;
          const n = Math.min(limit, remaining);
          grid[i] = { id, isBlock, count: n };
          remaining -= n;
        }
      }
      return remaining === 0;
    },
  };
  return inventory;
}

test('an item that fits is given whole and nothing is dropped', () => {
  const inventory = fakeInventory({ slots: 36 });
  const dropped = [];
  const result = giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push({ id, n }), gamemode: 'survival',
    item: { id: 'stone', isBlock: true }, count: 10,
  });
  assert.deepEqual(result, { given: 10, dropped: 0 });
  assert.deepEqual(dropped, []);
  assert.equal(inventory.used, 10);
});

test('a nearly full inventory gives what fits and drops the rest, as vanilla does', () => {
  // "If there is not enough room in the player's inventory, and the player is not in creative mode, gives
  // the specified item(s) until the inventory is full, and summons the rest items as an item entity
  // dropped by the player."
  //
  // The 63-stone partial stack has room for exactly one more, and every other slot is full, so one fits and
  // nine must be dropped. This is the case the old bisection got wrong: it probed `addItem(5)`, which
  // inserted one stone and returned false, then concluded nothing fit, and dropped all ten — duplicating
  // the one it had already inserted.
  const inventory = fakeInventory({
    slots: 36,
    stacks: [{ id: 'stone', isBlock: true, count: 63 }, ...Array.from({ length: 35 }, () => ({ id: 'dirt', isBlock: true, count: 64 }))],
  });
  const stoneHeld = () => inventory.hotbar.reduce((n, s) => n + (s && s.id === 'stone' ? s.count : 0), 0);
  const heldBefore = stoneHeld();
  const dropped = [];
  const result = giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push({ id, isBlock, n }), gamemode: 'survival',
    item: { id: 'stone', isBlock: true }, count: 10,
  });
  assert.equal(result.given, 1, 'the partial stack takes one');
  assert.equal(result.dropped, 9, 'and nine are dropped');
  assert.equal(stoneHeld() - heldBefore, 1, 'the inventory grew by exactly the one it reported');
  const onGround = dropped.reduce((n, d) => n + d.n, 0);
  assert.equal((stoneHeld() - heldBefore) + onGround, 10,
    `conservation: ${stoneHeld() - heldBefore} held + ${onGround} dropped`);
  assert.deepEqual(dropped, [{ id: 'stone', isBlock: true, n: 9 }], 'one entity, since 9 fits a stack');
});

test('a saturated inventory duplicates nothing and drops the whole request once', () => {
  // 36 full stacks of an unstackable item: no slot has room, so all ten are dropped and the inventory is
  // untouched. The old bisection probed `addItem(10)`, `addItem(5)`, ... and left a partial insert behind
  // each time, which is how 101 swords became 36 held plus 101 dropped.
  const inventory = fakeInventory({ slots: 36, limit: 1, stacks: Array.from({ length: 36 }, () => ({ id: 'diamond_sword', isBlock: false, count: 1 })) });
  const dropped = [];
  const result = giveItems({
    inventory, drop: (id, isBlock, n) => dropped.push(n), gamemode: 'survival',
    item: { id: 'diamond_sword', isBlock: false }, count: 10,
  });
  assert.equal(result.given, 0);
  assert.equal(result.dropped, 10);
  assert.equal(inventory.used, 36, 'the inventory is untouched');
  assert.deepEqual(dropped, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'ten unstackable entities');
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
  // A stack of 16 ender pearls cannot be one entity of 64 just because the request was large. The slot
  // limit here is 1, so all 40 spill onto the ground and must still be split into pearl-sized stacks.
  const inventory = fakeInventory({ slots: 1, limit: 1, stacks: [{ id: 'dirt', isBlock: true, count: 1 }] });
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
  const inventory = fakeInventory({ slots: 36 });
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
  const inventory = fakeInventory({ slots: 36 });
  assert.doesNotThrow(() => giveItems({
    inventory, drop: undefined, gamemode: 'survival', item: { id: 'stone', isBlock: true }, count: 3,
  }));
});

test('the confirmation line is vanilla\'s', () => {
  // "Gave <count> [<item>] to <target>".
  assert.equal(giveMessage('Diamond Sword', 1, '@p'), 'Gave 1 [Diamond Sword] to @p');
  assert.equal(giveMessage('Stone', 64, 'Steve'), 'Gave 64 [Stone] to Steve');
});

test('an oversized count is refused before it can be duplicated', () => {
  // The parser range and the delivery limit are different: 2,147,483,647 is a valid integer and not a valid
  // amount to hand over. 100 stacks of 64 is 6,400 for an ordinary item, 1,600 for ender pearls (16 per
  // stack) and 100 for an unstackable sword.
  for (const [item, atLimit, overLimit] of [['minecraft:stone', 6400, 6401], ['minecraft:ender_pearl', 1600, 1601], ['minecraft:diamond_sword', 100, 101]]) {
    const limit = giveCountLimitFor(resolveItem(item).id);
    assert.equal(limit, atLimit, `${item} should cap at ${atLimit}`);
    assert.equal(parseGive(['@s', item, String(atLimit)]).ok, true, `${item} at its limit is allowed`);
    const over = parseGive(['@s', item, String(overLimit)]);
    assert.equal(over.ok, false, `${item} above its limit is refused`);
    assert.match(over.reason, /exceeds/, `${item} refusal should say the limit was exceeded`);
  }
  // The integer maximum is a parseable integer but far above any delivery limit.
  assert.equal(parseGive(['@s', 'minecraft:stone', String(GIVE_COUNT.max)]).ok, false);
});

test('a very large count is refused rather than executed', () => {
  // The old path could be asked for two billion items and would try to spawn billions of drop requests.
  const started = Date.now();
  const parsed = parseGive(['@s', 'minecraft:stone', '1000000000']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.reason, /exceeds/);
  assert.ok(Date.now() - started < 100, 'refusal is immediate');
});


test('a huge count is placed in a bounded number of calls', () => {
  // The old path bisected by calling `addItem` up to ~31 times, and every failed probe could leave a
  // partial insert behind. The new path asks once how much fits and inserts once, so the work does not grow
  // with the count at all.
  let calls = 0;
  const inventory = fakeInventory({ slots: 36, limit: 64 });
  const realAdd = inventory.addItem.bind(inventory);
  const realRoom = inventory.countRoomFor.bind(inventory);
  inventory.addItem = (...args) => { calls++; return realAdd(...args); };
  inventory.countRoomFor = (...args) => { calls++; return realRoom(...args); };
  const started = Date.now();
  const result = giveItems({
    inventory, drop: () => {}, gamemode: 'survival',
    item: { id: 'stone', isBlock: true }, count: 6400,
  });
  assert.equal(result.given, 2304, '36 slots hold 36 stacks of 64');
  assert.equal(result.dropped, 6400 - 2304);
  assert.equal(calls, 2, `one capacity query and one insert, made ${calls} calls`);
  assert.ok(Date.now() - started < 250, 'and it finishes immediately');
});

// --- the call site ------------------------------------------------------------------

test('the /give handler lives in the runner, not in main.js', () => {
  // The four defects were in the parsing, which is `commands.js`; the *handler* that fills the inventory
  // and drops the overflow is `commandRunner.js`, and it is what a test can now execute.
  const runner = readFileSync('src/commandRunner.js', 'utf8');
  assert.match(runner, /import \{[^}]*parseGive[^}]*\} from '\.\/commands\.js'/s);
  assert.match(runner, /function cmdGive\(context, parts\)/);
  assert.match(runner, /const parsed = parseGive\(parts\.slice\(1\)\)/);
  assert.match(runner, /giveItems\(\{/);
  assert.match(runner, /giveMessage\(item\.display, result\.given, target\)/);
  // And main.js no longer duplicates any of it.
  const main = readFileSync('src/main.js', 'utf8');
  assert.equal(/parseGive\(/.test(main), false, 'main.js should not parse /give itself');
  assert.equal(/giveItems\(\{/.test(main), false, 'nor fill the inventory itself');
});

test('/help is rendered from the command table, so the two cannot disagree', () => {
  // The help text used to be a hand-written list beside the dispatcher, and it had already drifted: it
  // advertised `/give <item_name> [amount]`, which is not the syntax vanilla defines nor the one the
  // dispatcher accepted. It iterates the table now, and the table lives in `commands.js`.
  const runner = readFileSync('src/commandRunner.js', 'utf8');
  const helpStart = runner.indexOf('function cmdHelp');
  assert.notEqual(helpStart, -1, 'cmdHelp should exist in the runner');
  const helpBlock = runner.slice(helpStart, runner.indexOf('function cmdTime', helpStart));
  assert.match(helpBlock, /for \(const command of context\.commands\)/, '/help should iterate the table');
  // Nothing anywhere still carries the stale wording. The literal appears in a comment explaining the
  // old defect, so the check looks for the string as a /help line rather than anywhere at all.
  const stale = "this.ui.addChatMessage('/give <item_name>";
  for (const file of ['src/main.js', 'src/commandRunner.js']) {
    assert.equal(readFileSync(file, 'utf8').includes(stale), false, `${file} still has the stale help line`);
  }
  // Every command in the table reaches the help output, apart from the three with their own longer
  // explanation written out above the loop.
  const blurbed = new Set(['redstone', 'locate', 'show_mobs']);
  for (const command of COMMANDS) {
    if (blurbed.has(command.name)) continue;
    assert.ok(helpBlock.includes('command.name'),
      `/${command.name} should be described by the table-driven /help output`);
  }
});


// --- the /give handler through the real dispatcher ----------------------------------
//
// Everything above tests the parser and the inventory maths in isolation. These run the actual command
// line through `runCommand`, which is the code path the chat box takes, so a wiring mistake between the
// parser, the handler and the context is caught rather than assumed.

/** A game stub with the eleven fields `buildCommandContext` reads. */
function fakeGame(overrides = {}) {
  const chat = [];
  const dropped = [];
  const game = {
    chat,
    dropped,
    ui: {
      addChatMessage: (text, kind = 'system') => chat.push({ text, kind }),
      updateHotbar: () => { game.hotbarUpdates = (game.hotbarUpdates ?? 0) + 1; },
      clearChat: () => { game.chatCleared = true; },
    },
    player: { position: { x: 10, y: 64, z: -5 }, gamemode: 'survival' },
    // A slot-backed store, like the real inventory, so `giveItems` can ask how much fits before inserting.
    inventory: slotInventory(),
    world: { setVoxel: () => {}, getOrCreateChunk: () => null, invalidateChunkCache: () => {} },
    weather: { setWeather: (t) => { game.weatherSet = t; } },
    entities: { spawnDroppedItem: (at, id, isBlock, count) => dropped.push({ at, id, isBlock, count }) },
    mobs: {},
    geminiAgent: { offlineMode: false, setOfflineMode: (v) => { game.geminiAgent.offlineMode = v; }, vendorLabel: 'Test', apiKey: 'k' },
    settings: { gamemode: 'survival', cheats: true },
    worldTime: 0,
    setGameMode: (m) => { game.gameModeSet = m; },
    ...overrides,
  };
  return game;
}

const lastChat = (game) => game.chat[game.chat.length - 1];
const texts = (game) => game.chat.map((c) => c.text);
const run = (game, line) => runCommand(buildCommandContext(game), line);

/**
 * An inventory that reports a fixed amount of room, without filling as it is asked.
 *
 * `giveItems` used to find the fitting count by bisection, so a capacity fake had to answer the same
 * question the same way every time. It now asks `countRoomFor` once, so what this models is a store with
 * `capacity` total room and nothing else.
 */
function capacityInventory(capacity) {
  const accepted = [];
  return {
    capacity,
    accepted,
    addItem(id, isBlock, count) {
      if (count > capacity) return false;
      accepted.length = 0;
      accepted.push({ id, isBlock, count });
      return true;
    },
  };
}

/**
 * A slot-backed inventory, shaped like the real one, for the dispatcher tests.
 *
 * `giveItems` decides its count from a non-mutating capacity query and then inserts once, so the store it
 * is handed has to be able to answer that question: hence real `hotbar`/`storage` arrays and a
 * `countRoomFor` that agree with `addItem` about the stack limit. `stored` is the flat view the existing
 * assertions read.
 */
function slotInventory({ slots = 36, limit = 64, stacks = [] } = {}) {
  const grid = new Array(slots).fill(null);
  for (let i = 0; i < stacks.length; i++) grid[i] = { ...stacks[i] };
  const room = (id, isBlock) => {
    let r = 0;
    for (const s of grid) if (s && s.id === id && s.isBlock === isBlock && s.count < limit) r += limit - s.count;
    return r + grid.filter((s) => !s).length * limit;
  };
  const inventory = {
    hotbar: grid,
    storage: [],
    get capacity() { return grid.length * limit; },
    set capacity(value) {
      // `capacity: 0` in a test means "no room at all": fill the slots so the query agrees.
      grid.fill(null);
      if (value === 0) for (let i = 0; i < grid.length; i++) grid[i] = { id: 'blocker', isBlock: true, count: limit };
    },
    get stored() { return grid.filter(Boolean).map((s) => ({ ...s })); },
    countRoomFor(id, isBlock) { return room(id, isBlock); },
    /** Fills what it can and reports whether the WHOLE request landed, like the real inventory. */
    addItem(id, isBlock, count) {
      // Track what was actually placed. `left` cannot be the whole story: with no room at all it starts and
      // ends at zero, which would read as "everything landed".
      let remaining = count;
      if (remaining > 0) {
        for (const s of grid) {
          if (remaining <= 0) break;
          if (s && s.id === id && s.isBlock === isBlock && s.count < limit) {
            const add = Math.min(limit - s.count, remaining);
            s.count += add; remaining -= add;
          }
        }
        for (let i = 0; i < grid.length && remaining > 0; i++) {
          if (grid[i]) continue;
          const n = Math.min(limit, remaining);
          grid[i] = { id, isBlock, count: n };
          remaining -= n;
        }
      }
      return remaining === 0;
    },
  };
  return inventory;
}

test('the dispatcher claims /give and fills the inventory', () => {
  const game = fakeGame();
  assert.equal(run(game, '/give @p diamond_sword'), true, 'the runner should claim /give');
  assert.deepEqual(game.inventory.stored, [{ id: 'diamond_sword', isBlock: false, count: 1 }],
    'one diamond sword, because the count defaults to 1');
  assert.equal(lastChat(game).text, 'Gave 1 [Diamond Sword] to @p', 'vanilla\'s confirmation line');
  assert.equal(lastChat(game).kind, 'system');
  assert.equal(game.hotbarUpdates, 1, 'the hotbar is repainted');
  assert.deepEqual(game.dropped, [], 'and nothing is dropped');
});

test('the dispatcher drops the overflow at the player, as an item entity', () => {
  // Five slots of one, so twelve stone cannot fit and the overflow has to be summoned.
  const game = fakeGame({ inventory: slotInventory({ slots: 5, limit: 1 }) });
  assert.equal(run(game, '/give @p stone 12'), true);
  const total = game.inventory.stored.reduce((n, s) => n + s.count, 0);
  assert.equal(total, 5, 'five fit into the five slots');
  assert.ok(game.inventory.stored.every((s) => s.id === BLOCKS.STONE && s.isBlock === true));
  assert.equal(game.dropped.length, 1, 'the rest is one entity');
  const drop = game.dropped[0];
  assert.deepEqual(drop, { at: { x: 10, y: 65, z: -5 }, id: BLOCKS.STONE, isBlock: true, count: 7 },
    'dropped one block above the player, as the block');
  assert.equal(total + drop.count, 12, 'conservation: what fit plus what dropped is the request');
  assert.ok(texts(game).some((t) => t.includes('Inventory full: 7 dropped on the ground')),
    'and the player is told: ' + JSON.stringify(texts(game)));
});

test('the dispatcher reports an unparseable /give without touching the inventory', () => {
  for (const [line, expected] of [
    ['/give', 'Not enough arguments.'],
    ['/give @p', 'Not enough arguments.'],
    ['/give @p not_a_thing', 'unknown item'],
    ['/give @a diamond 1', 'one player'],
    ['/give @p stone 0', 'between 1 and'],
    ['/give @p stone 99x', 'whole number'],
  ]) {
    const game = fakeGame();
    assert.equal(run(game, line), true, `${line} should be claimed by /give`);
    assert.deepEqual(game.inventory.stored, [], `${line} must not give anything`);
    assert.ok(texts(game).some((t) => t.includes(expected)),
      `${line} should report '${expected}', got ${JSON.stringify(texts(game))}`);
  }
});

test('a refused /give shows the usage line as well as the reason', () => {
  const game = fakeGame();
  // A near miss, so the suggestion path is exercised rather than the bare refusal.
  run(game, '/give @p diamon');
  assert.ok(texts(game).some((t) => t === 'Usage: /give <targets> <item> [<count>]'),
    'the usage line should follow the reason');
  // The reason carries suggestions, which is what makes it actionable.
  assert.ok(texts(game)[0].includes('Did you mean:'), 'the reason should suggest near misses');
  assert.ok(texts(game)[0].includes('diamond'), 'and name the real item');
  // A refusal with no near miss still shows the usage line, just without a suggestion.
  const far = fakeGame();
  run(far, '/give @p qqqzzz');
  assert.equal(far.chat[0].text.includes('Did you mean:'), false);
  assert.ok(texts(far).includes('Usage: /give <targets> <item> [<count>]'));
});

test('the dispatcher takes a namespaced id and a block name, and splits by the stack limit', () => {
  const game = fakeGame();
  run(game, '/give @s minecraft:ender_pearl 20');
  const total = game.inventory.stored.reduce((n, s) => n + s.count, 0);
  assert.equal(total, 20);
  // The limit is enforced by the inventory, not the command; what matters is that the id it was handed
  // is the item, not the string.
  assert.ok(game.inventory.stored.every((s) => s.id === 'ender_pearl' && s.isBlock === false));

  const blocks = fakeGame();
  run(blocks, '/give @p hay_bale 3');
  assert.deepEqual(blocks.inventory.stored, [{ id: BLOCKS.HAY_BLOCK, isBlock: true, count: 3 }],
    'the wiki spelling resolves to the block id');
});

test('creative places items with no space limit and never summons a drop', () => {
  // "If there is enough room in the player's inventory, OR THE PLAYER IS IN CREATIVE MODE, gives the
  // specified item(s)". Space does not gate creative, and creative never summons an item entity.
  const game = fakeGame({ inventory: slotInventory({ slots: 2, limit: 64 }) });
  game.player.gamemode = 'creative';
  run(game, '/give @p stone 100');
  assert.deepEqual(game.dropped, [], 'nothing is summoned onto the ground in creative');
  const held = game.inventory.stored.reduce((n, s) => n + (s.id === BLOCKS.STONE ? s.count : 0), 0);
  assert.equal(held, 100, 'the whole count is really there, not just reported: ' + JSON.stringify(game.inventory.stored));
  assert.ok(texts(game).some((t) => t.startsWith('Gave 100')), 'and the whole count is reported');
});

test('creative never claims to have given what it could not place', () => {
  // A full inventory in creative has nowhere to put anything. Reporting the requested count here would be
  // the original defect: a success line with no items behind it.
  const game = fakeGame({ inventory: slotInventory({ slots: 1, limit: 1, stacks: [{ id: BLOCKS.DIRT, isBlock: true, count: 1 }] }) });
  game.player.gamemode = 'creative';
  run(game, '/give @p stone 64');
  assert.deepEqual(game.dropped, [], 'and it is not summoned onto the ground instead');
  const held = game.inventory.stored.reduce((n, s) => n + (s.id === BLOCKS.STONE ? s.count : 0), 0);
  assert.equal(held, 0, 'nothing was placed, so nothing is reported');
  assert.ok(texts(game).includes('Gave 0 [Stone] to @p'),
    'the confirmation line reports what was placed: ' + JSON.stringify(texts(game)));
});

test('a missing inventory is reported rather than throwing', () => {
  const game = fakeGame({ inventory: null });
  assert.doesNotThrow(() => run(game, '/give @p stone 1'));
  assert.ok(texts(game).some((t) => t.includes('inventory is not available')),
    'the refusal should name what is missing: ' + JSON.stringify(texts(game)));
});

test('a missing entity manager still reports the give, and just cannot drop', () => {
  const game = fakeGame({ entities: null, inventory: slotInventory({ slots: 2, limit: 1 }) });
  assert.doesNotThrow(() => run(game, '/give @p stone 5'));
  assert.ok(texts(game).some((t) => t.startsWith('Gave 2')), 'the two that fit are reported: ' + JSON.stringify(texts(game)));
  assert.ok(texts(game).some((t) => t.includes('3 dropped')), 'and the three that could not be');
});

test('the dispatcher leaves commands it does not own alone', () => {
  // Returning false is what lets main.js fall through to its own manager-backed chain.
  const game = fakeGame();
  for (const line of ['/summon pig', '/save', '/load x', '/maps', '/redstone list', '/locate', '/show_mobs']) {
    assert.equal(run(game, line), false, `${line} should not be claimed by the runner`);
  }
  assert.deepEqual(game.chat, [], 'and should print nothing');
  // Nonsense and non-commands too.
  assert.equal(run(game, '/not_a_command'), false);
  assert.equal(run(game, 'hello'), false, 'a chat line without a slash is not a command');
  assert.equal(run(game, ''), false);
  assert.equal(run(game, '   '), false);
  assert.equal(runCommand(null, '/give @p stone'), false, 'no context is not a crash');
  assert.equal(runCommand(buildCommandContext(fakeGame()), 42), false, 'nor is a non-string line');
});

test('a command with no leading slash is not a command', () => {
  const game = fakeGame();
  assert.equal(run(game, 'give @p stone'), false);
  assert.deepEqual(game.chat, []);
});

// --- the other portable commands ----------------------------------------------------

test('/time set takes Java\'s markers and times, and refuses anything else', () => {
  // Commands/time: "/time set day ... is equivalent to 1000, and /time set night ... 13000"; noon 6000,
  // midnight 18000. This used to put "day" at 6000 and "night" at 18000 and refuse noon and midnight.
  for (const [marker, ticks] of [['day', 1000], ['noon', 6000], ['night', 13000], ['midnight', 18000], ['1234', 1234], ['2d', 48000], ['30s', 600]]) {
    const game = fakeGame();
    run(game, `/time set ${marker}`);
    assert.equal(game.worldTime, ticks, marker);
    assert.equal(lastChat(game).text, `Set the time to ${ticks % 24000}`);
  }
  const later = fakeGame({ worldTime: 1000 });
  run(later, '/time add 500');
  assert.equal(later.worldTime, 1500);
  const asked = fakeGame({ worldTime: 25000 });
  run(asked, '/time query daytime');
  assert.equal(lastChat(asked).text, 'The time is 1000');
  run(asked, '/time query day');
  assert.equal(lastChat(asked).text, 'The time is 1');

  for (const line of ['/time set dusk', '/time set', '/time']) {
    const game = fakeGame();
    run(game, line);
    assert.equal(game.worldTime, 0, `${line} must not move the clock`);
    assert.ok(texts(game).some((t) => t.startsWith('Usage: /time')),
      `${line} should explain itself, got ${JSON.stringify(texts(game))}`);
  }
});

test('/weather accepts the three vanilla arguments and nothing else', () => {
  for (const type of ['clear', 'rain', 'thunder']) {
    const game = fakeGame();
    run(game, `/weather ${type}`);
    assert.equal(game.weatherSet, type);
    assert.equal(lastChat(game).text, `Set weather to ${type}`);
  }
  const bare = fakeGame();
  run(bare, '/weather');
  assert.equal(bare.weatherSet, 'clear', 'a bare /weather is clear, as it was');

  const bad = fakeGame();
  run(bad, '/weather snow');
  assert.equal(bad.weatherSet, undefined, 'an unknown weather changes nothing');
  assert.equal(lastChat(bad).text, 'Usage: /weather <clear|rain|thunder>');

  const missing = fakeGame({ weather: null });
  run(missing, '/weather rain');
  assert.ok(texts(missing).some((t) => t.includes('weather system is not available')),
    'a missing weather system is reported, not thrown');
});

test('/gamemode takes the names and the numeric and single-letter forms', () => {
  for (const arg of ['creative', 'c', '1']) {
    const game = fakeGame();
    run(game, `/gamemode ${arg}`);
    assert.equal(game.gameModeSet, 'creative', arg);
    assert.equal(lastChat(game).text, 'Set game mode to Creative Mode');
  }
  for (const arg of ['survival', 's', '0']) {
    const game = fakeGame();
    run(game, `/gamemode ${arg}`);
    assert.equal(game.gameModeSet, 'survival', arg);
  }
  // Java's other two modes and their shorthands (gameModeRules.js).
  for (const [arg, mode] of [['adventure', 'adventure'], ['a', 'adventure'], ['2', 'adventure'], ['spectator', 'spectator'], ['sp', 'spectator'], ['3', 'spectator']]) {
    const game = fakeGame();
    run(game, `/gamemode ${arg}`);
    assert.equal(game.gameModeSet, mode, arg);
  }
  const bad = fakeGame();
  run(bad, '/gamemode hardcore');
  assert.equal(bad.gameModeSet, undefined);
  assert.equal(lastChat(bad).text, 'Usage: /gamemode <survival|creative|adventure|spectator>');
});

test('/setblock resolves the block through the shared vocabulary', () => {
  const placed = [];
  const game = fakeGame();
  game.world = {
    setVoxel: (x, y, z, id) => placed.push({ x, y, z, id }),
    getOrCreateChunk: () => null,
    invalidateChunkCache: () => {},
  };
  run(game, '/setblock 1 2 3 oak_planks');
  assert.deepEqual(placed, [{ x: 1, y: 2, z: 3, id: BLOCKS.OAK_PLANKS }]);
  assert.ok(lastChat(game).text.startsWith('Changed the block at 1, 2, 3 to'));

  // The wiki spelling works, which the old exact-uppercase match did not.
  const spelled = fakeGame();
  const placed2 = [];
  spelled.world = { setVoxel: (x, y, z, id) => placed2.push(id), getOrCreateChunk: () => null, invalidateChunkCache: () => {} };
  run(spelled, '/setblock 0 0 0 block_of_coal');
  assert.deepEqual(placed2, [BLOCKS.COAL_BLOCK]);

  // An item that is not a block is refused, with a message naming what it could not resolve.
  const wrong = fakeGame();
  run(wrong, '/setblock 0 0 0 diamond_sword');
  assert.ok(texts(wrong).some((t) => t.startsWith("Unknown block '")),
    'a non-block should be refused: ' + JSON.stringify(texts(wrong)));

  // And bad coordinates are a usage error rather than a NaN write.
  for (const line of ['/setblock 0 0', '/setblock a b c stone', '/setblock 0 0 0']) {
    const game = fakeGame();
    run(game, line);
    assert.ok(texts(game).some((t) => t === 'Usage: /setblock <x> <y> <z> <block>'),
      `${line} should show the usage`);
  }
});

test('/clearchat empties the chat window; /clear is Java\'s inventory clear', () => {
  const game = fakeGame();
  run(game, '/clearchat');
  assert.equal(game.chatCleared, true);
  const full = fakeGame();
  full.inventory.hotbar[0] = { id: 'diamond', isBlock: false, count: 5 };
  full.inventory.hotbar[1] = { id: 'stick', isBlock: false, count: 2 };
  run(full, '/clear @s diamond 3');
  assert.equal(full.inventory.hotbar[0].count, 2, 'maxCount takes only three');
  assert.equal(lastChat(full).text, 'Removed 3 item(s) from player Player');
  run(full, '/clear');
  assert.deepEqual(full.inventory.hotbar.filter(Boolean), [], 'no item argument clears everything');
  assert.equal(full.chatCleared, undefined, 'and the chat is left alone');
});

test('/help lists every command in the table', () => {
  const game = fakeGame();
  run(game, '/help');
  const lines = texts(game);
  // One line per table entry, apart from the three with their own longer explanation.
  const blurbed = new Set(['redstone', 'locate', 'show_mobs']);
  for (const command of COMMANDS) {
    if (blurbed.has(command.name)) continue;
    assert.ok(lines.some((l) => l.startsWith(`/${command.name} `) || l === `/${command.name}`),
      `/help should mention /${command.name}: ${JSON.stringify(lines)}`);
  }
  // The three blurbed ones are described too, just at more length.
  for (const name of blurbed) {
    assert.ok(lines.some((l) => l.startsWith(`/${name}`)), `/help should mention /${name}`);
  }
  assert.ok(lines.every((l) => typeof l === 'string' && l.length > 0), 'no empty help lines');
});

test('/offline toggles the agent and says which way it went', () => {
  const game = fakeGame();
  run(game, '/offline');
  assert.equal(game.geminiAgent.offlineMode, true);
  assert.ok(lastChat(game).text.includes('offline mode ON'));
  run(game, '/offline');
  assert.equal(game.geminiAgent.offlineMode, false);
  assert.ok(lastChat(game).text.includes('offline mode OFF'));

  const missing = fakeGame({ geminiAgent: null });
  run(missing, '/offline');
  assert.ok(texts(missing).some((t) => t.includes('World Agent is not available')),
    'a missing agent is reported, not thrown');
});

test('an unrecognised command is not claimed by the runner', () => {
  // The runner says "not mine"; main.js is what reports the unknown command, so that a command it does
  // own is not reported as unknown.
  const game = fakeGame();
  assert.equal(run(game, '/definitely_not_a_command'), false);
  assert.deepEqual(game.chat, []);
});

