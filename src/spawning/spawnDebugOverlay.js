// Debug overlay for the mob-spawning subsystem.
//
// Why this exists, and why it is not part of the normal UI.
//
// "There are no mobs here" is the hardest bug in a spawning system to diagnose from the outside.
// Every one of a dozen conditions could have refused: the chunk may be ineligible, the category cap
// may be full, the light may be too bright, the floor may be wrong, the biome may have no entry for
// that category, the player may be too close or too far, the mob's own predicate may have said no.
// The overlay shows which, per attempt, with the machine-readable reason code the spawner recorded.
//
// It is registered on the existing mob-inspector toggle rather than on a new key, so the same control
// that shows mob labels also shows this -- and it renders into the pause menu's debug panel, which is
// already the place a developer looks.
//
// Reference: the task's debug-overlay requirements (section 29) for the field list.

import { SpawnRejection } from './spawnValidation.js';
import { CATEGORY_INFO, ALL_MOB_CATEGORIES } from './mobCategories.js';

/**
 * A compact, copy-pasteable readout of the spawning state.
 *
 * Rendered as plain text rather than HTML on purpose: it is meant to be read in a screenshot and
 * pasted into a bug report, and structure would be lost in both.
 */
export function formatSpawnDebug(snapshot, options = {}) {
  if (!snapshot) return 'Spawning subsystem not present.';
  const lines = [];
  const push = (line = '') => lines.push(line);

  push(`=== MOB SPAWNING ===`);
  push(`enabled ${snapshot.enabled ? 'yes' : 'no'}  difficulty ${snapshot.difficulty}  dimension ${snapshot.dimension}`);
  push(`time ${snapshot.worldTime ?? '-'}  skyDarken ${snapshot.skyDarken ?? '-'}  ${snapshot.night ? 'NIGHT' : 'day'}`);
  push(`spawn ticks ${snapshot.spawnTicks}  eligible chunks ${snapshot.eligibleChunks} (cap square ${snapshot.capSquareChunks})`);
  push(`light: ${snapshot.timing?.lightDirtyChunks ?? 0} chunk(s) awaiting relight`);

  // Caps. This is the first thing to check when nothing spawns near a lot of valid terrain.
  push(``);
  push(`--- MOB CAPS ---`);
  const caps = snapshot.caps || {};
  for (const category of ALL_MOB_CATEGORIES) {
    const entry = caps[category];
    if (!entry) continue;
    const cap = entry.unlimited ? 'unlimited' : entry.cap;
    const flag = entry.hasRoom ? '' : '  FULL';
    push(`  ${category.padEnd(28)} ${String(entry.count).padStart(4)} / ${String(cap).padStart(9)}${flag}`);
  }

  // The spawner's own counters.
  const spawner = snapshot.spawner;
  if (spawner) {
    push(``);
    push(`--- ATTEMPTS ---`);
    push(`  chunk attempts   ${spawner.chunkAttempts}`);
    push(`  group attempts   ${spawner.groupAttempts}`);
    push(`  position attempts ${spawner.positionAttempts}`);
    push(`  spawns           ${spawner.spawns}  (success ${spawner.successRate === null ? '-' : (spawner.successRate * 100).toFixed(2) + '%'})`);
    push(`  tick cost        last ${spawner.lastMs}ms  avg ${spawner.averageMs}ms  max ${spawner.maxMs}ms`);
    if (spawner.truncatedTicks) {
      push(`  budget exceeded on ${spawner.truncatedTicks} tick(s) -- some chunks were skipped`);
    }

    // Rejections, highest first: the top row is almost always the answer.
    const rejections = Object.entries(spawner.rejections || {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
    push(``);
    push(`--- REJECTION REASONS ---`);
    if (rejections.length === 0) push('  (none recorded)');
    for (const [reason, count] of rejections) {
      push(`  ${reason.padEnd(24)} ${String(count).padStart(8)}   ${explainRejection(reason)}`);
    }

    const successes = Object.entries(spawner.spawnsByMob || {}).sort((a, b) => b[1] - a[1]);
    if (successes.length) {
      push(``);
      push(`--- SPAWNED BY MOB ---`);
      push('  ' + successes.map(([type, count]) => `${type}:${count}`).join('  '));
    }
    const biomes = Object.entries(spawner.spawnsByBiome || {}).sort((a, b) => b[1] - a[1]);
    if (biomes.length) {
      push(`--- SPAWNED BY BIOME ---`);
      push('  ' + biomes.map(([id, count]) => `${id}:${count}`).join('  '));
    }
  }

  // The despawner, because a full cap is usually a despawn problem rather than a spawn problem.
  const despawner = snapshot.despawner;
  if (despawner) {
    push(``);
    push(`--- DESPAWNS ---`);
    push(`  hard (>128 blocks) ${despawner.hardRemovals}   random ${despawner.randomRemovals}   peaceful ${despawner.peacefulRemovals}`);
    const types = Object.entries(despawner.byType || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (types.length) push('  ' + types.map(([t, c]) => `${t}:${c}`).join('  '));
  }

  // Recent attempts: what just happened, which is what a live debug session needs.
  const recent = snapshot.recentAttempts || [];
  if (recent.length) {
    push(``);
    push(`--- LAST ATTEMPTS (newest first) ---`);
    for (const attempt of recent.slice(0, options.recentLimit ?? 12)) {
      const where = attempt.x !== undefined
        ? `(${Math.floor(attempt.x)},${attempt.y},${Math.floor(attempt.z)})`
        : `chunk ${attempt.cx},${attempt.cz}`;
      push(`  ${String(attempt.rejected || 'SPAWNED').padEnd(22)} ${(attempt.type || attempt.category || '').padEnd(16)} ${where}`
        + (attempt.biomeId ? `  ${attempt.biomeId}` : '')
        + (attempt.detail ? `  [${typeof attempt.detail === 'string' ? attempt.detail : JSON.stringify(attempt.detail)}]` : ''));
    }
  }

  // Per-minute rates, once a window has closed.
  const windows = snapshot.windows || [];
  if (windows.length) {
    const latest = windows[0];
    push(``);
    push(`--- RATES (last ${latest.minutes} min) ---`);
    push(`  attempts/min ${latest.spawnAttemptsPerMinute}  spawns/min ${latest.successfulSpawnsPerMinute}  despawns/min ${latest.despawnsPerMinute}`);
    if (latest.averageSpawnDistance !== null) push(`  average spawn distance ${latest.averageSpawnDistance} blocks`);
  }

  return lines.join('\n');
}

/**
 * A one-line explanation for each rejection code.
 *
 * Kept beside the codes so a new code cannot be added without someone noticing that this table needs
 * a row -- the default branch names the code rather than staying silent.
 */
export function explainRejection(reason) {
  switch (reason) {
    case SpawnRejection.NO_WORLD: return 'no world';
    case SpawnRejection.CHUNK_NOT_LOADED: return 'that chunk is not loaded';
    case SpawnRejection.OUT_OF_WORLD_BOUNDS: return 'outside the build height';
    case SpawnRejection.TOO_CLOSE_TO_PLAYER: return 'inside the 24-block player exclusion';
    case SpawnRejection.TOO_FAR_FROM_PLAYER: return 'beyond the player sphere (128, or 64 for fish)';
    case SpawnRejection.CAP_FULL: return 'the category mob cap is full -- check the cap table above';
    case SpawnRejection.LOCAL_CAP_FULL: return 'this player already holds their share of the cap';
    case SpawnRejection.NO_SPAWN_ENTRIES: return 'the biome has no entry for this category';
    case SpawnRejection.WRONG_BIOME: return 'a biome rule refused it (e.g. reduced water ambient)';
    case SpawnRejection.WRONG_DIMENSION: return 'this mob does not belong in this dimension';
    case SpawnRejection.WRONG_FLUID: return 'the fluid at that position is wrong (water/lava)';
    case SpawnRejection.INVALID_FLOOR: return 'no solid floor under the mob';
    case SpawnRejection.INVALID_LIGHT: return 'not dark enough (the sky-light lottery or block light)';
    case SpawnRejection.COLLISION: return 'the mob box would intersect a block';
    case SpawnRejection.DIFFICULTY_BLOCKED: return 'Peaceful difficulty blocks hostile spawning';
    case SpawnRejection.MOB_PREDICATE_FAILED: return "the mob's own spawn rules said no";
    case SpawnRejection.STRUCTURE_OVERRIDE: return 'a structure override applies here';
    case SpawnRejection.INVALID_BLOCK_BELOW: return 'the block below is not one this mob accepts';
    // Declared for completeness: set when a caller deliberately disables the distance rule, e.g. the
    // chunk-generation spawner, which is not gated on player proximity. It is never produced by the
    // natural cycle.
    case SpawnRejection.DISTANCE_RULE_DISABLED: return 'the player-distance rule was disabled by the caller';
    default: return '';
  }
}

/**
 * Install the overlay into a debug panel element.
 *
 * The panel is refreshed on a timer rather than every frame: the readout is long, and rebuilding it
 * at 60 Hz is wasted work that also makes it impossible to read.
 *
 * @param {object} options
 * @param {object} options.game
 * @param {HTMLElement} options.element the element to render into
 * @param {number} [options.intervalMs]
 * @returns {{stop: Function, refresh: Function}}
 */
export function installSpawnDebugOverlay({ game, element, intervalMs = 250 }) {
  let timer = null;
  const refresh = () => {
    if (!element) return;
    const manager = game?.spawnManager;
    element.textContent = formatSpawnDebug(manager?.debugSnapshot?.() ?? null);
  };
  if (typeof setInterval === 'function') {
    timer = setInterval(refresh, intervalMs);
  }
  refresh();
  return {
    refresh,
    stop() {
      if (timer !== null && typeof clearInterval === 'function') clearInterval(timer);
      timer = null;
    },
  };
}

/**
 * The category cap table as a plain object, for tests and for the agent's tool output.
 *
 * Separate from the overlay text so a non-visual consumer does not have to parse a string.
 */
export function spawnCapSummary(snapshot) {
  if (!snapshot?.caps) return null;
  const out = {};
  for (const category of ALL_MOB_CATEGORIES) {
    const entry = snapshot.caps[category];
    if (!entry) continue;
    out[category] = {
      count: entry.count,
      cap: entry.unlimited ? null : entry.cap,
      full: !entry.hasRoom,
      maxPerChunkArea: CATEGORY_INFO[category]?.maxPerChunkArea ?? null,
    };
  }
  return out;
}
