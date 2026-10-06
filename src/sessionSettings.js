// What kind of world the player asked for.
//
// There was no such thing. `Inventory` gave every player eight occupied hotbar slots and a diamond sword,
// `Player` defaulted to Creative, and `spawnVillageMobs` populated every world with villagers, an iron golem
// and a **pillager patrol with a raid captain** at fixed coordinates. None of that was ever chosen by the
// player, because there was nowhere to choose it: "Generate New World" asked for a biome and a seed and
// nothing else.
//
// So a Survival player started with a diamond sword, a Creative flight flag, and two pillagers in the meadow
// on the first morning. This module is the missing input.
//
// The plan's rule: ordinary Survival selects its settings BEFORE terrain generation and ticking, and the
// showcase content belongs to an explicit preset rather than to every world.

/** The two modes the setup screen offers. */
export const GAME_MODES = ['survival', 'creative'];

/** Java's four difficulties, in increasing order of danger. */
export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];

/** `ordinary` is a real Survival/Creative world; `showcase` may keep scripted content. */
export const PRESETS = ['ordinary', 'showcase'];

/** A full Java day: 24,000 ticks at 20 ticks per second. */
export const TICKS_PER_DAY = 24000;
export const TICKS_PER_SECOND = 20;
export const DAY_LENGTH_SECONDS = TICKS_PER_DAY / TICKS_PER_SECOND;

/** Dawn. Vanilla starts a new world at time 0, not at noon. */
export const DAWN_TIME = 0;

/** Vanilla's normal difficulty, and the default this offers. */
export const DEFAULT_DIFFICULTY = 'normal';

export const DEFAULT_SETTINGS = Object.freeze({
  gameMode: 'survival',
  difficulty: DEFAULT_DIFFICULTY,
  // The terminal and the `/`-commands that hand out items are cheats. Creative worlds turn them on because
  // Creative *is* the non-vanilla mode; ordinary Survival does not, which is what keeps `C` from opening it.
  cheats: false,
  preset: 'ordinary',
  biome: 'all',
  seed: null,
});

/** A mode string from the UI, or the default when it is not one of the two. */
export function normaliseGameMode(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (GAME_MODES.includes(v)) return v;
  // `creative` was the old hard-coded default. Anything unrecognised is treated as an ordinary Survival
  // request rather than silently granting Creative abilities, which is the failure this module exists to fix.
  return DEFAULT_SETTINGS.gameMode;
}

/** A difficulty string from the UI, or the default when it is not one of the four. */
export function normaliseDifficulty(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (DIFFICULTIES.includes(v)) return v;
  return DEFAULT_DIFFICULTY;
}

/**
 * Fill in a complete settings object.
 *
 * Anything missing takes the Survival default, so a caller that forgets a field gets an ordinary world
 * rather than a Creative one. `cheats` defaults from the mode when it is not given: Creative worlds are
 * built for the terminal and the Inspector, Survival worlds are not.
 */
export function normaliseSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const gameMode = normaliseGameMode(source.gameMode);
  const preset = PRESETS.includes(source.preset) ? source.preset : DEFAULT_SETTINGS.preset;
  return Object.freeze({
    gameMode,
    difficulty: normaliseDifficulty(source.difficulty),
    cheats: typeof source.cheats === 'boolean' ? source.cheats : gameMode === 'creative',
    preset,
    biome: typeof source.biome === 'string' && source.biome ? source.biome : DEFAULT_SETTINGS.biome,
    seed: source.seed ?? null,
  });
}

export function isSurvival(settings) {
  return normaliseSettings(settings).gameMode === 'survival';
}

export function isCreative(settings) {
  return normaliseSettings(settings).gameMode === 'creative';
}

/** Peaceful removes hostile mobs rather than merely stopping new ones. */
export function isPeaceful(settings) {
  return normaliseSettings(settings).difficulty === 'peaceful';
}

/**
 * May this world run the scripted showcase population?
 *
 * Ordinary worlds may not. That is the whole point: villagers, the iron golem and the pillager patrol were
 * placed at fixed coordinates around the origin in every world, which is where the daytime hostiles came
 * from.
 */
export function allowsShowcasePopulation(settings) {
  return normaliseSettings(settings).preset === 'showcase';
}

/** May the Agent Terminal be opened, and may cheat commands run? */
export function allowsAgentTerminal(settings) {
  return normaliseSettings(settings).cheats === true;
}

/**
 * Should a fresh player keep items from a previous session?
 *
 * Only a brand-new ordinary world starts empty. Loading a save must not confiscate legitimately saved gear,
 * and switching Creative to Survival preserves the inventory, as Minecraft does.
 */
export function clearsInventoryOnStart(reason) {
  return reason === 'new_world';
}

/** The simulation clock's starting time of day, in ticks. */
export function startingTimeOfDay(settings) {
  // A showcase world is a designed scene and may want a particular hour; ordinary worlds start at dawn.
  if (allowsShowcasePopulation(settings)) return settings?.startTime ?? DAWN_TIME;
  return DAWN_TIME;
}

/** How long a day lasts, in ticks and in seconds, for the simulation clock. */
export const DAY_LENGTH_TICKS = TICKS_PER_DAY;
