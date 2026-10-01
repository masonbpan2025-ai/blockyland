/**
 * World Mechanism System
 * Provides modular, isolated game rules, capabilities, and behaviors for worlds.
 * 
 * - Generated Worlds run on 'default' mechanisms (pure vanilla Minecraft mechanics).
 * - Designed Worlds run on 'default' + their own custom isolated mechanisms (e.g. dragonball_tournament).
 * - Saved Worlds preserve the base mechanism of whichever world they were saved from.
 */

export const MECHANISM_IDS = {
  DEFAULT: 'default',
  DRAGONBALL_TOURNAMENT: 'dragonball_tournament'
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
    // 1. Vanilla Default Mechanism
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
      activate: (game) => {
        if (game.tournament) {
          game.tournament.isTournamentMap = false;
          game.tournament.cleanup?.();
        }
        if (game.trainingSites) {
          game.trainingSites.cleanup?.();
        }
        if (game.dungeonMode && game.dungeonMode.isActive) {
          game.dungeonMode.exitDungeonMode(false);
        }
        if (game.dragonballSkills) {
          game.dragonballSkills.enabled = false;
          game.dragonballSkills.reset?.();
        }
      },
      deactivate: (game) => {}
    });

    // 2. Dragon Ball World Tournament Mechanism
    this.registerMechanism(MECHANISM_IDS.DRAGONBALL_TOURNAMENT, {
      id: MECHANISM_IDS.DRAGONBALL_TOURNAMENT,
      name: 'Dragon Ball World Tournament',
      description: 'Martial arts tournament mechanics with Ki abilities (J: Kamehameha, K: Genki Dama, U: Punch, N: Dodge Roll), 4 training grounds, Announcer Host, and top-down dungeon combat.',
      features: {
        hasDragonBallSkills: true,
        hasTournamentAnnouncer: true,
        hasTrainingSites: true,
        hasDungeonCombatMode: true,
        hasOverheadHealthBars: true,
        allowCreativeFlight: false, // Tournament is survival only
        allowFistPunchAttack: true,
        allowDodgeRoll: true
      },
      activate: (game, mapData) => {
        if (game.player) {
          game.player.gamemode = 'survival';
          game.player.isFlying = false;
          game.player.maxHealth = 60;
          game.player.health = 60;
        }
        if (game.tournament) {
          game.tournament.isTournamentMap = true;
          game.tournament.reset?.();
          game.tournament.ensureHost?.();
        }
        if (game.trainingSites) {
          game.trainingSites.reset?.();
          game.trainingSites.ensureSiteManagers?.();
        }
        if (game.dragonballSkills) {
          game.dragonballSkills.enabled = true;
          game.dragonballSkills.reset?.();
        }
        if (game.ui) {
          game.ui.initStatusBarsDOM?.();
          const sb = typeof document !== 'undefined' ? document.getElementById('status-bars') : null;
          sb?.classList.add('tournament-mode');
        }
      },
      deactivate: (game) => {
        if (game.player) {
          game.player.maxHealth = 20;
          game.player.health = Math.min(20, game.player.health);
        }
        if (game.tournament) {
          game.tournament.isTournamentMap = false;
          game.tournament.cleanup?.();
        }
        if (game.trainingSites) {
          game.trainingSites.cleanup?.();
        }
        if (game.dungeonMode && game.dungeonMode.isActive) {
          game.dungeonMode.exitDungeonMode(false);
        }
        if (game.dragonballSkills) {
          game.dragonballSkills.enabled = false;
          game.dragonballSkills.reset?.();
        }
        if (game.ui) {
          const sb = typeof document !== 'undefined' ? document.getElementById('status-bars') : null;
          sb?.classList.remove('tournament-mode');
          game.ui.initStatusBarsDOM?.();
        }
      }
    });
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
