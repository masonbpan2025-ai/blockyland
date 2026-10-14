// The command dispatcher, taken out of `main.js`.
//
// `handleCommand` was a 279-line `if/else if` chain reaching into fourteen of the game's fields, and it
// lived inside a 4,145-line file that cannot be imported without a DOM -- so no test could execute a
// command at all. That is why `/give` shipped with four defects that a single test would have caught:
// no `<targets>` argument, a default count of 64 instead of 1, name matching over the block registry
// only, and a full inventory dropped silently.
//
// The shape of the fix is a `CommandContext`: this module touches only the fields listed there, and the
// caller assembles them. A test assembles them from stubs; the game assembles them from its managers.
// Nothing here reads a global.
//
// The item vocabulary and the argument parsers stay in `commands.js`, because they are pure and have no
// context to speak of. This file is the part that acts.
import { resolveGameMode } from './gameModeRules.js';
import {
  COMMANDS, parseGive, giveItems, giveMessage, resolveItem, findCommand,
} from './commands.js';
import { allowsAgentTerminal } from './sessionSettings.js';
import { placePlayerOnSurface } from './worldSpawn.js';
import { runVanillaCommand, cmdTime, cmdClearInventory, parseTimeArgument } from './vanillaCommands.js';
import { runAdvancedCommand } from './advancedCommands.js';

/** The fields a command may touch, and where the game gets each one. Recorded so the surface is visible. */
export const COMMAND_CONTEXT_FIELDS = Object.freeze({
  ui: 'the chat window and the modals: addChatMessage, openMapModal, openAgentSettings, updateHotbar, updateStats',
  player: 'the player, for gamemode and position',
  inventory: 'the item container /give fills',
  world: 'the voxel world: getVoxel, setVoxel, getOrCreateChunk, structures',
  weather: 'setWeather',
  entities: 'spawnDroppedItem, for the /give overflow',
  mobs: 'the spawn methods /summon calls',
  geminiAgent: 'offlineMode, setOfflineMode, vendorLabel, apiKey',
  settings: 'gamemode and cheats, for the permission checks',
});

/**
 * Build the context the dispatcher runs against.
 *
 * Every field is optional. A command whose dependency is missing reports what is unavailable rather than
 * throwing, because a chat command is not a place to lose the frame -- and because a test that stubs only
 * what it needs is a better test.
 *
 * @param {object} game  the Game instance, or a stub with the same fields
 * @param {object} [options]
 * @param {object[]} [options.commands]  the table `/help` renders; defaults to `COMMANDS`
 * @returns {object} the context
 */
export function buildCommandContext(game, { commands = COMMANDS, Vector3 = null } = {}) {
  return {
    ui: game?.ui ?? null,
    player: game?.player ?? null,
    inventory: game?.inventory ?? null,
    world: game?.world ?? null,
    weather: game?.weather ?? null,
    entities: game?.entities ?? null,
    mobs: game?.mobs ?? null,
    geminiAgent: game?.geminiAgent ?? null,
    settings: game?.settings ?? (game?.player?.gamemode ? { gameMode: game.player.gamemode } : null),
    commands,
    Vector3,
    game,
    // `/time` and `/gamemode` are the game's own state, not a manager's, so they arrive as callbacks
    // rather than as `game.x` writes -- which is what lets a test pass a plain object.
    setWorldTime: (ticks) => { if (game) game.worldTime = ticks; },
    setGameMode: (mode) => {
      if (typeof game?.setGameMode === 'function') {
        game.setGameMode(mode);
      } else {
        if (game?.player) game.player.gamemode = mode;
        if (game?.settings) game.settings = { ...game.settings, gameMode: mode };
      }
    },
    setDifficulty: (difficulty) => {
      if (!game) return;
      game.difficulty = difficulty;
      if (game.settings) game.settings = { ...game.settings, difficulty };
      if (game.player) game.player.difficulty = difficulty;
    },
    placeOnSurface: (anchor) => (game?.world && game?.player ? placePlayerOnSurface(game, anchor) : null),
    // A command reports failure through an error message; /execute store success and /return read it per context.
    say(text, kind = 'system') {
      if (kind === 'error' && this) this.failed = true;
      game?.ui?.addChatMessage?.(text, kind);
    },
    // Run one more command line, from a function or /execute: in a context of its own (another executor or
    // position), at function permission. The Game's own commands (/summon, /teleport, ...) take the context's
    // position through runManagerCommand.
    dispatch(line, sub = null) {
      const target = sub ?? this;
      return runCommand(target, line) || Boolean(game?.runManagerCommand?.(line, target));
    },
    recipeIds: () => game?.recipeIds?.() ?? new Set(),
  };
}

/** A missing dependency, reported once and readably. */
function unavailable(name) {
  return `${name} is not available in this session.`;
}

/**
 * True when the player has the permission level a command needs.
 *
 * Delegates to `allowsAgentTerminal` rather than restating the rule. The two gates are the same permission --
 * "may this player do cheat things in this world" -- and this one used to read `settings.gamemode` while the
 * setting is `settings.gameMode`, so the Creative half never matched: in Creative with cheats explicitly off,
 * the Agent Terminal opened and `/give` was refused. Sharing the function means a terminal that opens and a
 * command that runs can no longer disagree.
 */
function allowed(context, command) {
  const settings = context.settings ?? {};
  if (command.level === 0) return true;
  if (context.player?.gamemode === 'creative') return true;
  return allowsAgentTerminal(settings);
}

/**
 * The refusal message for a command this player may not use, or null when it is allowed.
 *
 * Exported because the gate has to run for the commands `runCommand` does NOT own as well. `/summon`,
 * `/locate`, `/redstone` and `/show_mobs` are dispatched by the game's own switch, so marking them `gate: true`
 * and trusting the check inside `runCommand` silently did nothing for them -- `runCommand` returns false
 * before reaching its gate, and the switch ran them anyway. `handleCommand` calls this once for every line,
 * ahead of both dispatchers, so being handled in one place or the other cannot change whether it is gated.
 *
 * @param {object} settings  the game's settings
 * @param {string} root      the command with its leading slash, e.g. `/give`
 * @param {object} [player]  optional player instance to check creative gamemode
 * @returns {string|null}
 */
export function permissionRefusal(settings, root, player = null) {
  const command = findCommand(String(root ?? '').replace(/^\//, ''));
  if (!command) return null;
  if (command.gate !== true) return null;
  if (command.level === 0) return null;
  if (player?.gamemode === 'creative') return null;
  if (settings && allowsAgentTerminal(settings)) return null;
  return `You do not have permission to use ${root}. It needs Creative mode or cheats.`;
}

// --- the individual commands -------------------------------------------------------

function cmdGive(context, parts) {
  // Vanilla: `/give <targets> <item> [<count>]`, count defaulting to 1. See `commands.js` for the
  // parser, which is where the four original defects are pinned.
  const parsed = parseGive(parts.slice(1));
  if (!parsed.ok) {
    context.say(parsed.reason, 'error');
    context.say(parsed.usage, 'error');
    return true;
  }
  const inventory = context.inventory;
  if (!inventory?.addItem) {
    context.say(unavailable('The inventory'), 'error');
    return true;
  }
  const { item, count, target } = parsed;
  const p = context.player?.position ?? { x: 0, y: 0, z: 0 };
  const result = giveItems({
    inventory,
    // "summons the rest items as an item entity dropped by the player" -- at the player, since that is
    // where a dropped item the player can pick straight back up belongs.
    drop: (id, isBlock, n) => {
      const entities = context.entities;
      if (!entities?.spawnDroppedItem) return;
      const at = context.Vector3
        ? new context.Vector3(p.x, p.y + 1, p.z)
        : { x: p.x, y: p.y + 1, z: p.z };
      entities.spawnDroppedItem(at, id, isBlock, n);
    },
    gamemode: context.player?.gamemode,
    item,
    count,
  });
  context.ui?.updateHotbar?.();
  context.say(giveMessage(item.display, result.given, target));
  if (result.dropped > 0) {
    context.say(`Inventory full: ${result.dropped} dropped on the ground.`);
  }
  return true;
}

function cmdHelp(context) {
  const say = context.say;
  // The four with longer explanations than the table's `help` field.
  say('/redstone demo <elevator|flyer> - Build a working redstone example; sneak-right-click components to rotate', 'help');
  say('/redstone game <name> - Build a playable redstone machine; /redstone list to see them', 'help');
  say('/locate [structure] [id] - Show the nearest generated structure and how far it is', 'help');
  say('/teleport <x> <y> <z> - Move to coordinates (~ is relative); /teleport <structure> goes to the nearest one, e.g. /teleport swamp_hut', 'help');
  say('/show_mobs - What mobs exist, what the spawner is doing, and why you may see none (Creative)', 'help');
  say('Available Commands:', 'help');
  say('Press [C] for the AI World Agent terminal (build, weather, summon mobs!)', 'help');
  // Rendered from the command table so the help text and the parser cannot disagree about a command's
  // name or its arguments. The old hand-written list had already drifted: it advertised
  // `/give <item_name> [amount]`, which was neither vanilla's syntax nor the one the dispatcher took.
  const blurbed = new Set(['redstone', 'locate', 'show_mobs', 'teleport']);
  for (const command of context.commands) {
    if (blurbed.has(command.name)) continue;
    const args = command.args ? ` ${command.args}` : '';
    say(`/${command.name}${args} - ${command.help}`, 'help');
  }
  return true;
}

function cmdWeather(context, parts) {
  const type = parts[1] ? parts[1].toLowerCase() : 'clear';
  if (type !== 'rain' && type !== 'clear' && type !== 'thunder') {
    context.say('Usage: /weather <clear|rain|thunder>', 'error');
    return true;
  }
  if (!context.weather?.setWeather) {
    context.say(unavailable('The weather system'), 'error');
    return true;
  }
  // Java's <duration> is a time argument: ticks by default, or with an s / d suffix (Commands/weather), "between
  // 0 and 1000000". It used to be read as seconds, so `/weather clear 24000` (the page's one-day example) lasted
  // twenty days.
  const duration=parts[2]===undefined?null:parseTimeArgument(parts[2]);
  if(parts.length>3||(duration!==null&&(!Number.isFinite(duration)||duration<=0||duration>1000000))){
    context.say('Usage: /weather <clear|rain|thunder> [<duration>: ticks, or with s / d]', 'error');return true;
  }
  if(duration===null)context.weather.setWeather(type);
  else context.weather.setWeather(type,duration/20);
  context.say(`Set weather to ${type}`);
  return true;
}

function cmdGamemode(context, parts) {
  // Java: survival, creative, adventure, spectator (and the 0-3 / s c a sp shorthands) -- gameModeRules.js.
  const mode = resolveGameMode(parts[1]);
  if (!mode) {
    context.say('Usage: /gamemode <survival|creative|adventure|spectator>', 'error');
    return true;
  }
  context.setGameMode?.(mode);
  context.say(`Set game mode to ${mode[0].toUpperCase()}${mode.slice(1)} Mode`);
  return true;
}

function cmdSetblock(context, parts) {
  const parseCoord = (str, origin = 0) => {
    if (typeof str !== 'string') return NaN;
    if (str.startsWith('~')) {
      const offset = str.length > 1 ? parseFloat(str.slice(1)) : 0;
      return Number.isFinite(offset) ? Math.floor(origin + offset) : NaN;
    }
    return parseInt(str, 10);
  };
  const p = context.player?.position ?? { x: 0, y: 0, z: 0 };
  const sx = parseCoord(parts[1], p.x);
  const sy = parseCoord(parts[2], p.y);
  const sz = parseCoord(parts[3], p.z);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz) || !parts[4]) {
    context.say('Usage: /setblock <x> <y> <z> <block>', 'error');
    return true;
  }
  // Resolved through the same item vocabulary `/give` uses, so `oak_planks`, `OAK_PLANKS` and
  // `minecraft:oak_planks` all name the same block instead of only the exact registry key.
  const resolved = resolveItem(parts.slice(4).join('_'));
  if (!resolved.ok || !resolved.isBlock) {
    context.say(`Unknown block '${parts.slice(4).join(' ')}'`, 'error');
    return true;
  }
  const world = context.world;
  if (!world?.setVoxel) {
    context.say(unavailable('The world'), 'error');
    return true;
  }
  world.setVoxel(sx, sy, sz, resolved.id);
  const chunk = world.getOrCreateChunk?.(Math.floor(sx / 16), Math.floor(sz / 16));
  if (chunk) context.game?.rebuildChunkMesh?.(chunk);
  world.invalidateChunkCache?.();
  context.say(`Changed the block at ${sx}, ${sy}, ${sz} to ${resolved.key.toLowerCase().replace(/_/g, '')}`);
  return true;
}

function cmdClear(context) {
  // The chat window: /clearchat. Java's /clear (the inventory) is vanillaCommands.cmdClearInventory.
  context.ui?.clearChat?.();
  return true;
}

function cmdOffline(context) {
  const agent = context.geminiAgent;
  if (!agent?.setOfflineMode) {
    context.say(unavailable('The World Agent'), 'error');
    return true;
  }
  const nowOffline = !agent.offlineMode;
  agent.setOfflineMode(nowOffline);
  context.say(
    nowOffline
      ? `World Agent offline mode ON (${agent.vendorLabel} key kept). Type /offline again to re-enable the API.`
      : `World Agent offline mode OFF.${agent.apiKey ? '' : ' No API key is saved yet, so the terminal still runs offline.'}`,
  );
  context.ui?.openAgentSettings?.();
  return true;
}

/**
 * The command names this module implements, and the ones it deliberately leaves to the game.
 *
 * `/redstone`, `/locate` and `/show_mobs` need a manager the context does not model; `/save`, `/load` and
 * `/maps` need the map loader; `/summon` needs the mob manager's spawn methods, one per mob. Both lists
 * are asserted against the two switches, so a command cannot end up dispatched by neither or by both.
 */
export const HANDLED_HERE = Object.freeze([
  'give', 'help', 'time', 'weather', 'gamemode', 'setblock', 'clear', 'clearchat', 'offline',
  'kill', 'effect', 'enchant', 'experience', 'difficulty', 'defaultgamemode', 'gamerule', 'fill', 'clone', 'say', 'me',
  'msg', 'list', 'tellraw', 'title', 'seed', 'setworldspawn', 'spawnpoint', 'random', 'damage',
  // Aliases with their own case: /xp is /experience; /tell and /w are /msg.
  'ride', 'rotate', 'spreadplayers',
  'xp', 'tell', 'w',
  // advancedCommands.js (round 4).
  'scoreboard', 'trigger', 'tag', 'team', 'teammsg', 'tm', 'execute', 'function', 'schedule', 'return', 'reload', 'datapack',
  'data', 'attribute', 'bossbar', 'worldborder', 'tick', 'forceload', 'fillbiome', 'item', 'loot', 'place', 'particle',
  'playsound', 'stopsound', 'recipe', 'advancement', 'spectate', 'kick', 'debug', 'jfr',
]);
export const HANDLED_ELSEWHERE = Object.freeze([
  'redstone', 'locate', 'show_mobs', 'save', 'load', 'maps', 'summon', 'teleport',
]);

// --- the dispatcher -----------------------------------------------------------------

/**
 * Run one command line.
 *
 * @param {object} context  from `buildCommandContext`
 * @param {string} line     the raw command, with or without its leading slash
 * @returns {boolean} true when a command was recognised and run
 */
export function runCommand(context, line) {
  if (!context || typeof line !== 'string') return false;
  const trimmed = line.trim();
  if (!trimmed.startsWith('/')) return false;
  const parts = trimmed.split(/\s+/);
  const root = parts[0].toLowerCase();

  // The permission gate vanilla applies to every non-zero-level command, in one place rather than
  // repeated per command. A command that declares a level above the player's is refused with the reason.
  const command = context.commands.find((c) => c.name === root.slice(1) || c.aliases?.includes(root.slice(1)));
  // `level: 0` commands are ungated in vanilla, and every command here that acts on the world was already
  // reachable without cheats, so the gate refuses only what vanilla would.
  // A function or /execute runs at its own permission level (functions: 2), so `elevated` skips the gate.
  if (command && command.level > 0 && command.gate === true && !context.elevated && !allowed(context, command)) {
    context.say(`You do not have permission to use ${root}. It needs Creative mode or cheats.`, 'error');
    return true;
  }

  switch (root) {
    case '/give': return cmdGive(context, parts);
    case '/help': return cmdHelp(context);
    case '/time': return cmdTime(context, parts);
    case '/weather': return cmdWeather(context, parts);
    case '/gamemode': return cmdGamemode(context, parts);
    case '/setblock': return cmdSetblock(context, parts);
    case '/clear': return cmdClearInventory(context, parts);
    case '/clearchat': return cmdClear(context);
    case '/offline': return cmdOffline(context);
    default:
      // The Java commands vanillaCommands.js implements; anything else is not ours, and the caller's own chain
      // handles it (and if nothing does, it reports that).
      return runVanillaCommand(context, root, parts) || runAdvancedCommand(context, root, parts);
  }
}
