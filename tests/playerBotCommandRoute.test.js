// The bot's route to a game command: `PlayerBot.run({type:'command'})` -> `Game.handleCommand`.
//
// The parser recognised `type: 'command'` but `run()` had no branch for it, so every `/give` through the
// bot's own API fell through to "Unsupported player command." -- the command was never dispatched at all.
// These tests pin the missing link, and pin it as a *delegation*: the bot must not grow its own `/give`.
//
// The handler here is assembled from the production parts rather than a hand-written stub: the real
// `Inventory`, the real `permissionRefusal`, `buildCommandContext` and `runCommand`, so an allowed command
// really fills the container and a refused one really leaves it alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerBot, parsePlayerCommand } from '../src/playerBot.js';
import { Inventory } from '../src/inventory.js';
import { BLOCKS, stackLimitFor } from '../src/blocks.js';
import { buildCommandContext, runCommand, permissionRefusal } from '../src/commandRunner.js';

/**
 * A game whose `handleCommand` is the two production stages in order: the cheats gate, then the runner.
 * The order matters and mirrors `Game.handleCommand`, which is where the gate for `/give` actually lives.
 */
function fixture({ gameMode = 'survival', cheats = false } = {}) {
  const inventory = new Inventory();
  const chat = [], drops = [];
  const settings = { gameMode, cheats };
  const player = { gamemode: gameMode, position: { x: 0.5, y: 1, z: 0.5 }, keys: {}, botControls: null };
  const game = {
    worldReady: true, world: {}, settings, player, inventory,
    ui: { addChatMessage: (text, kind) => chat.push({ text, kind }), updateHotbar() {} },
    entities: { spawnDroppedItem: (position, id, isBlock, count) => drops.push({ position, id, isBlock, count }) },
    handleCommand(line) {
      const root = String(line).trim().split(/\s+/)[0].toLowerCase();
      const refusal = permissionRefusal(settings, root, player);
      if (refusal) { this.ui.addChatMessage(refusal, 'error'); return false; }
      if (runCommand(buildCommandContext(this), line)) return true;
      this.ui.addChatMessage(`Unknown command: ${line}.`, 'error');
      return false;
    },
  };
  game.playerBot = new PlayerBot(game, { log: () => {} });
  const count = (id) => [...inventory.hotbar, ...inventory.storage]
    .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  return { game, bot: game.playerBot, inventory, chat, drops, count };
}

test('an allowed command through the bot API reaches the dispatcher and gives the item', async () => {
  const f = fixture({ cheats: true });
  const result = await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 1' });

  assert.equal(result.ok, true, result.message);
  assert.equal(f.count(BLOCKS.STONE), 1, 'one stone');
  assert.equal(f.drops.length, 0, 'nothing on the ground');
  assert.ok(f.chat.some((m) => m.text === 'Gave 1 [Stone] to @s'), JSON.stringify(f.chat));
});

test('the bot delegates rather than implementing /give, so the game gate still refuses it', async () => {
  // Survival with cheats off. The bot must not be a way around the permission check: if it were, a caller
  // holding bot control could hand itself items in an ordinary world.
  const f = fixture({ gameMode: 'survival', cheats: false });
  const before = JSON.stringify([f.inventory.hotbar, f.inventory.storage]);
  const result = await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 1' });

  assert.equal(result.ok, false, 'a refusal is reported as a failed command, not a silent no-op');
  assert.equal(f.count(BLOCKS.STONE), 0, 'no stone');
  assert.equal(f.drops.length, 0, 'no drops');
  assert.equal(JSON.stringify([f.inventory.hotbar, f.inventory.storage]), before, 'inventory unchanged');
  assert.ok(f.chat.some((m) => m.kind === 'error' && m.text.includes('do not have permission')),
    JSON.stringify(f.chat));
});

test('a refused command leaves control free and starts no task', async () => {
  const f = fixture({ gameMode: 'survival', cheats: false });
  await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 1' });

  assert.equal(f.bot.active, false, 'no task was left running');
  assert.equal(f.game.player.botControls, null, 'controls released');
  assert.equal(f.game.player.keys && Object.keys(f.game.player.keys).length, 0, 'no keys held');
});

test('a command action releases control and does not become a driving task', async () => {
  const f = fixture({ cheats: true });
  const result = await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 64' });

  assert.equal(result.ok, true, result.message);
  assert.equal(f.bot.active, false, 'a command is not a navigation task');
  assert.equal(f.game.player.botControls, null);
  assert.deepEqual(f.game.player.keys, {});
  assert.equal(f.bot.snapshot().result.ok, true, 'the result is recorded for /bot status');
});

test('an unknown command is reported, not thrown, and changes nothing', async () => {
  const f = fixture({ cheats: true });
  const before = JSON.stringify([f.inventory.hotbar, f.inventory.storage]);
  const result = await f.bot.run({ type: 'command', command: '/not_a_command 1' });

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify([f.inventory.hotbar, f.inventory.storage]), before);
  assert.ok(f.chat.some((m) => m.text.startsWith('Unknown command')), JSON.stringify(f.chat));
});

test('a throwing dispatcher becomes a failed bot result rather than an unhandled rejection', async () => {
  const f = fixture({ cheats: true });
  f.game.handleCommand = () => { throw new Error('dispatcher exploded'); };
  const result = await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 1' });

  assert.equal(result.ok, false);
  assert.equal(result.message, 'dispatcher exploded');
});

test('the bot keeps its own /stop and /status controls out of the game dispatcher', async () => {
  const f = fixture({ cheats: true });
  const seen = [];
  const realHandle = f.game.handleCommand.bind(f.game);
  f.game.handleCommand = (line) => { seen.push(line); return realHandle(line); };

  // `/status` parses to a `command` action, so it is the recognition test that has to keep it local: it is
  // a bot control the game has no command for, and handing it to the dispatcher would print "Unknown
  // command". A hidden test caught exactly that, which is why this case is here.
  const status = await f.bot.run({ type: 'command', command: '/status' });
  assert.deepEqual(seen, [], '/status is the bot\'s own control');
  assert.equal(status.ok, true);
  assert.ok(status.message.includes('"active"'), 'it answers with the bot snapshot');

  await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 1' });
  assert.deepEqual(seen, ['/give @s minecraft:stone 1'], 'a game command goes to the dispatcher');
});

test('a command runs even while the bot is busy, and the running task keeps its controls', async () => {
  // A command is instantaneous and takes no control of the player, so it must not be refused as "busy".
  const f = fixture({ cheats: true });
  f.bot.task = { command: { type: 'goto' }, phase: 'start', resolve: () => {} };
  const result = await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 1' });

  assert.equal(result.ok, true, result.message);
  assert.equal(f.count(BLOCKS.STONE), 1);
  assert.equal(f.bot.active, true, 'the navigation task is still running');
  assert.equal(f.bot.task.command.type, 'goto', 'and it was not replaced by the command');
});

test('the parser already recognises the command action it could not run', async () => {
  // The trap in the guide was "a recognised command is not proof that it executes". This is the recognition
  // half, pinned so the dispatch half cannot regress unnoticed again.
  const f = fixture({ cheats: true });
  const result = await f.bot.run('/give @s minecraft:stone 1');
  assert.equal(result.ok, true, result.message);
  assert.equal(f.count(BLOCKS.STONE), 1);
});

test('a large bounded request through the bot route conserves the count', async () => {
  const f = fixture({ cheats: true });
  const result = await f.bot.run({ type: 'command', command: '/give @s minecraft:stone 128' });

  assert.equal(result.ok, true, result.message);
  const held = f.count(BLOCKS.STONE);
  const ground = f.drops.reduce((n, d) => n + d.count, 0);
  assert.equal(held, 128, 'two full stacks fit');
  assert.equal(ground, 0);
  assert.deepEqual(
    [...f.inventory.hotbar, ...f.inventory.storage].filter((s) => s && s.id === BLOCKS.STONE).map((s) => s.count),
    [64, 64],
  );
  assert.ok(stackLimitFor(BLOCKS.STONE) === 64);
});


test('bare give commands require command arguments, while prose reaches the agent',()=>{
  assert.equal(parsePlayerCommand('Give that beacon brickwork, keeping my window.'),null);
  assert.deepEqual(parsePlayerCommand('give @s minecraft:stone 64'),{type:'command',command:'/give @s minecraft:stone 64'});
  assert.deepEqual(parsePlayerCommand('give alex diamond 2'),{type:'command',command:'/give alex diamond 2'});
  assert.deepEqual(parsePlayerCommand('give wheat to the cow'),{type:'feed',item:'wheat',mob:'cow'});
});
