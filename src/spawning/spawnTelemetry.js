// Spawn telemetry: the counters that make "the world looks empty" diagnosable.
//
// Why this is a module and not a few fields on the spawner.
//
// The question this subsystem has to answer is not "did a mob spawn" but "why did no mob spawn here
// for the last five minutes". That needs rates over time, grouped by the reason for refusal and by
// the biome and category of the successes -- and it needs them without slowing the spawn pass down,
// which means accumulating in fields and summarising on demand rather than building objects per
// attempt.
//
// The counters are development-only in the sense that nothing reads them for gameplay, but they are
// always on: they cost a handful of integer increments per spawn attempt, which is nothing next to
// the position validation, and a metric that has to be switched on is a metric that is not there
// when the bug happens.
//
// Reference: the task's telemetry requirements (section 30). Behaviour defined here.

/**
 * How many ticks a rolling window covers.
 *
 * One minute of game time, which is the unit the task asks for ("spawn attempts / minute") and a
 * long enough window that a single unlucky tick does not dominate.
 */
export const TELEMETRY_WINDOW_TICKS = 1200;

/**
 * Accumulates spawn and despawn counters and produces per-minute rates.
 */
export class SpawnTelemetry {
  /**
   * @param {object} options
   * @param {object} options.mobSpawnManager
   */
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    /** Snapshot taken at the last tick, so per-tick deltas can be accumulated. */
    this.lastNatural = null;
    this.lastDespawn = null;
    this.windowTicks = 0;
    /** Window accumulators. */
    this.window = {
      ticks: 0,
      positionAttempts: 0,
      spawns: 0,
      despawns: 0,
      byCategory: Object.create(null),
      byRejection: Object.create(null),
      byBiome: Object.create(null),
      spawnDistanceTotal: 0,
      spawnDistanceSamples: 0,
    };
    /** Completed windows, newest first, so a rate is still readable mid-window. */
    this.history = [];
    this.maxHistory = 12;
  }

  /** Called once per `MobSpawnManager.update`, after the tick loop. */
  finishTick() {
    const natural = this.manager?.naturalSpawner;
    const despawn = this.manager?.despawnManager;
    if (!natural || !despawn) return;

    const telemetry = natural.telemetry();
    const despawnStats = despawn.telemetry();
    this.lastNatural = telemetry;
    this.lastDespawn = despawnStats;

    // The window accumulates the DELTA of the spawner's own monotonic counters, so the spawner never
    // has to know a window exists.
    this.window.ticks++;
    this.windowTicks++;
    if (this._previous) {
      this.window.positionAttempts += telemetry.positionAttempts - this._previous.positionAttempts;
      this.window.spawns += telemetry.spawns - this._previous.spawns;
      this.window.despawns += despawnStats.hardRemovals + despawnStats.randomRemovals
        + despawnStats.peacefulRemovals - (this._previousDespawnTotal || 0);
      this.#accumulateGrouped(this.window.byCategory, telemetry.spawnsByCategory, this._previous.spawnsByCategory);
      this.#accumulateGrouped(this.window.byBiome, telemetry.spawnsByBiome, this._previous.spawnsByBiome);
      this.#accumulateGrouped(this.window.byRejection, telemetry.rejections, this._previous.rejections);
    }
    this._previous = telemetry;
    this._previousDespawnTotal = despawnStats.hardRemovals + despawnStats.randomRemovals
      + despawnStats.peacefulRemovals;

    if (this.windowTicks >= TELEMETRY_WINDOW_TICKS) this.rollWindow();
  }

  /** Add the differences of two grouped counter maps into `target`. */
  #accumulateGrouped(target, current, previous) {
    if (!current) return;
    for (const [key, value] of Object.entries(current)) {
      const before = previous?.[key] ?? 0;
      target[key] = (target[key] || 0) + (value - before);
    }
  }

  /** Close the current window and start a new one. */
  rollWindow() {
    const minutes = this.window.ticks / TELEMETRY_WINDOW_TICKS;
    const perMinute = (value) => (minutes > 0 ? Math.round(value / minutes) : value);
    const entry = {
      ticks: this.window.ticks,
      minutes: +(this.window.ticks / 1200).toFixed(3),
      spawnAttemptsPerMinute: perMinute(this.window.positionAttempts),
      successfulSpawnsPerMinute: perMinute(this.window.spawns),
      despawnsPerMinute: perMinute(Math.max(0, this.window.despawns)),
      successRate: this.window.positionAttempts > 0
        ? +(this.window.spawns / this.window.positionAttempts).toFixed(4)
        : null,
      spawnsByCategory: { ...this.window.byCategory },
      rejectionsByReason: { ...this.window.byRejection },
      spawnsByBiome: { ...this.window.byBiome },
      eligibleChunks: this.manager?.stateCache?.state?.eligibleChunks?.length ?? null,
      averageSpawnDistance: this.window.spawnDistanceSamples > 0
        ? +(this.window.spawnDistanceTotal / this.window.spawnDistanceSamples).toFixed(1)
        : null,
    };
    this.history.unshift(entry);
    if (this.history.length > this.maxHistory) this.history.length = this.maxHistory;
    this.window = {
      ticks: 0,
      positionAttempts: 0,
      spawns: 0,
      despawns: 0,
      byCategory: Object.create(null),
      byRejection: Object.create(null),
      byBiome: Object.create(null),
      spawnDistanceTotal: 0,
      spawnDistanceSamples: 0,
    };
    this.windowTicks = 0;
    return entry;
  }

  /** Record the distance from the player at which a mob spawned, for the average. */
  noteSpawnDistance(distance) {
    if (!Number.isFinite(distance)) return;
    this.window.spawnDistanceTotal += distance;
    this.window.spawnDistanceSamples++;
  }

  /**
   * The full snapshot the debug overlay renders.
   *
   * Deliberately a plain object of plain values: the overlay prints it and the tests assert on it,
   * and neither should have to know about the spawner's internals.
   */
  snapshot() {
    const manager = this.manager;
    const natural = manager?.naturalSpawner;
    const state = manager?.stateCache?.state;
    const spawnerSnapshot = state ? state.snapshot() : null;
    return {
      enabled: !!manager?.enabled,
      difficulty: manager?.difficulty ?? 'normal',
      dimension: manager?.world?.dimension ?? 'overworld',
      worldTime: manager?.game?.worldTime ?? null,
      skyDarken: manager?.skyDarken ?? null,
      night: !!manager?.isNight,
      tickCount: natural?.tickCount ?? 0,
      spawnTicks: manager?.stats?.spawnTicks ?? 0,
      eligibleChunks: state?.eligibleChunks?.length ?? 0,
      capSquareChunks: state?.capSquareChunkCount ?? 0,
      caps: spawnerSnapshot?.categories ?? null,
      spawner: natural ? natural.telemetry() : null,
      despawner: manager?.despawnManager ? manager.despawnManager.telemetry() : null,
      special: manager?.specialSpawners ? manager.specialSpawners.telemetry() : null,
      clock: {
        ticks: manager?.clock?.ticks ?? 0,
        droppedTicks: manager?.clock?.droppedTicks ?? 0,
        accumulator: manager?.clock ? +manager.clock.accumulator.toFixed(4) : 0,
      },
      timing: {
        lastUpdateMs: +(manager?.stats?.lastUpdateMs ?? 0).toFixed(3),
        maxUpdateMs: +(manager?.stats?.maxUpdateMs ?? 0).toFixed(3),
        lightDirtyChunks: manager?.world?.light?.dirtyCount ?? 0,
      },
      windows: this.history,
      recentAttempts: (natural?.recentAttempts || []).slice(0, 20),
    };
  }

  /** Reset every counter, for a fresh measurement. */
  reset() {
    this.window = {
      ticks: 0,
      positionAttempts: 0,
      spawns: 0,
      despawns: 0,
      byCategory: Object.create(null),
      byRejection: Object.create(null),
      byBiome: Object.create(null),
      spawnDistanceTotal: 0,
      spawnDistanceSamples: 0,
    };
    this.windowTicks = 0;
    this.history.length = 0;
    this._previous = null;
    this._previousDespawnTotal = 0;
    this.manager?.naturalSpawner?.resetTelemetry();
    this.manager?.despawnManager?.resetTelemetry();
  }
}
