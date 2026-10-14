// Browser-side helpers for the brewing matrix.
//
// Runs inside `page.evaluate`, like `giveHarness.js`. Everything reads the live game: the real brewing
// stand held by `game.brewingManager`, the real `Inventory`, and what the bot's `brew` action actually did.
// The potion result is never taken from the bot's success string -- the inventory and the stand are read.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

/** Where the disposable fixture puts its stand. Inside the player's 4.5-block reach. */
export const STAND = [2, 1, 0];

export async function createBrewHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  /**
   * The stand, read from the manager the bot itself uses.
   *
   * The bot's `brew` handler resolves `game.brewingManager || game.ui.brewingManager` and creates the first
   * one on demand, so the harness reads the same two places rather than keeping its own map of stands.
   */
  function standSnapshot() {
    const bm = game.brewingManager ?? game.ui?.brewingManager ?? null;
    const s = bm?.getStand(...STAND) ?? null;
    return s ? {
      ingredient: s.ingredient ? { id: s.ingredient.id, count: s.ingredient.count } : null,
      bottles: s.bottles.map((b) => (b ? { id: b.id, count: b.count } : null)),
      fuel: s.fuel, maxFuel: s.maxFuel,
      isBrewing: s.isBrewing, brewTimer: s.brewTimer, brewDuration: s.brewDuration,
    } : null;
  }

  function inventoryItems() {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .filter(Boolean)
      .map((s) => ({ id: s.id, isBlock: s.isBlock, count: s.count }));
  }

  function count(id) {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  function snapshot() {
    return {
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      mode: game.player.gamemode,
      items: inventoryItems(),
      stand: standSnapshot(),
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
    };
  }

  /**
   * Put a brewing stand in the world and stand the player next to it.
   *
   * This is fixture setup, not the action under test: the action under test is the bot's `brew`.
   */
  function placeStandAndApproach({ at = STAND, playerAt = [0.5, 1, 0.5] } = {}) {
    game.world.setVoxel(at[0], at[1], at[2], BLOCKS.BREWING_STAND);
    game.player.position.set(playerAt[0], playerAt[1], playerAt[2]);
    game.player.velocity.set(0, 0, 0);
    game.mobiles = game.mobiles;
    return { at, playerAt, voxel: game.world.getVoxel(at[0], at[1], at[2]), expected: BLOCKS.BREWING_STAND };
  }

  /** Empty the inventory, the ground and the stand, and set the world the case needs. */
  function reset({ gameMode = 'creative', cheats = true } = {}) {
    game.inventory.clearAll();
    for (let i = game.entities.droppedItems.length - 1; i >= 0; i--) {
      game.entities.itemVisuals?.release?.(game.entities.droppedItems[i].group);
      game.entities.droppedItems.splice(i, 1);
    }
    game.player.keys = {};
    game.player.botControls = null;
    game.applyWorldSettings({ gameMode, cheats });
    // Drop the stand entirely, so one case cannot inherit another's ingredient, bottles or fuel. A stand
    // only exists once a brew has touched it, so this usually clears nothing and there is nothing to read.
    game.brewingManager?.removeStand?.(...STAND);
    game.ui?.brewingManager?.removeStand?.(...STAND);
    const placed = placeStandAndApproach();
    return { ...placed, mode: game.player.gamemode, settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats }, stand: standSnapshot() };
  }

  /**
   * Run one bot brew and capture the before/after state, the bot result and any exception.
   *
   * The bot's own loop drives the action, so `fixture.step` is used to advance its ticks. Nothing here
   * inspects the result string as evidence of a potion: the inventory and the stand are read directly.
   */
  async function brew(action, { maxTicks = 1200 } = {}) {
    const before = snapshot();
    let result = null, error = null, steps = 0;
    const pending = game.playerBot.run({ type: 'brew', ...action });
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    for (let i = 0; i < maxTicks && !settled; i++) { fixture.step(1 / 30); steps++; await Promise.resolve(); }
    try { result = await pending; } catch (e) { error = e.message; }
    const row = {
      action, before, after: snapshot(), result, error, steps,
      resultIsUndefined: result === undefined,
    };
    observed.push({
      key: `brew|${action.item}|${action.bottle ?? 'water_bottle'}|${observed.length}`,
      action,
      beforeItems: before.items, afterItems: row.after.items,
      standBefore: before.stand, standAfter: row.after.stand,
      ok: result?.ok ?? null, message: result?.message ?? null,
      result, error, steps,
    });
    return row;
  }

  return {
    fixture, game, observed, snapshot, reset, brew, stand: standSnapshot, count,
    inventoryItems, placeStandAndApproach, STAND,
    step: (n = 1) => { for (let i = 0; i < n; i++) fixture.step(1 / 30); },
  };
}
