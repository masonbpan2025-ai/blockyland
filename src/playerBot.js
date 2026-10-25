import * as THREE from 'three';
import AStar from './vendor/mineflayer-pathfinder/astar.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { harvestsNothing, breakTimeSeconds } from './miningRules.js';
import { baseBlockDrop } from './blockDrops.js';
import { BotSurvival, SURVIVAL_ACTIONS, validateSurvivalAction, itemId } from './playerBotSurvival.js';
import { buildCommandContext, runCommand, permissionRefusal } from './commandRunner.js';
import { cooldownSeconds } from './attackCooldown.js';
import { modeRules } from './gameModeRules.js';

const key = p => `${p.x},${p.y},${p.z}`;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const cell = (x, y, z, cost = 1, dig = []) => ({ x, y, z, cost, dig, hash: `${x},${y},${z}` });
let dropSources = null;
/** Blocks (other than `blockId` itself) whose ordinary drop is the block `blockId`: grass block for dirt, stone for cobblestone. */
export function dropSourcesOf(blockId) {
  if (!dropSources) {
    dropSources = new Map();
    for (const source of new Set(Object.values(BLOCKS))) {
      const drop = baseBlockDrop(source, () => 0.5);
      // Never a farm's tilled soil or a path someone laid.
      if (!drop?.isBlock || drop.id === source || [BLOCKS.FARMLAND, BLOCKS.FARMLAND_MOIST, BLOCKS.DIRT_PATH].includes(source)) continue;
      if (!dropSources.has(drop.id)) dropSources.set(drop.id, []);
      dropSources.get(drop.id).push(source);
    }
  }
  return dropSources.get(blockId) ?? [];
}

/** The bot's own controls, which are not game commands and must never reach the game dispatcher. */
const BOT_CONTROL = /^\/(?:stop|cancel|status)(?:\s|$)/i;

// Mineflayer-style controls and goals over the browser game's existing player.
// Navigation uses PrismarineJS's actual A* implementation; physics and harvesting
// remain the game's responsibility, including collision, effects and durability.
export function parsePlayerCommand(prompt) {
  const text = String(prompt).trim().toLowerCase().replace(/^\/(?:bot|player)\s+/, '').replace(/^(?:please\s+|can you\s+|could you\s+)/, '').replace(/[.!]$/, '');
  if (/^\/?(?:stop|cancel)(?:\s+(?:bot|player|mining|moving|following|attacking))?$/.test(text)) return { type: 'stop' };
  if (/^\/?(?:bot status|player bot status)$/.test(text)) return { type: 'status' };
  if (/^(?:test|check)\s+(?:bot\s+)?movement$/.test(text)) return { type: 'test', test: 'movement' };
  if (/^(?:jump|make (?:the )?player jump)$/.test(text)) return { type: 'jump' };
  const activate=text.match(/^(?:activate|toggle|press)\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if(activate)return{type:'activate',position:activate.slice(1).map(Number)};

  // Explicit or prefixed game command (e.g. /give, /setblock, /time, /weather, /gamemode, /summon, /help, /clear, etc.)
  const cmdMatch = text.match(/^(?:run\s+|execute\s+)?(?:command\s+)?(\/[a-z_]+(?:\s+.*)?)$/i) ||
                   text.match(/^(?:run\s+|execute\s+)?command\s+([a-z_]+(?:\s+.*)?)$/i) ||
                   text.match(/^(give\s+(?:@[pares](?:\[[^\]]*\])?|\w+)\s+[\w:]+(?:\[.*\])?(?:\s+\d+)?|setblock\s+.*|time\s+set.*|weather\s+.*|gamemode\s+.*|summon\s+.*|locate\s+.*|show_mobs(?:\s+.*)?|help(?:\s+.*)?|clear(?:\s+.*)?)$/i);
  if (cmdMatch) {
    let cmdStr = cmdMatch[1].trim();
    if (!cmdStr.startsWith('/')) cmdStr = '/' + cmdStr;
    return { type: 'command', command: cmdStr };
  }

  let action = text.match(/^(craft|eat|drink)\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)(?:\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+))?$/);
  if (action) return { type: action[1] === 'drink' ? 'eat' : action[1], item: action[3].trim().replace(/\s+/g, '_'), count: Number(action[2] || 1), position: action[4] ? [Number(action[4]), Number(action[5]), Number(action[6])] : null };
  let tillMatch = text.match(/^till(?:\s+(?:dirt|grass|soil))?(?:\s+at)?\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (tillMatch) return { type: 'till', position: [Number(tillMatch[1]), Number(tillMatch[2]), Number(tillMatch[3])] };
  let brewMatch = text.match(/^brew\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)(?:\s+into\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?))?\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (brewMatch) return { type: 'brew', count: Number(brewMatch[1] || 1), item: brewMatch[2].trim().replace(/\s+/g, '_'), bottleCount: Number(brewMatch[3] || 3), bottle: (brewMatch[4] || 'water_bottle').trim().replace(/\s+/g, '_'), position: [Number(brewMatch[5]), Number(brewMatch[6]), Number(brewMatch[7])] };
  // `smith <template> on <gear> with <material> at x y z`, every name as its item id with spaces as underscores:
  // `smith netherite upgrade on diamond_chestplate with netherite_ingot at 1 64 1`.
  let smithMatch = text.match(/^smith\s+(.+?)\s+on\s+(.+?)\s+with\s+(.+?)\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (smithMatch) return { type: 'smith', template: smithMatch[1].trim().replace(/\s+/g, '_'), base: smithMatch[2].trim().replace(/\s+/g, '_'), addition: smithMatch[3].trim().replace(/\s+/g, '_'), position: [Number(smithMatch[4]), Number(smithMatch[5]), Number(smithMatch[6])] };
  let anvilMatch = text.match(/^anvil\s+(.+?)(?:\s+with\s+(.+?))?(?:\s+(?:as|rename)\s+(.+?))?\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (anvilMatch) return { type: 'anvil', left: anvilMatch[1].trim().replace(/\s+/g, '_'), right: anvilMatch[2] ? anvilMatch[2].trim().replace(/\s+/g, '_') : null, customName: anvilMatch[3] ? anvilMatch[3].trim() : '', position: [Number(anvilMatch[4]), Number(anvilMatch[5]), Number(anvilMatch[6])] };
  let enchantMatch = text.match(/^enchant\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:\s+(?:slot\s+)?([012]))?\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (enchantMatch) return { type: 'enchant', item: enchantMatch[1].trim().replace(/\s+/g, '_'), slot: enchantMatch[2] !== undefined ? Number(enchantMatch[2]) : 2, position: [Number(enchantMatch[3]), Number(enchantMatch[4]), Number(enchantMatch[5])] };
  let tradeMatch = text.match(/^trade\s+(?:(\d+)\s+)?(?:(?:a\s+|an\s+|the\s+)?(.+?)\s+)?with\s+(?:a\s+|an\s+|the\s+)?(.+)$/);
  if (tradeMatch) return { type: 'trade', count: Number(tradeMatch[1] || 1), item: tradeMatch[2] ? tradeMatch[2].trim().replace(/\s+/g, '_') : null, mob: tradeMatch[3].trim().replace(/\s+/g, '_') };
  let useMatch = text.match(/^use\s+(?:a\s+|an\s+|the\s+)?(.+?)\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (useMatch) return { type: 'use', item: useMatch[1].trim().replace(/\s+/g, '_'), position: [Number(useMatch[2]), Number(useMatch[3]), Number(useMatch[4])] };
  let feedMatch = text.match(/^(?:feed|give)\s+(?:a\s+|an\s+|the\s+)?(.+?)\s+to\s+(?:a\s+|an\s+|the\s+)?(.+)$/);
  if (feedMatch) return { type: 'feed', item: feedMatch[1].trim().replace(/\s+/g, '_'), mob: feedMatch[2].trim().replace(/\s+/g, '_') };
  let m = text.match(/^(?:place|plant)\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'place', item: m[2].trim().replace(/\s+/g, '_'), count: Number(m[1] || 1), position: [Number(m[3]), Number(m[4]), Number(m[5])] };
  m = text.match(/^(?:cook|smelt)\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)\s+with\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'cook', count: Number(m[1] || 1), item: m[2].trim().replace(/\s+/g, '_'), fuelCount: Number(m[3] || 1), fuel: m[4].trim().replace(/\s+/g, '_'), position: [Number(m[5]), Number(m[6]), Number(m[7])] };
  m = text.match(/^sleep(?:\s+(?:in\s+(?:the\s+|a\s+)?bed\s+at|at))?\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'sleep', position: [Number(m[1]), Number(m[2]), Number(m[3])] };
  m = text.match(/^(?:(?:go|walk|move|navigate)(?:\s+(?:me|the player))?\s+to|goto)\s+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (m) return { type: 'goto', position: m.slice(1).map(Number) };
  m = text.match(/^(mine|dig|collect|harvest|gather|test mining)\s+(?:(\d+)\s+|some\s+|a\s+|an\s+)?(.+?)(?:\s+for me)?$/);
  if (m) return { type: m[1] === 'test mining' ? 'test' : 'mine', test: 'mining', block: m[3].replace(/\s+ores$/, ' ore').replace(/\s+blocks$/, ''), count: Number(m[2] || (m[1] === 'test mining' ? 1 : 3)) };
  // Another player in a shared world: `fight player`, `fight player Ann with crits`, `attack player 5 hits with sprint hits`.
  m = text.match(/^(?:fight|attack|kill|hit)\s+(?:the\s+|a\s+|another\s+)?player(?:\s+(?!with\b)(?!\d+\s+hits?\b)([^\s].*?))?(?:\s+(\d+)\s+hits?)?(?:\s+(?:with|using)\s+(crits?|critical hits?|sprint(?:\s+hits?)?|w-?taps?|plain hits?))?$/);
  if (m) return { type: 'pvp', player: m[1] ? m[1].trim() : null, hits: Number(m[2] || 5), style: /^crit/.test(m[3] || '') ? 'crit' : /^(sprint|w)/.test(m[3] || '') ? 'sprint' : 'plain' };
  m = text.match(/^(follow|attack|kill|look at)\s+(?:the\s+|a\s+|an\s+)?(.+)$/);
  if (m) return { type: m[1] === 'kill' ? 'attack' : m[1] === 'look at' ? 'look' : m[1], mob: m[2].replace(/\s+/g, '_') };
  m = text.match(/^(?:equip|hold|select)\s+(?:a\s+|an\s+|the\s+)?(.+)$/);
  if (m) return { type: 'equip', item: m[1].replace(/\s+/g, '_') };
  m = text.match(/^(?:store|deposit)\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)\s+(?:in|into|at)\s+(?:the\s+)?(?:chest\s+)?(?:at\s+)?(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'store', count: Number(m[1] || 1), item: m[2].trim().replace(/\s+/g, '_'), position: [Number(m[3]), Number(m[4]), Number(m[5])] };
  m = text.match(/^withdraw\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)\s+(?:from|at)\s+(?:the\s+)?(?:chest\s+)?(?:at\s+)?(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'withdraw', count: Number(m[1] || 1), item: m[2].trim().replace(/\s+/g, '_'), position: [Number(m[3]), Number(m[4]), Number(m[5])] };
  m = text.match(/^open(?:\s+(?:the\s+)?(?:chest|container))?\s+(?:at\s+)?(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'open', position: [Number(m[1]), Number(m[2]), Number(m[3])] };
  m = text.match(/^build\s+(?:a\s+|an\s+|the\s+)?(.+?)\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'build', schematic: m[1].trim().replace(/\s+/g, '_'), position: [Number(m[2]), Number(m[3]), Number(m[4])] };
  m = text.match(/^wire\s+(?:(?:a\s+|an\s+|the\s+)?(.+?)\s+)?from\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)\s+to\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (m) return { type: 'wire', item: (m[1] || 'redstone').trim().replace(/\s+/g, '_'), from: [Number(m[2]), Number(m[3]), Number(m[4])], to: [Number(m[5]), Number(m[6]), Number(m[7])] };
  m = text.match(/^(?:pillar(?:\s+up)?|jump\s+and\s+place)\s+(?:(\d+)\s+)?(?:blocks?(?:\s+of)?\s+)?(?:a\s+|an\s+|the\s+)?(.+)$/);
  if (m) return { type: 'pillar', count: Number(m[1] || 1), item: m[2].trim().replace(/\s+/g, '_') };
  m = text.match(/^bridge(?:\s+(\d+))?(?:\s+blocks?)?(?:\s+(forward|north|south|east|west))?(?:\s+(?:with\s+|using\s+)?(?:a\s+|an\s+|the\s+)?(.+?))?$/);
  if (m) return { type: 'bridge', count: Number(m[1] || 1), direction: m[2] || 'forward', item: (m[3] || 'cobblestone').trim().replace(/\s+/g, '_') };
  m = text.match(/^(?:raise\s+shield|block(?:\s+with\s+shield)?|shield)(?:\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:s(?:ec(?:onds?)?)?)?)?$/);
  if (m) return { type: 'shield', duration: Number(m[1] || 1.5) };
  m = text.match(/^shoot(?:\s+(?:bow|arrow))?\s+(?:at\s+)?(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (m) return { type: 'shoot', position: [Number(m[1]), Number(m[2]), Number(m[3])] };
  m = text.match(/^shoot(?:\s+(?:bow|arrow))?\s+(?:at\s+)?(?:the\s+|a\s+|an\s+)?(.+)$/);
  if (m) return { type: 'shoot', mob: m[1].trim().replace(/\s+/g, '_') };
  m = text.match(/^acquire\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+)$/);
  if (m) return { type: 'acquire', count: Number(m[1] || 1), item: m[2].trim().replace(/\s+/g, '_') };
  return null;
}

export function validatePlayerCommand(command) {
  if (typeof command === 'string') command = parsePlayerCommand(command);
  // The bot's own controls, in their slashed spelling. `parsePlayerCommand` matches `/stop` as a control
  // but sends `/status` down the game-command path, and `/stop`/`/status` typed as a command action would
  // otherwise reach the game dispatcher, which has no such command. They are normalised to their own types
  // here because this is the one place every entry point passes through.
  if (command?.type === 'command' && BOT_CONTROL.test(String(command.command ?? '').trim())) {
    const control = String(command.command).trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase();
    command = { type: control === 'cancel' ? 'stop' : control };
  }
  if (!command || !['mine','goto','jump','equip','follow','attack','look','feed','test','stop','status','command','pillar','bridge','shield','shoot','acquire','pvp',...SURVIVAL_ACTIONS].includes(command.type)) throw new Error('Unknown player command. Try "mine some iron ore", "go to 10 64 10", or "test movement".');
  if (command.type === 'command') {
    if (typeof command.command !== 'string' || !command.command.trim()) throw new Error('Command action needs a command string.');
    const cmdStr = command.command.trim();
    return { ...command, command: cmdStr.startsWith('/') ? cmdStr : '/' + cmdStr };
  }
  validateSurvivalAction(command);
  if (command.type === 'goto' && (!Array.isArray(command.position) || command.position.length !== 3 || command.position.some(v => !Number.isFinite(v) || Math.abs(v) > 30000000))) throw new Error('Go to needs three finite world coordinates.');
  if (command.type === 'test' && !['movement','mining'].includes(command.test)) throw new Error('Supported live tests: movement and mining <block>.');
  if (command.type === 'mine' || command.type === 'test' && command.test === 'mining') {
    if (typeof command.block !== 'string' || !command.block.trim() || command.block.length > 80) throw new Error('Mining needs a block name.');
    if (!Number.isInteger(command.count ?? 3) || (command.count ?? 3) < 1 || (command.count ?? 3) > 64) throw new Error('Mine between 1 and 64 blocks at a time.');
  }
  if (['follow','attack','look','equip'].includes(command.type) && (typeof command[command.type === 'equip' ? 'item' : 'mob'] !== 'string' || !command[command.type === 'equip' ? 'item' : 'mob'].trim())) throw new Error('Specify an item or creature.');
  if (command.type === 'feed' && (!command.item || !command.mob)) throw new Error('Specify an item and creature to feed.');
  if (command.type === 'pillar') {
    if (!Number.isInteger(command.count ?? 1) || (command.count ?? 1) < 1 || (command.count ?? 1) > 64) throw new Error('Pillar height must be between 1 and 64.');
    itemId(command.item || 'cobblestone');
  }
  if (command.type === 'bridge') {
    if (!Number.isInteger(command.count ?? 1) || (command.count ?? 1) < 1 || (command.count ?? 1) > 64) throw new Error('Bridge count must be between 1 and 64.');
    itemId(command.item || 'cobblestone');
  }
  if (command.type === 'shield') {
    if (!Number.isFinite(command.duration ?? 1.5) || (command.duration ?? 1.5) <= 0) throw new Error('Shield duration must be a positive number.');
  }
  if (command.type === 'shoot') {
    if (!command.position && !command.mob) throw new Error('Shoot requires a target position or mob.');
    if (command.position && (!Array.isArray(command.position) || command.position.length !== 3)) throw new Error('Shoot position needs 3 coordinates.');
  }
  if (command.type === 'pvp') {
    if (!Number.isInteger(command.hits ?? 5) || (command.hits ?? 5) < 1 || (command.hits ?? 5) > 100) throw new Error('Fight for between 1 and 100 hits.');
    if (!['plain', 'crit', 'sprint'].includes(command.style ?? 'plain')) throw new Error('Fight with plain hits, crits or sprint hits.');
    if (command.player != null && (typeof command.player !== 'string' || command.player.length > 40)) throw new Error('Name the player to fight.');
  }
  if (command.type === 'acquire') {
    if (!Number.isInteger(command.count ?? 1) || (command.count ?? 1) < 1) throw new Error('Acquire count must be positive.');
    itemId(command.item);
  }
  return { ...command };
}

export class PlayerBot {
  constructor(game, { log = () => {}, progress = () => {} } = {}) {
    this.game = game; this.log = log; this.progress = progress;
    this.task = null; this.lastResult = null; this.report = [];
    this.survival = new BotSurvival(this);
  }
  get active() { return !!this.task; }
  snapshot() { return { active: this.active, type: this.task?.command.type, phase: this.task?.phase, mined: this.task?.mined || 0, result: this.lastResult }; }
  release() {
    if (this.task?.perspective !== undefined) this.game.player.perspective = this.task.perspective;
    if (this.task?.sneaking !== undefined) this.game.player.isSneaking = this.task.sneaking;
    if (this.game.player) {
      this.game.player.botControls = null;
      this.game.player.keys = {};
      this.game.player.isBlocking = false;
      this.game.player.bowDraw = 0;
    }
    this.game.isMouseDown = false; this.game.miningTime = 0;
  }
  stop(reason = 'Stopped by the player.') { if (this.task) this.finish(false, reason); else this.release(); }
  finish(ok, message) {
    const task = this.task;
    this.release(); this.task = null;
    // Letting go of use: a bot command that ends mid-bite stops eating, as releasing the button does.
    if (task?.command?.type === 'eat') this.game.eating?.release?.();
    this.settle({ ok, message, mined: task?.mined || 0, elapsed: task?.elapsed || 0, collected: task?.dropIds ? Object.fromEntries([...task.dropIds].map(id => [id, Math.max(0, this.itemCount(id) - (task.inventoryBefore[id] || 0))])) : {} });
    // A task is asynchronous, so its caller is holding a promise the run() call returned.
    task?.resolve(this.lastResult);
  }
  /** Record and log an immediate result. A command action resolves straight away, with no task and no promise. */
  settle(result) {
    this.lastResult = result;
    this.log(result.message, result.ok ? 'success' : 'warning');
    return result;
  }
  /**
   * True for the bot's own `/stop` and `/status` controls, which the game does not implement.
   *
   * `parsePlayerCommand` splits them from a game command line before the slash is considered, so the two
   * have to be told apart here as well rather than being handed to a dispatcher that would report them as
   * unknown commands.
   */
  isBotControl(command) {
    return BOT_CONTROL.test(String(command ?? '').trim());
  }
  /**
   * Run a game command through the game's own chat-command handler.
   *
   * The bot is a second caller of `/give`, not a second implementation of it: this delegates to
   * `Game.handleCommand` so the cheats gate, the command table and the one dispatcher all stay in charge.
   *
   * Success is reported from what `handleCommand` returns, not assumed: a dispatcher that answers `false`
   * refused the command (an unknown name, a malformed argument, a missing permission), and reporting that
   * as an accepted command is exactly the "trust the success string" failure the guide forbids. `Game`'s own
   * `handleCommand` returns nothing, so `undefined` is read as handled.
   */
  runGameCommand(command) {
    if (typeof this.game.handleCommand !== 'function') {
      return this.settle({ ok: false, message: 'This game cannot run chat commands.' });
    }
    let handled;
    try {
      handled = this.game.handleCommand(command);
    } catch (error) {
      return this.settle({ ok: false, message: error?.message ?? String(error) });
    }
    return handled === false
      ? this.settle({ ok: false, message: `Not a command this world can run: ${command}` })
      : this.settle({ ok: true, message: `Ran ${command}.`, command });
  }
  run(command) {
    try { command = validatePlayerCommand(command); } catch (error) { return Promise.reject(error); }
    if (command.type === 'stop') { this.stop(); return Promise.resolve(this.lastResult); }
    if (command.type === 'status') return Promise.resolve({ ok: true, message: JSON.stringify(this.snapshot()) });
    // A command action is handled by the game's dispatcher, so it never becomes a task and nothing drives
    // the player afterwards. `stop` and `status` stay the bot's own controls.
    if (command.type === 'command' && !this.isBotControl(command.command)) {
      return Promise.resolve(this.runGameCommand(command.command));
    }
    if (this.active) return Promise.reject(new Error('The player bot is busy. Type "stop bot" to cancel it.'));
    if (!this.game.player || !this.game.world || this.game.worldReady === false) return Promise.reject(new Error('Load a world before controlling the player.'));
    if (this.game.player.gamemode === 'spectator' || this.game.player.isDead || this.game.player.isSleeping || this.game.riding || this.game.player.isDungeonMode) return Promise.reject(new Error('The player must be alive, awake, unmounted, and in the first-person voxel game.'));
    if (command.type === 'test') return this.runTest(command);
    if (command.type === 'acquire') return this.executeAcquire(command);
    if (command.type === 'craft') {
      try { const result=this.survival.craft(command); this.lastResult=result; return Promise.resolve(result); } catch(e) { return Promise.reject(e); }
    }
    if (!['mine', 'goto', 'jump', 'equip', 'follow', 'attack', 'look', 'feed', 'pillar', 'bridge', 'shield', 'shoot', 'pvp', ...SURVIVAL_ACTIONS].includes(command.type)) return Promise.reject(new Error('Unsupported player command.'));
    if (command.type === 'pvp' && !this.game.worldSync?.client?.connected) return Promise.reject(new Error('Fighting a player needs a shared world.'));
    if (command.type === 'equip') {
      let found = this.equip(item => this.survival.sameItem(item.id, itemId(command.item)));
      if (!found && this.game.player.gamemode === 'creative') {
        const id = itemId(command.item);
        const isBlock = typeof id === 'number' || (BLOCKS[String(command.item).toUpperCase()] !== undefined);
        this.game.inventory.addItem(command.item, isBlock, 64);
        found = this.equip(item => this.survival.sameItem(item.id, id));
      }
      if (!found) return Promise.reject(new Error(`You do not have ${command.item} in your inventory.`));
      const active = this.game.inventory.getActiveItem();
      if (active && ITEMS[active.id]?.armorSlot && this.game.inventory.equipArmorItem) {
        this.game.inventory.equipArmorItem(true);
      }
      return Promise.resolve({ ok: true, message: `Equipped ${command.item}.` });
    }
    return new Promise(resolve => {
      const inventoryBefore = {};
      for (const item of [...this.game.inventory.hotbar, ...(this.game.inventory.storage || [])]) if (item) inventoryBefore[item.id] = (inventoryBefore[item.id] || 0) + item.count;
      this.task = { command, resolve, phase: 'start', elapsed: 0, mined: 0, path: [], rejected: new Set(), stuck: 0, lastPosition: this.game.player.position.clone(), perspective: this.game.player.perspective, sneaking:this.game.player.isSneaking, inventoryBefore, dropIds: new Set() };
      this.game.player.perspective = 0;
      this.game.player.botControls = {};
      this.log(`Player bot: ${command.type}. Type "stop bot" to take back control.`, 'info');
    });
  }
  equip(predicate) {
    const inv = this.game.inventory;
    let slot = inv.hotbar.findIndex(item => item && predicate(item));
    if (slot < 0) {
      const index = inv.storage?.findIndex(item => item && predicate(item));
      if (index == null || index < 0) return false;
      slot = inv.activeSlot;
      [inv.hotbar[slot], inv.storage[index]] = [inv.storage[index], inv.hotbar[slot]];
    }
    inv.activeSlot = slot; inv.updateHotbar?.(); inv.updateUI?.(); return true;
  }
  findBestWeapon() {
    const inv = this.game.inventory;
    const items = [...inv.hotbar, ...(inv.storage || [])].filter(Boolean);
    const weaponRank = id => {
      const s = String(id).toLowerCase();
      if (s === 'netherite_sword') return 100;
      if (s === 'diamond_sword') return 90;
      if (s === 'iron_sword') return 80;
      if (s === 'stone_sword') return 70;
      if (s === 'golden_sword') return 65;
      if (s === 'wooden_sword') return 60;
      if (s === 'netherite_axe') return 55;
      if (s === 'diamond_axe') return 50;
      if (s === 'iron_axe') return 45;
      if (s === 'stone_axe') return 40;
      if (s === 'golden_axe') return 35;
      if (s === 'wooden_axe') return 30;
      return ITEMS[id]?.attackDamage ?? ITEMS[id]?.damage ?? 0;
    };
    items.sort((a, b) => weaponRank(b.id) - weaponRank(a.id));
    return items.length && weaponRank(items[0].id) > 0 ? items[0] : null;
  }
  async executeAcquire(c) {
    const targetItem = String(c.item).toLowerCase().replace(/\s+/g, '_');
    const targetCount = c.count || 1;
    const id = itemId(targetItem);
    const startCount = this.itemCount(id);
    if (startCount >= targetCount) {
      return this.settle({ ok: true, message: `Already have ${targetCount} ${c.item}.`, acquired: 0 });
    }

    const ensureStationNearby = async (stationItem, blockId) => {
      if (this.survival.nearby(blockId)) return true;
      if (this.survival.count(stationItem) < 1) {
        await this.executeAcquire({ type: 'acquire', item: stationItem, count: 1 });
      }
      const p = this.game.player.position;
      const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
      const spots = [
        [px + 1, py, pz], [px - 1, py, pz], [px, py, pz + 1], [px, py, pz - 1]
      ];
      let placed = false;
      for (const [sx, sy, sz] of spots) {
        if (this.game.world.getVoxel(sx, sy, sz) === BLOCKS.AIR && this.game.world.getVoxel(sx, sy - 1, sz) !== BLOCKS.AIR) {
          await this.run({ type: 'place', item: stationItem, position: [sx, sy, sz] });
          placed = true;
          break;
        }
      }
      if (!placed) throw new Error(`Could not find a spot to place ${stationItem}.`);
      return true;
    };

    const hasPickaxe = () => ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'].some(p => this.itemCount(p) > 0);
    const hasStonePickaxe = () => ['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'].some(p => this.itemCount(p) > 0);

    if (targetItem === 'oak_log' || targetItem === 'log' || targetItem === 'wood') {
      const needed = targetCount - this.itemCount(BLOCKS.OAK_LOG);
      if (needed > 0) await this.run({ type: 'mine', block: 'oak_log', count: needed });
    } else if (targetItem === 'oak_planks' || targetItem === 'planks') {
      const needed = targetCount - this.itemCount(BLOCKS.OAK_PLANKS);
      if (needed > 0) {
        const logsNeeded = Math.ceil(needed / 4);
        if (this.itemCount(BLOCKS.OAK_LOG) < logsNeeded) {
          await this.executeAcquire({ type: 'acquire', item: 'oak_log', count: logsNeeded });
        }
        await this.run({ type: 'craft', item: 'oak_planks', count: logsNeeded });
      }
    } else if (targetItem === 'stick') {
      const needed = targetCount - this.itemCount('stick');
      if (needed > 0) {
        const batches = Math.ceil(needed / 4);
        const planksNeeded = batches * 2;
        if (this.itemCount(BLOCKS.OAK_PLANKS) < planksNeeded) {
          await this.executeAcquire({ type: 'acquire', item: 'oak_planks', count: planksNeeded });
        }
        await this.run({ type: 'craft', item: 'stick', count: batches });
      }
    } else if (targetItem === 'crafting_table') {
      if (this.itemCount(BLOCKS.CRAFTING_TABLE) < targetCount) {
        const needed = targetCount - this.itemCount(BLOCKS.CRAFTING_TABLE);
        const planksNeeded = needed * 4;
        if (this.itemCount(BLOCKS.OAK_PLANKS) < planksNeeded) {
          await this.executeAcquire({ type: 'acquire', item: 'oak_planks', count: planksNeeded });
        }
        await this.run({ type: 'craft', item: 'crafting_table', count: needed });
      }
    } else if (targetItem === 'wooden_pickaxe') {
      if (this.itemCount('wooden_pickaxe') < targetCount) {
        await ensureStationNearby('crafting_table', BLOCKS.CRAFTING_TABLE);
        if (this.itemCount(BLOCKS.OAK_PLANKS) < 3) await this.executeAcquire({ type: 'acquire', item: 'oak_planks', count: 3 });
        if (this.itemCount('stick') < 2) await this.executeAcquire({ type: 'acquire', item: 'stick', count: 2 });
        await this.run({ type: 'craft', item: 'wooden_pickaxe', count: targetCount });
      }
    } else if (targetItem === 'wooden_axe' || targetItem === 'wooden_sword') {
      await ensureStationNearby('crafting_table', BLOCKS.CRAFTING_TABLE);
      const planks = targetItem === 'wooden_sword' ? 2 : 3;
      const sticks = targetItem === 'wooden_sword' ? 1 : 2;
      if (this.itemCount(BLOCKS.OAK_PLANKS) < planks) await this.executeAcquire({ type: 'acquire', item: 'oak_planks', count: planks });
      if (this.itemCount('stick') < sticks) await this.executeAcquire({ type: 'acquire', item: 'stick', count: sticks });
      await this.run({ type: 'craft', item: targetItem, count: targetCount });
    } else if (targetItem === 'cobblestone' || targetItem === 'stone') {
      const needed = targetCount - this.itemCount(BLOCKS.COBBLESTONE);
      if (needed > 0) {
        if (!hasPickaxe()) {
          await this.executeAcquire({ type: 'acquire', item: 'wooden_pickaxe', count: 1 });
        }
        this.equip(s => hasPickaxe(s?.id));
        await this.run({ type: 'mine', block: 'stone', count: needed });
      }
    } else if (targetItem === 'stone_pickaxe') {
      if (this.itemCount('stone_pickaxe') < targetCount) {
        await ensureStationNearby('crafting_table', BLOCKS.CRAFTING_TABLE);
        if (this.itemCount(BLOCKS.COBBLESTONE) < 3) await this.executeAcquire({ type: 'acquire', item: 'cobblestone', count: 3 });
        if (this.itemCount('stick') < 2) await this.executeAcquire({ type: 'acquire', item: 'stick', count: 2 });
        await this.run({ type: 'craft', item: 'stone_pickaxe', count: targetCount });
      }
    } else if (targetItem === 'stone_axe' || targetItem === 'stone_sword') {
      await ensureStationNearby('crafting_table', BLOCKS.CRAFTING_TABLE);
      const cobble = targetItem === 'stone_sword' ? 2 : 3;
      const sticks = targetItem === 'stone_sword' ? 1 : 2;
      if (this.itemCount(BLOCKS.COBBLESTONE) < cobble) await this.executeAcquire({ type: 'acquire', item: 'cobblestone', count: cobble });
      if (this.itemCount('stick') < sticks) await this.executeAcquire({ type: 'acquire', item: 'stick', count: sticks });
      await this.run({ type: 'craft', item: targetItem, count: targetCount });
    } else if (targetItem === 'furnace') {
      if (this.itemCount(BLOCKS.FURNACE) < targetCount) {
        await ensureStationNearby('crafting_table', BLOCKS.CRAFTING_TABLE);
        if (this.itemCount(BLOCKS.COBBLESTONE) < 8) await this.executeAcquire({ type: 'acquire', item: 'cobblestone', count: 8 });
        await this.run({ type: 'craft', item: 'furnace', count: targetCount });
      }
    } else if (targetItem === 'coal') {
      const needed = targetCount - this.itemCount('coal');
      if (needed > 0) {
        if (!hasPickaxe()) await this.executeAcquire({ type: 'acquire', item: 'wooden_pickaxe', count: 1 });
        await this.run({ type: 'mine', block: 'coal_ore', count: needed });
      }
    } else if (targetItem === 'raw_iron' || targetItem === 'iron_ore') {
      const needed = targetCount - this.itemCount('raw_iron') - this.itemCount(BLOCKS.IRON_ORE);
      if (needed > 0) {
        if (!hasStonePickaxe()) await this.executeAcquire({ type: 'acquire', item: 'stone_pickaxe', count: 1 });
        await this.run({ type: 'mine', block: 'iron_ore', count: needed });
      }
    } else if (targetItem === 'iron_ingot') {
      const needed = targetCount - this.itemCount('iron_ingot');
      if (needed > 0) {
        await ensureStationNearby('furnace', BLOCKS.FURNACE);
        const ironOre = this.itemCount('raw_iron') > 0 ? 'raw_iron' : (this.itemCount(BLOCKS.IRON_ORE) > 0 ? 'iron_ore' : null);
        if (!ironOre || this.itemCount(ironOre) < needed) {
          await this.executeAcquire({ type: 'acquire', item: 'raw_iron', count: needed });
        }
        const fuel = this.itemCount('coal') >= needed ? 'coal' : (this.itemCount('oak_planks') >= needed ? 'oak_planks' : null);
        if (!fuel) {
          await this.executeAcquire({ type: 'acquire', item: 'oak_planks', count: Math.max(1, needed) });
        }
        const actualFuel = this.itemCount('coal') >= needed ? 'coal' : 'oak_planks';
        const actualInput = this.itemCount('raw_iron') >= needed ? 'raw_iron' : 'iron_ore';
        const p = this.game.player.position;
        let fpos;
        for (let x = Math.floor(p.x)-4; x <= Math.floor(p.x)+4 && !fpos; x++)
          for (let y = Math.floor(p.y)-3; y <= Math.floor(p.y)+3 && !fpos; y++)
            for (let z = Math.floor(p.z)-4; z <= Math.floor(p.z)+4 && !fpos; z++) {
              if ([BLOCKS.FURNACE, BLOCKS.LIT_FURNACE].includes(this.game.world.getVoxel(x, y, z))) fpos = [x, y, z];
            }
        if (!fpos) throw new Error('Furnace not found within reach.');
        await this.run({ type: 'cook', item: actualInput, count: needed, fuel: actualFuel, fuelCount: needed, position: fpos });
      }
    } else if (targetItem === 'shield') {
      await ensureStationNearby('crafting_table', BLOCKS.CRAFTING_TABLE);
      if (this.itemCount(BLOCKS.OAK_PLANKS) < 6) await this.executeAcquire({ type: 'acquire', item: 'oak_planks', count: 6 });
      if (this.itemCount('iron_ingot') < 1) await this.executeAcquire({ type: 'acquire', item: 'iron_ingot', count: 1 });
      await this.run({ type: 'craft', item: 'shield', count: targetCount });
    } else if (targetItem === 'torch') {
      const batches = Math.ceil(targetCount / 4);
      if (this.itemCount('stick') < batches) await this.executeAcquire({ type: 'acquire', item: 'stick', count: batches });
      if (this.itemCount('coal') < batches && this.itemCount('charcoal') < batches) await this.executeAcquire({ type: 'acquire', item: 'coal', count: batches });
      await this.run({ type: 'craft', item: 'torch', count: batches });
    } else if (targetItem === 'chest') {
      await ensureStationNearby('crafting_table', BLOCKS.CRAFTING_TABLE);
      const planksNeeded = targetCount * 8;
      if (this.itemCount(BLOCKS.OAK_PLANKS) < planksNeeded) await this.executeAcquire({ type: 'acquire', item: 'oak_planks', count: planksNeeded });
      await this.run({ type: 'craft', item: 'chest', count: targetCount });
    } else {
      await this.run({ type: 'craft', item: targetItem, count: targetCount });
    }

    const endCount = this.itemCount(id);
    const diff = endCount - startCount;
    return this.settle({ ok: true, message: `Acquired ${diff} ${c.item}.`, acquired: diff });
  }
  toolFor(id) {
    if (this.game.player.gamemode !== 'survival') return true;
    const inv = this.game.inventory;
    const choices = [...inv.hotbar, ...(inv.storage || [])].filter(i => i && !i.isBlock && !harvestsNothing(id, ITEMS[i.id], i.id));
    choices.sort((a, b) => breakTimeSeconds(id, ITEMS[a.id], a.id) - breakTimeSeconds(id, ITEMS[b.id], b.id));
    if (choices.length) return this.equip(i => i === choices[0]);
    return !harvestsNothing(id, null, null);
  }
  passable(id) { return id === BLOCKS.AIR || id === BLOCKS.WATER || (!!BLOCK_DEFS[id] && BLOCK_DEFS[id].solid === false && !this.hazard(id)); }
  hazard(id) { return [BLOCKS.LAVA, BLOCKS.FIRE, BLOCKS.CACTUS, BLOCKS.MAGMA_BLOCK].filter(v => v !== undefined).includes(id); }
  neighbors(node) {
    const world = this.game.world, origin = this.task.origin;
    const out = [];
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1, -1]) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const x = node.x + dx, y = node.y + dy, z = node.z + dz;
        if (Math.abs(x - origin.x) > 32 || Math.abs(z - origin.z) > 32 || Math.abs(y - origin.y) > 24) continue;
        const floor = world.getVoxel(x, y - 1, z);
        const isWater = floor === BLOCKS.WATER || world.getVoxel(x, y, z) === BLOCKS.WATER;
        const isLadder = floor === BLOCKS.LADDER || world.getVoxel(x, y, z) === BLOCKS.LADDER;
        if (dx === 0 && dz === 0 && !isLadder && !isWater) continue;
        if (!isWater && !isLadder && (this.passable(floor) || this.hazard(floor) || floor == null)) continue;
        const dig = []; let valid = true;
        for (const h of [0, 1]) {
          const id = world.getVoxel(x, y + h, z);
          if (this.passable(id)) continue;
          const held = this.game.inventory.getActiveItem?.();
          if (this.task.command.type !== 'mine' || this.hazard(id) || !BLOCK_DEFS[id] || BLOCK_DEFS[id].hardness >= 99999 || (this.game.player.gamemode === 'survival' && harvestsNothing(id, ITEMS[held?.id], held?.id))) { valid = false; break; }
          // Never undermine the player or dig beside a fluid.
          if ([[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]].some(([a,b,c]) => this.hazard(world.getVoxel(x+a,y+h+b,z+c)))) { valid = false; break; }
          dig.push({ x, y: y + h, z, blockId: id });
        }
        if (dy > 0 && !this.passable(world.getVoxel(node.x, node.y + 2, node.z))) valid = false;
        if (valid) { out.push(cell(x, y, z, 1 + Math.abs(dy) + dig.length * 8 + (isWater ? 3 : 0), dig)); break; }
      }
    }
    return out;
  }
  search(target, near = false) {
    const p = this.game.player.position, start = cell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    this.task.origin = start;
    // Mining ends where the block is within arm's reach of the eyes (Survival reach is 4.5 blocks), not beside its
    // feet: a five-log trunk's top logs were otherwise "unreachable" from the ground, so a tree yielded three logs.
    const mining = near && this.task.command.type === 'mine';
    const eyeReach = n => Math.hypot(n.x + .5 - (target.x + .5), n.y + 1.62 - (target.y + .5), n.z + .5 - (target.z + .5));
    // ...and in sight: nothing between eye and block but air, plants or leaves (which a player cuts through). Without
    // this the bot mined from where a chest stood in the way, and broke the chest.
    const world = this.game.world;
    const inSight = n => {
      const ex = n.x + .5, ey = n.y + 1.62, ez = n.z + .5, tx = target.x + .5, ty = target.y + .5, tz = target.z + .5;
      const steps = Math.ceil(Math.hypot(tx - ex, ty - ey, tz - ez) / 0.1);
      for (let i = 1; i < steps; i++) {
        const f = i / steps, x = Math.floor(ex + (tx - ex) * f), y = Math.floor(ey + (ty - ey) * f), z = Math.floor(ez + (tz - ez) * f);
        if (x === target.x && y === target.y && z === target.z) return true;
        const id = world.getVoxel(x, y, z);
        if (!this.passable(id) && !/Leaves/.test(BLOCK_DEFS[id]?.name || '')) return false;
      }
      return true;
    };
    const goal = mining
      ? { heuristic: n => Math.max(0, eyeReach(n) - 4), isEnd: n => eyeReach(n) <= 4 && !(n.x === target.x && n.z === target.z) && inSight(n) }
      : { heuristic: n => Math.max(0, distance(n, target) - (near ? 1.5 : 0)), isEnd: n => distance(n, target) <= (near ? 1.5 : .1) };
    this.task.search = new AStar(start, { getNeighbors: n => this.neighbors(n) }, goal, 1000, 4, 64);
    this.task.phase = 'path';
  }
  *scan(ids) {
    const p = this.game.player.position, cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
    for (let radius = 0; radius <= 24; radius++) {
      for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) for (let y = -Math.min(radius, 24); y <= Math.min(radius, 24); y++) {
        if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== radius) continue;
        const pos = { x: cx + x, y: cy + y, z: cz + z };
        yield ids.has(this.game.world.getVoxel(pos.x, pos.y, pos.z)) && !this.task.rejected.has(key(pos)) ? pos : null;
      }
    }
  }
  beginScan() {
    const name = String(this.task.command.block).toUpperCase().replace(/\s+/g, '_');
    const aliases = {
      IRON: 'IRON_ORE',
      COAL: 'COAL_ORE',
      GOLD: 'GOLD_ORE',
      DIAMOND: 'DIAMOND_ORE',
      EMERALD: 'EMERALD_ORE',
      COPPER: 'COPPER_ORE',
      LAPIS: 'LAPIS_ORE',
      REDSTONE: 'REDSTONE_ORE',
      WOOD: 'OAK_LOG',
      WHEAT: 'WHEAT_STAGE_7'
    };
    const canonical = aliases[name] || name;
    const ids = new Set([BLOCKS[canonical], BLOCKS[`DEEPSLATE_${canonical}`]].filter(v => v !== undefined));
    if (!ids.size) throw new Error(`Unknown block: ${this.task.command.block}.`);
    // A player after dirt digs the grass they stand on, which drops dirt (Grass Block: "drops dirt"); likewise stone
    // for cobblestone. Blocks whose ordinary drop is the wanted block count as sources of it.
    for (const id of [...ids]) for (const source of dropSourcesOf(id)) ids.add(source);
    this.task.dropsBefore ??= new Set(this.game.entities?.droppedItems || []);
    this.task.resourceIds=ids;this.task.scanner = this.scan(ids); this.task.phase = 'scan';
  }
  /**
   * The next stretch of a walk. The path search covers 32 blocks around the player, so a longer trip -- back from a
   * chase, across a field -- is walked in legs of up to 28 blocks toward the goal, each ending on standable ground.
   */
  gotoLeg(t) {
    const [gx, gy, gz] = t.command.position.map(Math.floor), p = this.game.player.position;
    const dx = gx + .5 - p.x, dz = gz + .5 - p.z, dist = Math.hypot(dx, dz);
    t.finalLeg = dist <= 28;
    if (t.finalLeg) return cell(gx, gy, gz);
    const world = this.game.world;
    for (let reach = 28; reach >= 8; reach -= 4) {
      const wx = Math.floor(p.x + dx / dist * reach), wz = Math.floor(p.z + dz / dist * reach);
      for (let y = Math.floor(p.y) + 8; y >= Math.floor(p.y) - 8; y--) {
        const floor = world.getVoxel(wx, y - 1, wz);
        if (!this.passable(floor) && !this.hazard(floor) && this.passable(world.getVoxel(wx, y, wz)) && this.passable(world.getVoxel(wx, y + 1, wz))) return cell(wx, y, wz);
      }
    }
    t.finalLeg = true;
    return cell(gx, gy, gz);
  }
  /** Let a survival action walk to a cell first (for example, to see a face to place against). */
  walkForSurvival(spot) {
    this.task.survivalWalk = true;
    this.search(cell(spot.x, spot.y, spot.z));
  }
  /**
   * Walk over the items this fight's kills dropped, nearest first, within `radius`. Returns 'none' when nothing is
   * left to collect, 'wait' while a path is computed or a pickup delay runs, 'walk' when the walking code should step.
   * The search used to be restarted every tick before it could run, so the bot stood still and three sheep left
   * three wool on the ground.
   */
  /**
   * A drop resting on leaves out of walking reach (a log that fell onto the canopy): break the leaves under it so it
   * falls, as a player does -- first walking under it if the leaves are beyond arm's reach.
   */
  clearUnderDrop(t) {
    const d = t.sweepTarget, at = d?.group?.position; if (!at) return false;
    const world = this.game.world, x = Math.floor(at.x), z = Math.floor(at.z), y = Math.floor(at.y + .1) - 1;
    const id = world.getVoxel(x, y, z);
    if (!/Leaves/.test(BLOCK_DEFS[id]?.name || '')) return false;
    const p = this.game.player.position;
    const reach = Math.hypot(x + .5 - p.x, y + .5 - (p.y + 1.62), z + .5 - p.z);
    if (reach <= 4.5) { t.dig = { x, y, z, blockId: id, ore: false }; this.lookAt({ x: x + .5, y: y + .5, z: z + .5 }); return true; }
    if ((t.approached ??= new Set()).has(d)) return false;
    t.approached.add(d);
    let gy = y; while (gy > 0 && this.passable(world.getVoxel(x, gy - 1, z))) gy--;
    if (gy >= y) return false;
    this.search(cell(x, gy, z));
    return true;
  }
  strikeDrop(t) { (t.unreachableDrops ??= new Map()).set(t.sweepTarget, (t.unreachableDrops.get(t.sweepTarget) ?? 0) + 1); }
  sweepFightDrops(t, radius, dt, onlyIds = null) {
    const p = this.game.player;
    const drops = (this.game.entities?.droppedItems || [])
      .filter((d) => d?.group?.position && !t.dropsBefore?.has(d) && (!onlyIds || onlyIds.has(d.itemType)) && (t.unreachableDrops?.get(d) ?? 0) < 3 && distance(d.group.position, p.position) < radius)
      .sort((a, b) => distance(a.group.position, p.position) - distance(b.group.position, p.position));
    t.sweeps = (t.sweeps || 0) + dt;
    if (!drops.length || t.sweeps > 45) { this.lastSweepInfo = { sweeps: +t.sweeps.toFixed(1), unreachable: [...(t.unreachableDrops?.values() ?? [])].filter((n) => n >= 3).length, left: drops.length }; return 'none'; }
    if (!t.looting) { t.looting = true; t.path = []; t.phase = 'loot'; }
    if (t.phase === 'path' && t.sweepTarget && !drops.includes(t.sweepTarget)) { t.phase = 'loot'; t.path = []; }
    if (!t.path.length && t.phase !== 'path') {
      t.sweepTarget = drops[0];
      // Aim for the cell it will land in: a fresh drop is still in the air, and an airborne cell has no path.
      const at = drops[0].group.position, x = Math.floor(at.x), z = Math.floor(at.z);
      let y = Math.floor(at.y + .1);
      for (let i = 0; i < 6 && this.passable(this.game.world.getVoxel(x, y - 1, z)); i++) y--;
      this.search(cell(x, y, z));
    }
    if (t.phase === 'path') {
      const result = t.search.compute();
      if (result.status === 'partial') return 'wait';
      if (result.status !== 'success') { t.phase = 'loot'; if (!this.clearUnderDrop(t)) this.strikeDrop(t); return 'wait'; }
      t.path = result.path; t.phase = 'walk';
    }
    if (!t.path.length) {
      // Arrived but not on it (the item slid, or the cell was beside it): step straight at it, a few tries at most.
      const at = t.sweepTarget.group.position, dx = at.x - p.position.x, dz = at.z - p.position.z;
      if (Math.hypot(dx, dz) < 1) return 'wait';
      t.nudges = (t.nudges || 0) + dt;
      if (t.nudges > 3 || Math.hypot(dx, dz) > 4) { this.strikeDrop(t); t.nudges = 0; return 'wait'; }
      p.yaw = Math.atan2(-dx, -dz); p.botControls.KeyW = true;
      return 'wait';
    }
    return 'walk';
  }
  /**
   * Put a block down as a placement does: in the world, redrawn, and -- in a shared world -- sent to the other players,
   * who would otherwise never see a bot's bridge or pillar.
   */
  placeBlock(x, y, z, blockId) {
    this.game.world.setVoxel(x, y, z, blockId);
    const chunk = this.game.world.getChunk?.(Math.floor(x / 16), Math.floor(z / 16));
    if (chunk) this.game.rebuildChunkMesh?.(chunk);
    this.game.worldSync?.onBlockPlaced?.(x, y, z, blockId);
    this.game.sounds?.playPlace?.('stone');
  }
  lookAt(pos) {
    const p = this.game.player, dx = pos.x - p.position.x, dz = pos.z - p.position.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(pos.y - p.position.y - (p.isSneaking ? 1.38 : p.eyeHeight || 1.62), Math.hypot(dx, dz));
    if(this.task?.dig) this.task.aimedDig=key(this.task.dig);
  }
  tick(dt) {
    const t = this.task; if (!t) return;
    try {
      const p = this.game.player;
      t.elapsed += dt; t.aimedDig=null; p.botControls = {}; this.game.isMouseDown = false;
      if (p.isDead || p.health <= 0 || (p.isSleeping && t.command.type !== 'sleep') || this.game.riding || p.gamemode === 'spectator' || this.game.worldReady === false) throw new Error('Player state changed; bot stopped.');
      if (t.elapsed > 180) throw new Error(`Timed out after mining ${t.mined} blocks. Try a closer target.`);
      // A survival action runs itself, except while it has asked to walk somewhere first (walkForSurvival); the
      // ordinary path-following below then moves the player and hands back when it arrives.
      if (SURVIVAL_ACTIONS.includes(t.command.type) && !t.survivalWalk) { this.survival.tick(t); return; }
      if (t.command.type === 'jump') { p.botControls.Space = t.elapsed < .2; if (t.elapsed >= .8) this.finish(true, 'Jump completed.'); return; }
      if (t.command.type === 'shield') {
        this.equip(s => this.survival.sameItem(s?.id, 'shield'));
        p.isBlocking = true;
        if (t.elapsed >= (t.command.duration ?? 1.5)) {
          p.isBlocking = false;
          this.finish(true, `Blocked with shield for ${t.command.duration ?? 1.5}s.`);
        }
        return;
      }
      if (t.command.type === 'pillar') {
        const count = t.command.count || 1;
        const item = t.command.item || 'cobblestone';
        const id = itemId(item);
        const blockId = typeof id === 'number' ? id : (ITEMS[id]?.blockId ?? BLOCKS[String(id).toUpperCase()]);
        if (p.gamemode !== 'creative' && this.survival.count(id) < 1) {
          throw new Error(`Out of ${item} for pillaring.`);
        }
        this.equip(s => this.survival.sameItem(s?.id, id));
        t.targetY ??= Math.floor(p.position.y);
        t.pillared ??= 0;
        if (p.position.y >= t.targetY + 1.05) {
          const px = Math.floor(p.position.x), pz = Math.floor(p.position.z);
          this.placeBlock(px, t.targetY, pz, blockId);
          if (p.gamemode !== 'creative') this.survival.remove(id, 1);
          t.pillared++;
          t.targetY++;
          p.position.y = Math.max(p.position.y, t.targetY + 0.1);
          p.velocity.y = 0;
          p.onGround = true;
          if (t.pillared >= count) {
            this.finish(true, `Pillared up ${t.pillared} blocks using ${item}.`);
            return;
          }
        }
        p.botControls.Space = true;
        return;
      }
      if (t.command.type === 'bridge') {
        const count = t.command.count || 1;
        const item = t.command.item || 'cobblestone';
        const id = itemId(item);
        const blockId = typeof id === 'number' ? id : (ITEMS[id]?.blockId ?? BLOCKS[String(id).toUpperCase()]);
        if (!modeRules(p.gamemode).placeBlocks) throw new Error(`Blocks cannot be placed in ${p.gamemode} mode.`);
        if (p.gamemode !== 'creative' && this.survival.count(id) < 1) {
          throw new Error(`Out of ${item} for bridging.`);
        }
        this.equip(s => this.survival.sameItem(s?.id, id));
        if (!t.bridgeInitialized) {
          let dx = 0, dz = 0;
          const dir = t.command.direction || 'forward';
          if (dir === 'north') dz = -1;
          else if (dir === 'south') dz = 1;
          else if (dir === 'east') dx = 1;
          else if (dir === 'west') dx = -1;
          else {
            const fx = -Math.sin(p.yaw);
            const fz = -Math.cos(p.yaw);
            if (Math.abs(fx) > Math.abs(fz)) dx = Math.sign(fx);
            else dz = Math.sign(fz);
          }
          t.bridgeDx = dx;
          t.bridgeDz = dz;
          t.currentBridgeX = Math.floor(p.position.x);
          t.currentBridgeY = Math.floor(p.position.y) - 1;
          t.currentBridgeZ = Math.floor(p.position.z);
          t.bridged = 0;
          t.bridgeInitialized = true;
        }
        p.isSneaking = true;
        p.botControls.ShiftLeft = true;
        const nextX = t.currentBridgeX + t.bridgeDx;
        const nextY = t.currentBridgeY;
        const nextZ = t.currentBridgeZ + t.bridgeDz;
        this.lookAt({ x: nextX + 0.5, y: nextY + 0.5, z: nextZ + 0.5 });
        this.placeBlock(nextX, nextY, nextZ, blockId);
        if (p.gamemode !== 'creative') this.survival.remove(id, 1);
        p.position.x = nextX + 0.5;
        p.position.y = nextY + 1.0;
        p.position.z = nextZ + 0.5;
        t.currentBridgeX = nextX;
        t.currentBridgeZ = nextZ;
        t.bridged++;
        if (t.bridged >= count) {
          this.finish(true, `Bridged ${t.bridged} blocks ${t.command.direction || 'forward'} using ${item}.`);
          return;
        }
        return;
      }
      if (t.command.type === 'shoot') {
        if (!this.equip(s => this.survival.sameItem(s?.id, 'bow'))) {
          if (p.gamemode === 'creative') {
            this.game.inventory.addItem('bow', false, 1);
            this.equip(s => this.survival.sameItem(s?.id, 'bow'));
          } else {
            throw new Error('You do not have a bow.');
          }
        }
        const hasAmmo = p.gamemode === 'creative' || ['arrow', 'spectral_arrow'].some(a => this.survival.count(a) > 0);
        if (!hasAmmo) throw new Error('Out of arrows.');
        let targetPos;
        let targetMob;
        let targetCrystal;
        if (t.command.position) {
          targetPos = new THREE.Vector3(t.command.position[0] + 0.5, t.command.position[1] + 0.5, t.command.position[2] + 0.5);
        } else if (t.command.mob === 'end_crystal') {
          const crystals = this.game.bossManager?.endCrystals || this.game.bossFightManager?.endCrystals || this.game.mobs?.endCrystals || [];
          targetCrystal = crystals.find(c => (c.alive !== false && !c.exploded)) || crystals[0];
          if (targetCrystal) {
            targetPos = targetCrystal.position ? targetCrystal.position.clone() : targetCrystal.mesh.position.clone();
          } else {
            throw new Error('No End Crystal found.');
          }
        } else if (t.command.mob) {
          targetMob = this.game.mobs?.mobs?.filter(m => m.type === t.command.mob && m.health > 0).sort((a,b) => distance(a.mesh.position,p.position)-distance(b.mesh.position,p.position))[0];
          if (!targetMob) throw new Error(`No living ${t.command.mob} nearby.`);
          targetPos = targetMob.mesh.position.clone().add(new THREE.Vector3(0, (targetMob.height || 1.8) * 0.5, 0));
        }
        const eyePos = p.position.clone().add(new THREE.Vector3(0, p.eyeHeight || 1.62, 0));
        const dx = targetPos.x - eyePos.x;
        const dz = targetPos.z - eyePos.z;
        const dist = Math.hypot(dx, dz);
        const time = dist / 30;
        const drop = 0.5 * 9.8 * time * time;
        const aimPos = targetPos.clone().add(new THREE.Vector3(0, drop, 0));
        this.lookAt(aimPos);
        t.drawTimer = (t.drawTimer || 0) + dt;
        p.bowDraw = Math.min(1.0, t.drawTimer);
        if (t.drawTimer >= 0.8 && !t.shot) {
          t.shot = true;
          const direction = targetPos.clone().sub(eyePos).normalize();
          if (this.game.mobs?.spawnArrow) {
            this.game.mobs.spawnArrow(eyePos, direction, 'player', { speed: 30, damage: 9, pickup: false });
          }
          if (p.gamemode !== 'creative') {
            const ammoId = ['arrow', 'spectral_arrow'].find(a => this.survival.count(a) > 0);
            if (ammoId) this.survival.remove(ammoId, 1);
          }
          if (targetMob) {
            this.game.mobs?.damageMob?.(targetMob, 9, eyePos, false, p);
          }
          if (targetCrystal) {
            if (this.game.bossManager?.destroyEndCrystal) this.game.bossManager.destroyEndCrystal(targetCrystal);
            else if (typeof targetCrystal.destroy === 'function') targetCrystal.destroy();
            else { targetCrystal.alive = false; targetCrystal.exploded = true; }
          }
          this.game.sounds?.playBowShoot?.();
        }
        if (t.drawTimer >= 1.0) {
          p.bowDraw = 0;
          this.finish(true, `Shot arrow at ${t.command.mob || t.command.position.join(' ')}.`);
          return;
        }
        return;
      }
      if (t.command.type === 'pvp') { this.tickPvp(t, dt); return; }
      if (['follow', 'attack', 'look', 'feed'].includes(t.command.type)) mobTask: {
        if (t.command.type === 'attack') t.dropsBefore ??= new Set(this.game.entities?.droppedItems || []);
        if (t.command.type === 'feed') {
          this.equip(s => this.survival.sameItem(s?.id, itemId(t.command.item)));
        }
        if (t.command.type === 'attack') {
          const best = this.findBestWeapon();
          if (best) this.equip(i => i === best);
        }
        const candidateMobs = this.game.mobs?.mobs?.filter(m => m.type === t.command.mob && m.health > 0) || [];
        const mob = (t.command.type === 'feed'
          ? (candidateMobs.find(m => !(m.inLove > 0)) || candidateMobs[0])
          : candidateMobs.sort((a,b) => distance(a.mesh.position,p.position)-distance(b.mesh.position,p.position))[0]);
        if (!mob) {
          if (t.command.type === 'attack' && t.hadMob) {
            // Let the killing blow finish before declaring victory.
            const corpse = t.killedMob;
            if (corpse && this.game.mobs?.mobs?.includes(corpse) && corpse.lootDropped !== true && (corpse.deathTime ?? 0) < 0.65) {
              t.deathWait = (t.deathWait || 0) + dt;
              if (t.deathWait < 2.0) return;
            }
            const swept = this.sweepFightDrops(t, 30, dt);
            if (swept === 'none') { this.finish(true, 'Target defeated.'); return; }
            if (swept === 'wait') return;
            break mobTask; // on to the walking code below
          } else throw new Error(`No living ${t.command.mob} nearby.`);
          return;
        }
        // Pick up what the last kill dropped before chasing the next mob, as a player does: fleeing animals lead the
        // fight away, and loot left behind is out of reach by the end of it.
        if (t.command.type === 'attack' && t.hadMob && t.killedMob !== mob) {
          const swept = this.sweepFightDrops(t, 8, dt);
          if (swept === 'wait') return;
          if (swept === 'walk') break mobTask;
          if (t.looting) { t.looting = false; t.path = []; t.phase = 'loot'; }
        }
        t.hadMob = true;
        if (!t.looting) t.killedMob = mob;
        this.lookAt({ ...mob.mesh.position, y: mob.mesh.position.y + (mob.height || 1.5) * .6 });
        if (t.command.type === 'look') { this.finish(true, `Looking at ${t.command.mob}.`); return; }
        const range = distance(mob.mesh.position, p.position);
        if (t.command.type === 'attack' && mob.type === 'creeper' && t.kiting) {
          p.botControls.KeyS = true;
          p.botControls.ControlLeft = true;
          if (range > 5.5 || (mob.fuseTimer ?? 0) <= 0) {
            t.kiting = false;
          }
          return;
        }
        if (t.command.type === 'feed' && range < 2.5) {
          t.beforeFeed ??= this.itemCount(t.command.item);
          t.beforeInLove ??= mob.inLove || 0;
          // Shears, a bucket, a bowl or dye on an animal change the inventory or the animal rather than feed it.
          const signature = () => JSON.stringify([...this.game.inventory.hotbar, ...(this.game.inventory.storage || [])].map((i) => i ? `${i.id}x${i.count}d${i.durability ?? ''}` : '')); // durability too: a brush wears, it is not used up
          t.beforeInventory ??= signature();
          t.beforeMob ??= `${mob.isSheared}|${mob.woolColor}|${mob.isTamed}|${mob.isSaddled}`;
          if (typeof this.game.handleRightClick === 'function') {
            this.game.handleRightClick();
          } else {
            mob.inLove = 30;
            this.game.inventory.consumeActiveItem();
          }
          if ((mob.inLove || 0) > t.beforeInLove || this.itemCount(t.command.item) < t.beforeFeed || signature() !== t.beforeInventory
            || `${mob.isSheared}|${mob.woolColor}|${mob.isTamed}|${mob.isSaddled}` !== t.beforeMob) {
            this.finish(true, `Fed ${t.command.item} to ${t.command.mob}.`);
            return;
          }
        }
        if (t.command.type === 'attack' && range < 2.5) {
          t.attackTimer = (t.attackTimer || 0) - dt;
          if (t.attackTimer <= 0) {
            t.attackTarget = mob;
            // Swing again once the held weapon is fully charged (attackCooldown.js): 0.625 s for a sword, 1.25 s
            // for a stone axe. A fixed 0.65 s swung an axe at half charge, a fifth of its damage lost each hit.
            const held = this.game.inventory?.getActiveItem?.();
            t.attackTimer = cooldownSeconds(held && !held.isBlock ? held.id : null) + 0.05;
            if (mob.type === 'creeper') t.kiting = true;
          }
          return;
        }
        if (range < 2.5) return;
        if (!t.path.length && t.phase !== 'path') this.search(cell(Math.floor(mob.mesh.position.x),Math.floor(mob.mesh.position.y),Math.floor(mob.mesh.position.z)),true);
      }
      if (t.phase === 'start') {
        if (t.command.type === 'mine') this.beginScan();
        else if (t.command.type === 'goto') this.search(this.gotoLeg(t));
      }
      if (t.phase === 'scan') {
        for (let i = 0; i < 2048; i++) {
          const next = t.scanner.next();
          if (next.done) throw new Error(`No reachable ${t.command.block} within 24 blocks. Mined ${t.mined}.`);
          if (next.value) {
            t.target = next.value;
            const id = this.game.world.getVoxel(t.target.x,t.target.y,t.target.z);
            if (!this.toolFor(id)) throw new Error(`You need a suitable tool to harvest ${t.command.block}. Equip one and retry.`);
            this.search(t.target, true); break;
          }
        }
      }
      if (t.phase === 'path') {
        const result = t.search.compute();
        if (result.status === 'partial') return;
        if (result.status !== 'success') {
          if (t.command.type === 'mine') { t.rejected.add(key(t.target)); t.phase='scan'; return; }
          throw new Error('No safe walking path to the destination.');
        }
        t.path = result.path; t.phase = 'walk';
      }
      // Preserve the generator across scan slices. Falling through to the idle
      // mining branch restarted at radius zero every tick, making farther
      // resources impossible to discover even inside the advertised radius.
      if(t.phase==='scan') return;
      if (t.dig) {
        const id = this.game.world.getVoxel(t.dig.x,t.dig.y,t.dig.z);
        if (id === BLOCKS.AIR) {
          if (t.dig.ore) { t.mined++; const drop=baseBlockDrop(t.dig.blockId,()=>.05);if(drop)t.dropIds.add(drop.id); t.pickupWait=1.5; this.progress(Math.round(100*t.mined/(t.command.count || 3)), `Mined ${t.mined}/${t.command.count || 3}`); t.collect = { ...t.dig }; }
          t.dig = null; this.game.miningTime = 0;
        } else {
          if (id !== t.dig.blockId) throw new Error('Mining target changed; stopped.');
          if (!this.toolFor(id)) throw new Error('The required tool is missing or broken.');
          this.lookAt({ x:t.dig.x+.5,y:t.dig.y+.5,z:t.dig.z+.5 }); return;
        }
      }
      if (t.path.length) {
        const next = t.path[0];
        const blocker = next.dig.find(b => !this.passable(this.game.world.getVoxel(b.x,b.y,b.z)));
        if (blocker) { t.dig = {...blocker,ore:!!t.resourceIds?.has(blocker.blockId)}; this.lookAt({x:blocker.x+.5,y:blocker.y+.5,z:blocker.z+.5}); return; }
        const dx = next.x+.5-p.position.x, dz = next.z+.5-p.position.z;
        // In water the player floats up to a block over the floor (0.88 in a one-deep channel), so arrival allows that.
        if (Math.hypot(dx,dz)<.22 && Math.abs(p.position.y-next.y)<(p.inWater ? 1 : .6)) { t.path.shift(); t.stuck=0; }
        else {
          p.yaw = Math.atan2(-dx,-dz); p.botControls.KeyW = true; p.botControls.Space = next.y > p.position.y+.25;
          const world = this.game.world;
          const onLadder = [
            world.getVoxel(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z)),
            world.getVoxel(Math.floor(p.position.x + 0.3), Math.floor(p.position.y), Math.floor(p.position.z)),
            world.getVoxel(Math.floor(p.position.x - 0.3), Math.floor(p.position.y), Math.floor(p.position.z)),
            world.getVoxel(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z + 0.3)),
            world.getVoxel(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z - 0.3))
          ].includes(BLOCKS.LADDER);

          if (onLadder && next.y > p.position.y) {
            p.velocity.y = 2.5;
            p.botControls.KeyW = true;
            p.botControls.Space = true;
          } else if (p.inWater || world.getVoxel(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z)) === BLOCKS.WATER) {
            p.botControls.Space = true;
          }
          if (distance(p.position,t.lastPosition)<.01) t.stuck+=dt; else t.stuck=0;
          t.lastPosition.copy(p.position);
          if(t.stuck>3) throw new Error('Movement is blocked; bot stopped rather than teleporting.');
        }
        return;
      }
      if (t.survivalWalk) { t.survivalWalk = false; t.phase = 'act'; t.elapsed = 0; return; }
      if (t.collect) {
        const c=t.collect;
        // Walk into the cleared ore cell only when it has safe support, so the
        // ordinary entity pickup code collects drops without awarding free items.
        if (Math.hypot(p.position.x-c.x-.5,p.position.z-c.z-.5)>1 && !this.passable(this.game.world.getVoxel(c.x,c.y-1,c.z)) && !this.hazard(this.game.world.getVoxel(c.x,c.y-1,c.z)) && this.passable(this.game.world.getVoxel(c.x,c.y+1,c.z))) {
          this.search(cell(c.x,c.y,c.z)); t.collect=null; return;
        }
        t.collect=null;
      }
      if (t.command.type === 'mine') {
        if (t.pickupWait > 0) { t.pickupWait -= dt; return; }
        if(t.mined >= (t.command.count || 3)) {
          // Collect what was mined before calling it done: a log cut from the top of a trunk lands on the canopy,
          // and "Mined 15" with one log in the inventory is not what a player means by collecting the logs.
          const swept = this.sweepFightDrops(t, 16, dt, t.dropIds);
          if (swept === 'none') this.finish(true, `Mined ${t.mined} ${t.command.block} blocks using player controls.`);
        }
        else if(t.target && this.game.world.getVoxel(t.target.x,t.target.y,t.target.z)!==BLOCKS.AIR && (t.resourceIds?.has(this.game.world.getVoxel(t.target.x,t.target.y,t.target.z)) || !this.passable(this.game.world.getVoxel(t.target.x,t.target.y,t.target.z)))) { t.dig={...t.target,blockId:this.game.world.getVoxel(t.target.x,t.target.y,t.target.z),ore:true}; }
        else this.beginScan();
      } else if(t.command.type==='goto') {
        // The last leg's path ends on the goal (a portal on the way may carry the player off: still arrived).
        if (t.finalLeg) this.finish(true,'Arrived at the destination.');
        else if ((t.legs = (t.legs || 0) + 1) > 16) throw new Error('No safe walking path to the destination.');
        else t.phase = 'start';
      }
      else t.phase='start';
    } catch(e) { this.finish(false,e.message); }
  }
  /**
   * Fight another player in a shared world through the real attack path: walk up, aim at the chest, and swing at a
   * full charge (attackCooldown.js) -- jumping first for a critical hit, or sprinting in for a sprint-knockback hit and
   * letting go of forward afterwards (the W-tap), as Tutorial:PvP describes. It counts the swings that reached the
   * other player; the host decides what each does.
   */
  tickPvp(t, dt) {
    const p = this.game.player, sync = this.game.worldSync;
    const peers = [...(sync?.remotePlayers?.remotePlayers?.values() ?? [])];
    const wanted = t.command.player?.toLowerCase();
    const target = peers.filter((peer) => !wanted || peer.name?.toLowerCase() === wanted)
      .sort((a, b) => distance(a.currentPos, p.position) - distance(b.currentPos, p.position))[0];
    if (!target) throw new Error(wanted ? `${t.command.player} is not here.` : 'No other player is here.');
    t.landed ??= 0; t.swings ??= 0; t.waitForward ??= 0;
    if (t.landed >= (t.command.hits ?? 5)) { this.finish(true, `Landed ${t.landed} hits on ${target.name}.`); return; }
    const best = this.findBestWeapon();
    if (best) this.equip((i) => i === best);
    const at = target.currentPos;
    this.lookAt({ x: at.x, y: at.y + 1.2, z: at.z });
    const range = Math.hypot(at.x - p.position.x, at.z - p.position.z);
    const held = this.game.inventory?.getActiveItem?.();
    const charged = (p.secondsSinceSwing ?? Infinity) >= cooldownSeconds(held && !held.isBlock ? held.id : null);
    const style = t.command.style ?? 'plain';
    // The W-tap: after a sprint hit, forward is let go for a moment so the next sprint can start.
    if (t.waitForward > 0) { t.waitForward -= dt; return; }
    if (range > 2.4) {
      p.botControls.KeyW = true;
      if (style === 'sprint' || range > 6) p.botControls.ControlLeft = true;
      return;
    }
    if (style === 'sprint') { p.botControls.KeyW = range > 1.2; p.botControls.ControlLeft = true; }
    if (!charged) return;
    if (style === 'crit') {
      // Swing on the way down from a jump.
      if (p.onGround) { p.botControls.Space = true; return; }
      if (!(p.velocity.y < 0)) return;
    }
    if (style === 'sprint' && !p.isSprinting) { p.botControls.KeyW = true; return; }
    t.pvpSwing = target.peerId;
  }
  afterRaycast() {
    if (this.task?.pvpSwing) {
      const p = this.game.player, before = p.secondsSinceSwing;
      const wasSprinting = p.isSprinting;
      if (this.game.handleLeftClick) this.game.handleLeftClick();
      this.task.swings++;
      // handleLeftClick restarts the cooldown only when the swing reached a player.
      if (p.secondsSinceSwing === 0 && before !== 0) {
        this.task.landed++;
        if (wasSprinting) this.task.waitForward = 0.15;
      }
      this.task.pvpSwing = null;
      return;
    }
    if (this.task && SURVIVAL_ACTIONS.includes(this.task.command.type)) {
      try { this.survival.afterRaycast(this.task); } catch(e) { this.finish(false,e.message); }
      return;
    }
    if (this.task?.attackTarget) {
      if (this.game.targetMob === this.task.attackTarget || !this.game.targetMob) {
        if (this.game.handleLeftClick) this.game.handleLeftClick();
        else if (this.game.mobs?.damageMob) {
          this.game.mobs.damageMob(this.task.attackTarget, 4, this.game.player.position, false, this.game.player);
        }
      }
      this.task.attackTarget = null;
    }
    const dig = this.task?.dig, target=this.game.targetBlock;
    if (!dig || !target || this.task.aimedDig!==key(dig)) return;
    if (key(dig)!==key(target)) {
      if (this.task.command.type !== 'mine') return;
      if (target.y < Math.floor(this.game.player.position.y) || this.hazard(target.blockId) || BLOCK_DEFS[target.blockId]?.hardness >= 99999 || !this.toolFor(target.blockId)) { this.finish(false, 'Ore is obstructed by a block that cannot be safely mined from here.'); return; }
      this.task.dig={...target,ore:!!this.task.resourceIds?.has(target.blockId)};this.game.miningTime=0;
      return;
    }
    this.game.isMouseDown=true;
    if(this.game.player.gamemode==='creative') this.game.breakTargetBlock();
  }
  async runTest(command) {
    const start = this.game.player.position.clone();
    let result;
    if(command.test==='movement') {
      result=await this.run({type:'goto',position:[Math.floor(start.x)+2,Math.floor(start.y),Math.floor(start.z)]});
      const moved=this.game.player.position.distanceTo(start)>1;
      if(result.ok) { const back=await this.run({type:'goto',position:start.toArray()}); result={...back,ok:back.ok&&moved,message:back.ok&&moved?'PASS: walking moved the player and returned to the start.':'FAIL: movement assertion failed.'}; }
    } else if(command.test==='mining') {
      result=await this.run({...command,type:'mine',count:command.count || 1});
      const pickedUp=Object.values(result.collected || {}).some(n=>n>0);
      result={...result,ok:result.ok&&(this.game.player.gamemode!=='survival'||pickedUp),message:result.ok ? (this.game.player.gamemode==='survival'&&!pickedUp?'FAIL: blocks broke but no drops reached inventory.':'PASS: mining completed through the gameplay pipeline.') : `FAIL: ${result.message}`};
    } else throw new Error('Supported live tests: movement and mining <block>.');
    this.report.push(result); this.report=this.report.slice(-50); this.lastResult=result; this.log(result.message,result.ok?'success':'warning'); return result;
  }
  inventoryCount() { return [...(this.game.inventory?.hotbar || []),...(this.game.inventory?.storage || [])].reduce((sum,i)=>sum+(i?.count || 0),0); }
  itemCount(id) { return [...(this.game.inventory?.hotbar || []),...(this.game.inventory?.storage || [])].reduce((sum,i)=>sum+((i && (i.id===id || this.survival?.sameItem(i.id, id)))?i.count:0),0); }
  async runScenario({commands, assertions=[]}) {
    if(!Array.isArray(commands)||!commands.length||commands.length>32) throw new Error('A scenario needs 1â€“32 commands.');
    commands=commands.map(validatePlayerCommand);
    const results=[];
    for(const command of commands) {
      let result;
      try {
        result = await this.run(command);
      } catch (err) {
        result = { ok: false, message: err?.message || String(err) };
      }
      results.push(result);
      if(!result.ok) break;
    }
    const checks=assertions.map(a=>({name:a.name,ok:!!a.check(this.game,this)}));
    return {ok:results.every(r=>r.ok)&&checks.every(c=>c.ok),results,checks};
  }
}


