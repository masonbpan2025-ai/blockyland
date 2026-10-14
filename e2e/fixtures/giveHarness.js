// Shared browser-side helpers for the /give matrix.
//
// These run inside `page.evaluate`, so they are imported from the page rather than from Node. Everything
// reads the live game: inventory, dropped entities, player controls and the chat messages the dispatcher
// actually produced. Nothing here inspects items through `resolveItem`, because using the parser as its own
// oracle would make a wrong parse look correct.
//
// `createGiveHarness` is deliberately not a fixture: `createSurvivalFixture` owns the disposable world, and
// this only adds observation and reset around it, so a failure here cannot hide a fixture problem.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

export async function createGiveHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  /** Inventory quantities for every compartment, by item id, so a refusal can be checked in full. */
  function compartments() {
    const inv = game.inventory;
    const flat = (list) => (list ?? []).map((s) => (s ? { id: s.id, isBlock: s.isBlock, count: s.count, enchantments: s.enchantments ?? null } : null));
    return {
      hotbar: flat(inv.hotbar), storage: flat(inv.storage),
      armor: inv.armor ? { ...inv.armor } : null, offhand: inv.offhand ? { ...inv.offhand } : null,
      cursor: inv.cursorItem ? { ...inv.cursorItem } : null,
      grid2: flat(inv.craft2x2), grid3: flat(inv.craft3x3),
    };
  }

  function snapshot() {
    const c = compartments();
    return {
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      mode: game.player.gamemode,
      inventory: c,
      drops: game.entities.droppedItems.map((d) => ({
        id: d.itemType, isBlock: d.isBlock, count: d.count,
        position: d.group.position.toArray(),
        pickupDelay: d.pickupDelay, age: Number(d.age?.toFixed?.(3) ?? d.age ?? 0),
        enchantments: d.enchantments ?? null, itemData: d.itemData ?? null,
      })),
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
      terminalOpen: game.ui.isGeminiOpen(),
    };
  }

  /** Total held in the inventory compartments `/give` fills, by item id. */
  function quantity(state, id) {
    return [...state.inventory.hotbar, ...state.inventory.storage]
      .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }
  function groundQuantity(state, id) {
    return state.drops.reduce((n, d) => n + (d.id === id ? d.count : 0), 0);
  }
  /** The stacks of one item, largest first: the shape that shows whether stacking obeyed the limit. */
  function stacks(state, id) {
    return [...state.inventory.hotbar, ...state.inventory.storage]
      .filter((s) => s && s.id === id).map((s) => s.count).sort((a, b) => b - a);
  }
  /** Ground stacks of one item, largest first. */
  function groundStacks(state, id) {
    return state.drops.filter((d) => d.id === id).map((d) => d.count).sort((a, b) => b - a);
  }

  /** Dispose every dropped item and return the player to the fixture's starting spot. */
  function clearDrops() {
    // Splice the entity list the game itself owns rather than replacing the array, and release each visual.
    for (let i = game.entities.droppedItems.length - 1; i >= 0; i--) {
      game.entities.itemVisuals?.release?.(game.entities.droppedItems[i].group);
      game.entities.droppedItems.splice(i, 1);
    }
  }

  /**
   * Empty the inventory, dispose every dropped item, and set the world the case needs.
   *
   * The settings are applied here rather than assumed from a previous case: the fixture starts as Survival
   * with cheats OFF, and a case that was refused because of a stale settings value would otherwise be
   * misreported as a `/give` failure.
   */
  function reset({ gameMode = 'survival', cheats = true } = {}) {
    game.inventory.clearAll();
    clearDrops();
    game.player.position.set(0.5, 1, 0.5);
    game.player.velocity.set(0, 0, 0);
    game.player.keys = {};
    game.player.botControls = null;
    game.applyWorldSettings({ gameMode, cheats });
  }

  /**
   * Apply a settings change and report back exactly what the game stored.
   *
   * The gate reads `game.settings`, so a test that assumes its own request took effect can attribute a
   * permission refusal to the wrong cause. The stored value is recorded as evidence instead.
   */
  function setWorld({ gameMode = 'survival', cheats = true } = {}) {
    game.applyWorldSettings({ gameMode, cheats });
    return {
      requested: { gameMode, cheats },
      stored: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      playerGamemode: game.player.gamemode,
    };
  }

  /**
   * Run one command on one route and capture the full before/after state, plus the chat the dispatcher
   * produced and any exception. Does not tick the simulation, so drops are observed before pickup.
   */
  async function observe(command, route = 'GAME_DISPATCH') {
    const before = snapshot();
    const messages = [];
    const original = game.ui.addChatMessage;
    let result = null, error = null, thrown = null;
    game.ui.addChatMessage = function (text, kind) { messages.push({ text, kind }); };
    try {
      if (route === 'BOT_API') result = await game.playerBot.run({ type: 'command', command });
      else if (route === 'GAME_DISPATCH') result = game.handleCommand(command);
      else { thrown = new Error(`Unknown route ${route}`); error = thrown.message; }
    } catch (e) { error = e.message; }
    finally { game.ui.addChatMessage = original; }
    const row = {
      command, route, before, after: snapshot(), messages, result,
      resultIsUndefined: result === undefined, error,
    };
    // The log keeps a compact, plain-data summary. A full snapshot carries the live player's control and
    // entity objects, which is both large and not reliably serializable across the page boundary. `key`
    // makes the artifact mergeable across worker restarts instead of being overwritten by the last one.
    observed.push({
      key: `${route}|${command}|${observed.length}`,
      command, route, ...summarize(row),
    });
    return row;
  }

  /**
   * Seed a full 36-slot inventory, optionally leaving one slot as a partial stone stack.
   *
   * A full inventory is always prepared through `reset()` first, so the world settings are the case's own
   * rather than whatever the previous case left behind -- a failed assertion that skipped its restore must
   * not be able to change a later case's meaning. `reset()` also clears the ground, because a test that only
   * emptied the slots would run against the previous case's drops and report a phantom overflow.
   */
  function fillInventory({ stone = null, gameMode = 'survival', cheats = true } = {}) {
    reset({ gameMode, cheats });
    game.inventory.hotbar = Array.from({ length: 9 }, () => ({ id: BLOCKS.DIRT, isBlock: true, count: 64 }));
    game.inventory.storage = Array.from({ length: 27 }, () => ({ id: BLOCKS.DIRT, isBlock: true, count: 64 }));
    if (stone !== null) game.inventory.hotbar[0] = { id: BLOCKS.STONE, isBlock: true, count: stone };
  }

  /**
   * Re-run the same command from a clean baseline, as the guide requires of every unexpected result.
   *
   * `setup` is applied to both runs, so a case that needs a full inventory reproduces on a full inventory
   * rather than on whatever the previous case left behind. The second run is a fresh `reset()` plus the same
   * setup and the same route; a reproduction that depends on leftover state is not a reproduction. The
   * world settings are part of the setup, because the same command means different things in Creative.
   */
  async function reproduce(command, route = 'GAME_DISPATCH', { setup = null, world = { gameMode: 'survival', cheats: true } } = {}) {
    const prepare = () => {
      if (setup === 'full') fillInventory(world);
      else if (setup === 'partial') fillInventory({ ...world, stone: 63 });
      else reset(world);
    };
    prepare();
    const first = await observe(command, route);
    prepare();
    const second = await observe(command, route);
    return { command, route, setup, world, first: summarize(first), second: summarize(second) };
  }

  /** A compact view of a row: what was delivered, where it went, and what was said. */
  function summarize(row) {
    const ids = new Set([
      ...row.after.inventory.hotbar.filter(Boolean).map((s) => s.id),
      ...row.after.inventory.storage.filter(Boolean).map((s) => s.id),
      ...row.after.drops.map((d) => d.id),
    ]);
    const held = {};
    const ground = {};
    for (const id of ids) {
      held[id] = (held[id] ?? 0) + quantity(row.after, id);
      ground[id] = (ground[id] ?? 0) + groundQuantity(row.after, id);
    }
    return {
      heldByItem: held, groundByItem: ground,
      stacks: Object.fromEntries([...ids].map((id) => [id, stacks(row.after, id)])),
      groundStacks: Object.fromEntries([...ids].map((id) => [id, groundStacks(row.after, id)])),
      drops: row.after.drops.map((d) => ({ id: d.id, count: d.count })),
      messages: row.messages.map((m) => ({ text: m.text, kind: m.kind })),
      result: row.result, error: row.error,
    };
  }

  return {
    fixture, game, observed, snapshot, reset, setWorld, observe, reproduce, summarize, compartments,
    quantity, groundQuantity, stacks, groundStacks, fillInventory,
    step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) fixture.step(dt); },
  };
}

/** Which registry id a `/give` item argument is supposed to name, per the pinned test contract. */
export const EXPECTED_IDS = {
  'minecraft:stone': BLOCKS.STONE,
  'minecraft:diamond_sword': 'diamond_sword',
  'minecraft:ender_pearl': 'ender_pearl',
};
