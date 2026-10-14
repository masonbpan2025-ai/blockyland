import * as THREE from 'three';
import AStar from './vendor/mineflayer-pathfinder/astar.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { harvestsNothing, breakTimeSeconds } from './miningRules.js';
import { baseBlockDrop } from './blockDrops.js';
import { BotSurvival, SURVIVAL_ACTIONS, validateSurvivalAction, itemId } from './playerBotSurvival.js';
import { buildCommandContext, runCommand, permissionRefusal } from './commandRunner.js';

const key = p => `${p.x},${p.y},${p.z}`;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const cell = (x, y, z, cost = 1, dig = []) => ({ x, y, z, cost, dig, hash: `${x},${y},${z}` });

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

  // Explicit or prefixed game command (e.g. /give, /setblock, /time, /weather, /gamemode, /summon, /help, /clear, etc.)
  const cmdMatch = text.match(/^(?:run\s+|execute\s+)?(?:command\s+)?(\/[a-z_]+(?:\s+.*)?)$/i) ||
                   text.match(/^(?:run\s+|execute\s+)?command\s+([a-z_]+(?:\s+.*)?)$/i) ||
                   text.match(/^(give\s+(?:@[pares](?:\[[^\]]*\])?|\w+)\s+[\w:]+(?:\[.*\])?(?:\s+\d+)?|setblock\s+.*|time\s+set.*|weather\s+.*|gamemode\s+.*|summon\s+.*|locate\s+.*|show_mobs(?:\s+.*)?|help(?:\s+.*)?|clear(?:\s+.*)?)$/i);
  if (cmdMatch) {
    let cmdStr = cmdMatch[1].trim();
    if (!cmdStr.startsWith('/')) cmdStr = '/' + cmdStr;
    return { type: 'command', command: cmdStr };
  }

  let action = text.match(/^(craft|eat)\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+)$/);
  if (action) return {type:action[1],item:action[3].trim().replace(/\s+/g, '_'),count:Number(action[2] || 1)};
  let tillMatch = text.match(/^till(?:\s+(?:dirt|grass|soil))?(?:\s+at)?\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (tillMatch) return { type: 'till', position: [Number(tillMatch[1]), Number(tillMatch[2]), Number(tillMatch[3])] };
  let brewMatch = text.match(/^brew\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?)(?:\s+into\s+(?:(\d+)\s+)?(?:a\s+|an\s+|the\s+)?(.+?))?\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (brewMatch) return { type: 'brew', count: Number(brewMatch[1] || 1), item: brewMatch[2].trim().replace(/\s+/g, '_'), bottleCount: Number(brewMatch[3] || 3), bottle: (brewMatch[4] || 'water_bottle').trim().replace(/\s+/g, '_'), position: [Number(brewMatch[5]), Number(brewMatch[6]), Number(brewMatch[7])] };
  // `smith <template> on <gear> with <material> at x y z`, every name as its item id with spaces as underscores:
  // `smith netherite upgrade on diamond_chestplate with netherite_ingot at 1 64 1`.
  let smithMatch = text.match(/^smith\s+(.+?)\s+on\s+(.+?)\s+with\s+(.+?)\s+at\s+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)$/);
  if (smithMatch) return { type: 'smith', template: smithMatch[1].trim().replace(/\s+/g, '_'), base: smithMatch[2].trim().replace(/\s+/g, '_'), addition: smithMatch[3].trim().replace(/\s+/g, '_'), position: [Number(smithMatch[4]), Number(smithMatch[5]), Number(smithMatch[6])] };
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
  m = text.match(/^(?:go|walk|move|navigate)(?:\s+(?:me|the player))?\s+to\s+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (m) return { type: 'goto', position: m.slice(1).map(Number) };
  m = text.match(/^(mine|dig|collect|harvest|gather|test mining)\s+(?:(\d+)\s+|some\s+|a\s+|an\s+)?(.+?)(?:\s+for me)?$/);
  if (m) return { type: m[1] === 'test mining' ? 'test' : 'mine', test: 'mining', block: m[3].replace(/\s+ores$/, ' ore').replace(/\s+blocks$/, ''), count: Number(m[2] || (m[1] === 'test mining' ? 1 : 3)) };
  m = text.match(/^(follow|attack|kill|look at)\s+(?:the\s+|a\s+|an\s+)?(.+)$/);
  if (m) return { type: m[1] === 'kill' ? 'attack' : m[1] === 'look at' ? 'look' : m[1], mob: m[2].replace(/\s+/g, '_') };
  m = text.match(/^(?:equip|hold|select)\s+(?:a\s+|an\s+|the\s+)?(.+)$/);
  if (m) return { type: 'equip', item: m[1].replace(/\s+/g, '_') };
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
  if (!command || !['mine','goto','jump','equip','follow','attack','look','feed','test','stop','status','command',...SURVIVAL_ACTIONS].includes(command.type)) throw new Error('Unknown player command. Try "mine some iron ore", "go to 10 64 10", or "test movement".');
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
    if (this.game.player) { this.game.player.botControls = null; this.game.player.keys = {}; }
    this.game.isMouseDown = false; this.game.miningTime = 0;
  }
  stop(reason = 'Stopped by the player.') { if (this.task) this.finish(false, reason); else this.release(); }
  finish(ok, message) {
    const task = this.task;
    this.release(); this.task = null;
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
    if (command.type === 'craft') {
      try { const result=this.survival.craft(command); this.lastResult=result; return Promise.resolve(result); } catch(e) { return Promise.reject(e); }
    }
    if (!['mine', 'goto', 'jump', 'equip', 'follow', 'attack', 'look', 'feed', ...SURVIVAL_ACTIONS].includes(command.type)) return Promise.reject(new Error('Unsupported player command.'));
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
  toolFor(id) {
    if (this.game.player.gamemode !== 'survival') return true;
    const inv = this.game.inventory;
    const choices = [...inv.hotbar, ...(inv.storage || [])].filter(i => i && !i.isBlock && !harvestsNothing(id, ITEMS[i.id], i.id));
    choices.sort((a, b) => breakTimeSeconds(id, ITEMS[a.id], a.id) - breakTimeSeconds(id, ITEMS[b.id], b.id));
    if (choices.length) return this.equip(i => i === choices[0]);
    return !harvestsNothing(id, null, null);
  }
  passable(id) { return id === BLOCKS.AIR || !!BLOCK_DEFS[id] && BLOCK_DEFS[id].solid === false && !this.hazard(id); }
  hazard(id) { return [BLOCKS.WATER, BLOCKS.LAVA, BLOCKS.FIRE, BLOCKS.CACTUS, BLOCKS.MAGMA_BLOCK].filter(v => v !== undefined).includes(id); }
  neighbors(node) {
    const world = this.game.world, origin = this.task.origin;
    const out = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1, -1]) {
        const x = node.x + dx, y = node.y + dy, z = node.z + dz;
        if (Math.abs(x - origin.x) > 32 || Math.abs(z - origin.z) > 32 || Math.abs(y - origin.y) > 24) continue;
        const floor = world.getVoxel(x, y - 1, z);
        if (this.passable(floor) || this.hazard(floor) || floor == null) continue;
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
        if (valid) { out.push(cell(x, y, z, 1 + Math.abs(dy) + dig.length * 8, dig)); break; }
      }
    }
    return out;
  }
  search(target, near = false) {
    const p = this.game.player.position, start = cell(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    this.task.origin = start;
    const goal = { heuristic: n => Math.max(0, distance(n, target) - (near ? 1.5 : 0)), isEnd: n => distance(n, target) <= (near ? 1.5 : .1) && !(near && this.task.command.type === 'mine' && n.x === target.x && n.z === target.z) };
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
    this.task.resourceIds=ids;this.task.scanner = this.scan(ids); this.task.phase = 'scan';
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
      if (SURVIVAL_ACTIONS.includes(t.command.type)) { this.survival.tick(t); return; }
      if (t.command.type === 'jump') { p.botControls.Space = t.elapsed < .2; if (t.elapsed >= .8) this.finish(true, 'Jump completed.'); return; }
      if (['follow', 'attack', 'look', 'feed'].includes(t.command.type)) {
        if (t.command.type === 'feed') {
          this.equip(s => this.survival.sameItem(s?.id, itemId(t.command.item)));
        }
        const mob = this.game.mobs?.mobs?.filter(m => m.type === t.command.mob && m.health > 0).sort((a,b) => distance(a.mesh.position,p.position)-distance(b.mesh.position,p.position))[0];
        if (!mob) {
          if (t.command.type === 'attack' && t.hadMob) {
            // Let the killing blow finish before declaring victory.
            //
            // A mob's drops and its experience are spawned by the DEATH ANIMATION, not by the blow: the game
            // rolls them once `deathTime` passes 0.65 in `updateDeath`. Resolving on the tick a mob's health
            // reaches zero therefore skipped them entirely -- the bot walked away from every kill with nothing
            // on the ground, which is exactly what a drowned farm exists to collect. This waits for the corpse
            // the bot itself killed to leave the mob list, which is where `updateDeath` puts it.
            // Bounded: a harness that never ticks the mob manager leaves the corpse in the list forever, so an
            // unbounded wait would hang the command instead of reporting the kill. 2 s is well past the 0.95 s
            // the animation takes at any frame rate the game runs at.
            const corpse = t.killedMob;
            if (corpse && this.game.mobs?.mobs?.includes(corpse) && corpse.lootDropped !== true && (corpse.deathTime ?? 0) < 0.65) {
              t.deathWait = (t.deathWait || 0) + dt;
              if (t.deathWait < 2.0) return;
            }
            // Sweep up what the kill dropped before declaring victory. Attacking had no collection phase --
            // mining has one -- so wool and meat stayed on the ground: the survival fixture finished with one
            // wool out of three sheep and could not craft a bed from it.
            const drops = (this.game.entities?.droppedItems || [])
              .filter((d) => d?.group?.position && d.age > (d.pickupDelay ?? 1)
                && distance(d.group.position, p.position) < 8)
              .sort((a, b) => distance(a.group.position, p.position) - distance(b.group.position, p.position));
            t.sweeps = (t.sweeps || 0) + 1;
            if (drops.length && t.sweeps < 240) {
              if (!t.path.length) {
                this.search(cell(Math.floor(drops[0].group.position.x), Math.floor(drops[0].group.position.y), Math.floor(drops[0].group.position.z)));
              }
              return;
            }
            this.finish(true, 'Target defeated.');
          } else throw new Error(`No living ${t.command.mob} nearby.`);
          return;
        }
        t.hadMob = true;
        // Remember the target while it is still alive, so its death animation can be awaited after the blow.
        t.killedMob = mob;
        this.lookAt({ ...mob.mesh.position, y: mob.mesh.position.y + (mob.height || 1.5) * .6 });
        if (t.command.type === 'look') { this.finish(true, `Looking at ${t.command.mob}.`); return; }
        const range = distance(mob.mesh.position, p.position);
        if (t.command.type === 'feed' && range < 2.5) {
          t.beforeFeed ??= this.itemCount(t.command.item);
          if (typeof this.game.handleRightClick === 'function') {
            this.game.handleRightClick();
          } else {
            mob.inLove = 30;
            this.game.inventory.consumeActiveItem();
          }
          if (mob.inLove > 0 || this.itemCount(t.command.item) < t.beforeFeed) {
            this.finish(true, `Fed ${t.command.item} to ${t.command.mob}.`);
            return;
          }
        }
        if (t.command.type === 'attack' && range < 2.5) {
          t.attackTimer = (t.attackTimer || 0) - dt;
          if (t.attackTimer <= 0) { t.attackTarget = mob; t.attackTimer = .65; }
          return;
        }
        if (range < 2.5) return;
        if (!t.path.length && t.phase !== 'path') this.search(cell(Math.floor(mob.mesh.position.x),Math.floor(mob.mesh.position.y),Math.floor(mob.mesh.position.z)),true);
      }
      if (t.phase === 'start') {
        if (t.command.type === 'mine') this.beginScan();
        else if (t.command.type === 'goto') this.search(cell(...t.command.position.map(Math.floor)));
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
        if (Math.hypot(dx,dz)<.22 && Math.abs(p.position.y-next.y)<.6) { t.path.shift(); t.stuck=0; }
        else {
          p.yaw = Math.atan2(-dx,-dz); p.botControls.KeyW = true; p.botControls.Space = next.y > p.position.y+.25;
          if (distance(p.position,t.lastPosition)<.01) t.stuck+=dt; else t.stuck=0;
          t.lastPosition.copy(p.position);
          if(t.stuck>3) throw new Error('Movement is blocked; bot stopped rather than teleporting.');
        }
        return;
      }
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
        if(t.mined >= (t.command.count || 3)) this.finish(true, `Mined ${t.mined} ${t.command.block} blocks using player controls.`);
        else if(t.target && this.game.world.getVoxel(t.target.x,t.target.y,t.target.z)!==BLOCKS.AIR && (t.resourceIds?.has(this.game.world.getVoxel(t.target.x,t.target.y,t.target.z)) || !this.passable(this.game.world.getVoxel(t.target.x,t.target.y,t.target.z)))) { t.dig={...t.target,blockId:this.game.world.getVoxel(t.target.x,t.target.y,t.target.z),ore:true}; }
        else this.beginScan();
      } else if(t.command.type==='goto') this.finish(true,'Arrived at the destination.');
      else t.phase='start';
    } catch(e) { this.finish(false,e.message); }
  }
  afterRaycast() {
    if (this.task && SURVIVAL_ACTIONS.includes(this.task.command.type)) {
      try { this.survival.afterRaycast(this.task); } catch(e) { this.finish(false,e.message); }
      return;
    }
    if (this.task?.attackTarget) {
      if (this.game.targetMob === this.task.attackTarget) this.game.handleLeftClick?.();
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


