// Browser-side helpers for the drowned-farming matrix.
//
// Runs inside `page.evaluate`, like the other harnesses. The action under test is the bot's own `attack`
// handling: it picks the nearest living mob of the named type, walks to it, and swings until it dies. That
// is exactly the "kill the drowned for its drops" step of the farm, so it is the route worth testing.
//
// Evidence is read from real mobs, the real dropped-item list and the real XP orbs -- never from the bot's
// success string.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

/** A drained, well-lit arena so the setup mobs cannot be lost to terrain or to the dark. */
export async function createDrownedHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const count = (id) => [...game.inventory.hotbar, ...game.inventory.storage]
    .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);

  function held() {
    const out = {};
    for (const s of [...game.inventory.hotbar, ...game.inventory.storage]) {
      if (!s) continue;
      out[s.id] = (out[s.id] ?? 0) + s.count;
    }
    return out;
  }

  /** Live mobs of a type, which is what the bot's target selection sees. */
  function mobs(type) {
    return game.mobs.mobs.filter((m) => m.type === type && m.health > 0);
  }

  /** Everything the world currently has on the ground. */
  function drops() {
    return game.entities.droppedItems.map((d) => ({ id: d.itemType, count: d.count }));
  }

  /** XP sitting in orbs, which is what a kill awards before pickup. */
  function orbs() {
    return game.entities.xpOrbs.map((o) => o.value ?? o.amount ?? 0);
  }

  function snapshot() {
    return {
      mode: game.player.gamemode,
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      mobs: game.mobs.mobs.filter((m) => m.health > 0).map((m) => ({ type: m.type, health: m.health, isBaby: !!m.isBaby })),
      drops: drops(),
      orbs: orbs(),
      held: held(),
      exp: game.player.exp ?? 0,
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
    };
  }

  /** Clear the arena, light it, and stand the player on solid ground. */
  function reset({ gameMode = 'creative', cheats = true } = {}) {
    game.inventory.clearAll();
    for (const list of [game.entities.droppedItems, game.entities.xpOrbs]) {
      for (let i = list.length - 1; i >= 0; i--) {
        // Only dropped items own an item visual; XP orbs are meshes of their own, and `release` on an
        // undefined group throws. Guarded rather than assumed.
        const group = list[i]?.group;
        if (group) game.entities.itemVisuals?.release?.(group);
        list.splice(i, 1);
      }
    }
    game.mobs.clearMobs();
    game.player.keys = {};
    game.player.botControls = null;
    game.applyWorldSettings({ gameMode, cheats });
    // A flat stone floor with air above it, so nothing falls and nothing is dark.
    for (let x = -6; x < 26; x++) {
      for (let z = -6; z < 26; z++) {
        for (let y = 1; y <= 6; y++) game.world.setVoxel(x, y, z, BLOCKS.AIR);
        game.world.setVoxel(x, 0, z, BLOCKS.STONE);
      }
    }
    game.worldTime = 6000;
    game.player.position.set(8.5, 1, 8.5);
    game.player.velocity.set(0, 0, 0);
    game.player.onGround = true;
    game.player.health = 20;
    game.player.hunger = 20;
    return { mode: game.player.gamemode, settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats } };
  }

  function give(id, n = 1, isBlock = typeof id === 'number') {
    game.inventory.addItem(id, isBlock, n);
    return count(id);
  }

  /**
   * Spawn one mob right next to the player and freeze it there.
   *
   * Frozen deliberately: this is a test of what a drowned DROPS and is WORTH, not of its AI, and a drowned
   * that swims or wanders away turns every case into a chase that may or may not finish. The bot still walks
   * and swings at it normally.
   */
  function spawn(type, { at = [10.5, 1, 8.5], over = {} } = {}) {
    const mob = game.mobs.spawnMob(type, at[0], at[1], at[2]);
    Object.assign(mob, over);
    return mob;
  }

  /** Run one bot action, capturing before/after state, the result and any exception. */
  async function run(action, { maxTicks = 4000 } = {}) {
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
      // Unique across the whole run, not just within one worker's `observed` array: Playwright restarts a
      // worker after a failure, which re-runs `beforeAll` and resets module scope, so an index alone makes
      // two different kills share a key and the merge-by-key drain silently drops one of them.
      key: `drowned|${action.type}|${action.mob ?? ''}|${Date.now()}|${Math.round(steps)}`,
      action,
      mobsBefore: before.mobs, mobsAfter: row.after.mobs,
      dropsBefore: before.drops, dropsAfter: row.after.drops,
      orbsBefore: before.orbs, orbsAfter: row.after.orbs,
      expBefore: before.exp, expAfter: row.after.exp,
      heldAfter: row.after.held,
      ok, message, error, steps,
    });
    return row;
  }

  return {
    fixture, game, observed, reset, run, spawn, give, count, held, drops, orbs, mobs, snapshot, distance,
    step: (n = 1) => { for (let i = 0; i < n; i++) fixture.step(1 / 30); },
  };
}
