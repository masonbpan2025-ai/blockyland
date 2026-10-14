// Browser-side helpers for the smithing suite.
//
// Runs inside `page.evaluate`, like the other harnesses. The action under test is the bot's own `smith`
// handling, which loads the real smithing table's slots and then uses the table's own take-output rule.
// Evidence is read from the real inventory, the real table slots and the player's experience, never from
// the bot's success string.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

/** Where the disposable fixture puts its smithing table. Inside the player's 4.5-block reach. */
export const TABLE = [2, 1, 0];

export async function createSmithHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  function stacks() {
    return [...game.inventory.hotbar, ...game.inventory.storage];
  }

  function count(id) {
    return stacks().reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  /** The inventory as plain data: id, count, and the parts of a stack a smithing result must carry. */
  function items() {
    return stacks().filter(Boolean).map((s) => ({
      id: s.id, count: s.count,
      trim: s.trim ? { ...s.trim } : null,
      enchantments: s.enchantments ? s.enchantments.map((e) => ({ ...e })) : null,
      durability: s.durability ?? null,
      maxDurability: s.maxDurability ?? null,
      customName: s.customName ?? null,
      repairCost: s.repairCost ?? null,
    }));
  }

  function snapshot() {
    const ui = game.ui;
    return {
      mode: game.player.gamemode,
      items: items(),
      held: stacks().reduce((out, s) => {
        if (s) out[s.id] = (out[s.id] ?? 0) + s.count;
        return out;
      }, {}),
      slots: {
        template: ui.smithingTemplateItem ? ui.smithingTemplateItem.id : null,
        base: ui.smithingBaseItem ? ui.smithingBaseItem.id : null,
        addition: ui.smithingAdditionItem ? ui.smithingAdditionItem.id : null,
      },
      cursor: game.inventory.cursorItem ? { id: game.inventory.cursorItem.id } : null,
      xpLevel: game.player.xpLevel ?? 0,
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
    };
  }

  /** A smithing table within reach, and the player standing next to it. */
  function placeTable({ at = TABLE, playerAt = [0.5, 1, 0.5] } = {}) {
    game.world.setVoxel(at[0], at[1], at[2], BLOCKS.SMITHING_TABLE);
    game.player.position.set(playerAt[0], playerAt[1], playerAt[2]);
    game.player.velocity.set(0, 0, 0);
    return { at, playerAt, voxel: game.world.getVoxel(at[0], at[1], at[2]), expected: BLOCKS.SMITHING_TABLE };
  }

  /** Empty everything and set the world the case needs. `table: false` removes the station. */
  function reset({ gameMode = 'creative', cheats = true, table = true } = {}) {
    game.inventory.clearAll();
    game.inventory.cursorItem = null;
    if (game.ui) {
      game.ui.smithingTemplateItem = null;
      game.ui.smithingBaseItem = null;
      game.ui.smithingAdditionItem = null;
    }
    game.player.keys = {};
    game.player.botControls = null;
    game.player.xpLevel = 30;
    game.applyWorldSettings({ gameMode, cheats });
    game.world.setVoxel(TABLE[0], TABLE[1], TABLE[2], BLOCKS.AIR);
    if (table) placeTable();
    else game.player.position.set(0.5, 1, 0.5);
    return {
      mode: game.player.gamemode,
      voxel: game.world.getVoxel(TABLE[0], TABLE[1], TABLE[2]),
      expected: BLOCKS.SMITHING_TABLE,
      table,
    };
  }

  /** Give the player plain items by id, as setup for the smith under test. */
  function give(id, count = 1) {
    game.inventory.addItem(id, false, count);
    return count;
  }

  /** Put a whole stack straight into the first empty hotbar slot, for a piece that carries a trim or enchantments. */
  function giveStack(stack) {
    const slot = game.inventory.hotbar.findIndex((s) => !s);
    if (slot < 0) throw new Error('No empty hotbar slot for the setup stack.');
    game.inventory.hotbar[slot] = { isBlock: false, count: 1, ...stack };
    return slot;
  }

  /**
   * Run one bot smith and capture the before/after state, the bot result and any exception.
   *
   * `BotSurvival.tick` throws for a refusal, so the rejection is recorded as the error, and a refused smith is
   * expected to leave the inventory exactly as it found it.
   */
  async function smith(action, { maxTicks = 400 } = {}) {
    const before = snapshot();
    let result = null, error = null, steps = 0;
    let pending;
    try {
      pending = game.playerBot.run({ type: 'smith', ...action });
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
      key: `smith|${action.template}|${action.base}|${action.addition}|${observed.length}`,
      action, ok, message, error, steps,
      heldBefore: before.held, heldAfter: row.after.held,
      slotsAfter: row.after.slots, cursorAfter: row.after.cursor,
    });
    return row;
  }

  return {
    fixture, game, observed, snapshot, reset, smith, give, giveStack, count, items, placeTable, TABLE,
    step: (n = 1) => { for (let i = 0; i < n; i++) fixture.step(1 / 30); },
  };
}
