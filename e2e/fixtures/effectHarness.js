// Browser-side helpers for the status-effect matrix.
//
// Runs inside `page.evaluate`, like the other harnesses. The action under test is the bot's own `eat`
// handling of a potion, which reaches `main.js`'s right-click chain and so the real `potionUse` path; the
// evidence is read from the real `Player`'s effect map and its real health, not from the bot's message.
import { createSurvivalFixture } from './survivalFixture.js';
import { effectsFor, speedMultiplier, attackDamageBonus, damageTakenMultiplier, miningSpeedMultiplier } from '../../src/statusEffects.js';

export async function createEffectHarness(game) {
  const fixture = createSurvivalFixture(game);
  const observed = [];

  function effects() {
    return [...game.player.statusEffects.entries()]
      .map(([name, data]) => ({ name, duration: Number((data.duration ?? 0).toFixed(3)), level: data.level ?? 1 }));
  }

  function effectOf(name) {
    const e = game.player.statusEffects.get(name);
    return e ? { duration: Number((e.duration ?? 0).toFixed(3)), level: e.level ?? 1 } : null;
  }

  function count(id) {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  function inventoryItems() {
    return [...game.inventory.hotbar, ...game.inventory.storage]
      .filter(Boolean)
      .map((s) => ({ id: s.id, isBlock: s.isBlock, count: s.count }));
  }

  function snapshot() {
    return {
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      mode: game.player.gamemode,
      health: game.player.health,
      maxHealth: game.player.maxHealth,
      hunger: game.player.hunger,
      absorption: game.player.absorption ?? 0,
      effects: effects(),
      effectsSize: game.player.statusEffects.size,
      items: inventoryItems(),
      activeItem: game.inventory.getActiveItem?.()?.id ?? null,
      // The rules the effects feed, read from the same functions the game uses.
      speedMultiplier: speedMultiplier(game.player.statusEffects),
      attackBonus: attackDamageBonus(game.player.statusEffects),
      damageTaken: damageTakenMultiplier(game.player.statusEffects),
      miningMultiplier: miningSpeedMultiplier(game.player.statusEffects),
      botActive: game.playerBot.active,
      controls: game.player.botControls ? { ...game.player.botControls } : null,
      keys: Object.keys(game.player.keys ?? {}),
    };
  }

  /**
   * Clear the world's transient state and put the player where the effect cases expect.
   *
   * `hunger` defaults to 19 rather than a full 20 because the bot's `eat` refuses when the player is
   * neither hungry nor hurt: "Player is already full; did not consume ...". That guard is the bot's own
   * policy, not an effect rule, so every case that drinks a potion starts with a player willing to eat.
   * `health` stays a parameter because several cases need a specific starting health to measure healing or
   * damage.
   */
  function reset({ gameMode = 'creative', cheats = true, health = 20, hunger = 19, naturalRegeneration = true } = {}) {
    game.inventory.clearAll();
    for (let i = game.entities.droppedItems.length - 1; i >= 0; i--) {
      game.entities.itemVisuals?.release?.(game.entities.droppedItems[i].group);
      game.entities.droppedItems.splice(i, 1);
    }
    game.player.keys = {};
    game.player.botControls = null;
    game.applyWorldSettings({ gameMode, cheats });
    game.player.statusEffects.clear();
    game.player.absorption = 0;
    game.player.health = health;
    game.player.hunger = hunger;
    // Revive. A case that kills the player (the Wither floor test) leaves `isDead` set, and `Player.update`
    // returns early for a dead player -- so the next case's effects would silently never tick. The respawn
    // path that clears this normally is a UI flow the fixture does not drive.
    game.player.isDead = false;
    game.player.deathDropsDone = false;
    game.player.invulnerableTimer = 0;
    game.player.position.set(0.5, 1, 0.5);
    game.player.velocity.set(0, 0, 0);
    game.gamerules = { ...(game.gamerules ?? {}), naturalRegeneration };
    return {
      mode: game.player.gamemode,
      settings: { gameMode: game.settings?.gameMode, cheats: game.settings?.cheats },
      health: game.player.health, hunger: game.player.hunger,
      naturalRegeneration,
    };
  }

  /**
   * Run one bot `eat` of a potion and capture the before/after state and the bot's result.
   *
   * A short tick budget: consuming is instant, and the cases that watch an effect tick call `step` directly
   * afterwards so the timing is the test's, not the driver's.
   */
  async function drink(item, { maxTicks = 400 } = {}) {
    const before = snapshot();
    let result = null, error = null, steps = 0;
    const pending = game.playerBot.run({ type: 'eat', item });
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    for (let i = 0; i < maxTicks && !settled; i++) { fixture.step(1 / 30); steps++; await Promise.resolve(); }
    try { result = await pending; } catch (e) { error = e.message; }
    const row = { item, before, after: snapshot(), result, error, steps };
    observed.push({
      key: `eat|${item}|${observed.length}`,
      item,
      healthBefore: before.health, healthAfter: row.after.health,
      effectsBefore: before.effects, effectsAfter: row.after.effects,
      potionsBefore: countOf(before, item), potionsAfter: countOf(row.after, item),
      glassBottlesBefore: countOf(before, 'glass_bottle'),
      glassBottlesAfter: countOf(row.after, 'glass_bottle'),
      ok: result?.ok ?? null, message: result?.message ?? null,
      result, error, steps,
    });
    return row;
  }

  function countOf(state, id) {
    return (state.items ?? []).reduce((n, s) => n + (s.id === id ? s.count : 0), 0);
  }

  /** Give the player a potion (and a glass bottle) without going through a command. */
  function give(id, n = 1) {
    game.inventory.addItem(id, false, n);
    return count(id);
  }

  return {
    fixture, game, observed, snapshot, reset, drink, give, count, effects, effectOf,
    step: (seconds, dt = 1 / 30) => {
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) fixture.step(dt);
      return steps;
    },
  };
}
