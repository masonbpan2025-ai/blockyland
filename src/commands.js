// Command parsing and the item resolution `/give` needs, kept out of `main.js` so it can be tested.
//
// `main.js` holds the command dispatcher inline, which means every command's argument parsing is only
// reachable through a 4,000-line file -- and `/give`, the one command every player uses first, had four
// defects that nothing could see:
//
//   1. It took NO TARGET. Vanilla's syntax is `/give <targets> <item> [<count>]`, and this read
//      `/give <item> [count]`, so the documented `/give @p diamond_sword` treated `@p` as an item name
//      and failed with "Unknown item '@p'".
//   2. The count defaulted to 64. Vanilla defaults to 1, and the wiki says so twice: "If not specified,
//      defaults to 1", and the `/give @p pig_spawn_egg` example. Asking for one diamond sword gave 64.
//   3. Names were matched by brute force over the block registry only, so a block resolved by exact
//      lowercase match against an UPPERCASE key while an item had to be spelled exactly as its key. The
//      `minecraft:` namespace vanilla requires was not accepted, and neither was a display name.
//   4. A full inventory was silently dropped. Vanilla gives what fits and drops the rest as an item
//      entity; the old path called `addItem` and discarded its `false`.
//
// What is deliberately NOT modelled: item data components (`[enchantments={...}]`). They are a parsing
// language of their own, and the wiki's own examples are the only specification this game would have for
// them. The bracket form is parsed and then refused with a reason rather than silently treated as part of
// the item name.
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from './blocks.js';
import { buildGameBlockIndex, normaliseBlockName, NAME_ALIASES } from './blockNameMatch.js';

/**
 * The commands this game implements, with the arguments vanilla gives them.
 *
 * Recorded here rather than only in the `/help` text so the two cannot disagree: `/help` renders this
 * table. `level` is vanilla's permission level (2 for `/give`, which is a cheat), and `args` is the
 * usage string.
 *
 * `gate: true` marks a command as one the CHEATS policy governs, and it is what makes the permission check
 * in `commandRunner.runCommand` fire at all -- without it that check was dead code, and every command ran in
 * every mode, so `/give` handed out items in an ordinary Survival world.
 *
 * `level` alone is not enough, deliberately: three level-2 commands below are this engine's own and have to
 * stay reachable, so "vanilla calls it level 2" and "this game treats it as a cheat" are separate facts and
 * both are written down.
 */
export const COMMANDS = [
  { name: 'give', args: '<targets> <item> [<count>]', level: 2, gate: true, help: 'Give an item to a player' },
  { name: 'summon', args: '<entity>', level: 2, gate: true, help: 'Spawn a mob' },
  { name: 'setblock', args: '<x> <y> <z> <block>', level: 2, gate: true, help: 'Place a block' },
  { name: 'time', args: 'set <day|night>', level: 2, gate: true, help: 'Change world time' },
  { name: 'weather', args: '<clear|rain|thunder>', level: 2, gate: true, help: 'Change the weather' },
  { name: 'gamemode', args: '<creative|survival>', level: 2, gate: true, help: 'Switch game mode' },
  { name: 'locate', args: '[structure] [id]', level: 2, gate: true, help: 'Find the nearest generated structure' },
  { name: 'show_mobs', args: '', level: 2, gate: true, help: 'Why you may see no mobs (Creative)' },
  // NOT gated, though vanilla calls them level 2. These manage SAVE FILES rather than the world, and `/maps`
  // is now the only route to the map loader -- the pause-menu button that used to open it was replaced by the
  // Cheats toggle. Gating them would strand a Survival player with no way to load a saved map at all.
  { name: 'save', args: '[name]', level: 2, help: 'Save the map to this computer' },
  { name: 'load', args: '<name>', level: 2, help: 'Load a saved map' },
  { name: 'maps', args: '', level: 2, help: 'Open the map manager', aliases: ['saves'] },
  { name: 'clear', args: '', level: 0, help: 'Clear the chat window' },
  { name: 'help', args: '', level: 0, help: 'List the commands' },
  // Not gated: this toggles the World Agent between the API and its offline presets. It is a setting for the
  // player's own key rather than a way to change the world, and gating it would lock someone out of it.
  { name: 'offline', args: '', level: 2, help: 'Toggle the World Agent offline' },
  { name: 'redstone', args: '<demo|game|list> [...]', level: 2, gate: true, help: 'Build a redstone example' },
];

/** Look a command up by name or alias, without the leading slash. */
export function findCommand(name) {
  const wanted = String(name ?? '').replace(/^\//, '').toLowerCase();
  if (!wanted) return null;
  return COMMANDS.find((c) => c.name === wanted || c.aliases?.includes(wanted)) ?? null;
}

// --- item resolution -------------------------------------------------------------

/** Lowercased item key -> canonical key. Built once; the registry is static. */
let itemIndex = null;
function getItemIndex() {
  if (itemIndex) return itemIndex;
  itemIndex = new Map();
  for (const key of Object.keys(ITEMS)) itemIndex.set(key.toLowerCase(), key);
  return itemIndex;
}

/** Lowercased block registry key -> key, and every alias the block-name vocabulary knows. */
let blockIndex = null;
function getBlockIndex() {
  if (blockIndex) return blockIndex;
  blockIndex = new Map();
  for (const key of Object.keys(BLOCKS)) {
    if (typeof BLOCKS[key] !== 'number') continue;
    blockIndex.set(key.toLowerCase(), key);
  }
  // The wiki's spellings, which differ from this game's registry keys in the ways
  // `blockNameMatch.js` documents: "Block of Coal" for COAL_BLOCK, "Grass Block" for GRASS,
  // "Hay Bale" for HAY_BLOCK, and the state-collapsed door and bed names.
  //
  // These WIN over a plain registry key of the same lowercased name, because the wiki's name is the
  // one the player read. This game registers both `TARGET` and `TARGET_BLOCK`, and vanilla's "Target"
  // is the latter -- a direct key match would have handed over the former.
  for (const [foldedKey, owners] of buildGameBlockIndex()) {
    for (const owner of owners) {
      if (!blockIndex.has(foldedKey) || blockIndex.get(foldedKey) !== foldedKey) {
        blockIndex.set(foldedKey, owner);
      }
    }
  }
  // An explicit alias is authoritative even when it collides, which is the `target` case above.
  for (const [foldedKey] of Object.entries(NAME_ALIASES)) {
    const alias = NAME_ALIASES[foldedKey];
    if (typeof BLOCKS[alias] === 'number') blockIndex.set(foldedKey, alias);
  }
  return blockIndex;
}

/**
 * Strip the `minecraft:` namespace and any trailing data-component block.
 *
 * `minecraft:diamond_sword[enchantments={...}]` -> `diamond_sword`, with the component text returned so
 * the caller can refuse it by name rather than treat it as part of the id.
 */
export function splitItemArgument(raw) {
  let text = String(raw ?? '').trim();
  let components = null;
  const open = text.indexOf('[');
  if (open !== -1) {
    if (!text.endsWith(']')) return { id: text, components: null, malformed: true };
    components = text.slice(open + 1, -1);
    text = text.slice(0, open);
  }
  const colon = text.lastIndexOf(':');
  if (colon !== -1) text = text.slice(colon + 1);
  return { id: text, components, malformed: false };
}

/**
 * Resolve an item name to something the inventory can hold.
 *
 * Accepts, in vanilla's own order of preference: the namespaced id (`minecraft:stone`), this game's item
 * key (`diamond_sword`), a block registry key in any case (`OAK_PLANKS`, `oak_planks`), the wiki's
 * spelling of a block ("Block of Coal", "Hay Bale"), and a display name ("Diamond Sword"). Items win over
 * blocks, because every block that has an item form is registered in `ITEMS` and that form is what the
 * player gets when they mine it.
 *
 * @param {string} raw
 * @returns {{ok: true, id: string|number, isBlock: boolean, key: string, display: string}
 *          | {ok: false, reason: string}}
 */
export function resolveItem(raw) {
  const { id, components, malformed } = splitItemArgument(raw);
  if (malformed) return { ok: false, reason: `malformed item argument '${raw}'` };
  if (!id) return { ok: false, reason: 'no item given' };
  if (components !== null) {
    return { ok: false, reason: `item data components are not supported here (got '[${components}]')` };
  }

  const lower = id.toLowerCase();

  // 1. An item key, exactly as registered -- but only if it really is one. `BLOCKS` contains the key
  //    `TARGET`, which is not in `ITEMS`, and returning it unchecked produced an inventory slot holding
  //    the literal string "target" that nothing could render or stack.
  //
  //    720 of the registry's items are block ITEM FORMS: `ITEMS.stone` does not exist, but
  //    `ITEMS.jack_o_lantern` is `{ isBlock: true, blockId: 657 }`. A block item is given as its block,
  //    because that is the shape every other path in the game produces for a mined block, and the shape
  //    placement, stacking and the block-item map all agree on.
  const itemKey = getItemIndex().get(lower);
  if (itemKey && Object.prototype.hasOwnProperty.call(ITEMS, itemKey)) {
    const def = ITEMS[itemKey];
    if (def?.isBlock && typeof def.blockId === 'number') {
      return {
        ok: true,
        id: def.blockId,
        isBlock: true,
        key: itemKey,
        display: def.name ?? BLOCK_DEFS[def.blockId]?.name ?? itemKey,
      };
    }
    return { ok: true, id: itemKey, isBlock: false, key: itemKey, display: def?.name ?? itemKey };
  }

  // 2. A block, by registry key or by any name the block vocabulary knows.
  const blockKey = getBlockIndex().get(lower) ?? getBlockIndex().get(normaliseBlockName(id));
  if (blockKey && typeof BLOCKS[blockKey] === 'number') {
    const blockId = BLOCKS[blockKey];
    return {
      ok: true,
      id: blockId,
      isBlock: true,
      key: blockKey,
      display: BLOCK_DEFS[blockId]?.name ?? blockKey,
    };
  }

  // 3. A display name, which is what a player reads off the item and then types. The same block-item
  //    rule applies: "Jack o'Lantern" is an item whose form is the block.
  for (const [key, def] of Object.entries(ITEMS)) {
    if (def?.name && def.name.toLowerCase() === lower) {
      if (def.isBlock && typeof def.blockId === 'number') {
        return { ok: true, id: def.blockId, isBlock: true, key, display: def.name };
      }
      return { ok: true, id: key, isBlock: false, key, display: def.name };
    }
  }
  for (const [key, value] of Object.entries(BLOCKS)) {
    if (typeof value !== 'number') continue;
    const name = BLOCK_DEFS[value]?.name;
    if (name && name.toLowerCase() === lower) {
      return { ok: true, id: value, isBlock: true, key, display: name };
    }
  }

  return { ok: false, reason: `unknown item '${id}'` };
}

/**
 * A few near-miss suggestions for an unresolvable name, so a refusal is actionable.
 *
 * Vanilla's parser does this in the command suggestions; a chat box has no suggestion widget, so the
 * closest names are printed instead.
 */
export function suggestItems(raw, limit = 5) {
  const wanted = normaliseBlockName(splitItemArgument(raw).id);
  if (!wanted) return [];
  const scored = [];
  for (const key of Object.keys(ITEMS)) {
    const folded = normaliseBlockName(key);
    if (folded.includes(wanted) || wanted.includes(folded)) scored.push([folded.length, key]);
  }
  for (const [key, value] of Object.entries(BLOCKS)) {
    if (typeof value !== 'number') continue;
    const folded = normaliseBlockName(key);
    if (folded.includes(wanted) || wanted.includes(folded)) scored.push([folded.length, key.toLowerCase()]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return [...new Set(scored.map(([, key]) => key))].slice(0, limit);
}

// --- target selectors --------------------------------------------------------------

/** The selectors vanilla defines, and whether this single-player game can resolve them. */
export const TARGET_SELECTORS = {
  '@s': { resolves: true, meaning: 'the player running the command' },
  '@p': { resolves: true, meaning: 'the nearest player' },
  // These name sets that only exist with more than one player in the world.
  '@a': { resolves: false, meaning: 'all players' },
  '@r': { resolves: false, meaning: 'a random player' },
  '@e': { resolves: false, meaning: 'all entities' },
};

/**
 * Resolve vanilla's `<targets>` argument.
 *
 * This game has exactly one player, so `@s` and `@p` resolve and a literal name resolves to that player;
 * `@a` and `@r` are refused with the reason rather than quietly giving the caller the items anyway, which
 * is what would make `/give @a diamond 1` look like it worked.
 *
 * @param {string} raw
 * @returns {{ok: true, selector: string} | {ok: false, reason: string}}
 */
export function resolveTargets(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, reason: 'no target given' };
  const lower = text.toLowerCase();
  const selector = TARGET_SELECTORS[lower];
  if (selector) {
    if (!selector.resolves) {
      return { ok: false, reason: `${lower} names ${selector.meaning}, and this world has one player` };
    }
    return { ok: true, selector: lower };
  }
  // A literal player name. There is one player here and the UI does not carry a name, so any name the
  // caller types is that player -- which is what "the player" means in a single-player world.
  if (/^[A-Za-z0-9_]{1,16}$/.test(text)) return { ok: true, selector: text };
  return { ok: false, reason: `invalid target selector '${raw}'` };
}

// --- the /give argument parser -------------------------------------------------------

/** Vanilla's `<count>` range: "between 1 and 2147483647 (inclusive)". */
export const GIVE_COUNT = { min: 1, max: 2147483647, default: 1 };

/**
 * Parse `/give <targets> <item> [<count>]`.
 *
 * Split from the execution so every failure is a value a test can assert on, and so `main.js` has one
 * call rather than the four-branch nest it had.
 *
 * @param {string[]} args  the arguments after the command name
 * @returns {{ok: true, target: string, item: object, count: number}
 *          | {ok: false, reason: string, usage: string}}
 */
export function parseGive(args = []) {
  const usage = 'Usage: /give <targets> <item> [<count>]';
  const [targetArg, itemArg, countArg] = args;
  if (!targetArg || !itemArg) {
    return { ok: false, reason: 'Not enough arguments.', usage };
  }

  const target = resolveTargets(targetArg);
  if (!target.ok) return { ok: false, reason: target.reason, usage };

  const item = resolveItem(itemArg);
  if (!item.ok) {
    const suggestions = suggestItems(itemArg);
    const hint = suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : '';
    return { ok: false, reason: `${item.reason}.${hint}`, usage };
  }

  let count = GIVE_COUNT.default;
  if (countArg !== undefined && countArg !== '') {
    // `Number` rather than `parseInt`, because `parseInt('64abc')` is 64 and vanilla rejects that.
    count = Number(countArg);
    if (!Number.isInteger(count)) {
      return { ok: false, reason: `${countArg} is not a whole number.`, usage };
    }
    if (count < GIVE_COUNT.min || count > GIVE_COUNT.max) {
      return { ok: false, reason: `count must be between ${GIVE_COUNT.min} and ${GIVE_COUNT.max}.`, usage };
    }
  }

  return { ok: true, target: target.selector, item, count };
}

// --- execution ----------------------------------------------------------------------

/**
 * Give a parsed item to the player, dropping what does not fit.
 *
 * Vanilla: "If there is enough room in the player's inventory, or the player is in creative mode, gives
 * the specified item(s). If there is not enough room... gives the specified item(s) until the inventory
 * is full, and summons the rest items as an item entity dropped by the player."
 *
 * @param {object} deps
 * @param {{addItem: Function}} deps.inventory
 * @param {(id: string|number, isBlock: boolean, count: number) => void} deps.drop  spawn the remainder
 * @param {string} [deps.gamemode]
 * @param {{id: string|number, isBlock: boolean}} deps.item
 * @param {number} deps.count
 * @returns {{given: number, dropped: number}}
 */
export function giveItems({ inventory, drop, gamemode, item, count }) {
  const creative = gamemode === 'creative';
  let remaining = count;

  // Creative fills the inventory and needs nothing beyond it; vanilla still drops the overflow, but this
  // game's creative inventory has no such thing as "full", so the whole count lands.
  const added = inventory?.addItem?.(item.id, item.isBlock, remaining);
  if (added) return { given: remaining, dropped: 0 };

  // `addItem` is all-or-nothing: it refuses rather than partially filling. So ask for what fits by
  // bisection, then drop the rest. Bisection rather than adding one at a time because a count can be
  // 2,147,483,647, and one-at-a-time would be a hang rather than a slow command.
  let lo = 0;
  let hi = remaining;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (inventory?.addItem?.(item.id, item.isBlock, mid)) lo = mid;
    else hi = mid - 1;
  }
  const given = lo;
  const overflow = remaining - given;
  if (overflow > 0 && !creative) {
    // One entity per stack, as vanilla splits it, so the drop obeys the stack limit.
    let left = overflow;
    const limit = stackLimitFor(item.id) || 64;
    while (left > 0) {
      const n = Math.min(limit, left);
      drop?.(item.id, item.isBlock, n);
      left -= n;
    }
  } else if (overflow > 0) {
    // Creative: nothing to drop into, so the count is reported as given.
    return { given: count, dropped: 0 };
  }
  return { given, dropped: overflow };
}

/**
 * Vanilla's confirmation line: "Gave <count> [<item>] to <target>".
 *
 * The item is in square brackets because that is how vanilla prints it, and the count is the number
 * actually handed over rather than the number asked for.
 */
export function giveMessage(display, count, target) {
  return `Gave ${count} [${display}] to ${target}`;
}

