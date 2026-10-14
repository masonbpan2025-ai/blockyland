// Browser-side helpers for the crafting matrix.
//
// Runs inside `page.evaluate`, like the other harnesses. The action under test is the bot's own `craft`
// handling, which loads its own crafting grid and then defers to the real `Inventory.checkCrafting` /
// `takeCraftResult`. Evidence is read from the real inventory and the real grids -- never from the bot's
// success string.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

/** Where the disposable fixture puts its crafting table. Inside the player's 4.5-block reach. */
export const TABLE = [2, 1, 0];

export async function createCraftHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  function inventoryItems() {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .filter(Boolean)
      .map((s) => ({ id: s.id, isBlock: s.isBlock, count: s.count }));
  }

  function count(id) {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  /** Items held, keyed by id, so a case can assert on the whole inventory rather than one stack. */
  function held() {
    const out = {};
    for (const s of [...game.inventory.hotbar, ...game.inventory.storage]) {
      if (!s) continue;
      out[s.id] = (out[s.id] ?? 0) + s.count;
    }
    return out;
  }

  function snapshot() {
    return {
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      mode: game.player.gamemode,
      items: inventoryItems(),
      held: held(),
      // The grids and the cursor, because `craft` refuses to run over a dirty workspace and a failed craft
      // must leave nothing behind in either.
      grid2x2: game.inventory.craft2x2.map((s) => (s ? { id: s.id, count: s.count } : null)),
      grid3x3: game.inventory.craft3x3.map((s) => (s ? { id: s.id, count: s.count } : null)),
      cursor: game.inventory.cursorItem ? { id: game.inventory.cursorItem.id, count: game.inventory.cursorItem.count } : null,
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
      dropped: game.entities.droppedItems.map((d) => ({ id: d.itemType, count: d.count })),
    };
  }

  /** A crafting table within reach, and the player standing next to it. */
  function placeTable({ at = TABLE, playerAt = [0.5, 1, 0.5] } = {}) {
    game.world.setVoxel(at[0], at[1], at[2], BLOCKS.CRAFTING_TABLE);
    game.player.position.set(playerAt[0], playerAt[1], playerAt[2]);
    game.player.velocity.set(0, 0, 0);
    return { at, playerAt, voxel: game.world.getVoxel(at[0], at[1], at[2]), expected: BLOCKS.CRAFTING_TABLE };
  }

  /** Empty everything and set the world the case needs. `table: false` removes the station. */
  function reset({ gameMode = 'creative', cheats = true, table = true, fill = null } = {}) {
    game.inventory.clearAll();
    for (let i = game.entities.droppedItems.length - 1; i >= 0; i--) {
      game.entities.itemVisuals?.release?.(game.entities.droppedItems[i].group);
      game.entities.droppedItems.splice(i, 1);
    }
    game.player.keys = {};
    game.player.botControls = null;
    game.applyWorldSettings({ gameMode, cheats });
    game.world.setVoxel(TABLE[0], TABLE[1], TABLE[2], BLOCKS.AIR);
    if (table) placeTable();
    else game.player.position.set(0.5, 1, 0.5);
    // `fill` seeds the inventory as setup, which is how the full-inventory cases are built.
    if (fill) {
      game.inventory.hotbar = Array.from({ length: 9 }, () => ({ id: BLOCKS.DIRT, isBlock: true, count: 64 }));
      game.inventory.storage = Array.from({ length: 27 }, () => ({ id: BLOCKS.DIRT, isBlock: true, count: 64 }));
      for (const [slot, stack] of Object.entries(fill)) game.inventory.hotbar[Number(slot)] = { ...stack };
    }
    return {
      mode: game.player.gamemode,
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      voxel: game.world.getVoxel(TABLE[0], TABLE[1], TABLE[2]),
      expected: BLOCKS.CRAFTING_TABLE,
      table,
    };
  }

  /** Give the player items without a command, as setup for the craft under test. */
  function give(id, n = 1, isBlock = typeof id === 'number') {
    game.inventory.addItem(id, isBlock, n);
    return count(id);
  }

  /**
   * Run one bot craft and capture the before/after state, the bot result and any exception.
   *
   * A short tick budget: crafting is instant, and the cases that need more than one craft ask for a count
   * rather than ticking longer.
   */
  async function craft(action, { maxTicks = 400 } = {}) {
    const before = snapshot();
    let result = null, error = null, steps = 0;
    // `BotSurvival.craft` THROWS for a refusal ("No usable recipe ...", "Inventory is full ...") rather than
    // resolving with `ok: false`, so the rejection is the refusal and has to be recorded as one. Reading only
    // the resolved value would have reported every refusal as `ok: undefined`.
    let pending;
    try {
      pending = game.playerBot.run({ type: 'craft', ...action });
    } catch (e) {
      error = e.message;
      pending = Promise.reject(e);
    }
    let settled = false;
    const settledPromise = pending.then(
      (v) => { settled = true; result = v; },
      (e) => { settled = true; error = e.message; },
    );
    for (let i = 0; i < maxTicks && !settled; i++) { fixture.step(1 / 30); steps++; await Promise.resolve(); }
    await settledPromise.catch(() => {});
    const ok = error ? false : (result?.ok ?? null);
    const message = error ? error : (result?.message ?? null);
    const row = { action, before, after: snapshot(), result, error, steps, ok, message };
    observed.push({
      key: `craft|${action.item}|${action.count ?? 1}|${observed.length}`,
      action,
      heldBefore: before.held, heldAfter: row.after.held,
      grid2x2After: row.after.grid2x2, grid3x3After: row.after.grid3x3, cursorAfter: row.after.cursor,
      ok, message,
      result, error, steps,
    });
    return row;
  }

  return {
    fixture, game, observed, snapshot, reset, craft, give, count, held, placeTable, TABLE,
    step: (n = 1) => { for (let i = 0; i < n; i++) fixture.step(1 / 30); },
  };
}
