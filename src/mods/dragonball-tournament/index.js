// Dragon Ball World Tournament -- the mod entrypoint.
//
// This is the only file the loader reaches. It exports `register(api)`, which is Fabric's `ModInitializer`
// idea: the loader calls it, and everything the mod contributes goes through the `api` it is handed.
//
// The core does not import this file, and nothing in `src/` outside `src/mods/` names any of these managers.
// That is the property being bought: delete this directory and the game still runs, minus one world.
import manifest from './manifest.js';
import { TournamentManager } from './tournament.js';
import { DragonballSkillsManager } from './dragonballSkills.js';
import { TrainingSitesManager } from './trainingSites.js';
import { DungeonModeManager } from './dungeonMode.js';
import { registerMobs } from './mobs.js';
import { createRuntime } from './runtime.js';
import { registerSounds } from './audio.js';
import { registerUi } from './ui.js';
import { fireworks } from './fireworks.js';

/** The mod id, which is also the namespace every id below is registered under. */
export const MOD_ID = 'dragonball_tournament';

/** The mechanism id this mod supplies. The core no longer knows this string. */
export const MECHANISM_ID = 'dragonball_tournament';

/** The designed-world map this mod owns. */
export const MAP_FILENAME = 'World_Martial_Arts_Tournament.json';

/**
 * The mobs this mod adds.
 *
 * Declared here and registered into the content registry, so the Inspector attributes them to this mod and
 * scopes them away from a core view. Models, textures and behaviors are implemented by this mod’s mob providers.
 */
export const MOBS = manifest.provides.mobs;

/**
 * The world mechanism.
 *
 * Taken verbatim from the copy that used to live in the core's `registerDefaultMechanisms`, with one change:
 * the deactivate path no longer has to know about every subsystem by name, because it only ever touches its
 * own.
 */
export function mechanismDefinition() {
  return {
    id: MECHANISM_ID,
    name: 'Dragon Ball World Tournament',
    description: 'Martial arts tournament mechanics with Ki abilities (J: Kamehameha, K: Genki Dama, U: Punch, '
      + 'N: Dodge Roll), 4 training grounds, Announcer Host, and top-down dungeon combat.',
    modId: MOD_ID,
    features: {
      hasDragonBallSkills: true,
      hasTournamentAnnouncer: true,
      hasTrainingSites: true,
      hasDungeonCombatMode: true,
      hasOverheadHealthBars: true,
      allowCreativeFlight: false,
      allowFistPunchAttack: true,
      allowDodgeRoll: true,
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
      if (game.trainingSites) game.trainingSites.cleanup?.();
      if (game.dungeonMode?.isActive) game.dungeonMode.exitDungeonMode(false);
      if (game.dragonballSkills) {
        game.dragonballSkills.enabled = false;
        game.dragonballSkills.reset?.();
      }
      if (game.ui) {
        const sb = typeof document !== 'undefined' ? document.getElementById('status-bars') : null;
        sb?.classList.remove('tournament-mode');
        game.ui.initStatusBarsDOM?.();
      }
    },
  };
}

/** Clean a world up as the mechanism is deactivated. Called by the mechanism above. */
export function cleanupWorld(game) {
  game.tournament?.cleanup?.();
  game.trainingSites?.cleanup?.();
  if (game.dungeonMode?.isActive) game.dungeonMode.exitDungeonMode(false);
  game.dragonballSkills?.reset?.();
}

/**
 * The entrypoint.
 *
 * Order matters and mirrors a real mod's `onInitialize`: content first, then the mechanism that uses it, then
 * the subsystems, which are attached to the game under the names the core already reads.
 *
 * @param {import('../loader.js').ModApi} api
 * @param {{game?: object}} context
 */
export function register(api, { game = null } = {}) {
  registerUi(api, game);
  registerSounds(api, game);
  registerMobs(api, game);
  if (game?.entities) api.extend(game.entities, {
    launchTournamentFireworks: fireworks.launchTournamentFireworks.bind(game.entities),
    modSchedule: api.schedule.bind(api),
  });
  if (game?.player) api.extend(game.player, {
    onPunch: game.player.onPunch, onRoll: game.player.onRoll, onKiInterrupted: game.player.onKiInterrupted,
  });
  // 1. Content. Namespaced ids, so `dragonball_tournament:tournament_host` cannot collide with core.
  for (const mob of MOBS) api.registerMob(mob.id, mob);
  api.registerMap(MAP_FILENAME, { filename: MAP_FILENAME, mechanism: MECHANISM_ID });

  // 2. The mechanism, which is what makes the world's rules exist.
  api.registerMechanism(MECHANISM_ID, mechanismDefinition());

  // 2b. How the core cleans this world up when the player leaves it. The core calls whatever hooks it was
  //     given rather than naming the tournament, the training sites or the skills, which is what removed the
  //     last four references to this world from `worldMechanisms.js`.
  api.onLeaveWorld(cleanupWorld);

  // 3. The subsystems. Each is attached to the game rather than imported by it, so an unloaded mod is simply
  //    an absent field and the core's `?.` guards do the rest.
  if (game) {
    api.attach('tournament', new TournamentManager(game));
    api.attach('dragonballSkills', new DragonballSkillsManager(game));
    api.attach('skills', game.dragonballSkills);
    api.attach('trainingSites', new TrainingSitesManager(game));
    api.attach('dungeonMode', new DungeonModeManager(game));
    api.attach('modRuntime', createRuntime(game, mechanismDefinition().activate));
    const managers = [game.tournament, game.dragonballSkills];
    api.onDispose(() => managers.forEach(manager => manager.events?.abort()));
    api.onDispose(() => cleanupWorld(game));
  }
  return api.registered;
}
