// Browser-side helpers for the enchanting matrix.
//
// Runs inside `page.evaluate`, like `giveHarness.js` and `brewHarness.js`. Everything reads the live game:
// the real enchanting table in the world, the real `Inventory`, the real player's level and the enchantments
// the offer engine actually applied. The bot's success string is never treated as evidence.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

/** Where the disposable fixture puts its table. Inside the player's 4.5-block reach. */
export const TABLE = [2, 1, 0];

export async function createEnchantHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  function inventoryItems() {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .filter(Boolean)
      .map((s) => ({
        id: s.id, isBlock: s.isBlock, count: s.count,
        enchantments: Array.isArray(s.enchantments) ? s.enchantments.map((e) => ({ ...e })) : null,
      }));
  }

  function count(id) {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  /** Every enchantment carried by every stack of an item, flattened. */
  function enchantmentsOn(id) {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .filter((s) => s && s.id === id)
      .flatMap((s) => (Array.isArray(s.enchantments) ? s.enchantments : []));
  }

  function lapisTotal() {
    return count('lapis_lazuli');
  }

  function snapshot() {
    return {
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      mode: game.player.gamemode,
      playerLevel: game.player.level ?? 0,
      totalXp: game.player.totalXp ?? null,
      items: inventoryItems(),
      activeItem: game.inventory.getActiveItem?.()?.id ?? null,
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
    };
  }

  /**
   * Put the table and an optional bookshelf ring in the world and stand the player next to the table.
   *
   * Fixture setup, not the action under test. The ring is the wiki's 5x5 arrangement: shelves exactly two
   * blocks out along one axis and up to two along the other, at the table's level and one above, with the
   * block between left as air.
   */
  function buildTable({ at = TABLE, playerAt = [0.5, 1, 0.5], shelves = 0 } = {}) {
    game.world.setVoxel(at[0], at[1], at[2], BLOCKS.ENCHANTING_TABLE);
    let placed = 0;
    if (shelves > 0) {
      outer:
      for (const dy of [0, 1]) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
            if (placed >= shelves) break outer;
            game.world.setVoxel(at[0] + dx, at[1] + dy, at[2] + dz, BLOCKS.BOOKSHELF);
            placed++;
          }
        }
      }
    }
    game.player.position.set(playerAt[0], playerAt[1], playerAt[2]);
    game.player.velocity.set(0, 0, 0);
    return {
      at, playerAt, placed,
      voxel: game.world.getVoxel(at[0], at[1], at[2]),
      expected: BLOCKS.ENCHANTING_TABLE,
    };
  }

  /** Empty the inventory and the ground, set the world, and place the table with an optional ring. */
  function reset({ gameMode = 'creative', cheats = true, shelves = 0, level = 0 } = {}) {
    game.inventory.clearAll();
    for (let i = game.entities.droppedItems.length - 1; i >= 0; i--) {
      game.entities.itemVisuals?.release?.(game.entities.droppedItems[i].group);
      game.entities.droppedItems.splice(i, 1);
    }
    game.player.keys = {};
    game.player.botControls = null;
    game.player.level = level;
    game.applyWorldSettings({ gameMode, cheats });
    // Clear the ring so a later case cannot inherit shelves from an earlier one.
    const at = TABLE;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (const dy of [0, 1]) {
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
      game.world.setVoxel(at[0] + dx, at[1] + dy, at[2] + dz, BLOCKS.AIR);
    }
    const built = buildTable({ at, shelves });
    return { ...built, mode: game.player.gamemode, settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats } };
  }

  /**
   * Run one bot enchant and capture the before/after state, the bot result and any exception.
   *
   * `fixture.step` advances the bot's own loop. A single enchant is instant, so a few ticks suffice; the
   * cap is there so a hung action fails the case rather than the suite.
   */
  async function enchant(action, { maxTicks = 600 } = {}) {
    const before = snapshot();
    let result = null, error = null, steps = 0;
    const pending = game.playerBot.run({ type: 'enchant', ...action });
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    for (let i = 0; i < maxTicks && !settled; i++) { fixture.step(1 / 30); steps++; await Promise.resolve(); }
    try { result = await pending; } catch (e) { error = e.message; }
    const row = { action, before, after: snapshot(), result, error, steps };
    observed.push({
      key: `enchant|${action.item}|${action.slot ?? 2}|${observed.length}`,
      action,
      beforeItems: before.items, afterItems: row.after.items,
      playerLevelBefore: before.playerLevel, playerLevelAfter: row.after.playerLevel,
      lapisBefore: before.items.reduce((n, s) => n + (s.id === 'lapis_lazuli' ? s.count : 0), 0),
      lapisAfter: row.after.items.reduce((n, s) => n + (s.id === 'lapis_lazuli' ? s.count : 0), 0),
      ok: result?.ok ?? null, message: result?.message ?? null,
      result, error, steps,
    });
    return row;
  }

  return {
    fixture, game, observed, snapshot, reset, enchant, buildTable,
    count, enchantmentsOn, lapisTotal, inventoryItems, TABLE,
    step: (n = 1) => { for (let i = 0; i < n; i++) fixture.step(1 / 30); },
  };
}
