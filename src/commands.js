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

/** The Java commands vanillaCommands.js implements, as rows of the table below. */
export const VANILLA_COMMAND_ROWS = [
  { name: 'kill', args: '[<targets>]', level: 2, gate: true, help: 'Kill entities (the player, or @e[type=...])' },
  { name: 'effect', args: 'give <targets> <effect> [<seconds>|infinite] [<amplifier>] | clear [<targets>] [<effect>]', level: 2, gate: true, help: 'Add or remove status effects' },
  { name: 'enchant', args: '<targets> <enchantment> [<level>]', level: 2, gate: true, help: 'Enchant the held item' },
  { name: 'experience', args: '(add|set|query) <targets> [<amount>] [levels|points]', level: 2, gate: true, aliases: ['xp'], help: 'Add, set or query experience' },
  { name: 'difficulty', args: '[peaceful|easy|normal|hard]', level: 2, gate: true, help: 'Set or show the difficulty' },
  { name: 'defaultgamemode', args: '<mode>', level: 2, gate: true, help: 'Set the default game mode' },
  { name: 'gamerule', args: '<rule> [<value>]', level: 2, gate: true, help: 'Set or query a game rule' },
  { name: 'fill', args: '<from> <to> <block> [destroy|hollow|keep|outline|replace [<filter>]]', level: 2, gate: true, help: 'Fill a region with a block' },
  { name: 'clone', args: '<begin> <end> <destination> [replace|masked] [force|move|normal]', level: 2, gate: true, help: 'Copy blocks from one region to another' },
  { name: 'say', args: '<message>', level: 2, gate: true, help: 'Send a message in chat' },
  { name: 'me', args: '<action>', level: 0, help: 'Describe an action in chat' },
  { name: 'msg', args: '<targets> <message>', level: 0, aliases: ['tell', 'w'], help: 'Send a private message' },
  { name: 'list', args: '', level: 0, help: 'List the players' },
  { name: 'tellraw', args: '<targets> <message>', level: 2, gate: true, help: 'Show a JSON text message' },
  { name: 'title', args: '<targets> (clear|reset|title|subtitle|actionbar|times) ...', level: 2, gate: true, help: 'Show a title on screen' },
  { name: 'seed', args: '', level: 0, help: 'Show the world seed' },
  { name: 'setworldspawn', args: '[<pos>] [<angle>]', level: 2, gate: true, help: 'Set the world spawn' },
  { name: 'spawnpoint', args: '[<targets>] [<pos>] [<angle>]', level: 2, gate: true, help: 'Set the player\'s spawn point' },
  { name: 'random', args: '(value|roll) <range>', level: 0, help: 'Draw a random number' },
  { name: 'damage', args: '<target> <amount> [<damageType>]', level: 2, gate: true, help: 'Damage entities' },
  { name: 'ride', args: '<target> (mount <vehicle>|dismount)', level: 2, gate: true, help: 'Mount or dismount a vehicle' },
  { name: 'rotate', args: '<target> <yaw> <pitch>', level: 2, gate: true, help: 'Turn the player' },
  { name: 'spreadplayers', args: '<x> <z> <spreadDistance> <maxRange> <respectTeams> <targets>', level: 2, gate: true, help: 'Move the player to a random surface spot' },
];

/** The Java commands advancedCommands.js implements (round 4), with Java's OP levels (Commands page). */
export const ADVANCED_COMMAND_ROWS = [
  { name: 'scoreboard', args: '(objectives|players) ...', level: 2, gate: true, help: 'Manage scoreboard objectives and scores' },
  { name: 'tag', args: '<targets> (add|remove|list) [<name>]', level: 2, gate: true, help: 'Manage entity tags' },
  { name: 'team', args: '(add|remove|empty|join|leave|list|modify) ...', level: 2, gate: true, help: 'Manage teams' },
  { name: 'teammsg', args: '<message>', level: 0, aliases: ['tm'], help: 'Message your team' },
  { name: 'trigger', args: '<objective> [add|set <value>]', level: 0, help: 'Set a trigger objective' },
  { name: 'execute', args: '... run <command>', level: 2, gate: true, help: 'Run a command as, at, if, unless or store' },
  { name: 'function', args: '<name>', level: 2, gate: true, help: 'Run a data-pack function' },
  { name: 'schedule', args: '(function <function> <time> [append|replace]|clear <function>)', level: 2, gate: true, help: 'Run a function later' },
  { name: 'return', args: '(<value>|fail|run <command>)', level: 2, gate: true, help: 'Return from a function' },
  { name: 'reload', args: '', level: 2, gate: true, help: 'Reload the data packs' },
  { name: 'datapack', args: '(list|enable|disable) ...', level: 2, gate: true, help: 'Manage data packs' },
  { name: 'data', args: '(get|merge|modify|remove) (entity|block|storage) ...', level: 2, gate: true, help: 'Read and change entity, block and storage data' },
  { name: 'attribute', args: '<target> <attribute> (get|base|modifier) ...', level: 2, gate: true, help: 'Query or change an attribute' },
  { name: 'bossbar', args: '(add|remove|list|get|set) ...', level: 2, gate: true, help: 'Manage custom boss bars' },
  { name: 'worldborder', args: '(add|center|damage|get|set|warning) ...', level: 2, gate: true, help: 'Manage the world border' },
  { name: 'tick', args: '(query|rate|freeze|unfreeze|step|sprint) ...', level: 3, gate: true, help: 'Control the tick rate' },
  { name: 'forceload', args: '(add|remove|query) ...', level: 2, gate: true, help: 'Keep chunks loaded' },
  { name: 'fillbiome', args: '<from> <to> <biome> [replace <filter>]', level: 2, gate: true, help: 'Change the biome of a region' },
  { name: 'item', args: '(replace|modify) (entity|block) ...', level: 2, gate: true, help: 'Replace or modify items in slots' },
  { name: 'loot', args: '(give|insert|spawn|replace) ... (loot|kill|mine) ...', level: 2, gate: true, help: 'Roll loot into the world or an inventory' },
  { name: 'place', args: '(feature|jigsaw|structure|template) ...', level: 2, gate: true, help: 'Place a feature or structure' },
  { name: 'particle', args: '<name> [<pos>] ...', level: 2, gate: true, help: 'Show particles' },
  { name: 'playsound', args: '<sound> [<source>] [<targets>] ...', level: 2, gate: true, help: 'Play a sound' },
  { name: 'stopsound', args: '<targets> [<source>] [<sound>]', level: 2, gate: true, help: 'Stop sounds' },
  { name: 'recipe', args: '(give|take) <targets> (<recipe>|*)', level: 2, gate: true, help: 'Give or take recipes' },
  { name: 'advancement', args: '(grant|revoke) <targets> ...', level: 2, gate: true, help: 'Grant or revoke advancements' },
  { name: 'spectate', args: '[<target>] [<player>]', level: 2, gate: true, help: 'Spectate an entity (Spectator mode)' },
  { name: 'kick', args: '<targets> [<reason>]', level: 3, gate: true, help: 'Kick a player' },
  { name: 'debug', args: '(start|stop|function <name>)', level: 3, gate: true, help: 'Profile the game' },
  { name: 'jfr', args: '(start|stop)', level: 4, gate: true, help: 'Record a performance profile' },
];

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
  { name: 'time', args: 'set (<time>|day|noon|night|midnight) | add <time> | query (daytime|gametime|day)', level: 2, gate: true, help: 'Change or query the world time' },
  { name: 'weather', args: '<clear|rain|thunder> [seconds]', level: 2, gate: true, help: 'Change weather (rain becomes snow in cold biomes)' },
  { name: 'gamemode', args: '<survival|creative|adventure|spectator>', level: 2, gate: true, help: 'Switch game mode' },
  { name: 'locate', args: '[structure] [id] | cave [radius]', level: 2, gate: true, help: 'Find structures or list all cave entrances within a radius (default 256 blocks)' },
  { name: 'teleport', args: '<x> <y> <z> | <structure> | cave [radius]', level: 2, gate: true, aliases: ['tp'], help: 'Teleport to coordinates, a structure, or the nearest safe cave entrance' },
  { name: 'show_mobs', args: '', level: 2, gate: true, help: 'Why you may see no mobs (Creative)' },
  // NOT gated, though vanilla calls them level 2. These manage SAVE FILES rather than the world, and `/maps`
  // is now the only route to the map loader -- the pause-menu button that used to open it was replaced by the
  // Cheats toggle. Gating them would strand a Survival player with no way to load a saved map at all.
  { name: 'save', args: '[name]', level: 2, help: 'Save the map to this computer' },
  { name: 'load', args: '<name>', level: 2, help: 'Load a saved map' },
  { name: 'maps', args: '', level: 2, help: 'Open the map manager', aliases: ['saves'] },
  // Java's /clear empties the player's inventory (Commands/clear); the chat window is cleared by /clearchat.
  { name: 'clear', args: '[<targets>] [<item>] [<maxCount>]', level: 2, gate: true, help: 'Clear items from the inventory' },
  { name: 'clearchat', args: '', level: 0, help: 'Clear the chat window' },
  { name: 'help', args: '', level: 0, help: 'List the commands' },
  // Not gated: this toggles the World Agent between the API and its offline presets. It is a setting for the
  // player's own key rather than a way to change the world, and gating it would lock someone out of it.
  { name: 'offline', args: '', level: 2, help: 'Toggle the World Agent offline' },
  { name: 'redstone', args: '<demo|game|list> [...]', level: 2, gate: true, help: 'Build a redstone example' },
  // Java's commands added by the systems parity audit (vanillaCommands.js runs them).
  ...VANILLA_COMMAND_ROWS,
  ...ADVANCED_COMMAND_ROWS,
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
 *
 * The namespace is VALIDATED rather than discarded. This used to slice at the last colon whatever came
 * before it, so `other_namespace:stone` handed over a vanilla stone: a typo or a resource location from
 * another pack silently resolved to the wrong item, which is the opposite of what a refusal is for.
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
  const colon = text.indexOf(':');
  if (colon !== -1) {
    const namespace = text.slice(0, colon);
    const path = text.slice(colon + 1);
    // Only `minecraft` names the vanilla registry this game implements. An empty path (`minecraft:`) is
    // not an id either, and a path containing another colon is not a valid resource location.
    if (namespace.toLowerCase() !== 'minecraft' || !path || path.includes(':')) {
      return { id: raw, components, namespace, unknownNamespace: true, malformed: false };
    }
    text = path;
  }
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
  const { id, components, malformed, unknownNamespace, namespace } = splitItemArgument(raw);
  if (unknownNamespace) {
    return { ok: false, reason: `unknown item namespace '${namespace}' in '${raw}' (this game provides minecraft: only)` };
  }
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
 * Vanilla's execution limit: "larger than 100 stack worth of items".
 *
 * From the `/give` history, 21w10a (Java 1.17): "`/give` can now only give up to 100 stacks worth of items
 * at a time". The wiki records the over-limit case as currently *succeeding* in vanilla because of
 * MC-302537, while stating that it "should fail"; this build refuses, which is the documented contract.
 * The limit is a stack count, not an item count, so it scales with what the item actually stacks to:
 * 6,400 ordinary items, 1,600 ender pearls, or 100 unstackable swords.
 */
export const GIVE_STACK_LIMIT = 100;

/** The largest `<count>` vanilla will hand over in one command, for this item. */
export function giveCountLimitFor(id) {
  return (stackLimitFor(id) || 1) * GIVE_STACK_LIMIT;
}

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
  const [targetArg, itemArg, countArg, ...extra] = args;
  if (!targetArg || !itemArg) {
    return { ok: false, reason: 'Not enough arguments.', usage };
  }
  // `<count>` is the last argument, so anything after it is a parse error in vanilla's Brigadier. This
  // function used to destructure the first three and drop the rest, which made `/give @s stone 1 extra`
  // succeed as if it were well formed.
  if (extra.length > 0) {
    return { ok: false, reason: `unexpected argument${extra.length > 1 ? 's' : ''} after the count: ${extra.join(' ')}`, usage };
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
    // Validate the WHOLE token against vanilla's Brigadier integer grammar before converting.
    //
    // Mojang's `StringReader.readInt()` scans a run of digits, a leading minus and a decimal point, then
    // `Integer.parseInt` on the result -- so a decimal point is *scanned* but never *parses*. `Number()` is
    // far more permissive than that: it accepted `1e2` as 100, `0x10` as 16, `+1` as 1 and `1.0` as 1, none
    // of which vanilla's argument tree produces. The old comment here claimed `Number` was the strict choice
    // because `parseInt('64abc')` is 64; it is strict about *trailing* junk and permissive about everything
    // else. Only plain decimal digits, with at most one leading minus, are a count.
    if (!/^-?[0-9]+$/.test(countArg)) {
      return { ok: false, reason: `${countArg} is not a whole number.`, usage };
    }
    count = Number(countArg);
    if (!Number.isInteger(count)) {
      return { ok: false, reason: `${countArg} is not a whole number.`, usage };
    }
    if (count < GIVE_COUNT.min || count > GIVE_COUNT.max) {
      return { ok: false, reason: `count must be between ${GIVE_COUNT.min} and ${GIVE_COUNT.max}.`, usage };
    }
    // The parser range and the delivery limit are different things: 2,147,483,647 is a valid integer but not
    // a valid amount to hand over. Refusing here is also what keeps the request bounded.
    const limit = giveCountLimitFor(item.id);
    if (count > limit) {
      return {
        ok: false,
        reason: `count ${count} exceeds ${limit} (100 stacks of ${stackLimitFor(item.id) || 1}) for ${item.display}.`,
        usage,
      };
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
 * The count has to be decided BEFORE the insert, because `Inventory.addItem` is not a dry run: it fills
 * every partial stack and every empty slot it can and only reports `false` when the whole request did not
 * land. Treating that `false` as "nothing happened" and probing repeatedly -- which this function did, by
 * bisection -- duplicated everything the failed probes had already inserted. A 63-stone stack in an
 * otherwise full inventory gave one stone AND dropped ten for a request of ten; 101 swords on an empty
 * inventory left 36 in the inventory AND dropped 101.
 *
 * So: ask the inventory how much would fit, place exactly that in one call, and drop the remainder.
 * `countRoomFor` is the non-mutating query; the delta measured across the insert is authoritative for what
 * was really placed, so a bundle or an unmodelled path cannot make the report lie.
 *
 * @param {object} deps
 * @param {{addItem: Function, countRoomFor?: Function}} deps.inventory
 * @param {(id: string|number, isBlock: boolean, count: number) => void} deps.drop  spawn the remainder
 * @param {string} [deps.gamemode]
 * @param {{id: string|number, isBlock: boolean}} deps.item
 * @param {number} deps.count
 * @returns {{given: number, dropped: number}}
 */
export function giveItems({ inventory, drop, gamemode, item, count }) {
  const creative = gamemode === 'creative';
  const requested = Math.max(0, count);
  if (requested === 0) return { given: 0, dropped: 0 };

  // No inventory to fill: the request cannot be delivered, and creative has nothing to drop into.
  if (typeof inventory?.addItem !== 'function') {
    return { given: 0, dropped: creative ? 0 : requested };
  }
  // A full inventory model exposes its slots and can say how much would fit, which is what the count has to
  // be decided from. A minimal stand-in that only implements `addItem` cannot answer that, so its return
  // value is the only available signal; that keeps the documented "missing inventory" behaviour working.
  const measurable = Boolean(inventory.hotbar || inventory.storage) && typeof inventory.countRoomFor === 'function';

  // Creative ignores inventory space: "If there is enough room in the player's inventory, OR THE PLAYER IS
  // IN CREATIVE MODE, gives the specified item(s)". This game's creative inventories have no "full" state
  // for placement, so the whole count is placed and nothing is summoned onto the ground.
  const toPlace = creative ? requested : Math.min(requested, roomFor(inventory, item, requested, measurable));

  const before = heldCount(inventory, item.id);
  const accepted = inventory.addItem(item.id, item.isBlock, toPlace);
  const delta = heldCount(inventory, item.id) - before;
  // What was actually placed, measured rather than assumed. `addItem` can place part of a request and still
  // report `false`, so the delta is the only trustworthy answer when the slots are visible; a creative give
  // into a genuinely full inventory places nothing, and must not claim otherwise.
  const placed = measurable ? (accepted ? toPlace : delta) : (accepted ? toPlace : 0);
  const given = Math.max(0, Math.min(placed, requested));
  const overflow = requested - given;

  if (overflow > 0 && !creative) {
    // One entity per stack, as vanilla splits it, so the drop obeys the stack limit.
    let left = overflow;
    const limit = stackLimitFor(item.id) || 64;
    while (left > 0) {
      const n = Math.min(limit, left);
      drop?.(item.id, item.isBlock, n);
      left -= n;
    }
  }
  // Creative has nowhere to drop into, so nothing is summoned onto the ground whatever did not fit.
  return { given, dropped: overflow };
}

/** How much of the item the inventory would accept right now, or the whole request if it cannot say. */
function roomFor(inventory, item, count, measurable) {
  if (!measurable) return count;
  try {
    return inventory.countRoomFor(item.id, item.isBlock, count);
  } catch {
    // A capacity query that throws must not turn a give into a loss; fall back to the plain insert.
    return count;
  }
}

/** How much of one item the inventory holds, across every compartment `addItem` fills. */
function heldCount(inventory, id) {
  return [...(inventory?.hotbar ?? []), ...(inventory?.storage ?? [])]
    .reduce((n, slot) => n + (slot && slot.id === id ? slot.count : 0), 0);
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

