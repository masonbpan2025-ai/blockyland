// Browser-side helpers for the farming matrix.
//
// Runs inside `page.evaluate`, like the other harnesses. The actions under test are the bot's own `till` and
// `use` handling, which equip a real hoe or bone meal, aim at a real block and go through the game's real
// right-click path. Evidence is read from the real world voxels, the real drops and the real inventory --
// never from the bot's success string.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

/**
 * A flat dirt world at y=1 with a body of water available for the hydration cases.
 *
 * The survival fixture lays grass at y=0, which is the floor the player stands on. Farming needs a tillable
 * block the player can reach and look at, so this raises a dirt layer to y=1 beside the player.
 */
export async function createFarmHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  const key = (x, y, z) => `${x},${y},${z}`;

  function count(id) {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  function held() {
    const out = {};
    for (const s of [...game.inventory.hotbar, ...game.inventory.storage]) {
      if (!s) continue;
      out[s.id] = (out[s.id] ?? 0) + s.count;
    }
    return out;
  }

  /** Every dropped item in the world, which is where harvest and break evidence lives. */
  function drops() {
    return game.entities.droppedItems.map((d) => ({ id: d.itemType, count: d.count }));
  }

  function snapshot() {
    return {
      mode: game.player.gamemode,
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      held: held(),
      drops: drops(),
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
      selected: game.inventory.hotbar[game.inventory.selectedSlot ?? 0]?.id ?? null,
    };
  }

  /** Lay a flat dirt shelf at y=1 across the fixture, clear any crop, and stand the player on it. */
  function reset({ gameMode = 'creative', cheats = true } = {}) {
    game.inventory.clearAll();
    for (let i = game.entities.droppedItems.length - 1; i >= 0; i--) {
      game.entities.itemVisuals?.release?.(game.entities.droppedItems[i].group);
      game.entities.droppedItems.splice(i, 1);
    }
    game.player.keys = {};
    game.player.botControls = null;
    game.applyWorldSettings({ gameMode, cheats });
    // Clear the working volume, then lay dirt at y=1 and air above it.
    for (let x = -2; x < 22; x++) {
      for (let z = -2; z < 22; z++) {
        for (let y = 1; y <= 4; y++) game.world.setVoxel(x, y, z, BLOCKS.AIR);
        game.world.setVoxel(x, 1, z, BLOCKS.DIRT);
      }
    }
    game.player.position.set(0.5, 2, 0.5);
    game.player.velocity.set(0, 0, 0);
    game.player.onGround = true;
    game.player.health = 20;
    game.player.hunger = 20;
    return { mode: game.player.gamemode, settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats } };
  }

  /** Put a block in the world, and the player where the case needs them. */
  function setBlock(x, y, z, id) {
    game.world.setVoxel(x, y, z, id);
    // `setVoxel` only writes the chunk array; a raycast reads the same array, so nothing else is needed.
    return game.world.getVoxel(x, y, z);
  }

  /**
   * Place a crop AND register it with the farming manager.
   *
   * A crop only grows if the manager knows about it: `FarmingManager.update` walks its own `crops` map, and
   * the only production path that fills that map is `plant()`. Writing a crop block with `setBlock` alone
   * produces a plant that never grows, which looks like a growth bug and is really a setup bug -- it cost a
   * round here.
   */
  function setCrop(x, y, z, id) {
    game.world.setVoxel(x, y, z, id);
    game.farmingManager.registerCrop(x, y, z);
    game.farmingManager.registerFarmland(x, y - 1, z);
    return game.world.getVoxel(x, y, z);
  }

  /** Stand the player next to a target, so the bot's reach check passes and the raycast can hit. */
  function standAt(position, target) {
    game.player.position.set(position[0], position[1], position[2]);
    game.player.velocity.set(0, 0, 0);
    game.player.onGround = true;
    return { at: game.player.position.toArray(), target, distance: Math.hypot(target[0] + 0.5 - position[0], target[1] + 0.5 - position[1], target[2] + 0.5 - position[2]) };
  }

  function give(id, n = 1, isBlock = typeof id === 'number') {
    game.inventory.addItem(id, isBlock, n);
    return count(id);
  }

  /**
   * Run one bot action and capture before/after state, the result and any exception.
   *
   * `BotSurvival` THROWS for a refusal rather than resolving with `ok: false`, so the rejection is recorded
   * as the refusal it is.
   */
  async function run(action, { maxTicks = 600 } = {}) {
    const before = snapshot();
    let result = null, error = null, steps = 0;
    let pending;
    try {
      pending = game.playerBot.run(action);
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
      key: `farm|${action.type}|${JSON.stringify(action.position)}|${action.item ?? ''}|${observed.length}`,
      action,
      heldBefore: before.held, heldAfter: row.after.held,
      dropsBefore: before.drops, dropsAfter: row.after.drops,
      ok, message, error, steps,
    });
    return row;
  }

  return {
    fixture, game, observed, reset, run, give, count, held, drops, setBlock, setCrop, standAt, snapshot,
    getVoxel: (x, y, z) => game.world.getVoxel(x, y, z),
    step: (n = 1) => { for (let i = 0; i < n; i++) fixture.step(1 / 30); },
    /**
     * Tick the world so the farming manager runs its growth and hydration pass.
     *
     * The game calls `farmingManager.update` from its main `update()`, and the survival fixture suspends the
     * RAF so the driver owns the ticks -- which means that pass never runs on its own here. Driving it from
     * the fixture's own loop is what makes growth and hydration observable at all, and it uses the same
     * production call the game makes rather than reaching past it.
     */
    grow: (seconds = 1) => {
      const dt = 1 / 30;
      for (let i = 0; i < Math.ceil(seconds * 30); i++) {
        fixture.step(dt);
        game.farmingManager.update(dt, game.player.position);
      }
    },
    /** What the game's raycast currently points at, so a case can prove the aim rather than assume it. */
    target: () => game.targetBlock,
  };
}
