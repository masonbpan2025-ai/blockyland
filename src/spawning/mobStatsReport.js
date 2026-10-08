// `/show_mobs`: what mobs exist, what the spawner is doing, and why nothing may be appearing.
//
// Written because "I see no mobs" has at least five different causes that look identical from a screenshot:
// the spawn table is empty for the biome, the category is at its cap, the spawner has not ticked, hostiles
// are refused for light, or animals were never placed at chunk generation. The counters to tell them apart
// already existed (`spawnTelemetry`, `spawnDebugOverlay`) and were wired to NOTHING -- so there was no way to
// ask the question in the game.
//
// The whole report is a pure function of plain data, so every one of those five answers is asserted without a
// browser or a live world. `formatMobStatsReport` renders lines the chat can print; `buildMobStatsReport`
// returns them as `{text, kind}`.
import { MobCategory, ALL_MOB_CATEGORIES } from './mobCategories.js';

/** The categories worth reporting in a spawn table, in the order a player thinks about them. */
const TABLE_CATEGORIES = [
  MobCategory.MONSTER, MobCategory.CREATURE, MobCategory.AMBIENT,
  MobCategory.WATER_CREATURE, MobCategory.WATER_AMBIENT,
  MobCategory.UNDERGROUND_WATER_CREATURE, MobCategory.AXOLOTLS, MobCategory.MISC,
];

/** How close a mob has to be to count as "in view". 48 blocks is about the far edge of a render view. */
export const NEARBY_RADIUS = 48;

function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Counts by a key function, as a sorted `[[key, count]]` array, most common first. */
function tally(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined || key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/**
 * Why nothing may be spawning, as plain sentences.
 *
 * Ordered most-specific first, because the first line is the one a player reads. Each answer is derived from
 * a counter rather than guessed, and a condition that holds but is NORMAL (a peaceful world spawning no
 * monsters) is not reported as a problem.
 */
export function spawnVerdicts(input = {}) {
  const {
    biomeId = null, tableFor = () => [], lightLevel = null,
    nearbyCount = 0, totalMobs = 0, gamemode = null, peaceful = false,
    chunkGeneration = null,
  } = input;
  const out = [];
  // `?? {}` rather than a destructuring default: a default only applies to `undefined`, and a caller with no
  // spawn manager passes an explicit null.
  const snap = input.snapshot ?? {};
  const safeTable = typeof tableFor === 'function' ? tableFor : () => [];
  const spawner = snap.spawner ?? {};
  const caps = snap.caps ?? {};

  if (snap.enabled === false) {
    out.push('The spawn manager is DISABLED, so nothing can spawn at all.');
  }
  if (peaceful) {
    // Peaceful removes hostiles by design, so it is named as a reason rather than as a fault.
    out.push('Difficulty is Peaceful, so no hostile mob can spawn. Animals still can.');
  }

  const monsters = safeTable(MobCategory.MONSTER);
  if (!peaceful && monsters.length === 0) {
    out.push(`${biomeId ?? 'this biome'} has NO monster spawns in its table, so none can appear here.`);
  }
  const creatures = safeTable(MobCategory.CREATURE);
  if (creatures.length === 0) {
    out.push(`${biomeId ?? 'this biome'} has NO creature spawns in its table, so no animals can appear here.`);
  }

  // The light rule. This is the single most common reason a daytime surface looks empty.
  if (!peaceful && monsters.length > 0 && typeof lightLevel === 'number' && lightLevel > 0) {
    out.push(`Hostile mobs need light 0 and the light here is ${lightLevel}`
      + `${snap.night ? '' : ' (daylight)'} — they cannot spawn until it is dark.`);
  }

  const spawnTicks = snap.spawnTicks ?? 0;
  if (spawnTicks === 0) {
    out.push('The natural spawner has never ticked, so no runtime spawning has been attempted.');
  } else if ((spawner.positionAttempts ?? 0) === 0) {
    out.push(`${spawnTicks} spawn tick(s) have run but not one position was attempted — the spawner found no `
      + 'eligible chunk in range of a player.');
  }

  for (const category of ALL_MOB_CATEGORIES) {
    const entry = caps[category];
    if (!entry || entry.unlimited) continue;
    if (entry.hasRoom === false) {
      out.push(`The ${category} cap is FULL (${entry.count}/${entry.cap}), so that category is not spawning.`);
    }
  }

  const gen = input.chunkGeneration ?? null;
  if (gen && (gen.chunksConsidered ?? 0) > 0 && (gen.mobs ?? 0) === 0) {
    out.push(`Chunk generation populated ${gen.chunksConsidered} chunk(s) and placed no animals.`);
  }

  if (totalMobs === 0) {
    out.push('No mobs are loaded anywhere in the world right now.');
  } else if (nearbyCount === 0) {
    out.push(`${totalMobs} mob(s) are loaded but none within ${NEARBY_RADIUS} blocks — they are elsewhere, `
      + 'or despawning as you move.');
  }
  if (gamemode === 'creative' && nearbyCount === 0 && totalMobs > 0) {
    // Worth saying explicitly, because it is the answer people least expect: flying is what makes a world
    // look empty, since mobs far behind you despawn.
    out.push('You are in Creative: flying leaves mobs behind, and they despawn once you are far enough away.');
  }
  return out;
}

/**
 * The full report.
 *
 * @param {object} input
 * @param {Array} input.mobs        loaded mobs, `{type, category?, position:{x,y,z}}`
 * @param {object} input.snapshot   from `mobSpawnManager.debugSnapshot()`
 * @param {object} input.player     `{x, y, z}`
 * @param {string} input.biomeId
 * @param {(category:string)=>Array} input.tableFor the biome's spawn table for a category
 * @param {number} [input.lightLevel] at the player
 * @param {string} [input.gamemode]
 * @param {boolean} [input.peaceful]
 * @returns {{lines: Array<{text:string, kind:string}>, verdicts: string[]}}
 */
export function buildMobStatsReport(input = {}) {
  const {
    snapshot = {}, player = null, biomeId = null, tableFor = () => [],
    lightLevel = null, gamemode = null, peaceful = false,
    chunkGeneration = null, packName = null,
  } = input;
  // `?? []` rather than a destructuring default: a default only applies to `undefined`, and a caller that
  // passes an explicit `null` -- which a game with no mob manager does -- would crash a diagnostic.
  const mobs = input.mobs ?? [];
  const safeTableFor = typeof tableFor === 'function' ? tableFor : () => [];
  const snap = input.snapshot ?? {};

  const lines = [];
  const push = (text, kind = 'system') => lines.push({ text, kind });

  push(`--- MOBS: ${mobs.length} loaded ---`, 'help');

  if (mobs.length === 0) {
    push('  (none)', 'system');
  } else {
    for (const [type, count] of tally(mobs, m => m.type).slice(0, 12)) {
      push(`  ${String(type).padEnd(24)} ${String(count).padStart(4)}`, 'system');
    }
    const byCategory = tally(mobs, m => m.category ?? 'unknown');
    if (byCategory.length > 1) {
      push(`  by category: ${byCategory.map(([c, n]) => `${c} ${n}`).join(', ')}`, 'system');
    }
  }

  if (player) {
    const nearby = mobs.filter(m => distance(m.position, player) <= NEARBY_RADIUS);
    push(`--- WITHIN ${NEARBY_RADIUS} BLOCKS: ${nearby.length} ---`, 'help');
    for (const [type, count] of tally(nearby, m => m.type).slice(0, 8)) {
      push(`  ${String(type).padEnd(24)} ${String(count).padStart(4)}`, 'system');
    }
  }

  // --- the biome's own table, which is what CAN spawn here ---
  if (biomeId) {
    push(`--- WHAT CAN SPAWN IN ${String(biomeId).toUpperCase()} ---`, 'help');
    let any = false;
    for (const category of TABLE_CATEGORIES) {
      const entries = safeTableFor(category);
      if (!entries || entries.length === 0) continue;
      any = true;
      const species = entries.slice(0, 6).map(e => `${e.type}(${e.weight})`).join(' ');
      push(`  ${category.padEnd(24)} ${species}`, 'system');
    }
    if (!any) push('  (nothing — this biome has no spawn entries at all)', 'system');
    if (packName) push(`  spawn table from: ${packName}`, 'system');
  }

  // --- the spawner's own counters ---
  push('--- SPAWNER ---', 'help');
  push(`  enabled ${snap.enabled ? 'yes' : 'NO'}   difficulty ${snap.difficulty ?? '?'}   `
    + `time ${snap.worldTime ?? '?'}   ${snap.night ? 'night' : 'day'}`
    + `${snap.skyDarken != null ? `   skyDarken ${snap.skyDarken}` : ''}`, 'system');
  if (typeof lightLevel === 'number') push(`  light at you: ${lightLevel}`, 'system');
  push(`  spawn ticks ${snap.spawnTicks ?? 0}   eligible chunks ${snap.eligibleChunks ?? 0}`, 'system');

  const spawner = snap.spawner;
  if (spawner) {
    push(`  attempts: chunk ${spawner.chunkAttempts ?? 0}  group ${spawner.groupAttempts ?? 0}  `
      + `position ${spawner.positionAttempts ?? 0}`, 'system');
    push(`  spawns ${spawner.spawns ?? 0}`
      + `${spawner.successRate != null ? `   success ${(spawner.successRate * 100).toFixed(1)}%` : ''}`, 'system');
    const reasons = Object.entries(spawner.rejectionsByReason ?? {})
      .sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (reasons.length) {
      push(`  refusals: ${reasons.map(([r, n]) => `${r} ${n}`).join(', ')}`, 'system');
    }
    if (spawner.spawnsByMob && Object.keys(spawner.spawnsByMob).length) {
      const top = Object.entries(spawner.spawnsByMob).sort((a, b) => b[1] - a[1]).slice(0, 6);
      push(`  spawned so far: ${top.map(([t, n]) => `${t} ${n}`).join(', ')}`, 'system');
    }
  } else {
    push('  (no spawner counters yet — it has not run a tick)', 'system');
  }

  const caps = snap.caps;
  if (caps) {
    push('--- CAPS ---', 'help');
    for (const category of ALL_MOB_CATEGORIES) {
      const entry = caps[category];
      if (!entry) continue;
      const cap = entry.unlimited ? 'unlimited' : entry.cap;
      push(`  ${category.padEnd(26)} ${String(entry.count).padStart(4)} / ${String(cap).padStart(9)}`
        + `${entry.hasRoom === false ? '  FULL' : ''}`, 'system');
    }
  }

  if (chunkGeneration) {
    push('--- CHUNK GENERATION ---', 'help');
    push(`  chunks considered ${chunkGeneration.chunksConsidered ?? 0}   populated `
      + `${chunkGeneration.chunksPopulated ?? 0}   mobs placed ${chunkGeneration.mobs ?? 0}   `
      + `skipped ${chunkGeneration.skipped ?? 0}`, 'system');
    if (chunkGeneration.lastRejection) {
      push(`  last refusal: ${chunkGeneration.lastRejection}`, 'system');
    }
  }

  const nearbyCount = player ? mobs.filter(m => distance(m.position, player) <= NEARBY_RADIUS).length : mobs.length;
  const verdicts = spawnVerdicts({
    snapshot, biomeId, tableFor, lightLevel, nearbyCount, totalMobs: mobs.length, gamemode, peaceful,
    chunkGeneration,
  });
  if (verdicts.length) {
    push('--- WHY YOU MAY SEE NOTHING ---', 'help');
    for (const v of verdicts) push(`  ${v}`, 'system');
  } else {
    push('--- No obvious reason for an empty view: mobs are loaded and spawning is running. ---', 'help');
  }

  return { lines, verdicts };
}

/** The report as plain chat lines. */
export function formatMobStatsReport(input) {
  return buildMobStatsReport(input).lines;
}
