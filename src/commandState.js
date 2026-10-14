// The world state the Java commands of round 4 keep: the scoreboard, teams, command storage, boss bars, the world
// border, the tick rate, force-loaded chunks, scheduled functions and the profilers. One object per game
// (`getCommandState(game)`), kept apart from the command handlers (advancedCommands.js) so the game loop
// (`tickCommandState`) and the tests can reach it. Each default is its wiki page's.

/** World border defaults (Commands/worldborder, World border): centre 0 0, 59,999,968 wide, 0.2 damage per block per second past a 5-block buffer, warning at 5 blocks and 15 seconds. */
export const BORDER_DEFAULTS = Object.freeze({ centerX: 0, centerZ: 0, size: 59999968, damage: 0.2, buffer: 5, warningDistance: 5, warningTime: 15 });
/** Commands/tick: "The default rate is 20.0 TPS"; the rate is 1.0 to 10000. */
export const TICK_DEFAULTS = Object.freeze({ rate: 20, min: 1, max: 10000 });
/** Commands/bossbar: its colours and styles; a new bar's maximum is 100. */
export const BOSSBAR_COLORS = Object.freeze(['blue', 'green', 'pink', 'purple', 'red', 'white', 'yellow']);
export const BOSSBAR_STYLES = Object.freeze(['notched_6', 'notched_10', 'notched_12', 'notched_20', 'progress']);
/** Commands/team: the colours a team can have, and its options with their values. */
export const TEAM_COLORS = Object.freeze(['black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple', 'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red', 'light_purple', 'yellow', 'white', 'reset']);
export const TEAM_OPTIONS = Object.freeze({
  displayName: 'text', color: TEAM_COLORS, friendlyFire: ['true', 'false'], seeFriendlyInvisibles: ['true', 'false'],
  nametagVisibility: ['always', 'never', 'hideForOtherTeams', 'hideForOwnTeam'], deathMessageVisibility: ['always', 'never', 'hideForOtherTeams', 'hideForOwnTeam'],
  collisionRule: ['always', 'never', 'pushOtherTeams', 'pushOwnTeam'], prefix: 'text', suffix: 'text',
});
/** Commands/scoreboard: display slots, and criteria this game can count (the rest are accepted and read-only). */
export const DISPLAY_SLOTS = Object.freeze(['list', 'sidebar', 'below_name', 'belowName',
  ...TEAM_COLORS.filter((c) => c !== 'reset').map((c) => `sidebar.team.${c}`)]);
export const SIMPLE_CRITERIA = Object.freeze(['dummy', 'trigger', 'deathCount', 'playerKillCount', 'totalKillCount', 'health', 'xp', 'level', 'food', 'air', 'armor']);

export function createCommandState() {
  return {
    scoreboard: { objectives: new Map(), scores: new Map(), display: {}, enabled: new Map() },
    teams: new Map(),
    storage: new Map(),
    bossbars: new Map(),
    border: { ...BORDER_DEFAULTS, from: null, to: null, lerpLeft: 0, lerpTotal: 0 },
    tick: { rate: TICK_DEFAULTS.rate, frozen: false, stepTicks: 0, sprintTicks: 0, sprintStarted: 0 },
    forced: new Set(),
    schedules: [],
    gameTicks: 0,
    tickClock: 0,
    profiler: { debug: null, jfr: null },
    functionDepth: 0,
  };
}

/** The game's command state, made on first use. */
export function getCommandState(game) {
  if (!game) return createCommandState();
  game.commandState ??= createCommandState();
  return game.commandState;
}

// --- scoreboard -------------------------------------------------------------------------------------------------

export function scoreOf(state, holder, objective) {
  return state.scoreboard.scores.get(objective)?.get(holder);
}
export function setScore(state, holder, objective, value) {
  const sb = state.scoreboard;
  if (!sb.scores.has(objective)) sb.scores.set(objective, new Map());
  // Scores are 32-bit signed integers.
  sb.scores.get(objective).set(holder, Math.trunc(Math.max(-2147483648, Math.min(2147483647, value))));
}
export function teamOf(state, holder) {
  for (const [name, team] of state.teams) if (team.members.has(holder)) return name;
  return null;
}

/** The scoreboard operations, as Commands/scoreboard lists them: += -= *= /= %= = < > ><. */
export function scoreOperation(op, a, b) {
  switch (op) {
    case '+=': return [a + b, b];
    case '-=': return [a - b, b];
    case '*=': return [a * b, b];
    case '/=': return [b === 0 ? a : Math.floor(a / b), b];
    case '%=': return [b === 0 ? a : ((a % b) + b) % b, b];
    case '=': return [b, b];
    case '<': return [Math.min(a, b), b];
    case '>': return [Math.max(a, b), b];
    case '><': return [b, a];
    default: return null;
  }
}

// --- world border -----------------------------------------------------------------------------------------------

/** The border's current width, moving toward its target if `/worldborder set ... <time>` is under way. */
export function borderSize(state) {
  const b = state.border;
  if (b.lerpLeft > 0 && b.from !== null) return b.to + (b.from - b.to) * (b.lerpLeft / b.lerpTotal);
  return b.size;
}
/** How far outside the border (past its buffer) a point is, in blocks; 0 inside. */
export function blocksOutsideBorder(state, x, z) {
  const half = borderSize(state) / 2;
  const dx = Math.abs(x - state.border.centerX) - half;
  const dz = Math.abs(z - state.border.centerZ) - half;
  return Math.max(0, dx, dz);
}

// --- the game-loop step -----------------------------------------------------------------------------------------

/**
 * Advance the command state by `dt` seconds of real time: the world-border lerp, scheduled functions (run through
 * `runFunction`), and the border's damage to the player ("this amount of damage per second per block outside from
 * the world border buffer distance"). Returns how many game ticks passed at the current tick rate (0 when frozen),
 * which the game uses to scale the world's simulation.
 */
export function tickCommandState(state, dt, { runFunction = null, player = null } = {}) {
  const t = state.tick;
  let ticks = 0;
  if (!t.frozen || t.stepTicks > 0) {
    const rate = t.sprintTicks > 0 ? TICK_DEFAULTS.max : t.rate;
    state.tickClock += dt * rate;
    ticks = Math.floor(state.tickClock);
    state.tickClock -= ticks;
    if (t.frozen) { ticks = Math.min(ticks, t.stepTicks); t.stepTicks -= ticks; }
    if (t.sprintTicks > 0) t.sprintTicks = Math.max(0, t.sprintTicks - ticks);
  }
  for (let n = 0; n < ticks; n++) {
    state.gameTicks++;
    const due = state.schedules.filter((s) => s.dueTick <= state.gameTicks);
    if (due.length) {
      state.schedules = state.schedules.filter((s) => s.dueTick > state.gameTicks);
      for (const s of due) runFunction?.(s.fn);
    }
  }
  const b = state.border;
  if (b.lerpLeft > 0) {
    b.lerpLeft = Math.max(0, b.lerpLeft - dt);
    if (b.lerpLeft === 0) { b.size = b.to; b.from = null; }
  }
  if (player?.position && typeof player.takeDamage === 'function') {
    const outside = blocksOutsideBorder(state, player.position.x, player.position.z) - b.buffer;
    if (outside > 0) {
      state.borderDamageClock = (state.borderDamageClock ?? 0) + dt;
      if (state.borderDamageClock >= 1) { state.borderDamageClock -= 1; player.takeDamage(Math.max(1, b.damage * outside), null, 'outside_border'); }
    } else state.borderDamageClock = 0;
  }
  return { ticks, scale: t.frozen ? (ticks > 0 ? ticks / Math.max(dt * TICK_DEFAULTS.rate, 1e-6) : 0) : (t.sprintTicks > 0 ? TICK_DEFAULTS.max / TICK_DEFAULTS.rate : t.rate / TICK_DEFAULTS.rate) };
}
