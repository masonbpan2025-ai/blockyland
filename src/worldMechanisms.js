/**
 * World Mechanism System
 * Provides modular, isolated game rules, capabilities, and behaviors for worlds.
 *
 * - Generated Worlds run on 'default' mechanisms (pure vanilla Minecraft mechanics).
 * - Designed Worlds run on 'default' + their own custom isolated mechanisms, supplied by a MOD.
 * - Saved Worlds preserve the base mechanism of whichever world they were saved from.
 *
 * The tournament mechanism used to be registered here, by name, inside `registerDefaultMechanisms`. That made
 * the core depend on one designed world: this file named `game.tournament`, `game.trainingSites`,
 * `game.dragonballSkills` and `game.dungeonMode`, and `MECHANISM_IDS` listed the world's id as a constant.
 *
 * It now does not. This class is a REGISTRY -- `registerMechanism` was always the right seam -- and a mod
 * registers into it from its own entrypoint. The core knows only `default`.
 *
 * That is the property the mod structure exists for: the core can be read, built and run with no designed
 * world present, and a new world is a new directory rather than an edit to this file.
 */

/** The one mechanism the core itself supplies. Every other mechanism comes from a mod. */
export const MECHANISM_IDS = {
  DEFAULT: 'default'
};

export class WorldMechanismManager {
  constructor(game) {
    this.game = game;
    this.mechanisms = new Map();
    this.currentMechanismId = MECHANISM_IDS.DEFAULT;
    this.currentMechanism = null;

    this.registerDefaultMechanisms();
    this.setMechanism(MECHANISM_IDS.DEFAULT, game);
  }

  registerMechanism(id, mechanismDef) {
    this.mechanisms.set(id, mechanismDef);
  }

  registerDefaultMechanisms() {
    // Vanilla Default Mechanism: the only mechanism the core knows.
    //
    // Its `activate` used to reach into the tournament, the training sites, the dungeon mode and the Dragon
    // Ball skills by name -- four references to one designed world. It now runs a list of cleanup hooks that
    // the loaded mods contribute, so the core can clean up "whatever worlds are open" without naming one.
    this.registerMechanism(MECHANISM_IDS.DEFAULT, {
      id: MECHANISM_IDS.DEFAULT,
      name: 'Default (Vanilla)',
      description: 'Standard Minecraft survival and creative gameplay mechanics with no custom combat skills or tournament overlays.',
      features: {
        hasDragonBallSkills: false,
        hasTournamentAnnouncer: false,
        hasTrainingSites: false,
        hasDungeonCombatMode: false,
        hasOverheadHealthBars: false,
        allowCreativeFlight: true,
        allowFistPunchAttack: false,
        allowDodgeRoll: false
      },
      /** Filled by `registerWorldCleanup`, one entry per loaded mod that has a world open. */
      onLeaveModWorlds: [],
      activate: (game) => {
        const hooks = game?.mechanisms?.mechanisms?.get?.(MECHANISM_IDS.DEFAULT)?.onLeaveModWorlds ?? [];
        for (const cleanup of hooks) {
          // A mod that throws on cleanup must not strand the core on a dead mechanism.
          try { cleanup(game); } catch { /* reported by the mod, not fatal here */ }
        }
      },
      deactivate: (game) => {}
    });
  }

  /**
   * Register a hook that runs when a mod's world is left.
   *
   * The mod loader calls this once per loaded mod. It is what lets `default` undo a designed world's setup
   * without importing it, which is the whole reason the core no longer names any of them.
   */
  registerWorldCleanup(cleanup) {
    const def = this.mechanisms.get(MECHANISM_IDS.DEFAULT);
    if (!def || typeof cleanup !== 'function') return false;
    if (!Array.isArray(def.onLeaveModWorlds)) def.onLeaveModWorlds = [];
    if (def.onLeaveModWorlds.includes(cleanup)) return false;
    def.onLeaveModWorlds.push(cleanup);
    return true;
  }

  /** Every mechanism id that is registered, core's included. */
  ids() {
    return [...this.mechanisms.keys()];
  }

  /** The mechanism definitions, for a report or the Inspector. */
  list() {
    return [...this.mechanisms.values()].map(m => ({
      id: m.id, name: m.name, modId: m.modId ?? null, features: { ...(m.features ?? {}) },
    }));
  }

  /** True when a mechanism came from a mod rather than the core. */
  isModMechanism(id) {
    return Boolean(this.mechanisms.get(id)?.modId);
  }

  setMechanism(id, game = this.game, mapData = null) {
    const targetId = this.mechanisms.has(id) ? id : MECHANISM_IDS.DEFAULT;

    // Deactivate current mechanism if changing
    if (this.currentMechanism && this.currentMechanism.deactivate) {
      this.currentMechanism.deactivate(game);
    }

    this.currentMechanismId = targetId;
    this.currentMechanism = this.mechanisms.get(targetId);

    if (this.currentMechanism && this.currentMechanism.activate) {
      this.currentMechanism.activate(game, mapData);
    }

    return this.currentMechanism;
  }

  isFeatureEnabled(featureName) {
    if (!this.currentMechanism || !this.currentMechanism.features) {
      return false;
    }
    return Boolean(this.currentMechanism.features[featureName]);
  }

  update(dt, player) {
    if (!this.currentMechanism) return;

    if (this.currentMechanism.update) {
      this.currentMechanism.update(dt, player, this.game);
    }
  }
}
