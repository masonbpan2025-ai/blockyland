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
import {
  COMMANDS, parseGive, giveItems, giveMessage, resolveItem, findCommand,
} from './commands.js';
import { allowsAgentTerminal } from './sessionSettings.js';

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
    settings: game?.settings ?? null,
    commands,
    Vector3,
    game,
    // `/time` and `/gamemode` are the game's own state, not a manager's, so they arrive as callbacks
    // rather than as `game.x` writes -- which is what lets a test pass a plain object.
    setWorldTime: (ticks) => { if (game) game.worldTime = ticks; },
    setGameMode: (mode) => game?.setGameMode?.(mode),
    say: (text, kind = 'system') => game?.ui?.addChatMessage?.(text, kind),
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
 * @returns {string|null}
 */
export function permissionRefusal(settings, root) {
  const command = findCommand(String(root ?? '').replace(/^\//, ''));
  if (!command) return null;
  if (command.gate !== true) return null;
  if (command.level === 0) return null;
  if (allowsAgentTerminal(settings)) return null;
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
  say('/show_mobs - What mobs exist, what the spawner is doing, and why you may see none (Creative)', 'help');
  say('Available Commands:', 'help');
  say('Press [C] for the AI World Agent terminal (build, weather, summon mobs!)', 'help');
  // Rendered from the command table so the help text and the parser cannot disagree about a command's
  // name or its arguments. The old hand-written list had already drifted: it advertised
  // `/give <item_name> [amount]`, which was neither vanilla's syntax nor the one the dispatcher took.
  const blurbed = new Set(['redstone', 'locate', 'show_mobs']);
  for (const command of context.commands) {
    if (blurbed.has(command.name)) continue;
    const args = command.args ? ` ${command.args}` : '';
    say(`/${command.name}${args} - ${command.help}`, 'help');
  }
  return true;
}

function cmdTime(context, parts) {
  const say = context.say;
  if (parts[1] !== 'set') {
    say('Usage: /time set <day|night>', 'error');
    return true;
  }
  if (parts[2] === 'day') {
    context.setWorldTime?.(6000);
    context.say('Set the time to 6000 (Day)');
  } else if (parts[2] === 'night') {
    context.setWorldTime?.(18000);
    context.say('Set the time to 18000 (Night)');
  } else {
    context.say('Usage: /time set <day|night>', 'error');
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
  context.weather.setWeather(type);
  context.say(`Set weather to ${type}`);
  return true;
}

function cmdGamemode(context, parts) {
  const mode = parts[1] ? parts[1].toLowerCase() : '';
  if (mode === 'creative' || mode === 'c' || mode === '1') {
    context.setGameMode?.('creative');
    context.say('Set game mode to Creative Mode');
  } else if (mode === 'survival' || mode === 's' || mode === '0') {
    context.setGameMode?.('survival');
    context.say('Set game mode to Survival Mode');
  } else {
    context.say('Usage: /gamemode <creative|survival>', 'error');
  }
  return true;
}

function cmdSetblock(context, parts) {
  const [sx, sy, sz] = [parts[1], parts[2], parts[3]].map((v) => parseInt(v, 10));
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
  if (chunk) context.game.rebuildChunkMesh?.(chunk);
  world.invalidateChunkCache?.();
  context.say(`Changed the block at ${sx}, ${sy}, ${sz} to ${resolved.key.toLowerCase().replace(/_/g, '')}`);
  return true;
}

function cmdClear(context) {
  // The chat window rather than the inventory, which is this game's `/clear`.
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
  'give', 'help', 'time', 'weather', 'gamemode', 'setblock', 'clear', 'offline',
]);
export const HANDLED_ELSEWHERE = Object.freeze([
  'redstone', 'locate', 'show_mobs', 'save', 'load', 'maps', 'summon',
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
  if (command && command.level > 0 && command.gate === true && !allowed(context, command)) {
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
    case '/clear': return cmdClear(context);
    case '/offline': return cmdOffline(context);
    default:
      // Not ours. The caller's own chain handles the rest, and if nothing does, it reports that.
      return false;
  }
}
